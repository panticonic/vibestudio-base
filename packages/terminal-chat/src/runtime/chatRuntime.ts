/**
 * The terminal chat's runtime: one conversation at a time, each a
 * `ChatHostController` + `ChatSession` pair from the shared chat core
 * (`stream` delivery over the program's RPC client). Switching conversation
 * (new chat, resume, fork) disposes the pair and builds the next one, the
 * way the chat panel remounts. Everything protocol-related goes through the
 * store; this module only wires ports and keeps the app-level bits the core
 * does not own (pending forms, provider sign-in, notices).
 */
import {
  ChatHostController,
  ChatSession,
  StateCell,
  chatHostActionData,
  errorMessage,
  type ChatHostSnapshot,
  type ChatHostState,
  type ReadableStore,
  type StateArgsPort,
} from "@workspace/agentic-core/chat-store";
import { AGENTIC_EVENT_PAYLOAD_KIND, type AgenticEvent } from "@workspace/agentic-protocol";
import { FeedbackFormArgsSchema, type FeedbackFormArgs, type MethodExecutionContext } from "@workspace/pubsub";
import { listChannelDurableObjectEntities } from "@vibestudio/shared/channelTarget";
import { mainRpcMethods } from "@vibestudio/service-schemas/mainRpc";
import type { FeedbackResult } from "../model/forms.js";
import type { TerminalChatBootstrap } from "./bootstrap.js";
import { ProviderSignIn } from "./providerSignIn.js";
import { ValueStore } from "./valueStore.js";

const CONVERSATION_CONTEXT_KEY = "conversationContextId";

export interface PendingForm {
  id: string;
  args: FeedbackFormArgs;
  from: string;
  answer(result: FeedbackResult): void;
}

export interface Notice {
  id: number;
  tone: "info" | "success" | "warning" | "error";
  title: string;
  /** What to do next, in one sentence. */
  message?: string;
  /** Technical detail, shown on request. */
  detail?: string;
}

export interface ChatRuntimeSnapshot {
  /** Context of the conversation on screen (a fork may live in another context). */
  contextId: string;
  /** Host state of the current conversation; null before the first one opens. */
  host: ChatHostSnapshot | null;
  /** The current conversation's session; replaced (new identity) on every switch. */
  session: ChatSession | null;
  forms: readonly PendingForm[];
  notices: readonly Notice[];
  connection: "connected" | "connecting" | "disconnected";
  /** Monotonic id of the conversation; the UI resets per-conversation view state on change. */
  generation: number;
}

export interface ChatRuntimePorts {
  /** The conversation title changed (the terminal sets its window title). */
  presentTitle?(title: string): void;
}

export interface ChannelListing {
  channelId: string;
  contextId: string;
  createdAt: number;
  current: boolean;
}

/** Adapts the session state store to the controller's typed state port. */
function stateArgsPort(store: TerminalChatBootstrap["state"]): StateArgsPort {
  return {
    get: () => store.get() as ChatHostState,
    patch: (partial) => store.patch(partial as Record<string, unknown>),
    subscribe: (listener) => store.subscribe(listener),
  };
}

/** One line of program output the screen does not show directly (console, library warnings). */
export interface DiagnosticLine {
  at: number;
  level: "debug" | "info" | "warn" | "error";
  text: string;
}

const MAX_DIAGNOSTICS = 300;

export class ChatRuntime implements ReadableStore<ChatRuntimeSnapshot> {
  readonly signIn: ProviderSignIn;
  /** Recent diagnostics (newest last), for the palette's "Show diagnostics". */
  readonly diagnostics = new ValueStore<readonly DiagnosticLine[]>([]);
  readonly #boot: TerminalChatBootstrap;
  readonly #ports: ChatRuntimePorts;
  readonly #state: StateArgsPort;
  readonly #cell: StateCell<ChatRuntimeSnapshot>;
  #controller: ChatHostController | null = null;
  #releaseController: (() => void) | null = null;
  #controllerOff: (() => void) | null = null;
  #session: ChatSession | null = null;
  #releaseSession: (() => void) | null = null;
  #retrySignal = 0;
  #noticeId = 0;
  #disposed = false;
  #offConnection: (() => void) | null = null;

