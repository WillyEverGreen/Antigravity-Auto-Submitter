#!/usr/bin/env node
'use strict';
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const daemon = path.join(__dirname, '..', 'auto-accept.js');
const res = spawnSync(process.execPath, [daemon, ...process.argv.slice(2)], { stdio: 'inherit' });
process.exit(res.status !== null ? res.status : 1);

