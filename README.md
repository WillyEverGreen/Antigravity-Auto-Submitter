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
    <a href="#manual-setup">Manual Port Setup (All OS)</a> •
    <a href="#updating">Updating</a> •
    <a href="#uninstalling">Uninstalling / Delete</a> •
    <a href="#quick-start">Quick Start</a> •
    <a href="#instant-hotkeys">Instant Hotkeys</a> •
    <a href="#plugin-folder">Plugin to Any Project</a> •
    <a href="#operating-modes">Modes</a> •
    <a href="#safety-guardrails">Keyword Guardrails</a> •
    <a href="#cli-commands">Commands & Flags</a> •
    <a href="#cleanup-sequence">Cleanup Sequence</a> •
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
## ⚡ Quick Setup: The Bulletproof 3-Step Setup (Works Every Time)

Following these **3 simple steps** guarantees Antigravity Auto-Submit works reliably on any machine without depending on brittle automation scripts or losing browser tabs.

> [!TIP]
> **Why the Manual Shortcut Target is the Gold Standard:**
> * **Deterministic Initialization:** The `--remote-debugging-port=9333` flag is bound right at process creation. Zero chance of race conditions or port-binding failures.
> * **No Flaky Scripts or Broken Permissions:** Avoids Windows COM script permissions, background task schedulers, and registry hooks.
> * **Zero Lost Tabs or Crashed Sessions:** Autosetup scripts frequently run blind `taskkill` commands that nuke your open personal browser windows and trigger crash recovery prompts. The shortcut approach preserves all existing work.
> * **Officially Documented Standard:** Referenced in system guidelines: *"If automated port setup fails, append `--remote-debugging-port=9333` manually to shortcut / launcher."*

---

### 🎯 Step 1: Install the CLI Globally

Install directly from GitHub (works on any Windows, macOS, or Linux machine with Node.js 18+):

```bash
npm install -g WillyEverGreen/Antigravity-Auto-Submitter
```

*(Or if you cloned this repository locally, run `npm install -g .` inside the folder).*

---

### 🎯 Step 2: Add `--remote-debugging-port=9333` to Your Antigravity Shortcut Target

Configure your Antigravity launcher once so it always opens with remote debugging enabled:

#### 🪟 Windows Setup (Desktop & Taskbar)

1. **Close Antigravity IDE completely first** (Chromium singletons ignore flags if an active instance is running).
2. **Desktop or Start Menu Shortcut:**
   - Right-click your **Antigravity IDE** shortcut icon → Click **Properties**.
   - In the **Shortcut** tab, locate the **Target** field.
   - At the very end of the text, append a space followed by:
     ```text
     --remote-debugging-port=9333
     ```
     *Example Target:*
     ```text
     "C:\Users\<Username>\AppData\Local\Programs\Antigravity\Antigravity.exe" --remote-debugging-port=9333
     ```
   - Click **Apply**, then click **OK**.
3. **Taskbar Pinned Shortcut:**
   - Right-click the pinned **Antigravity IDE** icon on your Windows Taskbar.
   - In the popup jump list, right-click **Antigravity IDE** → select **Properties**.
   - In the **Target** field, append a space and `--remote-debugging-port=9333`.
   - Click **Apply** → **OK**.

#### 🍏 macOS Setup
Add a permanent alias to your shell profile (`~/.zshrc` or `~/.bash_profile`):
```bash
alias antigravity='open -a "Antigravity" --args --remote-debugging-port=9333'
```
Reload with `source ~/.zshrc`, then launch Antigravity with `antigravity`.

#### 🐧 Linux Setup
Edit your desktop entry (`~/.local/share/applications/antigravity.desktop`):
```ini
Exec=antigravity --remote-debugging-port=9333 %U
```
Update desktop database: `update-desktop-database ~/.local/share/applications/`.

---

### 🎯 Step 3: Launch Antigravity from That Shortcut & Start Daemon!

1. Open **Antigravity IDE** using your configured shortcut.
2. Open your terminal in any workspace and run:
   ```bash
   auto-accept
   ```
3. That's it! The daemon connects instantly to port `9333` and starts handling tool approvals automatically.

---

### 👻 Ghost Process & Singleton Troubleshooting (Safe & Non-Destructive)

If you launched Antigravity from your shortcut but `auto-accept` reports:
```text
  CDP Port Status:    No active port detected ⚠️
  Process Status:     Antigravity IDE is RUNNING (without debug port) ⚠️
```

#### Why does this happen? (The Singleton Problem)
Chromium / Electron enforces a **single parent process model**. If an older `Antigravity.exe` process was already running in the background (hidden in system tray, suspended, or an orphaned helper process), clicking your shortcut merely activated the existing process, and Chromium **silently dropped** the `--remote-debugging-port` flag.

