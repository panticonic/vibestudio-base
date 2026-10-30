import type {
  PanelDiagnosticPacket,
  PanelFailureCode,
  PanelObservation,
} from "@vibestudio/shared/panel/observation";

/**
 * Where a panel that is preparing, blank, failed, or stuck should be looked at
 * next. The `observe()` / `diagnose()` evidence is typed, so the answer is a
 * table over `phase` and `failure.code` ([PANEL_API.md](PANEL_API.md#failures)):
 * the failure's code and stage say which layer failed, and this names the one
 * escalation that layer calls for. Messages are evidence to quote, not text to
 * match.
 */

/** The layer whose evidence the next check reads. */
export type PanelLayer = "none" | "lifecycle" | "source" | "build" | "host" | "runtime";

export type PanelNextCheck =
  /** Nothing is wrong yet; verify the behavior the user asked for, because `ready` alone is not success. */
  | "exercise-flow"
  /** Still preparing: observe again on the same handle. Do not rebuild, reload, or open a duplicate. */
  | "observe-again"
  /** Call `diagnose()` once for the bounded packet. */
  | "diagnose"
  /** The source is wrong (unit, ref, manifest, entry): repair it. Retrying cannot fix it. */
  | "fix-source"
  /** Read the build report for this source and ref: `services.build.getBuildReport(source, ctx:<contextId>)`. */
  | "build-report"
  /** Read the runtime entity's `runtime.supervision.health(identity)` and `logs(identity)`. */
  | "supervision"
  /** The packet places the failure below the panel lifecycle: read the server logs. */
  | "server-logs"
  /** Read `consoleHistory.errors` from the diagnostic packet, then repair the source. */
  | "read-console"
  /** The handle no longer names a panel: observe through the panel tree and reacquire it. */
  | "reacquire-handle"
  /** The runtime was released (stopped): focus or rebuild materializes it again. */
  | "rematerialize";

export interface Diagnosis {
  phase: PanelObservation["phase"];
  layer: PanelLayer;
  next: PanelNextCheck;
  /** The structured evidence this rests on, for the report. */
  evidence: string[];
}

interface FailureRoute {
  layer: PanelLayer;
  next: PanelNextCheck;
}

/** Exhaustive over `PanelFailureCode`: a new code does not compile until it has a route. */
const FAILURE_ROUTES: Record<PanelFailureCode, FailureRoute> = {
  unit_not_found: { layer: "source", next: "fix-source" },
  ref_not_found: { layer: "source", next: "fix-source" },
  manifest_invalid: { layer: "source", next: "fix-source" },
  dependency_resolution_failed: { layer: "build", next: "build-report" },
  compile_failed: { layer: "build", next: "build-report" },
  build_identity_invalid: { layer: "build", next: "build-report" },
  host_unavailable: { layer: "host", next: "server-logs" },
  lease_conflict: { layer: "host", next: "supervision" },
  navigation_failed: { layer: "host", next: "supervision" },
  asset_unavailable: { layer: "host", next: "server-logs" },
  asset_transport_failed: { layer: "host", next: "server-logs" },
  entry_threw: { layer: "runtime", next: "read-console" },
  boot_stalled: { layer: "runtime", next: "supervision" },
  render_crashed: { layer: "runtime", next: "read-console" },
  panel_not_found: { layer: "lifecycle", next: "reacquire-handle" },
  unknown_failure: { layer: "host", next: "server-logs" },
};

const isPacket = (input: PanelObservation | PanelDiagnosticPacket): input is PanelDiagnosticPacket =>
  "observation" in input;

/**
 * Diagnose a panel from `await handle.observe()` or `await handle.diagnose()`.
 * A failure routes by its code; without one, the phase decides.
 */
export function diagnosePanelLoad(input: PanelObservation | PanelDiagnosticPacket): Diagnosis {
  const observation = isPacket(input) ? input.observation : input;
  const { phase, failure, host } = observation;
  const evidence = [`phase: ${phase}`];
  if (failure) {
    evidence.push(`failure.code: ${failure.code}`, `failure.stage: ${failure.stage}`, `failure.message: ${failure.message}`);
    return { phase, ...FAILURE_ROUTES[failure.code], evidence };
  }
  if (host?.reachable === false) {
    evidence.push("host.reachable: false");
    return { phase, layer: "host", next: "supervision", evidence };
  }
  switch (phase) {
    case "pending":
    case "loading":
    case "booting":
      return { phase, layer: "lifecycle", next: "observe-again", evidence };
    case "failed":
      evidence.push("no structured failure on the observation");
      return { phase, layer: "lifecycle", next: "diagnose", evidence };
    case "stopped":
      return { phase, layer: "lifecycle", next: "rematerialize", evidence };
    case "ready":
      return { phase, layer: "none", next: "exercise-flow", evidence };
  }
}
