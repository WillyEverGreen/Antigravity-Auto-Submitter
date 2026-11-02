# Antigravity Auto-Submit

<div align="center">
  <img src="https://raw.githubusercontent.com/WillyEverGreen/Antigravity-Auto-Submitter/main/vscode-extension/media/icon.png" width="120" height="120" alt="Antigravity Auto-Submit Logo" />
  <h3>Hands-Free Autonomous Approval Engine for Google Antigravity IDE</h3>
  <p>Never wait for permission prompts again. Auto-approves tool executions, child subagents, and implementation plans with intelligent safety guardrails.</p>
  <p>
    <a href="https://github.com/WillyEverGreen/Antigravity-Auto-Submitter"><img src="https://img.shields.io/github/stars/WillyEverGreen/Antigravity-Auto-Submitter?style=for-the-badge&logo=github&color=gold" alt="GitHub Stars" /></a>
  </p>
  <p><b>⭐ Love this extension? Please <a href="https://github.com/WillyEverGreen/Antigravity-Auto-Submitter">star our repo on GitHub</a>!</b></p>
</div>

---

## ⚡ Why Use This Even If You Have "Turbo Mode"?

Antigravity IDE includes a built-in **Turbo Mode**, but developers quickly realize it has critical limitations during real-world AI coding sessions:

| Capability | Built-in Turbo Mode | Antigravity Auto-Submit |
| :--- | :---: | :---: |
| **Primary Chat Tool Calls** | ✅ Auto-runs | ✅ Auto-approves |
| **Child Subagents & Background Workers** | ❌ **Still pauses & blocks** | ✅ **100% Hands-Free** (Auto-selects Option 1 & clicks Submit) |
| **Implementation Plans (`Proceed` Cards)** | ❌ **Pauses workflow** | ✅ **Auto-approved in Autopilot Mode** |
| **Safety Guardrails (`rm -rf`, `drop table`)** | ❌ **Blind execution (Zero defense)** | ✅ **Regex & keyword guardrails (Skip & Ask rules)** |
| **Multi-Window & Multi-Workspace Coordination** | ❌ **Single window only** | ✅ **Synchronized concurrent daemon across all windows** |
| **Cross-Tool Companion Support** | ❌ None | ✅ **Includes Kiro IDE & Claude Code CLI companions** |
| **Session Analytics & Audit Trail** | ❌ None | ✅ **Lifetime approvals, session count & live activity feed** |

> **The Subagent Problem:** Even with Turbo Mode turned ON, child subagents (e.g., `Subagent: Task 1 Implementer`, parallel tasks, and secondary workspace panes) are treated with higher isolation by Antigravity and **still require manual confirmation** (`Allow run ...? [Submit ↵]`). Antigravity Auto-Submit detects these prompts, selects **Option 1 ("Yes, allow this time")**, dispatches the confirmation keystroke, and clicks **Submit** automatically.

---

## 🚀 Key Features

- **Autonomous Tool Confirmation:** Automatically clicks `Allow`, `Allow this time`, `Run`, `Accept`, and `Submit` on tool execution cards.
- **Subagent Auto-Approval:** Automatically handles nested subagent prompts with automatic radio selection and submission.
- **Autopilot Mode (Plan Approval):** In `autopilot` mode, the engine also auto-approves implementation plans, architecture specs, and `Proceed` prompts.
- **Intelligent Safety Guardrails:**
  - **Skip Rules:** Hard-blocks destructive commands (`rm -rf`, `drop table`, `format c:`, `git push --force`) so they are never executed.
  - **Ask Rules:** Pauses and alerts you on sensitive operations (`git push`, `git reset --hard`).
- **Concurrent Multi-Window Monitoring:** Seamlessly tracks and approves prompts across all open Antigravity IDE workspaces (e.g. `2 wins (7 targets on port 9333)`).
- **Native Sidebar Dashboard:** Beautiful, live Webview dashboard in the Antigravity activity bar with real-time metrics, rule badges, and live activity feed.
- **Status Bar Toggle:** Quick-access status bar item (`AGY: autonomous` / `AGY: autopilot` / `AGY: off`) for instant toggling.
- **Zero Cloud Leakage:** Communicates 100% locally over Chrome DevTools Protocol (CDP) on `127.0.0.1`. No external network requests, telemetry, or API keys required.

---

## 📊 Understanding the Dashboard Metrics

When you open the **Antigravity: Dashboard** in the sidebar, you will see real-time statistics:

- **Connection Status:** Shows active IDE windows and monitored CDP surfaces (e.g., `2 wins (7 targets on port 9333)`).
  - *What are targets?* Electron runs several internal surfaces per window (the editor shell, the extension host, and the AI chat iframe). The daemon monitors all of them to catch prompts wherever they render.
- **`APPROVALS` (Lifetime Approvals):** Total number of prompts auto-approved across all time and all projects.
- **`SESSION` (Sprint Approvals):** Number of prompts auto-approved during the current running session (resets to 0 when daemon restarts).
- **`BLOCKED` (Guardrail Interceptions):** Number of dangerous commands intercepted and blocked by your Skip/Ask rules.
- **Rule Badges:** Visual tags showing active Skip and Ask rules with one-click removal (`x`) and addition (`+ Add`).
- **Live Activity Feed:** Real-time chronological log of connection, approval, and rule events with color-coded badges.

---

## ⚡ Quick 3-Step Setup

