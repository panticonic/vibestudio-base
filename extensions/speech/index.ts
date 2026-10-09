import type { ExtensionContext } from "@vibestudio/extension";
import type { SpeechRecording, SpeechEvent } from "@workspace/speech";
import { SpeechRuntime } from "./runtime.js";

let runtime: SpeechRuntime | null = null;
export function activate(ctx: ExtensionContext) {
  const owner = new SpeechRuntime(ctx.storage.root);
  runtime = owner;
  const streamOperation = (
    callerSignal: AbortSignal,
    operation: (
      owner: SpeechRuntime,
      signal: AbortSignal,
      emit: (event: SpeechEvent) => void,
    ) => Promise<void>,
  ): Response => {
    const cancellation = new AbortController();
    const caller = callerSignal;
    let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
    const abort = () => {
      cancellation.abort(caller.reason);
      controller?.error(caller.reason ?? new Error("Dictation cancelled"));
    };
    caller.addEventListener("abort", abort, { once: true });
    if (caller.aborted) abort();
    let work: Promise<void> = Promise.resolve();
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(stream) {
        controller = stream;
        if (cancellation.signal.aborted) {
          controller = null;
          caller.removeEventListener("abort", abort);
          stream.error(cancellation.signal.reason);
          return;
        }
        work = operation(owner, cancellation.signal, (event) => {
          if (!cancellation.signal.aborted)
            stream.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        })
          .then(
            () => {
              if (!cancellation.signal.aborted) stream.close();
            },
            (error: unknown) => {
              if (!cancellation.signal.aborted) stream.error(error);
            },
          )
          .finally(() => {
            controller = null;
            caller.removeEventListener("abort", abort);
          });
      },
      async cancel(reason) {
        controller = null;
        cancellation.abort(reason);
        await work;
      },
    });
    return new Response(body, {
      headers: { "content-type": "application/x-ndjson" },
    });
  };
  const signal = () => ctx.invocation.signal() ?? new AbortController().signal;
  return {
    status: () => owner.status(),
    prepare: () =>
      streamOperation(signal(), (owner, cancellation, emit) =>
        owner.prepare(cancellation, emit),
      ),
    transcribe: (recording: SpeechRecording) =>
      streamOperation(signal(), (owner, cancellation, emit) =>
        owner.transcribe(recording, cancellation, emit),
      ),
  };
}
export async function deactivate() {
  await runtime?.stop();
  runtime = null;
}
