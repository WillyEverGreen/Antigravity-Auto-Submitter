/**
 * Helper to sync global wrappers and backup daemon folders
 */
const fs = require('fs');
const path = require('path');

const wrapperContent = [
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

// Update C:\tools cmd wrappers
fs.writeFileSync('C:/tools/auto-accept.cmd', wrapperContent, 'utf8');
fs.writeFileSync('C:/tools/antigravity-auto-accept.cmd', wrapperContent, 'utf8');
console.log('✔ Updated C:/tools/auto-accept.cmd and antigravity-auto-accept.cmd');

// Sync updated files to C:\tools\daemon\auto-accept
const daemonDir = 'C:/tools/daemon/auto-accept';
if (fs.existsSync(daemonDir)) {
  fs.copyFileSync('auto-accept.js', path.join(daemonDir, 'auto-accept.js'));
  fs.copyFileSync('package.json', path.join(daemonDir, 'package.json'));
  console.log('✔ Synced auto-accept.js and package.json to C:/tools/daemon/auto-accept');
}

// Sync cleaner and brain scripts to C:\tools
fs.copyFileSync('scripts/antigravity_cleaner.py', 'C:/tools/antigravity_cleaner.py');
fs.copyFileSync('scripts/antigravity_brain.py', 'C:/tools/antigravity_brain.py');
console.log('✔ Synced cleaner & brain to C:/tools');
