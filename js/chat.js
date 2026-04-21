;(function () {
// chat.js — Storm dashboard chat with street-level detail
// Demo mode (no API key): rich canned answers with subdivision/cross-street detail
// Live mode (API key set): full Claude API with storm context injected

const CHAT_ENDPOINT = 'https://api.anthropic.com/v1/messages';
const CHAT_MODEL    = 'claude-sonnet-4-20250514';

let _apiKey  = null;
let _history = [];
let _busy    = false;
let _ctx     = { alerts: [], stormReports: [], spcReports: [], metrics: {} };

// ── Street-level knowledge base for April 17-18 2026 ─────────────────────────
// This supplements the general storm reports with precise location data

const STREET_DETAIL = {
  arnold: {
    hail: [
      'Jeffco Blvd between Hwy 141 and Plaza Dr — 1.75" golf ball hail, multiple vehicle losses',
      'Fox Run subdivision (off Jeffco Blvd) — numerous roof claims',
      'Richardson Rd / Tenbrook Rd corridor — widespread shingle damage',
      'Arnold Commons shopping area — vehicle damage in parking areas',
      'Gravois Rd between Jeffco Blvd and Hwy 61 — moderate hail damage',
    ],
    wind: ['Jeffco Blvd at Hwy 141 — structural collapse, road closed', 'Hwy 61/67 corridor — multiple trees downed'],
    structural: ['Commercial buildings on Jeffco Blvd between Hwy 141 and Plaza Dr'],
  },
  imperial: {
    hail: [
      'Old Lemay Ferry Rd — direct hail core path, 1.75", structural collapses',
      'Carman Trails subdivision — significant roof damage',
      'Imperial Hills subdivision — widespread shingle loss',
      'Sandy Creek Estates — hail + wind combo damage',
      'Telegraph Rd (Hwy 61) at Imperial — vehicle and windshield damage',
    ],
    structural: ['Old Lemay Ferry Rd residential corridor — several home collapses, worst per-street count in county'],
  },
  hillsboro: {
    hail: [
      'Clayton Husky Rd / Klondike Rd intersection — 8-9 structures damaged, epicenter of damage',
      'Clayton Husky Rd corridor — damage spread over ~2 miles',
      'Hwy 21 corridor — moderate hail (~1")',
      'Vail Rd subdivisions — roof damage reported',
    ],
  },
  bridgeton: {
    hail: [
      'St. Charles Rock Rd — golf ball hail (1.75"), heaviest corridor through Bridgeton',
      'Natural Bridge Rd — widespread vehicle and roof damage',
      'Harmony Estates subdivision (off St. Charles Rock Rd) — significant roof/structural damage, power out into Saturday',
      'McDonnell Blvd — commercial property hail damage',
      'Lambert Airport perimeter — ramp vehicle and equipment damage',
    ],
    wind: ['I-270 corridor — 80 mph gusts, multiple lines down', 'St. Charles Rock Rd at Lindbergh — trees on lines'],
  },
  st_ann: {
    hail: [
      'Fee Fee Rd — center of hail swath, 1.5-1.75" diameter',
      'St. Charles Rock Rd at St. Ann — widespread damage corridor',
      'Midland Blvd residential neighborhoods — shingle and gutter damage',
      'St. Ann Square shopping area — vehicle damage in parking lots',
      'Ashby Rd / Midland Blvd area — residential roof damage',
    ],
  },
  hazelwood: {
    hail: [
      'Lindbergh Blvd north of I-70 — hail and wind damage, lines downed',
      'New Florissant Rd — tree and roof damage corridor',
      'Howdershell Rd area — residential hail damage',
      'McDonnell Blvd corridor — 1.0-1.5" hail',
    ],
    wind: ['Lindbergh Blvd / I-270 interchange — major tree and utility line damage'],
  },
  maryland_heights: {
    hail: [
      'Page Ave / Dorsett Rd corridor — 1.5" hail, widespread roof damage',
      'Creve Coeur Soccer Park (off Dorsett Rd) — major structural damage, roof blown off office building, walls collapsed',
      'Westport Plaza area — commercial hail and wind damage',
      'Fee Fee Rd at Page Ave — vehicle damage, broken windshields',
      'Lackland Rd area — residential and commercial hail damage',
    ],
    structural: ['Creve Coeur Soccer Park — walls torn down, main office roof destroyed'],
  },
  creve_coeur: {
    hail: [
      'Olive Blvd corridor — subdivisions on both sides, 1.25-1.5" hail',
      'Ladue Rd / Conway Rd area — residential roof damage',
      'Spoede Rd residential neighborhoods — shingle and gutter damage',
      'Chesterfield Pkwy at Olive — business and vehicle damage',
      'I-270 at Olive Blvd interchange — commercial area vehicle damage',
    ],
  },
  chesterfield: {
    hail: [
      'Chesterfield Mall area — vehicle damage in parking lots',
      'Clarkson Rd corridor — hail and wind damage',
      'Long Rd / Baxter Rd area — residential hail damage',
      'Lydia Hill and surrounding subdivisions — roof claims',
    ],
    tornado: ['EF0 tornado near I-64 / Clarkson Rd / Olive Blvd — 2-mile track confirmed by NWS, tree damage'],
  },
  ballwin: {
    hail: [
      'Manchester Rd (Hwy 100) corridor — hail swath, vehicle and roof damage',
      'Clayton Rd / Big Bend Blvd — residential neighborhoods impacted',
      'Holloway Rd area — large branches down, wind-driven debris',
      'Henry Ave / Ries Rd subdivisions — moderate hail damage',
    ],
    wind: ['Manchester Rd — large branches down, widespread wind debris reported by residents'],
  },
  florissant: {
    hail: [
      'Lindbergh Blvd — widespread tree and roof damage corridor',
      'New Florissant Rd — line and tree damage',
      'Dunn Rd / Shackelford Rd area — residential neighborhoods',
      'Charbonier Rd corridor — moderate hail damage',
    ],
    wind: ['Lindbergh Blvd / New Florissant Rd — major tree damage, extended outages'],
  },
  st_charles: {
    hail: [
      'Main St / First Capitol Dr — historic district, vehicle and roof damage',
      'Mid Rivers Mall area — vehicle damage in parking areas',
      'I-70 corridor through St. Charles — 1.0-1.5" hail',
      'Zumbehl Rd residential neighborhoods — shingle damage',
    ],
  },
  ofallon_mo: {
    hail: [
      'West Terra Lane at I-70 — auto dealerships with major vehicle inventory damage',
      'St. Dominic High School area — ground covered in hail, senior parking lot severely damaged',
      'Winghaven Blvd — newer subdivision, widespread shingle claims',
      'Bryan Rd residential area — roof damage reported',
      'Hwy 40 / I-64 corridor — commercial and residential hail swath',
      'City Hall / Civic Park area — municipal building and employee vehicle damage',
    ],
    structural: [
      'West Terra Lane dealerships — windshields shattered, body damage across ~450 vehicles',
      'St. Dominic High School — significant hail damage to building and vehicles',
      'O\'Fallon Emergency Operations Center — county and personal vehicles damaged',
    ],
  },
  wentzville: {
    hail: [
      'Pearce Blvd / Wentzville Pkwy — hail swath, 1.0-1.5"',
      'I-70 at Wentzville — commercial corridor vehicle damage',
      'O\'Bryan Rd / Graham Rd — residential subdivisions with roof claims',
      'Pitman Rd area — neighborhoods with shingle damage',
    ],
  },
  mehlville: {
    hail: [
      'Lemay Ferry Rd corridor — hail swath edge, ~1.0-1.25"',
      'Tesson Ferry Rd area — moderate hail damage',
      'Oakville subdivisions — outer swath, mostly vehicle damage',
    ],
  },
};

// ── System prompt ─────────────────────────────────────────────────────────────

function buildSystem() {
  const alerts = (_ctx.alerts || []).slice(0, 6).map(a => {
    const p = a.properties || {};
    return `- ${p.event || '?'} (${p.severity || '?'}): ${p.areaDesc || '?'}`;
  }).join('\n') || 'None';

  const reports = [...(_ctx.stormReports || []), ...(_ctx.spcReports || [])]
    .slice(0, 20)
    .map(r => `- ${(r.type || r.label || '?').toUpperCase()} | ${r.location} | ${r.magnitude} | ${r.detail}`)
    .join('\n') || 'None';

  const m = _ctx.metrics || {};

  // Build street-level detail summary for all areas
  var areas = ['arnold','imperial','hillsboro','bridgeton','st_ann','hazelwood',
    'maryland_heights','creve_coeur','chesterfield','ballwin','florissant',
    'st_charles','ofallon_mo','wentzville','mehlville'];
  var streetDetail = areas.map(function(k) {
    var d = STREET_DETAIL[k];
    if (!d) return '';
    var lines = [];
    if (d.hail) lines.push(k.toUpperCase() + ' HAIL: ' + d.hail.join(' | '));
    if (d.structural) lines.push(k.toUpperCase() + ' STRUCTURAL: ' + d.structural.join(' | '));
    if (d.tornado) lines.push(k.toUpperCase() + ' TORNADO: ' + d.tornado.join(' | '));
    return lines.join('\n');
  }).filter(Boolean).join('\n');

  return [
    'You are an emergency management assistant for the Jefferson County & St. Louis storm dashboard.',
    'The April 17-18 2026 storm event is the primary event in the system.',
    '',
    'STORM METRICS:',
    `Active alerts: ${m.warnings || 0} | Max hail: ${m.maxHail || '1.75"'} | Peak wind: ${m.peakWind || '80 mph'} | Outages: ${m.outages || '50K+'}`,
    '',
    'NWS ALERTS:', alerts,
    '',
    'STORM REPORTS:', reports,
    '',
    'STREET-LEVEL DETAIL (April 17-18 event):',
    streetDetail,
    '',
    'INSTRUCTIONS:',
    '- Always reference specific streets, subdivisions, and cross streets when asked about locations',
    '- For hail questions, name the specific roads and neighborhoods affected',
    '- For insurance questions, give actionable step-by-step guidance',
    '- If asked about a specific subdivision or street not in your data, say you do not have confirmed reports for that exact location but give the nearest known affected area',
    '- Keep answers concise but specific — bullet points for location lists',
  ].join('\n');
}

// ── API call ──────────────────────────────────────────────────────────────────

async function callAPI(message) {
  _history.push({ role: 'user', content: message });
  if (_history.length > 20) _history = _history.slice(-20);

  const res = await fetch(CHAT_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': _apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: CHAT_MODEL,
      max_tokens: 800,
      system: buildSystem(),
      messages: _history,
    }),
  });

  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error?.message || `API error ${res.status}`);
  }

  const data = await res.json();
  const reply = data.content?.[0]?.text || 'No response.';
  _history.push({ role: 'assistant', content: reply });
  return reply;
}

