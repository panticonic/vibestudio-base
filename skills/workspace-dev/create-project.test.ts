import { composedWorkspaceRoot } from "./composedWorkspace.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseUnitAuthorityManifest } from "@vibestudio/shared/authorityManifest";
import YAML from "yaml";
import type { ApplicationAuthorityPolicy } from "./create-project.js";

const noEffects = { requests: [], provides: [] };
const recordMethods = {
  listRecords: {
    website: { kind: "closed" as const, reason: "Workspace-private records" },
    principals: ["user", "code"] as const,
    effect: { kind: "open" as const },
    tier: "open" as const,
    sensitivity: "read" as const,
  },
  upsertRecord: {
    website: { kind: "closed" as const, reason: "Workspace-private records" },
    principals: ["user", "code"] as const,
    effect: { kind: "open" as const },
    tier: "open" as const,
    sensitivity: "write" as const,
  },
};
function applicationPolicy(name: string): ApplicationAuthorityPolicy {
  const className =
    name
      .split("-")
      .map((part) => part[0]!.toUpperCase() + part.slice(1))
      .join("") + "Store";
  return {
    rationale:
      "Workspace-private records: the named panel may use its store, other callers require consent. No unrelated host effects or website access.",
    panel: {
      requests: [
        {
          capability: `workspace-service:${name}-store`,
          resource: {
            kind: "exact",
            key: `do:workers/${name}-store:${className}:main`,
          },
          tier: "gated",
          evidence: "exact",
        },
      ],
      provides: [],
      serviceRequests: [{ protocol: `${name}.v1`, availability: "required" }],
    },
    worker: noEffects,
    methods: recordMethods,
    service: {
      principals: ["user", "code"],
      binding: { declaredFor: [`panels/${name}`] },
      notability: "everyday",
    },
  };
}

const mocks = vi.hoisted(() => {
  const files = new Map<string, string | Uint8Array>();
  const dirs = new Set<string>();
  const status = vi.fn();
  const edit = vi.fn();
  const commit = vi.fn();
  const push = vi.fn();
  const resolveRepository = vi.fn();
  const readFile = vi.fn();
  const validateConfig = vi.fn();
  return {
    files,
    dirs,
    status,
    edit,
    commit,
    push,
    resolveRepository,
    readFile,
    validateConfig,
  };
});

function normalize(p: string): string {
  return p.replace(/^\/+|\/+$/g, "").replace(/\/+/g, "/");
}

function addDir(p: string): void {
  const normalized = normalize(p);
  if (!normalized) return;
  const parts = normalized.split("/");
  for (let i = 1; i <= parts.length; i++)
    mocks.dirs.add(parts.slice(0, i).join("/"));
}

function addFile(p: string, content: string | Uint8Array): void {
  const normalized = normalize(p);
  const parent = normalized.split("/").slice(0, -1).join("/");
  addDir(parent);
  mocks.files.set(normalized, content);
}

vi.mock("@workspace/runtime", () => ({
  vcs: {
    resolveRepository: mocks.resolveRepository,
    readFile: mocks.readFile,
    status: mocks.status,
    edit: mocks.edit,
    commit: mocks.commit,
    push: mocks.push,
  },
  contextId: "ctx:test",
  rpc: { call: mocks.validateConfig },
  fs: {
    async exists(p: string): Promise<boolean> {
      const normalized = normalize(p);
      return mocks.files.has(normalized) || mocks.dirs.has(normalized);
    },
    async readdir(
      p: string,
      opts?: { withFileTypes?: boolean },
    ): Promise<string[] | Array<{ name: string; isDirectory(): boolean }>> {
      const normalized = normalize(p);
      const prefix = normalized ? `${normalized}/` : "";
      const names = new Map<string, boolean>();
      for (const file of mocks.files.keys()) {
        if (!file.startsWith(prefix)) continue;
        const rest = file.slice(prefix.length);
        const [name, ...tail] = rest.split("/");
        names.set(name!, tail.length > 0);
      }
      for (const dir of mocks.dirs) {
        if (!dir.startsWith(prefix) || dir === normalized) continue;
        const rest = dir.slice(prefix.length);
        const [name, ...tail] = rest.split("/");
        names.set(name!, tail.length > 0 || mocks.dirs.has(`${prefix}${name}`));
      }
      if (opts?.withFileTypes) {
        return [...names].map(([name, isDir]) => ({
          name,
          isDirectory: () => isDir,
        }));
      }
      return [...names.keys()];
    },
    async readFile(p: string, encoding?: string): Promise<string | Uint8Array> {
      const content = mocks.files.get(normalize(p));
      if (content === undefined)
        throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      if (encoding && content instanceof Uint8Array)
        return new TextDecoder().decode(content);
      return content;
    },
    async mkdir(p: string): Promise<void> {
      addDir(p);
    },
    async writeFile(p: string, content: string | Uint8Array): Promise<void> {
      addFile(p, content);
    },
  },
}));

