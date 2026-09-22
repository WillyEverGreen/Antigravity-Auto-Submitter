<div align="center">

  <img src="resources/icon.png" width="128" height="128" alt="Antigravity Auto-Submitter Logo" />

  <h1>Antigravity Auto-Submitter CLI</h1>

  <p><b>Ultra-fast, zero-interruption developer daemon.</b> Inspired by Vite and Gum, automatically approves tool confirmations and plan dialogs in Antigravity IDE so your agents never get blocked waiting for permissions.</p>

  <p>
    <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge" alt="License" /></a>
    <img src="https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-orange?style=for-the-badge" alt="Platform" />
    <img src="https://img.shields.io/badge/Node-%3E%3D%2018.0.0-blue?style=for-the-badge" alt="Node" />
    <img src="https://img.shields.io/badge/Dependencies-Zero-brightgreen?style=for-the-badge" alt="Dependencies" />
    <img src="https://img.shields.io/badge/Tests-All%20Passing-brightgreen?style=for-the-badge" alt="Tests" />
  </p>

  <p>
    <a href="#quick-setup">Quick Setup</a> •
    <a href="#quick-start">Quick Start</a> •
    <a href="#instant-hotkeys">Instant Hotkeys</a> •
    <a href="#plugin-folder">Plugin to Any Project</a> •
    <a href="#operating-modes">Modes</a> •
    <a href="#safety-guardrails">Keyword Guardrails</a> •
    <a href="#cli-commands">Commands & Flags</a> •
    <a href="#cleanup-suite">Cleanup Suite</a>
  </p>

</div>

---

## 🌟 Overview

When working with Google Antigravity IDE on long-running AI workflows (like `/goal`, full-stack generation, refactors, or test suites), the agent frequently pauses for manual permissions:
- *"Allow running this command?"*
- *"Allow reading / editing this file?"*
- *"Proceed with implementation plan?"*

**Antigravity Auto-Submitter CLI** connects directly to Antigravity's local Chrome DevTools Protocol (CDP) port. It automatically detects, verifies, and clicks approval dialogs instantly without hijacking your physical mouse or keyboard.

---

## 🪟 Multi-Window & Multi-Port Engine (Zero Conflicts)

The daemon provides **first-class concurrent multi-window support**:

- **Concurrent Window Monitoring**: If you have multiple Antigravity IDE workspaces open (e.g., `BEACON` and `antigravity-auto-submit`), `auto-accept` monitors **ALL** windows simultaneously without race conditions, cross-talk, or click collisions.
- **Dedicated Isolated Sessions**: Each window connects via its own `WindowSession` with an isolated WebSocket connection, dedicated CDP request tracking (`reqId`), and distinct keyword block state.
- **Dynamic Auto-Attach & Detach**: When you open a new Antigravity window, the daemon auto-attaches to it within 2 seconds. When you close a window, it cleanly detaches without restarting or affecting your other open windows.
- **Flexible Port Architecture**: 
  - **Auto-Discovery (Default)**: Automatically detects Antigravity across common ports (`9333`, `9334`, `9335`, etc.) and system listening ports.
  - **Explicit Single Port**: `auto-accept -p 9334` locks onto and manages only port 9334.
  - **Multiple Explicit Ports**: `auto-accept --ports 9333,9334` monitors specific ports concurrently.
- **Per-Port Lockfiles**: Lockfiles are scoped per port (`daemon_<port>.pid`). Multiple daemons can manage separate ports in parallel without blocking each other.

---

<a id="quick-setup"></a>
## ⚡ Quick Setup (Works on Any PC in 30 Seconds)

### ⏱️ The 30-Second Fast Track
```bash
# 1. Install CLI globally direct from GitHub (works on any PC)
npm install -g WillyEverGreen/Antigravity-Auto-Submitter

# 2. Configure Antigravity shortcuts (patches Desktop, Taskbar & Start Menu)
auto-accept setup

# 3. Restart Antigravity IDE (required so the port flag takes effect):
#    Close Antigravity IDE completely and reopen it from your Desktop/Taskbar
#    OR simply run this one command to auto-restart it with debugging enabled:
auto-accept restart

# 4. Start auto-approvals!
auto-accept
```

