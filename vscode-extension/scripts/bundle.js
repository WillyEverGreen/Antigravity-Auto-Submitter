// Copies the daemon into the extension so the .vsix is self-contained.
// Runs via npm's `prepackage`, `prepublish:vsce` and `prepublish:ovsx` hooks, so a
// published build can never ship a stale (or missing) daemon.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const src = path.join(root, 'auto-accept.js');
const dest = path.join(__dirname, '..', 'daemon');
const destFile = path.join(dest, 'auto-accept.js');

if (!fs.existsSync(src)) {
  console.error(`bundle: source daemon not found at ${src}`);
  process.exit(1);
}

fs.mkdirSync(dest, { recursive: true });
fs.copyFileSync(src, destFile);

const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
if (hash(src) !== hash(destFile)) {
  console.error('bundle: copy verification failed — bundled daemon does not match the source.');
  process.exit(1);
}

console.log(`Bundled daemon/auto-accept.js (sha256 ${hash(src).slice(0, 12)})`);
