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
  type SendOptions,
  type ReadableStore,
} from "@workspace/agentic-core/chat-store";
import { AGENTIC_EVENT_PAYLOAD_KIND, type AgenticEvent } from "@workspace/agentic-protocol";
import {
  FeedbackFormArgsSchema,
  type FeedbackFormArgs,
  type MethodExecutionContext,
} from "@workspace/pubsub";
import { listChannelDurableObjectEntities } from "@vibestudio/shared/channelTarget";
import { mainRpcMethods } from "@vibestudio/service-schemas/mainRpc";
import { isRpcAbortedBy, withRpcAbortSignal } from "@vibestudio/rpc";
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import type { FeedbackResult } from "../model/forms.js";
import type { TerminalChatBootstrap } from "./bootstrap.js";
import { ProviderSignIn } from "./providerSignIn.js";
import { ValueStore } from "./valueStore.js";
import {
  ConversationStateStore,
  type ComposerDraft,
  type ComposerReceipt,
  type PendingFile,
} from "./conversationState.js";
import { conversationQueueStore } from "./queuedDelivery.js";
import { channelClientRpcMethods } from "@workspace/pubsub/rpc-contract";
import type { ChatMessage } from "@workspace/agentic-core";
import { exportFileName, exportMarkdown } from "../model/export.js";

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
  composer: ComposerDraft;
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
  title: string;
}

/** Adapts the session state store to the controller's typed state port. */
/** One line of program output the screen does not show directly (console, library warnings). */
export interface DiagnosticLine {
  at: number;
  level: "debug" | "info" | "warn" | "error";
  text: string;
}

const MAX_DIAGNOSTICS = 300;

interface ConversationScope {
  submission?: ComposerReceipt;
  parent: ConversationScope | null;
  key: string;
  signal: AbortSignal;
  session: ChatSession | null;
  controller: ChatHostController | null;
  task: Promise<unknown> | null;
  children: Set<Promise<void>>;
}

export class ChatRuntime implements ReadableStore<ChatRuntimeSnapshot> {
  readonly signIn: ProviderSignIn;
  /** Recent diagnostics (newest last), for the palette's "Show diagnostics". */
  readonly diagnostics = new ValueStore<readonly DiagnosticLine[]>([]);
  readonly #boot: TerminalChatBootstrap;
  readonly #ports: ChatRuntimePorts;
  readonly #state: ConversationStateStore;
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
  #offState: (() => void) | null = null;
  #navigation: Promise<void> = Promise.resolve();
  #activeKey: string | null = null;
  #offDraft: (() => void) | null = null;
  #conversationLifetime = new AbortController();
  readonly #operations = new Map<Promise<unknown>, ConversationScope>();
  #opening: Promise<void> | null = null;
  #shutdown: Promise<void> | null = null;
  readonly #scope = new AsyncLocalStorage<ConversationScope>();

  get operationSignal(): AbortSignal {
    return this.#scope.getStore()?.signal ?? this.#conversationLifetime.signal;
  }

