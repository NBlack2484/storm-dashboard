// spc.js — Live SPC storm reports feed (tornado, hail, wind)
// Polls the Storm Prediction Center CSV every 3 minutes during active events.
// CSV endpoint proxied through a CORS-friendly service since SPC doesn't set CORS headers.

const SPC_BASE = 'https://www.spc.noaa.gov/climo/reports';

// CORS proxy options — try in order
const CORS_PROXIES = [
  'https://corsproxy.io/?',
  'https://api.allorigins.win/raw?url=',
];

// SPC publishes today's reports at these URLs (updated every few minutes during events)
const SPC_REPORT_URLS = {
  tornado: `${SPC_BASE}/today_torn.csv`,
  hail:    `${SPC_BASE}/today_hail.csv`,
  wind:    `${SPC_BASE}/today_wind.csv`,
};

// Bounding box for the St. Louis / Jefferson County region (lat/lon)
const REGION_BOUNDS = {
  latMin: 37.8, latMax: 39.2,
  lonMin: -91.5, lonMax: -89.5,
};

// Track already-plotted SPC report IDs to avoid duplicates
let _plotted = new Set();
let _spcPollTimer = null;
let _spcActive = false;

/**
 * Parse SPC CSV text into report objects.
 * SPC CSV columns: Time,F_Scale,Location,County,State,Lat,Lon,Comments
 * (columns vary slightly by type; we handle all three)
 */
function parseSPCCsv(csvText, type) {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];

  const header = lines[0].toLowerCase().split(',').map(h => h.trim().replace(/"/g, ''));
  const reports = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCSVLine(lines[i]);
    if (cols.length < 6) continue;

    const row = {};
    header.forEach((h, idx) => { row[h] = (cols[idx] || '').replace(/"/g, '').trim(); });

    const lat = parseFloat(row['lat'] || row['slat']);
    const lon = parseFloat(row['lon'] || row['slon']);
    if (isNaN(lat) || isNaN(lon)) continue;

    // Filter to our region
    if (lat < REGION_BOUNDS.latMin || lat > REGION_BOUNDS.latMax) continue;
    if (lon < REGION_BOUNDS.lonMin || lon > REGION_BOUNDS.lonMax) continue;

    const time = row['time'] || row['utc_time'] || '';
    const location = row['location'] || row['city'] || '';
    const county = row['county'] || '';
    const state = row['state'] || '';
    const comments = row['comments'] || row['remark'] || '';

    // Build a stable ID from type + time + lat + lon
    const id = `spc-${type}-${time}-${lat}-${lon}`;
    if (_plotted.has(id)) continue;

    let magnitude = '';
    if (type === 'tornado') magnitude = row['f_scale'] || row['mag'] || 'Unknown';
    if (type === 'hail') magnitude = row['size'] || row['mag'] ? `${row['size'] || row['mag']}" diameter` : '';
    if (type === 'wind') magnitude = row['speed'] || row['mag'] ? `${row['speed'] || row['mag']} mph` : '';

    reports.push({
      id,
      type,
      lat,
      lon,
      time,
      location: location ? `${location}, ${county} Co., ${state}` : `${county} Co., ${state}`,
      magnitude: magnitude || 'Reported',
      detail: comments || `SPC-reported ${type} event`,
      source: 'NOAA Storm Prediction Center (live)',
      live: true,
    });
  }

  return reports;
}

/** Handle quoted CSV fields with commas inside them */
function splitCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (ch === ',' && !inQuotes) { result.push(current); current = ''; continue; }
    current += ch;
  }
  result.push(current);
  return result;
}

/** Fetch one SPC CSV through CORS proxies */
async function fetchSPCCsv(type) {
  const url = SPC_REPORT_URLS[type];
  for (const proxy of CORS_PROXIES) {
    try {
      const res = await fetch(`${proxy}${encodeURIComponent(url)}`, {
        headers: { 'Accept': 'text/csv,text/plain,*/*' },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const text = await res.text();
      if (text && text.length > 30) return text;
    } catch { /* try next proxy */ }
  }
  return null;
}

/**
 * Fetch all three SPC feeds, return only NEW reports in region.
 * Marks fetched IDs so duplicates are never re-plotted.
 */
async function fetchSPCReports() {
  const types = ['tornado', 'hail', 'wind'];
  const newReports = [];

  await Promise.allSettled(types.map(async type => {
    const csv = await fetchSPCCsv(type);
    if (!csv) return;
    const parsed = parseSPCCsv(csv, type);
    for (const r of parsed) {
      if (!_plotted.has(r.id)) {
        _plotted.add(r.id);
        newReports.push(r);
      }
    }
  }));

  return newReports;
}

/**
 * Start live polling. Calls onNewReports(reports[]) whenever new ones arrive.
 * @param {function} onNewReports
 * @param {number} intervalMs - default 3 minutes
 */
function startSPCPolling(onNewReports, intervalMs = 180000) {
  if (_spcActive) return;
  _spcActive = true;

  // Immediate first fetch
  fetchSPCReports().then(reports => {
    if (reports.length > 0) onNewReports(reports);
  });

  _spcPollTimer = setInterval(async () => {
    const reports = await fetchSPCReports();
    if (reports.length > 0) onNewReports(reports);
  }, intervalMs);

  console.log(`[SPC] Live polling started (${intervalMs / 1000}s interval)`);
}

function stopSPCPolling() {
  if (_spcPollTimer) clearInterval(_spcPollTimer);
  _spcActive = false;
  console.log('[SPC] Polling stopped');
}

/** Reset plotted set (e.g. when archiving old event and starting fresh) */
function resetSPCState() {
  _plotted.clear();
  stopSPCPolling();
}

window.SPCModule = {
  fetchSPCReports,
  startSPCPolling,
  stopSPCPolling,
  resetSPCState,
};
