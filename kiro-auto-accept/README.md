# Kiro Auto-Accept

> **Production-grade autonomous confirmation daemon for Kiro IDE**

Automatically accept/approve confirmations in Kiro IDE for fully autonomous AI-powered development workflows. Built with zero external dependencies using pure Node.js.

## 🚀 Features

- **🤖 Autonomous Mode**: AI reviews plans before execution
- **✈️ Autopilot Mode**: 100% hands-free operation
- **🛡️ Safety Guardrails**: Configurable ask/skip keyword lists
- **🪟 Multi-Window Support**: Monitors multiple Kiro IDE instances
- **⚡ Zero Dependencies**: Pure Node.js implementation
- **🎯 Smart Port Detection**: Auto-discovers Chrome DevTools Protocol ports
- **📊 Statistics Tracking**: Monitor accepted, skipped, and asked confirmations

## 📦 Installation

### Quick Install (NPM)

```bash
npm install -g kiro-auto-accept
```

### Manual Install

1. Clone or download this repository
2. Navigate to the directory
3. Run: `npm install -g .`

### Verify Installation

```bash
kiro-auto-accept --version
```

## 🎯 Quick Start

### One-Command Easy Start

The easiest way to get started - launches Kiro IDE and starts the daemon automatically:

```bash
kiro-auto-accept start
```

This command will:
1. Check if Kiro IDE is running with remote debugging
2. If not, automatically launch it with the debug port
3. Start the auto-accept daemon
4. Monitor all Kiro IDE windows

### Alternative: Manual Setup

If you prefer manual control:

1. **Launch Kiro IDE with debugging port:**
   ```bash
   kiro --remote-debugging-port=9222
   ```
   Or use VS Code:
   ```bash
   code --remote-debugging-port=9222
   ```

2. **Start the daemon:**
   ```bash
   kiro-auto-accept
   ```

## 📋 Commands

| Command | Description |
|---------|-------------|
| `kiro-auto-accept` | Start daemon (default) |
| `kiro-auto-accept start` | Launch IDE + start daemon (all-in-one) |
| `kiro-auto-accept init` | Create `.kiro-auto-accept.json` in current directory |
| `kiro-auto-accept list` | Show active rules and configuration |
| `kiro-auto-accept doctor` | Run system diagnostics |
| `kiro-auto-accept setup` | Configure shortcuts with debug port |
| `kiro-auto-accept launch` | Launch Kiro IDE with debug port |
| `kiro-auto-accept restart` | Restart Kiro IDE with debug port |

## ⚙️ Configuration

### Global Configuration

Located at: `~/.kiro-auto-accept/config.json`

This applies to all projects unless overridden.

### Local Configuration

Create a project-specific config:

```bash
kiro-auto-accept init
```

This creates `.kiro-auto-accept.json` in your current directory.

### Configuration Options

```json
{
  "enabled": true,
  "mode": "autonomous",
  "cdpPort": 0,
  "cdpPorts": [],
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

#### Configuration Fields

- **`enabled`**: Enable/disable the daemon
- **`mode`**: Operating mode
  - `"autonomous"`: AI reviews plans before execution (recommended)
  - `"autopilot"`: 100% hands-free operation
- **`cdpPort`**: Chrome DevTools Protocol port (0 = auto-detect)
- **`cdpPorts`**: Array of explicit ports to check
- **`safetyDelayMs`**: Delay before auto-clicking (prevents accidental double-clicks)
- **`pollIntervalMs`**: How often to check for confirmation dialogs
- **`autoSelectAlwaysAllow`**: Auto-select "Always Allow" option
- **`askKeywords`**: Commands that require manual confirmation
- **`skipKeywords`**: Commands that will never be auto-approved

## 🛡️ Safety Features

### Ask Keywords

Commands containing these keywords will **pause and ask for manual confirmation**:

```json
"askKeywords": [
  "git push",
  "git reset --hard",
  "rm -rf",
  "execute_pwsh"
]
```

### Skip Keywords

Commands containing these keywords will **never be auto-approved**:

```json
"skipKeywords": [
  "drop table",
  "git push --force",
  "format c:",
  "del /f /s /q c:",
  "Remove-Item -Recurse -Force C:\\"
]
```

## 🔧 CLI Options

```bash
kiro-auto-accept [command] [options]
```

### Options

| Option | Description |
|--------|-------------|
| `--mode=autopilot` | 100% hands-free mode |
| `--mode=autonomous` | Review plans before execution |
| `--port=9222` | Specific CDP port |
| `--quiet, -q` | Minimal output |
| `--force, -f` | Force restart/override locks |
| `--help, -h` | Show help |
| `--version, -v` | Show version |

### Examples

```bash
# Start in autopilot mode
kiro-auto-accept start --mode=autopilot

