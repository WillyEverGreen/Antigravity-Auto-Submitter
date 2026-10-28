# Antigravity Auto-Submit

Hands-free approval of Antigravity IDE tool-execution and plan prompts, controlled from the status bar. The extension bundles the [Antigravity Auto-Submitter](https://github.com/WillyEverGreen/Antigravity-Auto-Submitter) daemon, so there is nothing else to install except Node.js 18+.

## How it works

The daemon attaches to the IDE over the Chrome DevTools Protocol and clicks approval buttons for you. Prompts that match your **skip** keywords are never approved, and prompts that match your **ask** keywords are left for you to confirm.

## Getting started

1. Run **Antigravity Auto-Submit: Add Debug Port to IDE Shortcuts (setup)** once, then restart the IDE from the patched shortcut. The IDE must run with `--remote-debugging-port=9333`.
2. Click the **AGY** status bar item (or run **Start Auto-Submit**).
3. Run **Show Connection Status** to confirm a window is attached.

## Commands

| Command | What it does |
| --- | --- |
| Start / Stop / Toggle Auto-Submit | Control the background daemon |
| Switch Mode | `autonomous` (tool prompts) or `autopilot` (also plan dialogs) |
| Show Connection Status | Reports attached windows, port and lifetime approvals |
| Add Debug Port to IDE Shortcuts (setup) | Patches IDE shortcuts with the debug port |
| Run Diagnostics (doctor) | Checks Node, Python, IDE binary and CDP availability |
| Show Daemon Log | Opens the output channel |

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `antigravityAutoSubmit.mode` | `autonomous` | Operating mode |
| `antigravityAutoSubmit.autoStart` | `false` | Start when the IDE starts |
| `antigravityAutoSubmit.cdpPort` | `0` | CDP port (0 = auto-detect) |
| `antigravityAutoSubmit.askKeywords` | `git push`, `git reset --hard` | Always confirm manually |
| `antigravityAutoSubmit.skipKeywords` | `rm -rf`, `drop table`, ... | Never approve |
| `antigravityAutoSubmit.nodePath` | `node` | Node.js executable |

## Safety

Auto-approving prompts removes a manual safety check. Keep destructive commands in `skipKeywords`, and review `askKeywords` before enabling `autopilot` or `autoStart`.

## License

MIT
