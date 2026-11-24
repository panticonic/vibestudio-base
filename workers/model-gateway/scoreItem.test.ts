import {afterEach,describe,expect,it,vi} from "vitest";
import {scoreItem} from "./scoreItem.js";
afterEach(()=>vi.unstubAllEnvs());
describe("canonical decision scoring",()=>{
 it("preserves reasoned open decisions, history and exact native controls without a Pi round-trip",()=>{
  const request={messages:[{role:"assistant",content:"Earlier",reasoning_content:"Earlier reasoning",tool_calls:[{id:"call",type:"function",function:{name:"inspect",arguments:"{}"}}]},{role:"tool",tool_call_id:"call",content:"Actual result"}],options:['"left"','"right"'],reasoning:"Use the actual observation",reasoning_ids:[0,7,11],open_reply:true,adapters:[{id:"bank/one",scale:0.4}],native_state_modes:{one:"same-base-adapter-state" as const},native_recording:true,cache_messages:2,invocation_id:"host-only",invocation_role:"child" as const,reasoning_sample:{index:0,samples:1,action:true},x_natlang_privileged_context:{source:"training"}};
  const before=structuredClone(request),wire=scoreItem(request);
  expect(wire).toEqual({messages:request.messages,continuations:request.options,reasoning:request.reasoning,reasoning_ids:request.reasoning_ids,open_reply:true,split_tokenization:true,adapters:request.adapters,native_state_modes:request.native_state_modes,native_recording:true,cache_messages:2,x_natlang_privileged_context:request.x_natlang_privileged_context});
  expect(request).toEqual(before);expect(wire).not.toHaveProperty("invocation_id");expect(wire).not.toHaveProperty("reasoning_sample");
 });
 it("uses the SDK's existing canonical-tokenization and rendered-reasoning opt-outs",()=>{
  vi.stubEnv("NATLANG_DECISION_TOKENIZATIONS","canonical");vi.stubEnv("NATLANG_DECISION_REASONING_IDS","rendered");
  const wire=scoreItem({messages:[],options:["a","b"],reasoning:"Actual reasoning",reasoning_ids:[3,5],open_reply:true});
  expect(wire).not.toHaveProperty("split_tokenization");expect(wire).not.toHaveProperty("reasoning_ids");
  expect(wire).toMatchObject({reasoning:"Actual reasoning",open_reply:true});
 });
});
