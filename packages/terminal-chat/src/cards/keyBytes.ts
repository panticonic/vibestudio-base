/** A decoded key event back to the bytes a terminal sends for it, for a card's Ink input. */
import type { InputEvent } from "../model/keys.js";

const NAMED: Record<string, string> = {
  enter: "\r",
  escape: "\x1b",
  backspace: "\x7f",
  delete: "\x1b[3~",
  tab: "\t",
  up: "\x1b[A",
  down: "\x1b[B",
  right: "\x1b[C",
  left: "\x1b[D",
  home: "\x1b[H",
  end: "\x1b[F",
  pageup: "\x1b[5~",
  pagedown: "\x1b[6~",
  insert: "\x1b[2~",
  f1: "\x1bOP",
  f2: "\x1bOQ",
};

export function keyBytes(event: InputEvent): string | null {
  if (event.type === "paste") return event.text;
  if (event.type !== "key") return null;
  if (event.name === "tab" && event.shift) return "\x1b[Z";
  if (event.name === "char") {
    const text = event.text;
    if (event.ctrl && text.length === 1) {
      const code = text.toLowerCase().charCodeAt(0);
      if (code >= 97 && code <= 122) return String.fromCharCode(code - 96);
    }
    return event.meta ? `\x1b${text}` : text;
  }
  const bytes = NAMED[event.name];
  return bytes === undefined ? null : event.meta ? `\x1b${bytes}` : bytes;
}
