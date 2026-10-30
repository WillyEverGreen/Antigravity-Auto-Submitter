/**
 * Master Workstation & Tools Sync Script
 * 
 * Synchronizes:
 * 1. auto-accept.cmd & antigravity-auto-accept.cmd
 * 2. All agy-* and antigravity-* .cmd wrappers with workspace-first priority & py/python fallback
 * 3. line-cap.js with proper close/end lifecycle handling
 * 4. Fallback daemon copies in C:\tools\daemon\auto-accept
 * 5. Python scripts in C:\tools
 */

const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');

console.log('🔄 Synchronizing Master Workstation Tools & Wrappers...\n');

const hasCTools = process.platform === 'win32' && fs.existsSync('C:/tools');

function safeWriteFileSync(filePath, content, encoding = 'utf8') {
  try {
    fs.writeFileSync(filePath, content, encoding);
    return true;
  } catch (err) {
    if (err.code === 'EPERM' || err.code === 'EACCES') {
      console.warn(`  ⚠ Cannot write to ${filePath} (requires elevation or unsandboxed execution)`);
      return false;
    }
    throw err;
  }
}

function safeCopyFileSync(src, dest) {
  try {
    fs.copyFileSync(src, dest);
    return true;
  } catch (err) {
    if (err.code === 'EPERM' || err.code === 'EACCES') {
      console.warn(`  ⚠ Cannot copy to ${dest} (requires elevation or unsandboxed execution)`);
      return false;
    }
    throw err;
  }
}

// 1. auto-accept, antigravity-auto-accept, & antigravity-auto-submit wrappers
const autoAcceptWrapper = [
  '@echo off',
  'if exist "%USERPROFILE%\\tools\\antigravity-auto-submit\\auto-accept.js" (',
  '  node "%USERPROFILE%\\tools\\antigravity-auto-submit\\auto-accept.js" %*',
  ') else if exist "%~dp0daemon\\auto-accept\\auto-accept.js" (',
  '  node "%~dp0daemon\\auto-accept\\auto-accept.js" %*',
  ') else if exist "%~dp0..\\daemon\\auto-accept\\auto-accept.js" (',
  '  node "%~dp0..\\daemon\\auto-accept\\auto-accept.js" %*',
  ') else (',
  '  node "%~dp0auto-accept.js" %*',
  ')',
  ''
].join('\r\n');

function buildSubcommandWrapper(subcmd) {
  return [
    '@echo off',
    'if exist "%USERPROFILE%\\tools\\antigravity-auto-submit\\auto-accept.js" (',
    `  node "%USERPROFILE%\\tools\\antigravity-auto-submit\\auto-accept.js" ${subcmd} %*`,
    ') else if exist "%~dp0daemon\\auto-accept\\auto-accept.js" (',
    `  node "%~dp0daemon\\auto-accept\\auto-accept.js" ${subcmd} %*`,
    ') else (',
    `  auto-accept ${subcmd} %*`,
    ')',
    ''
  ].join('\r\n');
}

