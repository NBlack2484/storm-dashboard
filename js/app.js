// app.js — Main application controller
// Modules: AlertsModule, MapModule, ClaudeModule, SPCModule,
//          RadarModule, LightningModule, ArchiveModule, ChatModule

let state = {
  alerts: [],
  liveAlerts: false,
  selectedReport: null,
  activeLayer: 'damage',
  refreshTimer: null,
  aiLoading: false,
  spcReports: [],
  metrics: { warnings: 0, reports: 0, maxHail: '1.75"', peakWind: '80 mph', outages: '50K+' },
};

const A   = window.AlertsModule;
const M   = window.MapModule;
const C   = window.ClaudeModule;
const SPC = window.SPCModule;
const R   = window.RadarModule;
const LX  = window.LightningModule;
const ARC = window.ArchiveModule;
const CH  = window.ChatModule;

const CFG = window.CONFIG || {
  CLAUDE_API_KEY: 'YOUR_ANTHROPIC_API_KEY_HERE',
  WATCH_ZONES: ['MOC099', 'MOC189', 'MOC510', 'MOC183'],
  MAP_CENTER: [38.25, -90.55],
  MAP_ZOOM: 10,
  REFRESH_INTERVAL: 300000,
  SPC_POLL_INTERVAL: 180000,
};

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  const leafletMap = M.initMap(CFG.MAP_CENTER, CFG.MAP_ZOOM);

  // Init radar and lightning with the Leaflet map instance
  R.initRadar(leafletMap);
  LX.initLightning(leafletMap);

  M.drawHailSwath();
  A.STORM_REPORTS.forEach(r => M.addStormMarker(r, handleClaudeRequest));

  await loadAlerts();
  renderReports();
  updateMetrics();

  // Seed the April 17–18 archive if this is the first run
  ARC.seedAprilEvent(A.STORM_REPORTS, A.FALLBACK_ALERTS);

  // Start live feeds
  SPC.startSPCPolling(onNewSPCReports, CFG.SPC_POLL_INTERVAL);
  state.refreshTimer = setInterval(loadAlerts, CFG.REFRESH_INTERVAL);

  // Init chat
  CH.initChat(CFG.CLAUDE_API_KEY, 'chat-panel');
  CH.appendWelcomeMessage();
  syncChatContext();

  document.getElementById('last-updated').textContent =
    'Updated ' + new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

// ── NWS Alerts ────────────────────────────────────────────────────────────────

async function loadAlerts() {
  const { alerts, live } = await A.fetchLiveAlerts(CFG.WATCH_ZONES);

  if (ARC.isNewEvent(alerts)) showNewEventBanner();
  ARC.touchActiveEvent(alerts);

  state.alerts = alerts;
  state.liveAlerts = live;
  state.metrics.warnings = alerts.length;

  renderAlerts();
  updateStatusBadge(live);
  syncChatContext();

  document.getElementById('last-updated').textContent =
    'Updated ' + new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  alerts.forEach(f => { if (f.geometry) M.addAlertPolygon(f); });
}

// ── SPC Live Reports ──────────────────────────────────────────────────────────

function onNewSPCReports(reports) {
  console.log(`[SPC] ${reports.length} new report(s)`);
  state.spcReports = [...state.spcReports, ...reports];
  state.metrics.reports = A.STORM_REPORTS.length + state.spcReports.length;

  reports.forEach(r => {
    M.addStormMarker({
      id: r.id, type: r.type,
      badge: `badge-${r.type}`,
      label: capitalize(r.type),
      location: r.location, lat: r.lat, lon: r.lon,
      magnitude: r.magnitude, detail: r.detail,
      time: r.time, source: r.source,
    }, handleClaudeRequest);
  });

  updateMetrics();
  renderSPCBadge(state.spcReports.length);
  syncChatContext();
  showToast(`📡 ${reports.length} new SPC report${reports.length > 1 ? 's' : ''} plotted`, 'spc');
}

function renderSPCBadge(count) {
  const el = document.getElementById('spc-live-badge');
  if (el) { el.textContent = `${count} SPC live`; el.style.display = count > 0 ? 'inline-block' : 'none'; }
}

// ── Radar controls ────────────────────────────────────────────────────────────

async function toggleRadar() {
  await R.toggleRadar();
}

async function setRadarSource(source, btn) {
  document.querySelectorAll('[data-radar-source]').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  await R.setRadarSource(source);
}

async function toggleAnimation() {
  await R.toggleAnimation();
}

// ── Lightning controls ────────────────────────────────────────────────────────

function toggleLightning() {
  LX.toggleLightning();
}

// ── Archive ───────────────────────────────────────────────────────────────────