> [!IMPORTANT]
> **Why do I need to restart Antigravity IDE after `auto-accept setup`?**
> Chromium/Electron only enables `--remote-debugging-port=9333` when the application is launched from scratch. It cannot attach a port to an already-running process. If you run `auto-accept setup` while Antigravity is open, you **must close and re-open** Antigravity (or run `auto-accept restart`) before running `auto-accept`.

---

### 📦 Step 1: Install CLI

Choose any of these methods depending on your workflow:

```bash
# Option A: Direct from GitHub (Works immediately on ANY PC)
npm install -g WillyEverGreen/Antigravity-Auto-Submitter

# Option B: From npm Registry (Once published)
npm install -g antigravity-auto-submit

# Option C: From Local Clone (Your current PC)
cd antigravity-auto-submit
npm install -g .
# (or 'npm link')

# Option D: Zero-Install via npx
npx github:WillyEverGreen/Antigravity-Auto-Submitter setup
npx github:WillyEverGreen/Antigravity-Auto-Submitter
```

---

### 🔌 Step 2: Connect Antigravity IDE

Antigravity IDE needs to launch with remote debugging enabled on port `9333`:

#### ⚡ Option A: Automated Shortcut Setup (Windows & Linux - Recommended)
Run once in your terminal:
```bash
auto-accept setup
```
*Automatically configures your **Desktop Shortcuts**, Windows **Taskbar pinned shortcuts**, and **Start Menu shortcuts** (or Linux `.desktop` entries) to append `--remote-debugging-port=9333`.*

#### 🔄 Option B: 1-Command Auto-Restart (Instant)
If Antigravity IDE is already open without debugging enabled:
```bash
auto-accept restart
```
*Gracefully closes existing Antigravity IDE processes and relaunches with `--remote-debugging-port=9333` active.*

#### 🚀 Option C: 1-Click Launch (Cross-Platform)
Launch Antigravity IDE with the remote debugging port enabled in one command:
```bash
auto-accept launch
```
*Automatically locates your Antigravity executable, verifies whether an instance is already running on port 9333, and spawns the IDE with remote debugging enabled.*

#### 🛠️ Option C: Manual Launch
- **Windows (PowerShell)**:
  ```powershell
  Start-Process "Antigravity IDE" -ArgumentList "--remote-debugging-port=9333"
  ```
- **Windows (Desktop Shortcut)**:
  Right-click **Antigravity IDE** shortcut → **Properties** → In **Target**, append ` --remote-debugging-port=9333`
- **macOS (Terminal)**:
  ```bash
  open -a "Antigravity" --args --remote-debugging-port=9333
  ```
- **Linux (Terminal)**:
  ```bash
  antigravity --remote-debugging-port=9333
  ```

---

### 🩺 Step 3: Verify & Start Daemon

#### 1. Verify Connection Status
```bash
auto-accept doctor
```
*Checks your Node.js version, Python runtime, Antigravity IDE binary path, CDP port availability, and target Antigravity IDE workbench windows.*

#### 2. Start Approval Daemon
```bash
# Start default Autonomous daemon (auto-approves safe tools, pauses for plan review)
auto-accept
```

---

<a id="quick-start"></a>
## 🚀 Quick Start

Run directly from any terminal:

```bash
# Autonomous Mode (Default - reviews plans, auto-approves safe tools)
auto-accept

# Autopilot Mode (100% hands-free - auto-approves plans + tools)
auto-accept --mode autopilot

# Background Daemon Mode (Non-interactive)
auto-accept --daemon
```

---

<a id="instant-hotkeys"></a>
## ⚡ Instant Hotkeys (Vite-Style)

No need to press Enter! Simply press any of these keys while the daemon is running in your terminal:

