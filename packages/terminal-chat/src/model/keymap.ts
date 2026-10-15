/**
 * Key bindings. One table drives key handling, the help screen and the hint
 * line, so what the app says a key does is what it does.
 */
import { chordOf, type KeyEvent } from "./keys.js";

export type Mode = "compose" | "select";

export type ActionId =
  // composer
  | "send"
  | "send-after-turn"
  | "newline"
  | "interrupt"
  | "clear-or-interrupt"
  | "attach"
  | "palette"
  | "select-mode"
  | "page-up"
  | "page-down"
  | "toggle-all"
  | "help"
  // transcript selection
  | "select-up"
  | "select-down"
  | "select-top"
  | "select-bottom"
  | "toggle"
  | "fork"
  | "edit-fork"
  | "retry"
  | "schedule-resume"
  | "connect"
  | "copy"
  | "inspect"
  | "compose-mode";

export interface Binding {
  mode: Mode;
  /** Chord ids (see `chordOf`). */
  keys: readonly string[];
  action: ActionId;
  /** As shown to the person. */
  label: string;
  description: string;
}

export const BINDINGS: readonly Binding[] = [
  {
    mode: "select",
    keys: ["v"],
    action: "inspect",
    label: "v",
    description: "Inspect the full message or tool result in a scrollable view",
  },
  {
    mode: "compose",
    keys: ["enter"],
    action: "send",
    label: "Enter",
    description: "Send (while the agent works, it reads the message at its next step)",
  },
  {
    mode: "compose",
    keys: ["C-s"],
    action: "send-after-turn",
    label: "Ctrl-S",
    description: "Send after the agent finishes its turn",
  },
  {
    mode: "compose",
    keys: ["M-enter", "S-enter", "C-j"],
    action: "newline",
    label: "Alt-Enter",
    description: "New line (also Shift-Enter where the terminal reports it, and Ctrl-J)",
  },
  {
    mode: "compose",
    keys: ["escape"],
    action: "interrupt",
    label: "Esc",
    description: "Stop the agent; Esc Esc also sends queued messages now",
  },
  {
    mode: "compose",
    keys: ["C-c"],
    action: "clear-or-interrupt",
    label: "Ctrl-C",
    description: "Clear the draft, or stop the agent when the draft is empty",
  },
  {
    mode: "compose",
    keys: ["C-k"],
    action: "palette",
    label: "Ctrl-K",
    description: "Command palette",
  },
  {
    mode: "compose",
    keys: ["C-t"],
    action: "attach",
    label: "Ctrl-T",
    description: "Attach a file to the next message",
  },
  {
    mode: "compose",
    keys: ["C-up", "M-up", "S-up"],
    action: "select-mode",
    label: "Ctrl-↑",
    description: "Select messages in the transcript (Alt-↑ or Shift-↑ also work)",
  },
  {
    mode: "compose",
    keys: ["pageup"],
    action: "page-up",
    label: "PgUp",
    description: "Scroll the transcript up (loads older messages at the top)",
  },
  {
    mode: "compose",
    keys: ["pagedown"],
    action: "page-down",
    label: "PgDn",
    description: "Scroll the transcript down",
  },
  {
    mode: "compose",
    keys: ["C-o"],
    action: "toggle-all",
    label: "Ctrl-O",
    description: "Expand or collapse all tool calls and thinking",
  },
  {
    mode: "compose",
    keys: ["f1"],
    action: "help",
    label: "F1",
    description: "Keys and commands (also /help)",
  },
  {
    mode: "select",
    keys: ["up", "k"],
    action: "select-up",
    label: "↑/k",
    description: "Previous message",
  },
  {
    mode: "select",
    keys: ["down", "j"],
    action: "select-down",
    label: "↓/j",
    description: "Next message",
  },
  {
    mode: "select",
    keys: ["pageup"],
    action: "page-up",
    label: "PgUp",
    description: "Scroll up",
  },
  {
    mode: "select",
    keys: ["pagedown"],
    action: "page-down",
    label: "PgDn",
    description: "Scroll down",
  },
  {
    mode: "select",
    keys: ["g", "home"],
    action: "select-top",
    label: "g",
    description: "Oldest loaded message",
  },
  {
    mode: "select",
    keys: ["S-g", "end"],
    action: "select-bottom",
    label: "G",
    description: "Newest message",
  },
  {
    mode: "select",
    keys: ["enter", " "],
    action: "toggle",
    label: "Enter",
    description: "Expand or collapse (tool calls, thinking, subagents)",
  },
  {
    mode: "select",
    keys: ["f"],
    action: "fork",
    label: "f",
    description: "Fork the conversation after this message",
  },
  {
    mode: "select",
    keys: ["e"],
    action: "edit-fork",
    label: "e",
    description: "Edit your message into a new fork",
  },
  {
    mode: "select",
    keys: ["r"],
    action: "retry",
    label: "r",
    description: "Retry or resume a failed turn",
  },
  {
    mode: "select",
    keys: ["s"],
    action: "schedule-resume",
    label: "s",
    description: "Resume when the usage limit resets",
  },
  {
    mode: "select",
    keys: ["c"],
    action: "connect",
    label: "c",
    description: "Connect the provider a message asks for",
  },
  {
    mode: "select",
    keys: ["y"],
    action: "copy",
    label: "y",
    description: "Copy the message text to your clipboard",
  },
  {
    mode: "select",
    keys: ["C-k"],
    action: "palette",
    label: "Ctrl-K",
    description: "Command palette",
  },
  {
    mode: "select",
    keys: ["escape", "i", "q"],
    action: "compose-mode",
    label: "Esc",
    description: "Back to the composer",
  },
];

/** Chord id for an event, with Shift folded into capitals for letters. */
function chordFor(event: KeyEvent): string {
  if (
    event.name === "char" &&
    !event.ctrl &&
    !event.meta &&
    event.text.length === 1 &&
    /[A-Z]/.test(event.text)
  ) {
    return `S-${event.text.toLowerCase()}`;
  }
  return chordOf(event);
}

export function resolveBinding(mode: Mode, event: KeyEvent): ActionId | null {
  const chord = chordFor(event);
  for (const binding of BINDINGS) {
    if (binding.mode === mode && binding.keys.includes(chord)) return binding.action;
  }
  return null;
}

export function bindingFor(action: ActionId, mode: Mode = "compose"): Binding | undefined {
  return BINDINGS.find((binding) => binding.action === action && binding.mode === mode);
}