if (hasCTools) {
  let writesSucceeded = 0;
  const ctoolsFiles = [
    ['C:/tools/auto-accept.cmd', autoAcceptWrapper],
    ['C:/tools/antigravity-auto-accept.cmd', autoAcceptWrapper],
    ['C:/tools/antigravity-auto-submit.cmd', autoAcceptWrapper],
    ['C:/tools/agy-setup.cmd', buildSubcommandWrapper('setup')],
    ['C:/tools/antigravity-setup.cmd', buildSubcommandWrapper('setup')],
    ['C:/tools/agy-doctor.cmd', buildSubcommandWrapper('doctor')],
    ['C:/tools/antigravity-doctor.cmd', buildSubcommandWrapper('doctor')],
    ['C:/tools/agy-start.cmd', buildSubcommandWrapper('start')],
    ['C:/tools/antigravity-start.cmd', buildSubcommandWrapper('start')],
    ['C:/tools/agy-launch.cmd', buildSubcommandWrapper('launch')],
    ['C:/tools/antigravity-launch.cmd', buildSubcommandWrapper('launch')],
    ['C:/tools/agy-restart.cmd', buildSubcommandWrapper('restart')],
    ['C:/tools/antigravity-restart.cmd', buildSubcommandWrapper('restart')],
    ['C:/tools/agy-update.cmd', buildSubcommandWrapper('update')],
    ['C:/tools/antigravity-update.cmd', buildSubcommandWrapper('update')],
    ['C:/tools/agy-uninstall.cmd', buildSubcommandWrapper('uninstall')],
    ['C:/tools/antigravity-uninstall.cmd', buildSubcommandWrapper('uninstall')],
  ];

  for (const [p, content] of ctoolsFiles) {
    if (safeWriteFileSync(p, content, 'utf8')) writesSucceeded++;
  }

  // Kiro Auto-Accept wrappers
  const kiroAutoAcceptWrapper = [
    '@echo off',
    'if exist "%USERPROFILE%\\tools\\antigravity-auto-submit\\kiro-auto-accept\\kiro-auto-accept.js" (',
    '  node "%USERPROFILE%\\tools\\antigravity-auto-submit\\kiro-auto-accept\\kiro-auto-accept.js" %*',
    ') else if exist "%~dp0kiro-auto-accept\\kiro-auto-accept.js" (',
    '  node "%~dp0kiro-auto-accept\\kiro-auto-accept.js" %*',
    ') else (',
    '  node "%~dp0kiro-auto-accept.js" %*',
    ')',
    ''
  ].join('\r\n');
  if (safeWriteFileSync('C:/tools/kiro-auto-accept.cmd', kiroAutoAcceptWrapper, 'utf8')) writesSucceeded++;
  if (safeWriteFileSync('C:/tools/kiro-accept.cmd', kiroAutoAcceptWrapper, 'utf8')) writesSucceeded++;

  // Claude Auto-Accept wrappers
  const claudeAutoAcceptWrapper = [
    '@echo off',
    'if exist "%USERPROFILE%\\tools\\antigravity-auto-submit\\claude-auto-accept\\claude-auto-accept.js" (',
    '  node "%USERPROFILE%\\tools\\antigravity-auto-submit\\claude-auto-accept\\claude-auto-accept.js" %*',
    ') else if exist "%~dp0claude-auto-accept\\claude-auto-accept.js" (',
    '  node "%~dp0claude-auto-accept\\claude-auto-accept.js" %*',
    ') else (',
    '  node "%~dp0claude-auto-accept.js" %*',
    ')',
    ''
  ].join('\r\n');
  if (safeWriteFileSync('C:/tools/claude-auto-accept.cmd', claudeAutoAcceptWrapper, 'utf8')) writesSucceeded++;
  if (safeWriteFileSync('C:/tools/claude-accept.cmd', claudeAutoAcceptWrapper, 'utf8')) writesSucceeded++;

  if (writesSucceeded > 0) {
    console.log(`  ✔ Updated ${writesSucceeded} C:/tools command wrappers`);
  }
} else {
  console.log('  ℹ Skipping C:/tools cmd wrappers (platform is not win32 or C:/tools does not exist)');
}

// 2. Helper to build resilient Python wrapper
function buildPyWrapper(scriptName, extraArgs = '') {
  const extra = extraArgs ? ' ' + extraArgs : '';
  return [
    '@echo off',
    'setlocal',
    `set "SCRIPT=%USERPROFILE%\\tools\\antigravity-auto-submit\\scripts\\${scriptName}"`,
    `if not exist "%SCRIPT%" set "SCRIPT=%~dp0${scriptName}"`,
    'where py >nul 2>nul',
    'if %ERRORLEVEL% equ 0 (',
    `  py "%SCRIPT%"${extra} %*`,
    ') else (',
    `  python "%SCRIPT%"${extra} %*`,
    ')',
    ''
  ].join('\r\n');
}

// 3. Update all Antigravity tool wrappers
const pyWrappers = [
  { file: 'agy-clean.cmd', script: 'antigravity_cleaner.py', args: '' },
  { file: 'antigravity-clean.cmd', script: 'antigravity_cleaner.py', args: '' },
  { file: 'clean-ag.cmd', script: 'antigravity_cleaner.py', args: '--ag' },
  { file: 'clean-agy.cmd', script: 'antigravity_cleaner.py', args: '--ag' },
  { file: 'agy-clean-ag.cmd', script: 'antigravity_cleaner.py', args: '--ag' },
  { file: 'clean-ides.cmd', script: 'antigravity_cleaner.py', args: '--ides' },
  { file: 'agy-clean-ides.cmd', script: 'antigravity_cleaner.py', args: '--ides' },
  { file: 'clean-all.cmd', script: 'antigravity_cleaner.py', args: '--all' },
  { file: 'agy-clean-all.cmd', script: 'antigravity_cleaner.py', args: '--all' },
  { file: 'agy-check.cmd', script: 'antigravity_cleaner.py', args: '--check' },
  { file: 'antigravity-check.cmd', script: 'antigravity_cleaner.py', args: '--check' },
  { file: 'check-ides.cmd', script: 'antigravity_cleaner.py', args: '--check --ides' },
  { file: 'ides-check.cmd', script: 'antigravity_cleaner.py', args: '--check --ides' },
  { file: 'agy-check-ides.cmd', script: 'antigravity_cleaner.py', args: '--check --ides' },
  { file: 'check-ag.cmd', script: 'antigravity_cleaner.py', args: '--check --ag' },
  { file: 'agy-check-ag.cmd', script: 'antigravity_cleaner.py', args: '--check --ag' },
  { file: 'agy-find-temp.cmd', script: 'antigravity_cleaner.py', args: '--scan' },
  { file: 'antigravity-find-temp.cmd', script: 'antigravity_cleaner.py', args: '--scan' },
  { file: 'agy-brain.cmd', script: 'antigravity_brain.py', args: '' },
  { file: 'antigravity-brain.cmd', script: 'antigravity_brain.py', args: '' }
];

