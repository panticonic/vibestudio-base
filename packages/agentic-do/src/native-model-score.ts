import type { Context as ModelContext, Message } from "@panticonic/pi-ai";

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

export function softmax(logProbs: readonly number[]): number[] {
  const max = Math.max(...logProbs);
  const weights = logProbs.map((value) => Math.exp(value - max));
  const total = weights.reduce((sum, value) => sum + value, 0);
  return weights.map((value) => value / total);
}

type ScoreRow = { id: string; logprob: number } | null;

/**
 * Score finite replies through the model server's own `prompt_logprobs`: each reply
 * is written as the closed final assistant message and its tokens' log-probabilities
 * summed after the prefix shared by all replies (natlang's `promptLogprobDecider`
 * contract). Where the server has the explicit-batch endpoint it scores every reply
 * from one prefill; a server without it is asked per reply. `fetcher` is the
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
  const batch = await input
    .fetcher(`${root}/natlang/score`, {
      method: "POST",
      signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: input.model,
        items: [{ messages: input.messages, continuations: candidates }],
      }),
    })
    .catch((error: unknown) => {
      signal.throwIfAborted();
      throw error;
    });
  if (batch.ok) {
    const body = (await batch.json()) as {
      results?: Array<{ log_probs?: number[]; tokens?: number[]; error?: string }>;
    };
    const result = body.results?.[0];
    if (
      !result ||
      typeof result.error === "string" ||
      !Array.isArray(result.log_probs) ||
      result.log_probs.length !== candidates.length
    )
      throw new Error(
        result?.error ?? "The scoring endpoint returned no scores for the decision",
      );
    return {
      logProbs: result.log_probs,
      probabilities: softmax(result.log_probs),
      ...(result.tokens ? { tokens: result.tokens } : {}),
      usage,
    };
  }
  await batch.body?.cancel();
  if (![404, 405, 501].includes(batch.status))
    throw new Error(`Scoring endpoint failed with HTTP ${batch.status}`);
  const sequences = await Promise.all(
    candidates.map(async (reply) => {
      const response = await input.fetcher(`${root}/chat/completions`, {
        method: "POST",
        signal,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: input.model,
          messages: [...input.messages, { role: "assistant", content: reply }],
          add_generation_prompt: false,
          continue_final_message: false,
          prompt_logprobs: 0,
          max_tokens: 1,
          stream: false,
        }),
      });
      if (!response.ok)
        throw new Error(`Scoring request failed with HTTP ${response.status}`);
      const body = (await response.json()) as {
        prompt_logprobs?: unknown;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      usage.input += body.usage?.prompt_tokens ?? 0;
      usage.output += body.usage?.completion_tokens ?? 0;
      if (!Array.isArray(body.prompt_logprobs))
        throw new DecisionUnsupportedError(
          "the server returned no prompt_logprobs",
        );
      // Each row maps token id to its entry; with prompt_logprobs 0 the prompt's
      // own token is the only (first) key.
      return body.prompt_logprobs.map((row): ScoreRow => {
        if (!row || typeof row !== "object") return null;
        const [id, entry] =
          Object.entries(row as Record<string, { logprob?: number }>)[0] ?? [];
        return id === undefined || typeof entry?.logprob !== "number"
          ? null
          : { id, logprob: entry.logprob };
      });
    }),
  );
  let shared = 0;
  const shortest = Math.min(...sequences.map((sequence) => sequence.length));
  while (
    shared < shortest &&
    sequences.every((sequence) => sequence[shared]?.id === sequences[0]![shared]?.id)
  )
    shared++;
  // With one reply nothing differs; its score is the whole reply after the prompt.
  if (candidates.length === 1) shared = 0;
  const logProbs = sequences.map((sequence) =>
    sequence.slice(shared).reduce((sum, row) => sum + (row?.logprob ?? 0), 0),
  );
  return {
    logProbs,
    probabilities: softmax(logProbs),
    tokens: sequences.map((sequence) => sequence.length - shared),
    usage,
  };
}
