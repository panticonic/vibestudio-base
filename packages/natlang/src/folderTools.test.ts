import { describe, expect, it } from "vitest";
import { Folder } from "../vendor/workerd/natlang-workerd.js";
import { folderBash } from "./folderTools.js";

describe("folderBash", () => {
  it("runs shell commands over the folder and reports what changed", async () => {
    const folder = Folder.fromFiles({ "notes.txt": "alpha\nbeta\n" });
    const result = await folderBash(folder, "grep beta notes.txt | tr a-z A-Z; echo done > out.txt");
    expect(result).toMatchObject({ exitCode: 0, stdout: "BETA\n", changedPaths: ["out.txt"] });
  });

  it("has no network", async () => {
    const result = await folderBash(Folder.fromFiles({}), "curl -s http://example.invalid/");
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("curl: command not found");
  });

  it("says why Python is unavailable", async () => {
    const result = await folderBash(Folder.fromFiles({}), "python3 -c 'print(1)'");
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("Python is unavailable in this isolate");
  });

  it("refuses open-ended shell loops before running anything", async () => {
    await expect(folderBash(Folder.fromFiles({}), "while true; do echo x; done")).rejects.toThrow(/loops are not allowed/);
  });
});
