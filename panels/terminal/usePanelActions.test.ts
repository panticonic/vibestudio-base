import { describe, expect, it, vi } from "vitest";
import { defaultTerminalState } from "./terminalState.js";
import { createPanelActions } from "./usePanelActions.js";
import type { SessionInfo, ShellApi, TerminalState } from "./types.js";
import type { TerminalLauncher } from "./terminalLauncher.js";
import { VSCODE_SHELL_INTEGRATION_META_KEY } from "./vscodeShellIntegrationMeta.js";

describe("panel actions", () => {
  it("applies the configured scrollback limit to newly opened sessions", async () => {
    const { shell, launcher } = makeBackend();
    const harness = makeHarness(shell, launcher);

    const sessionId = await harness.actions.openSession();

    expect(sessionId).toBe("new-1");
    expect(shell.setScrollbackLimit).toHaveBeenCalledWith("new-1", 1024 * 1024);
  });

  it("applies the configured scrollback limit to split and restarted sessions", async () => {
    const { shell, launcher } = makeBackend();
    const harness = makeHarness(shell, launcher, {
      tree: { kind: "leaf", sessionId: "old-1" },
      focusedSessionId: "old-1",
      perSession: {
        "old-1": {
          cwd: "/repo",
          originalArgv: ["/bin/sh"],
          readCursor: 0,
          lastSeenAt: 0,
          registryId: "reg-old-1",
        },
      },
    }, { "old-1": session("old-1", "/repo") });

    await harness.actions.splitSession("old-1", "row");
    await harness.actions.restart("old-1");

    expect(shell.setScrollbackLimit).toHaveBeenCalledWith("new-1", 1024 * 1024);
    expect(shell.setScrollbackLimit).toHaveBeenCalledWith("restart-1", 1024 * 1024);
    // The same registered session starts again; nothing is ended.
    expect(launcher.restart).toHaveBeenCalledWith("reg-old-1");
    expect(launcher.close).not.toHaveBeenCalled();
    expect(harness.state.perSession["restart-1"]?.registryId).toBe("reg-old-1");
    expect(harness.sessions["old-1"]).toBeUndefined();
    expect(harness.state.perSession["old-1"]).toBeUndefined();
  });

  it("returns the spawned session id when running a command", async () => {
    const { shell, launcher } = makeBackend();
    const harness = makeHarness(shell, launcher, {
      tree: { kind: "leaf", sessionId: "old-1" },
      focusedSessionId: "old-1",
    }, { "old-1": session("old-1", "/repo") });

    const sessionId = await harness.actions.runCommand("pnpm dev");

    expect(sessionId).toBe("new-1");
    expect(launcher.open).toHaveBeenCalledWith({
      command: "/bin/sh",
      args: ["-c", "pnpm dev"],
      label: "pnpm dev",
      cwd: "/repo",
    });
  });

  it("uses live shell integration cwd when splitting or running a command", async () => {
    const { shell, launcher } = makeBackend();
    const harness = makeHarness(shell, launcher, {
      tree: { kind: "leaf", sessionId: "old-1" },
      focusedSessionId: "old-1",
    }, { "old-1": session("old-1", "/launch", { liveCwd: "/repo/live" }) });

    await harness.actions.runCommand("pnpm dev");

    expect(launcher.open).toHaveBeenCalledWith({
      command: "/bin/sh",
      args: ["-c", "pnpm dev"],
      label: "pnpm dev",
      cwd: "/repo/live",
    });
  });

  it("restarts the remembered command in the live shell integration cwd", async () => {
    const { shell, launcher } = makeBackend();
    const harness = makeHarness(shell, launcher, {
      tree: { kind: "leaf", sessionId: "old-1" },
      focusedSessionId: "old-1",
      perSession: {
        "old-1": {
          cwd: "/persisted",
          originalArgv: ["/bin/sh", "-c", "pnpm dev"],
          readCursor: 0,
          lastSeenAt: 0,
        },
      },
    }, { "old-1": session("old-1", "/launch", { liveCwd: "/repo/live" }) });

    await harness.actions.restartCommand("old-1");

    expect(launcher.open).toHaveBeenCalledWith({
      command: "/bin/sh",
      args: ["-c", "pnpm dev"],
      cwd: "/repo/live",
      label: "/bin/sh -c pnpm dev",
    });
  });


  it("remembers the shell-provided label for new sessions", async () => {
    const { shell, launcher } = makeBackend();
    const harness = makeHarness(shell, launcher);

    const sessionId = await harness.actions.openSession();

    expect(harness.state.perSession[sessionId]?.label).toBe("Label new-1");
  });

  it("reopens the remembered original command in place", async () => {
    const { shell, launcher } = makeBackend();
    const harness = makeHarness(shell, launcher, {
      tree: { kind: "leaf", sessionId: "old-1" },
      focusedSessionId: "old-1",
      perSession: {
        "old-1": {
          cwd: "/repo",
          originalArgv: ["/bin/sh", "-c", "pnpm dev"],
          readCursor: 0,
          lastSeenAt: 0,
        },
      },
    }, { "old-1": session("old-1", "/repo") });

    const sessionId = await harness.actions.restartCommand("old-1");

    expect(sessionId).toBe("new-1");
    expect(launcher.open).toHaveBeenCalledWith({
      command: "/bin/sh",
      args: ["-c", "pnpm dev"],
      cwd: "/repo",
      label: "/bin/sh -c pnpm dev",
    });
    expect(harness.state.tree).toEqual({ kind: "leaf", sessionId: "new-1" });
    expect(harness.state.focusedSessionId).toBe("new-1");
    expect(shell.dispose).toHaveBeenCalledWith("old-1");
    expect(harness.sessions["old-1"]).toBeUndefined();
    expect(harness.state.perSession["old-1"]).toBeUndefined();
  });

  it("opens a session in the chosen context", async () => {
    const { shell, launcher } = makeBackend();
    const harness = makeHarness(shell, launcher);

    await harness.actions.openSession(undefined, { contextId: "ctx-new" });

    expect(launcher.open).toHaveBeenCalledWith({ contextId: "ctx-new" });
  });

  it("ends a registered pane through the launch service, not the shell extension", () => {
    const { shell, launcher } = makeBackend();
    const harness = makeHarness(shell, launcher, {
      tree: { kind: "leaf", sessionId: "old-1" },
      focusedSessionId: "old-1",
      perSession: {
        "old-1": { cwd: "/repo", readCursor: 0, lastSeenAt: 0, registryId: "reg-1" },
      },
    }, { "old-1": session("old-1", "/repo") });

    harness.actions.closeSession("old-1");

    expect(launcher.close).toHaveBeenCalledWith("reg-1");
    expect(shell.kill).not.toHaveBeenCalled();
    expect(shell.dispose).not.toHaveBeenCalled();
  });

  it("records the registry id of a new pane", async () => {
    const { shell, launcher } = makeBackend();
    const harness = makeHarness(shell, launcher);
    const sessionId = await harness.actions.openSession();
    expect(harness.state.perSession[sessionId]?.registryId).toBe(`reg-${sessionId}`);
  });

  it("removes exited panes without sending another kill signal", () => {
    const { shell, launcher } = makeBackend();
    const harness = makeHarness(shell, launcher, {
      tree: { kind: "leaf", sessionId: "old-1" },
      focusedSessionId: "old-1",
      perSession: {
        "old-1": { cwd: "/repo", readCursor: 0, lastSeenAt: 0 },
      },
    }, { "old-1": session("old-1", "/repo", { alive: false, exit: { code: 0, at: 1 } }) });

    harness.actions.closeSession("old-1");

    expect(shell.kill).not.toHaveBeenCalled();
    expect(shell.dispose).toHaveBeenCalledWith("old-1");
    expect(harness.sessions["old-1"]).toBeUndefined();
    expect(harness.state.perSession["old-1"]).toBeUndefined();
    expect(harness.state.tree).toBeUndefined();
    expect(harness.state.focusedSessionId).toBeUndefined();
  });
});

