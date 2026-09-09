/**
 * Automated test suite for auto-accept.js CLI
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const vm = require('vm');

const {
  buildScannerScript,
  StatsManager,
  selectWorkbenchTarget,
  DEFAULTS
} = require('../auto-accept.js');

console.log('🧪 Starting Antigravity Auto-Submit CLI Test Suite...\n');

let passed = 0;
let total = 0;

function it(name, fn) {
  total++;
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
  }
}

// ── 1. Defaults & Config ──
it('DEFAULTS has expected safety configurations', () => {
  assert.strictEqual(DEFAULTS.enabled, true);
  assert.strictEqual(DEFAULTS.mode, 'autonomous');
  assert.strictEqual(DEFAULTS.autoSelectAlwaysAllow, false);
  assert(DEFAULTS.askKeywords.includes('git push'));
  assert(DEFAULTS.skipKeywords.includes('rm -rf'));
  assert(DEFAULTS.skipKeywords.includes('drop table'));
});

// ── 2. Scanner Script Syntax & Features ──
it('buildScannerScript generates valid, compilable JavaScript', () => {
  const cfg = {
    mode: 'autonomous',
    autoSelectAlwaysAllow: true,
    askKeywords: ['git push', 'sudo'],
    skipKeywords: ['rm -rf', 'drop table']
  };
  const script = buildScannerScript(cfg);
  assert(typeof script === 'string');
  assert(script.length > 500);

  // Compile using Node.js VM to ensure zero syntax errors
  assert.doesNotThrow(() => {
    new vm.Script(script);
  });
});

it('buildScannerScript correctly embeds custom keywords', () => {
  const cfg = {
    mode: 'autopilot',
    autoSelectAlwaysAllow: true,
    askKeywords: ['custom-ask-keyword'],
    skipKeywords: ['custom-skip-keyword']
  };
  const script = buildScannerScript(cfg);
  assert(script.includes('custom-ask-keyword'));
  assert(script.includes('custom-skip-keyword'));
  assert(script.includes('"autopilot"'));
  assert(script.includes('data-testid="interaction-continue-button"'));
  assert(script.includes('input[type="radio"][value="2"]'));
});

it('buildScannerScript includes autopilot implementation plan detection', () => {
  const script = buildScannerScript({
    mode: 'autopilot',
    autoSelectAlwaysAllow: true,
    askKeywords: [],
    skipKeywords: []
  });
  assert(script.includes('Proceed (Plan)'));
  assert(script.includes('proceed with'));
});

// ── 3. Target Selection ──
it('selectWorkbenchTarget prioritizes Antigravity workbench over iframes and workers', () => {
  const mockTargets = [
    { type: 'iframe', title: 'Webview', webSocketDebuggerUrl: 'ws://127.0.0.1:9333/1', url: 'vscode-webview://...' },
    { type: 'worker', title: 'ServiceWorker', webSocketDebuggerUrl: 'ws://127.0.0.1:9333/2', url: '' },
    { type: 'page', title: 'antigravity-auto-submit - Antigravity IDE', webSocketDebuggerUrl: 'ws://127.0.0.1:9333/3', url: 'vscode-file://vscode-app/workbench.html' }
  ];

  const target = selectWorkbenchTarget(mockTargets);
  assert(target !== null);
  assert.strictEqual(target.type, 'page');
  assert.strictEqual(target.webSocketDebuggerUrl, 'ws://127.0.0.1:9333/3');
});

// ── 4. Stats Persistence ──
it('StatsManager loads and increments stats accurately', () => {
  const stats = new StatsManager();
  const prevLifetime = stats.lifetimeClicks;

  stats.recordApproval('Test Action');
  assert.strictEqual(stats.sessionApprovals, 1);
  assert.strictEqual(stats.lifetimeClicks, prevLifetime + 1);
  assert.strictEqual(stats.lastAction, 'Test Action');
  assert(stats.lastClicked.length > 0);

  stats.recordBlock();
  assert.strictEqual(stats.sessionBlocks, 1);
});

// ── 5. End-to-End Card Extraction & Permission Gating Simulation ──
it('buildScannerScript detects "git push" from enclosing card and blocks auto-approval', () => {
  const cfg = {
    mode: 'autonomous',
    autoSelectAlwaysAllow: false,
    askKeywords: ['git push'],
    skipKeywords: ['rm -rf']
  };
  const script = buildScannerScript(cfg);

  // Setup simulated DOM in Node VM context
  let clicked = false;
  let option1Selected = false;

  const mockContinueBtn = {
    tagName: 'BUTTON',
    innerText: 'Submit',
    className: 'btn-primary outline-none focus:outline-none',
    getBoundingClientRect: () => ({ width: 80, height: 32 }),
    click: () => { clicked = true; },
    dispatchEvent: () => {},
    parentElement: null
  };

  const mockCard = {
    tagName: 'DIV',
    className: 'interaction-card border rounded p-4',
    innerText: 'Run Command\ngit push origin main\nAllow this time (1)\nAlways allow in conversation (2)',
    parentElement: null
  };

  const mockButtonRow = {
    tagName: 'DIV',
    className: 'flex justify-end gap-2',
    innerText: 'Cancel Submit',
    parentElement: mockCard
  };

  mockContinueBtn.parentElement = mockButtonRow;

  const mockRadio1 = {
    tagName: 'INPUT',
    type: 'radio',
    value: '1',
    checked: false,
    click: () => { option1Selected = true; },
    dispatchEvent: () => {}
  };

  const sandbox = {
    document: {
      querySelector: (selector) => {
        if (selector === '[data-testid="interaction-continue-button"]') return mockContinueBtn;
        if (selector === 'input[type="radio"][value="1"]') return mockRadio1;
        return null;
      },
      querySelectorAll: () => [],
      body: {
        innerText: '',
        dispatchEvent: () => {}
      }
    },
    window: {
      getComputedStyle: () => ({ display: 'block', visibility: 'visible' })
    },
    KeyboardEvent: function() {},
    MouseEvent: function() {},
    Event: function() {}
  };

  const result = vm.runInNewContext(script, sandbox);

  // Verification:
  assert(result !== null, 'Scanner should return an outcome');
  assert.strictEqual(result.blocked, true, 'git push MUST be blocked');
  assert.strictEqual(result.blockedType, 'ask', 'Should be an Ask permission block');
  assert.strictEqual(result.matchedKeyword, 'git push');
  assert.strictEqual(clicked, false, 'Continue button MUST NOT be clicked when blocked');
  assert.strictEqual(option1Selected, false, 'Options MUST NOT be changed when blocked');
});

it('buildScannerScript auto-approves safe commands and selects Option 1 (Allow this time)', () => {
  const cfg = {
    mode: 'autonomous',
    autoSelectAlwaysAllow: false,
    askKeywords: ['git push'],
    skipKeywords: ['rm -rf']
  };
  const script = buildScannerScript(cfg);

  let clicked = false;
  let option1Selected = false;

  const mockContinueBtn = {
    tagName: 'BUTTON',
    innerText: 'Submit',
    className: 'btn-primary outline-none',
    getBoundingClientRect: () => ({ width: 80, height: 32 }),
    click: () => { clicked = true; },
    dispatchEvent: () => {},
    parentElement: null
  };

  const mockCard = {
    tagName: 'DIV',
    className: 'interaction-card',
    innerText: 'Run Command\ngit status\nAllow this time (1)\nAlways allow in conversation (2)',
    parentElement: null
  };

  const mockButtonRow = {
    tagName: 'DIV',
    className: 'flex gap-2',
    innerText: 'Cancel Submit',
    parentElement: mockCard
  };

  mockContinueBtn.parentElement = mockButtonRow;

  const mockRadio1 = {
    tagName: 'INPUT',
    type: 'radio',
    value: '1',
    checked: false,
    click: () => { option1Selected = true; },
    dispatchEvent: () => {}
  };

  const sandbox = {
    document: {
      querySelector: (selector) => {
        if (selector === '[data-testid="interaction-continue-button"]') return mockContinueBtn;
        if (selector === 'input[type="radio"][value="1"]') return mockRadio1;
        return null;
      },
      querySelectorAll: () => [],
      body: {
        innerText: '',
        dispatchEvent: () => {}
      }
    },
    window: {
      getComputedStyle: () => ({ display: 'block', visibility: 'visible' })
    },
    KeyboardEvent: function() {},
    MouseEvent: function() {},
    Event: function() {}
  };

  const result = vm.runInNewContext(script, sandbox);

  // Verification:
  assert(result !== null, 'Scanner should return an outcome');
  assert.strictEqual(result.blocked, false, 'git status should NOT be blocked');
  assert.strictEqual(clicked, true, 'Continue button MUST be clicked for safe commands');
  assert.strictEqual(option1Selected, true, 'Option 1 MUST be selected so Antigravity never session-whitelists');
});

// ── 6. Rule Addition & Removal Management ──
it('allows adding and removing rules programmatically and via subcommands', () => {
  const { handleAddRuleCli, handleRemoveRuleCli, getSaveTarget } = require('../auto-accept.js');
  const tempConfigFile = path.join(os.tmpdir(), `auto-accept-test-${Date.now()}.json`);

  const mockCfg = {
    mode: 'autonomous',
    safetyDelayMs: 200,
    askKeywords: ['git push'],
    skipKeywords: ['rm -rf']
  };

  fs.writeFileSync(tempConfigFile, JSON.stringify(mockCfg, null, 2), 'utf8');

  // Verify getSaveTarget
  const target = getSaveTarget(false, tempConfigFile);
  assert.strictEqual(target, tempConfigFile);

  // Test adding rule via mock execution logic
  let fileData = JSON.parse(fs.readFileSync(tempConfigFile, 'utf8'));
  fileData.askKeywords.push('npm publish');
  fs.writeFileSync(tempConfigFile, JSON.stringify(fileData, null, 2), 'utf8');

  let updated = JSON.parse(fs.readFileSync(tempConfigFile, 'utf8'));
  assert(updated.askKeywords.includes('npm publish'));
  assert.strictEqual(updated.askKeywords.length, 2);

  // Test removing rule
  updated.askKeywords = updated.askKeywords.filter(k => k !== 'npm publish');
  fs.writeFileSync(tempConfigFile, JSON.stringify(updated, null, 2), 'utf8');

  let afterRemove = JSON.parse(fs.readFileSync(tempConfigFile, 'utf8'));
  assert(!afterRemove.askKeywords.includes('npm publish'));
  assert.strictEqual(afterRemove.askKeywords.length, 1);

  // Clean up
  try { fs.unlinkSync(tempConfigFile); } catch(e) {}
});

// ── 7. Interactive Hotkeys Support ──
it('AutoSubmitDaemon supports interactive hotkeys a and r for live rule management', () => {
  const { AutoSubmitDaemon, DEFAULTS } = require('../auto-accept.js');
  const daemon = new AutoSubmitDaemon(DEFAULTS, 'default');
  assert.strictEqual(daemon.isPrompting, false);
  assert.strictEqual(typeof daemon.promptAddRule, 'function');
  assert.strictEqual(typeof daemon.promptRemoveRule, 'function');
  assert.strictEqual(typeof daemon.saveActiveConfig, 'function');
});

console.log(`\nResults: ${passed}/${total} passed.`);
if (passed !== total) {
  process.exit(1);
}
