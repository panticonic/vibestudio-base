/**
 * Tool name display helpers.
 *
 * Kept separate from heavier schema modules so lightweight consumers (chat UI)
 * can import name utilities cheaply.
 */

/**
 * Convert a tool name to its display form.
 *
 * Examples:
 * - "mcp__workspace__ListDirectory" -> "ListDirectory"
 * - "file_read" -> "FileRead"
 * - "ListDirectory" -> "ListDirectory"
 */
export function prettifyToolName(toolName: string): string {
  let name = toolName;

  // Strip MCP prefix: mcp__<server>__<name> -> <name>
  // Uses split("__") so server names with underscores (e.g. "my_server") are handled.
  if (name.startsWith("mcp__")) {
    const parts = name.split("__");
    if (parts.length >= 3) {
      name = parts.slice(2).join("__");
    }
  }

  // Already PascalCase: return as-is
  if (/^[A-Z][a-zA-Z]+$/.test(name)) {
    return name;
  }

  // Convert snake_case to PascalCase
  return name
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");
}