  constructor(boot: TerminalChatBootstrap, ports: ChatRuntimePorts = {}) {
    this.#boot = boot;
    this.#ports = ports;
    this.#state = stateArgsPort(boot.state);
    this.signIn = new ProviderSignIn(boot.rpc, {
      afterConnected: () => this.#controller?.retryModelSettings(),
    });
    const contextId = this.#conversationContextId();
    this.#cell = new StateCell<ChatRuntimeSnapshot>({
      contextId,
      host: null,
      session: null,
      forms: [],
      notices: [],
      connection: boot.rpc.status(),
      generation: 0,
    });
  }

  readonly getSnapshot = (): ChatRuntimeSnapshot => this.#cell.getSnapshot();
  readonly subscribe = (listener: () => void): (() => void) => this.#cell.subscribe(listener);

  get rpc(): TerminalChatBootstrap["rpc"] {
    return this.#boot.rpc;
  }

  get files(): TerminalChatBootstrap["files"] {
    return this.#boot.files;
  }

  get controller(): ChatHostController | null {
    return this.#controller;
  }

  start(): void {
    this.#offConnection = this.#boot.rpc.onStatusChange((connection) => this.#cell.update({ connection }));
    this.#openConversation();
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#offConnection?.();
    this.#closeConversation();
    this.signIn.cancel();
  }

  // ── notices ────────────────────────────────────────────────────────────────

  /** Keep a diagnostic line (bounded). */
  recordDiagnostic(level: DiagnosticLine["level"], text: string): void {
    const lines = this.diagnostics.getSnapshot();
    this.diagnostics.set([...lines.slice(-(MAX_DIAGNOSTICS - 1)), { at: Date.now(), level, text }]);
  }

  notify(notice: Omit<Notice, "id">): void {
    const next = { ...notice, id: ++this.#noticeId };
    this.#cell.update({ notices: [...this.getSnapshot().notices.slice(-4), next] });
  }

  /** Report a failed user action: what failed, why, and the next step. */
  fail(title: string, error: unknown, message?: string): void {
    this.notify({ tone: "error", title, message: message ?? errorMessage(error), detail: detailOf(error) });
  }

  dismissNotice(id?: number): void {
    const notices = this.getSnapshot().notices;
    this.#cell.update({ notices: id === undefined ? notices.slice(0, -1) : notices.filter((n) => n.id !== id) });
  }

  // ── conversations ──────────────────────────────────────────────────────────

  /** Start a new conversation in this terminal session's own context. */
  async newConversation(): Promise<void> {
    await this.#switchTo({ channelName: null, contextId: this.#boot.contextId });
  }

  /** Switch to an existing conversation (resume, or a fork in its own context). */
  async openConversation(channelId: string, contextId: string): Promise<void> {
    await this.#switchTo({ channelName: channelId, contextId });
  }

  /** Conversations (channels) in the current conversation's context, newest first. */
  async listConversations(): Promise<ChannelListing[]> {
    const rpc = this.#boot.rpc;
    const entities = await listChannelDurableObjectEntities({
      listServices: () => rpc.call("main", mainRpcMethods["workers.listServices"], []),
      listDurableObjectEntities: async () =>
        (await rpc.call("main", mainRpcMethods["runtime.listEntities"], [{ kind: "do" }])).filter(
          (entity): entity is typeof entity & { kind: "do" } => entity.kind === "do"
        ),
    });
    const contextId = this.getSnapshot().contextId;
    const current = this.getSnapshot().host?.channelName ?? null;
    return entities
      .filter((entity) => entity.contextId === contextId)
      .map((entity) => ({
        channelId: entity.key,
        contextId: entity.contextId,
        createdAt: entity.createdAt,
        current: entity.key === current,
      }))
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  async #switchTo(target: { channelName: string | null; contextId: string }): Promise<void> {
    // The conversation's agents are the ones on its own roster (a fork has its
    // own clones); read them while the current host is still open.
    const conversation =
      target.channelName && this.#controller
        ? await this.#controller.conversationState(target.channelName)
        : { channelName: target.channelName, installedAgents: null };
    if (this.#disposed) return;
    const patch: Record<string, unknown> = {
      ...conversation,
      [CONVERSATION_CONTEXT_KEY]: target.contextId === this.#boot.contextId ? null : target.contextId,
    };
    this.#closeConversation();
    await this.#boot.state.patch(patch);
    if (this.#disposed) return;
    this.#openConversation();
  }

  #conversationContextId(): string {
    const stored = this.#boot.state.get()[CONVERSATION_CONTEXT_KEY];
    return typeof stored === "string" && stored ? stored : this.#boot.contextId;
  }

  #openConversation(): void {
    const contextId = this.#conversationContextId();
    const controller = new ChatHostController({
      rpc: this.#boot.rpc,
      contextId,
      state: this.#state,
      // One host instance per conversation context, as a chat panel gets a new
      // runtime when it switches to a fork's context: agent identities derived
      // from it must not collide across contexts.
      instanceId: `terminal-chat:${this.#boot.sessionId}:${contextId}`,
      connection: this.#boot.rpc,
      notify: (notification) =>
        this.notify({
          tone: notification.type === "info" ? "info" : notification.type,
          title: notification.title,
          ...(notification.message ? { message: notification.message } : {}),
        }),
    });
    this.#controller = controller;
    this.#releaseController = controller.retain();
    this.#retrySignal = controller.getSnapshot().connectionRetrySignal;
    this.#cell.update({
      contextId,
      host: controller.getSnapshot(),
      session: null,
      forms: [],
      generation: this.getSnapshot().generation + 1,
    });
    const onHost = () => {
      const host = controller.getSnapshot();
      this.#cell.transaction(() => {
        this.#cell.update({ host });
        if (host.channelName && !this.#session) this.#createSession(controller, host.channelName, contextId);
        const session = this.#session;
        if (session) {
          session.setAgentHost({ ...controller.actions, ...chatHostActionData(host) });
          if (host.connectionRetrySignal !== this.#retrySignal) {
            this.#retrySignal = host.connectionRetrySignal;
            session.reconnect("host-unblocked");
          }
        }
      });
    };
    this.#controllerOff = controller.subscribe(onHost);
    onHost();
  }

  #createSession(controller: ChatHostController, channelName: string, contextId: string): void {
    const session = new ChatSession({
      config: {
        clientId: `terminal-chat-${this.#boot.sessionId}`,
        rpc: this.#boot.rpc,
        deliveryMode: "stream",
      },
      channelName,
      contextId,
      metadata: { name: "Terminal", type: "panel" },
      agentHost: { ...controller.actions, ...chatHostActionData(controller.getSnapshot()) },
      ports: {
        presentTitle: (title) => this.#ports.presentTitle?.(title),
        observeEvent: (event) => this.#observe(event),
      },
      forkNav: {
        switchTo: (channelId, forkContextId) => this.openConversation(channelId, forkContextId),
        openInNewPanel: (channelId, forkContextId) => this.openConversation(channelId, forkContextId),
        readForkCursors: () => controller.readForkCursors(),
        markForkRead: (channelId, headSeq) => controller.markForkRead(channelId, headSeq),
        onExternalFork: (fork) =>
          this.notify({
            tone: "info",
            title: `${fork.actorName} forked this conversation`,
            message: "Type /forks to see the fork and switch to it.",
          }),
      },
    });
    session.registerMethods("feedback", () => ({
      feedback_form: {
        description: FEEDBACK_FORM_DESCRIPTION,
        parameters: FeedbackFormArgsSchema,
        execute: (args: unknown, ctx: MethodExecutionContext) => this.#showForm(args as FeedbackFormArgs, ctx),
      },
    }));
    this.#session = session;
    this.#releaseSession = session.retain();
    session.start();
    this.#cell.update({ session });
  }

  #closeConversation(): void {
    for (const form of this.getSnapshot().forms) form.answer({ type: "cancel" });
    this.#releaseSession?.();
    this.#releaseSession = null;
    this.#session = null;
    this.#controllerOff?.();
    this.#controllerOff = null;
    this.#releaseController?.();
    this.#releaseController = null;
    this.#controller = null;
    this.#cell.update({ session: null, forms: [] });
  }

  // ── feedback_form ──────────────────────────────────────────────────────────

  #showForm(args: FeedbackFormArgs, ctx: MethodExecutionContext): Promise<FeedbackResult> {
    return new Promise<FeedbackResult>((resolve) => {
      let settled = false;
      const form: PendingForm = {
        id: ctx.callId,
        args,
        from: ctx.callerId,
        answer: (result) => {
          if (settled) return;
          settled = true;
          ctx.signal.removeEventListener("abort", onAbort);
          this.#cell.update({ forms: this.getSnapshot().forms.filter((f) => f !== form) });
          resolve(result);
        },
      };
      const onAbort = () => form.answer({ type: "cancel" });
      ctx.signal.addEventListener("abort", onAbort, { once: true });
      this.#cell.update({ forms: [...this.getSnapshot().forms, form] });
    });
  }

  /** A cancelled or abandoned invocation closes the form it opened (the agent stopped waiting). */
  #observe(event: unknown): void {
    const wire = event as { type?: string; payload?: AgenticEvent };
    if (wire.type !== AGENTIC_EVENT_PAYLOAD_KIND || !wire.payload) return;
    const payload = wire.payload;
    if (payload.kind !== "invocation.cancelled" && payload.kind !== "invocation.abandoned") return;
    const callId = payload.causality?.transportCallId ?? payload.causality?.invocationId;
    const form = this.getSnapshot().forms.find((f) => f.id === callId);
    form?.answer({ type: "cancel" });
  }

  // ── agent methods ──────────────────────────────────────────────────────────

  /** Call an agent method and unwrap `{ result }` / `{ isError }` into a value or a thrown error. */
  async callAgent(participantId: string, method: string, args: unknown): Promise<unknown> {
    const session = this.#session;
    if (!session) throw new Error("The conversation is not connected yet.");
    const response = (await session.callMethodResult(participantId, method, args)) as
      | { result?: unknown; isError?: boolean; error?: string }
      | undefined;
    const result = response && typeof response === "object" && "result" in response ? response.result : response;
    const error =
      (response && typeof response === "object" && (response.isError || response.error) && (response.error ?? (result as { error?: string })?.error)) ||
      (result && typeof result === "object" && "error" in (result as object) && typeof (result as { error?: unknown }).error === "string"
        ? (result as { error: string }).error
        : null);
    if (error) throw new Error(String(error));
    return result;
  }
}

