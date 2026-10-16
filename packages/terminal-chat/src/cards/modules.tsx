/**
 * What agent-authored card code runs against in the terminal: the modules it
 * may import, and how an MDX message or an inline UI source becomes a
 * component. Card code is compiled and run in this process, as it is in the
 * panel's: there is no isolation boundary, by decision.
 */
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import * as ink from "ink";
import * as ui from "@workspace/terminal-ui";
import type { ComponentType } from "react";

/**
 * The vocabulary under every name agent code reaches for it by: the terminal
 * kit itself, and the browser's module names, which resolve to the same kit so
 * a card written for the panel draws here where the terminal can draw it.
 */
export const cardModules: Record<string, unknown> = {
  react: React,
  "react/jsx-runtime": jsxRuntime,
  "react/jsx-dev-runtime": jsxRuntime,
  ink,
  "@workspace/terminal-ui": ui,
  "@radix-ui/themes": ui.kit,
  "@workspace/react": ui.kit,
  "@workspace/ui": ui.kit,
  "@workspace/ui/response": ui.kit,
  "@radix-ui/react-icons": ui.iconsModule,
};

/** Tags an MDX message may use without importing them. */
export const registeredMdxComponents = new Set(
  Object.keys(ui.mdxComponents).filter((name) => /^[A-Z]/.test(name))
);

type MdxContent = (props: { components?: Record<string, unknown> }) => React.ReactNode;

/** An MDX message as a component; throws on any compile or import failure. */
export async function compileMdxCard(content: string): Promise<ComponentType> {
  const [{ compile }, { default: remarkGfm }, { compileComponent }] = await Promise.all([
    import("@mdx-js/mdx"),
    import("remark-gfm"),
    import("@workspace/eval/sandbox"),
  ]);
  const program = await compile(content, {
    jsxRuntime: "automatic",
    outputFormat: "program",
    development: false,
    remarkPlugins: [remarkGfm],
  });
  const result = await compileComponent<MdxContent>(String(program), {
    syntax: "javascript",
    moduleMap: { ...cardModules },
  });
  if (!result.success) throw compileError(result.error);
  const Content = result.Component!;
  return function MessageCard() {
    return <ui.Blocks>{Content({ components: ui.mdxComponents })}</ui.Blocks>;
  };
}

/** An inline UI source as a component taking `{ props, chat, scope, … }`. */
export async function compileInlineCard(
  source: string
): Promise<ComponentType<Record<string, unknown>>> {
  const { compileComponent } = await import("@workspace/eval/sandbox");
  const result = await compileComponent<ComponentType<Record<string, unknown>>>(source, {
    moduleMap: { ...cardModules },
  });
  if (!result.success) throw compileError(result.error);
  return result.Component!;
}

function compileError(error: { message?: string } | undefined): Error {
  return new Error(error?.message ?? "The card failed to compile.");
}
