import type { JsonRepresentation } from "@panticonic/pi-chord";
import { toolDetails } from "./native-tool-json.js";
/**
 * Typed mutation surface for context-local workspace services.
 *
 * A root selection, provider export, and optional singleton are one semantic
 * edit. This keeps source edits atomic and validates the exact candidate before
 * it can become the context's working state.
 */

import { Type } from "@panticonic/pi-ai";
import type {
  ToolRegistration,
  ToolExecutionResult,
} from "@panticonic/pi-durable";
import type { VcsWorkingMutationResult } from "@vibestudio/service-schemas/vcs";
import YAML from "yaml";
import {
  planServiceMutation,
  type ServiceRegistration,
  type ServiceMutation,
} from "@vibestudio/workspace-contracts/serviceMutation";
import { generateDiffString } from "./edit-diff.js";
import { resolveToolFile } from "../semantic-file-resolution.js";
import {
  resolveToolWorkingState,
  toolCommandId,
  toolContextId,
  type ToolEditingVcs,
  type ToolMutationContext,
} from "./tool-vcs.js";

const principalSchema = Type.Union([
  Type.Literal("host"),
  Type.Literal("user"),
  Type.Literal("code"),
  Type.Literal("session"),
  Type.Literal("mission"),
  Type.Literal("website"),
]);

const bindingSchema = Type.Union(
  [
    Type.Literal("consent"),
    Type.Literal("declared"),
    Type.Object(
      {
        declaredFor: Type.Array(Type.String({ minLength: 1 }), {
          minItems: 1,
          uniqueItems: true,
        }),
      },
      { additionalProperties: false },
    ),
  ],
  {
    description:
      "Service wiring policy: consent asks each caller to approve access; declared admits the listed principals through this reviewed workspace declaration; declaredFor admits only named consumer repository paths without an extra binding prompt. Receiver method authority still applies independently.",
  },
);

const serviceExportSchema = Type.Union([
  Type.Object({
    name: Type.String({ minLength: 1 }),
    title: Type.Optional(Type.String()),
    action: Type.String({ minLength: 1 }),
    description: Type.Optional(Type.String()),
    notability: Type.Optional(Type.Union([Type.Literal("headline"), Type.Literal("everyday")])),
    presentation: Type.Object({
      domain: Type.Union([Type.Literal("files"), Type.Literal("sharing"), Type.Literal("accounts"), Type.Literal("web"), Type.Literal("automation"), Type.Literal("people"), Type.Literal("computer")]),
      verb: Type.Union([Type.Literal("see"), Type.Literal("act"), Type.Literal("manage")]),
      substanceKind: Type.Optional(Type.Union([Type.Literal("change-set"), Type.Literal("send"), Type.Literal("deletion"), Type.Literal("custom")])),
    }, { additionalProperties: false }),
    protocols: Type.Optional(Type.Array(Type.String(), { uniqueItems: true })),
    authority: Type.Object({
      principals: Type.Array(principalSchema, { minItems: 1, uniqueItems: true }),
      binding: Type.Optional(bindingSchema),
    }, { additionalProperties: false }),
    durableObject: Type.Object({ className: Type.String(), context: Type.Optional(Type.Literal("creator")) }, { additionalProperties: false }),
  }, { additionalProperties: false }),
  Type.Object({
    name: Type.String({ minLength: 1 }),
    title: Type.Optional(Type.String()),
    action: Type.String({ minLength: 1 }),
    description: Type.Optional(Type.String()),
    notability: Type.Optional(Type.Union([Type.Literal("headline"), Type.Literal("everyday")])),
    presentation: Type.Object({
      domain: Type.Union([Type.Literal("files"), Type.Literal("sharing"), Type.Literal("accounts"), Type.Literal("web"), Type.Literal("automation"), Type.Literal("people"), Type.Literal("computer")]),
      verb: Type.Union([Type.Literal("see"), Type.Literal("act"), Type.Literal("manage")]),
      substanceKind: Type.Optional(Type.Union([Type.Literal("change-set"), Type.Literal("send"), Type.Literal("deletion"), Type.Literal("custom")])),
    }, { additionalProperties: false }),
    protocols: Type.Optional(Type.Array(Type.String(), { uniqueItems: true })),
    authority: Type.Object({
      principals: Type.Array(principalSchema, { minItems: 1, uniqueItems: true }),
      binding: Type.Optional(bindingSchema),
    }, { additionalProperties: false }),
    worker: Type.Object({ routePath: Type.String() }, { additionalProperties: false }),
  }, { additionalProperties: false }),
]);

