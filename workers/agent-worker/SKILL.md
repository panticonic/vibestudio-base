---
name: chat-agent-worker
description: Develop the default AiChatWorker product adapter, including participant identity, prompt-resource composition, channel feature bindings, and standard or panel-debug tool selection.
---

# Chat agent worker

`workers/agent-worker` is a thin product adapter for the default chat agent.
Core execution, trajectory folding, model effects, failure envelopes, and
subagent supervision belong in `packages/agentic-do`. Pure subscription and
client types belong in `packages/agentic-core`.

Read [agentic development](../../skills/agentic-development/SKILL.md) for
changes that span the agentic stack, and [Agentic DO](../../packages/agentic-do/SKILL.md)
before changing runtime mechanics.

## Invariants

- `AiChatWorker` is a per-channel Durable Object participant. Its handle,
  participant metadata, respond policy, and advertised methods must match the
  subscription configuration and the channel contract.
- Normal prompt composition loads `meta/AGENTS.md` and the live workspace skill
  index. A subscription with `systemPromptMode: "replace"` supplies the whole
  prompt and loads neither. Do not add another prompt-loading path.
- If the channel configures no tools, the agent gets the standard tool set. An
  explicit tool configuration is the complete list: resolve declared resource
  bindings, reject unknown or duplicate tools, and never add other tools
  silently.
- Panel-debug tools act only on their bound panel-slot resource. Having the tool
  does not grant the underlying host capability.
- Keep the requested capabilities and service protocols in `package.json`
  accurate. Add a new tool or service call and its capability declaration in the
  same change.

## Self-modification and verification

The running worker cannot replace its own loaded image or prompt resources. To
verify a change:

1. Run the focused worker and authority-manifest tests, and build against the
   current context.
2. Launch a uniquely named canary agent in the same context through
   [agents](../../skills/agents/SKILL.md).
3. Give it a bounded task that exercises the changed prompt or tool behavior.
4. From the parent, inspect its stored trajectory and invocation failures.
5. Unsubscribe and retire the canary.

Do not reuse the parent agent's key, and do not claim that the current turn is
running the new implementation.
