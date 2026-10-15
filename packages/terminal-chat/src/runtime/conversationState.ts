import type {
  ChatHostState,
  StateArgsPort,
  PendingDelivery,
} from "@workspace/agentic-core/chat-store";
import type { SessionStateStore } from "./bootstrap.js";

export interface PendingFile {
  id: string;
  digest: string;
  size: number;
  name: string;
  mimeType: string;
  owner: string;
  status: "staging" | "pending" | "releasing";
}

export interface ComposerDraft {
  revision: number;
  text: string;
  attachments: PendingFile[];
}

export interface ComposerReceipt {
  revision: number;
  attachmentIds: readonly string[];
}

export interface ConversationRecord {
  contextId: string;
  host: ChatHostState;
  composer: ComposerDraft;
  queue: StoredDelivery[];
}

export interface StoredDelivery extends Omit<
  PendingDelivery,
  "attachments" | "attachmentSummaries" | "retirement"
> {
  attachments?: PendingFile[];
  retirement: "staging" | "pending" | "releasing";
}

interface ConversationState {
  version: 1;
  current: string;
  conversations: Record<string, ConversationRecord>;
}

const STATE_KEY = "terminalChat";
const HOST_KEYS = [
  "channelName",
  "installedAgents",
  "agentSource",
  "agentClass",
  "agentConfig",
  "systemPrompt",
  "systemPromptMode",
  "forkCursors",
] as const;
const emptyComposer = (): ComposerDraft => ({
  revision: 0,
  text: "",
  attachments: [],
});

/** One durable state format. Legacy surface state is migrated once before any controller starts. */
export class ConversationStateStore {
  readonly #store: SessionStateStore;
  readonly #defaultContext: string;
  #state: ConversationState | null = null;
  #tail: Promise<void> = Promise.resolve();
  #initialization: Promise<void> | null = null;
  readonly #listeners = new Set<() => void>();

  constructor(store: SessionStateStore, defaultContext: string) {
    this.#store = store;
    this.#defaultContext = defaultContext;
  }

  initialize(): Promise<void> {
    this.#initialization ??= this.#initialize();
    return this.#initialization;
  }

  async #initialize(): Promise<void> {
    const stored = this.#store.get();
    const value = stored[STATE_KEY];
    if (value !== undefined) {
      if (!value || typeof value !== "object" || (value as { version?: unknown }).version !== 1)
        throw new Error("This terminal chat session uses an unsupported state version.");
      this.#state = value as ConversationState;
      this.record(this.current);
      return;
    }
    const host: Record<string, unknown> = {};
    for (const key of HOST_KEYS) if (stored[key] !== undefined) host[key] = stored[key];
    const contextId =
      typeof stored["conversationContextId"] === "string"
        ? stored["conversationContextId"]
        : this.#defaultContext;
    const current = crypto.randomUUID();
    const next: ConversationState = {
      version: 1,
      current,
      conversations: {
        [current]: {
          contextId,
          host: host as ChatHostState,
          composer: emptyComposer(),
          queue: [],
        },
      },
    };
    const patch: Record<string, unknown> = {
      [STATE_KEY]: next,
      conversationContextId: null,
    };
    for (const key of HOST_KEYS) patch[key] = null;
    await this.#store.patch(patch);
    this.#state = next;
  }

  get current(): string {
    if (!this.#state) throw new Error("Terminal chat state has not initialized.");
    return this.#state.current;
  }

  record(key: string): ConversationRecord {
    const record = this.#state?.conversations[key];
    if (!record) throw new Error(`No conversation state exists for ${key}.`);
    return record;
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /** Persist one mutation at a time, deriving it from the latest committed state. */
  #mutate(change: (state: ConversationState) => ConversationState): Promise<void> {
    const operation = this.#tail.then(async () => {
      if (!this.#state) throw new Error("Terminal chat state has not initialized.");
      const next = change(this.#state);
      await this.#store.patch({ [STATE_KEY]: next });
      this.#state = next;
      for (const listener of this.#listeners) {
        try {
          listener();
        } catch (error) {
          console.error("[ConversationState] Observer failed after durable commit:", error);
        }
      }
    });
    this.#tail = operation.then(
      () => {},
      () => {}
    );
    return operation;
  }

  hostPort(key: string): StateArgsPort {
    return {
      get: () => this.record(key).host,
      patch: (partial) =>
        this.#mutate((state) => {
          const record = state.conversations[key]!;
          const host: Record<string, unknown> = { ...record.host };
          for (const [name, value] of Object.entries(partial)) {
            if (value === null) delete host[name];
            else host[name] = value;
          }
          return {
            ...state,
            conversations: {
              ...state.conversations,
              [key]: { ...record, host: host as ChatHostState },
            },
          };
        }),
      subscribe: (listener) => {
        let previous = this.record(key).host;
        return this.subscribe(() => {
          const next = this.record(key).host;
          if (next !== previous) {
            previous = next;
            listener();
          }
        });
      },
    };
  }

  updateComposer(key: string, change: (composer: ComposerDraft) => ComposerDraft): Promise<void> {
    return this.#mutate((state) => {
      const record = state.conversations[key]!;
      return {
        ...state,
        conversations: {
          ...state.conversations,
          [key]: {
            ...record,
            composer: {
              ...change(record.composer),
              revision: record.composer.revision + 1,
            },
          },
        },
      };
    });
  }

  /** Capture exactly the writes already admitted, before any later draft edits. */
  captureComposer(key: string): Promise<ComposerDraft> {
    return this.#tail.then(() => this.record(key).composer);
  }

  /** Queue acceptance and composer ownership transfer are one durable transaction. */
  admitDelivery(key: string, delivery: StoredDelivery, receipt?: ComposerReceipt): Promise<void> {
    return this.#mutate((state) => {
      const record = state.conversations[key]!;
      const composer = receipt
        ? {
            ...record.composer,
            revision: record.composer.revision + 1,
            text: record.composer.revision === receipt.revision ? "" : record.composer.text,
            attachments: record.composer.attachments.map((file) =>
              receipt.attachmentIds.includes(file.id)
                ? { ...file, status: "releasing" as const }
                : file
            ),
          }
        : record.composer;
      return {
        ...state,
        conversations: {
          ...state.conversations,
          [key]: {
            ...record,
            composer,
            queue: record.queue.map((item) => (item.id === delivery.id ? delivery : item)),
          },
        },
      };
    });
  }

  updateQueue(key: string, change: (queue: StoredDelivery[]) => StoredDelivery[]): Promise<void> {
    return this.#mutate((state) => {
      const record = state.conversations[key]!;
      return {
        ...state,
        conversations: {
          ...state.conversations,
          [key]: { ...record, queue: change(record.queue) },
        },
      };
    });
  }

  async join(): Promise<void> {
    await this.#initialization;
    await this.#tail;
  }

  /** Selection and the target record become durable together; no live host sees another host's state. */
  select(contextId: string, host: ChatHostState): Promise<void> {
    return this.#mutate((state) => {
      const existing =
        host.channelName &&
        Object.entries(state.conversations).find(
          ([, record]) =>
            record.contextId === contextId && record.host.channelName === host.channelName
        );
      const key = existing ? existing[0] : crypto.randomUUID();
      const record = existing
        ? {
            ...existing[1],
            host: {
              ...existing[1].host,
              channelName: host.channelName,
              installedAgents: host.installedAgents,
            },
          }
        : { contextId, host, composer: emptyComposer(), queue: [] };
      return {
        ...state,
        current: key,
        conversations: { ...state.conversations, [key]: record },
      };
    });
  }
}
