import { describe, expect, it } from "vitest";
import { LOCAL_PROVIDER_ID } from "@workspace/model-catalog/catalog";
import { makeTestCatalogEntry } from "@workspace/model-catalog/testing";
import { decisionPrompt } from "@workspace/natlang-pi";
import { gatewayDriver } from "./driver.js";
import { EXECUTOR_ENTRY } from "./testSupport.js";

const OPTIONS = ['"knight"', '"knave"'];
const READOUT = {
  messages: [
    { role: "system", content: "You are running one call of a natural-language function." },
    { role: "user", content: decisionPrompt(OPTIONS) },
  ],
  options: OPTIONS,
};

/** A driver over a gateway that records what it is asked to score. */
function scored(entry: typeof EXECUTOR_ENTRY) {
  const asked: { context: { messages: { content: unknown }[] }; candidates: string[] }[] = [];
  const gateway = {
    score: async (input: (typeof asked)[number]) => {
      asked.push(input);
      return { logProbs: [-0.5, -1.5] };
    },
  };
  const driver = gatewayDriver({
    gateway: gateway as never,
    resolver: { resolve: async () => entry },
    model: entry.ref,
    turnPrefix: "t",
  });
  return { asked, decide: (driver as unknown as { decide: (request: typeof READOUT) => Promise<{ log_probs: number[] }> }).decide };
}

describe("the decision readout", () => {
  it("asks a local model for, and scores, the object it answers in", async () => {
    const entry = makeTestCatalogEntry({ ref: "local:lfm3-1.7b", id: "lfm3-1.7b", name: "LFM3 1.7B", provider: LOCAL_PROVIDER_ID, baseUrl: "http://127.0.0.1:1/v1" });
    const { asked, decide } = scored(entry);
    expect((await decide(READOUT)).log_probs).toEqual([-0.5, -1.5]);
    expect(asked[0]!.candidates).toEqual(['{"result": "knight"}', '{"result": "knave"}']);
    expect(String(asked[0]!.context.messages.at(-1)!.content)).toBe(decisionPrompt(OPTIONS, "result-object"));
  });

  it("leaves a hosted model's readout as natlang wrote it", async () => {
    const { asked, decide } = scored(EXECUTOR_ENTRY);
    await decide(READOUT);
    expect(asked[0]!.candidates).toEqual(OPTIONS);
    expect(String(asked[0]!.context.messages.at(-1)!.content)).toBe(decisionPrompt(OPTIONS));
  });
});
