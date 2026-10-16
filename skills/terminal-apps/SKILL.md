---
name: terminal-apps
description: Build or change a terminal app — a panel hosted by terminals, at terminal-apps/<name>, run as a Node program in a workspace PTY — or explain how people use the terminal browser.
---

# Terminal apps

A terminal app is a panel hosted by terminals: an ordinary Node program (Ink
renders natively) at `terminal-apps/<name>` in a workspace. People start it
from the terminal browser (`vibestudio terminal`) — every built terminal app
of the shown workspace is listed under **Start**, next to **Shell** (the
person's login shell). The browser shows the person's Personal workspace by
default and switches with the prefix key then `w`.

The workspace's terminal launch service (`terminalApps.*`) runs the program
in a PTY of the Base `shell` extension, inside the workspace's native runtime,
as the app's own principal. It keeps the person's sessions: programs keep
running when the browser detaches or quits, and the person resumes them from
any device (also the desktop terminal panel). Plain shells are sessions of the
same registry: the desktop terminal panel opens every pane through
`terminalApps.launch`, so panes and browser tabs are one list. An app that ended is started
again on resume; anything that must survive belongs in its durable session
state.

Reference implementation: `terminal-apps/chat` in the Base template.

## Manifest

```jsonc
{
  "name": "@workspace-terminal-apps/my-app",
  "vibestudio": {
    "title": "My App",                            // shown in the launcher
    "description": "What it is for, in one sentence.",
    "icon": "🧭",                                  // optional; an emoji (asset icons are not drawn in terminals)
    "entry": "index.ts"
  },
  "dependencies": { "@workspace/terminal-app": "workspace:*" }
}
```

## Program

```ts
import { startTerminalApp } from "@workspace/terminal-app";

const app = await startTerminalApp();
// app.rpc: the app's own principal in the workspace
// app.state: durable per-session state (survives relaunch)
// app.launch.approvalsKey: how the person opens approvals, e.g. "Ctrl-B a"
```

`startTerminalApp` reads the one-shot launch material the launch service
hands the program and connects as the app's principal. A program started any
other way exits with a message saying to start it from the launcher.

## Talking to the terminal

Use standard escape sequences; the terminal browser (and the desktop panel)
turn them into chrome:

- **Title**: OSC 0/2 (`\x1b]2;Build log\x07`) names the tab.
- **Attention**: BEL, OSC 9 (`\x1b]9;Tests finished\x07`) or
  `OSC 777;notify;title;body` badge a background tab.
- **Links**: OSC 8 hyperlinks. The person clicks one or lists them with the
  prefix key then `o`; nothing opens until they confirm, and only http/https
  links open, on their machine.
- **Copy**: OSC 52 puts text on the person's clipboard.
- **Focus**: enable focus reports (`\x1b[?1004h`) to receive `\x1b[I` and
  `\x1b[O` when the tab gains or loses focus.
- **Paste**: enable bracketed paste (`\x1b[?2004h`) to receive pastes wrapped.

## Rules

- **Keys.** Every key except the person's prefix key (Ctrl-B by default;
  pressed twice it reaches the program too) reaches the program. Show your
  keys on screen.
- **Mouse.** Make the app clickable: enable SGR mouse reporting
  (`\x1b[?1000h\x1b[?1006h`, off again on exit) and the terminal forwards
  clicks and wheel turns inside the tab. Hit-test against the same layout
  that drew the screen, and let a click do exactly what its key does. People
  hold Shift to select text natively while an app owns the mouse.
- **Quitting.** Give the person an obvious way out: repeated Ctrl-C should end
  in quitting once there is nothing left to clear or stop. Exit with code 0
  when the person leaves on purpose; the terminal then closes the tab and,
  with nothing else open, shows its launcher. Any other exit keeps the tab
  with its output and a restart key, so failures stay readable.
- **Size.** Follow the PTY size (`process.stdout.columns/rows`, `SIGWINCH`);
  on attach the terminal resizes the PTY so full-screen programs redraw.
- **Approvals.** Gated calls raise approvals attributed to the app, and
  reviews your work joins are attributed to it too; the terminal shows them in
  chrome no program can draw. While your tab's work waits on one, the terminal
  shows a clickable "Needs you" bar above its status bar (your tab is one row
  shorter meanwhile). Never draw an approval prompt or a bar of your own; say
  in your own view what is waiting, and name `approvalsKey`.
- **Files.** Read workspace files from the program itself; there is no
  terminal-side file request.
- **State.** Keep anything that must survive a restart in `app.state`, never
  in memory only.

## Testing

Test the program's logic and rendering as ordinary Node code (for example a
VT emulator such as `@xterm/headless` for escape sequences) and run it with
`verify` like any unit.
