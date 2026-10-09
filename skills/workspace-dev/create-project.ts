import { contextId, fs, vcs, rpc } from "@workspace/runtime";
import YAML from "yaml";
import { planServiceMutation } from "@vibestudio/workspace-contracts/serviceMutation";
import type { WorkspaceServiceExport } from "@vibestudio/workspace-contracts/types";
import type { VcsEditChange } from "@vibestudio/service-schemas/vcs";
import {
  parseUnitAuthorityManifest,
  type UnitAuthorityManifest,
} from "@vibestudio/shared/authorityManifest";
import { authorityRequestCoversEffect } from "@vibestudio/shared/authority/userlandResources";
import type { ResolvedRpcAuthority } from "@vibestudio/rpc";
import { prepareUnitIcon } from "./unit-icons.js";
import {
  prepareChanges,
  type ProjectPreparation,
} from "./project-preparation.js";
export type { ProjectPreparation } from "./project-preparation.js";
import {
  PROJECT_TYPES,
  assertProjectIdentity,
  preflightProjectFiles,
  serializeProjectManifest,
  type ProjectPreflightReport,
  type ProjectType,
} from "./project-manifest.js";

function repositoryChange(
  dir: string,
  files: Record<string, string | Uint8Array>,
): VcsEditChange {
  return {
    kind: "repository-create",
    repoPath: dir,
    files: Object.entries(files)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([path, content]) => ({
        path: path.replace(/^\/+/, ""),
        content:
          typeof content === "string"
            ? { kind: "text" as const, text: content }
            : { kind: "bytes" as const, base64: bytesToBase64(content) },
        mode: 0o644,
      })),
  };
}

