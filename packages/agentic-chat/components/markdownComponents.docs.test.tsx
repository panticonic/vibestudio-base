// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import * as runtime from "react/jsx-runtime";
import type { ComponentType } from "react";
import {
  ResponseActionsProvider,
  responseComponents,
} from "@workspace/ui/response";
import { mdxComponents } from "./markdownComponents";

/**
 * Every ```mdx example in the model-facing docs must render as written:
 * models copy these blocks, so an example that throws or trips a catalog
 * ProblemNotice teaches the wrong thing. Examples are rendered in jsdom with
 * the real MDX registry; map tiles and images are network resources that jsdom
 * does not fetch, but the components render their offline/placeholder frames
 * without them, so no block is skipped.
 */
const DOCS = [
  "../../../skills/visualize/SKILL.md",
  "../../../skills/visualize/COMPONENTS.md",
  "../../../skills/sandbox/MDX.md",
] as const;

function mdxBlocks(markdown: string): string[] {
  return [...markdown.matchAll(/^```mdx[^\n]*\n([\s\S]*?)^```/gm)].map(
    (match) => match[1]!,
  );
}

const catalogTags = Object.keys(responseComponents);
const catalogTagRe = new RegExp(`<(${catalogTags.join("|")})[\\s/>]`, "g");

describe("documented MDX examples", () => {
  for (const doc of DOCS) {
    const markdown = readFileSync(
      fileURLToPath(new URL(doc, import.meta.url)),
      "utf8",
    );
    const blocks = mdxBlocks(markdown);
    const name = doc.split("/").slice(-2).join("/");

    it(`${name} documents at least one mdx example`, () => {
      expect(blocks.length).toBeGreaterThan(0);
    });

    blocks.forEach((block, index) => {
      it(`${name} mdx block ${index + 1} renders without problems`, async () => {
        const { evaluate } = await import("@mdx-js/mdx");
        const { default: Content } = await evaluate(block, {
          ...runtime,
          development: false,
          useMDXComponents: (() => mdxComponents) as never,
        });
        const Mdx = Content as ComponentType;
        const view = render(
          <ResponseActionsProvider send={async () => undefined}>
            <Mdx />
          </ResponseActionsProvider>,
        );
        const problems = [...view.container.querySelectorAll(".vs-r-problem")]
          .map((node) => node.textContent)
          .join(" | ");
        expect(problems).toBe("");
        const used = [...block.matchAll(catalogTagRe)].length;
        if (used > 0) {
          expect(
            view.container.querySelectorAll(".vs-r-frame, .vs-r-action").length,
            "catalog components rendered",
          ).toBeGreaterThanOrEqual(used);
        }
        view.unmount();
      });
    });
  }
});