#### 🛡️ Safe PID Resolution (Never use blind `taskkill`):
Do **NOT** run blind commands like `taskkill /F /IM chrome.exe` or blanket kills. That will destroy your open browser tabs, discard unsaved form data, and trigger recovery dialogs.

Follow these safe, PID-targeted steps instead:

1. **Save your work** in Antigravity and close the window normally.
2. **Find the exact lingering PID:**
   - **Windows CLI:**
     ```cmd
     tasklist /FI "IMAGENAME eq Antigravity.exe"
     ```
     Or check who is holding the port:
     ```cmd
     netstat -ano | findstr :9333
     ```
   - **Windows GUI (Recommended):**
     - Press `Ctrl + Shift + Esc` to open **Task Manager**.
     - Switch to the **Details** tab (which shows exact PIDs and process names).
     - Find any lingering `Antigravity.exe` processes.
   - **macOS / Linux:**
     ```bash
     pgrep -l Antigravity
     lsof -i :9333
     ```
3. **End ONLY that specific lingering PID:**
   - In Task Manager: Right-click the specific `Antigravity.exe` PID → **End Process Tree**.
   - In PowerShell: `Stop-Process -Id <PID> -Force`
   - In macOS/Linux: `kill <PID>`
4. **Relaunch Antigravity** from your configured shortcut. The debugging port is now cleanly bound!

---

### 🛠️ Optional Convenience CLI Launchers

While the manual shortcut target above is the bulletproof foundation, you can also use these built-in convenience shortcuts:

| Command | Capability |
| :--- | :--- |
| **`auto-accept start`** | **Easy Start:** Checks if IDE is running with port; if not, automatically launches/restarts IDE with port 9333 and starts the daemon in one step. |
| **`auto-accept restart`** | **1-Command Restart:** Gracefully closes existing Antigravity process and relaunches fresh with port 9333 enabled. |
| **`auto-accept launch`** | Spawns Antigravity IDE with remote debugging port enabled without starting the approval daemon. |
| **`auto-accept setup`** | Attempts automated Windows Desktop/Taskbar or Linux `.desktop` shortcut patching. |
| **`auto-accept doctor`** | Diagnostic probe verifying Node.js, Python, IDE executable, and CDP port status. |

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

<a id="updating"></a>
## 🔄 Updating to the Latest Version

To update Antigravity Auto-Submitter to the newest release with the latest bugfixes, Taskbar auto-patching, and features:

### Option A: 1-Command CLI Update (Recommended)
```bash
auto-accept update
```
*(Automatically pulls and installs the latest version globally from GitHub).*

### Option B: Via npm Global Command
```bash
npm install -g WillyEverGreen/Antigravity-Auto-Submitter
```

### Option C: If You Cloned the Repository Locally
```bash
cd antigravity-auto-submit
git pull
npm install -g .
```

After updating, restart Antigravity with the debug port enabled:
```bash
auto-accept restart
auto-accept
```

---

<a id="uninstalling"></a>
## 🗑️ Uninstalling & Removing the Project

If you ever need to completely uninstall the tool, delete the project, revert shortcuts back to standard, or clear cached configs:

### Option A: 1-Command Automatic Uninstall (Fastest)
```bash
auto-accept uninstall
```
*This automatically:*
1. Removes local project config (`.auto-accept.json`)
2. Removes global user directory (`~/.antigravity-auto-submit`)
3. Reverts Windows shortcuts (removes `--remote-debugging-port` from Desktop, Taskbar & Start Menu)
4. Uninstalls global npm CLI binaries

---

### Option B: Manual Step-by-Step Removal

#### 1. Uninstall the Global npm Package
```bash
npm uninstall -g antigravity-auto-submit WillyEverGreen/Antigravity-Auto-Submitter
```

#### 2. Remove Configuration Files
- **Local Project Config (`.auto-accept.json`)**:
  - **Windows (PowerShell)**: `Remove-Item -Force .auto-accept.json`
  - **Windows (CMD)**: `del .auto-accept.json`
  - **macOS / Linux**: `rm -f .auto-accept.json`
- **Global User Config (`~/.antigravity-auto-submit`)**:
  - **Windows (PowerShell)**: `Remove-Item -Recurse -Force "$env:USERPROFILE\.antigravity-auto-submit"`
  - **Windows (CMD)**: `rmdir /s /q "%USERPROFILE%\.antigravity-auto-submit"`
  - **macOS / Linux**: `rm -rf ~/.antigravity-auto-submit`

#### 3. Delete Cloned Repository Folder (If you cloned from Git)
- **Windows (PowerShell)**: `Remove-Item -Recurse -Force .\antigravity-auto-submit`
- **Windows (CMD)**: `rmdir /s /q antigravity-auto-submit`
- **macOS / Linux**: `rm -rf antigravity-auto-submit`

