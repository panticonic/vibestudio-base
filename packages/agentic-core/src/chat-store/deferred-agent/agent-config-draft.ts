/**
 * Agent configuration drafts: the editable shape behind the inline first-agent
 * setup and the agent dialog, and its projection to subscription config.
 *
 * Framework-free so every surface (panel dialog, inline setup, terminal chat,
 * the deferred-agent machine) seeds and submits drafts identically.
 */

import type { DefaultAgentConfig, ModelCatalog } from "@workspace/model-catalog/catalog";
import type {
  AgentApprovalLevel,
  AgentRespondPolicy,
  AgentSubscriptionConfig,
  AgentThinkingLevel,
} from "../../agent-subscription-config.js";
import type { AvailableAgent } from "../../types.js";

/** Editable agent configuration (model/effort/autonomy/reactiveness/…). */
export interface AgentConfigDraft {
  model: string;
  thinkingLevel?: AgentThinkingLevel;
  fastMode?: boolean;
  approvalLevel?: AgentApprovalLevel;
  respondPolicy?: AgentRespondPolicy;
  respondFrom?: string[];
  handle?: string;
  systemPrompt?: string;
}

/**
 * Resolve a sensible default model ref (design §7.2): prefer the explicit
 * workspace default, then availability order — recommended+ready, any ready,
 * recommended+startable, any startable — then any recommended model, then the
 * first model in the catalog. Availability is the worker-computed truth on
 * every entry; no client-side credential heuristics.
 */
export function pickDefaultModel(
  catalog: ModelCatalog | null,
  defaultModelRef?: string | null
): string {
  const models = catalog?.models ?? [];
  const state = (m: (typeof models)[number]) => m.availability?.state ?? "needs-setup";
  return (
    (defaultModelRef && models.some((m) => m.ref === defaultModelRef) ? defaultModelRef : null) ??
    models.find((m) => m.recommended && state(m) === "ready")?.ref ??
    models.find((m) => state(m) === "ready")?.ref ??
    models.find((m) => m.recommended && state(m) === "startable")?.ref ??
    models.find((m) => state(m) === "startable")?.ref ??
    models.find((m) => m.recommended)?.ref ??
    models[0]?.ref ??
    ""
  );
}

/** Project a draft into the wire-level subscription config (drops empties). */
export function draftToConfig(draft: AgentConfigDraft): AgentSubscriptionConfig {
  const config: AgentSubscriptionConfig = {};
  if (draft.model) config.model = draft.model;
  if (draft.thinkingLevel) config.thinkingLevel = draft.thinkingLevel;
  if (draft.fastMode !== undefined) config.fastMode = draft.fastMode;
  if (draft.approvalLevel !== undefined) config.approvalLevel = draft.approvalLevel;
  if (draft.respondPolicy) config.respondPolicy = draft.respondPolicy;
  if (draft.respondFrom && draft.respondFrom.length > 0) config.respondFrom = draft.respondFrom;
  if (draft.handle) config["handle"] = draft.handle;
  if (draft.systemPrompt) config.systemPrompt = draft.systemPrompt;
  return config;
}

/**
 * Seed a fresh draft for an agent type. Effective host defaults (workspace
 * defaults with any panel override already applied) layer over generic worker
 * manifest defaults; the catalog is only a final model fallback.
 * `showReactiveness` decides whether a default respondPolicy is seeded (only
 * meaningful in multi-agent channels).
 */
export function draftForAgent(
  agent: AvailableAgent | undefined,
  opts: {
    modelCatalog: ModelCatalog | null;
    defaultModelRef?: string | null;
    /** Effective host defaults — saved workspace defaults plus any panel-level
     *  override. These layer over generic agent manifest defaults so a fresh
     *  draft matches what the host will launch. */
    defaultAgentConfig?: DefaultAgentConfig | null;
    showReactiveness?: boolean;
  }
): AgentConfigDraft {
  const defaults = agent?.defaultConfig ?? {};
  const ws = opts.defaultAgentConfig;
  const workerModel =
    typeof defaults.model === "string" && defaults.model ? defaults.model : undefined;
  const model =
    ws?.model || workerModel || pickDefaultModel(opts.modelCatalog, opts.defaultModelRef);
  const defaultHandle =
    typeof defaults["handle"] === "string" ? defaults["handle"] : agent?.proposedHandle;
  return {
    model,
    thinkingLevel: ws?.thinkingLevel ?? defaults.thinkingLevel ?? "medium",
    fastMode: ws?.fastMode ?? defaults.fastMode ?? false,
    approvalLevel: ws?.approvalLevel ?? defaults.approvalLevel,
    respondPolicy: defaults.respondPolicy ?? (opts.showReactiveness ? "mentioned" : undefined),
    respondFrom: defaults.respondFrom,
    handle: defaultHandle,
    systemPrompt: defaults.systemPrompt,
  };
}
