/** Full replacement observations attributed to an already admitted native model invocation. */
export type NativeModelStream = {
  kind: "native.model-stream";
  conversationId: number;
  taskId: number;
  attempt: number;
  cutoff: number;
  /** Actual committed transcript frontier on opening; recovery may have placed an interrupted partial. */
  frontier: number;
  phase: "running" | "cleared";
  message: { content: readonly unknown[] } | null;
};
function positiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? value
    : null;
}
export function readNativeModelStream(
  value: unknown,
): NativeModelStream | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if (data["kind"] !== "native.model-stream") return null;
  const conversationId = positiveInteger(data["conversationId"]);
  const taskId = positiveInteger(data["taskId"]);
  const attempt = positiveInteger(data["attempt"]);
  const cutoff = positiveInteger(data["cutoff"]);
  const frontier = positiveInteger(data["frontier"]);
  const phase = data["phase"];
  if (
    conversationId === null ||
    taskId === null ||
    attempt === null ||
    cutoff === null ||
    frontier === null ||
    (phase !== "running" && phase !== "cleared")
  )
    return null;
  let message: NativeModelStream["message"] = null;
  const original = data["message"];
  if (original !== null) {
    if (!original || typeof original !== "object" || Array.isArray(original))
      return null;
    const content = (original as Record<string, unknown>)["content"];
    if (!Array.isArray(content)) return null;
    message = { content };
  }
  if (phase === "cleared" && message !== null) return null;
  return {
    kind: "native.model-stream",
    conversationId,
    taskId,
    attempt,
    cutoff,
    frontier,
    phase,
    message,
  };
}