#### 4. Revert Antigravity Shortcut Flags (Optional)
If you want to manually remove the debugging port flag:
- Right-click your **Antigravity IDE** Desktop or Taskbar shortcut → **Properties**.
- In the **Target** field, remove ` --remote-debugging-port=9333` from the end and click **OK**.

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
| `auto-accept update` | 🔄 Update CLI globally to latest release from GitHub |
| `auto-accept uninstall` | 🗑️ Fully uninstall CLI, restore shortcuts & remove configs |
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
> - `auto-accept update` ⬌ `antigravity-update` ⬌ `agy-update`
> - `auto-accept uninstall` ⬌ `antigravity-uninstall` ⬌ `agy-uninstall`
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

<a id="cleanup-sequence"></a>
### ⚡ Recommended Step-by-Step Cleanup Sequence

To safely audit and reclaim workstation disk space without risking active projects, settings, or credentials, execute commands in this exact sequence:

```text
Step 1: Audit (Inspect)  ──►  Step 2: Preview (Dry-Run)  ──►  Step 3: Safe Purge  ──►  Step 4: Brain Management  ──►  Step 5: Verify Delta
      agy-check                     agy-find-temp                     agy-clean                  agy-brain                   agy-check
```

| Step | Command | Action | Risk Level |
| :---: | :--- | :--- | :---: |
| **1** | `agy-check` *(or `antigravity-check`)* | Audit disk space across 3 safety tiers | 🟢 Zero (Read-only) |
| **2** | `agy-find-temp` *(or `antigravity-find-temp`)* | Preview top candidate files ranked by size | 🟢 Zero (Dry-run preview) |
| **3** | `agy-clean --all` *(or `--stale` / `--deep`)* | Purge safe caches, recordings & scratch scripts | 🟢 Safe (Tier 1 safe purge) |
| **4** | `agy-brain` *(or `antigravity-brain`)* | Inspect session footprint & delete inactive sessions | 🟡 Review (Session management) |
| **5** | `agy-check` *(or `antigravity-check`)* | Verify freed space and confirm clean state | 🟢 Zero (Read-only verification) |

---

#### 1️⃣ Step 1: Run Comprehensive Audit (`agy-check`)
Inspect total disk space categorized into the 3 safety tiers:
```bash
agy-check
# or: antigravity-check
# or: auto-accept check
```
*Categorizes findings into 🟢 Safe Tier 1, 🟡 Stale Review Tier 2, and 🔴 Protected Tier 3, reporting total reclaimable bytes.*

#### 2️⃣ Step 2: Preview Candidates in Dry-Run Mode (`agy-find-temp`)
Inspect individual candidate files ranked by disk size before deleting anything:
```bash
agy-find-temp
# or: antigravity-find-temp --limit 50
```
*Lists largest candidate files, file age, and category with zero disk modifications.*

#### 3️⃣ Step 3: Execute Safe Cleanup (`agy-clean`)
Choose your cleanup level based on your audit results:
```bash
# Standard Routine (Purges all Tier 1 safe items: scratch, recordings, logs, caches: ~1.09 GB)
agy-clean --all

# Recommended (Tier 1 safe + stale brain sessions & SQLite DBs older than 7 days)
agy-clean --stale

# Deep Clean (Tier 1 safe + stale brain + ~/.gemini/tmp repos + ~/.gemini/history snapshots: ~4.96 GB)
agy-clean --deep

# Custom Age Threshold (e.g. purge stale items older than 3 days)
agy-clean --stale --days 3

# Non-interactive / CI automation (skips confirmation prompt)
agy-clean --all --force
```

#### 4️⃣ Step 4: Manage & Reclaim Brain Session Space (`agy-brain`)
Inspect disk distribution per session, identify heavy sessions with extracted project topics, and prune specific or old sessions:
```bash
# List all conversation sessions ranked by disk size with project topics
agy-brain

# Delete a specific session by Table # Number:
agy-brain --delete 2

# Delete a specific session by UUID prefix:
agy-brain --delete 9178f300

# Delete all sessions older than N days (automatically purges companion .db/.pb files):
agy-brain --delete-older-than 7

# Clean empty / zero-file brain directories:
agy-brain --clean-empty

# Interactive numbered session picker:
agy-brain --interactive
```

#### 5️⃣ Step 5: Verify Reclaimed Space (`agy-check`)
Re-run the audit to verify space reclaimed and confirm all protected items remain intact:
```bash
agy-check
```

---

### 🔍 3-Tier Workstation Audit Reference (`antigravity-check` / `agy-check`)

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
