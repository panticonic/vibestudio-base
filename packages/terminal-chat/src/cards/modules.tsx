/**
 * What agent-authored card code runs against in the terminal: the modules it
 * may import, and how an MDX message or an inline UI source becomes a
 * component. Card code is compiled and run in this process, as it is in the
 * panel's realm: there is no isolation boundary, by decision.
 */
import * as React from "react";
import * as ink from "ink";
import * as ui from "@workspace/terminal-ui";
import type { ComponentType } from "react";
import type { SandboxImportLoader } from "@workspace/eval";

/**
 * The vocabulary under every name agent code reaches for it by: the browser's
 * module names resolve to the terminal kit, so a card written for the panel
 * draws here where the terminal can draw it, and `@workspace/runtime` is this
 * terminal's own workspace runtime. `ink` and `@workspace/terminal-ui` are
 * here too, for cards meant only for the terminal.
 */
export function cardModules(runtimeModule: Record<string, unknown>): Record<string, unknown> {
  return {
    // HTML elements written for the browser map to the kit (see hostJsxRuntime).
    react: { ...ui.hostReact, default: ui.hostReact },
    "react/jsx-runtime": ui.hostJsxRuntime,
    "react/jsx-dev-runtime": ui.hostJsxRuntime,
    ink,
    "@workspace/terminal-ui": ui,
    "@radix-ui/themes": ui.kit,
    "@workspace/react": ui.kit,
    "@workspace/ui": ui.kit,
    "@workspace/ui/response": ui.kit,
    "@radix-ui/react-icons": ui.iconsModule,
    "@workspace/runtime": runtimeModule,
  };
}

/** Tags an MDX message may use without importing them. */
export const registeredMdxComponents = new Set(
  Object.keys(ui.mdxComponents).filter((name) => /^[A-Z]/.test(name))
);

/** An inline UI's source, as the `ui.inline_rendered` event carries it. */
export type InlineSource = { type: "code"; code: string } | { type: "file"; path: string };

export interface CardCompilerPorts {
  modules: Record<string, unknown>;
  /** A context-relative file, for `path` sources and their relative imports. */
  loadSourceFile(path: string): Promise<string>;
  /** On-demand package builds, as the panel's `imports`. */
  loadImport: SandboxImportLoader;
}

export interface CardCompiler {
  /** An MDX message as a component; throws on any compile or import failure. */
  mdx(content: string): Promise<ComponentType>;
  /** An inline UI source as a component taking `{ props, chat, scope, … }`. */
  inline(
    source: InlineSource,
    imports?: Record<string, string>
  ): Promise<ComponentType<Record<string, unknown>>>;
}

type MdxContent = (props: { components?: Record<string, unknown> }) => React.ReactNode;

export function createCardCompiler(ports: CardCompilerPorts): CardCompiler {
  const sandbox = () => import("@workspace/eval/sandbox");
  return {
    async mdx(content) {
      const [{ compile }, { default: remarkGfm }, { compileComponent }] = await Promise.all([
        import("@mdx-js/mdx"),
        import("remark-gfm"),
        sandbox(),
      ]);
      const program = await compile(content, {
        jsxRuntime: "automatic",
        outputFormat: "program",
        development: false,
        remarkPlugins: [remarkGfm],
      });
      const result = await compileComponent<MdxContent>(String(program), {
        syntax: "javascript",
        moduleMap: { ...ports.modules },
        loadImport: ports.loadImport,
      });
      if (!result.success) throw compileError(result.error);
      const Content = result.Component!;
      return function MessageCard() {
        return <ui.Blocks>{Content({ components: ui.mdxComponents })}</ui.Blocks>;
      };
    },
    async inline(source, imports) {
      const { compileComponent } = await sandbox();
      const code = source.type === "file" ? await ports.loadSourceFile(source.path) : source.code;
      const result = await compileComponent<ComponentType<Record<string, unknown>>>(code, {
        moduleMap: { ...ports.modules },
        loadImport: ports.loadImport,
        loadSourceFile: ports.loadSourceFile,
        ...(source.type === "file" ? { sourcePath: source.path } : {}),
        ...(imports ? { imports } : {}),
      });
      if (!result.success) throw compileError(result.error);
      return result.Component!;
    },
  };
}

function compileError(error: { message?: string } | undefined): Error {
  return new Error(error?.message ?? "The card failed to compile.");
}
