import type { Context } from "@panticonic/pi-chord";
import {
  LiveDoc,
  type Conversation,
  type Harness,
  type TaskId,
} from "@panticonic/pi-durable";

/** Join the canonical transition, then report only an actual continuation of its original inputs. */
export async function reprepareNativeCredentialGeneration(
  harness: Harness,
  conversation: Conversation,
  expectedTaskId: TaskId,
  context: Context,
): Promise<boolean> {
  const original = (await harness.snapshot(LiveDoc, conversation.id, context))
    ?.run;
  if (
    original?.taskId !== expectedTaskId ||
    !(await conversation.reprepare(expectedTaskId, context))
  )
    return false;
  return conversation.commit(async (tx) => {
    const run = (await tx.doc(LiveDoc, conversation.id)).run;
    if (
      !run ||
      run.taskId === expectedTaskId ||
      run.interruption ||
      !original.inputs.every((id) => run.inputs.includes(id))
    )
      return false;
    const task = await tx.task(run.taskId);
    return Boolean(
      task &&
      !task.abortRequested &&
      task.state.status !== "terminal" &&
      task.state.status !== "completing",
    );
  }, context);
}
