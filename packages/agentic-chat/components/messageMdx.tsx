import type { ComponentType } from "react";
import remarkGfm from "remark-gfm";
import type { SandboxImportLoader } from "@workspace/eval";
import { mdxComponents } from "./markdownComponents";

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

type MdxContent = ComponentType<{ components?: Record<string, unknown> }>;

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
): Promise<ComponentType> {
  const [{ compile }, highlight] = await Promise.all([
    import("@mdx-js/mdx"),
    BLOCK_CODE_RE.test(content) ? getRehypeHighlight() : null,
  ]);
  const program = await compile(content, {
    jsxRuntime: "automatic",
    outputFormat: "program",
    development: false,
    remarkPlugins: [remarkGfm],
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
    return <Content components={mdxComponents} />;
  };
}
