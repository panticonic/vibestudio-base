import { ago, bytes, definePage, widgets } from "@workspace/natlang/dashboard/common.js";
import type { PageModule } from "@workspace/natlang/dashboard/pages.js";
import type { NatlangPanelPorts } from "./ports.js";
import { readExecutorStatus } from "./statusApi.js";

/**
 * Executor: what the executor role resolves to right now, the local model and engine behind it, and the records store.
 * Provider sign-in and API keys stay in Vibestudio's model settings (the chat model picker); natlang's own Models page is
 * not mounted, so this page only shows readiness and leads to local-models for the local model.
 */
export function executorPage(
  ports: Pick<NatlangPanelPorts, "settings" | "localModels" | "records">
): PageModule {
  const id = "executor";
  return {
    id,
    title: "Executor",
    requires: [],
    runKinds: [],
    mount: definePage({
      id,
      async render(target, ctx) {
        const { h, fill } = ctx;
        const { pill, header, kv } = widgets(ctx);
        const state = await readExecutorStatus(ports);
        const resolved = "error" in state.role ? null : state.role;
        const source = resolved?.source ?? "unavailable";
        const role = h(
          "section",
          { class: "panel", id: "executor-role" },
          h("div", { class: "row", style: "justify-content: space-between" }, h("h2", {}, "Executor role"), pill(source === "unavailable" ? "unavailable" : "ready", source === "unavailable" ? "bad" : "ok")),
          h("p", { class: "small muted" }, "Natlang calls run on the executor role: the local LFM3 model when local-models has it, otherwise your low-tier hosted model."),
          "error" in state.role
            ? h("div", { class: "callout warn" }, `The role could not be resolved: ${state.role.error}`)
            : kv([
                ["Model", resolved?.model ? `${resolved.model.name} (${resolved.ref})` : "none"],
                ["Served", source === "local" ? "on this machine (local-models)" : source === "hosted" ? "by a hosted provider (billed)" : source === "test" ? "deterministic test model" : "nothing fills the role"],
                ["Why", resolved?.reason ?? ""],
                resolved?.model ? ["Availability", resolved.model.availability.state] : null,
                resolved?.model?.contextWindow ? ["Context", `${resolved.model.contextWindow.toLocaleString()} tokens`] : null,
              ]),
          h(
            "div",
            { class: "row" },
            h("button", { onclick: ctx.attempt(() => ports.localModels.openManagement()) }, "Manage local models"),
            h("button", { onclick: () => ctx.reload() }, "Refresh")
          ),
          h("p", { class: "small muted" }, "Sign in to a provider or add an API key from the model picker in chat; the executor role follows what is connected there.")
        );
        const local = state.local;
        const localPanel = h(
          "section",
          { class: "panel", id: "executor-local" },
          h("h2", {}, "Local model and engine"),
          state.localModelsProblem
            ? h("div", { class: "callout warn" }, `local-models could not be read: ${state.localModelsProblem}`)
            : kv([
                ["Executor model", local ? `${local.displayName} (${local.slug})` : "not in the local library"],
                local ? ["State", pill(local.state, local.state === "ready" ? "ok" : local.state === "error" ? "bad" : "info")] : null,
                local?.download ? ["Download", `${bytes(local.download.receivedBytes)} of ${bytes(local.download.totalBytes)} (${local.download.phase})`] : null,
                local?.errorMessage ? ["Problem", local.errorMessage] : null,
                local ? ["Fit", `${local.fit.fit}${local.fit.estTokensPerSec ? ` · about ${Math.round(local.fit.estTokensPerSec)} tokens/s` : ""}`] : null,
                local?.measuredTokensPerSec ? ["Measured", `${Math.round(local.measuredTokensPerSec)} tokens/s`] : null,
                state.localModels?.engine
                  ? [
                      "Engine",
                      state.localModels.engine.cpu || state.localModels.engine.gpu
                        ? `llama.cpp ${(state.localModels.engine.gpu ?? state.localModels.engine.cpu)!.buildTag} · ${(state.localModels.engine.gpu ?? state.localModels.engine.cpu)!.backend}`
                        : "not installed",
                    ]
                  : null,
                state.localModels?.engine?.degradedReason ? ["Engine note", state.localModels.engine.degradedReason] : null,
                state.localModels ? ["Servers", `main ${state.localModels.servers.main.state} · utility ${state.localModels.servers.utility.state}`] : null,
                state.localModels?.hardware ? ["Hardware", `${state.localModels.hardware.tier} · ${state.localModels.hardware.cpu.cores} cores · ${Math.round(state.localModels.hardware.ramMB / 1024)} GB`] : null,
              ])
        );
        const store = state.store;
        const storePanel = h(
          "section",
          { class: "panel", id: "executor-records" },
          h("h2", {}, "Call records"),
          state.storeProblem
            ? h("div", { class: "callout warn" }, `The records service could not be read: ${state.storeProblem}`)
            : store
              ? kv([
                  ["Recorded calls", String(store.calls)],
                  ["Running now", String(store.running)],
                  ["Evaluations kept", String(store.evaluations)],
                  ["Stored", `${bytes(store.blobBytes)} of ${store.blobBudgetBytes > 2 ** 40 ? "unbounded" : bytes(store.blobBudgetBytes)} (the oldest unpinned data is evicted past the bound)`],
                ])
              : h("div", { class: "muted" }, ago(null))
        );
        fill(target, header("Executor", "The model natlang calls run on, and where their records go."), role, localPanel, storePanel);
      },
    }),
  };
}
