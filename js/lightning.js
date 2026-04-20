// lightning.js — Live lightning strike overlay via Blitzortung.org
//
// Blitzortung publishes real-time strike data through a public WebSocket feed.
// Each strike appears as a pulsing marker on the Leaflet map and fades out
// after a configurable TTL (default 8 minutes).
//
// Attribution required by Blitzortung terms:
//   "Lightning data: Blitzortung.org / CC BY-SA 4.0"
//
// Blitzortung WebSocket servers are regional — we connect to the North America
// server (ws1.blitzortung.org through ws8.blitzortung.org, port 443/wss).
// They round-robin; if one fails we try the next.

// ── Configuration ─────────────────────────────────────────────────────────────

const LX_CONFIG = {
  // Blitzortung NA servers (wss, port 443)
  servers: [
    'wss://ws1.blitzortung.org:443/',
    'wss://ws2.blitzortung.org:443/',
    'wss://ws3.blitzortung.org:443/',
    'wss://ws4.blitzortung.org:443/',
  ],

  // Only plot strikes inside this bounding box (same as SPC region filter)
  bounds: {
    latMin: 36.0, latMax: 41.0,
    lonMin: -95.0, lonMax: -87.0,
  },

  // How long a strike marker stays visible (ms) — 8 minutes
  strikeTTL: 8 * 60 * 1000,

  // How often to sweep expired markers off the map (ms)
  sweepInterval: 30 * 1000,

  // Max strikes to keep in memory at once (oldest drop off)
  maxStrikes: 500,

  // Reconnect delay after disconnect (ms)
  reconnectDelay: 5000,
};

// ── State ─────────────────────────────────────────────────────────────────────

let _map          = null;
let _ws           = null;
let _serverIndex  = 0;
let _active       = false;
let _visible      = false;
let _sweepTimer   = null;
let _reconnTimer  = null;
let _strikes      = [];      // { id, lat, lon, time, marker }
let _lightningLayer = null;
let _statsEl      = null;    // optional DOM element showing live count

// Strike counter for session
let _strikeCount  = 0;

// ── WebSocket connection ──────────────────────────────────────────────────────

function connect() {
  if (_ws) {
    _ws.onclose = null;   // suppress reconnect from old socket
    _ws.close();
  }

  const url = LX_CONFIG.servers[_serverIndex % LX_CONFIG.servers.length];
  console.log(`[Lightning] Connecting to ${url}`);

  try {
    _ws = new WebSocket(url);
  } catch (e) {
    console.warn('[Lightning] WebSocket constructor failed:', e.message);
    scheduleReconnect();
    return;
  }

  _ws.onopen = () => {
    console.log('[Lightning] Connected');
    updateStatusEl('⚡ Lightning live');
    // Blitzortung expects a JSON subscription message
    _ws.send(JSON.stringify({ west: -180, east: 180, north: 90, south: -90 }));
  };

  _ws.onmessage = (evt) => {
    try {
      handleStrikeMessage(evt.data);
    } catch (e) {
      // Malformed frame — ignore
    }
  };

  _ws.onerror = () => {
    console.warn('[Lightning] WebSocket error — will reconnect');
  };

  _ws.onclose = () => {
    console.warn('[Lightning] Disconnected');
    updateStatusEl('⚡ Reconnecting…');
    if (_active) {
      _serverIndex++;   // try next server on reconnect
      scheduleReconnect();
    }
  };
}

function scheduleReconnect() {
  if (_reconnTimer) return;
  _reconnTimer = setTimeout(() => {
    _reconnTimer = null;
    if (_active) connect();
  }, LX_CONFIG.reconnectDelay);
}

// ── Message parsing ───────────────────────────────────────────────────────────

function handleStrikeMessage(raw) {
  // Blitzortung sends either a raw JSON object or a base64-encoded payload
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return;
  }

  // Format A: { time, lat, lon, ... }  (newer servers)
  // Format B: { time, lal, lon, ... }  (some servers use "lal" for lat)
  // Format C: { time, sig: [ [lat, lon], ... ] }  (batch, rare)
  // Coordinates are in integer microdegrees (divide by 1e6) or float degrees

  const strikes = extractStrikes(data);
  strikes.forEach(plotStrike);
}

function extractStrikes(data) {
  const results = [];

  if (Array.isArray(data.sig)) {
    // Batch format
    data.sig.forEach(s => {
      const lat = normCoord(s[0]);
      const lon = normCoord(s[1]);
      if (lat !== null) results.push({ lat, lon, time: Date.now() });
    });
    return results;
  }

  // Single-strike format
  const rawLat = data.lat ?? data.lal ?? data.y ?? null;
  const rawLon = data.lon ?? data.x ?? null;
  if (rawLat === null || rawLon === null) return results;

  const lat = normCoord(rawLat);
  const lon = normCoord(rawLon);
  if (lat !== null) results.push({ lat, lon, time: data.time ? data.time / 1e9 * 1000 : Date.now() });
  return results;
}

// Blitzortung encodes coords as integer microdegrees (1234567 = 1.234567°)
// but sometimes sends floats directly. Detect by magnitude.
function normCoord(v) {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  if (isNaN(n)) return null;
  // If absolute value > 1000, it's microdegrees
  return Math.abs(n) > 1000 ? n / 1e6 : n;
}

// ── Strike plotting ───────────────────────────────────────────────────────────