function makeHarness(
  shell: ShellApi,
  launcher: TerminalLauncher,
  statePatch: Partial<TerminalState> = {},
  initialSessions: Record<string, SessionInfo> = {},
) {
  let state: TerminalState = { ...defaultTerminalState(), scrollbackBytes: 1024 * 1024, ...statePatch };
  let sessions: Record<string, SessionInfo> = initialSessions;
  const setState = (updater: (value: TerminalState) => TerminalState) => {
    state = updater(state);
  };
  const setSessions = (updater: (value: Record<string, SessionInfo>) => Record<string, SessionInfo>) => {
    sessions = updater(sessions);
  };
  return {
    get state() { return state; },
    get sessions() { return sessions; },
    actions: createPanelActions({ shell, launcher, state, sessions, setState, setSessions }),
  };
}

function makeBackend(): { shell: ShellApi; launcher: TerminalLauncher } {
  let nextId = 1;
  const sessions = new Map<string, SessionInfo>();
  const launcher: TerminalLauncher = {
    open: vi.fn(async (req: { cwd?: string }) => {
      const sessionId = `new-${nextId++}`;
      sessions.set(sessionId, session(sessionId, req?.cwd ?? "."));
      return { sessionId, registryId: `reg-${sessionId}` };
    }),
    restart: vi.fn(async (registryId: string) => {
      sessions.set("restart-1", session("restart-1", "/repo"));
      return { sessionId: "restart-1", registryId };
    }),
    resume: vi.fn(),
    close: vi.fn(async () => {}),
  };
  const shell = {
    get: vi.fn(async (sessionId: string) => {
      const info = sessions.get(sessionId) ?? session(sessionId, ".");
      sessions.set(sessionId, info);
      return info;
    }),
    dispose: vi.fn(async () => {}),
    setScrollbackLimit: vi.fn(),
    exec: vi.fn(),
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    list: vi.fn(),
    getSessionInfo: vi.fn(),
    watchSessionInfo: vi.fn(),
    attach: vi.fn(),
    awaitExit: vi.fn(),
    getScrollback: vi.fn(),
  } as unknown as ShellApi;
  return { shell, launcher };
}

function session(
  sessionId: string,
  cwd: string,
  patch: Partial<SessionInfo> & { liveCwd?: string } = {}
): SessionInfo {
  const { liveCwd, ...sessionPatch } = patch;
  return {
    sessionId,
    label: `Label ${sessionId}`,
    command: { argv: ["/bin/sh"], cwd },
    cols: 80,
    rows: 24,
    alive: true,
    detectedPorts: [],
    detectedUrls: [],
    lastActivityAt: Date.now(),
    bytesOut: 0,
    meta: liveCwd ? {
      [VSCODE_SHELL_INTEGRATION_META_KEY]: {
        status: "vscode",
        cwd: liveCwd,
        commandRunning: false,
        updatedAt: 1,
      },
    } : {},
    ...sessionPatch,
  };
}
