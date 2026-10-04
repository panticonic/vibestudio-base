import {mkdtemp, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
import {createModels, fauxProvider, fauxAssistantMessage, Type} from '@panticonic/pi-ai';
import {BACKGROUND_CONTEXT} from '@panticonic/pi-chord/context';
import {Harness, MemoryStorage, createRegistry, defineExtension, defineTool, bindReceipt, type Storage} from '@panticonic/pi-durable';
import {openNodeSqliteStorage} from '@panticonic/pi-durable/storage/sqlite/node';
import {createNativeConversationCancellation} from './native-conversation-cancellation.js';

const context = BACKGROUND_CONTEXT;
const sessions: Harness[] = [];
const scratch: string[] = [];
afterEach(async () => {
  const results = await Promise.allSettled(sessions.splice(0).map(h => h.close(context)));
  await Promise.all(scratch.splice(0).map(path => rm(path, {recursive: true, force: true})));
  for (const result of results) if (result.status === 'rejected') throw result.reason;
});
async function fixture(storage: Storage = new MemoryStorage()) {
  const models = createModels();
  const faux = fauxProvider(); models.setProvider(faux.provider);
  let harness!: Harness;
  let cancelled = 0;
  const cancellation = createNativeConversationCancellation(() => harness);
  const tool = defineTool({name: 'work', description: 'Owned pending work', parameters: Type.Object({}),
    execute: async (_args, api, ctx) => {
      const key = `work:${api.taskId}`;
      await api.commit(tx => bindReceipt(tx, key, 'owned-work'), ctx);
      return {wait: {kind: 'receipt' as const, key, binding: 'owned-work'}, continuation: {owned: true}};
    }, cancel: async () => {cancelled++; return {content: []};}});
  const registry = createRegistry();
  registry.install(defineExtension({name: 'cancellation', tasks: [cancellation.task], tools: [tool]}));
  async function open(next: Storage) {
    harness = await Harness.open(next, {models, registry}, context); sessions.push(harness);
  }
  await open(storage);
  const conversation = await harness.createConversation({ownership: {kind: 'ownerless'},
    agent: {model: {provider: 'faux', modelId: 'faux-1'}, tools: [tool]}}, context);
  async function start(target = conversation) {
    faux.setResponses([fauxAssistantMessage([{type: 'toolCall', id: crypto.randomUUID(), name: 'work', arguments: {}}], {stopReason: 'toolUse'})]);
    const input = await target.submit({type: 'input', content: 'Do work'}, context);
    await harness.runPass(context);
    return input;
  }
  return {conversation, cancellation, open, start, harness: () => harness, cancelled: () => cancelled};
}

describe('native exact conversation cancellation', () => {
  it('withdraws original queued inputs, joins original tools, and replay preserves a later assignment', async () => {
    const f = await fixture();
    const original = await f.start();
    const queued = await f.conversation.submit({type: 'input', content: 'queued original work', whenBusy: 'followUp'}, context);
    const taskId = await f.cancellation.admit(f.conversation, 'original-cancel-operation', context);
    await f.harness().waitForTask(taskId, context);
    expect((await queued.wait(context)).status).toBe('unanswered');
    expect((await original.wait(context)).status).toBe('unanswered');
    expect(f.cancelled()).toBe(1);
    const later = await f.start();
    expect(await f.cancellation.admit(f.conversation, 'original-cancel-operation', context)).toBe(taskId);
    await f.harness().waitForTask(taskId, context);
    expect((await later.status(context)).status).toBe('placed');
    expect(f.cancelled()).toBe(1);
    await f.conversation.abort(context);
  });

  it('retains exact cancellation admission through SQLite reopen and lost caller acknowledgement', async () => {
    const directory = await mkdtemp(join(process.cwd(), '.native-conversation-cancel-')); scratch.push(directory);
    const path = join(directory, 'state.sqlite');
    const f = await fixture(await openNodeSqliteStorage(path));
    await f.start();
    const taskId = await f.cancellation.admit(f.conversation, 'lost-ack-operation', context);
    await f.harness().waitForTask(taskId, context);
    await f.harness().close(context);
    await f.open(await openNodeSqliteStorage(path));
    const conversation = await f.harness().conversation(f.conversation.id, context);
    if (!conversation) throw new Error('Original conversation missing after reopen');
    const later = await f.start(conversation);
    expect(await f.cancellation.admit(conversation, 'lost-ack-operation', context)).toBe(taskId);
    await f.harness().waitForTask(taskId, context);
    expect((await later.status(context)).status).toBe('placed');
    expect(f.cancelled()).toBe(1);
    await conversation.abort(context);
  });
});
