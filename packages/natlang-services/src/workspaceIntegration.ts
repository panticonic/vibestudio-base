import type { VcsClient } from "@workspace/runtime";
import type {
  VcsStateNodeRef,
  VcsMergeSource,
  VcsMergeCoordinateRef,
} from "@vibestudio/service-schemas/vcs";

type Client = Pick<
  VcsClient,
  "status" | "compare" | "readFile" | "edit" | "merge"
>;
type Decision = {
  coordinate: VcsMergeCoordinateRef;
  resolution: "composed" | "theirs" | "ours" | "current";
  rationale: string;
};
const key = (coordinate: VcsMergeCoordinateRef) =>
  `${coordinate.kind}:${coordinate.id}`;

/** Real caller-scoped VCS adapter. Caller assigns context, committed source and exact files. No publication API. */
export function createWorkspaceIntegration(options: {
  vcs: Client;
  contextId: string;
  source: VcsMergeSource;
  files: readonly {
    repositoryId: string;
    path: string;
    workspacePath: string;
  }[];
}) {
  const { vcs, contextId } = options;
  const source = { ...options.source };
  const assignments = options.files.map((file) => Object.freeze({ ...file }));
  const states = new Set<string>();
  const remember = (state: VcsStateNodeRef) => {
    const token = JSON.stringify(state);
    states.add(token);
    return token;
  };
  const current = async (expected?: string) => {
    const state = (await vcs.status({ contextId })).workingHead;
    if (
      expected !== undefined &&
      (!states.has(expected) || JSON.stringify(state) !== expected)
    )
      throw new Error(
        "Working head changed; observe the actual state before proposing another operation.",
      );
    return state;
  };
  const readAssigned = async (
    state: VcsStateNodeRef,
    file: (typeof assignments)[number],
  ) => {
    const value = await vcs.readFile({
      state,
      repositoryId: file.repositoryId,
      file: { kind: "path", path: file.path },
    });
    if (!value || value.content.kind !== "text")
      throw new Error("Assigned integration text file is missing.");
    return {
      repositoryId: value.repositoryId,
      fileId: value.fileId,
      text: value.content.text,
    };
  };
  const compare = async (target: VcsStateNodeRef) => {
    const rows: Awaited<ReturnType<Client["compare"]>>[] = [];
    const page = async (
      cursor?: string,
      seen: string[] = [],
    ): Promise<void> => {
      const value = await vcs.compare({
        target,
        source,
        ...(cursor ? { cursor } : {}),
      });
      rows.push(value);
      if (value.nextCursor) {
        if (seen.includes(value.nextCursor))
          throw new Error("VCS comparison repeated a cursor.");
        await page(value.nextCursor, [...seen, value.nextCursor]);
      }
    };
    await page();
    return rows;
  };
  return Object.freeze({
    async observe() {
      const state = await current();
      const pages = await compare(state);
      const coordinates = pages.flatMap((page) => page.coordinates);
      const intents = pages.flatMap((page) => page.intents);
      const files = await Promise.all(
        assignments.map(async (file) => {
          const value = await readAssigned(state, file);
          return { path: file.workspacePath, text: value.text };
        }),
      );
      return {
        head: remember(state),
        source: JSON.stringify(source),
        currentIntent: intents
          .filter((intent) => intent.side === "ours")
          .map((intent) => JSON.stringify(intent)),
        sourceIntent: intents
          .filter((intent) => intent.side === "theirs")
          .map((intent) => JSON.stringify(intent)),
        coordinates: coordinates.map((item) => ({
          kind: item.coordinate.kind,
          id: item.coordinate.id,
        })),
        remaining: coordinates
          .filter(
            (item) =>
              item.status !== "resolved" && item.status !== "convergent",
          )
          .map((item) => ({
            kind: item.coordinate.kind,
            id: item.coordinate.id,
          })),
        files,
        evidence: pages.map((page) => JSON.stringify(page)),
      };
    },
    async apply(
      expected: string,
      edits: { path: string; before: string; after: string }[],
    ) {
      const state = await current(expected);
      if (
        !edits.length ||
        new Set(edits.map((edit) => edit.path)).size !== edits.length
      )
        throw new Error("Supply distinct nonempty assigned-file edits.");
      const changes = await Promise.all(
        edits.map(async (edit) => {
          const file = assignments.find(
            (item) => item.workspacePath === edit.path,
          );
          if (!file)
            throw new Error(
              "Edit only the exact files assigned by the caller.",
            );
          const value = await readAssigned(state, file);
          if (value.text !== edit.before)
            throw new Error(
              "Before text differs. Read current source before editing.",
            );
          return {
            kind: "text-edit" as const,
            repositoryId: value.repositoryId,
            fileId: value.fileId,
            edits: [{ start: 0, end: edit.before.length, text: edit.after }],
          };
        }),
      );
      await current(expected);
      const result = await vcs.edit({
        contextId,
        commandId: crypto.randomUUID(),
        expectedWorkingHead: state,
        changes,
      });
      return { head: remember(result.workingHead) };
    },
    async merge(expected: string, decisions: Decision[]) {
      const state = await current(expected);
      const pages = await compare(state);
      const allowed = new Map(
        pages
          .flatMap((page) => page.coordinates)
          .map((item) => [key(item.coordinate), item]),
      );
      const assigned = await Promise.all(
        assignments.map((file) => readAssigned(state, file)),
      );
      const fileIds = new Set(assigned.map((file) => file.fileId));
      const seen = new Set<string>();
      for (const decision of decisions) {
        const item = allowed.get(key(decision.coordinate));
        if (
          decision.coordinate.kind !== "file" ||
          !fileIds.has(decision.coordinate.id)
        )
          throw new Error("Integrate coordinates of the assigned files.");
        if (
          !item ||
          item.status === "resolved" ||
          seen.has(key(decision.coordinate)) ||
          !item.resolutions.includes(decision.resolution)
        )
          throw new Error(
            "Choose each observed unresolved coordinate and one of its offered resolutions exactly once.",
          );
        if (!decision.rationale.trim())
          throw new Error(
            "Explain the intention preserved by each integration decision.",
          );
        seen.add(key(decision.coordinate));
      }
      // The native default also selects nonconflicting coordinates outside an
      // explicit decision list. Limit every selection to assigned files.
      const coordinates = [...allowed.values()]
        .filter(({ coordinate, status }) =>
          coordinate.kind === "file" &&
          fileIds.has(coordinate.id) &&
          (seen.has(key(coordinate)) ||
            status === "convergent" ||
            (decisions.length > 0 && (status === "adopt" || status === "composed"))),
        )
        .map(({ coordinate: { kind, id } }) => ({ kind, id }));
      if (!coordinates.length)
        throw new Error("No assigned coordinate can be selected for this merge.");
      await current(expected);
      const result = await vcs.merge({
        contextId,
        commandId: crypto.randomUUID(),
        expectedWorkingHead: state,
        source,
        coordinates,
        resolutions: decisions,
      });
      return { head: remember(result.workingHead) };
    },
  });
}
