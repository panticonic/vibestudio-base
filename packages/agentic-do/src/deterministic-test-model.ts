import {
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
  type AssistantMessage,
  type JsonObject,
  type Provider,
  type SimpleStreamOptions,
  type TranscriptContext,
} from "@panticonic/pi-ai";
import {
  TEST_MODEL_ID,
  TEST_MODEL_PROVIDER_ID,
  TEST_MODEL_SPEC,
} from "@workspace/model-catalog/catalog";

export interface DeterministicModelScript {
  readonly rules: readonly {
    readonly match: string;
    readonly steps: readonly {
      readonly tool: string;
      readonly arguments: JsonObject;
    }[];
    readonly reply: string;
  }[];
}

/** Validate host configuration before installing it as an inference provider. */
export function parseDeterministicModelScript(
  value: unknown,
): DeterministicModelScript {
  const parsed: unknown = typeof value === "string" ? JSON.parse(value) : value;
  if (!record(parsed) || !Array.isArray(parsed["rules"]))
    throw new Error("Test model script must contain a rules array");
  for (const rule of parsed["rules"]) {
    if (
      !record(rule) ||
      typeof rule["match"] !== "string" ||
      !Array.isArray(rule["steps"]) ||
      typeof rule["reply"] !== "string"
    )
      throw new Error("Test model script rules require match, steps, and reply");
    // Compile now so an invalid host-owned fixture fails during provider setup.
    new RegExp(rule["match"], "su");
    for (const step of rule["steps"]) {
      if (
        !record(step) ||
        typeof step["tool"] !== "string" ||
      !record(step["arguments"])
      )
        throw new Error("Test model script steps require a tool and arguments object");
    }
  }
  return parsed as unknown as DeterministicModelScript;
}

/**
 * Install a named, test-only Pi provider. It produces only model messages;
 * Pi still admits and executes tool calls through the normal durable owner.
 */
export function createDeterministicTestProvider(
  scriptValue?: unknown,
): Provider {
  const script =
    scriptValue === undefined
      ? undefined
      : parseDeterministicModelScript(scriptValue);
  const registration = newTestFauxProvider();
  const respond = (
    transcript: TranscriptContext,
    options?: SimpleStreamOptions,
  ): AssistantMessage => {
    const message = deterministicResponse(
      transcript,
      options?.sessionId ?? "unscoped",
      script,
    );
    return message;
  };
  const makeResponseProvider = () => {
    const provider = newTestFauxProvider();
    provider.setResponses([respond]);
    return provider.provider;
  };
  return {
    ...registration.provider,
    stream: (model, transcript, options) => {
      return makeResponseProvider().stream(model, transcript, options);
    },
    streamSimple: (model, transcript, options) => {
      return makeResponseProvider().streamSimple(model, transcript, options);
    },
  };
}

function newTestFauxProvider() {
  return fauxProvider({
    api: TEST_MODEL_SPEC.api,
    provider: TEST_MODEL_PROVIDER_ID,
    models: [
      {
        id: TEST_MODEL_ID,
        name: TEST_MODEL_SPEC.name,
        reasoning: TEST_MODEL_SPEC.reasoning,
        input: [...TEST_MODEL_SPEC.input],
        cost: { ...TEST_MODEL_SPEC.cost },
        contextWindow: TEST_MODEL_SPEC.contextWindow,
        maxTokens: TEST_MODEL_SPEC.maxTokens,
      },
    ],
  });
}

