const assert = require('assert');
const path = require('path');
const fs = require('fs');

const {
  loadConfig,
  findCdpEndpoints,
  selectAllWorkbenchTargets,
  buildScannerScript
} = require('../kiro-auto-accept.js');

console.log('🧪 Starting Kiro Auto-Accept Test Suite...\n');

// 1. Config loading & defaults
{
  const { cfg } = loadConfig();
  assert.strictEqual(cfg.enabled, true, 'Default enabled should be true');
  assert(['autonomous', 'autopilot'].includes(cfg.mode), 'Mode should be autonomous or autopilot');
  assert(cfg.askKeywords.includes('git push'), 'Must include git push in askKeywords');
  assert(cfg.skipKeywords.includes('format c:'), 'Must include format c: in skipKeywords');
  console.log('  ✓ Config loader & defaults are valid');
}

// 2. buildScannerScript syntax check
{
  const { cfg } = loadConfig();
  const script = buildScannerScript(cfg);
  assert(typeof script === 'string' && script.length > 50, 'Scanner script must be non-empty');
  assert.doesNotThrow(() => new Function(script), 'buildScannerScript must compile without syntax errors');
  console.log('  ✓ buildScannerScript produces valid, compilable JavaScript');
}

// 3. Port isolation: selectAllWorkbenchTargets rejects Antigravity
{
  const mockTargets = [
    {
      id: 'target-kiro-wb',
      type: 'page',
      title: 'README.md - Kiro',
      url: 'vscode-file://vscode-app/c:/Users/test/Kiro/resources/app/out/vs/code/workbench/workbench.html',
      webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/page/1'
    },
    {
      id: 'target-kiro-wv',
      type: 'iframe',
      title: '',
      url: 'vscode-webview://1234567890/index.html?extensionId=kiro.kiroAgent',
      webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/page/2'
    },
    {
      id: 'target-antigravity',
      type: 'page',
      title: 'Antigravity IDE - Test',
      url: 'vscode-file://vscode-app/c:/Users/test/Antigravity/workbench.html',
      webSocketDebuggerUrl: 'ws://127.0.0.1:9333/devtools/page/3'
    },
    {
      id: 'target-browser',
      type: 'page',
      title: 'Google Search',
      url: 'https://google.com',
      webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/page/4'
    }
  ];

  const matched = selectAllWorkbenchTargets(mockTargets);
  assert.strictEqual(matched.length, 2, 'Must match exactly the 2 Kiro targets');
  assert.strictEqual(matched[0].id, 'target-kiro-wb', 'Must match Kiro workbench');
  assert.strictEqual(matched[1].id, 'target-kiro-wv', 'Must match Kiro webview');
  assert(!matched.some(t => t.id === 'target-antigravity'), 'Must strictly reject Antigravity targets');
  assert(!matched.some(t => t.id === 'target-browser'), 'Must strictly reject external browser targets');
  console.log('  ✓ selectAllWorkbenchTargets matches Kiro workbench + webview and rejects Antigravity');
}

// 4. Injected scanner evaluation: button matching & negative guard
{
  const { cfg } = loadConfig();
  const script = buildScannerScript(cfg);

  // Simulate DOM environment
  const mockEval = (domSetup) => {
    const fn = new Function('document', 'window', 'MouseEvent', `return (${script});`);
    return fn(domSetup.document, domSetup.window, domSetup.MouseEvent);
  };

  // Positive test: Allow button
  let clicked = false;
  const mockButton = {
    tagName: 'BUTTON',
    className: 'kiro-button',
    innerText: 'Allow',
    getBoundingClientRect: () => ({ width: 50, height: 30 }),
    closest: () => ({ innerText: 'Your approval is required to continue: npm test' }),
    dispatchEvent: () => {},
    click: () => { clicked = true; },
    hasAttribute: () => false,
    setAttribute: () => {}
  };

  const doc = {
    querySelectorAll: (sel) => sel.includes('button') ? [mockButton] : [],
    getElementById: () => null,
    defaultView: { getComputedStyle: () => ({ visibility: 'visible', display: 'block' }) }
  };

  const result = mockEval({ document: doc, window: doc.defaultView, MouseEvent: function() {} });
  assert(result, 'Result should not be null');
  assert.strictEqual(result.action, 'Allow', 'Action should be Allow');
  assert.strictEqual(result.blocked, false, 'Should not be blocked');
  assert(clicked, 'Button click should have been triggered');
  console.log('  ✓ Injected scanner detects and clicks "Allow" button');

  // Negative test: Deny / Cancel buttons should NOT be clicked
  let denyClicked = false;
  const mockDeny = {
    tagName: 'BUTTON',
    className: 'kiro-button',
    innerText: 'Deny',
    getBoundingClientRect: () => ({ width: 50, height: 30 }),
    closest: () => ({ innerText: 'Your approval is required' }),
    dispatchEvent: () => {},
    click: () => { denyClicked = true; },
    hasAttribute: () => false,
    setAttribute: () => {}
  };
  const docDeny = {
    querySelectorAll: () => [mockDeny],
    getElementById: () => null,
    defaultView: { getComputedStyle: () => ({ visibility: 'visible', display: 'block' }) }
  };
  const denyResult = mockEval({ document: docDeny, window: docDeny.defaultView, MouseEvent: function() {} });
  assert.strictEqual(denyResult, null, 'Deny button must be ignored');
  assert(!denyClicked, 'Deny button must never be clicked');
  console.log('  ✓ Injected scanner strictly rejects "Deny" button');

  // Keyword guard test: rm -rf should be blocked
  let rmClicked = false;
  const mockRm = {
    tagName: 'BUTTON',
    className: 'kiro-button',
    innerText: 'Allow',
    getBoundingClientRect: () => ({ width: 50, height: 30 }),
    closest: () => ({ innerText: 'Execute: rm -rf /important/folder' }),
    dispatchEvent: () => {},
    click: () => { rmClicked = true; },
    hasAttribute: () => false,
    setAttribute: () => {}
  };
  const docRm = {
    querySelectorAll: () => [mockRm],
    getElementById: () => null,
    defaultView: { getComputedStyle: () => ({ visibility: 'visible', display: 'block' }) }
  };
  const rmResult = mockEval({ document: docRm, window: docRm.defaultView, MouseEvent: function() {} });
  assert(rmResult && rmResult.blocked, 'Dangerous command must be blocked');
  assert(!rmClicked, 'Dangerous command button must not be clicked');
  console.log('  ✓ Injected scanner pauses on safety keywords (e.g. rm -rf)');
}

// 5. Binary wrappers exist and invoke cleanly
{
  const binDir = path.join(__dirname, '..', 'bin');
  const bins = ['kiro-doctor.js', 'kiro-setup.js', 'kiro-launch.js', 'kiro-restart.js', 'kiro-start.js'];
  bins.forEach(b => {
    const p = path.join(binDir, b);
    assert(fs.existsSync(p), `Binary wrapper ${b} must exist`);
    const code = fs.readFileSync(p, 'utf8');
    assert.doesNotThrow(() => new Function(code.replace(/^#!.*\r?\n/, "")), `Binary wrapper ${b} must compile`);
  });
  console.log('  ✓ All 5 CLI binary wrappers in bin/ exist and compile');
}

console.log('\nAll Kiro Auto-Accept tests passed! ✔');
