import {expect,it} from "vitest";
import {modelGatewayScoreInputSchema} from "./contract.js";
it("validates every canonical decision field without stripping conditioning or host capture identity",()=>{
 const request={turnId:"turn",model:"local:model",messages:[{role:"assistant",content:"Prior",reasoning_content:"Prior reasoning"}],options:["a","b"],reasoning:"Exact reasoning",reasoning_ids:[0,1],split_tokenization:true,open_reply:true,cache_messages:1,adapters:[{id:"state",scale:0.25}],native_state_modes:{state:"same-base-adapter-state"},native_recording:true,invocation_id:"call",invocation_role:"root",reasoning_sample:{index:0,samples:1,action:true},x_natlang_privileged_context:{source:"teacher"}};
 expect(modelGatewayScoreInputSchema.parse(request)).toEqual(request);
 for(const field of ["reasoning_ids","adapters","native_state_modes","open_reply"]){expect(()=>modelGatewayScoreInputSchema.parse({...request,[field]:"invalid"})).toThrow();}
 expect(()=>modelGatewayScoreInputSchema.parse({turnId:"old",model:"local:model",context:{messages:[]},candidates:["a"]})).toThrow();
});
