/**
 * The native chat client's conversation lifecycle: one `ChatHostController` +
 * `ChatSession` pair per conversation, rebuilt when the conversation changes
 * (new chat, resume, fork), the way the chat panel remounts.
 *
 * Framework-free and driven entirely by `ChatHostPorts`: the host ports come
 * from `createChatHostPorts` (agentic-core), so this renderer owns no
 * transport or storage of its own.
 */
import type { ClientParticipantMetadata, ConnectionConfig } from "@workspace/agentic-core";
import {
  ChatHostController,
  ChatSession,
  StateCell,
  chatHostActionData,
  listChannelConversations,
  type ChannelListing,
  type ChatHostPorts,
  type ForkNavHandlers,
  type ReadableStore,
} from "@workspace/agentic-core/chat-store";

/** Which conversation a host runs. A new chat has no channel until its host mints one. */
export interface ChatConversationTarget {
  /** Scopes the host's durable state and recovery keys; unique per conversation. */
  key: string;
  channelName: string | null;
  contextId: string;
}

/** Build the ports for one conversation (its own state record, instance id and context). */
export type ChatHostPortsFactory = (target: ChatConversationTarget) => ChatHostPorts;

export interface ChatConversationOptions {
  hostPorts: ChatHostPortsFactory;
  /** Channel connection (rpc + participant id); `deliveryMode` defaults to `stream`. */
  connection: ConnectionConfig;
  metadata?: ClientParticipantMetadata;
  /** Context a new chat starts in. */
  contextId: string;
  /** The conversation to open first; omitted starts a new chat. */
  channelName?: string | null;
  /** Text placed once in the composer of the first conversation's session, once it exists. */
  initialInput?: string;
  /** Fork read cursors and external-fork notices stay with the host's policy. */
  onExternalFork?: ForkNavHandlers["onExternalFork"];
}

export interface ChatConversationSnapshot {
  /** Advances on every conversation switch so views can reset per-conversation state. */
  generation: number;
  target: ChatConversationTarget;
  controller: ChatHostController;
  /** Null until the host has a channel to join. */
  session: ChatSession | null;
}

let targetSerial = 0;

export class ChatConversationModel implements ReadableStore<ChatConversationSnapshot> {
  readonly #options: ChatConversationOptions;
  readonly #cell: StateCell<ChatConversationSnapshot>;
  #releaseController: (() => void) | null = null;
  #offHost: (() => void) | null = null;
  #releaseSession: (() => void) | null = null;
  #retained = 0;
  #retrySignal = 0;
  #spent = false;
  /** The initial conversation's target key and the input still waiting to be placed in it. */
  #pendingInput: { key: string; text: string } | null = null;

