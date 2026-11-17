import { unitBuildReportSchema } from "@vibestudio/service-schemas/build";
import type { WorkspaceRuntime, PanelHandle } from "@workspace/runtime/hosted";
import type { z } from "zod";
import type { panelRepairMethods } from "./contracts.js";
type Observation = z.infer<typeof panelRepairMethods.observe.returns>;
type Edit = z.infer<typeof panelRepairMethods.apply.args>[1][number];
type Interaction = z.infer<typeof panelRepairMethods.interact.args>[1];

/** Bind only the caller's selected panel/context; effects use the original authority-scoped clients. */
export function createPanelRepair(options: {
  contextId: string;
  panelSource: string;
  panel: PanelHandle;
  vcs: Pick<WorkspaceRuntime["vcs"], "status" | "resolveRepository" | "listFiles" | "readFile" | "edit">;
  build: { getBuildReport(source: string, ref: string): Promise<unknown> };
}) {
  let built: { revision: string; buildKey: string } | undefined;
  const { panel, vcs, contextId, panelSource } = options;
  if (!/^panels\/[^/]+$/u.test(panelSource)) throw new Error("Assign one panel repository such as panels/my-panel.");
  const revision = async () => JSON.stringify((await vcs.status({ contextId })).workingHead);
  const basis = async (expected: string) => {
    const state = (await vcs.status({ contextId })).workingHead;
    if (JSON.stringify(state) !== expected)
      throw new Error("Workspace revision changed; observe and diagnose the current source before editing.");
    return state;
  };
  const scoped = async () => {
    const value = await panel.observe();
    if (
      value.contextId !== contextId ||
      value.source !== panelSource ||
      value.kind !== "workspace" ||
      value.requestedRef !== `ctx:${contextId}`
    )
      throw new Error("The assigned panel no longer belongs to the selected workspace source and context.");
    return value;
  };
  const generation = (value: Awaited<ReturnType<typeof scoped>>) =>
    JSON.stringify([value.panelId, value.attemptId, value.runtimeEntityId, value.buildKey]);
  const observe = async (): Promise<Observation> => {
    const value = await scoped();
    const console = (await panel.cdp.consoleHistory()).entries.map((entry) => entry.message);
    const controls: string[] = [];
    if (value.phase === "ready") {
      const snapshot = await panel.snapshot();
      if (
        snapshot.panelId !== value.panelId ||
        snapshot.attemptId !== value.attemptId ||
        snapshot.runtimeEntityId !== value.runtimeEntityId ||
        snapshot.buildKey !== value.buildKey
      )
        throw new Error("Rendered snapshot belongs to a different panel attempt; observe the current generation.");
      controls.push(snapshot.document.text, JSON.stringify(snapshot.document.structure));
      if (generation(await scoped()) !== generation(value))
        throw new Error("Panel changed while observing its rendered document.");
    }
    return {
      revision: await revision(),
      generation: generation(value),
      phase: value.phase,
      controls,
      console,
      buildDiagnostics: value.failure ? [JSON.stringify(value.failure)] : [],
    };
  };
  const read = async (expected: string, path: string) => {
    if (!path.startsWith(`${panelSource}/`) || path.split("/").some((part) => part === ".." || part === "."))
      throw new Error("Read and edit files only in the assigned panel repository.");
    const state = await basis(expected);
    const repository = await vcs.resolveRepository({
      state,
      repoPath: panelSource,
    });
    if (!repository) throw new Error("The assigned panel repository is absent at this revision.");
    const file = await vcs.readFile({
      state,
      repositoryId: repository.repositoryId,
      file: { kind: "path", path: path.slice(panelSource.length + 1) },
    });
    if (!file || file.content.kind !== "text")
      throw new Error("Read an existing text source file in the assigned panel.");
    return file;
  };
  return Object.freeze({
    observe,
    async interact(expected: string, interaction: Interaction) {
      const observations: string[] = [];
      for (const step of interaction.steps) {
        if (generation(await scoped()) !== expected)
          throw new Error("Panel generation changed; observe again and choose controls from the current document.");
        const { page } = await panel.cdp.session();
        if (generation(await scoped()) !== expected)
          throw new Error("Panel changed while binding its browser session.");
        const locator = page.getByRole(step.role, {
          name: step.name,
          exact: true,
        });
        if ((await locator.count()) !== 1)
          throw new Error("Choose exactly one control by its observed role and accessible name.");
        if (step.kind === "click") await locator.click();
        else if (step.kind === "fill") await locator.fill(step.text);
        const control =
          step.role === "textbox" || step.role === "combobox"
            ? await locator.inputValue()
            : await locator.textContent();
        const after = await observe();
        if (after.generation !== expected)
          throw new Error("Panel generation changed during interaction; observe its new attempt before continuing.");
        observations.push(JSON.stringify({ step, control, after }));
      }
      return { observations };
    },
    async listSource(expected: string) {
      const state = await basis(expected);
      const repository = await vcs.resolveRepository({
        state,
        repoPath: panelSource,
      });
      if (!repository) throw new Error("The assigned panel repository is absent.");
      const collect = async (cursor?: string, seen: string[] = []): Promise<string[]> => {
        const page = await vcs.listFiles({
          state,
          repositoryId: repository.repositoryId,
          ...(cursor ? { cursor } : {}),
        });
        const files = page.files.map((file) => `${panelSource}/${file.path}`);
        if (!page.nextCursor) return files;
        if (seen.includes(page.nextCursor))
          throw new Error("Source listing repeated a cursor; repair the VCS continuation.");
        return files.concat(await collect(page.nextCursor, [...seen, page.nextCursor]));
      };
      return collect();
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
    async apply(expected: string, edits: Edit[]) {
      if (!edits.length || new Set(edits.map((edit) => edit.path)).size !== edits.length)
        throw new Error("Supply a nonempty set of distinct panel file edits.");
      const changes = await Promise.all(
        edits.map(async (edit) => {
          const file = await read(expected, edit.path);
          if (file.content.kind !== "text" || file.content.text !== edit.before)
            throw new Error("Source text changed; read the current revision and propose a new exact edit.");
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
      return { revision: JSON.stringify(result.workingHead) };
    },
    async build(expected: string) {
      await basis(expected);
      const report = await options.build.getBuildReport(panelSource, `ctx:${contextId}`);
      await basis(expected);
      const result = unitBuildReportSchema.parse(report);
      if (result.repoPath !== panelSource) throw new Error("Build report belongs to another panel repository.");
      const buildKey = result.builds.find((target) => target.target === "runtime")?.buildKey;
      const passed = result.status === "ok" && typeof buildKey === "string" && buildKey.length > 0;
      built = passed ? { revision: expected, buildKey: buildKey! } : undefined;
      return {
        revision: expected,
        passed,
        diagnostics: result.diagnostics.map((item) => JSON.stringify(item)),
      };
    },
    async rebuild(expected: string) {
      if (built?.revision !== expected)
        throw new Error("Build this exact revision successfully before rebuilding the assigned panel.");
      await basis(expected);
      await scoped();
      const targetKey = built.buildKey;
      const activated = await panel.rebuild();
      if (activated.buildKey !== targetKey)
        throw new Error("Rebuilt panel did not activate the exact successful candidate build.");
      await basis(expected);
      return observe();
    },
  });
}