function resetRuntimeMocks(): void {
  mocks.files.clear();
  mocks.resolveRepository
    .mockReset()
    .mockResolvedValue({ repositoryId: "repo:meta", repoPath: "meta" });
  mocks.readFile.mockReset().mockImplementation(async () => ({
    repositoryId: "repo:meta",
    fileId: "file:config",
    content: {
      kind: "text",
      text: mocks.files.get("meta/vibestudio.yml") ?? "systemEpoch: 0\n",
    },
  }));
  mocks.validateConfig.mockReset().mockResolvedValue(undefined);
  mocks.dirs.clear();
  addFile(
    "packages/svelte/package.json",
    JSON.stringify({
      name: "@workspace/svelte",
      peerDependencies: { svelte: "^5.56.9" },
    }),
  );
  mocks.status.mockReset();
  mocks.edit.mockReset();
  mocks.commit.mockReset();
  mocks.push.mockReset();
  mocks.status.mockResolvedValue({
    contextId: "ctx:test",
    committed: { kind: "event", eventId: "event:committed" },
    workingHead: { kind: "application", applicationId: "application:working" },
    clean: false,
    mainEventId: "event:main",
    mainRelation: "ahead",
    workingCounts: { applications: 1, workUnits: 0, changes: 0 },
    integrating: [],
  });
  mocks.edit.mockImplementation(
    async (input: {
      changes: Array<{
        kind: string;
        edits?: Array<{ text: string }>;
        repoPath: string;
        files: Array<{
          path: string;
          content:
            | { kind: "text"; text: string }
            | { kind: "bytes"; base64: string };
        }>;
      }>;
    }) => {
      for (const change of input.changes) {
        if (change.kind === "text-edit") {
          addFile("meta/vibestudio.yml", change.edits![0]!.text);
          continue;
        }
        for (const file of change.files) {
          addFile(
            `${change.repoPath}/${file.path}`,
            file.content.kind === "text"
              ? file.content.text
              : Uint8Array.from(atob(file.content.base64), (character) =>
                  character.charCodeAt(0),
                ),
          );
        }
      }
      return {
        workingHead: {
          kind: "application",
          applicationId: "application:created",
        },
      };
    },
  );
  mocks.commit.mockResolvedValue({
    event: { kind: "event", eventId: "event:committed" },
  });
  mocks.push.mockResolvedValue({
    contextId: "ctx:test",
    eventId: "event:committed",
    mainEventId: "event:committed",
    effectId: "effect:published",
    appliedAt: "2026-07-24T00:00:00.000Z",
  });
}