| Key | Action | Description |
| :---: | :--- | :--- |
| **`p`** | **Pause / Resume** | Instantly toggles auto-approvals on or off without restarting. |
| **`m`** | **Toggle Mode** | Cycles between **Autonomous** (reviews plans) and **Autopilot** (100% hands-free). |
| **`a`** | **Add Rule** | Interactively add a keyword rule to Ask or Skip list without restarting. |
| **`r`** | **Remove Rule** | Interactively remove a keyword rule from Ask or Skip list. |
| **`s`** | **Live Stats** | Displays live session approvals, lifetime approvals, blocks, and target window. |
| **`c`** | **Show Config** | Prints active configuration source, ports, and guardrail lists. |
| **`d`** | **Doctor Diagnostic** | Runs immediate connection, runtime & workbench diagnostic check. |
| **`h`** / **`?`** | **Help Banner** | Redisplays the dashboard banner and hotkeys. |
| **`q`** | **Quit** | Cleanly disconnects from Antigravity and exits (`Ctrl + C` also works). |

---

<a id="plugin-folder"></a>
## 🔌 Plugin to Any Project Folder

You can drop custom safety rules into any repository or folder:

```bash
# Inside any project folder:
auto-accept init
```

This generates `.auto-accept.json` in that directory:

```json
{
  "mode": "autonomous",
  "safetyDelayMs": 200,
  "askKeywords": [
    "git push",
    "git reset --hard"
  ],
  "skipKeywords": [
    "rm -rf",
    "drop table",
    "git push --force",
    "format c:",
    "del /f /s /q c:"
  ]
}
```

Whenever you run `auto-accept` inside that folder, it **automatically loads that project's custom rules**!

---

<a id="operating-modes"></a>
## 🎯 Operating Modes

### 1. Autonomous (Recommended Default)
- **Tool Confirmations**: Automatically confirmed via Option 1 (*"Allow this time"*), preserving per-command keyword gating.
- **Implementation Plans**: **Pauses for your review**. Perfect for general coding where you want to inspect implementation plans before execution.

```bash
auto-accept --mode autonomous
# or configure persistent mode:
auto-accept mode autonomous
```

### 2. Autopilot (100% Hands-Free)
- **Tool Confirmations**: Automatically confirmed.
- **Implementation Plans**: **Automatically approved** (*Proceed* / *Proceed with implementation plan*).
- Ideal for unattended overnight runs, automated migration scripts, or `/goal` sessions.

```bash
auto-accept --mode autopilot
# or configure persistent mode:
auto-accept mode autopilot
```

### 3. Quick Mode Toggle
```bash
# Instantly toggles between Autonomous and Autopilot
auto-accept m
```

---

<a id="safety-guardrails"></a>
## 🛡️ Safety Keyword Guardrails

Easily manage two independent safety lists with dedicated subcommands or interactive hotkeys:

### Add Rules Instantly
```bash
# Add commands that must pause for manual permission in chat:
auto-accept add-ask "npm publish"
auto-accept add-ask "git push,git reset --hard,deploy"

# Add commands that are directly skipped from auto-submission:
auto-accept add-skip "terraform destroy"

# Target global user config (~/.antigravity-auto-submit/config.json):
auto-accept add-ask "docker system prune" --global
```

### Remove Rules Instantly
```bash
# Remove from whichever list contains it:
auto-accept rm "npm publish"

# Remove specifically from Ask or Skip list:
auto-accept rm-ask "git reset --hard"
auto-accept rm-skip "terraform destroy"

# Interactive numbered picker (no arguments):
auto-accept rm
```

### Live Interactive Hotkeys
While the daemon is running in your terminal, press:
- **`a`**: Interactively adds a keyword rule to Ask or Skip list on-the-fly (saves to active config).
- **`r`**: Displays numbered list of active rules to pick and remove instantly.

### View Active Rules
```bash
auto-accept list
```

---

