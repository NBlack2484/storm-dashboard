// alerts.js — Live NWS alert fetching and storm report management

const NWS_BASE = 'https://api.weather.gov';

const STORM_REPORTS = [
  {
    id: 'sr1', type: 'structural', badge: 'badge-struct', label: 'Structural',
    location: 'Arnold — Jeffco Blvd', lat: 38.431, lon: -90.378,
    magnitude: 'Roof collapse', detail: 'Several buildings with major structural damage. Jeffco Blvd closed between Hwy 141 and Plaza Dr.',
    time: '2026-04-17T22:15:00', source: 'KFMO News / Jefferson County Emergency Mgmt'
  },
  {
    id: 'sr2', type: 'structural', badge: 'badge-struct', label: 'Structural',
    location: 'Imperial — Old Lemay Ferry Rd', lat: 38.369, lon: -90.395,
    magnitude: 'Home collapses', detail: 'Several homes suffered structural collapses and severe roof damage.',
    time: '2026-04-17T22:30:00', source: 'Jefferson County Emergency Mgmt'
  },
  {
    id: 'sr3', type: 'structural', badge: 'badge-struct', label: 'Structural',
    location: 'Hillsboro — Clayton Husky Rd', lat: 38.232, lon: -90.563,
    magnitude: '8–9 structures', detail: 'Klondike/Clayton Husky Road area — 8–9 structures with varying levels of structural damage.',
    time: '2026-04-17T22:45:00', source: 'Jefferson County Emergency Mgmt'
  },
  {
    id: 'sr4', type: 'hail', badge: 'badge-hail', label: 'Hail',
    location: 'NW St. Louis County', lat: 38.720, lon: -90.490,
    magnitude: '1.75" (golf ball)', detail: 'Hail up to 1.75 inches diameter. Widespread vehicle and roof damage reported.',
    time: '2026-04-17T22:05:00', source: 'NWS Storm Prediction Center'
  },
  {
    id: 'sr5', type: 'hail', badge: 'badge-hail', label: 'Hail',
    location: 'Bridgeton / St. Ann', lat: 38.763, lon: -90.429,
    magnitude: '1.5" (ping pong)', detail: 'Large hail causing vehicle dents and broken windshields across the Bridgeton area.',
    time: '2026-04-17T22:10:00', source: 'NWS mPING / Trained Spotter'
  },
  {
    id: 'sr6', type: 'hail', badge: 'badge-hail', label: 'Hail',
    location: 'Jefferson County (north)', lat: 38.420, lon: -90.510,
    magnitude: '1.0" (quarter)', detail: 'Quarter-sized hail reported across northern Jefferson County.',
    time: '2026-04-17T22:20:00', source: 'NWS mPING'
  },
  {
    id: 'sr7', type: 'wind', badge: 'badge-wind', label: 'Wind',
    location: 'St. Louis Metro (NW)', lat: 38.750, lon: -90.460,
    magnitude: '80 mph gusts', detail: 'Damaging straight-line wind gusts reaching 65–80 mph. Trees and power lines downed across northwestern St. Louis.',
    time: '2026-04-17T22:00:00', source: 'SPC Mesoscale Discussion 486'
  },
  {
    id: 'sr8', type: 'wind', badge: 'badge-wind', label: 'Wind',
    location: 'Arnold / Mehlville', lat: 38.450, lon: -90.380,
    magnitude: '65–70 mph', detail: 'Widespread tree damage and power outages. 50,000+ customers without power across MO/IL.',
    time: '2026-04-17T22:25:00', source: 'Ameren MO / Emergency Dispatch'
  },
  {
    id: 'sr9', type: 'tornado', badge: 'badge-tornado', label: 'Tornado',
    location: 'NW St. Louis County', lat: 38.730, lon: -90.500,
    magnitude: 'Brief spin-up', detail: 'Brief spin-up tornado possible in organized storm cluster. NWS storm survey pending.',
    time: '2026-04-17T22:08:00', source: 'NWS Tornado Watch 131'
  },
];

