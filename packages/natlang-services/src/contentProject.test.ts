import {describe,it,expect,vi} from "vitest";
import {vcsStatusResultSchema} from "@vibestudio/service-schemas/vcs";
import {createProjectDelivery} from "./contentProject.js";
const assignment={contextId:"fixture",name:"release-notes",title:"Release",request:{goal:"Prepare grounded release material",audience:"operator",facts:[{id:"f1",text:"The release is planned."}],documentRoles:["release guide"]}};
function ports(){
  const status=vcsStatusResultSchema.parse({contextId:"fixture",committed:{kind:"event",eventId:"baseline"},workingHead:{kind:"event",eventId:"baseline"},clean:true,mainEventId:"protected",mainRelation:"at",workingCounts:{applications:0,workUnits:0,changes:0},integrating:[]});
  return {contextId:"fixture",vcs:{status:vi.fn(async()=>status),resolveRepository:vi.fn(async()=>null),listFiles:vi.fn(),readFile:vi.fn(),edit:vi.fn(),commit:vi.fn()},prepareProjects:vi.fn()};
}
describe("caller-scoped content project mechanics",()=>{
  it("refuses a different context before any product access",()=>{const p=ports();expect(()=>createProjectDelivery({...p,contextId:"other"},assignment)).toThrow("another execution context");expect(p.vcs.status).not.toHaveBeenCalled();});
  it("refuses an unobserved head before calling the project preparation helper",async()=>{const p=ports(),service=createProjectDelivery(p,assignment);await expect(service.prepare("invented")).rejects.toThrow("basis changed");expect(p.prepareProjects).not.toHaveBeenCalled();});
  it("refuses a stale observed head without preparation",async()=>{const p=ports(),service=createProjectDelivery(p,assignment);const snapshot=await service.observe();const newer=vcsStatusResultSchema.parse({...await p.vcs.status(),workingHead:{kind:"application",applicationId:"concurrent"},clean:false});p.vcs.status.mockResolvedValue(newer);await expect(service.prepare(snapshot.head)).rejects.toThrow("basis changed");expect(p.prepareProjects).not.toHaveBeenCalled();});
});
