/** Host evidence at the real driver boundary. Scores remain scores; only generated replies are action targets. */
export interface ModelExchange {
  schema: "natlang.model-exchange/1";
  kind: "generation" | "score";
  request: unknown;
  reply?: unknown;
  error?: { name: string; message: string };
}

export async function captureExchange<T>(
  kind: ModelExchange["kind"], request: unknown, execute: () => Promise<T>,
  record?: (exchange: ModelExchange) => void
): Promise<T> {
  if (!record) return execute();
  const snapshot = structuredClone(request);
  let reply: T;
  try { reply = await execute(); }
  catch (error) {
    record({ schema: "natlang.model-exchange/1", kind, request: snapshot,
      error: { name: error instanceof Error ? error.name : "Error", message: error instanceof Error ? error.message : String(error) } });
    throw error;
  }
  record({ schema: "natlang.model-exchange/1", kind, request: snapshot, reply: structuredClone(reply) });
  return reply;
}
