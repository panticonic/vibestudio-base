import YAML from "yaml";
import { createTypedServiceClient } from "@vibestudio/shared/typedServiceClient";
import { vcsMethods } from "@vibestudio/service-schemas/vcs";
import type {
  TemplateAuthoringInspection,
  TemplatePublication,
  TemplatesClient,
} from "@vibestudio/service-schemas/templates";
import type { WorkspaceTemplateInstallation } from "@vibestudio/workspace-contracts/types";
import {
  canonicalTemplateYaml,
  templateManifestDocument,
} from "@vibestudio/workspace/templateManifest";
import { normalizeTemplateGitUrl } from "@vibestudio/workspace/templateCoordinates";
import {
  TemplateOperations,
  operationIdentity,
  type TemplateOperationStep,
} from "./operations.js";
import type { ExtensionContextLike } from "./context.js";
import type { SemanticWorkspaceObservation } from "./workspace.js";

type Request = Parameters<TemplatesClient["publishAuthoring"]>[0];
type Publication = {
  request: Request;
  contextId: string;
  plan: TemplateAuthoringInspection;
  authored: Record<string, unknown>;
  installation: WorkspaceTemplateInstallation;
  steps: Record<string, TemplateOperationStep>;
};

export function publicationInput(
  request: Omit<Request, "expectedRemoteCommit">,
  plan: TemplateAuthoringInspection,
) {
  return {
    operationId: request.commandId,
    expectedMainEventId: plan.mainEventId,
    templateName: plan.request.name,
    version: request.version,
    manifest: plan.manifest,
    manifestDigest: plan.manifestDigest,
    parts: plan.includedParts.map((repoPath) => ({
      repoPath,
      subdir: repoPath,
    })),
    destination: request.destination,
    ...(request.credentialId ? { credentialId: request.credentialId } : {}),
    ...(request.creation ? { creation: request.creation } : {}),
  };
}

