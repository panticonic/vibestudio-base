/**
 * AgentWorkerBase — workspace-default channel agent DO base.
 *
 * The reusable event-sourced vessel lives in `AgentVesselBase`; this subclass
 * binds the workspace defaults (model, credential presets) and the standard
 * agent method roster.
 */

import type { DurableObjectContext } from "@workspace/runtime/worker/durable-base";
import { createRpcFs } from "@workspace/runtime/worker/rpc-fs";
import {
  createCredentialClient,
  type StoredCredentialSummary,
} from "@workspace/runtime/credentials";
import { Type, type TSchema } from "@panticonic/pi-ai";
import type { JsonValue } from "@panticonic/pi-chord";
import type { ToolRegistration } from "@panticonic/pi-durable";
import { copyJson } from "@panticonic/pi-chord";
import type { ParticipantDescriptor } from "@workspace/harness";
import { CONVERSATION_IDENTITY_GUIDANCE } from "@workspace/harness/system-prompt";
import { createAgentReferenceStore } from "@workspace/harness/agent-references";
import type { ThinkingLevel } from "@workspace/harness";
import { channelTrajectoryFor } from "@vibestudio/trajectory-identity";
import type { RpcClient } from "@vibestudio/rpc";
import type { VcsCommitResult } from "@vibestudio/service-schemas/vcs";
import {
  testExecutionResultV1Schema,
  type TestExecutionResultV1,
  type WorkspaceTestArtifactV1,
} from "@vibestudio/service-schemas/build";
import { SUPPORTED_IMAGE_TYPES } from "@workspace/pubsub";
import {
  AGENT_MESSAGE_NOTIFICATION_KIND,
  agentMessageNotificationId,
  type AgentMessageNotificationData,
} from "@vibestudio/shared/userNotifications";
import {
  AGENTIC_PROTOCOL_VERSION,
  ALERT_RUNGS,
  defaultAlertRung,
  isAddresseeError,
  isAlertRung,
  resolveAddressee,
  type AddresseeError,
  type ParticipantRef,
  type ResolvedAddressee,
} from "@workspace/agentic-protocol";
import {
  AgentVesselBase,
  type AgentPromptResources,
  type AgentToolExecutionContext,
  type ApprovalLevel,
} from "./agent-vessel.js";
import { readSayAttachments } from "./say-attachments.js";
import type { ChannelAttachment } from "./channel-client.js";
import {
  DEFAULT_APPROVAL_LEVEL,
  DEFAULT_MODEL,
  DEFAULT_RESPOND_POLICY,
  DEFAULT_THINKING_LEVEL,
  OPENAI_CODEX_ACCOUNT_CLAIM,
  PROVIDER_CREDENTIAL_SETUPS,
} from "./agent-config.js";
import type { RespondPolicy } from "@workspace/agentic-protocol";

type StandardAgentMethodName =
  | "pause"
  | "resume"
  | "scheduleResumeAtReset"
  | "connectModelCredential"
  | "setModel"
  | "setThinkingLevel"
  | "setFastMode"
  | "setApprovalLevel"
  | "setRespondPolicy"
  | "refreshPromptArtifacts"
  | "getAgentSettings"
  | "getModelExecutionEvidence"
  | "getDebugState"
  | "inspectMethodSuspensions";

type StandardAgentMethodOptions = {
  include?: readonly StandardAgentMethodName[];
  exclude?: readonly StandardAgentMethodName[];
};

export function hasAskableUser(
  roster: readonly { ref: { kind: string } }[],
): boolean {
  return roster.some((participant) => participant.ref.kind === "user");
}

/** A headline for escalated surfaces when the sender did not give one. */
function firstLine(content: string): string {
  const line = content.trim().split("\n")[0] ?? "";
  return line.length > 120 ? `${line.slice(0, 117)}…` : line || "New message";
}

/** `to` accepts one ref or a list; an omitted `to` means the whole channel. */
function normalizeAddresseeRefs(value: unknown): string[] {
  if (value == null) return [];
  const list = Array.isArray(value) ? value : [value];
  return list.filter(
    (ref): ref is string => typeof ref === "string" && ref.trim().length > 0,
  );
}

/** Group foreign addressees by target channel: one envelope per channel. */
function groupByChannel(
  addressees: readonly ResolvedAddressee[],
): Array<{ channelId: string; addressees: ResolvedAddressee[] }> {
  const byChannel = new Map<string, ResolvedAddressee[]>();
  for (const entry of addressees) {
    const list = byChannel.get(entry.channelId);
    if (list) list.push(entry);
    else byChannel.set(entry.channelId, [entry]);
  }
  return [...byChannel].map(([channelId, list]) => ({
    channelId,
    addressees: list,
  }));
}

/** A resolution failure reaches the model verbatim, suggestions and all: the
 *  point of failing closed is that the agent can retry with the right name. */
function addresseeToolError(ref: string, error: AddresseeError): Error {
  const instruction =
    error.suggestions.length > 0
      ? `Correct \`to\`: did you mean ${error.suggestions.join(", ")}? Use list_addressees or discover_agents to see exact refs.`
      : "Correct `to`: use list_addressees (this conversation) or discover_agents (other conversations) to find an exact ref. Nothing was sent.";
  return Object.assign(new Error(error.message), {
    code: error.code,
    errorData: {
      code: error.code,
      addressee: ref,
      suggestions: error.suggestions,
      recovery: { action: "correct-request", instruction },
    },
  });
}

function addresseeLabel(resolved: ResolvedAddressee): string {
  switch (resolved.kind) {
    case "user":
      return `user:${resolved.userId}`;
    case "agent":
      return `agent:${resolved.instanceId}`;
    case "run":
      return `run:${resolved.runRef}`;
    case "participant":
    case "parent":
      return `participant:${resolved.participantId}`;
    default:
      return `channel:${resolved.channelId}`;
  }
}

/** An explicit `channel:` addressee means everyone here. */
function broadcastsToChannel(resolved: ResolvedAddressee): boolean {
  return resolved.kind === "channel";
}

/** The channel audience for the addressees that live on this channel. */
function audienceSelectors(
  resolved: readonly ResolvedAddressee[],
): Array<{ kind: "participant"; participantId: string }> {
  const seen = new Set<string>();
  const selectors: Array<{ kind: "participant"; participantId: string }> = [];
  for (const entry of resolved) {
    // A foreign addressee is reached by a guest envelope in ITS channel, not by
    // an audience selector here — this channel's roster has never heard of it.
    if (entry.kind === "run" || entry.foreign) continue;
    const participantId =
      entry.kind === "participant" ||
      entry.kind === "parent" ||
      entry.kind === "agent"
        ? entry.participantId
        : entry.kind === "user"
          ? (entry.participantId ?? `user:${entry.userId}`)
          : undefined;
    if (!participantId || seen.has(participantId)) continue;
    seen.add(participantId);
    selectors.push({ kind: "participant", participantId });
  }
  return selectors;
}

function requireBoundMutationInvocation(): never {
  throw new Error(
    "A semantic mutation cannot execute without a bound trajectory invocation",
  );
}

export abstract class AgentWorkerBase extends AgentVesselBase {
  private promptResourceCache: AgentPromptResources | null = null;
  private promptResourceLoad: Promise<AgentPromptResources> | null = null;

  constructor(ctx: DurableObjectContext, env: unknown) {
    super(ctx, env);
  }

  protected override getDefaultModel(): string {
    return DEFAULT_MODEL;
  }

  protected override getDefaultThinkingLevel(): ThinkingLevel {
    return DEFAULT_THINKING_LEVEL as ThinkingLevel;
  }

  protected override getDefaultApprovalLevel(): ApprovalLevel {
    return DEFAULT_APPROVAL_LEVEL as ApprovalLevel;
  }

  protected override getDefaultRespondPolicy(): RespondPolicy {
    return DEFAULT_RESPOND_POLICY as RespondPolicy;
  }

  protected override getModelCredentialSetupProps(
    providerId: string,
  ): Record<string, unknown> | null {
    return (
      (PROVIDER_CREDENTIAL_SETUPS as Record<string, Record<string, unknown>>)[
        providerId
      ] ?? null
    );
  }

  protected override async loadPromptResources(
    _channelId: string,
  ): Promise<AgentPromptResources> {
    if (this.promptResourceCache) return this.promptResourceCache;
    if (this.promptResourceLoad) return this.promptResourceLoad;

    const load = import("@workspace/harness/resource-loader")
      .then(({ loadVibestudioResources }) =>
        loadVibestudioResources({ rpc: this.rpc }),
      )
      .then(
        (resources): AgentPromptResources => ({
          workspacePrompt: resources.systemPrompt,
          skillIndex: resources.skillIndex,
        }),
      )
      .then((value) => {
        this.promptResourceCache = value;
        return value;
      })
      .finally(() => {
        if (this.promptResourceLoad === load) this.promptResourceLoad = null;
      });
    this.promptResourceLoad = load;
    return load;
  }

