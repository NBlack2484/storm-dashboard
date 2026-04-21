// chat.js — Conversational chat interface powered by Claude AI

const CHAT_MODEL    = 'claude-sonnet-4-20250514';
const CHAT_ENDPOINT = 'https://api.anthropic.com/v1/messages';

let _chatHistory = [];
let _apiKey = null;

let _dashboardContext = {
  alerts: [], stormReports: [], spcReports: [], metrics: {},
};

// ── System prompt ─────────────────────────────────────────────────────────────

function buildSystemPrompt(ctx) {
  const alertSummary = (ctx.alerts || []).slice(0, 6).map(a => {
    const p = a.properties;
    return `- ${p.event} (${p.severity}): ${p.areaDesc}`;
  }).join('\n') || 'No active NWS alerts.';

  const reportSummary = [...(ctx.stormReports || []), ...(ctx.spcReports || [])]
    .slice(0, 20)
    .map(r => `- ${(r.type || r.label || '').toUpperCase()} | ${r.location} | ${r.magnitude} | ${r.detail}`)
    .join('\n') || 'No storm reports loaded.';

  const m = ctx.metrics || {};

  return `You are an emergency management and insurance guidance assistant embedded in a live storm dashboard for Jefferson County and St. Louis, Missouri.

CURRENT DASHBOARD METRICS:
- Active NWS alerts: ${m.warnings || 0}
- Storm reports on map: ${m.reports || 0}
- Max hail: ${m.maxHail || 'N/A'}
- Peak wind: ${m.peakWind || 'N/A'}
- Power outages: ${m.outages || 'Unknown'}

ACTIVE NWS ALERTS:
${alertSummary}

ALL PLOTTED STORM REPORTS:
${reportSummary}

INSTRUCTIONS:
- Answer in plain, direct language. No preamble.
- Reference actual street names and locations from the report data above.
- For insurance questions, give specific actionable guidance.
- Keep responses to 3-6 sentences or a short bulleted list unless detail is requested.
- If data for a question isn't available, say so clearly.`;
}

// ── Claude API ────────────────────────────────────────────────────────────────

async function sendChatMessage(userMessage) {
  if (!_apiKey || _apiKey === 'YOUR_ANTHROPIC_API_KEY_HERE') {
    return simulateChatResponse(userMessage);
  }

  _chatHistory.push({ role: 'user', content: userMessage });
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
    _chatHistory.pop();
    throw err;
  }
}

// ── Demo responses (no API key) ───────────────────────────────────────────────

function simulateChatResponse(msg) {
  const lower = msg.toLowerCase();
  return new Promise(resolve => {
    setTimeout(() => {
      if (lower.includes('structural') || lower.includes('worst') || lower.includes('most damage')) {
        resolve(`The highest concentration of structural damage is in three areas:\n\n• **Arnold — Jeffco Blvd**: Roof collapses along Jeffco Blvd between Hwy 141 and Plaza Dr. Road closed.\n• **Imperial — Old Lemay Ferry Rd**: Several home structural collapses — worst residential impact in the county.\n• **Hillsboro — Clayton Husky Rd**: 8–9 structures damaged across the Klondike/Clayton Husky Rd corridor.\n\nArnold and Imperial took the worst of the 80 mph straight-line winds.`);
      } else if (lower.includes('insurance') || lower.includes('claim')) {
        resolve(`For Jefferson County claims from the April 17–18 event:\n\n• **File promptly** — claim volumes are high; early filing means faster adjuster scheduling\n• **Document before cleanup** — timestamped photos/video of all damage\n• **Structural damage**: Covered under dwelling coverage; get a structural engineer inspection before re-entering\n• **Hail (1.75")**: Qualifies for roof replacement under most RCV policies\n• **Vehicles**: File under comprehensive auto — weather event, not collision\n• Jefferson County Emergency Management: 636-797-6450`);
      } else if (lower.includes('compare') || lower.includes('arnold') || lower.includes('hillsboro')) {
        resolve(`Comparing the three main damage zones:\n\n| Location | Type | Severity |\n|---|---|---|\n| Arnold — Jeffco Blvd | Structural + Wind | Roof collapse, road closed |\n| Imperial — Old Lemay Ferry Rd | Structural | Home collapses, worst residential |\n| Hillsboro — Clayton Husky Rd | Structural | 8–9 structures, wider area |\n\nImperial had the highest per-street home damage count; Arnold had the most commercial impact; Hillsboro had the widest geographic spread.`);
      } else if (lower.includes('wind') || lower.includes('speed') || lower.includes('gust')) {
        resolve(`Peak wind gusts of **80 mph** hit NW St. Louis Metro and Arnold/Mehlville around 10 PM CDT on April 17. The 65–80 mph range is borderline EF1 tornado-equivalent for straight-line damage. Over **50,000 customers** lost power across MO and IL — Ameren MO handled the bulk of Missouri restoration. Downed lines and uprooted trees were the primary damage mechanism.`);
      } else if (lower.includes('imperial') || lower.includes('lemay')) {
        resolve(`Imperial's worst damage was concentrated on **Old Lemay Ferry Road**, where several homes suffered structural collapses and severe roof damage. This was the highest per-street residential damage count in the county from the April 17 event. If you're filing an insurance claim for this area, contact Jefferson County Emergency Management at 636-797-6450 to get on the official damage registry, which can support your claim.`);
      } else if (lower.includes('hail')) {
        resolve(`The largest hail — **1.75" (golf ball size)** — hit NW St. Louis County, Bridgeton, and St. Ann around 10:05–10:10 PM. Northern Jefferson County received **1.0" (quarter size)**. At 1.75", expect dented metal roofing, cracked shingles, broken skylights, and significant vehicle body damage. The hail swath runs SW to NE — toggle the Hail Swath layer on the map to see the estimated path.`);
      } else {
        resolve(`Based on the April 17–18 storm data for Jefferson County and St. Louis:\n\nThe event produced 80 mph winds, 1.75" hail, and structural damage across Arnold, Imperial, and Hillsboro. Nine storm reports are plotted on the map covering structural, hail, wind, and tornado threat. What would you like more detail on?`);
      }
    }, 800);
  });
}

