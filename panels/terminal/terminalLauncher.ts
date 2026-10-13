import type { TerminalSessionEntry } from "@vibestudio/shared/terminalSessions";

/** What a pane runs: the person's login shell, or `command` with `args`. */
export interface ShellOpenRequest {
  command?: string;
  args?: string[];
  cwd?: string;
  label?: string;
  contextId?: string;
}

/** A pane's session: its PTY in the shell extension and its entry in the person's registry. */
export interface OpenedSession {
  /** The PTY's shell-extension session id (what the pane attaches to). */
  sessionId: string;
  /** The registry id the terminal launch service knows the session by. */
  registryId: string;
}

/**
 * The panel's one way to start, relaunch and end terminal sessions: the
 * workspace's terminal launch service (`terminalApps`), the per-person registry
 * the terminal browser lists too. A pane is the PTY of a registered session;
 * the panel attaches to it, types into it and resizes it through the shell
 * extension, but never creates or destroys one there.
 */
export interface TerminalLauncher {
  open(request: ShellOpenRequest): Promise<OpenedSession>;
  /** Start the registered session's program again (when it is not running) in a new PTY. */
  resume(registryId: string): Promise<OpenedSession>;
  /** Stop the session's program and start it again in a new PTY, in the same session. */
  restart(registryId: string): Promise<OpenedSession>;
  /** End the session for good: its program stops and the registry forgets it. */
  close(registryId: string): Promise<void>;
}

export interface TerminalLauncherPorts {
  launch(request: ShellOpenRequest & { cols: number; rows: number }): Promise<TerminalSessionEntry>;
  resume(request: { sessionId: string; cols: number; rows: number }): Promise<TerminalSessionEntry>;
  restart(request: { sessionId: string; cols: number; rows: number }): Promise<TerminalSessionEntry>;
  close(sessionId: string): Promise<void>;
  /** The panel's own context: where a pane with no chosen context works. */
  contextId?: string;
}

/** Size of a pane before it is attached; the attach resizes the PTY to the pane. */
const INITIAL_SIZE = { cols: 80, rows: 24 };

function opened(entry: TerminalSessionEntry): OpenedSession {
  if (!entry.shellSessionId) throw new Error("The terminal session did not start a shell");
  return { sessionId: entry.shellSessionId, registryId: entry.sessionId };
}

export function createTerminalLauncher(ports: TerminalLauncherPorts): TerminalLauncher {
  return {
    async open(request) {
      const contextId = request.contextId ?? ports.contextId;
      return opened(
        await ports.launch({
          ...request,
          ...(contextId ? { contextId } : {}),
          ...INITIAL_SIZE,
        })
      );
    },
    async resume(registryId) {
      return opened(await ports.resume({ sessionId: registryId, ...INITIAL_SIZE }));
    },
    async restart(registryId) {
      return opened(await ports.restart({ sessionId: registryId, ...INITIAL_SIZE }));
    },
    close: (registryId) => ports.close(registryId),
  };
}
