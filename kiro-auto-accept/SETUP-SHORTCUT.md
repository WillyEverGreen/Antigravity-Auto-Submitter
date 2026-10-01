# Kiro IDE Shortcut Setup Guide

## Why Do This?

By adding `--remote-debugging-port=9222` to your Kiro shortcut's target, you'll **never have to type it manually again**. Just double-click your shortcut and Kiro auto-accept will work automatically!

---

## 🪟 Windows Setup

### Step 1: Find Your Kiro Shortcut

Look for a Kiro IDE shortcut in one of these places:
- **Desktop** (most common)
- **Taskbar** (right-click → "More" → "Open file location")
- **Start Menu** (right-click Kiro → "More" → "Open file location")

### Step 2: Open Shortcut Properties

1. **Right-click** the Kiro IDE shortcut
2. Select **Properties**
3. Make sure you're on the **Shortcut** tab

### Step 3: Modify the Target Field

In the **Target:** field, you'll see something like:
```
"C:\Users\YourName\AppData\Local\Programs\Kiro\Kiro.exe"
```

**Add this to the end (outside the quotes):**
```
--remote-debugging-port=9222
```

**Final result should look like:**
```
"C:\Users\YourName\AppData\Local\Programs\Kiro\Kiro.exe" --remote-debugging-port=9222
```

### Step 4: Save and Test

1. Click **Apply**
2. Click **OK**
3. **Close Kiro completely** if it's running
4. Launch Kiro from the updated shortcut
5. Run: `kiro-auto-accept doctor` to verify

✅ **Done!** Now you can just double-click your shortcut anytime!

---

## 🍎 macOS Setup

### Step 1: Create a Launch Script

1. Open **Terminal**
2. Create a launch script:
   ```bash
   nano ~/launch-kiro.sh
   ```

3. Add this content:
   ```bash
   #!/bin/bash
   /Applications/Kiro.app/Contents/MacOS/Kiro --remote-debugging-port=9222
   ```
   
   Or if using VS Code:
   ```bash
   #!/bin/bash
   /Applications/Visual\ Studio\ Code.app/Contents/MacOS/Electron --remote-debugging-port=9222
   ```

4. Save and exit: `Ctrl+X`, then `Y`, then `Enter`

### Step 2: Make It Executable

```bash
chmod +x ~/launch-kiro.sh
```

### Step 3: Create an Application (Optional but Recommended)

1. Open **Automator**
2. Choose **Application**
3. Search for and add **Run Shell Script**
4. Change "Pass input" to **as arguments**
5. Enter:
   ```bash
   ~/launch-kiro.sh
   ```
6. Save as **Kiro Debug** to your Applications folder

### Step 4: Test

- Launch from Automator app, or
- Run in terminal: `~/launch-kiro.sh`
- Verify with: `kiro-auto-accept doctor`

✅ **Done!** Now just open the app or run the script!

---

## 🐧 Linux Setup

### Step 1: Find or Create Desktop Entry

Look for Kiro's `.desktop` file:
```bash
# Common locations
~/.local/share/applications/kiro.desktop
/usr/share/applications/kiro.desktop
```

### Step 2: Edit the Desktop Entry

```bash
nano ~/.local/share/applications/kiro.desktop
```

### Step 3: Modify the Exec Line

Find the line starting with `Exec=`, it might look like:
```ini
Exec=/usr/bin/kiro
```

Change it to:
```ini
Exec=/usr/bin/kiro --remote-debugging-port=9222
```

Or for VS Code:
```ini
Exec=/usr/bin/code --remote-debugging-port=9222
```

### Step 4: Save and Reload

```bash
# Save the file (Ctrl+X, Y, Enter)

# Reload desktop database
update-desktop-database ~/.local/share/applications/
```

### Step 5: Test

- Launch Kiro from your application menu
- Or run: `kiro --remote-debugging-port=9222`
- Verify with: `kiro-auto-accept doctor`

✅ **Done!** Launch from your app menu normally!

---

## 📝 Quick Reference

### What You're Adding

```
--remote-debugging-port=9222
```

### Where It Goes

**After** the executable path, **outside** any quotes:

❌ **Wrong:**
```
"C:\Path\To\Kiro.exe --remote-debugging-port=9222"
```

✅ **Correct:**
```
"C:\Path\To\Kiro.exe" --remote-debugging-port=9222
```

---

## 🔍 Verification

After setup, verify it's working:

```bash
kiro-auto-accept doctor
```

You should see:
```
✔ CDP Port Status: Connected on port(s): 9222 ✔
```

---

## 🆘 Troubleshooting

### "Can't find the shortcut"

**Windows:**
- Press `Win` key, type "Kiro", right-click → Open file location
- Or check: `C:\Users\YourName\Desktop`

**macOS:**
- Check `/Applications/`
- Or create the script method above

**Linux:**
- Run: `which kiro` to find the executable
- Create desktop entry if needed

### "Target field is greyed out"

You might be looking at a **symbolic link** instead of a shortcut:
- Look for the actual `.lnk` file (Windows)
- Or create a new shortcut pointing to the Kiro executable

### "Still says no debug port detected"

1. Make sure you **closed Kiro completely** before relaunching
2. Check Task Manager / Activity Monitor for lingering processes
3. Launch from the **modified shortcut** (not from another launcher)
4. Run `kiro-auto-accept doctor` to check connection

---

## 🎯 Now You're Set!

From now on:

1. **Launch Kiro** from your modified shortcut (just double-click!)
2. **Start daemon:** `kiro-auto-accept` (or just `kiro-auto-accept start`)
3. **Work normally** - confirmations auto-accepted ✨

No need to remember the debug port command ever again!
