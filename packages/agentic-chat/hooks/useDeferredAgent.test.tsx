// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Participant } from "@workspace/pubsub";
import type { AvailableAgent, ModelCatalog } from "@workspace/agentic-core";
import { makeTestCatalogEntry } from "@workspace/model-catalog/testing";
import { useDeferredAgent } from "./useDeferredAgent";
import type { ChatParticipantMetadata } from "../types";

const WORKSPACE_MODEL = "openai-codex:gpt-6.1-sol";
const PANEL_MODEL = "openai-codex:gpt-6-luna";
const USER_MODEL = "anthropic:claude-sonnet-4-6";

const AGENT: AvailableAgent = {
  id: "workers/agent-worker",
  className: "AiChatWorker",
  name: "AI Chat",
  proposedHandle: "ai-chat",
};

const MODEL_CATALOG: ModelCatalog = {
  providers: [],
  models: [
    makeTestCatalogEntry({
      ref: WORKSPACE_MODEL,
      id: "gpt-6.1-sol",
      name: "GPT-6.1 Sol",
      provider: "openai-codex",
      baseUrl: "https://chatgpt.com/backend-api",
    }),
    makeTestCatalogEntry({
      ref: PANEL_MODEL,
      id: "gpt-6-luna",
      name: "GPT-6 Luna",
      provider: "openai-codex",
      baseUrl: "https://chatgpt.com/backend-api",
    }),
  ],
};

const agentRoster = {
  "do:workers/agent-worker:AiChatWorker:ai-chat-1": {
    id: "do:workers/agent-worker:AiChatWorker:ai-chat-1",
    metadata: { name: "AI Chat", type: "agent", handle: "ai-chat" },
  },
} as unknown as Record<string, Participant<ChatParticipantMetadata>>;

interface Mocks {
  clearComposer: ReturnType<typeof vi.fn>;
  publishText: ReturnType<typeof vi.fn>;
  maybeSetDefaultTitle: ReturnType<typeof vi.fn>;
  coreSendMessage: ReturnType<typeof vi.fn>;
  onAddAgent?: ReturnType<typeof vi.fn>;
}

function freshMocks(withAdd = true): Mocks {
  return {
    clearComposer: vi.fn(),
    publishText: vi.fn().mockResolvedValue(undefined),
    maybeSetDefaultTitle: vi.fn(),
    coreSendMessage: vi.fn().mockResolvedValue(undefined),
    onAddAgent: withAdd ? vi.fn() : undefined,
  };
}

type Params = Parameters<typeof useDeferredAgent>[0];

function makeParams(m: Mocks, over: Partial<Params> = {}): Params {
  return {
    participants: {},
    pendingAgents: new Map(),
    input: "",
    clearComposer: m.clearComposer,
    publishText: m.publishText,
    maybeSetDefaultTitle: m.maybeSetDefaultTitle,
    coreSendMessage: m.coreSendMessage,
    onAddAgent: m.onAddAgent,
    availableAgents: [AGENT],
    modelCatalog: null,
    defaultModelRef: null,
    firstAgentPending: true,
    resolveOpeningRequest: vi.fn().mockResolvedValue(undefined),
    channelName: "chat-test",
    replaySettled: true,
    ...over,
  };
}

