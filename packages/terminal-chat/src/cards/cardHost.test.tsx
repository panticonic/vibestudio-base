import { describe, expect, it, vi } from "vitest";
import type { ChatSandboxValue } from "@workspace/agentic-core";
import type { ScopesApi } from "@workspace/eval";
import { CardHost, type CardEnvironment } from "./cardHost.js";
import { cardModules, createCardCompiler } from "./modules.js";

const files: Record<string, string> = {};
const runtimeModule = { openExternal: vi.fn(async () => ({ opened: true })) };
const compiler = createCardCompiler({
  modules: cardModules(runtimeModule),
  loadSourceFile: async (path) => {
    const file = files[path];
    if (file === undefined)
      throw Object.assign(new Error(`No such file: ${path}`), { code: "ENOENT" });
    return file;
  },
  loadImport: async (specifier) => {
    throw new Error(`Cannot build ${specifier} in this test`);
  },
});

function environment(send = vi.fn(async () => {})): CardEnvironment {
  return {
    actions: { send, answer: () => undefined },
    chat: { send } as unknown as ChatSandboxValue,
    scope: {},
    scopes: {} as ScopesApi,
    openers: {},
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
    const host = new CardHost(compiler, () => {});
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
    const host = new CardHost(compiler, () => {});
    host.setEnvironment(environment());
    const spec = {
      kind: "inline" as const,
      id: "counter",
      props: { start: 2 },
      source: {
        type: "code" as const,
        code: `import { useState } from "react";
import { Box, Text, Button } from "@radix-ui/themes";
export default function Counter({ props }) {
  const [count, setCount] = useState(props.start);
  return <Box><Text>Count: {count}</Text><Button onClick={() => setCount(count + 1)}>Add</Button></Box>;
}`,
      },
    };
    await settled(host, "c1", spec, (l) => l.join("\n").includes("Count: 2"));
    host.input("c1", "\t");
    await settled(host, "c1", spec, (l) => l.join("\n").includes("▸Add"));
    host.input("c1", "\r");
    await settled(host, "c1", spec, (l) => l.join("\n").includes("Count: 3"));
    host.dispose();
  });

  it("reports a card that cannot compile, and says why", async () => {
    const host = new CardHost(compiler, () => {});
    const env = environment();
    host.setEnvironment(env);
    const spec = {
      kind: "inline" as const,
      id: "bad",
      props: {},
      source: {
        type: "code" as const,
        code: `import { Chart } from "recharts"; export default () => <Chart />;`,
      },
    };
    for (let i = 0; i < 400 && host.view("b1", spec, 50).status === "compiling"; i++)
      await new Promise((resolve) => setTimeout(resolve, 10));
    expect(host.view("b1", spec, 50).status).toBe("failed");
    expect(env.onFailure).toHaveBeenCalledWith("b1", spec, "compile", expect.any(Error));
    host.dispose();
  });

  it("draws browser-style code from a file: HTML elements, and the terminal's runtime", async () => {
    files["ui/open.tsx"] = `import { useState } from "react";
import { openExternal } from "@workspace/runtime";
import { label } from "./label";
export default function Open({ props }) {
  const [done, setDone] = useState(false);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }} className="card">
      <p>{label(props.url)}</p>
      <button onClick={async () => { await openExternal(props.url); setDone(true); }}>Open</button>
      {done ? <span>opened</span> : null}
    </div>
  );
}`;
    files["ui/label.ts"] = `export const label = (url: string) => "Docs at " + url;`;
    const host = new CardHost(compiler, () => {});
    host.setEnvironment(environment());
    const spec = {
      kind: "inline" as const,
      id: "open",
      props: { url: "https://example.com" },
      source: { type: "file" as const, path: "ui/open.tsx" },
    };
    const lines = await settled(host, "o1", spec, (l) => l.join("\n").includes("Open"));
    expect(lines.join("\n")).toContain("Docs at https://example.com");
    const row = lines.findIndex((line) => line.includes("Open"));
    expect(host.press("o1", lines[row]!.indexOf("Open"), row)).toBe(true);
    await settled(host, "o1", spec, (l) => l.join("\n").includes("opened"));
    expect(runtimeModule.openExternal).toHaveBeenCalledWith("https://example.com");
    host.dispose();
  });

  it("gives a re-render under the same id its new props without remounting", async () => {
    const host = new CardHost(compiler, () => {});
    host.setEnvironment(environment());
    const code = `import { useState } from "react";
import { Text } from "@workspace/react";
export default function Clicks({ props, inlineUi }) {
  const [mounted] = useState(() => inlineUi.renderedAt);
  return <Text>{props.label} since {mounted} at {inlineUi.renderedAt}</Text>;
}`;
    const first = {
      kind: "inline" as const,
      id: "k",
      props: { label: "one" },
      source: { type: "code" as const, code },
      renderedAt: "t1",
    };
    await settled(host, "k1", first, (l) => l.join("\n").includes("one since t1 at t1"));
    const second = { ...first, props: { label: "two" }, renderedAt: "t2" };
    await settled(host, "k1", second, (l) => l.join("\n").includes("two since t1 at t2"));
    host.dispose();
  });
});
