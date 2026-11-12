import { ago, definePage, ms, widgets } from "@workspace/natlang/dashboard/common.js";
import type { PageModule } from "@workspace/natlang/dashboard/pages.js";
import type { NatlangEvaluationRecord } from "@workspace/natlang-records/contract";
import type { NatlangPanelPorts } from "./ports.js";

const quality = (value: number | null) => (value === null ? "n/a" : value.toFixed(2));

/** `base:lfm3-1.7b`-style name of the model an evaluation ran on, from natlang's executor identity. */
export function executorName(identity: unknown): string {
  const value = identity as { id?: unknown; configuration?: { model?: unknown } } | null;
  const model = value?.configuration?.model;
  return typeof model === "string" ? model : typeof value?.id === "string" ? value.id : "unknown";
}

/**
 * Evaluations: the latest recorded result of each program's evaluation suites, with whether the suite's gates passed.
 * Results arrive from `pnpm natlang:eval --instance ID`, which posts the summary to the records service.
 */
export function evaluationsPage(ports: Pick<NatlangPanelPorts, "records">): PageModule {
  const id = "evaluations";
  return {
    id,
    title: "Evaluations",
    requires: [],
    runKinds: [],
    mount: definePage({
      id,
      async render(target, ctx) {
        const { h, fill } = ctx;
        const { pill, header, emptyState } = widgets(ctx);
        const latest = await ports.records.listEvaluations({ latest: true });
        const row = (entry: NatlangEvaluationRecord) => {
          const { evaluation } = entry;
          const summary = evaluation.summary;
          return h(
            "details",
            { class: "panel", "data-evaluation": entry.evaluationId },
            h(
              "summary",
              {},
              h(
                "span",
                { class: "function-title" },
                h("strong", {}, evaluation.suite.id),
                h("span", { class: "small muted" }, ` ${entry.program} · ${evaluation.split} split`)
              ),
              " ",
              pill(summary.gatesPassed ? "gates passed" : "gates failed", summary.gatesPassed ? "ok" : "bad"),
              h("span", { class: "small muted" }, `  quality ${quality(summary.quality)} · ${summary.cases} cases · ${ago(entry.ranAt)}`)
            ),
            h(
              "div",
              { class: "stack" },
              h(
                "dl",
                { class: "kv" },
                ...[
                  ["Model", executorName(evaluation.executorIdentity)],
                  ["Program", h("a", { href: ctx.href(`programs-${encodeURIComponent(entry.program)}`) }, entry.program)],
                  ["Suite", evaluation.suite.path],
                  ["Cases", Object.entries(evaluation.suite.cases).map(([split, count]) => `${split} ${count}`).join(" · ")],
                  ["Model calls", String(summary.modelCalls)],
                  ["Mean latency", summary.meanLatencyMs === null ? "n/a" : ms(summary.meanLatencyMs)],
                  ["Adaptation", evaluation.artifact ?? "none"],
                  ["natlang", evaluation.natlang.commit.slice(0, 12)],
                  ["Template", evaluation.template],
                ].flatMap(([key, value]) => [h("dt", {}, key as string), h("dd", {}, value as never)])
              ),
              h(
                "div",
                { class: "table-wrap" },
                h(
                  "table",
                  {},
                  h("thead", {}, h("tr", {}, h("th", {}, "Case"), h("th", {}, "Status"), h("th", { class: "num" }, "Quality"))),
                  h(
                    "tbody",
                    {},
                    evaluation.cases.map((item) =>
                      h("tr", {}, h("td", { class: "mono" }, item.caseId), h("td", {}, pill(item.status, item.status === "scored" ? "ok" : "warn")), h("td", { class: "num" }, quality(item.quality)))
                    )
                  )
                )
              )
            )
          );
        };
        fill(
          target,
          header("Evaluations", "The latest result of each program's evaluation suites, and whether their gates passed."),
          latest.length
            ? h("div", { class: "stack", id: "evaluations-list" }, latest.map(row))
            : emptyState("No evaluation has been recorded on this instance. Run a suite with pnpm natlang:eval --template base --suite skills/<program>/suite.ts --instance <id> and its result appears here.", ["Open Programs", "programs"])
        );
      },
    }),
  };
}
