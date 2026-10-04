import { copyJson, type Context } from "@panticonic/pi-chord";
import {
  defineDocFamily,
  defineTask,
  type HarnessCommit,
  type RunningTask,
  type SettledSubmissionRecord,
  type TaskId,
  type TaskRuntime,
  type Tx,
} from "@panticonic/pi-durable";
import type { AgentProductMetadata } from "@workspace/agentic-core/agent-product-metadata";
import { nativeProductInput } from "./native-product-context.js";

type Input = {
  channelId: string;
  submission: SettledSubmissionRecord;
  metadata: AgentProductMetadata | null;
};
type Checkpoint = { phase: "notify" };
/** This link deduplicates delivery ownership; the native submission remains the status owner. */
const Delivery = defineDocFamily<{ taskId: TaskId | null }, null>({
  kind: "vibestudio.native-input-settlement-delivery",
  version: 1,
  scope: "session",
  family: true,
  initial: () => ({ taskId: null }),
  checkpointWhen: () => true,
});

/** Persist a product notification in the same batch as its real native input settlement. */
export function createNativeInputSettlement(options: {
  readonly onSettled: (
    channelId: string,
    submission: SettledSubmissionRecord,
    metadata: AgentProductMetadata | undefined,
    context: Context,
  ) => Promise<void>;
}) {
  async function notify(
    current: RunningTask<Input, Checkpoint, null>,
    rt: TaskRuntime<Input, Checkpoint, null, object>,
    context: Context,
  ): Promise<void> {
    try {
      await options.onSettled(
        current.input.channelId,
        current.input.submission,
        current.input.metadata ?? undefined,
        context,
      );
      await rt.commit(
        () => ({
          status: "terminal",
          outcome: { status: "completed", result: null },
        }),
        context,
      );
    } catch (error) {
      await rt.parkFailure(error, context);
    }
  }
  const task = defineTask<Input, Checkpoint, null>({
    name: "vibestudio.input-settlement",
    version: 1,
    initial: () => ({ phase: "notify" }),
    phases: { notify },
    // Accepted product notification debt is drained by explicit retirement.
    // Ordinary owner close preserves the task for recovery.
    abort: notify,
  });
  return {
    task,
    async prepareCommit(tx: Tx, staged: HarnessCommit): Promise<void> {
      for (const submission of staged.submissions) {
        if (
          submission.type !== "input" ||
          (submission.status !== "done" && submission.status !== "unanswered")
        )
          continue;
        const product = await nativeProductInput(tx, submission.id);
        if (!product.channelId) continue;
        const delivery = await tx.doc(Delivery, String(submission.id), null);
        if (delivery.taskId !== null) continue;
        delivery.taskId = await tx.createTask(
          task,
          copyJson(
            {
              channelId: product.channelId,
              submission,
              metadata: product.metadata,
            },
            { omitUndefinedProperties: true },
          ) as unknown as Input,
          {
            conversationId: submission.conversationId,
            ownership: { kind: "conversation" },
            background: true,
          },
        );
      }
    },
  };
}
