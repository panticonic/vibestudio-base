import { z } from "zod";
/**
 * Serializable protocol exposed by a local-model service implementation.
 *
 * The model catalog, onboarding, and chat surfaces consume this contract
 * without depending on the optional implementation that happens to provide it.
 * Secret material is intentionally absent except from LoopbackAuth, whose
 * service method is separately caller-gated.
 */

export type GpuVendor = "nvidia" | "amd" | "intel" | "apple";
export type EngineBackend =
  | "cuda-12.4"
  | "cuda-13.3"
  | "vulkan"
  | "rocm"
  | "metal"
  | "cpu";

export interface GpuInfo {
  vendor: GpuVendor;
  name: string;
  vramMB: number;
  backend: EngineBackend;
  discrete: boolean;
  deviceSelector?: string;
}

export type HardwareTier =
  | "gpu-large"
  | "gpu-mid"
  | "gpu-small"
  | "cpu-strong"
  | "cpu-min";

export interface HardwareProfile {
  os: "linux" | "darwin" | "win32";
  arch: "x64" | "arm64";
  gpus: GpuInfo[];
  cpu: { cores: number; features: string[] };
  ramMB: number;
  usableRamMB: number;
  chosenBackend: EngineBackend;
  chosenGpu: GpuInfo | null;
  tier: HardwareTier;
  probedAt: number;
  notes: string[];
}

export interface EnginePin {
  buildTag: string;
  checksums: Record<string, string>;
}

export interface InstalledEngine {
  buildTag: string;
  backend: EngineBackend;
  dir: string;
  serverBinPath: string;
  smokeTestedAt: number;
}

export interface EngineState {
  pin: EnginePin;
  cpu: InstalledEngine | null;
  gpu: InstalledEngine | null;
  degradedReason: string | null;
}

export type QuantName =
  | "Q4_0"
  | "Q4_K_M"
  | "Q5_K_M"
  | "Q6_K"
  | "Q8_0"
  | "BF16"
  | "F16"
  | (string & {});

export interface ModelRuntimeConfig {
  contextLength: number | null;
  gpuLayers: number | null;
}

export interface ModelBenchmarkResult {
  tokensPerSec: number;
  measuredAt: number;
}

export interface ModelRuntimeValidationRecipe {
  buildTag: string;
  backend: EngineBackend;
  contextLength: number;
  gpuLayers: number | null;
}

export interface ModelRecord {
  slug: string;
  displayName: string;
  hfRepo: string | null;
  file: string;
  sizeBytes: number;
  quant: QuantName;
  paramCount: string;
  arch: string;
  trainedContextLength: number;
  toolsCapable: boolean;
  /** Missing only on records created before reasoning-capability inspection. */
  reasoningCapable?: boolean;
  sha256: string;
  importedInPlace: boolean;
  config: ModelRuntimeConfig;
  benchmark?: ModelBenchmarkResult | null;
  runtimeValidation: {
    status: "pending" | "ready" | "error";
    error: string | null;
    validatedAt: number | null;
    /** Present only for successful observation of this exact effective runtime. */
    recipe?: ModelRuntimeValidationRecipe;
  };
  addedAt: number;
}

export type FitClass = "full-gpu" | "partial-offload" | "cpu-only" | "too-big";

export interface FitEstimate {
  fit: FitClass;
  estTokensPerSec: number | null;
  contextLength: number;
  gpuLayers: number;
  notes: string[];
}

export interface CuratedModel {
  slug: string;
  displayName: string;
  hfRepo: string;
  quantByTier: Partial<Record<HardwareTier, QuantName>>;
  sha256ByQuant: Record<string, string>;
  toolsCapable: boolean;
  blurb: string;
}

export type DownloadPhase = "active" | "queued" | "paused";

export interface DownloadJob {
  id: string;
  slug: string;
  hfRepo: string;
  file: string;
  totalBytes: number | null;
  receivedBytes: number;
  phase: DownloadPhase;
  error: string | null;
}

export type ServerKind = "utility" | "main";

export type ServerState =
  | { state: "stopped" }
  | { state: "starting" }
  | { state: "running"; port: number; loadedModels: string[]; uptimeMs: number }
  | { state: "backoff"; attempt: number; nextRetryMs: number }
  | { state: "error"; message: string; logTail: string[] };

