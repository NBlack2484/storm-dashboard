// map.js — Leaflet map, layers, markers, and hail swath visualization

let map, markersLayer, hailLayer, warningLayer, activeMarkers = [];

const MARKER_ICONS = {
  tornado: { color: '#dc2626', symbol: '⚡' },
  hail:    { color: '#2563eb', symbol: '●' },
  wind:    { color: '#16a34a', symbol: '~' },
  structural: { color: '#d97706', symbol: '▲' },
};

const HAIL_SWATH_COORDS = [
  [38.85, -90.70], [38.82, -90.60], [38.78, -90.50],
  [38.75, -90.42], [38.72, -90.35], [38.68, -90.28],
  [38.63, -90.20],
];

const WARNING_ZONES = {
  jefferson: [
    [38.52, -91.00], [38.52, -90.30], [38.10, -90.30],
    [38.10, -91.00], [38.52, -91.00]
  ],
  stlouis: [
    [38.80, -90.73], [38.80, -90.18], [38.47, -90.18],
    [38.47, -90.73], [38.80, -90.73]
  ]
};

function initMap(center, zoom) {
  map = L.map('map', {
    center: center,
    zoom: zoom,
    zoomControl: true,
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a> contributors',
    maxZoom: 18,
  }).addTo(map);

  markersLayer = L.layerGroup().addTo(map);
  hailLayer    = L.layerGroup();
  warningLayer = L.layerGroup().addTo(map);

  drawWarningZones();
  return map;
}

function drawWarningZones() {
  warningLayer.clearLayers();

  L.polygon(WARNING_ZONES.jefferson, {
    color: '#dc2626', weight: 1.5, opacity: .6,
    fillColor: '#dc2626', fillOpacity: .05,
    dashArray: '6,4'
  }).bindTooltip('Jefferson County Watch Zone', { sticky: true }).addTo(warningLayer);

  L.polygon(WARNING_ZONES.stlouis, {
    color: '#d97706', weight: 1.5, opacity: .5,
    fillColor: '#d97706', fillOpacity: .04,
    dashArray: '6,4'
  }).bindTooltip('St. Louis County Watch Zone', { sticky: true }).addTo(warningLayer);
}

function drawHailSwath() {
  hailLayer.clearLayers();

  const northEdge = HAIL_SWATH_COORDS.map(([lat, lon]) => [lat + 0.12, lon]);
  const southEdge = HAIL_SWATH_COORDS.map(([lat, lon]) => [lat - 0.06, lon]);
  const swathPoly = [...northEdge, ...southEdge.reverse()];

  L.polygon(swathPoly, {
    color: '#2563eb', weight: 1, opacity: .5,
    fillColor: '#2563eb', fillOpacity: .12,
  }).bindTooltip('Estimated hail swath — up to 1.75" diameter', { sticky: true })
    .addTo(hailLayer);

  HAIL_SWATH_COORDS.forEach(([lat, lon], i) => {
    const size = 1.75 - (i * 0.1);
    L.circle([lat, lon], {
      radius: 2000 + (size * 1500),
      color: '#2563eb', weight: 1, opacity: .4,
      fillColor: '#2563eb', fillOpacity: .15,
    }).bindTooltip(`Hail: ~${size.toFixed(1)}"`, { sticky: true })
      .addTo(hailLayer);
  });
}

function makeIcon(type) {
  const cfg = MARKER_ICONS[type] || MARKER_ICONS.structural;
  return L.divIcon({
    className: '',
    html: `<div style="
      width: 28px; height: 28px;
      background: ${cfg.color};
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      border: 2px solid white;
      box-shadow: 0 2px 4px rgba(0,0,0,.3);
    "></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -30],
  });
}

function addStormMarker(report, onClaudeClick) {
  const marker = L.marker([report.lat, report.lon], { icon: makeIcon(report.type) });

  const popupHtml = `
    <div class="popup-title">${report.location}</div>
    <div class="popup-row">
      <span class="popup-key">Type</span>
      <span class="popup-val">${report.label}</span>
    </div>
    <div class="popup-row">
      <span class="popup-key">Magnitude</span>
      <span class="popup-val">${report.magnitude}</span>
    </div>
    <div class="popup-row">
      <span class="popup-key">Time</span>
      <span class="popup-val">${new Date(report.time).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})}</span>
    </div>
    <div style="font-size:12px;color:#64748b;margin-top:6px;line-height:1.4">${report.detail}</div>
    <button class="popup-btn" onclick="window.__claudeClick('${report.id}')">
      ✦ Generate AI damage summary
    </button>
  `;

  marker.bindPopup(popupHtml, { maxWidth: 240 });
  marker.addTo(markersLayer);
  marker._reportId = report.id;
  activeMarkers.push(marker);

  window.__claudeClick = (id) => {
    map.closePopup();
    if (onClaudeClick) onClaudeClick(id);
  };

  return marker;
}

function addAlertPolygon(alertFeature) {
  if (!alertFeature.geometry) return;
  try {
    const layer = L.geoJSON(alertFeature.geometry, {
      style: {
        color: '#dc2626', weight: 1, opacity: .6,
        fillColor: '#dc2626', fillOpacity: .08,
        dashArray: '4,4',
      }
    });
    layer.bindTooltip(alertFeature.properties?.event || 'Alert', { sticky: true });
    layer.addTo(warningLayer);
  } catch (e) { }
}

function setLayer(layerName) {
  switch (layerName) {
    case 'hail':
      map.addLayer(hailLayer);
      break;
    case 'damage':
      map.removeLayer(hailLayer);
      break;
    case 'warnings':
      if (map.hasLayer(warningLayer)) map.removeLayer(warningLayer);
      else map.addLayer(warningLayer);
      break;
  }
}

function highlightMarker(reportId) {
  activeMarkers.forEach(m => {
    if (m._reportId === reportId) {
      map.setView(m.getLatLng(), 13, { animate: true });
      m.openPopup();
    }
  });
}

function clearMarkers() {
  markersLayer.clearLayers();
  activeMarkers = [];
}

window.MapModule = {
  initMap,
  addStormMarker,
  addAlertPolygon,
  drawHailSwath,
  setLayer,
  highlightMarker,
  clearMarkers,
};
