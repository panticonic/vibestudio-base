/**
 * Raw terminal input → key events.
 *
 * The terminal forwards raw bytes, so this decoder sees exactly what the
 * person's terminal sent: legacy escape sequences, xterm modifier
 * parameters (`CSI 1;5C`), modifyOtherKeys (`CSI 27;2;13~`), the kitty
 * keyboard protocol (`CSI 13;2u`) and bracketed pastes. Shift-Enter is only
 * distinguishable in the last two; Alt-Enter (`ESC CR`) works everywhere.
 */

export type KeyName =
  | "char"
  | "enter"
  | "escape"
  | "backspace"
  | "delete"
  | "tab"
  | "up"
  | "down"
  | "left"
  | "right"
  | "home"
  | "end"
  | "pageup"
  | "pagedown"
  | "insert"
  | "f1"
  | "f2";

export interface KeyEvent {
  type: "key";
  name: KeyName;
  /** For `char`: the typed text (one or more printable characters); for Ctrl/Alt chords: the base character. */
  text: string;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
}

export interface PasteEvent {
  type: "paste";
  text: string;
}

/** Terminal focus reporting (`CSI I` / `CSI O`, enabled with `CSI ? 1004 h`). */
export interface FocusEvent {
  type: "focus";
  focused: boolean;
}

/**
 * A mouse report (SGR encoding, `CSI < b ; x ; y M|m`, enabled with
 * `CSI ? 1000 h` and `CSI ? 1006 h`). Cells are 0-based.
 */
export interface MouseEvent {
  type: "mouse";
  action: "press" | "release" | "wheel-up" | "wheel-down";
  /** 0 left, 1 middle, 2 right. */
  button: number;
  x: number;
  y: number;
}

export type InputEvent = KeyEvent | PasteEvent | FocusEvent | MouseEvent;

const ESC = "\x1b";
const PASTE_START = "\x1b[200~";
const PASTE_END = "\x1b[201~";

export const key = (
  name: KeyName,
  modifiers: Partial<Pick<KeyEvent, "ctrl" | "meta" | "shift" | "text">> = {}
): KeyEvent => ({
  type: "key",
  name,
  text: modifiers.text ?? "",
  ctrl: modifiers.ctrl ?? false,
  meta: modifiers.meta ?? false,
  shift: modifiers.shift ?? false,
});

/** xterm modifier parameter (1 + bitmask: 1 shift, 2 alt, 4 ctrl) → flags. */
function modifierFlags(param: number | undefined): Pick<KeyEvent, "ctrl" | "meta" | "shift"> {
  const mask = Math.max(0, (param ?? 1) - 1);
  return { shift: (mask & 1) !== 0, meta: (mask & 2) !== 0, ctrl: (mask & 4) !== 0 };
}

const CSI_FINAL_KEYS: Record<string, KeyName> = {
  A: "up",
  B: "down",
  C: "right",
  D: "left",
  H: "home",
  F: "end",
};

const SS3_KEYS: Record<string, KeyName> = { ...CSI_FINAL_KEYS, P: "f1", Q: "f2" };

const TILDE_KEYS: Record<number, KeyName> = {
  11: "f1",
  12: "f2",
  1: "home",
  2: "insert",
  3: "delete",
  4: "end",
  5: "pageup",
  6: "pagedown",
  7: "home",
  8: "end",
};

/** A Unicode code point as sent by kitty / modifyOtherKeys → key event. */
function codepointKey(code: number, flags: Pick<KeyEvent, "ctrl" | "meta" | "shift">): KeyEvent {
  switch (code) {
    case 13:
      return key("enter", flags);
    case 27:
      return key("escape", flags);
    case 9:
      return key("tab", flags);
    case 127:
    case 8:
      return key("backspace", flags);
    default: {
      const char = String.fromCodePoint(code);
      return key("char", { ...flags, text: char });
    }
  }
}

function decodeCsi(params: string, final: string): KeyEvent | null {
  const parts = params.split(";").map((part) => (part === "" ? undefined : Number(part)));
  if (final === "u") {
    // kitty: CSI code[:alternates] ; modifiers u
    const code = Number(params.split(";")[0]!.split(":")[0]);
    return Number.isFinite(code) ? codepointKey(code, modifierFlags(parts[1])) : null;
  }
  if (final === "~") {
    if (parts[0] === 27 && parts[2] !== undefined) {
      // modifyOtherKeys: CSI 27 ; modifiers ; code ~
      return codepointKey(parts[2], modifierFlags(parts[1]));
    }
    const name = TILDE_KEYS[parts[0] ?? -1];
    return name ? key(name, modifierFlags(parts[1])) : null;
  }
  if (final === "Z") return key("tab", { shift: true });
  if (final === "P" && parts[1] !== undefined) return key("f1", modifierFlags(parts[1]));
  if (final === "Q" && parts[1] !== undefined) return key("f2", modifierFlags(parts[1]));
  const name = CSI_FINAL_KEYS[final];
  return name ? key(name, modifierFlags(parts[1])) : null;
}

