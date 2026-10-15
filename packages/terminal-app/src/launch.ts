/**
 * The launch material a terminal app receives from the workspace's terminal
 * launch service. It arrives through a one-shot file named by the only launch
 * variable: the program reads it once and removes it before it connects, so
 * the connection grant lives only in this process's memory afterwards.
 *
 * Inside one native runtime, processes are not separate security domains
 * (docs/isolation-plan.md): this keeps a standing credential out of the
 * process environment (`/proc/<pid>/environ`) and the launch files on disk;
 * it is attribution, not isolation.
 */
import { readFileSync, rmSync } from "node:fs";

export const TERMINAL_LAUNCH_ENV = "VIBESTUDIO_TERMINAL_LAUNCH";

export interface TerminalAppLaunch {
  /** Gateway the program connects to (loopback inside the runtime). */
  gatewayUrl: string;
  /** The app's runtime principal: its RPC self id. */
  principalId: string;
  /** One-use connection grant for `principalId`. */
  grant: string;
  /** The connection id the launch service leased for this program. */
  connectionId: string;
  /** The terminal session (also the principal's instance key). */
  sessionId: string;
  /** The session's own workspace context. */
  contextId: string;
  /** Durable per-session state at launch. */
  state: Record<string, unknown>;
  /** The app's display title (approvals and runtime listings name it). */
  title: string;
  /** How the hosting terminal opens its approvals (shown to the person). */
  approvalsKey?: string;
}

export class TerminalLaunchError extends Error {
  readonly code = "ELAUNCH";
}

/**
 * Read and consume the launch material. Throws `TerminalLaunchError` with the
 * next step when the program was not started by the terminal launch service.
 */
export function consumeTerminalLaunch(env: NodeJS.ProcessEnv = process.env): TerminalAppLaunch {
  const file = env[TERMINAL_LAUNCH_ENV];
  if (!file) {
    throw new TerminalLaunchError(
      "This is a Vibestudio terminal app. Start it from the terminal browser's launcher (vibestudio terminal) or the desktop terminal panel."
    );
  }
  delete env[TERMINAL_LAUNCH_ENV];
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch {
    throw new TerminalLaunchError(
      "The launch material for this terminal app is gone (it can be used once). Start the app again from the launcher."
    );
  } finally {
    rmSync(file, { force: true });
  }
  const value = JSON.parse(raw) as Partial<TerminalAppLaunch>;
  for (const key of [
    "gatewayUrl",
    "principalId",
    "grant",
    "connectionId",
    "sessionId",
    "contextId",
  ] as const) {
    if (typeof value[key] !== "string" || !value[key]) {
      throw new TerminalLaunchError(`The terminal launch material is missing ${key}.`);
    }
  }
  return {
    gatewayUrl: value.gatewayUrl!,
    principalId: value.principalId!,
    grant: value.grant!,
    connectionId: value.connectionId!,
    sessionId: value.sessionId!,
    contextId: value.contextId!,
    state: value.state && typeof value.state === "object" ? value.state : {},
    title: typeof value.title === "string" && value.title ? value.title : "Terminal app",
    ...(typeof value.approvalsKey === "string" ? { approvalsKey: value.approvalsKey } : {}),
  };
}
