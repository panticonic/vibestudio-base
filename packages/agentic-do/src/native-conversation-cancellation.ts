import type { Context } from '@panticonic/pi-chord';
import {
  defineDocFamily, defineTask, InboxDoc,
  type Conversation, type Harness, type RunningTask, type TaskId, type TaskRuntime,
} from '@panticonic/pi-durable';

type Input = { tasks: TaskId[] };
type State = { phase: 'cancel' };
const Admissions = defineDocFamily<{ taskId: TaskId<null> | null }, null>({
  kind: 'vibestudio.conversation-cancellation', version: 1, scope: 'conversation',
  family: true, history: 'latest', fork: 'initial',
  initial: () => ({taskId: null}), checkpointWhen: () => true,
});

/** A cancellation owns the work present at its admission, never later assignments. */
export function createNativeConversationCancellation(harness: () => Harness) {
  async function cancel(current: RunningTask<Input, State, null>,
    runtime: TaskRuntime<Input, State, null, object>, context: Context) {
    try {
      const marks = await Promise.allSettled(current.input.tasks.map(id => harness().abortTask(id, context)));
      const joined = await Promise.allSettled(current.input.tasks.map(id => harness().waitForTask(id, context)));
      const failures = [...marks, ...joined].flatMap(result => result.status === 'rejected' ? [result.reason] : []);
      if (failures.length) throw failures.length === 1 ? failures[0] : new AggregateError(failures, 'Owned cancellation failed');
      await runtime.commit(() => ({status: 'terminal', outcome: {status: 'completed', result: null}}), context);
    } catch (error) { await runtime.parkFailure(error, context); }
  }
  const task = defineTask<Input, State, null>({
    name: 'vibestudio.conversation-cancellation', version: 1,
    initial: () => ({phase: 'cancel'}), phases: {cancel}, abort: cancel,
  });
  return {
    task,
    admit(conversation: Conversation, operationId: string, context: Context): Promise<TaskId<null>> {
      if (!operationId) throw new Error('Cancellation requires its original operation identity');
      return conversation.commit(async tx => {
        const admission = await tx.doc(Admissions, conversation.id, operationId, null);
        if (admission.taskId !== null) return admission.taskId;
        const inbox = await tx.doc(InboxDoc, conversation.id);
        const queued = inbox.items.filter(item => item.mode !== 'write').map(item => item.id);
        const tasks: TaskId[] = [];
        let cursor;
        do {
          const page = await tx.scanTasks({conversationId: conversation.id, background: false}, 128, cursor);
          tasks.push(...page.items.filter(candidate => candidate.state.status !== 'terminal').map(candidate => candidate.id));
          cursor = page.next;
        } while (cursor);
        for (const id of queued) {
          const result = await tx.reviseQueuedInput(id, {kind: 'withdraw'});
          if (result !== 'withdrawn') throw new Error('Original queued cancellation admission changed');
        }
        admission.taskId = await tx.createTask(task, {tasks}, {
          conversationId: conversation.id, ownership: {kind: 'conversation'}, background: true,
        });
        return admission.taskId;
      }, context);
    },
  };
}