// ── Demo responses ────────────────────────────────────────────────────────────

function demoResponse(msg) {
  var q = msg.toLowerCase();

  // ── Subdivision / location name lookup (catches questions like "is X in your list?") ──
  var subdivisionMap = {
    'harmony estates': 'Bridgeton — Harmony Estates subdivision (off St. Charles Rock Rd) received significant structural and roof damage from 1.75" golf ball hail on April 17. Homes had extended power outages lasting into Saturday April 18. Ask me about Bridgeton for full street-level detail.',
    'fox run': 'Arnold — Fox Run subdivision (off Jeffco Blvd) is confirmed in the damage data. Numerous roof claims reported from 1.75" hail. Ask me about Arnold for full detail.',
    'carman trails': 'Imperial — Carman Trails subdivision received significant roof damage from the April 17 hail event. It is in the confirmed damage area along Old Lemay Ferry Rd. Ask me about Imperial for full detail.',
    'imperial hills': 'Imperial — Imperial Hills subdivision had widespread shingle loss from 1.75" hail on April 17. Ask me about Imperial for full detail.',
    'sandy creek': 'Imperial — Sandy Creek Estates received combined hail and wind damage on April 17. Ask me about Imperial for full detail.',
    'winghaven': "O'Fallon — Winghaven subdivision (Winghaven Blvd) is in the confirmed damage area with widespread shingle claims from April 17 hail. Ask me about O'Fallon for full detail.",
    'chautauqua': "O'Fallon — Chautauqua area residents reported roof, gutter, siding, and fence damage from the April 17 hailstorm. Ask me about O'Fallon for full street detail.",
    'st. dominic': "O'Fallon — St. Dominic High School had the ground covered in hail with major damage to the senior parking lot. Ask me about O'Fallon for full detail.",
    'creve coeur soccer': 'Maryland Heights — Creve Coeur Soccer Park (Dorsett Rd) had major structural damage: roof blown off the main office building, walls collapsed, equipment scattered. Ask me about Maryland Heights for full detail.',
    'westport': 'Maryland Heights — Westport Plaza area received commercial hail and wind damage on April 17. Ask me about Maryland Heights for full detail.',
  };

  for (var sub in subdivisionMap) {
    if (q.includes(sub)) return subdivisionMap[sub];
  }

  // ── City-specific checks ──
  if (q.includes('bridgeton')) {
    return 'Bridgeton hail damage (1.75" golf ball):\n\n• **St. Charles Rock Rd** — primary corridor, widespread roof and vehicle damage\n• **Natural Bridge Rd** — structural and vehicle damage\n• **Harmony Estates subdivision** (off St. Charles Rock Rd) — numerous homes damaged, power outages into Saturday\n• **McDonnell Blvd** — commercial property damage\n• **Lambert Airport perimeter** — ramp vehicle and equipment damage\n\n80 mph wind gusts downed lines along I-270 and St. Charles Rock Rd.';
  }
  if (q.includes('st. ann') || q.includes('st ann')) {
    return 'St. Ann hail damage (1.75" golf ball):\n\n• **Fee Fee Rd** — center of hail swath through St. Ann\n• **St. Charles Rock Rd at St. Ann** — vehicle and roof damage\n• **Midland Blvd residential neighborhoods** — widespread shingle loss\n• **St. Ann Square shopping area** — vehicle damage in parking lots\n• Subdivisions between Fee Fee Rd and Lindbergh Blvd — roof claims';
  }
  if (q.includes('hazelwood')) {
    return 'Hazelwood hail and wind damage:\n\n• **Lindbergh Blvd north of I-70** — hail and 75-80 mph wind gusts, lines downed\n• **Howdershell Rd corridor** — moderate to heavy hail damage\n• **New Florissant Rd** — tree and roof damage\n• **McDonnell Blvd corridor** — 1.0-1.5" hail\n• I-270/Lindbergh interchange — major tree and utility damage';
  }
  if (q.includes('maryland heights') || q.includes('maryland hts')) {
    return 'Maryland Heights hail damage (1.75" in western areas):\n\n• **Creve Coeur Soccer Park (Dorsett Rd)** — major structural: roof blown off office building, walls collapsed\n• **Page Ave / Dorsett Rd corridor** — golf ball hail, heavy damage\n• **Westport Plaza area** — commercial hail and wind damage\n• **Fee Fee Rd near Page Ave** — vehicle and roof damage\n• **Lackland Rd** — residential and commercial hail damage';
  }
  if (q.includes('creve coeur')) {
    return 'Creve Coeur hail damage (1.25-1.5"):\n\n• **Olive Blvd corridor** — subdivisions on both sides, significant roof damage\n• **Ladue Rd / Conway Rd area** — residential roof claims\n• **Spoede Rd neighborhoods** — shingle and gutter damage\n• **I-270 at Olive Blvd interchange** — commercial area vehicle damage\n• Chesterfield Pkwy at Olive — business and vehicle damage';
  }
  if (q.includes('chesterfield')) {
    return 'Chesterfield hail and tornado damage:\n\n• **EF0 tornado confirmed** near I-64 / Clarkson Rd / Olive Blvd — 2-mile track, NWS verified April 20\n• **Chesterfield Mall area** — vehicle damage in parking lots\n• **Long Rd / Clarkson Rd corridor** — hail and wind\n• **Baxter Rd subdivisions** — scattered shingle damage\n• **Wild Horse Creek Rd** — moderate damage reported';
  }
  if (q.includes('ballwin') || q.includes('ball win')) {
    return 'Ballwin hail and wind damage:\n\n• **Manchester Rd (Hwy 100)** — hail swath, vehicle and roof damage\n• **Clayton Rd / Big Bend Blvd** — residential neighborhoods impacted\n• **Holloway Rd area** — large branches down, wind-driven debris\n• **Henry Ave / Ries Rd subdivisions** — moderate hail damage';
  }
  if (q.includes('florissant')) {
    return 'Florissant wind and hail damage:\n\n• **Lindbergh Blvd** — 70-75 mph gusts, trees on homes and lines\n• **New Florissant Rd** — utility line and tree damage\n• **Shackelford Rd / Dunn Rd** — residential neighborhoods\n• Subdivisions off **Howdershell Rd** — moderate hail damage';
  }
  if (q.includes("o'fallon") || q.includes('ofallon') || q.includes('o fallon')) {
    return "O'Fallon hail damage:\n\n• **West Terra Lane at I-70** — auto dealerships: ~450 vehicles with shattered windshields and body damage\n• **St. Dominic High School** — ground covered in hail, senior lot severely damaged\n• **City Hall / Civic Park** — municipal buildings and employee vehicles damaged\n• **Emergency Operations Center** — county and staff vehicles damaged\n• **Winghaven subdivision** — widespread shingle claims\n• **Bryan Rd residential area** — roof damage reported";
  }
  if (q.includes('wentzville')) {
    return 'Wentzville hail damage (1.0-1.5"):\n\n• **Pearce Blvd / Wentzville Pkwy** — main corridor damage\n• **I-70 at Wentzville** — commercial vehicle damage\n• **OBryan Rd / Graham Rd** — residential subdivisions with roof claims\n• **Pitman Rd area** — shingle damage reported';
  }
  if (q.includes('st. charles') || q.includes('st charles') || q.includes('st. peters') || q.includes('st peters') || q.includes('cottleville') || q.includes('dardenne') || q.includes('lake saint louis') || q.includes('lake st. louis')) {
    return 'St. Charles County hail damage (outer swath, 0.75-1.25"):\n\n• **O\'Fallon — West Terra Lane / I-70** — vehicle and roof damage\n• **St. Peters — Cave Springs Rd / Hwy 70** — moderate hail\n• **Cottleville** — 1.0-1.25" hail, eastern fringe of swath\n• **Dardenne Prairie — Mid Rivers Mall Dr** — moderate hail\n• **Wentzville** — outer fringe, lighter hail\n\nNote: St. Charles County received smaller hail than the NW St. Louis County core (1.75"). Damage is primarily roof and vehicle.';
  }
  if (q.includes('mehlville') || q.includes('oakville') || q.includes('south county') || q.includes('tesson ferry')) {
    return 'South St. Louis County hail damage (outer swath, ~1.0-1.25"):\n\n• **Mehlville / Oakville** — outer hail swath edge\n• **Lemay Ferry Rd corridor** — moderate hail damage\n• **Tesson Ferry Rd** — lighter hail, mostly vehicle damage\n• Gravois Rd south of Arnold — transitional zone';
  }
  if (q.includes('arnold')) {
    return 'Arnold hail damage (1.75" golf ball):\n\n• **Jeffco Blvd** between Hwy 141 and Plaza Dr — worst commercial damage, road closed\n• **Fox Run subdivision** (off Jeffco Blvd) — numerous roof claims\n• **Richardson Rd / Tenbrook Rd** corridor — widespread shingle damage\n• **Arnold Commons** shopping area — vehicle damage in parking lots\n• **Gravois Rd** between Jeffco Blvd and Hwy 61 — moderate hail';
  }
  if (q.includes('imperial')) {
    return 'Imperial hail and structural damage:\n\n• **Old Lemay Ferry Rd** — direct hail core, structural collapses + 1.75" hail\n• **Carman Trails subdivision** — significant roof damage\n• **Imperial Hills subdivision** — widespread shingle loss\n• **Sandy Creek Estates** — hail + wind combo damage\n• **Telegraph Rd (Hwy 61)** — vehicle damage, broken windshields\n\nOld Lemay Ferry Rd had the highest per-street residential damage count in Jefferson County.';
  }
  if (q.includes('hillsboro')) {
    return 'Hillsboro damage:\n\n• **Clayton Husky Rd / Klondike Rd** — 8-9 confirmed structures, epicenter\n• Damage spread ~2 miles along **Clayton Husky Rd**\n• **Hwy 21 corridor** — moderate hail (~1")\n• **Vail Rd subdivisions** — roof damage reported';
  }

  // ── Topic checks ──
  if (q.includes('structural') || q.includes('collapse') || q.includes('worst') || q.includes('most damage')) {
    return 'Structural damage by location:\n\n• **Arnold — Jeffco Blvd** (Hwy 141 to Plaza Dr): Commercial roof collapses, road closed\n• **Imperial — Old Lemay Ferry Rd**: Several home structural collapses — worst residential count in Jefferson County\n• **Hillsboro — Clayton Husky Rd / Klondike Rd**: 8-9 structures, ~2-mile corridor\n• **Maryland Heights — Creve Coeur Soccer Park**: Roof blown off, walls collapsed\n• **O\'Fallon — West Terra Lane**: ~450 vehicles destroyed at dealerships';
  }
  if (q.includes('tornado')) {
    return 'NWS confirmed two EF1 tornadoes in the St. Louis area on April 17, 2026:\n\n• Both had winds of at least 90 mph, caused tree damage\n• One EF0 also confirmed near **I-64 / Clarkson Rd / Olive Blvd in Chesterfield** — 2-mile track\n• **NW St. Louis County** (Bridgeton/St. Ann area) was under Tornado Warning at 10:08 PM\n• 85 mph wind gusts near Moscow Mills caused outbuilding and manufactured home damage\n• NWS storm survey completed April 20, 2026';
  }
  if (q.includes('insurance') || q.includes('claim')) {
    return 'Insurance guidance for April 17-18 claims:\n\n• **Document before cleanup** — timestamped photos/video of all damage\n• **File promptly** — high claim volume, earlier = faster adjuster scheduling\n• **Structural damage** → dwelling coverage; do NOT enter until engineer inspects\n• **Hail (1.75")** → qualifies for full roof replacement under RCV policies\n• **Vehicles** → comprehensive auto, not collision\n• **Jefferson County EM**: 636-797-6450 to get on official damage registry\n• **Avoid unsolicited contractors** — door-to-door storm chasers are common post-event scams';
  }
  if (q.includes('wind') || q.includes('outage') || q.includes('power')) {
    return 'Wind damage summary:\n\n• **80 mph gusts** across NW St. Louis Metro and Arnold/Mehlville ~10 PM April 17\n• **85 mph** near Moscow Mills — outbuildings, manufactured homes\n• **NW St. Louis**: Lindbergh Blvd, I-270, St. Charles Rock Rd — lines downed\n• **Florissant**: Major tree damage, Lindbergh Blvd and New Florissant Rd\n• **Arnold**: Jeffco Blvd, Hwy 61/67 — structural and tree damage\n• **50,000+ customers** lost power — Ameren MO led Missouri restoration';
  }
  if (q.includes('compare') || q.includes('vs') || q.includes('versus') || q.includes('all areas') || q.includes('list') || q.includes('covered') || q.includes('what areas')) {
    return 'April 17-18 coverage by area:\n\n**Jefferson County:** Arnold (Jeffco Blvd, Fox Run), Imperial (Old Lemay Ferry, Carman Trails, Imperial Hills), Hillsboro (Clayton Husky/Klondike Rd)\n**NW St. Louis Co.:** Bridgeton (St. Charles Rock Rd, Harmony Estates), St. Ann (Fee Fee Rd), Hazelwood (Lindbergh Blvd), Maryland Heights (Soccer Park, Page/Dorsett), Florissant\n**West St. Louis Co.:** Creve Coeur (Olive Blvd), Chesterfield (EF0 tornado), Ballwin (Manchester Rd)\n**St. Charles Co.:** O\'Fallon (West Terra Ln, St. Dominic HS), Wentzville, St. Peters, St. Charles\n\nAsk about any city for street-level detail.';
  }

  return 'I have street-level damage detail for these areas from the April 17-18 storm:\n\n**Jefferson Co.:** Arnold, Imperial, Hillsboro\n**NW St. Louis Co.:** Bridgeton, St. Ann, Hazelwood, Maryland Heights, Florissant\n**West St. Louis Co.:** Creve Coeur, Chesterfield, Ballwin\n**St. Charles Co.:** O\'Fallon, Wentzville, St. Charles\n\nOr ask about a specific subdivision (e.g. "Harmony Estates", "Fox Run", "Carman Trails") or street.';
}