export function createTemplatePublisher(
  ctx: ExtensionContextLike,
  inspect: (input: Request) => Promise<{
    observation: SemanticWorkspaceObservation;
    plan: TemplateAuthoringInspection;
  }>,
) {
  const operations = new TemplateOperations<Publication>(
    ctx,
    "template-publications",
  );
  const vcs = createTypedServiceClient(
    "vcs",
    vcsMethods,
    (_service, method, args) => ctx.rpc.call("main", `vcs.${method}`, ...args),
  );
  return (request: Request) =>
    operations.serial(request.commandId, async () => {
      let operation: Publication;
      try {
        operation = await operations.load(request.commandId);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        const { observation, plan } = await inspect(request);
        if (plan.fingerprint !== request.expectedFingerprint)
          throw new Error(
            "Workspace source changed after inspection; inspect authoring again",
          );
        if (!observation.manifest.installation)
          throw new Error("Workspace ownership declarations are missing");
        const destination =
          request.destination.provider === "github"
            ? normalizeTemplateGitUrl(
                `https://github.com/${request.destination.owner}/${request.destination.name}.git`,
              )
            : null;
        if (
          destination &&
          observation.manifest.installation.sources.some(
            (source) =>
              normalizeTemplateGitUrl(source.pin.url) === destination &&
              (!observation.manifest.installation?.upstream ||
                normalizeTemplateGitUrl(source.pin.url) !==
                  normalizeTemplateGitUrl(
                    observation.manifest.installation.upstream.url,
                  )),
          )
        )
          throw new Error(
            "That repository is a dependency of this workspace. Open it for template authoring to publish a complete release there.",
          );
        operation = {
          request,
          contextId: `template-publication-${operationIdentity(request.commandId).slice(0, 24)}`,
          plan,
          authored: templateManifestDocument(observation.manifest),
          installation: observation.manifest.installation,
          steps: {},
        };
        await operations.save(operation);
      }
      if (operationIdentity(operation.request) !== operationIdentity(request))
        throw new Error(
          "Publication command ID was already used with different inputs",
        );
      const step = <R>(
        key: string,
        method: string,
        args: unknown[],
        invoke?: (args: unknown[]) => Promise<R>,
      ) => operations.step<R>(operation, key, method, args, invoke);
      await step("context", "runtime.createContext", [
        { contextId: operation.contextId },
      ]);
      if (
        !operation.steps["remote"] &&
        (await vcs.status({ contextId: operation.contextId })).mainEventId !==
          operation.plan.mainEventId
      )
        throw new Error(
          "Workspace main changed before publication; review a new release",
        );
      const plan = operation.plan;
      const result = await step<TemplatePublication>(
        "remote",
        "publishTemplate",
        [
          {
            ...publicationInput(request, plan),
            expectedRemoteCommit: request.expectedRemoteCommit,
          },
        ],
        (args) =>
          ctx.extensions.invoke(
            "@workspace-extensions/git-bridge",
            "publishTemplate",
            args,
          ),
      );
      if (!operation.steps["edit"]) {
        const credential = result.credential;
        const upstream = {
          url: result.templateUrl,
          ref: result.ref,
          commit: result.commit,
          ...(credential ? { credential } : {}),
        };
        const same = (a: string, b: string) =>
          normalizeTemplateGitUrl(a) === normalizeTemplateGitUrl(b);
        const sources = operation.installation.sources.filter(
          (source) =>
            (!operation.installation.upstream ||
              !same(source.pin.url, operation.installation.upstream.url)) &&
            !same(source.pin.url, upstream.url),
        );
        // The workspace retains omitted local units; the published root is its exact external baseline.
        const metadata = operation.authored["template"] as Record<
          string,
          unknown
        >;
        metadata["name"] = plan.request.name;
        metadata["description"] = plan.request.description;
        const release = YAML.parse(plan.manifest) as {
          template: {
            repositories: string[];
            overrides?: Array<{ repoPath: string; source: string }>;
          };
        };
        metadata["repositories"] = [
          ...new Set([
            ...(metadata["repositories"] as string[]),
            ...release.template.repositories,
          ]),
        ].sort();
        const overrides = new Map(
          (
            (metadata["overrides"] as Array<{
              repoPath: string;
              source: string;
            }>) ?? []
          ).map((value) => [value.repoPath, value]),
        );
        for (const override of release.template.overrides ?? [])
          overrides.set(override.repoPath, override);
        if (overrides.size) metadata["overrides"] = [...overrides.values()];
        metadata["installation"] = {
          sources: [...sources, { pin: upstream, manifest: plan.manifest }],
          upstream,
        };
        const status = await vcs.status({ contextId: operation.contextId });
        const repo = await vcs.resolveRepository({
          state: status.workingHead,
          repoPath: "meta",
        });
        if (!repo) throw new Error("Workspace meta repository disappeared");
        const file = await vcs.readFile({
          state: status.workingHead,
          repositoryId: repo.repositoryId,
          file: { kind: "path", path: "vibestudio.yml" },
        });
        if (!file || file.content.kind !== "text")
          throw new Error("Workspace manifest is unavailable");
        await step("edit", "vcs.edit", [
          {
            commandId: `${operation.contextId}:edit`,
            contextId: operation.contextId,
            expectedWorkingHead: status.workingHead,
            intentSummary: "Record template publication upstream",
            changes: [
              {
                kind: "text-edit",
                repositoryId: repo.repositoryId,
                fileId: file.fileId,
                edits: [
                  {
                    start: 0,
                    end: file.content.text.length,
                    text: canonicalTemplateYaml(operation.authored),
                  },
                ],
              },
            ],
          },
        ]);
      } else await step("edit", "vcs.edit", []);
      if (!operation.steps["commit"])
        await step("commit", "vcs.commit", [
          {
            commandId: `${operation.contextId}:commit`,
            contextId: operation.contextId,
            expectedWorkingHead: (
              await vcs.status({ contextId: operation.contextId })
            ).workingHead,
            message: `Publish template ${request.version}`,
          },
        ]);
      else await step("commit", "vcs.commit", []);
      if (!operation.steps["push"])
        await step("push", "vcs.push", [
          {
            commandId: `${operation.contextId}:push`,
            contextId: operation.contextId,
            expectedCommittedEventId: (
              await vcs.status({ contextId: operation.contextId })
            ).committed.eventId,
            expectedMainEventId: plan.mainEventId,
          },
        ]);
      else await step("push", "vcs.push", []);
      return result;
    });
}
