/** Host evidence at the real driver boundary. Scores remain scores; only generated replies are action targets. */
export interface ModelExchange {
  schema: "natlang.model-exchange/1";
  kind: "generation" | "score";
  request: unknown;
  reply?: unknown;
  error?: { name: string; message: string };
  /** Original native gateway evidence, including failed/unnormalizable replies. */
  provider?: unknown;
}

export interface ModelCaptureSession {
  /** Snapshot of an explicitly pinned teacher for this capture attachment. */
  executorModel?: string;
  record(exchange: ModelExchange): Promise<void>;
  finish(): void;
}

export async function captureExchange<T>(
  kind: ModelExchange["kind"],
  request: unknown,
  execute: () => Promise<T>,
  record?: (exchange: ModelExchange) => void | Promise<void>,
  provider?: () => unknown
): Promise<T> {
  if (!record) return execute();
  const snapshot = structuredClone(request);
  let reply: T;
  try {
    reply = await execute();
  } catch (error) {
    await record({
      schema: "natlang.model-exchange/1",
      kind,
      request: snapshot,
      ...(provider?.() === undefined ? {} : { provider: structuredClone(provider!()) }),
      error: {
        name: error instanceof Error ? error.name : "Error",
        message: error instanceof Error ? error.message : String(error),
      },
    });
    throw error;
  }
  await record({
    schema: "natlang.model-exchange/1",
    kind,
    request: snapshot,
    reply: structuredClone(reply),
    ...(provider?.() === undefined ? {} : { provider: structuredClone(provider!()) }),
  });
  return reply;
}
