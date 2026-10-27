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

/** Activation-published native resource obligation, delivered in object props. */
export type NativeAgentActivation =
  import("@vibestudio/shared/runtime/entitySpec").NativeOwnerAdmission;

export type AgentHostCall =
  import("@vibestudio/service-schemas/mainRpc").MainRpcCaller;

/**
 * Consume the host-published activation witness, never restored SQLite identity
 * or inbound request arguments. Activation already owns native wake registration
 * and the entity-lifetime release obligation before the object can execute.
 */
export async function openPlatformAgentSession(
  createStorage: () => Promise<Storage>,
  image: LoadedAgentImage,
  activation: NativeAgentActivation | null,
  call: AgentHostCall,
  options: Omit<HarnessOptions, "publishWake">,
  context: Context,
): Promise<Harness> {
  const loaded = { ...image };
  if (
    !/^[a-f0-9]{64}$/.test(loaded.executionDigest) ||
    !loaded.source ||
    !loaded.className ||
    !loaded.objectKey ||
    loaded.runtimeId !==
      `do:${loaded.source}:${loaded.className}:${loaded.objectKey}`
  )
    throw new Error("Agent Session requires its exact host-loaded image");
  const key = {
    source: loaded.source,
    className: loaded.className,
    objectKey: loaded.objectKey,
  };
  if (
    !activation ||
    activation.runtimeId !== loaded.runtimeId ||
    activation.executionDigest !== loaded.executionDigest ||
    [activation.contextId, activation.authoritySessionId, activation.incarnation, activation.effectiveVersion].some(
      (value) => typeof value !== "string" || value.length === 0,
    ) ||
    !Number.isSafeInteger(activation.generation) ||
    activation.generation < 1
  )
    throw new Error("Agent image does not match its active platform owner");
  const { incarnation, contextId, authoritySessionId, effectiveVersion } =
    activation;
  let acknowledgedWake: { revision: number; wakeAt: number | null } | undefined;
  const harness = await openBoundAgentSession(
    await createStorage(),
    {
      runtimeId: loaded.runtimeId,
      contextId,
      incarnation,
      authoritySessionId,
      generation: activation.generation,
    },
    {
      ...options,
      publishWake: async (schedule) => {
        if (
          acknowledgedWake?.revision === schedule.revision &&
          acknowledgedWake.wakeAt === schedule.wakeAt
        )
          return;
        const accepted = workspaceStateMethods.alarmSourcePublish.returns.parse(
          await call("workspace-state.alarmSourcePublish", [
            { ...key, incarnation, ...schedule },
          ]),
        );
        if (accepted === "stale")
          throw new Error("Agent wake belongs to a retired host incarnation");
        acknowledgedWake = {
          revision: schedule.revision,
          wakeAt: schedule.wakeAt,
        };
      },
    },
    context,
  );
  admittedExecutors.set(harness, {
    ...loaded,
    effectiveVersion,
    owner: {
      runtimeId: loaded.runtimeId,
      contextId,
      incarnation,
      authoritySessionId,
    },
  });
  return harness;
}

type AdmittedExecutor = LoadedAgentImage & {
  effectiveVersion: string;
  owner: AgentExecutionOwner;
};
const admittedExecutors = new WeakMap<Harness, AdmittedExecutor>();

/** Activation-local admission; retained SQLite cannot authorize an executable. */
export async function admittedAgentExecutor(
  harness: Harness,
  image: LoadedAgentImage,
  context: Context,
): Promise<AdmittedExecutor> {
  const admitted = admittedExecutors.get(harness);
  const owner = await retainedAgentExecutionOwner(harness, context);
  if (
    !admitted ||
    admitted.runtimeId !== image.runtimeId ||
    admitted.source !== image.source ||
    admitted.className !== image.className ||
    admitted.objectKey !== image.objectKey ||
    admitted.executionDigest !== image.executionDigest ||
    owner.authoritySessionId !== admitted.owner.authoritySessionId ||
    owner.contextId !== admitted.owner.contextId ||
    owner.incarnation !== admitted.owner.incarnation
  )
    throw new Error(
      "Native invocation requires its current host-bound owner and image",
    );
  return admitted;
}

