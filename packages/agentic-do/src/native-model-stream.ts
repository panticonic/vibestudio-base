import { type Context } from "@panticonic/pi-chord";
import { BACKGROUND_CONTEXT } from "@panticonic/pi-chord/context";
import {
  LiveDoc,
  type Harness,
  type ModelRequestConnection,
  type ModelRequestTarget,
} from "@panticonic/pi-durable";
import {
  readNativeModelStream,
  type NativeModelStream,
} from "@workspace/agentic-protocol";

/** An activation-local observation of Pi's committed partial, never an answer or execution owner. */
export async function observeNativeModelStream(
  options: {
    harness: Harness;
    request: ModelRequestTarget;
    connection: ModelRequestConnection;
    send: (value: NativeModelStream, context: Context) => Promise<void>;
    report: (error: unknown) => void;
  },
  context: Context,
): Promise<ModelRequestConnection> {
  const { request, connection } = options;
  if (request.purpose !== "generation" || request.operation !== "stream")
    return connection;
  const controller = new AbortController();
  let closing = false;
  let failed = false;
  let sending: Promise<void> = Promise.resolve();
  let stopped: Promise<unknown> | undefined;
  let watch: Awaited<ReturnType<typeof acquire>>;
  let frontier: number;
  async function acquire() {
    return options.harness.watchDoc(LiveDoc, request.conversationId, context);
  }
  try {
    const conversation = await options.harness.conversation(
      request.conversationId,
      context,
    );
    if (!conversation)
      throw new Error("Native model stream has no original conversation");
    const latest = (await conversation.entries({}, 1, undefined, context))
      .items[0];
    if (!latest)
      throw new Error(
        "Native model stream has no original transcript frontier",
      );
    frontier = latest.id;
    watch = await acquire();
    if (!watch)
      throw new Error("Native model stream has no original live conversation");
  } catch (error) {
    try {
      await connection.close(BACKGROUND_CONTEXT);
    } catch (cleanup) {
      throw new AggregateError(
        [error, cleanup],
        "Native stream observation and provider release failed",
        { cause: error },
      );
    }
    throw error;
  }
  const observer = watch;
  const identity = {
    kind: "native.model-stream" as const,
    conversationId: request.conversationId,
    taskId: request.taskId,
    attempt: request.attempt,
    cutoff: request.cutoff,
    frontier,
  };
  function report(error: unknown) {
    if (failed) return;
    failed = true;
    // Signal transport loss ends this observation, not the provider or its durable answer debt.
    options.report(error);
    stopped ??= observer.stop();
  }
  function send(value: NativeModelStream, ctx: Context): Promise<void> {
    const flight = sending.then(async () => {
      if (failed) return;
      try {
        await options.send(
          value,
          value.phase === "cleared"
            ? ctx
            : {
                ...ctx,
                abortSignal: ctx.abortSignal
                  ? AbortSignal.any([ctx.abortSignal, controller.signal])
                  : controller.signal,
              },
        );
      } catch (error) {
        if (closing && controller.signal.aborted) return;
        report(error);
      }
    });
    sending = flight;
    return flight;
  }
  function observe(value: typeof observer.value, ctx: Context): Promise<void> {
    if (closing || failed) return Promise.resolve();
    if (
      value?.run?.taskId !== request.taskId ||
      value.generation?.attempt !== request.attempt
    )
      return Promise.resolve();
    const partial = readNativeModelStream({
      ...identity,
      phase: "running",
      message: value.generation.message ?? null,
    });
    if (!partial)
      throw new Error(
        "Committed native model partial has invalid presentation structure",
      );
    return send(partial, ctx);
  }
  // Enqueue acquisition before starting: later exact frames follow this same original request's frame.
  const initial = observe(observer.value, context);
  observer.start((value, _ops, ctx) => observe(value, ctx));
  void initial;
  let close: Promise<void> | undefined;
  return {
    ...connection,
    close: (ctx) =>
      (close ??= (async () => {
        closing = true;
        controller.abort(new Error("Native model stream observation closed"));
        const errors: unknown[] = [];
        try {
          await (stopped ??= observer.stop());
        } catch (error) {
          errors.push(error);
        }
        try {
          // Watch termination alone does not join a listener already performing a signal RPC.
          await sending;
          if (!failed)
            await send(
              { ...identity, phase: "cleared", message: null },
              BACKGROUND_CONTEXT,
            );
        } catch (error) {
          errors.push(error);
        }
        try {
          await connection.close(ctx);
        } catch (error) {
          errors.push(error);
        }
        if (errors.length === 1) throw errors[0];
        if (errors.length)
          throw new AggregateError(
            errors,
            "Native stream and provider release failed",
            { cause: errors[0] },
          );
      })()),
  };
}
