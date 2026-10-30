import type {
  PanelDiagnosticPacket,
  PanelFailureCode,
  PanelObservation,
  PanelRuntimeFailure,
} from "@vibestudio/shared/panel/observation";
import { describe, expect, it } from "vitest";
import { diagnosePanelLoad } from "./diagnose-panel-load.js";

function observation(patch: Partial<PanelObservation> = {}): PanelObservation {
  return {
    panelId: "panel:inbox",
    title: "Inbox",
    source: "panels/inbox",
    kind: "workspace",
    parentId: null,
    contextId: "ctx-1",
    requestedRef: "main",
    runtimeEntityId: null,
    attemptId: "attempt-1",
    attemptRef: { epoch: "e1", attemptId: "attempt-1" },
    effectiveVersion: null,
    buildKey: null,
    phase: "ready",
    updatedAt: 1,
    ...patch,
  };
}

function failure(code: PanelFailureCode, stage: PanelRuntimeFailure["stage"]): PanelRuntimeFailure {
  return {
    code,
    stage,
    message: `${code} happened`,
    provenance: { source: "panels/inbox", contextId: "ctx-1", requestedRef: "main" },
    diagnosticId: `panel:inbox:${stage}`,
    occurredAt: 1,
  };
}

describe("diagnosePanelLoad", () => {
  it("routes a failure by its code to the one escalation its layer calls for", () => {
    const cases: Array<[PanelFailureCode, PanelRuntimeFailure["stage"], string, string]> = [
      ["unit_not_found", "resolve", "source", "fix-source"],
      ["compile_failed", "build", "build", "build-report"],
      ["host_unavailable", "host", "host", "server-logs"],
      ["lease_conflict", "host", "host", "supervision"],
      ["entry_threw", "boot", "runtime", "read-console"],
      ["boot_stalled", "boot", "runtime", "supervision"],
      ["panel_not_found", "runtime", "lifecycle", "reacquire-handle"],
    ];
    for (const [code, stage, layer, next] of cases) {
      const diagnosis = diagnosePanelLoad(observation({ phase: "failed", failure: failure(code, stage) }));
      expect(diagnosis).toMatchObject({ layer, next, phase: "failed" });
      expect(diagnosis.evidence).toContain(`failure.code: ${code}`);
    }
  });

  it("waits on the same handle while the attempt is still preparing", () => {
    for (const phase of ["pending", "loading", "booting"] as const) {
      expect(diagnosePanelLoad(observation({ phase }))).toMatchObject({ layer: "lifecycle", next: "observe-again" });
    }
  });

  it("asks for one diagnostic packet when an attempt failed without a structured failure", () => {
    expect(diagnosePanelLoad(observation({ phase: "failed" }))).toMatchObject({ next: "diagnose" });
  });

  it("does not report ready as success", () => {
    expect(diagnosePanelLoad(observation())).toMatchObject({ layer: "none", next: "exercise-flow" });
  });

  it("sends an unreachable host to supervision and a released runtime to rematerialization", () => {
    expect(
      diagnosePanelLoad(observation({ host: { reachable: false, view: { exists: false }, boot: { kind: "unavailable" } } }))
    ).toMatchObject({ layer: "host", next: "supervision" });
    expect(diagnosePanelLoad(observation({ phase: "stopped" }))).toMatchObject({ next: "rematerialize" });
  });

  it("reads a diagnostic packet the same way as its observation", () => {
    const packet: PanelDiagnosticPacket = {
      observation: observation({ phase: "failed", failure: failure("render_crashed", "runtime") }),
      consoleHistory: { available: false, error: "no console" },
    };
    expect(diagnosePanelLoad(packet)).toMatchObject({ layer: "runtime", next: "read-console" });
  });
});
