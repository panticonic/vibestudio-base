import {
  modelTools
} from "./chunk-chunk-Y6L7V2T3.js";

// src/package/directories.ts
import { homedir, platform } from "node:os";
import { join, resolve } from "node:path";
function defaultNatlangDataDirectory(environment = process.env) {
  if (environment.NATLANG_HOME) return resolve(environment.NATLANG_HOME);
  if (platform() === "win32") return join(environment.LOCALAPPDATA ?? homedir(), "natlang");
  if (platform() === "darwin") return join(homedir(), "Library", "Application Support", "natlang");
  return join(environment.XDG_DATA_HOME ?? join(homedir(), ".local", "share"), "natlang");
}
function defaultNatlangConfigDirectory(environment = process.env) {
  if (environment.NATLANG_CONFIG_HOME) return resolve(environment.NATLANG_CONFIG_HOME);
  if (platform() === "win32") return join(environment.APPDATA ?? homedir(), "natlang");
  if (platform() === "darwin") return join(homedir(), "Library", "Application Support", "natlang");
  return join(environment.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "natlang");
}
function defaultNatlangStateDirectory(environment = process.env) {
  if (environment.NATLANG_STATE_HOME) return resolve(environment.NATLANG_STATE_HOME);
  if (platform() === "win32") return join(environment.LOCALAPPDATA ?? homedir(), "natlang", "state");
  if (platform() === "darwin") return join(homedir(), "Library", "Application Support", "natlang", "state");
  return join(environment.XDG_STATE_HOME ?? join(homedir(), ".local", "state"), "natlang");
}
function defaultNatlangCacheDirectory(environment = process.env) {
  if (environment.NATLANG_CACHE_HOME) return resolve(environment.NATLANG_CACHE_HOME);
  if (platform() === "win32") return join(environment.LOCALAPPDATA ?? homedir(), "natlang", "cache");
  if (platform() === "darwin") return join(homedir(), "Library", "Caches", "natlang");
  return join(environment.XDG_CACHE_HOME ?? join(homedir(), ".cache"), "natlang");
}

// src/runtime/target-arguments.ts
import ts from "typescript";

