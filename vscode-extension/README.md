# Antigravity Auto-Submit

Hands-free approval of Antigravity IDE tool-execution and plan prompts, controlled from the status bar. The extension bundles the [Antigravity Auto-Submitter](https://github.com/WillyEverGreen/Antigravity-Auto-Submitter) daemon, so the only prerequisite is **Node.js 22+**.

- Repository and full docs: https://github.com/WillyEverGreen/Antigravity-Auto-Submitter
- npm package (CLI and daemon): https://www.npmjs.com/package/antigravity-auto-submit
- Issues: https://github.com/WillyEverGreen/Antigravity-Auto-Submitter/issues

## How it works

The daemon attaches to the IDE over the Chrome DevTools Protocol (CDP) and clicks approval buttons for you. Prompts that match your **skip** keywords are never approved, and prompts that match your **ask** keywords are left for you to confirm. Nothing leaves your machine.

## Get started in 4 steps

A walkthrough opens automatically on first install. Reopen it with **Antigravity Auto-Submit: Open Getting Started Walkthrough**.

1. **Check Node.js 22+.** Run `node -v`, or run **Check Environment**. Install from https://nodejs.org if needed.
2. **Enable the debug port.** Run **Add Debug Port to IDE Shortcuts (setup)** once. Fully close the IDE (including background processes), then reopen it from the patched Desktop or Start Menu shortcut. The IDE must run with `--remote-debugging-port=9333`.
3. **Start.** Click **AGY** in the status bar, or run **Start Auto-Submit**.
4. **Verify.** Run **Show Connection Status**. You should see the attached window count and port.

## Prefer the command line?

The same daemon is available as an npm package:

```bash
npm install -g antigravity-auto-submit
auto-accept start
```

Switch **Daemon Source** to `global` (setting `antigravityAutoSubmit.daemonSource`) to make the extension use that install. You can then update the daemon with `npm install -g antigravity-auto-submit@latest` without waiting for an extension update.

## Dashboard

The extension adds an **Antigravity** panel to the activity bar (sidebar). It has four sections:

- **Status** — daemon state (running/stopped), operating mode, CDP connection with per-window details, Node.js version, and keyword rule counts.
- **Stats** — lifetime approval count, last approval timestamp, and last approved action.
- **Actions** — one-click access to start/stop, switch mode, diagnostics, setup, environment check, output log, docs, and the getting-started walkthrough.
- **Live Log** — real-time feed of daemon events: approvals, skips, pauses, connections, disconnections, and errors, each with a timestamp.

The status and stats sections poll the daemon every 5 seconds while it is running. Use the refresh button in the view title bar to force an immediate update, or the clear button to reset the log.

## Commands

| Command | What it does |
| --- | --- |
| Start / Stop / Toggle Auto-Submit | Control the background daemon |
| Switch Mode | `autonomous` (tool prompts) or `autopilot` (also plan dialogs) |
| Show Connection Status | Attached windows, port, mode, lifetime approvals |
| Check Environment | Verifies Node version and the IDE debug port |
| Add Debug Port to IDE Shortcuts (setup) | Patches IDE shortcuts with the debug port |
| Run Diagnostics (doctor) | Full diagnostics in a terminal |
| Show Daemon Log | Opens the output channel |
| Refresh Dashboard | Force-refresh all sidebar views |
| Clear Log | Clear the live log view |
| Copy npm Install Command | Copies `npm install -g antigravity-auto-submit` |
| Open Documentation | Opens the GitHub repository |

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `antigravityAutoSubmit.mode` | `autonomous` | Operating mode |
| `antigravityAutoSubmit.autoStart` | `false` | Start when the IDE starts |
| `antigravityAutoSubmit.cdpPort` | `0` | CDP port (0 = auto-detect 9333, then 9000-9400) |
| `antigravityAutoSubmit.askKeywords` | `git push`, `git reset --hard` | Always confirm manually |
| `antigravityAutoSubmit.skipKeywords` | `rm -rf`, `drop table`, ... | Never approve |
| `antigravityAutoSubmit.nodePath` | `node` | Node.js executable |
| `antigravityAutoSubmit.daemonSource` | `bundled` | `bundled` or `global` (npm install) |
| `antigravityAutoSubmit.extraArgs` | `[]` | Extra daemon flags, for new options without an extension update |

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Status shows no window | The IDE is running without the debug port. Fully close it and reopen from the patched shortcut. |
| "Node.js is too old" | Install Node.js 22+ (the daemon needs the built-in WebSocket). |
| "Another daemon is already running" | A terminal `auto-accept` is using the same port. Quit it (`q`) or change `cdpPort`. |
| Prompts not clicked after an IDE update | Update the daemon: `npm install -g antigravity-auto-submit@latest`, set `daemonSource` to `global`, and check the changelog. |

## Compatibility

Built for Antigravity IDE 2.6.0+ (VS Code 1.107+) and Antigravity App 2.23+. It runs in any VS Code-compatible editor, but only attaches to Antigravity windows. The extension is distributed on the VS Code Marketplace and Open VSX.

## Safety

Auto-approving prompts removes a manual safety check. Keep destructive commands in `skipKeywords`, and review `askKeywords` before enabling `autopilot` or `autoStart`.

## Uninstalling

- **From the IDE**: Open Extensions (`Ctrl + Shift + X`), search `Antigravity Auto-Submit`, click the gear icon, and select **Uninstall**.
- **From CLI**: Run `code --uninstall-extension WillyEverGreen.antigravity-auto-submit`.
- **Revert Shortcuts**: If you previously ran setup to add the debug port to IDE shortcuts and wish to revert them back to default, run `auto-accept uninstall` (or manually remove `--remote-debugging-port=9333` from your shortcut properties).

## License

MIT