  protected override invalidatePromptResources(_channelId?: string): void {
    this.promptResourceCache = null;
    this.promptResourceLoad = null;
  }

  /** Workerd-clean authoring, discovery, and verification tools over the
   *  agent's exact semantic context. */
  protected override async getTools(
    channelId: string,
  ): Promise<ToolRegistration[]> {
    // The complete authoring toolset carries parsers, runtime catalogs, schema
    // conversion, and provider adapters. A DO can service lifecycle and
    // inspection calls without any of those features, so load the factories
    // only when a turn first asks for its model-facing registry.
    const {
      createApplyPatchTool,
      createFindTool,
      createGrepTool,
      createLsTool,
      createReadTool,
      createReadBinaryTool,
      createProvenanceTool,
      createWriteTool,
      createEditTool,
      createMoveFileTool,
      createCopyFileTool,
      createWorkspaceVcsTool,
      createSuspendTurnTool,
      createEvalTool,
      createDocsSearchTool,
      createDocsOpenTool,
      createWorkspaceServiceTool,
      createVerifyTool,
      createWebTools,
      createImagegenTool,
      authorNativeTool,
      createToolVcs,
      createAgentFileVisibility,
      createWorkspaceFileObservationStore,
    } = await import("@workspace/harness/standard-tools");
    const { createOutsideContentReset } =
      await import("./outside-content-reset.js");
    const cwd = "/";
    const session = channelTrajectoryFor(channelId);
    const exactContextId = this.subscriptions.getContextId(channelId);
    const contextId = () => exactContextId;
    const agentReferences = createAgentReferenceStore({
      get: (key) => this.getStateValue(`agent:refs:${channelId}:${key}`),
      set: (key, value) =>
        this.setStateValue(`agent:refs:${channelId}:${key}`, value),
      delete: (key) => this.deleteStateValue(`agent:refs:${channelId}:${key}`),
    });
    const fileObservations = createWorkspaceFileObservationStore({
      get: (path) =>
        this.getStateValue(`agent:file-observation:${channelId}:${path}`),
      set: (path, contentHash) =>
        this.setStateValue(
          `agent:file-observation:${channelId}:${path}`,
          contentHash,
        ),
      delete: (path) =>
        this.deleteStateValue(`agent:file-observation:${channelId}:${path}`),
    });
    const configuredModelRef = this.getAgentSettings().model;
    const configuredModelSeparator = configuredModelRef.indexOf(":");
    const configuredProviderId =
      configuredModelSeparator === -1
        ? "anthropic"
        : configuredModelRef.slice(0, configuredModelSeparator);
    const configuredProviderModel =
      configuredModelSeparator === -1
        ? configuredModelRef
        : configuredModelRef.slice(configuredModelSeparator + 1);
    const capturedRoster = copyJson(this.rosterSnapshot(channelId), {
      omitUndefinedProperties: true,
    }) as unknown as ReturnType<AgentWorkerBase["rosterSnapshot"]>;
    const askableUser = hasAskableUser(capturedRoster);
    const dependencies = (execution?: AgentToolExecutionContext) => {
      const toolRpc = execution?.rpc ?? this.rpc;
      const fs = createRpcFs(toolRpc as never);
      const visibility = createAgentFileVisibility(cwd, fs);
      const outsideContentReset = createOutsideContentReset({
        resetTaskAuthority: () =>
          this.resetTaskAuthorityForOutsideContent(channelId),
        onError: (error, source) => {
          console.warn(
            "[agent] could not drop task authority for outside content",
            {
              source,
              error: error instanceof Error ? error.message : String(error),
            },
          );
        },
      });
      const vcs = createToolVcs(<T>(method: string, methodArgs: unknown[]) =>
        toolRpc.call<T>("main", method, methodArgs),
      );
      const mutationContext = {
        contextId,
        commandId: execution?.commandId ?? requireBoundMutationInvocation,
        integrationSourceResolver: (sourceEventId: string) => {
          const run = this.subagentRuns.getBySourceEvent(sourceEventId);
          return run ? { runId: run.runId } : null;
        },
        onIntegrationSourcesCommitted: (result: VcsCommitResult) => {
          if (result.event.kind !== "event") return;
          for (const sourceEventId of result.integrationSourceEventIds) {
            for (const run of this.subagentRuns.listBySourceEvent(
              sourceEventId,
            )) {
              this.subagentRuns.setSemanticIntegrationSnapshot(run.runId, {
                state: "complete",
                sourceEventId,
                committedEventId: result.event.eventId,
                stale: false,
              });
            }
          }
        },
      };
      const resolveCodexSession = async (
        signal?: AbortSignal,
        model = configuredProviderModel,
      ) => {
        const credential = await toolRpc.call<StoredCredentialSummary | null>(
          "main",
          "credentials.resolveCredential",
          [{ url: "https://chatgpt.com/backend-api" }],
          { signal },
        );
        if (!credential) {
          throw new Error(
            "OpenAI Codex subscription is not configured. Connect the openai-codex model provider first.",
          );
        }
        const accountId =
          credential.accountIdentity?.providerUserId ??
          credential.metadata?.["accountId"];
        if (!accountId) {
          throw new Error(
            "OpenAI Codex account id is missing from the connected credential. Reconnect the openai-codex model provider.",
          );
        }
        const credentialClient = createCredentialClient(toolRpc);
        return {
          model,
          accountId,
          sessionId: channelId,
          fetcher: (url: string, init?: RequestInit) =>
            credentialClient.fetch(url, init, {
              credentialId: credential.id,
            }),
        };
      };
      return {
        execution,
        toolRpc,
        fs,
        visibility,
        vcs,
        mutationContext,
        outsideContentReset,
        resolveCodexSession,
      };
    };
    const author = <TParameters extends TSchema, TDetails extends JsonValue>(
      make: (
        deps: ReturnType<typeof dependencies>,
      ) => ToolRegistration<TParameters, TDetails>,
    ): ToolRegistration<TParameters, TDetails> =>
      authorNativeTool(
        (execution: AgentToolExecutionContext | undefined) =>
          make(dependencies(execution)),
        (api, context) => this.bindNativeToolExecution(api, context),
      );
    const authorGroup = (
      make: (deps: ReturnType<typeof dependencies>) => ToolRegistration[],
    ): ToolRegistration[] => {
      const offered = make(dependencies());
      return offered.map((_tool, index) =>
        author((deps) => make(deps)[index]!),
      );
    };
    const base = [
      author(({ fs, toolRpc, vcs, mutationContext, visibility }) =>
        createImagegenTool({
          cwd,
          fs,
          rpc: toolRpc,
          vcs,
          context: mutationContext,
          visibility,
          observations: fileObservations,
        }),
      ),
      author(({ fs, toolRpc, vcs, visibility }) =>
        createReadTool(cwd, fs, {
          rpc: toolRpc,
          provenance: { vcs, context: { contextId } },
          agentReferences,
          visibility,
          observations: fileObservations,
        }),
      ),
      author(({ fs, toolRpc, visibility }) =>
        createReadBinaryTool(cwd, fs, {
          rpc: toolRpc,
          visibility,
          observations: fileObservations,
        }),
      ),
      author(({ vcs }) =>
        createProvenanceTool(
          cwd,
          {
            vcs,
            contextId,
            session: { logId: session.logId, head: session.head },
          },
          agentReferences,
        ),
      ),
      author(({ vcs, mutationContext, fs }) =>
        createWriteTool(cwd, vcs, mutationContext, fs, fileObservations),
      ),
      author(({ vcs, mutationContext, fs }) =>
        createEditTool(cwd, vcs, mutationContext, fs, fileObservations),
      ),
      author(({ fs, visibility }) => createLsTool(cwd, fs, visibility)),
      author(({ fs, toolRpc, visibility }) =>
        createGrepTool(cwd, fs, { rpc: toolRpc, visibility }),
      ),
      author(({ fs, toolRpc, visibility }) =>
        createFindTool(cwd, fs, { rpc: toolRpc, visibility }),
      ),
      author(({ vcs, mutationContext }) =>
        createApplyPatchTool(cwd, vcs, mutationContext, fileObservations),
      ),
      author(({ vcs, mutationContext, fs }) =>
        createMoveFileTool(cwd, vcs, mutationContext, fs),
      ),
      author(({ vcs, mutationContext, fs }) =>
        createCopyFileTool(cwd, vcs, mutationContext, fs),
      ),
      author(({ vcs, mutationContext }) =>
        createWorkspaceVcsTool(cwd, vcs, mutationContext, agentReferences),
      ),
      createEvalTool({
        execution: {
          execute: (args, api, context) =>
            this.executeNativeEval(args, api, context),
          cancel: (args, api, context) =>
            this.cancelNativeEval(args, api, context),
        },
      }),
      // Capability discovery: search/open the caller-aware catalog (services
      // and runtime APIs) with typed schemas + access rules.
      author(({ toolRpc }) =>
        createDocsSearchTool(
          <T>(method: string, methodArgs: unknown[], signal?: AbortSignal) =>
            toolRpc.call<T>("main", method, methodArgs, { signal }),
        ),
      ),
      author(({ toolRpc }) =>
        createDocsOpenTool(
          <T>(method: string, methodArgs: unknown[], signal?: AbortSignal) =>
            toolRpc.call<T>("main", method, methodArgs, { signal }),
        ),
      ),
      author(({ vcs, mutationContext, toolRpc }) =>
        createWorkspaceServiceTool(vcs, mutationContext, {
          validateConfig: (content) =>
            toolRpc
              .call("main", "workspace.validateConfig", [content])
              .then(() => undefined),
        }),
      ),
      author(({ toolRpc }) =>
        createVerifyTool(
          <T>(method: string, methodArgs: unknown[], signal?: AbortSignal) =>
            toolRpc.call<T>("main", method, methodArgs, { signal }),
          contextId,
          async (
            artifact: WorkspaceTestArtifactV1,
            testName: string | undefined,
            signal?: AbortSignal,
          ): Promise<TestExecutionResultV1> => {
            const testsPanel = await this.openPanel("about/testbench", {
              operationId: `verify-testbench:${channelId}:${crypto.randomUUID()}`,
              contextId: contextId(),
              ref: `ctx:${contextId()}`,
              signal,
            });
            const runInTestbench = async (): Promise<TestExecutionResultV1> => {
              const testbenchCall = testsPanel.call as Record<
                string,
                (request: unknown) => Promise<unknown>
              >;
              const request = {
                protocol: "workspace-test-execution-request.v1",
                artifactKey: artifact.artifactKey,
                executionDigest: artifact.execution.executionDigest,
                ...(testName ? { testName } : {}),
                limits: { timeoutMs: 10_000, memoryMb: 128 },
              };
              const identity = {
                target: artifact.target,
                suite: artifact.suite,
                artifactKey: artifact.artifactKey,
                runtime: artifact.runtime,
                selectedFiles: artifact.selectedFiles,
              };
              await testbenchCall["tests.record"]!({
                phase: "running",
                ...identity,
              });
              let runtimeEntityId: string | undefined;
              try {
                let raw: unknown;
                if (artifact.runtime === "browser") {
                  const targetPanel = await this.openPanel(artifact.target, {
                    parentId: testsPanel.id,
                    operationId: `verify-test:${channelId}:${crypto.randomUUID()}`,
                    contextId: contextId(),
                    artifact: {
                      buildKey: artifact.execution.buildKey,
                      executionDigest: artifact.execution.executionDigest,
                    },
                    signal,
                  });
                  runtimeEntityId =
                    (await targetPanel.observe()).runtimeEntityId ??
                    targetPanel.id;
                  const call = targetPanel.call as Record<
                    string,
                    (request: unknown) => Promise<unknown>
                  >;
                  raw = await call["tests.run"]!(request);
                } else {
                  const worker = await toolRpc.call<{ id: string }>(
                    "main",
                    "runtime.createEntity",
                    [
                      {
                        kind: "worker",
                        execution: {
                          surface: "code",
                          source: artifact.target,
                          artifact: {
                            buildKey: artifact.execution.buildKey,
                            executionDigest: artifact.execution.executionDigest,
                          },
                        },
                        key: `test-${crypto.randomUUID()}`,
                        contextId: contextId(),
                      },
                    ],
                    { signal },
                  );
                  runtimeEntityId = worker.id;
                  raw = await toolRpc.call(worker.id, "tests.run", [request], {
                    signal,
                  });
                }
                const result = testExecutionResultV1Schema.parse(raw);
                await testbenchCall["tests.record"]!({
                  phase: "done",
                  ...identity,
                  runtimeEntityId,
                  result,
                });
                return result;
              } catch (error) {
                await testbenchCall["tests.record"]!({
                  phase: "error",
                  ...identity,
                  ...(runtimeEntityId ? { runtimeEntityId } : {}),
                  error: error instanceof Error ? error.message : String(error),
                }).catch(() => undefined);
                throw error;
              } finally {
                if (artifact.runtime === "workerd" && runtimeEntityId) {
                  await toolRpc.call("main", "runtime.retireEntity", [
                    { id: runtimeEntityId },
                  ]);
                }
              }
            };
            try {
              return await runInTestbench();
            } finally {
              // Closing the coordinator recursively closes its per-run child
              // panel, including a child whose boot failed after slot commit.
              await testsPanel.archive();
            }
          },
        ),
      ),
      createSuspendTurnTool({
        execution: {
          execute: (args, api, context) =>
            this.executeNativeSuspend(args, api, context),
          cancel: (args, api, context) =>
            this.cancelNativeSuspend(args, api, context),
        },
      }),
      ...(askableUser
        ? [this.createAskUserTool(channelId, capturedRoster)]
        : []),
      ...authorGroup(({ toolRpc, outsideContentReset, resolveCodexSession }) =>
        createWebTools({
          rpc: {
            call: (target, method, args) => toolRpc.call(target, method, args),
          },
          // Outside content drops this task's standing authority, so the next
          // gated operation asks the person again. Self-denial, decided by code.
          recordIngestion: (entry) => outsideContentReset.observe(entry.key),
          hasCredentialForOrigin: async (origin) => {
            try {
              const credential = await toolRpc.call<unknown>(
                "main",
                "credentials.resolveCredential",
                [{ url: origin }],
              );
              return credential != null;
            } catch {
              return false;
            }
          },
          searchBackend:
            configuredProviderId === "openai-codex" ? "codex" : "standard",
          resolveCodexSearchSession: resolveCodexSession,
        }),
      ),
    ] satisfies ToolRegistration[];
    // The generalized `notify` tool (carries saliency:"say"; the config-level
    // publishPolicy governs whether model narration also publishes) + the
    // subagent supervision surface.
    const localTools = [
      ...base,
      author(({ toolRpc }) => this.createSetTitleTool(channelId, toolRpc)),
      author(({ toolRpc }) =>
        this.createSetDescriptionTool(channelId, toolRpc),
      ),
      author(({ fs, execution }) =>
        this.createNotifyTool(channelId, fs, execution),
      ),
      ...authorGroup(({ toolRpc, execution }) =>
        this.createDiscoveryTools(channelId, toolRpc, execution),
      ),
      ...authorGroup(({ toolRpc }) =>
        this.createSubagentTools(channelId, toolRpc),
      ),
    ];
    return [
      ...localTools,
      ...this.createAdvertisedChannelTools(
        channelId,
        localTools,
        capturedRoster,
      ),
    ];
  }

