import type { NatlangRecordsClient } from "@workspace/natlang-records/client";
import type { ModelRoleResolution } from "@workspace/model-catalog/modelRoles";
import type { LocalModelEntry, LocalModelsStatus } from "@workspace/model-catalog/localModels";
import type { EvalStartInput } from "@vibestudio/service-schemas/eval";

/** The parts of the panel's filesystem the dashboard reads and writes (every path is relative to the panel's context). */
export interface PanelFs {
  readFile(path: string, encoding?: string): Promise<string | Uint8Array>;
  writeFile(path: string, data: string): Promise<void>;
  readdir(path: string, options: { withFileTypes: true }): Promise<Array<{ name: string; isDirectory(): boolean }>>;
  /** Every descendant, as paths relative to `path`: one request for a whole tree. */
  readdir(path: string, options: { recursive: true }): Promise<string[]>;
  stat(path: string): Promise<{ isDirectory(): boolean; size?: number }>;
  mkdir(path: string, options?: { recursive?: boolean }): Promise<unknown>;
  exists(path: string): Promise<boolean>;
}

/** The result of one eval run, as the eval service settles it. */
export interface EvalOutcome {
  success: boolean;
  console: string;
  returnValue?: unknown;
  /** The failure, formatted for display. */
  error?: string;
  /** Natlang calls the run made, when it made any. */
  natlang?: { calls: Array<{ callId: string; name: string; outcome: string }> };
}

/** Run source in this panel's own eval session (the panel is the eval owner). */
export type EvalRunner = (
  source: string,
  options: { runId: string; signal?: AbortSignal; syntax?: "typescript" | "javascript" }
) => Promise<EvalOutcome>;

/** The local-models extension, as the dashboard reads it. */
export interface LocalModelsPort {
  status(): Promise<LocalModelsStatus>;
  listModels(): Promise<LocalModelEntry[]>;
  /** Open the extension's management surface (a panel). */
  openManagement(): Promise<void>;
}

/** Model settings, as the dashboard reads them. */
export interface ModelSettingsPort {
  resolveRole(role: string): Promise<ModelRoleResolution>;
}

/** Everything the dashboard adapters reach outside the panel through; production wires the runtime, tests wire fakes. */
export interface NatlangPanelPorts {
  fs: PanelFs;
  records: NatlangRecordsClient;
  settings: ModelSettingsPort;
  localModels: LocalModelsPort;
  evaluate: EvalRunner;
  /** The identity this panel's own runs and live relays are recorded under. */
  owner: { kind: "panel"; objectKey: string };
  newId(): string;
}

/** An error carrying the HTTP-like status the dashboard pages read (`409` = changed on disk, recording off, ...). */
export class DashboardError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "DashboardError";
  }
}

/** Run an eval cell and return its value; a failed run throws its formatted failure. */
export async function evaluateValue<T>(
  ports: Pick<NatlangPanelPorts, "evaluate" | "newId">,
  source: string,
  signal?: AbortSignal
): Promise<T> {
  const outcome = await ports.evaluate(source, { runId: ports.newId(), ...(signal ? { signal } : {}) });
  if (!outcome.success) throw new Error(outcome.error ?? "The eval run failed.");
  return outcome.returnValue as T;
}

export type { EvalStartInput };
