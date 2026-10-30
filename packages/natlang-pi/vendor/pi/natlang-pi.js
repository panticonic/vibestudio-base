// src/native/native-protocol.ts
var keys = [
  "schema",
  "code",
  "message",
  "trigger",
  "sample_index",
  "fed",
  "own_input_count",
  "generated_input_count",
  "max_tokens",
  "stop_token_ids"
].sort();

// src/model/decision-scoring.ts
function softmax(logProbs) {
  const max = Math.max(...logProbs);
  const weights = logProbs.map((value) => Math.exp(value - max));
  const total = weights.reduce((sum, value) => sum + value, 0);
  return weights.map((value) => value / total);
}
function promptLogprobRequest(messages, reply, extra = {}) {
  return {
    ...extra,
    messages: [...messages, { role: "assistant", content: reply }],
    add_generation_prompt: false,
    continue_final_message: false,
    prompt_logprobs: 0,
    max_tokens: 1
  };
}
function scoresFromPromptLogprobs(responses) {
  const sequences = responses.map((body) => {
    const rows = body.prompt_logprobs;
    if (!Array.isArray(rows)) throw new Error("decision-unsupported: the server returned no prompt_logprobs");
    const promptTokens2 = body.usage?.prompt_tokens;
    const tokens = rows.map((row) => {
      if (!row || typeof row !== "object") return null;
      const [id, entry] = Object.entries(row)[0] ?? [];
      return id === void 0 || typeof entry?.logprob !== "number" ? null : { id, logprob: entry.logprob };
    });
    return { tokens, promptTokens: typeof promptTokens2 === "number" ? promptTokens2 : void 0 };
  });
  const rowsOf = sequences.map((item) => item.tokens);
  const promptTokens = sequences.every((item) => item.promptTokens !== void 0) ? sequences.reduce((sum, item) => sum + item.promptTokens, 0) : void 0;
  let shared = 0;
  const shortest = Math.min(...rowsOf.map((sequence) => sequence.length));
  while (shared < shortest && rowsOf.every((sequence) => sequence[shared]?.id === rowsOf[0][shared]?.id)) shared++;
  if (responses.length === 1) shared = 0;
  return {
    log_probs: rowsOf.map((sequence) => sequence.slice(shared).reduce((sum, row) => sum + (row?.logprob ?? 0), 0)),
    tokens: rowsOf.map((sequence) => sequence.length - shared),
    ...promptTokens !== void 0 ? { prompt_tokens: promptTokens } : {}
  };
}
function batchScoreItem(item, extra) {
  return {
    ...extra,
    messages: item.messages,
    continuations: item.options,
    ...item.adapters?.length ? { adapters: item.adapters } : {},
    ...item.native_state_modes ? { native_state_modes: item.native_state_modes } : {},
    ...item.native_recording ? { native_recording: true } : {}
  };
}
function scoresFromBatchResult(result, replyCount) {
  if (!result || typeof result.error === "string" || !Array.isArray(result.log_probs) || result.log_probs.length !== replyCount)
    throw new Error(result?.error ?? "batched scoring returned no scores for an item");
  return {
    log_probs: result.log_probs,
    ...result.tokens ? { tokens: result.tokens } : {},
    ...Number.isSafeInteger(result.prompt_tokens) ? { prompt_tokens: result.prompt_tokens } : {},
    ...result.native_decision_capture ? { native_decision_capture: result.native_decision_capture } : {}
  };
}

// src/model/chat-completion.ts
function publicSchema(value) {
  if (Array.isArray(value)) return value.map(publicSchema);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([key]) => !key.startsWith("x-natlang") && key !== "x-optional").map(([key, item]) => [key, publicSchema(item)]));
  return value;
}
function modelTools(rawTools) {
  return rawTools.map((raw, index) => {
    const tool = raw;
    if (tool?.type !== "function" || typeof tool.function?.name !== "string") throw new TypeError(`model tool ${index} is invalid`);
    return publicSchema(tool);
  });
}

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
function piAssistantToTurn(reply, provider) {
  if (reply.stopReason === "error" || reply.stopReason === "aborted")
    throw new Error(reply.errorMessage ?? `provider ${provider} failed`);
  const { calls, text, reasoning, rawCalls } = piAssistantContent(reply);
  return {
    calls: calls.map((call) => [call.name, call.arguments]),
    raw_calls: rawCalls,
    text,
    ...reasoning ? { reasoning } : {},
    prompt_tokens: reply.usage.input,
    completion_tokens: reply.usage.output,
    ...reply.stopReason === "length" ? { truncated: true } : {},
    raw_response: { stop_reason: reply.stopReason, usage: reply.usage }
  };
}
export {
  batchScoreItem,
  emptyPiUsage,
  piAssistantContent,
  piAssistantToTurn,
  piDeltaTranslator,
  piToolChoiceOptions,
  promptLogprobRequest,
  scoresFromBatchResult,
  scoresFromPromptLogprobs,
  softmax,
  toPiContext
};