  /**
   * Title the conversation itself, not whichever UI happens to be connected.
   * The channel config is durable and observable, so headless/task channels
   * and any later panel attachment see the same title.
   */
  protected createSetTitleTool(
    channelId: string,
    toolRpc: RpcClient = this.rpc,
  ): ToolRegistration {
    return {
      name: "set_title",

      description: `Set the conversation title. ${CONVERSATION_IDENTITY_GUIDANCE}`,
      parameters: Type.Unsafe<Record<string, JsonValue>>({
        type: "object",
        properties: {
          title: { type: "string", description: "The new title" },
        },
        required: ["title"],
      }),
      execute: async (params, _api, _executionContext) => {
        const title = (params as { title?: unknown }).title;
        if (typeof title !== "string" || title.trim().length === 0) {
          throw new Error("set_title requires a non-empty title");
        }
        const normalized = title.trim();
        await this.createChannelClient(channelId, toolRpc).updateConfig({
          title: normalized,
          titleExplicit: true,
        });
        return {
          content: [
            { type: "text", text: `set conversation title to ${normalized}` },
          ],
          details: copyJson(
            { title: normalized },
            { omitUndefinedProperties: true },
          ),
        };
      },
    };
  }

  /**
   * The agent's one-line self-description in the workspace directory
   * (messaging plan §4.4, D9). The directory's search text is this plus the
   * agent's latest deliberate message; keeping it current is what makes
   * `discover_agents` find the right instance by purpose.
   */
  protected createSetDescriptionTool(
    channelId: string,
    toolRpc: RpcClient = this.rpc,
  ): ToolRegistration {
    return {
      name: "set_description",

      description:
        "Set your one-line self-description in the workspace agent directory: what you are for and what you are currently doing in this conversation. Other agents find you by it (discover_agents). Update it when your role or focus changes materially; not every turn.",
      parameters: Type.Unsafe<Record<string, JsonValue>>({
        type: "object",
        properties: {
          description: {
            type: "string",
            description: "One line, ≤200 characters. Empty string clears it.",
          },
        },
        required: ["description"],
      }),
      execute: async (params, _api, _executionContext) => {
        const raw = (params as { description?: unknown }).description;
        if (typeof raw !== "string")
          throw new Error("set_description requires a description");
        const description = raw.trim().replace(/\s+/gu, " ").slice(0, 200);
        await this.setAgentDescription(channelId, description || null, toolRpc);
        return {
          content: [
            {
              type: "text",
              text: description
                ? `description set: ${description}`
                : "description cleared",
            },
          ],
          details: copyJson(
            { description: description || null },
            { omitUndefinedProperties: true },
          ),
        };
      },
    };
  }

