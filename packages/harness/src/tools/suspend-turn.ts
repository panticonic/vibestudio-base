import { Type, type Static } from "@panticonic/pi-ai";
import type { ToolRegistration } from "@panticonic/pi-durable";

export const suspendTurnParameters = Type.Object(
  {
    reason: Type.Optional(
      Type.Union([
        Type.Literal("waiting_for_background"),
        Type.Literal("not_addressed"),
        Type.Literal("already_handled"),
        Type.Literal("no_foreground_work"),
      ]),
    ),
    noteToSelf: Type.Optional(
      Type.String({
        description:
          "Optional private rationale for why this turn is being suspended without a visible response.",
      }),
    ),
  },
  { additionalProperties: false },
);

export type SuspendTurnInput = Static<typeof suspendTurnParameters>;
export type NativeSuspendTurnExecution = Required<
  Pick<ToolRegistration<typeof suspendTurnParameters>, "execute" | "cancel">
>;

export interface SuspendTurnToolOptions {
  /** The owner parks on an actual lifecycle-owned readiness condition. */
  execution: NativeSuspendTurnExecution;
}

export function createSuspendTurnTool(
  options: SuspendTurnToolOptions,
): ToolRegistration<typeof suspendTurnParameters> {
  return {
    name: "suspend_turn",
    description:
      "Suspend this agent turn without a visible assistant response. Use when the latest activity is for another agent, has already been handled, or when background work is running and you have no useful foreground work left. The runtime will wake the open turn on later user input or background results; do not poll while suspended.",
    parameters: suspendTurnParameters,
    execute: options.execution.execute,
    cancel: options.execution.cancel,
  };
}
