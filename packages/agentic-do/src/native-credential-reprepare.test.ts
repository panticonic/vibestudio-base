import { afterEach, describe, expect, it } from "vitest";
import {
  createModels,
  fauxAssistantMessage,
  fauxProvider,
} from "@panticonic/pi-ai";
import { BACKGROUND_CONTEXT } from "@panticonic/pi-chord/context";
import {
  createRegistry,
  defineExtension,
  LiveDoc,
  MemoryStorage,
  type Harness,
  type ModelRequestTarget,
  type TaskId,
  type EntryId,
} from "@panticonic/pi-durable";
import { createMainRpcCaller } from "@vibestudio/service-schemas/mainRpc";
import {
  nativeInvocationId,
  type NativeInvocationSource,
} from "@vibestudio/service-schemas/nativeInvocation";
import { schemaRpcMock } from "@vibestudio/rpc/test-utils";
import { openPlatformAgentSession } from "./native-agent-session.js";
import { retainedAgentExecutionOwner } from "./native-agent-session.js";
import { notifyModelCredentialChange } from "./native-model-provider.js";
import { openNativeChannelConversation } from "./native-channel-session.js";
import { createNativeChannelPublication } from "./native-channel-publication.js";
import {
  readRetainedNativeInvocationSource,
  retainNativeModelInvocation,
} from "./native-invocation-source.js";
import {
  createNativeProductModelPolicy,
  type NativeProductModelSettings,
} from "./native-product-model-policy.js";
import {
  prepareNativeProductContexts,
  recordNativeProductInput,
} from "./native-product-context.js";

