# Kiro Auto-Accept

> **Autonomous confirmation daemon for Kiro IDE via Chrome DevTools Protocol (CDP)**

Kiro Auto-Accept continuously monitors your Kiro IDE sessions and autonomously approves permission dialogs, shell commands, file modifications, and agent progression prompts within **250ms**.

Built with a persistent WebSocket session engine and zero external dependencies (pure native Node.js).

---

## ⚡ Key Highlights

- ⚡ **Persistent WindowSession Architecture:** Single, long-lived WebSocket connection per target. Instant evaluation with zero reconnect latency, zero socket churn, and zero timeouts.
- 🪟 **Deep Webview & Nested Iframe Traversal:** Traverses both the top-level workbench window and out-of-process Kiro Agent webviews (`vscode-webview://...`) including nested `#active-frame` documents.
- 🔒 **Strict Port Isolation:** Exclusively operates on **Port 9222** (range: 9220–9230). Never scans, connects to, or interferes with Google Antigravity Auto-Submit (**Port 9333**).
- 🛡️ **Comprehensive Permission Coverage:** Seamlessly approves shell commands, file diffs, MCP tools, step continuations, and workspace trust dialogs.
- 🚫 **Negative Button Guard:** Guaranteed protection against cancellation buttons (`Deny`, `Always deny`, `Cancel`, `Reject`, `Discard`, `Dismiss`, `Close`).
- 🛑 **Safety Keyword Interceptors:** Destructive commands matching `askKeywords` (e.g., `git push`, `rm -rf`) or `skipKeywords` (e.g., `format c:`, `drop table`) pause auto-approval for manual review.

---

## 📋 Supported Permission Categories

| Category | Typical Kiro Prompts | Approved Buttons |
| :--- | :--- | :--- |
| **Shell & Terminal Execution** | *"Your approval is required to continue: `<cmd>`"* | `Allow`, `Always allow`, `Run`, `Execute`, `Run in terminal` |
| **File Changes & Diffs** | Modifying workspace files, saving changes, applying diffs | `Apply`, `Apply all`, `Apply changes`, `Accept`, `Accept all`, `Keep`, `Keep changes` |
| **MCP Tools & Invocations** | Running tools, scrapers, terminal commands, subagents | `Allow`, `Always allow`, `Confirm`, `Proceed` |
| **Agent Plan Progression** | Moving to next step in a multi-stage task | `Continue`, `Continue anyway`, `Proceed` |
| **Workbench & Trust Dialogs** | Folder trust, environment variables, notification prompts | `Yes`, `OK`, `Trust`, `Grant`, `Confirm` |

---

## 📦 Installation

From the `kiro-auto-accept` directory:

```powershell
npm install -g .
```

Verify your installation:

```powershell
kiro-auto-accept --version
# Outputs: kiro-auto-accept v1.1.0
```

---

## 🚀 Quick Start

### 1. One-Click Shortcut Setup

Automatically configure your Desktop and Start Menu shortcuts with the `--remote-debugging-port=9222` flag:

```powershell
kiro-setup
# OR: kiro-auto-accept setup
```

Output:
```text
🔧 Kiro Auto-Accept - Automatic Shortcut & Environment Setup
  ✔ Successfully configured 4 Kiro IDE shortcuts with Port 9222!
    • Desktop: "Kiro IDE (Debug).lnk"
    • Start Menu: "Kiro IDE (Debug).lnk" & "Kiro.lnk"
```

### 2. Launch Kiro IDE

Open Kiro IDE using the new **"Kiro IDE (Debug)"** shortcut, or launch it directly from the terminal:

```powershell
kiro-launch
# OR: kiro-auto-accept launch
```

### 3. Verify System Health

Run the diagnostic doctor to confirm connectivity:

```powershell
kiro-doctor
# OR: kiro-auto-accept doctor
```

Output:
```text
⚡ Kiro Auto-Accept — System Doctor
  Node.js Version:     v24.19.0 ✔ (Supported: >=18.0.0)
  Operating System:   win32 (Windows_NT 10.0.26200)
  WebSocket Library: ✔ ws ready
  Kiro IDE Binary:   C:\Users\...\Kiro.exe ✔
  CDP Port Status:    Connected on port(s): 9222 ✔
  Target [1]:        "README.md - Kiro" (Port 9222, page) ✔
  Target [2]:        "Kiro Chat Webview" (Port 9222, iframe) ✔
  Confirmation Engine: Ready for multi-target auto-approvals! (2 target(s)) ✔
```

