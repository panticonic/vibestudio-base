import type { JsonValue } from "@panticonic/pi-chord";
import {
  BACKGROUND_CONTEXT,
  withAbortSignal,
} from "@panticonic/pi-chord/context";
import {
  createRegistry,
  type ConversationId,
  type TaskId,
  type ToolExecutionApi,
  type ToolExecutionResult,
  type ToolRegistration,
} from "@panticonic/pi-durable";
import { createModels, type Static, type TSchema } from "@panticonic/pi-ai";

export interface NativeToolTestOptions<TDetails extends JsonValue> {
  callId?: string;
  signal?: AbortSignal;
  onDetails?: (details: TDetails) => void | Promise<void>;
  onOutput?: (chunk: string | Uint8Array) => void;
}

/** Unit fixture for portable tools. Persistence tests must use a real Harness. */
export function nativeToolApi<TDetails extends JsonValue>(
  options: NativeToolTestOptions<TDetails> = {},
): ToolExecutionApi<TDetails> {
  const unavailable = (): never => {
    throw new Error(
      "This native tool unit fixture has no durable owner; use a real Harness",
    );
  };
  const outputChunks: Uint8Array[] = [];
  const retainedOutput = () => {
    const bytes = new Uint8Array(outputChunks.reduce((size, chunk) => size + chunk.byteLength, 0));
    let offset = 0;
    for (const chunk of outputChunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { text: new TextDecoder().decode(bytes), truncated: false };
  };
  return {
    taskId: 1 as TaskId,
    conversationId: 1 as ConversationId,
    callId: options.callId ?? "test:call",
    continuation: undefined,
    executionData: undefined,
    registry: createRegistry().snapshot(),
    models: createModels(),
    env: undefined,
    outputWindow: undefined,
    agent: unavailable,
    output: (chunk) => {
      outputChunks.push(typeof chunk === "string" ? new TextEncoder().encode(chunk) : chunk.slice());
      options.onOutput?.(chunk);
    },
    retainedOutput,
    diagnostic: () => undefined,
    details: async (details, context) => {
      context.abortSignal?.throwIfAborted();
      await options.onDetails?.(details);
    },
    commit: unavailable,
    retainContinuation: unavailable,
    memo: unavailable,
    createTask: unavailable,
    getTask: unavailable,
    waitForTask: unavailable,
    executeTool: unavailable,
    conversation: unavailable,
    snapshot: unavailable,
    snapshotAsOf: unavailable,
    watchDoc: unavailable,
  };
}

export function nativeToolContext(signal?: AbortSignal) {
  return signal
    ? withAbortSignal(signal, BACKGROUND_CONTEXT)
    : BACKGROUND_CONTEXT;
}

export function toolResultDetails<TDetails extends JsonValue>(
  result: ToolExecutionResult<TDetails>,
): TDetails {
  if (result.details === undefined)
    throw new Error("Expected native tool result details");
  return result.details;
}

export function toolText(result: ToolExecutionResult, index = 0): string {
  const content = result.output?.[index];
  if (content?.type !== "text")
    throw new Error("Expected native text tool output");
  return content.text;
}

/** Execute an ordinary portable native tool; waits belong in owner integration tests. */
export async function executeTool<
  TParameters extends TSchema,
  TDetails extends JsonValue,
>(
  tool: ToolRegistration<TParameters, TDetails>,
  args: Static<TParameters>,
  options: NativeToolTestOptions<TDetails> = {},
): Promise<
  ToolExecutionResult<TDetails> & {
    output: NonNullable<ToolExecutionResult<TDetails>["output"]>;
  }
> {
  const api = nativeToolApi(options);
  const result = await tool.execute(
    args,
    api,
    nativeToolContext(options.signal),
  );
  if ("wait" in result)
    throw new Error(
      "Portable tool unit test unexpectedly parked; use a native owner integration test",
    );
  const retained = api.retainedOutput().text;
  return { ...result, output: result.output ?? (retained === "" ? [] : [{ type: "text", text: retained }]) };
}
