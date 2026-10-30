import type { Context as ModelContext, Message } from "@panticonic/pi-ai";

/**
 * A scored decision as the local-models extension takes it (`scoreContinuations`):
 * Pi's context as the OpenAI chat messages the model server renders, and the
 * finite replies as the continuations to score. The scoring itself (the request
 * to the server, the log-probability arithmetic) is the extension's, over
 * natlang's own serving code; this is only the shape change.
 */
export function scoreItem(context: ModelContext, candidates: readonly string[]) {
  return { messages: openAIChatMessages(context), continuations: [...candidates] };
}

type OpenAIMessage = Record<string, unknown>;

/** Pi's context as the OpenAI chat messages a llama.cpp-style server renders. */
export function openAIChatMessages(context: ModelContext): OpenAIMessage[] {
  if (context.tools?.length)
    throw new Error("A scored decision carries no tool declarations");
  const out: OpenAIMessage[] = [];
  if (context.systemPrompt)
    out.push({ role: "system", content: context.systemPrompt });
  for (const message of context.messages as Message[]) {
    if (message.role === "user") {
      out.push({ role: "user", content: textOf(message.content) });
    } else if (message.role === "assistant") {
      const calls = message.content.filter((block) => block.type === "toolCall");
      out.push({
        role: "assistant",
        content: textOf(message.content),
        ...(calls.length
          ? {
              tool_calls: calls.map((call) => ({
                id: call.id,
                type: "function",
                function: {
                  name: call.name,
                  arguments: JSON.stringify(call.arguments),
                },
              })),
            }
          : {}),
      });
    } else if (message.role === "toolResult") {
      out.push({
        role: "tool",
        tool_call_id: message.toolCallId,
        content: textOf(message.content),
      });
    } else {
      throw new Error(`A scored decision cannot carry a ${String(message.role)} message`);
    }
  }
  return out;
}

function textOf(
  content: string | readonly { readonly type: string; readonly text?: string }[],
): string {
  if (typeof content === "string") return content;
  if (content.some((block) => block.type === "image"))
    throw new Error("A scored decision carries text only");
  return content
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("");
}
