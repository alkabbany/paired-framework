// ============================================================
// PAIRED Extension — Popup Script
// Shows current status and provides quick navigation.
// ============================================================

const SUPPORTED_URLS = [
    'claude.ai/chat/',
    'chatgpt.com/c/',
    'gemini.google.com/app/'
];

async function init() {
    const dot      = document.getElementById('status-dot');
    const text     = document.getElementById('status-text');
    const infoText = document.getElementById('info-text');
    const openBtn  = document.getElementById('open-panel-btn');
    const dashBtn  = document.getElementById('open-dashboard-btn');

    // Check current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url   = tab?.url || '';
    const isLLMTab = SUPPORTED_URLS.some(u => url.includes(u));

    // Check auth
    const auth = await new Promise(resolve => {
        chrome.runtime.sendMessage({ type: 'GET_AUTH' }, resolve);
    });

    const isSignedIn = !!(auth && auth.token);

    if (!isSignedIn) {
        dot.className  = 'dot inactive';
        text.textContent = 'Not signed in';
        infoText.textContent = 'Open the logging panel on a supported LLM tab and sign in to start.';
    } else if (!isLLMTab) {
        dot.className    = 'dot inactive';
        text.textContent = 'No active LLM tab';
        infoText.textContent = 'Navigate to Claude, ChatGPT, or Gemini to start logging.';
    } else {
        dot.className    = 'dot active';
        text.textContent = 'Ready to log';
        infoText.textContent = 'Click "Open logging panel" to show the PAIRED panel in this tab.';
    }

    // Open panel button — injects into current tab
    openBtn.addEventListener('click', async () => {
        if (!tab) return;
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func:   () => {
                const toggle = document.getElementById('paired-toggle');
                const panel  = document.getElementById('paired-panel');
                if (toggle && panel && !panel.classList.contains('open')) {
                    toggle.click();
                }
            }
        });
        window.close();
    });

    // Dashboard button
    dashBtn.addEventListener('click', () => {
        chrome.tabs.create({ url: 'https://paired-pilot.vercel.app' });
        window.close();
    });
}

init();
