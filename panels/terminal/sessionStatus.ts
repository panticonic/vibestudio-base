import type { SessionInfo } from "./types.js";
import { liveSessionCwd } from "./vscodeShellIntegrationMeta.js";

export function sessionExitText(session: Pick<SessionInfo, "alive" | "exit">): string | undefined {
  if (session.alive) return undefined;
  if (!session.exit) return "exited";
  if (session.exit.signal) return `exited by ${session.exit.signal}`;
  if (session.exit.code === null) return "exited";
  return `exited ${session.exit.code}`;
}

export function sessionEndedText(session: Pick<SessionInfo, "exit">): string {
  if (session.exit?.signal) return `Session ended (${session.exit.signal})`;
  if (session.exit && session.exit.code !== null) return `Session ended (exit ${session.exit.code})`;
  return "Session ended";
}

export function sessionFooterText(session: Pick<SessionInfo, "alive" | "exit" | "command" | "cols" | "rows" | "meta">): string {
  const exit = sessionExitText(session);
  const size = `${session.cols}x${session.rows}`;
  const cwd = liveSessionCwd(session) ?? session.command.cwd;
  return exit ? `${cwd} · ${size} · ${exit}` : `${cwd} · ${size}`;
}