export interface OwnerInfo {
  schemaVersion: 1;
  pid: number;
  bootId: string;
  ports: { utility: number; main: number };
  adminPort?: number;
  workspaceId: string;
  since: number;
  serverPids?: { utility?: number; main?: number };
}

export type OwnershipRole = "owner" | "attached";

export interface LocalModelsStatus {
  role: OwnershipRole;
  owner: OwnerInfo | null;
  hardware: HardwareProfile | null;
  engine: EngineState | null;
  servers: Record<ServerKind, ServerState>;
  fallback: {
    ready: boolean;
    warm: boolean;
    modelRef: string;
    downloadSizeBytes: number;
    reason: string | null;
  };
  downloads: DownloadJob[];
  storageRoot: string;
  diskFreeBytes: number;
}

export interface LocalModelEntry {
  slug: string;
  displayName: string;
  baseUrl: string;
  server: ServerKind;
  contextWindow: number;
  maxTokens: number;
  toolsCapable: boolean;
  reasoningCapable: boolean;
  fit: FitEstimate;
  measuredTokensPerSec: number | null;
  state:
    | "ready"
    | "startable"
    | "not-installed"
    | "starting"
    | "downloading"
    | "error";
  download: {
    progress: number;
    phase: DownloadPhase;
    receivedBytes: number;
    totalBytes: number | null;
  } | null;
  errorMessage: string | null;
}

export interface LoopbackAuth {
  apiKey: string;
}

export interface CatalogHit {
  hfRepo: string;
  displayName: string;
  files: Array<{ file: string; quant: QuantName; sizeBytes: number }>;
  curated: CuratedModel | null;
  fitByQuant: Record<string, FitEstimate>;
}

export type LocalModelsEvent =
  | { kind: "models.changed" }
  | { kind: "download.progress"; job: DownloadJob }
  | { kind: "server.state"; server: ServerKind; state: ServerState };

export interface LocalModelsPanelTarget {
  source: string;
  stateArgs?: Record<string, unknown>;
}

export interface LocalModelsCapabilities {
  managementPanel: LocalModelsPanelTarget;
  serverLogs: Record<ServerKind, LocalModelsPanelTarget>;
}

/** The one current secret-free local-model inventory wire entry. */
export const localModelEntrySchema: z.ZodType<LocalModelEntry> = z.object({
  slug: z.string().min(1),
  displayName: z.string().min(1),
  baseUrl: z.string().url(),
  server: z.enum(["utility", "main"]),
  contextWindow: z.number().positive(),
  maxTokens: z.number().positive(),
  toolsCapable: z.boolean(),
  reasoningCapable: z.boolean(),
  fit: z.object({
    fit: z.enum(["full-gpu", "partial-offload", "cpu-only", "too-big"]),
    estTokensPerSec: z.number().nullable(),
    contextLength: z.number(),
    gpuLayers: z.number(),
    notes: z.array(z.string()),
  }),
  measuredTokensPerSec: z.number().nullable(),
  state: z.enum([
    "ready",
    "startable",
    "not-installed",
    "starting",
    "downloading",
    "error",
  ]),
  download: z
    .object({
      progress: z.number(),
      phase: z.enum(["active", "queued", "paused"]),
      receivedBytes: z.number(),
      totalBytes: z.number().nullable(),
    })
    .nullable(),
  errorMessage: z.string().nullable(),
});

