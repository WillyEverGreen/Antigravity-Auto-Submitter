# Changelog - Kiro Auto-Accept

All notable changes to the Kiro Auto-Accept project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2024-10-01

### 🎉 Initial Release

#### Added
- **Core Daemon Functionality**
  - Autonomous confirmation acceptance for Kiro IDE
  - Chrome DevTools Protocol (CDP) integration
  - Multi-window support for multiple Kiro instances
  - Automatic port detection (9222 default)

- **Operating Modes**
  - `autonomous`: AI reviews plans before execution
  - `autopilot`: 100% hands-free operation
  - Configurable mode switching via CLI or config

- **Safety Features**
  - Ask keywords list (prompts for manual confirmation)
  - Skip keywords list (never auto-approves)
  - Configurable safety delay (200ms default)
  - Per-command keyword gating

- **CLI Commands**
  - `kiro-auto-accept`: Start daemon
  - `kiro-auto-accept start`: All-in-one launcher + daemon
  - `kiro-auto-accept init`: Project config initialization
  - `kiro-auto-accept list`: Show active rules
  - `kiro-auto-accept doctor`: System diagnostics
  - `kiro-auto-accept setup`: Shortcut configuration
  - `kiro-auto-accept launch`: Launch Kiro IDE with debug port
  - `kiro-auto-accept restart`: Restart Kiro IDE with debug port

- **Configuration System**
  - Global configuration (`~/.kiro-auto-accept/config.json`)
  - Local project configuration (`.kiro-auto-accept.json`)
  - CLI argument overrides
  - Hierarchical config loading (defaults → global → local → CLI)

- **Diagnostics**
  - `doctor` command for system health checks
  - Node.js version validation (requires >=18.0.0)
  - IDE executable detection
  - CDP port connectivity tests
  - Active window enumeration

- **Platform Support**
  - Windows (PowerShell)
  - macOS
  - Linux

- **Developer Experience**
  - Zero external dependencies
  - Pure Node.js implementation
  - Beautiful CLI output with colors and badges
  - Comprehensive help documentation
  - Example configuration files

- **Process Management**
  - PID-based daemon locking
  - Multi-instance support with different ports
  - Graceful shutdown handling
  - Stale lock cleanup

- **Statistics Tracking**
  - Acceptance counter
  - Skip counter
  - Ask counter
  - Session start time
  - Persistent stats file

#### Configuration Options
- `enabled`: Enable/disable daemon
- `mode`: Operating mode (autonomous/autopilot)
- `cdpPort`: Chrome DevTools Protocol port
- `cdpPorts`: Explicit port candidates array
- `safetyDelayMs`: Click delay for safety
- `pollIntervalMs`: Confirmation check interval
- `autoSelectAlwaysAllow`: Auto-select persistent permissions
- `askKeywords`: Commands requiring manual approval
- `skipKeywords`: Commands never auto-approved

#### Default Safety Guardrails
**Ask Keywords:**
- `git push`
- `git reset --hard`
- `rm -rf`
- `execute_pwsh`

**Skip Keywords:**
- `drop table`
- `git push --force`
- `format c:`
- `del /f /s /q c:`
- `Remove-Item -Recurse -Force C:\\`

#### Known Limitations
- GUI dashboard not yet implemented
- Requires manual Kiro IDE launch with debug port (or use `start` command)
- Statistics visualization pending
- No webhook notifications yet
- No cloud sync for configurations

#### Documentation
- Comprehensive README with examples
- CLI help system
- Troubleshooting guide
- Configuration reference
- Platform-specific instructions

---

## Planned for Future Releases

### [1.1.0] - Planned
- [ ] GUI dashboard for monitoring
- [ ] Real-time statistics visualization
- [ ] Enhanced filtering rules with regex support
- [ ] Notification system (desktop notifications)
- [ ] Better error recovery mechanisms

### [1.2.0] - Planned
- [ ] VS Code extension integration
- [ ] Advanced keyword pattern matching
- [ ] Custom action hooks
- [ ] Configuration profiles (dev/staging/prod)
- [ ] Dry-run mode

### [2.0.0] - Planned
- [ ] Webhook notifications
- [ ] Cloud configuration sync
- [ ] Team collaboration features
- [ ] Audit log export
- [ ] AI-powered safety suggestions

---

**Legend:**
- 🎉 Initial Release
- ✨ New Feature
- 🐛 Bug Fix
- ⚡ Performance
- 📚 Documentation
- 🔒 Security
- 💥 Breaking Change
- 🗑️ Deprecated
