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
    <a href="#-quick-setup-3-easy-steps">Quick Setup</a> •
    <a href="#-quick-start">Quick Start</a> •
    <a href="#-instant-hotkeys">Instant Hotkeys</a> •
    <a href="#-plugin-to-any-project-folder">Plugin to Any Project</a> •
    <a href="#-operating-modes">Modes</a> •
    <a href="#-safety-keyword-guardrails">Keyword Guardrails</a> •
    <a href="#-cli-commands--flags">Commands & Flags</a>
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

## ⚡ Quick Setup (3 Easy Steps)

### 📦 Step 1: Install CLI

Install globally or run zero-install via `npx`:

```bash
# Option A: Global Install (Recommended)
npm install -g antigravity-auto-submit

# Option B: Zero-Install (npx)
npx antigravity-auto-submit

# Option C: From Source Repository
git clone https://github.com/WillyEverGreen/Antigravity-Auto-Submitter.git
cd Antigravity-Auto-Submitter
npm install
npm link
```

---

### 🔌 Step 2: Connect Antigravity IDE

Antigravity IDE needs to launch with remote debugging enabled on port `9333`:

#### ⚡ Option A: Automated Desktop Shortcut Setup (Windows - Recommended)
Run once in your terminal:
```bash
auto-accept setup
```
*This automatically creates or patches your Antigravity IDE Desktop Shortcut to append `--remote-debugging-port=9333`.*

#### 🚀 Option B: 1-Click Launch (Cross-Platform)
Launch Antigravity IDE with the remote debugging port enabled in one command:
```bash
auto-accept launch
```

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
*Checks your Node.js version, CDP port availability, and target Antigravity IDE workbench.*

#### 2. Start Approval Daemon
```bash
# Start default Autonomous daemon (auto-approves safe tools, pauses for plan review)
auto-accept
```

---

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

## ⚡ Instant Hotkeys (Vite-Style)

No need to press Enter! Simply press any of these keys while the daemon is running in your terminal:

| Key | Action | Description |
| :---: | :--- | :--- |
| **`p`** | **Pause / Resume** | Instantly toggles auto-approvals on or off. |
| **`m`** | **Toggle Mode** | Cycles between **Autonomous** (reviews plans) and **Autopilot** (100% hands-free). |
| **`a`** | **Add Rule** | Interactively add a keyword rule to Ask or Skip list without restarting. |
| **`r`** | **Remove Rule** | Interactively remove a keyword rule from Ask or Skip list. |
| **`s`** | **Live Stats** | Displays live session approvals, lifetime approvals, blocks, and target window. |
| **`c`** | **Show Config** | Prints active configuration source, ports, and guardrail lists. |
| **`h`** / **`?`** | **Help Banner** | Redisplays the dashboard banner and hotkeys. |
| **`q`** | **Quit** | Cleanly disconnects from Antigravity and exits (`Ctrl + C` also works). |

---

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

## 🎯 Operating Modes

### 1. Autonomous (Recommended Default)
- **Tool Confirmations**: Automatically confirmed via Option 1 (*"Allow this time"*), preserving per-command keyword gating.
- **Implementation Plans**: **Pauses for your review**. Perfect for general coding where you want to inspect implementation plans before execution.

```bash
auto-accept --mode autonomous
```

### 2. Autopilot (100% Hands-Free)
- **Tool Confirmations**: Automatically confirmed.
- **Implementation Plans**: **Automatically approved** (*Proceed* / *Proceed with implementation plan*).
- Ideal for unattended overnight runs, automated migration scripts, or `/goal` sessions.

```bash
auto-accept --mode autopilot
```

---

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

## 📋 CLI Commands & Flags

