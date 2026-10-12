/**
 * The terminal chat as a Node program on a real terminal. The launcher passes
 * a `TerminalChatBootstrap` (connection, state store, files); this module owns
 * the terminal: raw mode, the alternate screen, bracketed paste and focus
 * reporting, and restoring all of it on every exit path.
 */
import { render } from "ink";
import { TerminalChatApp } from "../app/App.js";
import { ChatRuntime } from "../runtime/chatRuntime.js";
import type { TerminalChatBootstrap } from "../runtime/bootstrap.js";
import { ENTER_MODES, LEAVE_MODES, titleSequence } from "../terminal/escapes.js";
import type { InputSource } from "../ui/hooks.js";

export interface TerminalChatIo {
  stdin: NodeJS.ReadStream;
  stdout: NodeJS.WriteStream;
  /** How the terminal opens its approvals overlay (shown in approval cards). */
  approvalsKey?: string;
}

const ALT_SCREEN_ON = "\x1b[?1049h";
const ALT_SCREEN_OFF = "\x1b[?1049l";

/** Run the chat until the terminal goes away (SIGHUP/SIGTERM) or `signal` aborts. */
export async function runTerminalChat(
  boot: TerminalChatBootstrap,
  io: TerminalChatIo = { stdin: process.stdin, stdout: process.stdout },
  signal?: AbortSignal
): Promise<void> {
  const { stdin, stdout } = io;
  const control = (sequence: string) => stdout.write(sequence);
  const runtime = new ChatRuntime(boot, { presentTitle: (title) => control(titleSequence(`${title} — Chat`)) });
  const input: InputSource = {
    subscribe(listener) {
      const onData = (chunk: string | Buffer) => listener(typeof chunk === "string" ? chunk : chunk.toString("utf8"));
      stdin.on("data", onData);
      return () => {
        stdin.off("data", onData);
      };
    },
  };

  stdout.write(ALT_SCREEN_ON + ENTER_MODES);
  if (stdin.isTTY) stdin.setRawMode(true);
  stdin.setEncoding("utf8");
  stdin.resume();
  runtime.start();
  const instance = render(<TerminalChatApp runtime={runtime} input={input} control={control} approvalsKey={io.approvalsKey} />, {
    stdout,
    stdin,
    exitOnCtrlC: false,
    patchConsole: false,
    incrementalRendering: true,
  });

  let restored = false;
  const restore = () => {
    if (restored) return;
    restored = true;
    instance.unmount();
    runtime.dispose();
    if (stdin.isTTY) stdin.setRawMode(false);
    stdin.pause();
    stdout.write(LEAVE_MODES + ALT_SCREEN_OFF);
  };
  await new Promise<void>((resolve) => {
    const finish = () => {
      process.off("SIGHUP", finish);
      process.off("SIGTERM", finish);
      process.off("exit", restore);
      signal?.removeEventListener("abort", finish);
      restore();
      resolve();
    };
    process.once("SIGHUP", finish);
    process.once("SIGTERM", finish);
    process.once("exit", restore);
    signal?.addEventListener("abort", finish, { once: true });
    void instance.waitUntilExit().then(finish, finish);
  });
}
