import {expect,it} from "vitest";
import {declaredServiceScopes} from "./services.js";
it("accepts actual TS owners and explicit descendant scopes without accepting declarations or missing files",()=>{
 const files={"owner.ts":"export default function owner():void {}","types.d.ts":"export type T=string;","judge.nl":"---\nargs: {}\nreturns: string\n---\nJudge.","natlang.json":JSON.stringify({serviceScopes:{serverLog:["owner.ts/**","judge.nl"]}})};
 expect(declaredServiceScopes(files,["serverLog"],"reference")).toEqual({serverLog:["owner.ts/**","judge.nl"]});
 for(const selector of ["types.d.ts","missing.ts"]){
  expect(()=>declaredServiceScopes({...files,"natlang.json":JSON.stringify({serviceScopes:{serverLog:[selector]}})},["serverLog"],"reference")).toThrow(/existing relative/);
 }
});
