import { createTemplatePublisher } from "./publication.js";
import { installedDependencyLayers } from "@vibestudio/workspace/templateManifest";
import { templateRepositoryOwners } from "@vibestudio/workspace/templateManifestMerge";
import { createGitHubClient } from "@workspace/integrations/github";
import { createTemplateLifecycle } from "./lifecycle.js";
import { Buffer } from "node:buffer";
import type {
  TemplateAuthoringIntent,
  TemplateInspection,
  TemplateLocator,
} from "@vibestudio/service-schemas/templates";
import {
  DEFAULT_TEMPLATE_REGISTRY_URL,
  templateRegistrySchema,
} from "@vibestudio/service-schemas/templates";
import { WorkspaceTemplatePinSchema } from "@vibestudio/workspace-contracts/workspaceConfigSchema";
import type { ExtensionContextLike } from "./context.js";
import {
  inspectTemplateAuthoring,
  templateAuthoringSetup,
  nextPublicationVersion,
  listTemplateAuthoringParts,
} from "./authoring.js";
import { observeWorkspace } from "./workspace.js";
import { retainedInspectionPin } from "./inspectionPin.js";
import { discoverDirectTemplatePin } from "./source.js";

export async function resolveInspectionPin(
  ctx: ExtensionContextLike,
  locator: TemplateLocator,
) {
  const retained = retainedInspectionPin(locator);
  if (retained) return WorkspaceTemplatePinSchema.parse(retained);
  if ("url" in locator) return resolveSource(ctx, locator);
  throw new Error("Unsupported template locator");
}

/**
 * Resolve a moving source through the instance's designated checkpoint first.
 * Development instances designate the complete official catalog; published
 * instances have no such checkpoints and therefore discover the remote head.
 */
async function resolveSource(
  ctx: ExtensionContextLike,
  source: { url: string; credential?: string },
) {
  const local = await ctx.rpc.call(
    "main",
    "workspaceTemplateSource.resolveLocal",
    source.url,
  );
  return WorkspaceTemplatePinSchema.parse(
    local ?? (await discoverDirectTemplatePin(ctx, ctx.storage.root, source)),
  );
}

function inheritedInventory(
  observation: Awaited<ReturnType<typeof observeWorkspace>>,
) {
  const installation = observation.manifest.installation;
  if (!installation)
    throw new Error(
      "This workspace has no installed ownership declarations. Reopen it using the template picker.",
    );
  const layers = installedDependencyLayers(observation.manifest);
  const owners = templateRepositoryOwners(layers);
  owners.delete("meta");
  return {
    repositories: [...owners.keys()],
    owners: new Map(
      [...owners].map(([repoPath, layer]) => [repoPath, layer.label]),
    ),
  };
}

async function inspect(ctx: ExtensionContextLike, locator: TemplateLocator) {
  const pin = await resolveInspectionPin(ctx, locator);
  return ctx.rpc.call<TemplateInspection>(
    "main",
    "workspaceTemplateSource.inspectExact",
    pin,
  );
}

async function loadRegistry(ctx: ExtensionContextLike, requestedUrl?: string) {
  if (!requestedUrl) {
    const local = await ctx.rpc.call(
      "main",
      "workspaceTemplateSource.localRegistry",
    );
    if (local) return templateRegistrySchema.parse(local);
  }
  const url = new URL(requestedUrl ?? DEFAULT_TEMPLATE_REGISTRY_URL);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Template registry URLs must use HTTP(S)");
  }
  const response = await ctx.credentials.fetch(url);
  if (!response.ok) {
    throw new Error(
      `Template registry request failed with HTTP ${response.status}`,
    );
  }
  const length = Number(response.headers.get("content-length") ?? 0);
  if (Number.isFinite(length) && length > 1024 * 1024) {
    throw new Error("Template registry exceeds the 1 MiB limit");
  }
  const body = await response.text();
  if (Buffer.byteLength(body, "utf8") > 1024 * 1024) {
    throw new Error("Template registry exceeds the 1 MiB limit");
  }
  return templateRegistrySchema.parse(JSON.parse(body));
}

export async function activate(ctx: ExtensionContextLike) {
  ctx.log.info("templates activating");
  return {
    ...createTemplateLifecycle(ctx, {
      inspect: (pin) => inspect(ctx, { pin }),
      resolve: (source) => resolveSource(ctx, source),
    }),
    registry: ({ url }: { url?: string }) => loadRegistry(ctx, url),
    resolveSource: (source: { url: string; credential?: string }) =>
      resolveSource(ctx, source),
    inspect: (locator: TemplateLocator) => inspect(ctx, locator),
    inspectAuthoring: async (input: TemplateAuthoringIntent) => {
      const observation = await observeWorkspace(ctx);
      return inspectTemplateAuthoring(
        ctx,
        observation,
        input,
        inheritedInventory(observation),
      );
    },
    publicationRepositories: async ({
      credentialId,
      page = 1,
    }: {
      credentialId?: string;
      page?: number;
    }) => {
      const github = createGitHubClient(ctx.credentials, { credentialId });
      const [user, repositories] = await Promise.all([
        github.getUser(),
        github.listRepos({
          per_page: 100,
          page,
          sort: "full_name",
          direction: "asc",
        }),
      ]);
      return {
        owner: user.login,
        repositories: repositories
          .filter(
            (repo) =>
              repo.permissions?.push === true &&
              !repo.archived &&
              !repo.disabled,
          )
          .map((repo) => ({
            owner: repo.owner.login,
            name: repo.name,
            private: repo.private,
            webUrl: repo.html_url,
          })),
        nextPage: repositories.length === 100 ? page + 1 : null,
      };
    },
    authoringParts: async () => {
      const observation = await observeWorkspace(ctx);
      const inherited = inheritedInventory(observation);
      return (await listTemplateAuthoringParts(ctx, observation)).map(
        (part) => ({
          ...part,
          ...(inherited.owners.has(part.repoPath)
            ? { inheritedFrom: inherited.owners.get(part.repoPath) }
            : {}),
        }),
      );
    },
    publishAuthoring: createTemplatePublisher(ctx, async (input) => {
      const observation = await observeWorkspace(ctx);
      const plan = await inspectTemplateAuthoring(
        ctx,
        observation,
        input.intent,
        inheritedInventory(observation),
      );
      return { observation, plan };
    }),
    authoringSetup: async () => {
      const observation = await observeWorkspace(ctx);
      return templateAuthoringSetup(
        observation,
        inheritedInventory(observation).owners,
      );
    },
    publicationVersion: async ({
      owner,
      name,
      credentialId,
    }: {
      owner: string;
      name: string;
      credentialId?: string;
    }) => {
      const github = createGitHubClient(ctx.credentials, { credentialId });
      const tags: string[] = [];
      for (let page = 1; ; page++) {
        const batch = await github.listTags(owner, name, page);
        tags.push(...batch.map((tag) => tag.name));
        if (batch.length < 100) break;
      }
      return nextPublicationVersion(tags);
    },
    authoringUpstream: async () =>
      (await observeWorkspace(ctx)).manifest.installation?.upstream ?? null,
  };
}
export type Api = Awaited<ReturnType<typeof activate>>;
