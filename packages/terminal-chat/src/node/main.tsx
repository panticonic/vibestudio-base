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
  const runtime = new ChatRuntime(boot, {
    presentTitle: (title) => control(titleSequence(`${title} — Chat`)),
  });
  const input: InputSource = {
    subscribe(listener) {
      const onData = (chunk: string | Buffer) =>
        listener(typeof chunk === "string" ? chunk : chunk.toString("utf8"));
      stdin.on("data", onData);
      return () => {
        stdin.off("data", onData);
      };
    },
  };

  // Retain capture through joined runtime teardown, then restore the caller's console.
  const restoreConsole = captureConsole((level, text) => runtime.recordDiagnostic(level, text));
  let failure: unknown;
  let restore = () => {};
  try {
    signal?.throwIfAborted();
    await runtime.start();
    signal?.throwIfAborted();
    stdout.write(ALT_SCREEN_ON + ENTER_MODES);
    if (stdin.isTTY) stdin.setRawMode(true);
    stdin.setEncoding("utf8");
    stdin.resume();
    const instance = render(
      <TerminalChatApp
        runtime={runtime}
        input={input}
        control={control}
        approvalsKey={io.approvalsKey}
      />,
      {
        stdout,
        stdin,
        exitOnCtrlC: false,
        patchConsole: false,
      }
    );

    let restored = false;
    restore = () => {
      if (restored) return;
      restored = true;
      instance.unmount();
      if (stdin.isTTY) stdin.setRawMode(false);
      stdin.pause();
      stdout.write(LEAVE_MODES + ALT_SCREEN_OFF);
    };
    await new Promise<void>((resolve, reject) => {
      const finish = (error?: unknown) => {
        process.off("SIGHUP", stop);
        process.off("SIGTERM", stop);
        process.off("exit", restore);
        signal?.removeEventListener("abort", stop);
        restore();
        if (error !== undefined) reject(error);
        else resolve();
      };
      const stop = () => finish();
      process.once("SIGHUP", stop);
      process.once("SIGTERM", stop);
      process.once("exit", restore);
      signal?.addEventListener("abort", stop, { once: true });
      if (signal?.aborted) stop();
      void instance.waitUntilExit().then(
        () => finish(),
        (error: unknown) => finish(error)
      );
    });
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    try {
      const results = await Promise.allSettled([
        Promise.resolve().then(restore),
        runtime.dispose(),
      ]);
      const errors = results.flatMap((result) =>
        result.status === "rejected" ? [result.reason] : []
      );
      if (errors.length)
        throw new AggregateError(
          failure === undefined ? errors : [failure, ...errors],
          "Terminal chat cleanup failed",
          { cause: failure }
        );
    } finally {
      restoreConsole();
    }
  }
}

type Level = "debug" | "info" | "warn" | "error";

function captureConsole(sink: (level: Level, text: string) => void): () => void {
  const methods = {
    log: "info",
    info: "info",
    debug: "debug",
    warn: "warn",
    error: "error",
  } as const;
  const original = {
    log: console.log,
    info: console.info,
    debug: console.debug,
    warn: console.warn,
    error: console.error,
  };
  for (const [name, level] of Object.entries(methods) as Array<[keyof typeof methods, Level]>) {
    console[name] = (...args: unknown[]) => sink(level, args.map(format).join(" "));
  }
  return () => {
    Object.assign(console, original);
  };
}

function format(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Error) return value.stack ?? value.message;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
