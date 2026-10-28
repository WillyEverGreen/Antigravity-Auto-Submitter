// Copies the daemon into the extension so the .vsix is self-contained.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const dest = path.join(__dirname, '..', 'daemon');
fs.mkdirSync(dest, { recursive: true });
fs.copyFileSync(path.join(root, 'auto-accept.js'), path.join(dest, 'auto-accept.js'));
console.log('Bundled daemon/auto-accept.js');
