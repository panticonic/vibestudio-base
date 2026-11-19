import { isDeepStrictEqual } from "node:util";
import { bindScratchHandoff } from "../scratch-handoff-bindings/index.js";
import type { HandoffReport } from "../scratch-handoff/types.js";
import type { ScratchWorld } from "./worlds.js";

const directory = "/.tmp/evidence-handoff-fixture";
const artifact = `${directory}/handoff.json`;
const pending = `${directory}/.pending`;

export function createScratchHandoffFixture(world: ScratchWorld) {
  const sourceFiles = new Map(
    world.request.sources.flatMap(({ id, path }) => {
      const content = world.files[id];
      return content === undefined
        ? []
        : [
            [
              path,
              Buffer.from(
                typeof content === "string"
                  ? content
                  : Uint8Array.from(content),
              ),
            ] as const,
          ];
    }),
  );
  const scratch = new Map<string, Buffer>();
  const operations: string[] = [];
  const bindings = bindScratchHandoff(
    {
      async open(path) {
        operations.push(`open:${path}`);
        const contents = sourceFiles.get(path) ?? scratch.get(path);
        if (!contents) throw new Error("File not found.");
        return {
          async stat() {
            return { isFile: () => true };
          },
          async read(buffer, offset, length, position) {
            const start = position ?? 0;
            const count = Math.min(
              length,
              Math.max(contents.length - start, 0),
            );
            buffer.set(contents.subarray(start, start + count), offset);
            return { bytesRead: count, buffer };
          },
          async close() {},
        };
      },
      async mkdtemp(prefix) {
        operations.push(`mkdir:${prefix}`);
        return directory;
      },
      async writeFile(path, data) {
        operations.push(`write:${path}`);
        if (path !== pending || typeof data !== "string")
          throw new Error("Use the assigned scratch file.");
        scratch.set(path, Buffer.from(data));
      },
      async rename(from, to) {
        operations.push(`rename:${from}:${to}`);
        if (world.fault === "rename") throw new Error("Rename was denied.");
        const contents = scratch.get(from);
        if (!contents || from !== pending || to !== artifact)
          throw new Error("Wrong handoff path.");
        scratch.set(
          to,
          world.fault === "readback"
            ? Buffer.from("Different bytes")
            : contents,
        );
        scratch.delete(from);
      },
      async rm(path) {
        operations.push(`remove:${path}`);
        if (path !== directory)
          throw new Error("Only remove the unique scratch directory.");
        scratch.clear();
      },
    },
    world.request,
  );
  return {
    bindings,
    verify(value: unknown): boolean {
      const report = value as HandoffReport | null;
      if (
        report?.status !== world.expected.status ||
        !isDeepStrictEqual(
          report.missingSources,
          world.expected.missingSources,
        ) ||
        !isDeepStrictEqual(report.unanswered, world.expected.unanswered)
      )
        return false;

      const expectedOperations = world.request.sources.map(
        ({ path }) => `open:${path}`,
      );
      if (report.status === "staged" || report.status === "unverified") {
        expectedOperations.push(
          "mkdir:evidence-handoff",
          `write:${pending}`,
          `rename:${pending}:${artifact}`,
        );
        if (world.fault !== "rename")
          expectedOperations.push(`open:${artifact}`);
        if (world.fault) expectedOperations.push(`remove:${directory}`);
      }
      if (!isDeepStrictEqual(operations, expectedOperations)) return false;
      if (report.status !== "staged")
        return report.artifact === null && scratch.size === 0;

      const content = scratch.get(artifact);
      if (
        !content ||
        scratch.size !== 1 ||
        report.artifact?.path !== artifact ||
        report.artifact.bytes !== content.length
      )
        return false;
      try {
        const expected = world.request.questions.map((question, index) => ({
          question,
          evidence: world.selection
            .find((item) => item.question === index + 1)!
            .excerpts.map((excerpt) => {
              const original = world.files[excerpt.sourceId] as string;
              const text = original
                .split(/\r?\n/u)
                .slice(excerpt.firstLine - 1, excerpt.lastLine)
                .join("\n");
              return { ...excerpt, text };
            }),
        }));
        return isDeepStrictEqual(JSON.parse(content.toString("utf8")), {
          answers: expected,
        });
      } catch {
        return false;
      }
    },
  };
}
