// app.js — Main application controller

let state = {
  alerts: [],
  liveAlerts: false,
  selectedReport: null,
  activeLayer: 'damage',
  refreshTimer: null,
  aiLoading: false,
  metrics: { warnings: 0, reports: 0, maxHail: '1.75"', peakWind: '80 mph' },
};

const A = window.AlertsModule;
const M = window.MapModule;
const C = window.ClaudeModule;
const CFG = window.CONFIG || {
  CLAUDE_API_KEY: 'YOUR_ANTHROPIC_API_KEY_HERE',
  WATCH_ZONES: ['MOC099', 'MOC189', 'MOC510', 'MOC183'],
  MAP_CENTER: [38.25, -90.55],
  MAP_ZOOM: 10,
  REFRESH_INTERVAL: 300000,
};

async function init() {
  M.initMap(CFG.MAP_CENTER, CFG.MAP_ZOOM);
  M.drawHailSwath();

  A.STORM_REPORTS.forEach(report => {
    M.addStormMarker(report, handleClaudeRequest);
  });

  await loadAlerts();
  renderReports();
  updateMetrics();

  state.refreshTimer = setInterval(loadAlerts, CFG.REFRESH_INTERVAL);
  document.getElementById('last-updated').textContent =
    'Updated ' + new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

async function loadAlerts() {
  const { alerts, live } = await A.fetchLiveAlerts(CFG.WATCH_ZONES);
  state.alerts = alerts;
  state.liveAlerts = live;
  state.metrics.warnings = alerts.length;

  renderAlerts();
  updateStatusBadge(live);
  document.getElementById('last-updated').textContent =
    'Updated ' + new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  alerts.forEach(f => {
    if (f.geometry) M.addAlertPolygon(f);
  });
}

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
  document.getElementById('m-reports').textContent = A.STORM_REPORTS.length;
  document.getElementById('m-hail').textContent = state.metrics.maxHail;
  document.getElementById('m-wind').textContent = state.metrics.peakWind;
  document.getElementById('m-outages').textContent = '50K+';
}

function updateStatusBadge(live) {
  const dot = document.querySelector('.pulse-dot');
  const label = document.getElementById('status-label');
  if (live) {
    dot.className = 'pulse-dot';
    label.textContent = 'Live NWS data';
  } else {
    dot.className = 'pulse-dot amber';
    label.textContent = 'Event data (Apr 17–18)';
  }
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

async function handleClaudeRequest(reportId) {
  const report = A.STORM_REPORTS.find(r => r.id === reportId);
  if (!report || state.aiLoading) return;

  state.selectedReport = report;
  state.aiLoading = true;

  const aiBody = document.getElementById('ai-body');
  aiBody.className = 'ai-body loading';
  aiBody.textContent = 'Analyzing storm data with Claude AI...';
  document.getElementById('ai-report-name').textContent = report.location;

  try {
    const prompt = C.buildStormPrompt(report, state.alerts);
    const response = await C.callClaude(prompt, CFG.CLAUDE_API_KEY);
    aiBody.className = 'ai-body';
    aiBody.innerHTML = formatAIResponse(response);
  } catch (err) {
    aiBody.className = 'ai-body';
    aiBody.innerHTML = `<span style="color:#dc2626">Error: ${err.message}. Check your API key in config.js.</span>`;
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
    const prompt = C.buildAreaSummaryPrompt(state.alerts, A.STORM_REPORTS, state.metrics);
    const response = await C.callClaude(prompt, CFG.CLAUDE_API_KEY);
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

function switchTab(name) {
  document.querySelectorAll('.sidebar-tab').forEach((t, i) => {
    t.classList.toggle('active', ['alerts', 'reports', 'forecast'].includes(['alerts','reports','forecast'][i]) && ['alerts','reports','forecast'][i] === name);
  });
  document.querySelectorAll('.sidebar-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === name);
  });
  document.querySelectorAll('.tab-panel').forEach(p => {
    p.classList.toggle('active', p.id === `panel-${name}`);
  });
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

window.addEventListener('DOMContentLoaded', init);
window.selectAlert = selectAlert;
window.selectReport = selectReport;
window.handleClaudeRequest = handleClaudeRequest;
window.generateAreaSummary = generateAreaSummary;
window.switchTab = switchTab;
window.setMapLayer = setMapLayer;
window.refreshAlerts = refreshAlerts;
window.searchZone = searchZone;