  assertConversationActive(): void {
    const scope = this.#scope.getStore();
    if (!scope) return;
    scope.signal.throwIfAborted();
    if (scope.key !== this.#activeKey)
      throw new Error("Conversation changed without retiring its operation owner");
  }

  get actionSession(): ChatSession | null {
    this.assertConversationActive();
    const scope = this.#scope.getStore();
    return scope ? scope.session : this.#session;
  }

  runInConversation<T>(work: () => T | Promise<T>): Promise<T> {
    return this.#own(async () => {
      const result = await work();
      this.assertConversationActive();
      return result;
    });
  }

  bindConversationCallback<Args extends unknown[]>(
    callback: (...args: Args) => void | Promise<void>
  ): (...args: Args) => Promise<void> {
    const origin = { ...(this.#scope.getStore() ?? this.#captureScope()) };
    return async (...args) => {
      const invocation = {
        ...origin,
        parent: null,
        task: null,
        children: new Set<Promise<void>>(),
      };
      try {
        await this.#scope.run(invocation, () => this.runInConversation(() => callback(...args)));
      } catch (error) {
        if (!isRpcAbortedBy(error, invocation.signal.reason))
          this.fail("The conversation action failed", error);
      }
    };
  }

  #captureScope(): ConversationScope {
    if (!this.#activeKey) throw new Error("The conversation has not opened yet.");
    return {
      parent: null,
      key: this.#activeKey,
      signal: this.#conversationLifetime.signal,
      session: this.#session,
      controller: this.#controller,
      task: null,
      children: new Set(),
    };
  }

  /** A conversation owns its asynchronous UI work, even when the caller closes its overlay. */
  #own<T>(work: (key: string, signal: AbortSignal) => Promise<T>): Promise<T> {
    const inherited = this.#scope.getStore();
    const scope = inherited
      ? {
          ...inherited,
          parent: inherited,
          task: null,
          children: new Set<Promise<void>>(),
        }
      : this.#captureScope();
    const { key, signal } = scope;
    this.assertConversationActive();
    signal.throwIfAborted();
    const workResult = this.#scope.run(scope, () => work(key, signal));
    const operation = (async () => {
      try {
        return await workResult;
      } finally {
        while (scope.children.size) await Promise.all([...scope.children]);
      }
    })();
    scope.task = operation;
    this.#operations.set(operation, scope);
    if (inherited) {
      const observed = operation.then(
        () => {},
        (error) => {
          if (!isRpcAbortedBy(error, scope.signal.reason))
            this.recordDiagnostic("error", errorMessage(error));
        }
      );
      inherited.children.add(observed);
      void observed.then(() => inherited.children.delete(observed));
    }
    void operation.then(
      () => this.#operations.delete(operation),
      () => this.#operations.delete(operation)
    );
    return operation;
  }

  attachFile(path: string): Promise<void> {
    return this.#own(async (key, signal) => {
      const file = await this.files.read(path, { signal });
      signal.throwIfAborted();
      if (file.bytes.byteLength > 8 * 1024 * 1024)
        throw new Error(`${file.name} is larger than 8 MB.`);
      const owner = `terminal-chat:attachment:${crypto.randomUUID()}`;
      const attachment: PendingFile = {
        id: crypto.randomUUID(),
        digest: createHash("sha256").update(file.bytes).digest("hex"),
        size: file.bytes.byteLength,
        name: file.name,
        mimeType: file.mimeType,
        owner,
        status: "staging",
      };
      await this.#state.updateComposer(key, (composer) => ({
        ...composer,
        attachments: [...composer.attachments, attachment],
      }));
      let adopted = false;
      let failure: unknown;
      try {
        const stored = await this.rpc.call(
          "main",
          mainRpcMethods["blobstore.putRetained"],
          [{ base64: Buffer.from(file.bytes).toString("base64"), owner }],
          { signal }
        );
        signal.throwIfAborted();
        if (stored.digest !== attachment.digest || stored.size !== attachment.size)
          throw new Error("Retained attachment identity did not match its content.");
        await this.#state.updateComposer(key, (composer) => ({
          ...composer,
          attachments: composer.attachments.map((file) =>
            file.id === attachment.id ? { ...file, status: "pending" } : file
          ),
        }));
        adopted = true;
      } catch (error) {
        failure = error;
      }
      if (!adopted) {
        try {
          await this.#retireAttachments(key, [attachment.id]);
        } catch (error) {
          if (failure !== undefined)
            throw new AggregateError([failure, error], "Attachment staging and cleanup failed", {
              cause: failure,
            });
          throw error;
        }
        throw failure;
      }
    });
  }

  removeAttachment(id: string): Promise<void> {
    return this.#own((key) => this.#retireAttachments(key, [id]));
  }

  async #retireAttachments(key: string, ids: readonly string[]): Promise<void> {
    const attachments = this.#state
      .record(key)
      .composer.attachments.filter((item) => ids.includes(item.id));
    if (!attachments.length) return;
    // Persist retirement intent first. Failed cleanup remains explicitly recoverable,
    // without exposing a released blob as a sendable pending attachment.
    await this.#state.updateComposer(key, (composer) => ({
      ...composer,
      attachments: composer.attachments.map((item) =>
        ids.includes(item.id) ? { ...item, status: "releasing" } : item
      ),
    }));
    const results = await Promise.allSettled(
      attachments.map((attachment) =>
        this.#boot.rpc.call("main", mainRpcMethods["blobstore.releaseRetention"], [
          { owner: attachment.owner },
        ])
      )
    );
    const errors = results.flatMap((result) =>
      result.status === "rejected" ? [result.reason] : []
    );
    if (errors.length) throw new AggregateError(errors, "Pending attachment cleanup failed");
    await this.#state.updateComposer(key, (composer) => ({
      ...composer,
      attachments: composer.attachments.filter((item) => !ids.includes(item.id)),
    }));
  }

  submit(text: string, options?: SendOptions): Promise<void> {
    const session = this.#session;
    if (!session) return Promise.reject(new Error("The conversation has not opened yet."));
    return this.#own(async (key, signal) => {
      const composer = await this.#state.captureComposer(key);
      const files = composer.attachments.filter((item) => item.status === "pending");
      const scope = this.#scope.getStore()!;
      scope.submission = {
        revision: composer.revision,
        attachmentIds: files.map((file) => file.id),
      };
      const attachments = [];
      for (const file of files) {
        const encoded = await this.rpc.call(
          "main",
          mainRpcMethods["blobstore.getBase64"],
          [file.digest],
          { signal }
        );
        if (encoded === null)
          throw new Error(`Pending attachment ${file.name} is missing from retained storage.`);
        attachments.push({
          name: file.name,
          mimeType: file.mimeType,
          data: new Uint8Array(Buffer.from(encoded, "base64")),
        });
      }
      signal.throwIfAborted();
      await session.submit(attachments.length ? attachments : undefined, {
        ...options,
        text,
      });
      // A deferred admission already has its own durable CAS owners. An ordinary
      // admission has the channel's accepted receipt. Neither may be resent on cleanup failure.
      try {
        await this.#retireAttachments(
          key,
          files.map((file) => file.id)
        );
      } catch (error) {
        this.fail(
          "Your message was accepted, but attachment cleanup failed",
          error,
          "Do not resend it. The attachment tray keeps the unfinished cleanup so you can finish removing it."
        );
      }
    });
  }

  constructor(boot: TerminalChatBootstrap, ports: ChatRuntimePorts = {}) {
    this.#boot = boot;
    this.#ports = ports;
    this.#state = new ConversationStateStore(boot.state, boot.contextId);
    this.signIn = new ProviderSignIn(boot.rpc, {
      afterConnected: () => this.#controller?.retryModelSettings(),
      ownerSignal: () => this.#scope.getStore()?.signal,
    });
    const contextId = boot.contextId;
    this.#cell = new StateCell<ChatRuntimeSnapshot>({
      contextId,
      host: null,
      session: null,
      forms: [],
      notices: [],
      connection: boot.rpc.status(),
      generation: 0,
      composer: { revision: 0, text: "", attachments: [] },
    });
  }

  readonly getSnapshot = (): ChatRuntimeSnapshot => this.#cell.getSnapshot();
  readonly subscribe = (listener: () => void): (() => void) => this.#cell.subscribe(listener);

  get rpc(): TerminalChatBootstrap["rpc"] {
    this.assertConversationActive();
    const scope = this.#scope.getStore();
    return scope ? withRpcAbortSignal(this.#boot.rpc, scope.signal) : this.#boot.rpc;
  }

  get files(): TerminalChatBootstrap["files"] {
    return this.#boot.files;
  }

  get controller(): ChatHostController | null {
    this.assertConversationActive();
    const scope = this.#scope.getStore();
    return scope ? scope.controller : this.#controller;
  }

  async start(): Promise<void> {
    await this.#state.initialize();
    if (this.#disposed) return;
    this.#offState = this.#state.subscribe(() => {
      if (this.#activeKey)
        this.#cell.update({
          composer: this.#state.record(this.#activeKey).composer,
        });
    });
    this.#offConnection = this.#boot.rpc.onStatusChange((connection) =>
      this.#cell.update({ connection })
    );
    await this.#openConversation();
  }

  dispose(): Promise<void> {
    if (this.#shutdown) return this.#shutdown;
    this.#disposed = true;
    this.#offConnection?.();
    this.#offState?.();
    this.#shutdown = Promise.allSettled([
      this.#closeConversation(),
      this.signIn.cancel(),
      this.#navigation,
      this.#state.join(),
      this.#joinOperations([...this.#operations]),
    ]).then((results) => {
      const errors = results.flatMap((result) =>
        result.status === "rejected" ? [result.reason] : []
      );
      if (errors.length) throw new AggregateError(errors, "Terminal chat cleanup failed");
    });
    return this.#shutdown;
  }

  // ── notices ────────────────────────────────────────────────────────────────

  /** Keep a diagnostic line (bounded). */
  recordDiagnostic(level: DiagnosticLine["level"], text: string): void {
    const lines = this.diagnostics.getSnapshot();
    this.diagnostics.set([...lines.slice(-(MAX_DIAGNOSTICS - 1)), { at: Date.now(), level, text }]);
  }

  notify(notice: Omit<Notice, "id">): void {
    this.assertConversationActive();
    this.#appendNotice(notice);
  }

  #appendNotice(notice: Omit<Notice, "id">): void {
    const next = { ...notice, id: ++this.#noticeId };
    this.#cell.update({
      notices: [...this.getSnapshot().notices.slice(-4), next],
    });
  }

  /** Report a failed user action: what failed, why, and the next step. */
  fail(title: string, error: unknown, message?: string): void {
    this.#appendNotice({
      tone: "error",
      title,
      message: message ?? errorMessage(error),
      detail: detailOf(error),
    });
  }

  dismissNotice(id?: number): void {
    const notices = this.getSnapshot().notices;
    this.#cell.update({
      notices: id === undefined ? notices.slice(0, -1) : notices.filter((n) => n.id !== id),
    });
  }

  // ── conversations ──────────────────────────────────────────────────────────

  /** Start a new conversation in this terminal session's own context. */
  async newConversation(): Promise<void> {
    await this.#switchTo({
      channelName: null,
      contextId: this.#boot.contextId,
    });
  }

  /** Switch to an existing conversation (resume, or a fork in its own context). */
  async openConversation(channelId: string, contextId: string): Promise<void> {
    await this.#switchTo({ channelName: channelId, contextId });
  }

  /** Conversations (channels) in the current conversation's context, newest first. */
  async listConversations(): Promise<ChannelListing[]> {
    return this.#own(async (_key, signal) => {
      const rpc = this.#boot.rpc;
      const current = this.getSnapshot().host?.channelName ?? null;
      const entities = await listChannelDurableObjectEntities({
        listServices: () =>
          rpc.call("main", mainRpcMethods["workers.listServices"], [], {
            signal,
          }),
        listDurableObjectEntities: async () =>
          (
            await rpc.call("main", mainRpcMethods["runtime.listEntities"], [{ kind: "do" }], {
              signal,
            })
          ).filter((entity): entity is typeof entity & { kind: "do" } => entity.kind === "do"),
      });
      const channels = entities;
      const listings: ChannelListing[] = [];
      let next = 0;
      const lanes = Array.from({ length: Math.min(4, channels.length) }, async () => {
        while (next < channels.length) {
          const entity = channels[next++]!;
          const config = await rpc.call(entity.id, channelClientRpcMethods["getConfig"], [], {
            signal,
          });
          listings.push({
            channelId: entity.key,
            contextId: entity.contextId,
            createdAt: entity.createdAt,
            current: entity.key === current,
            title: config?.title || entity.key,
          });
        }
      });
      const results = await Promise.allSettled(lanes);
      const errors = results.flatMap((result) =>
        result.status === "rejected" ? [result.reason] : []
      );
      if (errors.length)
        throw new AggregateError(errors, "Conversation titles could not all be read");
      return listings.sort((a, b) => b.createdAt - a.createdAt);
    });
  }

  readHistory(): Promise<readonly ChatMessage[]> {
    const session = this.#session;
    if (!session) return Promise.reject(new Error("The conversation has not opened yet."));
    return this.#own((_key, signal) => session.feed.readCompleteHistory(signal));
  }

  exportConversation(): Promise<string> {
    const session = this.#session;
    if (!session) return Promise.reject(new Error("The conversation has not opened yet."));
    return this.#own(async (_key, signal) => {
      const messages = await session.feed.readCompleteHistory(signal);
      const snapshot = session.getSnapshot();
      if (!snapshot.channelName) throw new Error("No conversation exists to export.");
      const at = new Date();
      const markdown = exportMarkdown({
        title: snapshot.channelTitle,
        channelId: snapshot.channelName,
        messages,
        participants: snapshot.allParticipants,
        selfId: snapshot.selfId,
        exportedAt: at,
      });
      return this.files.writeExport(
        exportFileName(snapshot.channelTitle, snapshot.channelName, at),
        markdown,
        { signal }
      );
    });
  }

  async #switchTo(target: { channelName: string | null; contextId: string }): Promise<void> {
    const operation = this.#navigation.then(() => this.#commitSwitch(target));
    this.#navigation = operation.then(
      () => {},
      () => {}
    );
    return operation;
  }

  async #commitSwitch(target: { channelName: string | null; contextId: string }): Promise<void> {
    const initiatingScope = this.#scope.getStore();
    // The conversation's agents are the ones on its own roster (a fork has its
    // own clones); read them while the current host is still open.
    const conversation =
      target.channelName && this.#controller
        ? await this.#controller.conversationState(target.channelName, this.operationSignal)
        : { channelName: target.channelName, installedAgents: null };
    if (this.#disposed) return;
    const host: ChatHostState = { ...this.#controllerState() };
    if (conversation.channelName === null) delete host.channelName;
    else host.channelName = conversation.channelName;
    if (conversation.installedAgents === null) delete host.installedAgents;
    else host.installedAgents = conversation.installedAgents;
    await this.#state.select(target.contextId, host);
    if (this.#disposed) return;
    let retirementFailure: unknown;
    try {
      await this.#closeConversation(initiatingScope);
    } catch (error) {
      retirementFailure = error;
    }
    // closeConversation joins every admitted reader, callback and resource
    // retirement before rejecting. Its historical failure must stay visible,
    // but no live source owner remains to prevent opening the committed target.
    try {
      await this.#scope.exit(() => this.#openConversation());
    } catch (error) {
      if (retirementFailure !== undefined)
        throw new AggregateError(
          [retirementFailure, error],
          "Conversation retirement and destination opening failed",
          { cause: retirementFailure }
        );
      throw error;
    }
    // A completed navigation transfers its initiating continuation to the
    // destination. Other actions and already-bound UI callbacks retain their
    // original owners and are retired with the source conversation.
    const destination = this.#captureScope();
    for (
      let continuation = initiatingScope;
      continuation;
      continuation = continuation.parent ?? undefined
    ) {
      Object.assign(continuation, {
        key: destination.key,
        signal: destination.signal,
        session: destination.session,
        controller: destination.controller,
      });
    }
    if (retirementFailure !== undefined) throw retirementFailure;
  }

  #controllerState(): ChatHostState {
    return this.#state.record(this.#state.current).host;
  }

  async #openConversation(): Promise<void> {
    const key = this.#state.current;
    this.#activeKey = key;
    this.#conversationLifetime = new AbortController();
    this.#opening = null;
    const record = this.#state.record(key);
    const contextId = record.contextId;
    const controller = new ChatHostController({
      rpc: this.#boot.rpc,
      contextId,
      state: this.#state.hostPort(key),
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
      composer: record.composer,
    });
    const onHost = () => {
      const host = controller.getSnapshot();
      this.#cell.transaction(() => {
        this.#cell.update({ host });
        if (host.channelName && !this.#session) {
          const opening = this.#createSession(controller, host.channelName, contextId);
          this.#opening = opening;
          void opening.catch((error) => {
            if (!isRpcAbortedBy(error, this.operationSignal.reason))
              this.fail("The conversation couldn't open", error);
          });
        }
        const session = this.#session;
        if (session) {
          session.setAgentHost({
            ...controller.actions,
            ...chatHostActionData(host),
          });
          if (host.connectionRetrySignal !== this.#retrySignal) {
            this.#retrySignal = host.connectionRetrySignal;
            session.reconnect("host-unblocked");
          }
        }
      });
    };
    this.#controllerOff = controller.subscribe(onHost);
    onHost();
    await this.#opening;
  }

  #createSession(
    controller: ChatHostController,
    channelName: string,
    contextId: string
  ): Promise<void> {
    return this.#own(async (key, signal) => {
      const session = new ChatSession({
        config: {
          clientId: `terminal-chat-${this.#boot.sessionId}`,
          rpc: this.#boot.rpc,
          deliveryMode: "stream",
        },
        channelName,
        contextId,
        metadata: { name: "Terminal", type: "panel" },
        agentHost: {
          ...controller.actions,
          ...chatHostActionData(controller.getSnapshot()),
        },
        deferredQueue: conversationQueueStore(
          this.#state,
          key,
          this.#boot.rpc,
          () => this.#scope.getStore()?.submission
        ),
        ports: {
          presentTitle: (title) => this.#ports.presentTitle?.(title),
          observeEvent: (event) => this.#observe(event),
        },
        forkNav: {
          switchTo: (channelId, forkContextId) => this.openConversation(channelId, forkContextId),
          openInNewPanel: (channelId, forkContextId) =>
            this.openConversation(channelId, forkContextId),
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
          execute: (args: unknown, ctx: MethodExecutionContext) =>
            this.#showForm(args as FeedbackFormArgs, ctx),
        },
      }));
      this.#session = session;
      await session.deferredAgent.ready();
      signal.throwIfAborted();
      const unfinishedFiles = this.#state
        .record(key)
        .composer.attachments.filter((file) => file.status !== "pending");
      if (unfinishedFiles.length) {
        try {
          await this.#retireAttachments(
            key,
            unfinishedFiles.map((file) => file.id)
          );
        } catch (error) {
          this.fail(
            "Pending attachment cleanup could not finish",
            error,
            "Use /attachments to inspect and remove the unfinished entries."
          );
        }
      }
      signal.throwIfAborted();
      const draft = this.#state.record(key).composer.text;
      session.setInput(draft);
      let observed = draft;
      this.#offDraft = session.subscribe(() => {
        const text = session.getSnapshot().input;
        if (text === observed) return;
        observed = text;
        void this.#state
          .updateComposer(key, (composer) => ({ ...composer, text }))
          .catch((error) =>
            this.fail(
              "Your draft couldn't be saved",
              error,
              "Your text remains in the composer. Check the connection before closing this terminal."
            )
          );
      });
      this.#releaseSession = session.retain();
      session.start();
      this.#cell.update({ session });
    });
  }

  async #closeConversation(initiator?: ConversationScope): Promise<void> {
    const session = this.#session;
    const controller = this.#controller;
    const lifetime = this.#conversationLifetime;
    const key = this.#activeKey;
    this.#conversationLifetime.abort(new Error("Conversation closed"));
    this.#offDraft?.();
    this.#offDraft = null;
    for (const form of this.getSnapshot().forms) form.answer({ type: "cancel" });
    this.#releaseSession?.();
    this.#releaseSession = null;
    this.#session = null;
    this.#controllerOff?.();
    this.#controllerOff = null;
    this.#releaseController?.();
    this.#releaseController = null;
    this.#controller = null;
    this.#activeKey = null;
    this.#cell.update({ session: null, forms: [] });
    const continuation = new Set<ConversationScope>();
    for (let scope = initiator; scope; scope = scope.parent ?? undefined) continuation.add(scope);
    const operations = [...this.#operations].filter(
      ([, scope]) => !continuation.has(scope) && scope.key === key
    );
    const results = await Promise.allSettled([
      session?.close() ?? Promise.resolve(),
      controller?.close() ?? Promise.resolve(),
      this.#joinOperations(operations),
    ]);
    const errors = results.flatMap((result) =>
      result.status === "rejected" && !isRpcAbortedBy(result.reason, lifetime.signal.reason)
        ? [result.reason]
        : []
    );
    if (errors.length) throw new AggregateError(errors, "Conversation cleanup failed");
  }

  async #joinOperations(operations: Array<[Promise<unknown>, ConversationScope]>): Promise<void> {
    const results = await Promise.allSettled(operations.map(([task]) => task));
    const errors = results.flatMap((result, index) =>
      result.status === "rejected" &&
      !isRpcAbortedBy(result.reason, operations[index]![1].signal.reason)
        ? [result.reason]
        : []
    );
    if (errors.length)
      throw new AggregateError([...new Set(errors)], "Conversation operations failed");
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
          this.#cell.update({
            forms: this.getSnapshot().forms.filter((f) => f !== form),
          });
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
    const session = this.actionSession;
    if (!session) throw new Error("The conversation is not connected yet.");
    return this.#own(async (_key, signal) => {
      const response = (await session.callMethodResult(participantId, method, args)) as
        | { result?: unknown; isError?: boolean; error?: string }
        | undefined;
      const result =
        response && typeof response === "object" && "result" in response
          ? response.result
          : response;
      const error =
        (response &&
          typeof response === "object" &&
          (response.isError || response.error) &&
          (response.error ?? (result as { error?: string })?.error)) ||
        (result &&
        typeof result === "object" &&
        "error" in (result as object) &&
        typeof (result as { error?: unknown }).error === "string"
          ? (result as { error: string }).error
          : null);
      if (error) throw new Error(String(error));
      signal.throwIfAborted();
      return result;
    });
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