// ── Init & DOM wiring ─────────────────────────────────────────────────────────

function initChat(apiKey, panelId) {
  _apiKey = apiKey;
  _chatHistory = [];

  // panelId is the container — we look for elements inside the whole document
  // since the panel may not be visible yet when chips are rendered
  const sendBtn  = document.getElementById('chat-send-btn');
  const input    = document.getElementById('chat-input');
  const clearBtn = document.getElementById('chat-clear-btn');

  if (sendBtn)  sendBtn.addEventListener('click', handleSend);
  if (clearBtn) clearBtn.addEventListener('click', clearChat);
  if (input) {
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
    });
  }

  // Wire suggestion chips
  document.querySelectorAll('.chat-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const inp = document.getElementById('chat-input');
      if (inp) {
        inp.value = chip.dataset.q || chip.textContent.trim();
        handleSend();
      }
    });
  });
}

async function handleSend() {
  const input = document.getElementById('chat-input');
  const msg = input?.value?.trim();
  if (!msg) return;

  input.value = '';
  appendMessage('user', msg);
  appendMessage('assistant', null); // loading dots

  try {
    const reply = await sendChatMessage(msg);
    replaceLastAssistantMessage(reply);
  } catch (err) {
    replaceLastAssistantMessage(`Error: ${err.message}. Check your API key in config.js.`);
  }
}

function appendMessage(role, text) {
  const log = document.getElementById('chat-log');
  if (!log) return;

  const div = document.createElement('div');
  div.className = `chat-msg chat-msg-${role}`;
  div.dataset.role = role;

  if (text === null) {
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
  const msgs = log.querySelectorAll('[data-role="assistant"]');
  const last = msgs[msgs.length - 1];
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
    Ask me about damage locations, insurance claims, hail or wind data, or use the quick buttons above.
  </div>`;
  log.appendChild(div);
}

// Light markdown → HTML
function formatChatMarkdown(text) {
  // Tables
  let out = text.replace(/^\|(.+)\|$/gm, row => {
    const cells = row.split('|').filter(c => c.trim() !== '');
    if (cells.every(c => /^[\s\-:]+$/.test(c))) return '';
    return `<tr>${cells.map(c => `<td>${c.trim()}</td>`).join('')}</tr>`;
  });
  out = out.replace(/((<tr>[\s\S]*?<\/tr>\n?)+)/g, m => `<table class="chat-table">${m}</table>`);
  // Bold
  out = out.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Bullets
  out = out.replace(/^[•\*] (.+)$/gm, '<div class="chat-bullet">• $1</div>');
  // Newlines
  out = out.replace(/\n/g, '<br>');
  return out;
}

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
