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
  const q = msg.toLowerCase();

  // Arnold hail / streets
  if ((q.includes('arnold')) && (q.includes('hail') || q.includes('street') || q.includes('subdivision') || q.includes('cross') || q.includes('neighbor'))) {
    return `Arnold hail damage (1.75" golf ball) was concentrated on these streets and subdivisions:\n\n• **Jeffco Blvd** between Hwy 141 and Plaza Dr — worst commercial damage, road closed\n• **Fox Run subdivision** (off Jeffco Blvd) — numerous roof claims\n• **Richardson Rd / Tenbrook Rd** corridor — widespread shingle damage\n• **Arnold Commons** shopping area — vehicle damage in parking lots\n• **Gravois Rd** between Jeffco Blvd and Hwy 61 — moderate hail damage\n\nThe heaviest hail core tracked NE along the Jeffco Blvd corridor.`;
  }

  // Imperial streets
  if (q.includes('imperial') && (q.includes('hail') || q.includes('street') || q.includes('subdivision') || q.includes('neighbor'))) {
    return `Imperial hail and structural damage locations:\n\n• **Old Lemay Ferry Rd** — direct path of hail core, structural collapses + 1.75" hail\n• **Carman Trails subdivision** — significant roof damage\n• **Imperial Hills subdivision** — widespread shingle loss\n• **Sandy Creek Estates** — hail + wind combo damage\n• **Telegraph Rd (Hwy 61) at Imperial** — vehicle damage, broken windshields\n\nOld Lemay Ferry Rd had the highest per-street residential damage count in Jefferson County.`;
  }

  // Hillsboro streets
  if (q.includes('hillsboro') && (q.includes('hail') || q.includes('street') || q.includes('subdivision') || q.includes('neighbor'))) {
    return `Hillsboro damage locations:\n\n• **Clayton Husky Rd / Klondike Rd** intersection — worst area, 8-9 confirmed structural damage sites\n• Damage spread along a ~2-mile corridor on **Clayton Husky Rd**\n• **Hwy 21 corridor** through Hillsboro — moderate hail (~1")\n• Subdivisions off **Vail Rd** — roof damage reported\n\nThe Klondike/Clayton Husky intersection was the epicenter for this area.`;
  }

  // NW St. Louis / Bridgeton / St Ann
  if (q.includes('bridgeton') || q.includes('st. ann') || q.includes('st ann') || q.includes('hazelwood') || q.includes('maryland heights') || q.includes('nw st. louis') || q.includes('northwest st. louis')) {
    return `NW St. Louis County hail damage (1.75" golf ball):\n\n• **Bridgeton** — Natural Bridge Rd and St. Charles Rock Rd corridor\n• **St. Ann** — Fee Fee Rd and St. Charles Rock Rd\n• **Hazelwood** — Lindbergh Blvd north of I-70\n• **Maryland Heights** — Page Ave / Dorsett Rd corridor\n• **Creve Coeur** — subdivisions off Olive Blvd\n\nThis area received the largest hail (1.75") and 80 mph wind gusts simultaneously.`;
  }

  // General hail streets question
  if (q.includes('hail') && (q.includes('street') || q.includes('where') || q.includes('which') || q.includes('subdivision') || q.includes('neighbor') || q.includes('cross'))) {
    return `Hail damage by area (1.75" golf ball in NW corridor, 1.0-1.25" in Jefferson County):\n\n**Arnold:** Jeffco Blvd, Fox Run subdivision, Richardson/Tenbrook Rd, Arnold Commons\n**Imperial:** Old Lemay Ferry Rd, Carman Trails, Imperial Hills, Sandy Creek Estates\n**Hillsboro:** Clayton Husky Rd, Klondike Rd intersection, Vail Rd subdivisions\n**NW St. Louis:** Natural Bridge Rd, St. Charles Rock Rd, Fee Fee Rd (Bridgeton/St. Ann)\n**Hazelwood/Maryland Heights:** Lindbergh Blvd, Page Ave, Dorsett Rd\n\nAsk about any specific area for more detail.`;
  }

  // Structural damage streets
  if (q.includes('structural') || q.includes('collapse') || q.includes('most damage') || q.includes('worst')) {
    return `Structural damage by street:\n\n• **Arnold — Jeffco Blvd** (Hwy 141 to Plaza Dr): Commercial roof collapses, road closed\n• **Imperial — Old Lemay Ferry Rd**: Several home structural collapses — worst residential count\n• **Hillsboro — Clayton Husky Rd at Klondike Rd**: 8-9 structures over ~2-mile corridor\n\nImperial had the most residential collapses. Arnold had the most commercial impact. Hillsboro had the widest geographic spread.`;
  }

  // Insurance
  if (q.includes('insurance') || q.includes('claim')) {
    return `Insurance guidance for April 17-18 Jefferson County claims:\n\n• **Document first** — timestamped photos/video before any cleanup or repairs\n• **File promptly** — high claim volume means adjusters are busy; earlier = faster\n• **Structural damage** → dwelling coverage; do NOT enter until inspected\n• **Hail (1.75")** → qualifies for full roof replacement under most RCV policies\n• **Vehicles** → comprehensive auto (weather event, not collision)\n• **Get on the official list** → call Jefferson County EM at **636-797-6450**\n• **Avoid storm chasers** — contractors who show up unsolicited after storms are often fraudulent`;
  }

  // Wind / outages
  if (q.includes('wind') || q.includes('outage') || q.includes('power')) {
    return `Wind damage:\n\n• **80 mph gusts** hit NW St. Louis Metro and Arnold/Mehlville ~10 PM April 17\n• **NW St. Louis County**: Lindbergh Blvd, I-270 corridor — lines downed\n• **Florissant**: Lindbergh Blvd and New Florissant Rd — widespread tree damage\n• **Arnold/Mehlville**: Hwy 61/67, Jeffco Blvd — trees on lines, structural damage\n• **50,000+ customers** lost power across MO and IL — Ameren MO primary responder`;
  }

  // Tornado
  if (q.includes('tornado')) {
    return `A brief spin-up tornado was possible in **NW St. Louis County** around 10:08 PM during the organized storm cluster. NWS Tornado Watch #131 was in effect. A formal NWS storm survey was pending as of the April 18 summary. The area near **Bridgeton and St. Ann** was under the tornado warning at that time.`;
  }

  // Compare areas
  if (q.includes('compare') || q.includes('vs') || q.includes('versus') || q.includes('difference')) {
    return `Area comparison:\n\n| Area | Hail | Wind | Structural |\n|---|---|---|---|\n| Arnold (Jeffco Blvd) | 1.75" | 80 mph | Roof collapses, road closed |\n| Imperial (Old Lemay Ferry) | 1.75" | 65-70 mph | Home collapses, worst residential |\n| Hillsboro (Clayton Husky) | 1.0-1.5" | 60-65 mph | 8-9 structures, widest area |\n| NW St. Louis (Bridgeton) | 1.75" | 80 mph | Vehicle + roof, possible tornado |`;
  }

  // Bridgeton
  if (q.includes('bridgeton')) {
    return 'Bridgeton hail damage (1.75" golf ball):\n\n• **St. Charles Rock Rd** — primary damage corridor through Bridgeton, widespread roof and vehicle damage\n• **Natural Bridge Rd** — structural and vehicle damage\n• **Harmony Estates subdivision** — numerous homes damaged, extended power outages\n• **Fee Fee Rd at St. Charles Rock Rd** — vehicle and structure damage\n• Commercial properties along St. Charles Rock Rd — roof damage reported';
  }
  // St. Ann
  if (q.includes('st. ann') || q.includes('st ann')) {
    return 'St. Ann hail damage (1.75" golf ball):\n\n• **Fee Fee Rd** — center of hail swath through St. Ann\n• **St. Charles Rock Rd at St. Ann** — vehicle and roof damage\n• Subdivisions between **Fee Fee Rd and Lindbergh Blvd** — widespread shingle loss\n• St. Ann commercial corridor on St. Charles Rock Rd — vehicle damage';
  }
  // Hazelwood
  if (q.includes('hazelwood')) {
    return 'Hazelwood hail and wind damage:\n\n• **Lindbergh Blvd north of I-70** — significant hail and 75-80 mph wind gusts\n• **Howdershell Rd corridor** — moderate to heavy hail damage\n• **Dunn Rd subdivisions** — roof damage reported\n• Hazelwood Central High School area — vehicle and structure damage\n• I-270/Lindbergh interchange — downed power lines';
  }
  // Maryland Heights
  if (q.includes('maryland heights') || q.includes('maryland hts')) {
    return 'Maryland Heights hail damage (1.75" golf ball in western areas):\n\n• **Page Ave / Dorsett Rd corridor** — golf ball hail, heavy damage\n• **Creve Coeur Soccer Park** — major structural damage, office building walls collapsed\n• **Fee Fee Rd near Page Ave** — vehicle and roof damage\n• **Riverport / Maryland Heights Expwy** business district — commercial roof damage\n• Subdivisions off Dorsett Rd — residential shingle and gutter damage';
  }
  // Creve Coeur
  if (q.includes('creve coeur') || q.includes('creve coeur')) {
    return 'Creve Coeur hail damage (1.25-1.5" on eastern fringe of swath):\n\n• **Olive Blvd corridor** — hail swath edge, vehicle and roof damage\n• **Ladue Rd / Olive Blvd intersection** — vehicle and roof damage\n• Subdivisions west of **I-270 along Olive Blvd** — scattered roof damage\n• **Creve Coeur Lake area** — vehicle and structure damage\n• Chesterfield Ave / New Ballas Rd — moderate hail damage';
  }
  // Chesterfield
  if (q.includes('chesterfield')) {
    return 'Chesterfield hail damage (outer fringe, 1.0-1.25"):\n\n• **Chesterfield Valley** — outer edge of hail swath\n• **Long Rd / Clarkson Rd corridor** — moderate hail, roof and vehicle damage\n• **Chesterfield Mall area** — vehicle damage in parking areas\n• Subdivisions off **Baxter Rd** — scattered shingle damage\n• **Wild Horse Creek Rd** — moderate damage reported';
  }
  // St. Charles County (O'Fallon, St. Peters, Cottleville, Wentzville, Dardenne)
  if (q.includes('st. charles') || q.includes('st charles') || q.includes('ofallon') || q.includes("o'fallon") || q.includes('st. peters') || q.includes('st peters') || q.includes('cottleville') || q.includes('wentzville') || q.includes('dardenne')) {
    return 'St. Charles County hail damage (outer swath fringe, generally 0.75-1.25"):\n\n• **O\u2019Fallon — Terra Lane / I-70 corridor** — vehicle and roof damage\n• **St. Peters — Cave Springs Rd / Hwy 70** area — moderate hail\n• **Cottleville** — eastern fringe of swath, 1.0-1.25" hail\n• **Dardenne Prairie — Mid Rivers Mall Dr** — moderate hail\n• **Wentzville** — outer fringe, lighter hail 0.75-1.0"\n\nNote: St. Charles County received smaller hail than the NW St. Louis County core (1.75"). Damage is primarily roof and vehicle rather than structural.';
  }
  // Florissant
  if (q.includes('florissant')) {
    return 'Florissant hail and wind damage:\n\n• **Lindbergh Blvd and New Florissant Rd** — hail and 70-75 mph wind gusts\n• **Shackelford Rd area** — residential roof damage\n• Subdivisions off **Howdershell Rd** — moderate hail damage\n• New Florissant Rd — multiple trees downed on homes';
  }
  // South County
  if (q.includes('mehlville') || q.includes('oakville') || q.includes('south county') || q.includes('tesson ferry')) {
    return 'South St. Louis County hail damage (outer swath, ~1.0-1.25"):\n\n• **Mehlville / Oakville** — outer hail swath edge\n• **Lemay Ferry Rd corridor** — moderate hail damage\n• **Tesson Ferry Rd area** — lighter hail, mostly vehicle damage\n• Gravois Rd south of Arnold — transitional zone\n\nThis area received smaller hail than the NW county core. Damage is primarily vehicle and roof shingles.';
  }

  return `Based on the April 17-18 storm data for Jefferson County and St. Louis. I have street-level detail for:\n\n• **Arnold** — Jeffco Blvd, Fox Run, Richardson/Tenbrook Rd\n• **Imperial** — Old Lemay Ferry Rd, Carman Trails, Imperial Hills\n• **Hillsboro** — Clayton Husky Rd, Klondike Rd\n• **NW St. Louis** — Natural Bridge Rd, St. Charles Rock Rd, Fee Fee Rd\n\nAsk about a specific area, street, or subdivision for detail.`;
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
