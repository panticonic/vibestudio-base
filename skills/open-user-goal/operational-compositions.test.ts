import {readFileSync} from "node:fs";
import {createRequire,registerHooks} from "node:module";
import {pathToFileURL} from "node:url";
import path from "node:path";
import {expect,it,vi} from "vitest";
// Node24 loads this ESM SDK directly; Vite must not instrument its bundled compiler.
const natlang=(()=>{
 const anchor=pathToFileURL(path.join(process.cwd(),"package.json")).href;
 const hook=registerHooks({resolve(specifier,context,next){return next(specifier,specifier==="yaml"||specifier.startsWith("@noble/hashes/")?{...context,parentURL:anchor}:context);}});
 try{return createRequire(import.meta.url)(path.resolve(import.meta.dirname,"../../packages/natlang/vendor/workerd/natlang-workerd.js"));}
 finally{hook.deregister();}
})();
// Execute the actual typed composition with recorded native/policy boundaries.
// The caller supplies judgments; these tests never invoke a model.
const {transformSync}=createRequire(path.join(process.cwd(),"package.json"))("esbuild");
function compose(relative:string,mocks:Record<string,unknown>){
 const file=path.resolve(import.meta.dirname,relative),module:{exports:Record<string,any>}={exports:{}};
 const {code}=transformSync(readFileSync(file,"utf8"),{loader:"ts",format:"cjs",target:"es2022"});
 new Function("require","module","exports",code)((id:string)=>{
  if(id==="natlang:services")return mocks.services;
  if(id==="@natlang/node")return natlang;
  const name=path.basename(id).replace(/\.(nl|js)$/,""),value=mocks[name];
  if(value===undefined)throw new Error("Unbound test boundary: "+id);
  return {__esModule:true,default:value};
 },module,module.exports);
 return module.exports.default as (...args:any[])=>Promise<any>;
}
it("returns the actual notification decision or native acknowledgment and rereads after acknowledgment",async()=>{
 const decision={action:"hold",finding:{id:null,revision:null},reason:"scope moved"};
 const acknowledge=vi.fn(async()=>({status:"acknowledged",id:"notice",revision:0})),read=vi.fn();
 const finish=compose("reviewNotificationState/finishNotificationReview.ts",{services:{notificationState:{acknowledge,read}}});
 const lifecycle={current:{lane:{id:"lane",generation:3}}};
 expect(await finish(lifecycle as any,decision as any)).toBe(decision);
 expect(acknowledge).not.toHaveBeenCalled();
 const actual=await finish(lifecycle as any,{action:"acknowledge",finding:{id:"notice",revision:0}} as any);
 expect(acknowledge).toHaveBeenCalledWith(lifecycle.current.lane,"notice",0);
 expect(read).toHaveBeenCalledWith(lifecycle.current.lane);
 expect(actual.status).toBe("acknowledged");
});
it("reconsiders a stale browser action from the actual new visible revision",async()=>{
 const old={revision:"old",rows:[{label:"Task",state:"pending",detail:"old",controls:[{id:"old-action"}]}]},current={revision:"current",rows:[{label:"Task",state:"pending",detail:"new",controls:[{id:"new-action"}]}]},done={revision:"done",rows:[{label:"Task",state:"done",detail:"saved",controls:[]}]};
 const inspect=vi.fn().mockResolvedValueOnce(old).mockResolvedValueOnce(current).mockResolvedValueOnce(done);
 const activate=vi.fn().mockResolvedValueOnce("changed").mockResolvedValueOnce("activated");
 const choosePanelAction=vi.fn().mockResolvedValueOnce({kind:"act",control:"old-action"}).mockResolvedValueOnce({kind:"act",control:"new-action"}).mockResolvedValueOnce({kind:"report",labels:["Task"]});
 const run=compose("workInBrowser.ts",{services:{goalBrowser:{inspect,activate}},choosePanelAction});
 expect(await natlang.createNatlangRuntime({platform:natlang.workerdPlatform({realm:{call(body:string,params:string[],args:unknown[]){return Function(...params,body)(...args);}}})}).run(()=>run("Complete Task"))).toEqual({status:"changed",revision:"done",rows:[{label:"Task",state:"done",detail:"saved"}]});
 expect(activate.mock.calls).toEqual([["old-action","old"],["new-action","current"]]);
 expect(choosePanelAction.mock.calls[1]).toEqual(["Complete Task",current]);
});
it("preserves a coedit and refuses a commit when fresh native verification no longer authorizes it",async()=>{
 const first={observation:{revision:"old"},check:{revision:"old",build:{status:"ok"},check:{status:"passed",count:1}}},fresh={observation:{revision:"new"},check:null};
 const inspectUnit=vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(fresh),decideNext=vi.fn().mockResolvedValueOnce({action:"commit",reason:"verified"}).mockResolvedValueOnce({action:"hold",reason:"coedit needs review"}),commitCandidate=vi.fn(async()=>({status:"changed",revision:"new"}));
 const run=compose("../open-unit-rollout/repairWorkspaceUnit.ts",{services:{unitRolloutCatalog:{discover:async()=>[{id:"unit"}]}},chooseUnit:async()=>"unit",inspectUnit,decideNext,evolveCandidate:vi.fn(),commitCandidate});
 expect(await run("Commit the verified owned unit")).toMatchObject({status:"held",unitId:"unit",revision:"new",reason:"coedit needs review"});
 expect(commitCandidate.mock.calls).toEqual([["unit","old"]]);
});