### 4. Start the Daemon

```powershell
kiro-auto-accept
```

You are ready! The daemon monitors all Kiro IDE windows and automatically approves requests within 250ms.

---

## ⚙️ Operating Modes & CLI Flags

| Mode / Flag | Command | Behavior |
| :--- | :--- | :--- |
| **Autonomous (Default)** | `kiro-auto-accept` | Approves individual tool and shell permissions on demand while preserving plan reviews. |
| **Autopilot** | `kiro-auto-accept --mode=autopilot` | 100% hands-free. Also approves intermediate step continuations (`Proceed`, `Continue`). |
| **Always-Allow** | `kiro-auto-accept --always-allow` | Prioritizes `Always allow` / `Always approve` buttons so Kiro permanently remembers approvals. |
| **Specific Port** | `kiro-auto-accept --port=9222` | Locks CDP scanning to a specific port. |
| **Quiet Mode** | `kiro-auto-accept --quiet` | Suppresses verbose logs, printing only approvals and warnings. |
| **Force Restart** | `kiro-auto-accept restart --force` | Closes lingering Kiro instances and restarts cleanly with Port 9222. |

---

## 🛠️ CLI Subcommands & Binary Aliases

| Subcommand | Alias Binary | Description |
| :--- | :--- | :--- |
| `kiro-auto-accept` | `kiro-accept` | Start auto-accept daemon (default) |
| `kiro-auto-accept start` | `kiro-start` | Launch Kiro IDE if not running, then start daemon |
| `kiro-auto-accept doctor` | `kiro-doctor` | Comprehensive system diagnostics and target scanner |
| `kiro-auto-accept setup` | `kiro-setup` | Configure Desktop & Start Menu shortcuts |
| `kiro-auto-accept launch` | `kiro-launch` | Launch Kiro IDE with remote debugging on Port 9222 |
| `kiro-auto-accept restart` | `kiro-restart` | Gracefully restart Kiro IDE with Port 9222 |
| `kiro-auto-accept list` | — | Display active rules, mode, and safety keywords |
| `kiro-auto-accept init` | — | Create `.kiro-auto-accept.json` in current directory |

---

## 📄 Configuration

Configuration is loaded hierarchically:
1. **Built-in Defaults**
2. **Global Configuration:** `~/.kiro-auto-accept/config.json`
3. **Project Configuration:** `.kiro-auto-accept.json` (in workspace root)
4. **CLI Flags** (highest precedence)

### Example `.kiro-auto-accept.json`

```json
{
  "enabled": true,
  "mode": "autonomous",
  "cdpPort": 9222,
  "safetyDelayMs": 200,
  "pollIntervalMs": 250,
  "autoSelectAlwaysAllow": false,
  "askKeywords": [
    "git push",
    "git reset --hard",
    "rm -rf",
    "execute_pwsh"
  ],
  "skipKeywords": [
    "drop table",
    "git push --force",
    "format c:",
    "del /f /s /q c:",
    "Remove-Item -Recurse -Force C:\\"
  ]
}
```

---

## 🔄 Two-IDE Architecture & Isolation

If you run both **Google Antigravity IDE** and **Kiro IDE** on the same machine, both daemons operate concurrently with zero interference:

```text
┌─────────────────────────────────┐       ┌─────────────────────────────────┐
│       Google Antigravity        │       │            Kiro IDE             │
│   Port: 9333 (9330-9340 range)  │       │   Port: 9222 (9220-9230 range)  │
│    CLI: auto-accept / agy-*     │       │    CLI: kiro-auto-accept / kiro-*│
└─────────────────────────────────┘       └─────────────────────────────────┘
```

- Antigravity Auto-Submit explicitly ignores ports `9220–9235`.
- Kiro Auto-Accept explicitly ignores ports `9300–9400`.

---

## 📜 License

MIT License. Developed by WillyEverGreen / advdi.
