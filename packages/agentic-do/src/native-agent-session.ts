import type { Context } from "@panticonic/pi-chord";
import { withoutAbortSignal } from "@panticonic/pi-chord/context";
import {
  defineDoc,
  Harness,
  InboxDoc,
  type Cursor,
  type ConversationId,
  type DocumentReader,
  type HarnessOptions,
  type Storage,
  type Tx,
} from "@panticonic/pi-durable";
import { workspaceStateMethods } from "@vibestudio/service-schemas/workspaceState";

/** Host-resolved identity. Restoring an agent database cannot restore this authority. */
export interface AgentExecutionOwner {
  readonly runtimeId: string;
  readonly contextId: string;
  readonly incarnation: string;
  readonly authoritySessionId: string;
}

export interface LoadedAgentImage {
  readonly runtimeId: string;
  readonly source: string;
  readonly className: string;
  readonly objectKey: string;
  readonly executionDigest: string;
}

export type AgentHostCall = import("@vibestudio/service-schemas/mainRpc").MainRpcCaller;

/**
 * Resolve authority from the live platform, not restored SQLite contents or
 * inbound request arguments. Schema admission precedes this function; its caller
 * supplies the exact host-loaded image and an owner-authenticated service client.
 */
export async function openPlatformAgentSession(
  createStorage: () => Promise<Storage>,
  image: LoadedAgentImage,
  call: AgentHostCall,
  options: Omit<HarnessOptions, "publishWake">,
  context: Context
): Promise<Harness> {
  const loaded = { ...image };
  if (
    !/^[a-f0-9]{64}$/.test(loaded.executionDigest) ||
    !loaded.source ||
    !loaded.className ||
    !loaded.objectKey ||
    loaded.runtimeId !== `do:${loaded.source}:${loaded.className}:${loaded.objectKey}`
  )
    throw new Error("Agent Session requires its exact host-loaded image");
  const entity = workspaceStateMethods["entity.resolveActive"].returns.parse(
    await call("workspace-state.entity.resolveActive", [loaded.runtimeId])
  );
  if (
    !entity ||
    entity.kind !== "do" ||
    entity.status !== "active" ||
    entity.id !== loaded.runtimeId ||
    entity.source.repoPath !== loaded.source ||
    entity.className !== loaded.className ||
    entity.key !== loaded.objectKey ||
    entity.activeExecutionDigest !== loaded.executionDigest ||
    !entity.contextId
  )
    throw new Error("Agent image does not match its active platform owner");
  const key = {
    source: loaded.source,
    className: loaded.className,
    objectKey: loaded.objectKey,
  };
  const incarnation = workspaceStateMethods.alarmSourceRegister.returns.parse(
    await call("workspace-state.alarmSourceRegister", [key])
  );
  return openBoundAgentSession(
    await createStorage(),
    {
      runtimeId: loaded.runtimeId,
      contextId: entity.contextId,
      incarnation,
      authoritySessionId: entity.authoritySessionId,
    },
    {
      ...options,
      publishWake: async (schedule) => {
        const accepted = workspaceStateMethods.alarmSourcePublish.returns.parse(
          await call("workspace-state.alarmSourcePublish", [
            { ...key, incarnation, ...schedule },
          ])
        );
        if (accepted === "stale")
          throw new Error("Agent wake belongs to a retired host incarnation");
      },
    },
    context
  );
}

const ExecutionOwner = defineDoc<{
  runtimeId: string;
  contextId: string;
  incarnation: string;
  authoritySessionId: string;
  status: "active" | "retired";
}>({
  kind: "vibestudio.execution-owner",
  version: 1,
  scope: "session",
  initial: () => ({
    runtimeId: "",
    contextId: "",
    incarnation: "",
    authoritySessionId: "",
    status: "active",
  }),
  checkpointWhen: () => true,
});

/** Read the existing host-bound identity; receipt inspection cannot admit an owner. */
export async function retainedAgentExecutionOwner(
  reader: DocumentReader,
  context: Context
): Promise<AgentExecutionOwner> {
  const owner = await reader.snapshot(ExecutionOwner, context);
  return projectExecutionOwner(owner);
}

/** Validate the same active owner on the mutation line as input/source admission. */
export async function retainedAgentExecutionOwnerInTransaction(
  tx: Tx
): Promise<AgentExecutionOwner> {
  return projectExecutionOwner(await tx.doc(ExecutionOwner));
}

function projectExecutionOwner(
  owner: (AgentExecutionOwner & { readonly status: "active" | "retired" }) | undefined
): AgentExecutionOwner {
  if (
    !owner?.runtimeId ||
    !owner.contextId ||
    !owner.incarnation ||
    !owner.authoritySessionId ||
    owner.status !== "active"
  )
    throw new Error("Agent receipt requires an existing host-bound owner");
  return {
    runtimeId: owner.runtimeId,
    contextId: owner.contextId,
    incarnation: owner.incarnation,
    authoritySessionId: owner.authoritySessionId,
  };
}

/** Retirement owns every retained conversation, including input queued before
 * channel membership or after a transport detach. Withdraw through Pi's public
 * cancellation contract and join the reached background work; never edit away
 * an inbox or infer execution ownership from current subscriptions. Passive
 * history writes remain for placement at the next ordinary Pi boundary. */
