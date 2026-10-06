import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createModels,
  fauxAssistantMessage,
  fauxProvider,
} from "@panticonic/pi-ai";
import { BACKGROUND_CONTEXT } from "@panticonic/pi-chord/context";
import {
  createRegistry,
  defineExtension,
  Harness,
  LiveDoc,
  MemoryStorage,
  type ModelRequestApi,
  type ModelRequestTarget,
  type Storage,
} from "@panticonic/pi-durable";
import { openNodeSqliteStorage } from "@panticonic/pi-durable/storage/sqlite/node";
import {
  RpcBoundaryError,
  type AcquisitionInfo,
  type RpcCaller,
} from "@vibestudio/rpc";
import type { StoredCredentialSummary } from "@workspace/runtime/credentials";
import { openBoundAgentSession } from "./native-agent-session.js";
import {
  createProtectedModelProvider,
  notifyModelCredentialChange,
  type NativeModelProviderHost,
} from "./native-model-provider.js";
import { isModelCredentialSentinel } from "./model-credential.js";
import { createNativeChannelPublication } from "./native-channel-publication.js";
import {
  agenticEventSchema,
  type AgenticEvent,
} from "@workspace/agentic-protocol";

const owner = {
  runtimeId: "do:workers/agent:Agent:one",
  contextId: "context:one",
  incarnation: "incarnation-one",
  authoritySessionId: "authority:owner-lifetime",
};
const context = BACKGROUND_CONTEXT;
const sessions: Harness[] = [];
afterEach(async () => {
  await Promise.all(
    sessions.splice(0).map((session) => session.close(context)),
  );
});

function summary(metadata?: Record<string, string>): StoredCredentialSummary {
  return {
    id: "credential-one",
    label: "test",
    audience: [{ url: "https://provider.test/v1", match: "path-prefix" }],
    injection: {
      type: "header",
      name: "authorization",
      valueTemplate: "Bearer {token}",
    },
    scopes: [],
    lifecycle: { state: "active", canRefresh: true },
    ...(metadata ? { metadata } : {}),
  };
}

function latch<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}

async function waitFor(check: () => boolean | Promise<boolean>) {
  for (let attempts = 0; attempts < 200; attempts++) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("Expected durable state was not reached");
}

function setup(provider = "faux", baseUrl = "https://provider.test/v1") {
  const faux = fauxProvider({ provider });
  faux.getModel().baseUrl = baseUrl;
  const models = createModels();
  models.setProvider(faux.provider);
  const registry = createRegistry();
  const events: AgenticEvent[] = [];
  const publication = createNativeChannelPublication({
    publish: async (_channel, _participant, event) => {
      agenticEventSchema.parse(event);
      events.push(event);
      return { id: events.length };
    },
  });
  registry.install(
    defineExtension({ name: "publication", tasks: [publication.task] }),
  );
  const reports: unknown[] = [];
  const rpc = {
    call: vi.fn<(...args: Parameters<RpcCaller["call"]>) => Promise<unknown>>(),
    stream: vi.fn<RpcCaller["stream"]>(),
  };
  const boundRpc: RpcCaller = {
    call: async <T>(...args: Parameters<RpcCaller["call"]>) =>
      (await rpc.call(...args)) as T,
    stream: rpc.stream,
  };
  const waitForAuthority = vi.fn<NativeModelProviderHost["waitForAuthority"]>(
    async (request) => ({
      status: "waiting",
      condition: {
        kind: "input",
        conversationId: request.conversationId,
        after: request.cutoff,
        kinds: ["test.authority"],
      },
    }),
  );
  const egressFetch = vi.fn<typeof fetch>();
  const port = createProtectedModelProvider({
    rpcForRequest: () => boundRpc,
    egressFetch,
    waitForAuthority,
  });
  async function open(storage: Storage = new MemoryStorage()) {
    const harness = await openBoundAgentSession(
      storage,
      owner,
      {
        models,
        registry,
        modelRequests: port,
        publishWake: async () => {},
        prepareCommit: publication.prepareCommit,
        onReport: (error) => {
          reports.push(error);
        },
      },
      context,
    );
    sessions.push(harness);
    const root = await harness.root(context, {
      agent: { model: { provider, modelId: faux.getModel().id } },
    });
    await root.commit(
      (tx) =>
        publication.bind(tx, root.id, {
          channelId: "channel:one",
          participantId: owner.runtimeId,
          actor: { kind: "agent", id: owner.runtimeId },
          policy: "all",
        }),
      context,
    );
    return { harness, root };
  }
  return {
    faux,
    models,
    registry,
    rpc,
    waitForAuthority,
    egressFetch,
    port,
    open,
    reports,
    events,
  };
}

