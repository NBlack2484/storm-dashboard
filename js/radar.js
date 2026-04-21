// radar.js — Live radar overlay: RainViewer (default) + Iowa State Mesonet
//
// RainViewer API v2 — free, no key, global NEXRAD composite + animation loop.
// Iowa State Mesonet — free NEXRAD-N0Q tiles, US-only, no animation.

const RV_MAPS_API  = 'https://api.rainviewer.com/public/weather-maps.json';
const RV_TILE_SIZE = 512;
const RV_COLOR     = 4;   // RainbowSEA palette — closest to NWS standard
const RV_SMOOTH    = 1;
const RV_SNOW      = 0;

const MESONET_PRODUCTS = {
  'nexrad-n0q': {
    label: 'NEXRAD Base Reflectivity',
    url: 'https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/nexrad-n0q-{timestamp}/{z}/{x}/{y}.png',
  },
};

const RADAR_REFRESH_MS = 120000;  // 2 minutes
const ANIMATION_FPS    = 600;     // ms per frame

const TRANSPARENT_TILE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

// ── Module state ──────────────────────────────────────────────────────────────

let _map          = null;
let _radarLayer   = null;
let _radarTimer   = null;
let _animTimer    = null;
let _radarVisible = false;
let _animating    = false;
let _source       = 'rainviewer';
let _rvHost       = 'https://tilecache.rainviewer.com';
let _rvFrames     = [];
let _rvAnimLayers = [];
let _rvFrameIdx   = 0;

// ── Init ──────────────────────────────────────────────────────────────────────

function initRadar(leafletMap) {
  _map = leafletMap;
}

// ── RainViewer ────────────────────────────────────────────────────────────────

async function fetchRainViewerFrames() {
  try {
    const res = await fetch(RV_MAPS_API, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`maps.json ${res.status}`);
    const data = await res.json();
    _rvHost = data.host || _rvHost;
    _rvFrames = (data.radar?.past || []).sort((a, b) => a.time - b.time);
    return _rvFrames;
  } catch (e) {
    console.warn('[Radar] RainViewer maps.json failed:', e.message);
    return [];
  }
}

function rvUrl(path) {
  return `${_rvHost}${path}/${RV_TILE_SIZE}/{z}/{x}/{y}/${RV_COLOR}/${RV_SMOOTH}_${RV_SNOW}.png`;
}

async function showRainViewerStatic() {
  const frames = await fetchRainViewerFrames();
  if (!frames.length) {
    console.warn('[Radar] No RainViewer frames available');
    return;
  }
  const latest = frames[frames.length - 1];
  _applyTileLayer(rvUrl(latest.path), 'RainViewer', 'https://rainviewer.com');
  _updateTimestamp(latest.time * 1000);
}

async function animateRainViewer(count = 8) {
  _stopAnimLoop();
  const frames = await fetchRainViewerFrames();
  if (!frames.length) return;

  const subset = frames.slice(-count);
  _rvAnimLayers = subset.map(f =>
    L.tileLayer(rvUrl(f.path), {
      opacity: 0.65, zIndex: 500,
      attribution: 'Radar: <a href="https://rainviewer.com">RainViewer</a>',
      errorTileUrl: TRANSPARENT_TILE,
    })
  );

  _rvFrameIdx = 0;
  _animating = true;

  const tick = () => {
    if (!_animating || !_map) return;
    // Hide all anim layers
    _rvAnimLayers.forEach(l => { if (_map.hasLayer(l)) _map.removeLayer(l); });
    // Hide static layer during animation
    if (_radarLayer && _map.hasLayer(_radarLayer)) _map.removeLayer(_radarLayer);
    // Show current frame
    if (_radarVisible) _rvAnimLayers[_rvFrameIdx].addTo(_map);
    _updateTimestamp(subset[_rvFrameIdx].time * 1000);
    _rvFrameIdx = (_rvFrameIdx + 1) % subset.length;
    _animTimer = setTimeout(tick, ANIMATION_FPS);
  };
  tick();
}

function _stopAnimLoop() {
  _animating = false;
  if (_animTimer) { clearTimeout(_animTimer); _animTimer = null; }
  if (_map) _rvAnimLayers.forEach(l => { if (_map.hasLayer(l)) _map.removeLayer(l); });
  _rvAnimLayers = [];
}

// ── Iowa State Mesonet ────────────────────────────────────────────────────────

function _mesonetTimestamp() {
  const now = new Date();
  const m = Math.floor(now.getUTCMinutes() / 2) * 2;
  const p = n => String(n).padStart(2, '0');
  return `${now.getUTCFullYear()}${p(now.getUTCMonth()+1)}${p(now.getUTCDate())}${p(now.getUTCHours())}${p(m)}`;
}

