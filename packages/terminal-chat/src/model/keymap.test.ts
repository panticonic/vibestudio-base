import { describe, expect, it } from "vitest";
import { BINDINGS, resolveBinding } from "./keymap.js";
import { KeyDecoder, type KeyEvent } from "./keys.js";

const key = (raw: string) => new KeyDecoder().push(raw)[0] as KeyEvent;

describe("key bindings", () => {
  it("resolves composer keys", () => {
    expect(resolveBinding("compose", key("\r"))).toBe("send");
    expect(resolveBinding("compose", key("\x1b\r"))).toBe("newline");
    expect(resolveBinding("compose", key("\x1b[13;2u"))).toBe("newline");
    expect(resolveBinding("compose", key("\x13"))).toBe("send-after-turn");
    expect(resolveBinding("compose", key("\x0b"))).toBe("palette");
    expect(resolveBinding("compose", key("\x1b[1;5A"))).toBe("select-mode");
    expect(resolveBinding("compose", key("\x1b"))).toBe("interrupt");
    expect(resolveBinding("compose", key("a"))).toBeNull();
  });

  it("resolves transcript keys, including capitals", () => {
    expect(resolveBinding("select", key("k"))).toBe("select-up");
    expect(resolveBinding("select", key("G"))).toBe("select-bottom");
    expect(resolveBinding("select", key("f"))).toBe("fork");
    expect(resolveBinding("select", key(" "))).toBe("toggle");
    expect(resolveBinding("select", key("\x1b"))).toBe("compose-mode");
  });

  it("never binds one chord to two actions in a mode", () => {
    for (const mode of ["compose", "select"] as const) {
      const chords = BINDINGS.filter((b) => b.mode === mode).flatMap((b) => b.keys);
      expect(new Set(chords).size).toBe(chords.length);
    }
  });
});
