// archive.js — Storm event archival and auto-clear logic
//
// How it works:
//   1. Each named storm event is stored in localStorage under "storm_archive".
//   2. When the app starts, it checks if the current alerts/SPC feed describes
//      a *different* event than the one currently displayed.
//   3. If so, it prompts the user (or auto-archives after a configurable delay)
//      and resets the map/sidebar for the new event.
//   4. Archived events are accessible from the Archive tab in the sidebar.

const ARCHIVE_KEY = 'storm_dashboard_archive';
const ACTIVE_EVENT_KEY = 'storm_dashboard_active_event';

// An "event" is considered new if:
//   - No active event is stored, OR
//   - The stored event ended more than GAP_HOURS ago AND new severe alerts are present
const GAP_HOURS = 6;

// ── Helpers ──────────────────────────────────────────────────────────────────

function loadArchive() {
  try {
    return JSON.parse(localStorage.getItem(ARCHIVE_KEY) || '[]');
  } catch { return []; }
}

function saveArchive(archive) {
  localStorage.setItem(ARCHIVE_KEY, JSON.stringify(archive));
}

function loadActiveEvent() {
  try {
    return JSON.parse(localStorage.getItem(ACTIVE_EVENT_KEY) || 'null');
  } catch { return null; }
}

function saveActiveEvent(event) {
  localStorage.setItem(ACTIVE_EVENT_KEY, JSON.stringify(event));
}

// ── Core API ─────────────────────────────────────────────────────────────────

/**
 * Snapshot the current dashboard state into an archive entry.
 * @param {object} state - app state (alerts, stormReports, metrics)
 * @param {string} eventName - human-readable label (e.g. "April 17–18 Storm")
 */
function archiveCurrentEvent(state, eventName) {
  const archive = loadArchive();
  const entry = {
    id: `event-${Date.now()}`,
    name: eventName || generateEventName(state),
    archivedAt: new Date().toISOString(),
    alerts: state.alerts || [],
    stormReports: state.stormReports || [],
    metrics: state.metrics || {},
    spcReports: state.spcReports || [],
  };
  archive.unshift(entry); // newest first
  saveArchive(archive);
  console.log(`[Archive] Saved event: ${entry.name}`);
  return entry;
}

/**
 * Auto-generate a name like "Apr 17 Severe Event" from alerts.
 */
function generateEventName(state) {
  const alerts = state.alerts || [];
  if (alerts.length === 0) return `Storm Event — ${formatShortDate(new Date())}`;

  const types = [...new Set(alerts.map(a => a.properties?.event || '').filter(Boolean))];
  const label = types.slice(0, 2).join(' / ') || 'Severe Event';
  return `${label} — ${formatShortDate(new Date())}`;
}

function formatShortDate(d) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Check if incoming alerts represent a new event vs. what's currently displayed.
 * Returns true if dashboard should prompt to archive + reset.
 *
 * Logic:
 *   - If no active event stored → this IS the active event, save it and return false
 *   - If active event's lastSeen was > GAP_HOURS ago AND new alerts are present → new event
 */
function isNewEvent(incomingAlerts) {
  const active = loadActiveEvent();
  if (!active) return false; // First time — nothing to archive

  const lastSeen = new Date(active.lastSeen || active.startedAt);
  const hoursSince = (Date.now() - lastSeen.getTime()) / 3600000;

  // Same event still active — just update lastSeen
  if (hoursSince < GAP_HOURS) return false;

  // It's been a while and new alerts are here → new event
  if (incomingAlerts && incomingAlerts.length > 0) {
    // Confirm the new alerts aren't just the same old fallback data
    const hasRealAlerts = incomingAlerts.some(a => !a.id?.startsWith('fa'));
    if (hasRealAlerts) return true;
  }
  return false;
}

/**
 * Update the "last seen" timestamp on the active event.
 */
function touchActiveEvent(alerts) {
  const active = loadActiveEvent() || {
    id: `active-${Date.now()}`,
    startedAt: new Date().toISOString(),
  };
  active.lastSeen = new Date().toISOString();
  active.alertCount = (alerts || []).length;
  saveActiveEvent(active);
}

/**
 * Archive current event and reset app state for a new storm.
 * Calls the provided callbacks to update the UI.
 *
 * @param {object} currentState - full app state to archive
 * @param {function} onArchived - called with the archive entry after saving
 * @param {function} onReset - called to reset the map/sidebar
 */
