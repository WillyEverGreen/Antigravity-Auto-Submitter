# Enable the debug port

The IDE must start with `--remote-debugging-port=9333` so the daemon can see approval prompts.

1. Run **Add Debug Port to IDE Shortcuts (setup)**.
2. Fully close the IDE, including background processes.
3. Reopen it from the patched Desktop or Start Menu shortcut.

A running IDE cannot gain a debug port without a restart.
