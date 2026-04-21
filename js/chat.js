;(function () {
// chat.js — Storm dashboard chat interface
// Works with or without an API key.
// No API key = demo mode with canned answers about the April 17-18 event.
// With API key = live Claude responses with full storm data context.

const CHAT_ENDPOINT = 'https://api.anthropic.com/v1/messages';
const CHAT_MODEL    = 'claude-sonnet-4-20250514';

let _apiKey  = null;
let _history = [];   // [{role, content}]
let _busy    = false;
let _ctx     = { alerts: [], stormReports: [], spcReports: [], metrics: {} };

// ── System prompt built from live dashboard data ──────────────────────────────

function buildSystem() {
  const alerts = (_ctx.alerts || []).slice(0, 6).map(a => {
    const p = a.properties || {};
    return `- ${p.event || '?'} (${p.severity || '?'}): ${p.areaDesc || '?'}`;
  }).join('\n') || 'None';

  const reports = [...(_ctx.stormReports || []), ...(_ctx.spcReports || [])]
    .slice(0, 20)
    .map(r => `- ${(r.type || r.label || '?').toUpperCase()} | ${r.location} | ${r.magnitude} | ${r.detail}`)
    .join('\n') || 'None';

  const m = _ctx.metrics || {};
  return [
    'You are an emergency management assistant for the Jefferson County & St. Louis storm dashboard.',
    '',
    'STORM DATA:',
    `Active alerts: ${m.warnings || 0} | Max hail: ${m.maxHail || 'N/A'} | Peak wind: ${m.peakWind || 'N/A'} | Outages: ${m.outages || 'N/A'}`,
    '',
    'ALERTS:', alerts,
    '',
    'STORM REPORTS:', reports,
    '',
    'Answer concisely. Reference specific streets and locations from the data. For insurance questions give actionable steps.',
  ].join('\n');
}

// ── API call ──────────────────────────────────────────────────────────────────

async function callAPI(message) {
  _history.push({ role: 'user', content: message });
  if (_history.length > 20) _history = _history.slice(-20);

  const res = await fetch(CHAT_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': _apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: CHAT_MODEL,
      max_tokens: 600,
      system: buildSystem(),
      messages: _history,
    }),
  });

  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error?.message || `API error ${res.status}`);
  }

  const data = await res.json();
  const reply = data.content?.[0]?.text || 'No response.';
  _history.push({ role: 'assistant', content: reply });
  return reply;
}

// ── Demo responses (no API key) ───────────────────────────────────────────────

function demoResponse(msg) {
  const q = msg.toLowerCase();
  if (q.includes('arnold') && (q.includes('hail') || q.includes('street') || q.includes('damage'))) {
    return 'Arnold\'s hail damage was concentrated along **Jeffco Blvd** between Hwy 141 and Plaza Dr, where golf ball-sized hail (1.75") caused widespread roof and vehicle damage. The area also sustained 80 mph straight-line winds causing structural collapses. Jeffco Blvd was closed following the storm.';
  }
  if (q.includes('hail')) {
    return 'The largest hail — **1.75" (golf ball)** — hit NW St. Louis County, Bridgeton, and St. Ann around 10:05 PM. Northern Jefferson County received **1.0" (quarter size)**. The hail swath runs SW to NE. At 1.75", expect cracked shingles, dented metal, broken skylights, and vehicle body damage.';
  }
  if (q.includes('structural') || q.includes('collapse') || q.includes('most damage') || q.includes('worst')) {
    return 'Three areas had the highest structural damage:\n\n• **Arnold — Jeffco Blvd**: Roof collapses, road closed between Hwy 141 and Plaza Dr\n• **Imperial — Old Lemay Ferry Rd**: Several home structural collapses — worst residential count in the county\n• **Hillsboro — Clayton Husky Rd**: 8–9 structures damaged in the Klondike/Clayton Husky corridor';
  }
  if (q.includes('insurance') || q.includes('claim')) {
    return 'For April 17–18 Jefferson County claims:\n\n• Document all damage with timestamped photos **before** any cleanup\n• File promptly — claim volumes are high\n• Structural damage → dwelling coverage; get engineer inspection before re-entry\n• Hail (1.75") → qualifies for full roof replacement under RCV policies\n• Vehicles → comprehensive auto, not collision\n• Call Jefferson County EM: **636-797-6450** to get on the official damage registry';
  }
  if (q.includes('wind') || q.includes('speed') || q.includes('gust') || q.includes('outage')) {
    return 'Peak gusts hit **80 mph** across NW St. Louis Metro and Arnold/Mehlville around 10 PM — borderline EF1 equivalent for straight-line wind. Over **50,000 customers** lost power across MO and IL. Ameren MO handled Missouri restoration. Primary damage: downed lines and uprooted trees.';
  }
  if (q.includes('imperial') || q.includes('lemay')) {
    return '**Old Lemay Ferry Road** in Imperial had the worst per-street residential damage in Jefferson County — several homes suffered structural collapses and severe roof damage. Document damage and contact Jefferson County Emergency Management at 636-797-6450 to get on the official damage registry before filing your insurance claim.';
  }
  if (q.includes('hillsboro') || q.includes('husky') || q.includes('klondike')) {
    return 'The **Clayton Husky Road / Klondike Road** area in Hillsboro had 8–9 structures with varying levels of structural damage. This was the widest geographic spread of structural damage in the county, though individual structure severity was lower than Arnold or Imperial.';
  }
  if (q.includes('compare') || q.includes('vs') || q.includes('versus')) {
    return 'Damage zone comparison:\n\n• **Arnold (Jeffco Blvd)** — Structural + 80 mph wind. Commercial and road impact. Road closed.\n• **Imperial (Old Lemay Ferry)** — Structural collapses. Highest residential home count.\n• **Hillsboro (Clayton Husky)** — 8–9 structures. Widest geographic area.\n• **NW St. Louis County** — 1.75" hail swath, 80 mph gusts, possible tornado.';
  }
  if (q.includes('tornado')) {
    return 'A brief spin-up tornado was possible in NW St. Louis County around 10:08 PM during the organized storm cluster. NWS Tornado Watch #131 was in effect. An official NWS storm survey was pending as of the April 18 event summary.';
  }
  return 'Based on the April 17–18 storm data: the event produced 80 mph winds, 1.75" hail, and structural damage across Arnold, Imperial, and Hillsboro — 9 storm reports total. Ask me about a specific location, damage type, insurance guidance, or area comparison.';
}

