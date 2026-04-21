;(function() {
// chat.js — Conversational chat interface powered by Claude AI
// Users can ask natural language questions about active alerts, storm reports,
// damage locations, insurance guidance, and more.

const CHAT_MODEL = 'claude-sonnet-4-20250514';
const CHAT_ENDPOINT = 'https://api.anthropic.com/v1/messages';

// Keep a rolling conversation history for multi-turn context
let _chatHistory = [];
let _chatOpen = false;
let _apiKey = null;

// Current dashboard context injected into every system prompt
let _dashboardContext = {
  alerts: [],
  stormReports: [],
  spcReports: [],
  metrics: {},
  archivedEvents: [],
};

// ── Context builder ───────────────────────────────────────────────────────────

function buildSystemPrompt(ctx) {
  const alertSummary = (ctx.alerts || []).slice(0, 6).map(a => {
    const p = a.properties;
    return `- ${p.event} (${p.severity}): ${p.areaDesc}`;
  }).join('\n') || 'No active NWS alerts in watch zones.';

  const reportSummary = [...(ctx.stormReports || []), ...(ctx.spcReports || [])]
    .slice(0, 20)
    .map(r => `- ${r.type?.toUpperCase() || r.label} | ${r.location} | ${r.magnitude} | ${r.detail}`)
    .join('\n') || 'No storm reports loaded.';

  const metrics = ctx.metrics || {};

  return `You are an emergency management and insurance guidance assistant embedded in a live storm dashboard for Jefferson County and St. Louis, Missouri.

You have access to real-time storm data. Use it to give specific, location-accurate answers.

CURRENT DASHBOARD METRICS:
- Active NWS alerts: ${metrics.warnings || 0}
- Storm reports on map: ${metrics.reports || 0}
- Max hail: ${metrics.maxHail || 'N/A'}
- Peak wind: ${metrics.peakWind || 'N/A'}
- Power outages: ${metrics.outages || 'Unknown'}

ACTIVE NWS ALERTS:
${alertSummary}

STORM REPORTS (all plotted locations):
${reportSummary}

INSTRUCTIONS:
- Answer in plain, direct language — no excessive preamble
- When asked about locations, reference actual street names and areas from the data above
- For insurance questions, give actionable, specific guidance (coverage types, documentation steps, adjuster tips)
- If asked to compare areas, pull exact magnitudes and damage types from the report data
- Keep responses concise: 3–6 sentences or a short bulleted list unless detail is explicitly requested
- If you don't have specific data for a question, say so clearly rather than guessing
- You can answer follow-up questions — the conversation history is maintained`;
}

// ── Claude API call ───────────────────────────────────────────────────────────

async function sendChatMessage(userMessage) {
  if (!_apiKey || _apiKey === 'YOUR_ANTHROPIC_API_KEY_HERE') {
    return simulateChatResponse(userMessage);
  }

  _chatHistory.push({ role: 'user', content: userMessage });

  // Keep history bounded (last 12 turns = 24 messages)
  if (_chatHistory.length > 24) _chatHistory = _chatHistory.slice(-24);

  try {
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
        system: buildSystemPrompt(_dashboardContext),
        messages: _chatHistory,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `API error ${res.status}`);
    }

    const data = await res.json();
    const reply = data.content?.[0]?.text || 'No response received.';
    _chatHistory.push({ role: 'assistant', content: reply });
    return reply;
  } catch (err) {
    // Remove the user message we added so history stays clean on retry
    _chatHistory.pop();
    throw err;
  }
}

// ── Demo fallback ─────────────────────────────────────────────────────────────

function simulateChatResponse(msg) {
  const lower = msg.toLowerCase();
  return new Promise(resolve => {
    setTimeout(() => {
      if (lower.includes('structural') || lower.includes('worst') || lower.includes('most damage')) {
        resolve(`The highest concentration of structural damage is in three areas:

• **Arnold — Jeffco Blvd**: Roof collapses and structural failures along Jeffco Blvd between Hwy 141 and Plaza Dr. Road closed.
• **Imperial — Old Lemay Ferry Rd**: Several home structural collapses, worst in the county by home count.
• **Hillsboro — Clayton Husky Rd**: 8–9 structures with varying structural damage in the Klondike/Clayton Husky Rd corridor.

Arnold and Imperial took the worst of the 80 mph straight-line winds.`);
      } else if (lower.includes('insurance') || lower.includes('claim')) {
        resolve(`For Jefferson County claims from the April 17–18 event:

• **File promptly** — claim volumes are high, early filing means faster adjuster scheduling
• **Document everything before cleanup** — timestamped photos/video of all damage
• **Structural damage**: Covered under dwelling coverage; request a structural engineer inspection before entering compromised buildings
• **Hail (1.75")**: Qualifies for roof replacement under most RCV policies; get 3 contractor bids
• **Vehicles**: File under comprehensive auto — this storm qualifies as a weather event, not collision
• Jefferson County Emergency Management: 636-797-6450 for official damage documentation`);
      } else if (lower.includes('hail')) {
        resolve(`The largest hail — **1.75" (golf ball size)** — hit NW St. Louis County, Bridgeton, and St. Ann around 10:05–10:10 PM. Northern Jefferson County received **1.0" (quarter size)** hail. The hail swath runs roughly SW to NE from St. Louis County through the metro corridor. At 1.75", expect dented metal roofing, cracked shingles, broken skylights, and significant vehicle body damage.`);
      } else if (lower.includes('wind') || lower.includes('outage')) {
        resolve(`Peak wind gusts of **80 mph** were recorded across NW St. Louis Metro, with 65–70 mph gusts through Arnold and Mehlville. These are borderline EF1 tornado-equivalent winds for straight-line damage. Over **50,000 customers** lost power across MO, IL, and surrounding states — Ameren MO handled the bulk of Missouri restoration. Downed lines and uprooted trees were the primary mechanism.`);
      } else if (lower.includes('compare') || lower.includes('arnold') || lower.includes('hillsboro') || lower.includes('imperial')) {
        resolve(`Comparing the three main damage zones:

| Location | Type | Severity |
|---|---|---|
| Arnold — Jeffco Blvd | Structural + Wind | Roof collapse, road closed |
| Imperial — Old Lemay Ferry Rd | Structural | Home collapses, worst residential impact |
| Hillsboro — Clayton Husky Rd | Structural | 8–9 structures, spread over wider area |

Imperial had the highest per-street home damage count; Arnold had the most commercial/road impact; Hillsboro had the widest geographic spread.`);
      } else {
        resolve(`Based on the April 17–18 storm data for Jefferson County and St. Louis:

The event produced 80 mph winds, 1.75" hail, and structural damage across Arnold, Imperial, and Hillsboro. Nine storm reports are plotted on the map covering structural, hail, wind, and tornado threat. Is there a specific area or type of damage you'd like more detail on?`);
      }
    }, 900);
  });
}

