/**
 * Antigravity PowerTools — Native Chat Microphone & Voice Dictation
 * 
 * Generates the zero-dependency DOM injection script running inside
 * Antigravity IDE workbench via Chrome DevTools Protocol (CDP).
 * 
 * Features:
 * - Native SVG microphone button injected into chat input toolbar.
 * - Real-time streaming transcription via Chromium Web Speech API.
 * - Pulsing recording state indicator via CSS keyframe injection.
 * - Smart Prompt Polish mode (formats speech into structured prompt).
 * - ARIA accessibility, debounce protection, and global cleanup hook.
 * - Global shortcut: Ctrl+Alt+V / Cmd+Alt+V.
 */

'use strict';

function buildVoiceDictationScript(options = {}) {
  const smartPolish = Boolean(options.smartPolish);

  return `(() => {
  if (window.__AGY_VOICE_DICTATION_CLEANUP__) {
    try { window.__AGY_VOICE_DICTATION_CLEANUP__(); } catch (e) {}
  }
  window.__AGY_VOICE_DICTATION_INITIALIZED__ = true;

  const MIC_BTN_ID = 'agy-voice-dictate-btn';
  const LIVE_STATUS_ID = 'agy-voice-status';
  const STYLE_ID = 'agy-voice-styles';

  let recognition = null;
  let isRecording = false;
  let accumulatedTranscript = '';
  let processedResultIndex = 0;
  let lastShortcutPress = 0;
  let obs = null;

  // Inject CSS styles for pulse animation
  if (!document.getElementById(STYLE_ID)) {
    const styleEl = document.createElement('style');
    styleEl.id = STYLE_ID;
    styleEl.textContent = \`
      #\${MIC_BTN_ID} {
        background: transparent;
        border: 1px solid var(--vscode-widget-border, #3c3c3c);
        border-radius: 4px;
        padding: 4px 6px;
        margin: 0 4px;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        color: var(--vscode-foreground, #ccc);
        transition: all 0.2s ease;
        vertical-align: middle;
      }
      #\${MIC_BTN_ID}.recording {
        color: #ff4d4f !important;
        border-color: #ff4d4f !important;
        box-shadow: 0 0 8px rgba(255, 77, 79, 0.6) !important;
        animation: agy-mic-pulse 1.5s ease-in-out infinite;
      }
      @keyframes agy-mic-pulse {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.75; transform: scale(1.05); }
      }
    \`;
    document.head.appendChild(styleEl);
  }

  function sanitizeSpeechText(text) {
    if (typeof text !== 'string') return '';
    return text
      .replace(/[<>]/g, '')
      .replace(/\`{3,}/g, '\`\`')
      .trim();
  }

  function findToolbar() {
    const selectors = [
      'div[class*="chat-input"] div[class*="toolbar"]',
      'div[class*="interactive-input-part"] div[class*="actions"]',
      'div[class*="monaco-toolbar"]',
      'div[class*="chat"] form'
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    const textarea = document.querySelector('textarea');
    return textarea ? textarea.parentElement : null;
  }

  function createMicButton() {
    if (document.getElementById(MIC_BTN_ID)) return true;

    const toolbar = findToolbar();
    if (!toolbar) return false;

    // ARIA live region for screen readers
    if (!document.getElementById(LIVE_STATUS_ID)) {
      const liveRegion = document.createElement('div');
      liveRegion.id = LIVE_STATUS_ID;
      liveRegion.setAttribute('role', 'status');
      liveRegion.setAttribute('aria-live', 'polite');
      liveRegion.setAttribute('aria-atomic', 'true');
      liveRegion.style.cssText = 'position: absolute; left: -10000px; width: 1px; height: 1px; overflow: hidden;';
      document.body.appendChild(liveRegion);
    }

    const btn = document.createElement('button');
    btn.id = MIC_BTN_ID;
    btn.type = 'button';
    btn.title = 'Voice Dictate (Ctrl+Alt+V)';
    btn.setAttribute('aria-label', 'Voice Dictation');
    btn.setAttribute('aria-pressed', 'false');

    // Safe DOM construction for SVG icon (no innerHTML)
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '14');
    svg.setAttribute('height', '14');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');

    const path1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path1.setAttribute('d', 'M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z');
    const path2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path2.setAttribute('d', 'M19 10v2a7 7 0 0 1-14 0v-2');
    const line1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line1.setAttribute('x1', '12');
    line1.setAttribute('y1', '19');
    line1.setAttribute('x2', '12');
    line1.setAttribute('y2', '23');
    const line2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line2.setAttribute('x1', '8');
    line2.setAttribute('y1', '23');
    line2.setAttribute('x2', '16');
    line2.setAttribute('y2', '23');

    svg.appendChild(path1);
    svg.appendChild(path2);
    svg.appendChild(line1);
    svg.appendChild(line2);
    btn.appendChild(svg);

    btn.addEventListener('click', toggleRecording);
    toolbar.appendChild(btn);
    return true;
  }

  function polishSpokenPrompt(rawText) {
    const clean = sanitizeSpeechText(rawText);
    if (!clean) return '';
    if (!${smartPolish}) return clean;
    return '### Objective\\n' + clean + '\\n\\n### Context & Constraints\\n- Execute with high accuracy\\n- Run test verification\\n';
  }

  function injectTextIntoChat(text) {
    if (!text) return;
    const textareas = [
      document.querySelector('div[class*="chat"] textarea'),
      document.querySelector('textarea[placeholder*="Ask"]'),
      document.querySelector('textarea'),
      document.querySelector('[contenteditable="true"]')
    ];
    const target = textareas.find(Boolean);
    if (!target) return;

    if (target.tagName && target.tagName.toLowerCase() === 'textarea') {
      const start = target.selectionStart || 0;
      const end = target.selectionEnd || 0;
      const current = target.value || '';
      target.value = current.substring(0, start) + text + current.substring(end);
      target.selectionStart = target.selectionEnd = start + text.length;
      target.dispatchEvent(new Event('input', { bubbles: true }));
      target.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      target.textContent = (target.textContent || '') + ' ' + text;
      target.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  function updateMicUi(recording) {
    const btn = document.getElementById(MIC_BTN_ID);
    const liveRegion = document.getElementById(LIVE_STATUS_ID);
    if (!btn) return;

    btn.setAttribute('aria-pressed', recording ? 'true' : 'false');
    if (recording) {
      btn.classList.add('recording');
      if (liveRegion) liveRegion.textContent = 'Voice dictation active';
    } else {
      btn.classList.remove('recording');
      if (liveRegion) liveRegion.textContent = 'Voice dictation stopped';
    }
  }

  function toggleRecording() {
    const SpeechClass = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechClass) {
      console.warn('[VoiceDictation] Web Speech API not supported in this Chromium target.');
      return;
    }

    if (isRecording && recognition) {
      recognition.stop();
      return;
    }

    try {
      recognition = new SpeechClass();
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.lang = 'en-US';
      processedResultIndex = 0;

      recognition.onstart = () => {
        isRecording = true;
        accumulatedTranscript = '';
        updateMicUi(true);
      };

      recognition.onresult = (evt) => {
        for (let i = processedResultIndex; i < evt.results.length; ++i) {
          const res = evt.results[i];
          if (res && res.isFinal && res[0] && res[0].transcript) {
            accumulatedTranscript += res[0].transcript + ' ';
            processedResultIndex = i + 1;
          }
        }
      };

      recognition.onerror = (err) => {
        console.warn('[VoiceDictation] Error:', err);
        isRecording = false;
        updateMicUi(false);
      };

      recognition.onend = () => {
        isRecording = false;
        processedResultIndex = 0;
        updateMicUi(false);
        if (accumulatedTranscript.trim()) {
          const formatted = polishSpokenPrompt(accumulatedTranscript);
          injectTextIntoChat(formatted);
        }
      };

      recognition.start();
    } catch (e) {
      console.warn('[VoiceDictation] Failed to start:', e);
      isRecording = false;
      updateMicUi(false);
    }
  }

  function handleKeydown(e) {
    if ((e.ctrlKey || e.metaKey) && e.altKey && (e.key === 'v' || e.key === 'V')) {
      const now = Date.now();
      if (now - lastShortcutPress < 300) return; // Debounce
      lastShortcutPress = now;
      e.preventDefault();
      toggleRecording();
    }
  }

  window.addEventListener('keydown', handleKeydown);

  // Mount button and observe DOM if not immediately available
  if (!createMicButton()) {
    obs = new MutationObserver(() => {
      if (createMicButton() && obs) {
        obs.disconnect();
        obs = null;
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  // Cleanup hook
  window.__AGY_VOICE_DICTATION_CLEANUP__ = () => {
    if (recognition) {
      try { recognition.abort(); } catch (e) {}
      recognition = null;
    }
    if (obs) {
      try { obs.disconnect(); } catch (e) {}
      obs = null;
    }
    window.removeEventListener('keydown', handleKeydown);
    const btn = document.getElementById(MIC_BTN_ID);
    if (btn) btn.remove();
    const live = document.getElementById(LIVE_STATUS_ID);
    if (live) live.remove();
  };
})();`;
}

module.exports = {
  buildVoiceDictationScript
};
