import { isDeepStrictEqual } from "node:util";
import type { renderComponent } from "../visualize/preparePresentation/prepareSection/render.js";
import type { PresentationReport } from "../visualize/types.js";
import type { presentationWorlds } from "./worlds.js";

export function verifyPresentation(
  world: (typeof presentationWorlds)[number],
  value: unknown,
  render: typeof renderComponent,
) {
  const report = value as PresentationReport | null;
  if (
    !report ||
    !Array.isArray(report.views) ||
    report.views.length !== world.expected.length ||
    !isDeepStrictEqual(structuredClone(report.omitted), world.omitted)
  )
    return false;
  return world.expected.every(({ id, outcome }, index) => {
    const view = report.views[index];
    if (view?.id !== id || view.status !== outcome.status) return false;
    switch (outcome.status) {
      case "ready":
        if (view.status !== "ready") return false;
        try {
          const { component, props, mdx } = view.rendered;
          // Canonical readback must describe the component actually returned.
          return (
            component === outcome.spec.component &&
            isDeepStrictEqual(structuredClone(props), outcome.spec.props) &&
            render(view.rendered).mdx === mdx
          );
        } catch {
          return false;
        }
      case "deferred":
        return (
          view.status === "deferred" && view.component === outcome.component
        );
      case "needs-review":
        return (
          view.status === "needs-review" &&
          typeof view.reason === "string" &&
          /(?:staffing|capacity)/iu.test(view.reason) &&
          /(?:unconfirmed|missing|verif|no )/iu.test(view.reason)
        );
      case "plain":
        return view.status === "plain";
    }
  });
}
