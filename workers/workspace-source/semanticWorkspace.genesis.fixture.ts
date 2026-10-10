import { sha256Hex } from "@vibestudio/content-addressing";
import { createInMemorySql } from "@vibestudio/durable/test-utils";
import { createSemanticVcsSchema } from "./semanticVcsSchema.js";
import { SemanticVcsStore } from "./semanticVcsStore.js";
import { SemanticWorkspace, type SemanticDispatchResult } from "./semanticWorkspace.testHost.js";

export async function snapshotFixture() {
  const sql = await createInMemorySql();
  createSemanticVcsSchema(sql);
  const now = () => "2026-10-10T00:00:00.000Z";
  const store = new SemanticVcsStore(sql, now);
  let ordinal = 0;
  const semantic = new SemanticWorkspace({
    workspaceId: "snapshot:test",
    sql,
    store,
    now,
    transaction: (fn) => {
      const point = `snapshot_${ordinal++}`;
      sql.exec(`SAVEPOINT ${point}`);
      try {
        const value = fn();
        sql.exec(`RELEASE ${point}`);
        return value;
      } catch (error) {
        sql.exec(`ROLLBACK TO ${point}`);
        sql.exec(`RELEASE ${point}`);
        throw error;
      }
    },
  });
  const text = "hello world\n";
  const bytes = new TextEncoder().encode(text);
  const contentHash = sha256Hex(bytes);
  const initial = store.initializeWorkspace("context:snapshot", "command:snapshot", {
    source: { sourceUri: "fixture://snapshot", snapshotRevision: "v1" },
    repositories: [
      {
        repoPath: "packages/fixture",
        files: [
          {
            path: "index.ts",
            contentHash,
            mode: 0o644,
            contentKind: "text",
            byteLength: bytes.length,
            coordinateExtent: text.length,
          },
        ],
      },
    ],
  });
  const repository = store.facts.repositoryAtPath(
    initial.working.workspaceFactRootId,
    "packages/fixture"
  );
  if (!repository || repository.presence !== "present")
    throw new Error("Missing initial repository");
  const file = store.facts.fileAtPath(
    initial.working.workspaceFactRootId,
    repository.repositoryId,
    "index.ts"
  );
  if (!file || file.state.presence !== "placed") throw new Error("Missing initial file");
  const repositoryId = repository.repositoryId;
  const fileId = file.state.fileId;
  const origin = { kind: "file" as const, state: initial.committed.ref, repositoryId, fileId };
  const acknowledge = (dispatch: SemanticDispatchResult) => {
    if (dispatch.kind === "host-read")
      dispatch = semantic.acknowledgeHostRead({
        request: dispatch.request,
        files: [{ contentHash, text }],
      });
    if (dispatch.kind !== "effects-pending" && dispatch.kind !== "complete")
      throw new Error(`Unexpected ${dispatch.kind}`);
    const result = dispatch.result;
    if (dispatch.kind === "effects-pending") {
      for (const effect of dispatch.effects) {
        if (effect.kind !== "materialize-context") throw new Error(`Unexpected ${effect.kind}`);
        const repositories = effect.payload["repositories"] as Array<{
          repositoryId: string;
          repoPath: string;
          presence: string;
        }>;
        semantic.acknowledgeEffect({
          effectId: effect.effectId,
          payloadDigest: effect.payloadDigest,
          receipt: {
            materializationId: effect.effectId,
            contextId: effect.payload["contextId"],
            targetState: effect.payload["targetState"],
            payloadDigest: effect.payloadDigest,
            repositories: repositories
              .filter((repository) => repository.presence === "present")
              .map(({ repositoryId, repoPath }) => ({
                repositoryId,
                repoPath,
                contentRoot: `state:${"0".repeat(64)}`,
              })),
          },
        });
      }
    }
    return result;
  };
  return {
    sql,
    store,
    semantic,
    initial,
    text,
    contentHash,
    repositoryId,
    fileId,
    origin,
    acknowledge,
  };
}

/** Real first mutations covering every content relation to an initial snapshot. */
export async function snapshotContentRelations() {
  const f = await snapshotFixture();
  const ingress = { causalParent: null };
  for (const contextId of ["context:copy", "context:mode", "context:text"])
    f.store.forkContext("context:snapshot", contextId);
  f.acknowledge(
    await f.semantic.dispatch("copy", {
      ingress,
      input: {
        contextId: "context:copy",
        commandId: "command:copy",
        expectedWorkingHead: f.initial.working.ref,
        copies: [
          {
            source: { state: f.origin.state, repositoryId: f.repositoryId, fileId: f.fileId },
            destination: { repositoryId: f.repositoryId, path: "copy.ts" },
          },
        ],
      },
    })
  );
  f.acknowledge(
    await f.semantic.dispatch("edit", {
      ingress,
      input: {
        contextId: "context:mode",
        commandId: "command:mode",
        expectedWorkingHead: f.initial.working.ref,
        changes: [
          { kind: "file-mode", repositoryId: f.repositoryId, fileId: f.fileId, mode: 0o755 },
        ],
      },
    })
  );
  f.acknowledge(
    await f.semantic.dispatch("edit", {
      ingress,
      input: {
        contextId: "context:text",
        commandId: "command:text",
        expectedWorkingHead: f.initial.working.ref,
        changes: [
          {
            kind: "text-edit",
            repositoryId: f.repositoryId,
            fileId: f.fileId,
            edits: [{ start: 6, end: 11, text: "there" }],
          },
        ],
      },
    })
  );
  return f;
}
