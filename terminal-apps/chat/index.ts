/**
 * The terminal chat as a terminal app: connect as this session's own
 * principal, keep the chat's host state in the session's stateArgs, and run
 * the Ink chat on the PTY until the person quits or the terminal goes away.
 */
import { startTerminalApp, TerminalLaunchError } from "@workspace/terminal-app";
import { nodeChatFiles, runTerminalChat } from "@workspace/terminal-chat";

async function main(): Promise<number> {
  let app;
  try {
    app = await startTerminalApp({ clientLabel: "Vibestudio terminal chat" });
  } catch (error) {
    const message =
      error instanceof TerminalLaunchError
        ? error.message
        : `The chat could not connect to this workspace: ${error instanceof Error ? error.message : String(error)}`;
    process.stderr.write(`\n  ${message}\n\n`);
    return 1;
  }
  try {
    await runTerminalChat(
      {
        rpc: app.rpc,
        contextId: app.launch.contextId,
        sessionId: app.launch.sessionId,
        state: app.state,
        files: nodeChatFiles(process.cwd()),
      },
      {
        stdin: process.stdin,
        stdout: process.stdout,
        ...(app.launch.approvalsKey ? { approvalsKey: app.launch.approvalsKey } : {}),
      }
    );
    return 0;
  } finally {
    await app.close();
  }
}

// The program ends with its session: nothing it started may keep it alive.
process.exit(await main());
