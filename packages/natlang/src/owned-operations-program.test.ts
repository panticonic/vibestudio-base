import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { compileProgram } from "./programs.js";
import { workerdPlatform } from "../vendor/workerd/natlang-workerd.js";
import { confinedRealm } from "./realm.js";
import { testNewFunction } from "./testSupport.js";
describe("authored owned operations program", () => {
 it("compiles the actual nested source with only its declared scoped service and no model call", () => {
  const root=fileURLToPath(new URL("../../../skills/agents/operational-handoff/",import.meta.url));
  const files:Record<string,string>={};
  const read=(prefix:string)=>{
   for(const entry of readdirSync(join(root,prefix),{withFileTypes:true})){
    const name=prefix?`${prefix}/${entry.name}`:entry.name;
    if(entry.isDirectory())read(name);
    else if(/\.(?:nl|ts)$/u.test(name)||name==="natlang.json")files[name]=readFileSync(join(root,name),"utf8");
   }
  };read("");
  const program=compileProgram({platform:workerdPlatform({realm:confinedRealm(testNewFunction())}),files,entry:"operate.nl",label:"skills/agents/operational-handoff/operate.nl"});
  expect(typeof program.value).toBe("function");
  expect(program.services).toEqual(["ownedOperations"]);
  expect(program.serviceScopes).toEqual({ownedOperations:["operate.nl","operate/incident.nl","operate/release.nl"]});
 });
});
