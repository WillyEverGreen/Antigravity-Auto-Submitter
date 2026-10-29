# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commonly Used Commands

### Test & Verification
- **Run all tests**: `npm test` (runs Antigravity CLI, Kiro Agent, Kiro Auto-Accept, Claude Auto-Accept, Kiro Setup, and VS Code Extension suites)
- **Run Antigravity CLI tests only**: `node test/cli.test.js`
- **Run VS Code Extension tests**: `npm run test:extension` (or `node test/vscode-extension.test.js`)
- **Package VS Code Extension (.vsix)**: `npm run extension:package`
- **Publish VS Code Extension**: `npm run extension:publish:vsce` (or `npm run extension:publish:ovsx`)
- **Run Kiro agent tests only**: `npm run test:kiro` or `node test/kiro-agent.test.mjs`
- **Run Kiro Auto-Accept tests**: `node kiro-auto-accept/test/kiro.test.js`
- **Run Claude Auto-Accept tests**: `npm run test:claude` or `node claude-auto-accept/test/claude-hook.test.js`
- **Verify Python helper scripts**:
  - Windows: `py -m py_compile scripts/antigravity_cleaner.py scripts/antigravity_brain.py`
  - Linux/macOS: `python3 -m py_compile scripts/antigravity_cleaner.py scripts/antigravity_brain.py`
- **Run specific test logic**: The test harness in `test/cli.test.js` is a self-contained custom `it()` runner using Node's `assert` and `vm` modules. Target individual components via Node one-liners, e.g.:
  ```bash
  node -e "const { buildScannerScript } = require('./auto-accept.js'); console.log(buildScannerScript({ mode: 'autopilot' }).length);"
  ```

### Running the CLI & Daemon
- **Start daemon (default autonomous mode)**: `node auto-accept.js`
- **Easy start (auto-launch/restart IDE if needed + attach)**: `node auto-accept.js start`
- **Autopilot mode (hands-free plans & tools)**: `node auto-accept.js --mode autopilot`
- **Diagnostic check**: `node auto-accept.js doctor`
- **Setup Claude Code auto-accept hook**: `npm run claude:setup` (or `node claude-auto-accept/claude-auto-accept.js setup`)
- **Check Claude Code auto-accept status**: `npm run claude:status` (or `node claude-auto-accept/claude-auto-accept.js status`)
- **Audit workstation disk space**: `node bin/antigravity-check.js`
- **Safe workstation cleanup**: `node bin/antigravity-clean.js --all`
- **Manage brain sessions**: `node bin/antigravity-brain.js`
- **Sync workstation wrappers to `C:/tools` & global npm**: `node scripts/sync_wrappers.js`

---

## High-Level Architecture

### Core Design Principles
- **Zero External Dependencies**: All Node.js code runs on pure native standard libraries (`http`, `readline`, `child_process`, `vm`, `fs`, `os`, `path`). Never introduce third-party npm packages.
- **Dual-Product Architecture**: Differentiates between:
  1. **Antigravity IDE** (`Antigravity IDE.exe`, VS Code fork, default port `9333`, workbench URL `vscode-file://vscode-app/workbench.html`).
  2. **Antigravity App** (`Antigravity.exe`, standalone desktop interface, default port `9334`, local engine URL `https://127.0.0.1:<port>/` or `http://localhost:<port>/`).
- **CDP Communication**: Interacts with Chromium DevTools Protocol endpoints discovered over loopback ports (`9333`, `9334`, or scanned `9000-9400`) via HTTP `/json` queries and raw WebSocket connections.

### Main Components in `auto-accept.js`

```
                      ┌──────────────────────────────────────┐
                      │          AutoSubmitDaemon            │
                      │  - TUI Hotkeys (p, m, a, r, s, d, q) │
                      │  - Config Hot-Reload & Port Locks    │
                      │  - StatsManager (Atomic JSON writes) │
                      └──────────────────┬───────────────────┘
                                         │ manages
                    ┌────────────────────┴────────────────────┐
                    ▼                                         ▼
         ┌─────────────────────┐                   ┌─────────────────────┐
         │    WindowSession    │                   │    WindowSession    │
         │ (IDE Workspace #1)  │                   │ (IDE Workspace #2)  │
         │ - Isolated ws/reqId │                   │ - Isolated ws/reqId │
         │ - Dedicated blocks  │                   │ - Dedicated blocks  │
         └──────────┬──────────┘                   └──────────┬──────────┘
                    │                                         │
                    └─────────────────┬───────────────────────┘
                                      ▼
                      ┌──────────────────────────────────────┐
                      │       buildScannerScript(cfg)        │
                      │ Injected into DOM via CDP Runtime:   │
                      │ - Inspects cards & buttons           │
                      │ - Gating: Ask vs Skip keywords       │
                      │ - Selects Option 1 (Allow this time) │
                      │ - Debounces via `data-agy-clicked`   │
                      │ - Rejects completed task logs        │
                      └──────────────────────────────────────┘
```