// ── DOM / UI ──────────────────────────────────────────────────────────────────

function initChat(apiKey, containerId) {
  _apiKey = apiKey;
  _chatHistory = [];

  // Wire send button and enter key
  const input = document.getElementById('chat-input');
  const sendBtn = document.getElementById('chat-send-btn');

  if (sendBtn) sendBtn.addEventListener('click', handleSend);
  if (input) {
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
    });
  }

  // Wire suggestion chips
  document.querySelectorAll('.chat-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const input = document.getElementById('chat-input');
      if (input) { input.value = chip.dataset.q || chip.textContent; handleSend(); }
    });
  });

  // Wire clear button
  const clearBtn = document.getElementById('chat-clear-btn');
  if (clearBtn) clearBtn.addEventListener('click', clearChat);
}

async function handleSend() {
  const input = document.getElementById('chat-input');
  const msg = input?.value?.trim();
  if (!msg) return;

  input.value = '';
  appendMessage('user', msg);
  appendMessage('assistant', null); // loading placeholder

  try {
    const reply = await sendChatMessage(msg);
    replaceLastAssistantMessage(reply);
  } catch (err) {
    replaceLastAssistantMessage(`Error: ${err.message}`);
  }
}

function appendMessage(role, text) {
  const log = document.getElementById('chat-log');
  if (!log) return;

  const div = document.createElement('div');
  div.className = `chat-msg chat-msg-${role}`;
  div.dataset.role = role;

  if (text === null) {
    // Loading state
    div.innerHTML = `<div class="chat-bubble chat-bubble-${role} chat-loading">
      <span class="chat-dot"></span><span class="chat-dot"></span><span class="chat-dot"></span>
    </div>`;
  } else {
    div.innerHTML = `<div class="chat-bubble chat-bubble-${role}">${formatChatMarkdown(text)}</div>`;
  }

  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

function replaceLastAssistantMessage(text) {
  const log = document.getElementById('chat-log');
  if (!log) return;
  const last = log.querySelector('[data-role="assistant"]:last-child');
  if (last) {
    last.innerHTML = `<div class="chat-bubble chat-bubble-assistant">${formatChatMarkdown(text)}</div>`;
  } else {
    appendMessage('assistant', text);
  }
  log.scrollTop = log.scrollHeight;
}

function clearChat() {
  _chatHistory = [];
  const log = document.getElementById('chat-log');
  if (log) log.innerHTML = '';
  appendWelcomeMessage();
}

function appendWelcomeMessage() {
  const log = document.getElementById('chat-log');
  if (!log) return;
  const div = document.createElement('div');
  div.className = 'chat-msg chat-msg-assistant';
  div.innerHTML = `<div class="chat-bubble chat-bubble-assistant chat-welcome">
    <strong>Storm Assistant ready.</strong><br>
    Ask me about damage locations, insurance claims, hail/wind data, or area comparisons.
  </div>`;
  log.appendChild(div);
}

/** Light markdown → HTML: bold, bullets, tables */
function formatChatMarkdown(text) {
  return text
    // Tables — basic pipe tables
    .replace(/^\|(.+)\|$/gm, row => {
      const cells = row.split('|').filter(Boolean).map(c => c.trim());
      if (cells.every(c => /^[-:]+$/.test(c))) return ''; // separator row
      return `<tr>${cells.map(c => `<td>${c}</td>`).join('')}</tr>`;
    })
    .replace(/((<tr>.*<\/tr>\n?)+)/gs, m => `<table class="chat-table">${m}</table>`)
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Bullets
    .replace(/^• (.+)$/gm, '<div class="chat-bullet">• $1</div>')
    .replace(/^\* (.+)$/gm, '<div class="chat-bullet">• $1</div>')
    // Newlines
    .replace(/\n/g, '<br>');
}

/** Update the context Claude will use for chat responses */
function updateChatContext(ctx) {
  Object.assign(_dashboardContext, ctx);
}

window.ChatModule = {
  initChat,
  updateChatContext,
  sendChatMessage,
  clearChat,
  appendWelcomeMessage,
};

})();
