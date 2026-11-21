import type { WorkspaceRuntime } from "@workspace/runtime/hosted";
import { expectedBuildUnitName, isTerminalAppLocation } from "@vibestudio/workspace-contracts/sourceDirs";
import { unitBuildReportSchema } from "@vibestudio/service-schemas/build";
import type { z } from "zod";
import {
  unitRepairEvidenceSchema,
  unitRepairTestEvidenceSchema,
  type unitRepairMethods,
} from "./unitRepairContracts.js";

type Edit = z.infer<typeof unitRepairMethods.apply.args>[1][number];
type Evidence = z.infer<typeof unitRepairEvidenceSchema>;

/** Live service plumbing only. Canonical test execution is a required real owner-supplied port. */
export function createUnitRepair(options: {
  contextId: string;
  unit: string;
  suite: string;
  editablePaths: readonly string[];
  vcs: Pick<
    WorkspaceRuntime["vcs"],
    "status" | "resolveRepository" | "listFiles" | "readFile" | "edit"
  >;
  build: { getBuildReport(unit: string, ref: string): Promise<unknown> };
  verifyTests(command: {
    operation: "test";
    target: string;
    suite: string;
  }): Promise<unknown>;
}) {
  const { contextId, unit, suite, vcs } = options;
  if (!/^(?:workers|terminal-apps)\/[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(unit) ||
      !expectedBuildUnitName(unit))
    throw new Error("Assign one worker or terminal app repository.");
  const runtime = isTerminalAppLocation(unit) ? "native" : "workerd";
  const allowed = new Set(options.editablePaths);
  const validPath = (path: string) =>
    path.startsWith(unit + "/") &&
    !path
      .split("/")
      .some((part) => part === "." || part === ".." || part.includes("\\"));
  if (
    !allowed.size ||
    [...allowed].some(
      (path) =>
        !validPath(path) ||
        /(?:^|\/)(?:package\.json|.*\.test\.[^/]+)$/u.test(path),
    )
  )
    throw new Error(
      "Assign existing production source paths; manifests and regression tests remain protected.",
    );
  const head = async () =>
    JSON.stringify((await vcs.status({ contextId })).workingHead);
  const basis = async (expected: string) => {
    const value = (await vcs.status({ contextId })).workingHead;
    if (JSON.stringify(value) !== expected)
      throw new Error(
        "Revision changed; observe the current source before acting.",
      );
    return value;
  };
  const read = async (expected: string, path: string) => {
    if (!validPath(path))
      throw new Error("Read source only in the assigned unit repository.");
    const state = await basis(expected);
    const repo = await vcs.resolveRepository({ state, repoPath: unit });
    if (!repo) throw new Error("Assigned worker repository is absent.");
    const file = await vcs.readFile({
      state,
      repositoryId: repo.repositoryId,
      file: { kind: "path", path: path.slice(unit.length + 1) },
    });
    if (!file || file.content.kind !== "text")
      throw new Error("Read an existing text source file.");
    await basis(expected);
    return file;
  };
  let evidence: Evidence | undefined;
  const build = async (expected: string): Promise<Evidence> => {
    await basis(expected);
    const report = unitBuildReportSchema.parse(
      await options.build.getBuildReport(unit, `ctx:${contextId}`),
    );
    await basis(expected);
    if (report.repoPath !== unit)
      throw new Error("Build report names another repository.");
    evidence = unitRepairEvidenceSchema.parse({
      revision: expected,
      build: report,
      tests: null,
    });
    return structuredClone(evidence);
  };
  const unitRepair = Object.freeze({
    observe: async () => build(await head()),
    async listSource(expected: string): Promise<string[]> {
      const state = await basis(expected),
        repo = await vcs.resolveRepository({ state, repoPath: unit });
      if (!repo) throw new Error("Assigned worker repository is absent.");
      const collect = async (
        cursor?: string,
        seen: string[] = [],
      ): Promise<string[]> => {
        const page = await vcs.listFiles({
          state,
          repositoryId: repo.repositoryId,
          ...(cursor ? { cursor } : {}),
        });
        if (page.nextCursor && seen.includes(page.nextCursor))
          throw new Error("Source inventory repeated a continuation cursor.");
        const paths = page.files.map((file) => `${unit}/${file.path}`);
        return page.nextCursor
          ? paths.concat(
              await collect(page.nextCursor, [...seen, page.nextCursor]),
            )
          : paths;
      };
      const paths = await collect();
      await basis(expected);
      return paths;
    },
    async readSource(expected: string, paths: string[]) {
      return Promise.all(
        paths.map(async (path) => {
          const file = await read(expected, path);
          return {
            path,
            text: file.content.kind === "text" ? file.content.text : "",
          };
        }),
      );
    },
  });
  const unitRepairEdit = Object.freeze({
    async apply(expected: string, edits: Edit[]) {
      if (
        !edits.length ||
        new Set(edits.map((edit) => edit.path)).size !== edits.length
      )
        throw new Error("Supply distinct production file edits.");
      const changes = await Promise.all(
        edits.map(async (edit) => {
          if (!allowed.has(edit.path))
            throw new Error(
              "This path is outside caller-assigned editable production source.",
            );
          const file = await read(expected, edit.path);
          if (file.content.kind !== "text" || file.content.text !== edit.before)
            throw new Error(
              "Source text changed; inspect it and propose a fresh edit.",
            );
          return {
            kind: "text-edit" as const,
            repositoryId: file.repositoryId,
            fileId: file.fileId,
            edits: [{ start: 0, end: edit.before.length, text: edit.after }],
          };
        }),
      );
      const result = await vcs.edit({
        contextId,
        commandId: crypto.randomUUID(),
        expectedWorkingHead: await basis(expected),
        changes,
      });
      evidence = undefined;
      return { revision: JSON.stringify(result.workingHead) };
    },
    build,
    async test(expected: string): Promise<Evidence> {
      await basis(expected);
      const built = evidence;
      if (built?.revision !== expected || built.build.status !== "ok")
        throw new Error(
          "Build this exact revision successfully before running its suite.",
        );
      const result = unitRepairTestEvidenceSchema.parse(
        await options.verifyTests({ operation: "test", target: unit, suite }),
      );
      await basis(expected);
      const receipt = result.receipt;
      if (
        receipt.operation !== "test" ||
        receipt.target !== unit ||
        receipt.contextId !== contextId ||
        receipt.ref !== `ctx:${contextId}` ||
        receipt.suite !== suite ||
        receipt.runtime !== runtime ||
        receipt.stateHash !== built.build.stateHash
      )
        throw new Error(
          "Test receipt does not match the assigned candidate and declared suite runtime.",
        );
      if (
        result.status !== "compilation-failed" &&
        (result.report.runtime !== runtime ||
          result.report.contextId !== contextId ||
          result.report.target !== unit ||
          !receipt.artifactKey ||
          !receipt.executionDigest ||
          result.report.artifactKey !== receipt.artifactKey ||
          result.report.executionDigest !== receipt.executionDigest)
      )
        throw new Error(
          "Test execution lacks matching actual artifact and execution identity.",
        );
      evidence = { ...built, tests: result };
      return structuredClone(evidence);
    },
  });
  return Object.freeze({ unitRepair, unitRepairEdit });
}