// ── UI helpers ────────────────────────────────────────────────────────────────

function scrollToBottom() {
  // requestAnimationFrame fires after the browser paints — guaranteed to have correct scrollHeight
  requestAnimationFrame(function() {
    var log = document.getElementById('chat-log');
    if (!log) return;
    log.scrollTop = log.scrollHeight;
    // Second frame handles cases where images/tables cause reflow
    requestAnimationFrame(function() {
      log.scrollTop = log.scrollHeight;
    });
  });
}

function addMsg(role, html) {
  var log = document.getElementById('chat-log');
  if (!log) return;
  var wrap = document.createElement('div');
  wrap.className = 'chat-msg chat-msg-' + role;
  wrap.dataset.role = role;
  wrap.innerHTML = '<div class="chat-bubble chat-bubble-' + role + '">' + html + '</div>';
  log.appendChild(wrap);
  scrollToBottom();
  return wrap;
}

function addLoading() {
  var log = document.getElementById('chat-log');
  if (!log) return;
  // Remove any existing loading indicator
  var existing = document.getElementById('chat-loading-msg');
  if (existing) existing.remove();
  var wrap = document.createElement('div');
  wrap.className = 'chat-msg chat-msg-assistant';
  wrap.dataset.role = 'assistant';
  wrap.id = 'chat-loading-msg';
  wrap.innerHTML = '<div class="chat-bubble chat-bubble-assistant chat-loading"><span class="chat-dot"></span><span class="chat-dot"></span><span class="chat-dot"></span></div>';
  log.appendChild(wrap);
  scrollToBottom();
}

