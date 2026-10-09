import { beforeAll, describe, expect, it } from "vitest";
import { getMdxParser } from "./messageMdx";
import { splitStreamingMdx, type MdxBlockParser } from "./streamingMdx";

let parse: MdxBlockParser;
beforeAll(async () => {
  parse = await getMdxParser();
});

function prefixOf(content: string): string {
  const { prefix, remainder } = splitStreamingMdx(content, parse);
  expect(prefix + remainder).toBe(content);
  return prefix;
}

describe("splitStreamingMdx", () => {
  it("keeps whole blocks in the prefix and the partial paragraph in the remainder", () => {
    const content = [
      "Intro paragraph.",
      "",
      '<Callout title="Note">',
      "",
      "Inside the callout.",
      "",
      "</Callout>",
      "",
      "A partial para",
    ].join("\n");
    expect(prefixOf(content)).toBe(
      'Intro paragraph.\n\n<Callout title="Note">\n\nInside the callout.\n\n</Callout>',
    );
  });

  it("holds the final block until a blank line ends it", () => {
    expect(prefixOf("First.\n\n<Stats items={[]} />")).toBe("First.");
    expect(prefixOf("First.\n\n<Stats items={[]} />\n")).toBe("First.");
    expect(prefixOf("First.\n\n<Stats items={[]} />\n\n")).toBe(
      "First.\n\n<Stats items={[]} />",
    );
    expect(prefixOf("Only a paragraph that is still")).toBe("");
  });

  it("keeps an unterminated fence in the remainder, even across blank lines", () => {
    expect(prefixOf("Intro.\n\n```ts\nconst a = 1;\n\nconst b = 2;\n\n")).toBe("Intro.");
    expect(prefixOf("Intro.\n\n```ts\nconst a = 1;\n```\n\nNext")).toBe(
      "Intro.\n\n```ts\nconst a = 1;\n```",
    );
  });

  it("keeps an unclosed JSX element in the remainder", () => {
    expect(prefixOf("Intro.\n\n<Callout>\n\nFirst inner.\n\nSecond inner")).toBe("Intro.");
    expect(prefixOf('Intro.\n\n<Callout title="unterminated')).toBe("Intro.");
    expect(prefixOf("Intro.\n\nSome {expression")).toBe("Intro.");
    expect(prefixOf("Inline <b>unclosed tag")).toBe("");
  });

  it("does not take a cut inside a fence that a later failure retreats to", () => {
    // The content fails to parse at the open Callout; retreating to the blank
    // line inside the (terminated) fence must not split the fence.
    const content = "```\na\n\nb\n```\n<Callout>\n\npartial";
    expect(prefixOf(content)).toBe("");
  });

  it("splits import and export blocks as whole statements", () => {
    const content = [
      'import { useState } from "react";',
      "",
      "export function Stepper() {",
      "  const [i, setI] = useState(0);",
      "",
      "  return <button onClick={() => setI(i + 1)}>{i}</button>;",
      "}",
      "",
      "<Stepper />",
    ].join("\n");
    expect(prefixOf(content)).toBe(content.slice(0, content.indexOf("\n\n<Stepper />")));
    // A statement still being written stays out, even past a blank line.
    expect(
      prefixOf('import { useState } from "react";\n\nexport function Stepper() {\n  const a = 1;\n\n'),
    ).toBe('import { useState } from "react";');
  });

  it("keeps a list open until a sibling block begins", () => {
    expect(prefixOf("Intro.\n\n- one\n\n- two\n\n")).toBe("Intro.");
    expect(prefixOf("Intro.\n\n- one\n\n- two\n\nAfter")).toBe(
      "Intro.\n\n- one\n\n- two",
    );
  });
});