// ── UI helpers ────────────────────────────────────────────────────────────────

function addMsg(role, html) {
  const log = document.getElementById('chat-log');
  if (!log) return;
  const wrap = document.createElement('div');
  wrap.className = `chat-msg chat-msg-${role}`;
  wrap.dataset.role = role;
  wrap.innerHTML = `<div class="chat-bubble chat-bubble-${role}">${html}</div>`;
  log.appendChild(wrap);
  log.scrollTop = log.scrollHeight;
  return wrap;
}

function addLoading() {
  const log = document.getElementById('chat-log');
  if (!log) return null;
  const wrap = document.createElement('div');
  wrap.className = 'chat-msg chat-msg-assistant';
  wrap.dataset.role = 'assistant';
  wrap.id = 'chat-loading-msg';
  wrap.innerHTML = `<div class="chat-bubble chat-bubble-assistant chat-loading">
    <span class="chat-dot"></span><span class="chat-dot"></span><span class="chat-dot"></span>
  </div>`;
  log.appendChild(wrap);
  log.scrollTop = log.scrollHeight;
  return wrap;
}

function removeLoading() {
  const el = document.getElementById('chat-loading-msg');
  if (el) el.remove();
}

function md(text) {
  // Simple markdown: bold, bullets, tables, newlines
  let out = text;
  // Tables
  out = out.replace(/^\|(.+)\|$/gm, row => {
    const cells = row.split('|').filter(c => c.trim());
    if (cells.every(c => /^[\s\-:]+$/.test(c))) return '';
    return `<tr>${cells.map(c => `<td>${c.trim()}</td>`).join('')}</tr>`;
  });
  out = out.replace(/((<tr>[\s\S]*?<\/tr>\n?)+)/g, m => `<table class="chat-table">${m}</table>`);
  out = out.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/^[•\-\*] (.+)$/gm, '<div class="chat-bullet">• $1</div>');
  out = out.replace(/\n/g, '<br>');
  return out;
}

// ── Send handler ──────────────────────────────────────────────────────────────

async function send() {
  if (_busy) return;

  const input = document.getElementById('chat-input');
  if (!input) return;

  const msg = input.value.trim();
  if (!msg) return;

  input.value = '';
  _busy = true;

  // Show user message
  addMsg('user', md(msg));

  // Show loading dots
  addLoading();

  try {
    let reply;
    if (!_apiKey || _apiKey === 'YOUR_ANTHROPIC_API_KEY_HERE') {
      // Demo mode — simulate delay
      await new Promise(r => setTimeout(r, 700));
      reply = demoResponse(msg);
    } else {
      reply = await callAPI(msg);
    }
    removeLoading();
    addMsg('assistant', md(reply));
  } catch (err) {
    removeLoading();
    addMsg('assistant', `<span style="color:#dc2626">Error: ${err.message}</span>`);
  }

  _busy = false;
}

// ── Init ──────────────────────────────────────────────────────────────────────

function initChat(apiKey) {
  _apiKey = apiKey;
  _history = [];
  _busy = false;
  // Button wiring is handled via onclick attributes in HTML
  // so it works regardless of panel visibility at load time
}

function clearChat() {
  _history = [];
  const log = document.getElementById('chat-log');
  if (log) log.innerHTML = '';
  appendWelcomeMessage();
}

function appendWelcomeMessage() {
  const log = document.getElementById('chat-log');
  if (!log) return;
  const wrap = document.createElement('div');
  wrap.className = 'chat-msg chat-msg-assistant';
  wrap.innerHTML = `<div class="chat-bubble chat-bubble-assistant chat-welcome">
    <strong>Storm Assistant ready.</strong><br>
    Ask about damage locations, insurance claims, hail or wind data, or use the quick buttons above.
  </div>`;
  log.appendChild(wrap);
}

function updateChatContext(ctx) {
  Object.assign(_ctx, ctx);
}

// ── Export ────────────────────────────────────────────────────────────────────

window.ChatModule = { initChat, updateChatContext, clearChat, appendWelcomeMessage };

// Global handlers called directly from HTML onclick attributes
window.chatSend = send;
window.chatClear = clearChat;
window.chatChip = function(el) {
  var inp = document.getElementById('chat-input');
  if (inp) { inp.value = el.dataset.q || el.textContent.trim(); send(); }
};

})();
