import {
  AGENTIC_EVENT_PAYLOAD_KIND,
  AGENTIC_PROTOCOL_VERSION,
} from "@workspace/agentic-protocol";
import { observeNativeModelStream } from "./native-model-stream.js";
import type { Api, Model, Models, Provider } from "@panticonic/pi-ai";
import type { Context } from "@panticonic/pi-chord";
import { BACKGROUND_CONTEXT } from "@panticonic/pi-chord/context";
import {
  createRegistry,
  configure,
  defineExtension,
  type AgentChange,
  type Conversation,
  type ConversationId,
  type Extension,
  type Harness,
  type ModelRequestApi,
  type ModelRequestTarget,
  type ModelRequestConnection,
  type HarnessCommit,
  type TaskId,
  type Tx,
  type ToolExecutionApi,
  type ToolRegistration,
} from "@panticonic/pi-durable";
import {
  NativeAgentOwner,
  type NativeAgentOptions,
} from "./native-agent-owner.js";
import { ChannelClient } from "./channel-client.js";
import {
  bindNativeModelInvocation,
  bindNativeToolInvocation,
  type NativeInvocationBoundary,
  type NativeInvocationExecution,
} from "./native-invocation-boundary.js";
import {
  createNativeChannelPublication,
  readNativeChannelProjection,
  type NativeChannelProjection,
} from "./native-channel-publication.js";
import {
  openNativeChannelConversation,
  lookupNativeChannelConversation,
  retainedNativeConversationChannel,
  submitNativeChannelDelivery,
  type NativeChannelDelivery,
  type NativeChannelIntake,
  type NativeChannelInputPrepare,
} from "./native-channel-session.js";
import {
  createProtectedModelProvider,
  createProtectedNativeModels,
  hostProtectedModelProvider,
} from "./native-model-provider.js";
import { retainedAgentExecutionOwner } from "./native-agent-session.js";

/** Product configuration captures prompt, tools and channel presentation together. */
export interface NativeChannelConfiguration {
  readonly agent: Omit<AgentChange, "extensions" | "tools"> & {
    readonly extensions?: readonly Extension[];
  };
  readonly tools: readonly ToolRegistration[];
  readonly projection: NativeChannelProjection;
}

/**
 * The channel-facing Pi composition. Product subclasses own response policy,
 * channel membership, cards and child/domain resources. All execution,
 * admission, waits, publication and provider calls use this single Harness.
 */
export abstract class NativeChannelOwner<
  Configuration extends NativeChannelConfiguration = NativeChannelConfiguration,
