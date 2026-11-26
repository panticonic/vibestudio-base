import {test} from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {renderSemanticEntries,semanticEntryUpdate} from "./generate-semantic-entries.mjs";
test("records the exact source identity and preserves actual application entry bytes",()=>{
 const source='{ "domain": {"program":"skills/x/owner.nl","callable":"owner","additionalArguments":{"literal":"line\\nvalue"}} }';
 const next=renderSemanticEntries(source);
 assert.match(next,/owner\.nl/);
 assert.ok(next.includes(createHash("sha256").update(source).digest("hex")));
 assert.ok(next.includes('"literal": "line\\nvalue"'));
 assert.notEqual(next,renderSemanticEntries(source+"\n"));
});
test("check mode refuses missing or stale output and never returns replacement bytes",()=>{
 const source='{"domain":{"program":"owner.nl"}}',current=renderSemanticEntries(source);
 assert.equal(semanticEntryUpdate(source,current,true),null);
 assert.equal(semanticEntryUpdate(source,current,false),null);
 assert.throws(()=>semanticEntryUpdate(source,null,true),/stale/);
 assert.throws(()=>semanticEntryUpdate(source,"stale",true),/stale/);
 assert.equal(semanticEntryUpdate(source,"stale",false),current);
});
