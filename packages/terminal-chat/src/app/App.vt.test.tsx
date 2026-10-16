/**
 * The real render path through a VT emulator: Ink's frame rewrites (not
 * debug frames) applied by @xterm/headless, with the cursor placed in the
 * composer. (Ink 6.8's incrementalRendering misplaces lines once a cursor
 * position is set, so the app uses the standard rewrite.) Ink switches to a non-interactive mode when it
 * believes it runs in CI, so the module graph is loaded with CI unset.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { Terminal } from "@xterm/headless";

class VtStdout extends EventEmitter {
  readonly isTTY = true;
  constructor(
    readonly term: Terminal,
    public columns: number,
    public rows: number
  ) {
    super();
  }
  write(data: string): boolean {
    this.term.write(data);
    return true;
  }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 120)); // past Ink's frame throttle

describe("terminal chat in a VT emulator", () => {
  let unmount: (() => void) | null = null;
  beforeEach(() => {
    vi.stubEnv("CI", "false");
    vi.stubEnv("CONTINUOUS_INTEGRATION", "false");
    vi.resetModules();
  });
  afterEach(() => {
    unmount?.();
    unmount = null;
    vi.unstubAllEnvs();
  });

  it("paints the screen and keeps the real cursor in the composer", async () => {
    const { render } = await import("ink");
    const { TerminalChatApp } = await import("./App.js");
    const { createFakeChat, TypedInput } = await import("../testing/fakes.js");
    const term = new Terminal({ cols: 80, rows: 24, allowProposedApi: true, convertEol: true }); // a pty's ONLCR
    const stdout = new VtStdout(term, 80, 24);
    const input = new TypedInput();
    const chat = createFakeChat();
    const instance = render(
      <TerminalChatApp runtime={chat.runtime} input={input} control={() => {}} />,
      {
        stdout: stdout as never,
        patchConsole: false,
        exitOnCtrlC: false,
      }
    );
    unmount = () => instance.unmount();
    const screen = async () => {
      await settle();
      await new Promise<void>((resolve) => term.write("", resolve));
      const buffer = term.buffer.active;
      return Array.from(
        { length: 24 },
        (_, y) => buffer.getLine(buffer.viewportY + y)?.translateToString(true) ?? ""
      );
    };

    let lines = await screen();
    expect(lines.join("\n")).toContain("New conversation");
    expect(lines[22]).toMatch(/^● online/);

    input.type("hello there");
    lines = await screen();
    const composerRow = lines.findIndex((line) => line.startsWith("› hello there"));
    expect(composerRow).toBeGreaterThan(0);
    expect(term.buffer.active.cursorY).toBe(composerRow);
    expect(term.buffer.active.cursorX).toBe("› hello there".length);

    // A streaming reply grows in place; the rest of the screen stays put.
    chat.update({ messages: [{ id: "a", senderId: "ai", content: "Stream", complete: false }] });
    lines = await screen();
    expect(lines.join("\n")).toContain("Stream▌");
    chat.update({
      messages: [{ id: "a", senderId: "ai", content: "Streaming done", complete: true }],
    });
    lines = await screen();
    expect(lines.join("\n")).toContain("Streaming done");
    expect(lines.join("\n")).not.toContain("▌");
    expect(lines[22]).toMatch(/^● online/);
  });
});