async function waiting(
  harness: Harness,
  conversationId: Parameters<Harness["conversation"]>[0],
) {
  const live = await harness.snapshot(LiveDoc, conversationId, context);
  return live?.run
    ? (await harness.getTask(live.run.taskId, context))?.state
    : undefined;
}

describe("native protected model provider", () => {
  it("publishes actual credential wait and same-turn resume without carrying the stale wait reason", async () => {
    const state = setup();
    state.rpc.call.mockResolvedValue(null);
    state.faux.setResponses([fauxAssistantMessage("Connected")]);
    const { harness, root } = await state.open();
    const input = await root.submit({ type: "input", content: "go" }, context);
    await harness.runPass(context);
    const lifecycle = () =>
      state.events.filter((event) => event.kind.startsWith("turn."));
    expect(lifecycle().map((event) => event.kind)).toEqual([
      "turn.opened",
      "turn.waiting",
    ]);
    expect(lifecycle()[1]?.payload).toMatchObject({
      reason: "model_credential_required",
      summary: "Waiting for model connection",
    });
    state.rpc.call.mockResolvedValue(summary());
    await notifyModelCredentialChange(harness, owner, root.id, "faux", context);
    await input.wait(context);
    await harness.runPass(context);
    expect(lifecycle().map((event) => event.kind)).toEqual([
      "turn.opened",
      "turn.waiting",
      "turn.resumed",
      "turn.closed",
    ]);
    expect(new Set(lifecycle().map((event) => event.turnId)).size).toBe(1);
    expect(lifecycle()[2]?.payload).toEqual({
      protocol: "agentic.trajectory.v1",
    });
  });
  it("commits a credential-owned endpoint while preserving the selected model and catalog metadata", async () => {
    const state = setup("faux", "https://{tenant}.provider.test/v1");
    state.rpc.call.mockImplementation(async () =>
      summary({ modelBaseUrl: "https://actual.provider.test/v1" }),
    );
    const original = JSON.parse(JSON.stringify(state.faux.getModel()));
    state.faux.setResponses([
      (_messages, options, _state, model) => {
        expect(model).toEqual({
          ...original,
          baseUrl: "https://actual.provider.test/v1",
        });
        expect(
          typeof options?.apiKey === "string" &&
            isModelCredentialSentinel(options.apiKey),
        ).toBe(true);
        return fauxAssistantMessage("done");
      },
    ]);
    const { harness, root } = await state.open();
    expect(
      (
        await (
          await root.submit({ type: "input", content: "go" }, context)
        ).wait(context)
      ).status,
    ).toBe("done");
    expect(state.rpc.call).toHaveBeenCalledWith(
      "main",
      "credentials.resolveCredential",
      [{ providerId: "faux" }],
      expect.objectContaining({
        authorityAcquisition: "return",
        idempotencyKey: expect.stringMatching(/^model:[a-f0-9]{64}$/),
      }),
    );
    expect(JSON.parse(JSON.stringify(state.faux.getModel()))).toEqual(original);
    expect(state.waitForAuthority).not.toHaveBeenCalled();
    await harness.close(context);
  });

  it("parks credential absence, ignores another provider, and advances the frontier when a checkup still finds absence", async () => {
    const state = setup();
    let credential: StoredCredentialSummary | null = null;
    state.rpc.call.mockImplementation(async () => credential);
    state.faux.setResponses([fauxAssistantMessage("done")]);
    const { harness, root } = await state.open();
    const submission = await root.submit(
      { type: "input", content: "go" },
      context,
    );
    await waitFor(
      async () => (await waiting(harness, root.id))?.status === "waiting",
    );
    const first = await waiting(harness, root.id);
    expect(state.rpc.call).toHaveBeenCalledTimes(2);
    expect(state.faux.state.callCount).toBe(0);
    await notifyModelCredentialChange(
      harness,
      owner,
      root.id,
      "another-provider",
      context,
    );
    await harness.runPass(context);
    expect(state.rpc.call).toHaveBeenCalledTimes(2);
    await notifyModelCredentialChange(harness, owner, root.id, "faux", context);
    await waitFor(
      async () =>
        state.rpc.call.mock.calls.length === 4 &&
        (await waiting(harness, root.id))?.status === "waiting",
    );
    const second = await waiting(harness, root.id);
    expect(second).not.toEqual(first);
    await harness.runPass(context);
    expect(state.rpc.call).toHaveBeenCalledTimes(4);
    credential = summary();
    await notifyModelCredentialChange(harness, owner, root.id, "faux", context);
    expect((await submission.wait(context)).status).toBe("done");
    expect(state.faux.state.callCount).toBe(1);
    expect(state.waitForAuthority).not.toHaveBeenCalled();
  });

  it("closes connect-before-binding with one canonical domain re-read", async () => {
    const state = setup();
    state.rpc.call.mockResolvedValueOnce(null).mockResolvedValueOnce(summary());
    state.faux.setResponses([fauxAssistantMessage("done")]);
    const { root } = await state.open();
    expect(
      (
        await (
          await root.submit({ type: "input", content: "go" }, context)
        ).wait(context)
      ).status,
    ).toBe("done");
    expect(state.rpc.call).toHaveBeenCalledTimes(2);
  });

  it("retains a connect checkup delivered after the frontier but before task parking", async () => {
    const state = setup();
    const reading = latch();
    const returnAbsence = latch();
    let calls = 0;
    state.rpc.call.mockImplementation(async () => {
      calls++;
      if (calls === 1) return null;
      if (calls === 2) {
        reading.resolve();
        await returnAbsence.promise;
        return null;
      }
      return summary();
    });
    state.faux.setResponses([fauxAssistantMessage("done")]);
    const { harness, root } = await state.open();
    const submission = await root.submit(
      { type: "input", content: "go" },
      context,
    );
    await reading.promise;
    await notifyModelCredentialChange(harness, owner, root.id, "faux", context);
    returnAbsence.resolve();
    expect((await submission.wait(context)).status).toBe("done");
    expect(calls).toBe(3);
  });

  it("reopens a durable missing-credential wait and checks the original request only after a real connect event", async () => {
    const directory = await mkdtemp(join(tmpdir(), "native-model-ready-"));
    const state = setup();
    let credential: StoredCredentialSummary | null = null;
    state.rpc.call.mockImplementation(async () => credential);
    state.faux.setResponses([fauxAssistantMessage("done")]);
    let opened = await state.open(
      await openNodeSqliteStorage(join(directory, "session.sqlite")),
    );
    try {
      const submission = await opened.root.submit(
        { type: "input", content: "go" },
        context,
      );
      await waitFor(
        async () =>
          (await waiting(opened.harness, opened.root.id))?.status === "waiting",
      );
      const original = state.rpc.call.mock.calls[0]![2];
      await opened.harness.close(context);
      state.faux.getModel().baseUrl = "https://changed-catalog.test/v1";
      opened = await state.open(
        await openNodeSqliteStorage(join(directory, "session.sqlite")),
      );
      await opened.harness.runPass(context);
      expect(state.rpc.call).toHaveBeenCalledTimes(2);
      credential = summary();
      await notifyModelCredentialChange(
        opened.harness,
        owner,
        opened.root.id,
        "faux",
        context,
      );
      expect(
        (
          await (await opened.harness.submission(submission.id, context))!.wait(
            context,
          )
        ).status,
      ).toBe("done");
      expect(state.rpc.call.mock.calls[2]![2]).toEqual(original);
      expect(state.faux.state.callCount).toBe(1);
    } finally {
      await opened.harness.close(context);
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("refuses unknown conversations, retired owners and unbound Sessions without manufacturing admission", async () => {
    const state = setup();
    const { harness, root } = await state.open();
    const before = await root.entries({}, 100, undefined, context);
    await expect(
      notifyModelCredentialChange(
        harness,
        { ...owner, incarnation: "retired" },
        root.id,
        "faux",
        context,
      ),
    ).rejects.toThrow("retired execution owner");
    await expect(
      notifyModelCredentialChange(
        harness,
        owner,
        999_999 as typeof root.id,
        "faux",
        context,
      ),
    ).rejects.toThrow("no existing owned conversation");
    expect(await root.entries({}, 100, undefined, context)).toEqual(before);
    const storage = new MemoryStorage();
    const unbound = await Harness.open(
      storage,
      { models: state.models, registry: state.registry },
      context,
    );
    sessions.push(unbound);
    await expect(
      notifyModelCredentialChange(unbound, owner, root.id, "faux", context),
    ).rejects.toThrow("existing host-bound owner");
    expect(
      (
        await storage.scanDocuments(
          { scope: { kind: "session" }, at: "current" },
          10,
          undefined,
          context,
        )
      ).items,
    ).toEqual([]);
  });

  it("prepares the actual loopback endpoint before protected key acquisition and never passes its key to the provider", async () => {
    const state = setup("local", "http://127.0.0.1:0/v1");
    state.rpc.call.mockImplementation(async (_target, method, args) => {
      expect(method).toBe("extensions.invoke");
      if (args[1] === "ensureLoaded")
        return { baseUrl: "http://127.0.0.1:32123/v1" };
      if (args[1] === "getLoopbackAuth")
        return {
          apiKey: "activation-secret",
          origins: ["http://127.0.0.1:32123"],
        };
      throw new Error("Unexpected local invocation");
    });
    state.faux.setResponses([
      (_messages, options, _state, model) => {
        expect(model.baseUrl).toBe("http://127.0.0.1:32123/v1");
        expect(options?.apiKey).not.toContain("activation-secret");
        expect(
          typeof options?.apiKey === "string" &&
            isModelCredentialSentinel(options.apiKey),
        ).toBe(true);
        return fauxAssistantMessage("done");
      },
    ]);
    const { root } = await state.open();
    expect(
      (
        await (
          await root.submit({ type: "input", content: "go" }, context)
        ).wait(context)
      ).status,
    ).toBe("done");
    expect(state.rpc.call.mock.calls.map((call) => call[2])).toEqual([
      [
        "@workspace-extensions/local-models",
        "ensureLoaded",
        [state.faux.getModel().id],
      ],
      ["@workspace-extensions/local-models", "getLoopbackAuth", []],
    ]);
    expect(state.egressFetch).not.toHaveBeenCalled();
  });

  it("refuses a changed loopback endpoint after replacement rather than rebinding a prepared approval", async () => {
    const directory = await mkdtemp(join(tmpdir(), "native-local-prepared-"));
    const state = setup("local", "http://127.0.0.1:0/v1");
    let endpoint = "http://127.0.0.1:32123/v1";
    const acquisition: AcquisitionInfo = {
      acquisitionId: "local-key-approval",
      ownerRuntimeId: owner.runtimeId,
      snapshotDigest: "snapshot",
      capability: "runtime.use",
      resourceKey: "local",
      tier: "gated",
      cardType: "permission.gated",
      renderedAction: "Use local model",
      pending: true,
    };
    let authCalls = 0;
    state.rpc.call.mockImplementation(async (_target, _method, args) => {
      if (args[1] === "ensureLoaded") return { baseUrl: endpoint };
      authCalls++;
      throw new RpcBoundaryError("approval", "access", "EACQUIRE", undefined, {
        acquisition,
      });
    });
    state.waitForAuthority.mockImplementation(async (request, api) => {
      expect(request.model.baseUrl).toBe("http://127.0.0.1:0/v1");
      expect(api.prepared?.model.baseUrl).toBe("http://127.0.0.1:32123/v1");
      return {
        status: "waiting",
        condition: {
          kind: "input",
          conversationId: request.conversationId,
          after: request.cutoff,
          kinds: ["test.authority"],
        },
      };
    });
    state.faux.setResponses([fauxAssistantMessage("must not dispatch")]);
    let opened = await state.open(
      await openNodeSqliteStorage(join(directory, "session.sqlite")),
    );
    try {
      const submission = await opened.root.submit(
        { type: "input", content: "go" },
        context,
      );
      await waitFor(
        async () =>
          (await waiting(opened.harness, opened.root.id))?.status === "waiting",
      );
      await opened.harness.close(context);
      endpoint = "http://127.0.0.1:32124/v1";
      opened = await state.open(
        await openNodeSqliteStorage(join(directory, "session.sqlite")),
      );
      await opened.harness.commit(
        (tx) => tx.appendEntry(opened.root.id, { kind: "test.authority" }),
        context,
      );
      expect(
        await (await opened.harness.submission(submission.id, context))!.wait(
          context,
        ),
      ).toMatchObject({
        status: "unanswered",
        reason: "faulted",
        detail: "Model preparation conflicts with its committed endpoint",
      });
      expect(authCalls).toBe(1);
      expect(state.faux.state.callCount).toBe(0);
      expect(state.egressFetch).not.toHaveBeenCalled();
    } finally {
      await opened.harness.close(context);
      await rm(directory, { recursive: true, force: true });
    }
  });

  for (const local of [false, true]) {
    it(`retains exact ${local ? "loopback" : "remote"} protected approval and propagates other failures unchanged`, async () => {
      const state = setup(local ? "local" : "faux");
      const original = new Error("original provider disconnected");
      const request: ModelRequestTarget = {
        taskId: 1 as ModelRequestTarget["taskId"],
        conversationId: 0 as ModelRequestTarget["conversationId"],
        taskKind: "pi.generate",
        taskVersion: 1,
        purpose: "generation",
        attempt: 1,
        operation: "stream",
        model: JSON.parse(JSON.stringify(state.faux.getModel())),
        messages: [],
        cutoff: 1 as ModelRequestTarget["cutoff"],
        options: {},
      };
      const api: ModelRequestApi = {
        prepared: undefined,
        prepare: async () => {
          throw new Error("Unexpected preparation");
        },
        commit: async () => {
          throw new Error("Unexpected commit");
        },
      };
      state.rpc.call.mockRejectedValueOnce(original);
      await expect(state.port(request, api, context)).rejects.toBe(original);
      expect(state.waitForAuthority).not.toHaveBeenCalled();
      const acquisition: AcquisitionInfo = {
        acquisitionId: "acquisition-one",
        ownerRuntimeId: owner.runtimeId,
        snapshotDigest: "snapshot",
        capability: "credentials.use",
        resourceKey: "resource",
        tier: "gated",
        cardType: "permission.gated",
        renderedAction: "Use",
        pending: true,
      };
      state.rpc.call.mockRejectedValueOnce(
        new RpcBoundaryError("approval", "access", "EACQUIRE", undefined, {
          acquisition,
        }),
      );
      expect((await state.port(request, api, context)).status).toBe("waiting");
      expect(state.waitForAuthority).toHaveBeenCalledWith(
        request,
        api,
        acquisition,
        {
          service: local ? "extensions" : "credentials",
          method: local ? "invoke" : "resolveCredential",
          args: local
            ? [
                "@workspace-extensions/local-models",
                "ensureLoaded",
                [request.model.id],
              ]
            : [{ url: request.model.baseUrl }],
        },
        context,
      );
      const malformed = new RpcBoundaryError(
        "bad acquisition",
        "access",
        "EACQUIRE",
        undefined,
        { acquisition: { acquisitionId: "foreign" } },
      );
      state.rpc.call.mockRejectedValueOnce(malformed);
      await expect(state.port(request, api, context)).rejects.toBe(malformed);
      expect(state.waitForAuthority).toHaveBeenCalledTimes(1);
    });
  }
});
