// @vitest-environment jsdom
import { act, fireEvent, render as baseRender, screen, within } from "@testing-library/react";
import { Theme } from "@radix-ui/themes";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  ActionButton,
  Calculator,
  Chart,
  Checklist,
  Choices,
  Compare,
  PlaceMap,
  ResponseActionsProvider,
  ResponseProblemReporterContext,
  Stats,
  Timeline,
} from "./index";
import { normalizeChartData } from "./Chart";
import { runCompute } from "./Calculator";
import { normalizePlaces } from "./PlaceMap";

// Radix overlays (Tooltip/Select content) are portaled and only mount when
// opened; these tests never open one, which keeps jsdom off the duplicate-React
// overlay path noted in CommandPalette.test.tsx.

// Every host renders inside a Radix Theme (which also provides tooltips).
const render = (ui: ReactElement) => baseRender(ui, { wrapper: Theme });

describe("Chart", () => {
  const data = [
    { month: "Jan", sales: 120, costs: "80" },
    { month: "Feb", sales: "150", costs: 95 },
    { month: "Mar", sales: 90, costs: 70 },
  ];

  it("infers x and numeric series from loose rows", () => {
    const model = normalizeChartData(data, undefined, undefined);
    expect(model.categories).toEqual(["Jan", "Feb", "Mar"]);
    expect(model.series.map((s) => s.key)).toEqual(["sales", "costs"]);
    expect(model.series[1]!.values).toEqual([80, 95, 70]);
    expect(model.problems).toEqual([]);
  });

  it("reports missing columns and non-numeric cells instead of throwing", () => {
    const model = normalizeChartData(
      JSON.stringify([...data, { month: "Apr", sales: "n/a" }]),
      "month",
      ["sales", "profit"],
    );
    expect(model.series.map((s) => s.key)).toEqual(["sales"]);
    expect(model.problems.join(" ")).toMatch(/profit/);
    expect(model.problems.join(" ")).toMatch(/1 value in “sales”/);
  });

  it("renders a multi-series bar chart with legend, axis ticks and an accessible table", () => {
    const { container } = render(<Chart type="bar" title="Q1" data={data} x="month" y={["sales", "costs"]} />);
    expect(screen.getByRole("region", { name: "Q1" })).toBeTruthy();
    expect(container.querySelectorAll("svg rect[rx]")).toHaveLength(6);
    expect(container.querySelector(".vs-r-legend")!.textContent).toBe("salescosts");
    // Visually-hidden table carries every value.
    const table = screen.getByRole("table");
    expect(within(table).getByText("150")).toBeTruthy();
    // Nice y ticks for 0..150 at the default height.
    const ticks = [...container.querySelectorAll("svg.vs-r-chart-svg text")].map((t) => t.textContent);
    expect(ticks.slice(0, 4)).toEqual(["0", "50", "100", "150"]);
  });

  it("reads values with the keyboard and toggles the table view", () => {
    render(<Chart type="line" data={data} x="month" y="sales" valueFormat="currency" />);
    const plot = screen.getByRole("group", { name: /Line chart/ });
    fireEvent.focus(plot);
    fireEvent.keyDown(plot, { key: "ArrowRight" });
    expect(document.querySelector("[aria-live]")!.textContent).toBe("Feb: sales $150");
    fireEvent.click(screen.getByRole("button", { name: "Show table" }));
    expect(screen.queryByRole("group", { name: /Line chart/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Show chart" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("draws pie and donut slices with percentages", () => {
    const { container } = render(
      <Chart type="donut" data={[{ k: "A", v: 3 }, { k: "B", v: 1 }, { k: "C", v: -2 }]} x="k" y="v" />,
    );
    expect(container.querySelectorAll("svg.vs-r-chart-svg path")).toHaveLength(2);
    expect(screen.getByText("3 · 75%")).toBeTruthy();
    expect(screen.getByText(/non-positive/)).toBeTruthy();
  });

  it("shows a notice for unusable input", () => {
    render(<Chart data={"nonsense" as never} />);
    expect(screen.getByRole("note").textContent).toMatch(/array of row objects/);
    render(<Chart type={"radar" as never} data={data} />);
    expect(screen.getByText(/Unknown chart type “radar”/)).toBeTruthy();
  });
});

describe("Stats", () => {
  it("renders tiles with tone inferred from the delta sign", () => {
    render(
      <Stats
        items={[
          { label: "Revenue", value: 12400, delta: "+12%" },
          { label: "Churn", value: "2.1%", delta: -0.4, detail: "vs last month" },
          "junk" as never,
        ]}
      />,
    );
    expect(screen.getByText("12,400")).toBeTruthy();
    expect(screen.getByText("+12%")).toBeTruthy();
    expect(screen.getByText("Up", { exact: false })).toBeTruthy();
    expect(screen.getByText("-0.4")).toBeTruthy();
    expect(screen.getByText("vs last month")).toBeTruthy();
    expect(screen.getByRole("note").textContent).toMatch(/1 items/);
  });
});

describe("Compare", () => {
  it("aligns the union of attributes across options", () => {
    render(
      <Compare
        options={[
          { name: "Basic", price: "$5", attributes: { Storage: "10 GB", Support: false }, pros: ["Cheap"] },
          { name: "Pro", badge: "Best value", highlight: true, attributes: { Storage: "1 TB", SSO: true }, cons: ["Pricey"] },
        ]}
      />,
    );
    const [basic, pro] = screen.getAllByRole("listitem", { name: /Basic|Pro/ });
    expect(within(basic!).getByText("SSO")).toBeTruthy();
    expect(within(basic!).getByLabelText("Not specified")).toBeTruthy();
    expect(within(basic!).getByLabelText("No")).toBeTruthy();
    expect(within(pro!).getByLabelText("Yes")).toBeTruthy();
    expect(within(pro!).getByText("Support")).toBeTruthy();
    expect(within(pro!).getByRole("list", { name: "Pros" })).toBeTruthy();
    expect(pro!.getAttribute("data-highlight")).toBe("true");
  });
});

describe("Timeline", () => {
  it("marks status, links safe hrefs, and drops unsafe ones", () => {
    render(
      <Timeline
        items={[
          { time: "09:00", title: "Depart", status: "done", icon: "✈️" },
          { time: "13:00", title: "Museum", status: "current", href: "https://example.com" },
          { title: "Dinner", href: "javascript:alert(1)", status: "bogus" as never },
        ]}
      />,
    );
    const items = screen.getAllByRole("listitem");
    expect(items[1]!.getAttribute("aria-current")).toBe("step");
    expect(screen.getByRole("link", { name: /Museum/ }).getAttribute("href")).toBe("https://example.com");
    expect(screen.queryByRole("link", { name: /Dinner/ })).toBeNull();
    expect(items[2]!.getAttribute("data-status")).toBeNull();
  });
});

describe("Checklist", () => {
  it("tracks progress locally", () => {
    render(<Checklist title="Packing" items={[{ label: "Passport", checked: true }, "Charger" as never, { label: "Tickets" }]} />);
    expect(screen.getByRole("progressbar", { name: "1 of 3 done" })).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: "Charger" }));
    expect(screen.getByRole("progressbar", { name: "2 of 3 done" })).toBeTruthy();
  });
});