<a id="cli-commands"></a>
## 📋 CLI Commands & Flags

### Subcommands
| Command | Action |
| :--- | :--- |
| `auto-accept` | Start auto-submit confirmation daemon (default) |
| `auto-accept launch` | 🚀 Auto-launch Antigravity IDE with remote debugging port enabled |
| `auto-accept restart` | 🔄 Gracefully close running Antigravity instances & relaunch with debug port |
| `auto-accept setup` | ⚡ 1-Click auto-patch Desktop, Taskbar & Start Menu shortcuts with `--remote-debugging-port=9333` |
| `auto-accept kill` | 🛑 Terminate all running Antigravity IDE processes |
| `auto-accept doctor` | 🩺 System diagnostic & connection verification (Node, Python, CDP, windows) |
| `auto-accept init` | Create `.auto-accept.json` in the current folder |
| `auto-accept mode [mode]` | Inspect or switch operating mode (`autonomous` or `autopilot`) |
| `auto-accept m` | ⚡ Quick-toggle between Autonomous and Autopilot mode |
| `auto-accept pause` | Pause auto-approvals without stopping daemon |
| `auto-accept resume` | Resume active auto-approvals |
| `auto-accept list` | Display active Ask and Skip guardrail rules |
| `auto-accept config` | Display active configuration JSON |
| `auto-accept status` | Query connection and approval statistics as JSON |
| `auto-accept add-ask <kw>` | Add keyword(s) requiring manual permission |
| `auto-accept add-skip <kw>` | Add keyword(s) to directly skip |
| `auto-accept rm <kw>` | Remove keyword(s) from any active list |
| `auto-accept rm-ask <kw>` | Remove keyword(s) from Ask list |
| `auto-accept rm-skip <kw>` | Remove keyword(s) from Skip list |
| `antigravity-check` / `auto-accept check` | 🔍 Run 3-tier deletion audit scan (Safe / Review / Do Not Delete) |
| `antigravity-find-temp` / `auto-accept find-temp` | 🔎 Preview individual candidate temporary files before deletion (dry-run) |
| `antigravity-clean` / `auto-accept clean` | 🧹 Purge safe temporary scratch scripts, browser recordings, and caches |
| `antigravity-brain` / `auto-accept brain` | 🧠 Inspect session brain disk distribution and delete specific sessions |

> [!TIP]
> **Universal Command Aliases:**
> All subcommands support direct standalone binary aliases. You can run any of these identically from any terminal on your PC:
> - `auto-accept setup` ⬌ `antigravity-setup` ⬌ `agy-setup`
> - `auto-accept restart` ⬌ `antigravity-restart` ⬌ `agy-restart`
> - `auto-accept launch` ⬌ `antigravity-launch` ⬌ `agy-launch`
> - `auto-accept doctor` ⬌ `antigravity-doctor` ⬌ `agy-doctor`
> - `auto-accept check` ⬌ `antigravity-check` ⬌ `agy-check`
> - `auto-accept clean` ⬌ `antigravity-clean` ⬌ `agy-clean`
> - `auto-accept brain` ⬌ `antigravity-brain` ⬌ `agy-brain`

### Flags
```
OPTIONS:
  -m, --mode <mode>       Operating mode: autonomous or autopilot
  -p, --port <port>       CDP port (default: auto-detect 9333 / 9000-9400)
  --ports <ports>         Comma-separated candidate CDP ports (e.g. 9333,9334)
  -d, --delay <ms>        Safety delay in ms before clicking (default: 200)
  --poll <ms>             DOM scanner frequency in ms (default: 250)
  --ask <patterns>        Comma-separated commands requiring permission
  --skip <patterns>       Comma-separated commands to directly skip
  --add-ask <pattern>     Append a keyword to the Ask list
  --add-skip <pattern>    Append a keyword to the Skip list
  --daemon                Run non-interactively in background (no stdin TUI)
  --quiet                 Suppress non-essential output
  -c, --config <file>     Path to custom configuration JSON
  --save                  Persist active CLI options to current config file
  -v, --version           Show version
  -h, --help              Show help
```

