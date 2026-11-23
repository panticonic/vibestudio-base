import {expect,it} from "vitest";
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from "node:fs";
import os from "node:os";
import path from "node:path";
import {discoverProgramRoots,checkWorkspaceNatlangPrograms} from "./testing.js";
it("checks a TS package with nested NL decisions in its package type scope",async()=>{
 const root=mkdtempSync(path.join(os.tmpdir(),"natlang-ts-package-"));
 try{
  const files={
   "skills/review/natlang.json":JSON.stringify({schema:"natlang.package/v2",name:"reference",version:"0.1.0",targets:{main:{entry:"review.ts"}}}),
   "skills/review/types.ts":"export type Evidence = {text:string};",
   "skills/review/review.ts":'import judge from "./review/judge.nl"; import type {Evidence} from "./types.js"; export default async function review(evidence:Evidence):Promise<string>{return judge(evidence);}',
   "skills/review/review/judge.nl":"---\nargs: {evidence: Evidence}\nreturns: string\n---\nAssess the supplied evidence.\n",
   "skills/legacy/check.nl":"---\nargs: {text: string}\nreturns: boolean\n---\nDecide whether the text is clear.\n",
  };
  for(const [relative,text] of Object.entries(files)){const file=path.join(root,relative);mkdirSync(path.dirname(file),{recursive:true});writeFileSync(file,text);}
  expect(discoverProgramRoots(root).sort()).toEqual(["skills/legacy","skills/review"]);
  const checks=await checkWorkspaceNatlangPrograms(root,{updateDeclarations:true});
  expect(checks.map(item=>({program:item.program,failure:item.failure})).sort((a,b)=>a.program.localeCompare(b.program))).toEqual([
   {program:"skills/legacy",failure:null},{program:"skills/review",failure:null},
  ]);
 }finally{rmSync(root,{recursive:true,force:true});}
});