const FALLBACK_ALERTS = [
  {
    id: 'fa1',
    properties: {
      event: 'Tornado Watch',
      severity: 'Severe',
      areaDesc: 'Jefferson County, St. Louis County, St. Louis City',
      headline: 'Tornado Watch issued April 17 at 9:45PM CDT until 11:00PM CDT',
      description: 'Tornado Watch #131. An organized cluster of storms bearing down on St. Louis area counties. Damaging surface wind gusts reaching 65 to 80 mph, hail up to 1.75 inches in diameter, and the possibility of brief spin-up tornadoes.',
      effective: '2026-04-17T21:45:00-05:00',
      expires: '2026-04-17T23:00:00-05:00',
    }
  },
  {
    id: 'fa2',
    properties: {
      event: 'Severe Thunderstorm Warning',
      severity: 'Severe',
      areaDesc: 'Jefferson County, Franklin County',
      headline: 'Severe Thunderstorm Warning — 80 mph winds, 1.75" hail',
      description: 'At 10:00 PM CDT, a severe thunderstorm was located near Arnold, moving east at 55 mph. Hazards: 80 mph wind gusts and golf ball size hail. Locations impacted include Arnold, Hillsboro, Imperial, Festus, and Crystal City.',
      effective: '2026-04-17T22:00:00-05:00',
      expires: '2026-04-17T22:45:00-05:00',
    }
  },
  {
    id: 'fa3',
    properties: {
      event: 'Tornado Warning',
      severity: 'Extreme',
      areaDesc: 'Northern St. Louis County',
      headline: 'Tornado Warning — radar indicated rotation near Bridgeton',
      description: 'At 10:08 PM CDT, a severe thunderstorm capable of producing a tornado was located near Bridgeton, moving east at 60 mph. Take cover now. Move to an interior room on the lowest floor of a sturdy building.',
      effective: '2026-04-17T22:08:00-05:00',
      expires: '2026-04-17T22:30:00-05:00',
    }
  },
  {
    id: 'fa4',
    properties: {
      event: 'Flash Flood Watch',
      severity: 'Moderate',
      areaDesc: 'Jefferson County, St. Louis County, St. Louis City, St. Charles County',
      headline: 'Flash Flood Watch in effect through Saturday morning',
      description: 'Flash flooding is possible due to heavy rainfall of 2 to 3 inches with locally higher amounts possible. Small streams and low water crossings may flood rapidly.',
      effective: '2026-04-17T20:00:00-05:00',
      expires: '2026-04-18T12:00:00-05:00',
    }
  },
];

function getEventClass(event) {
  if (!event) return 'severe';
  const e = event.toLowerCase();
  if (e.includes('tornado')) return 'tornado';
  if (e.includes('hail')) return 'hail';
  if (e.includes('wind') || e.includes('thunderstorm')) return 'severe';
  if (e.includes('flood')) return 'flood';
  return 'severe';
}

function getSeverityClass(severity) {
  if (!severity) return 'sev-moderate';
  switch (severity.toLowerCase()) {
    case 'extreme': return 'sev-extreme';
    case 'severe':  return 'sev-severe';
    case 'moderate': return 'sev-moderate';
    default: return 'sev-minor';
  }
}

function formatAlertTime(dateStr) {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true
    });
  } catch { return dateStr; }
}

async function fetchLiveAlerts(zones) {
  const zoneStr = zones.join(',');
  try {
    const res = await fetch(`${NWS_BASE}/alerts/active?zone=${zoneStr}`, {
      headers: { 'Accept': 'application/geo+json', 'User-Agent': 'StormDashboard/1.0 (educational)' }
    });
    if (!res.ok) throw new Error(`NWS API ${res.status}`);
    const data = await res.json();
    return { alerts: data.features || [], live: true };
  } catch (err) {
    console.warn('NWS API unavailable, using event data:', err.message);
    return { alerts: FALLBACK_ALERTS, live: false };
  }
}

async function fetchPointForecast(lat, lon) {
  try {
    const meta = await fetch(`${NWS_BASE}/points/${lat},${lon}`, {
      headers: { 'User-Agent': 'StormDashboard/1.0' }
    });
    if (!meta.ok) throw new Error('points failed');
    const metaData = await meta.json();
    const forecastUrl = metaData.properties.forecast;
    const fcRes = await fetch(forecastUrl, { headers: { 'User-Agent': 'StormDashboard/1.0' } });
    if (!fcRes.ok) throw new Error('forecast failed');
    const fcData = await fcRes.json();
    return fcData.properties.periods.slice(0, 3);
  } catch (err) {
    console.warn('Forecast fetch failed:', err.message);
    return null;
  }
}

window.AlertsModule = {
  STORM_REPORTS,
  FALLBACK_ALERTS,
  getEventClass,
  getSeverityClass,
  formatAlertTime,
  fetchLiveAlerts,
  fetchPointForecast,
};