function removeLoading() {
  var el = document.getElementById('chat-loading-msg');
  if (el) el.remove();
}

function md(text) {
  var out = text;
  // Tables
  out = out.replace(/^\|(.+)\|$/gm, function(row) {
    var cells = row.split('|').filter(function(c) { return c.trim(); });
    if (cells.every(function(c) { return /^[\s\-:]+$/.test(c); })) return '';
    return '<tr>' + cells.map(function(c) { return '<td>' + c.trim() + '</td>'; }).join('') + '</tr>';
  });
  out = out.replace(/((<tr>[\s\S]*?<\/tr>\n?)+)/g, function(m) { return '<table class="chat-table">' + m + '</table>'; });
  // Bold
  out = out.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Bullets
  out = out.replace(/^[•\-\*] (.+)$/gm, '<div class="chat-bullet">• $1</div>');
  // Newlines
  out = out.replace(/\n/g, '<br>');
  return out;
}

// ── Send ──────────────────────────────────────────────────────────────────────

async function send() {
  if (_busy) return;

  var input = document.getElementById('chat-input');
  if (!input) return;

  var msg = input.value.trim();
  if (!msg) return;

  input.value = '';
  _busy = true;

  addMsg('user', md(msg));
  addLoading();

  try {
    var reply;
    if (!_apiKey || _apiKey === 'YOUR_ANTHROPIC_API_KEY_HERE') {
      await new Promise(function(r) { setTimeout(r, 600); });
      reply = demoResponse(msg);
    } else {
      reply = await callAPI(msg);
    }
    removeLoading();
    addMsg('assistant', md(reply));
  } catch (err) {
    removeLoading();
    addMsg('assistant', '<span style="color:#dc2626">Error: ' + err.message + '</span>');
  }

  _busy = false;
}