  /**
   * Write one durable inbox entry for an addressed person (plan §4.5 step 3).
   *
   * The host stays content-blind: this writes to the workspace's own semantic
   * control plane, and the host only ever sees the opaque "inbox changed" ping
   * Gad raises. The channel envelope is the canonical conversational copy, but
   * an explicit inbox/interrupt rung is also part of the requested tool effect.
   * Do not convert a failed durable escalation into a successful notification:
   * the invocation journal must record the failure so an automation and its
   * inspector cannot silently claim delivery.
   */
  protected async escalateNotify(
    input: {
      userId: string;
      channelId: string;
      messageId: string;
      senderParticipantId: string;
      senderHandle?: string;
      rung: "inbox" | "interrupt";
      title: string;
      message: string;
    },
    toolRpc: RpcClient = this.rpc,
  ): Promise<string> {
    const id = agentMessageNotificationId(input.messageId, input.userId);
    const channelTargetId = await this.createChannelClient(
      input.channelId,
      toolRpc,
    ).resolveTarget();
    const data: AgentMessageNotificationData = {
      channelId: input.channelId,
      channelTargetId,
      messageId: input.messageId,
      senderParticipantId: input.senderParticipantId,
      ...(input.senderHandle ? { senderHandle: input.senderHandle } : {}),
      rung: input.rung,
    };
    await this.callGadWith(toolRpc, "putUserNotification", {
      id,
      userId: input.userId,
      kind: AGENT_MESSAGE_NOTIFICATION_KIND,
      title: input.title,
      message: input.message,
      data,
      createdAt: Date.now(),
      revision: 1,
    });
    // The push half (plan §4.5 step 5): the host owns device registrations, so
    // this is the one seam where the entry's headline crosses to it. Push fires
    // at `inbox` and above; `interrupt` only raises the priority flag. Best
    // effort — the durable entry is already the record.
    try {
      await this.pushUserInbox(
        input.userId,
        {
          notificationId: id,
          kind: AGENT_MESSAGE_NOTIFICATION_KIND,
          title: input.title,
          body: firstLine(input.message),
          priority: input.rung === "interrupt" ? "high" : "normal",
          channelId: input.channelId,
          channelTargetId,
          messageId: input.messageId,
          senderParticipantId: input.senderParticipantId,
          ...(input.senderHandle ? { senderHandle: input.senderHandle } : {}),
        },
        toolRpc,
      );
    } catch {
      /* no device reached; the inbox row and the in-app surfaces remain */
    }
    return id;
  }

  /** The host push seam (`notification.pushUserInbox`). Separate so tests can
   *  observe it; production goes straight to the host. */
  protected async pushUserInbox(
    userId: string,
    request: {
      notificationId: string;
      kind: string;
      title: string;
      body?: string;
      priority: "normal" | "high";
      channelId?: string;
      channelTargetId?: string;
      messageId?: string;
      senderParticipantId?: string;
      senderHandle?: string;
    },
    toolRpc: RpcClient = this.rpc,
  ): Promise<number> {
    return toolRpc.call<number>("main", "notification.pushUserInbox", [
      userId,
      request,
    ]);
  }

