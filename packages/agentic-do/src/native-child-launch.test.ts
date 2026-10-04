import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createModels, fauxProvider, Type } from '@panticonic/pi-ai';
import { BACKGROUND_CONTEXT } from '@panticonic/pi-chord/context';
import { Harness, MemoryStorage, createRegistry, defineExtension, defineTool, type Storage } from '@panticonic/pi-durable';
import { openNodeSqliteStorage } from '@panticonic/pi-durable/storage/sqlite/node';
import { createNativeChildLaunch, type NativeChildLaunchIntent } from './native-child-launch.js';

const context = BACKGROUND_CONTEXT;
const sessions: Harness[] = [];
const scratch: string[] = [];
afterEach(async () => {
  const closed = await Promise.allSettled(sessions.splice(0).map(session => session.close(context)));
  await Promise.all(scratch.splice(0).map(path => rm(path, {recursive: true, force: true})));
  for (const result of closed) if (result.status === 'rejected') throw result.reason;
});

async function fixture(storage: Storage = new MemoryStorage()) {
  const models = createModels();
  const faux = fauxProvider();
  models.setProvider(faux.provider);
  let prepares = 0;
  const launches: NativeChildLaunchIntent[] = [];
  const cleaned: NativeChildLaunchIntent[] = [];
  const admitted = new Set<string>();
  const lostReply = new Error('Original child provisioning reply lost after acceptance');
  const cleanupFailure = new Error('Original owned child retirement failed');
  let failLaunch = true;
  let failCleanup = false;
  let originalModel = 'original-provider:model';
  let harness!: Harness;
  const launch = createNativeChildLaunch({
    prepare: async (_args, api) => {
      prepares++;
      return {kind: 'vibestudio.child-launch', taskId: api.taskId, conversationId: api.conversationId,
        invocationId: 'actual-original-invocation', channelId: 'parent-channel',
        targetKey: 'subagent:original', childContextId: 'original-child-context', taskChannelId: 'original-task-channel',
        prepared: {model: originalModel, task: 'original task'}};
    },
    launch: async intent => {
      launches.push(intent);
      admitted.add(intent.childContextId);
      if (failLaunch) throw lostReply;
      return {content: [{type: 'text', text: 'accepted'}], details: {contextId: intent.childContextId}};
    },
    cleanup: async intent => {
      cleaned.push(intent);
      if (failCleanup) throw cleanupFailure;
      admitted.delete(intent.childContextId);
    },
  });
  const tool = defineTool({name: 'spawn_subagent', description: 'Owned child launch',
    parameters: Type.Object({}), execute: launch.execute, cancel: launch.cancel});
  const registry = createRegistry();
  registry.install(defineExtension({name: 'child-launch', tools: [tool]}));
  async function open(next: Storage) {
    harness = await Harness.open(next, {models, registry}, context);
    sessions.push(harness);
  }
  await open(storage);
  const conversation = await harness.createConversation({ownership: {kind: 'ownerless'},
    agent: {model: {provider: 'faux', modelId: 'faux-1'}, tools: [tool]}}, context);
  const taskId = await conversation.invokeTool({id: 'original-call', name: tool.name, arguments: {}}, context);
  return {taskId, conversation, open, harness: () => harness, launches, cleaned, admitted,
    prepares: () => prepares, modelCalls: () => faux.state.callCount, lostReply, cleanupFailure,
    allowLaunch: () => {failLaunch = false;},
    setModel: (value: string) => {originalModel = value;},
    failCleanup: (value: boolean) => {failCleanup = value;}};
}

describe('native child launch ownership', () => {
  it('retains actual provisioning acceptance across SQLite reopen without changing the original plan', async () => {
    const directory = await mkdtemp(join(process.cwd(), '.native-child-launch-'));
    scratch.push(directory);
    const path = join(directory, 'state.sqlite');
    const f = await fixture(await openNodeSqliteStorage(path));
    await expect(f.harness().waitForTask(f.taskId, context)).rejects.toBe(f.lostReply);
    const task = await f.harness().getTask(f.taskId, context);
    if (task?.state.status !== 'waiting' || task.state.condition.kind !== 'failure')
      throw new Error('Child launch has no actual retained failure incident');
    await f.harness().close(context);
    f.setModel('changed-provider:model');
    f.allowLaunch();
    await f.open(await openNodeSqliteStorage(path));
    await f.harness().retryTask(f.taskId, task.state.condition.incident, context);
    expect((await f.harness().waitForTask(f.taskId, context)).state.outcome.status).toBe('completed');
    expect(f.prepares()).toBe(1);
    expect(f.launches).toEqual([f.launches[0], f.launches[0]]);
    expect(f.launches[1]?.prepared).toEqual({model: 'original-provider:model', task: 'original task'});
    expect([...f.admitted]).toEqual(['original-child-context']);
    expect(f.modelCalls()).toBe(0);
  });

  it('cancellation joins only the originally admitted child and retains the original cleanup failure', async () => {
    const f = await fixture();
    await expect(f.harness().waitForTask(f.taskId, context)).rejects.toBe(f.lostReply);
    f.admitted.add('independent-sibling');
    f.failCleanup(true);
    await expect(f.conversation.abort(context)).rejects.toBe(f.cleanupFailure);
    const task = await f.harness().getTask(f.taskId, context);
    if (task?.state.status !== 'waiting' || task.state.condition.kind !== 'failure')
      throw new Error('Child cleanup has no actual retained native incident');
    expect(task.abortRequested).toBe(true);
    expect([...f.admitted]).toEqual(['original-child-context', 'independent-sibling']);
    f.failCleanup(false);
    await f.harness().retryTask(f.taskId, task.state.condition.incident, context);
    expect((await f.harness().waitForTask(f.taskId, context)).state.outcome.status).toBe('aborted');
    expect([...f.admitted]).toEqual(['independent-sibling']);
    expect(f.cleaned).toEqual([f.launches[0], f.launches[0]]);
    expect(f.launches).toHaveLength(1);
  });
});