if (hasCTools) {
  pyWrappers.forEach(w => {
    if (safeWriteFileSync(path.join('C:/tools', w.file), buildPyWrapper(w.script, w.args), 'utf8')) {
      console.log(`  ✔ Updated C:/tools/${w.file}`);
    }
  });
}

// 4. Fix C:\tools\line-cap.js to handle close & end events properly
const lineCapContent = [
  'const readline = require("readline");',
  '',
  'const max = parseInt(process.argv[2] || "20", 10);',
  'let count = 0;',
  '',
  'const rl = readline.createInterface({',
  '  input: process.stdin,',
  '  output: process.stdout,',
  '  terminal: false',
  '});',
  '',
  'rl.on("line", (line) => {',
  '  if (count++ < max) {',
  '    console.log(line);',
  '  } else {',
  '    rl.close();',
  '    process.exit(0);',
  '  }',
  '});',
  '',
  'rl.on("close", () => {',
  '  process.exit(0);',
  '});',
  '',
  'process.stdin.on("end", () => {',
  '  process.exit(0);',
  '});',
  ''
].join('\r\n');

if (hasCTools) {
  if (safeWriteFileSync('C:/tools/line-cap.js', lineCapContent, 'utf8')) {
    console.log('  ✔ Patched C:/tools/line-cap.js (Eliminated stdin hang on <= 20 results)');
  }
}

// 5. Sync updated files to C:\tools\daemon\auto-accept & global npm module
const daemonDir = 'C:/tools/daemon/auto-accept';
if (fs.existsSync(daemonDir)) {
  const s1 = safeCopyFileSync(path.join(repoRoot, 'auto-accept.js'), path.join(daemonDir, 'auto-accept.js'));
  const s2 = safeCopyFileSync(path.join(repoRoot, 'package.json'), path.join(daemonDir, 'package.json'));
  if (s1 && s2) {
    console.log('  ✔ Synced auto-accept.js and package.json to C:/tools/daemon/auto-accept');
  }
}

const globalNpmDir = path.join(process.env.APPDATA || '', 'npm/node_modules/antigravity-auto-submit');
if (fs.existsSync(globalNpmDir)) {
  safeCopyFileSync(path.join(repoRoot, 'auto-accept.js'), path.join(globalNpmDir, 'auto-accept.js'));
  safeCopyFileSync(path.join(repoRoot, 'package.json'), path.join(globalNpmDir, 'package.json'));

  const globalBinDir = path.join(globalNpmDir, 'bin');
  if (!fs.existsSync(globalBinDir)) {
    try { fs.mkdirSync(globalBinDir, { recursive: true }); } catch (e) {}
  }
  fs.readdirSync(path.join(repoRoot, 'bin')).forEach(f => {
    safeCopyFileSync(path.join(repoRoot, 'bin', f), path.join(globalBinDir, f));
  });

  const globalScriptsDir = path.join(globalNpmDir, 'scripts');
  if (!fs.existsSync(globalScriptsDir)) {
    try { fs.mkdirSync(globalScriptsDir, { recursive: true }); } catch (e) {}
  }
  fs.readdirSync(path.join(repoRoot, 'scripts')).forEach(f => {
    const srcPath = path.join(repoRoot, 'scripts', f);
    if (f !== 'sync_wrappers.js' && fs.statSync(srcPath).isFile()) {
      safeCopyFileSync(srcPath, path.join(globalScriptsDir, f));
    }
  });

  console.log('  ✔ Synced auto-accept.js, package.json, bin/, and scripts/ to global npm directory');
}

// 6. Sync cleaner and brain scripts to C:\tools
if (hasCTools) {
  const c1 = safeCopyFileSync(path.join(repoRoot, 'scripts/antigravity_cleaner.py'), 'C:/tools/antigravity_cleaner.py');
  const c2 = safeCopyFileSync(path.join(repoRoot, 'scripts/antigravity_brain.py'), 'C:/tools/antigravity_brain.py');
  if (c1 && c2) {
    console.log('  ✔ Synced cleaner & brain to C:/tools');
  }
}

console.log('\n✨ All workstation tools and wrappers are 100% synchronized and resilient!');
