import {beforeEach, expect, it, vi} from "vitest";
const service=vi.hoisted(()=>({prepare:vi.fn(),write:vi.fn(),observe:vi.fn(),commit:vi.fn()}));
vi.mock("natlang:services",()=>({contentProjectDraft:service,contentProjectCommit:{commit:service.commit}}));
import writeInitial from "./authorProjectDocuments/writeInitialProject.js";
import finishProject from "./finishPrivateProject.js";
import readCandidate from "./authorProjectDocuments/readProjectCandidate.js";
import reviseCandidate from "./authorProjectDocuments/reviseProjectCandidate.js";
const scope={status:"admitted" as const,receipt:"scoped",initialHead:"before",request:null};
const prepared={contextId:"private",repoPath:"projects/owned",repositoryId:"repo",head:"prepared",mainEventId:"main",committedEventId:"private-before",clean:false,files:[]};
beforeEach(()=>vi.resetAllMocks());
it("writes against the returned private working head without inventing clean/main admission requirements",async()=>{
 const docs=[{path:"README.md",text:"Private working draft"}];const written={...prepared,head:"written",files:docs};
 service.prepare.mockResolvedValue(prepared);service.write.mockResolvedValue(written);
 expect(await writeInitial(scope,docs)).toBe(written);
 expect(service.write).toHaveBeenCalledWith("scoped","prepared",docs);
});
it("does not write when the observed source basis moved",async()=>{
 service.prepare.mockResolvedValue(null);expect(await writeInitial(scope,[])).toBeNull();expect(service.write).not.toHaveBeenCalled();
});
it("reads and repairs the exact candidate under the same scope and preserves native CAS rejection",async()=>{
 service.observe.mockResolvedValue(prepared);expect(await readCandidate(scope)).toBe(prepared);
 service.write.mockResolvedValue(null);expect(await reviseCandidate(scope,prepared,[])).toBeNull();
 expect(service.write).toHaveBeenCalledWith("scoped","prepared",[]);
});

it("finishes from the chosen typed disposition and semantic review without reconstructing state",async()=>{
 const decision={action:"draft" as const,basis:"authorized" as const,selected:[],reason:"Local draft requested."};
 const reviewed={snapshot:prepared,review:{ready:true,coveredRoles:[],unsupportedClaims:[],blockers:[],reason:"Reviewed actual files."}};
 expect(await finishProject(decision,scope,reviewed)).toEqual({outcome:"draft",candidate:prepared,event:null});expect(service.commit).not.toHaveBeenCalled();
 expect((await finishProject({...decision,action:"commit"},scope,{...reviewed,review:{...reviewed.review,ready:false}})).outcome).toBe("review-needed");expect(service.commit).not.toHaveBeenCalled();
 service.commit.mockResolvedValue(null);expect((await finishProject({...decision,action:"commit"},scope,reviewed)).outcome).toBe("held-moved");
 const event={eventId:"local",head:"event-head"};service.commit.mockResolvedValue(event);expect(await finishProject({...decision,action:"commit"},scope,reviewed)).toEqual({outcome:"committed",candidate:prepared,event});
});
