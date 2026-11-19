import { canonicalJson, compareUtf16CodeUnits } from "@vibestudio/content-addressing";
import type { SqlStorage } from "@vibestudio/durable";
import { compactId, type ContentMapping, type ResolvedIntent, type StateNodeRef } from "@workspace/vcs-engine";
import {
  contentMappingRowValues,
  encodeContentMappingRow,
} from "./semanticVcsContentMappingCodec.js";
import { SemanticVcsError } from "./semanticVcsErrors.js";
import type {
  ApplicationPersistencePlan,
  AppliedChangeRecord,
  ChangeRecord,
  ContentEdgeRecord,
  IntegrationDecisionRecord,
  WorkUnitRecord,
} from "./semanticVcsStore.js";
import { execBatchedInsert } from "./sqlBatch.js";
import { PROV_RESOLVER_PROTOCOL } from "./provenanceViews.js";

export const stateNodeKey = (ref: StateNodeRef): string =>
  ref.kind === "event" ? `event:${ref.eventId}` : `application:${ref.applicationId}`;

export function validateApplicationPlan(plan: Pick<
  ApplicationPersistencePlan,
  "workUnit" | "changes" | "application" | "appliedChanges" | "contentEdges" | "decisions"
>): void {
  const authored = plan.changes.map((change) => change.changeId);
  const decision = plan.decisions[0];
  const incorporated = decision?.entries.flatMap((entry) => entry.accountedSourceChangeIds) ?? [];
  const appliedChangeIds = new Set(plan.appliedChanges.map((value) => value.appliedChangeId));
  const targets = plan.workUnit.externalSnapshot?.targetRepositoryIds ?? [];
  const normalizedTargets = [...new Set(targets)].sort(compareUtf16CodeUnits);
  if (
    (plan.workUnit.kind === "import") !== (plan.workUnit.externalSnapshot !== null) ||
    (plan.workUnit.externalSnapshot !== null &&
      (targets.length === 0 || canonicalJson(targets) !== canonicalJson(normalizedTargets))) ||
    canonicalJson(authored) !== canonicalJson(plan.workUnit.authoredChangeIds) ||
    plan.changes.some((change) => change.workUnitId !== plan.workUnit.workUnitId) ||
    plan.application.workUnitId !== plan.workUnit.workUnitId ||
    (plan.workUnit.kind === "merge" ? plan.decisions.length !== 1 : plan.decisions.length !== 0) ||
    plan.decisions.some(
      (value) =>
        value.workUnitId !== plan.workUnit.workUnitId ||
        stateNodeKey(value.targetState) !== stateNodeKey(plan.application.basis)
    ) ||
    canonicalJson(plan.appliedChanges.map((value) => value.appliedChangeId)) !==
      canonicalJson(plan.application.appliedChangeIds) ||
    plan.appliedChanges.some(
      (value) =>
        value.applicationId !== plan.application.applicationId ||
        ![...authored, ...incorporated].includes(value.changeId)
    ) ||
    plan.changes.some((change) => (change.kind === "file-copy") !== (change.source !== null)) ||
    plan.contentEdges.some((edge) => !appliedChangeIds.has(edge.childAppliedChangeId))
  ) {
    throw new SemanticVcsError("IntegrityFailure", "Application plan ownership is inconsistent");
  }
}

/** Writes immutable provenance shared by the SQLite and Dolt commit paths. */
export class SemanticProvenanceWriter {
  constructor(private readonly sql: SqlStorage) {}

