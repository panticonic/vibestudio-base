import { createInMemorySql } from "@vibestudio/durable/test-utils";
import { expect, it } from "vitest";
import { historySearchCausesAt, searchHistoryProse, searchTrajectoryProse } from "./doltWorkspaceSearch.js";
import { PROV_RESOLVER_PROTOCOL } from "./provenanceViews.js";

it("searches only the supplied immutable revisions and resolves older work-unit text", async () => {
  const sql = await createInMemorySql();
  sql.exec(`
    CREATE TABLE events (revision, event_id, created_at, message);
    CREATE TABLE gad_work_units (revision, work_unit_id, created_at, resolver_protocol,
      resolved_intent_text, resolved_intent_tier, kind, intent_summary, trigger_excerpt, trigger_sender_json);
    CREATE TABLE gad_changes (revision, work_unit_id, kind, result_json, base_json, operation, ordinal, change_id);
    CREATE TABLE gad_integration_decisions (revision, decision_id, created_at);
    CREATE TABLE gad_merge_decision_entries (revision, decision_id, rationale, coordinate_kind, coordinate_id);
    CREATE TABLE gad_external_deltas (revision, delta_id, created_at, repo_path, work_unit_id);
    CREATE TABLE commands (revision, cause_log_id, cause_head, cause_invocation_id);
    INSERT INTO events VALUES ('shared','main','2026-01-01','restore the queue');
    INSERT INTO events VALUES ('hidden','hidden-event','2026-01-03','restore the queue');
    INSERT INTO gad_work_units VALUES ('local','old','2026-01-02',NULL,NULL,NULL,'edit','restore the queue',NULL,NULL);
    INSERT INTO commands VALUES ('local','log','h','two'), ('local','log','h','one'), ('hidden','log','h','secret');
  `);
  sql.exec("INSERT INTO gad_work_units VALUES ('local','new','2026-01-03',?,'restore the queue','stated','edit','restore the queue',NULL,NULL)", PROV_RESOLVER_PROTOCOL);
  const history = {
    exec(query: string, ...bindings: unknown[]) {
      return sql.exec(query.replace(
        /dolt_at_(\w+)\((\?1?)\)/gu, "(SELECT * FROM $1 WHERE revision = $2)",
      ), ...bindings);
    },
  };
  const hits = searchHistoryProse(history, ["local", "shared"], {text:"restore queue", limit:2});
  expect(hits).toMatchObject({
    hits: [
      { node:{kind:"work-unit",workUnitId:"new"}, intent:{tier:"stated",text:"restore the queue"} },
      { node:{kind:"work-unit",workUnitId:"old"}, intent:{tier:"stated",text:"restore the queue"} },
    ],
    truncated: true,
  });
  expect(searchHistoryProse(history, ["shared"], {text:"restore queue", limit:10}).hits).toMatchObject([
    { node:{kind:"event",eventId:"main"} },
  ]);
  expect(historySearchCausesAt(history, "local", ["log", "h", "one"])).toEqual([["log", "h", "two"]]);
});

it("keeps unrelated trajectory messages out of an admitted invocation's results", async () => {
  const sql = await createInMemorySql();
  sql.exec(`
    CREATE TABLE trajectory_invocations (log_id, head, invocation_id, turn_id);
    CREATE TABLE trajectory_invocation_inputs (log_id, head, invocation_id, input_log_id, input_head, input_message_id);
    CREATE TABLE trajectory_messages (log_id, head, turn_id, message_id);
    CREATE TABLE prov_search_index (text, subject_kind, subject_id, log_id, head, label);
    INSERT INTO trajectory_invocations VALUES ('child','h','run','turn'), ('other','h','run','turn');
    INSERT INTO trajectory_invocation_inputs VALUES ('child','h','run','parent','parent-head','request');
    INSERT INTO trajectory_messages VALUES ('child','h','turn','reply'), ('other','h','turn','hidden');
    INSERT INTO prov_search_index VALUES
      ('keep this queue','trajectory-message','reply','child','h','assistant'),
      ('please preserve that queue','trajectory-message','request','parent','parent-head','user'),
      ('hidden queue','trajectory-message','hidden','other','h','private');
  `);
  const search = { text:"queue", limit:10 };
  expect(searchTrajectoryProse(sql, search, [["child","h","run"]]).map(({ node }) => node)).toEqual([
    { kind:"trajectory-message", logId:"child", head:"h", messageId:"reply" },
    { kind:"trajectory-message", logId:"parent", head:"parent-head", messageId:"request" },
  ]);
  expect(searchTrajectoryProse(sql, search, [["child","h","wrong-invocation"]])).toEqual([]);
});
