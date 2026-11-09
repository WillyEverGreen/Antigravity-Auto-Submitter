/**
 * Antigravity PowerTools — Autonomous Swarm & Adversarial Loop Engine
 * 
 * Features:
 * - Dual-Agent Adversarial Loop (Builder + Red-Team Critic).
 * - Cryptographic Green Approval Gate (HMAC-SHA256).
 * - Anti-Cheat Invariant Enforcement (no skipped tests, weakened assertions, swallowed errors).
 * - Mid-Flight Live Steering (STEERING.md & Telegram steer queue).
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

function resolveCriticKey() {
  if (process.env.CRITIC_SECRET_KEY) return process.env.CRITIC_SECRET_KEY;
  const globalDir = path.join(os.homedir(), '.antigravity-auto-submit');
  const keyPath = path.join(globalDir, 'critic.key');
  if (fs.existsSync(keyPath)) {
    try {
      const k = fs.readFileSync(keyPath, 'utf8').trim();
      if (k) return k;
    } catch (_) {}
  }
  const newKey = crypto.randomBytes(32).toString('hex');
  try {
    if (!fs.existsSync(globalDir)) fs.mkdirSync(globalDir, { recursive: true });
    fs.writeFileSync(keyPath, newKey, { mode: 0o600, encoding: 'utf8' });
  } catch (_) {}
  return newKey;
}

const SECRET_KEY = resolveCriticKey();
const STEERING_FILE = 'STEERING.md';

const FORBIDDEN_DIFF_PATTERNS = [
  { pattern: /\b(test\.skip|it\.skip|describe\.skip|xit\(|xdescribe\()/i, reason: 'Skipped test suite detected' },
  { pattern: /\.(only|skip)\s*\(/, reason: 'Exclusive or skipped test focus detected (.only/.skip)' },
  { pattern: /expect\(\s*true\s*\)\.to(Equal|Be)\(\s*true\s*\)/i, reason: 'Trivial tautological assertion detected' },
  { pattern: /catch\s*\([^)]*\)\s*\{[\s\+]*?(?:\/\/[^\n]*|\/\*[\s\S]*?\*\/)?[\s\+]*\}/, reason: 'Swallowed empty catch block detected' },
  { pattern: /\/\/\s*TODO:\s*(implement|fixme)/i, reason: 'Unfinished stub implementation detected' },
  { pattern: /return\s+true;\s*\/\/\s*TODO/i, reason: 'Hardcoded success stub detected' }
];

class AdversarialCritic {
  constructor(options = {}) {
    this.secret = options.secret || SECRET_KEY;
  }

  evaluateDiff(diffText) {
    if (typeof diffText !== 'string') {
      throw new TypeError('diffText must be a string');
    }
    if (diffText.length > 10 * 1024 * 1024) {
      throw new RangeError('diffText exceeds 10MB safety ceiling');
    }

    const violations = [];

    for (const { pattern, reason } of FORBIDDEN_DIFF_PATTERNS) {
      if (pattern.test(diffText)) {
        violations.push(reason);
      }
    }

    if (violations.length > 0) {
      return {
        approved: false,
        token: null,
        reason: violations[0],
        feedback: `Critic Rejected: ${violations.join('; ')}`,
        violations
      };
    }

    // Generate cryptographic green approval token
    const hash = crypto.createHmac('sha256', this.secret)
      .update(diffText)
      .digest('hex');

    const token = `CRITIC_APPROVAL_${hash.substring(0, 16)}`;
    return {
      approved: true,
      token,
      feedback: 'Critic Approved: All anti-cheat and structural invariants verified clean.'
    };
  }

  verifyApprovalToken(token, diffText) {
    if (typeof token !== 'string' || typeof diffText !== 'string' || !token.startsWith('CRITIC_APPROVAL_')) {
      return false;
    }
    const expected = `CRITIC_APPROVAL_${crypto.createHmac('sha256', this.secret).update(diffText).digest('hex').substring(0, 16)}`;
    const tokenBuf = Buffer.from(token);
    const expectedBuf = Buffer.from(expected);
    if (tokenBuf.length !== expectedBuf.length) return false;
    return crypto.timingSafeEqual(tokenBuf, expectedBuf);
  }
}

class MidFlightSteering {
  constructor(cwd = process.cwd()) {
    this.cwd = cwd;
    this.steeringPath = path.join(cwd, STEERING_FILE);
  }

  hasSteering() {
    return fs.existsSync(this.steeringPath);
  }

  readAndConsumeSteering() {
    try {
      let content = fs.readFileSync(this.steeringPath, 'utf8');
      if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1);
      const trimmed = content.trim();

      const archivePath = path.join(this.cwd, `.${STEERING_FILE}.last`);
      if (trimmed) {
        fs.writeFileSync(archivePath, trimmed + '\n', { mode: 0o644, encoding: 'utf8' });
      }
      try { fs.unlinkSync(this.steeringPath); } catch (e) {
        if (e.code !== 'ENOENT') throw e;
      }

      if (!trimmed) return null;
      return {
        timestamp: new Date().toISOString(),
        instruction: trimmed
      };
    } catch (err) {
      if (err.code === 'ENOENT') return null;
      throw err;
    }
  }
}

module.exports = {
  AdversarialCritic,
  MidFlightSteering
};

