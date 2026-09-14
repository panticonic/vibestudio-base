import * as fs from "node:fs";
import * as path from "node:path";

/**
 * The workspace a check sees, composed from the templates under test.
 *
 * Templates are independent repositories, so a unit a cross-cutting contract
 * covers -- `apps/shell`, `about/templates`, `skills/appdev` -- may or may not
 * be present depending on which templates were composed. Reading a sibling path
 * out of this repository stopped being the same question as reading it out of
 * the workspace, and these contracts are about the workspace.
 *
 * Falls back to this checkout so a check still works when it is run directly.
 */
export function composedWorkspaceRoot(fallback: string): string {
  const configured = process.env["VIBESTUDIO_USERLAND_ROOT"]?.trim();
  return configured && fs.existsSync(configured) ? configured : fallback;
}

/** A path inside the composed workspace, or null when nothing composed it. */
export function composedWorkspacePath(
  workspaceRoot: string,
  ...segments: string[]
): string | null {
  const target = path.join(workspaceRoot, ...segments);
  return fs.existsSync(target) ? target : null;
}
