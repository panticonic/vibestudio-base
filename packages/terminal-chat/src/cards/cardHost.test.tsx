import { describe, expect, it, vi } from "vitest";
import { CardHost, type CardEnvironment } from "./cardHost.js";

function environment(send = vi.fn(async () => {})): CardEnvironment {
  return {
    actions: { send, answer: () => undefined },
    chat: { send },
    onFailure: vi.fn(),
  };
}

async function settled(
  host: CardHost,
  key: string,
  spec: Parameters<CardHost["view"]>[1],
  what: (lines: string[]) => boolean
) {
  for (let i = 0; i < 400; i++) {
    const view = host.view(key, spec, 50);
    if (view.status === "failed") throw view.error;
    if (view.status === "ready" && what(view.lines)) return view.lines;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(
    `card never showed what was expected: ${host.view(key, spec, 50).lines.join("\n")}`
  );
}

describe("CardHost", () => {
  it("draws an MDX message with its components, and a click on a choice and Send answers it", async () => {
    const host = new CardHost(() => {});
    const send = vi.fn(async () => {});
    host.setEnvironment(environment(send));
    const spec = {
      kind: "mdx" as const,
      content: `Pick one:\n\n<Choices id="lunch" question="Lunch?" options={["Soup", "Salad"]} />\n`,
    };
    const lines = await settled(host, "m1", spec, (l) => l.join("\n").includes("Salad"));
    expect(lines.join("\n")).toContain("Pick one:");
    const salad = lines.findIndex((line) => line.includes("Salad"));
    expect(host.press("m1", lines[salad]!.indexOf("Salad"), salad)).toBe(true);
    const after = await settled(host, "m1", spec, (l) => l.join("\n").includes("◉ Salad"));
    const sendRow = after.findIndex((line) => line.includes("Send"));
    host.press("m1", after[sendRow]!.indexOf("Send"), sendRow);
    await vi.waitFor(() =>
      expect(send).toHaveBeenCalledWith("Lunch? → Salad", {
        interaction: {
          source: "choices",
          kind: "choice",
          action: "submit",
          targetId: "lunch",
          values: ["Salad"],
        },
      })
    );
    host.dispose();
  });

  it("runs agent code with state, and keys reach the focused card", async () => {
    const host = new CardHost(() => {});
    host.setEnvironment(environment());
    const spec = {
      kind: "inline" as const,
      id: "counter",
      props: { start: 2 },
      source: `import { useState } from "react";
import { Box, Text, Button } from "@radix-ui/themes";
export default function Counter({ props }) {
  const [count, setCount] = useState(props.start);
  return <Box><Text>Count: {count}</Text><Button onClick={() => setCount(count + 1)}>Add</Button></Box>;
}`,
    };
    await settled(host, "c1", spec, (l) => l.join("\n").includes("Count: 2"));
    host.input("c1", "\t");
    await settled(host, "c1", spec, (l) => l.join("\n").includes("▸Add"));
    host.input("c1", "\r");
    await settled(host, "c1", spec, (l) => l.join("\n").includes("Count: 3"));
    host.dispose();
  });

  it("reports a card that cannot compile, and says why", async () => {
    const host = new CardHost(() => {});
    const env = environment();
    host.setEnvironment(env);
    const spec = {
      kind: "inline" as const,
      id: "bad",
      props: {},
      source: `import { Chart } from "recharts"; export default () => <Chart />;`,
    };
    for (let i = 0; i < 400 && host.view("b1", spec, 50).status === "compiling"; i++)
      await new Promise((resolve) => setTimeout(resolve, 10));
    expect(host.view("b1", spec, 50).status).toBe("failed");
    expect(env.onFailure).toHaveBeenCalledWith("b1", spec, "compile", expect.any(Error));
    host.dispose();
  });
});
