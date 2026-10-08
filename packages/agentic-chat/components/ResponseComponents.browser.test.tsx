import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { page } from "@vitest/browser/context";
import { Theme } from "@radix-ui/themes";
import "@radix-ui/themes/styles.css";
import "../styles.css";
import {
  Calculator,
  Chart,
  Checklist,
  Choices,
  Compare,
  PlaceMap,
  ResponseActionsProvider,
  Stats,
  Timeline,
} from "@workspace/ui/response";

afterEach(cleanup);

function Gallery() {
  return (
    <>
      <Stats
        items={[
          { label: "Monthly payment", value: "$3,398", detail: "15-year" },
          { label: "Total interest", value: "$211,700", delta: "-$307,000" },
        ]}
      />
      <Chart
        type="bar"
        title="Spending"
        valueFormat="currency"
        stacked
        data={[
          { month: "Jan", groceries: 420, dining: 180 },
          { month: "Feb", groceries: 390, dining: 240 },
          { month: "Mar", groceries: 450, dining: 210 },
        ]}
        x="month"
        y={["groceries", "dining"]}
      />
      <Chart
        type="donut"
        data={[
          { kind: "Rent", amount: 1800 },
          { kind: "Food", amount: 600 },
          { kind: "Travel", amount: 300 },
        ]}
      />
      <Compare
        options={[
          { name: "Northwind", price: "$25/mo", attributes: { Data: "5 GB", Streaming: false } },
          {
            name: "Skyline",
            price: "$40/mo",
            badge: "Best value",
            highlight: true,
            attributes: { Data: "20 GB", Streaming: false },
          },
          { name: "Orbit", price: "$55/mo", attributes: { Data: "Unlimited", Streaming: true } },
        ]}
      />
      <PlaceMap
        route
        places={[
          { name: "Senhora do Monte", lat: 38.7193, lng: -9.1326, emoji: "🌅" },
          { name: "Time Out Market", lat: 38.7069, lng: -9.1457, emoji: "🍽️" },
          { name: "Belém Tower", lat: 38.6916, lng: -9.216, emoji: "🏰" },
        ]}
      />
      <Timeline
        items={[
          { time: "9:00", title: "Sunrise view", icon: "🌅", status: "done" },
          { time: "12:30", title: "Lunch at Time Out Market", icon: "🍽️", status: "current" },
          { time: "15:00", title: "Belém Tower", icon: "🏰" },
        ]}
      />
      <Checklist title="3-day hike" items={["Tent", { label: "Water filter", detail: "Test it first" }] as never} />
      <Calculator
        title="Split the bill"
        fields={[
          { name: "bill", label: "Bill ($)", type: "number", default: 180 },
          { name: "tip", label: "Tip", type: "slider", default: 18, min: 0, max: 30, unit: "%" },
          { name: "people", label: "People", type: "number", default: 4, min: 1 },
        ]}
        compute={({ bill, tip, people }) => {
          const total = Number(bill ?? 0) * (1 + Number(tip ?? 0) / 100);
          return [
            { label: "Total", value: total, format: "currency" },
            { label: "Each", value: total / Math.max(1, Number(people ?? 1)), format: "currency" },
          ];
        }}
      />
      <Choices
        id="gallery-next"
        question="Want me to adjust it?"
        options={["More food stops", "Less walking", "Add an evening plan"]}
      />
    </>
  );
}

describe.each([320, 640])("response components at %ipx", (width) => {
  it("render every component without overflowing the card", async () => {
    await page.viewport(width + 80, 640);
    render(
      <Theme>
        <div className="agentic-chat-root" style={{ width }}>
          <div className="message-prose" data-testid="gallery" style={{ display: "grid", gap: 16 }}>
            <ResponseActionsProvider send={() => undefined}>
              <Gallery />
            </ResponseActionsProvider>
          </div>
        </div>
      </Theme>,
    );
    const gallery = screen.getByTestId("gallery");
    expect(gallery.querySelector(".vs-r-problem")).toBeNull();
    expect(gallery.scrollWidth).toBeLessThanOrEqual(gallery.clientWidth + 1);
    // Each component's own box must fit and must not scroll horizontally.
    // Descendants clipped by a component (map tiles) are its own business.
    const host = gallery.getBoundingClientRect();
    for (const child of Array.from(gallery.children) as HTMLElement[]) {
      const label = child.className || child.tagName;
      expect(child.getBoundingClientRect().right, label).toBeLessThanOrEqual(host.right + 1);
      expect(child.scrollWidth, label).toBeLessThanOrEqual(child.clientWidth + 1);
    }
    // Saved under the runner-owned screenshot directory for visual review,
    // one component at a time so each fits the unscaled test viewport.
    for (const child of Array.from(gallery.children) as HTMLElement[]) {
      child.scrollIntoView();
      await page.screenshot({ element: child });
    }
  });
});