describe("PlaceMap", () => {
  it("normalizes coordinate aliases and rejects invalid places", () => {
    const { places, problems } = normalizePlaces([
      { name: "A", latitude: "48.85", longitude: "2.29" },
      { name: "B", lat: 200, lng: 0 },
      { name: "C" },
    ]);
    expect(places).toEqual([{ name: "A", lat: 48.85, lng: 2.29, emoji: undefined, detail: undefined }]);
    expect(problems[0]).toMatch(/B, C/);
  });

  it("renders tiles, attribution, pins, and a linked place list", () => {
    const { container } = render(
      <PlaceMap
        route
        places={[
          { name: "Louvre", lat: 48.8606, lng: 2.3376, detail: "Art" },
          { name: "Eiffel Tower", lat: 48.8584, lng: 2.2945, emoji: "🗼" },
        ]}
      />,
    );
    expect(container.querySelector('img[src^="https://tile.openstreetmap.org/"]')).toBeTruthy();
    expect(screen.getByRole("link", { name: "© OpenStreetMap contributors" })).toBeTruthy();
    expect(container.querySelector("polyline")).toBeTruthy();
    const pin = screen.getByRole("button", { name: "Stop 2: Eiffel Tower" });
    fireEvent.click(pin);
    expect(pin.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("status").textContent).toBe("Eiffel Tower");
    expect(screen.getByRole("link", { name: "Open Louvre in OpenStreetMap" }).getAttribute("href")).toContain("mlat=48.8606");
  });

  it("falls back to a neutral grid when tiles fail", () => {
    const { container } = render(<PlaceMap places={[{ name: "X", lat: 1, lng: 2 }]} />);
    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("Map tiles unavailable")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Pin: X" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "X" })).toBeTruthy();
  });

  it("shows a notice when nothing is plottable", () => {
    render(<PlaceMap places={[{ name: "Nowhere" }] as never} />);
    expect(screen.getByRole("note").textContent).toMatch(/Nowhere/);
  });
});

