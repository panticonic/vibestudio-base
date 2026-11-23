import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import path from "node:path";
import {expect,it,vi} from "vitest";
// Execute the actual typed composition with recorded native/policy boundaries.
// The caller supplies judgments; these tests never invoke a model.
const ts=createRequire(path.join(process.cwd(),"package.json"))("typescript");
function compose(relative:string,mocks:Record<string,unknown>){
 const file=path.resolve(import.meta.dirname,relative),exports:Record<string,any>={};
 const {outputText}=ts.transpileModule(readFileSync(file,"utf8"),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}});
 new Function("require","exports",outputText)((id:string)=>{
  if(id==="natlang:services")return mocks.services;
  const name=path.basename(id).replace(/\.(nl|js)$/,""),value=mocks[name];
  if(value===undefined)throw new Error("Unbound test boundary: "+id);
  return {default:value};
 },exports);
 return exports.default as (...args:any[])=>Promise<any>;
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
 expect(await run("Complete Task")).toEqual({status:"changed",revision:"done",rows:[{label:"Task",state:"done",detail:"saved"}]});
 expect(activate.mock.calls).toEqual([["old-action","old"],["new-action","current"]]);
 expect(choosePanelAction.mock.calls[1]).toEqual(["Complete Task",current]);
});
it("reports refreshed asset findings when a pinned working revision changes and never retries its write",async()=>{
 const approved={version:{id:"signed",edition:"approved"},manifest:{assets:[{key:"logo"}]}},old={version:{id:"old",edition:"working"}},fresh={version:{id:"fresh",edition:"working"}};
 let rounds=0;
 const stageRecovery=vi.fn(async()=>({status:"changed",working:"fresh"}));
 const run=compose("reviewAssetIntegrity.ts",{discoverVersions:async()=>{rounds++;return rounds===1?[approved.version,old.version]:[approved.version,fresh.version];},readVersion:async(v:any)=>v.id==="signed"?approved:v.id==="old"?old:fresh,compareAsset:async(_:unknown,__ :unknown,working:any)=>({key:"logo",working:working.version.id,differences:["bytes"]}),planRecovery:async()=>({status:"copy",selection:[{id:"logo"}]}),stageRecovery,allowRefreshedRevision:async()=>false});
 const result=await run("Recover against the pinned working revision");
 expect(result).toMatchObject({status:"held",working:"fresh",findings:[{working:"fresh"}],receipt:null});
 expect(stageRecovery).toHaveBeenCalledTimes(1);
});
it("preserves a coedit and refuses a commit when fresh native verification no longer authorizes it",async()=>{
 const first={observation:{revision:"old"},check:{revision:"old",build:{status:"ok"},check:{status:"passed",count:1}}},fresh={observation:{revision:"new"},check:null};
 const inspectUnit=vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(fresh),decideNext=vi.fn().mockResolvedValueOnce({action:"commit",reason:"verified"}).mockResolvedValueOnce({action:"hold",reason:"coedit needs review"}),commitCandidate=vi.fn(async()=>({status:"changed",revision:"new"}));
 const run=compose("../open-unit-rollout/repairWorkspaceUnit.ts",{services:{unitRolloutCatalog:{discover:async()=>[{id:"unit"}]}},chooseUnit:async()=>"unit",inspectUnit,decideNext,evolveCandidate:vi.fn(),commitCandidate});
 expect(await run("Commit the verified owned unit")).toMatchObject({status:"held",unitId:"unit",revision:"new",reason:"coedit needs review"});
 expect(commitCandidate.mock.calls).toEqual([["unit","old"]]);
});
