import { createMainRpcCaller } from "@vibestudio/service-schemas/mainRpc";
/**
 * Resource loader — fetches the system prompt and skill index from the
 * Vibestudio workspace via RPC.
 *
 * Native channel preparation uses this to inject `AGENTS.md` content and
 * a formatted skill index into the agent's system prompt. The skill index
 * is markdown that the LLM can read; actual skill files are read on demand
 * by the read tool from the per-context folder.
 *
 * Contract: `workspace.getAgentResources.workspacePrompt` returns the workspace AGENTS.md
 * as a string; `workspace.getAgentResources.skills` returns an array of `SkillEntry`
 * descriptors (one per repo-embedded SKILL.md).
 */
import type { RpcCaller } from "@vibestudio/rpc";

export type { RpcCaller } from "@vibestudio/rpc";

export interface SkillEntry {
  /** Skill identifier from frontmatter, falling back to the containing repo name. */
  name: string;
  /** Short human-readable description shown in the skill index. */
  description: string;
  /** Workspace-relative repo path containing the skill. */
  dirPath: string;
  /** Workspace-relative path to the SKILL.md file. */
  skillPath: string;
}
export interface VibestudioResources {
  /** Contents of `workspace/meta/AGENTS.md`. */
  systemPrompt: string;
  /** Markdown-formatted skill index suitable for appending to the system prompt. */
  skillIndex: string;
  /** Raw skill descriptors. */
  skills: SkillEntry[];
}
export interface ResourceLoaderDeps {
  rpc: RpcCaller;
  signal?: AbortSignal;
}
/**
 * Captures the workspace system prompt and skill list from one semantic snapshot and
 * returns a `VibestudioResources` bundle for native channel prompt preparation.
 */
export async function loadVibestudioResources(
  deps: ResourceLoaderDeps,
): Promise<VibestudioResources> {
  deps.signal?.throwIfAborted();
  const resources = await createMainRpcCaller(deps.rpc)(
    "workspace.getAgentResources",
    [],
    deps.signal ? { signal: deps.signal } : undefined,
  );
  deps.signal?.throwIfAborted();
  return {
    systemPrompt: resources.workspacePrompt,
    skills: resources.skills,
    skillIndex: formatSkillIndex(resources.skills),
  };
}
/**
 * Renders the skill index as a markdown section. Returns an empty string
 * when there are no skills (so the caller can simply concatenate it with
 * the system prompt without conditional logic).
 */
export function formatSkillIndex(skills: SkillEntry[]): string {
  if (skills.length === 0) return "";
  const lines: string[] = ["", "## Available skills", ""];
  for (const s of skills) {
    lines.push(`- **${s.name}** (${s.dirPath}) \u2014 ${s.description}`);
  }
  lines.push("");
  lines.push(
    'Use the read tool to load a skill: `read("<dirPath>/SKILL.md")` using the path shown next to each skill.',
  );
  lines.push(
    "Before acting, read every skill whose description clearly matches the task. A broad neighboring skill does not replace a more specific matching skill; when several match, use all of them.",
  );
  lines.push(
    "(Skill files are available in the per-context folder under their repo paths.)",
  );
  lines.push("");
  lines.push(
    "To discover callable services and runtime APIs with typed schemas and access rules, use the `docs_search` and `docs_open` tools (results are filtered to what you can call).",
  );
  return lines.join("\n");
}
