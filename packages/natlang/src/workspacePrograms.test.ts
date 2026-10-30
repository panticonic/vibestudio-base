import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { UPDATE_DECLARATIONS_ENV, checkWorkspaceNatlangPrograms } from "./testing.js";

// Every natlang program in this template compiles (types, `nl` signatures, the
// callable-folder policy, declared services: the checks `natlang.load` runs) and
// its generated `.d.nl.ts` declarations are current.
describe("workspace natlang programs", () => {
  it("all compile", async () => {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
    const failures = (await checkWorkspaceNatlangPrograms(root, {
        updateDeclarations: process.env[UPDATE_DECLARATIONS_ENV] === "1",
      })).filter((check) => check.failure);
    expect(failures.map((check) => `${check.program}: ${check.failure}`)).toEqual([]);
  });
});
