/**
 * Test doubles: an Ink stdout that keeps frames, an input source tests type
 * into, and a fake runtime/session pair with the chat core's store shapes.
 */
import { EventEmitter } from "node:events";
import type { ChatMessage } from "@workspace/agentic-core";
import type { ChatHostSnapshot, ChatSessionSnapshot } from "@workspace/agentic-core/chat-store";
import { stripAnsi } from "../model/ansi.js";
import type { ChatRuntime, ChatRuntimeSnapshot, Notice, PendingForm } from "../runtime/chatRuntime.js";
import type { SignInState } from "../runtime/providerSignIn.js";
import { ValueStore } from "../runtime/valueStore.js";
import type { InputSource } from "../ui/hooks.js";

export class FrameStdout extends EventEmitter {
  readonly isTTY = true;
  frames: string[] = [];
  constructor(
    public columns: number,
    public rows: number
  ) {
    super();
  }
  write(frame: string): boolean {
    this.frames.push(frame);
    return true;
  }
  /** The last frame as plain text lines. */
  screen(): string[] {
    return stripAnsi(this.frames.at(-1) ?? "").split("\n");
  }
  resize(columns: number, rows: number): void {
    this.columns = columns;
    this.rows = rows;
    this.emit("resize");
  }
}

export class TypedInput implements InputSource {
  readonly #listeners = new Set<(chunk: string) => void>();
  subscribe(listener: (chunk: string) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
  type(chunk: string): void {
    for (const listener of this.#listeners) listener(chunk);
  }
}

export interface FakeCalls {
  submitted: Array<{ text: string; options: unknown }>;
  interrupted: string[];
  flushed: number;
  agentCalls: Array<{ id: string; method: string; args: unknown }>;
  loadEarlier: number;
}

const HOST: ChatHostSnapshot = {
  channelName: "chat-1",
  availableAgents: [],
  modelCatalog: {
    providers: [{ id: "openai", label: "OpenAI", baseUrls: [], recommendedModelRef: null, connectable: true }],
    models: [
      { ref: "openai:gpt-5", id: "gpt-5", name: "GPT-5", provider: "openai", availability: { state: "ready" }, recommended: true } as never,
    ],
  },
  workspaceDefaultModelRef: "openai:gpt-5",
  workspaceDefaultAgentConfig: null,
  effectiveDefaultAgentConfig: null,
  firstAgentModelPreflight: "ready",
  modelSettingsError: null,
  agentCatalogError: null,
  recovery: { status: "idle" } as never,
  connectionRetrySignal: 0,
};

export function fakeSessionSnapshot(patch: Partial<ChatSessionSnapshot> = {}): ChatSessionSnapshot {
  return {
    channelName: "chat-1",
    status: "connected",
    connected: true,
    connectionError: null,
    client: null,
    selfId: "me",
    initialization: undefined,
    channelTitle: "Planning",
    participants: {
      me: { id: "me", metadata: { name: "Me", type: "panel" } },
      ai: { id: "ai", metadata: { name: "Assistant", type: "agent", handle: "ai-chat", activeModel: "GPT-5", contextUsage: { usagePercent: 12 } } },
    } as never,
    allParticipants: {
      me: { id: "me", metadata: { name: "Me", type: "panel" } },
      ai: { id: "ai", metadata: { name: "Assistant", type: "agent", handle: "ai-chat" } },
    } as never,
    messages: [],
    view: {} as never,
    hasMoreHistory: false,
    loadingMore: false,
    historyError: null,
    replaySettled: true,
    actionBar: null,
    messageTypes: [],
    hasOpenTurn: false,
    debugEvents: [],
    dirtyRepoWarnings: new Map(),
    pendingAgents: new Map(),
    input: "",
    replyTo: null,
    pendingSendCount: 0,
    afterTurnMessageIds: new Set(),
    flushNarration: undefined,
    undoableAction: undefined,
    agentBusy: false,
    primaryActionIntent: "send",
    ...patch,
  } as ChatSessionSnapshot;
}

export function createFakeChat(initial: Partial<ChatSessionSnapshot> = {}) {
  const calls: FakeCalls = { submitted: [], interrupted: [], flushed: 0, agentCalls: [], loadEarlier: 0 };
  const sessionStore = new ValueStore<ChatSessionSnapshot>(fakeSessionSnapshot(initial));
  const deferredStore = new ValueStore({ deferredAgent: undefined });
  const session = {
    getSnapshot: sessionStore.getSnapshot,
    subscribe: sessionStore.subscribe,
    deferredAgent: deferredStore,
    forks: null,
    options: { config: {} },
    metadata: {},
    setInput: (input: string) => sessionStore.set({ ...sessionStore.getSnapshot(), input }),
    submit: async (_attachments: unknown, options: unknown) => {
      const snapshot = sessionStore.getSnapshot();
      calls.submitted.push({ text: snapshot.input, options });
      const sent: ChatMessage = { id: `sent-${calls.submitted.length}`, senderId: "me", content: snapshot.input, seq: 100 + calls.submitted.length, receipts: { byParticipant: { ai: "read" }, aggregate: "read" } };
      sessionStore.set({ ...snapshot, input: "", messages: [...snapshot.messages, sent] });
    },
    interruptAgent: async (id: string) => {
      calls.interrupted.push(id);
    },
    flushOutboxAndInterrupt: async () => {
      calls.flushed++;
    },
    loadEarlierMessages: async () => {
      calls.loadEarlier++;
    },
    undoLastAction: () => {},
    reconnect: () => {},
  };
  const runtimeStore = new ValueStore<ChatRuntimeSnapshot>({
    contextId: "ctx-1",
    host: HOST,
    session: session as never,
    forms: [],
    notices: [],
    connection: "connected",
    generation: 1,
  });
  const signIn = new ValueStore<SignInState>({ phase: "idle" });
  let noticeId = 0;
  const runtime = {
    getSnapshot: runtimeStore.getSnapshot,
    subscribe: runtimeStore.subscribe,
    signIn: Object.assign(signIn, { dismiss() {}, cancel() {}, paste: async () => {}, connect: async () => true }),
    controller: null,
    diagnostics: new ValueStore([]),
    files: { read: async () => ({ name: "a.txt", mimeType: "text/plain", bytes: new Uint8Array(1) }), writeExport: async (name: string) => `/ws/chat-exports/${name}` },
    rpc: {},
    notify(notice: Omit<Notice, "id">) {
      runtimeStore.set({ ...runtimeStore.getSnapshot(), notices: [...runtimeStore.getSnapshot().notices, { ...notice, id: ++noticeId }] });
    },
    fail(title: string, error: unknown) {
      this.notify({ tone: "error", title, message: String(error) });
    },
    dismissNotice() {
      runtimeStore.set({ ...runtimeStore.getSnapshot(), notices: runtimeStore.getSnapshot().notices.slice(0, -1) });
    },
    async callAgent(id: string, method: string, args: unknown) {
      calls.agentCalls.push({ id, method, args });
      if (method === "getAgentSettings") return { model: "openai:gpt-5", thinkingLevel: "medium", fastMode: false };
      return {};
    },
    async listConversations() {
      return [];
    },
  };
  return {
    runtime: runtime as unknown as ChatRuntime,
    calls,
    update(patch: Partial<ChatSessionSnapshot>) {
      sessionStore.set({ ...sessionStore.getSnapshot(), ...patch });
    },
    snapshot: () => sessionStore.getSnapshot(),
    addForm(form: Omit<PendingForm, "answer">): Promise<unknown> {
      return new Promise((resolve) => {
        const pending: PendingForm = {
          ...form,
          answer: (result) => {
            runtimeStore.set({ ...runtimeStore.getSnapshot(), forms: runtimeStore.getSnapshot().forms.filter((f) => f !== pending) });
            resolve(result);
          },
        };
        runtimeStore.set({ ...runtimeStore.getSnapshot(), forms: [...runtimeStore.getSnapshot().forms, pending] });
      });
    },
    notices: () => runtimeStore.getSnapshot().notices,
  };
}