describe("prepareProjects", () => {
  it("requires deliberate authority decisions before any edit", async () => {
    resetRuntimeMocks();
    const { prepareApplication, prepareProjects } =
      await import("./index.js");
    await expect(
      prepareProjects([
        { projectType: "panel", name: "missing-policy" } as never,
      ]),
    ).rejects.toThrow("explicit authority manifest");
    await expect(
      prepareApplication({ name: "missing-policy" } as never),
    ).rejects.toThrow("explicit");
    await expect(
      prepareProjects([
        {
          projectType: "worker",
          name: "missing-methods",
          template: "durable-service",
          authority: noEffects,
          authorityReason: "Private store",
        },
      ]),
    ).rejects.toThrow("explicit website");
    expect(mocks.edit).not.toHaveBeenCalled();
  });

  it("does not fill in missing requests or change chosen binding policy", async () => {
    resetRuntimeMocks();
    const { prepareApplication } = await import("./index.js");
    const policy = applicationPolicy("manual");
    policy.panel = noEffects;
    policy.service = {
      ...policy.service,
      binding: "consent",
      notability: "headline",
    };
    const result = await prepareApplication({
      name: "manual",
      authority: policy,
    });
    expect(result.panel.authorityReview?.manifest.requests).toEqual([]);
    expect(result.panel.authorityReview?.manifest.serviceRequests).toEqual([]);
    expect(
      YAML.parse(mocks.files.get("meta/vibestudio.yml") as string).services[0],
    ).toMatchObject({
      notability: "headline",
      authority: { binding: "consent" },
    });
    expect(mocks.commit).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("propagates a preparation failure without attempting commit or push", async () => {
    resetRuntimeMocks();
    const { prepareProjects } = await import("./index.js");
    mocks.edit.mockRejectedValueOnce(new Error("Working head changed"));
    await expect(
      prepareProjects([{ projectType: "project", name: "race" }]),
    ).rejects.toThrow("Working head changed");
    expect(mocks.commit).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });
  it("prepares a connected application in one validated edit without publishing", async () => {
    resetRuntimeMocks();
    const { prepareApplication } = await import("./index.js");
    const result = await prepareApplication({
      authority: applicationPolicy("notes"),
      name: "notes",
      title: "Notes",
    });
    expect(result.panel.created).toBe("panels/notes");
    expect(result.worker.created).toBe("workers/notes-store");
    expect(result.service).toMatchObject({
      protocol: "notes.v1",
      className: "NotesStore",
      objectKey: "main",
    });
    const config = YAML.parse(mocks.files.get("meta/vibestudio.yml") as string);
    expect(config.services[0]).toMatchObject({
      name: "notes-store",
      authority: { binding: { declaredFor: ["panels/notes"] } },
      protocols: ["notes.v1"],
    });
    expect(config.singletonObjects).toEqual([
      { source: "workers/notes-store", className: "NotesStore", key: "main" },
    ]);
    const manifest = JSON.parse(
      mocks.files.get("panels/notes/package.json") as string,
    );
    expect(manifest.vibestudio.authority.serviceRequests).toEqual([
      { protocol: "notes.v1", availability: "required" },
    ]);
    expect(manifest.vibestudio.authority.requests).toContainEqual({
      capability: "workspace-service:notes-store",
      resource: {
        kind: "exact",
        key: "do:workers/notes-store:NotesStore:main",
      },
      tier: "gated",
      evidence: "exact",
    });
    expect(mocks.edit).toHaveBeenCalledTimes(1);
    expect(
      mocks.edit.mock.calls[0]![0].changes.map(
        (change: { kind: string }) => change.kind,
      ),
    ).toEqual(["repository-create", "repository-create", "text-edit"]);
    expect(mocks.validateConfig).toHaveBeenCalledWith(
      "main",
      "workspace.validateConfig",
      [expect.any(String)],
    );
    expect(mocks.commit).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
    expect(result.preparation).toMatchObject({
      publication: "unchanged",
      liveRuntime: "unchanged",
      workingHead: {
        kind: "application",
        applicationId: "application:created",
      },
    });
    expect(result.authorityReview).toEqual(applicationPolicy("notes"));
  });

  it("refuses collisions and invalid complete config before any edit", async () => {
    resetRuntimeMocks();
    const { prepareApplication } = await import("./index.js");
    addFile(
      "meta/vibestudio.yml",
      "services:\n  - source: workers/existing\n    name: notes-store\n",
    );
    await expect(
      prepareApplication({
        authority: applicationPolicy("notes"),
        name: "notes",
      }),
    ).rejects.toThrow("already declared");
    expect(mocks.edit).not.toHaveBeenCalled();
    addFile("meta/vibestudio.yml", "systemEpoch: 0\n");
    mocks.validateConfig.mockRejectedValueOnce(new Error("invalid config"));
    await expect(
      prepareApplication({
        authority: applicationPolicy("notes"),
        name: "notes",
      }),
    ).rejects.toThrow("invalid config");
    expect(mocks.edit).not.toHaveBeenCalled();
  });

  beforeEach(resetRuntimeMocks);
  afterEach(() => vi.restoreAllMocks());

  it("scaffolds a plain project as a content repo under projects/", async () => {
    const { prepareProjects } = await import("./index.js");

    const [result] = await prepareProjects([
      {
        projectType: "project",
        name: "scratch-notes",
        title: "Scratch Notes",
      },
    ]);

    expect(result).toMatchObject({
      created: "projects/scratch-notes",
      files: ["README.md"],
      preflight: {
        ok: true,
        scope: "planned-repository",
        semanticBuildGate: "pending-publication",
        projectType: "project",
      },
      preparation: {
        publication: "unchanged",
        liveRuntime: "unchanged",
        workingHead: {
          kind: "application",
          applicationId: "application:created",
        },
      },
      authorityReview: null,
    });
    expect(mocks.files.get("projects/scratch-notes/README.md")).toBe(
      "# Scratch Notes\n\nPlain workspace project.\n",
    );
    expect(mocks.files.has("projects/scratch-notes/package.json")).toBe(false);
    expect(mocks.commit).not.toHaveBeenCalled();
    expect(mocks.edit).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedWorkingHead: {
          kind: "application",
          applicationId: "application:working",
        },
        changes: [
          expect.objectContaining({
            kind: "repository-create",
            repoPath: "projects/scratch-notes",
          }),
        ],
      }),
    );
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("rejects removed agent scaffolding", async () => {
    const { prepareProjects } = await import("./index.js");

    await expect(
      prepareProjects([{ projectType: "agent", name: "helper" } as never]),
    ).rejects.toThrow(/panel, package, skill, project, worker/);
    expect(mocks.commit).not.toHaveBeenCalled();
  });

  it("declares the generated panel entry explicitly", async () => {
    const { prepareProjects } = await import("./index.js");

    await prepareProjects([
      {
        authority: noEffects,
        authorityReason: "Fixture has no host effects",
        projectType: "panel",
        name: "hello",
        title: "Hello",
      },
    ]);

    expect(
      JSON.parse(mocks.files.get("panels/hello/package.json") as string),
    ).toMatchObject({
      vibestudio: {
        title: "Hello",
        entry: "index.tsx",
        authority: {
          requests: [],
          provides: [],
        },
        exposeModules: expect.arrayContaining(["react", "react/jsx-runtime"]),
      },
    });
  });

  it("materializes a Lucide identity without adding an icon runtime", async () => {
    addFile(
      "skills/workspace-dev/assets/icons/lucide/messages-square.svg",
      '<svg stroke="currentColor"><path d="M1 1" /></svg>',
    );
    const { prepareProjects } = await import("./index.js");

    await prepareProjects([
      {
        authority: noEffects,
        authorityReason: "Fixture has no host effects",
        projectType: "panel",
        name: "inbox",
        title: "Inbox",
        icon: "lucide:messages-square",
      },
    ]);

    expect(
      JSON.parse(mocks.files.get("panels/inbox/package.json") as string),
    ).toMatchObject({
      vibestudio: { icon: "./assets/icon.svg" },
    });
    expect(mocks.files.get("panels/inbox/assets/icon.svg")).toBe(
      '<svg stroke="#268CA3"><path d="M1 1" /></svg>',
    );
  });

  it.each(["columns-3", "layout-dashboard"])(
    "scaffolds the real upstream %s icon while reading only the selected SVG",
    async (name) => {
      const { readFileSync } = await import("node:fs");
      const path = await import("node:path");
      const { fileURLToPath } = await import("node:url");
      const root = composedWorkspaceRoot(
        path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."),
      );
      const source = `skills/workspace-dev/assets/icons/lucide/${name}.svg`;
      const svg = readFileSync(path.join(root, source), "utf8");
      addFile(source, svg);
      // Other artwork must never be read or enumerated on the success path.
      addFile(
        "skills/workspace-dev/assets/icons/lucide/database.svg",
        "<svg />",
      );
      const { fs } = await import("@workspace/runtime");
      const read = vi.spyOn(fs, "readFile");
      const list = vi.spyOn(fs, "readdir");
      const { prepareProjects } = await import("./index.js");
      await prepareProjects([
        {
          authority: noEffects,
          authorityReason: "Fixture has no host effects",
          projectType: "panel",
          name: "board",
          icon: `lucide:${name}`,
        },
      ]);
      expect(mocks.files.get("panels/board/assets/icon.svg")).toBe(
        svg.replaceAll("currentColor", "#268CA3"),
      );
      expect(
        JSON.parse(mocks.files.get("panels/board/package.json") as string),
      ).toMatchObject({ vibestudio: { icon: "./assets/icon.svg" } });
      expect(
        read.mock.calls.filter(([file]) =>
          file.startsWith("skills/workspace-dev/assets/icons/"),
        ),
      ).toEqual([[source, "utf-8"]]);
      expect(
        list.mock.calls.filter(([file]) =>
          file.startsWith("skills/workspace-dev/assets/icons/"),
        ),
      ).toEqual([]);
    },
  );

  it("keeps full icon listing complete and catalog discovery bounded above 500 icons", async () => {
    for (let index = 0; index < 520; index += 1) {
      addFile(
        `skills/workspace-dev/assets/icons/lucide/icon-${index}.svg`,
        "<svg />",
      );
    }
    for (const name of [
      "claude",
      "git",
      "gmail",
      "gnubash",
      "javascript",
      "react",
      "svelte",
      "typescript",
    ]) {
      addFile(
        `skills/workspace-dev/assets/icons/brands/${name}.svg`,
        "<svg />",
      );
    }
    const { listProjectIcons, searchProjectCatalog } =
      await import("./index.js");
    expect(await listProjectIcons()).toHaveLength(528);
    const catalog = await searchProjectCatalog({ resource: "icon" });
    expect(catalog).toMatchObject({ total: 528, truncated: 516 });
    expect(catalog.entries).toHaveLength(12);
  });

  it("ranks spaced names and qualified ids consistently with recovery suggestions", async () => {
    for (const name of [
      "columns-3",
      "columns-3-cog",
      "layout-dashboard",
      "layout-template",
      "database",
    ]) {
      addFile(
        `skills/workspace-dev/assets/icons/lucide/${name}.svg`,
        "<svg />",
      );
    }
    const { searchProjectCatalog, prepareProjects, ProjectIconError } =
      await import("./index.js");
    for (const query of [
      "layout dashboard",
      "lucide:layout-dashboard",
      "layout-dashbord",
    ]) {
      const result = await searchProjectCatalog({
        resource: "icon",
        families: ["lucide"],
        query,
        limit: 1,
      });
      expect(result.entries[0]?.id).toBe("lucide:layout-dashboard");
    }
    const failure = (await prepareProjects([
      {
        authority: noEffects,
        authorityReason: "Fixture has no host effects",
        projectType: "panel",
        name: "board",
        icon: "lucide:layout-dashbord",
      },
    ]).catch((error: unknown) => error)) as InstanceType<
      typeof ProjectIconError
    >;
    expect(failure).toBeInstanceOf(ProjectIconError);
    expect(failure.message).toContain("Try lucide:layout-dashboard");
    expect(failure.errorData.suggestions).toEqual(
      failure.errorData.catalog.entries.slice(0, 5).map((entry) => entry.id),
    );
    expect(mocks.edit).not.toHaveBeenCalled();
  });

  it("discovers the exact icon catalog instead of requiring guessed names", async () => {
    addFile("skills/workspace-dev/assets/icons/lucide/database.svg", "<svg />");
    addFile(
      "skills/workspace-dev/assets/icons/lucide/messages-square.svg",
      "<svg />",
    );
    for (const name of [
      "claude",
      "git",
      "gmail",
      "gnubash",
      "javascript",
      "react",
      "svelte",
      "typescript",
    ]) {
      addFile(
        `skills/workspace-dev/assets/icons/brands/${name}.svg`,
        "<svg />",
      );
    }
    const { listProjectIcons, searchProjectCatalog } =
      await import("./index.js");

    await expect(listProjectIcons()).resolves.toEqual([
      "brand:claude",
      "brand:git",
      "brand:gmail",
      "brand:gnubash",
      "brand:javascript",
      "brand:react",
      "brand:svelte",
      "brand:typescript",
      "lucide:database",
      "lucide:messages-square",
    ]);
    await expect(
      searchProjectCatalog({
        resource: "icon",
        query: "message square",
        limit: 1,
      }),
    ).resolves.toMatchObject({
      protocol: "workspace-dev-catalog.v1",
      resource: "icon",
      query: "message square",
      total: 10,
      entries: [
        { resource: "icon", id: "lucide:messages-square", family: "lucide" },
      ],
      truncated: 9,
    });
  });

  it("returns a structured catalog repair plan before creating an unknown icon", async () => {
    addFile("skills/workspace-dev/assets/icons/lucide/database.svg", "<svg />");
    const { prepareProjects, ProjectIconError } =
      await import("./index.js");

    const failure = await prepareProjects([
      {
        authority: noEffects,
        authorityReason: "Fixture has no host effects",
        projectType: "panel",
        name: "board",
        icon: "lucide:columns-3x",
      },
    ]).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ProjectIconError);
    expect(
      (failure as InstanceType<typeof ProjectIconError>).errorData,
    ).toEqual({
      code: "project_icon_invalid",
      icon: "lucide:columns-3x",
      kind: "lucide",
      name: "columns-3x",
      suggestions: ["lucide:database"],
      catalogQuery: {
        resource: "icon",
        query: "columns-3x",
        families: ["lucide"],
        limit: 12,
      },
      catalog: {
        protocol: "workspace-dev-catalog.v1",
        resource: "icon",
        query: "columns-3x",
        total: 1,
        entries: [
          {
            resource: "icon",
            id: "lucide:database",
            family: "lucide",
            name: "database",
          },
        ],
        truncated: 0,
      },
      recovery: {
        action: "correct-request",
        instruction: expect.stringContaining("errorData.catalog.entries"),
      },
    });
    expect(mocks.edit).not.toHaveBeenCalled();
    expect(mocks.commit).not.toHaveBeenCalled();
  });

  it("keeps the built-in default panel deterministic without consulting template files", async () => {
    addFile(
      "templates/default/template.json",
      JSON.stringify({ framework: "svelte" }),
    );
    const { prepareProjects } = await import("./index.js");

    await prepareProjects([
      {
        authority: noEffects,
        authorityReason: "Fixture has no host effects",
        projectType: "panel",
        name: "default-panel",
        title: "Default Panel",
      },
    ]);

    expect(mocks.files.has("panels/default-panel/index.tsx")).toBe(true);
    expect(mocks.files.has("panels/default-panel/App.svelte")).toBe(false);
  });

  it("generates every executable template with the explicitly chosen authority contract", async () => {
    addFile(
      "templates/svelte/template.json",
      JSON.stringify({ framework: "svelte" }),
    );
    const { prepareProjects } = await import("./index.js");

    await prepareProjects([
      {
        authority: noEffects,
        authorityReason: "Fixture has no host effects",
        projectType: "panel",
        name: "react-panel",
        title: "React Panel",
      },
    ]);
    await prepareProjects([
      {
        authority: noEffects,
        authorityReason: "Fixture has no host effects",
        projectType: "panel",
        name: "svelte-panel",
        title: "Svelte Panel",
        template: "svelte",
      },
    ]);
    await prepareProjects([
      {
        authority: noEffects,
        authorityReason: "Fixture has no host effects",
        methods: recordMethods,
        projectType: "worker",
        name: "plain-worker",
        title: "Plain Worker",
      },
    ]);
    await prepareProjects([
      {
        authority: noEffects,
        authorityReason: "Fixture has no host effects",
        methods: recordMethods,
        projectType: "worker",
        name: "durable-worker",
        title: "Durable Worker",
        template: "durable-service",
      },
    ]);
    await prepareProjects([
      {
        authority: noEffects,
        authorityReason: "Fixture has no host effects",
        methods: recordMethods,
        projectType: "worker",
        name: "agent-worker",
        title: "Agent Worker",
        template: "agentic",
      },
    ]);

    for (const [path] of [
      ["panels/react-panel/package.json", "@workspace-panels/react-panel"],
      ["panels/svelte-panel/package.json", "@workspace-panels/svelte-panel"],
      ["workers/plain-worker/package.json", "@workspace-workers/plain-worker"],
      [
        "workers/durable-worker/package.json",
        "@workspace-workers/durable-worker",
      ],
      ["workers/agent-worker/package.json", "@workspace-workers/agent-worker"],
    ] as const) {
      const source = mocks.files.get(path);
      expect(typeof source).toBe("string");
      const manifest = JSON.parse(source as string) as {
        vibestudio: { authority: unknown };
      };
      expect(
        parseUnitAuthorityManifest(manifest.vibestudio.authority).requests,
      ).toEqual([]);
    }
    const durableManifest = JSON.parse(
      mocks.files.get("workers/durable-worker/package.json") as string,
    );
    expect(durableManifest.vibestudio.durable.classes).toEqual([
      { className: "DurableWorker" },
    ]);
    expect(durableManifest.vibestudio.durable.classes[0]).not.toHaveProperty(
      "rpcSchema",
    );
    expect(mocks.files.get("workers/durable-worker/index.ts")).toContain(
      'from "@workspace/runtime/worker/kernel"',
    );
  });

  it("preserves the chosen empty panel ceiling without adding runtime authority", async () => {
    const { prepareProjects } = await import("./index.js");

    await prepareProjects([
      {
        authority: noEffects,
        authorityReason: "Fixture has no host effects",
        projectType: "panel",
        name: "minimal",
        title: "Minimal",
      },
    ]);

    const manifest = JSON.parse(
      mocks.files.get("panels/minimal/package.json") as string,
    );
    expect(manifest.dependencies).toEqual({
      "@workspace/runtime": "workspace:*",
      react: "19.2.4",
      "react-dom": "19.2.4",
    });
    expect(manifest.vibestudio.exposeModules).toEqual([
      "react",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
    ]);
    expect(mocks.files.get("panels/minimal/index.tsx")).not.toMatch(
      /@workspace\/(?:runtime|react|ui)/u,
    );
  });

  it("rejects names and titles that would produce invalid generated source", async () => {
    const { prepareProjects } = await import("./index.js");

    await expect(
      prepareProjects([
        {
          authority: noEffects,
          authorityReason: "Fixture has no host effects",
          projectType: "panel",
          name: "Bad Name",
        },
      ]),
    ).rejects.toThrow(/Project name/);
    await expect(
      prepareProjects([
        {
          authority: noEffects,
          authorityReason: "Fixture has no host effects",
          projectType: "panel",
          name: "valid-name",
          title: 'Broken " title',
        },
      ]),
    ).rejects.toThrow(/Project title/);
    expect(mocks.commit).not.toHaveBeenCalled();
  });

  it("rejects an invalid executable manifest before the first VCS edit", async () => {
    const { preflightProjectFiles } = await import("./project-manifest.js");

    expect(() =>
      preflightProjectFiles({
        projectType: "panel",
        name: "invalid",
        files: {
          "package.json": JSON.stringify({
            name: "@workspace-panels/invalid",
            private: true,
            type: "module",
            vibestudio: { title: "Invalid", entry: "index.tsx" },
          }),
          "index.tsx": "export default function Invalid() { return null; }\n",
        },
      }),
    ).toThrow(/authority/);
    expect(mocks.edit).not.toHaveBeenCalled();
  });

  it("returns the exact invalid project name and a valid generated-name recipe", async () => {
    const { prepareProjects } = await import("./index.js");

    await expect(
      prepareProjects([
        {
          authority: noEffects,
          authorityReason: "Fixture has no host effects",
          projectType: "panel",
          name: "todo-2026-07-24T20:30:00.000Z",
        },
      ]),
    ).rejects.toThrow(
      /Project name "todo-2026-07-24T20:30:00\.000Z" is invalid.*Date\.now\(\)\.toString\(36\).*Raw ISO timestamps/u,
    );
    expect(mocks.edit).not.toHaveBeenCalled();
  });
});

