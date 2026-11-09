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
  const roots = [
    getDefaultProjectsRoot(),
    path.join(home, 'tools'),
    path.join(home, 'source', 'repos'),
    path.join(home, 'Documents')
  ];

  // Include primary drives on Windows (D:\FullStack Projects, D:\EXPERIMENTS PROJECTS, etc.)
  if (process.platform === 'win32') {
    for (const drive of ['D:\\', 'E:\\']) {
      if (fs.existsSync(drive)) {
        try {
          const subdirs = fs.readdirSync(drive, { withFileTypes: true });
          for (const s of subdirs) {
            if (s.isDirectory() && !s.name.startsWith('$') && !s.name.startsWith('.')) {
              roots.push(path.join(drive, s.name));
            }
          }
        } catch (e) {}
      }
    }
  }

  return roots;
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
    this.syncFromAntigravityIde();
  }

  reload() {
    this.config = loadProjectsConfig();
    this.syncFromAntigravityIde();
    return this.config;
  }

  syncFromAntigravityIde() {
    try {
      const { DatabaseSync } = require('node:sqlite');
      const vscdbPath = process.env.AG_VSCDB_PATH || path.join(process.env.APPDATA || '', 'Antigravity IDE', 'User', 'globalStorage', 'state.vscdb');
      if (!fs.existsSync(vscdbPath)) return [];

      const db = new DatabaseSync(vscdbPath, { readOnly: true });
      const row = db.prepare('SELECT value FROM ItemTable WHERE key = ?').get('history.recentlyOpenedPathsList');
      if (!row || !row.value) return [];

      const parsed = JSON.parse(row.value);
      const entries = parsed.entries || [];
      const synced = [];

      for (const e of entries) {
        if (!e.folderUri) continue;
        try {
          const rawUri = decodeURIComponent(e.folderUri);
          const cleanPath = path.resolve(rawUri.replace(/^file:\/\/\//, ''));
          if (fs.existsSync(cleanPath)) {
            const shortName = path.basename(cleanPath).toLowerCase();
            const existing = this.config.projects.find(p => p.path.toLowerCase() === cleanPath.toLowerCase());
            if (!existing) {
              const item = {
                name: shortName,
                path: cleanPath,
                lastOpened: Date.now() - synced.length * 1000
              };
              this.config.projects.push(item);
              synced.push(item);
            }
          }
        } catch (err) {}
      }

      if (synced.length > 0) {
        saveProjectsConfig(this.config);
      }
      return synced;
    } catch (e) {
      return [];
    }
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

  addAlias(rawAlias, rawPath) {
    let cleanAlias = (rawAlias || '').trim();
    let cleanPath = (rawPath || '').trim();

    // Tolerate inverted argument order: /add <path> <alias>
    if (fs.existsSync(cleanAlias) && (!cleanPath || !fs.existsSync(cleanPath))) {
      const tmp = cleanAlias;
      cleanAlias = cleanPath || path.basename(tmp);
      cleanPath = tmp;
    }

    if (!cleanPath) cleanPath = cleanAlias;
    const resolved = path.resolve(cleanPath);
    if (!fs.existsSync(resolved)) {
      throw new Error(`Directory not found: "${resolved}"`);
    }

    cleanAlias = (cleanAlias || path.basename(resolved)).toLowerCase().trim();
    return this.rememberProject(cleanAlias, resolved);
  }

  removeProject(nameOrQuery) {
    const q = (nameOrQuery || '').toLowerCase().trim();
    const idx = this.config.projects.findIndex(p => 
      p.name.toLowerCase() === q || 
      p.path.toLowerCase() === q
    );
    if (idx >= 0) {
      const removed = this.config.projects.splice(idx, 1)[0];
      saveProjectsConfig(this.config);
      return removed;
    }
    return null;
  }

  findProject(query) {
    if (!query) return null;
    const raw = query.trim();

    // 0. Numeric index from recent list: e.g. "/open 1" or "/open 4"
    if (/^\d+$/.test(raw)) {
      const idx = parseInt(raw, 10) - 1;
      const recent = this.getRecentProjects(50);
      if (idx >= 0 && idx < recent.length) {
        recent[idx].lastOpened = Date.now();
        saveProjectsConfig(this.config);
        return recent[idx];
      }
    }

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

    // 4. Try syncing from IDE state.vscdb
    this.syncFromAntigravityIde();
    const syncedMatch = this.config.projects.find(p => 
      p.name.toLowerCase() === qLower ||
      path.basename(p.path).toLowerCase() === qLower ||
      p.name.toLowerCase().includes(qLower)
    );
    if (syncedMatch && fs.existsSync(syncedMatch.path)) {
      syncedMatch.lastOpened = Date.now();
      saveProjectsConfig(this.config);
      return syncedMatch;
    }

    // 5. Check known project search roots
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
