import {
  mkdtemp,
  open,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { prepare } from "../scratch-handoff/handoffChecks.js";
import { bindScratchHandoff } from "./index.js";

it("writes exact UTF-8 into a fresh scratch directory without touching the source", async () => {
  const root = await mkdtemp(join(tmpdir(), "vibe-scratch-workflow-test-"));
  try {
    const source = join(root, "original.txt");
    const next = "Approuvé : aperçu « Été ».\r\n";
    await writeFile(source, next);
    const binding = bindScratchHandoff(
      {
        open,
        rename,
        rm,
        writeFile,
        mkdtemp: (prefix) => mkdtemp(join(root, prefix ?? "scratch")),
      },
      {
        goal: "Stage a release handoff",
        questions: ["What was approved?"],
        sources: [{ id: "review", path: source }],
      },
    );
    expect(await binding.scratchHandoffRead.read("other")).toBeNull();
    const observed = await binding.scratchHandoffRead.read("review");
    expect(observed).toEqual({ id: "review", lines: [next.trimEnd()] });
    const prepareFor = (lastLine: number) =>
      prepare(
        ["What was approved?"],
        [observed!],
        [
          {
            question: 1,
            excerpts: [{ sourceId: "review", firstLine: 1, lastLine }],
          },
        ],
      );
    expect(prepareFor(2)).toEqual({
      body: null,
      unanswered: ["What was approved?"],
    });
    const { body } = prepareFor(1);
    expect(body).toContain(next.trimEnd());
    const staged = await binding.scratchHandoffWrite.stage(body!);
    expect(staged?.bytes).toBe(Buffer.byteLength(body!));
    expect(await readFile(staged!.path, "utf8")).toBe(body);
    expect(await readdir(join(staged!.path, ".."))).toEqual(["handoff.json"]);
    expect(
      await binding.scratchHandoffWrite.stage("overwrite attempt"),
    ).toBeNull();
    expect(await readFile(source, "utf8")).toBe(next);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