const ExecutionOwner = defineDoc<{
  runtimeId: string;
  contextId: string;
  incarnation: string;
  authoritySessionId: string;
  generation: number;
  status: "active" | "retired";
}>({
  kind: "vibestudio.execution-owner",
  version: 2,
  scope: "session",
  initial: () => ({
    runtimeId: "",
    contextId: "",
    incarnation: "",
    authoritySessionId: "",
    generation: 0,
    status: "active",
  }),
  checkpointWhen: () => true,
});

/** Read the existing host-bound identity; receipt inspection cannot admit an owner. */
export async function retainedAgentExecutionOwner(
  reader: DocumentReader,
  context: Context,
): Promise<AgentExecutionOwner> {
  const owner = await reader.snapshot(ExecutionOwner, context);
  return projectExecutionOwner(owner);
}

/** Validate the same active owner on the mutation line as input/source admission. */
export async function retainedAgentExecutionOwnerInTransaction(
  tx: Tx,
): Promise<AgentExecutionOwner> {
  return projectExecutionOwner(await tx.doc(ExecutionOwner));
}

function projectExecutionOwner(
  owner:
    | (AgentExecutionOwner & { readonly status: "active" | "retired" })
    | undefined,
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
  context: Context,
): Promise<number> {
  const queued = await harness.commit(async (tx) => {
    const ids: ConversationId[] = [];
    let cursor: Cursor | undefined;
    do {
      const page = await tx.scanConversations({}, 256, cursor);
      for (const conversation of page.items) {
        if (
          (await tx.doc(InboxDoc, conversation.id)).items.some(
            (item) => item.mode !== "write",
          )
        )
          ids.push(conversation.id);
      }
      cursor = page.next;
    } while (cursor !== undefined);
    return ids;
  }, context);
  for (const id of queued) {
    const conversation = await harness.conversation(id, context);
    if (!conversation)
      throw new Error(`Retained retirement conversation ${id} disappeared`);
    await conversation.abort(context, { background: true });
  }
  return queued.length;
}

/** Called after the sealed owner's domain teardown joins. Retained history is
 * reusable, including passive history awaiting a boundary; runnable tasks and
 * queued inputs cannot cross the lifetime boundary. */
export async function retireBoundAgentSession(
  harness: Harness,
  context: Context,
): Promise<void> {
  await harness.commit(async (tx) => {
    for (const status of [
      "pending",
      "running",
      "waiting",
      "completing",
    ] as const) {
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
      if (
        (await tx.doc(InboxDoc, conversation.id)).items.some(
          (item) => item.mode !== "write",
        )
      )
        throw new Error("Agent retirement still owns queued inputs");
    }
    const owner = await tx.doc(ExecutionOwner);
    if (
      !owner.runtimeId ||
      !owner.contextId ||
      !owner.incarnation ||
      !owner.authoritySessionId
    )
      throw new Error(
        "Agent retirement requires its existing host-bound owner",
      );
    owner.status = "retired";
  }, context);
}

type BoundHarnessOptions = Omit<HarnessOptions, "publishWake"> & {
  readonly publishWake: NonNullable<HarnessOptions["publishWake"]>;
};

/**
 * Open one independently hosted execution owner over an already schema-admitted
 * store. Entity activation has already published its host wake source.
 * Validate ownership before Harness.open reconciles any surviving task record.
 * This does not install a schema, grant authority or invent domain receipts.
 */
