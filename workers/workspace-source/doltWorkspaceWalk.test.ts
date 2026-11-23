import { createInMemorySql } from "@vibestudio/durable/test-utils";
import { vcsWalkInputSchema, type VcsSemanticNodeRef } from "@vibestudio/service-schemas/vcs";
import { expect, it } from "vitest";
import { workspaceRejectionsWalk } from "./doltWorkspaceWalk.js";
import { PROV_RESOLVER_PROTOCOL } from "./provenanceViews.js";

it("finds counteractions in the requested repository and preserves exact file scope", async () => {
  const sql = await createInMemorySql();
  sql.exec(`
    CREATE TABLE gad_work_units (revision, work_unit_id, created_at, kind, intent_summary,
      trigger_excerpt, trigger_sender_json, resolved_intent_text, resolved_intent_tier, resolver_protocol);
    CREATE TABLE gad_changes (revision, change_id, work_unit_id, kind);
    CREATE TABLE gad_change_coordinates (revision, change_id, file_id, repository_id, path, role);
    CREATE TABLE gad_change_counteractions (revision, change_id, counteracted_change_id);
    CREATE TABLE gad_external_deltas (revision, delta_id, work_unit_id, created_at, repo_path, repository_id, status);
    CREATE TABLE gad_integration_decisions (revision, decision_id, work_unit_id, created_at);
    CREATE TABLE gad_merge_decision_entries (revision, decision_id, coordinate_kind, coordinate_id, resolution, rationale);
  `);
  for (const [name, repo] of [["one", "repo:requested"], ["two", "repo:requested"], ["other", "repo:foreign"]]) {
    for (const kind of ["edit", "revert"]) {
      const work = `${kind}:${name}`;
      sql.exec("INSERT INTO gad_work_units VALUES ('tip', ?, '2026-11-21', ?, NULL, NULL, NULL, ?, 'stated', ?)",
        work, kind, work, PROV_RESOLVER_PROTOCOL);
      sql.exec("INSERT INTO gad_changes VALUES ('tip', ?, ?, 'text')", work, work);
      sql.exec("INSERT INTO gad_change_coordinates VALUES ('tip', ?, ?, ?, ?, 'result')",
        work, `file:${name}`, repo, `${name}.ts`);
    }
    sql.exec("INSERT INTO gad_change_counteractions VALUES ('tip', ?, ?)", `revert:${name}`, `edit:${name}`);
  }
  const history = {
    exec(query: string, ...bindings: unknown[]) {
      return sql.exec(query.replace(
        /dolt_at_(\w+)\((\?1?)\)/gu, "(SELECT * FROM $1 WHERE revision = $2)",
      ), ...bindings);
    },
  };
  const state = { kind: "event" as const, eventId: "event:tip" };
  const rejections = (subject: VcsSemanticNodeRef) => workspaceRejectionsWalk(
    history, "tip", ["tip"], "workspace:fixture",
    vcsWalkInputSchema.parse({ contextId: "context:fixture", walk: "rejections", subject }),
  ).entries.filter(({ group }) => group === "counteractions").map(({ detail }) => detail);
  const repositoryId = "repo:requested";
  expect(rejections({ kind: "repository", state, repositoryId })).toEqual(
    ["attempted (stated): edit:one", "attempted (stated): edit:two"],
  );
  expect(rejections({ kind: "file", state, repositoryId, fileId: "file:one" })).toEqual(
    ["attempted (stated): edit:one"],
  );
});