> extends NativeAgentOwner {
  private readonly nativeRegistry = createRegistry();
  private readonly nativeModelRegistry = createProtectedNativeModels();
  private readonly nativeDefinitions = new Map<string, Configuration>();
  private readonly nativeChannels = new Map<string, Promise<Conversation>>();
  private readonly nativeChannelClients = new Map<string, ChannelClient>();
  private readonly nativePublications = createNativeChannelPublication({
    onSuccessfulAnswer: (modelRef) =>
      this.runDetached(() => this.onNativeSuccessfulAnswer(modelRef)),
    publish: async (channelId, participantId, event, idempotencyKey) =>
      this.runDetached(() => {
        if (event.kind === "message.read") {
          const messageId = event.causality?.messageId;
          if (!messageId)
            throw new Error(
              "Native read acknowledgement has no canonical source message",
            );
          return this.nativeChannelClient(channelId).recordReadReceipt(
            participantId,
            messageId,
          );
        }
        return this.nativeChannelClient(channelId).publishAgenticEvent(
          participantId,
          event,
          { idempotencyKey },
        );
      }),
  });

  protected async onNativeSuccessfulAnswer(_modelRef: string): Promise<void> {}

  protected abstract getNativeChannelConfiguration(
    channelId: string,
  ): Promise<Configuration>;

  /** Membership is product truth; addressed supervision channels do not execute here. */
  protected abstract nativeReasoningChannelIds(): readonly string[];

  /** Product facts join Pi's original admission and settlement transaction. */
  protected async prepareNativeProductCommit(
    _tx: Tx,
    _staged: HarnessCommit,
    _context: Context,
  ): Promise<void> {}

  protected async nativeInvocationExecution(
    execution: NativeInvocationExecution,
    _taskId: TaskId,
    _context: Context,
  ): Promise<NativeInvocationExecution> {
    return execution;
  }

  protected abstract notifyNativeModelCredentialMissing(
    request: ModelRequestTarget,
    api: ModelRequestApi,
    context: Context,
  ): Promise<void>;

  protected async observeNativeModelConnection(
    _request: ModelRequestTarget,
    _api: ModelRequestApi,
    connection: ModelRequestConnection,
    _context: Context,
  ): Promise<ModelRequestConnection> {
    return connection;
  }

  protected async prepareNativeChannelInput(
    _tx: Tx,
    _input: Parameters<NativeChannelInputPrepare>[1],
  ): Promise<void> {}

  /** Restore executable definitions before Pi can resume any retained generation. */
  protected override async prepareAgentRegistry(): Promise<void> {
    for (const channelId of this.nativeReasoningChannelIds())
      await this.prepareNativeChannelDefinition(channelId);
  }

  /** All provider implementations belong to the installed native package. */
  protected nativeModels(): Models {
    return this.nativeModelRegistry;
  }

  protected selectedNativeModelDescriptor(
    provider: string,
    modelId: string,
  ): Model<Api> | undefined {
    return this.nativeModels().getModel(provider, modelId);
  }

  protected installNativeModelProvider(provider: Provider): void {
    this.nativeModelRegistry.setProvider(hostProtectedModelProvider(provider));
  }

  /** Read retained conversation state through the validated native owner. A fresh
   * activation opens its Session without admitting input or scheduling a turn;
   * settlement may continue using an existing Session after admission seals. */
  protected async admittedNativeChannelConversation(
    channelId: string,
  ): Promise<Conversation | null> {
    const harness = this.existingAgentSession() ?? (await this.restoreAgentSession());
    const owner = await retainedAgentExecutionOwner(
      harness,
      BACKGROUND_CONTEXT,
    );
    return lookupNativeChannelConversation(
      harness,
      { channelId, contextId: owner.contextId },
      BACKGROUND_CONTEXT,
    );
  }

  protected async prepareNativeChannelDefinition(
    channelId: string,
  ): Promise<Configuration> {
    const definition = await this.getNativeChannelConfiguration(channelId);
    if (
      definition.projection.channelId !== channelId ||
      definition.projection.participantId !== this.rpcSelfId
    )
      throw new Error("Native channel configuration changed its actual owner");
    this.nativeRegistry.install(
      defineExtension({
        name: `vibestudio.channel-tools:${channelId}`,
        tools: definition.tools.map((tool) => ({
          ...tool,
          execute: async (args, api, context) => {
            const result = await tool.execute(args, api, context);
            if (!("wait" in result))
              await this.finishAgentToolAuthority(api, context);
            return result;
          },
        })),
      }),
    );
    this.nativeDefinitions.set(channelId, definition);
    return definition;
  }

  /** Static product task definitions exist before the retained Session reopens. */
  protected nativeProductExtensions(): readonly Extension[] {
    return [];
  }

  protected async prepareNativeChannelConfiguration(
    _tx: Tx,
    _id: ConversationId,
    _configuration: Configuration,
  ): Promise<void> {}

  protected async awaitNativeChannelReadiness(
    _channelId: string,
    conversation: Conversation,
    _context: Context,
  ): Promise<Conversation> {
    return conversation;
  }

  /** Prepare executable choices outside Tx, then bind them with readiness/history. */
  protected async prepareNativeChannelInitialization(
    channelId: string,
  ): Promise<(tx: Tx, id: ConversationId) => Promise<void>> {
    const definition = await this.prepareNativeChannelDefinition(channelId);
    const extension = this.nativeRegistry
      .snapshot()
      .extension(`vibestudio.channel-tools:${channelId}`);
    if (!extension)
      throw new Error("Native channel lost its executable definition");
    return async (tx, id) => {
      await configure(tx, id, {
        ...definition.agent,
        extensions: [...(definition.agent.extensions ?? []), extension],
        tools: [...definition.tools],
      });
      await this.prepareNativeChannelConfiguration(tx, id, definition);
      await this.nativePublications.bind(tx, id, definition.projection);
    };
  }

  /** Knowledge import binds publication without creating another conversation. */
  protected async bindNativeChannelPublication(
    tx: Tx,
    id: ConversationId,
    projection: NativeChannelProjection,
  ): Promise<void> {
    if (projection.participantId !== this.rpcSelfId)
      throw new Error("Native publication changed its actual owner");
    await this.nativePublications.bind(tx, id, projection);
  }

  /** Apply current product choices to future native rounds; prepared rounds retain their binding. */
  protected async refreshNativeChannelConfiguration(
    channelId: string,
  ): Promise<void> {
    const conversation = await this.nativeChannelConversation(channelId);
    const definition = await this.prepareNativeChannelDefinition(channelId);
    const extension = this.nativeRegistry
      .snapshot()
      .extension(`vibestudio.channel-tools:${channelId}`);
    if (!extension)
      throw new Error("Native channel lost its executable definition");
    await conversation.commit(async (tx) => {
      await configure(tx, conversation.id, {
        ...definition.agent,
        extensions: [...(definition.agent.extensions ?? []), extension],
        tools: [...definition.tools],
      });
      await this.prepareNativeChannelConfiguration(
        tx,
        conversation.id,
        definition,
      );
    }, BACKGROUND_CONTEXT);
  }

  protected override agentOptions(): NativeAgentOptions {
    for (const extension of this.nativeProductExtensions())
      this.nativeRegistry.install(extension);
    this.nativeRegistry.install(
      defineExtension({
        name: "vibestudio.channel-publication",
        tasks: [this.nativePublications.task],
      }),
    );
    return {
      models: this.nativeModels(),
      settings: { followUpMode: "one-at-a-time" },
      registry: this.nativeRegistry,
      prepareCommit: async (tx, staged, context) => {
        await this.prepareNativeProductCommit(tx, staged, context);
        await this.nativePublications.prepareCommit(tx, staged);
      },
      modelRequests: async (request, api, context) => {
        const bound: { execution?: NativeInvocationExecution } = {};
        const connection = await createProtectedModelProvider({
          rpcForRequest: async (request, api, context) =>
            (bound.execution = await this.bindNativeModelExecution(
              request,
              api,
              context,
            )).rpc,
          egressFetch: fetch,
          waitForAuthority: (request, api, info, invocation, context) =>
            this.waitForAgentAuthority(request, api, info, invocation, context),
          notifyCredentialMissing: (request, api, context) =>
            this.notifyNativeModelCredentialMissing(request, api, context),
        })(request, api, context);
        if (connection.status !== "ready") return connection;
        let observed: ModelRequestConnection;
        try {
          observed = await this.observeNativeModelConnection(
            request,
            api,
            connection,
            context,
          );
        } catch (error) {
          try {
            await connection.close(BACKGROUND_CONTEXT);
          } catch (cleanup) {
            throw new AggregateError(
              [error, cleanup],
              "Native model observation and provider release failed",
              { cause: error },
            );
          }
          throw error;
        }
        if (request.purpose !== "generation" || request.operation !== "stream")
          return observed;
        try {
          if (!bound.execution) {
            throw new Error(
              "Ready native model has no original invocation binding",
            );
          }
          const { channelId } = await retainedNativeConversationChannel(
            this.admittedAgentSession(),
            request.conversationId,
            context,
          );
          const projection = await readNativeChannelProjection(
            this.admittedAgentSession(),
            request.conversationId,
            context,
          );
          if (
            !projection ||
            projection.channelId !== channelId ||
            projection.participantId !== this.rpcSelfId
          ) {
            throw new Error(
              "Ready native model has no original channel presentation",
            );
          }
          if (projection.policy === "notify-only") return observed;
          const invocationId = bound.execution.invocationId;
          return observeNativeModelStream(
            {
              harness: this.admittedAgentSession(),
              request,
              connection: observed,
              send: (data, ctx) =>
                this.runDetached(() =>
                  new ChannelClient(this.agentRpc, channelId, undefined, {
                    signal: ctx.abortSignal,
                  }).sendSignalEvent(
                    this.rpcSelfId,
                    AGENTIC_EVENT_PAYLOAD_KIND,
                    {
                      kind: "invocation.progress",
                      actor: projection.actor,
                      causality: { invocationId },
                      payload: { protocol: AGENTIC_PROTOCOL_VERSION, data },
                      createdAt: new Date().toISOString(),
                    },
                  ),
                ),
              report: (error) =>
                console.warn("Native model stream observation ended", error),
            },
            context,
          );
        } catch (error) {
          try {
            await observed.close(BACKGROUND_CONTEXT);
          } catch (cleanup) {
            throw new AggregateError(
              [error, cleanup],
              "Native stream binding and provider release failed",
              { cause: error },
            );
          }
          throw error;
        }
      },
    };
  }

  private nativeChannelClient(channelId: string): ChannelClient {
    let client = this.nativeChannelClients.get(channelId);
    if (!client) {
      client = new ChannelClient(this.agentRpc, channelId);
      this.nativeChannelClients.set(channelId, client);
    }
    return client;
  }

  private invocationBoundary(harness: Harness): NativeInvocationBoundary {
    return {
      harness,
      image: this.loadedImage(),
      callHost: this.callAgentHost,
      rpc: this.agentExecutionRpc,
      publishStart: async (channelId, event, idempotencyKey) =>
        this.runDetached(() =>
          this.nativeChannelClient(channelId).publishAgenticEvent(
            this.rpcSelfId,
            event,
            { idempotencyKey },
          ),
        ),
    };
  }

  /** Also available during owned cancellation after ordinary admission seals. */
  protected bindNativeToolExecution(
    api: ToolExecutionApi,
    context: Context,
  ): Promise<NativeInvocationExecution> {
    return this.runDetached(async () =>
      this.nativeInvocationExecution(
        await bindNativeToolInvocation(
          this.invocationBoundary(this.admittedAgentSession()),
          api,
          context,
        ),
        api.taskId,
        context,
      ),
    );
  }

  private async bindNativeModelExecution(
    request: ModelRequestTarget,
    api: ModelRequestApi,
    context: Context,
  ): Promise<NativeInvocationExecution> {
    return this.nativeInvocationExecution(
      await bindNativeModelInvocation(
        this.invocationBoundary(this.admittedAgentSession()),
        request,
        api,
        context,
      ),
      request.taskId,
      context,
    );
  }

  /** Concurrent arrivals share one real conversation and one captured tool offer. */
  protected nativeChannelConversation(
    channelId: string,
    context: Context = BACKGROUND_CONTEXT,
  ): Promise<Conversation> {
    let opening = this.nativeChannels.get(channelId);
    if (!opening) {
      opening = this.runDetached(async () => {
        const harness = await this.agentSession(context);
        const owner = await retainedAgentExecutionOwner(harness, context);
        const existing = await lookupNativeChannelConversation(
          harness,
          { channelId, contextId: owner.contextId },
          context,
        );
        if (existing)
          return this.awaitNativeChannelReadiness(channelId, existing, context);
        const definition =
          this.nativeDefinitions.get(channelId) ??
          (await this.prepareNativeChannelDefinition(channelId));
        if (
          definition.projection.channelId !== channelId ||
          definition.projection.participantId !== owner.runtimeId
        )
          throw new Error(
            "Native channel configuration changed its actual owner",
          );
        const extension = this.nativeRegistry
          .snapshot()
          .extension(`vibestudio.channel-tools:${channelId}`);
        if (!extension)
          throw new Error("Native channel lost its executable definition");
        const conversation = await openNativeChannelConversation(
          harness,
          { channelId, contextId: owner.contextId },
          {
            ...definition.agent,
            extensions: [...(definition.agent.extensions ?? []), extension],
            tools: [...definition.tools],
          },
          context,
          async (tx, conversationId) => {
            await this.prepareNativeChannelConfiguration(
              tx,
              conversationId,
              definition,
            );
            await this.nativePublications.bind(
              tx,
              conversationId,
              definition.projection,
            );
          },
        );
        return this.awaitNativeChannelReadiness(
          channelId,
          conversation,
          context,
        );
      });
      this.nativeChannels.set(channelId, opening);
      const flight = opening;
      void flight.catch(() => {
        if (this.nativeChannels.get(channelId) === flight)
          this.nativeChannels.delete(channelId);
      });
    }
    return opening;
  }

  /** Caller and product policy are checked by the domain receiver before this boundary. */
  protected async admitNativeChannelDelivery(
    delivery: NativeChannelDelivery,
    intake: NativeChannelIntake,
    context: Context = BACKGROUND_CONTEXT,
    targetChannelId: string = delivery.channelId,
  ) {
    await this.nativeChannelConversation(targetChannelId, context);
    const harness = await this.agentSession(context);
    const owner = await retainedAgentExecutionOwner(harness, context);
    return submitNativeChannelDelivery(
      harness,
      { channelId: targetChannelId, contextId: owner.contextId },
      delivery,
      intake,
      context,
      (tx, input) => this.prepareNativeChannelInput(tx, input),
    );
  }
}
