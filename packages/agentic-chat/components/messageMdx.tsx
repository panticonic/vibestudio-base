import type { ReactNode } from "react";
import remarkGfm from "remark-gfm";
import type { SandboxImportLoader } from "@workspace/eval";
import { mdxComponents } from "./markdownComponents";
import type { MdxBlockParser } from "./streamingMdx";

const remarkPlugins = [remarkGfm];

export type RehypeHighlightPlugin = typeof import("rehype-highlight").default;
let rehypeHighlightPlugin: RehypeHighlightPlugin | null = null;
let rehypeHighlightPromise: Promise<RehypeHighlightPlugin> | null = null;

/** The syntax highlighter once loaded, so renders can use it synchronously. */
export function loadedRehypeHighlight(): RehypeHighlightPlugin | null {
  return rehypeHighlightPlugin;
}

export function getRehypeHighlight(): Promise<RehypeHighlightPlugin> {
  if (rehypeHighlightPlugin) return Promise.resolve(rehypeHighlightPlugin);
  if (!rehypeHighlightPromise) {
    rehypeHighlightPromise = import("rehype-highlight").then((module) => {
      rehypeHighlightPlugin = module.default;
      return rehypeHighlightPlugin;
    });
  }
  return rehypeHighlightPromise;
}

let mdxParser: MdxBlockParser | null = null;
let mdxParserPromise: Promise<MdxBlockParser> | null = null;

/** The message MDX parser once loaded, so renders can split synchronously. */
export function loadedMdxParser(): MdxBlockParser | null {
  return mdxParser;
}

/**
 * The parser `compileMessageMdx` compiles with (remark-mdx + GFM), so block
 * boundaries found while streaming are the blocks the compiler sees.
 */
export function getMdxParser(): Promise<MdxBlockParser> {
  if (mdxParser) return Promise.resolve(mdxParser);
  if (!mdxParserPromise) {
    mdxParserPromise = import("@mdx-js/mdx").then(({ createProcessor }) => {
      const processor = createProcessor({ remarkPlugins });
      mdxParser = (source) => processor.parse(source);
      return mdxParser;
    });
  }
  return mdxParserPromise;
}

/** Fenced or indented code blocks, which get syntax highlighting. */
export const BLOCK_CODE_RE = /(?:^|\n)[ \t]*(?:```|~~~)|(?:^|\n)(?: {4}|\t)\S/m;

export interface CompileMessageMdxOptions {
  /**
   * The panel's import loader (`ChatContextValue.importLoader`), the same one
   * inline UI compiles with. Without it only modules already in the panel's
   * module map resolve.
   */
  loadImport?: SandboxImportLoader;
}

// MDX's compiled `MDXContent`: without a provider import source it calls no
// hooks, so it may be invoked as a plain function.
type MdxContent = (props: { components?: Record<string, unknown> }) => ReactNode;

/**
 * A compiled message: a hook-free render function, usable as a component.
 * A renderer may call it inline under one stable component so that successive
 * compiles of a growing message reconcile into the same React tree: blocks
 * whose elements keep their type and position keep their state.
 */
export type MessageMdx = () => ReactNode;

/**
 * Compile an agent-authored MDX message into a renderable component.
 *
 * The message becomes an ES module (`import`/`export` statements included)
 * and loads through the sandbox module pipeline that compiles inline UI, so
 * its imports resolve exactly as an inline_ui component's do and an
 * unresolvable import fails compilation. Catalog and Radix tags used without
 * an import resolve through the MDX component registry. Throws on any compile
 * or module-loading failure.
 */
export async function compileMessageMdx(
  content: string,
  options: CompileMessageMdxOptions = {},
): Promise<MessageMdx> {
  const [{ compile }, highlight] = await Promise.all([
    import("@mdx-js/mdx"),
    BLOCK_CODE_RE.test(content) ? getRehypeHighlight() : null,
  ]);
  const program = await compile(content, {
    jsxRuntime: "automatic",
    outputFormat: "program",
    development: false,
    remarkPlugins,
    rehypePlugins: highlight ? [[highlight, { ignoreMissing: true }]] : [],
  });
  const { compileComponent } = await import("@workspace/eval/sandbox");
  const result = await compileComponent<MdxContent>(String(program), {
    syntax: "javascript",
    loadImport: options.loadImport,
  });
  if (!result.success) {
    const error = new Error(result.error ?? "MDX module failed to load");
    if (result.errorStack) error.stack = result.errorStack;
    throw error;
  }
  const Content = result.Component!;
  return function MessageMdx() {
    return Content({ components: mdxComponents });
  };
}