// src/model/pi-translation.ts
var emptyPiUsage = Object.freeze({
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: Object.freeze({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 })
});
function toPiContext(request, model) {
  const messages = [];
  const names = /* @__PURE__ */ new Map();
  const hostGeneratedCalls = /* @__PURE__ */ new Set();
  const googleHistory = model.api === "google-generative-ai" || model.api === "google-vertex";
  for (const raw of request.messages) {
    const role = raw.role, content = String(raw.content ?? "");
    const timestamp = Date.now();
    if (role === "system") messages.push({ role, content, timestamp });
    else if (role === "user") messages.push({ role, content, timestamp });
    else if (role === "assistant") {
      const calls = raw.tool_calls ?? [];
      const hostGenerated = googleHistory && raw.natlang_host_generated === true;
      if (hostGenerated) {
        const notes = [];
        if (content) notes.push(content);
        const reasoning2 = raw.reasoning_content ?? raw.reasoning;
        if (typeof reasoning2 === "string" && reasoning2) notes.push(reasoning2);
        for (const call of calls) {
          names.set(call.id, call.function.name);
          hostGeneratedCalls.add(call.id);
          notes.push(`Host-provided operation ${call.function.name} arguments: ${call.function.arguments || "{}"}`);
        }
        if (notes.length) messages.push({ role: "user", content: notes.join("\n"), timestamp });
        continue;
      }
      const blocks = [];
      const reasoning = raw.reasoning_content ?? raw.reasoning;
      if (typeof reasoning === "string" && reasoning) blocks.push({ type: "thinking", thinking: reasoning });
      if (content) blocks.push({ type: "text", text: content });
      for (const call of calls) {
        names.set(call.id, call.function.name);
        blocks.push({
          type: "toolCall",
          id: call.id,
          name: call.function.name,
          arguments: JSON.parse(call.function.arguments || "{}"),
          ...typeof call.thought_signature === "string" ? { thoughtSignature: call.thought_signature } : {}
        });
      }
      messages.push({
        role,
        content: blocks,
        api: model.api,
        provider: model.provider,
        model: model.id,
        usage: emptyPiUsage,
        stopReason: calls.length ? "toolUse" : "stop",
        timestamp
      });
    } else if (role === "tool") {
      const callId = String(raw.tool_call_id);
      const toolName = names.get(callId) ?? "unknown";
      if (googleHistory && hostGeneratedCalls.has(callId))
        messages.push({ role: "user", content: `Host-provided result for ${toolName}: ${content}`, timestamp });
      else messages.push({
        role: "toolResult",
        toolCallId: callId,
        toolName,
        content: [{ type: "text", text: content }],
        isError: false,
        timestamp
      });
    }
  }
  const tools = modelTools(request.tools).map((tool) => ({
    name: tool.function.name,
    description: String(tool.function.description ?? ""),
    parameters: tool.function.parameters
  }));
  return { messages, tools };
}
function piToolChoiceOptions(api, request) {
  if (request.tool_choice !== "required") return {};
  if (["anthropic-messages", "bedrock-converse-stream", "google-generative-ai", "google-vertex"].includes(api))
    return { toolChoice: "any" };
  if ([
    "openai-completions",
    "openai-responses",
    "openai-codex-responses",
    "azure-openai-responses",
    "mistral-conversations",
    "pi-messages"
  ].includes(api)) return { toolChoice: "required" };
  return {};
}
function piDeltaTranslator() {
  const callOrder = /* @__PURE__ */ new Map();
  let thinkingParts = 0;
  return (event) => {
    let delta;
    if (event.type === "text_delta") delta = { type: "text", text: event.delta };
    else if (event.type === "thinking_start") delta = thinkingParts++ ? { type: "reasoning", text: "\n" } : void 0;
    else if (event.type === "thinking_delta") delta = { type: "reasoning", text: event.delta };
    else if (event.type === "toolcall_start") {
      const index = callOrder.size;
      callOrder.set(event.contentIndex, index);
      const block = event.partial?.content[event.contentIndex];
      const call = block?.type === "toolCall" ? block : void 0;
      return { type: "tool_call", index, ...call?.id ? { id: call.id } : {}, ...call?.name ? { name: call.name } : {} };
    } else if (event.type === "toolcall_delta" && callOrder.has(event.contentIndex))
      return { type: "tool_call", index: callOrder.get(event.contentIndex), arguments: event.delta };
    return delta && (delta.type !== "text" && delta.type !== "reasoning" || delta.text) ? delta : void 0;
  };
}
function piAssistantContent(reply) {
  const calls = reply.content.filter((block) => block.type === "toolCall");
  const text = reply.content.filter((block) => block.type === "text").map((block) => block.text).join("");
  const reasoning = reply.content.filter((block) => block.type === "thinking").map((block) => block.thinking).join("\n");
  const rawCalls = calls.map((call) => ({
    id: call.id,
    type: "function",
    function: {
      name: call.name,
      arguments: JSON.stringify(call.arguments)
    },
    ...typeof call.thoughtSignature === "string" ? { thought_signature: call.thoughtSignature } : {}
  }));
  return { calls, text, reasoning, rawCalls };
}
var piPromptTokens = (usage) => usage.input + (usage.cacheRead || 0) + (usage.cacheWrite || 0);
var piCacheReads = (usage) => usage.cacheRead || 0;
function piAssistantToTurn(reply, provider) {
  if (reply.stopReason === "error" || reply.stopReason === "aborted")
    throw new Error(reply.errorMessage ?? `provider ${provider} failed`);
  const { calls, text, reasoning, rawCalls } = piAssistantContent(reply);
  return {
    calls: calls.map((call) => [call.name, call.arguments]),
    raw_calls: rawCalls,
    text,
    // Pi's `input` counts only uncached prompt tokens; a turn's prompt_tokens is the whole prompt (as OpenAI and
    // llama.cpp report it), with the cache reads also given as cached_tokens.
    ...reasoning ? { reasoning } : {},
    prompt_tokens: piPromptTokens(reply.usage),
    completion_tokens: reply.usage.output,
    ...piCacheReads(reply.usage) ? { cached_tokens: piCacheReads(reply.usage) } : {},
    ...reply.stopReason === "length" ? { truncated: true } : {},
    raw_response: { stop_reason: reply.stopReason, usage: reply.usage }
  };
}

export {
  defaultNatlangDataDirectory,
  defaultNatlangConfigDirectory,
  defaultNatlangStateDirectory,
  defaultNatlangCacheDirectory,
  toPiContext,
  piToolChoiceOptions,
  piDeltaTranslator,
  piAssistantContent,
  piAssistantToTurn
};