describe("forkProject", () => {
  beforeEach(resetRuntimeMocks);

  it("rejects missing source paths before reading or preparing a fork", async () => {
    const before = new Map(mocks.files);
    const { forkPanel } = await import("./index.js");
    await expect(
      forkPanel({
        name: "copy",
        authority: noEffects,
        authorityReason: "No downstream effects",
      } as unknown as Parameters<typeof forkPanel>[0]),
    ).rejects.toThrow("require from and name");
    expect(mocks.edit).not.toHaveBeenCalled();
    expect(mocks.files).toEqual(before);
  });

  it("rewrites a single-class worker fork and preserves binary files", async () => {
    addDir("workers/source/.git");
    addFile("workers/source/.gad/CHECKOUT.json", "{}");
    addFile("workers/source/.env", "SECRET=yes\n");
    addFile("workers/source/debug.log", "debug\n");
    addFile(
      "workers/source/node_modules/pkg/index.js",
      "module.exports = {}\n",
    );
    addFile(
      "workers/source/package.json",
      JSON.stringify({
        name: "@workspace-workers/source",
        private: true,
        type: "module",
        vibestudio: {
          entry: "source-worker.ts",
          authority: { requests: [], provides: [] },
          durable: { classes: [{ className: "SourceWorker" }] },
        },
      }),
    );
    addFile(
      "workers/source/source-worker.ts",
      'export class SourceWorker { readonly source = "workers/source"; }\n',
    );
    addFile("workers/source/icon.png", new Uint8Array([1, 2, 3]));

    const { forkProject } = await import("./index.js");
    const result = await forkProject({
      authority: noEffects,
      authorityReason: "Fork fixture retains no host effects",
      from: "workers/source",
      to: "workers/new",
      title: "New Worker",
    });

    expect(result.preparation).toMatchObject({
      publication: "unchanged",
      liveRuntime: "unchanged",
    });
    expect(result.files).toContain("new-worker.ts");
    // Forks share the context-local preparation boundary, never automatic publication.
    expect(mocks.commit).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
    // The repository lifecycle transition seeded the projected files.
    expect(
      JSON.parse(mocks.files.get("workers/new/package.json") as string),
    ).toMatchObject({
      name: "@workspace-workers/new",
      vibestudio: {
        title: "New Worker",
        entry: "new-worker.ts",
        durable: { classes: [{ className: "NewWorker" }] },
      },
    });
    expect(mocks.files.get("workers/new/new-worker.ts")).toContain(
      "class NewWorker",
    );
    expect(mocks.files.get("workers/new/new-worker.ts")).toContain(
      "workers/new",
    );
    expect(mocks.files.get("workers/new/icon.png")).toBeInstanceOf(Uint8Array);
    expect(result.files).not.toContain(".gad/CHECKOUT.json");
    expect(result.files).not.toContain(".env");
    expect(result.files).not.toContain("debug.log");
    expect(result.files).not.toContain("node_modules/pkg/index.js");
    expect(mocks.files.has("workers/new/.gad/CHECKOUT.json")).toBe(false);
    expect(mocks.files.has("workers/new/.env")).toBe(false);
    expect(mocks.files.has("workers/new/debug.log")).toBe(false);
    expect(mocks.files.has("workers/new/node_modules/pkg/index.js")).toBe(
      false,
    );
  });

  it("does not textually rewrite a structurally rewritten worker manifest", async () => {
    addFile(
      "workers/source/package.json",
      JSON.stringify({
        name: "@workspace-workers/source",
        private: true,
        type: "module",
        vibestudio: {
          title: "Source",
          entry: "source-worker.ts",
          authority: { requests: [], provides: [] },
          durable: { classes: [{ className: "SourceWorker" }] },
        },
      }),
    );
    addFile(
      "workers/source/source-worker.ts",
      'export class SourceWorker { readonly source = "workers/source"; }\n',
    );

    const { forkProject } = await import("./index.js");
    await forkProject({
      authority: noEffects,
      authorityReason: "Fork fixture retains no host effects",
      from: "workers/source",
      to: "workers/source-copy",
      title: "Source Copy",
    });

    expect(
      JSON.parse(mocks.files.get("workers/source-copy/package.json") as string),
    ).toMatchObject({
      name: "@workspace-workers/source-copy",
      vibestudio: {
        title: "Source Copy",
        entry: "source-copy-worker.ts",
        durable: { classes: [{ className: "SourceCopyWorker" }] },
      },
    });
    expect(mocks.files.has("workers/source-copy/source-copy-worker.ts")).toBe(
      true,
    );
    expect(
      mocks.files.get("workers/source-copy/source-copy-worker.ts"),
    ).toContain("class SourceCopyWorker");
    expect(
      mocks.files.get("workers/source-copy/source-copy-worker.ts"),
    ).toContain("workers/source-copy");
  });

  it("rejects an invalid fork identity before repository mutation", async () => {
    addFile(
      "packages/source/package.json",
      JSON.stringify({
        name: "@workspace/source",
        private: true,
        type: "module",
        exports: { ".": "./index.ts" },
      }),
    );
    addFile("packages/source/index.ts", "export {};\n");
    const { forkProject } = await import("./index.js");

    await expect(
      forkProject({
        authority: noEffects,
        authorityReason: "Fork fixture retains no host effects",
        from: "packages/source",
        to: "packages/new",
        title: "unsafe\nfrontmatter",
      }),
    ).rejects.toThrow(/Project title/);
    expect(mocks.edit).not.toHaveBeenCalled();
  });
});

