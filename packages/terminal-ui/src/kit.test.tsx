import React from "react";
import { describe, expect, it } from "vitest";
import { PassThrough } from "node:stream";
import { render, renderToString } from "ink";
import {
  Callout,
  Card,
  Flex,
  Table,
  Text,
  Badge,
  Calculator,
  Chart,
  ClickTargets,
  ClickTargetsContext,
  LinkOpenersContext,
  OpenLinkButtons,
  PlaceMap,
  hostJsxRuntime,
  hostReact,
  mdxComponents,
  useAction,
} from "./index.js";

const md = mdxComponents as Record<string, React.FC<Record<string, unknown>>>;

describe("terminal-ui", () => {
  it("draws the browser vocabulary as text", () => {
    const out = renderToString(
      <Card>
        <Flex gap="2">
          <Text weight="bold">Build</Text>
          <Badge color="green">passing</Badge>
        </Flex>
        <Callout.Root color="amber">
          <Callout.Text>Two tests were skipped.</Callout.Text>
        </Callout.Root>
        <Table.Root>
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeaderCell>Name</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>Time</Table.ColumnHeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            <Table.Row>
              <Table.Cell>unit</Table.Cell>
              <Table.Cell>4s</Table.Cell>
            </Table.Row>
          </Table.Body>
        </Table.Root>
      </Card>,
      { columns: 60 }
    );
    expect(out).toContain("Build");
    expect(out).toContain("‹passing›");
    expect(out).toContain("Two tests were skipped.");
    expect(out).toMatch(/Name\s+Time/);
    expect(out).toMatch(/unit\s+4s/);
  });

  it("lays out the elements Markdown compiles to, with words outside <Text>", () => {
    const P = md["p"]!;
    const Ul = md["ul"]!;
    const Li = md["li"]!;
    const Strong = md["strong"]!;
    const out = renderToString(
      <>
        <P>
          Hello <Strong>terminal</Strong> world
        </P>
        <Ul>
          <Li>first</Li>
          <Li>second</Li>
        </Ul>
      </>,
      { columns: 40 }
    );
    expect(out).toContain("Hello terminal world");
    expect(out).toContain("• first");
    expect(out).toContain("• second");
  });

  it("draws bar charts, stacked bars, sparklines and shares", () => {
    const data = [
      { month: "Jan", sales: 120, costs: 60 },
      { month: "Feb", sales: 60, costs: 30 },
      { month: "Mar", sales: 90, costs: 45 },
    ];
    const bars = renderToString(
      <Chart data={data} x="month" y={["sales"]} title="Sales" unit="k" />,
      {
        columns: 50,
      }
    );
    expect(bars).toContain("Sales");
    const rows = bars.split("\n").filter((line) => line.includes("█"));
    expect(rows).toHaveLength(3);
    expect(rows[0]!.match(/█/g)!.length).toBe(2 * rows[1]!.match(/█/g)!.length);
    expect(rows[0]).toContain("120 k");

    const stacked = renderToString(<Chart data={data} x="month" stacked />, { columns: 50 });
    expect(stacked).toContain("■ sales  ■ costs");
    expect(stacked).toContain("180");

    const line = renderToString(<Chart type="line" data={data} x="month" y="sales" />, {
      columns: 50,
    });
    expect(line).toMatch(/█▁[▃▄▅]/);
    expect(line).toContain("60 … 120");

    const pie = renderToString(
      <Chart
        type="pie"
        data={[
          { k: "a", v: 1 },
          { k: "b", v: 3 },
        ]}
        x="k"
        y="v"
      />,
      { columns: 50 }
    );
    expect(pie).toContain("25.0%");
    expect(pie).toContain("75.0%");
  });

  it("calculates from its fields", () => {
    const out = renderToString(
      <Calculator
        title="Loan"
        currency="EUR"
        fields={[
          { name: "price", label: "Price", default: 200 },
          { name: "tax", label: "Tax", type: "slider", default: 10, unit: "%" },
        ]}
        compute={(v: Record<string, unknown>) => [
          {
            label: "Total",
            value: (v["price"] as number) * (1 + (v["tax"] as number) / 100),
            format: "currency",
          },
        ]}
      />,
      { columns: 50 }
    );
    expect(out).toContain("Total:");
    expect(out).toMatch(/€220/);
    const failing = renderToString(
      <Calculator
        fields={[{ name: "a" }]}
        compute={() => {
          throw new Error("boom");
        }}
      />,
      { columns: 50 }
    );
    expect(failing).toContain("boom");
  });

  it("links places, media and diagrams", () => {
    const out = renderToString(
      <>
        <PlaceMap
          places={[
            { name: "Cafe", lat: 1.5, lng: 2.5 },
            { name: "Home", address: "1 Main St" },
          ]}
        />
        {hostReact.createElement(mdxComponents["Video"] as never, {
          url: "https://youtu.be/dQw4w9WgXcQ",
          title: "Clip",
        })}
        {hostReact.createElement(mdxComponents["Mermaid"] as never, { code: "graph TD\nA-->B" })}
      </>,
      { columns: 60 }
    );
    expect(out).toContain("https://www.openstreetmap.org/?mlat=1.5&mlon=2.5");
    expect(out).toContain("search?query=1%20Main%20St");
    expect(out).toContain("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(out).toContain("▣");
    expect(out).toContain("diagram");
    expect(out).toContain("A-->B");
  });
});

/** A card rendered live, so state changes and clicks are real. */
async function mount(node: React.ReactElement) {
  const stdout = Object.assign(new PassThrough(), { columns: 60, rows: 24 });
  const stdin = Object.assign(new PassThrough(), {
    isTTY: true,
    setRawMode() {},
    ref() {},
    unref() {},
  });
  let frame = "";
  stdout.on("data", (chunk: Buffer) => (frame = chunk.toString()));
  const targets = new ClickTargets();
  const app = render(
    <ClickTargetsContext.Provider value={targets}>{node}</ClickTargetsContext.Provider>,
    { stdout: stdout as never, stdin: stdin as never, debug: true, patchConsole: false }
  );
  const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
  await settle();
  return {
    frame: () => frame,
    click: async (x: number, y: number) => {
      const hit = targets.press(x, y);
      await settle();
      return hit;
    },
    settle,
    unmount: () => app.unmount(),
  };
}

describe("browser code in the terminal", () => {
  it("draws HTML elements and still clicks", async () => {
    const { jsx, jsxs } = hostJsxRuntime;
    let clicks = 0;
    function Counter() {
      const [n, setN] = React.useState(0);
      return jsxs("div", {
        className: "card",
        style: { display: "flex", flexDirection: "column", gap: 8 },
        "data-x": 1,
        children: [
          jsxs("p", { id: "x", children: ["Count ", jsx("strong", { children: String(n) })] }),
          jsx("span", { style: { color: "red" }, "aria-label": "hint", children: "hint" }),
          jsx("button", {
            onClick: () => {
              clicks++;
              setN(n + 1);
            },
            children: "Add",
          }),
        ],
      });
    }
    const view = await mount(jsx(Counter, {}));
    expect(view.frame()).toContain("Count 0");
    expect(view.frame()).toContain("hint");
    expect(view.frame()).not.toContain("<");
    expect(await view.click(2, 3)).toBe(true);
    expect(clicks).toBe(1);
    expect(view.frame()).toContain("Count 1");
    view.unmount();
  });

  it("maps classic createElement and passes Ink elements through", () => {
    const out = renderToString(
      hostReact.createElement(
        "ul",
        null,
        hostReact.createElement("li", null, "one"),
        hostReact.createElement(
          "li",
          null,
          hostReact.createElement("a", { href: "https://x.test" }, "two")
        )
      ) as React.ReactElement,
      { columns: 30 }
    );
    expect(out).toContain("• one");
    expect(out).toContain("two");
    expect(hostJsxRuntime.jsx("ink-box", {}).type).toBe("ink-box");
  });

  it("tracks an action per control and never rejects", async () => {
    let action!: ReturnType<typeof useAction<[number]>>;
    function Probe() {
      action = useAction(async (n: number) => {
        if (n < 0) throw new Error("bad input");
      });
      return <Text>{`${action.status}:${action.error ?? ""}`}</Text>;
    }
    const view = await mount(<Probe />);
    expect(view.frame()).toContain("idle:");
    await action.run(-1);
    await view.settle();
    expect(view.frame()).toContain("failed:bad input");
    await action.run(1);
    await view.settle();
    expect(view.frame()).toContain("done:");
    view.unmount();
  });

  it("opens links through the host's openers, or as a link without them", async () => {
    const opened: string[] = [];
    const without = renderToString(<OpenLinkButtons url="https://x.test/a" />, { columns: 40 });
    expect(without).toContain("https://x.test/a");
    const view = await mount(
      <LinkOpenersContext.Provider value={{ openPanel: (url) => void opened.push(url) }}>
        <OpenLinkButtons url="https://x.test/a" />
      </LinkOpenersContext.Provider>
    );
    expect(view.frame()).toContain("Internal");
    expect(view.frame()).not.toContain("External");
    await view.click(2, 0);
    expect(opened).toEqual(["https://x.test/a"]);
    view.unmount();
  });
});