  constructor(options: ChatConversationOptions) {
    this.#options = options;
    const key = `native-chat:${(targetSerial += 1)}`;
    if (options.initialInput) this.#pendingInput = { key, text: options.initialInput };
    this.#cell = new StateCell(
      this.#build(
        {
          key,
          channelName: options.channelName ?? null,
          contextId: options.contextId,
        },
        0
      )
    );
  }

  readonly getSnapshot = (): ChatConversationSnapshot => this.#cell.getSnapshot();
  readonly subscribe = (listener: () => void): (() => void) => this.#cell.subscribe(listener);

  /** Hold the live conversation; the last release disposes it. */
  retain(): () => void {
    this.#retained += 1;
    if (this.#retained === 1) this.#attach();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.#retained -= 1;
      if (this.#retained === 0) this.#detach();
    };
  }

  /** Switch to an existing conversation (resume, or a fork in its own context). */
  openConversation(channelName: string, contextId: string): void {
    this.#switchTo({ channelName, contextId });
  }

  /** Start a new conversation in the model's own context. */
  newConversation(): void {
    this.#switchTo({ channelName: null, contextId: this.#options.contextId });
  }

  /** Channels of the current workspace context, newest first. */
  listConversations(signal?: AbortSignal): Promise<ChannelListing[]> {
    const { controller } = this.getSnapshot();
    return listChannelConversations(this.#ports(this.getSnapshot().target).rpc, {
      currentChannelId: controller.getSnapshot().channelName,
      ...(signal ? { signal } : {}),
    });
  }

  #portsByKey = new Map<string, ChatHostPorts>();

  #ports(target: ChatConversationTarget): ChatHostPorts {
    let ports = this.#portsByKey.get(target.key);
    if (!ports) {
      ports = this.#options.hostPorts(target);
      this.#portsByKey.set(target.key, ports);
    }
    return ports;
  }

  #build(target: ChatConversationTarget, generation: number): ChatConversationSnapshot {
    return {
      generation,
      target,
      controller: new ChatHostController(this.#ports(target)),
      session: null,
    };
  }

  #switchTo(next: { channelName: string | null; contextId: string }): void {
    const current = this.getSnapshot();
    if (next.channelName !== null && next.channelName === current.controller.getSnapshot().channelName) return;
    const wasLive = this.#retained > 0;
    if (wasLive) this.#detach();
    this.#portsByKey.delete(current.target.key);
    this.#spent = false;
    this.#cell.update(
      this.#build(
        { key: `native-chat:${(targetSerial += 1)}`, ...next },
        current.generation + 1
      )
    );
    if (wasLive) this.#attach();
  }

  #attach(): void {
    // A released controller has disposed its live work; a re-attach (remount
    // after a full release) takes a fresh one over the same conversation.
    if (this.#spent) {
      this.#spent = false;
      const { target, generation } = this.getSnapshot();
      this.#cell.update(this.#build(target, generation + 1));
    }
    const { controller, target } = this.getSnapshot();
    this.#releaseController = controller.retain();
    this.#retrySignal = controller.getSnapshot().connectionRetrySignal;
    const onHost = () => {
      const host = controller.getSnapshot();
      const state = this.getSnapshot();
      if (state.controller !== controller) return;
      if (host.channelName && !state.session) {
        this.#cell.update({ session: this.#openSession(controller, host.channelName, target) });
      }
      const session = this.getSnapshot().session;
      if (session) {
        session.setAgentHost({ ...controller.actions, ...chatHostActionData(host) });
        if (host.connectionRetrySignal !== this.#retrySignal) {
          this.#retrySignal = host.connectionRetrySignal;
          session.reconnect("host-unblocked");
        }
      }
    };
    this.#offHost = controller.subscribe(onHost);
    onHost();
  }

  #detach(): void {
    this.#offHost?.();
    this.#offHost = null;
    this.#releaseSession?.();
    this.#releaseSession = null;
    this.getSnapshot().session?.dispose();
    this.#releaseController?.();
    this.#releaseController = null;
    this.#spent = true;
    this.#cell.update({ session: null });
  }

  #openSession(
    controller: ChatHostController,
    channelName: string,
    target: ChatConversationTarget
  ): ChatSession {
    const { connection, metadata, onExternalFork } = this.#options;
    const session = new ChatSession({
      config: { deliveryMode: "stream", ...connection },
      channelName,
      contextId: target.contextId,
      metadata: metadata ?? { name: "Mobile", type: "panel" },
      agentHost: { ...controller.actions, ...chatHostActionData(controller.getSnapshot()) },
      forkNav: {
        switchTo: (channelId, contextId) => this.openConversation(channelId, contextId),
        openInNewPanel: (channelId, contextId) => this.openConversation(channelId, contextId),
        readForkCursors: () => controller.readForkCursors(),
        markForkRead: (channelId, headSeq) => controller.markForkRead(channelId, headSeq),
        ...(onExternalFork ? { onExternalFork } : {}),
      },
    });
    this.#releaseSession = session.retain();
    if (this.#pendingInput?.key === target.key) {
      session.setInput(this.#pendingInput.text);
      this.#pendingInput = null;
    }
    session.start();
    return session;
  }
}