const context = BACKGROUND_CONTEXT;
const sessions: Harness[] = [];
afterEach(async () => {
  await Promise.all(
    sessions.splice(0).map((harness) => harness.close(context)),
  );
});
function gate() {
  let resolve!: () => void;
  const promise = new Promise<void>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

describe("native credential preparation ownership", () => {
  it.each([
    { delayed: false, missingAcceptance: false },
    { delayed: false, missingAcceptance: true },
    { delayed: false, missingAcceptance: "fractional" },
    { delayed: false, missingAcceptance: "negative" },
    { delayed: true, missingAcceptance: false },
  ])(
    "publishes only the current committed wait and owns replay/later identity (delayed=$delayed, missingAcceptance=$missingAcceptance)",
    async ({ delayed, missingAcceptance }) => {
      const owner = {
        runtimeId: "do:workers/agent:Agent:one",
        authoritySessionId: "lifetime:one",
        contextId: "context:one",
        incarnation: "storage:one",
      };
      const image = {
        runtimeId: owner.runtimeId,
        source: "workers/agent",
        className: "Agent",
        objectKey: "one",
        executionDigest: "a".repeat(64),
      };
      const before = fauxProvider({ provider: "before" });
      const after = fauxProvider({ provider: "after" });
      after.setResponses([
        fauxAssistantMessage("Original input answered with selected provider"),
      ]);
      const models = createModels();
      models.setProvider(before.provider);
      models.setProvider(after.provider);
      const policy = createNativeProductModelPolicy();
      const entered = gate(),
        park = gate(),
        published = gate(),
        failed = gate(),
        replayed = gate(),
        laterWait = gate();
      const releasePublications = gate(),
        admittedWait = gate(),
        readmittedWait = gate();
      let waitAdmissions = 0;
      const sources: NativeInvocationSource[] = [];
      const requests: ModelRequestTarget[] = [];
      let harness!: Harness;
      let cards = 0;
      const cardIds = new Set<string>();
      const deliveries: string[] = [];
      let failFirstDelivery = !delayed;
      let failedPublication!: { taskId: TaskId; incident: EntryId };
      const publication = createNativeChannelPublication({
        publish: async (_channel, _participant, event, idempotencyKey) => {
          if (delayed) await releasePublications.promise;
          if (event.kind === "ui.inline_rendered") {
            expect((event.payload as { id: string }).id).toBe(idempotencyKey);
            deliveries.push(idempotencyKey);
            cardIds.add(idempotencyKey);
            cards = cardIds.size;
            published.resolve();
            if (failFirstDelivery) {
              failFirstDelivery = false;
              if (missingAcceptance === "fractional") return { id: 1.5 };
              if (missingAcceptance === "negative") return { id: -1 };
              if (missingAcceptance) return {};
              throw new Error(
                "Channel accepted the card before its response was lost",
              );
            }
            if (cardIds.size === 1) replayed.resolve();
            else laterWait.resolve();
          }
          return { id: 1 };
        },
        credentialWaitEvent: async (_channel, wait, idempotencyKey) => {
          const task = await harness.getTask(wait.taskId, context);
          expect(task?.state).toMatchObject({
            status: "waiting",
            mode: "run",
            condition: {
              kind: "input",
              kinds: ["vibestudio.model-credential-change:before"],
            },
          });
          expect(wait.modelRef).toBe(`before:${before.getModel().id}`);
          return {
            kind: "ui.inline_rendered",
            actor: { kind: "agent", id: "one" },
            payload: {
              protocol: "agentic.trajectory.v1",
              uiType: "inline",
              id: idempotencyKey,
              source: {
                type: "file",
                path: "packages/agentic-chat/components/ModelCredentialRequiredCard.tsx",
              },
              props: { providerId: wait.providerId, modelRef: wait.modelRef },
            },
            createdAt: new Date().toISOString(),
          };
        },
      });
      const registry = createRegistry();
      const extension = defineExtension({
        name: "product",
        tasks: [publication.task],
        hooks: [policy.generationHooks],
      });
      registry.install(extension);
      harness = await openPlatformAgentSession(
        async () => new MemoryStorage(),
        image,
        {
          ...owner,
          generation: 1,
          executionDigest: image.executionDigest,
          effectiveVersion: "state:one",
        },
        createMainRpcCaller(
          schemaRpcMock({
            call: async (_target, method) => {
              if (method === "workspace-state.alarmSourcePublish")
                return "accepted";
              throw new Error(`Unexpected host method ${method}`);
            },
          }),
        ),
        {
          models,
          registry,
          prepareCommit: async (tx, staged) => {
            await prepareNativeProductContexts(tx, staged);
            await policy.prepareCommit(tx, staged);
            await publication.prepareCommit(tx, staged);
          },
          modelRequests: async (request, api, ctx) => {
            requests.push(request);
            sources.push(
              await retainNativeModelInvocation(
                harness,
                request,
                api,
                image,
                ctx,
              ),
            );
            if (request.model.provider === "before") {
              entered.resolve();
              await park.promise;
              const after = await api.commit(
                async (tx) =>
                  (
                    await tx.scanEntries(
                      { conversationId: request.conversationId },
                      1,
                    )
                  ).items[0]!.id,
                ctx,
              );
              return {
                status: "waiting",
                condition: {
                  kind: "input",
                  conversationId: request.conversationId,
                  after,
                  kinds: ["vibestudio.model-credential-change:before"],
                },
              };
            }
            return { status: "ready", options: {}, close: async () => {} };
          },
        },
        context,
      );
      sessions.push(harness);
      const stop = harness.subscribeCommits((commit) => {
        for (const change of commit.changes) {
          if (
            change.type === "task" &&
            change.value.kind === "pi.generation" &&
            change.value.state.status === "waiting" &&
            change.value.state.condition.kind === "input"
          ) {
            waitAdmissions++;
            if (waitAdmissions === 1) admittedWait.resolve();
            else readmittedWait.resolve();
          }
          if (
            change.type !== "task" ||
            change.value.kind !== "vibestudio.channel-publication" ||
            change.value.state.status !== "waiting" ||
            change.value.state.condition.kind !== "failure"
          )
            continue;
          failedPublication = {
            taskId: change.value.id,
            incident: change.value.state.condition.incident,
          };
          failed.resolve();
        }
      });
      const conversation = await openNativeChannelConversation(
        harness,
        {
          channelId: "channel:one",
          contextId: owner.contextId,
          channelRef: {
            source: "workers/channel",
            className: "ChannelDO",
            objectKey: "channel:one",
          },
        },
        {
          model: { provider: "before", modelId: before.getModel().id },
          extensions: [extension],
        },
        context,
      );
      const settings: NativeProductModelSettings = {
        primaryModel: { provider: "before", modelId: before.getModel().id },
        fallbackScope: "unattended",
        fastMode: false,
      };
      await conversation.commit(async (tx) => {
        await policy.configure(tx, conversation.id, settings);
        await publication.bind(tx, conversation.id, {
          channelId: "channel:one",
          participantId: owner.runtimeId,
          actor: { kind: "agent", id: "one" },
          policy: "all",
        });
      }, context);
      try {
        const original = await conversation.submit(
          {
            type: "input",
            content: async (tx, id) => {
              await recordNativeProductInput(tx, id, "channel:one");
              return "Original human request";
            },
          },
          context,
        );
        await entered.promise;
        expect(cards).toBe(0);
        expect(
          (await harness.getTask(requests[0]!.taskId, context))!.state.status,
        ).toBe("running");
        park.resolve();
        if (delayed) {
          await admittedWait.promise;
          expect(cards).toBe(0);
          const owner = await retainedAgentExecutionOwner(harness, context);
          expect(
            await notifyModelCredentialChange(
              harness,
              owner,
              conversation.id,
              "before",
              context,
            ),
          ).toBe(true);
          await readmittedWait.promise;
          releasePublications.resolve();
        }
        await published.promise;
        if (!delayed) {
          await failed.promise;
          expect(
            await harness.retryTask(
              failedPublication.taskId,
              failedPublication.incident,
              context,
            ),
          ).toBe("queued");
          await replayed.promise;
          expect(deliveries).toEqual([deliveries[0], deliveries[0]]);
        } else {
          const wait = (await harness.getTask(requests[0]!.taskId, context))!
            .state;
          if (wait.status !== "waiting" || wait.condition.kind !== "input")
            throw new Error("Actual wait was lost");
          expect(deliveries).toEqual([
            `${nativeInvocationId(sources[0]!)}:credential-wait:${wait.condition.after}`,
          ]);
        }
        expect(cards).toBe(1);
        const run = (await harness.snapshot(LiveDoc, conversation.id, context))!
          .run!;
        await conversation.commit(
          (tx) =>
            policy.configure(tx, conversation.id, {
              ...settings,
              primaryModel: { provider: "after", modelId: after.getModel().id },
            }),
          context,
        );
        await conversation.configure(
          { model: { provider: "after", modelId: after.getModel().id } },
          context,
        );
        expect(await conversation.reprepare(run.taskId, context)).toBe(true);
        expect(await original.wait(context)).toMatchObject({ status: "done" });
        expect(requests.map((request) => request.model.provider)).toEqual([
          "before",
          ...(delayed ? ["before"] : []),
          "after",
        ]);
        expect(sources[0]!.task.taskId).not.toBe(sources.at(-1)!.task.taskId);
        expect(
          await readRetainedNativeInvocationSource(
            harness,
            {
              taskId: sources[0]!.task.taskId,
              invocationId: nativeInvocationId(sources[0]!),
            },
            image,
            context,
          ),
        ).toEqual(sources[0]);
        const users = (
          await conversation.entries({}, 100, undefined, context)
        ).items.filter((entry) => entry.kind === "pi.user");
        expect(users).toHaveLength(1);
        expect(users[0]!.model).toEqual([
          expect.objectContaining({
            role: "user",
            content: "Original human request",
          }),
        ]);
        expect(before.state.callCount).toBe(0);
        await conversation.commit(
          (tx) => policy.configure(tx, conversation.id, settings),
          context,
        );
        await conversation.configure({ model: settings.primaryModel }, context);
        const later = await conversation.submit(
          { type: "input", content: "Another genuine request" },
          context,
        );
        await laterWait.promise;
        expect(cards).toBe(2);
        expect(deliveries.at(-1)).not.toBe(deliveries[0]);
        await conversation.abort(context);
        expect(await later.status(context)).toMatchObject({
          status: "unanswered",
          reason: "aborted",
        });
      } finally {
        stop();
        releasePublications.resolve();
        park.resolve();
      }
    },
  );
});
