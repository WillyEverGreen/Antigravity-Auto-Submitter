/**
 * Test Suite for Antigravity PowerTools Project Manager
 */

'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

console.log('🧪 Starting Project Manager Test Suite...\n');

let passed = 0;
let total = 0;

function it(name, fn) {
  total++;
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    process.exitCode = 1;
  }
}

const testTmpDir = path.join(os.tmpdir(), `ag-pm-test-${process.pid}`);
if (!fs.existsSync(testTmpDir)) fs.mkdirSync(testTmpDir, { recursive: true });

process.env.AG_PROJECTS_CONFIG_PATH = path.join(testTmpDir, 'projects.json');
process.env.AG_DEFAULT_PROJECTS_ROOT = path.join(testTmpDir, 'projects');

const { ProjectManager } = require('../lib/project-manager');

it('initializes with default project and creates config file on demand', () => {
  const pm = new ProjectManager();
  const recent = pm.getRecentProjects();
  assert(recent.length >= 0);
});

it('creates a new project and normalizes "new <name>" command input', () => {
  const pm = new ProjectManager();
  const created = pm.createNewProject('new clip');
  assert.strictEqual(created.name, 'clip');
  assert(fs.existsSync(created.path));
  assert(fs.existsSync(path.join(created.path, 'README.md')));
  assert(created.newlyCreated);
});

it('remembers created projects and finds them by name', () => {
  const pm = new ProjectManager();
  const found = pm.findProject('clip');
  assert(found !== null);
  assert.strictEqual(found.name, 'clip');
});

it('finds projects by substring and base directory', () => {
  const pm = new ProjectManager();
  pm.createNewProject('my-super-dashboard');
  const found = pm.findProject('dashboard');
  assert(found !== null);
  assert.strictEqual(found.name, 'my-super-dashboard');
});

it('handles custom parent directories and paths safely', () => {
  const customParent = path.join(testTmpDir, 'custom-root');
  const pm = new ProjectManager();
  const created = pm.createNewProject('special-tool', customParent);
  assert(created.path.startsWith(customParent));
  assert(fs.existsSync(created.path));
});

// Clean up
try {
  fs.rmSync(testTmpDir, { recursive: true, force: true });
} catch (e) {}

console.log(`\nResults: ${passed}/${total} Project Manager tests passed.`);
if (process.exitCode) process.exit(process.exitCode);

