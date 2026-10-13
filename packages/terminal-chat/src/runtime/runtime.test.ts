import { afterEach, describe, expect, it } from "vitest";
import type { MethodExecutionContext } from "@workspace/pubsub";
import type { ChatRpc, SessionStateStore, TerminalChatBootstrap } from "./bootstrap.js";
import { ChatRuntime } from "./chatRuntime.js";
import { ProviderSignIn } from "./providerSignIn.js";

class MemoryState implements SessionStateStore {
  value: Record<string, unknown> = {};
  listeners = new Set<() => void>();
  get = () => this.value;
  async patch(partial: Record<string, unknown>) {
    const next = { ...this.value };
    for (const [key, entry] of Object.entries(partial)) {
      if (entry === null) delete next[key];
      else next[key] = entry;
    }
    this.value = next;
    for (const listener of this.listeners) listener();
  }
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

type EventListener = (event: { payload: unknown }) => void;

function fakeRpc(handlers: Record<string, (args: unknown[]) => unknown> = {}) {
  const events = new Map<string, EventListener>();
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const rpc = {
    selfId: "code:terminal-chat",
    status: () => "connected" as const,
    onStatusChange: () => () => {},
    on: (event: string, listener: EventListener) => {
      events.set(event, listener);
      return () => events.delete(event);
    },
    call: async (_target: string, method: { method?: string; name?: string } | string, args: unknown[]) => {
      const name = typeof method === "string" ? method : (method.method ?? method.name ?? String(method));
      calls.push({ method: name, args });
      const handler = Object.entries(handlers).find(([key]) => name.includes(key))?.[1];
      if (handler) return handler(args);
      throw new Error(`unavailable in this test: ${name}`);
    },
    stream: async () => {
      throw new Error("no streams in this test");
    },
  };
  return { rpc: rpc as unknown as ChatRpc, calls, emit: (event: string, payload: unknown) => events.get(event)?.({ payload }) };
}

function boot(state = new MemoryState(), rpc = fakeRpc().rpc): TerminalChatBootstrap {
  return {
    rpc,
    contextId: "ctx-home",
    sessionId: "s1",
    state,
    files: { read: async () => ({ name: "", mimeType: "", bytes: new Uint8Array() }), writeExport: async () => "" },
  };
}

const runtimes: ChatRuntime[] = [];
afterEach(() => {
  for (const runtime of runtimes.splice(0)) runtime.dispose();
});

function start(state = new MemoryState()) {
  const runtime = new ChatRuntime(boot(state));
  runtimes.push(runtime);
  runtime.start();
  return runtime;
}

describe("ChatRuntime", () => {
  it("mints a conversation in the session's context and opens a session on it", async () => {
    const state = new MemoryState();
    const runtime = start(state);
    await Promise.resolve();
    const snapshot = runtime.getSnapshot();
    expect(snapshot.contextId).toBe("ctx-home");
    expect(snapshot.host?.channelName).toMatch(/^chat-/);
    expect(state.value["channelName"]).toBe(snapshot.host?.channelName);
    expect(snapshot.session?.getSnapshot().channelName).toBe(snapshot.host?.channelName);
  });

  it("starts a new conversation with a fresh channel and no inherited agents", async () => {
    const state = new MemoryState();
    state.value = { channelName: "chat-old", installedAgents: [{ handle: "ai" }] };
    const runtime = start(state);
    const first = runtime.getSnapshot();
    expect(first.host?.channelName).toBe("chat-old");
    await runtime.newConversation();
    const next = runtime.getSnapshot();
    expect(next.generation).toBe(first.generation + 1);
    expect(next.host?.channelName).not.toBe("chat-old");
    expect(state.value["installedAgents"]).toBeUndefined();
    expect(next.session).not.toBe(first.session);
  });

  it("opens a fork in its own context with the fork's own agents, and remembers it across restarts", async () => {
    const state = new MemoryState();
    state.value = { installedAgents: [{ handle: "ai-chat", key: "ai-1" }] };
    const cloned = "do:workers/agent-worker:AiChatWorker:ai-1~fork~abc";
    const runtime = new ChatRuntime(
      boot(
        state,
        fakeRpc({
          "workers.resolveService": (args) => ({
            kind: "durable-object",
            targetId: `do:workers/pubsub-channel:PubSubChannel:${String(args[1])}`,
          }),
          getParticipants: () => [
            { participantId: cloned, metadata: { type: "agent", handle: "ai-chat" } },
          ],
        }).rpc
      )
    );
    runtimes.push(runtime);
    runtime.start();
    await runtime.openConversation("chat-fork", "ctx-fork");
    expect(state.value["installedAgents"]).toEqual([
      {
        agentId: "AiChatWorker",
        handle: "ai-chat",
        key: "ai-1~fork~abc",
        source: "workers/agent-worker",
        className: "AiChatWorker",
      },
    ]);
    expect(runtime.getSnapshot().contextId).toBe("ctx-fork");
    expect(state.value["conversationContextId"]).toBe("ctx-fork");
    const again = start(state);
    expect(again.getSnapshot().contextId).toBe("ctx-fork");
    expect(again.getSnapshot().host?.channelName).toBe("chat-fork");
  });

  it("advertises feedback_form only, and turns a call into a pending form until answered or cancelled", async () => {
    const runtime = start();
    const session = runtime.getSnapshot().session!;
    const methods = session.methods.compose();
    expect(Object.keys(methods)).toEqual(["feedback_form"]);
    const abort = new AbortController();
    const ctx = { callId: "c1", callerId: "ai", signal: abort.signal } as unknown as MethodExecutionContext;
    const answered = methods["feedback_form"]!.execute({ title: "Q", fields: [] }, ctx);
    expect(runtime.getSnapshot().forms.map((f) => f.id)).toEqual(["c1"]);
    runtime.getSnapshot().forms[0]!.answer({ type: "submit", value: { a: 1 } });
    await expect(answered).resolves.toEqual({ type: "submit", value: { a: 1 } });
    expect(runtime.getSnapshot().forms).toEqual([]);

    const cancelled = methods["feedback_form"]!.execute({ title: "Q2", fields: [] }, { ...ctx, callId: "c2" });
    abort.abort();
    await expect(cancelled).resolves.toEqual({ type: "cancel" });
  });

  it("keeps a bounded list of notices", () => {
    const runtime = start();
    for (let i = 0; i < 8; i++) runtime.notify({ tone: "info", title: `n${i}` });
    expect(runtime.getSnapshot().notices.map((n) => n.title)).toEqual(["n3", "n4", "n5", "n6", "n7"]);
    runtime.dismissNotice();
    expect(runtime.getSnapshot().notices).toHaveLength(4);
  });
});

describe("ProviderSignIn", () => {
  it("explains providers it cannot connect from a terminal", async () => {
    const signIn = new ProviderSignIn(fakeRpc().rpc, { afterConnected: () => {} });
    await signIn.connect("no-such-provider");
    expect(signIn.getSnapshot()).toMatchObject({ phase: "error", title: "Can't connect No Such Provider here", message: expect.stringContaining("Known providers:") });
  });

  it("shows the authorize link, validates the pasted callback, and completes", async () => {
    let finish!: (value: unknown) => void;
    const { rpc, calls, emit } = fakeRpc({
      "credentials.connect": () => new Promise((resolve) => (finish = resolve)),
      "credentials.forwardOAuthCallback": () => {
        finish({ id: "cred" });
        return undefined;
      },
    });
    let connected = 0;
    const signIn = new ProviderSignIn(rpc, { afterConnected: () => connected++ });
    const provider = ProviderSignIn.providers().find((p) => ProviderSignIn.unsupportedReason(p.id) === null)!;
    const done = signIn.connect(provider.id);
    expect(signIn.getSnapshot().phase).toBe("starting");
    emit("external-open:open", {
      url: "https://auth.example.com/authorize?x=1",
      oauthLoopback: { transactionId: "t1", redirectUri: "http://localhost:1455/callback", state: "s-123" },
    });
    expect(signIn.getSnapshot()).toMatchObject({ phase: "waiting", url: "https://auth.example.com/authorize?x=1", callbackOrigin: "http://localhost:1455" });
    await signIn.paste("not a url");
    expect(signIn.getSnapshot()).toMatchObject({ phase: "waiting", pasteError: expect.stringContaining("not a web address") });
    await signIn.paste("http://localhost:1455/callback?code=c&state=other");
    expect(signIn.getSnapshot()).toMatchObject({ pasteError: expect.stringContaining("different sign-in") });
    await signIn.paste("http://localhost:1455/callback?code=c&state=s-123");
    await expect(done).resolves.toBe(true);
    expect(signIn.getSnapshot()).toMatchObject({ phase: "done" });
    expect(connected).toBe(1);
    expect(calls.find((c) => c.method.includes("forwardOAuthCallback"))?.args).toEqual([
      { transactionId: "t1", url: "http://localhost:1455/callback?code=c&state=s-123", state: "s-123" },
    ]);
  });

  it("cancels the server transaction when the person gives up", async () => {
    const { rpc, calls, emit } = fakeRpc({ "credentials.connect": () => new Promise(() => {}), "credentials.cancelOAuth": () => undefined });
    const signIn = new ProviderSignIn(rpc, { afterConnected: () => {} });
    const provider = ProviderSignIn.providers().find((p) => ProviderSignIn.unsupportedReason(p.id) === null)!;
    void signIn.connect(provider.id);
    emit("external-open:open", { url: "https://a", oauthLoopback: { transactionId: "t9", redirectUri: "http://localhost:1/cb", state: "s" } });
    signIn.cancel();
    expect(signIn.getSnapshot().phase).toBe("idle");
    expect(calls.some((c) => c.method.includes("cancelOAuth"))).toBe(true);
  });
});
