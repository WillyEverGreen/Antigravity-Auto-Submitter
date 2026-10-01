# Kiro Auto-Accept

This directory contains the **standalone companion edition** of the Auto-Accept confirmation daemon, specifically engineered for **Kiro IDE**.

---

## 📁 Directory Structure & Architecture

```text
kiro-auto-accept/
├── bin/                       # Global CLI wrapper executables
│   ├── kiro-doctor.js
│   ├── kiro-launch.js
│   ├── kiro-restart.js
│   ├── kiro-setup.js
│   └── kiro-start.js
├── kiro-auto-accept.js         # Core persistent WindowSession CDP engine
├── package.json               # Standalone npm package specification (v1.1.0)
├── README.md                  # Comprehensive user guide & CLI documentation
├── README-FOLDER.md           # Relationship to parent project
├── SETUP-SHORTCUT.md          # Multi-platform shortcut configuration guide
└── CHANGELOG.md               # Version release history
```

---

## 🔄 Relationship to Antigravity Auto-Submit

| Dimension | Antigravity Auto-Submit (Parent) | Kiro Auto-Accept (This Folder) |
| :--- | :--- | :--- |
| **Target IDE** | Google Antigravity IDE | Kiro IDE |
| **Dedicated Port** | **9333** (range: 9330–9340) | **9222** (range: 9220–9230) |
| **Port Filtering** | Strictly ignores 9220–9235 | Strictly ignores 9300–9400 |
| **Webview Architecture** | Workbench direct DOM | Workbench + out-of-process Webview + `#active-frame` |
| **Global CLI** | `auto-accept`, `agy-*` | `kiro-auto-accept`, `kiro-*` |
| **Configuration** | `.auto-accept.json` | `.kiro-auto-accept.json` |
| **Global Storage** | `~/.antigravity-auto-submit/` | `~/.kiro-auto-accept/` |

---

## 🚀 Quick Setup & Usage

```powershell
# 1. Install globally
npm install -g .

# 2. Configure shortcuts
kiro-setup

# 3. Launch & start
kiro-auto-accept
```

For full documentation, see [README.md](./README.md).
