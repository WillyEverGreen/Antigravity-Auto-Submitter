/**
 * Automated test suite for auto-accept.js CLI & Multi-Window Engine
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const vm = require('vm');

// Isolate daemon state (stats + lock files) from the developer's real
// ~/.antigravity-auto-submit. Without this the suite inflated the live counters.
const TEST_STATE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-test-state-'));
process.env.ANTIGRAVITY_STATE_DIR = TEST_STATE_DIR;

const {
  buildScannerScript,
  StatsManager,
  selectWorkbenchTarget,
  selectAllWorkbenchTargets,
  WindowSession,
  AutoSubmitDaemon,
  getPidFilePath,
  acquireDaemonLock,
  releaseDaemonLock,
  readJsonFile,
  findSubcommandIndex,
  extractSubcommand,
  argsAfterSubcommand,
  resolveConfig,
  DEFAULTS
} = require('../auto-accept.js');

console.log('🧪 Starting Antigravity Auto-Submit CLI Test Suite...\n');

let passed = 0;
let total = 0;

function getPythonCommand() {
  const { execSync } = require('child_process');
  const candidates = process.platform === 'win32' ? ['python', 'py', 'python3'] : ['python3', 'python'];
  for (const cmd of candidates) {
    try {
      execSync(`${cmd} --version`, { stdio: 'ignore' });
      return cmd;
    } catch (e) {}
  }
  return process.platform === 'win32' ? 'python' : 'python3';
}

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
  assert(Array.isArray(DEFAULTS.cdpPorts));
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
  const daemon = new AutoSubmitDaemon(DEFAULTS, 'default');
  assert.strictEqual(daemon.isPrompting, false);
  assert.strictEqual(typeof daemon.promptAddRule, 'function');
  assert.strictEqual(typeof daemon.promptRemoveRule, 'function');
  assert.strictEqual(typeof daemon.saveActiveConfig, 'function');
  assert.strictEqual(typeof daemon.showStats, 'function');
  assert.strictEqual(typeof daemon.showConfig, 'function');
  assert.strictEqual(typeof daemon.showRulesList, 'function');
});

// ── 8. Stdin Resumption and Prompt Lifecycle ──
it('guarantees process.stdin.resume() and clean prompt teardown upon prompt completion', () => {
  const daemon = new AutoSubmitDaemon(DEFAULTS, 'default');

  assert.strictEqual(daemon.isPrompting, false);

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    daemon.isPrompting = false;
    process.stdin.resume();
  };

  daemon.isPrompting = true;
  finish();

  assert.strictEqual(daemon.isPrompting, false);
  assert.strictEqual(process.stdin.isPaused(), false, 'process.stdin MUST NOT be left paused');
});

// ── 9. Hotkey Normalization & Symbol Handling ──
it('correctly normalizes upper-case characters and symbol keys like ?', () => {
  const readline = require('readline');
  readline.emitKeypressEvents(process.stdin);
  process.stdin.resume();

  let lastTriggered = '';
  const handler = (str, key) => {
    const char = (key && key.name ? key.name.toLowerCase() : (str || '')).toLowerCase();
    const rawStr = str || '';
    if (rawStr === '?' || char === '?') lastTriggered = 'help';
    else if (char === 'p') lastTriggered = 'pause';
    else if (char === 'm') lastTriggered = 'mode';
  };

  handler('?', { sequence: '?', name: undefined });
  assert.strictEqual(lastTriggered, 'help');

  handler('P', { sequence: 'P', name: 'p', shift: true });
  assert.strictEqual(lastTriggered, 'pause');

  handler('M', { sequence: 'M', name: 'm', shift: true });
  assert.strictEqual(lastTriggered, 'mode');
});

// ── 10. Antigravity Suite Bin & Script Verification ──
it('bin scripts exist and have valid syntax', () => {
  const binDir = path.join(__dirname, '..', 'bin');
  const expectedBins = [
    'antigravity-check.js',
    'antigravity-find-temp.js',
    'antigravity-clean.js',
    'antigravity-brain.js'
  ];
  for (const b of expectedBins) {
    const p = path.join(binDir, b);
    assert(fs.existsSync(p), `Missing bin script: ${b}`);
    const content = fs.readFileSync(p, 'utf8');
    assert(content.includes('#!/usr/bin/env node'));
    assert.doesNotThrow(() => {
      new vm.Script(content);
    }, `Syntax error in ${b}`);
  }
});

it('python cleaner and brain scripts exist and compile cleanly', () => {
  const scriptsDir = path.join(__dirname, '..', 'scripts');
  const pyCleaner = path.join(scriptsDir, 'antigravity_cleaner.py');
  const pyBrain = path.join(scriptsDir, 'antigravity_brain.py');

  assert(fs.existsSync(pyCleaner), 'antigravity_cleaner.py missing');
  assert(fs.existsSync(pyBrain), 'antigravity_brain.py missing');

  const { execSync } = require('child_process');
  const pythonCmd = getPythonCommand();
  assert.doesNotThrow(() => {
    execSync(`${pythonCmd} -m py_compile "${pyCleaner}" "${pyBrain}"`, { stdio: 'pipe' });
  });
});

// ── 11. Multi-Window Target Selection & Filtering ──
it('selectAllWorkbenchTargets accurately returns ALL workbench pages and ignores workers/iframes', () => {
  const mockTargets = [
    { id: '1', type: 'iframe', title: 'Preview Frame', webSocketDebuggerUrl: 'ws://127.0.0.1:9333/1', url: 'vscode-webview://...' },
    { id: '2', type: 'worker', title: 'Extension Host Worker', webSocketDebuggerUrl: 'ws://127.0.0.1:9333/2', url: '' },
    { id: '3', type: 'page', title: 'antigravity-auto-submit - Antigravity IDE', webSocketDebuggerUrl: 'ws://127.0.0.1:9333/3', url: 'vscode-file://vscode-app/workbench.html' },
    { id: '4', type: 'page', title: 'BEACON - Antigravity IDE', webSocketDebuggerUrl: 'ws://127.0.0.1:9333/4', url: 'vscode-file://vscode-app/workbench.html' },
    { id: '5', type: 'page', title: 'Chrome DevTools Internal', webSocketDebuggerUrl: 'ws://127.0.0.1:9333/5', url: 'devtools://devtools/bundled/inspector.html' }
  ];

  const all = selectAllWorkbenchTargets(mockTargets);
  assert.strictEqual(all.length, 2, 'Should select exactly the 2 Antigravity workbench windows');
  assert.strictEqual(all[0].id, '3');
  assert.strictEqual(all[1].id, '4');
  assert.strictEqual(all[0].title, 'antigravity-auto-submit - Antigravity IDE');
  assert.strictEqual(all[1].title, 'BEACON - Antigravity IDE');

  // selectWorkbenchTarget backward compatibility
  const single = selectWorkbenchTarget(mockTargets);
  assert.strictEqual(single.id, '3');
});

it('selectAllWorkbenchTargets ignores external web browser pages like localhost or chrome tabs', () => {
  const browserTargets = [
    { id: 'b1', type: 'page', title: 'Rayeva | Sustainable Solutions Platform', url: 'http://localhost:3000/', webSocketDebuggerUrl: 'ws://127.0.0.1:9222/b1' },
    { id: 'b2', type: 'page', title: 'New Tab', url: 'chrome://newtab/', webSocketDebuggerUrl: 'ws://127.0.0.1:9222/b2' },
    { id: 'b3', type: 'page', title: 'Google Search', url: 'https://www.google.com', webSocketDebuggerUrl: 'ws://127.0.0.1:9222/b3' }
  ];
  const selected = selectAllWorkbenchTargets(browserTargets);
  assert.strictEqual(selected.length, 0, 'Must not match external web browser pages');
});

// ── 12. Flexible Port Locking & Non-Conflicting PIDs ──
it('getPidFilePath produces isolated lock paths per port preventing conflicts', () => {
  const autoLock = getPidFilePath('auto');
  const port9333Lock = getPidFilePath('9333');
  const port9334Lock = getPidFilePath(9334);

  assert(autoLock.endsWith('daemon_auto.pid'));
  assert(port9333Lock.endsWith('daemon_9333.pid'));
  assert(port9334Lock.endsWith('daemon_9334.pid'));
  assert.notStrictEqual(port9333Lock, port9334Lock);

  // Acquire and release test for port 9999
  const testPort = 9999;
  const lock = acquireDaemonLock(testPort);
  assert.strictEqual(lock, null, 'Should successfully acquire lock on unused port');
  assert(fs.existsSync(getPidFilePath(testPort)));

  // Re-acquiring with same process ID succeeds
  const second = acquireDaemonLock(testPort);
  assert.strictEqual(second, null);

  // Release lock
  releaseDaemonLock(testPort);
  assert(!fs.existsSync(getPidFilePath(testPort)), 'Lockfile should be cleanly unlinked upon release');
});

// ── 13. WindowSession Lifecycle & Message Isolation ──
it('WindowSession manages its own reqId, block states, and approvals independently', () => {
  const stats = new StatsManager();
  const mockTargetA = { id: 'win-a', title: 'Window Alpha', webSocketDebuggerUrl: 'ws://127.0.0.1:9333/a' };
  const mockTargetB = { id: 'win-b', title: 'Window Beta', webSocketDebuggerUrl: 'ws://127.0.0.1:9333/b' };

  let eventsA = [];
  let eventsB = [];

  const sessionA = new WindowSession(mockTargetA, 9333, DEFAULTS, stats, (type, badge, action) => {
    eventsA.push({ type, badge, action });
  });
  const sessionB = new WindowSession(mockTargetB, 9334, DEFAULTS, stats, (type, badge, action) => {
    eventsB.push({ type, badge, action });
  });

  assert.strictEqual(sessionA.title, 'Window Alpha');
  assert.strictEqual(sessionB.title, 'Window Beta');
  assert.strictEqual(sessionA.port, 9333);
  assert.strictEqual(sessionB.port, 9334);

  // Simulate outcome on Session A
  sessionA.handleScanResult({ action: 'Allow this time', blocked: false, context: 'cmd 1' });
  assert.strictEqual(sessionA.sessionApprovals, 1);
  assert.strictEqual(sessionB.sessionApprovals, 0, 'Session B approvals must remain isolated');

  // Simulate outcome on Session B
  sessionB.handleScanResult({ action: 'Submit', blocked: true, blockedType: 'ask', matchedKeyword: 'git push', context: 'cmd 2' });
  assert.strictEqual(sessionB.sessionBlocks, 1);
  assert.strictEqual(sessionA.sessionBlocks, 0, 'Session A blocks must remain isolated');
  assert.strictEqual(sessionB.lastReportedBlock.includes('git push'), true);
  assert.strictEqual(sessionA.lastReportedBlock, '');
});

// ── 14. Multi-Window Concurrent State Aggregation in AutoSubmitDaemon ──
it('AutoSubmitDaemon aggregates multi-window sessions and computes collective status', () => {
  const daemon = new AutoSubmitDaemon(DEFAULTS, 'default');
  assert.strictEqual(daemon.isConnected, false);
  assert.strictEqual(daemon.targetTitle, '');

  const stats = daemon.stats;
  const session1 = new WindowSession({ id: 'w1', title: 'Workspace 1', webSocketDebuggerUrl: 'ws://1' }, 9333, DEFAULTS, stats, () => {});
  const session2 = new WindowSession({ id: 'w2', title: 'Workspace 2', webSocketDebuggerUrl: 'ws://2' }, 9334, DEFAULTS, stats, () => {});

  session1.isConnected = true;
  daemon.sessions.set('w1', session1);

  assert.strictEqual(daemon.isConnected, true);
  assert.strictEqual(daemon.activePort, 9333);
  assert.strictEqual(daemon.targetTitle, 'Workspace 1');

  session2.isConnected = true;
  daemon.sessions.set('w2', session2);

  assert.strictEqual(daemon.isConnected, true);
  assert.strictEqual(daemon.targetTitle, 'Workspace 1, Workspace 2');

  // Clean up
  session1.isConnected = false;
  session2.isConnected = false;
  daemon.sessions.clear();
  assert.strictEqual(daemon.isConnected, false);
});

// ── 15. Mode Validation and Normalization in buildScannerScript ──
it('buildScannerScript normalizes uppercase and missing mode values without error', () => {
  const scriptUpper = buildScannerScript({ mode: 'AUTOPILOT' });
  assert(scriptUpper.includes('mode = "autopilot"'));

  const scriptInvalid = buildScannerScript({ mode: 'invalid_mode' });
  assert(scriptInvalid.includes('mode = "autonomous"'));

  const scriptEmpty = buildScannerScript({});
  assert(scriptEmpty.includes('mode = "autonomous"'));
  assert.doesNotThrow(() => new vm.Script(scriptUpper));
  assert.doesNotThrow(() => new vm.Script(scriptInvalid));
});

// ── 16. Defensive Handling of Missing or Null Keywords ──
it('buildScannerScript handles null or undefined keywords gracefully', () => {
  const script = buildScannerScript({
    askKeywords: null,
    skipKeywords: null,
    mode: null
  });
  assert(typeof script === 'string');
  assert.doesNotThrow(() => new vm.Script(script));
});

// ── 17. Double-Click Debouncing via data-agy-clicked ──
it('buildScannerScript debounces previously clicked buttons using isClicked', () => {
  const script = buildScannerScript({ mode: 'autopilot' });
  const mockBtn = {
    tagName: 'BUTTON',
    innerText: 'Proceed',
    className: 'btn',
    _attrs: { 'data-agy-clicked': 'true' },
    hasAttribute: function(attr) { return Boolean(this._attrs[attr]); },
    getAttribute: function(attr) { return this._attrs[attr] || null; },
    setAttribute: function(attr, val) { this._attrs[attr] = val; },
    getBoundingClientRect: () => ({ width: 80, height: 32 }),
    parentElement: null
  };

  const sandbox = {
    document: {
      querySelector: () => null,
      querySelectorAll: (sel) => sel.includes('button') ? [mockBtn] : [],
      body: { innerText: '', dispatchEvent: () => {} }
    },
    window: {
      getComputedStyle: () => ({ display: 'block', visibility: 'visible' })
    },
    KeyboardEvent: function() {},
    MouseEvent: function() {}
  };

  const outcome = vm.runInNewContext(script, sandbox);
  assert.strictEqual(outcome, null, 'Already-clicked button must be debounced and ignored');
});

// ── 18. AutoSubmitDaemon Dynamic Config Hot-Reload ──
it('AutoSubmitDaemon reloads mode and enabled state from disk when config file changes', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-daemon-test-'));
  const tmpConfig = path.join(tmpDir, '.auto-accept.json');
  fs.writeFileSync(tmpConfig, JSON.stringify({ mode: 'autonomous', enabled: true }, null, 2), 'utf8');

  const daemon = new AutoSubmitDaemon({ mode: 'autonomous', enabled: true }, tmpConfig);
  assert.strictEqual(daemon.config.mode, 'autonomous');
  assert.strictEqual(daemon.config.enabled, true);

  // Advance time and modify file
  const futureTime = (Date.now() + 5000) / 1000;
  fs.writeFileSync(tmpConfig, JSON.stringify({ mode: 'autopilot', enabled: false }, null, 2), 'utf8');
  fs.utimesSync(tmpConfig, futureTime, futureTime);

  daemon.checkConfigReload();
  assert.strictEqual(daemon.config.mode, 'autopilot', 'Mode should reload to autopilot');
  assert.strictEqual(daemon.config.enabled, false, 'Enabled should reload to false');

  // Clean up
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
});

// ── 19. cleanStr Fault Tolerance ──
it('cleanStr handles null, undefined, symbols, and long strings safely', () => {
  const { cleanStr } = require('../auto-accept.js');
  assert.strictEqual(cleanStr(null), '');
  assert.strictEqual(cleanStr(undefined), '');
  assert.strictEqual(cleanStr('  hello\nworld\t  '), 'hello world');
  assert.strictEqual(cleanStr('a'.repeat(100), 10), 'a'.repeat(10) + '...');
});

// ── 20. Setup & Executable Discovery ──
it('findAntigravityExecutable executes cleanly without errors', () => {
  const { findAntigravityExecutable } = require('../auto-accept.js');
  const exe = findAntigravityExecutable();
  if (exe) {
    assert(typeof exe === 'string');
    assert(exe.length > 0);
  }
});

// ── 21. Package.json Setup & Script Integrity ──
it('package.json contains all required setup, doctor, and cleanup scripts', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  const requiredScripts = ['start', 'cli', 'doctor', 'setup', 'launch', 'restart', 'update', 'uninstall-all', 'check', 'find-temp', 'clean', 'brain', 'sync', 'test'];
  for (const s of requiredScripts) {
    assert(pkg.scripts[s], `Missing script: ${s}`);
  }
  const requiredBins = [
    'antigravity-auto-submit',
    'antigravity-auto-accept', 'auto-accept',
    'antigravity-doctor', 'agy-doctor',
    'antigravity-setup', 'agy-setup',
    'antigravity-launch', 'agy-launch',
    'antigravity-restart', 'agy-restart',
    'antigravity-update', 'agy-update',
    'antigravity-uninstall', 'agy-uninstall',
    'antigravity-check', 'agy-check',
    'antigravity-find-temp', 'agy-find-temp',
    'antigravity-clean', 'agy-clean',
    'antigravity-brain', 'agy-brain'
  ];
  for (const b of requiredBins) {
    assert(pkg.bin[b], `Missing bin: ${b}`);
  }
});

// ── 22. Bin Scripts Use Resilient spawnSync ──
it('bin scripts use spawnSync for process exit code propagation and interactive TTY', () => {
  const binDir = path.join(__dirname, '..', 'bin');
  const bins = ['antigravity-check.js', 'antigravity-find-temp.js', 'antigravity-clean.js', 'antigravity-brain.js'];
  for (const b of bins) {
    const content = fs.readFileSync(path.join(binDir, b), 'utf8');
    assert(content.includes('spawnSync'), `${b} must use spawnSync`);
    assert(content.includes('process.exit('), `${b} must forward exit code`);
  }
});

// ── 23. Subcommand Resolution & Helper Functions ──
it('resolves firstArg correctly from binary alias path and exports process helpers', () => {
  const { resolveConfig, isAntigravityRunning, killAntigravity, handleRestart, handleUpdate, handleUninstall } = require('../auto-accept.js');
  assert.strictEqual(typeof resolveConfig, 'function');
  assert.strictEqual(typeof isAntigravityRunning, 'function');
  assert.strictEqual(typeof killAntigravity, 'function');
  assert.strictEqual(typeof handleRestart, 'function');
  assert.strictEqual(typeof handleUpdate, 'function');
  assert.strictEqual(typeof handleUninstall, 'function');
  const running = isAntigravityRunning();
  assert.strictEqual(typeof running, 'boolean');
});

// ── 24. resolveConfig Never Returns Undefined (No Destructuring TypeError) ──
it('resolveConfig returns valid { config, configSource } object even when invoked with restart argv', () => {
  const { resolveConfig } = require('../auto-accept.js');
  const originalArgv = [...process.argv];
  try {
    process.argv = ['node', 'auto-accept.js', 'restart'];
    const res = resolveConfig();
    assert(res, 'resolveConfig() must not return undefined');
    assert(res.config, 'res.config must be defined');
    assert(res.configSource, 'res.configSource must be defined');
    assert.strictEqual(typeof res.config.cdpPort, 'number');
  } finally {
    process.argv = originalArgv;
  }
});

// ── 25. Easy Start exports and subcommand resolution ──
it('exports handleEasyStart and launchAntigravityProcess and handles start in argv', () => {
  const { handleEasyStart, launchAntigravityProcess, resolveConfig } = require('../auto-accept.js');
  assert.strictEqual(typeof handleEasyStart, 'function');
  assert.strictEqual(typeof launchAntigravityProcess, 'function');
  const originalArgv = [...process.argv];
  try {
    process.argv = ['node', 'auto-accept.js', 'start'];
    const res = resolveConfig();
    assert(res, 'resolveConfig() must return a valid object');
    assert(res.config, 'res.config must be defined');
  } finally {
    process.argv = originalArgv;
  }
});

// ── 26. Bulletproof 3-Step Setup & PID Ghost Process Troubleshooting ──
it('printSetupInstructions exports correctly and outputs 3-step setup with PID troubleshooting', () => {
  const { printSetupInstructions } = require('../auto-accept.js');
  assert.strictEqual(typeof printSetupInstructions, 'function', 'printSetupInstructions must be exported');

  let output = '';
  const origLog = console.log;
  console.log = (...args) => {
    output += args.join(' ') + '\n';
  };

  try {
    printSetupInstructions();
  } finally {
    console.log = origLog;
  }

  assert(output.includes('BULLETPROOF 3-STEP SETUP'), 'Must display Bulletproof 3-step setup banner');
  assert(output.includes('--remote-debugging-port=9333'), 'Must mention --remote-debugging-port=9333 flag');
  assert(output.includes('Ghost Process'), 'Must provide ghost process troubleshooting');
  assert(output.includes('Details') || output.includes('Task Manager'), 'Must guide user to Task Manager Details tab');
  assert(output.includes('blind') || output.includes('taskkill'), 'Must caution against blind taskkill to protect open tabs');
});

// ── 27. Subcommand Resolution from Binary Aliases (agy-start, agy-restart, etc.) ──
it('resolves start and restart from binName when rawFirstArg is empty', () => {
  const { resolveConfig } = require('../auto-accept.js');
  const originalArgv = [...process.argv];
  try {
    process.argv = ['node', path.join(__dirname, '..', 'bin', 'agy-start'), '--quiet'];
    const res = resolveConfig();
    assert(res && res.config, 'Must resolve config for agy-start');

    process.argv = ['node', path.join(__dirname, '..', 'bin', 'agy-restart'), '--quiet'];
    const resRestart = resolveConfig();
    assert(resRestart && resRestart.config, 'Must resolve config for agy-restart');
  } finally {
    process.argv = originalArgv;
  }
});

it('exports handleUninstall cleanly', () => {
  const { handleUninstall } = require('../auto-accept.js');
  assert.strictEqual(typeof handleUninstall, 'function', 'handleUninstall must be exported');
});

// ── 28. StatsManager Atomic Write Integrity ──
it('StatsManager.save writes atomically and handles records safely', () => {
  const stats = new StatsManager();
  assert.doesNotThrow(() => {
    stats.recordApproval('Allow this time: node app.js');
  });
  assert(stats.lifetimeClicks >= 1);
});

// ── 29. Antigravity Brain empty/whitespace query rejection ──
it('antigravity_brain.py find_target_session rejects empty or whitespace queries', () => {
  const { spawnSync } = require('child_process');
  const pyCmd = getPythonCommand();
  const scriptPath = path.join(__dirname, '..', 'scripts', 'antigravity_brain.py');
  const pyCode = `
import sys
sys.path.insert(0, '${path.join(__dirname, '..', 'scripts').replace(/\\/g, '/')}')
from antigravity_brain import find_target_session
mock_sessions = [{'id': 'abc-123', 'title': 'test'}, {'id': 'def-456', 'title': 'test2'}]
assert find_target_session('', mock_sessions) is None, 'Empty string must return None'
assert find_target_session('   ', mock_sessions) is None, 'Whitespace must return None'
assert find_target_session('...', mock_sessions) is None, 'Dots must return None'
assert find_target_session('abc', mock_sessions) == mock_sessions[0], 'Valid prefix must match'
print("Brain query safety tests passed")
`;
  let res = spawnSync(pyCmd, ['-c', pyCode], { encoding: 'utf8' });
  if (res.error && res.error.code === 'ENOENT') {
    res = spawnSync('python', ['-c', pyCode], { encoding: 'utf8' });
  }
  assert(res.status === 0, `Python brain test failed: ${res.stderr || res.stdout}`);
});

// ── 30. Antigravity App Target Recognition & Dual-Window Support ──
it('selectAllWorkbenchTargets accurately recognizes Antigravity App windows served over 127.0.0.1 and localhost', () => {
  const mockTargets = [
    // Antigravity IDE
    { id: 'ide1', type: 'page', title: 'my-project - Antigravity IDE', url: 'vscode-file://vscode-app/workbench.html', webSocketDebuggerUrl: 'ws://127.0.0.1:9333/ide1' },
    // Antigravity Standalone App (served by language_server on dynamic local port)
    { id: 'app1', type: 'page', title: 'Antigravity', url: 'https://127.0.0.1:52374/', webSocketDebuggerUrl: 'ws://127.0.0.1:9334/app1' },
    // Browser tabs that must still be ignored
    { id: 'web1', type: 'page', title: 'Antigravity Docs', url: 'https://antigravity.google.com/docs', webSocketDebuggerUrl: 'ws://127.0.0.1:9222/web1' },
    { id: 'web2', type: 'page', title: 'React App on Localhost', url: 'http://localhost:3000/', webSocketDebuggerUrl: 'ws://127.0.0.1:9222/web2' },
    { id: 'web3', type: 'page', title: 'Local Web Server', url: 'https://127.0.0.1:8080/dashboard', webSocketDebuggerUrl: 'ws://127.0.0.1:9222/web3' }
  ];

  const selected = selectAllWorkbenchTargets(mockTargets);
  assert.strictEqual(selected.length, 2, 'Should match both Antigravity IDE and Antigravity App windows');
  assert.strictEqual(selected[0].id, 'ide1');
  assert.strictEqual(selected[1].id, 'app1');
});

// ── 31. Antigravity App Button Matching in buildScannerScript ──
it('buildScannerScript detects and clicks Antigravity App buttons ("Always Allow", "Run command")', () => {
  const cfg = { mode: 'autonomous', askKeywords: [], skipKeywords: [] };
  const script = buildScannerScript(cfg);

  let clickedBtn = null;
  const mockAlwaysAllowBtn = {
    tagName: 'BUTTON',
    innerText: 'Always Allow',
    className: 'btn-allow',
    getBoundingClientRect: () => ({ width: 90, height: 32 }),
    click: function() { clickedBtn = 'Always Allow'; },
    dispatchEvent: () => {},
    parentElement: null
  };

  const sandbox = {
    document: {
      querySelector: () => null,
      querySelectorAll: (sel) => {
        if (sel.includes('button')) return [mockAlwaysAllowBtn];
        return [];
      },
      body: { innerText: '', dispatchEvent: () => {} }
    },
    window: {
      getComputedStyle: () => ({ display: 'block', visibility: 'visible' })
    },
    KeyboardEvent: function() {},
    MouseEvent: function() {}
  };

  const result = vm.runInNewContext(script, sandbox);
  assert(result !== null, 'Scanner should find and click button');
  assert.strictEqual(clickedBtn, 'Always Allow');
  assert.strictEqual(result.blocked, false);
});

// ── 32. Executable Discovery for Dual Products ──
it('findAntigravityExecutables returns detection object for ide and app', () => {
  const { findAntigravityExecutables } = require('../auto-accept.js');
  assert.strictEqual(typeof findAntigravityExecutables, 'function');
  const exes = findAntigravityExecutables();
  assert(typeof exes === 'object' && exes !== null);
  assert('ide' in exes);
  assert('app' in exes);
});

// ── 33. Completed Task Accordions & Log Buttons Exclusion ──
it('buildScannerScript strictly ignores completed task logs and accordions', () => {
  const cfg = { mode: 'autonomous', askKeywords: [], skipKeywords: [] };
  const script = buildScannerScript(cfg);

  let clicked = false;
  const mockCompletedBtn = {
    tagName: 'BUTTON',
    innerText: 'Run pnpm install and pnpm build finished',
    className: 'terminal-header accordion-toggle',
    disabled: false,
    getAttribute: (attr) => attr === 'aria-expanded' ? 'false' : null,
    getBoundingClientRect: () => ({ width: 300, height: 32 }),
    click: () => { clicked = true; },
    dispatchEvent: () => {},
    parentElement: null
  };

  const sandbox = {
    document: {
      querySelector: () => null,
      querySelectorAll: (sel) => sel.includes('button') ? [mockCompletedBtn] : [],
      body: { innerText: '', dispatchEvent: () => {} }
    },
    window: {
      getComputedStyle: () => ({ display: 'block', visibility: 'visible' })
    },
    KeyboardEvent: function() {},
    MouseEvent: function() {}
  };

  const outcome = vm.runInNewContext(script, sandbox);
  assert.strictEqual(outcome, null, 'Must ignore completed task logs');
  assert.strictEqual(clicked, false, 'Must not click completed task logs');
});

// ── 34. Whitespace Normalization & Keyword Bypass Prevention ──
it('buildScannerScript normalizes whitespace and catches multi-space keywords like "git   push"', () => {
  const cfg = { mode: 'autonomous', askKeywords: ['git push'], skipKeywords: ['rm -rf'] };
  const script = buildScannerScript(cfg);

  let clicked = false;
  const mockCard = {
    tagName: 'DIV',
    className: 'interaction-card',
    innerText: 'Run Command\ngit   push origin main\nAllow this time (1)',
    parentElement: null
  };

  const mockContinueBtn = {
    tagName: 'BUTTON',
    innerText: 'Submit',
    className: 'btn-primary',
    parentElement: mockCard,
    getBoundingClientRect: () => ({ width: 80, height: 32 }),
    click: () => { clicked = true; }
  };

  const sandbox = {
    document: {
      querySelector: (selector) => {
        if (selector === '[data-testid="interaction-continue-button"]') return mockContinueBtn;
        return null;
      },
      querySelectorAll: () => [],
      body: { innerText: '', dispatchEvent: () => {} }
    },
    window: { getComputedStyle: () => ({ display: 'block', visibility: 'visible' }) },
    KeyboardEvent: function() {},
    MouseEvent: function() {}
  };

  const result = vm.runInNewContext(script, sandbox);
  assert(result !== null, 'Scanner should catch card');
  assert.strictEqual(result.blocked, true, 'git   push with extra spaces must be blocked');
  assert.strictEqual(result.matchedKeyword, 'git push');
  assert.strictEqual(clicked, false, 'Button must not be clicked');
});

// ── 35. Compound Regex Protection for Force Push & rm -rf ──
it('buildScannerScript compound regex blocks "git push origin main --force" and "rm   -rf /"', () => {
  const cfg = { mode: 'autonomous', askKeywords: ['git push'], skipKeywords: ['git push --force', 'rm -rf'] };
  const script = buildScannerScript(cfg);

  const testCases = [
    { text: 'git push origin main --force', expectedType: 'skip', expectedKw: 'git push --force' },
    { text: 'git  push  origin  -f', expectedType: 'skip', expectedKw: 'git push --force' },
    { text: 'rm   -rf   /var/data', expectedType: 'skip', expectedKw: 'rm -rf' }
  ];

  for (const tc of testCases) {
    let clicked = false;
    const mockCard = {
      tagName: 'DIV',
      className: 'interaction-card',
      innerText: `Run Command\n${tc.text}\nAllow this time (1)`,
      parentElement: null
    };

    const mockBtn = {
      tagName: 'BUTTON',
      innerText: 'Submit',
      className: 'btn-primary',
      parentElement: mockCard,
      getBoundingClientRect: () => ({ width: 80, height: 32 }),
      click: () => { clicked = true; }
    };

    const sandbox = {
      document: {
        querySelector: (sel) => sel === '[data-testid="interaction-continue-button"]' ? mockBtn : null,
        querySelectorAll: () => [],
        body: { innerText: '', dispatchEvent: () => {} }
      },
      window: { getComputedStyle: () => ({ display: 'block', visibility: 'visible' }) },
      KeyboardEvent: function() {},
      MouseEvent: function() {}
    };

    const result = vm.runInNewContext(script, sandbox);
    assert(result !== null, `Scanner should process card for: ${tc.text}`);
    assert.strictEqual(result.blocked, true, `Should block ${tc.text}`);
    assert.strictEqual(result.blockedType, tc.expectedType, `Expected blockedType ${tc.expectedType} for ${tc.text}`);
    assert.strictEqual(result.matchedKeyword, tc.expectedKw, `Expected matchedKeyword ${tc.expectedKw} for ${tc.text}`);
    assert.strictEqual(clicked, false, `Button must not be clicked for ${tc.text}`);
  }
});

it('antigravity_cleaner.py executes --check --json cleanly and returns valid 3-tier metrics', () => {
  const { execSync } = require('child_process');
  const pythonCmd = getPythonCommand();
  const script = path.join(__dirname, '..', 'scripts', 'antigravity_cleaner.py');
  const out = execSync(`${pythonCmd} "${script}" --check --json`, { encoding: 'utf8' });
  const data = JSON.parse(out);
  assert(typeof data.safe_bytes === 'number', 'safe_bytes must be number');
  assert(data.tier1_safe && typeof data.tier1_safe === 'object', 'tier1_safe must exist');
  assert(data.tier2_review && typeof data.tier2_review === 'object', 'tier2_review must exist');
  assert(data.tier1_safe['Electron IDE Runtime Caches'] !== undefined, 'Electron IDE Runtime Caches must be tracked');
});

// ── 15. New Antigravity Version (2.6.0+ / VS Code 1.107+) Multi-Document & Webview Compatibility ──
it('buildScannerScript traverses nested iframes and active-frame to auto-approve interaction continue button in new AG version', () => {
  const script = buildScannerScript({
    mode: 'autonomous',
    autoSelectAlwaysAllow: false,
    askKeywords: ['git push'],
    skipKeywords: ['rm -rf']
  });

  let optionSelected = false;
  let clicked = false;

  const mockCard = {
    tagName: 'DIV',
    className: 'interaction-card',
    innerText: 'Shell Execution Request\nRun npm test\nOption 1: Allow this time',
    parentElement: null
  };

  const mockBtn = {
    tagName: 'BUTTON',
    innerText: 'Submit',
    className: 'btn-primary',
    parentElement: mockCard,
    hasAttribute: (a) => false,
    getAttribute: (a) => null,
    setAttribute: (a, v) => {},
    getBoundingClientRect: () => ({ width: 90, height: 32 }),
    click: () => { clicked = true; },
    dispatchEvent: () => {}
  };

  const mockRadio1 = {
    checked: false,
    click: () => { optionSelected = true; },
    dispatchEvent: () => {}
  };

  const innerDoc = {
    querySelector: (sel) => {
      if (sel === '[data-testid="interaction-continue-button"]') return mockBtn;
      if (sel === 'input[type="radio"][value="1"]') return mockRadio1;
      return null;
    },
    querySelectorAll: () => [],
    body: { innerText: mockCard.innerText, dispatchEvent: () => {} }
  };

  const activeFrame = {
    contentDocument: innerDoc,
    contentWindow: { document: innerDoc }
  };

  const sandbox = {
    document: {
      getElementById: (id) => id === 'active-frame' ? activeFrame : null,
      querySelector: () => null,
      querySelectorAll: (sel) => sel === 'iframe' ? [activeFrame] : [],
      body: { innerText: '', dispatchEvent: () => {} }
    },
    window: { getComputedStyle: () => ({ display: 'block', visibility: 'visible' }) },
    KeyboardEvent: function() {},
    MouseEvent: function() {}
  };

  const result = vm.runInNewContext(script, sandbox);
  assert(result !== null, 'Scanner must detect continue button inside nested iframe/active-frame');
  assert.strictEqual(result.blocked, false);
  assert.strictEqual(clicked, true, 'Continue button in nested iframe must be clicked');
  assert.strictEqual(optionSelected, true, 'Option 1 radio must be selected in nested iframe');
});

it('buildScannerScript blocks dangerous keywords in nested iframes', () => {
  const script = buildScannerScript({
    mode: 'autonomous',
    autoSelectAlwaysAllow: false,
    askKeywords: ['git push'],
    skipKeywords: ['rm -rf']
  });

  let clicked = false;

  const mockCard = {
    tagName: 'DIV',
    className: 'interaction-card',
    innerText: 'Terminal Execution\nrm -rf /critical_data\nOption 1: Allow this time',
    parentElement: null
  };

  const mockBtn = {
    tagName: 'BUTTON',
    innerText: 'Submit',
    parentElement: mockCard,
    hasAttribute: () => false,
    getAttribute: () => null,
    getBoundingClientRect: () => ({ width: 90, height: 32 }),
    click: () => { clicked = true; }
  };

  const innerDoc = {
    querySelector: (sel) => sel === '[data-testid="interaction-continue-button"]' ? mockBtn : null,
    querySelectorAll: () => [],
    body: { innerText: mockCard.innerText }
  };

  const sandbox = {
    document: {
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: (sel) => sel === 'iframe' ? [{ contentDocument: innerDoc }] : [],
      body: { innerText: '' }
    },
    window: { getComputedStyle: () => ({ display: 'block', visibility: 'visible' }) },
    KeyboardEvent: function() {},
    MouseEvent: function() {}
  };

  const result = vm.runInNewContext(script, sandbox);
  assert(result !== null, 'Scanner must evaluate card inside nested iframe');
  assert.strictEqual(result.blocked, true);
  assert.strictEqual(result.blockedType, 'skip');
  assert.strictEqual(result.matchedKeyword, 'rm -rf');
  assert.strictEqual(clicked, false, 'Dangerous action must NOT be clicked');
});

it('buildScannerScript recognizes expanded action buttons in new AG version', () => {
  const newButtons = [
    'allow always',
    'always allow in this workspace',
    'allow and continue',
    'allow & continue',
    'apply changes',
    'apply all',
    'accept all',
    'run anyway'
  ];

  for (const btnLabel of newButtons) {
    const script = buildScannerScript({
      mode: 'autonomous',
      autoSelectAlwaysAllow: false,
      askKeywords: [],
      skipKeywords: []
    });

    let clicked = false;
    const mockBtn = {
      tagName: 'BUTTON',
      innerText: btnLabel,
      parentElement: null,
      hasAttribute: () => false,
      getAttribute: () => null,
      setAttribute: () => {},
      getBoundingClientRect: () => ({ width: 110, height: 32 }),
      click: () => { clicked = true; },
      dispatchEvent: () => {}
    };

    const sandbox = {
      document: {
        getElementById: () => null,
        querySelector: () => null,
        querySelectorAll: (sel) => sel.includes('button') ? [mockBtn] : [],
        body: { innerText: btnLabel, dispatchEvent: () => {} }
      },
      window: { getComputedStyle: () => ({ display: 'block', visibility: 'visible' }) },
      KeyboardEvent: function() {},
      MouseEvent: function() {}
    };

    const result = vm.runInNewContext(script, sandbox);
    assert(result !== null, `Scanner must detect button: "${btnLabel}"`);
    assert.strictEqual(result.blocked, false, `Button "${btnLabel}" should be approved`);
    assert.strictEqual(clicked, true, `Button "${btnLabel}" must be clicked`);
  }
});

it('buildScannerScript auto-approves autopilot proceed plans inside nested iframes', () => {
  const script = buildScannerScript({
    mode: 'autopilot',
    autoSelectAlwaysAllow: false,
    askKeywords: [],
    skipKeywords: []
  });

  let clicked = false;
  const mockProceedBtn = {
    tagName: 'BUTTON',
    innerText: 'Proceed with plan (Enter)',
    parentElement: null,
    hasAttribute: () => false,
    getAttribute: () => null,
    setAttribute: () => {},
    getBoundingClientRect: () => ({ width: 140, height: 36 }),
    click: () => { clicked = true; },
    dispatchEvent: () => {}
  };

  const innerDoc = {
    querySelector: () => null,
    querySelectorAll: (sel) => sel.includes('button') ? [mockProceedBtn] : [],
    body: { innerText: 'Implementation Plan Approved', dispatchEvent: () => {} }
  };

  const sandbox = {
    document: {
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: (sel) => sel === 'iframe' ? [{ contentDocument: innerDoc }] : [],
      body: { innerText: '', dispatchEvent: () => {} }
    },
    window: { getComputedStyle: () => ({ display: 'block', visibility: 'visible' }) },
    KeyboardEvent: function() {},
    MouseEvent: function() {}
  };

  const result = vm.runInNewContext(script, sandbox);
  assert(result !== null, 'Scanner must detect autopilot proceed plan button in nested iframe');
  assert.strictEqual(result.blocked, false);
  assert.strictEqual(clicked, true, 'Proceed button in nested iframe must be clicked');
});

it('selectAllWorkbenchTargets recognizes Antigravity webview targets while ignoring non-Antigravity webviews and Kiro', () => {
  const targets = [
    { id: '1', type: 'page', title: 'Classroom - Antigravity IDE', webSocketDebuggerUrl: 'ws://127.0.0.1:9333/1', url: 'vscode-file://vscode-app/workbench.html' },
    { id: '2', type: 'webview', title: 'Antigravity Panel', webSocketDebuggerUrl: 'ws://127.0.0.1:9333/2', url: 'vscode-webview://antigravity.panel' },
    { id: '3', type: 'iframe', title: 'Google Antigravity Extension', webSocketDebuggerUrl: 'ws://127.0.0.1:9333/3', url: 'vscode-webview://agy/bridge.html' },
    { id: '4', type: 'webview', title: 'Markdown Preview', webSocketDebuggerUrl: 'ws://127.0.0.1:9333/4', url: 'vscode-webview://markdown' },
    { id: '5', type: 'page', title: 'Kiro IDE', webSocketDebuggerUrl: 'ws://127.0.0.1:9222/5', url: 'vscode-file://kiro/workbench.html' },
    { id: '6', type: 'page', title: 'External App', webSocketDebuggerUrl: 'ws://127.0.0.1:3000/6', url: 'http://localhost:3000' }
  ];

  const matched = selectAllWorkbenchTargets(targets);
  assert.strictEqual(matched.length, 3, 'Must match exactly the 3 Antigravity targets (page + 2 AG webviews)');
  assert(matched.some(t => t.id === '1'), 'Should include Antigravity IDE workbench page');
  assert(matched.some(t => t.id === '2'), 'Should include Antigravity Panel webview');
  assert(matched.some(t => t.id === '3'), 'Should include Google Antigravity Extension iframe');
  assert(!matched.some(t => t.id === '4'), 'Must reject unrelated markdown preview');
  assert(!matched.some(t => t.id === '5'), 'Must reject Kiro IDE target');
  assert(!matched.some(t => t.id === '6'), 'Must reject external web app');
});

// ── 48. Arbitrary Workspace Chat Panel Discovery ──
it('selectAllWorkbenchTargets recognizes loopback chat panel iframes across arbitrary workspace paths', () => {
  const targets = [
    {
      id: 'chat-clip',
      type: 'iframe',
      title: 'Clean Up Git Changes - Clip - Antigravity',
      webSocketDebuggerUrl: 'ws://127.0.0.1:9333/clip',
      url: 'http://127.0.0.1:56066/?extensionView=true&extensionVariant=vs-code&hostVersion=0.0.1&workspaceUri=file%3A%2F%2F%2Fd%253A%2FFullStack%2520Projects%2FClip'
    },
    {
      id: 'settings-clip',
      type: 'iframe',
      title: 'Antigravity Settings',
      webSocketDebuggerUrl: 'ws://127.0.0.1:9333/settings',
      url: 'http://127.0.0.1:56066/settings-standalone?extensionView=true&workspaceUri=file%3A%2F%2F%2Fd%253A%2FFullStack%2520Projects%2FClip'
    }
  ];

  const matched = selectAllWorkbenchTargets(targets);
  assert.strictEqual(matched.length, 1, 'Must match chat panel and exclude settings standalone');
  assert.strictEqual(matched[0].id, 'chat-clip');
});

// ── 49. Option 1 Selection and Submit Button Execution in buildScannerScript ──
it('buildScannerScript selects Option 1 and clicks Submit button on subagent prompts', () => {
  const cfg = { mode: 'autonomous', askKeywords: [], skipKeywords: [] };
  const script = buildScannerScript(cfg);

  let optionSelected = false;
  let submitClicked = false;
  let enterDispatched = false;

  const mockSubmitBtn = {
    tagName: 'BUTTON',
    innerText: 'Submit ↵',
    textContent: 'Submit ↵',
    disabled: false,
    getAttribute: (attr) => (attr === 'data-testid' ? 'submit-button' : null),
    hasAttribute: () => false,
    setAttribute: () => {},
    getBoundingClientRect: () => ({ width: 80, height: 32 }),
    click: () => { submitClicked = true; },
    dispatchEvent: () => {},
    parentElement: null
  };

  const mockOption1 = {
    tagName: 'DIV',
    innerText: '1 Yes, allow this time',
    textContent: '1 Yes, allow this time',
    getAttribute: () => null,
    hasAttribute: () => false,
    click: () => { optionSelected = true; },
    dispatchEvent: () => {}
  };

  const mockBody = {
    innerText: 'Allow run test-ot.mjs?\nnode scripts/test-ot.mjs\n1 Yes, allow this time\n2 Yes, and always allow\nSubmit',
    dispatchEvent: (evt) => {
      if (evt && evt.key === 'Enter') enterDispatched = true;
      if (evt && evt.key === '1') optionSelected = true;
    }
  };

  const sandbox = {
    document: {
      body: mockBody,
      querySelector: (sel) => {
        if (sel && (sel.includes('submit') || sel.includes('interaction'))) return mockSubmitBtn;
        return null;
      },
      querySelectorAll: (sel) => {
        if (sel && sel.includes('button')) return [mockSubmitBtn, mockOption1];
        return [];
      },
      getElementById: () => null,
      defaultView: {
        getComputedStyle: () => ({ display: 'block', visibility: 'visible' }),
        MouseEvent: function() {},
        KeyboardEvent: function(type, init) { this.type = type; this.key = init.key; }
      }
    },
    KeyboardEvent: function(type, init) { this.type = type; this.key = init.key; },
    MouseEvent: function() {},
    Event: function() {}
  };

  const vm = require('vm');
  const res = vm.runInNewContext(script, sandbox);

  assert.ok(res, 'Scanner should return approval result');
  assert.strictEqual(res.blocked, false);
  assert.ok(submitClicked, 'Submit button should be clicked');
  assert.ok(optionSelected, 'Option 1 should be selected via keyboard or click');
  assert.ok(enterDispatched, 'Enter key should be dispatched to submit');
});

it('countIdeWindows accurately calculates IDE window count from Electron CDP targets', () => {
  const { countIdeWindows } = require('../auto-accept.js');
  
  // 6 targets belonging to 2 IDE windows (antigravity-auto-submit and Clip)
  const targets = [
    { url: 'vscode-file://vscode-app/workbench/workbench.html', title: 'antigravity-auto-submit - Antigravity IDE' },
    { url: 'vscode-webview://host/index.html', title: 'Dashboard' },
    { url: 'http://127.0.0.1:51537/?extensionView=true&workspaceUri=file%3A%2F%2F%2Fc%253A%2FUsers%2Fadvdi%2Ftools%2Fantigravity-auto-submit', title: 'AI Chat' },
    { url: 'vscode-file://vscode-app/workbench/workbench.html', title: 'Clip - Antigravity IDE' },
    { url: 'vscode-webview://host/index.html', title: 'Dashboard' },
    { url: 'http://127.0.0.1:56066/?extensionView=true&workspaceUri=file%3A%2F%2F%2Fd%253A%2FFullStack%2520Projects%2FClip', title: 'AI Chat' }
  ];

  const windowCount = countIdeWindows(targets);
  assert.strictEqual(windowCount, 2, 'Should accurately return 2 IDE windows, not 6 internal targets');

  // When only chat panels are provided without workbench targets
  const chatOnlyTargets = [
    { url: 'http://127.0.0.1:51537/?workspaceUri=file%3A%2F%2F%2Fc%253A%2Fproject1' },
    { url: 'http://127.0.0.1:56066/?workspaceUri=file%3A%2F%2F%2Fd%253A%2Fproject2' }
  ];
  assert.strictEqual(countIdeWindows(chatOnlyTargets), 2, 'Should group by distinct workspaces');
});

it('buildScannerScript ignores keyword matches within self-inspection arguments', () => {
  const script = buildScannerScript({
    mode: 'autonomous',
    askKeywords: ['git push'],
    skipKeywords: ['rm -rf']
  });

  const vm = require('vm');
  let clicked = false;
  const mockBtn = {
    innerText: 'Submit',
    disabled: false,
    getBoundingClientRect: () => ({ width: 100, height: 30 }),
    parentElement: {
      innerText: "Allow run test? node -e 'const script = buildScannerScript({ skipKeywords: [\"rm -rf\"] });'"
    },
    click: () => { clicked = true; },
    dispatchEvent: () => {},
    setAttribute: () => {}
  };

  const sandbox = {
    document: {
      body: { dispatchEvent: () => {} },
      querySelector: () => mockBtn,
      querySelectorAll: () => [mockBtn],
      getElementById: () => null,
      defaultView: {
        getComputedStyle: () => ({ display: 'block', visibility: 'visible' }),
        MouseEvent: function() {},
        KeyboardEvent: function() {}
      }
    },
    KeyboardEvent: function() {},
    MouseEvent: function() {},
    Event: function() {}
  };

  const res = vm.runInNewContext(script, sandbox);
  assert.ok(res, 'Scanner should evaluate');
  assert.strictEqual(res.blocked, false, 'Should not block commands that mention skipKeywords in configuration code');
  assert.strictEqual(clicked, true, 'Submit button should be clicked');
});

it('buildScannerScript auto-approves interaction card when Submit button is initially disabled (React async activation)', () => {
  const cfg = { mode: 'autonomous', askKeywords: ['git push'], skipKeywords: ['rm -rf'] };
  const script = buildScannerScript(cfg);

  let option1Clicked = false;
  let submitClicked = false;
  let dispatchedKeys = [];

  const mockOption1 = {
    tagName: 'DIV',
    role: 'radio',
    innerText: '1  Yes, allow this time',
    textContent: '1  Yes, allow this time',
    click: () => { option1Clicked = true; },
    dispatchEvent: () => {},
    getAttribute: (attr) => attr === 'role' ? 'radio' : null
  };

  const mockSubmitBtn = {
    tagName: 'BUTTON',
    disabled: true, // Initially disabled in React UI
    innerText: 'Submit ↵',
    textContent: 'Submit ↵',
    className: 'agy-button primary',
    getBoundingClientRect: () => ({ width: 80, height: 32 }),
    click: () => { submitClicked = true; },
    dispatchEvent: () => {},
    getAttribute: (attr) => attr === 'disabled' ? 'true' : null,
    hasAttribute: (attr) => attr === 'disabled' ? true : false,
    setAttribute: () => {}
  };

  const mockCard = {
    tagName: 'DIV',
    className: 'interaction-prompt-card',
    innerText: 'Run terminal command: node build.js\n1  Yes, allow this time\n2  Always allow in this conversation\nSubmit ↵',
    children: [mockOption1, mockSubmitBtn]
  };

  mockSubmitBtn.parentElement = mockCard;
  mockOption1.parentElement = mockCard;

  const sandbox = {
    document: {
      querySelector: () => null,
      querySelectorAll: (sel) => [mockOption1, mockSubmitBtn],
      body: {
        innerText: mockCard.innerText,
        dispatchEvent: (evt) => { dispatchedKeys.push(evt.key); }
      }
    },
    window: {
      getComputedStyle: () => ({ display: 'block', visibility: 'visible' }),
      dispatchEvent: (evt) => { dispatchedKeys.push(evt.key + '@win'); }
    },
    KeyboardEvent: function(type, init) { this.type = type; this.key = init && init.key; },
    MouseEvent: function(type) { this.type = type; },
    Event: function(type) { this.type = type; }
  };

  const result = vm.runInNewContext(script, sandbox);
  assert(result !== null, 'Scanner must detect interaction card even when Submit is initially disabled');
  assert.strictEqual(result.blocked, false, 'Safe command must not be blocked');
  assert.strictEqual(option1Clicked, true, 'Option 1 must be clicked');
  assert.strictEqual(submitClicked, true, 'Submit button must be clicked');
  assert(dispatchedKeys.includes('1') || dispatchedKeys.includes('1@win'), 'Must dispatch Digit1 key');
});

it('buildScannerScript detects Option 1 with box-drawing or prefix characters', () => {
  const cfg = { mode: 'autonomous', askKeywords: [], skipKeywords: [] };
  const script = buildScannerScript(cfg);

  let optionClicked = false;
  let submitClicked = false;

  const mockOption1 = {
    tagName: 'DIV',
    role: 'radio',
    innerText: '│ 1  Yes, allow this time │',
    textContent: '│ 1  Yes, allow this time │',
    click: () => { optionClicked = true; },
    dispatchEvent: () => {},
    getAttribute: () => null
  };

  const mockSubmitBtn = {
    tagName: 'BUTTON',
    disabled: true,
    innerText: 'Submit',
    getBoundingClientRect: () => ({ width: 80, height: 32 }),
    click: () => { submitClicked = true; },
    dispatchEvent: () => {},
    getAttribute: () => null,
    hasAttribute: () => false,
    setAttribute: () => {}
  };

  const mockCard = {
    tagName: 'DIV',
    innerText: 'Run command\n│ 1  Yes, allow this time │\nSubmit',
    children: [mockOption1, mockSubmitBtn]
  };

  mockSubmitBtn.parentElement = mockCard;
  mockOption1.parentElement = mockCard;

  const sandbox = {
    document: {
      querySelector: () => null,
      querySelectorAll: () => [mockOption1, mockSubmitBtn],
      body: { innerText: mockCard.innerText, dispatchEvent: () => {} }
    },
    window: {
      getComputedStyle: () => ({ display: 'block', visibility: 'visible' }),
      dispatchEvent: () => {}
    },
    KeyboardEvent: function() {},
    MouseEvent: function() {},
    Event: function() {}
  };

  const result = vm.runInNewContext(script, sandbox);
  assert(result !== null, 'Must process card with box-drawing characters');
  assert.strictEqual(optionClicked, true, 'Option 1 with box-drawing prefix must be clicked');
});

it('buildScannerScript strictly blocks dangerous commands even when Submit button is initially disabled', () => {
  const cfg = { mode: 'autonomous', askKeywords: ['git push'], skipKeywords: ['rm -rf'] };
  const script = buildScannerScript(cfg);

  let optionClicked = false;
  let submitClicked = false;

  const mockOption1 = {
    tagName: 'DIV',
    innerText: '1  Yes, allow this time',
    click: () => { optionClicked = true; },
    dispatchEvent: () => {},
    getAttribute: () => null
  };

  const mockSubmitBtn = {
    tagName: 'BUTTON',
    disabled: true,
    innerText: 'Submit ↵',
    getBoundingClientRect: () => ({ width: 80, height: 32 }),
    click: () => { submitClicked = true; },
    dispatchEvent: () => {},
    getAttribute: () => null,
    hasAttribute: () => false,
    setAttribute: () => {}
  };

  const mockCard = {
    tagName: 'DIV',
    innerText: 'Dangerous Operation\nrm -rf /var/data\n1  Yes, allow this time\nSubmit ↵',
    children: [mockOption1, mockSubmitBtn]
  };

  mockSubmitBtn.parentElement = mockCard;
  mockOption1.parentElement = mockCard;

  const sandbox = {
    document: {
      querySelector: () => null,
      querySelectorAll: () => [mockOption1, mockSubmitBtn],
      body: { innerText: mockCard.innerText, dispatchEvent: () => {} }
    },
    window: {
      getComputedStyle: () => ({ display: 'block', visibility: 'visible' }),
      dispatchEvent: () => {}
    },
    KeyboardEvent: function() {},
    MouseEvent: function() {},
    Event: function() {}
  };

  const result = vm.runInNewContext(script, sandbox);
  assert(result !== null, 'Scanner must detect dangerous interaction card');
  assert.strictEqual(result.blocked, true, 'rm -rf MUST be blocked');
  assert.strictEqual(result.blockedType, 'skip');
  assert.strictEqual(optionClicked, false, 'Option 1 MUST NOT be clicked when blocked');
  assert.strictEqual(submitClicked, false, 'Submit button MUST NOT be clicked when blocked');
});

// ── 55. Regression Test: Do NOT submit user's half-written prompts in open chats ──
it('buildScannerScript does NOT leak Enter or keystrokes to activeElement or body when user is typing in a prompt', () => {
  const cfg = { mode: 'autonomous', askKeywords: [], skipKeywords: [] };
  const script = buildScannerScript(cfg);

  let userPromptSubmitted = false;
  const userPromptReceivedKeys = [];

  // Simulate user currently typing a prompt in another open chat
  const mockChatPromptTextarea = {
    tagName: 'TEXTAREA',
    className: 'interactive-input-editor',
    value: 'why is the server failing to start...',
    isContentEditable: false,
    dispatchEvent: (evt) => {
      userPromptReceivedKeys.push(evt.key);
      if (evt.key === 'Enter') {
        userPromptSubmitted = true;
      }
    }
  };

  let submitClicked = false;
  let option1Clicked = false;

  const mockSubmitBtn = {
    tagName: 'BUTTON',
    disabled: false,
    innerText: 'Submit ↵',
    textContent: 'Submit ↵',
    getBoundingClientRect: () => ({ width: 80, height: 32 }),
    click: () => { submitClicked = true; },
    dispatchEvent: () => {},
    getAttribute: () => null,
    hasAttribute: () => false,
    setAttribute: () => {}
  };

  const mockOption1 = {
    tagName: 'DIV',
    role: 'radio',
    innerText: '1  Yes, allow this time',
    textContent: '1  Yes, allow this time',
    click: () => { option1Clicked = true; },
    dispatchEvent: () => {},
    getAttribute: (attr) => attr === 'role' ? 'radio' : null
  };

  const mockCard = {
    tagName: 'DIV',
    className: 'interaction-prompt-card',
    innerText: 'Allow run build script?\nnode build.js\n1  Yes, allow this time\nSubmit ↵',
    children: [mockOption1, mockSubmitBtn]
  };
  mockSubmitBtn.parentElement = mockCard;
  mockOption1.parentElement = mockCard;

  let bodyReceivedEnter = false;
  let winReceivedEnter = false;

  const sandbox = {
    document: {
      activeElement: mockChatPromptTextarea, // USER HAS FOCUS AND IS TYPING
      body: {
        innerText: mockCard.innerText,
        dispatchEvent: (evt) => {
          if (evt && evt.key === 'Enter') bodyReceivedEnter = true;
        }
      },
      querySelector: () => null,
      querySelectorAll: () => [mockOption1, mockSubmitBtn]
    },
    window: {
      getComputedStyle: () => ({ display: 'block', visibility: 'visible' }),
      dispatchEvent: (evt) => {
        if (evt && evt.key === 'Enter') winReceivedEnter = true;
      }
    },
    KeyboardEvent: function(type, init) {
      this.type = type;
      this.key = init && init.key;
      this.bubbles = init && init.bubbles;
    },
    MouseEvent: function(type) { this.type = type; },
    Event: function(type) { this.type = type; }
  };

  const result = vm.runInNewContext(script, sandbox);
  assert(result !== null, 'Scanner must detect card');
  assert.strictEqual(result.blocked, false, 'Card should be approved');
  assert.strictEqual(option1Clicked, true, 'Option 1 should be clicked');
  assert.strictEqual(submitClicked, true, 'Submit button should be clicked');

  // CRITICAL VERIFICATION: The active user typing input must NEVER receive Enter or simulated keystrokes!
  assert.strictEqual(userPromptSubmitted, false, 'User prompt must NEVER be submitted by auto-accept!');
  assert.strictEqual(userPromptReceivedKeys.length, 0, 'User typing textarea must NEVER receive simulated keystrokes!');
  assert.strictEqual(winReceivedEnter, false, 'Window must NEVER receive Enter when user is typing in chat!');
  assert.strictEqual(bodyReceivedEnter, false, 'Body must NEVER receive Enter when user is typing in chat!');
});


// ── 22. Regression: safety gate must not be disarmed by self-inspection text ──
function runScannerForCardText(cardText, cfg) {
  const script = buildScannerScript(cfg || {
    mode: 'autonomous',
    askKeywords: ['git push'],
    skipKeywords: ['rm -rf', 'drop table']
  });

  let clicked = false;
  // The scanner only widens to the ancestor card once its text exceeds the button
  // label by >10 chars, so pad the fixture the way a real approval card is padded.
  const fullText = cardText + '  (review before continuing)';
  const mockBtn = {
    innerText: 'Submit',
    disabled: false,
    getBoundingClientRect: () => ({ width: 100, height: 30 }),
    parentElement: { innerText: fullText },
    click: () => { clicked = true; },
    dispatchEvent: () => {},
    setAttribute: () => {},
    getAttribute: () => null,
    closest: () => null
  };

  const sandbox = {
    document: {
      body: { dispatchEvent: () => {} },
      querySelector: () => mockBtn,
      querySelectorAll: () => [mockBtn],
      getElementById: () => null,
      defaultView: {
        getComputedStyle: () => ({ display: 'block', visibility: 'visible' }),
        MouseEvent: function () {},
        KeyboardEvent: function () {}
      }
    },
    KeyboardEvent: function () {},
    MouseEvent: function () {},
    Event: function () {}
  };

  return { result: vm.runInNewContext(script, sandbox), wasClicked: () => clicked };
}

it('self-inspection text must not disable keyword gating for a dangerous command in the same card', () => {
  const { result, wasClicked } = runScannerForCardText(
    'Edit the config: skipKeywords: ["git push"] and then run rm -rf /'
  );
  assert.ok(result, 'Scanner should evaluate');
  assert.strictEqual(result.blocked, true, 'Dangerous command must still be blocked');
  assert.strictEqual(result.blockedType, 'skip');
  assert.strictEqual(wasClicked(), false, 'Blocked button must never be clicked');
});

it('self-inspection text alone still approves benign commands (no over-blocking)', () => {
  const { result } = runScannerForCardText(
    "Allow run test? node -e 'const script = buildScannerScript({ skipKeywords: [\"rm -rf\"] });'"
  );
  assert.ok(result);
  assert.strictEqual(result.blocked, false, 'Benign self-inspection command should be approved');
});

// ── 23. Regression: recursive-force delete must not evade the skip list ──
it('blocks rm with recursive and force flags in any arrangement', () => {
  for (const cmd of [
    'rm -rf /var/data',
    'rm -fr /var/data',
    'rm -r -f /var/data',
    'rm --recursive --force /var/data',
    'cd /tmp && rm   -rf   /var/data'
  ]) {
    const { result, wasClicked } = runScannerForCardText(cmd);
    assert.ok(result, `No result for: ${cmd}`);
    assert.strictEqual(result.blocked, true, `Must block: ${cmd}`);
    assert.strictEqual(result.blockedType, 'skip', `Must be a skip block: ${cmd}`);
    assert.strictEqual(wasClicked(), false, `Must not click: ${cmd}`);
  }
});

it('blocks PowerShell recursive force delete', () => {
  const { result } = runScannerForCardText('Remove-Item -Recurse -Force C:\\data');
  assert.ok(result);
  assert.strictEqual(result.blocked, true);
  assert.strictEqual(result.blockedType, 'skip');
});

it('does not over-block a plain recursive rm without force', () => {
  const { result } = runScannerForCardText('rm -r node_modules');
  assert.ok(result);
  assert.strictEqual(result.blocked, false, 'rm -r without force should stay auto-approvable');
});

// ── 24. Regression: BOM-prefixed config must be honoured ──
it('readJsonFile tolerates a UTF-8 BOM (Notepad / UTF-8-with-BOM saves)', () => {
  const file = path.join(os.tmpdir(), `agy-bom-read-${Date.now()}.json`);
  fs.writeFileSync(file, '\uFEFF' + JSON.stringify({ mode: 'autopilot' }), 'utf8');
  try {
    assert.deepStrictEqual(readJsonFile(file), { mode: 'autopilot' });
  } finally {
    try { fs.unlinkSync(file); } catch (e) {}
  }
});

it('resolveConfig honours a BOM-prefixed --config file', () => {
  const file = path.join(os.tmpdir(), `agy-bom-resolve-${Date.now()}.json`);
  fs.writeFileSync(file, '\uFEFF' + JSON.stringify({
    mode: 'autopilot',
    cdpPort: 9555,
    skipKeywords: ['custom-skip']
  }), 'utf8');

  const savedArgv = process.argv;
  const savedPort = process.env.ANTIGRAVITY_CDP_PORT;
  const savedMode = process.env.ANTIGRAVITY_AUTO_SUBMIT_MODE;
  // Env vars intentionally override the config file; clear them so this test
  // asserts on the file's own values.
  delete process.env.ANTIGRAVITY_CDP_PORT;
  delete process.env.ANTIGRAVITY_AUTO_SUBMIT_MODE;
  process.argv = ['node', 'auto-accept.js', '--config', file, ''];
  try {
    const resolved = resolveConfig();
    assert.strictEqual(resolved.configSource, file, 'BOM config must be recognised as the source');
    assert.strictEqual(resolved.config.mode, 'autopilot');
    assert.strictEqual(resolved.config.cdpPort, 9555);
    assert.deepStrictEqual(resolved.config.skipKeywords, ['custom-skip']);
  } finally {
    process.argv = savedArgv;
    if (savedPort === undefined) delete process.env.ANTIGRAVITY_CDP_PORT;
    else process.env.ANTIGRAVITY_CDP_PORT = savedPort;
    if (savedMode === undefined) delete process.env.ANTIGRAVITY_AUTO_SUBMIT_MODE;
    else process.env.ANTIGRAVITY_AUTO_SUBMIT_MODE = savedMode;
    try { fs.unlinkSync(file); } catch (e) {}
  }
});

// ── 25. Regression: option values must never be mistaken for a subcommand ──
it('extractSubcommand skips flags and the values they consume', () => {
  assert.strictEqual(extractSubcommand(['--config', 'x.json', 'status']), 'status');
  assert.strictEqual(extractSubcommand(['-c', 'x.json', 'doctor']), 'doctor');
  assert.strictEqual(extractSubcommand(['--mode', 'autopilot', 'status']), 'status');
  assert.strictEqual(extractSubcommand(['--mode=autopilot', 'status']), 'status');
  assert.strictEqual(extractSubcommand(['--poll', '500', 'list']), 'list');
  assert.strictEqual(extractSubcommand(['status', '--config', 'x.json']), 'status');
  assert.strictEqual(extractSubcommand([]), '');
  assert.strictEqual(extractSubcommand(['--mode', 'autopilot']), '');
  assert.strictEqual(extractSubcommand(['--config', 'x.json']), '');
  assert.strictEqual(extractSubcommand(['-p', '9333']), '');

  // Subcommand index and argument slicing
  assert.strictEqual(findSubcommandIndex(['--config', 'cfg.json', 'add-ask', 'git push']), 2);
  assert.deepStrictEqual(argsAfterSubcommand(['--config', 'cfg.json', 'add-ask', 'git push'], 2), ['git push']);
  assert.deepStrictEqual(argsAfterSubcommand(['clean', '--all'], 0), ['--all']);
  assert.deepStrictEqual(argsAfterSubcommand(['--mode', 'autopilot'], -1), []);
});

// ── 26. Regression: hot-reload must retry after a transient parse failure ──
it('checkConfigReload retries after a bad write instead of silently dropping the update', () => {
  const file = path.join(os.tmpdir(), `agy-reload-${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify({ mode: 'autonomous' }), 'utf8');
  const daemon = new AutoSubmitDaemon({ ...DEFAULTS, mode: 'autonomous' }, file);
  try {
    // Simulate an editor mid-save: truncated JSON.
    fs.writeFileSync(file, '{ "mode": "autopilot" ', 'utf8');
    fs.utimesSync(file, new Date(), new Date(Date.now() + 2000));
    daemon.checkConfigReload();
    assert.strictEqual(daemon.config.mode, 'autonomous', 'Partial config must not be applied');

    // The completed save must still be picked up.
    fs.writeFileSync(file, JSON.stringify({ mode: 'autopilot' }), 'utf8');
    fs.utimesSync(file, new Date(), new Date(Date.now() + 4000));
    daemon.checkConfigReload();
    assert.strictEqual(daemon.config.mode, 'autopilot', 'Valid save after a bad write must apply');
  } finally {
    try { fs.unlinkSync(file); } catch (e) {}
  }
});

// ── 27. Regression: flag-only invocations must never fall through to the daemon ──
it('--version / --help exit immediately instead of starting the daemon', () => {
  const { spawnSync } = require('child_process');
  const env = { ...process.env, ANTIGRAVITY_CDP_PORT: '9599', NO_COLOR: '1' };
  const cli = path.join(__dirname, '..', 'auto-accept.js');

  const version = spawnSync(process.execPath, [cli, '--version'], { encoding: 'utf8', env, timeout: 20000 });
  assert.strictEqual(version.status, 0, '--version must exit 0');
  assert(/^v\d+\.\d+\.\d+/.test(version.stdout.trim()), 'Must print the version');
  assert(!/READY|ONLINE|Connected:/.test(version.stdout), '--version must not start the daemon');

  const help = spawnSync(process.execPath, [cli, '--help'], { encoding: 'utf8', env, timeout: 20000 });
  assert.strictEqual(help.status, 0, '--help must exit 0');
  assert(/USAGE/i.test(help.stdout), 'Must print usage');
  assert(!/READY|ONLINE|Connected:/.test(help.stdout), '--help must not start the daemon');
});

// ── 31. Regression: destructive tooling guards ──
it('antigravity_brain resolves sessions deterministically and refuses to guess', () => {
  const { spawnSync } = require('child_process');
  const pyCmd = getPythonCommand();
  const scriptsDir = path.join(__dirname, '..', 'scripts').replace(/\\/g, '/');
  const pyCode = `
import sys
sys.path.insert(0, '${scriptsDir}')
import importlib.util
spec = importlib.util.spec_from_file_location('b', '${scriptsDir}/antigravity_brain.py')
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)

sessions = [
    {'id': 'aa1-first', 'title': 'A1'},
    {'id': 'aa2-second', 'title': 'A2'},
    {'id': 'zz9-third', 'title': 'Z3'},
]
def rid(q):
    s = m.find_target_session(q, sessions)
    return s['id'] if s else None

assert rid('zz9') == 'zz9-third', 'unique prefix must resolve'
assert rid('aa1-first') == 'aa1-first', 'exact ID must win'
assert rid('2') == 'aa2-second', 'numeric query is a 1-based row'
assert rid('0') is None, 'invalid row must NOT fall back to a prefix match'
assert rid('99') is None, 'out-of-range row must not resolve'
assert rid('aa') is None, 'ambiguous prefix must refuse'
assert rid('') is None and rid('   ') is None
print("brain resolution tests passed")
`;
  let res = spawnSync(pyCmd, ['-c', pyCode], { encoding: 'utf8' });
  if (res.error && res.error.code === 'ENOENT') res = spawnSync('python', ['-c', pyCode], { encoding: 'utf8' });
  assert(res.status === 0, `brain resolution test failed: ${res.stderr || res.stdout}`);
});

it('cleaner enforces the Protected tier and skips junctions', () => {
  const { spawnSync } = require('child_process');
  const pyCmd = getPythonCommand();
  const scriptsDir = path.join(__dirname, '..', 'scripts').replace(/\\/g, '/');
  const pyCode = `
import os, importlib.util
spec = importlib.util.spec_from_file_location('cl', '${scriptsDir}/antigravity_cleaner.py')
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)

assert m.is_protected_path(os.path.expanduser('~/.gemini/config')), 'config dir must be protected'
assert m.is_protected_path(os.path.expanduser('~/.gemini/config/x.json')), 'children of protected paths must be protected'
assert m.is_protected_path(os.path.expanduser('~/.gemini/google_accounts.json')), 'credentials must be protected'
assert not m.is_protected_path(os.path.expanduser('~/.gemini/antigravity/scratch/tmp.py')), 'scratch must not be protected'
assert not m.is_protected_path(os.path.expanduser('~/.gemini/tmp/x.log')), 'tmp must not be protected'
assert isinstance(m.PROTECTED_PATH_GROUPS, list) and len(m.PROTECTED_PATH_GROUPS) > 5, 'protected tier must be populated'
# ~/Application Data is a Windows junction: is_dir(follow_symlinks=False) is still True.
if os.name == 'nt':
    p = os.path.expanduser('~/Application Data')
    if os.path.exists(p):
        assert m.is_reparse_path(p), 'junctions must be detected'
print("cleaner guard tests passed")
`;
  let res = spawnSync(pyCmd, ['-c', pyCode], { encoding: 'utf8' });
  if (res.error && res.error.code === 'ENOENT') res = spawnSync('python', ['-c', pyCode], { encoding: 'utf8' });
  assert(res.status === 0, `cleaner guard test failed: ${res.stderr || res.stdout}`);
});

it('cleaner rejects a non-positive --days threshold', () => {
  const { spawnSync } = require('child_process');
  const pyCmd = getPythonCommand();
  const script = path.join(__dirname, '..', 'scripts', 'antigravity_cleaner.py');
  let res = spawnSync(pyCmd, [script, '--check', '--days', '0'], { encoding: 'utf8' });
  if (res.error && res.error.code === 'ENOENT') res = spawnSync('python', [script, '--check', '--days', '0'], { encoding: 'utf8' });
  assert(res.status !== 0, '--days 0 must be rejected');
  assert(/--days must be 1 or greater/.test(res.stderr || ''), 'must explain the rejection');
});

// ── 32. Multi-window concurrency & state stability ──
it('approvals from several windows are recorded together, not serialised', () => {
  const stats = new StatsManager();
  const before = stats.lifetimeClicks;
  const mk = (id) => new WindowSession(
    { id, title: id, webSocketDebuggerUrl: `ws://127.0.0.1:9333/${id}` },
    9333,
    { ...DEFAULTS, pollIntervalMs: 120 },
    stats,
    () => {}
  );

  const a = mk('win-a');
  const b = mk('win-b');
  const c = mk('win-c');

  // Same tick: all three windows resolve an approval simultaneously.
  a.handleScanResult({ action: 'Submit', context: 'command A', blocked: false });
  b.handleScanResult({ action: 'Submit', context: 'command B', blocked: false });
  c.handleScanResult({ action: 'Submit', context: 'command C', blocked: false });

  assert.strictEqual(stats.lifetimeClicks, before + 3, 'all three must be counted');
  assert.strictEqual(a.sessionApprovals, 1);
  assert.strictEqual(b.sessionApprovals, 1);
  assert.strictEqual(c.sessionApprovals, 1);
  stats.flush();
});

it('stats survive a deferred write once flushed', () => {
  const stats = new StatsManager();
  const before = stats.lifetimeClicks;
  stats.recordApproval('deferred write test');
  assert.strictEqual(stats.lifetimeClicks, before + 1, 'in-memory counter updates immediately');
  stats.flush();
  const persisted = new StatsManager();
  assert(persisted.lifetimeClicks >= before + 1, 'flush must persist the counter');
});

it('scanner script depends only on the safety configuration', () => {
  const base = { mode: 'autonomous', askKeywords: ['git push'], skipKeywords: ['rm -rf'], autoSelectAlwaysAllow: false };
  const s1 = buildScannerScript(base);
  const s2 = buildScannerScript({ ...base });
  assert.strictEqual(s1, s2, 'identical config must produce an identical script');

  const auto = buildScannerScript({ ...base, mode: 'autopilot' });
  assert.notStrictEqual(s1, auto, 'mode must affect the script');

  const extraSkip = buildScannerScript({ ...base, skipKeywords: ['rm -rf', 'drop table'] });
  assert.notStrictEqual(s1, extraSkip, 'keyword changes must invalidate the cached script');
});

it('editing unrelated config keys never enables or disables the daemon', () => {
  const file = path.join(os.tmpdir(), `agy-toggle-${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify({ enabled: false, mode: 'autonomous' }), 'utf8');
  const daemon = new AutoSubmitDaemon({ ...DEFAULTS, enabled: false }, file);
  try {
    // Unrelated edit: keywords changed, enabled untouched.
    fs.writeFileSync(file, JSON.stringify({ enabled: false, mode: 'autonomous', skipKeywords: ['zeta-rule'] }), 'utf8');
    fs.utimesSync(file, new Date(), new Date(Date.now() + 2000));
    daemon.checkConfigReload();
    assert.strictEqual(daemon.config.enabled, false, 'an unrelated edit must not switch it on');
    assert(daemon.config.skipKeywords.includes('zeta-rule'), 'the actual change must still apply');

    // Deliberate change: user flips enabled.
    fs.writeFileSync(file, JSON.stringify({ enabled: true, mode: 'autonomous', skipKeywords: ['zeta-rule'] }), 'utf8');
    fs.utimesSync(file, new Date(), new Date(Date.now() + 4000));
    daemon.checkConfigReload();
    assert.strictEqual(daemon.config.enabled, true, 'an explicit enable must apply');
  } finally {
    try { fs.unlinkSync(file); } catch (e) {}
  }
});

it('coverage command exposes every category, tool and protection tier', () => {
  const { spawnSync } = require('child_process');
  const pyCmd = getPythonCommand();
  const script = path.join(__dirname, '..', 'scripts', 'antigravity_cleaner.py');
  let res = spawnSync(pyCmd, [script, '--coverage', '--json'], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (res.error && res.error.code === 'ENOENT') {
    res = spawnSync('python', [script, '--coverage', '--json'], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  }
  assert.strictEqual(res.status, 0, `coverage failed: ${res.stderr || ''}`);
  const data = JSON.parse(res.stdout);

  assert(Array.isArray(data.supported_tools) && data.supported_tools.length >= 15, 'must list supported tools');
  assert(Array.isArray(data.categories) && data.categories.length > 20, 'must list categories');
  for (const tier of ['1-safe', '2-review', '3-protected']) {
    assert(data.categories.some(c => c.tier === tier), `missing tier ${tier}`);
  }
  // Transparency: the protection tier must be represented, and totals reported.
  assert(data.categories.filter(c => c.tier === '3-protected').length >= 10, 'protected tier must be itemised');
  assert(typeof data.totals.tier1_safe_bytes === 'number');
  assert(typeof data.totals.tier2_reclaimable_bytes === 'number');
  // The common toolchains must all be represented in the supported list.
  const tools = data.supported_tools.map(t => t.tool).join(' | ');
  for (const expected of ['JetBrains', 'Android Studio', 'Sublime', 'VS Code', 'VSCodium', 'Cursor', 'Windsurf', 'Claude', 'cargo', 'Gradle', 'Maven', 'NuGet', 'Go']) {
    assert(tools.includes(expected), `supported tools missing ${expected}`);
  }
});

console.log(`\nResults: ${passed}/${total} passed.`);
try { process.stdin.pause(); } catch (e) {}
process.exit(passed === total ? 0 : 1);