const workspaceServiceSchema = Type.Union(
  [
    Type.Object(
      {
        operation: Type.Literal("upsert"),
        source: Type.String({
          description: "Provider worker source, e.g. workers/todo-store.",
        }),
        service: serviceExportSchema,
        singletonKey: Type.Optional(Type.String({ minLength: 1 })),
      },
      {
        additionalProperties: false,
        description:
          "Select one provider unit service export and optionally declare its Durable Object singleton key.",
      },
    ),
    Type.Object(
      {
        operation: Type.Literal("remove"),
        source: Type.String({ description: "Provider unit repository path." }),
        name: Type.String({ description: "Stable service name to remove." }),
        removeSingleton: Type.Optional(
          Type.Boolean({
            description:
              "Also remove the matching singleton when no remaining service uses its provider class.",
          }),
        ),
      },
      { additionalProperties: false },
    ),
  ],
  {
    description:
      "Service details live in the provider unit package.json; meta/vibestudio.yml selects only source and name.",
  },
);

export type WorkspaceServiceToolInput =
  | (Omit<Extract<ServiceMutation, { operation: "create" | "upsert" }>, "operation"> & {
      operation: "upsert";
    })
  | Extract<ServiceMutation, { operation: "remove" }>;

export interface WorkspaceServiceToolDetails {
  changed: boolean;
  operation: "upsert" | "remove";
  serviceName: string;
  docsId?: string;
  diff: string;
  diagnostic?: "not-found" | "singleton-still-used";
  vcsResult?: VcsWorkingMutationResult;
}

export interface WorkspaceServiceToolDeps {
  validateConfig(candidate: { manifest: string; serviceManifests: Record<string, string> }): Promise<void>;
}

export function createWorkspaceServiceTool(
  vcs: ToolEditingVcs,
  context: ToolMutationContext,
  deps: WorkspaceServiceToolDeps,
): ToolRegistration<
  typeof workspaceServiceSchema,
  JsonRepresentation<WorkspaceServiceToolDetails>
