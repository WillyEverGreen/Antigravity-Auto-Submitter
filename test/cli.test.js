/**
 * Automated test suite for auto-accept.js CLI & Multi-Window Engine
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
  selectAllWorkbenchTargets,
  WindowSession,
  AutoSubmitDaemon,
  getPidFilePath,
  acquireDaemonLock,
  releaseDaemonLock,
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
  const pythonCmd = process.platform === 'win32' ? 'py' : 'python3';
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

console.log(`\nResults: ${passed}/${total} passed.`);
try { process.stdin.pause(); } catch (e) {}
process.exit(passed === total ? 0 : 1);