---

<a id="cleanup-suite"></a>
## 🧹 Workstation Audit & Temp Cleanup Suite

The **Antigravity Auto-Submitter** suite provides unified CLI tools (`antigravity-check`, `antigravity-find-temp`, `antigravity-clean`, `antigravity-brain`, and `auto-accept <cmd>`) to audit and safely purge temporary files, caches, recordings, conversation databases, and orphan sandboxes across the entire workstation.

> [!IMPORTANT]
> **Multi-Root Architecture:**
> The cleaner scans and manages **both** Antigravity data environments simultaneously:
> 1. `~/.gemini/antigravity-ide/` (Antigravity IDE app data & brain storage)
> 2. `~/.gemini/antigravity/` (Antigravity CLI / AGY core engine data & brain storage)
> 3. `~/.gemini/antigravity-browser-profile/` (Headless Chromium profile caches)
> 4. `~/.gemini/tmp/` & `~/.gemini/history/` (Cloned repo workspaces & file history)
> 5. System `%TEMP%` & Package Manager Caches (`uv`, `npm-cache`, `pip/Cache`, `ms-playwright`)

---

### 🛡️ Complete 3-Tier Safety Topology

| Tier | Category / Storage Path | Description & Behavior |
| :--- | :--- | :--- |
| **🟢 Tier 1: SAFE TO DELETE**<br>*(No review required)* | • `scratch/` (Global across roots)<br>• `browser_recordings/` (WebP videos)<br>• `brain/<id>/scratch/`<br>• `brain/<id>/.system_generated/` (Logs)<br>• `annotations/` (Cached AST indices)<br>• `crashes/` (Crash dump logs)<br>• `implicit/` (Implicit context caches)<br>• `context_state/` (Context caches)<br>• `html_artifacts/` (HTML previews)<br>• `prompting/` (Browser step caches)<br>• `antigravity-browser-profile/` (Web caches)<br>• `%TEMP%` (Agent temporary scripts)<br>• `uv/cache`, `npm-cache`, `pip/Cache` | Disposable cache files, video recordings, scratch scripts, and logs that can be purged at any time without data loss. Reclaimed via `antigravity-clean --all`. |
| **🟡 Tier 2: REVIEW CANDIDATES**<br>*(Age-gated analysis)* | • `brain/<id>` (Inactive sessions > 7d)<br>• `conversations/*.db` (Databases > 7d)<br>• `~/.gemini/tmp/` (Cloned workspaces)<br>• `~/.gemini/history/` (File history)<br>• `~/tools/**/node_modules`, `.venv` (> 14d)<br>• `%LOCALAPPDATA%/ms-playwright` | Historical artifacts and past conversation databases. Advisable to delete when stale, but guarded against active conversations. Reclaimed via `--stale` or `--deep`. |
| **🔴 Tier 3: DO NOT DELETE**<br>*(Strictly Protected)* | • `~/.gemini/config/` (User rules & skills)<br>• `antigravity-ide/builtin/` (Core skills)<br>• `mcp_config.json` & `mcp/` folders<br>• `user_settings.pb` & `settings.json`<br>• `installation_id`<br>• `google_accounts.json` & OAuth tokens<br>• **Active Conversation Session** | Core configuration, custom skills, user settings, auth credentials, and active session files are permanently shielded from deletion. |

---

### 🔍 3-Tier Workstation Audit (`antigravity-check` / `agy-check`)

Run at any time in any terminal to inspect system temporary space categorized into the 3 safety tiers:

```bash
antigravity-check
# or short alias: agy-check
# or via daemon:  auto-accept check
```

**JSON Output Mode:**
```bash
antigravity-check --json
```

---

### 🔎 Temporary File Discovery Scanner (`antigravity-find-temp` / `agy-find-temp`)

Preview individual candidate files eligible for cleanup before executing deletions (dry-run mode):