  persistWorkUnit(value: WorkUnitRecord, intent?: ResolvedIntent): void {
    for (const [field, candidate] of Object.entries({
      workUnitId: value.workUnitId,
      commandId: value.commandId,
      kind: value.kind,
      authorContextId: value.authorContextId,
      contentClass: value.contentClass,
      normalizationProtocol: value.normalizationProtocol,
      createdAt: value.createdAt,
    })) {
      if (typeof candidate !== "string" || candidate.length === 0) {
        throw new SemanticVcsError(
          "IntegrityFailure",
          `Work unit ${value.workUnitId ?? "<unknown>"} has invalid ${field}`
        );
      }
    }
    this.sql.exec(
      `INSERT INTO gad_work_units
       (work_unit_id, command_id, kind, intent_summary, author_context_id,
        trigger_excerpt, trigger_sender_json, external_snapshot_json, content_class,
        external_lineage_json, normalization_protocol, created_at,
        resolved_intent_text, resolved_intent_tier, resolver_protocol)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      value.workUnitId,
      value.commandId,
      value.kind,
      value.intentSummary,
      value.authorContextId,
      value.triggerEvidence?.text ?? null,
      value.triggerEvidence == null ? null : canonicalJson(value.triggerEvidence.sender),
      value.externalSnapshot == null ? null : canonicalJson(value.externalSnapshot),
      value.contentClass,
      canonicalJson(value.externalKeys),
      value.normalizationProtocol,
      value.createdAt,
      intent?.text ?? null,
      intent?.tier ?? null,
      intent ? PROV_RESOLVER_PROTOCOL : null,
    );
  }

  persistChanges(values: readonly ChangeRecord[]): void {
    execBatchedInsert(
      this.sql,
      `INSERT INTO gad_changes
       (change_id, work_unit_id, operation, ordinal, kind, source_json, base_json, result_json,
        payload_json, effect_digest)`,
      10,
      values.map((value) => [
        value.changeId,
        value.workUnitId,
        value.operation,
        value.ordinal,
        value.kind,
        value.source ? canonicalJson(value.source) : null,
        value.base ? canonicalJson(value.base) : null,
        value.result ? canonicalJson(value.result) : null,
        canonicalJson(value.payload),
        value.effectDigest,
      ])
    );
    execBatchedInsert(
      this.sql,
      `INSERT INTO gad_change_coordinates
       (change_id, role, repository_id, repo_path, file_id, path)`,
      6,
      values.flatMap((value) =>
        (
          [
            ["base", value.base],
            ["result", value.result],
          ] as const
        ).flatMap(([role, endpoint]) =>
          endpoint
            ? [
                [
                  value.changeId,
                  role,
                  endpoint["repositoryId"] ?? null,
                  endpoint["repoPath"] ?? null,
                  endpoint["fileId"] ?? null,
                  endpoint["path"] ?? null,
                ],
              ]
            : []
        )
      )
    );
    execBatchedInsert(
      this.sql,
      `INSERT INTO gad_change_counteractions
       (change_id, ordinal, counteracted_change_id)`,
      3,
      values.flatMap((value) => {
        const counteractions = value.payload["counteractsChangeIds"];
        return Array.isArray(counteractions)
          ? counteractions.flatMap((counteractedChangeId, ordinal) =>
              typeof counteractedChangeId === "string"
                ? [[value.changeId, ordinal, counteractedChangeId]]
                : []
            )
          : [];
      })
    );
  }

  persistAppliedChanges(values: readonly AppliedChangeRecord[]): void {
    execBatchedInsert(
      this.sql,
      `INSERT INTO gad_applied_changes
       (applied_change_id, application_id, change_id, ordinal, applied_base_json, applied_result_json)`,
      6,
      values.map((value) => [
        value.appliedChangeId,
        value.applicationId,
        value.changeId,
        value.ordinal,
        value.appliedBase ? canonicalJson(value.appliedBase) : null,
        value.appliedResult ? canonicalJson(value.appliedResult) : null,
      ])
    );
    execBatchedInsert(
      this.sql,
      `INSERT INTO gad_applied_change_predicates
       (applied_change_id, ordinal, predicate_json, predicate_digest)`,
      4,
      values.flatMap((value) =>
        value.resultPredicates.map((predicate, ordinal) => [
          value.appliedChangeId,
          ordinal,
          canonicalJson(predicate),
          compactId("state-predicate", predicate),
        ])
      )
    );
  }

  persistContentEdge(value: ContentEdgeRecord): void {
    this.sql.exec(
      `INSERT INTO gad_content_edges
       (content_edge_id, child_applied_change_id, parent_ref_json, relation)
       VALUES (?, ?, ?, ?)`,
      value.contentEdgeId,
      value.childAppliedChangeId,
      canonicalJson(value.parent),
      value.relation
    );
    this.persistMappings(value.contentEdgeId, value.mappings);
  }

  persistDecision(value: IntegrationDecisionRecord): void {
    const { kind: targetKind } = value.targetState;
    const targetId =
      value.targetState.kind === "event"
        ? value.targetState.eventId
        : value.targetState.applicationId;
    this.sql.exec(
      `INSERT INTO gad_integration_decisions
       (decision_id, target_state_kind, target_state_id,
        source_event_id, work_unit_id, created_at, source_delta_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      value.decisionId,
      targetKind,
      targetId,
      value.sourceEventId,
      value.workUnitId,
      value.createdAt,
      value.sourceDeltaId
    );
    for (const entry of value.entries) {
      this.sql.exec(
        `INSERT INTO gad_merge_decision_entries
         (decision_id, coordinate_kind, coordinate_id, resolution, result_change_id, rationale)
         VALUES (?, ?, ?, ?, ?, ?)`,
        value.decisionId,
        entry.coordinate.kind,
        entry.coordinate.id,
        entry.resolution,
        entry.resultChangeId,
        entry.rationale
      );
      for (const changeId of entry.accountedSourceChangeIds) {
        this.sql.exec(
          `INSERT INTO gad_decision_source_changes
           (decision_id, coordinate_kind, coordinate_id, change_id) VALUES (?, ?, ?, ?)`,
          value.decisionId,
          entry.coordinate.kind,
          entry.coordinate.id,
          changeId
        );
      }
    }
  }

  private persistMappings(contentEdgeId: string, mappings: readonly ContentMapping[]): void {
    mappings.forEach((mapping, ordinal) => {
      const row = encodeContentMappingRow(mapping);
      this.sql.exec(
        `INSERT INTO gad_content_edge_mappings
         (content_edge_id, ordinal, child_content_hash, coordinate_kind, child_start, child_end,
          parent_content_hash, parent_start, parent_end, digest)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        contentEdgeId,
        ordinal,
        ...contentMappingRowValues(row)
      );
    });
  }
}