function showNewEventBanner() {
  const banner = document.getElementById('new-event-banner');
  if (!banner) return;
  banner.innerHTML = `
    <strong>⚡ New storm event detected.</strong>
    Archive current data and reset for the new event?
    <button onclick="confirmArchiveAndReset()" class="ai-btn primary" style="margin-left:8px">Archive & Reset</button>
    <button onclick="document.getElementById('new-event-banner').style.display='none'" class="ai-btn" style="margin-left:4px">Dismiss</button>
  `;
  banner.style.display = 'flex';
}

window.confirmArchiveAndReset = function () {
  ARC.archiveAndReset(
    { alerts: state.alerts, stormReports: A.STORM_REPORTS, spcReports: state.spcReports, metrics: state.metrics },
    entry => console.log('[Archive] Saved:', entry.name),
    () => {
      M.clearMarkers();
      SPC.resetSPCState();
      state.spcReports = [];
      state.metrics.reports = 0;
      renderSPCBadge(0);
      SPC.startSPCPolling(onNewSPCReports, CFG.SPC_POLL_INTERVAL);
      ARC.renderArchiveTab('archive-list', loadArchivedEvent);
    }
  );
  document.getElementById('new-event-banner').style.display = 'none';
};

function loadArchivedEvent(ev) {
  const reports = [...(ev.stormReports || []), ...(ev.spcReports || [])];
  const container = document.getElementById('reports-list');
  if (container) {
    container.innerHTML = reports.map(r => `
      <div class="report-item">
        <span class="report-badge badge-${r.type || 'struct'}">${r.label || capitalize(r.type || 'report')}</span>
        <div>
          <div class="report-location">${r.location}</div>
          <div class="report-detail">${(r.detail || '').substring(0, 50)}...</div>
        </div>
        <div class="report-mag">${r.magnitude}</div>
      </div>`).join('') || '<div class="empty-state">No reports in this archive.</div>';
  }
  switchTab('reports');
}

// ── Sidebar render ────────────────────────────────────────────────────────────

function renderAlerts() {
  const container = document.getElementById('alerts-list');
  if (!state.alerts.length) {
    container.innerHTML = `<div class="empty-state"><div class="icon">✓</div>No active alerts for watch zones</div>`;
    return;
  }
  container.innerHTML = state.alerts.map(f => {
    const p = f.properties;
    const cls = A.getEventClass(p.event);
    const sev = A.getSeverityClass(p.severity);
    return `
      <div class="alert-item" onclick="selectAlert('${f.id}')">
        <span class="alert-severity ${sev}">${p.severity || 'Alert'}</span>
        <div class="alert-event ${cls}">${p.event || 'Alert'}</div>
        <div class="alert-area">${(p.areaDesc || '').substring(0, 60)}</div>
        <div class="alert-time">Expires: ${A.formatAlertTime(p.expires)}</div>
      </div>`;
  }).join('');
  if (!state.liveAlerts) {
    container.innerHTML += `<div style="padding:8px 16px;font-size:11px;color:#94a3b8;border-top:1px solid #f1f5f9">
      Showing April 17–18 2026 event data · NWS API offline or no active alerts
    </div>`;
  }
}

function renderReports() {
  const container = document.getElementById('reports-list');
  container.innerHTML = A.STORM_REPORTS.map(r => `
    <div class="report-item" onclick="selectReport('${r.id}')">
      <span class="report-badge ${r.badge}">${r.label}</span>
      <div>
        <div class="report-location">${r.location}</div>
        <div class="report-detail">${r.detail.substring(0, 50)}...</div>
      </div>
      <div class="report-mag">${r.magnitude}</div>
    </div>`).join('');
}

function updateMetrics() {
  document.getElementById('m-warnings').textContent = state.metrics.warnings;
  document.getElementById('m-reports').textContent = A.STORM_REPORTS.length + state.spcReports.length;
  document.getElementById('m-hail').textContent = state.metrics.maxHail;
  document.getElementById('m-wind').textContent = state.metrics.peakWind;
  document.getElementById('m-outages').textContent = state.metrics.outages || '50K+';
}

function updateStatusBadge(live) {
  const dot = document.querySelector('.pulse-dot');
  const label = document.getElementById('status-label');
  if (live) { dot.className = 'pulse-dot'; label.textContent = 'Live NWS data'; }
  else { dot.className = 'pulse-dot amber'; label.textContent = 'Event data (Apr 17–18)'; }
}

// ── AI Summary ────────────────────────────────────────────────────────────────

