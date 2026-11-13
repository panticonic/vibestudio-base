import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { workspaceProgramFailures } from "./testing.js";

// Every natlang program in this template compiles (types, `nl` signatures, the
// callable-folder policy, declared services: the checks `natlang.load` runs) and
// its generated `.d.nl.ts` declarations are exactly what natlang emits. Other
// templates assert the same of their own programs (`workspacePrograms.test.ts`).
describe("workspace natlang programs", () => {
  it("all compile, with current declarations", async () => {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
    expect(await workspaceProgramFailures(root)).toEqual([]);
  });
});
