import type { SandboxImportLoader } from "@workspace/eval/sandbox";

export type ComponentSourceValidation =
  | { ok: true }
  | { ok: false; error: string; errorKind?: string; code?: string; errorData?: unknown };

/**
 * Compile a component source exactly as the panel renders it (`compileComponent`
 * with the same source path, imports, and loaders), so a method can reject
 * unusable source before any UI event is published. Render-time and props
 * failures are not covered here; they stay on the ui.feedback path.
 */
export async function validateComponentSource(
  source: { code: string; path?: string },
  options: {
    imports?: Record<string, string>;
    loadSourceFile: (path: string) => Promise<string>;
    loadImport?: SandboxImportLoader;
  },
): Promise<ComponentSourceValidation> {
  const { compileComponent } = await import("@workspace/eval/sandbox");
  const result = await compileComponent(source.code, {
    imports: options.imports,
    sourcePath: source.path,
    loadSourceFile: options.loadSourceFile,
    loadImport: options.loadImport,
  });
  if (result.success) return { ok: true };
  return {
    ok: false,
    error: result.error ?? "Component failed to compile",
    ...(result.errorKind ? { errorKind: result.errorKind } : {}),
    ...(result.code ? { code: result.code } : {}),
    ...(result.errorData === undefined ? {} : { errorData: result.errorData }),
  };
}
