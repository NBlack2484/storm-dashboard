;(function() {
// lightning.js — Live lightning strike overlay via Blitzortung.org
//
// Connects to Blitzortung's public WebSocket feed (no key required).
// Each strike plots as a pulsing yellow marker that fades over 8 minutes.
// Attribution: Blitzortung.org / CC BY-SA 4.0 (required by their terms).

const LX_CONFIG = {
  servers: [
    'wss://ws1.blitzortung.org:443/',
    'wss://ws2.blitzortung.org:443/',
    'wss://ws3.blitzortung.org:443/',
    'wss://ws4.blitzortung.org:443/',
    'wss://ws5.blitzortung.org:443/',
    'wss://ws6.blitzortung.org:443/',
    'wss://ws7.blitzortung.org:443/',
    'wss://ws8.blitzortung.org:443/',
  ],
  // Region filter — wider box to catch incoming storms
  bounds: { latMin: 35.5, latMax: 41.5, lonMin: -96.0, lonMax: -87.0 },
  strikeTTL:       8 * 60 * 1000,  // 8 minutes
  sweepInterval:   30 * 1000,       // sweep every 30s
  maxStrikes:      600,
  reconnectDelay:  4000,
};

// ── State ─────────────────────────────────────────────────────────────────────

let _map            = null;
let _ws             = null;
let _serverIdx      = 0;
let _active         = false;
let _visible        = false;
let _sweepTimer     = null;
let _reconnTimer    = null;
let _strikes        = [];
let _lightningLayer = null;
let _strikeCount    = 0;

// ── WebSocket ─────────────────────────────────────────────────────────────────

function _connect() {
  if (_ws) { try { _ws.onclose = null; _ws.close(); } catch(e){} }

  const url = LX_CONFIG.servers[_serverIdx % LX_CONFIG.servers.length];
  console.log(`[Lightning] Connecting to ${url}`);
  _updateStatusEl('⚡ Connecting…');

  try {
    _ws = new WebSocket(url);
  } catch(e) {
    console.warn('[Lightning] WS constructor failed:', e.message);
    _scheduleReconnect();
    return;
  }

  _ws.onopen = () => {
    console.log('[Lightning] Connected to', url);
    _updateStatusEl('⚡ Live');
    // Blitzortung subscription message — subscribe to global feed
    try { _ws.send(JSON.stringify({ west: -180, east: 180, north: 90, south: -90 })); }
    catch(e) { console.warn('[Lightning] send failed:', e); }
  };

  _ws.onmessage = evt => {
    try { _handleMessage(evt.data); }
    catch(e) { /* ignore malformed frame */ }
  };

  _ws.onerror = () => console.warn('[Lightning] WebSocket error');

  _ws.onclose = () => {
    console.warn('[Lightning] Disconnected from', url);
    _updateStatusEl('⚡ Reconnecting…');
    if (_active) { _serverIdx++; _scheduleReconnect(); }
  };
}

function _scheduleReconnect() {
  if (_reconnTimer) return;
  _reconnTimer = setTimeout(() => { _reconnTimer = null; if (_active) _connect(); }, LX_CONFIG.reconnectDelay);
}

// ── Message parsing ───────────────────────────────────────────────────────────

function _handleMessage(raw) {
  let data;
  try { data = JSON.parse(raw); } catch { return; }

  // Batch format: { sig: [[lat,lon], ...] }
  if (Array.isArray(data.sig)) {
    data.sig.forEach(s => {
      const lat = _norm(s[0]), lon = _norm(s[1]);
      if (lat !== null && lon !== null) _plot({ lat, lon });
    });
    return;
  }

  // Single strike format
  const rawLat = data.lat ?? data.lal ?? data.y ?? null;
  const rawLon = data.lon ?? data.x ?? null;
  if (rawLat === null || rawLon === null) return;

  const lat = _norm(rawLat), lon = _norm(rawLon);
  if (lat !== null && lon !== null) _plot({ lat, lon });
}

// Blitzortung sometimes sends microdegrees (integer > 1000), sometimes float degrees
function _norm(v) {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  if (isNaN(n)) return null;
  return Math.abs(n) > 1000 ? n / 1e6 : n;
}

// ── Strike plotting ───────────────────────────────────────────────────────────

function _plot(strike) {
  const { lat, lon } = strike;
  const b = LX_CONFIG.bounds;
  if (lat < b.latMin || lat > b.latMax) return;
  if (lon < b.lonMin || lon > b.lonMax) return;

  _strikeCount++;
  if (!_map || !_lightningLayer) return;

  const marker = L.marker([lat, lon], {
    icon: L.divIcon({
      className: '',
      html: '<div class="lightning-strike"></div>',
      iconSize: [12, 12],
      iconAnchor: [6, 6],
    }),
    zIndexOffset: 900,
    interactive: false,
  });

  if (_visible) marker.addTo(_lightningLayer);

  _strikes.push({ lat, lon, time: Date.now(), marker });

  // Trim oldest over cap
  if (_strikes.length > LX_CONFIG.maxStrikes) {
    const old = _strikes.shift();
    if (old.marker && _lightningLayer.hasLayer(old.marker)) _lightningLayer.removeLayer(old.marker);
  }

  _updateStatsEl();
}

// ── Sweep expired markers ─────────────────────────────────────────────────────

function _sweep() {
  const now = Date.now();
  const keep = [];
  _strikes.forEach(s => {
    const age = now - s.time;
    if (age > LX_CONFIG.strikeTTL) {
      // Fade then remove
      const el = s.marker?.getElement?.();
      if (el) el.style.opacity = '0';
      setTimeout(() => {
        if (_lightningLayer && _lightningLayer.hasLayer(s.marker)) _lightningLayer.removeLayer(s.marker);
      }, 500);
    } else {
      // Fade by age
      const el = s.marker?.getElement?.();
      if (el) el.style.opacity = String(Math.max(0.15, 1 - age / LX_CONFIG.strikeTTL));
      keep.push(s);
    }
  });
  _strikes = keep;
  _updateStatsEl();
}

// ── Public API ────────────────────────────────────────────────────────────────

function initLightning(leafletMap) {
  _map = leafletMap;
  _lightningLayer = L.layerGroup();
}

function startLightning() {
  if (_active) return;
  if (!_map) { console.warn('[Lightning] initLightning() must be called first'); return; }

  _active = true;
  _visible = true;
  _strikeCount = 0;

  _lightningLayer.addTo(_map);
  _connect();
  _sweepTimer = setInterval(_sweep, LX_CONFIG.sweepInterval);
  _updateBtn(true);
  console.log('[Lightning] Started');
}

function stopLightning() {
  _active = false;
  _visible = false;

  if (_ws) { try { _ws.onclose = null; _ws.close(); } catch(e){} _ws = null; }
  if (_sweepTimer) { clearInterval(_sweepTimer); _sweepTimer = null; }
  if (_reconnTimer) { clearTimeout(_reconnTimer); _reconnTimer = null; }

  if (_lightningLayer) {
    _lightningLayer.clearLayers();
    if (_map && _map.hasLayer(_lightningLayer)) _map.removeLayer(_lightningLayer);
  }

  _strikes = [];
  _updateBtn(false);
  _updateStatusEl('');
  _updateStatsEl();
  console.log('[Lightning] Stopped');
}

// Sync (non-async) toggle — safe for onclick handlers
function toggleLightning() {
  if (_active) stopLightning();
  else startLightning();
  return _active;
}

function isLightningActive() { return _active; }

// ── UI helpers ────────────────────────────────────────────────────────────────

function _updateBtn(active) {
  const btn = document.getElementById('lightning-toggle-btn');
  if (!btn) return;
  btn.classList.toggle('active', active);
  btn.textContent = active ? '⚡ Lightning ON' : '⚡ Lightning';
}

function _updateStatusEl(msg) {
  const el = document.getElementById('lightning-status');
  if (el) el.textContent = msg;
}

function _updateStatsEl() {
  const el = document.getElementById('lightning-count');
  if (!el) return;
  const n = _strikes.length;
  el.textContent = n > 0 ? `${n} strike${n !== 1 ? 's' : ''}` : '';
  el.style.display = n > 0 ? 'inline-block' : 'none';
}

window.LightningModule = {
  initLightning,
  startLightning,
  stopLightning,
  toggleLightning,
  isLightningActive,
};
})();