export async function abortQueuedAgentConversations(
  harness: Harness,
  context: Context
): Promise<number> {
  const queued = await harness.commit(async (tx) => {
    const ids: ConversationId[] = [];
    let cursor: Cursor | undefined;
    do {
      const page = await tx.scanConversations({}, 256, cursor);
      for (const conversation of page.items) {
        if ((await tx.doc(InboxDoc, conversation.id)).items.some((item) => item.mode !== "write"))
          ids.push(conversation.id);
      }
      cursor = page.next;
    } while (cursor !== undefined);
    return ids;
  }, context);
  for (const id of queued) {
    const conversation = await harness.conversation(id, context);
    if (!conversation) throw new Error(`Retained retirement conversation ${id} disappeared`);
    await conversation.abort(context, { background: true });
  }
  return queued.length;
}

/** Called after the sealed owner's domain teardown joins. Retained history is
 * reusable, including passive history awaiting a boundary; runnable tasks and
 * queued inputs cannot cross the lifetime boundary. */
export async function retireBoundAgentSession(harness: Harness, context: Context): Promise<void> {
  await harness.commit(async (tx) => {
    for (const status of ["pending", "running", "waiting", "completing"] as const) {
      if ((await tx.scanTasks({ status }, 1)).items.length)
        throw new Error("Agent retirement still owns unfinished tasks");
    }
    let cursor: Cursor | undefined;
    const conversations = [];
    do {
      const page = await tx.scanConversations({}, 256, cursor);
      conversations.push(...page.items);
      cursor = page.next;
    } while (cursor !== undefined);
    for (const conversation of conversations) {
      if ((await tx.doc(InboxDoc, conversation.id)).items.some((item) => item.mode !== "write"))
        throw new Error("Agent retirement still owns queued inputs");
    }
    const owner = await tx.doc(ExecutionOwner);
    if (!owner.runtimeId || !owner.contextId || !owner.incarnation || !owner.authoritySessionId)
      throw new Error("Agent retirement requires its existing host-bound owner");
    owner.status = "retired";
  }, context);
}

type BoundHarnessOptions = Omit<HarnessOptions, "publishWake"> & {
  readonly publishWake: NonNullable<HarnessOptions["publishWake"]>;
};

/**
 * Open one independently hosted execution owner over an already schema-admitted
 * store. The caller registers its host wake source before calling this function.
 * Validate ownership before Harness.open reconciles any surviving task record.
 * This does not install a schema, grant authority or invent domain receipts.
 */
export async function openBoundAgentSession(
  storage: Storage,
  owner: AgentExecutionOwner,
  options: BoundHarnessOptions,
  context: Context
): Promise<Harness> {
  const bound = { ...owner };
  let harness: Harness | undefined;
  try {
    for (const value of [
      bound.runtimeId,
      bound.contextId,
      bound.incarnation,
      bound.authoritySessionId,
    ]) {
      if (typeof value !== "string" || value.length === 0)
        throw new Error("Agent execution requires its host-resolved owner binding");
    }
    const record = await storage.findDocument(
      { kind: ExecutionOwner.definition.kind, scope: { kind: "session" } },
      "current",
      context
    );
    let handover = false;
    if (record) {
      const stored = await storage.document(record.id, "current", context);
      if (
        !stored ||
        stored.version !== ExecutionOwner.definition.version ||
        stored.value["runtimeId"] !== bound.runtimeId ||
        stored.value["contextId"] !== bound.contextId ||
        stored.value["incarnation"] !== bound.incarnation ||
        typeof stored.value["authoritySessionId"] !== "string" ||
        stored.value["authoritySessionId"] === "" ||
        !(
          (stored.value["status"] === "active" &&
            stored.value["authoritySessionId"] === bound.authoritySessionId) ||
          (stored.value["status"] === "retired" &&
            stored.value["authoritySessionId"] !== bound.authoritySessionId)
        )
      ) {
        throw new Error("Retired execution owner: this storage cannot authorize the current owner");
      }
      handover = stored.value["status"] === "retired";
      if (handover) {
        for (const status of ["pending", "running", "waiting", "completing"] as const) {
          if ((await storage.scanTasks({ status }, 1, undefined, context)).items.length)
            throw new Error("Retired agent storage still contains unfinished tasks");
        }
        for (const status of ["queued", "placed"] as const) {
          let cursor: Cursor | undefined;
          do {
            const page = await storage.scanSubmissions({ status }, 256, cursor, context);
            // Pi deliberately retains passive writes for the next boundary.
            // Only queued writes are history debt; placed or input submissions
            // still belong to an execution and must already be settled.
            if (page.items.some((submission) => status === "placed" || submission.type === "input"))
              throw new Error("Retired agent storage still contains unfinished submissions");
            cursor = page.next;
          } while (cursor !== undefined);
        }
      }
    } else {
      const conversations = await storage.scanConversations({}, 1, undefined, context);
      const documents = await storage.scanDocuments(
        { scope: { kind: "session" }, at: "current" },
        1,
        undefined,
        context
      );
      if (conversations.items.length > 0 || documents.items.length > 0)
        throw new Error(
          "Unbound execution namespace: existing data has no admitted execution owner"
        );
    }
    harness = await Harness.open(storage, options, context);
    if (!record || handover) {
      await harness.commit(async (tx) => {
        const identity = await tx.doc(ExecutionOwner);
        identity.runtimeId = bound.runtimeId;
        identity.contextId = bound.contextId;
        identity.incarnation = bound.incarnation;
        identity.authoritySessionId = bound.authoritySessionId;
        identity.status = "active";
      }, context);
    }
    return harness;
  } catch (error) {
    try {
      if (harness) await harness.close(withoutAbortSignal(context));
      else await storage.close(withoutAbortSignal(context));
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        "Agent owner admission and connection release failed"
      );
    }
    throw error;
  }
}
