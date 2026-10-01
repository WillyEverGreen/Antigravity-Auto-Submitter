# Kiro IDE Shortcut Setup Guide

This guide explains how to configure Kiro IDE with `--remote-debugging-port=9222` so that the **Kiro Auto-Accept** daemon can connect and automate confirmation prompts.

---

## ⚡ Method 1: Automatic 1-Click Setup (Recommended)

Run the automated shortcut configuration tool:

```powershell
kiro-setup
# OR: kiro-auto-accept setup
```

This automatically:
- Locates your Kiro IDE executable (`Kiro.exe`)
- Creates or updates the **"Kiro IDE (Debug)"** shortcut on your Desktop
- Creates or updates the **"Kiro IDE (Debug)"** shortcut in your Start Menu
- Configures `--remote-debugging-port=9222` with proper working directories and icons

---

## 🪟 Method 2: Manual Windows Setup

If you prefer to configure your shortcut manually:

### Step 1: Locate Your Existing Shortcut
Look on your **Desktop** or search in your **Start Menu** for **Kiro**.
> **Important:** Make sure you are right-clicking a **Shortcut (.lnk)** file, not the application binary (`Kiro.exe`) itself.

### Step 2: Open Shortcut Properties
1. Right-click the shortcut and select **Properties**.
2. Select the **Shortcut** tab.

### Step 3: Modify the Target Field
At the end of the **Target** field, add a space and `--remote-debugging-port=9222` outside the quotes:

```text
"C:\Users\<YourUsername>\AppData\Local\Programs\Kiro\Kiro.exe" --remote-debugging-port=9222
```

### Step 4: Save & Launch
1. Click **Apply** and **OK**.
2. Close any running Kiro IDE instances.
3. Launch Kiro using the modified shortcut.
4. Run `kiro-doctor` in your terminal to verify connectivity.

---

## 🍎 macOS Setup

### Option A: Terminal Launch Command
```bash
/Applications/Kiro.app/Contents/MacOS/Kiro --remote-debugging-port=9222 &
```

### Option B: Create a Persistent Shell Alias
Add this to your `~/.zshrc` or `~/.bashrc`:
```bash
alias kiro-debug='/Applications/Kiro.app/Contents/MacOS/Kiro --remote-debugging-port=9222'
```

---

## 🐧 Linux Setup

Launch with the debug argument:
```bash
kiro --remote-debugging-port=9222 &
```

Or modify your desktop entry (`~/.local/share/applications/kiro.desktop`):
```ini
[Desktop Entry]
Name=Kiro IDE (Debug)
Exec=/usr/bin/kiro --remote-debugging-port=9222 %F
Icon=kiro
Type=Application
Categories=Development;IDE;
```

---

## 🔍 Verification

Once Kiro IDE is launched, run:

```powershell
kiro-doctor
```

Look for:
```text
  CDP Port Status:    Connected on port(s): 9222 ✔
  Confirmation Engine: Ready for multi-target auto-approvals! (2 target(s)) ✔
```