> {
  return {
    name: "workspace_service",

    description:
      "Atomically add, update, or remove a service export in its provider package.json and select it in meta/vibestudio.yml. For Durable Objects, singletonKey declares the matching singleton in the same validated edit. Use this instead of editing either document by hand; then confirm the live contract with docs_search/docs_open before eval.",
    parameters: workspaceServiceSchema,

    execute: async (
      input,
      _api,
      executionContext,
    ): Promise<
      ToolExecutionResult<JsonRepresentation<WorkspaceServiceToolDetails>>
    > => {
      const signal = executionContext.abortSignal;
      if (signal?.aborted) throw new Error("Operation aborted");
      // ToolRegistration invokes execute only after validating the discriminated
      // TypeBox union. Keep the implementation on that exact public shape.
      const command = input as WorkspaceServiceToolInput;
      const operation = command.operation;
      const serviceName = command.operation === "upsert" ? command.service.name : command.name;
      const workingHead = await resolveToolWorkingState(vcs, context);
      const file = await resolveToolFile(
        vcs,
        workingHead,
        "meta/vibestudio.yml",
      );
      if (!file || file.content.kind !== "text") {
        throw new Error(
          "The current workspace has no text meta/vibestudio.yml document",
        );
      }
      const sourceContent = file.content.text;
      const document = YAML.parseDocument(sourceContent);
      if (document.errors.length > 0) throw document.errors[0];
      const raw = document.toJS() as { services?: Array<{source:string;name:string}>; singletonObjects?: Array<{source:string;className:string;key:string}> } | null;
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        throw new Error(
          "meta/vibestudio.yml must contain a configuration mapping",
        );
      }
      const providerSource = command.source;
      const providerPath = `${providerSource}/package.json`;
      const providerFile = await resolveToolFile(vcs, workingHead, providerPath);
      if (!providerFile || providerFile.content.kind !== "text") {
        throw new Error(`Provider unit ${providerSource} has no text package.json`);
      }
      let packageDocument: Record<string, unknown>;
      try {
        packageDocument = JSON.parse(providerFile.content.text) as Record<string, unknown>;
      } catch (error) {
        throw new Error(`${providerPath} is not valid JSON`, { cause: error });
      }
      const originalPackageValue = JSON.stringify(packageDocument);
      const vibestudio = packageDocument["vibestudio"];
      const unitConfig = typeof vibestudio === "object" && vibestudio !== null && !Array.isArray(vibestudio)
        ? vibestudio as Record<string, unknown>
        : {};
      const exports = unitConfig["services"];
      if (exports !== undefined && !Array.isArray(exports)) throw new Error(`${providerPath}: vibestudio.services must be an array`);
      const plan = planServiceMutation({
        services: raw.services ?? [],
        singletonObjects: raw.singletonObjects ?? [],
        providerServices: (exports ?? []) as ServiceRegistration["service"][],
      }, command);
      if (plan.diagnostic) {
        return {
          content: [
            {
              type: "text",
              text:
                plan.diagnostic === "not-found"
                  ? `No service named ${serviceName} is declared.`
                  : "No changes made: another service still uses the singleton.",
            },
          ],
          details: toolDetails({
            changed: false,
            operation: "remove",
            serviceName,
            diff: "",
            diagnostic: plan.diagnostic,
          }),
        };
      }
      document.set("services", plan.services);
      document.set("singletonObjects", plan.singletonObjects);
      unitConfig["services"] = plan.providerServices;
      packageDocument["vibestudio"] = unitConfig;
      const candidate = String(document);
      const providerCandidate = JSON.stringify(packageDocument) === originalPackageValue
        ? providerFile.content.text
        : `${JSON.stringify(packageDocument, null, 2)}\n`;
      await deps.validateConfig({ manifest: candidate, serviceManifests: { [providerSource]: providerCandidate } });
      if (signal?.aborted) throw new Error("Operation aborted");

      const changed = candidate !== sourceContent || providerCandidate !== providerFile.content.text;
      const vcsResult = changed
        ? await vcs.edit({
            contextId: toolContextId(context),
            expectedWorkingHead: workingHead,
            commandId: toolCommandId(context),
            changes: [
              {
                kind: "text-edit",
                repositoryId: file.repositoryId,
                fileId: file.fileId,
                edits: [
                  { start: 0, end: sourceContent.length, text: candidate },
                ],
              },
              {
                kind: "text-edit",
                repositoryId: providerFile.repositoryId,
                fileId: providerFile.fileId,
                edits: [{ start: 0, end: providerFile.content.text.length, text: providerCandidate }],
              },
            ],
          })
        : undefined;
      const manifestDiff = generateDiffString(sourceContent, candidate).diff;
      const providerDiff = generateDiffString(providerFile.content.text, providerCandidate).diff;
      const diff = [
        manifestDiff ? `meta/vibestudio.yml\n${manifestDiff}` : "",
        providerDiff ? `${providerPath}\n${providerDiff}` : "",
      ].filter(Boolean).join("\n");
      const docsId =
        operation === "upsert" ? `workspace:${serviceName}` : undefined;
      return {
        content: [
          {
            type: "text",
            text:
              operation === "upsert"
                ? `${changed ? "Selected" : "Already selected"} ${serviceName} from ${providerSource} and validated the complete workspace config. Open ${docsId} with docs_open before eval.`
                : `Removed ${serviceName} and validated the complete workspace config.`,
          },
        ],
        details: toolDetails({
          changed,
          operation,
          serviceName,
          ...(docsId ? { docsId } : {}),
          diff,
          ...(vcsResult ? { vcsResult } : {}),
        }),
      };
    },
  };
}
