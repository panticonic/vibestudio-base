import {
  copyJson,
  type Context,
  type JsonRepresentation,
  type JsonValue,
} from "@panticonic/pi-chord";
import {
  defineDocFamily,
  LiveDoc,
  type Harness,
  type HarnessCommit,
  type SubmissionId,
  type TaskId,
  type TaskRecord,
  type Tx,
} from "@panticonic/pi-durable";
import type { AgentProductMetadata } from "@workspace/agentic-core/agent-product-metadata";

/** Product provenance accompanies native work; it does not schedule or own it. */
type ProductContext = {
  channelId: string;
  inputs: SubmissionId[];
  metadata: JsonRepresentation<AgentProductMetadata> | null;
};
const ProductInput = defineDocFamily<
  {
    channelId: string;
    metadata: JsonRepresentation<AgentProductMetadata> | null;
  },
  null
>({
  kind: "vibestudio.product-input",
  version: 1,
  scope: "session",
  family: true,
  initial: () => ({ channelId: "", metadata: null }),
  checkpointWhen: () => true,
});
// Original-input provenance must survive native task settlement. Task-scoped
// documents retire at settlement; this immutable family shares the session
// lifetime of its task and submission records and never schedules work.
const NativeRunProductContextDoc = defineDocFamily<ProductContext, null>({
  kind: "vibestudio.product-run-context",
  version: 1,
  scope: "session",
  family: true,
  initial: () => ({ channelId: "", inputs: [], metadata: null }),
  checkpointWhen: () => true,
});

export async function recordNativeProductInput(
  tx: Tx,
  id: SubmissionId,
  channelId: string,
  metadata?: AgentProductMetadata,
): Promise<void> {
  const input = await tx.doc(ProductInput, String(id), null);
  if (input.channelId)
    throw new Error("Native product input provenance already admitted");
  input.channelId = channelId;
  input.metadata = metadata
    ? (copyJson(metadata, {
        omitUndefinedProperties: true,
      }) as JsonRepresentation<AgentProductMetadata>)
    : null;
}

export function nativeProductInput(tx: Tx, id: SubmissionId) {
  return tx.doc(ProductInput, String(id), null);
}

export function nativeProductTask(tx: Tx, taskId: TaskId) {
  return tx.doc(NativeRunProductContextDoc, String(taskId), null);
}

/** Pin genuine model-free domain work at its actual native task admission. */
export async function recordNativeProductTask(
  tx: Tx,
  taskId: TaskId,
  channelId: string,
  metadata: AgentProductMetadata,
): Promise<void> {
  const product = await nativeProductTask(tx, taskId);
  if (product.channelId || product.metadata || product.inputs.length)
    throw new Error("Native product task provenance already admitted");
  product.channelId = channelId;
  product.metadata = copyJson(metadata, {
    omitUndefinedProperties: true,
  }) as JsonRepresentation<AgentProductMetadata>;
}

/** Pin the run's original admitted inputs before any native generation can execute. */
export async function prepareNativeProductContexts(
  tx: Tx,
  staged: HarnessCommit,
): Promise<void> {
  for (const task of staged.tasks) {
    if (task.kind !== "pi.generation" || task.state.status !== "pending")
      continue;
    const live = await tx.doc(LiveDoc, task.conversationId);
    if (live.run?.taskId !== task.id) continue;
    const context = await nativeProductTask(tx, task.id);
    if (context.inputs.length) continue;
    context.inputs = [...live.run.inputs];
    const firstInput = live.run.inputs[0];
    if (firstInput === undefined)
      throw new Error("Native product run has no actual admitted input");
    const original = await tx.doc(ProductInput, String(firstInput), null);
    if (original) {
      context.channelId = original.channelId;
      context.metadata = original.metadata;
    }
  }
}

/** Native task ancestry is the source of scope for tools and compaction. */
export async function nativeTaskProductContext(
  harness: Harness,
  taskId: TaskId,
  context: Context,
): Promise<Readonly<ProductContext> | null> {
  let id: TaskId | undefined = taskId;
  while (id !== undefined) {
    const product = await harness.snapshot(
      NativeRunProductContextDoc,
      String(id),
      context,
    );
    if (product && (product.inputs.length || product.metadata)) return product;
    const task: TaskRecord<JsonValue, JsonValue, unknown> | undefined =
      await harness.getTask(id, context);
    if (!task)
      throw new Error("Native product context lost its actual owning task");
    id = task.owner;
  }
  return null;
}
