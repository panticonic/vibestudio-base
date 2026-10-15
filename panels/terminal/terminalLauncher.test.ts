import { describe, expect, it, vi } from "vitest";
import type { TerminalSessionEntry } from "@vibestudio/shared/terminalSessions";
import { createTerminalLauncher } from "./terminalLauncher.js";

function entry(patch: Partial<TerminalSessionEntry> = {}): TerminalSessionEntry {
  return {
    sessionId: "reg-1",
    kind: "shell",
    title: "Shell",
    shellSessionId: "pty-1",
    running: true,
    createdAt: 1,
    lastActiveAt: 1,
    ...patch,
  };
}

function ports(overrides: Partial<Parameters<typeof createTerminalLauncher>[0]> = {}) {
  return {
    launch: vi.fn(async () => entry()),
    resume: vi.fn(async () => entry({ shellSessionId: "pty-2" })),
    restart: vi.fn(async () => entry({ shellSessionId: "pty-3" })),
    close: vi.fn(async () => {}),
    contextId: "ctx-panel",
    ...overrides,
  };
}

describe("terminal launcher", () => {
  it("starts a shell in the chosen context, else in the panel's own", async () => {
    const p = ports();
    const launcher = createTerminalLauncher(p);
    await expect(launcher.open({ command: "make" })).resolves.toEqual({
      sessionId: "pty-1",
      registryId: "reg-1",
    });
    expect(p.launch).toHaveBeenCalledWith({ command: "make", contextId: "ctx-panel", cols: 80, rows: 24 });
    await launcher.open({ contextId: "ctx-chosen" });
    expect(p.launch).toHaveBeenLastCalledWith({ contextId: "ctx-chosen", cols: 80, rows: 24 });
  });

  it("relaunches and restarts a registered session as itself", async () => {
    const p = ports();
    const launcher = createTerminalLauncher(p);
    await expect(launcher.resume("reg-1")).resolves.toEqual({ sessionId: "pty-2", registryId: "reg-1" });
    await expect(launcher.restart("reg-1")).resolves.toEqual({ sessionId: "pty-3", registryId: "reg-1" });
    await launcher.close("reg-1");
    expect(p.close).toHaveBeenCalledWith("reg-1");
  });

  it("reports a session that started no shell", async () => {
    const launcher = createTerminalLauncher(ports({ launch: vi.fn(async () => entry({ shellSessionId: null })) }));
    await expect(launcher.open({})).rejects.toThrow("did not start a shell");
  });
});
