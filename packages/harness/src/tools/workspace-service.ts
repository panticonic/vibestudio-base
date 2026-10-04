import type { JsonRepresentation } from "@panticonic/pi-chord";
import { toolDetails } from "./native-tool-json.js";
/**
 * Typed mutation surface for context-local workspace services.
 *
 * A service declaration and its optional singleton are one semantic edit. This
 * keeps agents out of brittle YAML splicing and validates the complete candidate
 * before it can become the context's working state.
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

const workspaceServiceSchema = Type.Union(
  [
    Type.Object(
      {
        operation: Type.Literal("upsert"),
        name: Type.String({
          description: "Stable service name to add or update.",
        }),
        source: Type.String({
          description: "Provider worker source, e.g. workers/todo-store.",
        }),
        title: Type.String({ description: "User-facing service title." }),
        action: Type.String({
          description: 'User-facing verb phrase completing "Allow … to …".',
        }),
        description: Type.String({
          description: "Plain-language purpose of the service.",
        }),
        notability: Type.Union(
          [Type.Literal("headline"), Type.Literal("everyday")],
          {
            description:
              "Use headline when a non-technical person would want to know before adding a caller; everyday for ordinary workspace machinery.",
          },
        ),
        presentation: Type.Object(
          {
            domain: Type.Union([
              Type.Literal("files"),
              Type.Literal("sharing"),
              Type.Literal("accounts"),
              Type.Literal("web"),
              Type.Literal("automation"),
              Type.Literal("people"),
              Type.Literal("computer"),
            ]),
            verb: Type.Union([
              Type.Literal("see"),
              Type.Literal("act"),
              Type.Literal("manage"),
            ]),
            substanceKind: Type.Optional(
              Type.Union([
                Type.Literal("change-set"),
                Type.Literal("send"),
                Type.Literal("deletion"),
                Type.Literal("custom"),
              ]),
            ),
          },
          {
            additionalProperties: false,
            description:
              "How authority prompts describe the service. Sharing requires substanceKind.",
          },
        ),
        protocols: Type.Array(Type.String(), {
          minItems: 1,
          uniqueItems: true,
          description: "Stable protocols accepted by workers.resolveService().",
        }),
        principals: Type.Array(principalSchema, {
          minItems: 1,
          uniqueItems: true,
          description:
            "Authenticated principal kinds allowed by the service declaration.",
        }),
        binding: bindingSchema,
        transport: Type.Union([
          Type.Object(
            {
              kind: Type.Literal("durable-object"),
              className: Type.String(),
              objectKey: Type.Optional(
                Type.String({
                  description:
                    "When present, atomically declares this default singleton object key too.",
                }),
              ),
            },
            { additionalProperties: false },
          ),
          Type.Object(
            {
              kind: Type.Literal("worker"),
              routePath: Type.String(),
            },
            { additionalProperties: false },
          ),
        ]),
      },
      {
        additionalProperties: false,
        description:
          "Add or replace one complete context-local service declaration. All declaration metadata is required.",
      },
    ),
    Type.Object(
      {
        operation: Type.Literal("remove"),
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
      "Use operation=upsert with the complete declaration, or operation=remove with its stable name.",
  },
);

export type WorkspaceServiceToolInput =
  | (ServiceRegistration & { operation: "upsert" })
  | Extract<ServiceMutation, { operation: "remove" }>;

type WorkspaceConfigDocument = Parameters<typeof planServiceMutation>[0];

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
  validateConfig(content: string): Promise<void>;
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
      "Atomically add, update, or remove a live context-local service declaration in meta/vibestudio.yml. For Durable Objects, transport.objectKey declares the matching singleton in the same validated edit. Use this instead of splicing the services or singletonObjects YAML lists by hand; then confirm the live contract with docs_search/docs_open before eval.",
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
      const serviceName = command.name;
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
      const raw = document.toJS() as WorkspaceConfigDocument | null;
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        throw new Error(
          "meta/vibestudio.yml must contain a configuration mapping",
        );
      }
      const plan = planServiceMutation(raw, command);
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
      const candidate = String(document);
      await deps.validateConfig(candidate);
      if (signal?.aborted) throw new Error("Operation aborted");

      const vcsResult = await vcs.edit({
        contextId: toolContextId(context),
        expectedWorkingHead: workingHead,
        commandId: toolCommandId(context),
        changes: [
          {
            kind: "text-edit",
            repositoryId: file.repositoryId,
            fileId: file.fileId,
            edits: [{ start: 0, end: sourceContent.length, text: candidate }],
          },
        ],
      });
      const diff = generateDiffString(sourceContent, candidate).diff;
      const docsId =
        operation === "upsert" ? `workspace:${serviceName}` : undefined;
      return {
        content: [
          {
            type: "text",
            text:
              operation === "upsert"
                ? `Declared ${serviceName} and validated the complete workspace config. Open ${docsId} with docs_open before eval.`
                : `Removed ${serviceName} and validated the complete workspace config.`,
          },
        ],
        details: toolDetails({
          changed: true,
          operation,
          serviceName,
          ...(docsId ? { docsId } : {}),
          diff,
          vcsResult,
        }),
      };
    },
  };
}
