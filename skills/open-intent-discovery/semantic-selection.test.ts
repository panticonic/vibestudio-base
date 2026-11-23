import {readFileSync} from "node:fs";
import {it,expect,vi} from "vitest";
import {nativeIntentDiscovery as native} from "natlang:services";
import describeSelected from "./describeIntentSelection.js";
import search from "./searchIntentCatalog.js";
it("joins semantic IDs to exact current native objects without model reconstruction",async()=>{
 const actual={id:"service:vcs.status",name:"vcs.status",description:"Native text",digest:"current"};
 vi.mocked(native.describe).mockImplementation(async id=>id===actual.id?actual:null);
 const values=await describeSelected([actual.id,"unknown",actual.id]);
 expect(values).toEqual([actual]);expect(values[0]).toBe(actual);
 expect(native.describe).toHaveBeenCalledTimes(2);
});
it("keeps raw search results as exact service values",async()=>{
 const hits=[{id:"service:fs.readBytes",name:"fs.readBytes",description:"Original bounded description"}];
 vi.mocked(native.search).mockResolvedValue(hits);
 expect(await search("retained bytes")).toBe(hits);
 expect(native.search).toHaveBeenCalledWith("retained bytes");
});
it("keeps semantic query and action selection in typed natural-language functions",()=>{
 const searchPolicy=readFileSync(new URL("../open-user-goal/discoverScopedIntent/searchRelevantIntent.nl",import.meta.url),"utf8");
 const actionPolicy=readFileSync(new URL("../open-user-goal/discoverScopedIntent/chooseIntentActions.nl",import.meta.url),"utf8");
 expect(searchPolicy).toContain("returns: IntentCapabilitySelection");expect(searchPolicy).toContain("selected methodIds");
 expect(actionPolicy).toContain("capabilities: IntentDescription[]");expect(actionPolicy).toContain("returns: IntentPlan");
});