function deterministicResponse(
  transcript: TranscriptContext,
  sessionId: string,
  script: DeterministicModelScript | undefined,
): AssistantMessage {
  const messages = transcript.messages;
  const user = [...messages].reverse().find((message) => message.role === "user");
  const request = user ? messageText(user.content) : "";
  const turnKey = `${TEST_MODEL_PROVIDER_ID}:${sessionId}:${user?.timestamp ?? 0}`;
  const tools = availableTools(messages);

  if (script) {
    for (const [ruleIndex, rule] of script.rules.entries()) {
      const match = new RegExp(rule.match, "su").exec(request);
      if (!match) continue;
      for (const [stepIndex, step] of rule.steps.entries()) {
        const id = `${turnKey}:rule:${ruleIndex}:step:${stepIndex}`;
        const result = messages.find(
          (message) => message.role === "toolResult" && message.toolCallId === id,
        );
        if (result?.role === "toolResult") {
          if (result.isError)
            throw new Error(`Test model tool failed: ${step.tool} (${id})`);
          continue;
        }
        if (!tools.has(step.tool))
          throw new Error(`Test model tool unavailable: ${step.tool}`);
        return fauxAssistantMessage(
          fauxToolCall(step.tool, interpolate(step.arguments, match), { id }),
          { stopReason: "toolUse" },
        );
      }
      return fauxAssistantMessage(interpolateText(rule.reply, match));
    }
  }

  const systemPrompt = messages
    .filter((message) => message.role === "system")
    .map((message) => {
      const content =
        typeof message.content === "string"
          ? message.content
          : message.content.map((block) => block.text).join("\n");
      return [content, ...Object.values(message.sections ?? {})]
        .filter((section): section is string => typeof section === "string")
        .join("\n");
    })
    .join("\n");
  const openingTurn = systemPrompt.match(
    /##\s+Opening turn\b([\s\S]*?)(?=\n##\s|$)/i,
  )?.[1];
  const requestedRead = openingTurn?.match(/\bread\s+`([^`]+)`/i)?.[1];
  const requestedInlineUi = openingTurn?.match(
    /\brender\s+`([^`]+)`\s+with\s+`inline_ui`\s+using\s+(?:the\s+)?stable\s+ID\s+`([^`]+)`/i,
  );
  const hasResult = (name: string, args: Record<string, string>) => {
    for (const message of messages) {
      if (message.role !== "assistant") continue;
      for (const block of message.content) {
        if (
          block.type !== "toolCall" ||
          !block.id.startsWith(`${turnKey}:`) ||
          block.name !== name ||
          !Object.entries(args).every(
            ([key, value]) => block.arguments[key] === value,
          )
        )
          continue;
        const result = messages.find(
          (entry) => entry.role === "toolResult" && entry.toolCallId === block.id,
        );
        if (!result) continue;
        if (result.role === "toolResult" && result.isError)
          throw new Error(`Test model tool failed: ${name} (${block.id})`);
        return true;
      }
    }
    return false;
  };
  if (requestedRead && tools.has("read") && !hasResult("read", { path: requestedRead }))
    return fauxAssistantMessage(
      fauxToolCall(
        "read",
        { path: requestedRead },
        { id: `${turnKey}:opening:read` },
      ),
      { stopReason: "toolUse" },
    );
  if (
    requestedInlineUi &&
    tools.has("inline_ui") &&
    (!requestedRead || hasResult("read", { path: requestedRead }))
  ) {
    const [, path, id] = requestedInlineUi;
    if (path && id && !hasResult("inline_ui", { path, id }))
      return fauxAssistantMessage(
        fauxToolCall(
          "inline_ui",
          { path, id, props: {} },
          { id: `${turnKey}:opening:inline-ui` },
        ),
        { stopReason: "toolUse" },
      );
  }
  return fauxAssistantMessage("E2E model response: initial agent turn completed.");
}

function availableTools(messages: TranscriptContext["messages"]): Set<string> {
  const names = new Set<string>();
  for (const message of messages) {
    if (message.role !== "system") continue;
    for (const tool of message.toolsAdded ?? []) names.add(tool.name);
    for (const removed of message.toolsRemoved ?? []) names.delete(removed.name);
  }
  return names;
}

function messageText(content: string | readonly { readonly type: string; readonly text?: string }[]) {
  return typeof content === "string"
    ? content
    : content
        .filter((block) => block.type === "text" && typeof block.text === "string")
        .map((block) => block.text)
        .join("\n");
}

function interpolateText(value: string, match: RegExpExecArray): string {
  return value.replace(/\{\{(\w+)\}\}/gu, (_whole, name: string) => {
    const captured = match.groups?.[name];
    if (captured === undefined)
      throw new Error(`Test model script has no capture ${name}`);
    return captured;
  });
}

function interpolate(
  value: unknown,
  match: RegExpExecArray,
): JsonObject {
  const visit = (item: unknown): unknown => {
    if (typeof item === "string") return interpolateText(item, match);
    if (Array.isArray(item)) return item.map(visit);
    if (record(item))
      return Object.fromEntries(
        Object.entries(item).map(([key, child]) => [key, visit(child)]),
      );
    return item;
  };
  const result = visit(value);
  if (!record(result)) throw new Error("Test model tool arguments must be an object");
  return result as JsonObject;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
