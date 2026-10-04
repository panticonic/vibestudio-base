import type { ToolExecutionResult } from "@panticonic/pi-durable";
import {
  copyJson,
  type Context,
  type JsonRepresentation,
} from "@panticonic/pi-chord";
import { rpcErrorKindOf } from "@vibestudio/rpc";
import {
  type AgentToolFailure,
  agentToolFailureFromUnknown,
  renderAgentToolFailure,
} from "@workspace/agentic-protocol";

/** Call only after a definitive first-admission refusal, before any external
 * work is owned. Resumed/ambiguous work, infrastructure and cancellation keep
 * their actual Pi failure/abort lifecycle. */
export function nativeToolAdmissionRefusal(
  error: unknown,
  operation: string,
  context: Context,
):
  | ToolExecutionResult<{ failure: JsonRepresentation<AgentToolFailure> }>
  | undefined {
  if (context.abortSignal?.aborted) return undefined;
  const kind = rpcErrorKindOf(error, "internal");
  if (kind !== "access" && kind !== "application" && kind !== "service")
    return undefined;
  const failure = agentToolFailureFromUnknown(error, {
    operation,
    stage: "admission",
    ...(kind === "access" ? { kind: "authority" as const } : {}),
  });
  return {
    isError: true,
    content: [
      {
        type: "text",
        text:
          renderAgentToolFailure(failure) +
          (failure.data === undefined
            ? ""
            : "\nStructured failure:\n" + JSON.stringify(failure.data)),
      },
    ],
    details: {
      failure: copyJson(failure, {
        omitUndefinedProperties: true,
      }) as JsonRepresentation<AgentToolFailure>,
    },
  };
}