export async function openBoundAgentSession(
  storage: Storage,
  owner: AgentExecutionOwner & { readonly generation: number },
  options: BoundHarnessOptions,
  context: Context,
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
        throw new Error(
          "Agent execution requires its host-resolved owner binding",
        );
    }
    if (!Number.isSafeInteger(bound.generation) || bound.generation < 1)
      throw new Error("Agent execution requires its host storage generation");
    const record = await storage.findDocument(
      { kind: ExecutionOwner.definition.kind, scope: { kind: "session" } },
      "current",
      context,
    );
    if (record) {
      const stored = await storage.document(record.id, "current", context);
      const storedGeneration = stored?.value["generation"];
      const sameStorage = stored?.value["incarnation"] === bound.incarnation &&
        storedGeneration === bound.generation;
      const replacedStorage = typeof storedGeneration === "number" &&
        Number.isSafeInteger(storedGeneration) && storedGeneration >= 1 &&
        storedGeneration < bound.generation &&
        stored?.value["incarnation"] !== bound.incarnation;
      if (
        !stored ||
        stored.version !== ExecutionOwner.definition.version ||
        stored.value["runtimeId"] !== bound.runtimeId ||
        stored.value["contextId"] !== bound.contextId ||
        (!sameStorage && !replacedStorage) ||
        typeof stored.value["authoritySessionId"] !== "string" ||
        stored.value["authoritySessionId"] === "" ||
        !(
          (stored.value["status"] === "active" &&
            stored.value["authoritySessionId"] === bound.authoritySessionId) ||
          (stored.value["status"] === "retired" &&
            stored.value["authoritySessionId"] !== bound.authoritySessionId)
        )
      ) {
        throw new Error(
          "Retired execution owner: this storage cannot authorize the current owner",
        );
      }
      const handover = stored.value["status"] === "retired";
      if (handover) {
        for (const status of [
          "pending",
          "running",
          "waiting",
          "completing",
        ] as const) {
          if (
            (await storage.scanTasks({ status }, 1, undefined, context)).items
              .length
          )
            throw new Error(
              "Retired agent storage still contains unfinished tasks",
            );
        }
        for (const status of ["queued", "placed"] as const) {
          let cursor: Cursor | undefined;
          do {
            const page = await storage.scanSubmissions(
              { status },
              256,
              cursor,
              context,
            );
            // Pi deliberately retains passive writes for the next boundary.
            // Only queued writes are history debt; placed or input submissions
            // still belong to an execution and must already be settled.
            if (
              page.items.some(
                (submission) =>
                  status === "placed" || submission.type === "input",
              )
            )
              throw new Error(
                "Retired agent storage still contains unfinished submissions",
              );
            cursor = page.next;
          } while (cursor !== undefined);
        }
      }
      // Validate the whole handover before changing identity. Published storage
      // replacement and retired-owner handover compose on one mutation line,
      // before Harness.open admits retained invocations or wake publication.
      if (replacedStorage || handover) {
        // No Session holds this store yet, so there is no in-memory state to adopt.
        await storage.commit([{
          type: "document.change",
          id: record.id,
          content: {
            kind: "base",
            version: ExecutionOwner.definition.version,
            value: {
              runtimeId: bound.runtimeId,
              contextId: bound.contextId,
              incarnation: bound.incarnation,
              authoritySessionId: bound.authoritySessionId,
              generation: bound.generation,
              status: "active",
            },
          },
        }], () => {}, context);
      }
    } else {
      const conversations = await storage.scanConversations(
        {},
        1,
        undefined,
        context,
      );
      const documents = await storage.scanDocuments(
        { scope: { kind: "session" }, at: "current" },
        1,
        undefined,
        context,
      );
      if (conversations.items.length > 0 || documents.items.length > 0)
        throw new Error(
          "Unbound execution namespace: existing data has no admitted execution owner",
        );
    }
    harness = await Harness.open(storage, options, context);
    if (!record) {
      await harness.commit(async (tx) => {
        const identity = await tx.doc(ExecutionOwner);
        identity.runtimeId = bound.runtimeId;
        identity.contextId = bound.contextId;
        identity.incarnation = bound.incarnation;
        identity.generation = bound.generation;
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
        "Agent owner admission and connection release failed",
      );
    }
    throw error;
  }
}
