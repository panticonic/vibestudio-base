import type { Context } from "@panticonic/pi-chord";
import {
  AssistantEntry,
  defineDocFamily,
  defineTask,
  GenerationTask,
  type Conversation,
  type ConversationId,
  type EntryId,
  type SubmissionId,
  type TaskId,
} from "@panticonic/pi-durable";
import { classifyModelFailure } from "@workspace/agentic-core/model-failures";
import { recordNativeChannelInputAdmission } from "./native-channel-session.js";
import { recordNativeProductInput } from "./native-product-context.js";

type Input = {
  channelId: string;
  conversationId: ConversationId;
  entryId: EntryId;
  until: number;
};
type Checkpoint = { phase: "wait" | "submit" };
type Result = { submissionId: SubmissionId };
const Delivery = defineDocFamily<
  { taskId: TaskId<Result> | null; until: number | null },
  null
>({
  kind: "vibestudio.model-reset-delivery",
  version: 1,
  scope: "session",
  family: true,
  initial: () => ({ taskId: null, until: null }),
  checkpointWhen: () => true,
});
const requestId = (input: Pick<Input, "conversationId" | "entryId">) =>
  `model-reset:${input.conversationId}:${input.entryId}`;

export type NativeModelResetSchedule = {
  scheduled: boolean;
  wakeAt?: string;
  nativeTaskId?: number;
  reason?: string;
};

/** A provider's explicit deadline owns one finite fresh checkup delivery, never a revival of the failed run. */
export function createNativeModelReset(host: {
  conversation(channelId: string, context: Context): Promise<Conversation>;
}) {
  const task = defineTask<Input, Checkpoint, Result>({
    name: "vibestudio.model-reset",
    version: 1,
    initial: () => ({ phase: "wait" }),
    phases: {
      wait: async (current, runtime, context) => {
        await runtime.commit(
          () => ({
            status: "waiting",
            checkpoint: { phase: "submit" },
            condition: { kind: "time", until: current.input.until },
          }),
          context,
        );
      },
      submit: async (current, runtime, context) => {
        try {
          const conversation = await runtime.conversation(
            current.input.conversationId,
            context,
          );
          if (!conversation)
            throw new Error("Model reset lost its original owned conversation");
          const submission = await conversation.submit(
            {
              type: "input",
              requestId: requestId(current.input),
              whenBusy: "followUp",
              content: async (tx, id) => {
                await recordNativeChannelInputAdmission(
                  tx,
                  current.input.conversationId,
                  id,
                );
                await recordNativeProductInput(
                  tx,
                  id,
                  current.input.channelId,
                  {
                    origin: "agent-initiated",
                    interaction: {
                      source: "model-reset",
                      kind: "provider-deadline",
                      action: "carry-on",
                      targetId: String(current.input.entryId),
                    },
                  },
                );
                return "The provider reset deadline has arrived. Check this conversation and carry on with outstanding work.";
              },
            },
            context,
          );
          await runtime.commit(
            () => ({
              status: "terminal",
              outcome: {
                status: "completed",
                result: { submissionId: submission.id },
              },
            }),
            context,
          );
        } catch (error) {
          if (runtime.signal.aborted) throw error;
          // An uncertain admission retains this same task and request ID for exact repair.
          await runtime.parkFailure(error, context);
        }
      },
    },
    abort: async (current, runtime, context) => {
      await runtime.commit(async (tx) => {
        const accepted = await tx.submissionByRequest(
          current.input.conversationId,
          requestId(current.input),
        );
        return accepted
          ? {
              status: "terminal",
              outcome: {
                status: "completed",
                result: { submissionId: accepted.id },
              },
            }
          : { status: "terminal", outcome: { status: "aborted" } };
      }, context);
    },
  });

  return {
    task,
    async schedule(
      channelId: string,
      source: { entryId: EntryId; resetAt: string },
      context: Context,
    ): Promise<NativeModelResetSchedule> {
      const until = Date.parse(source.resetAt);
      if (!Number.isFinite(until))
        return { scheduled: false, reason: "Invalid provider reset deadline" };
      const conversation = await host.conversation(channelId, context);
      return conversation.commit(
        async (tx): Promise<NativeModelResetSchedule> => {
          const entry = await tx.entry(AssistantEntry, source.entryId);
          const message = entry?.model?.[0];
          if (
            !entry ||
            entry.conversationId !== conversation.id ||
            entry.byTaskId === undefined ||
            message?.role !== "assistant" ||
            message.stopReason !== "error"
          )
            return {
              scheduled: false,
              reason:
                "No original failed model response in this owned conversation",
            };
          const generation = await tx.task(entry.byTaskId);
          if (
            !generation ||
            generation.kind !== GenerationTask.definition.name ||
            generation.conversationId !== conversation.id ||
            generation.state.status !== "terminal" ||
            generation.state.outcome.status !== "failed"
          )
            return {
              scheduled: false,
              reason: "The original model run has not failed terminally",
            };
          if (!Number.isFinite(message.timestamp))
            return {
              scheduled: false,
              reason: "Failed response has no original timestamp",
            };
          const failure = classifyModelFailure({
            provider: message.provider,
            model: message.model,
            message: message.errorMessage,
            now: new Date(message.timestamp).toISOString(),
          });
          if (!failure.resetAt || Date.parse(failure.resetAt) !== until)
            return {
              scheduled: false,
              reason: "Deadline does not match the actual provider failure",
            };
          const delivery = await tx.doc(
            Delivery,
            requestId({ conversationId: conversation.id, entryId: entry.id }),
            null,
          );
          if (delivery.until !== null && delivery.until !== until)
            throw new Error(
              "Model reset changed its original provider deadline",
            );
          if (delivery.taskId !== null) {
            const accepted = await tx.task(delivery.taskId);
            if (!accepted || accepted.kind !== task.definition.name)
              throw new Error(
                "Model reset lost its original native delivery task",
              );
            if (accepted.state.status === "terminal")
              return {
                scheduled: false,
                nativeTaskId: accepted.id,
                reason:
                  accepted.state.outcome.status === "completed"
                    ? "The provider checkup has already been delivered"
                    : "The original provider checkup is no longer scheduled",
              };
          }
          if (delivery.taskId === null) {
            delivery.until = until;
            delivery.taskId = await tx.createTask(
              task,
              {
                channelId,
                conversationId: conversation.id,
                entryId: entry.id,
                until,
              },
              {
                conversationId: conversation.id,
                ownership: { kind: "conversation" },
                background: true,
              },
            );
          }
          return {
            scheduled: true,
            wakeAt: new Date(until).toISOString(),
            nativeTaskId: delivery.taskId,
          };
        },
        context,
      );
    },
  };
}