function showMesonet() {
  const url = MESONET_PRODUCTS['nexrad-n0q'].url.replace('{timestamp}', _mesonetTimestamp());
  _applyTileLayer(url, 'Iowa State Mesonet', 'https://mesonet.agron.iastate.edu/');
  _updateTimestamp(Date.now());
}

// ── Shared tile layer ─────────────────────────────────────────────────────────

function _applyTileLayer(url, label, href) {
  if (!_map) return;
  if (_radarLayer && _map.hasLayer(_radarLayer)) {
    // Swap URL in place — avoids flicker
    _radarLayer.setUrl(url);
  } else {
    if (_radarLayer) _map.removeLayer(_radarLayer);
    _radarLayer = L.tileLayer(url, {
      opacity: 0.65,
      zIndex: 500,
      attribution: `Radar: <a href="${href}">${label}</a>`,
      errorTileUrl: TRANSPARENT_TILE,
    });
    _radarLayer.addTo(_map);
  }
}

function _updateTimestamp(ms) {
  const el = document.getElementById('radar-timestamp');
  if (!el) return;
  el.textContent = 'Radar: ' + new Date(ms).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  });
}

// ── Refresh cycle ─────────────────────────────────────────────────────────────

async function _refresh() {
  if (!_radarVisible || _animating) return;
  if (_source === 'rainviewer') await showRainViewerStatic();
  else showMesonet();
}

// ── Public API ────────────────────────────────────────────────────────────────

// showRadar / hideRadar / toggleRadar are intentionally NOT async at the call
// site — they fire-and-forget the promise so onclick handlers work fine.

function showRadar() {
  if (!_map) { console.warn('[Radar] Map not initialized'); return; }
  _radarVisible = true;
  _updateRadarBtn(true);
  // Fire async fetch without blocking
  _refresh().catch(e => console.warn('[Radar] show failed:', e));
  if (!_radarTimer) _radarTimer = setInterval(_refresh, RADAR_REFRESH_MS);
}

function hideRadar() {
  _radarVisible = false;
  _stopAnimLoop();
  if (_radarLayer && _map) { _map.removeLayer(_radarLayer); _radarLayer = null; }
  if (_radarTimer) { clearInterval(_radarTimer); _radarTimer = null; }
  const el = document.getElementById('radar-timestamp');
  if (el) el.textContent = '';
  _updateRadarBtn(false);
  _updateAnimBtn(false);
}

function toggleRadar() {
  if (_radarVisible) hideRadar();
  else showRadar();
}

function setRadarSource(source) {
  _source = source;
  _stopAnimLoop();
  // Remove existing layer so _applyTileLayer creates a fresh one
  if (_radarLayer && _map) { _map.removeLayer(_radarLayer); _radarLayer = null; }
  _updateSourceButtons(source);
  // Show/hide animate button — only for RainViewer
  const animBtn = document.getElementById('radar-anim-btn');
  if (animBtn) animBtn.style.display = source === 'rainviewer' ? '' : 'none';
  if (_radarVisible) _refresh().catch(e => console.warn('[Radar] source switch failed:', e));
  else showRadar(); // auto-enable when switching source
}

function toggleAnimation() {
  if (!_radarVisible) showRadar();
  if (_animating) {
    _stopAnimLoop();
    _updateAnimBtn(false);
    showRainViewerStatic().catch(e => console.warn('[Radar] anim stop failed:', e));
  } else {
    animateRainViewer(8).catch(e => console.warn('[Radar] anim start failed:', e));
    _updateAnimBtn(true);
  }
}

function setRadarOpacity(v) {
  if (_radarLayer) _radarLayer.setOpacity(v);
  _rvAnimLayers.forEach(l => l.setOpacity(v));
}

function isRadarVisible() { return _radarVisible; }

// ── UI helpers ────────────────────────────────────────────────────────────────

function _updateRadarBtn(active) {
  const btn = document.getElementById('radar-toggle-btn');
  if (!btn) return;
  btn.classList.toggle('active', active);
  btn.textContent = active ? '📡 Radar ON' : '📡 Radar';
}

function _updateAnimBtn(active) {
  const btn = document.getElementById('radar-anim-btn');
  if (!btn) return;
  btn.classList.toggle('active', active);
  btn.textContent = active ? '■ Stop loop' : '▶ Animate';
}

function _updateSourceButtons(source) {
  document.querySelectorAll('[data-radar-source]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.radarSource === source);
  });
}

window.RadarModule = {
  initRadar,
  showRadar,
  hideRadar,
  toggleRadar,
  toggleAnimation,
  setRadarSource,
  setRadarOpacity,
  isRadarVisible,
};
