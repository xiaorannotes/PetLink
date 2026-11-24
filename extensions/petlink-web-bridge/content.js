// Strictly privacy-safe: never reads prompt or response text,
// only observes whether a "Stop generating" control is visible in the DOM.

function detectSource(hostname) {
  if (hostname.includes('deepseek.com')) return 'deepseek';
  if (hostname.includes('doubao.com')) return 'doubao-pro';
  if (hostname.includes('grok.com') || hostname.includes('x.com')) return 'grokbot';
  if (hostname.includes('muse')) return 'muse';
  return 'generic';
}

const SOURCE = detectSource(location.hostname);

function isGeneratingNow() {
  const stopSelectors = [
    'button[aria-label*="停止"]',
    'button[aria-label*="Stop"]',
    'button[aria-label*="stop"]',
    '[data-testid*="stop"]',
    '[class*="stop-btn"]',
    '[class*="stopBtn"]',
    '[class*="stop_btn"]'
  ];
  for (const sel of stopSelectors) {
    const el = document.querySelector(sel);
    if (el && el.offsetParent !== null) return true;
  }
  return false;
}

let wasGenerating = false;
let lastWorkingSent = 0;

function poll() {
  const active = isGeneratingNow();
  const now = Date.now();
  if (active && (!wasGenerating || now - lastWorkingSent > 5000)) {
    wasGenerating = true;
    lastWorkingSent = now;
    chrome.runtime.sendMessage({ type: 'petlink-state', source: SOURCE, state: 'working' }).catch(() => {});
  } else if (!active && wasGenerating) {
    wasGenerating = false;
    chrome.runtime.sendMessage({ type: 'petlink-state', source: SOURCE, state: 'done' }).catch(() => {});
  }
}

setInterval(poll, 800);
