import type { AgentState, EffectOutcome } from "@workspace/agent-loop";

/** Host-configured inference fixture. It emits model output only: the ordinary
 * agent loop still executes tools, enforces authority, and records outcomes. */
export interface ModelScript {
  rules: Array<{
    match: string;
    steps: Array<{ tool: string; arguments: Record<string, unknown> }>;
    reply: string;
  }>;
}

export function scriptedModelOutcome(
  script: ModelScript,
  request: string,
  state: AgentState,
  availableTools: ReadonlySet<string>
): EffectOutcome | null {
  for (const [ruleIndex, rule] of script.rules.entries()) {
    const match = new RegExp(rule.match, "su").exec(request);
    if (!match) continue;
    const substitute = (text: string) => text.replace(/\{\{(\w+)\}\}/gu, (_, name: string) => {
      const value = match.groups?.[name];
      if (value === undefined) throw new Error(`Model script has no capture ${name}`);
      return value;
    });
    const interpolate = (value: unknown): unknown => {
      if (typeof value === "string") return substitute(value);
      if (Array.isArray(value)) return value.map(interpolate);
      if (value && typeof value === "object") return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, interpolate(item)])
      );
      return value;
    };
    const start = state.openTurn?.openedAtSeq ?? 0;
    for (const [stepIndex, step] of rule.steps.entries()) {
      const id = `model-fixture:${start}:${ruleIndex}:${stepIndex}`;
      const result = state.entries.find(entry => entry.kind === "tool-result" &&
        entry.seq >= start && entry.invocationId === id);
      if (result?.kind === "tool-result") {
        if (result.isError) throw new Error(`Scripted model tool failed: ${step.tool} (${id})`);
        continue;
      }
      if (!availableTools.has(step.tool)) throw new Error(`Scripted model tool unavailable: ${step.tool}`);
      return {
        kind: "model",
        blocks: [{ type: "toolCall", id, name: step.tool, arguments: interpolate(step.arguments) as Record<string, unknown> }],
        stopReason: "completed", outcome: "tool_calls_only",
        usage: { inputTokens: 1, outputTokens: 1 },
      };
    }
    return {
      kind: "model", blocks: [{ type: "text", content: substitute(rule.reply) }],
      stopReason: "completed", outcome: "completed",
      usage: { inputTokens: 1, outputTokens: 1 },
    };
  }
  return null;
}
