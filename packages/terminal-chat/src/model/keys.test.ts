import { describe, expect, it } from "vitest";
import { KeyDecoder, chordOf, type InputEvent, type KeyEvent } from "./keys.js";

const decode = (...chunks: string[]): InputEvent[] => {
  const decoder = new KeyDecoder();
  return chunks.flatMap((chunk) => decoder.push(chunk));
};
const chords = (...chunks: string[]) =>
  decode(...chunks).map((event) => (event.type === "key" ? chordOf(event) : event.type));

describe("KeyDecoder", () => {
  it("groups typed text and decodes control keys", () => {
    expect(decode("héllo")).toMatchObject([{ type: "key", name: "char", text: "héllo" }]);
    expect(chords("\r", "\t", "\x7f", "\x0b", "\x01", "\x00")).toEqual(["enter", "tab", "backspace", "C-k", "C-a", "C- "]);
  });

  it("decodes arrows with xterm modifiers and SS3 arrows", () => {
    expect(chords("\x1b[A", "\x1b[1;5A", "\x1b[1;3D", "\x1b[1;2B", "\x1bOC")).toEqual(["up", "C-up", "M-left", "S-down", "right"]);
    expect(chords("\x1b[5~", "\x1b[6~", "\x1b[H", "\x1b[4~", "\x1b[3~", "\x1b[Z")).toEqual(["pageup", "pagedown", "home", "end", "delete", "S-tab"]);
  });

  it("tells Enter, Alt-Enter and Shift-Enter apart where the terminal reports them", () => {
    expect(chords("\x1b\r")).toEqual(["M-enter"]);
    expect(chords("\x1b[13;2u")).toEqual(["S-enter"]); // kitty
    expect(chords("\x1b[27;2;13~")).toEqual(["S-enter"]); // modifyOtherKeys
    expect(chords("\n")).toEqual(["C-j"]);
  });

  it("decodes Alt+letter, a lone Esc, Esc Esc, and F1", () => {
    expect(chords("\x1bb", "\x1b", "\x1b\x1b", "\x1bOP", "\x1b[11~")).toEqual(["M-b", "escape", "escape", "escape", "f1", "f1"]);
  });

  it("assembles bracketed pastes across chunks and normalises newlines", () => {
    const events = decode("ab\x1b[200~line 1\r\nli", "ne 2\x1b[201~c");
    expect(events).toEqual([
      expect.objectContaining({ name: "char", text: "ab" }),
      { type: "paste", text: "line 1\nline 2" },
      expect.objectContaining({ name: "char", text: "c" }),
    ]);
  });

  it("reports focus changes", () => {
    expect(decode("\x1b[I\x1b[O")).toEqual([
      { type: "focus", focused: true },
      { type: "focus", focused: false },
    ]);
  });

  it("names chords with modifiers in a fixed order", () => {
    const event: KeyEvent = { type: "key", name: "up", text: "", ctrl: true, meta: true, shift: true };
    expect(chordOf(event)).toBe("C-M-S-up");
  });
});