async function handleClaudeRequest(reportId) {
  const report = [...A.STORM_REPORTS, ...state.spcReports].find(r => r.id === reportId);
  if (!report || state.aiLoading) return;
  state.selectedReport = report;
  state.aiLoading = true;

  const aiBody = document.getElementById('ai-body');
  aiBody.className = 'ai-body loading';
  aiBody.textContent = 'Analyzing storm data with Claude AI...';
  document.getElementById('ai-report-name').textContent = report.location;

  try {
    const response = await C.callClaude(C.buildStormPrompt(report, state.alerts), CFG.CLAUDE_API_KEY);
    aiBody.className = 'ai-body';
    aiBody.innerHTML = formatAIResponse(response);
  } catch (err) {
    aiBody.className = 'ai-body';
    aiBody.innerHTML = `<span style="color:#dc2626">Error: ${err.message}</span>`;
  } finally {
    state.aiLoading = false;
  }
}

async function generateAreaSummary() {
  if (state.aiLoading) return;
  state.aiLoading = true;
  const aiBody = document.getElementById('ai-body');
  aiBody.className = 'ai-body loading';
  aiBody.textContent = 'Generating area-wide damage briefing...';
  document.getElementById('ai-report-name').textContent = 'Jefferson County Area Briefing';
  try {
    const response = await C.callClaude(C.buildAreaSummaryPrompt(state.alerts, A.STORM_REPORTS, state.metrics), CFG.CLAUDE_API_KEY);
    aiBody.className = 'ai-body';
    aiBody.innerHTML = formatAIResponse(response);
  } catch (err) {
    aiBody.className = 'ai-body';
    aiBody.innerHTML = `<span style="color:#dc2626">Error: ${err.message}</span>`;
  } finally {
    state.aiLoading = false;
  }
}

function formatAIResponse(text) {
  return text
    .replace(/^(DAMAGE ASSESSMENT|INSURANCE RELEVANCE|IMMEDIATE ACTIONS)/gm,
      '<strong style="display:block;margin-top:10px;margin-bottom:4px;color:#1e293b;font-size:12px;text-transform:uppercase;letter-spacing:.05em">$1</strong>')
    .replace(/^• (.+)$/gm,
      '<div style="display:flex;gap:6px;margin-bottom:3px"><span style="color:#2563eb;flex-shrink:0">•</span><span>$1</span></div>')
    .replace(/\n/g, '<br>');
}

// ── Chat context ──────────────────────────────────────────────────────────────

function syncChatContext() {
  CH.updateChatContext({
    alerts: state.alerts, stormReports: A.STORM_REPORTS,
    spcReports: state.spcReports, metrics: state.metrics,
  });
}

// ── UI helpers ────────────────────────────────────────────────────────────────

function showToast(msg, type = '') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast${type ? ' toast-' + type : ''}`;
  toast.innerHTML = msg;
  container.appendChild(toast);
  setTimeout(() => toast.classList.add('toast-visible'), 50);
  setTimeout(() => { toast.classList.remove('toast-visible'); setTimeout(() => toast.remove(), 400); }, 4000);
}

function selectAlert(id) {
  document.querySelectorAll('.alert-item').forEach(el => el.classList.remove('selected'));
  event.currentTarget?.classList.add('selected');
}

function selectReport(reportId) {
  state.selectedReport = A.STORM_REPORTS.find(r => r.id === reportId);
  M.highlightMarker(reportId);
  switchTab('alerts');
}

function switchTab(name) {
  document.querySelectorAll('.sidebar-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === `panel-${name}`));
  if (name === 'archive') ARC.renderArchiveTab('archive-list', loadArchivedEvent);
}

function setMapLayer(layerName, btn) {
  state.activeLayer = layerName;
  document.querySelectorAll('.toolbar-btn[data-layer]').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  M.setLayer(layerName);
  if (layerName === 'hail') M.drawHailSwath();
}

async function refreshAlerts() {
  const btn = document.getElementById('refresh-btn');
  btn.textContent = 'Refreshing...';
  btn.disabled = true;
  await loadAlerts();
  btn.textContent = 'Refresh';
  btn.disabled = false;
}

async function searchZone() {
  const input = document.getElementById('zone-input').value.trim().toUpperCase();
  if (!input) return;
  const zones = input.split(',').map(z => z.trim()).filter(Boolean);
  CFG.WATCH_ZONES.push(...zones.filter(z => !CFG.WATCH_ZONES.includes(z)));
  await loadAlerts();
}

function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

// ── Boot ──────────────────────────────────────────────────────────────────────

window.addEventListener('DOMContentLoaded', init);
window.selectAlert       = selectAlert;
window.selectReport      = selectReport;
window.handleClaudeRequest = handleClaudeRequest;
window.generateAreaSummary = generateAreaSummary;
window.switchTab         = switchTab;
window.setMapLayer       = setMapLayer;
window.refreshAlerts     = refreshAlerts;
window.searchZone        = searchZone;
window.toggleRadar       = toggleRadar;
window.setRadarSource    = setRadarSource;
window.toggleAnimation   = toggleAnimation;
window.toggleLightning   = toggleLightning;
