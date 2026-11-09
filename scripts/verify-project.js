#!/usr/bin/env node
/**
 * Static invariant checks for the "Definition of done" in AGENTS.md.
 * Zero dependencies. Run: npm run verify
 *
 * Exits 0 only when every check passes, so it can gate commits and publishing.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { builtinModules } = require('module');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const IS_TTY = process.stdout.isTTY && !process.env.NO_COLOR;
const c = {
  red: IS_TTY ? '\x1b[31m' : '', green: IS_TTY ? '\x1b[32m' : '',
  yellow: IS_TTY ? '\x1b[33m' : '', dim: IS_TTY ? '\x1b[2m' : '',
  bold: IS_TTY ? '\x1b[1m' : '', reset: IS_TTY ? '\x1b[0m' : ''
};

const failures = [];
const warnings = [];

function check(name, fn) {
  try {
    const result = fn();
    if (result && result.warn) {
      warnings.push(`${name}: ${result.warn}`);
      console.log(`  ${c.yellow}!${c.reset} ${name} ${c.dim}(${result.warn})${c.reset}`);
    } else {
      console.log(`  ${c.green}✓${c.reset} ${name}${result && result.detail ? ` ${c.dim}(${result.detail})${c.reset}` : ''}`);
    }
  } catch (e) {
    failures.push(`${name}: ${e.message}`);
    console.log(`  ${c.red}✗${c.reset} ${name}`);
    console.log(`    ${c.red}${e.message}${c.reset}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const exists = rel => fs.existsSync(path.join(ROOT, rel));

// ── 1. Zero runtime dependencies ──
check('no third-party runtime dependencies', () => {
  const manifests = [
    'package.json',
    'claude-auto-accept/package.json',
    'kiro-auto-accept/package.json',
    'vscode-extension/package.json'
  ].filter(exists);
  for (const m of manifests) {
    const pkg = JSON.parse(read(m));
    for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
      const deps = pkg[field] || {};
      const names = Object.keys(deps);
      assert(names.length === 0, `${m} declares ${field}: ${names.join(', ')}`);
    }
  }
  return { detail: `${manifests.length} manifests clean` };
});

check('shipped code imports only builtins, relative paths, or "vscode"', () => {
  const builtins = new Set(builtinModules.flatMap(b => [b, b.replace(/^node:/, '')]));
  const files = [];
  const walk = (dir) => {
    if (!fs.existsSync(path.join(ROOT, dir))) return;
    for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = path.posix.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (['node_modules', '.git', 'test', 'daemon'].includes(entry.name)) continue;
        walk(rel);
      } else if (/\.(js|mjs)$/.test(entry.name)) {
        files.push(rel);
      }
    }
  };
  ['bin', 'lib', 'scripts', 'claude-auto-accept', 'kiro-agent', 'kiro-auto-accept', 'vscode-extension'].forEach(walk);
  if (exists('auto-accept.js')) files.push('auto-accept.js');

  // Anchored patterns only: a bare `from '...'` search matches prose and template
  // strings, which produced false positives.
  const patterns = [
    /require\(\s*['"]([^'"]+)['"]\s*\)/g,
    /(?:^|[^.\w$])import\s+[^'";]*?\bfrom\s*['"]([^'"]+)['"]/g,
    /(?:^|[^.\w$])import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /(?:^|[^.\w$])import\s+['"]([^'"]+)['"]/g,
    /(?:^|[^.\w$])export\s+[^'";]*?\bfrom\s*['"]([^'"]+)['"]/g
  ];

  const offenders = new Set();
  // Ignore comments so documentation such as require('ws') in a note is not flagged.
  const stripComments = s => s
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1');

  for (const file of files) {
    const src = stripComments(read(file));
    for (const re of patterns) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(src))) {
        const spec = m[1];
        if (!spec) continue;
        if (spec.startsWith('.') || spec.startsWith('/')) continue;
        if (spec === 'vscode') continue;
        if (spec.startsWith('node:')) continue;
        if (builtins.has(spec)) continue;
        offenders.add(`${file} → ${spec}`);
      }
    }
  }
  assert(offenders.size === 0, `non-builtin imports:\n      ${[...offenders].join('\n      ')}`);
  return { detail: `${files.length} files scanned` };
});

// ── 2. Version consistency across all four sites ──
check('version consistent across package.json, extension, daemon fallback and CHANGELOG', () => {
  const root = JSON.parse(read('package.json')).version;
  const ext = JSON.parse(read('vscode-extension/package.json')).version;
  assert(root === ext, `root package.json ${root} != vscode-extension/package.json ${ext}`);

  const daemonSrc = read('auto-accept.js');
  const fallback = /let PKG_VERSION = '([^']+)'/.exec(daemonSrc);
  assert(fallback, 'PKG_VERSION fallback literal not found in auto-accept.js');
  assert(fallback[1] === root, `PKG_VERSION fallback ${fallback[1]} != package.json ${root}`);

  const changelog = read('CHANGELOG.md');
  const hasEntry = changelog.includes(`## [${root}]`) || changelog.includes('## [Unreleased]');
  assert(hasEntry, `CHANGELOG.md has no "## [${root}]" or "## [Unreleased]" section`);

  return { detail: `v${root}` };
});

// ── 3. Every bin alias resolves ──
check('all package.json bin targets exist', () => {
  const bins = JSON.parse(read('package.json')).bin || {};
  const missing = Object.entries(bins).filter(([, rel]) => !exists(rel)).map(([n, rel]) => `${n} → ${rel}`);
  assert(missing.length === 0, `missing bin targets:\n      ${missing.join('\n      ')}`);
  return { detail: `${Object.keys(bins).length} aliases` };
});

// ── 4. Published file whitelist covers the runtime ──
check('npm `files` whitelist includes every runtime the bin scripts require', () => {
  const pkg = JSON.parse(read('package.json'));
  const files = pkg.files || [];
  const covered = (rel) => files.some(f => {
    const norm = f.replace(/\/$/, '');
    return rel === norm || rel.startsWith(norm + '/');
  });
  const required = [
    'auto-accept.js',
    'bin/antigravity-clean.js',
    'scripts/antigravity_cleaner.py',
    'scripts/antigravity_brain.py',
    'claude-auto-accept/claude-auto-accept.js',
    'kiro-agent/kiro-cli.mjs',
    'kiro-agent/kiro-mcp.mjs',
    'kiro-auto-accept/kiro-auto-accept.js',
    'vscode-extension/placeholder-not-published'
  ].filter(r => !r.includes('placeholder'));

  const missing = required.filter(r => !covered(r));
  assert(missing.length === 0, `not published but required: ${missing.join(', ')}`);
  assert(!files.some(f => f.includes('AGENTS.md')), 'AGENTS.md must not be published (agents in consuming repos would adopt these rules)');
  return { detail: `${required.length} paths checked` };
});

// ── 5. VS Code extension manifest integrity ──
check('extension manifest: main, commands, views, activationEvents and assets are consistent', () => {
  const pkg = JSON.parse(read('vscode-extension/package.json'));
  const contributes = pkg.contributes || {};

  assert(pkg.main && exists(path.posix.join('vscode-extension', pkg.main)), `main "${pkg.main}" does not exist`);

  const declared = new Set((contributes.commands || []).map(x => x.command));
  const src = read('vscode-extension/extension.js');

  // extension.js registers through a helper: reg('start', fn) → `${SECTION}.start`
  const registered = new Set();
  const sectionMatch = /const SECTION = '([^']+)'/.exec(src);
  const section = sectionMatch ? sectionMatch[1] : '';
  let m;
  const directRe = /registerCommand\(\s*['"]([^'"]+)['"]/g;
  while ((m = directRe.exec(src))) registered.add(m[1]);
  const helperRe = /(?:^|[^.\w$])reg\(\s*['"]([^'"]+)['"]/g;
  while ((m = helperRe.exec(src))) registered.add(section ? `${section}.${m[1]}` : m[1]);

  const missing = [...declared].filter(x => !registered.has(x));
  const phantom = [...registered].filter(x => !declared.has(x));
  assert(missing.length === 0, `declared but never registered: ${missing.join(', ')}`);
  assert(phantom.length === 0, `registered but not declared in package.json: ${phantom.join(', ')}`);

  const viewIds = new Set(Object.values(contributes.views || {}).flat().map(v => v.id));
  for (const evt of pkg.activationEvents || []) {
    const mm = /^onView:(.+)$/.exec(evt);
    if (mm) assert(viewIds.has(mm[1]), `activationEvent references unknown view "${mm[1]}"`);
  }

  const assets = [pkg.icon, ...(contributes.viewsContainers?.activitybar || []).map(x => x.icon)];
  for (const step of (contributes.walkthroughs || []).flatMap(w => w.steps || [])) {
    if (step.media && step.media.markdown) assets.push(step.media.markdown);
  }
  for (const a of assets.filter(Boolean)) {
    assert(exists(path.posix.join('vscode-extension', a)), `manifest asset missing: ${a}`);
  }

  const ignore = read('vscode-extension/.vscodeignore');
  assert(/\*\.vsix/.test(ignore), '.vscodeignore must exclude *.vsix (prevents packing stale artifacts)');

  return { detail: `${declared.size} commands, ${assets.filter(Boolean).length} assets` };
});

// ── 6. Bundled daemon never silently drifts ──
check('bundled daemon matches source (when present)', () => {
  const bundled = path.join(ROOT, 'vscode-extension/daemon/auto-accept.js');
  if (!fs.existsSync(bundled)) {
    return { warn: 'daemon/ not built yet — run node vscode-extension/scripts/bundle.js before packaging' };
  }
  const a = fs.readFileSync(path.join(ROOT, 'auto-accept.js'));
  const b = fs.readFileSync(bundled);
  assert(a.equals(b), 'vscode-extension/daemon/auto-accept.js is stale — run the bundle script');
  return { detail: 'in sync' };
});

// ── 7. Forbidden patterns from AGENTS.md ──
check('no forbidden patterns (terminate(), stdout logging in MCP path, raw JSON.parse, signal-as-success)', () => {
  const problems = [];

  for (const f of ['auto-accept.js', 'kiro-auto-accept/kiro-auto-accept.js']) {
    if (!exists(f)) continue;
    const src = read(f);
    // Node's WebSocket has no terminate(); calling it silently leaks the socket.
    const term = /\.terminate\(\)/g;
    let m;
    while ((m = term.exec(src))) {
      const line = src.slice(0, m.index).split('\n').length;
      problems.push(`${f}:${line} uses .terminate() — use .close()`);
    }
  }

  for (const f of fs.existsSync(path.join(ROOT, 'kiro-agent'))
    ? fs.readdirSync(path.join(ROOT, 'kiro-agent')).filter(n => /^(engine-.*\.mjs|kiro-core\.mjs|kiro-controller\.mjs)$/.test(n))
    : []) {
    const rel = path.posix.join('kiro-agent', f);
    const lines = read(rel).split('\n');
    lines.forEach((line, i) => {
      if (/console\.log\(/.test(line)) problems.push(`${rel}:${i + 1} console.log on stdout (MCP JSON-RPC channel) — use console.warn`);
    });
  }

  for (const f of ['auto-accept.js', 'claude-auto-accept/claude-auto-accept.js']) {
    if (!exists(f)) continue;
    const lines = read(f).split('\n');
    lines.forEach((line, i) => {
      if (/JSON\.parse\(\s*fs\.readFileSync/.test(line)) {
        problems.push(`${f}:${i + 1} raw JSON.parse(fs.readFileSync(...)) — use readJsonFile() for BOM tolerance`);
      }
    });
  }

  if (fs.existsSync(path.join(ROOT, 'bin'))) {
    for (const f of fs.readdirSync(path.join(ROOT, 'bin')).filter(n => n.endsWith('.js'))) {
      const rel = path.posix.join('bin', f);
      if (/res\.status !== null \? res\.status : 0/.test(read(rel))) {
        problems.push(`${rel} treats a signal-killed child (null status) as success`);
      }
    }
  }

  assert(problems.length === 0, `forbidden patterns:\n      ${problems.join('\n      ')}`);
  return { detail: 'clean' };
});

// ── 8. Python helpers compile ──
check('python helper scripts compile', () => {
  const scripts = ['scripts/antigravity_cleaner.py', 'scripts/antigravity_brain.py'].filter(exists);
  if (scripts.length === 0) return { warn: 'no python scripts found' };
  const candidates = process.platform === 'win32' ? ['py', 'python', 'python3'] : ['python3', 'python'];
  for (const cmd of candidates) {
    const res = spawnSync(cmd, ['-m', 'py_compile', ...scripts.map(s => path.join(ROOT, s))],
      { stdio: 'pipe', encoding: 'utf8', cwd: ROOT });
    if (res.error && res.error.code === 'ENOENT') continue;
    assert(res.status === 0, `py_compile failed: ${(res.stderr || '').trim().split('\n')[0]}`);
    return { detail: scripts.length + ' scripts' };
  }
  return { warn: 'python not available — skipped' };
});

// ── Summary ──
console.log('');
if (warnings.length) {
  console.log(`${c.yellow}${warnings.length} warning(s)${c.reset}`);
}
if (failures.length) {
  console.log(`${c.red}${c.bold}VERIFY FAILED${c.reset} — ${failures.length} check(s) failed:`);
  failures.forEach(f => console.log(`  ${c.red}•${c.reset} ${f}`));
  console.log(`\n${c.dim}See AGENTS.md for the rules these checks enforce.${c.reset}\n`);
  process.exit(1);
}
console.log(`${c.green}${c.bold}VERIFY PASSED${c.reset} ${c.dim}— all invariants hold${c.reset}\n`);