# Use specific port
kiro-auto-accept --port=9223

# Force restart
kiro-auto-accept restart --force

# Quiet mode
kiro-auto-accept start --quiet
```

## 🩺 Troubleshooting

### Run Diagnostics

```bash
kiro-auto-accept doctor
```

This will check:
- ✅ Node.js version (requires >=18.0.0)
- ✅ Operating system
- ✅ Kiro IDE executable location
- ✅ Chrome DevTools Protocol connection
- ✅ Active windows and ports

### Common Issues

#### "No active Kiro IDE instances found"

**Solution:**
```bash
kiro-auto-accept restart
```

Or manually launch with debug port:
```bash
kiro --remote-debugging-port=9222
```

#### "Kiro IDE running WITHOUT remote debugging"

**Cause:** Kiro was launched without the debug port.

**Solution:**
```bash
kiro-auto-accept restart
```

#### Multiple daemons running

**Solution:** Use `--force` to override:
```bash
kiro-auto-accept start --force
```

## 🖥️ Platform Support

| Platform | Status | Notes |
|----------|--------|-------|
| Windows | ✅ Full Support | PowerShell required |
| macOS | ✅ Full Support | - |
| Linux | ✅ Full Support | - |

## 🔐 Security

- **Local Only**: All communication happens via localhost
- **No Network Access**: No external connections
- **Configurable Safety**: Customize keyword guardrails
- **Open Source**: Fully auditable code

## 📊 Statistics

View your daemon statistics:

```bash
cat ~/.kiro-auto-accept/stats.json
```

Tracks:
- Total acceptances
- Total skips
- Total asks
- Session start time

## 🛠️ Advanced Usage

### Environment Variables

```bash
# Custom Kiro executable path
export KIRO_PATH="/custom/path/to/kiro"

# Or VS Code path
export KIRO_PATH="/path/to/code"
```

### Multiple Instances

Run daemons on different ports:

```bash
# Terminal 1
kiro-auto-accept --port=9222

# Terminal 2
kiro-auto-accept --port=9223
```

### Project-Specific Rules

Each project can have its own safety rules:

```bash
cd my-project
kiro-auto-accept init
# Edit .kiro-auto-accept.json
kiro-auto-accept
```

## 🤝 Contributing

Contributions are welcome! Feel free to:
- Report bugs
- Suggest features
- Submit pull requests

## 📄 License

MIT License - see LICENSE file for details

## 🙏 Credits

- Inspired by [Antigravity Auto-Submit](https://github.com/WillyEverGreen/Antigravity-Auto-Submitter)
- Built for the [Kiro IDE](https://kiro.dev) community
- Created by WillyEverGreen / advdi

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/WillyEverGreen/Kiro-Auto-Accept/issues)
- **Discussions**: [GitHub Discussions](https://github.com/WillyEverGreen/Kiro-Auto-Accept/discussions)

## 🗺️ Roadmap

- [ ] GUI dashboard
- [ ] Statistics visualization
- [ ] Advanced filtering rules
- [ ] VS Code extension integration
- [ ] Webhook notifications
- [ ] Cloud sync for configurations

---

**⚡ Made with ❤️ for autonomous AI development workflows**
