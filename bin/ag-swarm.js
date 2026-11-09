#!/usr/bin/env node
'use strict';
const path = require('node:path');
const { AdversarialCritic, MidFlightSteering } = require('../lib/autonomous-swarm');

console.log('⚡ Antigravity PowerTools — Autonomous Execution Swarm');
const steering = new MidFlightSteering();
if (steering.hasSteering()) {
  const steer = steering.readAndConsumeSteering();
  console.log(`🧭 Mid-Flight Steer applied: "${steer.instruction}"`);
} else {
  console.log('ℹ No active STEERING.md detected. Running in standard swarm mode.');
}
process.exit(0);