1. **`AutoSubmitDaemon`**:
   - Manages process locking per port (`~/.antigravity-auto-submit/daemon_<port>.pid`).
   - Polls active CDP endpoints (`findCdpEndpoints`) and synchronizes active `WindowSession`s.
   - Monitors config file modification time (`checkConfigReload`) to dynamically update mode and safety rules without restart.
   - Provides an interactive TUI keypress loop (`setupInstantHotkeys`) with non-blocking stdin handling.

2. **`WindowSession`**:
   - Represents a single attached IDE or App window target.
   - Encapsulates its own WebSocket connection, CDP `reqId` counter, approval/block counts, and scan interval.
   - Injects the compiled scanner script via CDP `Runtime.evaluate` every polling tick (default 250ms).

3. **`buildScannerScript(cfg)`**:
   - Generates stringified vanilla JavaScript evaluated inside the Antigravity window renderer.
   - Enclosing card text is checked against `askKeywords` (pauses for user prompt) and `skipKeywords` (aborts action).
   - In autonomous mode, auto-selects Option 1 (*"Allow this time"*) rather than session-whitelisting to retain per-command gating.
   - In autopilot mode, auto-detects and confirms implementation plan dialogs (*Proceed (Plan)*).
   - Prevents click loops: marks clicked buttons with `data-agy-clicked="true"` and filters out completed task accordions (e.g. labels containing `finished`, `completed`, or with `aria-expanded`).

4. **Lifecycle & Setup Subcommands**:
   - `handleEasyStart`: Verifies IDE status; spawns or restarts with `--remote-debugging-port=9333` if not bound, then boots the daemon.
   - `handleSetup`: Patches Windows Desktop/Taskbar/Start Menu shortcuts, Linux `.desktop` entries, and macOS shell aliases to include the debugging port.
   - `handleDoctor`: Diagnoses Node, Python, IDE executables, and active CDP target availability.

### Workstation Cleanup & Brain Management (`bin/` & `scripts/`)
- **`bin/*.js`**: Thin Node wrapper scripts using `child_process.spawnSync` to forward CLI arguments and exit codes directly to the Python backend scripts.
- **`scripts/antigravity_cleaner.py`**:
  - Implements a 3-tier cleanup topology across `~/.gemini/antigravity-ide/` and `~/.gemini/antigravity/`:
    - **Tier 1 (Safe)**: Scratch scripts, browser recordings, logs, crash dumps, and caches.
    - **Tier 2 (Review)**: Inactive sessions (> 7d), historical conversation databases (`.db`), cloned repos in `tmp/`.
    - **Tier 3 (Protected)**: Core config, custom skills, user settings (`user_settings.pb`), credentials (`google_accounts.json`), and the active conversation session (`ANTIGRAVITY_CONVERSATION_ID`).
- **`scripts/antigravity_brain.py`**:
  - Multi-root session inspector. Displays session IDs and sizes, deletes specific sessions by ID prefix or index, and cleans up companion databases and caches.

### Kiro Subsystems (`kiro-auto-accept/` & `kiro-agent/`)
- **`kiro-auto-accept/`**:
  - Autonomous confirmation daemon dedicated to Kiro IDE on port `9222` (`kiro-auto-accept.js`).
  - Scans both Kiro workbench and nested webviews while ignoring Antigravity ports and external browsers.
- **`kiro-agent/`**:
  - Multi-engine agent framework with CLI (`kiro-cli.mjs`) and MCP server (`kiro-mcp.mjs`).
  - Engines: Architect-Editor (`engine-architect-editor.mjs`), LLM Council (`engine-council.mjs`), Code Critic (`engine-critic.mjs`), Episodic Memory with vector retrieval (`engine-memory.mjs`), Context Budgeting (`engine-context-budget.mjs`), Quality Retry (`engine-quality-retry.mjs`), and Semantic Router (`engine-semantic-router.mjs`).

### Claude Code Subsystem (`claude-auto-accept/`)
- **`claude-auto-accept/`**:
  - Native `PreToolUse` hook engine for Claude Code CLI (`claude-auto-accept.js`).
  - Evaluates tool permission requests via stdin/stdout JSON protocol without requiring a background daemon.
  - Automatically approves safe shell commands and edits while blocking `skipKeywords` (`rm -rf`, `drop table`) and pausing for `askKeywords` (`git push`, sensitive files).
  - 1-click registration/removal in project (`.claude/settings.json`) or global (`~/.claude/settings.json`) configuration.

### Testing Strategy
- Tests in `test/cli.test.js` mock DOM structures inside `vm.runInNewContext` to test `buildScannerScript` without needing a running IDE or Chromium instance.
- Tests in `test/kiro-agent.test.mjs` validate Kiro agent engines, MCP server, security armor, and context budgets.
- Tests in `kiro-auto-accept/test/kiro.test.js` validate Kiro IDE CDP target selection, scanner script, and button matching.
- Tests in `claude-auto-accept/test/claude-hook.test.js` validate Claude Code `PreToolUse` hook protocol, keyword guardrails, file shields, and settings file registration.
