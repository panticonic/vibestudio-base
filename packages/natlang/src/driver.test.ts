import { describe, expect, it } from "vitest";
import { LOCAL_PROVIDER_ID } from "@workspace/model-catalog/catalog";
import { makeTestCatalogEntry } from "@workspace/model-catalog/testing";
import { decisionPrompt,type DecisionRequest } from "@workspace/natlang-pi";
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
  const asked: (DecisionRequest&{model:string;turnId:string})[] = [];
  const gateway = {
    score: async (input: (typeof asked)[number]) => {
      asked.push(input);
      return { log_probs: [-0.5, -1.5] };
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
    expect(asked[0]!.options).toEqual(['{"result": "knight"}', '{"result": "knave"}']);
    expect(String((asked[0]!.messages.at(-1)! as {content:string}).content)).toBe(decisionPrompt(OPTIONS, "result-object"));
  });

  it("leaves a hosted model's readout as natlang wrote it", async () => {
    const { asked, decide } = scored(EXECUTOR_ENTRY);
    await decide(READOUT);
    expect(asked[0]!.options).toEqual(OPTIONS);
    expect(String((asked[0]!.messages.at(-1)! as {content:string}).content)).toBe(decisionPrompt(OPTIONS));
  });
});
it("keeps canonical reasoning/history controls and native capture across the gateway",async()=>{
 const request:DecisionRequest={...READOUT,messages:[{role:"assistant",content:"Earlier",reasoning_content:"Earlier reasoning"},...READOUT.messages],reasoning:"Compare the observed evidence",reasoning_ids:[0,4,7],open_reply:true,adapters:[{id:"one",scale:0.5}],native_state_modes:{one:"same-base-adapter-state"},native_recording:true,cache_messages:1,invocation_id:"invocation",invocation_role:"child",reasoning_sample:{index:0,samples:1,action:true}};
 const capture={turn:"native",tokens:[0,4,7]},asked:DecisionRequest[]=[],recorded:unknown[]=[];
 const driver=gatewayDriver({gateway:{score:async(input:DecisionRequest)=>{asked.push(input);return {log_probs:[-0.3,-1.2],tokens:[1,2],prompt_tokens:100,open_reply:true,reasoning:true,native_decision_capture:capture};}} as never,resolver:{resolve:async()=>EXECUTOR_ENTRY},model:EXECUTOR_ENTRY.ref,turnPrefix:"canonical",captureModelTurns:()=>true,prepareCapture:async()=>({record:async exchange=>{recorded.push(exchange);},finish:()=>{}})});
 const before=structuredClone(request),score=await driver.decide!(request);
 expect(asked[0]).toMatchObject(request);expect(asked[0]).not.toHaveProperty("context");
 expect(asked[0]!.messages[0]).toEqual(before.messages[0]);expect(request).toEqual(before);
 expect(score).toEqual({log_probs:[-0.3,-1.2],tokens:[1,2],prompt_tokens:100,native_decision_capture:capture});
 expect(recorded).toMatchObject([{kind:"score",provider:{request:expect.objectContaining({reasoning:request.reasoning}),result:{native_decision_capture:capture}},reply:{native_decision_capture:capture}}]);
});
it.each([{open_reply:true}, {reasoning:"Condition on this exact reasoning"}])("refuses a gateway that silently omits the requested mode echo: %j",async control=>{
 const recorded:unknown[]=[];
 const driver=gatewayDriver({gateway:{score:async()=>({log_probs:[-0.3,-1.2],native_decision_capture:{actual:"unconditioned"}})} as never,resolver:{resolve:async()=>EXECUTOR_ENTRY},model:EXECUTOR_ENTRY.ref,turnPrefix:"unsupported",captureModelTurns:()=>true,prepareCapture:async()=>({record:async exchange=>{recorded.push(exchange);},finish:()=>{}})});
 await expect(driver.decide!({...READOUT,...control})).rejects.toThrow(/decision-(?:open|reasoning)-unsupported/);
 expect(recorded).toMatchObject([{kind:"score",error:{message:expect.stringMatching(/unsupported/)},provider:{result:{native_decision_capture:{actual:"unconditioned"}}}}]);
});
