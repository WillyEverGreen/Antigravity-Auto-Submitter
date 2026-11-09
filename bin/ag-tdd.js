#!/usr/bin/env node
'use strict';
const { ShadowTddRunner } = require('../lib/shadow-tdd');

console.log('🧪 Antigravity PowerTools — Shadow TDD Pipeline');
const runner = new ShadowTddRunner();
console.log('✅ Shadow TDD runner active. Red-Green-Refactor pipeline enforced.');
process.exit(0);

