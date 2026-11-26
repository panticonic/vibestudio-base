import {createHash} from "node:crypto";
import {readFile,writeFile} from "node:fs/promises";
import {pathToFileURL} from "node:url";
export function renderSemanticEntries(source){
 const entries=JSON.parse(source);
 const provenance={path:"skills/open-user-goal/entries.json",sha256:createHash("sha256").update(source).digest("hex")};
 return "// Generated from entries.json by packages/natlang/scripts/generate-semantic-entries.mjs.\nexport default "+JSON.stringify(entries,null,2)+";\nexport const entryAdapterDefaultsSource = "+JSON.stringify(provenance)+";\n";
}
export function semanticEntryUpdate(source,current,checkOnly){
 const next=renderSemanticEntries(source);
 if(next===current)return null;
 if(checkOnly)throw new Error("Generated semantic entries are stale; run generate-semantic-entries.mjs");
 return next;
}
export async function generateSemanticEntries({checkOnly=false}={}){
 const root=new URL("../../../skills/open-user-goal/",import.meta.url),target=new URL("entriesGenerated.ts",root);
 const source=await readFile(new URL("entries.json",root),"utf8");
 let current=null;
 try{current=await readFile(target,"utf8");}catch(error){if(error.code!=="ENOENT")throw error;}
 const next=semanticEntryUpdate(source,current,checkOnly);
 if(next!==null)await writeFile(target,next);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await generateSemanticEntries({checkOnly:process.argv.includes("--check")});