function archiveAndReset(currentState, onArchived, onReset) {
  const entry = archiveCurrentEvent(currentState, currentState.eventName);
  saveActiveEvent({
    id: `active-${Date.now()}`,
    startedAt: new Date().toISOString(),
    lastSeen: new Date().toISOString(),
  });

  if (typeof onArchived === 'function') onArchived(entry);
  if (typeof onReset === 'function') onReset();
  return entry;
}

/**
 * Get all archived events, newest first.
 */
function getArchivedEvents() {
  return loadArchive();
}

/**
 * Load a specific archived event by ID.
 */
function getArchivedEvent(id) {
  return loadArchive().find(e => e.id === id) || null;
}

/**
 * Delete an archived event by ID.
 */
function deleteArchivedEvent(id) {
  const archive = loadArchive().filter(e => e.id !== id);
  saveArchive(archive);
}

/**
 * Clear all archived events.
 */
function clearAllArchives() {
  saveArchive([]);
}

// ── Sidebar archive tab renderer ─────────────────────────────────────────────

/**
 * Render the archive list into a container element.
 * @param {string} containerId - DOM element ID
 * @param {function} onLoad - called with archived event object when user clicks Load
 */
function renderArchiveTab(containerId, onLoad) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const events = getArchivedEvents();

  if (events.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="icon">📂</div>
        <div>No archived events yet.</div>
        <div style="font-size:11px;margin-top:4px;color:#94a3b8">
          Past storm events will appear here automatically.
        </div>
      </div>`;
    return;
  }

  container.innerHTML = events.map(ev => `
    <div class="archive-item" data-id="${ev.id}">
      <div class="archive-name">${ev.name}</div>
      <div class="archive-meta">
        ${ev.stormReports?.length || 0} reports · 
        ${ev.alerts?.length || 0} alerts · 
        Archived ${formatRelative(new Date(ev.archivedAt))}
      </div>
      <div class="archive-actions">
        <button class="ai-btn archive-load-btn" data-id="${ev.id}">Load</button>
        <button class="ai-btn archive-delete-btn" data-id="${ev.id}" 
          style="color:#dc2626;border-color:#fecaca">Delete</button>
      </div>
    </div>
  `).join('');

  // Wire buttons
  container.querySelectorAll('.archive-load-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const ev = getArchivedEvent(btn.dataset.id);
      if (ev && typeof onLoad === 'function') onLoad(ev);
    });
  });

  container.querySelectorAll('.archive-delete-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (confirm('Delete this archived event?')) {
        deleteArchivedEvent(btn.dataset.id);
        renderArchiveTab(containerId, onLoad);
      }
    });
  });
}

function formatRelative(date) {
  const diff = Date.now() - date.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

// ── Archive the built-in April 17–18 event on first load ─────────────────────

/**
 * Seeds the April 17–18 storm as a pre-loaded archive entry if no archive exists.
 * This ensures users always have one event in the archive tab as an example.
 * @param {object} stormReports - from AlertsModule.STORM_REPORTS
 * @param {object} fallbackAlerts - from AlertsModule.FALLBACK_ALERTS
 */
function seedAprilEvent(stormReports, fallbackAlerts) {
  const archive = loadArchive();
  const alreadySeeded = archive.some(e => e.id === 'event-april-17-2026');
  if (alreadySeeded) return;

  const entry = {
    id: 'event-april-17-2026',
    name: 'April 17–18 2026 Severe Storm — Jefferson County',
    archivedAt: '2026-04-18T12:00:00.000Z',
    alerts: fallbackAlerts || [],
    stormReports: stormReports || [],
    spcReports: [],
    metrics: {
      warnings: 4,
      reports: 9,
      maxHail: '1.75"',
      peakWind: '80 mph',
      outages: '50K+',
    },
  };
  archive.push(entry);
  saveArchive(archive);
  console.log('[Archive] Seeded April 17–18 event');
}

window.ArchiveModule = {
  archiveCurrentEvent,
  archiveAndReset,
  isNewEvent,
  touchActiveEvent,
  getArchivedEvents,
  getArchivedEvent,
  deleteArchivedEvent,
  clearAllArchives,
  renderArchiveTab,
  seedAprilEvent,
};
