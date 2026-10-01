# Kiro Auto-Accept

This is a **separate, standalone version** of the Antigravity Auto-Submitter, adapted for **Kiro IDE**.

## 📂 What's in This Folder?

This folder contains a complete, independent implementation of auto-accept for Kiro IDE (based on VS Code/Electron). It's maintained separately from the main Antigravity Auto-Submitter.

## 🔗 Relationship to Main Project

- **Main Product:** Antigravity Auto-Submitter (parent folder)
- **This Folder:** Kiro IDE adaptation
- **Code:** Completely separate - can be developed/released independently
- **Configuration:** Uses `.kiro-auto-accept.json` (different from `.auto-accept.json`)

## 📦 Installation

From this folder:

```bash
npm install -g .
```

Then use:

```bash
kiro-auto-accept --help
```

## 📖 Documentation

See [`README.md`](./README.md) in this folder for complete Kiro Auto-Accept documentation.

**Quick Setup:** See [`SETUP-SHORTCUT.md`](./SETUP-SHORTCUT.md) for instructions on adding the debug port to your Kiro shortcut.

## 🆚 Key Differences from Antigravity Version

| Feature | Antigravity | Kiro |
|---------|------------|------|
| **IDE** | Google Antigravity IDE | Kiro IDE (VS Code based) |
| **Default Port** | 9333 | 9222 |
| **Launch Flag** | `--remote-debugging-port=9333` | `--remote-debugging-port=9222` |
| **Config File** | `.auto-accept.json` | `.kiro-auto-accept.json` |
| **Global Dir** | `~/.antigravity-auto-submit` | `~/.kiro-auto-accept` |
| **Commands** | `antigravity-auto-submit`, `auto-accept` | `kiro-auto-accept`, `kiro-accept` |

## 🔧 Development

This folder is self-contained:
- Has its own `package.json`
- Has its own `CHANGELOG.md`
- Can be versioned independently
- Can be published to npm separately

## 📜 License

MIT - Same as parent project

---

**Parent Project:** [Antigravity Auto-Submitter](../)