describe("useDeferredAgent", () => {
  it("arms the inline setup when no agent is present and one can be created", () => {
    const m = freshMocks();
    const { result } = renderHook((p: Params) => useDeferredAgent(p), {
      initialProps: makeParams(m),
    });
    expect(result.current.deferredAgent?.setupActive).toBe(true);
    expect(result.current.deferredAgent?.active).toBe(true);
    expect(result.current.deferredAgent?.launching).toBe(false);
  });

  it("prepares the default agent before send and updates the provisional intent with the draft", async () => {
    const m = freshMocks();
    const onPrepareAgent = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook((p: Params) => useDeferredAgent(p), {
      initialProps: makeParams(m, {
        modelCatalog: MODEL_CATALOG,
        defaultModelRef: WORKSPACE_MODEL,
        defaultAgentConfig: { model: WORKSPACE_MODEL, approvalLevel: 2 },
        onPrepareAgent,
      }),
    });

    await waitFor(() =>
      expect(onPrepareAgent).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({ model: WORKSPACE_MODEL, approvalLevel: 2 })
      )
    );
    expect(m.onAddAgent).not.toHaveBeenCalled();

    act(() => {
      result.current.deferredAgent?.setDraft({
        ...result.current.deferredAgent.draft,
        model: PANEL_MODEL,
      });
    });
    await waitFor(() =>
      expect(onPrepareAgent).toHaveBeenLastCalledWith(
        undefined,
        expect.objectContaining({ model: PANEL_MODEL })
      )
    );

    rerender(
      makeParams(m, {
        participants: agentRoster,
        modelCatalog: MODEL_CATALOG,
        defaultModelRef: WORKSPACE_MODEL,
        defaultAgentConfig: { model: WORKSPACE_MODEL, approvalLevel: 2 },
        onPrepareAgent,
      })
    );
    await waitFor(() => expect(onPrepareAgent).toHaveBeenLastCalledWith(undefined, null));
  });

  it("waits for the channel initialization projection before preparing its first agent", async () => {
    const m = freshMocks();
    const onPrepareAgent = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook((p: Params) => useDeferredAgent(p), {
      initialProps: makeParams(m, {
        replaySettled: false,
          firstAgentPending: true,
        modelCatalog: MODEL_CATALOG,
        defaultModelRef: WORKSPACE_MODEL,
        defaultAgentConfig: { model: WORKSPACE_MODEL },
        onPrepareAgent,
      }),
    },
    );

    expect(onPrepareAgent).not.toHaveBeenCalled();
    expect(result.current.deferredAgent?.setupActive ?? false).toBe(false);
    rerender(
      makeParams(m, {
        replaySettled: true,
        firstAgentPending: true,
        modelCatalog: MODEL_CATALOG,
        defaultModelRef: WORKSPACE_MODEL,
        defaultAgentConfig: { model: WORKSPACE_MODEL },
        onPrepareAgent,
      }),
    );

    await waitFor(() =>
      expect(onPrepareAgent).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({ model: WORKSPACE_MODEL })
      )
    );
    expect(m.onAddAgent).not.toHaveBeenCalled();
  });

  it("queues the first message, spawns exactly one agent, and never double-spawns", async () => {
    const m = freshMocks();
    const { result } = renderHook((p: Params) => useDeferredAgent(p), {
      initialProps: makeParams(m, { input: "hello" }),
    });

    await act(async () => {
      await result.current.sendMessage();
    });
    expect(m.clearComposer).toHaveBeenCalledTimes(1);
    expect(m.onAddAgent).toHaveBeenCalledTimes(1);
    expect(m.coreSendMessage).not.toHaveBeenCalled();
    expect(result.current.deferredAgent?.queued.map((q) => q.text)).toEqual(["hello"]);
    expect(result.current.deferredAgent?.launching).toBe(true);

    // A second send before the agent joins enqueues but must not spawn again.
    await act(async () => {
      await result.current.sendMessage();
    });
    expect(m.onAddAgent).toHaveBeenCalledTimes(1);
    expect(result.current.deferredAgent?.queued.length).toBe(2);
  });

  it.each([false, true])("retains ownership of a slow launch (acknowledged: %s)", async (acknowledged) => {
    vi.useFakeTimers();
    let acknowledge!: () => void;
    const pending = new Promise<void>((resolve) => { acknowledge = resolve; });
    const m = freshMocks();
    m.onAddAgent = vi.fn(() => acknowledged ? Promise.resolve() : pending);
    const { result, rerender, unmount } = renderHook((p: Params) => useDeferredAgent(p), {
      initialProps: makeParams(m, { input: "hello" }),
    });
    try {
      await act(async () => result.current.sendMessage());
      await act(async () => vi.advanceTimersByTimeAsync(120_000));
      expect(result.current.deferredAgent?.launchFailed).toBe(false);
      expect(result.current.deferredAgent?.launching).toBe(true);
      expect(result.current.deferredAgent?.queued.map((item) => item.text)).toEqual(["hello"]);
      await act(async () => result.current.sendMessage());
      expect(m.onAddAgent).toHaveBeenCalledOnce();
      await act(async () => { acknowledge(); });
      rerender(makeParams(m, { participants: agentRoster }));
      await act(async () => {});
      expect(m.onAddAgent).toHaveBeenCalledOnce();
      expect(m.publishText).toHaveBeenCalledTimes(2);
    } finally {
      acknowledge();
      unmount();
      vi.useRealTimers();
    }
  });

  it("settles an acknowledged launch on the worker's actual failure event", async () => {
    const m = freshMocks();
    const { result, rerender } = renderHook((p: Params) => useDeferredAgent(p), {
      initialProps: makeParams(m, { input: "hello" }),
    });
    await act(async () => result.current.sendMessage());
    rerender(makeParams(m, {
      pendingAgents: new Map([["ai-chat", {
        agentId: AGENT.id,
        status: "error",
        error: { message: "Agent build failed" },
      }]]),
    }));
    expect(result.current.deferredAgent?.launchFailed).toBe(true);
    expect(result.current.deferredAgent?.queued.map((item) => item.text)).toEqual(["hello"]);
    expect(m.onAddAgent).toHaveBeenCalledOnce();
    expect(m.publishText).not.toHaveBeenCalled();
  });

  it("flushes the queue live when an agent joins, then stands down", async () => {
    const m = freshMocks();
    const { result, rerender } = renderHook((p: Params) => useDeferredAgent(p), {
      initialProps: makeParams(m, { input: "hello" }),
    });
    await act(async () => {
      await result.current.sendMessage();
    });
    expect(result.current.deferredAgent?.queued.length).toBe(1);

    // Agent joins the roster → the held message flushes live via publishText.
    rerender(makeParams(m, { input: "", participants: agentRoster }));
    await waitFor(() => expect(m.publishText).toHaveBeenCalledTimes(1));
    expect(m.publishText).toHaveBeenCalledWith("hello", expect.objectContaining({}));
    // Brand-new chat (empty transcript) → the first message titles the channel.
    expect(m.maybeSetDefaultTitle).toHaveBeenCalledWith("hello");
    await waitFor(() => expect(result.current.deferredAgent).toBeUndefined());
  });

  it("does not title the chat until the first queued message is successfully published", async () => {
    const m = freshMocks();
    let resolvePublish!: () => void;
    m.publishText = vi.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolvePublish = resolve;
        })
    );
    const { result, rerender } = renderHook((p: Params) => useDeferredAgent(p), {
      initialProps: makeParams(m, { input: "hello" }),
    });
    await act(async () => {
      await result.current.sendMessage();
    });

    rerender(makeParams(m, { input: "", participants: agentRoster }));
    await waitFor(() => expect(m.publishText).toHaveBeenCalledTimes(1));
    expect(m.maybeSetDefaultTitle).not.toHaveBeenCalled();

    await act(async () => {
      resolvePublish();
    });
    await waitFor(() => expect(m.maybeSetDefaultTitle).toHaveBeenCalledWith("hello"));
  });

  it("keeps new sends behind failed deliveries and retries with their original publication identity", async () => {
    const m = freshMocks();
    m.publishText.mockRejectedValueOnce(new Error("Disconnected"));
    const { result, rerender } = renderHook((p: Params) => useDeferredAgent(p), {
      initialProps: makeParams(m, { input: "first" }),
    });
    await act(async () => { await result.current.sendMessage(); });
    rerender(makeParams(m, { input: "second", participants: agentRoster }));
    await waitFor(() => expect(result.current.deferredAgent?.deliveryError).toBe("Disconnected"));
    const identity = m.publishText.mock.calls[0]![1].idempotencyKey;
    await act(async () => { await result.current.sendMessage(); });
    expect(m.coreSendMessage).not.toHaveBeenCalled();
    expect(result.current.deferredAgent?.queued.map((item) => item.text)).toEqual(["first", "second"]);
    expect(m.publishText).toHaveBeenCalledTimes(1);
    act(() => result.current.deferredAgent?.retryDelivery());
    await waitFor(() => expect(result.current.deferredAgent).toBeUndefined());
    expect(m.publishText.mock.calls.map(([text]) => text)).toEqual(["first", "first", "second"]);
    expect(m.publishText.mock.calls[1]![1].idempotencyKey).toBe(identity);
  });

  it("removing a failed delivery releases later queued input without retrying the removed message", async () => {
    const m = freshMocks();
    m.publishText.mockRejectedValueOnce(new Error("Disconnected"));
    const { result, rerender } = renderHook((p: Params) => useDeferredAgent(p), { initialProps: makeParams(m, { input: "first" }) });
    await act(async () => { await result.current.sendMessage(); });
    rerender(makeParams(m, { input: "second" }));
    await act(async () => { await result.current.sendMessage(); });
    rerender(makeParams(m, { participants: agentRoster }));
    await waitFor(() => expect(result.current.deferredAgent?.deliveryError).toBe("Disconnected"));
    act(() => result.current.deferredAgent?.cancelQueued(result.current.deferredAgent.queued[0]!.id));
    await waitFor(() => expect(result.current.deferredAgent).toBeUndefined());
    expect(m.publishText.mock.calls.map(([text]) => text)).toEqual(["first", "second"]);
  });

  it("projects owned publication and only allows removal before an item's send begins", async () => {
    const m = freshMocks();
    let complete!: () => void;
    m.publishText.mockImplementation(() => new Promise<void>((resolve) => { complete = resolve; }));
    const { result, rerender } = renderHook((p: Params) => useDeferredAgent(p), { initialProps: makeParams(m, { input: "first" }) });
    await act(async () => { await result.current.sendMessage(); });
    const id = result.current.deferredAgent!.queued[0]!.id;
    rerender(makeParams(m, { participants: agentRoster }));
    await waitFor(() => expect(result.current.deferredAgent?.deliveringId).toBe(id));
    act(() => result.current.deferredAgent?.cancelQueued(id));
    expect(result.current.deferredAgent?.queued[0]?.id).toBe(id);
    await act(async () => complete());
    await waitFor(() => expect(result.current.deferredAgent).toBeUndefined());
    expect(m.publishText).toHaveBeenCalledOnce();
  });

  it("skips queued messages canceled before their flush turn begins", async () => {
    const m = freshMocks();
    let resolveFirst!: () => void;
    m.publishText = vi.fn().mockImplementation((text: string) => {
      if (text === "first") {
        return new Promise<void>((resolve) => {
          resolveFirst = resolve;
        });
      }
      return Promise.resolve();
    });
    const { result, rerender } = renderHook((p: Params) => useDeferredAgent(p), {
      initialProps: makeParams(m, { input: "first" }),
    });

    await act(async () => {
      await result.current.sendMessage();
    });
    rerender(makeParams(m, { input: "second" }));
    await act(async () => {
      await result.current.sendMessage();
    });
    expect(result.current.deferredAgent?.queued.map((q) => q.text)).toEqual(["first", "second"]);

    rerender(makeParams(m, { input: "", participants: agentRoster }));
    await waitFor(() => expect(m.publishText).toHaveBeenCalledWith("first", expect.any(Object)));
    const second = result.current.deferredAgent?.queued.find((q) => q.text === "second");
    expect(second).toBeTruthy();
    act(() => {
      result.current.deferredAgent?.cancelQueued(second!.id);
    });

    await act(async () => {
      resolveFirst();
    });
    await waitFor(() => expect(result.current.deferredAgent).toBeUndefined());
    expect(m.publishText).toHaveBeenCalledTimes(1);
  });

  it("falls through to the normal send when the host cannot create agents", async () => {
    const m = freshMocks(false); // no onAddAgent
    const { result } = renderHook((p: Params) => useDeferredAgent(p), {
      initialProps: makeParams(m, { input: "hi" }),
    });
    expect(result.current.deferredAgent).toBeUndefined();
    await act(async () => {
      await result.current.sendMessage();
    });
    expect(m.coreSendMessage).toHaveBeenCalledTimes(1);
    expect(m.publishText).not.toHaveBeenCalled();
  });

  it("holds a retained opening request until an externally managed agent joins", async () => {
    const m = freshMocks(false);
    const resolveOpeningRequest = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook((p: Params) => useDeferredAgent(p), {
      initialProps: makeParams(m, { openingRequest: "do the thing", resolveOpeningRequest }),
    });
    expect(result.current.deferredAgent?.queued).toHaveLength(1);
    expect(resolveOpeningRequest).not.toHaveBeenCalled();
    rerender(makeParams(m, { openingRequest: "do the thing", resolveOpeningRequest, participants: agentRoster }));
    await waitFor(() => expect(resolveOpeningRequest).toHaveBeenCalledWith("deliver"));
    await waitFor(() => expect(result.current.deferredAgent).toBeUndefined());
    expect(m.publishText).not.toHaveBeenCalled();
  });

  it("keeps user input behind a retained opening on an externally managed host without claiming a launch", async () => {
    const m = freshMocks(false);
    const resolveOpeningRequest = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook((p: Params) => useDeferredAgent(p), {
      initialProps: makeParams(m, { openingRequest: "Welcome request", input: "My question", resolveOpeningRequest }),
    });
    await act(async () => { await result.current.sendMessage(); });
    expect(result.current.deferredAgent?.launching).toBe(false);
    expect(result.current.deferredAgent?.queued.map((item) => item.text)).toEqual(["Welcome request", "My question"]);
    expect(m.coreSendMessage).not.toHaveBeenCalled();
    rerender(makeParams(m, { openingRequest: "Welcome request", participants: agentRoster, resolveOpeningRequest }));
    await waitFor(() => expect(result.current.deferredAgent).toBeUndefined());
    expect(resolveOpeningRequest).toHaveBeenCalledWith("deliver");
    expect(m.publishText).toHaveBeenCalledWith("My question", expect.any(Object));
  });

  it("retires a locally queued opening request when the channel reports resolution elsewhere", () => {
    const m = freshMocks();
    const { result, rerender } = renderHook((p: Params) => useDeferredAgent(p), {
      initialProps: makeParams(m, { openingRequest: "do the thing", firstAgentModelPreflight: "selection-required" }),
    });
    expect(result.current.deferredAgent?.queued).toHaveLength(1);
    rerender(makeParams(m, { openingRequest: undefined, firstAgentModelPreflight: "selection-required" }));
    expect(result.current.deferredAgent?.queued ?? []).toHaveLength(0);
    expect(m.onAddAgent).not.toHaveBeenCalled();
    expect(m.publishText).not.toHaveBeenCalled();
  });

  it("routes an openingRequest through the same queue once connected", async () => {
    const m = freshMocks();
    const { result, rerender } = renderHook((p: Params) => useDeferredAgent(p), {
      initialProps: makeParams(m, {
          openingRequest: "do the thing",
        replaySettled: false,
          firstAgentPending: true,
      }),
    },
    );
    // Replay not settled yet → nothing queued; setup card suppressed by the prompt.
    expect(result.current.deferredAgent?.queued.length ?? 0).toBe(0);
    expect(result.current.deferredAgent?.setupActive ?? false).toBe(false);

    // Replay settles → the prompt enqueues and spawns one agent.
    rerender(
      makeParams(m, {
        openingRequest: "do the thing",
        replaySettled: true,
        firstAgentPending: true,
      }),
    );
    await waitFor(() => expect(m.onAddAgent).toHaveBeenCalledTimes(1));
    expect(result.current.deferredAgent?.queued.map((q) => q.text)).toEqual(["do the thing"]);
  });

  it("does not replay an opening prompt or launch an agent when an existing panel remounts", async () => {
    const m = freshMocks();
    const failedInstalledAgent = new Map([
      [
        "ai-chat",
        {
          agentId: AGENT.id,
          status: "error" as const,
          error: { message: "Existing agent is still rehydrating" },
        },
      ],
    ]);
    const { result } = renderHook((p: Params) => useDeferredAgent(p), {
      initialProps: makeParams(m, {
        openingRequest: undefined,
        replaySettled: true,
        pendingAgents: failedInstalledAgent,
        firstAgentPending: false,
      }),
    });

    await act(async () => Promise.resolve());

    expect(result.current.deferredAgent).toBeUndefined();
    expect(m.onAddAgent).not.toHaveBeenCalled();
    expect(m.publishText).not.toHaveBeenCalled();
  });

  it("resumes an unresolved opening request for an existing agent without launching another", async () => {
    const m = freshMocks();
    const resolveOpeningRequest = vi.fn().mockResolvedValue(undefined);
    renderHook((p: Params) => useDeferredAgent(p), {
      initialProps: makeParams(m, {
        firstAgentPending: false,
        openingRequest: "Resume the retained opening",
        participants: agentRoster,
        resolveOpeningRequest,
      }),
    });

    await waitFor(() => expect(resolveOpeningRequest).toHaveBeenCalledWith("deliver"),
    );
    expect(m.onAddAgent).not.toHaveBeenCalled();
    expect(m.publishText).not.toHaveBeenCalled();
  });

  it("holds an openingRequest for explicit model selection before launching", async () => {
    const m = freshMocks();
    const { result } = renderHook((p: Params) => useDeferredAgent(p), {
      initialProps: makeParams(m, {
        openingRequest: "help me get onboarded",
        modelCatalog: MODEL_CATALOG,
        defaultModelRef: WORKSPACE_MODEL,
        defaultAgentConfig: { model: WORKSPACE_MODEL },
        firstAgentModelPreflight: "selection-required",
      }),
    });

    await waitFor(() =>
      expect(result.current.deferredAgent?.queued.map((q) => q.text)).toEqual([
        "help me get onboarded",
      ])
    );
    expect(result.current.deferredAgent?.setupActive).toBe(true);
    expect(result.current.deferredAgent?.modelSelectionRequired).toBe(true);
    expect(m.onAddAgent).not.toHaveBeenCalled();

    act(() => result.current.deferredAgent?.startQueued());

    await waitFor(() => expect(m.onAddAgent).toHaveBeenCalledTimes(1));
    expect(m.onAddAgent).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ model: WORKSPACE_MODEL })
    );
  });

  it("cannot start a queued conversation with a model that still needs setup", async () => {
    const m = freshMocks();
    const unavailableCatalog: ModelCatalog = {
      providers: [],
      models: [
        makeTestCatalogEntry({
          ref: "local:lfm2.5-2.6b",
          id: "lfm2.5-2.6b",
          name: "LFM2.5 2.6B",
          provider: "local",
          baseUrl: "http://127.0.0.1:0/v1",
          availability: { state: "needs-setup", detail: "not-installed" },
        }),
      ],
    };
    const { result } = renderHook((p: Params) => useDeferredAgent(p), {
      initialProps: makeParams(m, {
        openingRequest: "help me get onboarded",
        modelCatalog: unavailableCatalog,
        defaultModelRef: "local:lfm2.5-2.6b",
        defaultAgentConfig: { model: "local:lfm2.5-2.6b" },
        firstAgentModelPreflight: "selection-required",
      }),
    });

    await waitFor(() => expect(result.current.deferredAgent?.queued).toHaveLength(1));
    act(() => result.current.deferredAgent?.startQueued());

    expect(m.onAddAgent).not.toHaveBeenCalled();
    expect(result.current.deferredAgent?.launching).toBe(false);
  });

  it("keeps the opening message queued until provider connection completes", async () => {
    const m = freshMocks();
    const needsSetupCatalog: ModelCatalog = {
      providers: [],
      models: [
        makeTestCatalogEntry({
          ref: WORKSPACE_MODEL,
          id: "gpt-6.1-sol",
          name: "GPT-6.1 Sol",
          provider: "openai-codex",
          baseUrl: "https://chatgpt.com/backend-api",
          availability: { state: "needs-setup", detail: "no-credential" },
        }),
      ],
    };
    const configured = {
      openingRequest: "help me get onboarded",
      defaultModelRef: WORKSPACE_MODEL,
      defaultAgentConfig: { model: WORKSPACE_MODEL },
    };
    const { result, rerender } = renderHook((p: Params) => useDeferredAgent(p), {
      initialProps: makeParams(m, {
        ...configured,
        modelCatalog: needsSetupCatalog,
        firstAgentModelPreflight: "selection-required",
      }),
    });

    await waitFor(() => expect(result.current.deferredAgent?.queued).toHaveLength(1));
    expect(result.current.deferredAgent?.setupActive).toBe(true);
    expect(m.onAddAgent).not.toHaveBeenCalled();

    act(() => result.current.deferredAgent?.startQueued());

    expect(m.onAddAgent).not.toHaveBeenCalled();
    rerender(makeParams(m, { ...configured, firstAgentModelPreflight: "selection-required", modelCatalog: { ...needsSetupCatalog, models: needsSetupCatalog.models.map((model) => ({ ...model, availability: { state: "ready", detail: "credentialed" } })) } }));
    act(() => result.current.deferredAgent?.startQueued());
    await waitFor(() => expect(m.onAddAgent).toHaveBeenCalledTimes(1));
    expect(m.onAddAgent).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ model: WORKSPACE_MODEL })
    );
  });

  it("waits for model discovery before auto-launching an openingRequest", async () => {
    const m = freshMocks();
    const configured = {
      openingRequest: "help me get onboarded",
      modelCatalog: MODEL_CATALOG,
      defaultModelRef: WORKSPACE_MODEL,
      defaultAgentConfig: { model: WORKSPACE_MODEL },
    };
    const { result, rerender } = renderHook((p: Params) => useDeferredAgent(p), {
      initialProps: makeParams(m, {
        ...configured,
        firstAgentModelPreflight: "checking",
      }),
    });

    await waitFor(() => expect(result.current.deferredAgent?.queued).toHaveLength(1));
    expect(m.onAddAgent).not.toHaveBeenCalled();
    expect(result.current.deferredAgent?.modelDiscoveryPending).toBe(true);

    rerender(
      makeParams(m, {
        ...configured,
        firstAgentModelPreflight: "ready",
      })
    );
    await waitFor(() => expect(m.onAddAgent).toHaveBeenCalledTimes(1));
    expect(result.current.deferredAgent?.modelDiscoveryPending).toBe(false);
  });

  it("launches an openingRequest with the effective panel model when the catalog loads first", async () => {
    const m = freshMocks();
    const configured = {
      openingRequest: "run system tests",
      modelCatalog: MODEL_CATALOG,
      defaultModelRef: WORKSPACE_MODEL,
      defaultAgentConfig: { model: PANEL_MODEL },
    };
    const { rerender } = renderHook((p: Params) => useDeferredAgent(p), {
      initialProps: makeParams(m, {
        ...configured,
        availableAgents: [],
        replaySettled: false,
      }),
    });

    // Model settings arrive before the agent gallery. Once the gallery and
    // replay are ready, the deferred auto-spawn must retain the panel override.
    rerender(
      makeParams(m, {
        ...configured,
        availableAgents: [AGENT],
        replaySettled: true,
      })
    );

    await waitFor(() => expect(m.onAddAgent).toHaveBeenCalledTimes(1));
    expect(m.onAddAgent).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ model: PANEL_MODEL })
    );
  });

  it("launches an openingRequest with the panel model before the catalog loads", async () => {
    const m = freshMocks();
    const { rerender } = renderHook((p: Params) => useDeferredAgent(p), {
      initialProps: makeParams(m, {
        openingRequest: "run system tests",
        availableAgents: [AGENT],
        modelCatalog: null,
        defaultModelRef: null,
        defaultAgentConfig: { model: PANEL_MODEL },
        replaySettled: true,
      }),
    });

    await waitFor(() => expect(m.onAddAgent).toHaveBeenCalledTimes(1));
    expect(m.onAddAgent).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ model: PANEL_MODEL })
    );

    // A later catalog refresh must neither replace the snapshotted intent nor
    // issue a second launch.
    rerender(
      makeParams(m, {
        openingRequest: "run system tests",
        availableAgents: [AGENT],
        modelCatalog: MODEL_CATALOG,
        defaultModelRef: WORKSPACE_MODEL,
        defaultAgentConfig: { model: PANEL_MODEL },
        replaySettled: true,
      }),
    );
    await act(async () => Promise.resolve());
    expect(m.onAddAgent).toHaveBeenCalledTimes(1);
  });

  it("updates an untouched draft when the effective model arrives after the catalog", async () => {
    const m = freshMocks();
    const { rerender } = renderHook((p: Params) => useDeferredAgent(p), {
      initialProps: makeParams(m, {
        openingRequest: "run system tests",
        availableAgents: [],
        modelCatalog: MODEL_CATALOG,
        defaultModelRef: WORKSPACE_MODEL,
        defaultAgentConfig: null,
        replaySettled: true,
      }),
    });

    // The prompt is already armed while the gallery is unavailable. The panel
    // override and gallery then arrive together, which used to launch the stale
    // catalog default because a non-empty draft was never reseeded.
    rerender(
      makeParams(m, {
        openingRequest: "run system tests",
        availableAgents: [AGENT],
        modelCatalog: MODEL_CATALOG,
        defaultModelRef: WORKSPACE_MODEL,
        defaultAgentConfig: { model: PANEL_MODEL },
        replaySettled: true,
      }),
    );

    await waitFor(() => expect(m.onAddAgent).toHaveBeenCalledTimes(1));
    expect(m.onAddAgent).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ model: PANEL_MODEL })
    );
  });

  it("preserves a user-selected model when effective defaults arrive late", async () => {
    const m = freshMocks();
    const { result, rerender } = renderHook((p: Params) => useDeferredAgent(p), {
      initialProps: makeParams(m, {
        input: "run system tests",
        modelCatalog: MODEL_CATALOG,
        defaultModelRef: WORKSPACE_MODEL,
        defaultAgentConfig: null,
      }),
    });
    await waitFor(() => expect(result.current.deferredAgent?.draft.model).toBe(WORKSPACE_MODEL));

    act(() => {
      const current = result.current.deferredAgent!.draft;
      result.current.deferredAgent!.setDraft({ ...current, model: USER_MODEL });
    });
    rerender(
      makeParams(m, {
        input: "run system tests",
        modelCatalog: MODEL_CATALOG,
        defaultModelRef: WORKSPACE_MODEL,
        defaultAgentConfig: { model: PANEL_MODEL },
      })
    );

    await act(async () => {
      await result.current.sendMessage();
    });
    expect(m.onAddAgent).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ model: USER_MODEL })
    );
  });

  it("applies a late effective model when the user only touched another field", async () => {
    const m = freshMocks();
    const { result, rerender } = renderHook((p: Params) => useDeferredAgent(p), {
      initialProps: makeParams(m, {
        input: "run system tests",
        modelCatalog: MODEL_CATALOG,
        defaultModelRef: WORKSPACE_MODEL,
        defaultAgentConfig: null,
      }),
    });
    await waitFor(() => expect(result.current.deferredAgent?.draft.model).toBe(WORKSPACE_MODEL));

    act(() => {
      const current = result.current.deferredAgent!.draft;
      result.current.deferredAgent!.setDraft({ ...current, approvalLevel: 1 });
    });
    rerender(
      makeParams(m, {
        input: "run system tests",
        modelCatalog: MODEL_CATALOG,
        defaultModelRef: WORKSPACE_MODEL,
        defaultAgentConfig: { model: PANEL_MODEL },
      })
    );
    await waitFor(() => expect(result.current.deferredAgent?.draft.model).toBe(PANEL_MODEL));

    await act(async () => {
      await result.current.sendMessage();
    });
    expect(m.onAddAgent).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ model: PANEL_MODEL, approvalLevel: 1 })
    );
  });

  it("retries an openingRequest with the exact model used by its first launch attempt", async () => {
    const m = freshMocks();
    m.onAddAgent = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error("launch failed");
      })
      .mockResolvedValueOnce(undefined);
    const { result, rerender } = renderHook((p: Params) => useDeferredAgent(p), {
      initialProps: makeParams(m, {
          openingRequest: "run system tests",
        modelCatalog: MODEL_CATALOG,
        defaultModelRef: WORKSPACE_MODEL,
        defaultAgentConfig: { model: PANEL_MODEL },
      }),
    },
    );
    await waitFor(() => expect(result.current.deferredAgent?.launchFailed).toBe(true));
    expect(m.onAddAgent).toHaveBeenNthCalledWith(
      1,
      undefined,
      expect.objectContaining({ model: PANEL_MODEL })
    );

    // Changing defaults after the failed attempt must not mutate the committed
    // launch intent used for a retry.
    rerender(
      makeParams(m, {
        openingRequest: "run system tests",
        modelCatalog: MODEL_CATALOG,
        defaultModelRef: WORKSPACE_MODEL,
        defaultAgentConfig: { model: WORKSPACE_MODEL },
      }),
    );
    act(() => result.current.deferredAgent?.retryLaunch());

    await waitFor(() => expect(m.onAddAgent).toHaveBeenCalledTimes(2));
    expect(m.onAddAgent).toHaveBeenNthCalledWith(
      2,
      undefined,
      expect.objectContaining({ model: PANEL_MODEL })
    );
  });

  it("keeps setup available until the channel has had its first agent", () => {
    const m = freshMocks();
    const { result } = renderHook((p: Params) => useDeferredAgent(p), {
      initialProps: makeParams(m, { firstAgentPending: true }),
    });
    expect(result.current.deferredAgent?.setupActive).toBe(true);
  });

  it("keeps the setup card hidden after an agent leaves (ever-had-agent latch)", () => {
    const m = freshMocks();
    const { result, rerender } = renderHook((p: Params) => useDeferredAgent(p), {
      initialProps: makeParams(m, { participants: agentRoster }),
    });
    expect(result.current.deferredAgent).toBeUndefined(); // agent present
    // Agent idle-stops → roster empties, nothing pending. Even with no messages,
    // the setup card must not take over the conversation.
    rerender(makeParams(m, { participants: {} }));
    expect(result.current.deferredAgent?.setupActive ?? false).toBe(false);
  });

  it("surfaces a launch failure and retries on demand", async () => {
    const m = freshMocks();
    m.onAddAgent = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(undefined);
    const { result } = renderHook((p: Params) => useDeferredAgent(p), {
      initialProps: makeParams(m, { input: "hello" }),
    });
    await act(async () => {
      await result.current.sendMessage();
    });
    await waitFor(() => expect(result.current.deferredAgent?.launchFailed).toBe(true));
    expect(m.onAddAgent).toHaveBeenCalledTimes(1);
    // Retry re-issues the spawn (this attempt resolves) and clears the error.
    await act(async () => {
      result.current.deferredAgent?.retryLaunch();
    });
    await waitFor(() => expect(m.onAddAgent).toHaveBeenCalledTimes(2));
    expect(result.current.deferredAgent?.launchFailed).toBe(false);
  });

  it("spawns once the agent gallery loads, even if the user sent first", async () => {
    const m = freshMocks();
    const { result, rerender } = renderHook((p: Params) => useDeferredAgent(p), {
      initialProps: makeParams(m, { input: "hello", availableAgents: [] }),
    });
    await act(async () => {
      await result.current.sendMessage();
    });
    // No agent types yet → the message is held, but nothing is spawned.
    expect(m.onAddAgent).not.toHaveBeenCalled();
    expect(result.current.deferredAgent?.queued.length).toBe(1);
    // Gallery loads → the spawn-driver fires.
    rerender(makeParams(m, { input: "", availableAgents: [AGENT] }));
    await waitFor(() => expect(m.onAddAgent).toHaveBeenCalledTimes(1));
  });

  it("spawns with the host default (undefined id) when no type was picked", async () => {
    const m = freshMocks();
    const { result } = renderHook((p: Params) => useDeferredAgent(p), {
      initialProps: makeParams(m, { input: "hello" }),
    });
    await act(async () => {
      await result.current.sendMessage();
    });
    await waitFor(() => expect(m.onAddAgent).toHaveBeenCalledTimes(1));
    // undefined id lets the panel honor a caller-pinned agentSource/agentClass.
    expect(m.onAddAgent).toHaveBeenCalledWith(undefined, expect.any(Object));
    // The seeded draft handle must NOT leak onto the spawn — the host derives a
    // valid handle for the resolved agent (the inline setup has no handle field).
    expect(m.onAddAgent!.mock.calls[0]?.[1]).not.toHaveProperty("handle");
    // Untouched UI fallbacks must not mask workspace defaults that may resolve in
    // the host at spawn time.
    expect(m.onAddAgent!.mock.calls[0]?.[1]).not.toHaveProperty("approvalLevel");
  });

  it("locks the spawn type at send time even if the selection changes before launch", async () => {
    const m = freshMocks();
    // Gallery not loaded yet → the send is held (canSpawn false), not spawned.
    const { result, rerender } = renderHook((p: Params) => useDeferredAgent(p), {
      initialProps: makeParams(m, { input: "hello", availableAgents: [] }),
    });
    act(() => result.current.deferredAgent?.setAgentId("workers/agent-worker"));
    await act(async () => {
      await result.current.sendMessage();
    });
    expect(m.onAddAgent).not.toHaveBeenCalled();
    // A stray later selection change must NOT alter what this message committed to.
    act(() => result.current.deferredAgent?.setAgentId("workers/other"));
    rerender(makeParams(m, { input: "", availableAgents: [AGENT] }));
    await waitFor(() => expect(m.onAddAgent).toHaveBeenCalledTimes(1));
    expect(m.onAddAgent).toHaveBeenCalledWith("workers/agent-worker", expect.any(Object));
  });

  it("shows the setup card only once replay has settled (brand-new chat)", () => {
    const m = freshMocks();
    const { result, rerender } = renderHook((p: Params) => useDeferredAgent(p), {
      initialProps: makeParams(m, { replaySettled: false }),
    });
    // Replay not settled → empty `messages` isn't yet a trustworthy "new chat".
    expect(result.current.deferredAgent?.setupActive ?? false).toBe(false);
    rerender(makeParams(m, { replaySettled: true }));
    expect(result.current.deferredAgent?.setupActive).toBe(true);
  });

  it("does not offer first-agent setup for a conversation whose agent already joined", () => {
    const m = freshMocks();
    // Reopened agentless channel: history is mid-replay (not settled, empty yet).
    const { result, rerender } = renderHook((p: Params) => useDeferredAgent(p), {
      initialProps: makeParams(m, { replaySettled: false,
          firstAgentPending: false,
        }),
    },
    );
    expect(result.current.deferredAgent?.setupActive ?? false).toBe(false);
    // Replay settles and reveals the history → still no setup card.
    rerender(
      makeParams(m, {
        replaySettled: true,
        firstAgentPending: false,
      }),
    );
    expect(result.current.deferredAgent?.setupActive ?? false).toBe(false);
  });
});
