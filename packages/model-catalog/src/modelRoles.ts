import {
  LOCAL_PROVIDER_ID,
  TEST_MODEL_PROVIDER_ID,
  canonicalModelRef,
  isModelUsable,
  type ModelCatalog,
  type ModelCatalogEntry,
} from "./catalog.js";

/**
 * Model roles are named intents that resolve to a concrete model ref from the
 * live catalog, per call. They are designed into model-settings (the single
 * authority on what a model is and whether it is usable), not configured
 * separately.
 *
 * `executor` is the small, cheap model that runs high-volume typed work (natlang
 * calls): the local executor model when local-models has it installed (running or
 * loadable on first use), otherwise
 * the user's low-tier hosted model, which is billed.
 */
export const MODEL_ROLES = ["executor"] as const;
export type ModelRole = (typeof MODEL_ROLES)[number];

export function isModelRole(value: string): value is ModelRole {
  return (MODEL_ROLES as readonly string[]).includes(value);
}

/**
 * The model work one natlang call on a role's model may take, in total: its turns and the tokens it generates. A work
 * budget, not a deadline: a call that uses it up ends with natlang's `budget-exhausted` reason (on its last turn the
 * model is offered only `return_result`). It bounds a call's work as a whole, not each turn: a call that loops without
 * end (a prose-only model once grew one conversation to 4 GB) stops, and a model that thinks long before acting is
 * not cut off mid-thought.
 *
 * Sized from the executor's measured reasoning (LFM3 1.7B, 2026-11-13): 830-1,260 generated tokens before its first
 * action, about 1,500 at the high end, and 3-6 actions in a multi-step call. 16,384 tokens is about ten such turns;
 * 12 turns is twice the six actions. A request takes at most a quarter of the context window (natlang's default turn
 * limit), and natlang continues a reply cut off there instead of starting the turn again. No per-turn cap: below
 * about 1,500 tokens it cuts this model off before it acts. No context cap: the server's window holds the 5-6k-token
 * opening and several exchanges. A `.nl` function that needs other bounds declares them (`budget:` frontmatter).
 */
export interface ModelRoleCallBudget {
  maxTurns: number;
  maxTokens: number;
}
export const MODEL_ROLE_CALL_BUDGETS: Readonly<Record<ModelRole, ModelRoleCallBudget>> = {
  executor: { maxTurns: 12, maxTokens: 16384 },
};

/** The local-models library slug of the local executor model (LFM3 1.7B). */
export const EXECUTOR_LOCAL_MODEL = {
  id: "lfm3-1.7b",
  ref: canonicalModelRef(LOCAL_PROVIDER_ID, "lfm3-1.7b"),
} as const;

export interface ModelRoleResolution {
  role: ModelRole;
  /** Resolved "provider:id", or null when no usable model can fill the role. */
  ref: string | null;
  /** `local` is free and on-device; `hosted` is billed to the user's account;
   * `test` is the host-owned deterministic provider (test mode only). */
  source: "local" | "hosted" | "test" | "unavailable";
  model: ModelCatalogEntry | null;
  /** Human-readable account of the choice, for display. */
  reason: string;
}

function toolCapableUsable(model: ModelCatalogEntry): boolean {
  return model.capabilities.tools && isModelUsable(model);
}

/**
 * Low tier is read from catalog metadata, never a provider list: among usable,
 * tool-capable hosted models, the lowest output price, then input price, then
 * non-reasoning before reasoning. The provider of the user's default model is
 * preferred when it has a candidate, because that account is the one they
 * already connected and chose to bill.
 */
export function lowTierHostedModel(
  catalog: ModelCatalog,
  defaultModelRef: string | null,
): ModelCatalogEntry | null {
  const hosted = catalog.models.filter(
    (model) => model.provider !== LOCAL_PROVIDER_ID && toolCapableUsable(model),
  );
  const preferredProvider = hosted.find(
    (model) => model.ref === defaultModelRef,
  )?.provider;
  const sameAccount = hosted.filter(
    (model) => model.provider === preferredProvider,
  );
  const pool = sameAccount.length > 0 ? sameAccount : hosted;
  return (
    [...pool].sort(
      (a, b) =>
        a.modelSpec.cost.output - b.modelSpec.cost.output ||
        a.modelSpec.cost.input - b.modelSpec.cost.input ||
        Number(a.reasoning) - Number(b.reasoning) ||
        a.ref.localeCompare(b.ref),
    )[0] ?? null
  );
}

export function resolveModelRole(
  role: ModelRole,
  catalog: ModelCatalog,
  defaultModelRef: string | null,
): ModelRoleResolution {
  switch (role) {
    case "executor": {
      const local = catalog.models.find(
        (model) => model.ref === EXECUTOR_LOCAL_MODEL.ref,
      );
      // Installed counts as ready: local-models loads a `startable` model on its
      // first use, so requiring it to be already running would mean it never is.
      if (isModelUsable(local) && local?.capabilities.tools)
        return {
          role,
          ref: local.ref,
          source: "local",
          model: local,
          reason:
            local.availability.state === "ready"
              ? "The local executor model is running."
              : "The local executor model is installed and loads on first use.",
        };
      // A local executor that cannot stay loaded beside the agent model reports why instead of thrashing it.
      const localWhy =
        local?.availability.state === "error"
          ? ` (${local.availability.message})`
          : "";
      const hosted = lowTierHostedModel(catalog, defaultModelRef);
      if (hosted)
        return {
          role,
          ref: hosted.ref,
          source: hosted.provider === TEST_MODEL_PROVIDER_ID ? "test" : "hosted",
          model: hosted,
          reason:
            hosted.provider === TEST_MODEL_PROVIDER_ID
              ? "The deterministic test model fills the executor role."
              : `The local executor model is not ready${localWhy}; using the lowest-priced usable hosted model, which is billed.`,
        };
      return {
        role,
        ref: null,
        source: "unavailable",
        model: null,
        reason:
          `No local executor model is ready${localWhy} and no hosted model is usable. Connect a provider or install the local executor model.`,
      };
    }
  }
}
