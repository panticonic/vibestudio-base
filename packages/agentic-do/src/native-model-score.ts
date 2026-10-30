import type { Context as ModelContext, Message } from "@panticonic/pi-ai";
import {
  batchScoreItem,
  promptLogprobRequest,
  scoresFromBatchResult,
  scoresFromPromptLogprobs,
  softmax,
  type PromptLogprobResponse,
} from "@workspace/natlang-pi";

/** Scores of finite replies, in candidate order. `probabilities` is the softmax of `logProbs`. */
export interface NativeDecisionScores {
  logProbs: number[];
  probabilities: number[];
  /** Tokens each reply spans after the prefix shared by all replies, when the backend reports them. */
  tokens?: number[];
  /** Prompt and completion tokens the scoring requests consumed. */
  usage: { input: number; output: number };
}

/** The backend cannot score replies. The message prefix is the code natlang's runtime falls back on. */
export class DecisionUnsupportedError extends Error {
  constructor(reason: string) {
    super(`decision-unsupported: ${reason}`);
    this.name = "DecisionUnsupportedError";
  }
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

/**
 * Score finite replies through the model server's own log-probabilities. The
 * requests and the arithmetic are natlang's (`@workspace/natlang-pi`, the code
 * its OpenAI-compatible driver scores with): where the server has the
 * explicit-batch endpoint it scores every reply from one prefill; a server
 * without it is asked per reply through `prompt_logprobs`. `fetcher` is the
 * invocation's protected, endpoint-bound fetch: it carries the credential or
 * loopback authorization, which this code never sees.
 */
export async function scoreReplies(input: {
  fetcher: typeof fetch;
  baseUrl: string;
  model: string;
  messages: OpenAIMessage[];
  candidates: readonly string[];
  signal: AbortSignal;
}): Promise<NativeDecisionScores> {
  const { candidates, signal } = input;
  if (candidates.length === 0)
    throw new Error("A decision needs at least one candidate");
  const root = input.baseUrl.replace(/\/+$/u, "");
  const usage = { input: 0, output: 0 };
  const post = (path: string, body: unknown) =>
    input
      .fetcher(`${root}${path}`, {
        method: "POST",
        signal,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })
      .catch((error: unknown) => {
        signal.throwIfAborted();
        throw error;
      });
  const batch = await post("/natlang/score", {
    model: input.model,
    items: [
      batchScoreItem({ messages: input.messages, options: [...candidates] }),
    ],
  });
  if (batch.ok) {
    const body = (await batch.json()) as { results?: Parameters<typeof scoresFromBatchResult>[0][] };
    const scores = scoresFromBatchResult(body.results?.[0], candidates.length);
    return {
      logProbs: scores.log_probs,
      probabilities: softmax(scores.log_probs),
      ...(scores.tokens ? { tokens: scores.tokens } : {}),
      usage,
    };
  }
  await batch.body?.cancel();
  if (![404, 405, 501].includes(batch.status))
    throw new Error(`Scoring endpoint failed with HTTP ${batch.status}`);
  const responses = await Promise.all(
    candidates.map(async (reply): Promise<PromptLogprobResponse> => {
      const response = await post(
        "/chat/completions",
        promptLogprobRequest(input.messages, reply, {
          model: input.model,
          stream: false,
        }),
      );
      if (!response.ok)
        throw new Error(`Scoring request failed with HTTP ${response.status}`);
      const body = (await response.json()) as PromptLogprobResponse & {
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      usage.input += body.usage?.prompt_tokens ?? 0;
      usage.output += body.usage?.completion_tokens ?? 0;
      return body;
    }),
  );
  let scores;
  try {
    scores = scoresFromPromptLogprobs(responses);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("decision-unsupported"))
      throw new DecisionUnsupportedError(
        error.message.slice("decision-unsupported: ".length),
      );
    throw error;
  }
  return {
    logProbs: scores.log_probs,
    probabilities: softmax(scores.log_probs),
    ...(scores.tokens ? { tokens: scores.tokens } : {}),
    usage,
  };
}