function requireAuthority(
  authority: UnitAuthorityManifest | undefined,
  reason: string | undefined,
): UnitAuthorityManifest {
  if (!authority || !reason?.trim())
    throw new Error(
      "Executable preparation requires an explicit authority manifest and authorityReason explaining its complete requested scope. Empty requests are deliberate, not a default.",
    );
  return parseUnitAuthorityManifest(authority);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

/**
 * The exact React runtime the Base desktop shell provides to panels. The one
 * Base-owned pin the panel scaffold emits; a contract test asserts it matches
 * packages/react's declared peer runtime so scaffolds can never drift from
 * what the shell actually loads.
 */
export const BASE_PANEL_REACT_VERSION = "19.2.4";

const TYPE_DIRS: Record<ProjectType, string> = {
  panel: "panels",
  package: "packages",
  skill: "skills",
  project: "projects",
  worker: "workers",
};

const PACKAGE_SCOPES: Partial<Record<ProjectType, string>> = {
  panel: "@workspace-panels",
  package: "@workspace",
  skill: "@workspace-skills",
  worker: "@workspace-workers",
};

const SUPPORTED_PROJECT_TYPES = PROJECT_TYPES.join(", ");

function toPascalCase(str: string): string {
  return str
    .split(/[-_]/)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join("");
}

interface PrepareProjectFields {
  name: string;
  title?: string;
  /** Authoring input: emoji, local image path, or catalog ID. Catalog artwork is persisted as a local asset, never as an ID. */
  icon?: string;
  template?: string;
  /** Required for the durable-service template. */
  methods?: RecordStoreMethodPolicies;
  /** Add a portable browser entry to this panel. Requirements are advisory. */
  website?:
    | boolean
    | {
        title?: string;
        expects?: string;
        suggestedTemplates?: Array<{ label: string; locator: { url: string } }>;
      };
}

export type PrepareProjectParams = PrepareProjectFields &
  (
    | {
        projectType: "panel" | "worker";
        authority: UnitAuthorityManifest;
        authorityReason: string;
      }
    | {
        projectType: "package" | "skill" | "project";
        authority?: never;
        authorityReason?: never;
      }
  );

interface ResolvedProject {
  projectType: ProjectType;
  projectPath: string;
  name: string;
  title: string;
  files: Record<string, string>;
  preflight: ProjectPreflightReport;
  authorityReason?: string;
}

const AGENTIC_TEMPLATE_AUTHORITY = [
  {
    capability: "workspace-service:models",
    resource: {
      kind: "exact" as const,
      key: "do:workers/model-settings:ModelSettingsDO:workspace-model-settings",
    },
    tier: "gated" as const,
    evidence: "exact" as const,
    packages: ["@workspace/agentic-do"],
  },
] as const;

const AGENTIC_TEMPLATE_AUTHORITY_REASON =
  "The generated @workspace/agentic-do dependency calls the workspace model-settings service. This manifest includes its exact, package-scoped request; it is a request, not a grant.";

function authorityWithTemplateRequirements(
  authority: UnitAuthorityManifest,
  template: string | undefined,
): UnitAuthorityManifest {
  if (template !== "agentic") return authority;
  const requests = [...authority.requests];
  for (const required of AGENTIC_TEMPLATE_AUTHORITY) {
    const effect = {
      capability: required.capability,
      tier: required.tier,
      resource: required.resource,
      ...(required.packages ? { packageName: required.packages[0] } : {}),
    };
    if (!requests.some((request) => authorityRequestCoversEffect(request, effect))) {
      requests.push(required);
    }
  }
  return parseUnitAuthorityManifest({
    requests,
    ...(authority.serviceRequests
      ? { serviceRequests: authority.serviceRequests }
      : {}),
    provides: authority.provides,
  });
}

async function resolveProject(
  params: PrepareProjectParams,
): Promise<ResolvedProject> {
  const { projectType, name, title = name, icon, template, website } = params;

  assertProjectIdentity(name, title);

  const typeDir = TYPE_DIRS[projectType as ProjectType];
  if (!typeDir)
    throw new Error(
      `Unknown project type: ${projectType}. Must be one of: ${SUPPORTED_PROJECT_TYPES}`,
    );

  const canonicalProjectType = projectType as ProjectType;
  const projectPath = `${typeDir}/${name}`;

  if (await fs.exists(projectPath)) {
    throw new Error(`Project already exists: ${projectPath}`);
  }

  const files: Record<string, string> = {};
  const suppliedAuthority =
    canonicalProjectType === "panel" || canonicalProjectType === "worker"
      ? requireAuthority(params.authority, params.authorityReason)
      : undefined;
  const agenticWorker = canonicalProjectType === "worker" && template === "agentic";
  const authority = suppliedAuthority
    ? authorityWithTemplateRequirements(
        suppliedAuthority,
        agenticWorker ? template : undefined,
      )
    : undefined;
  const authorityReason =
    params.authorityReason && agenticWorker
      ? `${params.authorityReason}\n\n${AGENTIC_TEMPLATE_AUTHORITY_REASON}`
      : params.authorityReason;
  if (authority)
    files["AUTHORITY.md"] =
      `# Authority intent\n\n${authorityReason}\n\nThis rationale is review evidence, not a grant. The manifest and receiver contracts define the requested ceiling.\n`;
  const preparedIcon = await prepareUnitIcon(icon);
  const manifestIcon = preparedIcon.icon;
  Object.assign(files, preparedIcon.files);

  switch (projectType) {
    case "panel": {
      // Resolve template — defaults to "default" (React+Radix)
      const panelTemplate = template ?? "default";
      let panelFramework = "react";

      // Read template.json from workspace to determine framework
      if (panelTemplate !== "default") {
        const templateConfigPath = `templates/${panelTemplate}/template.json`;
        if (!(await fs.exists(templateConfigPath))) {
          throw new Error(
            `Template "${panelTemplate}" not found. List templates/ in the workspace for available templates.`,
          );
        }
        const templateConfig = JSON.parse(
          (await fs.readFile(templateConfigPath, "utf-8")) as string,
        );
        if (templateConfig.framework) panelFramework = templateConfig.framework;
      }

      if (panelFramework !== "react" && panelFramework !== "svelte") {
        throw new Error(
          `Panel framework "${panelFramework}" is not supported; choose the default React or Svelte template.`,
        );
      }

      if (panelFramework === "svelte") {
        const frameworkPackage = JSON.parse(
          (await fs.readFile(
            "packages/svelte/package.json",
            "utf-8",
          )) as string,
        );
        const frameworkVersion = frameworkPackage.peerDependencies?.svelte;
        if (
          frameworkPackage.name !== "@workspace/svelte" ||
          typeof frameworkVersion !== "string" ||
          !frameworkVersion
        ) {
          throw new Error(
            "The installed Svelte framework must declare its required Svelte peer dependency",
          );
        }
        files["package.json"] = serializeProjectManifest({
          projectType: "panel",
          authority: authority!,
          name,
          title,
          icon: manifestIcon,
          entry: "index.ts",
          ...(panelTemplate !== "default" ? { template: panelTemplate } : {}),
          ...(website
            ? {
                website: {
                  entry: "site.ts",
                  title:
                    typeof website === "object"
                      ? (website.title ?? title)
                      : title,
                  ...(typeof website === "object" && website.expects
                    ? { expects: website.expects }
                    : {}),
                  ...(typeof website === "object" && website.suggestedTemplates
                    ? { suggestedTemplates: website.suggestedTemplates }
                    : {}),
                },
              }
            : {}),
          dependencies: {
            "@workspace/runtime": "workspace:*",
            "@workspace/svelte": "workspace:*",
            svelte: frameworkVersion,
          },
        });
        files["index.ts"] = `export { default } from "./App.svelte";\n`;
        files["App.svelte"] = `<script lang="ts">
  import { theme, themeStyle } from "@workspace/svelte";
  import { onMount } from "svelte";

  type DataMode = "fixture" | "live";
  let mode: DataMode = (window as Window & { __vibestudioAgentMode?: DataMode }).__vibestudioAgentMode ?? "live";
  const data = {
    fixture: "${title} fixture data",
    live: "${title} live data",
  };

  onMount(() => {
    const handler = (event: Event) => { mode = (event as CustomEvent<DataMode>).detail; };
    window.addEventListener("vibestudio:agentModeChanged", handler);
    return () => window.removeEventListener("vibestudio:agentModeChanged", handler);
  });
</script>

<div class="container" class:dark={$theme === "dark"} style={$themeStyle}>
  <h1>${title}</h1>
  <p>{data[mode]}</p>
</div>

<style>
  .container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100vh;
    font-family: system-ui, sans-serif;
    box-sizing: border-box;
    padding: calc(24px * var(--vibestudio-scale));
    border-radius: var(--vibestudio-radius);
    accent-color: var(--vibestudio-accent);
  }
  h1 { color: var(--vibestudio-accent); }
</style>
`;
        if (website) {
          files["site.ts"] =
            `import { mount } from "svelte";\nimport App from "./App.svelte";\n\nmount(App, { target: document.getElementById("root")! });\n`;
        }
      } else {
        // Default: a minimal React panel with only the executable baseline
        // authority. Framework helpers can be added deliberately when needed.
        files["package.json"] = serializeProjectManifest({
          projectType: "panel",
          authority: authority!,
          name,
          title,
          icon: manifestIcon,
          entry: "index.tsx",
          ...(panelTemplate !== "default" ? { template: panelTemplate } : {}),
          exposeModules: [
            "react",
            "react/jsx-runtime",
            "react/jsx-dev-runtime",
          ],
          ...(website
            ? {
                website: {
                  entry: "site.tsx",
                  title:
                    typeof website === "object"
                      ? (website.title ?? title)
                      : title,
                  ...(typeof website === "object" && website.expects
                    ? { expects: website.expects }
                    : {}),
                  ...(typeof website === "object" && website.suggestedTemplates
                    ? { suggestedTemplates: website.suggestedTemplates }
                    : {}),
                },
              }
            : {}),
          dependencies: {
            react: BASE_PANEL_REACT_VERSION,
            "react-dom": BASE_PANEL_REACT_VERSION,
          },
        });
        files["index.tsx"] =
          `import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

type DataMode = "fixture" | "live";
const DataModeContext = createContext<{ mode: DataMode; message: string }>({
  mode: "live",
  message: "${title} live data",
});

function DataModeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<DataMode>(() =>
    (window as Window & { __vibestudioAgentMode?: DataMode }).__vibestudioAgentMode ?? "live"
  );
  useEffect(() => {
    const handler = (event: Event) => setMode((event as CustomEvent<DataMode>).detail);
    window.addEventListener("vibestudio:agentModeChanged", handler);
    return () => window.removeEventListener("vibestudio:agentModeChanged", handler);
  }, []);
  const value = useMemo(() => ({
    mode,
    message: mode === "fixture" ? "${title} fixture data" : "${title} live data",
  }), [mode]);
  return <DataModeContext.Provider value={value}>{children}</DataModeContext.Provider>;
}

export default function ${toPascalCase(name)}() {
  return (
    <DataModeProvider>
      <${toPascalCase(name)}Content />
    </DataModeProvider>
  );
}

function ${toPascalCase(name)}Content() {
  const data = useContext(DataModeContext);
  return (
    <main style={{
      minHeight: "100vh",
      display: "grid",
      placeContent: "center",
      gap: 8,
      padding: 24,
      boxSizing: "border-box",
      color: "var(--vibestudio-text, CanvasText)",
      background: "var(--vibestudio-background, Canvas)",
      fontFamily: "system-ui, sans-serif",
      textAlign: "center",
    }}>
      <h1 style={{ margin: 0, color: "var(--vibestudio-accent, AccentColor)" }}>${title}</h1>
      <p style={{ margin: 0, opacity: 0.7 }}>{data.message}</p>
    </main>
  );
}
`;
        if (website) {
          files["site.tsx"] =
            `import { createRoot } from "react-dom/client";\nimport App from "./index.js";\n\ncreateRoot(document.getElementById("root")!).render(<App />);\n`;
        }
      }
      break;
    }

    case "package":
      files["package.json"] = serializeProjectManifest({
        projectType: "package",
        name,
        title,
        exports: { ".": "./index.ts" },
      });
      files["index.ts"] = `/**\n * ${title}\n */\n\nexport {};\n`;
      break;

    case "skill":
      files["package.json"] = serializeProjectManifest({
        projectType: "skill",
        name,
        title,
        exports: { ".": "./index.ts" },
      });
      files["index.ts"] = `/**\n * ${title}\n */\n\nexport {};\n`;
      files["SKILL.md"] =
        `---\nname: ${name}\ndescription: ${JSON.stringify(title)}\n---\n\n# ${title}\n`;
      break;

    case "project":
      files["README.md"] = `# ${title}\n\nPlain workspace project.\n`;
      break;

    case "worker":
      if (template === "agentic") {
        // Agentic worker template — DO extending AgentWorkerBase
        const className = toPascalCase(name) + "Worker";
        const workerFileName = `${name}-worker`;

        files["package.json"] = serializeProjectManifest({
          projectType: "worker",
          authority: authority!,
          name,
          title,
          icon: manifestIcon,
          entry: "index.ts",
          durableClasses: [className],
          tests: [
            {
              name: "unit",
              runtime: "native",
              include: [`${workerFileName}.test.ts`],
            },
          ],
          dependencies: {
            "@workspace/runtime": "workspace:*",
            "@workspace/agentic-do": "workspace:*",
            "@workspace/harness": "workspace:*",
          },
          devDependencies: {
            vitest: "^3.2.4",
          },
        });

        files["index.ts"] =
          `export { ${className} } from "./${workerFileName}.js";
export default { fetch(_req: Request) { return new Response("${name} DO service"); } };
`;

        files[`${workerFileName}.ts`] =
          `import { AgentWorkerBase } from "@workspace/agentic-do";
import type { ParticipantDescriptor } from "@workspace/harness";

/**
 * ${className} — Pi-native agent DO.
 *
 * The native durable owner admits channel inputs, model requests and tool
 * tasks through the published Pi fork. The base class owns subscriptions,
 * readiness, cancellation and durable transcript publication. You only need to override the small set of customization
 * hooks below.
 *
 * The system prompt is composed from the Vibestudio base prompt,
 * workspace/meta/AGENTS.md, the generated skill index, and optional channel
 * prompt config.
 */
export class ${className} extends AgentWorkerBase {
  // --- Hook: default model id (provider:model format) ---
  // protected override getDefaultModel(): string {
  //   return "openai-codex:gpt-6-sol";
  // }

  // --- Hook: default thinking level ---
  // protected override getDefaultThinkingLevel() {
  //   return "medium" as const;
  // }

  // --- Hook: participant identity ---
  protected override getParticipantInfo(): ParticipantDescriptor {
    return {
      handle: "${name}",
      name: "${title}",
      type: "agent",
      methods: [],
    };
  }

  // The base class admits incoming channel messages to the native conversation.
  // Customize domain tools and prompts through the protected hooks.
}
`;

        files[`${workerFileName}.test.ts`] =
          `import { describe, it, expect } from "vitest";
import { createNativeVesselTestDO } from "@workspace/agentic-do/testing/native-vessel";
import { ${className} } from "./${workerFileName}.js";

describe("${className}", () => {
  it("initializes through the product schema boundary", async () => {
    const { instance, db } = await createNativeVesselTestDO(${className});
    try {
      expect(instance).toBeInstanceOf(${className});
    } finally {
      try {
        const released = await instance.releaseForLifecycle({
          epoch: "test-end", mode: "suspend", reason: "test", deadlineMs: 0,
        });
        expect(released.status).toBe("ready");
      } finally {
        db.close();
      }
    }
  });
});
`;
      } else if (template === "durable-service") {
        const className = toPascalCase(name);
        files["package.json"] = serializeProjectManifest({
          projectType: "worker",
          authority: authority!,
          name,
          title,
          icon: manifestIcon,
          entry: "index.ts",
          template,
          durableClasses: [className],
          dependencies: { "@workspace/runtime": "workspace:*" },
        });
        files["index.ts"] =
          `import { DurableObjectBase, rpc } from "@workspace/runtime/worker/kernel";

type RecordRow = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

export class ${className} extends DurableObjectBase {
  static override schemaVersion = 1;

  protected override createTables(): void {
    this.sql.exec(\`
      CREATE TABLE records (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    \`);
  }

  protected override requiredTables(): readonly string[] {
    return ["records"];
  }

  @rpc(${literalMethodPolicy(params.methods?.upsertRecord)})
  upsertRecord(input: { id?: string; title: string }): { id: string } {
    this.ensureReady();
    const id = input.id ?? crypto.randomUUID();
    const now = new Date().toISOString();
    this.sql.exec(
      \`INSERT INTO records (id, title, created_at, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET title = excluded.title, updated_at = excluded.updated_at\`,
      id,
      input.title,
      now,
      now
    );
    return { id };
  }

  @rpc(${literalMethodPolicy(params.methods?.listRecords)})
  listRecords(): Array<{ id: string; title: string; createdAt: string; updatedAt: string }> {
    this.ensureReady();
    const rows = this.sql
      .exec(\`SELECT id, title, created_at, updated_at FROM records ORDER BY updated_at DESC\`)
      .toArray() as RecordRow[];
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }
}

export default {
  fetch() {
    return new Response("${title} durable service");
  },
};
`;
      } else if (template === undefined) {
        // Default stateless worker template
        files["package.json"] = serializeProjectManifest({
          projectType: "worker",
          authority: authority!,
          name,
          title,
          icon: manifestIcon,
          entry: "index.ts",
          dependencies: { "@workspace/runtime": "workspace:*" },
        });
        files["index.ts"] =
          `import { createWorkerRuntime } from "@workspace/runtime/worker";
import type { WorkerEnv, ExecutionContext } from "@workspace/runtime/worker";

export default {
  async fetch(request: Request, env: WorkerEnv, _ctx: ExecutionContext) {
    const runtime = createWorkerRuntime(env);
    return new Response("Hello from ${title}!");
  },
};
`;
      } else {
        throw new Error(
          `Unknown worker template ${JSON.stringify(template)}. Use "durable-service", "agentic", or omit it for a stateless worker.`,
        );
      }
      break;
  }

  const preflight = preflightProjectFiles({
    projectType: canonicalProjectType,
    name,
    files,
  });

  return {
    projectType: canonicalProjectType,
    projectPath,
    name,
    title,
    files,
    preflight,
    ...(authorityReason ? { authorityReason } : {}),
  };
}

export interface PreparedProject {
  created: string;
  files: string[];
  preflight: ProjectPreflightReport;
  preparation: ProjectPreparation;
  authorityReview: {
    manifest: UnitAuthorityManifest;
    rationale: string;
  } | null;
}

/** Create context-local repositories. Review, verify, commit and publish separately. */
export async function prepareProjects(
  projects: PrepareProjectParams[],
): Promise<PreparedProject[]> {
  if (!projects.length)
    throw new Error("prepareProjects requires at least one project");
  const resolved = await Promise.all(projects.map(resolveProject));
  const preparation = await prepareChanges(
    resolved.map((project) =>
      repositoryChange(project.projectPath, project.files),
    ),
    `Prepare ${resolved.map((project) => project.projectPath).join(", ")}`,
    await vcs.status({ contextId }),
  );
  return resolved.map((project, i) =>
    preparedProject(
      project,
      project.authorityReason ?? projects[i]!.authorityReason,
      preparation,
    ),
  );
}

function preparedProject(
  project: ResolvedProject,
  rationale: string | undefined,
  preparation: ProjectPreparation,
): PreparedProject {
  const executable =
    project.projectType === "panel" || project.projectType === "worker";
  return {
    created: project.projectPath,
    files: Object.keys(project.files),
    preflight: project.preflight,
    preparation,
    authorityReview: executable
      ? {
          manifest: JSON.parse(project.files["package.json"] as string)
            .vibestudio.authority,
          rationale: rationale!,
        }
      : null,
  };
}

export interface RecordStoreMethodPolicies {
  upsertRecord: ResolvedRpcAuthority;
  listRecords: ResolvedRpcAuthority;
}

/** Receiver policy must be literal source, not runtime-inferred metadata. */
function literalMethodPolicy(policy: ResolvedRpcAuthority | undefined): string {
  if (
    !policy ||
    !policy.website ||
    !policy.effect ||
    !policy.tier ||
    !policy.sensitivity ||
    (!policy.principals && !policy.requires)
  ) {
    throw new Error(
      "Durable-store methods require explicit website, principals or requires, effect, tier, and sensitivity decisions",
    );
  }
  return JSON.stringify(policy, (_key, value) => {
    if (typeof value === "function" || typeof value === "undefined")
      throw new Error("Receiver policy must contain only literal JSON values");
    return value;
  });
}

export interface ApplicationAuthorityPolicy {
  rationale: string;
  panel: UnitAuthorityManifest;
  worker: UnitAuthorityManifest;
  service: {
    principals: WorkspaceServiceExport["authority"]["principals"];
    binding: NonNullable<WorkspaceServiceExport["authority"]["binding"]>;
    notability: WorkspaceServiceExport["notability"];
  };
  methods: RecordStoreMethodPolicies;
}

export interface PrepareApplicationParams {
  /** Creates panels/<name> and workers/<name>-store. */
  name: string;
  title?: string;
  /** Authoring input resolved by prepareUnitIcon for both units. */
  icon?: string;
  authority: ApplicationAuthorityPolicy;
}

export interface PrepareApplicationResult {
  panel: PreparedProject;
  worker: PreparedProject;
  service: {
    name: string;
    protocol: string;
    source: string;
    className: string;
    objectKey: string;
    docsId: string;
  };
  preparation: ProjectPreparation;
  authorityReview: ApplicationAuthorityPolicy;
}

/** Prepare an editable connected starter, not a fixed domain API or finished app.
 * Extend the generated record schema, receiver methods/policies and panel for
 * the requested features. The supplied policy is intent, never a grant. */
export async function prepareApplication({
  name,
  title = name,
  icon,
  authority,
}: PrepareApplicationParams): Promise<PrepareApplicationResult> {
  const workerName = `${name}-store`;
  const protocol = `${name}.v1`;
  const className = toPascalCase(workerName);
  if (
    !authority?.service ||
    !authority.methods ||
    !authority.service.binding ||
    !authority.service.notability ||
    !authority.service.principals?.length
  )
    throw new Error(
      "prepareApplication requires explicit service principals, binding, notability, receiver policies, and unit manifests with a rationale",
    );
  literalMethodPolicy(authority.methods.listRecords);
  literalMethodPolicy(authority.methods.upsertRecord);
  authority = JSON.parse(JSON.stringify(authority));
  const [panel, worker] = await Promise.all([
    resolveProject({
      projectType: "panel",
      name,
      title,
      icon,
      authority: authority.panel,
      authorityReason: authority.rationale,
    }),
    resolveProject({
      projectType: "worker",
      name: workerName,
      title: `${title} Store`,
      icon,
      template: "durable-service",
      authority: authority.worker,
      authorityReason: authority.rationale,
      methods: authority.methods,
    }),
  ]);
  const manifest = JSON.parse(panel.files["package.json"] as string);
  manifest.dependencies["@workspace/runtime"] = "workspace:*";
  panel.files["package.json"] = JSON.stringify(manifest, null, 2) + "\n";
  panel.files["index.tsx"] =
    `import React, { useEffect, useState } from "react";
import { rpc, workers } from "@workspace/runtime";

type RecordItem = { id: string; title: string; createdAt: string; updatedAt: string };

export default function App() {
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const service = await workers.resolveService(${JSON.stringify(protocol)});
        if (service.kind !== "durable-object") throw new Error("Expected a durable record service");
        const result = await rpc.call<RecordItem[]>(service.targetId, "listRecords", []);
        if (active) setRecords(result);
      } catch (cause) { if (active) setError(String(cause)); }
      finally { if (active) setBusy(false); }
    }
    void load();
    return () => { active = false; };
  }, []);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const service = await workers.resolveService(${JSON.stringify(protocol)});
      if (service.kind !== "durable-object") throw new Error("Expected a durable record service");
      await rpc.call(service.targetId, "upsertRecord", [{ title: title.trim() }]);
      setTitle("");
      setRecords(await rpc.call<RecordItem[]>(service.targetId, "listRecords", []));
    } catch (cause) { setError(String(cause)); }
    finally { setBusy(false); }
  }
  return <main style={{ padding: 24 }}>
    <h1>{${JSON.stringify(title)}}</h1>
    <form onSubmit={save}>
      <label>Record title <input value={title} onChange={event => setTitle(event.target.value)} disabled={busy} /></label>
      <button type="submit" disabled={busy || !title.trim()}>Add record</button>
    </form>
    {error && <p role="alert">{error}</p>}
    <ul>{records.map(record => <li key={record.id}>{record.title}</li>)}</ul>
  </main>;
}
`;
  panel.preflight = preflightProjectFiles({
    projectType: "panel",
    name,
    files: panel.files,
  });
  const beforeCreate = await vcs.status({ contextId });
  const repository = await vcs.resolveRepository({
    state: beforeCreate.workingHead,
    repoPath: "meta",
  });
  if (!repository) throw new Error("The workspace has no meta repository");
  const file = await vcs.readFile({
    state: beforeCreate.workingHead,
    repositoryId: repository.repositoryId,
    file: { kind: "path", path: "vibestudio.yml" },
  });
  if (!file || file.content.kind !== "text")
    throw new Error("The workspace has no text meta/vibestudio.yml");
  const document = YAML.parseDocument(file.content.text);
  if (document.errors.length) throw document.errors[0];
  const config = document.toJS();
  if (!config || typeof config !== "object" || Array.isArray(config))
    throw new Error("meta/vibestudio.yml must contain a configuration mapping");
  const service = {
    name: workerName,
    protocol,
    source: worker.projectPath,
    className,
    objectKey: "main",
    docsId: `workspace:${workerName}`,
  };
  const workerPackage = JSON.parse(worker.files["package.json"]!) as Record<string, unknown>;
  const workerVibestudio = workerPackage["vibestudio"] as Record<string, unknown>;
  const declaredProviderServices = workerVibestudio["services"];
  if (declaredProviderServices !== undefined && !Array.isArray(declaredProviderServices)) {
    throw new Error("Generated worker package.json vibestudio.services must be an array");
  }
  const providerServices = (declaredProviderServices ?? []) as WorkspaceServiceExport[];
  const serviceExport = {
    name: workerName,
    title: `${title} Store`,
    action: "Manage records",
    description: `Stores records for ${title}.`,
    notability: authority.service.notability,
    presentation: { domain: "files" as const, verb: "manage" as const },
    protocols: [protocol],
    authority: { principals: authority.service.principals, binding: authority.service.binding },
    durableObject: { className },
  };
  const plan = planServiceMutation({
    services: config.services ?? [],
    singletonObjects: config.singletonObjects ?? [],
    providerServices,
  }, {
    operation: "create",
    source: worker.projectPath,
    service: serviceExport,
    singletonKey: "main",
  });
  workerVibestudio["services"] = plan.providerServices;
  workerPackage["vibestudio"] = workerVibestudio;
  worker.files["package.json"] = `${JSON.stringify(workerPackage, null, 2)}\n`;
  document.set("services", plan.services);
  document.set("singletonObjects", plan.singletonObjects);
  const candidate = String(document);
  await rpc.call("main", "workspace.validateConfig", [{
    manifest: candidate,
    serviceManifests: { [worker.projectPath]: worker.files["package.json"]! },
  }]);
  const preparation = await prepareChanges(
    [
      repositoryChange(panel.projectPath, panel.files),
      repositoryChange(worker.projectPath, worker.files),
      {
        kind: "text-edit",
        repositoryId: file.repositoryId,
        fileId: file.fileId,
        edits: [{ start: 0, end: file.content.text.length, text: candidate }],
      },
    ],
    `Prepare connected application ${name}`,
    beforeCreate,
  );
  return {
    panel: preparedProject(panel, authority.rationale, preparation),
    worker: preparedProject(worker, authority.rationale, preparation),
    service,
    preparation,
    authorityReview: authority,
  };
}

const COPY_SKIP_DIRS = new Set([
  ".cache",
  ".context-projections",
  ".contexts",
  ".databases",
  ".gad",
  ".git",
  ".vibestudio",
  ".parcel-cache",
  ".pnpm-store",
  ".testkit",
  ".tmp",
  ".turbo",
  ".vite",
  "build",
  "coverage",
  "dist",
  "dist_electron",
  "node_modules",
  "out",
  "release",
  "test-results",
]);

const COPY_SKIP_FILES = new Set([
  ".DS_Store",
  ".npmrc",
  ".npmrc.dist-tag-temp",
  ".secrets.yml",
  "firebase-service-account.json",
  "GoogleService-Info.plist",
  "google-services.json",
  "Thumbs.db",
]);

function shouldSkipCopiedFile(name: string): boolean {
  return (
    COPY_SKIP_FILES.has(name) ||
    name === ".env" ||
    name.startsWith(".env.") ||
    name.endsWith(".log") ||
    name.endsWith(".tmp") ||
    name.endsWith(".swp") ||
    name.endsWith(".swo") ||
    name.endsWith(".sublime-workspace") ||
    name.endsWith(".tsbuildinfo") ||
    name.endsWith(".tgz") ||
    name.endsWith("~")
  );
}

export interface ForkProjectOptions {
  from: string;
  to: string;
  title?: string;
  projectType?: "panel" | "worker" | "package" | "skill" | "project";
  dryRun?: boolean;
  rewrite?:
    | boolean
    | {
        packageName?: boolean;
        title?: boolean;
        reactComponentNames?: boolean;
        workerClassNames?: boolean;
        tests?: boolean;
      };
  classMap?: Record<string, string>;
  authority?: UnitAuthorityManifest;
  authorityReason?: string;
}

export interface ForkProjectResult {
  source: string;
  created: string;
  files: string[];
  preflight: ProjectPreflightReport;
  rewrites: Array<{ file: string; description: string }>;
  warnings: string[];
  dryRun: boolean;
  preparation: ProjectPreparation | null;
  authorityReview: PreparedProject["authorityReview"];
}

function rewriteEnabled(
  options: ForkProjectOptions,
  key:
    | "packageName"
    | "title"
    | "reactComponentNames"
    | "workerClassNames"
    | "tests",
): boolean {
  if (options.rewrite === false) return false;
  if (typeof options.rewrite === "object" && key in options.rewrite)
    return options.rewrite[key] !== false;
  return true;
}

function projectNameFromPath(p: string): string {
  return p.split("/").filter(Boolean).pop() ?? p;
}

function projectTypeFromPath(p: string): ProjectType | null {
  return (
    (Object.entries(TYPE_DIRS).find(
      ([, dir]) => p === dir || p.startsWith(`${dir}/`),
    )?.[0] as ProjectType | undefined) ?? null
  );
}

function rewriteRelPath(
  rel: string,
  oldName: string,
  newName: string,
  projectType: string | null,
): string {
  if (projectType === "worker" && rel.includes(oldName))
    return rel.split(oldName).join(newName);
  return rel;
}

async function listFilesRecursive(dir: string, prefix = ""): Promise<string[]> {
  const out: string[] = [];
  const entries = (await fs.readdir(prefix ? `${dir}/${prefix}` : dir, {
    withFileTypes: true,
  })) as Array<{
    name: string;
    _isDirectory?: boolean;
    isDirectory?: () => boolean;
  }>;
  for (const entry of entries) {
    if (COPY_SKIP_DIRS.has(entry.name)) continue;
    if (shouldSkipCopiedFile(entry.name)) continue;
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    const isDir =
      typeof entry.isDirectory === "function"
        ? entry.isDirectory()
        : entry._isDirectory;
    if (isDir) out.push(...(await listFilesRecursive(dir, rel)));
    else out.push(rel);
  }
  return out;
}

function isProbablyTextFile(file: string): boolean {
  return (
    /\.(tsx?|jsx?|json|md|mdx|svelte|css|scss|html|ya?ml|toml|txt)$/i.test(
      file,
    ) || !file.includes(".")
  );
}

async function readText(path: string): Promise<string> {
  return (await fs.readFile(path, "utf-8")) as string;
}

export async function forkProject(
  options: ForkProjectOptions,
): Promise<ForkProjectResult> {
  if (typeof options.from !== "string" || typeof options.to !== "string")
    throw new Error(
      "forkProject requires string from and to paths; forkPanel/forkWorker require from and name.",
    );
  const from = options.from.replace(/^\/+|\/+$/g, "");
  const to = options.to.replace(/^\/+|\/+$/g, "");
  if (!from || !to) throw new Error("forkProject requires from and to paths");
  if (!(await fs.exists(from)))
    throw new Error(`Source project does not exist: ${from}`);
  if (await fs.exists(to)) throw new Error(`Destination already exists: ${to}`);

  const fromType = projectTypeFromPath(from);
  const toType = projectTypeFromPath(to);
  const explicitType = options.projectType;
  const effectiveType = explicitType ?? toType ?? fromType;
  const warnings: string[] = [];
  const rewrites: Array<{ file: string; description: string }> = [];
  if (!fromType || !toType)
    warnings.push(
      "Could not infer project type from one or both paths; only generic rewrites will run.",
    );
  if (fromType && toType && fromType !== toType && !explicitType) {
    throw new Error(
      `Fork crosses project types (${fromType} -> ${toType}); pass projectType to opt into this.`,
    );
  }
  if (explicitType && toType && explicitType !== toType) {
    throw new Error(
      `Destination path ${to} is a ${toType}, not requested projectType ${explicitType}`,
    );
  }

  const oldName = projectNameFromPath(from);
  const newName = projectNameFromPath(to);
  const newTitle = options.title ?? newName;
  assertProjectIdentity(newName, newTitle);
  const files = await listFilesRecursive(from);
  const createdFiles: string[] = [];
  const planned: Record<string, string | Uint8Array> = {};
  const effectiveClassMap: Record<string, string> = {
    ...(options.classMap ?? {}),
  };
  const binaryFiles: string[] = [];

  for (const rel of files) {
    const srcPath = `${from}/${rel}`;
    const destRel = rewriteRelPath(rel, oldName, newName, effectiveType);
    if (destRel !== rel) {
      rewrites.push({
        file: rel,
        description: `Renamed forked file path to ${destRel}`,
      });
    }
    createdFiles.push(destRel);
    if (!isProbablyTextFile(rel)) {
      binaryFiles.push(destRel);
      planned[destRel] = (await fs.readFile(srcPath)) as Uint8Array;
      continue;
    }
    let content = await readText(srcPath);

    if (rel === "package.json") {
      try {
        const pkg = JSON.parse(content);
        if (rewriteEnabled(options, "packageName")) {
          const scope = effectiveType
            ? PACKAGE_SCOPES[effectiveType]
            : undefined;
          if (scope) pkg.name = `${scope}/${newName}`;
          rewrites.push({ file: rel, description: "Updated package name" });
        }
        if (rewriteEnabled(options, "title")) {
          pkg.vibestudio = { ...(pkg.vibestudio ?? {}), title: newTitle };
          rewrites.push({ file: rel, description: "Updated vibestudio title" });
        }
        if (
          pkg.vibestudio?.entry &&
          typeof pkg.vibestudio.entry === "string" &&
          pkg.vibestudio.entry.includes(oldName)
        ) {
          pkg.vibestudio.entry = pkg.vibestudio.entry
            .split(oldName)
            .join(newName);
          rewrites.push({
            file: rel,
            description: "Updated vibestudio entry path",
          });
        }
        if (
          effectiveType === "worker" &&
          rewriteEnabled(options, "workerClassNames")
        ) {
          const classes = pkg.vibestudio?.durable?.classes;
          if (Array.isArray(classes)) {
            if (classes.length === 1) {
              const oldClass = classes[0]?.className;
              if (oldClass) {
                const nextClass =
                  effectiveClassMap[oldClass] ??
                  `${toPascalCase(newName)}Worker`;
                effectiveClassMap[oldClass] = nextClass;
                classes[0].className = nextClass;
                rewrites.push({
                  file: rel,
                  description: `Updated durable class ${oldClass} -> ${nextClass}`,
                });
              } else {
                warnings.push(
                  "Worker durable class metadata is missing className; no class rewrite was applied.",
                );
              }
            } else if (classes.length > 1) {
              const unmapped = classes.filter(
                (c: { className?: string }) =>
                  c.className && !effectiveClassMap[c.className],
              );
              if (unmapped.length > 0)
                warnings.push(
                  "Worker has multiple durable classes; provide classMap for complete safe renaming.",
                );
              for (const c of classes)
                if (effectiveClassMap[c.className])
                  c.className = effectiveClassMap[c.className];
            }
          }
        }
        content = JSON.stringify(pkg, null, 2) + "\n";
      } catch (err) {
        warnings.push(
          `Could not parse package.json: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    if (effectiveType === "skill" && rel === "SKILL.md") {
      content = content.replace(/^name:\s*.+$/m, `name: ${newName}`);
      if (options.title)
        content = content.replace(
          /^description:\s*.+$/m,
          `description: ${newTitle}`,
        );
      rewrites.push({ file: rel, description: "Updated skill frontmatter" });
    }

    // package.json has a typed, structural rewrite above. Never run textual
    // source rewrites over it: a destination such as `source-copy` still
    // contains `source`, so replacing the old name again would corrupt the
    // already-canonical package name and entry metadata.
    if (
      rel !== "package.json" &&
      effectiveType === "worker" &&
      rewriteEnabled(options, "workerClassNames")
    ) {
      for (const [oldClass, nextClass] of Object.entries(effectiveClassMap)) {
        if (content.includes(oldClass)) {
          content = content.split(oldClass).join(nextClass);
          rewrites.push({
            file: destRel,
            description: `Rewrote class reference ${oldClass} -> ${nextClass}`,
          });
        }
      }
      if (content.includes(from)) {
        content = content.split(from).join(to);
        rewrites.push({
          file: destRel,
          description: `Rewrote worker repository path ${from} -> ${to}`,
        });
      }
    }

    planned[destRel] = content;
  }

  if (binaryFiles.length > 0) {
    warnings.push(
      `Binary files will be copied unchanged: ${binaryFiles.join(", ")}`,
    );
  }

  if (!effectiveType) {
    throw new Error(
      "Fork destination must identify a canonical project type so the planned repository can be preflighted",
    );
  }
  const executable = effectiveType === "panel" || effectiveType === "worker";
  const authorityReview = executable
    ? {
        manifest: requireAuthority(options.authority, options.authorityReason),
        rationale: options.authorityReason!,
      }
    : null;
  if (authorityReview) {
    const manifest = JSON.parse(planned["package.json"] as string);
    manifest.vibestudio.authority = authorityReview.manifest;
    planned["package.json"] = JSON.stringify(manifest, null, 2) + "\n";
    planned["AUTHORITY.md"] =
      `# Authority intent\n\n${authorityReview.rationale}\n\nThis rationale is review evidence, not a grant. The manifest and receiver contracts define the requested ceiling.\n`;
    if (!createdFiles.includes("AUTHORITY.md"))
      createdFiles.push("AUTHORITY.md");
  }
  const preflight = preflightProjectFiles({
    projectType: effectiveType,
    name: newName,
    files: planned,
  });

  try {
    if (await fs.exists("meta/vibestudio.yml")) {
      const meta = await readText("meta/vibestudio.yml");
      if (
        meta.includes(from) ||
        Object.keys(effectiveClassMap).some((oldClass) =>
          meta.includes(oldClass),
        )
      ) {
        warnings.push(
          "Workspace meta/vibestudio.yml references the source project or worker classes; review global config before launching the fork.",
        );
      }
    }
  } catch {
    // Best-effort warning only.
  }

  if (options.dryRun) {
    return {
      source: from,
      created: to,
      files: createdFiles,
      preflight,
      rewrites,
      warnings,
      dryRun: true,
      preparation: null,
      authorityReview,
    };
  }

  const initialFiles: Record<string, string | Uint8Array> = {};
  for (const [rel, content] of Object.entries(planned))
    initialFiles[rel] = content;
  const preparation = await prepareChanges(
    [repositoryChange(to, initialFiles)],
    `Prepare fork ${from} -> ${to}`,
    await vcs.status({ contextId }),
  );
  return {
    source: from,
    created: to,
    files: createdFiles,
    preflight,
    rewrites,
    warnings,
    dryRun: false,
    preparation,
    authorityReview,
  };
}

export async function forkPanel(params: {
  from: string;
  name: string;
  title?: string;
  dryRun?: boolean;
  authority: UnitAuthorityManifest;
  authorityReason: string;
}): Promise<ForkProjectResult> {
  return forkProject({
    from: params.from,
    to: `panels/${params.name}`,
    title: params.title,
    dryRun: params.dryRun,
    authority: params.authority,
    authorityReason: params.authorityReason,
  });
}

export async function forkWorker(params: {
  from: string;
  name: string;
  title?: string;
  classMap?: Record<string, string>;
  dryRun?: boolean;
  authority: UnitAuthorityManifest;
  authorityReason: string;
}): Promise<ForkProjectResult> {
  return forkProject({
    from: params.from,
    to: `workers/${params.name}`,
    title: params.title,
    classMap: params.classMap,
    dryRun: params.dryRun,
    authority: params.authority,
    authorityReason: params.authorityReason,
  });
}