function plotStrike(strike) {
  const { lat, lon } = strike;
  const b = LX_CONFIG.bounds;

  // Filter to our region
  if (lat < b.latMin || lat > b.latMax) return;
  if (lon < b.lonMin || lon > b.lonMax) return;

  _strikeCount++;

  if (!_map || !_lightningLayer) return;

  // Create the strike marker — a small pulsing circle icon
  const icon = makeLightningIcon();
  const marker = L.marker([lat, lon], {
    icon,
    zIndexOffset: 800,
    interactive: false,   // don't intercept map clicks
  });

  if (_visible) marker.addTo(_lightningLayer);

  const entry = {
    id: `lx-${Date.now()}-${Math.random()}`,
    lat, lon,
    time: Date.now(),
    marker,
  };
  _strikes.push(entry);

  // Trim oldest if over limit
  if (_strikes.length > LX_CONFIG.maxStrikes) {
    const oldest = _strikes.shift();
    if (oldest.marker && _lightningLayer.hasLayer(oldest.marker)) {
      _lightningLayer.removeLayer(oldest.marker);
    }
  }

  updateStatsEl();
}

function makeLightningIcon() {
  return L.divIcon({
    className: '',
    html: `<div class="lightning-strike"></div>`,
    iconSize: [10, 10],
    iconAnchor: [5, 5],
  });
}

// ── Expiry sweep ──────────────────────────────────────────────────────────────

function sweepExpired() {
  const now = Date.now();
  const keep = [];

  _strikes.forEach(s => {
    const age = now - s.time;
    if (age > LX_CONFIG.strikeTTL) {
      // Fade out then remove
      if (s.marker) {
        const el = s.marker.getElement();
        if (el) el.style.opacity = '0';
        setTimeout(() => {
          if (_lightningLayer && _lightningLayer.hasLayer(s.marker)) {
            _lightningLayer.removeLayer(s.marker);
          }
        }, 600);
      }
    } else {
      // Update opacity based on age (full → faded over TTL)
      const opacity = Math.max(0.15, 1 - age / LX_CONFIG.strikeTTL);
      if (s.marker) {
        const el = s.marker.getElement();
        if (el) el.style.opacity = String(opacity);
      }
      keep.push(s);
    }
  });

  _strikes = keep;
  updateStatsEl();
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Initialize the lightning module.
 * @param {L.Map} leafletMap
 */
function initLightning(leafletMap) {
  _map = leafletMap;
  _lightningLayer = L.layerGroup();
  _statsEl = document.getElementById('lightning-count');
}

/**
 * Start the WebSocket feed and sweep timer.
 */
function startLightning() {
  if (_active) return;
  _active = true;
  _visible = true;
  _strikeCount = 0;

  if (!_lightningLayer) {
    console.warn('[Lightning] initLightning() must be called first');
    return;
  }

  _lightningLayer.addTo(_map);
  connect();

  _sweepTimer = setInterval(sweepExpired, LX_CONFIG.sweepInterval);
  _updateLightningBtn(true);
  console.log('[Lightning] Started');
}

/**
 * Stop the feed, clear markers, disconnect WebSocket.
 */
function stopLightning() {
  _active = false;
  _visible = false;

  if (_ws) { _ws.onclose = null; _ws.close(); _ws = null; }
  if (_sweepTimer) { clearInterval(_sweepTimer); _sweepTimer = null; }
  if (_reconnTimer) { clearTimeout(_reconnTimer); _reconnTimer = null; }

  if (_lightningLayer && _map) {
    _lightningLayer.clearLayers();
    _map.removeLayer(_lightningLayer);
  }

  _strikes = [];
  _updateLightningBtn(false);
  updateStatusEl('');
  updateStatsEl();
  console.log('[Lightning] Stopped');
}

/**
 * Toggle lightning layer on/off.
 */
function toggleLightning() {
  if (_active) stopLightning();
  else startLightning();
  return _active;
}

/**
 * Show/hide the layer without disconnecting the feed.
 */
function setLightningVisible(visible) {
  _visible = visible;
  if (!_map || !_lightningLayer) return;
  if (visible) {
    if (!_map.hasLayer(_lightningLayer)) _lightningLayer.addTo(_map);
  } else {
    if (_map.hasLayer(_lightningLayer)) _map.removeLayer(_lightningLayer);
  }
}

function isLightningActive() { return _active; }

function getLightningStats() {
  return { session: _strikeCount, visible: _strikes.length };
}

// ── UI helpers ────────────────────────────────────────────────────────────────

function _updateLightningBtn(active) {
  const btn = document.getElementById('lightning-toggle-btn');
  if (btn) {
    btn.classList.toggle('active', active);
    btn.textContent = active ? '⚡ Lightning ON' : '⚡ Lightning';
  }
}

function updateStatusEl(msg) {
  const el = document.getElementById('lightning-status');
  if (el) el.textContent = msg;
}

function updateStatsEl() {
  if (_statsEl) {
    const n = _strikes.length;
    _statsEl.textContent = n > 0 ? `${n} strike${n !== 1 ? 's' : ''}` : '';
    _statsEl.style.display = n > 0 ? 'inline-block' : 'none';
  }
}

window.LightningModule = {
  initLightning,
  startLightning,
  stopLightning,
  toggleLightning,
  setLightningVisible,
  isLightningActive,
  getLightningStats,
};
