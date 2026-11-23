import {beforeEach,expect,it,vi} from "vitest";
const native=vi.hoisted(()=>({gather:vi.fn(),find:vi.fn(),write:vi.fn()}));
vi.mock("./researchBrief/gather.js",()=>({default:native.gather}));
vi.mock("./researchBrief/findEvidence.nl",()=>({default:native.find}));
vi.mock("./researchBrief/writeBrief.nl",()=>({default:native.write}));
import brief from "./researchBrief/brief.js";
beforeEach(()=>vi.resetAllMocks());
it("keeps each source identity and verified quotation available when synthesizing a comparison",async()=>{
 native.gather.mockResolvedValue({pages:[{url:"https://alpha.test/",title:"Alpha",text:"Plan A may be used for rehearsal."},{url:"https://beta.test/",title:"Beta",text:"Plan B is intended for live operation."}],notRead:[]});
 native.find.mockImplementation(async(_question,passage)=>({claim:passage.text,quote:passage.text}));
 native.write.mockResolvedValue([{text:"The plans serve different operational purposes.",cites:[1,2]}]);
 const result=await brief("Compare the stated purposes.",["https://alpha.test/","https://beta.test/"],Date.parse("2026-11-23"));
 expect(native.write.mock.calls[0]?.[1]).toEqual([
  {id:1,claim:"Plan A may be used for rehearsal.",url:"https://alpha.test/",title:"Alpha",quote:"Plan A may be used for rehearsal."},
  {id:2,claim:"Plan B is intended for live operation.",url:"https://beta.test/",title:"Beta",quote:"Plan B is intended for live operation."},
 ]);
 expect(result.statements[0]?.cites.map(c=>c.url)).toEqual(["https://alpha.test/","https://beta.test/"]);
});
