import type { StateNodeRef } from "@workspace/vcs-engine";
import { expect, it } from "vitest";
import { FakeDoltStorage } from "@vibestudio/durable/test-dolt";
import { createDoltWorkspaceState } from "./doltWorkspaceState.js";
import { replayIntoDolt } from "./legacyDoltReplay.js";
import {
  legacyHistoryReplay,
  legacyPlacementChange,
  type LegacyHistoryStep,
} from "./legacyHistoryReplay.js";
import type {
  ApplicationRecord,
  WorkspaceEventRecord,
} from "./semanticVcsStore.js";

const eventRef = (id: string): StateNodeRef => ({ kind: "event", eventId: id });
const applicationRef = (id: string): StateNodeRef => ({
  kind: "application",
  applicationId: id,
});

function event(
  eventId: string,
  parentEventIds: string[],
  applicationIds: string[] = [],
): WorkspaceEventRecord {
  return {
    eventId,
    commandId: eventId,
    kind:
      parentEventIds.length === 2
        ? "integration-commit"
        : parentEventIds.length
          ? "commit"
          : "genesis",
    parentEventIds,
    applicationIds,
    resultWorkspaceFactRootId: eventId,
    snapshotSource: null,
    message: null,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function application(
  applicationId: string,
  basis: StateNodeRef,
): ApplicationRecord {
  return {
    applicationId,
    basis,
    workUnitId: applicationId,
    appliedChangeIds: [],
    resultWorkspaceFactRootId: applicationId,
    semanticProtocol: "fixture",
  };
}

function reader(
  events: WorkspaceEventRecord[],
  applications: ApplicationRecord[] = [],
) {
  const byEvent = new Map(events.map((record) => [record.eventId, record]));
  const byApplication = new Map(
    applications.map((record) => [record.applicationId, record]),
  );
  return {
    event: (id: string) => byEvent.get(id) ?? null,
    application: (id: string) => byApplication.get(id) ?? null,
  };
}

it("replays parents and application bases before each result and shares common history", () => {
  const source = reader(
    [
      event("integration", ["right", "left"], ["merge-app"]),
      event("left", ["root"], ["left-app"]),
      event("right", ["root"], ["right-app"]),
      event("root", []),
    ],
    [
      application("merge-app", eventRef("right")),
      application("left-app", eventRef("root")),
      application("right-app", applicationRef("prepare")),
      application("prepare", eventRef("root")),
    ],
  );
  const steps = [
    ...legacyHistoryReplay(source, [eventRef("integration"), eventRef("left")]),
  ];
  expect(
    steps.map((step) =>
      step.kind === "event" ? step.record.eventId : step.record.applicationId,
    ),
  ).toEqual([
    "root",
    "prepare",
    "right-app",
    "right",
    "left-app",
    "left",
    "merge-app",
    "integration",
  ]);
});

it("refuses missing history and cycles", () => {
  const missing = reader([event("tip", ["missing"])]);
  expect(() => [...legacyHistoryReplay(missing, [eventRef("tip")])]).toThrow(
    "Missing legacy workspace event:missing",
  );
  const cyclic = reader([event("tip", ["tip"])]);
  expect(() => [...legacyHistoryReplay(cyclic, [eventRef("tip")])]).toThrow(
    "Cycle in legacy workspace history at event:tip",
  );
});

it("projects only changed legacy placements and preserves a deletion as a tombstone", () => {
  const placed = {
    fileId: "file",
    fileStateId: "placed",
    presence: "placed" as const,
    repositoryId: "repo",
    path: "src/file.ts",
    contentHash: "content",
    mode: 0o644,
    contentKind: "text" as const,
    byteLength: 4,
    coordinateExtent: 4,
  };
  const deleted = {
    fileId: "file",
    fileStateId: "deleted",
    presence: "deleted" as const,
    priorFileStateId: "placed",
    tombstoneChangeId: "delete",
  };
  const change = legacyPlacementChange(
    {
      entries: (root, kind) =>
        kind === "file" ? [{ key: "file", value: root }] : [],
      memberByStateId: () => null,
      fileStateById: (id) =>
        id === "placed" ? placed : id === "deleted" ? deleted : null,
    },
    "placed",
    "deleted",
  );
  expect(change).toEqual({
    repositoryUpdates: [],
    fileUpdates: [{ fileId: "file", expected: placed, result: deleted }],
  });
});

it("resumes a stopped placement replay and preserves both branches of an integration", async () => {
  const history = reader([
    event("root", []),
    event("left", ["root"]),
    event("right", ["root"]),
    event("integrated", ["left", "right"]),
  ]);
  const members: Record<string, readonly string[]> = {
    root: ["shared"],
    left: ["shared", "left"],
    right: ["shared", "right"],
    integrated: ["shared", "left", "right"],
  };
  let interrupt = true;
  const written: string[] = [];
  const source = {
    ...history,
    legacyProvenance(step: LegacyHistoryStep) {
      if (step.kind !== "event") throw new Error("Unexpected application");
      const id = step.record.eventId;
      written.push(id);
      return {
        kind: "event" as const,
        command: {
          command_id: id,
          scope_kind: "workspace",
          scope_id: "fixture",
          method: interrupt && id === "right" ? null : "commit",
          request_digest: id,
          cause_log_id: null,
          cause_head: null,
          cause_invocation_id: null,
          created_at: step.record.createdAt,
        },
        templateInstallation: null,
        externalSources: [],
      };
    },
    facts: {
      entries(root: string, kind: string) {
        switch (kind) {
          case "repository":
            return [{ key: "repo", value: "repo-state" }];
          case "file":
            return members[root]!.map((key) => ({ key, value: key }));
          default:
            throw new Error("Unexpected legacy index");
        }
      },
      memberByStateId(repositoryStateId: string) {
        return {
          repositoryId: "repo",
          repositoryStateId,
          presence: "present" as const,
          repoPath: ".",
          fileManifestId: "files",
        };
      },
      fileStateById(fileId: string) {
        return {
          fileId,
          fileStateId: fileId,
          repositoryId: "repo",
          path: fileId,
          presence: "placed" as const,
          contentHash: fileId,
          mode: 0o644,
          contentKind: "text" as const,
          byteLength: 1,
          coordinateExtent: 1,
        };
      },
    },
  };
  const first = await FakeDoltStorage.create();
  createDoltWorkspaceState(first.sql);
  const schema = first.dolt.commit("schema");
  const tips = [eventRef("integrated")];
  expect(() =>
    replayIntoDolt(source, { ...first.storage, sql: first.sql }, schema, tips),
  ).toThrow(/NOT NULL/u);

  const restored = await first.restart();
  interrupt = false;
  written.length = 0;
  const result = replayIntoDolt(
    source,
    { ...restored.storage, sql: restored.sql },
    schema,
    tips,
  );
  expect(written).toEqual(["right", "integrated"]);
  expect(restored.dolt.hashOf("HEAD")).toBe(
    result.get("event:integrated")?.hash,
  );
  expect(restored.dolt.hashOf("main")).toBe(schema);
  expect(
    restored.sql
      .exec("SELECT event_id FROM events ORDER BY event_id")
      .toArray(),
  ).toEqual(
    ["integrated", "left", "right", "root"].map((event_id) => ({ event_id })),
  );
  expect(
    restored.sql
      .exec("SELECT command_id FROM commands ORDER BY command_id")
      .toArray(),
  ).toEqual(
    ["integrated", "left", "right", "root"].map((command_id) => ({
      command_id,
    })),
  );
  expect(
    restored.sql.exec("SELECT file_id FROM files ORDER BY file_id").toArray(),
  ).toEqual([{ file_id: "left" }, { file_id: "right" }, { file_id: "shared" }]);
  expect(restored.dolt.log().map(({ hash }) => hash)).toEqual(
    expect.arrayContaining([
      result.get("event:left")?.hash,
      result.get("event:right")?.hash,
    ]),
  );
});
