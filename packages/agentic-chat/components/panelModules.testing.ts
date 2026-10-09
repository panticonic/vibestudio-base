import * as React from "react";
import * as ReactJsxRuntime from "react/jsx-runtime";
import * as ReactJsxDevRuntime from "react/jsx-dev-runtime";
import * as RadixThemes from "@radix-ui/themes";
import * as RadixIcons from "@radix-ui/react-icons";
import * as WorkspaceReact from "@workspace/react";
import * as WorkspaceUi from "@workspace/ui";
import { compileMessageMdx } from "./messageMdx";

const SANDBOX_GLOBALS = [
  "__vibestudioModuleMap__",
  "__vibestudioRequire__",
  "__vibestudioPreloadModules__",
] as const;

/**
 * Install the chat panel's sandbox module registry in jsdom: the panel's
 * exposed modules that load outside a panel build, resolved through the same
 * globals the panel runtime publishes. Agent-authored UI code (inline UI, MDX
 * messages) compiles against it exactly as in the panel; any other specifier
 * fails as an unavailable module. Returns a function restoring the previous
 * globals.
 */
export function installPanelModules(): () => void {
  const globals = globalThis as Record<string, unknown>;
  const previous = SANDBOX_GLOBALS.map((name) => [name, globals[name]] as const);
  const moduleMap: Record<string, unknown> = {
    react: React,
    "react/jsx-runtime": ReactJsxRuntime,
    "react/jsx-dev-runtime": ReactJsxDevRuntime,
    "@radix-ui/themes": RadixThemes,
    "@radix-ui/react-icons": RadixIcons,
    "@workspace/react": WorkspaceReact,
    "@workspace/ui": WorkspaceUi,
  };
  const resolve = (id: string) => {
    if (Object.hasOwn(moduleMap, id)) return moduleMap[id];
    throw new Error(`Module not found: ${id}`);
  };
  globals["__vibestudioModuleMap__"] = moduleMap;
  globals["__vibestudioRequire__"] = resolve;
  globals["__vibestudioPreloadModules__"] = async (ids: string[]) => ids.map(resolve);
  return () => {
    for (const [name, value] of previous) {
      if (value === undefined) delete globals[name];
      else globals[name] = value;
    }
  };
}

/**
 * Compile one message so the MDX toolchain, the sandbox, and its transformer
 * are loaded before a test starts waiting on a render: under vitest the first
 * compile pays for transforming those lazily imported modules.
 */
export async function warmMessageMdx(): Promise<void> {
  const restore = installPanelModules();
  try {
    await compileMessageMdx("<Callout>warm</Callout>");
  } finally {
    restore();
  }
}
