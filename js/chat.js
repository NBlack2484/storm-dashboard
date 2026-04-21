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

  // ── Subdivision/location name direct lookup ────────────────────────────────
  var subMap = {
    // Bridgeton
    'harmony estates':   'Yes — Harmony Estates subdivision in Bridgeton (off St. Charles Rock Rd near Harmony Ln) is confirmed in the damage data. The Patch reported homes throughout the subdivision sustained wind and hail damage during the April 17 storms, with power outages lasting into Saturday. Ask me about Bridgeton for the full street-level picture.',
    'depaul hills':      'DePaul Hills subdivision in Bridgeton (off Natural Bridge Rd near N. Lindbergh) sits in the direct path of the storm track. Traditional-style brick homes in this area plausibly sustained roof and gutter damage from the 80 mph wind gusts and 1.75" hail.',
    'northfield':        'Northfield subdivision in Bridgeton (near McKelvey Rd) is in the NW St. Louis County hail swath. Homes here plausibly sustained shingle and gutter damage consistent with 1.75" golf ball hail.',
    'st james estates':  'St. James Estates in Bridgeton (off N. Lindbergh Blvd) is within the confirmed storm damage corridor. Plausible roof and vehicle damage from 1.75" hail and 80 mph winds.',
    'rolling green':     'Rolling Green Acres subdivision in Bridgeton is in the NW St. Louis hail corridor. Plausible shingle and gutter damage from the April 17 hailstorm.',
    // Maryland Heights
    'autumn lakes':      'Autumn Lakes subdivision in Maryland Heights (near Creve Coeur Lake / Dorsett Rd area) sits within the confirmed Page Ave / Dorsett Rd damage corridor. Plausible roof and gutter damage from 1.5" hail.',
    'dorsett ridge':     'Dorsett Ridge area in Maryland Heights is directly along the confirmed damage corridor (Page Ave / Dorsett Rd). Plausible hail damage to roofs and vehicles.',
    'creve coeur soccer':'Maryland Heights — Creve Coeur Soccer Park (off Dorsett Rd) had confirmed major structural damage: roof blown off the main office building, walls collapsed, equipment scattered (FOX 2 confirmed). This is the most significant structural damage site in Maryland Heights.',
    // Chesterfield
    'meadowbrook farm':  'Meadowbrook Farm / Clarkson Estates subdivision in Chesterfield (589 homes off Baxter Rd / Country Ridge Dr) sits near the confirmed EF0 tornado path (I-64 / Clarkson Rd / Olive Blvd). With 65+ acres of wooded common ground, tree damage and roof damage are plausible throughout this large subdivision.',
    'clarkson estates':  'Clarkson Estates (part of Meadowbrook Farm) in Chesterfield — 589-home subdivision off Baxter Rd near Clarkson Rd. In the confirmed EF0 tornado path vicinity. Plausible tree and roof damage.',
    'villages at baxter':'Villages at Baxter Ridge in Chesterfield (307 houses, 128 condos off Baxter Rd) is near the EF0 tornado track. Plausible roof, siding, and tree damage across this large community.',
    'baxter ridge':      'Baxter Ridge / Villages at Baxter Ridge in Chesterfield — 307 homes plus condos off Baxter Rd. Near the confirmed EF0 tornado track (I-64/Clarkson/Olive). Plausible tree and roof damage.',
    'clarkson woods':    'Clarkson Woods subdivision in Chesterfield is along the Clarkson Rd corridor near the EF0 tornado path. Plausible tree and structural damage.',
    'green trails':      'Green Trails subdivision in Chesterfield/Ballwin area (off Olive Blvd / Ladue Rd corridor) is in the western hail fringe. Plausible roof and vehicle damage from 1.0-1.25" hail.',
    'wild horse':        'Wild Horse area in western Chesterfield (Wild Horse Creek Rd corridor) received lighter hail at the outer fringe of the swath. Plausible minor roof and vehicle damage.',
    // O\'Fallon
    'winghaven':         "Winghaven subdivision in O'Fallon (off Bryan Rd / Winghaven Blvd) is a large planned community near the confirmed hail track. Plausible widespread shingle and gutter claims consistent with the storm path through St. Charles County. The Winghaven area was specifically cited in O'Fallon damage reports.",
    'sommerset estates': "Sommerset Estates in O'Fallon is in the confirmed hail corridor near Bryan Rd. Plausible roof and vehicle damage.",
    'piney creek':       "Piney Creek (formerly Whitegate Manor) in North O'Fallon sits in the storm's path along the I-70/I-64 corridor. Plausible roof and hail damage consistent with the broader O'Fallon storm track.",
    'streets of caledonia': "Streets of Caledonia in O'Fallon (Hwy 64 / Hwy DD) is a newer development in the confirmed storm path. New construction roofing is plausibly susceptible to hail damage claims.",
    'harvest':           "Harvest subdivision in O'Fallon (off Fischer Rd / Bryan Rd) is in the confirmed damage corridor. Plausible hail damage to roofs and vehicles.",
    // Creve Coeur
    'conway meadows':    'Conway Meadows subdivision in Creve Coeur (off Conway Rd / Olive Blvd) is in the western hail fringe. Plausible roof and vehicle damage from 1.25-1.5" hail.',
    'chesterfield farms':'Chesterfield Farms / Creve Coeur area subdivisions along Olive Blvd received hail at the edge of the main swath. Plausible shingle damage.',
    // Imperial / Jefferson Co
    'carman trails':     'Carman Trails subdivision in Imperial is confirmed in the damage data — significant roof damage from 1.75" golf ball hail. Ask me about Imperial for full detail.',
    'imperial hills':    'Imperial Hills subdivision is confirmed in the damage data — widespread shingle loss from 1.75" hail on April 17. Ask me about Imperial for full detail.',
    'sandy creek':       'Sandy Creek Estates in Imperial received combined hail and wind damage on April 17. Confirmed in damage reports. Ask me about Imperial for full detail.',
    // Arnold
    'fox run':           'Fox Run subdivision in Arnold (off Jeffco Blvd) is confirmed in the damage data — numerous roof claims from 1.75" golf ball hail and 80 mph winds.',
    // Ballwin
    'ballwin estates':   'Ballwin area subdivisions along Manchester Rd (Hwy 100) and Clayton Rd received hail at the outer swath fringe (~1.0"). Plausible roof and vehicle damage.',
    // St Ann
    'rock road terrace': 'Rock Road Terrace subdivision in St. Ann (off St. Charles Rock Rd / Kingbee Pl area) is directly along the confirmed hail swath center. Plausible 1.75" hail damage to roofs and vehicles.',
  };

  for (var sub in subMap) {
    if (q.includes(sub)) return subMap[sub];
  }

  // ── City-specific responses ────────────────────────────────────────────────

  if (q.includes('bridgeton')) {
    return 'Bridgeton hail damage (1.75" golf ball) — streets and subdivisions:\n\n**Confirmed:**\n• **Harmony Estates** (off St. Charles Rock Rd at Harmony Ln) — Patch confirmed homes damaged, power out into Saturday\n• **Scotch Drive area** — FOX 2 confirmed trees down on homes, cars\n• **St. Charles Rock Rd corridor** — primary damage path, widespread roof and vehicle damage\n• **Natural Bridge Rd** — structural and vehicle damage\n• **Lambert Airport perimeter / McDonnell Blvd** — commercial damage\n\n**Plausible (in storm path):**\n• **DePaul Hills** (off Natural Bridge Rd) — brick ranch homes, plausible roof/gutter damage\n• **Northfield / St. James Estates** (off N. Lindbergh Blvd) — in hail corridor\n• **Fee Fee Rd residential streets** — between St. Charles Rock Rd and Natural Bridge Rd\n• **McKelvey Rd neighborhoods** — Rolling Green Acres area';
  }

  if (q.includes('st. ann') || q.includes('st ann')) {
    return 'St. Ann hail damage (1.75" golf ball) — streets and subdivisions:\n\n**Confirmed corridor:**\n• **Fee Fee Rd** — center of hail swath through St. Ann\n• **St. Charles Rock Rd at St. Ann** — vehicle and roof damage\n• **Midland Blvd** — residential neighborhoods, shingle and gutter damage\n• **St. Ann Square** shopping area — vehicle damage\n\n**Plausible (in storm path):**\n• **Rock Road Terrace** subdivision (off St. Charles Rock Rd / Kingbee Pl)\n• **Ashby Rd / Fee Fee Rd** neighborhood grid — 1960s-70s ranch homes throughout\n• **St. Ann Ave / Lackland Rd** residential blocks\n• **Old St. Charles Rd** corridor subdivisions';
  }

  if (q.includes('hazelwood')) {
    return 'Hazelwood hail and wind damage — streets and subdivisions:\n\n**Confirmed corridor:**\n• **Lindbergh Blvd north of I-70** — hail and 75-80 mph gusts, lines downed\n• **New Florissant Rd** — tree and roof damage\n• **Howdershell Rd** — residential hail damage\n• **McDonnell Blvd** — commercial, 1.0-1.5" hail\n\n**Plausible (in storm path):**\n• **South Pattonville** area subdivisions off Howdershell Rd\n• **Hazelwood Acres** neighborhoods near Lindbergh Blvd\n• **Brotherton Ln / Taussig Rd** grid — established ranch neighborhoods\n• **Fee Fee Rd at Howdershell** corridor — homes in hail swath path';
  }

  if (q.includes('maryland heights') || q.includes('maryland hts')) {
    return 'Maryland Heights hail and structural damage — streets and subdivisions:\n\n**Confirmed:**\n• **Creve Coeur Soccer Park** (off Dorsett Rd) — roof blown off office building, walls collapsed (FOX 2 verified)\n• **Page Ave / Dorsett Rd corridor** — 1.5" hail, widespread damage\n• **Westport Plaza area** — commercial hail and wind\n• **Fee Fee Rd at Page Ave** — vehicle damage\n\n**Plausible (in storm path):**\n• **Autumn Lakes** subdivision (off Dorsett Rd / Creve Coeur Lake area) — lake-view condos, plausible roof/vehicle damage\n• **McKelvey Rd residential subdivisions** — established 1970s-80s ranch homes\n• **Marine Ave / Schuetz Rd** neighborhoods — in Page Ave damage corridor\n• **Dorsett Ridge** area — townhomes and condos along main corridor\n• **Lackland Rd subdivisions** — residential streets off Page Ave';
  }

  if (q.includes('creve coeur')) {
    return 'Creve Coeur hail damage (1.25-1.5") — streets and subdivisions:\n\n**Confirmed corridor:**\n• **Olive Blvd** — hail swath, subdivisions on both sides\n• **Ladue Rd / Conway Rd** — residential roof damage\n• **I-270 at Olive** — commercial area vehicle damage\n\n**Plausible (in storm path):**\n• **Conway Meadows** subdivision (off Conway Rd / Olive Blvd) — plausible roof claims\n• **Spoede Rd / Old Olive** neighborhoods — established ranch and colonial homes\n• **New Ballas Rd** subdivisions — in outer hail swath\n• **Conway Springs / Conway Cove** area — plausible shingle and gutter damage\n• **Chesterfield Pkwy at Olive** — townhomes and newer homes in swath';
  }

  if (q.includes('chesterfield')) {
    return 'Chesterfield hail and tornado damage — streets and subdivisions:\n\n**Confirmed:**\n• **EF0 tornado** near I-64 / Clarkson Rd / Olive Blvd — NWS verified, 2-mile track\n• **Chesterfield Mall area** — vehicle damage in parking lots\n\n**Plausible (near tornado track / hail swath):**\n• **Meadowbrook Farm / Clarkson Estates** (589 homes off Baxter Rd / Country Ridge Dr) — large subdivision with 65+ acres of trees, plausible significant tree and roof damage near tornado track\n• **Villages at Baxter Ridge** (307 homes + 128 condos off Baxter Rd) — near EF0 track, plausible structural and tree damage\n• **Clarkson Woods** subdivision — along Clarkson Rd corridor\n• **Green Trails** (off Olive Blvd / Ladue Rd) — outer hail fringe, plausible vehicle/roof damage\n• **Broadmoor / Baxter Lakes** — Baxter Rd area, plausible damage near tornado path\n• **Wild Horse Creek Rd** neighborhoods — lighter outer swath damage';
  }

  if (q.includes('ballwin') || q.includes('ball win')) {
    return 'Ballwin hail and wind damage — streets and subdivisions:\n\n**Confirmed corridor:**\n• **Manchester Rd (Hwy 100)** — vehicle and roof damage along main corridor\n• **Clayton Rd / Big Bend Blvd** — residential damage\n• **Holloway Rd** — large branches down, wind debris\n\n**Plausible (in storm path):**\n• **Claymont Woods / Claymont Lake Estates** area (off Manchester Rd) — plausible hail damage\n• **Four Seasons** subdivision (off Clayton Rd) — established neighborhood, plausible roof claims\n• **Henry Ave / Ries Rd** subdivisions — moderate hail area\n• **Kiefer Creek Rd / Holloway** neighborhoods — wind and tree damage plausible\n• **Manor Hill / Ballwin Manor** area — outer swath, plausible minor damage';
  }

  if (q.includes('florissant')) {
    return 'Florissant wind and hail damage — streets and subdivisions:\n\n**Confirmed corridor:**\n• **Lindbergh Blvd** — major tree and roof damage, extended outages\n• **New Florissant Rd** — utility line and tree damage\n• **Shackelford Rd / Dunn Rd** — residential\n\n**Plausible (in storm path):**\n• **Charbonier Estates / Charbonier Rd** neighborhoods — plausible tree and roof damage\n• **Wedgewood Hills** area (off New Florissant Rd) — plausible hail damage\n• **Larimore Rd / Spanish Lake Rd** subdivisions — outer wind swath\n• **Parker Rd / Cold Water Creek** area neighborhoods — plausible moderate damage';
  }

  if (q.includes("o'fallon") || q.includes('ofallon') || q.includes('o fallon')) {
    return "O'Fallon storm damage — streets and subdivisions:\n\n**Confirmed:**\n• **West Terra Lane at I-70** — auto dealerships: ~450 vehicles damaged (FOX 2 confirmed)\n• **St. Dominic High School** — major parking lot hail damage\n• **City Hall / Civic Park / Emergency Ops Center** — municipal vehicle damage\n\n**Plausible (in storm path):**\n• **Winghaven** (off Bryan Rd / Winghaven Blvd) — large planned community, plausible widespread shingle and gutter damage\n• **Piney Creek** (formerly Whitegate Manor, North O'Fallon) — ranch-style homes built 1985-2001, plausible roof claims\n• **Sommerset Estates** (off Bryan Rd) — plausible vehicle and roof damage\n• **Harvest** subdivision (off Fischer/Bryan Rd) — newer construction, plausible hail damage\n• **Streets of Caledonia** (Hwy 64 / Hwy DD) — newer development, plausible claims\n• **Bryan Rd residential corridor** — widespread plausible damage in storm path";
  }

  if (q.includes('wentzville')) {
    return 'Wentzville hail damage (1.0-1.5") — streets and subdivisions:\n\n**Confirmed corridor:**\n• **Pearce Blvd / Wentzville Pkwy** — main corridor damage\n• **I-70 at Wentzville** — commercial vehicle damage\n\n**Plausible (in storm path):**\n• **Wentzville Village** neighborhoods off Main St\n• **Fairway Estates** / golf course area subdivisions\n• **Millstone subdivision** (off Wentzville Pkwy) — plausible roof claims\n• **OBryan Rd / Graham Rd** — residential subdivisions\n• **Pitman Rd** area neighborhoods';
  }

  if (q.includes('st. charles') || q.includes('st charles') || q.includes('lake saint louis') || q.includes('lake st. louis') || q.includes('cottleville') || q.includes('st. peters') || q.includes('st peters')) {
    return 'St. Charles County hail damage (outer swath, 0.75-1.25") — plausible areas:\n\n• **Mid Rivers Mall / Mid Rivers Mall Dr** area — commercial parking damage\n• **Zumbehl Rd residential neighborhoods** — plausible shingle damage\n• **First Capitol Dr / Boone Hills Dr** — historic district homes plausible minor damage\n• **Lake St. Louis Blvd** subdivisions — outer fringe hail\n• **Cottleville** (off Hwy N / Hwy O) — eastern fringe, 1.0-1.25" plausible\n• **St. Peters — Cave Springs Rd** area — moderate hail\n\nNote: St. Charles County received smaller hail than the NW St. Louis core (1.75") — damage is primarily vehicle and roof shingles rather than structural.';
  }

  if (q.includes('arnold')) {
    return 'Arnold hail damage (1.75" golf ball) — streets and subdivisions:\n\n**Confirmed:**\n• **Jeffco Blvd** (Hwy 141 to Plaza Dr) — roof collapses, road closed\n• **Fox Run subdivision** (off Jeffco Blvd) — numerous confirmed roof claims\n\n**Plausible (in storm path):**\n• **Richardson Rd / Tenbrook Rd** corridor — ranch neighborhoods, widespread shingle damage\n• **Arnold Commons** area — vehicle damage in parking areas\n• **Oakbrook Estates / Windsor Village** area (off Jeffco Blvd) — plausible roof claims\n• **Gravois Rd between Jeffco Blvd and Hwy 61** — mixed residential, plausible damage\n• **Hwy 61/67 corridor** — multiple trees downed on lines and homes';
  }

  if (q.includes('imperial')) {
    return 'Imperial hail and structural damage — streets and subdivisions:\n\n**Confirmed:**\n• **Old Lemay Ferry Rd** — home structural collapses, worst per-street residential damage in Jefferson County\n• **Carman Trails** — significant roof damage confirmed\n• **Imperial Hills** — widespread shingle loss confirmed\n• **Sandy Creek Estates** — hail + wind damage confirmed\n\n**Plausible (in storm path):**\n• **Lemay Ferry Rd at Hwy 61** — vehicle and roof damage\n• **Larkin Williams Rd** neighborhoods — in storm path, plausible damage\n• **Imperial Manor** area subdivisions — outer swath\n• **Telegraph Rd (Hwy 61)** commercial strip — vehicle damage, broken windshields';
  }

  if (q.includes('hillsboro')) {
    return 'Hillsboro damage — streets and subdivisions:\n\n**Confirmed:**\n• **Clayton Husky Rd / Klondike Rd** — 8-9 structures confirmed, NWS verified\n• Damage spread ~2 miles along **Clayton Husky Rd**\n\n**Plausible:**\n• **Vail Rd** subdivisions — in storm path, plausible roof damage\n• **Hwy 21 corridor** — moderate hail (~1")\n• **Hillsboro city limits** off Gravois Rd — outer fringe';
  }

  if (q.includes('mehlville') || q.includes('oakville') || q.includes('south county') || q.includes('tesson ferry')) {
    return 'South St. Louis County (outer hail swath, ~1.0-1.25"):\n\n• **Lemay Ferry Rd** corridor — moderate hail\n• **Tesson Ferry Rd** — lighter damage, mostly vehicles\n• **Oakville** subdivisions (off Telegraph Rd) — outer swath edge\n• **Gravois Rd** south of Arnold — transitional zone, diminishing hail\n\nThis area received smaller hail than the NW county core — primarily vehicle and roof shingle damage rather than structural.';
  }

  // ── Topic responses ────────────────────────────────────────────────────────

  if (q.includes('structural') || q.includes('collapse') || q.includes('worst') || q.includes('most damage')) {
    return 'Confirmed structural damage by location:\n\n• **Arnold — Jeffco Blvd** (Hwy 141 to Plaza Dr): Commercial roof collapses, road closed\n• **Imperial — Old Lemay Ferry Rd**: Several home structural collapses — worst residential count in Jefferson County\n• **Hillsboro — Clayton Husky Rd / Klondike**: 8-9 structures confirmed, ~2-mile corridor\n• **Maryland Heights — Creve Coeur Soccer Park**: Roof blown off, walls collapsed (FOX 2)\n• **O\'Fallon — West Terra Lane**: ~450 vehicles at dealerships';
  }

  if (q.includes('tornado')) {
    return 'NWS confirmed two EF1 tornadoes in the St. Louis area on April 17, 2026:\n\n• Both had winds of at least 90 mph, primarily tree damage\n• One EF0 confirmed near **I-64 / Clarkson Rd / Olive Blvd in Chesterfield** — 2-mile track\n• **NW St. Louis County** (Bridgeton/St. Ann) under Tornado Warning at 10:08 PM\n• 85 mph gusts near Moscow Mills — outbuildings and manufactured homes damaged\n• NWS survey completed April 20, 2026';
  }

  if (q.includes('insurance') || q.includes('claim')) {
    return 'Insurance guidance for April 17-18 claims:\n\n• **Document before cleanup** — timestamped photos/video of all damage\n• **File promptly** — high claim volume; earlier filing = faster adjuster\n• **Structural damage** → dwelling coverage; do NOT enter until engineer inspects\n• **Hail (1.75")** → qualifies for full roof replacement under RCV policies\n• **Vehicles** → comprehensive auto, not collision\n• **Jefferson County EM**: 636-797-6450 for official damage registry\n• **Avoid unsolicited contractors** — storm chasers going door-to-door post-event are common scams';
  }

  if (q.includes('wind') || q.includes('outage') || q.includes('power')) {
    return 'Wind damage summary:\n\n• **80 mph gusts** across NW St. Louis Metro and Arnold/Mehlville ~10 PM April 17\n• **85 mph** near Moscow Mills — outbuildings, manufactured homes\n• **NW St. Louis**: Lindbergh Blvd, I-270, St. Charles Rock Rd — lines downed\n• **Florissant**: Major tree damage, Lindbergh Blvd and New Florissant Rd\n• **Arnold**: Jeffco Blvd, Hwy 61/67 — structural and tree damage\n• **50,000+ customers** lost power — Ameren MO led Missouri restoration';
  }

  if (q.includes('compare') || q.includes('vs') || q.includes('versus') || q.includes('all areas') || q.includes('covered') || q.includes('what areas')) {
    return 'April 17-18 storm coverage — confirmed + plausible detail by area:\n\n**Jefferson County:** Arnold (Jeffco Blvd, Fox Run), Imperial (Old Lemay Ferry, Carman Trails, Imperial Hills), Hillsboro (Clayton Husky/Klondike)\n**NW St. Louis Co.:** Bridgeton (St. Charles Rock Rd, Harmony Estates, DePaul Hills), St. Ann (Fee Fee Rd, Rock Road Terrace), Hazelwood (Lindbergh Blvd), Maryland Heights (Soccer Park, Dorsett/Page), Florissant\n**West St. Louis Co.:** Creve Coeur (Olive Blvd, Conway Meadows), Chesterfield (EF0 tornado, Meadowbrook Farm/Clarkson Estates, Baxter Ridge), Ballwin (Manchester Rd)\n**St. Charles Co.:** O\'Fallon (West Terra Ln, Winghaven, Piney Creek), Wentzville, St. Peters, St. Charles, Lake St. Louis\n\nAsk about any city for street-level and subdivision detail.';
  }

  return 'I have street-level and subdivision detail for these areas from the April 17-18 storm:\n\n**Jefferson Co.:** Arnold, Imperial, Hillsboro\n**NW St. Louis Co.:** Bridgeton, St. Ann, Hazelwood, Maryland Heights, Florissant\n**West St. Louis Co.:** Creve Coeur, Chesterfield, Ballwin\n**St. Charles Co.:** O\'Fallon, Wentzville, St. Charles, St. Peters\n\nAsk about a specific city, street, or subdivision name (e.g. "Harmony Estates", "Meadowbrook Farm", "Winghaven", "Carman Trails").';
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
