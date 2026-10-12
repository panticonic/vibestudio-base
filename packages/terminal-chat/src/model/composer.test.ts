import { describe, expect, it } from "vitest";
import {
  applyEdit,
  completeMention,
  editorFor,
  emptyEditor,
  layoutComposer,
  mentionAt,
  type EditCommand,
  type EditorState,
} from "./composer.js";

const run = (state: EditorState, ...commands: EditCommand[]) => commands.reduce(applyEdit, state);
const at = (text: string, cursor = text.length): EditorState => ({ ...editorFor(text), cursor });

describe("composer editing", () => {
  it("inserts, deletes and moves by character and word", () => {
    let s = run(emptyEditor, { kind: "insert", text: "hello world" });
    expect(s).toMatchObject({ text: "hello world", cursor: 11 });
    s = run(s, { kind: "word-left" }, { kind: "word-left" });
    expect(s.cursor).toBe(0);
    s = run(s, { kind: "word-right" }, { kind: "delete-word-forward" });
    expect(s.text).toBe("hello");
    s = run(s, { kind: "delete-word-back" });
    expect(s).toMatchObject({ text: "", cursor: 0 });
  });

  it("never splits a surrogate pair", () => {
    const s = run(at("a😀b", 3), { kind: "backspace" });
    expect(s.text).toBe("ab");
    expect(run(at("a😀", 1), { kind: "right" }).cursor).toBe(3);
  });

  it("edits lines: newline, line start/end, kill line", () => {
    let s = run(emptyEditor, { kind: "insert", text: "one" }, { kind: "newline" }, { kind: "insert", text: "two" });
    expect(s.text).toBe("one\ntwo");
    s = run(s, { kind: "line-start" });
    expect(s.cursor).toBe(4);
    s = run(s, { kind: "kill-line-forward" });
    expect(s.text).toBe("one\n");
    s = run(s, { kind: "kill-line-back" });
    expect(s.text).toBe("one");
  });

  it("moves between lines with Up/Down and browses history only at the edges", () => {
    const history = ["newest", "older"];
    let s = at("first\nsecond");
    s = run(s, { kind: "up", history });
    expect(s).toMatchObject({ text: "first\nsecond", cursor: 5 });
    s = run(s, { kind: "up", history });
    expect(s).toMatchObject({ text: "newest", historyIndex: 0, stash: "first\nsecond" });
    s = run(s, { kind: "up", history }, { kind: "up", history });
    expect(s).toMatchObject({ text: "older", historyIndex: 1 });
    s = run(s, { kind: "down", history }, { kind: "down", history });
    expect(s).toMatchObject({ text: "first\nsecond", historyIndex: null });
  });

  it("keeps the cursor when the store echoes the same draft and clamps it on a new one", () => {
    const s = at("hello", 2);
    expect(editorFor("hello", s)).toBe(s);
    expect(editorFor("he", s).cursor).toBe(2);
  });

  it("soft-wraps by cell width and places the cursor", () => {
    expect(layoutComposer("abcdef", 6, 4)).toEqual({ lines: ["abc", "def"], cursorRow: 1, cursorColumn: 3 });
    expect(layoutComposer("ab\ncd", 3, 10)).toEqual({ lines: ["ab", "cd"], cursorRow: 1, cursorColumn: 0 });
    expect(layoutComposer("界界", 2, 4).cursorColumn).toBe(2);
  });

  it("finds and completes the @mention at the cursor", () => {
    const s = at("hi @ai");
    expect(mentionAt(s)).toEqual({ start: 3, query: "ai" });
    expect(completeMention(s, "ai-chat").text).toBe("hi @ai-chat ");
    expect(mentionAt(at("mail@example"))).toBeNull();
  });
});
