import type {
  TemplateAuthoringIntent,
  TemplateInspection,
  TemplateLocator,
  TemplatePublication,
} from "@vibestudio/service-schemas/templates";
import { WorkspaceTemplatePinSchema } from "@vibestudio/workspace-contracts/workspaceConfigSchema";
import type { ExtensionContextLike } from "./context.js";
import {
  inspectTemplateAuthoring,
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
  return local ?? discoverDirectTemplatePin(ctx, ctx.storage.root, source);
}

/**
 * Read what a request's declared dependencies already supply.
 *
 * A dependency is read at its own address. Publication commits a template to
 * `main` of its repository and tags the version, so a published template's
 * default branch is its latest version by construction — which is what makes
 * reading the address, rather than resolving a track, the same answer. An
 * exact `commit` is used exactly.
 */
async function inheritedInventory(
  ctx: ExtensionContextLike,
  dependencies: readonly import("@vibestudio/workspace-contracts/types").WorkspaceTemplateDependency[],
): Promise<{ repositories: string[]; files: string[] }> {
  const repositories: string[] = [];
  const files: string[] = [];
  const visited = new Set<string>();
  const visit = async (
    dependency: (typeof dependencies)[number],
  ): Promise<void> => {
    const key = `${dependency.url}\0${dependency.commit ?? "latest"}`;
    if (visited.has(key)) return;
    visited.add(key);
    const inspection = await inspect(
      ctx,
      dependency.commit
        ? {
            pin: {
              url: dependency.url,
              ref: dependency.track ?? "refs/heads/main",
              commit: dependency.commit,
              ...(dependency.credential
                ? { credential: dependency.credential }
                : {}),
            },
          }
        : {
            url: dependency.url,
            ...(dependency.credential
              ? { credential: dependency.credential }
              : {}),
          },
    );
    for (const upstream of inspection.dependencies) await visit(upstream);
    repositories.push(...inspection.repositories);
    files.push(...inspection.files);
  };
  for (const dependency of dependencies) {
    await visit(dependency);
  }
  return { repositories, files };
}

async function inspect(ctx: ExtensionContextLike, locator: TemplateLocator) {
  const pin = await resolveInspectionPin(ctx, locator);
  return ctx.rpc.call<TemplateInspection>(
    "main",
    "workspaceTemplateSource.inspectExact",
    pin,
  );
}

export async function activate(ctx: ExtensionContextLike) {
  ctx.log.info("templates activating");
  return {
    resolveSource: (source: { url: string; credential?: string }) =>
      resolveSource(ctx, source),
    inspect: (locator: TemplateLocator) => inspect(ctx, locator),
    inspectAuthoring: async (input: TemplateAuthoringIntent) => {
      const observation = await observeWorkspace(ctx);
      return inspectTemplateAuthoring(
        ctx,
        observation,
        input,
        await inheritedInventory(ctx, observation.templateDependencies),
      );
    },
    authoringParts: async () =>
      listTemplateAuthoringParts(ctx, await observeWorkspace(ctx)),
    async publishAuthoring(input: {
      commandId: string;
      intent: TemplateAuthoringIntent;
      expectedFingerprint: string;
      version: string;
      destination: { provider: string; owner: string; name: string };
      credentialId?: string;
      creation?: { private?: boolean; description?: string };
    }) {
      const observation = await observeWorkspace(ctx);
      const current = await inspectTemplateAuthoring(
        ctx,
        observation,
        input.intent,
        await inheritedInventory(ctx, observation.templateDependencies),
      );
      if (current.fingerprint !== input.expectedFingerprint)
        throw new Error(
          "Workspace source changed after inspection; inspect authoring again",
        );
      return ctx.extensions.invoke<TemplatePublication>(
        "@workspace-extensions/git-bridge",
        "publishTemplate",
        [
          {
            operationId: input.commandId,
            expectedMainEventId: current.mainEventId,
            templateName: current.request.name,
            version: input.version,
            manifest: current.manifest,
            manifestDigest: current.manifestDigest,
            parts: current.includedParts.map((repoPath) => ({
              repoPath,
              subdir: repoPath,
            })),
            destination: input.destination,
            ...(input.credentialId ? { credentialId: input.credentialId } : {}),
            creation: {
              private: input.creation?.private ?? true,
              description:
                input.creation?.description ?? input.intent.description,
            },
          },
        ],
      );
    },
  };
}
export type Api = Awaited<ReturnType<typeof activate>>;