```bash
# Preview top 35 candidate files ranked by size
antigravity-find-temp

# Preview top 50 files
antigravity-find-temp --limit 50

# Output candidate files as JSON
antigravity-find-temp --json
```

---

### 🧹 Purging Temporary & Stale Files (`antigravity-clean` / `agy-clean`)

```bash
# Purge ALL Tier 1 safe temporary items (~1.09 GB freed)
antigravity-clean --all

# Purge Tier 1 safe items + stale brain sessions & conversation DBs (> 7 days)
antigravity-clean --stale

# Perform a COMPLETE DEEP CLEAN (Tier 1 + stale brain + stale DBs + temp repos + deps: ~4.96 GB)
antigravity-clean --deep

# Custom age threshold (e.g. purge stale items > 3 days old)
antigravity-clean --stale --days 3

# Skip confirmation prompt (non-interactive automation)
antigravity-clean --all --force

# Granular targeted cleanups:
antigravity-clean --browser-cache      # Clean Chromium browser profile web caches
antigravity-clean --conversations       # Clean stale conversation SQLite databases
antigravity-clean --tmp                 # Clean cloned temporary workspaces in ~/.gemini/tmp
antigravity-clean --history             # Clean workspace file history snapshots
antigravity-clean --scratch             # Clean global and session scratch scripts
antigravity-clean --recordings          # Clean browser WebP video recordings
antigravity-clean --caches              # Clean NPM, Pip, and UV package caches
```

---

### 🧠 Brain Session Manager (`antigravity-brain` / `agy-brain`)

Inspect disk space distribution across all active conversation sessions, extract project topics, and perform targeted session cleanup with automatic companion database purging:

```bash
# Display brain sessions ranked by disk size with project topics
antigravity-brain
# or short alias: agy-brain
# or via daemon:  auto-accept brain

# Delete a specific session by Table # Number (e.g. session #2 in the list)
antigravity-brain --delete 2

# Delete a specific session by ID or prefix (supports pasting "9178f300-5..")
antigravity-brain --delete 9178f300

# Delete all sessions older than N days (automatically purges matching .db/.pb files)
antigravity-brain --delete-older-than 7

# Delete empty / zero-file brain directories
antigravity-brain --clean-empty

# Display full 36-character UUIDs
antigravity-brain --full-id

# Run interactive session delete picker
antigravity-brain --interactive
```

---

## 🔍 Frequently Asked Questions (FAQ & Search Index)

#### Q: How do I automatically approve tool permissions in Google Antigravity IDE?
> Run `npm install -g WillyEverGreen/Antigravity-Auto-Submitter` and launch your IDE with `auto-accept setup` or `auto-accept launch`. The background daemon automatically approves terminal execution and file modification prompts in real time.

#### Q: How do I run Antigravity IDE on 100% hands-free autopilot overnight?
> Run `auto-accept --mode autopilot`. In Autopilot mode, the daemon auto-approves both tool execution prompts AND implementation plan dialogs (*Proceed* / *Proceed with plan*).

#### Q: What does `--remote-debugging-port=9333` do in Antigravity IDE?
> Google Antigravity IDE is built on Electron/VSCode architecture. Passing `--remote-debugging-port=9333` enables Chrome DevTools Protocol (CDP), allowing `auto-accept` to inspect DOM approval cards safely without taking control of your physical mouse or keyboard.

#### Q: How do I prevent risky commands (like `git push` or `rm -rf`) from auto-executing?
> `auto-accept` includes built-in keyword guardrails. Use `auto-accept add-ask "git push"` to enforce manual confirmation for sensitive commands, or `auto-accept add-skip "rm -rf"` to skip destructive operations completely.

---

## 🧪 Automated Testing

```bash
npm test
```

Runs the automated test suite verifying scanner script compilation, configuration parsing, target filtering, and stats persistence.

---

## 📄 License

MIT License. Copyright (c) 2026 WillyEverGreen.
