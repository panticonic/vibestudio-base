import { LOCAL_PROVIDER_ID } from "@workspace/model-catalog/catalog";
import { EXECUTOR_LOCAL_MODEL, type ModelRoleResolution } from "@workspace/model-catalog/modelRoles";
import type { LocalModelEntry, LocalModelsStatus } from "@workspace/model-catalog/localModels";
import type { NatlangStoreStats } from "@workspace/natlang-records/contract";
import type { NatlangPanelPorts } from "./ports.js";

type Json = Record<string, any>;

/** The role natlang's default model fills. */
export const EXECUTOR_ROLE = "executor";

/** What the Executor page and the Overview read: the role, the local model behind it, the engine, and the store. */
export interface ExecutorStatus {
  role: ModelRoleResolution | { error: string };
  /** The local executor model (LFM3) as local-models lists it; null when local-models is unavailable. */
  local: LocalModelEntry | null;
  localModels: LocalModelsStatus | null;
  /** Why local-models could not be read, when it could not. */
  localModelsProblem: string | null;
  store: NatlangStoreStats | null;
  storeProblem: string | null;
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Read the executor's whole state; each source that cannot be read reports its own problem, the rest still show. */
export async function readExecutorStatus(
  ports: Pick<NatlangPanelPorts, "settings" | "localModels" | "records">
): Promise<ExecutorStatus> {
  const [role, models, status, store] = await Promise.allSettled([
    ports.settings.resolveRole(EXECUTOR_ROLE),
    ports.localModels.listModels(),
    ports.localModels.status(),
    ports.records.stats(),
  ]);
  return {
    role: role.status === "fulfilled" ? role.value : { error: message(role.reason) },
    local:
      models.status === "fulfilled"
        ? (models.value.find((entry) => entry.slug === EXECUTOR_LOCAL_MODEL.id) ?? null)
        : null,
    localModels: status.status === "fulfilled" ? status.value : null,
    localModelsProblem:
      models.status === "rejected"
        ? message(models.reason)
        : status.status === "rejected"
          ? message(status.reason)
          : null,
    store: store.status === "fulfilled" ? store.value : null,
    storeProblem: store.status === "rejected" ? message(store.reason) : null,
  };
}

/**
 * The dashboard's `StatusApi`. natlang's own dashboard describes its CLI's machine (profile, llama.cpp runtime, call
 * store); here those are the same things as Vibestudio runs them: the executor role through model settings, the
 * local-models engine, and the records service.
 */
export function statusApi(
  ports: Pick<NatlangPanelPorts, "settings" | "localModels" | "records">,
  jobs: () => { running: number; total: number }
) {
  return {
    async get(): Promise<Json> {
      const state = await readExecutorStatus(ports);
      const engine = state.localModels?.engine ?? null;
      const installed = engine?.gpu ?? engine?.cpu ?? null;
      const hardware = state.localModels?.hardware ?? null;
      const resolved = "error" in state.role ? null : state.role;
      const model = resolved?.model ?? null;
      const local = state.local;
      const release =
        local && (model?.provider === LOCAL_PROVIDER_ID || !model)
          ? {
              id: local.slug,
              label: local.displayName,
              bytes: local.download?.totalBytes ?? 0,
              installed: local.state !== "not-installed" && local.state !== "downloading",
              default: true,
              path: null,
              source: { repository: "local-models", revision: "" },
              download:
                local.state === "downloading" && local.download
                  ? { received: local.download.receivedBytes, total: local.download.totalBytes ?? 0 }
                  : null,
            }
          : undefined;
      return {
        version: "Vibestudio",
        node: "workerd",
        root: ".",
        configPath: "Vibestudio model settings",
        model: {
          profile: "executor role",
          kind: resolved?.source === "local" ? "managed-local" : "pi-provider",
          model: model?.name ?? resolved?.ref ?? "none",
          ...(model ? { provider: model.provider } : {}),
          ...(release ? { release } : {}),
          ...("error" in state.role
            ? { error: state.role.error }
            : resolved && !resolved.ref
              ? { error: resolved.reason }
              : {}),
        },
        calls: state.store
          ? {
              root: "natlang records service",
              calls: state.store.calls,
              bytes: state.store.blobBytes,
              settings: { specialization: "off" },
            }
          : null,
        runtime: {
          selected: installed
            ? {
                version: installed.buildTag,
                build: installed.buildTag,
                source: "local-models",
                path: installed.serverBinPath,
                fork: true,
                backend: installed.backend,
              }
            : null,
          recommended: {
            version: engine?.pin.buildTag ?? "unknown",
            build: engine?.pin.buildTag ?? "unknown",
          },
          fork: {
            repository: "natlang llama.cpp fork (local-models engine)",
            commit: engine?.pin.manifestSha256 ?? "unknown",
          },
          candidates: [],
        },
        machine: {
          cpus: hardware?.cpu.cores ?? 0,
          cpu: null,
          memory: (hardware?.ramMB ?? 0) * 1024 * 1024,
          free: (hardware?.usableRamMB ?? 0) * 1024 * 1024,
          platform: hardware ? `${hardware.os}-${hardware.arch}` : "unknown",
        },
        jobs: jobs(),
      };
    },
  };
}
