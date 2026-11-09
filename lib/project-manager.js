/**
 * Antigravity PowerTools — Project Manager
 * 
 * Remembers, indexes, and resolves project workspaces for local & remote control.
 * Zero external dependencies — pure Node.js built-ins.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

function getProjectsConfigPath() {
  return process.env.AG_PROJECTS_CONFIG_PATH || path.join(os.homedir(), '.antigravity-auto-submit', 'projects.json');
}

function getDefaultProjectsRoot() {
  return process.env.AG_DEFAULT_PROJECTS_ROOT || path.join(os.homedir(), 'projects');
}

function getSearchRoots() {
  const home = os.homedir();
  return [
    getDefaultProjectsRoot(),
    path.join(home, 'tools'),
    path.join(home, 'source', 'repos'),
    path.join(home, 'Documents')
  ];
}

function loadProjectsConfig() {
  const cfgPath = getProjectsConfigPath();
  const defaultCfg = {
    defaultRoot: getDefaultProjectsRoot(),
    projects: [
      {
        name: 'antigravity-auto-submit',
        path: path.join(os.homedir(), 'tools', 'antigravity-auto-submit'),
        lastOpened: Date.now()
      }
    ]
  };

  if (!fs.existsSync(cfgPath)) return defaultCfg;

  try {
    let raw = fs.readFileSync(cfgPath, 'utf8');
    if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return defaultCfg;
    if (!Array.isArray(parsed.projects)) parsed.projects = defaultCfg.projects;
    if (!parsed.defaultRoot) parsed.defaultRoot = defaultCfg.defaultRoot;
    return parsed;
  } catch (e) {
    return defaultCfg;
  }
}

function saveProjectsConfig(config) {
  const cfgPath = getProjectsConfigPath();
  const dir = path.dirname(cfgPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const rand = crypto.randomBytes(6).toString('hex');
  let tmp = `${cfgPath}.tmp.${process.pid}.${rand}`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(config, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tmp, cfgPath);
    try { fs.chmodSync(cfgPath, 0o600); } catch (e) {}
    tmp = null;
  } finally {
    if (tmp && fs.existsSync(tmp)) {
      try { fs.unlinkSync(tmp); } catch (e) {}
    }
  }
}

class ProjectManager {
  constructor(customConfig = null) {
    this.config = customConfig || loadProjectsConfig();
  }

  reload() {
    this.config = loadProjectsConfig();
    return this.config;
  }

  rememberProject(name, dirPath) {
    const cleanName = (name || path.basename(dirPath)).trim();
    const resolvedPath = path.resolve(dirPath);

    const existingIdx = this.config.projects.findIndex(p => 
      p.path.toLowerCase() === resolvedPath.toLowerCase() ||
      p.name.toLowerCase() === cleanName.toLowerCase()
    );

    const entry = {
      name: cleanName,
      path: resolvedPath,
      lastOpened: Date.now()
    };

    if (existingIdx >= 0) {
      this.config.projects.splice(existingIdx, 1);
    }

    this.config.projects.unshift(entry);
    if (this.config.projects.length > 50) {
      this.config.projects = this.config.projects.slice(0, 50);
    }

    saveProjectsConfig(this.config);
    return entry;
  }

  findProject(query) {
    if (!query) return null;
    const raw = query.trim();

    // 1. If absolute or relative directory path that exists on disk
    if (path.isAbsolute(raw) || raw.startsWith('.') || raw.startsWith('/') || raw.startsWith('\\')) {
      const resolved = path.resolve(raw);
      if (fs.existsSync(resolved)) {
        return this.rememberProject(path.basename(resolved), resolved);
      }
    }

    const qLower = raw.toLowerCase();

    // 2. Check remembered projects (exact match first)
    const exact = this.config.projects.find(p => p.name.toLowerCase() === qLower);
    if (exact && fs.existsSync(exact.path)) {
      exact.lastOpened = Date.now();
      saveProjectsConfig(this.config);
      return exact;
    }

    // 3. Check remembered projects (substring / base folder name match)
    const partial = this.config.projects.find(p => 
      p.name.toLowerCase().includes(qLower) ||
      path.basename(p.path).toLowerCase() === qLower ||
      path.basename(p.path).toLowerCase().includes(qLower)
    );
    if (partial && fs.existsSync(partial.path)) {
      partial.lastOpened = Date.now();
      saveProjectsConfig(this.config);
      return partial;
    }

    // 4. Check known project search roots
    for (const root of getSearchRoots()) {
      const candidate = path.join(root, raw);
      if (fs.existsSync(candidate)) {
        return this.rememberProject(raw, candidate);
      }
    }

    return null;
  }

  createNewProject(rawName, customParent = null) {
    let cleanName = (rawName || '').trim();
    // Normalize phrases like "new clip", "create my-app", "clip"
    cleanName = cleanName.replace(/^(new|create)\s+/i, '').trim();
    if (!cleanName) cleanName = `project-${Date.now().toString(36)}`;

    // Sanitize filesystem forbidden chars for Windows & Linux
    cleanName = cleanName.replace(/[<>:"/\\|?*]/g, '-').trim();

    const parentDir = customParent ? path.resolve(customParent) : (this.config.defaultRoot || getDefaultProjectsRoot());
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    const projectDir = path.join(parentDir, cleanName);
    const existed = fs.existsSync(projectDir);
    if (!existed) {
      fs.mkdirSync(projectDir, { recursive: true });
      const readmePath = path.join(projectDir, 'README.md');
      if (!fs.existsSync(readmePath)) {
        fs.writeFileSync(readmePath, `# ${cleanName}\n\nCreated via Antigravity Remote Mission Control.\n`, 'utf8');
      }
    }

    const entry = this.rememberProject(cleanName, projectDir);
    return { ...entry, newlyCreated: !existed };
  }

  getRecentProjects(limit = 10) {
    return this.config.projects
      .filter(p => fs.existsSync(p.path))
      .slice(0, limit);
  }
}

module.exports = {
  ProjectManager,
  loadProjectsConfig,
  saveProjectsConfig,
  getDefaultProjectsRoot,
  getProjectsConfigPath
};
