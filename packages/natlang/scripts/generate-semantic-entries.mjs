import { readFile, writeFile } from "node:fs/promises";
const root = new URL("../../../skills/open-user-goal/", import.meta.url);
const entries = JSON.parse(await readFile(new URL("entries.json", root), "utf8"));
await writeFile(new URL("entriesGenerated.ts", root), "// Generated from entries.json by packages/natlang/scripts/generate-semantic-entries.mjs.\nexport default " + JSON.stringify(entries, null, 2) + ";\n");