describe("scaffold runtime contract", () => {
  beforeEach(resetRuntimeMocks);

  it("derives the Svelte scaffold dependency from the installed framework peer contract", async () => {
    addFile(
      "packages/svelte/package.json",
      JSON.stringify({
        name: "@workspace/svelte",
        peerDependencies: { svelte: "^5.60.0" },
      }),
    );
    addFile(
      "templates/svelte/template.json",
      JSON.stringify({ framework: "svelte" }),
    );
    const { prepareProjects } = await import("./index.js");
    await prepareProjects([
      {
        authority: noEffects,
        authorityReason: "Fixture has no host effects",
        projectType: "panel",
        name: "svelte-peer-probe",
        title: "Svelte Peer Probe",
        template: "svelte",
      },
    ]);
    const content = mocks.files.get("panels/svelte-peer-probe/package.json");
    if (typeof content !== "string")
      throw new Error("Expected generated textual manifest");
    const manifest = JSON.parse(content);
    expect(manifest.dependencies.svelte).toBe("^5.60.0");
  });

  it("pins the panel scaffold's React to the exact runtime Base declares", async () => {
    const { BASE_PANEL_REACT_VERSION, prepareProjects } =
      await import("./create-project.js");
    const { existsSync, readFileSync } = await import("node:fs");
    const { join } = await import("node:path");

    // The shell realm provides this exact React; packages/react peers on it.
    const baseRoot = composedWorkspaceRoot(
      join(import.meta.dirname, "..", ".."),
    );
    const reactPackage = JSON.parse(
      readFileSync(join(baseRoot, "packages", "react", "package.json"), "utf8"),
    ) as { peerDependencies?: Record<string, string> };
    expect(reactPackage.peerDependencies?.["react"]).toBe("^19.0.0");
    expect(reactPackage.peerDependencies?.["react-dom"]).toBe("^19.0.0");
    // `apps/shell` ships in System: assert its pin where it is composed.
    const shellManifest = join(baseRoot, "apps", "shell", "package.json");
    if (existsSync(shellManifest)) {
      const shellPackage = JSON.parse(readFileSync(shellManifest, "utf8")) as {
        dependencies?: Record<string, string>;
      };
      expect(shellPackage.dependencies?.["react"]).toBe("^19.0.0");
    }

    // And the generated scaffold carries exactly that pin.
    await prepareProjects([
      {
        authority: noEffects,
        authorityReason: "Fixture has no host effects",
        projectType: "panel",
        name: "react-pin-probe",
        title: "React Pin Probe",
      },
    ]);
    const manifest = JSON.parse(
      String(mocks.files.get("panels/react-pin-probe/package.json")),
    ) as {
      dependencies?: Record<string, string>;
    };
    expect(manifest.dependencies).toEqual({
      "@workspace/runtime": "workspace:*",
      react: BASE_PANEL_REACT_VERSION,
      "react-dom": BASE_PANEL_REACT_VERSION,
    });
  });
});
