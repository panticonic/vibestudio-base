import {
  defineDoc,
  type HarnessCommit,
  type TaskId,
  type TaskWaitCondition,
  type Tx,
} from "@panticonic/pi-durable";
import { copyJson, type JsonValue } from "@panticonic/pi-chord";
import { canonicalJson } from "@vibestudio/shared/canonicalJson";
import type { TurnReasonCode } from "@workspace/agentic-protocol";

export type NativeWaitNotice = {
  reason: TurnReasonCode;
  summary: string;
};
// Presentation of the exact wait requested by its owner, never a readiness or execution owner.
const WaitPresentation = defineDoc<{
  condition: JsonValue | null;
  notice: NativeWaitNotice | null;
}>({
  kind: "vibestudio.native-wait-presentation",
  version: 1,
  scope: "task",
  initial: () => ({ condition: null, notice: null }),
  checkpointWhen: () => true,
});

export async function recordNativeWaitPresentation(
  tx: Tx,
  taskId: TaskId,
  condition: TaskWaitCondition,
  notice: NativeWaitNotice,
): Promise<void> {
  const state = await tx.doc(WaitPresentation, taskId);
  state.condition = copyJson(condition) as JsonValue;
  state.notice = notice;
}

/** Follow only the run's actual blocking dependencies; running work never becomes a guessed wait. */
export async function nativeRunWaitPresentation(
  tx: Tx,
  staged: HarnessCommit,
  taskId: TaskId,
  ancestors = new Set<TaskId>(),
): Promise<NativeWaitNotice | null> {
  if (ancestors.has(taskId))
    throw new Error("Native wait dependencies contain a cycle");
  const task = await staged.task(taskId);
  if (!task || task.abortRequested || task.state.status !== "waiting")
    return null;
  const state = await tx.doc(WaitPresentation, taskId);
  if (
    state.notice &&
    canonicalJson(state.condition) === canonicalJson(task.state.condition)
  )
    return state.notice;
  if (task.state.condition.kind !== "tasks") return null;
  const path = new Set([...ancestors, taskId]);
  const notices: (NativeWaitNotice | null)[] = [];
  for (const id of task.state.condition.on) {
    const dependency = await staged.task(id);
    if (!dependency)
      throw new Error("Native wait lost its blocking dependency");
    if (dependency.state.status === "terminal") continue;
    notices.push(await nativeRunWaitPresentation(tx, staged, id, path));
  }
  // A parallel wave still doing work is active, even if another member awaits input.
  return notices.length > 0 && notices.every(Boolean) ? notices[0]! : null;
}
