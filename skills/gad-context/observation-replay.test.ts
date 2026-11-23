import {expect,it,vi} from "vitest";
import {bindDurableQuestionReview} from "./durable-question-workflow.js";
import {bindTerminalChecks} from "../terminal/workflow.js";
vi.mock("@workspace/runtime",()=>({contextId:"owned",gad:{},extensions:{invoke:async()=>({exitCode:0,stdout:"checked",stderr:""})}}));
it("permits repeated owned history/roster reads but rejects an unissued receipt and foreign native channel",async()=>{
 let foreign=false;
 const binding=bindDurableQuestionReview("owned",{
  readChannelEnvelopes:async()=>({items:[],pageInfo:{hasMoreBefore:false,hasMoreAfter:false}}),
  inspectChannelRoster:async()=>({rows:foreign?[{channel_id:"foreign"}]:[]}),
 } as never);
 const history=await binding.gadDurableHistory.read();expect(await binding.gadDurableHistory.read()).toEqual(history);
 const roster=await binding.gadDurableRoster.read(history.receipt);expect(await binding.gadDurableRoster.read(history.receipt)).toEqual(roster);
 await expect(binding.gadDurableRoster.read("foreign")).rejects.toThrow("assigned durable history receipt");
 foreign=true;await expect(binding.gadDurableRoster.read(history.receipt)).rejects.toThrow("foreign channel");
});
it("allows terminal plan rereads while retaining exactly one authorized command execution",async()=>{
 const binding=bindTerminalChecks({goal:"Run the sealed check once",checks:[{id:"check",purpose:"Check",intent:{kind:"argv",executable:"true",args:[]},prerequisites:[],timeoutMs:1000,maxOutputBytes:1024}]});
 const plan=await binding.services.terminalCheckRead.observe(binding.request.operationId);
 expect(await binding.services.terminalCheckRead.observe(binding.request.operationId)).toEqual(plan);
 await expect(binding.services.terminalCheckRead.observe("foreign")).rejects.toThrow("assigned terminal plan");
 expect((await binding.services.terminalCheckRun.execute(plan.receipt,"check")).exitCode).toBe(0);
 await expect(binding.services.terminalCheckRun.execute(plan.receipt,"check")).rejects.toThrow("unattempted assigned check");
});
