#!/usr/bin/env node
process.argv.splice(2, 0, 'start');
const { main } = require('../kiro-auto-accept.js');
if (typeof main === 'function') {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