describe("Choices", () => {
  it("sends the selection with interaction metadata, then locks", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    render(
      <ResponseActionsProvider send={send}>
        <Choices
          id="cuisine"
          question="Which cuisine?"
          options={["Thai", { label: "Italian", value: "italian food", description: "Pasta" }]}
          multiple
          allowOther
        />
      </ResponseActionsProvider>,
    );
    const submit = screen.getByRole("button", { name: "Send" });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: /Thai/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Italian/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Other" }));
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByRole("textbox", { name: "Other answer" }), { target: { value: "Ethiopian" } });
    await act(async () => {
      fireEvent.click(submit);
    });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith("Which cuisine? → Thai, italian food, Ethiopian", {
      interaction: { source: "choices", kind: "choice", action: "submit", targetId: "cuisine", values: ["Thai", "italian food", "Ethiopian"] },
    });
    expect(screen.getByRole("status").textContent).toContain("Thai, italian food, Ethiopian");
    expect(screen.queryByRole("button", { name: "Send" })).toBeNull();
  });

  it("renders locked with the chosen options marked when the transcript already holds the answer", () => {
    const answer = vi.fn((source: string, targetId: string) =>
      source === "choices" && targetId === "cuisine"
        ? { text: "Which cuisine? → Thai, Ethiopian", values: ["Thai", "Ethiopian"] }
        : undefined,
    );
    render(
      <ResponseActionsProvider send={vi.fn()} answer={answer}>
        <Choices id="cuisine" question="Which cuisine?" options={["Thai", "Italian"]} multiple allowOther />
      </ResponseActionsProvider>,
    );
    expect((screen.getByRole("checkbox", { name: /Thai/ }) as HTMLButtonElement).getAttribute("aria-checked")).toBe(
      "true",
    );
    expect(screen.getByRole("checkbox", { name: /Italian/ }).getAttribute("aria-checked")).toBe("false");
    expect(screen.getByRole("checkbox", { name: "Other" }).getAttribute("aria-checked")).toBe("true");
    expect((screen.getByRole("textbox", { name: "Other answer" }) as HTMLInputElement).value).toBe("Ethiopian");
    expect(screen.getByRole("status").textContent).toContain("Thai, Ethiopian");
    expect(screen.queryByRole("button", { name: "Send" })).toBeNull();
  });

  it("keeps the selection editable and shows the error when sending fails", async () => {
    const send = vi.fn().mockRejectedValue(new Error("offline"));
    render(
      <ResponseActionsProvider send={send}>
        <Choices id="q" options={["Yes", "No"]} submitLabel="Answer" />
      </ResponseActionsProvider>,
    );
    fireEvent.click(screen.getByRole("radio", { name: "No" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Answer" }));
    });
    expect(send).toHaveBeenCalledWith("No", expect.anything());
    expect(screen.getByRole("alert").textContent).toContain("offline");
    expect(screen.getByRole("button", { name: "Answer" })).toBeTruthy();
  });

  it("renders disabled with a reason outside a conversation, and flags a missing id", () => {
    render(<Choices id={undefined as never} options={["A"]} />);
    expect((screen.getByRole("button", { name: "Send" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByLabelText(/Not connected to a conversation/)).toBeTruthy();
    expect(screen.getByRole("note").textContent).toMatch(/`id` is required/);
  });
});

describe("ActionButton", () => {
  it("sends its message, with interaction metadata only when it has an id", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    render(
      <ResponseActionsProvider send={send}>
        <ActionButton message="Show more">More</ActionButton>
        <ActionButton message="Approve the plan" id="plan-1" action="approve" />
      </ResponseActionsProvider>,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "More" }));
      fireEvent.click(screen.getByRole("button", { name: "Approve the plan" }));
    });
    expect(send).toHaveBeenNthCalledWith(1, "Show more", undefined);
    expect(send).toHaveBeenNthCalledWith(2, "Approve the plan", {
      interaction: { source: "action-button", kind: "action", action: "approve", targetId: "plan-1" },
    });
  });

  it("shows an identified button as already pressed when the transcript holds its interaction", () => {
    const answer = (source: string, targetId: string) =>
      source === "action-button" && targetId === "plan-1" ? { text: "Approve the plan" } : undefined;
    render(
      <ResponseActionsProvider send={vi.fn()} answer={answer}>
        <ActionButton message="Approve the plan" id="plan-1" action="approve" />
        <ActionButton message="Other" id="plan-2" />
      </ResponseActionsProvider>,
    );
    const pressed = screen.getByRole("button", { name: "Approve the plan" }) as HTMLButtonElement;
    expect(pressed.disabled).toBe(true);
    expect(pressed.getAttribute("aria-pressed")).toBe("true");
    expect((screen.getByRole("button", { name: "Other" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("is disabled with an explanation without a provider", () => {
    render(<ActionButton message="Go" />);
    expect((screen.getByRole("button", { name: "Go" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByLabelText(/Not connected to a conversation/)).toBeTruthy();
  });
});

describe("Calculator", () => {
  const fields = [
    { name: "principal", label: "Loan", type: "number" as const, default: "200000", unit: "$" },
    { name: "rate", label: "Rate", type: "slider" as const, default: 5, min: 0, max: 15, step: 0.25, unit: "%" },
    { name: "years", label: "Term", type: "select" as const, options: ["15", "30"], default: 30 },
    { name: "extra", label: "Extra", type: "toggle" as const },
  ];

  it("recomputes live from coerced field values", () => {
    const compute = vi.fn((v: Record<string, unknown>) => [
      { label: "Total", value: (v["principal"] as number) * (v["extra"] ? 2 : 1), format: "currency" as const },
      { label: "Years", value: v["years"] as number },
    ]);
    render(<Calculator title="Mortgage" fields={fields} compute={compute} />);
    expect(compute).toHaveBeenLastCalledWith({ principal: 200000, rate: 5, years: 30, extra: false });
    expect(screen.getByText("$200,000")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Loan"), { target: { value: "1000" } });
    expect(screen.getByText("$1,000")).toBeTruthy();
    fireEvent.click(screen.getByRole("switch"));
    expect(screen.getByText("$2,000")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Loan"), { target: { value: "" } });
    expect(compute).toHaveBeenLastCalledWith(expect.objectContaining({ principal: null }));
  });

  it("accepts record results and shows compute errors inline", () => {
    render(
      <Calculator
        fields={[{ name: "x", default: 2 }]}
        compute={(v) => {
          if ((v["x"] as number) > 5) throw new Error("x too large");
          return { Double: (v["x"] as number) * 2, Note: "ok" };
        }}
      />,
    );
    expect(screen.getByText("4")).toBeTruthy();
    expect(screen.getByText("ok")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("x"), { target: { value: "9" } });
    expect(screen.getByRole("note").textContent).toContain("x too large");
  });

  it("normalizes compute output and rejects non-functions", () => {
    expect(runCompute("v => 1", {}).error).toMatch(/must be a function/);
    expect(runCompute(() => Promise.resolve(1), {}).error).toMatch(/synchronously/);
    expect(runCompute(() => [], {}).error).toMatch(/no results/);
    expect(runCompute(() => [{ label: "P", value: 12.5, format: "percent" }], {}).results).toEqual([
      { label: "P", text: "12.5%" },
    ]);
  });
});

describe("ProblemNotice reporting", () => {
  it("reports the component and problems once per distinct occurrence when a reporter is provided", () => {
    const report = vi.fn();
    const reporter = { report };
    const view = render(
      <ResponseProblemReporterContext.Provider value={reporter}>
        <Stats items={"not a list" as never} />
      </ResponseProblemReporterContext.Provider>,
    );
    expect(view.container.querySelector(".vs-r-problem")).toBeTruthy();
    expect(report).toHaveBeenCalledTimes(1);
    expect(report.mock.calls[0]![0]).toMatchObject({ component: "Stats" });
    expect(report.mock.calls[0]![0].problems.length).toBeGreaterThan(0);
    view.rerender(
      <ResponseProblemReporterContext.Provider value={reporter}>
        <Stats items={"not a list" as never} />
      </ResponseProblemReporterContext.Provider>,
    );
    expect(report).toHaveBeenCalledTimes(1);
  });

  it("only renders the notice without a reporter, and reports nothing for valid props", () => {
    const report = vi.fn();
    const bad = render(<Stats items={"not a list" as never} />);
    expect(bad.container.querySelector(".vs-r-problem")).toBeTruthy();
    render(
      <ResponseProblemReporterContext.Provider value={{ report }}>
        <Stats items={[{ label: "A", value: 1 }]} />
      </ResponseProblemReporterContext.Provider>,
    );
    expect(report).not.toHaveBeenCalled();
  });
});