/** An escape sequence cut off by the end of a read: CSI (keys, mouse, paste markers) or SS3. */
const INCOMPLETE_SEQUENCE = /^\x1b(?:\[[0-9;:?<]*[ -/]*|O)$/;

/**
 * Stateful decoder: a read from the terminal may end anywhere, so a bracketed
 * paste may span several chunks and an escape sequence may be cut in two.
 * `push` returns the complete events so far and keeps the rest for the next
 * chunk. A lone ESC ending a read is the Escape key (ordinary terminals send
 * it alone), never held back.
 */
export class KeyDecoder {
  private pasting: string | null = null;
  /** The start of an escape sequence the last chunk ended in. */
  private partial = "";

  push(input: string): InputEvent[] {
    const events: InputEvent[] = [];
    let chunk = this.partial + input;
    this.partial = "";
    let index = 0;
    let text = "";
    const flushText = () => {
      if (text) events.push(key("char", { text }));
      text = "";
    };
    while (index < chunk.length) {
      if (this.pasting !== null) {
        // The end marker may straddle the previous chunk and this one.
        const from = Math.max(0, this.pasting.length - (PASTE_END.length - 1));
        const buffer = this.pasting + chunk.slice(index);
        const end = buffer.indexOf(PASTE_END, from);
        if (end === -1) {
          this.pasting = buffer;
          return events;
        }
        events.push({ type: "paste", text: buffer.slice(0, end).replace(/\r\n?/g, "\n") });
        this.pasting = null;
        chunk = buffer.slice(end + PASTE_END.length);
        index = 0;
        continue;
      }
      if (chunk.startsWith(PASTE_START, index)) {
        flushText();
        this.pasting = "";
        index += PASTE_START.length;
        continue;
      }
      const char = chunk[index]!;
      const code = char.charCodeAt(0);
      if (char === ESC && INCOMPLETE_SEQUENCE.test(chunk.slice(index))) {
        flushText();
        this.partial = chunk.slice(index);
        return events;
      }
      if (char === ESC) {
        flushText();
        const next = chunk[index + 1];
        if (next === "[") {
          const mouse = /^\x1b\[<(\d+);(\d+);(\d+)([Mm])/.exec(chunk.slice(index));
          if (mouse) {
            const code = Number(mouse[1]);
            events.push({
              type: "mouse",
              action:
                code & 64
                  ? code & 1
                    ? "wheel-down"
                    : "wheel-up"
                  : mouse[4] === "M"
                    ? "press"
                    : "release",
              button: code & 3,
              x: Number(mouse[2]) - 1,
              y: Number(mouse[3]) - 1,
            });
            index += mouse[0].length;
            continue;
          }
          const match = /^\x1b\[([0-9;:?]*)([ -/]*)([@-~])/.exec(chunk.slice(index));
          if (match) {
            if (match[1] === "" && (match[3] === "I" || match[3] === "O")) {
              events.push({ type: "focus", focused: match[3] === "I" });
              index += match[0].length;
              continue;
            }
            const event = decodeCsi(match[1]!, match[3]!);
            if (event) events.push(event);
            index += match[0].length;
            continue;
          }
        } else if (next === "O" && index + 2 < chunk.length) {
          const name = SS3_KEYS[chunk[index + 2]!];
          if (name) events.push(key(name));
          index += 3;
          continue;
        } else if (next === undefined) {
          events.push(key("escape"));
          index += 1;
          continue;
        } else if (next === ESC) {
          events.push(key("escape"));
          index += 1;
          continue;
        }
        // Alt + key: ESC followed by the key's own byte(s).
        const inner = this.decodeSingle(next!);
        events.push({ ...inner, meta: true });
        index += 2;
        continue;
      }
      if (code < 0x20 || code === 0x7f) {
        flushText();
        events.push(this.decodeSingle(char));
        index += 1;
        continue;
      }
      const point = chunk.codePointAt(index)!;
      const width = point > 0xffff ? 2 : 1;
      text += chunk.slice(index, index + width);
      index += width;
    }
    flushText();
    return events;
  }

  private decodeSingle(char: string): KeyEvent {
    const code = char.charCodeAt(0);
    if (char === "\r") return key("enter");
    if (char === "\n") return key("char", { ctrl: true, text: "j" });
    if (char === "\t") return key("tab");
    if (code === 0x7f || code === 0x08) return key("backspace");
    if (code === 0) return key("char", { ctrl: true, text: " " });
    if (code < 0x20) {
      return key("char", { ctrl: true, text: String.fromCharCode(code + 0x60) });
    }
    return key("char", { text: char });
  }
}

/** A stable chord id such as `C-k`, `M-enter`, `S-tab`, `up`, used by the keymap. */
export function chordOf(event: KeyEvent): string {
  const base = event.name === "char" ? event.text.toLowerCase() : event.name;
  return `${event.ctrl ? "C-" : ""}${event.meta ? "M-" : ""}${event.shift && event.name !== "char" ? "S-" : ""}${base}`;
}
