import { sha256HexSyncText } from "@vibestudio/content-addressing";
import { NativeBlobTextObservationSchema } from "@vibestudio/service-schemas/blobstore";
import {
  evalOperationJournalSchema,
  type EvalOperationJournal,
} from "@vibestudio/service-schemas/eval";
import { mainRpcMethods } from "@vibestudio/service-schemas/mainRpc";
import { contextId, rpc } from "@workspace/runtime";
import type {
  EvalRecoveryAttempt,
  EvalRecoveryReadback,
  EvalRecoveryStore,
} from "../sandbox/recovery/types.js";

type Assignment = {
  goal: string;
  contextId: string;
  runId: string;
  result: { success: boolean; operationJournal?: EvalOperationJournal };
  expectedText: string;
  allowReadback: boolean;
};

export function bindEvalRecovery(assignment: Assignment) {
  if (assignment.contextId !== contextId)
    throw new Error("Recovery belongs to a different workspace context");
  const operationId = crypto.randomUUID();
  const expectedDigest = sha256HexSyncText(assignment.expectedText);
  const expectedSize = new TextEncoder().encode(
    assignment.expectedText,
  ).byteLength;
  const native = evalOperationJournalSchema.safeParse(
    assignment.result.operationJournal,
  );
  let journal: EvalRecoveryAttempt["journal"] = native.success
    ? native.data.truncated
      ? "truncated"
      : "complete"
    : "unavailable";
  const stores: EvalRecoveryStore[] = [];
  for (const entry of native.data?.entries ?? []) {
    if (entry["type"] !== "blob-text.observation") continue;
    const parsed = NativeBlobTextObservationSchema.safeParse(entry["receipt"]);
    if (!parsed.success) {
      journal = "unavailable";
      continue;
    }
    if (parsed.data.method === "putText") {
      const { digest, contentDigest, size } = parsed.data;
      stores.push({ digest, contentDigest, size });
    }
  }
  const attempt: EvalRecoveryAttempt = {
    operationId,
    runId: assignment.runId,
    cell: assignment.result.success ? "returned" : "failed",
    journal,
    expectedDigest,
    expectedSize,
    allowReadback: assignment.allowReadback,
    stores,
  };
  const [store] = stores;
  const exact =
    journal === "complete" &&
    stores.length === 1 &&
    store?.digest === expectedDigest &&
    store.contentDigest === expectedDigest &&
    store.size === expectedSize;
  let observed = false;
  let readback: Promise<EvalRecoveryReadback> | undefined;

  async function read(): Promise<EvalRecoveryReadback> {
    const text = await rpc.call("main", mainRpcMethods["blobstore.getText"], [
      expectedDigest,
    ]);
    return {
      digest: expectedDigest,
      observedDigest: text === null ? null : sha256HexSyncText(text),
      size: text === null ? null : new TextEncoder().encode(text).byteLength,
    };
  }

  return {
    request: { goal: assignment.goal, operationId },
    services: {
      evalRecoveryJournal: {
        async observe(id: string): Promise<EvalRecoveryAttempt> {
          if (id !== operationId)
            throw new Error("Use the assigned eval attempt");
          observed = true;
          return structuredClone(attempt);
        },
      },
      evalRecoveryReadback: {
        async read(id: string, digest: string): Promise<EvalRecoveryReadback> {
          if (
            id !== operationId ||
            !observed ||
            !attempt.allowReadback ||
            !exact ||
            digest !== expectedDigest
          )
            throw new Error(
              "Read only an assigned digest backed by its complete native receipt",
            );
          return { ...(await (readback ??= read())) };
        },
      },
    },
  };
}
