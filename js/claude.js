// claude.js — Claude API integration for storm damage summaries

const CLAUDE_MODEL = 'claude-sonnet-4-20250514';
const CLAUDE_ENDPOINT = 'https://api.anthropic.com/v1/messages';

function buildStormPrompt(report, alerts) {
  const alertSummary = alerts.slice(0, 3).map(a => {
    const p = a.properties;
    return `- ${p.event}: ${p.areaDesc} (${p.severity})`;
  }).join('\n');

  return `You are an emergency management analyst. Based on the following storm report and active NWS alerts, provide a concise damage assessment and recommended actions.

STORM REPORT:
Location: ${report.location}
Type: ${report.label}
Magnitude: ${report.magnitude}
Detail: ${report.detail}
Time: ${new Date(report.time).toLocaleString()}
Source: ${report.source}

ACTIVE NWS ALERTS IN AREA:
${alertSummary || 'No active alerts retrieved'}

Provide a 3-part response:
1. DAMAGE ASSESSMENT (2-3 sentences on likely impact severity and affected properties)
2. INSURANCE RELEVANCE (1-2 sentences on coverage considerations — hail size, wind speed, structural damage)
3. IMMEDIATE ACTIONS (2-3 bullet points for residents/property owners)

Keep the total response under 180 words. Be specific and actionable.`;
}

function buildAreaSummaryPrompt(alerts, reports, metrics) {
  const alertList = alerts.slice(0, 5).map(a => {
    const p = a.properties;
    return `${p.event} — ${p.areaDesc}`;
  }).join('\n');

  const reportList = reports.slice(0, 5).map(r =>
    `${r.label} at ${r.location}: ${r.magnitude}`
  ).join('\n');

  return `You are an emergency management analyst preparing a briefing for Jefferson County and St. Louis area officials.

CURRENT METRICS:
- Active NWS alerts: ${metrics.warnings}
- Storm reports: ${metrics.reports}
- Max hail size: ${metrics.maxHail}
- Peak wind gust: ${metrics.peakWind}

ACTIVE ALERTS:
${alertList || 'Using April 17-18 2026 event data'}

STORM REPORTS:
${reportList}

Provide an executive briefing (under 200 words) covering:
1. Overall threat assessment for Jefferson County and surrounding areas
2. Highest-priority damage zones
3. Key recommendations for residents regarding insurance claims and property inspection

Be direct and specific. Reference actual locations where possible.`;
}

async function callClaude(prompt, apiKey) {
  if (!apiKey || apiKey === 'YOUR_ANTHROPIC_API_KEY_HERE') {
    return simulateClaudeResponse(prompt);
  }

  try {
    const res = await fetch(CLAUDE_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 400,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `API error ${res.status}`);
    }

    const data = await res.json();
    return data.content?.[0]?.text || 'No response received.';
  } catch (err) {
    console.error('Claude API error:', err);
    throw err;
  }
}

function simulateClaudeResponse(prompt) {
  return new Promise(resolve => {
    setTimeout(() => {
      if (prompt.includes('Arnold')) {
        resolve(`DAMAGE ASSESSMENT
The Arnold area sustained significant structural damage from the severe storm system on April 17. Multiple buildings along Jeffco Boulevard experienced roof failures and partial collapses, consistent with 80 mph straight-line winds. Structural compromise risk remains elevated for affected properties.

INSURANCE RELEVANCE
Wind-driven structural damage at these speeds typically qualifies for dwelling coverage under standard homeowners policies. Document all damage with photos before any temporary repairs and contact your insurer to initiate a claim promptly.

IMMEDIATE ACTIONS
• Do not enter structurally compromised buildings until inspected by a licensed engineer or building inspector
• Contact Jefferson County Emergency Management at 636-797-6450 to report damage
• Begin photo/video documentation of all visible damage for insurance claims`);
      } else if (prompt.includes('hail') || prompt.includes('Hail')) {
        resolve(`DAMAGE ASSESSMENT
Golf ball-sized hail (1.75 inches) across northwestern St. Louis County caused widespread vehicle and roof damage. At this size, hail typically dents metal roofing, cracks asphalt shingles, and causes significant vehicle body damage. Expect high claim volumes across this corridor.

INSURANCE RELEVANCE
Hail damage to vehicles is covered under comprehensive auto coverage. For homes, hail damage to roofs and siding falls under dwelling coverage — most policies cover full replacement cost for hail damage regardless of roof age if you have RCV coverage.

IMMEDIATE ACTIONS
• Inspect your roof and vehicle from the ground — do not climb on a damaged roof
• Contact your insurer within 48 hours to document the event date
• Be cautious of storm chasers/contractors offering unsolicited inspections`);
      } else {
        resolve(`DAMAGE ASSESSMENT
The severe storm system produced a combination of structural, hail, and wind damage across Jefferson County and surrounding St. Louis metro areas. The highest damage concentration is centered around Arnold, Imperial, and the Hillsboro area, with over a dozen confirmed structural damage reports.

INSURANCE RELEVANCE
This event likely triggers both homeowners and auto insurance claims simultaneously across the affected corridor. With 80 mph wind gusts and 1.75-inch hail, most standard policies cover the documented damage types — prioritize filing promptly as claim volumes will be high.

IMMEDIATE ACTIONS
• Document all property damage with timestamped photos before any cleanup
• Contact your insurance provider to open a claim and request an adjuster visit
• Check weather.gov/lsx for official NWS damage survey results as they are published`);
      }
    }, 1200);
  });
}

window.ClaudeModule = {
  buildStormPrompt,
  buildAreaSummaryPrompt,
  callClaude,
};
