/**
 * Agents in the conversation and their settings, as the status line, pickers
 * and commands see them.
 */
import { isAgentParticipantType, type ChatMessage } from "@workspace/agentic-core";
import type { ChatParticipants } from "@workspace/agentic-core/chat-store";

export interface AgentInfo {
  id: string;
  name: string;
  handle: string | null;
  /** Live model display name the agent reports. */
  activeModel: string | null;
  /** Context window use, 0–100. */
  contextPercent: number | null;
  typing: boolean;
}

/** The agent's own settings (`getAgentSettings`), read tolerantly. */
export interface AgentSettings {
  model: string | null;
  thinkingLevel: string | null;
  fastMode: boolean | null;
  respondPolicy: string | null;
}

export function agentsIn(participants: ChatParticipants, selfId: string | null): AgentInfo[] {
  return Object.values(participants)
    .filter(
      (p) => p.id !== selfId && isAgentParticipantType(p.metadata?.type as string | undefined)
    )
    .map((p) => {
      const metadata = (p.metadata ?? {}) as Record<string, unknown>;
      const usage = metadata["contextUsage"] as { usagePercent?: unknown } | undefined;
      return {
        id: p.id,
        name: typeof metadata["name"] === "string" ? (metadata["name"] as string) : p.id,
        handle: typeof metadata["handle"] === "string" ? (metadata["handle"] as string) : null,
        activeModel:
          typeof metadata["activeModel"] === "string" ? (metadata["activeModel"] as string) : null,
        contextPercent:
          typeof usage?.usagePercent === "number" ? Math.round(usage.usagePercent) : null,
        typing: metadata["typing"] === true,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Unwrap either `{ model: "x" }` or `{ model: { value: "x" } }`. */
function settingValue(value: unknown): unknown {
  if (value && typeof value === "object" && "value" in (value as object))
    return (value as { value: unknown }).value;
  return value;
}

export function parseAgentSettings(raw: unknown): AgentSettings {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const model = settingValue(source["model"]);
  const thinking = settingValue(source["thinkingLevel"]);
  const fast = settingValue(source["fastMode"]);
  const respond = settingValue(source["respondPolicy"]);
  return {
    model: typeof model === "string" ? model : null,
    thinkingLevel: typeof thinking === "string" ? thinking : null,
    fastMode: typeof fast === "boolean" ? fast : null,
    respondPolicy: typeof respond === "string" ? respond : null,
  };
}

/** Agents currently working: open-turn typing rows plus the roster typing flag. */
export function busyAgentIds(
  messages: readonly ChatMessage[],
  agents: readonly AgentInfo[]
): string[] {
  const ids = new Set<string>();
  for (const message of messages) if (message.contentType === "typing") ids.add(message.senderId);
  for (const agent of agents) if (agent.typing) ids.add(agent.id);
  return [...ids];
}

/** Resolve `@handle`s in a draft to participant ids (every participant sharing a handle). */
export function mentionIds(
  text: string,
  participants: ChatParticipants,
  selfId: string | null
): string[] {
  const ids: string[] = [];
  for (const match of text.matchAll(/(^|[\s([{])@([A-Za-z0-9_.-]+)/g)) {
    const handle = match[2]!.toLowerCase();
    for (const p of Object.values(participants)) {
      if (p.id === selfId) continue;
      const own = (p.metadata as { handle?: unknown } | undefined)?.handle;
      if (typeof own === "string" && own.toLowerCase() === handle && !ids.includes(p.id))
        ids.push(p.id);
    }
  }
  return ids;
}

/** Mention candidates for `@query`: handle or name contains the query, at most 8. */
export function mentionCandidates(
  query: string,
  participants: ChatParticipants,
  selfId: string | null
): Array<{ id: string; handle: string; name: string }> {
  const q = query.toLowerCase();
  const seen = new Set<string>();
  const out: Array<{ id: string; handle: string; name: string }> = [];
  for (const p of Object.values(participants)) {
    if (p.id === selfId) continue;
    const metadata = (p.metadata ?? {}) as { handle?: unknown; name?: unknown };
    if (typeof metadata.handle !== "string" || seen.has(metadata.handle)) continue;
    const name = typeof metadata.name === "string" ? metadata.name : metadata.handle;
    if (q && !metadata.handle.toLowerCase().includes(q) && !name.toLowerCase().includes(q))
      continue;
    seen.add(metadata.handle);
    out.push({ id: p.id, handle: metadata.handle, name });
  }
  return out.sort((a, b) => a.handle.localeCompare(b.handle)).slice(0, 8);
}
