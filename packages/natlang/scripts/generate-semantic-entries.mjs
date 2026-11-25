import {createHash} from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
const root = new URL("../../../skills/open-user-goal/", import.meta.url);
const source = await readFile(new URL("entries.json", root), "utf8");
const entries = JSON.parse(source);
const provenance={path:"skills/open-user-goal/entries.json",sha256:createHash("sha256").update(source).digest("hex")};
await writeFile(new URL("entriesGenerated.ts", root), "// Generated from entries.json by packages/natlang/scripts/generate-semantic-entries.mjs.\nexport default " + JSON.stringify(entries, null, 2) + ";\nexport const entryAdapterDefaultsSource = " + JSON.stringify(provenance) + ";\n");