  /**
   * Publish one guest envelope into a channel this agent is not a member of,
   * and record the reference on its own channel (plan §4.6, §4.10.1).
   *
   * Three writes, one canonical copy (D15):
   *  - the target channel gets the utterance itself, addressed to the agents
   *    named, with `origin` on the sender metadata so the recipient can see who
   *    is talking and from where;
   *  - the target channel also gets `external.participant_observed` — the guest
   *    identity recorded without faking a join — and
   *    `external.envelope_observed`, the back-pointer to the authoring context;
   *  - the sender's channel gets `external.envelope_published`: a *reference*,
   *    not a relayed transcript. The full text is already durable here as the
   *    `notify` invocation's arguments.
   *
   * The hop count is stamped explicitly. Without it a guest envelope arriving
   * in a channel it never touched starts a fresh per-channel streak, and an
   * A↔B ping-pong gets twice the depth the cap intends (D13).
   */
  protected async sendGuestEnvelope(
    input: {
      toolCallId: string;
      fromChannelId: string;
      targetChannelId: string;
      participantId: string;
      content: string;
      addressees: ResolvedAddressee[];
      replyTo?: string;
      attachments?: ChannelAttachment[];
      imageAssetIds?: string[];
      /** The envelope on the sender's own channel that authored this, if one
       *  exists (the bound-channel copy of the same `notify`); it is what the
       *  recipient's "from #channel ▸" link focuses (§4.10.4). */
      sourceEnvelopeId?: string;
    },
    toolRpc: RpcClient = this.rpc,
  ): Promise<{ text: string; details: Record<string, unknown> }> {
    const descriptor = this.getEffectiveParticipantInfo(
      input.fromChannelId,
      this.subscriptions.getConfig(input.fromChannelId),
    );
    const senderMetadata: Record<string, unknown> = {
      ...descriptor.metadata,
      name: descriptor.name,
      type: descriptor.type,
      handle: descriptor.handle,
      origin: {
        channelId: input.fromChannelId,
        participantId: input.participantId,
        // The authoring context, so the recipient's "from #channel ▸" link can
        // land on it without a join against the observed back-pointer.
        envelopeId: input.sourceEnvelopeId ?? input.toolCallId,
      },
    };
    // Per-target dedup id: a redriven notify re-sends this same envelope rather
    // than a second fan-out (plan §4.3).
    const messageId = `say:${input.toolCallId}:${input.targetChannelId}`;
    const to = input.addressees
      .filter((entry) => entry.kind === "agent")
      .map((entry) => ({
        kind: "participant" as const,
        participantId: (entry as Extract<ResolvedAddressee, { kind: "agent" }>)
          .participantId,
      }));
    const agentHops = this.inboundAgentHops(input.fromChannelId) + 1;
    const guest: ParticipantRef = {
      kind: "agent",
      id: input.participantId,
      participantId: input.participantId,
      ...(descriptor.name ? { displayName: descriptor.name } : {}),
      metadata: senderMetadata,
    };
    const target = this.createChannelClient(input.targetChannelId, toolRpc);
    try {
      // The guest identity is recorded before the utterance, so a reader that
      // sees the message can always resolve who sent it.
      await target.publishAgenticEvent(
        input.participantId,
        {
          kind: "external.participant_observed",
          actor: {
            kind: "agent",
            id: input.participantId,
            metadata: senderMetadata,
          },
          payload: {
            protocol: AGENTIC_PROTOCOL_VERSION,
            participant: guest,
            action: "updated",
          },
          createdAt: new Date().toISOString(),
        } as never,
        { idempotencyKey: `${messageId}:participant`, senderMetadata },
      );
      await target.send(input.participantId, messageId, input.content, {
        saliency: "say",
        senderMetadata,
        ...(input.replyTo ? { replyTo: input.replyTo } : {}),
        ...(to.length > 0 ? { to } : {}),
        ...(input.attachments && input.attachments.length > 0
          ? { attachments: input.attachments }
          : {}),
        ...(input.imageAssetIds?.length
          ? { metadata: { imageAssetIds: input.imageAssetIds } }
          : {}),
        agentHops,
      });
      await target.publishAgenticEvent(
        input.participantId,
        {
          kind: "external.envelope_observed",
          actor: {
            kind: "agent",
            id: input.participantId,
            metadata: senderMetadata,
          },
          payload: {
            protocol: AGENTIC_PROTOCOL_VERSION,
            channelId: input.fromChannelId,
            // Back-pointer into the SENDER's log: the bound-channel copy of this
            // notify when there is one, else the tool call that authored it (the
            // invocation record is durable there under that id).
            envelopeId: input.sourceEnvelopeId ?? input.toolCallId,
            from: guest,
            payloadKind: "message.completed",
          },
          createdAt: new Date().toISOString(),
        } as never,
        { idempotencyKey: `${messageId}:observed`, senderMetadata },
      );
    } catch (error) {
      const code = (error as { code?: unknown }).code;
      if (code === "ClosedChannel") {
        // Named as a CLOSED CHANNEL, not an unknown addressee (D14): an agent
        // that cannot tell those apart retries forever.
        throw Object.assign(error as Error, {
          errorData: {
            code: "ClosedChannel",
            channelId: input.targetChannelId,
            recovery: {
              action: "stop",
              instruction: `${input.targetChannelId} has locked membership and admits no guests. Do not retry; tell the person who asked, or reach its members another way.`,
            },
          },
        });
      }
      throw Object.assign(
        new Error(
          `notify could not reach ${input.targetChannelId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        ),
        {
          code: "CrossChannelDeliveryFailed",
          errorData: {
            code: "CrossChannelDeliveryFailed",
            channelId: input.targetChannelId,
            recovery: {
              action: "reobserve",
              instruction:
                "The target conversation did not accept the message. Check it still exists with discover_agents({ includeTerminal: true }) before sending again.",
            },
          },
        },
      );
    }

    // The reference on the sender's own channel. A failure here loses the local
    // marginalia, never the message — which already landed.
    try {
      await this.createChannelClient(
        input.fromChannelId,
        toolRpc,
      ).publishAgenticEvent(
        input.participantId,
        {
          kind: "external.envelope_published",
          actor: {
            kind: "agent",
            id: input.participantId,
            metadata: senderMetadata,
          },
          payload: {
            protocol: AGENTIC_PROTOCOL_VERSION,
            publications: [
              {
                channelId: input.targetChannelId,
                envelopeId: messageId,
                payloadKind: "message.completed",
                summary: firstLine(input.content),
              },
            ],
          },
          createdAt: new Date().toISOString(),
        } as never,
        { idempotencyKey: `${messageId}:published`, senderMetadata },
      );
    } catch {
      /* the utterance is already durable in the target channel */
    }

    const labels = input.addressees.map(addresseeLabel).join(", ");
    return {
      text: `sent ${messageId} to ${labels || input.targetChannelId}`,
      details: {
        messageId,
        channelId: input.targetChannelId,
        guest: true,
        agentHops,
        addressees: input.addressees.map(addresseeLabel),
      },
    };
  }

  /** The two discovery tools (plan §4.7). They are the READ side of
   *  `resolveAddressee`: every row prints the exact ref `notify` accepts, so
   *  "who can I message" and "how do I message them" are one answer, not two
   *  vocabularies the agent has to translate between. */
  protected createDiscoveryTools(
    channelId: string,
    toolRpc: RpcClient = this.rpc,
    execution?: AgentToolExecutionContext,
  ): ToolRegistration[] {
    return [
      {
        name: "list_addressees",

        description:
          "List available message recipients in this conversation, your supervisor, and your child runs. Each row prints an exact `to` value for notify. This recipient list omits you; an external recipient is a client connection and does not identify the person or agent behind it. Use the canonical channel roster inspector in the gad-context skill for complete membership and recorded participant identity. Use discover_agents to find an agent in another conversation.",
        parameters: Type.Unsafe<Record<string, JsonValue>>({
          type: "object",
          properties: {},
          additionalProperties: false,
        }),
        execute: async () => {
          const context = this.conversationAddresseeContext(
            channelId,
            execution?.metadata,
          );
          const lines: string[] = [];
          const rows: Record<string, unknown>[] = [];
          const push = (ref: string, kind: string, note: string) => {
            lines.push(`${ref}  — ${kind}${note ? `: ${note}` : ""}`);
            rows.push({ ref, kind, note });
          };
          push("(omit `to`)", "channel", "everyone in this conversation");
          for (const participant of context.roster) {
            const handle = participant.metadata?.["handle"];
            const id = participant.participantId ?? participant.id;
            push(
              typeof handle === "string" && handle
                ? `@${handle}`
                : `participant:${id}`,
              participant.kind,
              participant.displayName ?? "",
            );
          }
          if (context.parent) {
            push("parent", "supervisor", "the agent that spawned you");
          }
          for (const run of context.runs ?? []) {
            push(
              `run:${run.runRef}`,
              "subagent run",
              [run.status, run.taskChannelId].filter(Boolean).join(" · "),
            );
          }
          return {
            content: [{ type: "text", text: lines.join("\n") }],
            details: copyJson(
              { addressees: rows },
              { omitUndefinedProperties: true },
            ),
          };
        },
      },
      {
        name: "discover_agents",

        description:
          "Find agents by what they do (e.g. 'gmail triage', 'nightly builds'). Searches handles, names, descriptions, and each instance's latest deliberate message. Returns refs ready to paste into notify. Terminal instances stay findable — their channels are durable, so messaging one wakes it.",
        parameters: Type.Unsafe<Record<string, JsonValue>>({
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "What the agent you are looking for does.",
            },
            includeTerminal: {
              type: "boolean",
              description:
                "Include instances that have left their channel (default false).",
            },
            limit: { type: "integer", minimum: 1, maximum: 50 },
          },
          required: ["query"],
        }),
        execute: async (params, _api, _executionContext) => {
          const input = params as {
            query?: unknown;
            includeTerminal?: unknown;
            limit?: unknown;
          };
          if (typeof input.query !== "string" || !input.query.trim()) {
            throw new Error("discover_agents requires a non-empty query");
          }
          const listing = await this.callGadWith<{
            summary: { rows: number };
            entries: Array<Record<string, unknown>>;
          }>(toolRpc, "searchAgentDirectory", {
            query: input.query.trim(),
            ...(input.includeTerminal === true
              ? { includeTerminal: true }
              : {}),
            ...(typeof input.limit === "number" ? { limit: input.limit } : {}),
          });
          if (listing.entries.length === 0) {
            return {
              content: [
                {
                  type: "text",
                  text: `No agent matched "${input.query}". Use list_addressees to see who is already here.`,
                },
              ],
              details: copyJson(
                { entries: [] },
                { omitUndefinedProperties: true },
              ),
            };
          }
          const text = listing.entries
            .map((entry) => {
              // The overview is the instance's own latest utterance, not a
              // transcript dump (plan §4.7).
              const overview = entry["summary"] ?? entry["description"] ?? "";
              return `${entry["ref"]}  [${entry["status"]}] ${entry["displayName"] ?? entry["handle"] ?? ""}${
                overview
                  ? `\n    ${String(overview).replace(/\s+/gu, " ").slice(0, 200)}`
                  : ""
              }`;
            })
            .join("\n");
          return {
            content: [{ type: "text", text }],
            details: copyJson(
              { entries: listing.entries },
              { omitUndefinedProperties: true },
            ),
          };
        },
      },
    ];
  }

  /** The one messaging primitive (plan §4.1): an explicit, deliberate
   *  utterance aimed at whoever `to` names — the channel, a participant, a
   *  supervisor, a child run — with an escalation rung saying what the
   *  recipient should experience.
   *
   *  Its messageId is derived from the tool-call id *per target*, so a redriven
   *  invocation re-sends the SAME set of messages (dedup), never a second
   *  fan-out. `attachments` names image files in the agent's working tree (the
   *  same fs the read/write tools use), so a captured screenshot reaches the
   *  user by path — the bytes never travel through the model.
   *
   *  The wire `saliency` stays `"say"` (D3, revised): the tool renamed, the
   *  envelope field did not, because every reader types it as a literal inside
   *  a strict schema and a rename buys nothing but a release-skew matrix. */
  protected createNotifyTool(
    channelId: string,
    fs: ReturnType<typeof createRpcFs>,
    execution?: AgentToolExecutionContext,
  ): ToolRegistration {
    const toolRpc = execution?.rpc ?? this.rpc;
    return {
      name: "notify",

      description:
        "Send a concise, deliberate message. This is the one way to surface text to anyone: the channel by default, or exactly whom `to` names. " +
        "Addressing someone does not compel a reply; it makes one possible. " +
        "To share generated images, supply images: [{assetId, alt, caption?}]; conversation history retains the original. " +
        `To show an image (e.g. a screenshot you captured), save it as a file and list its path in attachments; supported types: ${SUPPORTED_IMAGE_TYPES.join(", ")}.`,
      parameters: Type.Unsafe<Record<string, JsonValue>>({
        type: "object",
        properties: {
          content: {
            type: "string",
            description: "Message text (markdown) to send.",
          },
          to: {
            type: "array",
            items: { type: "string" },
            description:
              "Optional addressees. Omit to address the whole channel. Each entry is one of: " +
              "@handle (a participant here, or a workspace member by handle), participant:<id>, " +
              "user:<id>, owner (this conversation's person), parent (your supervisor), " +
              "run:<id> (a subagent you spawned), agent:<handle>@<channelId> (an agent " +
              "instance elsewhere — the exact ref discover_agents prints; a " +
              "idle or finished one wakes), channel:<id> (everyone in another conversation). An " +
              "unrecognized addressee fails the call with suggestions; nothing is ever " +
              "broadcast as a guess. Guest messages to other channels are not editable.",
          },
          alert: {
            type: "string",
            enum: [...ALERT_RUNGS],
            description:
              "What the recipient should experience. 'none' = the message just lands in the " +
              "channel. 'inbox' = also a durable notification entry and a phone push; the " +
              "default whenever you address a person. 'interrupt' = also seizes their screen; " +
              "choose it only when waiting would cost them something real. A rung above 'none' " +
              "reaches the people you addressed, or — with no person in `to` — the people in " +
              "this conversation.",
          },
          title: {
            type: "string",
            description:
              "Optional short headline for escalated surfaces. Defaults to the first line of content.",
          },
          replyTo: {
            type: "string",
            description: "Optional message id this is replying to.",
          },
          mentions: {
            type: "array",
            items: { type: "string" },
            description: "Optional participant IDs to mention.",
          },
          images: {
            type: "array",
            items: {
              type: "object",
              properties: {
                assetId: { type: "string" },
                alt: { type: "string" },
                caption: { type: "string" },
              },
              required: ["assetId", "alt"],
              additionalProperties: false,
            },
            description:
              "Durable image assets to display and retain in conversation history; use IDs returned by imagegen. No workspace file is required.",
          },
          attachments: {
            type: "array",
            items: { type: "string" },
            description:
              "Optional image file paths (in your working tree) to attach, e.g. screenshots. Rendered inline in the chat.",
          },
        },
        required: ["content"],
      }),
      execute: async (params, _api, _executionContext) => {
        const toolCallId = execution?.invocationId;
        if (!toolCallId)
          throw new Error("Native tool requires its attributed invocation");
        const input = params as {
          content?: unknown;
          to?: unknown;
          alert?: unknown;
          title?: unknown;
          replyTo?: unknown;
          mentions?: unknown;
          attachments?: unknown;
          images?: Array<{ assetId: string; alt: string; caption?: string }>;
        };
        let content = input.content;
        if (typeof content !== "string" || content.trim().length === 0) {
          throw new Error("notify requires non-empty content");
        }
        if (input.alert !== undefined && !isAlertRung(input.alert)) {
          throw new Error(
            `notify alert must be one of ${ALERT_RUNGS.join(", ")}`,
          );
        }
        const imageAssetIds: string[] = [];
        if (input.images !== undefined) {
          if (
            !Array.isArray(input.images) ||
            input.images.some(
              (image) =>
                !image ||
                typeof image.assetId !== "string" ||
                !image.assetId ||
                typeof image.alt !== "string" ||
                (image.caption !== undefined &&
                  typeof image.caption !== "string"),
            )
          )
            throw new Error("notify images require assetId and alt strings");
          imageAssetIds.push(
            ...new Set(input.images.map((image) => image.assetId)),
          );
          content +=
            "\n\n" +
            input.images
              .map(
                (image) =>
                  `<Image assetId={${JSON.stringify(image.assetId)}} alt={${JSON.stringify(image.alt)}}${image.caption === undefined ? "" : ` caption={${JSON.stringify(image.caption)}}`} />`,
              )
              .join("\n\n");
        }
        const participantId = this.subscriptions.getParticipantId(channelId);
        if (!participantId)
          throw new Error("agent is not subscribed to the channel");

        const refs = normalizeAddresseeRefs(input.to);
        const context = await this.addresseeContext(
          channelId,
          execution?.metadata,
        );
        const resolved = refs.map((ref) => {
          const outcome = resolveAddressee(ref, context);
          if (isAddresseeError(outcome)) throw addresseeToolError(ref, outcome);
          return outcome;
        });
        const requestedAlert = isAlertRung(input.alert)
          ? input.alert
          : defaultAlertRung(resolved);
        // Addressing a person is itself an attention request. `none` means a
        // channel-only utterance, so accepting it for an explicit person would
        // silently discard the durable notification the addressee contract
        // promises. A caller that wants a quiet channel message can address
        // the channel (and optionally mention someone); human addressees have
        // an inbox floor and `interrupt` remains explicit.
        const alert =
          requestedAlert === "none" &&
          resolved.some((entry) => entry.kind === "user")
            ? "inbox"
            : requestedAlert;

        // Runs are addressed through the supervision path, not the channel
        // audience: the child lives in its own task channel, and that path
        // already refuses a terminal run with the operations that remain open.
        const runs = resolved.filter(
          (entry): entry is Extract<ResolvedAddressee, { kind: "run" }> =>
            entry.kind === "run",
        );
        // A person who is not on this channel yet (plan §4.6): membership is
        // added first, so the escalated entry can open the conversation, and
        // the envelope is addressed to their `user:` participant id — the same
        // id the read receipt and the inbox entry key on.
        const offChannel = resolved.filter(
          (entry): entry is Extract<ResolvedAddressee, { kind: "user" }> =>
            entry.kind === "user" && !entry.inRoster,
        );
        for (const person of offChannel) {
          try {
            await this.createChannelClient(channelId, toolRpc).addMember(
              person.userId,
            );
          } catch (error) {
            throw Object.assign(
              new Error(
                `user:${person.userId} is not on this channel and could not be added: ${
                  error instanceof Error ? error.message : String(error)
                }`,
              ),
              {
                code: "AddresseeUnreachable",
                errorData: {
                  code: "AddresseeUnreachable",
                  addressee: `user:${person.userId}`,
                  recovery: {
                    action: "stop",
                    instruction:
                      "This person cannot be added to the conversation (not a workspace member, or membership is locked). Nothing was sent; do not retry with the same addressee.",
                  },
                },
              },
            );
          }
        }
        // Foreign addressees get a guest envelope in THEIR channel (plan §4.6):
        // an envelope belongs to exactly one log, so a `to` list spanning
        // channels produces one envelope per target channel, never a broadcast.
        const foreign = resolved.filter(
          (entry): entry is Extract<ResolvedAddressee, { foreign: true }> =>
            entry.kind !== "run" && entry.foreign,
        );

        const results: string[] = [];
        const sent: Record<string, unknown>[] = [];
        let channelMessageId: string | null = null;

        // A subagent's deliberate notify is, absent an explicit audience, an
        // utterance intended for its supervisor. The supervisor observes the
        // task channel with delivery interest "addressed", so carry the parent
        // in the audience explicitly — otherwise it stays in the task log
        // without ever creating supervisor work.
        const parentParticipantId =
          this.subagentIdentity()?.parentParticipantId;
        const selectors =
          refs.length === 0
            ? parentParticipantId
              ? [
                  {
                    kind: "participant" as const,
                    participantId: parentParticipantId,
                  },
                ]
              : []
            : audienceSelectors(resolved);
        const addressesChannel =
          refs.length > 0 && resolved.some(broadcastsToChannel);
        const wantsChannelEnvelope =
          refs.length === 0 || addressesChannel || selectors.length > 0;

        const attachmentPaths = Array.isArray(input.attachments)
          ? input.attachments.filter(
              (path): path is string => typeof path === "string",
            )
          : [];
        const attachments =
          attachmentPaths.length > 0
            ? await readSayAttachments(fs, attachmentPaths)
            : [];

        if (wantsChannelEnvelope) {
          const descriptor = this.getEffectiveParticipantInfo(
            channelId,
            this.subscriptions.getConfig(channelId),
          );
          const messageId = `say:${toolCallId}`;
          await this.createChannelClient(channelId, toolRpc).send(
            participantId,
            messageId,
            content,
            {
              saliency: "say",
              senderMetadata: {
                ...descriptor.metadata,
                name: descriptor.name,
                type: descriptor.type,
                handle: descriptor.handle,
              },
              replyTo:
                typeof input.replyTo === "string" ? input.replyTo : undefined,
              mentions: Array.isArray(input.mentions)
                ? input.mentions.filter(
                    (mention): mention is string => typeof mention === "string",
                  )
                : undefined,
              // An explicit `channel:` addressee means everyone, so it erases the
              // narrower selectors rather than being unioned with them.
              ...(addressesChannel || selectors.length === 0
                ? {}
                : { to: selectors }),
              attachments: attachments.length > 0 ? attachments : undefined,
              metadata: {
                ...(imageAssetIds.length ? { imageAssetIds } : {}),
                notify: {
                  alert,
                  ...(typeof input.title === "string" && input.title.trim()
                    ? { title: input.title.trim() }
                    : {}),
                },
              },
            },
          );
          const attachmentNote =
            attachments.length > 0
              ? ` with ${attachments.length} attachment${attachments.length === 1 ? "" : "s"} (${attachments.map((attachment) => attachment.name).join(", ")})`
              : "";
          channelMessageId = messageId;
          results.push(`sent message ${messageId}${attachmentNote}`);
          sent.push({
            messageId,
            channelId,
            alert,
            attachments: attachments.map((attachment) => attachment.name),
          });
        }

        for (const run of runs) {
          // Per-target dedup id: two runs addressed by one call must not
          // collide on `subagent-msg:<toolCallId>`.
          const result = await this.sendToSubagent(
            runs.length > 1 ? `${toolCallId}:${run.runId}` : toolCallId,
            run.runId,
            content,
            channelId,
            toolRpc,
          );
          const text = result.content
            ?.map((block) => (block.type === "text" ? block.text : ""))
            .join("")
            .trim();
          results.push(text || `sent to subagent ${run.runRef}`);
          sent.push({
            runId: run.runId,
            runRef: run.runRef,
            channelId: run.channelId,
            alert: "none",
          });
        }

        // Escalation (plan §4.5): the envelope above is always the canonical
        // copy; the inbox entry is the durable half that reaches a person who
        // is not looking. There is no presence check: only an explicit inbox
        // action retires the entry. Rendering a mounted panel proves nothing
        // about the person's attention.
        if (alert !== "none" && channelMessageId) {
          const descriptor = this.getEffectiveParticipantInfo(
            channelId,
            this.subscriptions.getConfig(channelId),
          );
          // Whom the rung reaches: the people addressed — or, when the agent
          // raised the rung explicitly without naming anyone, the people on
          // this channel (D8: escalation is explicit; a rung set on purpose is
          // exactly that). Nobody outside the conversation is ever guessed.
          const addressedUsers = resolved.filter(
            (entry): entry is Extract<ResolvedAddressee, { kind: "user" }> =>
              entry.kind === "user",
          );
          const escalationUsers: Array<{ userId: string }> =
            addressedUsers.length > 0
              ? addressedUsers
              : context.roster
                  .filter((entry) => entry.kind === "user")
                  .map((entry) =>
                    (entry.participantId ?? entry.id).replace(/^user:/u, ""),
                  )
                  .filter(
                    (userId, index, all) =>
                      userId && all.indexOf(userId) === index,
                  )
                  .map((userId) => ({ userId }));
          for (const addressee of escalationUsers) {
            const notification = await this.escalateNotify(
              {
                userId: addressee.userId,
                channelId,
                messageId: channelMessageId,
                senderParticipantId: participantId,
                senderHandle: descriptor.handle,
                rung: alert,
                title:
                  typeof input.title === "string" && input.title.trim()
                    ? input.title.trim()
                    : firstLine(content),
                message: content,
              },
              toolRpc,
            );
            sent.push({
              notificationId: notification,
              userId: addressee.userId,
            });
          }
        }

        for (const target of groupByChannel(foreign)) {
          const outcome = await this.sendGuestEnvelope(
            {
              toolCallId,
              fromChannelId: channelId,
              targetChannelId: target.channelId,
              participantId,
              content,
              addressees: target.addressees,
              replyTo:
                typeof input.replyTo === "string" ? input.replyTo : undefined,
              ...(attachments.length > 0 ? { attachments } : {}),
              imageAssetIds,
              ...(channelMessageId
                ? { sourceEnvelopeId: channelMessageId }
                : {}),
            },
            toolRpc,
          );
          results.push(outcome.text);
          sent.push(outcome.details);
        }

        return {
          content: [{ type: "text", text: results.join("; ") }],
          details: copyJson({ alert, sent }, { omitUndefinedProperties: true }),
        };
      },
    };
  }

  /** Native child launch waits are owned by the vessel; inspection and messaging
   * retain the exact parent invocation caller. */
  private createSubagentTools(
    channelId: string,
    toolRpc: RpcClient,
  ): ToolRegistration[] {
    const tools: ToolRegistration[] = [
      {
        name: "spawn_subagent",
        executionMode: "sequential",
        executionData: this.nativeChildLaunchOffer(channelId),

        description:
          "Delegate separable work to a child agent in its own durable task channel and retained child context. Returns a runId once launch succeeds; the spawn invocation does not stay open for the child's lifetime. Use for independent investigation, parallel work, or isolated edits; do small linear work yourself. mode:'fresh' seeds a child from task; mode:'fork' starts from your current trajectory and can share context-window cache. Track the runId exactly, continue useful foreground work, and steer only with new instructions via notify({ to: 'run:<runId>' }). Read progress with inspect_subagent/read_subagent instead of messaging the child to ask how it is going. A normal child reply is a retained report; when its turn closes the collaborator becomes idle and stops consuming execution capacity. Later notify continues the same retained collaborator and context. Review the report and decide from the user's goal whether to integrate its VCS work; inspection-only and comparison tasks may deliberately leave it unintegrated. Use cancel_subagent only to stop active work.",
        parameters: Type.Unsafe<Record<string, JsonValue>>({
          type: "object",
          properties: {
            mode: {
              type: "string",
              enum: ["fresh", "fork"],
              description:
                "'fresh' = new agent seeded via the task; 'fork' = branch from your trajectory, useful when the child needs your current context and can benefit from the shared context window cache.",
            },
            task: {
              type: "string",
              description:
                "The child's durable authoritative assignment, recorded in its stable runtime contract. Include goal, relevant files/docs/skills, constraints, expected output, progress expectations, done criteria, and what to do if blocked.",
            },
            config: {
              type: "object",
              description:
                "Optional overrides for an intentionally different child runtime. Omit `config` " +
                "for ordinary delegation: a 'pi' child automatically inherits the parent's exact " +
                "effective model, reasoning level, fallback, approval behavior, and prompt settings. " +
                "Do not restate or guess the parent's model. Set `model` only when the user explicitly " +
                "requests a different model and you have an exact currently available catalog ref; " +
                "mentioning a model inside `task` does not configure the child. For intentional 'pi' " +
                "overrides use model and thinkingLevel " +
                "('minimal'|'low'|'medium'|'high'|'xhigh'|'max'), plus optional approvalLevel, " +
                "respondPolicy, handle, and system-prompt settings. Do not use effort for Pi. " +
                "All subagents run through the shared model-provider harness.",
              properties: {
                model: {
                  type: "string",
                  description:
                    "Intentional Pi child model override. Normally omit this (and `config`) to inherit the parent's effective model. Never guess a ref; use only an exact currently available catalog ref when a different model was explicitly requested.",
                },
                thinkingLevel: {
                  type: "string",
                  enum: ["minimal", "low", "medium", "high", "xhigh", "max"],
                  description: "Child reasoning level.",
                },
                approvalLevel: { type: "integer", minimum: 0, maximum: 3 },
                respondPolicy: { type: "string" },
                handle: { type: "string" },
                fallbackModel: { type: "string" },
              },
              additionalProperties: true,
            },
            label: {
              type: "string",
              description: "Optional short label for the run.",
            },
          },
          required: ["mode", "task"],
        }),
        execute: (args, api, context) =>
          this.executeNativeSpawn(args, api, context),
        cancel: (args, api, context) =>
          this.cancelNativeSpawn(args, api, context),
      },
      {
        // `send_to_subagent` is gone: steering a child is a message like any
        // other, so it is `notify({ to: "run:<id>", ... })`. Its guidance —
        // steer with new instructions, never poll for progress — moved to the
        // spawn description above and the subagent prompt.
        name: "inspect_subagent",

        description:
          "Inspects a supervised child's semantic workspace state; it never exposes the model's private context window. Use the bounded parent-relative 'diff' when the user's goal is to inspect, review, or compare child work without integrating it. No inspection preflight is required before merge_subagent when the goal instead calls for integration. Use 'status', 'diff'/'log', or an exact repo-prefixed file path. read_subagent returns what the child said. Do not poll a live child with this tool; suspend_turn wakes when the child reports.",
        parameters: Type.Unsafe<Record<string, JsonValue>>({
          type: "object",
          properties: {
            runId: {
              type: "string",
              description:
                "The exact short runRef issued by spawn_subagent (for example @s1); copy it verbatim. Native runId is also accepted exactly.",
            },
            query: {
              type: "string",
              description:
                "'status' | 'diff' | 'log' | an exact repo-prefixed file path (default 'status').",
            },
            limit: {
              type: "integer",
              minimum: 1,
              maximum: 100,
              description: "Maximum diff/log records to return (default 20).",
            },
            cursor: {
              type: "string",
              description: "Opaque nextCursor from an earlier diff/log page.",
            },
          },
          required: ["runId"],
        }),
        execute: async (params, _api, _executionContext) => {
          const p = params as {
            runId?: unknown;
            query?: unknown;
            limit?: unknown;
            cursor?: unknown;
          };
          return this.inspectSubagent(
            String(p.runId ?? ""),
            String(p.query ?? "status"),
            channelId,
            {
              limit:
                typeof p.limit === "number" && Number.isInteger(p.limit)
                  ? Math.max(1, Math.min(100, p.limit))
                  : 20,
              cursor:
                typeof p.cursor === "string" && p.cursor ? p.cursor : undefined,
            },
          );
        },
      },
      {
        name: "merge_subagent",

        description:
          "Merge a subagent's committed net effect into your local working state when the user's goal calls for incorporating that child work. It derives exact child/parent status and comparison without an inspect preflight. Do not call it for inspection-only, comparison, or deliberately unintegrated tasks. Returns model-visible resolution, intents, a composed-review checklist, and coordinate conflicts. Pass resolutions after editing a truthful combined result or choosing ours/theirs. This does not commit or publish your work.",
        parameters: Type.Unsafe<Record<string, JsonValue>>({
          type: "object",
          properties: {
            runId: {
              type: "string",
              description:
                "The exact short runRef issued by spawn_subagent (for example @s1); copy it verbatim. Native runId is also accepted exactly.",
            },
            resolutions: {
              oneOf: [
                {
                  type: "array",
                  maxItems: 500,
                  items: {
                    type: "object",
                    properties: {
                      coordinate: {
                        type: "object",
                        properties: {
                          kind: { enum: ["file", "repository"] },
                          id: { type: "string", minLength: 1 },
                        },
                        required: ["kind", "id"],
                        additionalProperties: false,
                      },
                      resolution: {
                        enum: ["composed", "theirs", "ours", "current"],
                      },
                      rationale: {
                        type: "string",
                        minLength: 1,
                        maxLength: 2000,
                      },
                    },
                    required: ["coordinate", "resolution"],
                    additionalProperties: false,
                  },
                },
                {
                  type: "object",
                  properties: {
                    allRemaining: {
                      type: "object",
                      properties: {
                        resolution: { enum: ["ours", "current"] },
                        rationale: {
                          type: "string",
                          minLength: 1,
                          maxLength: 2000,
                        },
                      },
                      required: ["resolution"],
                      additionalProperties: false,
                    },
                  },
                  required: ["allRemaining"],
                  additionalProperties: false,
                },
              ],
            },
            intent: {
              type: "string",
              minLength: 1,
              maxLength: 2000,
              description:
                "Why this integration is being performed, when that purpose adds information beyond the child request.",
            },
          },
          required: ["runId"],
        }),
        execute: async (params, _api, _executionContext) => {
          const p = params as {
            runId?: unknown;
            resolutions?: unknown;
            intent?: unknown;
          };
          return this.mergeSubagent(
            String(p.runId ?? ""),
            channelId,
            p.resolutions && typeof p.resolutions === "object"
              ? (p.resolutions as never)
              : [],
            typeof p.intent === "string" ? p.intent : undefined,
            toolRpc,
          );
        },
      },
      {
        name: "read_subagent",

        description:
          "Read the canonical subagent task transcript after a cursor. Returns messages plus nextSeq. Use it for deliberate catch-up or debugging; suspend_turn({ reason:'waiting_for_background' }) parks the parent when only live background execution remains. Use inspect_subagent for child files, semantic clean/dirty status, and semantic diff.",
        parameters: Type.Unsafe<Record<string, JsonValue>>({
          type: "object",
          properties: {
            runId: {
              type: "string",
              description:
                "The exact short runRef issued by spawn_subagent (for example @s1); copy it verbatim. Native runId is also accepted exactly.",
            },
            afterSeq: {
              type: "number",
              description:
                "Return messages after this channel seq (default 0).",
            },
          },
          required: ["runId"],
        }),
        execute: async (params, _api, _executionContext) => {
          const p = params as { runId?: unknown; afterSeq?: unknown };
          return this.readSubagent(
            String(p.runId ?? ""),
            typeof p.afterSeq === "number" ? p.afterSeq : 0,
            channelId,
            toolRpc,
          );
        },
      },
      {
        name: "cancel_subagent",

        description:
          "Cancel a subagent that is still starting or running. Cancellation stops the current assignment while retaining the collaborator, context, transcript, and workspace for later follow-up.",
        parameters: Type.Unsafe<Record<string, JsonValue>>({
          type: "object",
          properties: {
            runId: {
              type: "string",
              description:
                "The exact short runRef issued by spawn_subagent (for example @s1); copy it verbatim. Native runId is also accepted exactly.",
            },
            reason: {
              type: "string",
              description: "Why execution is being cancelled.",
            },
          },
          required: ["runId"],
        }),
        execute: async (params, api, context) => {
          const p = params as { runId?: unknown; reason?: unknown };
          return this.cancelSubagent(
            String(p.runId ?? ""),
            typeof p.reason === "string" ? p.reason : "cancelled by supervisor",
            api,
            context,
            channelId,
            toolRpc,
          );
        },
        cancel: async (params, api, context) => {
          const p = params as { runId?: unknown; reason?: unknown };
          return this.cancelSubagent(
            String(p.runId ?? ""),
            typeof p.reason === "string" ? p.reason : "cancelled by supervisor",
            api,
            context,
            channelId,
            toolRpc,
            false,
          );
        },
      },
    ];
    return tools;
  }

  private createAskUserTool(
    channelId: string,
    capturedRoster: ReturnType<AgentWorkerBase["rosterSnapshot"]>,
  ): ToolRegistration {
    return {
      name: "ask_user",
      replay: "safe",
      executionData: copyJson(
        { channelId, roster: capturedRoster },
        { omitUndefinedProperties: true },
      ),

      description:
        "Ask the user a concise question and wait for their response. Use this only when the answer is needed to continue.",
      parameters: Type.Unsafe<Record<string, JsonValue>>({
        type: "object",
        properties: {
          question: {
            type: "string",
            description: "Question to show the user.",
          },
          options: {
            type: "array",
            items: { type: "string" },
            description:
              "Optional short options; mutually exclusive unless multiSelect is true.",
          },
          allowFreeform: {
            type: "boolean",
            description:
              "Whether the user may type a custom answer. Defaults to true for option prompts; set false to require one of the options.",
          },
          multiSelect: {
            type: "boolean",
            description:
              "Whether multiple options may be selected. When true, the prompt shows checkboxes and an explicit submit button.",
          },
          to: {
            type: "string",
            description:
              "Optional exact channel human target: a user:<id> participant id or @handle from the roster. Omit to ask every human; an unknown target fails closed and is never broadcast.",
          },
        },
        required: ["question"],
      }),
      execute: (args, api, context) => {
        const binding = api.executionData;
        if (
          !binding ||
          typeof binding !== "object" ||
          Array.isArray(binding) ||
          typeof binding["channelId"] !== "string" ||
          !Array.isArray(binding["roster"])
        )
          throw new Error("ask_user lost its original offered recipients");
        return this.executeNativeAskUser(
          args as Record<string, JsonValue>,
          api,
          context,
          binding["channelId"],
          binding["roster"] as unknown as ReturnType<
            AgentWorkerBase["rosterSnapshot"]
          >,
        );
      },
      cancel: (args, api, context) =>
        this.cancelNativeAskUser(
          args as Record<string, JsonValue>,
          api,
          context,
        ),
    };
  }

  protected override getModelCredentialTokenClaims(
    providerId: string,
    credential: StoredCredentialSummary,
  ): Record<string, unknown> {
    if (providerId !== "openai-codex") return {};
    const accountId =
      credential.accountIdentity?.providerUserId ??
      credential.metadata?.["accountId"];
    return accountId
      ? { [OPENAI_CODEX_ACCOUNT_CLAIM]: { chatgpt_account_id: accountId } }
      : {};
  }

  protected getStandardAgentMethods(
    opts?: StandardAgentMethodOptions,
  ): NonNullable<ParticipantDescriptor["methods"]> {
    const methods: NonNullable<ParticipantDescriptor["methods"]> = [
      { name: "pause", description: "Pause the current AI turn" },
      { name: "resume", description: "Resume after pause" },
      {
        name: "scheduleResumeAtReset",
        description:
          "Schedule a paused model turn to resume when its usage limit resets",
      },
      {
        name: "connectModelCredential",
        description: "Connect a model credential for the current provider",
      },
      {
        name: "setModel",
        description: "Set the live model in provider:model format",
      },
      {
        name: "setThinkingLevel",
        description:
          "Set live effort level: minimal, low, medium, high, xhigh, or max",
      },
      {
        name: "setFastMode",
        description: "Enable or disable the accelerated Codex service tier",
      },
      {
        name: "setApprovalLevel",
        description:
          "Set live approval level: 0=manual, 1=auto-safe, 2=full-auto",
      },
      {
        name: "setRespondPolicy",
        description:
          "Set live chattiness policy and optional participant allow-list",
      },
      {
        name: "refreshPromptArtifacts",
        description:
          "Reload workspace prompt resources and refresh model prompt/tool artifacts",
      },
      {
        name: "getAgentSettings",
        description:
          "Read effective primary/fallback model routing, effort, approval, and chattiness settings",
      },
      {
        name: "getModelExecutionEvidence",
        description:
          "Read durable provider/model routing and aggregate usage evidence for this channel",
      },
      {
        name: "getDebugState",
        description: "Read agent DO persisted and in-memory debug state",
      },
      {
        name: "inspectMethodSuspensions",
        description:
          "Inspect the pending effect outbox (dispatch cache over the log)",
      },
    ];
    const include = opts?.include ? new Set<string>(opts.include) : null;
    const exclude = opts?.exclude ? new Set<string>(opts.exclude) : null;
    return methods.filter(
      (method) =>
        (!include || include.has(method.name)) && !exclude?.has(method.name),
    );
  }
}
