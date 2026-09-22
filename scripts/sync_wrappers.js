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

console.log('🔄 Synchronizing Master Workstation Tools & Wrappers...\n');

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

fs.writeFileSync('C:/tools/auto-accept.cmd', autoAcceptWrapper, 'utf8');
fs.writeFileSync('C:/tools/antigravity-auto-accept.cmd', autoAcceptWrapper, 'utf8');
fs.writeFileSync('C:/tools/antigravity-auto-submit.cmd', autoAcceptWrapper, 'utf8');
fs.writeFileSync('C:/tools/agy-setup.cmd', buildSubcommandWrapper('setup'), 'utf8');
fs.writeFileSync('C:/tools/antigravity-setup.cmd', buildSubcommandWrapper('setup'), 'utf8');
fs.writeFileSync('C:/tools/agy-doctor.cmd', buildSubcommandWrapper('doctor'), 'utf8');
fs.writeFileSync('C:/tools/antigravity-doctor.cmd', buildSubcommandWrapper('doctor'), 'utf8');
fs.writeFileSync('C:/tools/agy-launch.cmd', buildSubcommandWrapper('launch'), 'utf8');
fs.writeFileSync('C:/tools/antigravity-launch.cmd', buildSubcommandWrapper('launch'), 'utf8');
console.log('  ✔ Updated C:/tools auto-accept, doctor, setup, and launch wrappers');

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
  { file: 'agy-check.cmd', script: 'antigravity_cleaner.py', args: '--check' },
  { file: 'antigravity-check.cmd', script: 'antigravity_cleaner.py', args: '--check' },
  { file: 'agy-find-temp.cmd', script: 'antigravity_cleaner.py', args: '--scan' },
  { file: 'antigravity-find-temp.cmd', script: 'antigravity_cleaner.py', args: '--scan' },
  { file: 'agy-brain.cmd', script: 'antigravity_brain.py', args: '' },
  { file: 'antigravity-brain.cmd', script: 'antigravity_brain.py', args: '' }
];

pyWrappers.forEach(w => {
  fs.writeFileSync(path.join('C:/tools', w.file), buildPyWrapper(w.script, w.args), 'utf8');
  console.log(`  ✔ Updated C:/tools/${w.file}`);
});

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

fs.writeFileSync('C:/tools/line-cap.js', lineCapContent, 'utf8');
console.log('  ✔ Patched C:/tools/line-cap.js (Eliminated stdin hang on <= 20 results)');

// 5. Sync updated files to C:\tools\daemon\auto-accept
const daemonDir = 'C:/tools/daemon/auto-accept';
if (fs.existsSync(daemonDir)) {
  fs.copyFileSync('auto-accept.js', path.join(daemonDir, 'auto-accept.js'));
  fs.copyFileSync('package.json', path.join(daemonDir, 'package.json'));
  console.log('  ✔ Synced auto-accept.js and package.json to C:/tools/daemon/auto-accept');
}

// 6. Sync cleaner and brain scripts to C:\tools
fs.copyFileSync('scripts/antigravity_cleaner.py', 'C:/tools/antigravity_cleaner.py');
fs.copyFileSync('scripts/antigravity_brain.py', 'C:/tools/antigravity_brain.py');
console.log('  ✔ Synced cleaner & brain to C:/tools');

console.log('\n✨ All workstation tools and wrappers are 100% synchronized and resilient!');
