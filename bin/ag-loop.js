#!/usr/bin/env node
'use strict';
const { AdversarialCritic } = require('../lib/autonomous-swarm');

console.log('🛡️ Antigravity PowerTools — Dual-Agent Adversarial Loop');
const critic = new AdversarialCritic();
console.log('✅ Adversarial Critic initialized with HMAC-SHA256 green approval token gate.');
process.exit(0);

