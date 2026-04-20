# Storm Dashboard — Jefferson County & St. Louis

Live severe weather alert dashboard with AI-powered damage summaries for Jefferson County and surrounding St. Louis area.

## Features

- **Live NWS alerts** — real-time severe weather warnings pulled from `api.weather.gov`
- **Interactive Leaflet map** — storm damage markers, hail swath visualization, warning zone overlays
- **Storm reports** — April 17–18, 2026 event data with precise location coordinates
- **Claude AI summaries** — click any map marker to generate a damage assessment and insurance guidance
- **Area briefing** — one-click executive summary for all active alerts and reports
- **Auto-refresh** — alerts update every 5 minutes automatically

---

## Setup

### 1. Clone the repo

```bash
git clone https://github.com/YOUR_USERNAME/storm-dashboard.git
cd storm-dashboard
```

### 2. Add your Claude API key

```bash
cp config.example.js config.js
```

Open `config.js` and replace `YOUR_ANTHROPIC_API_KEY_HERE` with your key from [console.anthropic.com](https://console.anthropic.com).

```javascript
const CONFIG = {
  CLAUDE_API_KEY: 'sk-ant-...',   // ← your key here
  WATCH_ZONES: ['MOC099', 'MOC189', 'MOC510', 'MOC183'],
  MAP_CENTER: [38.25, -90.55],
  MAP_ZOOM: 10,
  REFRESH_INTERVAL: 300000,
};
```

> ⚠️ `config.js` is in `.gitignore` — it will never be committed. Do NOT commit your API key.

### 3. Open locally

No build step needed. Just open `index.html` in your browser:

```bash
open index.html
# or on Windows:
start index.html
```

---

## Deploy to GitHub Pages

### Option A — Quick (repo is private)

1. Push to GitHub
2. Go to **Settings → Pages**
3. Source: **Deploy from a branch** → `main` → `/ (root)`
4. Your dashboard will be live at `https://YOUR_USERNAME.github.io/storm-dashboard`

> Since `config.js` is gitignored, the deployed version will run without an API key — the Claude AI features will use demo responses. The NWS alerts and map work without a key.

### Option B — With API key (private repo only)

If your repo is **private**, you can safely keep `config.js` in the repo by removing it from `.gitignore`. Never do this with a public repo.

### Option C — Serverless proxy (recommended for public repos)

Use a Cloudflare Worker or Netlify Function to proxy Claude API calls so your key never touches the client:

```javascript
// Cloudflare Worker example (workers.dev — free tier)
export default {
  async fetch(request) {
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
    const body = await request.json();
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CLAUDE_API_KEY,  // stored as Worker secret
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });
    return new Response(await res.text(), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
};
```

Then in `claude.js`, replace `CLAUDE_ENDPOINT` with your Worker URL.

---

## NWS Zone Codes

Add zones to `WATCH_ZONES` in `config.js`:

| County | Zone Code |
|--------|-----------|
| Jefferson County, MO | `MOC099` |
| St. Louis County, MO | `MOC189` |
| St. Louis City, MO | `MOC510` |
| St. Charles County, MO | `MOC183` |
| Franklin County, MO | `MOC071` |
| Washington County, MO | `MOC221` |

Find any zone at [alerts.weather.gov](https://alerts.weather.gov/search).

---

## Customizing Watch Areas

Edit `MAP_CENTER` and `MAP_ZOOM` in `config.js` to reposition the map:

```javascript
MAP_CENTER: [38.25, -90.55],  // [lat, lon] — currently Hillsboro, MO
MAP_ZOOM: 10,                  // 10 = county level, 12 = city level
```

Edit `WARNING_ZONES` in `js/map.js` to adjust the watch zone boundary polygons.

---

## File Structure

```
storm-dashboard/
├── index.html              Main app
├── config.example.js       API key template (safe to commit)
├── config.js               Your keys (gitignored — never commit)
├── .gitignore
├── README.md
├── css/
│   └── style.css           All styles
└── js/
    ├── alerts.js           NWS API + storm report data
    ├── map.js              Leaflet map + markers + layers
    ├── claude.js           Claude API integration
    └── app.js              Main controller + state
```

---

## Data Sources

- **NWS Alerts API** — `api.weather.gov` (free, no key required)
- **Storm reports** — NWS Storm Prediction Center, KFMO News, Jefferson County Emergency Management
- **Hail swath** — estimated from SPC Mesoscale Discussion 486 (April 17, 2026)
- **AI summaries** — Anthropic Claude (API key required)

---

## License

MIT — free to use and modify.