it("binds the actual local delivery native contract without wrapping or normalizing recipient scope",async()=>{
 const actual={room:{id:"owned-room"},basis:"observed-head",roster:[],resolution:null,prior:null};
 const inspect=vi.fn(async(roomId:string,phrase:string|null)=>{expect(roomId).toBe("owned-room");expect(phrase===null||phrase==="@actual-recipient").toBe(true);return actual;});
 const read=compose("../open-local-delivery/workTowardLocalDelivery/inspectConversation.ts",{services:{localDeliveryHistory:{inspect}}});
 expect(await read({roomId:"owned-room",recipientPhrase:"@actual-recipient"})).toBe(actual);
 expect(await read({roomId:"owned-room",recipientPhrase:null})).toBe(actual);
 expect(inspect.mock.calls).toEqual([["owned-room","@actual-recipient"],["owned-room",null]]);
});

it("lets local delivery reconsider more than two additional conversations before deciding",async()=>{
 const conversations=Array.from({length:5},(_,index)=>({id:"room-"+index,title:"Room "+index,maySend:false}));
 const inspectConversation=vi.fn(async(choice:{roomId:string})=>({room:conversations.find(room=>room.id===choice.roomId),basis:"current",phrase:null,roster:[],resolution:null,prior:null}));
 const reconsider=vi.fn(async(_:string,__:unknown,observations:unknown[])=>observations.length<5?{roomId:"room-"+observations.length,recipientPhrase:null}:null);
 const decideDelivery=vi.fn(async(_:string,observations:unknown[])=>{expect(observations).toHaveLength(5);return {status:"verified",reason:"all requested conversations compared",evidence:[],sendRoomId:null};});
 const report={status:"verified",reason:"all requested conversations compared",delivery:null};
 const run=compose("../open-local-delivery/workTowardLocalDelivery.ts",{services:{localDeliveryCatalog:{discover:async()=>conversations}},chooseConversations:async()=>[{roomId:"room-0",recipientPhrase:null}],inspectConversation,reconsider,decideDelivery,bindReport:()=>report,completeDelivery:vi.fn()});
 const runtime=natlang.createNatlangRuntime({platform:natlang.workerdPlatform({realm:{call(body:string,params:string[],args:unknown[]){return Function(...params,body)(...args);}}})});
 expect(await runtime.run(()=>run("Compare all five owned conversations"))).toBe(report);
 expect(inspectConversation).toHaveBeenCalledTimes(5);
 expect(reconsider).toHaveBeenCalledTimes(5);
});
