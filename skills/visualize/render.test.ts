import { describe, expect, it } from "vitest";
import { ComponentPropsError, renderComponent } from "./render.js";
import type { ComponentSpec } from "./types.js";

describe("renderComponent", () => {
  it("writes the MDX tag for valid props", () => {
    const rendered = renderComponent({
      component: "Chart",
      props: { type: "line", x: "month", y: "sales", data: [{ month: "Jan", sales: 12 }, { month: "Feb", sales: 15 }] },
    });
    expect(rendered.mdx).toBe(
      '<Chart type="line" x="month" y="sales" data={[{"month":"Jan","sales":12},{"month":"Feb","sales":15}]} />'
    );
  });

  it("writes booleans as bare attributes and unsafe strings as expressions", () => {
    const rendered = renderComponent({
      component: "Choices",
      props: { id: "lisbon-day-refine", question: 'Adjust the "plan"?', options: ["More food", "Less walking"], multiple: true },
    });
    expect(rendered.mdx).toContain("multiple");
    expect(rendered.mdx).toContain('question={"Adjust the \\"plan\\"?"}');
  });

  it.each<[string, ComponentSpec | { component: string; props: unknown }, RegExp]>([
    ["an unknown prop", { component: "Chart", props: { data: [{ a: 1 }], z: 3 } }, /props\.z is not a prop here/u],
    ["a non-numeric series", { component: "Chart", props: { x: "q", y: "v", data: [{ q: "a", v: "x" }] } }, /must be a number to plot/u],
    ["a series key the rows lack", { component: "Chart", props: { x: "q", y: "w", data: [{ q: "a", v: 1 }] } }, /"w" is not a key of the data rows/u],
    ["rows with different keys", { component: "Chart", props: { data: [{ a: 1 }, { b: 2 }] } }, /same keys as the first row/u],
    ["a latitude out of range", { component: "PlaceMap", props: { places: [{ name: "A", lat: 95, lng: 3 }] } }, /latitude from -90 to 90/u],
    ["a single comparison option", { component: "Compare", props: { options: [{ name: "A" }] } }, /list of at least 2/u],
    ["an unknown enum value", { component: "Stats", props: { items: [{ label: "A", value: 1, tone: "good" }] } }, /one of "positive"/u],
    ["a choices id that is not a slug", { component: "Choices", props: { id: "Pick One", options: ["a", "b"] } }, /lowercase words joined by hyphens/u],
    ["a missing required prop", { component: "Timeline", props: {} }, /props\.items is required/u],
    ["a component built from no data", { component: "Calculator", props: {} }, /Calculator is not built from data/u],
  ])("rejects %s with a message that names the fix", (_name, spec, message) => {
    expect(() => renderComponent(spec as ComponentSpec)).toThrow(message);
    expect(() => renderComponent(spec as ComponentSpec)).toThrow(ComponentPropsError);
  });
});