function detailOf(error: unknown): string | undefined {
  if (error instanceof Error && error.stack) return error.stack.split("\n").slice(0, 6).join("\n");
  return undefined;
}

const FEEDBACK_FORM_DESCRIPTION = `Show a form in the person's terminal and wait for the answers. Use it when you need several related inputs or a decision before you can continue; put every question you already know into one form. For one quick question use \`ask_user\`.

**Result:** \`{ type: "submit", value: { fieldKey: userValue, ... } }\` or \`{ type: "cancel" }\`

**Input field types:** string, textarea, number, boolean, toggle, select / segmented / multiSelect (need \`options: [{ value, label, description? }]\`), slider (\`min\`/\`max\`/\`step\`), buttonGroup (\`buttons: [{ value, label, description? }]\`; with \`submitOnSelect: true\` choosing a button answers the form)
**Display field types:** readonly (text), code (\`language\`), diff
**Field props:** \`key\` (required), \`type\` (required), \`label\`, \`default\`, \`required\`, \`description\`, \`placeholder\`, \`order\`
**Conditional props:** \`visibleWhen\` and \`enabledWhen\` accept \`{ field, operator, value }\`.
**Choice fields:** select, segmented and multiSelect include an "Other" free-text choice unless \`allowFreeText: false\`.
**Pre-populate:** \`values: { "key": "existing value" }\`
This client is a text terminal: it cannot show custom components, inline UI or images.`;