### Step 1: Install Node.js 22+
The background engine uses Node's native WebSocket support. Check your version with:
```bash
node -v
```
*(If version is older than 22, download the latest LTS from [nodejs.org](https://nodejs.org)).*

### Step 2: Add Remote Debugging Port to Your IDE Shortcut
For Chromium DevTools Protocol (CDP) access, Antigravity IDE must be launched with `--remote-debugging-port=9333`.

You can do this automatically or manually:
- **Automatic:** Open Command Palette (`Ctrl + Shift + P`) and run:
  ```text
  Antigravity Auto-Submit: Add Debug Port to IDE Shortcuts (setup)
  ```
- **Manual (Windows Shortcut):**
  1. Right-click your **Antigravity IDE** desktop or taskbar shortcut $\to$ **Properties**.
  2. In the **Target** field, append a space followed by `--remote-debugging-port=9333` at the end:
     ```text
     "C:\Users\<user>\AppData\Local\Programs\Antigravity IDE\Antigravity.exe" --remote-debugging-port=9333
     ```
  3. Click **Apply** and **OK**.
  4. Fully close Antigravity IDE and relaunch from this shortcut.

### Step 3: Start Auto-Submit
Click **AGY** in the status bar, or open the **Antigravity Dashboard** in the activity bar and click the green **Start** button!

---

## 🎮 Operating Modes

You can switch modes anytime via the status bar, sidebar dashboard, or Command Palette:

1. **Autonomous Mode (Default - Recommended):**
   - Auto-approves safe tool execution and subagent commands.
   - Pauses on implementation plans (`Proceed with plan`) so you can review architecture before execution begins.
   - Blocks dangerous commands matching Skip Rules.

2. **Autopilot Mode (100% Hands-Free):**
   - Auto-approves both tool execution AND implementation plans.
   - Ideal for overnight runs, large refactors, test runs, and `/goal` tasks.
   - Still rigorously enforces Skip Rules (`rm -rf`, `drop table`, etc.).

---

## 🛠️ Extension Commands

| Command | Category | Description |
| :--- | :--- | :--- |
| `antigravityAutoSubmit.start` | Antigravity Auto-Submit | Start the background confirmation daemon |
| `antigravityAutoSubmit.stop` | Antigravity Auto-Submit | Stop the background daemon |
| `antigravityAutoSubmit.toggle` | Antigravity Auto-Submit | Toggle daemon between active and stopped |
| `antigravityAutoSubmit.setMode` | Antigravity Auto-Submit | Switch between `autonomous` and `autopilot` |
| `antigravityAutoSubmit.showStatus` | Antigravity Auto-Submit | Display connection status and approval metrics |
| `antigravityAutoSubmit.setup` | Antigravity Auto-Submit | Automatically add debug port to IDE shortcuts |
| `antigravityAutoSubmit.doctor` | Antigravity Auto-Submit | Run system diagnostics and verify environment |
| `antigravityAutoSubmit.refreshDashboard` | Antigravity Auto-Submit | Refresh active targets and approval counters |
| `antigravityAutoSubmit.clearLog` | Antigravity Auto-Submit | Clear the activity feed |
| `antigravityAutoSubmit.addRule` | Antigravity Auto-Submit | Add a new Skip or Ask keyword rule |
| `antigravityAutoSubmit.removeRule` | Antigravity Auto-Submit | Remove an existing keyword rule |

---

## ⚙️ Configuration Settings

Configure via **Settings** (`Ctrl + ,` $\to$ search `Antigravity Auto-Submit`):

| Setting | Default | Description |
| :--- | :---: | :--- |
| `antigravityAutoSubmit.mode` | `"autonomous"` | Operating mode: `"autonomous"` or `"autopilot"`. |
| `antigravityAutoSubmit.autoStart` | `false` | Automatically start the daemon when Antigravity IDE opens. |
| `antigravityAutoSubmit.cdpPort` | `0` | Remote debugging port (`0` = auto-discover 9333, 9334, 9300-9400). |
| `antigravityAutoSubmit.askKeywords` | `["git push", "git reset --hard"]` | Commands that always require manual user approval. |
| `antigravityAutoSubmit.skipKeywords` | `["rm -rf", "drop table", "git push --force", ...]` | Destructive commands that are never auto-approved. |
| `antigravityAutoSubmit.daemonSource` | `"bundled"` | `"bundled"` (uses extension daemon) or `"global"` (uses global npm package). |
| `antigravityAutoSubmit.nodePath` | `"node"` | Path to custom Node.js binary if not in system PATH. |

---

## 💻 Prefer the Command Line?

The exact same battle-tested daemon is published as a global CLI:

```bash
# Install globally
npm install -g antigravity-auto-submit

# Start interactive daemon
auto-accept

# Run non-interactively in background
auto-accept start

# Check live status across all windows
auto-accept status

# Take over interactive session with hotkeys
auto-accept --force
```

---

## ❓ Troubleshooting

- **Status shows "No window connected":**
  Antigravity IDE is running without the remote debugging port. Fully close all IDE processes and relaunch from your shortcut configured with `--remote-debugging-port=9333`.
- **"Node.js is too old" notification:**
  Ensure Node.js 22 or newer is installed and in your PATH. Run `node -v` in terminal to verify.
- **Multiple windows show different targets:**
  The daemon automatically maps each window to its workspace (e.g. `Code Editor (Clip)` and `AI Chat Panel (Clip)`). Run **Doctor Check** from the dashboard to verify all endpoints.

---

## 📄 License & Links

- **Repository:** [GitHub](https://github.com/WillyEverGreen/Antigravity-Auto-Submitter)
- **npm Package:** [antigravity-auto-submit](https://www.npmjs.com/package/antigravity-auto-submit)
- **Issue Tracker:** [GitHub Issues](https://github.com/WillyEverGreen/Antigravity-Auto-Submitter/issues)
- **License:** MIT
