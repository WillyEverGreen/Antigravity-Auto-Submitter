/**
 * Automated test suite for VS Code Extension packaging & activation
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

console.log('🧪 Starting VS Code Extension Test Suite...\n');

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
    process.exitCode = 1;
  }
}

const extDir = path.join(__dirname, '..', 'vscode-extension');
const rootDir = path.join(__dirname, '..');

// ── 1. Manifest & Files Integrity ──

it('package.json has all mandatory VS Code marketplace metadata', () => {
  const pkgPath = path.join(extDir, 'package.json');
  assert(fs.existsSync(pkgPath), 'package.json must exist');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

  assert.strictEqual(pkg.name, 'antigravity-auto-submit');
  assert.strictEqual(pkg.publisher, 'WillyEverGreen');
  assert.strictEqual(pkg.version, '1.9.0');
  assert.strictEqual(pkg.license, 'MIT');
  assert.strictEqual(pkg.main, './extension.js');
  assert(pkg.engines && pkg.engines.vscode, 'engines.vscode required');
  assert(pkg.icon, 'icon required');
  assert(pkg.repository && pkg.repository.url, 'repository.url required');
  assert(Array.isArray(pkg.categories) && pkg.categories.length > 0, 'categories required');
  assert(Array.isArray(pkg.keywords) && pkg.keywords.length > 0, 'keywords required');
});

it('icon exists, is valid PNG with 512x512 dimensions', () => {
  const iconPath = path.join(extDir, 'media', 'icon.png');
  assert(fs.existsSync(iconPath), 'media/icon.png must exist');
  const buf = fs.readFileSync(iconPath);
  assert.strictEqual(buf.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', 'must be valid PNG header');
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  assert.strictEqual(width, 512, 'width should be 512');
  assert.strictEqual(height, 512, 'height should be 512');
});

it('walkthrough steps and markdown media files exist', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(extDir, 'package.json'), 'utf8'));
  const wt = pkg.contributes.walkthroughs[0];
  assert(wt, 'walkthrough definition must exist');
  assert.strictEqual(wt.id, 'antigravityAutoSubmit.gettingStarted');
  assert.strictEqual(wt.steps.length, 4, 'walkthrough should have 4 steps');

  for (const step of wt.steps) {
    const mdRel = step.media.markdown;
    const mdPath = path.join(extDir, mdRel);
    assert(fs.existsSync(mdPath), `Walkthrough media file ${mdRel} must exist`);
    const content = fs.readFileSync(mdPath, 'utf8');
    assert(content.length > 20, `Walkthrough file ${mdRel} should not be empty`);
  }
});

it('LICENSE and README exist and are non-empty', () => {
  const licPath = path.join(extDir, 'LICENSE');
  const readmePath = path.join(extDir, 'README.md');
  assert(fs.existsSync(licPath), 'LICENSE must exist');
  assert(fs.existsSync(readmePath), 'README.md must exist');
  assert(fs.readFileSync(licPath, 'utf8').includes('MIT License'));
  assert(fs.readFileSync(readmePath, 'utf8').includes('Antigravity Auto-Submit'));
});

it('.vscodeignore excludes build output and development files', () => {
  const vsiPath = path.join(extDir, '.vscodeignore');
  assert(fs.existsSync(vsiPath), '.vscodeignore must exist');
  const content = fs.readFileSync(vsiPath, 'utf8');
  assert(content.includes('scripts/**'));
  assert(content.includes('*.vsix'));
});

it('activity bar icon SVG exists', () => {
  const svgPath = path.join(extDir, 'resources', 'activity-icon.svg');
  assert(fs.existsSync(svgPath), 'resources/activity-icon.svg must exist');
  const content = fs.readFileSync(svgPath, 'utf8');
  assert(content.includes('<svg'), 'activity-icon.svg must contain an SVG element');
});

it('package.json declares viewsContainers and webview dashboard view', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(extDir, 'package.json'), 'utf8'));
  const vc = pkg.contributes.viewsContainers;
  assert(vc && vc.activitybar && vc.activitybar.length === 1, 'must declare one activitybar container');
  assert.strictEqual(vc.activitybar[0].id, 'antigravityDashboard');
  const views = pkg.contributes.views.antigravityDashboard;
  assert(Array.isArray(views) && views.length === 1, 'must declare 1 webview dashboard view');
  assert.strictEqual(views[0].id, 'antigravityAutoSubmit.dashboardView');
  assert.strictEqual(views[0].type, 'webview');
});

// ── 2. Bundle Script Execution ──

it('bundle script copies auto-accept.js to daemon/auto-accept.js cleanly', () => {
  const res = spawnSync('node', [path.join(extDir, 'scripts', 'bundle.js')], { encoding: 'utf8' });
  assert.strictEqual(res.status, 0, 'bundle script should exit with 0');
  const bundled = path.join(extDir, 'daemon', 'auto-accept.js');
  assert(fs.existsSync(bundled), 'daemon/auto-accept.js must exist after bundle');
  const rootSrc = fs.readFileSync(path.join(rootDir, 'auto-accept.js'));
  const bundledSrc = fs.readFileSync(bundled);
  assert(rootSrc.equals(bundledSrc), 'bundled daemon must match root auto-accept.js exactly');
});

// ── 3. Extension Module Activation & Registration ──

it('extension module activates and registers all 16 declared commands and webview dashboard', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(extDir, 'package.json'), 'utf8'));
  const declaredCmds = pkg.contributes.commands.map(c => c.command);
  assert.strictEqual(declaredCmds.length, 16, 'should declare 16 commands in package.json');

  const registeredCmds = new Map();
  const subscriptions = [];
  let statusBarCreated = false;
  let statusText = '';
  let statusColor = null;
  const registeredViews = new Map();

  // Mock vscode API
  const vscodeMock = {
    StatusBarAlignment: { Left: 1, Right: 2 },
    ThemeColor: class { constructor(id) { this.id = id; } },
    ThemeIcon: class { constructor(id) { this.id = id; } },
    TreeItem: class {
      constructor(label, state) { this.label = label; this.collapsibleState = state; }
    },
    TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
    EventEmitter: class {
      constructor() { this.event = () => ({ dispose: () => {} }); }
      fire() {}
    },
    Uri: { parse: (s) => ({ url: s }) },
    env: {
      openExternal: () => Promise.resolve(true),
      clipboard: { writeText: () => Promise.resolve() }
    },
    workspace: {
      getConfiguration: () => ({
        get: (key) => {
          if (key === 'mode') return 'autonomous';
          if (key === 'autoStart') return false;
          if (key === 'cdpPort') return 0;
          if (key === 'askKeywords') return ['git push'];
          if (key === 'skipKeywords') return ['rm -rf'];
          if (key === 'nodePath') return 'node';
          if (key === 'daemonSource') return 'bundled';
          if (key === 'extraArgs') return [];
          return undefined;
        },
        update: () => Promise.resolve()
      }),
      onDidChangeConfiguration: () => ({ dispose: () => {} })
    },
    window: {
      createOutputChannel: (name) => ({
        name,
        appendLine: () => {},
        append: () => {},
        show: () => {},
        dispose: () => {}
      }),
      createStatusBarItem: (alignment, priority) => {
        statusBarCreated = true;
        assert.strictEqual(alignment, 2, 'StatusBarAlignment.Right');
        assert.strictEqual(priority, 100);
        return {
          set text(val) { statusText = val; },
          get text() { return statusText; },
          set tooltip(val) {},
          set backgroundColor(val) { statusColor = val; },
          get backgroundColor() { return statusColor; },
          set command(val) {},
          show: () => {},
          dispose: () => {}
        };
      },
      registerTreeDataProvider: (viewId, provider) => {
        registeredViews.set(viewId, provider);
        return { dispose: () => registeredViews.delete(viewId) };
      },
      registerWebviewViewProvider: (viewId, provider) => {
        registeredViews.set(viewId, provider);
        return { dispose: () => registeredViews.delete(viewId) };
      },
      showInformationMessage: () => {},
      showWarningMessage: () => {},
      showErrorMessage: () => {}
    },
    commands: {
      registerCommand: (id, fn) => {
        registeredCmds.set(id, fn);
        return { dispose: () => registeredCmds.delete(id) };
      },
      executeCommand: () => Promise.resolve()
    }
  };

  // Inject vscode mock into require cache
  const Module = require('module');
  const originalRequire = Module.prototype.require;
  Module.prototype.require = function (id) {
    if (id === 'vscode') return vscodeMock;
    return originalRequire.apply(this, arguments);
  };

  try {
    delete require.cache[require.resolve('../vscode-extension/extension.js')];
    const { activate, deactivate } = require('../vscode-extension/extension.js');

    const globalStateStore = new Map();
    const mockContext = {
      extensionPath: extDir,
      extension: { id: 'WillyEverGreen.antigravity-auto-submit' },
      subscriptions,
      globalState: {
        get: (k) => globalStateStore.get(k),
        update: (k, v) => globalStateStore.set(k, v)
      }
    };

    activate(mockContext);

    assert(statusBarCreated, 'Status bar item must be created');
    assert.strictEqual(statusText, '$(circle-slash) AGY: off', 'Status bar should show off when stopped');
    assert(statusColor instanceof vscodeMock.ThemeColor, 'Status bar should use warning theme color when off');

    // Verify all declared commands are registered
    for (const cmd of declaredCmds) {
      assert(registeredCmds.has(cmd), `Command ${cmd} declared in package.json must be registered in extension.js`);
    }
    assert.strictEqual(registeredCmds.size, 16, 'All 16 commands should be registered');

    // Verify webview dashboard provider is registered
    assert(registeredViews.has('antigravityAutoSubmit.dashboardView'), 'Webview dashboard provider must be registered');
    const dbProvider = registeredViews.get('antigravityAutoSubmit.dashboardView');
    assert(typeof dbProvider.resolveWebviewView === 'function', 'dashboardView provider must have resolveWebviewView');
    assert(typeof dbProvider.postState === 'function', 'dashboardView provider must have postState');

    // Test resolveWebviewView HTML generation
    const postedMessages = [];
    const mockWebview = {
      options: {},
      html: '',
      onDidReceiveMessage: () => ({ dispose: () => {} }),
      postMessage: (m) => { postedMessages.push(m); return Promise.resolve(true); }
    };
    dbProvider.resolveWebviewView({ webview: mockWebview });
    assert(mockWebview.html.includes('Antigravity Auto-Submit'), 'Webview HTML must contain title');
    assert(mockWebview.html.includes('Skip Rules'), 'Webview HTML must contain Skip Rules');
    assert(mockWebview.html.includes('Ask Rules'), 'Webview HTML must contain Ask Rules');
    assert(postedMessages.length > 0, 'Must post initial state to webview');

    assert.strictEqual(globalStateStore.get('welcomed'), true, 'Welcomed state must be set on first activate');

    // Test deactivation
    assert.doesNotThrow(() => deactivate(), 'deactivate should complete cleanly');

    // Test openWalkthrough execution fallback when context.extension is missing
    const executedCmds = [];
    vscodeMock.commands.executeCommand = (cmd, ...args) => {
      executedCmds.push({ cmd, args });
      return Promise.resolve();
    };
    registeredCmds.get('antigravityAutoSubmit.openWalkthrough')();
    assert.strictEqual(executedCmds.length, 1);
    assert.strictEqual(executedCmds[0].cmd, 'workbench.action.openWalkthrough');
    assert.strictEqual(executedCmds[0].args[0], 'WillyEverGreen.antigravity-auto-submit#antigravityAutoSubmit.gettingStarted');
  } finally {
    Module.prototype.require = originalRequire;
  }
});

console.log(`\nResults: ${passed}/${total} passed.`);
if (passed !== total) process.exit(1);
