/**
 * @workspace/terminal-app — the runtime of a terminal app: a panel hosted by
 * terminals (`terminal-apps/<name>`), run as a Node program in a workspace PTY
 * by the workspace's terminal launch service.
 *
 * ```ts
 * const app = await startTerminalApp();
 * // app.rpc: the app's own principal; app.state: its durable per-session state
 * ```
 *
 * The program draws on its terminal with ordinary escape sequences: OSC 2
 * titles, BEL / OSC 9 attention, OSC 8 links, OSC 52 copy, bracketed paste and
 * focus reports. The terminal it is shown in (the terminal browser, the
 * desktop terminal panel) turns them into tabs, badges and confirmations.
 */
import { connectTerminalApp, type TerminalAppConnection } from "./connect.js";
import { consumeTerminalLaunch, type TerminalAppLaunch } from "./launch.js";
import { sessionStateStore, type SessionStateStore } from "./state.js";

export { connectTerminalApp, type TerminalAppConnection } from "./connect.js";
export {
  consumeTerminalLaunch,
  TERMINAL_LAUNCH_ENV,
  TerminalLaunchError,
  type TerminalAppLaunch,
} from "./launch.js";
export { sessionStateStore, type SessionStateStore } from "./state.js";

export interface TerminalApp extends TerminalAppConnection {
  launch: TerminalAppLaunch;
  state: SessionStateStore;
}

/** Read the launch material, connect as the app's principal, and open its state. */
export async function startTerminalApp(options: { clientLabel?: string } = {}): Promise<TerminalApp> {
  const launch = consumeTerminalLaunch();
  const connection = await connectTerminalApp(launch, options);
  return { ...connection, launch, state: sessionStateStore(connection.rpc, launch.state) };
}
