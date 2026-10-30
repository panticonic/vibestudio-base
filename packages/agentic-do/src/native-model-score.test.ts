import { describe, expect, it } from "vitest";
import { softmax } from "@workspace/natlang-pi";
import {
  DecisionUnsupportedError,
  openAIChatMessages,
  scoreReplies,
} from "./native-model-score.js";

const signal = new AbortController().signal;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

describe("scoring finite replies", () => {
  it("normalizes log-probabilities with natlang's softmax", () => {
    const probabilities = softmax([Math.log(0.2), Math.log(0.6), Math.log(0.2)]);
    expect(probabilities.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    expect(probabilities[1]).toBeCloseTo(0.6);
  });

  it("renders Pi context as OpenAI chat messages and refuses what it cannot score", () => {
    expect(
      openAIChatMessages({
        systemPrompt: "Decide.",
        messages: [{ role: "user", content: "urgent?", timestamp: 1 }],
      }),
    ).toEqual([
      { role: "system", content: "Decide." },
      { role: "user", content: "urgent?" },
    ]);
    expect(() =>
      openAIChatMessages({
        messages: [],
        tools: [{ name: "t", description: "d", parameters: {} as never }],
      }),
    ).toThrow(/no tool declarations/u);
  });

  it("scores every candidate from one request on a server with the batch endpoint", async () => {
    const requests: Array<{ url: string; body: any }> = [];
    const scores = await scoreReplies({
      fetcher: (async (url: string, init: RequestInit) => {
        requests.push({ url, body: JSON.parse(String(init.body)) });
        return json({ results: [{ log_probs: [-0.1, -2.3], tokens: [1, 2] }] });
      }) as typeof fetch,
      baseUrl: "http://127.0.0.1:1/v1/",
      model: "lfm3-1.7b",
      messages: [{ role: "user", content: "q" }],
      candidates: ["yes", "no"],
      signal,
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]!.url).toBe("http://127.0.0.1:1/v1/natlang/score");
    expect(requests[0]!.body.items[0].continuations).toEqual(["yes", "no"]);
    expect(scores.logProbs).toEqual([-0.1, -2.3]);
    expect(scores.probabilities[0]).toBeGreaterThan(0.85);
    expect(scores.tokens).toEqual([1, 2]);
  });

  it("falls back to prompt_logprobs per candidate, scoring only past the shared prefix", async () => {
    const rows = (ids: string[], logprobs: number[]) =>
      ids.map((id, index) => ({ [id]: { logprob: logprobs[index] } }));
    const scores = await scoreReplies({
      fetcher: (async (url: string, init: RequestInit) => {
        if (url.endsWith("/natlang/score")) return json({}, 404);
        const reply = JSON.parse(String(init.body)).messages.at(-1).content;
        return json({
          usage: { prompt_tokens: 7, completion_tokens: 1 },
          // Shared prompt tokens 1 and 2, then the reply's own token.
          prompt_logprobs: rows(
            ["1", "2", reply === "yes" ? "10" : "20"],
            [-5, -4, reply === "yes" ? -0.5 : -1.5],
          ),
        });
      }) as typeof fetch,
      baseUrl: "http://127.0.0.1:1/v1",
      model: "m",
      messages: [{ role: "user", content: "q" }],
      candidates: ["yes", "no"],
      signal,
    });
    expect(scores.logProbs).toEqual([-0.5, -1.5]);
    expect(scores.tokens).toEqual([1, 1]);
    expect(scores.usage).toEqual({ input: 14, output: 2 });
    expect(scores.probabilities[0]! + scores.probabilities[1]!).toBeCloseTo(1);
  });

  it("fails with decision-unsupported when the server returns no prompt_logprobs", async () => {
    const attempt = scoreReplies({
      fetcher: (async (url: string) =>
        url.endsWith("/natlang/score") ? json({}, 404) : json({ choices: [] })) as typeof fetch,
      baseUrl: "http://127.0.0.1:1/v1",
      model: "m",
      messages: [],
      candidates: ["a"],
      signal,
    });
    await expect(attempt).rejects.toBeInstanceOf(DecisionUnsupportedError);
    await expect(attempt).rejects.toThrow(/^decision-unsupported:/u);
  });
});