### Subcommands
| Command | Action |
| :--- | :--- |
| `auto-accept` | Start auto-submit confirmation daemon (default) |
| `auto-accept launch` | 🚀 Auto-launch Antigravity IDE with remote debugging port enabled |
| `auto-accept setup` | ⚡ 1-Click auto-patch Desktop shortcut with `--remote-debugging-port=9333` |
| `auto-accept init` | Create `.auto-accept.json` in the current folder |
| `auto-accept doctor` | System diagnostic & connection verification |
| `auto-accept list` | Display active Ask and Skip guardrail rules |
| `auto-accept status` | Query connection and approval statistics as JSON |
| `auto-accept add-ask <kw>` | Add keyword(s) requiring manual permission |
| `auto-accept add-skip <kw>` | Add keyword(s) to directly skip |
| `auto-accept rm <kw>` | Remove keyword(s) from any active list |
| `auto-accept rm-ask <kw>` | Remove keyword(s) from Ask list |
| `auto-accept rm-skip <kw>` | Remove keyword(s) from Skip list |
| `antigravity-check` / `agy-check` | 🔍 Run 3-tier deletion audit scan (Safe / Review / Do Not Delete) |
| `antigravity-clean` / `agy-clean` | 🧹 Purge safe temporary scratch scripts, browser recordings, and caches |
| `antigravity-brain` / `agy-brain` | 🧠 Inspect session brain disk distribution and delete specific sessions |

### Flags
```
OPTIONS:
  -m, --mode <mode>       Operating mode: autonomous or autopilot
  -p, --port <port>       CDP port (default: auto-detect 9333 / 9000-9400)
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

## 🧹 Workstation Audit & Temp Cleanup Utility (`antigravity-check` & `antigravity-clean`)

Antigravity Auto-Submitter suite includes global CLI utilities to audit and clean temporary agent scripts, browser video recordings, session logs, and package manager caches without touching critical configuration, active workspace code, or custom skills.

### 🔍 3-Tier Workstation Audit (`antigravity-check` / `agy-check`)
Run at any time in any terminal to inspect system temporary space categorized into **3 safety tiers**:

```bash
antigravity-check
# or short alias: agy-check
```

- **🟢 Tier 1: SAFE TO DELETE** (Scratch scripts, browser WebP recordings, session transcript logs, cached AST annotations, `%TEMP%` dumps, NPM/UV/Pip package caches)
- **🟡 Tier 2: CHECK BEFORE DELETING** (Past conversation session history & plan artifacts, Playwright browser binaries)
- **🔴 Tier 3: DO NOT DELETE** (System agent rules, custom skills, MCP configuration, user settings, installation ID)

### 🧹 Purging Temporary & Stale Files (`antigravity-clean` / `agy-clean`)
```bash
# Purge ALL Tier 1 safe temporary items (~3.94 GB freed)
antigravity-clean --all

# Purge Tier 1 safe items + Stale session brain history (> 7 days old)
antigravity-clean --stale

# Perform a COMPLETE DEEP CLEAN (Tier 1 safe + stale brain + stale project dependencies)
antigravity-clean --deep

# Custom age threshold (e.g. purge stale items > 3 days old)
antigravity-clean --stale --days 3

# Purge only temporary scratch scripts & agent dumps
antigravity-clean --scratch

# Purge browser WebP video recordings
antigravity-clean --recordings

# Purge NPM, Pip, and UV package caches
antigravity-clean --caches

### 🧠 Brain Session Manager (`antigravity-brain` / `agy-brain`)
Inspect disk space distribution across all active conversation sessions, view extracted project topics, and perform targeted session cleanup:

```bash
# Display brain sessions ranked by disk size with project topics
antigravity-brain
# or short alias: agy-brain

# Delete a specific session by Table # Number (e.g. session #2 in the list)
antigravity-brain --delete 2

# Delete a specific session by ID or prefix (supports pasting "9178f300-5..")
antigravity-brain --delete 9178f300

# Delete all sessions older than N days
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
> Run `npm install -g antigravity-auto-submit` and launch your IDE with `auto-accept setup` or `auto-accept launch`. The background daemon automatically approves terminal execution and file modification prompts in real time.

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

MIT License. Copyright (c) 2026 WillyEverGreen / advdi.