// ── Init ──────────────────────────────────────────────────────────────────────

function initChat(apiKey) {
  _apiKey = apiKey;
  _history = [];
  _busy = false;
}

function clearChat() {
  _history = [];
  _busy = false;
  var log = document.getElementById('chat-log');
  if (log) log.innerHTML = '';
  appendWelcomeMessage();
}

function appendWelcomeMessage() {
  var log = document.getElementById('chat-log');
  if (!log) return;
  var wrap = document.createElement('div');
  wrap.className = 'chat-msg chat-msg-assistant';
  wrap.innerHTML = '<div class="chat-bubble chat-bubble-assistant chat-welcome"><strong>Storm Assistant ready.</strong><br>I have street-level hail detail for Arnold, Imperial, Hillsboro, Bridgeton, St. Ann, Hazelwood, Maryland Heights, Creve Coeur, Chesterfield, Ballwin, Florissant, O\'Fallon, Wentzville, and St. Charles. Ask about any area.</div>';
  log.appendChild(wrap);
  scrollToBottom();
}

function updateChatContext(ctx) {
  Object.assign(_ctx, ctx);
}

// ── Window exports — called directly from HTML onclick ────────────────────────

window.chatSend  = send;
window.chatClear = clearChat;
window.chatChip  = function(el) {
  var inp = document.getElementById('chat-input');
  if (inp) {
    inp.value = el.dataset.q || el.textContent.trim();
    send();
  }
};

window.ChatModule = { initChat, updateChatContext, clearChat, appendWelcomeMessage };

})();
