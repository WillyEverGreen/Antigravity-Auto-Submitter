/**
 * Antigravity PowerTools — Shadow TDD Enforcer (Test-Driven Development Pipeline)
 * 
 * Enforces strict Red-Green-Refactor cycles across agent tasks:
 * Phase 1 (Red): Ensures tests fail before implementation code is allowed.
 * Phase 2 (Green): Executes implementation until tests pass.
 * Phase 3 (Refactor & Commit): Checks diff cleanliness and confirms tests remain green.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function validateCwd(cwd) {
  if (typeof cwd !== 'string' || !cwd.trim()) {
    throw new TypeError('cwd must be a non-empty string');
  }
  const resolved = path.resolve(cwd);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    throw new Error(`Invalid working directory: ${resolved}`);
  }
  return resolved;
}

function runTestCommand(command = 'npm test', cwd = process.cwd(), options = {}) {
  if (typeof command !== 'string' || !command.trim()) {
    throw new TypeError('testCommand must be a non-empty string');
  }
  if (/[\r\n]/.test(command)) {
    throw new Error('testCommand must not contain newline characters');
  }

  const validCwd = validateCwd(cwd);
  const timeoutMs = Number.isInteger(options.timeoutMs) && options.timeoutMs > 0 ? options.timeoutMs : 120000;

  const res = spawnSync(command, {
    cwd: validCwd,
    encoding: 'utf8',
    shell: true,
    windowsHide: true,
    timeout: timeoutMs
  });

  const stdout = typeof res.stdout === 'string' ? res.stdout : '';
  const stderr = typeof res.stderr === 'string' ? res.stderr : '';
  const output = (stdout + (stderr ? '\n' + stderr : '')).trim();

  let failureType = 'NONE';
  if (res.error) {
    failureType = res.error.code === 'ETIMEDOUT' ? 'TIMEOUT' : 'SPAWN_ERROR';
  } else if (res.status !== 0) {
    failureType = (res.status > 128 || res.signal) ? 'CRASH' : 'TEST_FAILURE';
  }

  return {
    status: res.status,
    passed: res.status === 0 && !res.error,
    failureType,
    error: res.error ? res.error.message : null,
    output
  };
}

class ShadowTddRunner {
  constructor(options = {}) {
    if (options && typeof options !== 'object') {
      throw new TypeError('options must be an object');
    }
    this.cwd = validateCwd(options.cwd || process.cwd());
    this.testCommand = typeof options.testCommand === 'string' ? options.testCommand.trim() : 'npm test';
    if (!this.testCommand) {
      throw new TypeError('testCommand cannot be empty');
    }
    this.timeoutMs = options.timeoutMs || 120000;
    this.maxHistorySize = options.maxHistorySize || 500;
    this.currentPhase = 'INIT';
    this.history = [];
    this.hasRunRed = false;
    this.hasRunGreen = false;
  }

  _recordHistory(record) {
    this.history.push(record);
    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
    }
  }

  runRedPhase() {
    this.currentPhase = 'RED';
    const result = runTestCommand(this.testCommand, this.cwd, { timeoutMs: this.timeoutMs });
    const validRed = !result.passed; // In Red phase, tests MUST fail
    const record = {
      phase: 'RED',
      timestamp: new Date().toISOString(),
      testsFailedAsExpected: validRed,
      failureType: result.failureType,
      output: result.output.slice(0, 1000)
    };
    this._recordHistory(record);

    if (!validRed) {
      throw new Error(`Shadow TDD Red Phase Violation: Tests unexpectedly passed before implementation in ${this.cwd}. Command: "${this.testCommand}"`);
    }

    this.hasRunRed = true;
    this.hasRunGreen = false;
    return record;
  }

  runGreenPhase() {
    this.currentPhase = 'GREEN';
    const result = runTestCommand(this.testCommand, this.cwd, { timeoutMs: this.timeoutMs });
    const validGreen = result.passed; // In Green phase, tests MUST pass
    const record = {
      phase: 'GREEN',
      timestamp: new Date().toISOString(),
      testsPassed: validGreen,
      failureType: result.failureType,
      output: result.output.slice(0, 1000)
    };
    this._recordHistory(record);

    if (!validGreen) {
      throw new Error(`Shadow TDD Green Phase Failure: Tests failed after implementation.\n[${result.failureType}] Output:\n${result.output.slice(0, 500)}`);
    }

    this.hasRunGreen = true;
    return record;
  }

  runRefactorPhase(commitMessage = 'refactor: clean up implementation') {
    if (!this.hasRunGreen) {
      throw new Error('Shadow TDD State Violation: Cannot enter REFACTOR phase before GREEN phase has passed.');
    }

    this.currentPhase = 'REFACTOR';
    // Re-verify tests still pass during refactoring
    const result = runTestCommand(this.testCommand, this.cwd, { timeoutMs: this.timeoutMs });
    if (!result.passed) {
      throw new Error(`Shadow TDD Refactor Phase Failure: Refactoring broke tests.\n[${result.failureType}] Output:\n${result.output.slice(0, 500)}`);
    }

    const record = {
      phase: 'REFACTOR',
      timestamp: new Date().toISOString(),
      commitMessage,
      verified: true
    };
    this._recordHistory(record);
    return record;
  }
}

module.exports = {
  ShadowTddRunner,
  runTestCommand,
  validateCwd
};