const engineBackendSchema = z.enum([
  "cuda-12.4",
  "cuda-13.3",
  "vulkan",
  "rocm",
  "metal",
  "cpu",
]);
const installedEngineSchema = z.object({
  buildTag: z.string(),
  backend: engineBackendSchema,
  dir: z.string(),
  serverBinPath: z.string(),
  smokeTestedAt: z.number(),
});
const gpuInfoSchema = z.object({
  vendor: z.enum(["nvidia", "amd", "intel", "apple"]),
  name: z.string(),
  vramMB: z.number(),
  backend: engineBackendSchema,
  discrete: z.boolean(),
  deviceSelector: z.string().optional(),
});
export const hardwareProfileSchema: z.ZodType<HardwareProfile> = z.object({
  os: z.enum(["linux", "darwin", "win32"]),
  arch: z.enum(["x64", "arm64"]),
  gpus: z.array(gpuInfoSchema),
  cpu: z.object({ cores: z.number(), features: z.array(z.string()) }),
  ramMB: z.number(),
  usableRamMB: z.number(),
  chosenBackend: engineBackendSchema,
  chosenGpu: gpuInfoSchema.nullable(),
  tier: z.enum(["gpu-large", "gpu-mid", "gpu-small", "cpu-strong", "cpu-min"]),
  probedAt: z.number(),
  notes: z.array(z.string()),
});
const serverStateSchema: z.ZodType<ServerState> = z.discriminatedUnion(
  "state",
  [
    z.object({ state: z.literal("stopped") }),
    z.object({ state: z.literal("starting") }),
    z.object({
      state: z.literal("running"),
      port: z.number(),
      loadedModels: z.array(z.string()),
      uptimeMs: z.number(),
    }),
    z.object({
      state: z.literal("backoff"),
      attempt: z.number(),
      nextRetryMs: z.number(),
    }),
    z.object({
      state: z.literal("error"),
      message: z.string(),
      logTail: z.array(z.string()),
    }),
  ],
);
const ownerInfoSchema: z.ZodType<OwnerInfo> = z.object({
  schemaVersion: z.literal(1),
  pid: z.number(),
  bootId: z.string(),
  ports: z.object({ utility: z.number(), main: z.number() }),
  adminPort: z.number().optional(),
  workspaceId: z.string(),
  since: z.number(),
  serverPids: z
    .object({ utility: z.number().optional(), main: z.number().optional() })
    .optional(),
});

/** Runtime decoder for the public `local-models.status()` extension result. */
export const localModelsStatusSchema: z.ZodType<LocalModelsStatus> = z.object({
  role: z.enum(["owner", "attached"]),
  owner: ownerInfoSchema.nullable(),
  hardware: hardwareProfileSchema.nullable(),
  engine: z
    .object({
      pin: z.object({
        buildTag: z.string(),
        checksums: z.record(z.string(), z.string()),
      }),
      cpu: installedEngineSchema.nullable(),
      gpu: installedEngineSchema.nullable(),
      degradedReason: z.string().nullable(),
    })
    .nullable(),
  servers: z.object({ utility: serverStateSchema, main: serverStateSchema }),
  fallback: z.object({
    ready: z.boolean(),
    warm: z.boolean(),
    modelRef: z.string(),
    downloadSizeBytes: z.number(),
    reason: z.string().nullable(),
  }),
  downloads: z.array(
    z.object({
      id: z.string(),
      slug: z.string(),
      hfRepo: z.string(),
      file: z.string(),
      totalBytes: z.number().nullable(),
      receivedBytes: z.number(),
      phase: z.enum(["active", "queued", "paused"]),
      error: z.string().nullable(),
    }),
  ),
  storageRoot: z.string(),
  diskFreeBytes: z.number(),
});

export const curatedModelSchema: z.ZodType<CuratedModel> = z.object({
  slug: z.string(),
  displayName: z.string(),
  hfRepo: z.string(),
  quantByTier: z.record(
    z.enum(["gpu-large", "gpu-mid", "gpu-small", "cpu-strong", "cpu-min"]),
    z.string(),
  ),
  sha256ByQuant: z.record(z.string(), z.string()),
  toolsCapable: z.boolean(),
  blurb: z.string(),
});

/** Shared public method descriptors for callers of the local-models extension. */
export const localModelsExtensionMethods = {
  status: { method: "status", result: localModelsStatusSchema },
  listModels: { method: "listModels", result: z.array(localModelEntrySchema) },
  capabilities: {
    method: "capabilities",
    result: z.object({
      managementPanel: z.object({
        source: z.string(),
        stateArgs: z.record(z.string(), z.unknown()).optional(),
      }),
      serverLogs: z.object({
        utility: z.object({
          source: z.string(),
          stateArgs: z.record(z.string(), z.unknown()).optional(),
        }),
        main: z.object({
          source: z.string(),
          stateArgs: z.record(z.string(), z.unknown()).optional(),
        }),
      }),
    }),
  },
  getHardwareProfile: {
    method: "getHardwareProfile",
    result: hardwareProfileSchema,
  },
  searchCatalog: {
    method: "searchCatalog",
    result: z.array(curatedModelSchema),
  },
  tailServerLogLines: {
    method: "tailServerLogLines",
    result: z.array(z.string()),
  },
} as const;
