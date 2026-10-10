import type { TemplatesClient } from "@vibestudio/service-schemas/templates";
import { createTemplateUpdateChecks } from "./updateChecks.js";
import { createTemplatePublisher, publicationInput } from "./publication.js";
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

async function inheritedInventory(
  ctx: ExtensionContextLike,
  observation: Awaited<ReturnType<typeof observeWorkspace>>,
) {
  const installation = observation.installation;
  if (!installation)
    throw new Error(
      "This workspace has no installed ownership declarations. Reopen it using the template picker.",
    );
  const dependencyLayers = installedDependencyLayers(
    observation.manifest,
    observation.installation,
  );
  ctx.log.info("Template authoring inherited inventory started", {
    layers: dependencyLayers.length,
  });
  const layers = await Promise.all(
    dependencyLayers.map(async (layer) => {
      const source = installation.sources.find(
        (source) => source.pin.url === layer.label,
      );
      if (!source)
        throw new Error(`Installed dependency ${layer.label} disappeared`);
      const step = `inspectInstalledLayer:${layer.label}`;
      ctx.log.info("Template authoring metadata step started", { step });
      let inspected: TemplateInspection;
      try {
        inspected = await inspect(ctx, { pin: source.pin });
      } catch (error) {
        ctx.log.warn?.("Template authoring metadata step failed", {
          step,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
      ctx.log.info("Template authoring metadata step completed", { step });
      return { ...layer, repositories: inspected.repositories };
    }),
  );
  const owners = templateRepositoryOwners(layers);
  owners.delete("meta");
  const inventory = {
    repositories: [...owners.keys()],
    owners: new Map(
      [...owners].map(([repoPath, layer]) => [repoPath, layer.label]),
    ),
  };
  ctx.log.info("Template authoring inherited inventory completed", {
    repositories: inventory.repositories.length,
  });
  return inventory;
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
  const updates = createTemplateUpdateChecks(ctx, (source) =>
    resolveSource(ctx, source),
  );
  const unsubscribe = ctx.rpc.on?.("workspace:protected-refs-changed", () => {
    void updates.reconcileInstalled().catch((error) =>
      ctx.log.warn?.("Could not reconcile workspace update notices", {
        error: String(error),
      }),
    );
  });
  if (unsubscribe) ctx.subscriptions?.push({ dispose: unsubscribe });
  return {
    updateAssistant: async () => {
      const service = await ctx.rpc.call<{ kind: string; targetId?: string }>(
        "main",
        "workers.resolveService",
        "vibestudio.missions.v1",
      );
      if (service.kind !== "durable-object" || !service.targetId)
        throw new Error("Automations service is unavailable");
      return ctx.rpc.call(service.targetId, "getDefault", "workspace-updates");
    },
    updateSignal: updates.signal,
    updateStatus: updates.status,
    checkUpdates: updates.check,
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
        await inheritedInventory(ctx, observation),
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
      const inherited = await inheritedInventory(ctx, observation);
      return (await listTemplateAuthoringParts(ctx, observation)).map(
        (part) => ({
          ...part,
          ...(inherited.owners.has(part.repoPath)
            ? { inheritedFrom: inherited.owners.get(part.repoPath) }
            : {}),
        }),
      );
    },
    reviewPublication: async (
      input: Parameters<TemplatesClient["reviewPublication"]>[0],
    ) => {
      const observation = await observeWorkspace(ctx);
      const plan = await inspectTemplateAuthoring(
        ctx,
        observation,
        input.intent,
        await inheritedInventory(ctx, observation),
      );
      if (plan.fingerprint !== input.expectedFingerprint)
        throw new Error("Workspace changed. Review the release again.");
      return ctx.extensions.invoke(
        "@workspace-extensions/git-bridge",
        "reviewTemplatePublication",
        [publicationInput(input, plan)],
      );
    },
    publishAuthoring: createTemplatePublisher(ctx, async (input) => {
      const observation = await observeWorkspace(ctx);
      const plan = await inspectTemplateAuthoring(
        ctx,
        observation,
        input.intent,
        await inheritedInventory(ctx, observation),
      );
      return { observation, plan };
    }),
    authoringSetup: async () => {
      ctx.log.info("Template authoring setup started");
      try {
        const observation = await observeWorkspace(ctx);
        const inventory = await inheritedInventory(ctx, observation);
        const setup = templateAuthoringSetup(observation, inventory.owners);
        ctx.log.info("Template authoring setup completed", {
          repositories: inventory.repositories.length,
        });
        return setup;
      } catch (error) {
        ctx.log.warn?.("Template authoring setup failed", {
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
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
      (await observeWorkspace(ctx)).installation?.upstream ?? null,
  };
}
export type Api = Awaited<ReturnType<typeof activate>>;
