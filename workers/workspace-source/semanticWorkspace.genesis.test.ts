import { describe, expect, it } from "vitest";
import {
  vcsBlameResultSchema,
  vcsNeighborsResultSchema,
  vcsReadMemoryResultSchema,
} from "@vibestudio/service-schemas/vcs";
import { SemanticVcsStore } from "./semanticVcsStore.js";
import { snapshotFixture, snapshotContentRelations } from "./semanticWorkspace.genesis.fixture.js";

const ingress = { causalParent: null };
describe("flat workspace genesis", () => {
  it("stores one snapshot event and no manufactured history, including after reopening", async () => {
    const f = await snapshotFixture();
    for (const table of [
      "gad_work_units",
      "gad_changes",
      "gad_work_unit_applications",
      "gad_applied_changes",
      "gad_applied_change_predicates",
      "gad_content_edges",
    ]) {
      expect(f.sql.exec(`SELECT COUNT(*) AS n FROM ${table}`).toArray()[0]?.["n"]).toBe(0);
    }
    expect(f.sql.exec(`SELECT kind FROM gad_workspace_events`).toArray()).toEqual([
      { kind: "genesis" },
    ]);
    const reopened = new SemanticVcsStore(f.sql, () => "2026-10-10T00:00:00.000Z");
    expect(reopened.contextRequired("context:snapshot")).toEqual(f.initial);
    reopened.assertIntegrity();
    f.store.facts.assertIndexParity(f.initial.working.workspaceFactRootId);
    const listed = await f.semantic.dispatch("listFiles", {
      ingress,
      input: { state: f.initial.working.ref, repositoryId: f.repositoryId, limit: 20 },
    });
    expect(listed).toMatchObject({
      kind: "complete",
      result: {
        files: [
          {
            fileId: f.fileId,
            contentHash: f.contentHash,
            authoredChangeId: null,
            authoredByWorkUnitId: null,
            contentClass: "external",
          },
        ],
      },
    });
    const blame = await f.semantic.dispatch("blame", {
      ingress,
      input: {
        state: f.initial.working.ref,
        repositoryId: f.repositoryId,
        fileId: f.fileId,
        range: { start: 0, end: f.text.length },
        limit: 20,
      },
    });
    if (blame.kind !== "complete") throw new Error("Blame incomplete");
    expect(vcsBlameResultSchema.parse(blame.result).spans).toEqual([
      expect.objectContaining({
        stop: "snapshot-boundary",
        origin: f.origin,
        start: 0,
        end: f.text.length,
      }),
    ]);
    const memory = await f.semantic.dispatch("readMemory", {
      ingress,
      input: {
        contextId: "context:snapshot",
        path: "packages/fixture/index.ts",
        expectedContentHash: f.contentHash,
        range: { start: 0, end: f.text.length },
      },
    });
    if (memory.kind !== "complete") throw new Error("Memory incomplete");
    expect(vcsReadMemoryResultSchema.parse(memory.result)).toMatchObject({
      status: "attached",
      episodes: [{ stop: "snapshot-boundary", origin: f.origin }],
      history: [],
    });
  });

  it("traces first edits, mode changes, and copies to snapshot files in both directions", async () => {
    const f = await snapshotContentRelations();
    const neighbors = await f.semantic.dispatch("neighbors", {
      ingress,
      input: { root: f.origin, limit: 20 },
    });
    if (neighbors.kind !== "complete") throw new Error("Neighbors incomplete");
    const edges = vcsNeighborsResultSchema.parse(neighbors.result).edges;
    expect(edges.map((edge) => edge.kind).sort()).toEqual([
      "authored-copy-source",
      "copies-content",
      "incorporates-content",
      "places-file",
      "preserves-content",
    ]);
    for (const contextId of ["context:copy", "context:mode", "context:text"]) {
      const state = f.store.contextRequired(contextId).working.ref;
      const point =
        contextId === "context:copy"
          ? f.store.facts.fileAtPath(f.store.stateRoot(state), f.repositoryId, "copy.ts")
          : f.store.facts.file(f.store.stateRoot(state), f.fileId);
      if (!point || point.state.presence !== "placed") throw new Error("Mutation file missing");
      const blame = await f.semantic.dispatch("blame", {
        ingress,
        input: {
          state,
          repositoryId: f.repositoryId,
          fileId: point.state.fileId,
          range: { start: 0, end: point.state.coordinateExtent },
          limit: 20,
        },
      });
      if (blame.kind !== "complete") throw new Error("Blame incomplete");
      const spans = vcsBlameResultSchema.parse(blame.result).spans;
      expect(spans[0]).toMatchObject({ stop: "snapshot-boundary", origin: f.origin });
      if (contextId === "context:text")
        expect(spans[1]).toMatchObject({ stop: "authored", start: 6, end: 11 });
      const read = await f.semantic.dispatch("readFile", {
        ingress,
        input: {
          state,
          repositoryId: f.repositoryId,
          file: { kind: "id", fileId: point.state.fileId },
        },
      });
      expect(read).toMatchObject({
        kind: "host-read",
        request: { contentClass: "external", externalKeys: ["repo:fixture://snapshot@v1"] },
      });
      f.store.facts.assertIndexParity(f.store.stateRoot(state));
    }
  });
});
