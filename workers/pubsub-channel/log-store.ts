import type { StoredChannelMessageTypeDefinition } from "@vibestudio/service-schemas/workspaceSource";
import { mainRpcMethods } from "@vibestudio/service-schemas/mainRpc";
/** Canonical channel-owner history; global graph observation is trailing debt. */

import type { ServerLogEvent as ChannelEvent } from "@workspace/pubsub";

import {
  collectChannelEnvelopePages,
  type ChannelEnvelopePage,
  type ChannelEnvelopePageInfo,
  type ChannelEnvelopeWindow,
} from "@vibestudio/shared/channelEnvelopePaging";
import { ChannelLedger } from "./channel-ledger.js";
import type { SqlStorage } from "@workspace/runtime/worker";
import {
  DEFAULT_CHANNEL_REPLAY_PAGE_LIMIT,
  MAX_CHANNEL_REPLAY_PAGE_LIMIT,
  type BootstrapSnapshot,
  type ChannelReplayAfterRequest,
  type ChannelReplayEnvelope,
  type ServerLogEvent,
  MessageTypeDefinitionSchema,
  type MessageTypeDefinition,
} from "@workspace/pubsub";
import {
  registryMutationFromLogEnvelope,
  encodeChannelPayloadStoredValues,
  prepareChannelLogEvent,
  isAgenticLogEventKind,
  agenticEventFromLogEnvelope,
  AGENTIC_EVENT_PAYLOAD_KIND,
  hydrateStoredValueRefs,
  participantRefFromMetadata,
  publicParticipantMetadata,
  type AppendIdempotency,
  type LogEnvelope,
  type LogAppendEventInput,
} from "@workspace/agentic-protocol";
import type { StoredAttachment } from "./types.js";
import { buildChannelEvent } from "./broadcast.js";

export const CHANNEL_LOG_HEAD = "main";

export interface ChannelAppendInput {
  appendedAt?: string;
  /** payloadKind: "agentic.trajectory.v1/event" | "presence" | "error" | ... */
  type: string;
  payload: unknown;
  senderId: string;
  senderMetadata?: Record<string, unknown>;
  /** Deterministic ids welcome: invocationId, `terminal:{id}`, `ik:{key}`. */
  messageId?: string;
  /** Append intent (see AppendIdempotency in agentic-protocol). Default
   *  "exact" — divergent duplicates are integrity errors. ONLY the client
   *  publish path passes "idempotent-by-id" (stable retry token, volatile
   *  payload fields → first write wins). */
  idempotency?: AppendIdempotency;
  /** Policy annotations (agentHops, ...). */
  annotations?: Record<string, unknown>;
  attachments?: StoredAttachment[];
  /** Derived only from the host-sealed caller attestation by PubSubChannel. */
  contentClass: "internal" | "external";
  externalKeys: string[];
}

export interface ChannelReplayContext {
  contextId?: string;
  channelConfig?: Record<string, unknown>;
  snapshots?: BootstrapSnapshot[];
}

interface RpcCallerLike {
  call: import("@vibestudio/rpc").RpcCaller["call"];
}

type OwnerReplayPage = ChannelEnvelopePage<OwnerChannelEnvelopeView>;
type ReplayWindowPageInfo = Pick<
  ChannelEnvelopePageInfo,
  | "totalCount"
  | "firstSeq"
  | "lastSeq"
  | "returnedFromSeq"
  | "returnedToSeq"
  | "snapshotLastSeq"
  | "hasMoreBefore"
  | "hasMoreAfter"
>;
interface OwnerReplayWindow {
  items: OwnerChannelEnvelopeView[];
  pageInfo: ReplayWindowPageInfo;
}

/** The public channel envelope view derived from canonical owner history. */
interface OwnerChannelEnvelopeView {
  envelopeId: string;
  channelId: string;
  seq: number;
  from: {
    id: string;
    participantId?: string;
    metadata?: Record<string, unknown>;
  };
  payload: unknown;
  payloadKind?: string;
  metadata?: Record<string, unknown>;
  attachments?: unknown[];
  contentClass: "internal" | "external";
  externalKeys: string[];
  publishedAt: string;
  annotations?: Record<string, unknown>;
}

/** annotations minus the metadata/attachments carriers. */
function policyAnnotations(
  annotations: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!annotations) return undefined;
  const {
    metadata: _metadata,
    attachments: _attachments,
    contentClass: _contentClass,
    externalKeys: _externalKeys,
    ...rest
  } = annotations;
  return Object.keys(rest).length > 0 ? rest : undefined;
}

function contentIntegrityFromAnnotations(
  annotations: Record<string, unknown>,
): {
  contentClass: "internal" | "external";
  externalKeys: string[];
} {
  const contentClass = annotations["contentClass"];
  const externalKeys = annotations["externalKeys"];
  if (
    (contentClass !== "internal" && contentClass !== "external") ||
    !Array.isArray(externalKeys) ||
    !externalKeys.every((key) => typeof key === "string") ||
    (contentClass === "internal" && externalKeys.length > 0)
  ) {
    throw new Error(
      "Durable channel envelope is missing valid content-integrity provenance",
    );
  }
  return { contentClass, externalKeys: [...externalKeys] };
}

export class ChannelLog {
  readonly ledger: ChannelLedger;
  private registryCache?: { head: number; types: Map<string, StoredChannelMessageTypeDefinition> };
  constructor(
    private readonly rpc: RpcCallerLike,
    private readonly channelId: string,
    sql: SqlStorage,
    transaction: <T>(operation: () => T) => T,
  ) {
    this.ledger = new ChannelLedger(sql, transaction, channelId);
  }

  async append(input: ChannelAppendInput): Promise<ChannelEvent> {
    const payload = await this.encodePayload(input.payload);
    const annotations: Record<string, unknown> = {
      ...(input.annotations ?? {}),
    };
    const publicMetadata = publicParticipantMetadata(input.senderMetadata);
    if (publicMetadata !== undefined) annotations["metadata"] = publicMetadata;
    if (input.attachments !== undefined)
      annotations["attachments"] = input.attachments;
    annotations["contentClass"] = input.contentClass;
    annotations["externalKeys"] = [...input.externalKeys];
    const previous = input.messageId ? this.ledger.envelope(input.messageId) : null;
    const prepared = prepareChannelLogEvent({
      envelopeId: input.messageId ?? crypto.randomUUID(),
      appendedAt: input.appendedAt ?? previous?.appendedAt ?? new Date().toISOString(),
      actor: participantRefFromMetadata(input.senderId, input.senderMetadata),
      payloadKind: input.type,
      payload,
      annotations,
    });
    const { publish: _publish, appendedAtExplicit: _explicit, ...semantic } = prepared;
    const envelope = this.ledger.append(semantic, input.idempotency ?? "exact");
    return this.eventFromLogEnvelope(await this.hydrate(envelope));
  }

  /** Admit an immutable workspace publication using its original actor and causality. */
  async appendPrepared(input: LogAppendEventInput): Promise<ChannelEvent> {
    if (typeof input.envelopeId !== "string" || !input.envelopeId || typeof input.appendedAt !== "string" || !input.appendedAt) throw new Error("Publication intent requires its immutable identity and timestamp");
    const prepared = prepareChannelLogEvent({ ...input, envelopeId: input.envelopeId, appendedAt: input.appendedAt });
    if (prepared.publish.length > 0) {
      throw new Error("Channel publication intent cannot publish to other channels");
    }
    const { publish: _publish, appendedAtExplicit: _explicit, ...semantic } = prepared;
    const envelope = this.ledger.append(semantic, "exact");
    return this.eventFromLogEnvelope(await this.hydrate(envelope));
  }

  async forkFrom(
    parentChannelId: string,
    throughSeq: number | null,
  ): Promise<void> {
    this.ledger.forkFrom(parentChannelId, throughSeq);
  }

  async headSeq(): Promise<number> {
    return this.ledger.headSequence();
  }

  private messageTypes(): Map<string, StoredChannelMessageTypeDefinition> {
    const head = this.ledger.registrySequence();
    if (this.registryCache?.head === head) return this.registryCache.types;
    const types = new Map<string, StoredChannelMessageTypeDefinition>();
    for (const envelope of this.ledger.registryEvents()) {
      const mutation = registryMutationFromLogEnvelope(envelope)!;
      if (mutation.kind === "clearMessageType") types.delete(mutation.typeId);
      else types.set(mutation.typeId, { ...mutation.row, typeId: mutation.typeId, updatedAtSeq: envelope.seq });
    }
    this.registryCache = { head, types };
    return types;
  }

  async listMessageTypes(): Promise<MessageTypeDefinition[]> {
    const rows = [...this.messageTypes().values()].sort((a, b) => a.typeId < b.typeId ? -1 : a.typeId > b.typeId ? 1 : 0);
    return Promise.all(rows.map(async (row) => MessageTypeDefinitionSchema.parse(await this.hydrate(structuredClone(row)))));
  }

  async getMessageType(typeId: string): Promise<MessageTypeDefinition | null> {
    const row = this.messageTypes().get(typeId);
    return row ? MessageTypeDefinitionSchema.parse(await this.hydrate(structuredClone(row))) : null;
  }

  async hasEnvelope(envelopeId: string): Promise<boolean> {
    return this.ledger.envelope(envelopeId) !== null;
  }

  async hasEnvelopes(envelopeIds: string[]): Promise<Set<string>> {
    return new Set(envelopeIds.filter((id) => this.ledger.envelope(id) !== null));
  }

  async getEventByEnvelopeId(envelopeId: string): Promise<ChannelEvent | null> {
    const envelope = this.ledger.envelope(envelopeId);
    return envelope ? this.eventFromLogEnvelope(await this.hydrate(envelope)) : null;
  }

  /** Lineage-aware ascending page over durable envelopes (policy folds,
   *  derivePendingCalls). Payloads are NOT hydrated (policies must not depend
   *  on blob-spilled fields). */
  async read(opts: {
    afterSeq?: number;
    beforeSeq?: number;
    limit?: number;
    payloadKind?: string;
  }): Promise<LogEnvelope[]> {
    return this.ledger.read(opts);
  }

  /** Hydrated ascending events for deterministic local projection folds. */
  async readEvents(opts: {
    afterSeq: number;
    limit?: number;
  }): Promise<ChannelEvent[]> {
    const rows = await this.read({
      afterSeq: opts.afterSeq,
      limit: opts.limit ?? 500,
    });
    return Promise.all(
      rows.map(async (row) =>
        this.eventFromLogEnvelope(await this.hydrate(row)),
      ),
    );
  }

  async replayAfter(
    request: ChannelReplayAfterRequest,
    context: ChannelReplayContext,
  ): Promise<ChannelReplayEnvelope> {
    const after = request.after;
    const limit = request.limit ?? DEFAULT_CHANNEL_REPLAY_PAGE_LIMIT;
    if (!Number.isInteger(after) || after < 0) {
      throw new RangeError(
        "channel replay after must be a non-negative integer",
      );
    }
    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > MAX_CHANNEL_REPLAY_PAGE_LIMIT
    ) {
      throw new RangeError(
        `channel replay limit must be an integer between 1 and ${MAX_CHANNEL_REPLAY_PAGE_LIMIT}`,
      );
    }
    if (
      request.throughSeq !== undefined &&
      (!Number.isInteger(request.throughSeq) || request.throughSeq < after)
    ) {
      throw new RangeError(
        "channel replay throughSeq must be an integer not less than after",
      );
    }
    const window = await this.readReplayWindow(
      {
        kind: "after",
        seq: after,
        ...(request.throughSeq !== undefined
          ? { throughSeq: request.throughSeq }
          : {}),
      },
      limit,
      true,
    );
    return this.replayFromWindow("after", window, context);
  }

  async replayBefore(
    beforeSeq: number,
    limit: number,
    context: ChannelReplayContext,
  ): Promise<ChannelReplayEnvelope> {
    this.assertReplayLimit(limit);
    const window = await this.readReplayWindow(
      { kind: "before", seq: beforeSeq },
      limit,
      true,
    );
    return this.replayFromWindow("before", window, context);
  }

  async replayInitial(
    limit: number,
    context: ChannelReplayContext,
  ): Promise<ChannelReplayEnvelope> {
    this.assertReplayLimit(limit, true);
    const window = await this.readReplayWindow({ kind: "tail" }, limit, true);
    return this.replayFromWindow("initial", window, context);
  }

  private assertReplayLimit(limit: number, allowZero = false): void {
    const minimum = allowZero ? 0 : 1;
    if (
      !Number.isInteger(limit) ||
      limit < minimum ||
      limit > MAX_CHANNEL_REPLAY_PAGE_LIMIT
    ) {
      throw new RangeError(
        `channel replay limit must be an integer between ${minimum} and ${MAX_CHANNEL_REPLAY_PAGE_LIMIT}`,
      );
    }
  }

  async inspectRows(opts: {
    afterId?: number;
    beforeId?: number;
    limit?: number;
  }): Promise<Record<string, unknown>[]> {
    const window = await this.readReplayWindow(
      opts.beforeId != null
        ? { kind: "before", seq: opts.beforeId }
        : opts.afterId != null
          ? { kind: "after", seq: opts.afterId }
          : { kind: "tail" },
      opts.limit ?? 50,
      false,
    );
    return window.items.map((envelope) => this.inspectionRow(envelope));
  }

  async inspectEnvelope(
    envelopeId: string,
  ): Promise<Record<string, unknown>[]> {
    const envelope = this.ledger.envelope(envelopeId);
    if (!envelope) return [];
    const contentIntegrity = contentIntegrityFromAnnotations(
      envelope.annotations ?? {},
    );
    return [
      this.inspectionRow({
        envelopeId: String(envelope.envelopeId),
        channelId: this.channelId,
        seq: envelope.seq,
        from: envelope.actor as OwnerChannelEnvelopeView["from"],
        payload: isAgenticLogEventKind(envelope.payloadKind)
          ? agenticEventFromLogEnvelope(envelope)
          : envelope.payload,
        payloadKind: isAgenticLogEventKind(envelope.payloadKind)
          ? AGENTIC_EVENT_PAYLOAD_KIND
          : envelope.payloadKind,
        metadata: envelope.annotations?.["metadata"] as
          | Record<string, unknown>
          | undefined,
        attachments: envelope.annotations?.["attachments"] as
          | unknown[]
          | undefined,
        ...contentIntegrity,
        publishedAt: envelope.appendedAt,
      }),
    ];
  }

  private channelView(envelope: LogEnvelope): OwnerChannelEnvelopeView {
    return {
      envelopeId: String(envelope.envelopeId), channelId: this.channelId,
      seq: envelope.seq, from: envelope.actor,
      payload: isAgenticLogEventKind(envelope.payloadKind) ? agenticEventFromLogEnvelope(envelope) : envelope.payload,
      payloadKind: isAgenticLogEventKind(envelope.payloadKind) ? AGENTIC_EVENT_PAYLOAD_KIND : envelope.payloadKind,
      metadata: envelope.annotations?.["metadata"] as Record<string, unknown> | undefined,
      attachments: envelope.annotations?.["attachments"] as unknown[] | undefined,
      ...contentIntegrityFromAnnotations(envelope.annotations ?? {}),
      publishedAt: envelope.appendedAt,
      annotations: envelope.annotations,
    };
  }

  private inspectionRow(
    envelope: OwnerChannelEnvelopeView,
  ): Record<string, unknown> {
    return {
      seq: envelope.seq,
      envelope_id: envelope.envelopeId,
      payload_kind: envelope.payloadKind,
      payload: JSON.stringify(envelope.payload),
      from_id: envelope.from.participantId ?? envelope.from.id,
      from_json: JSON.stringify(
        envelope.metadata ?? envelope.from.metadata ?? {},
      ),
      attachments: envelope.attachments
        ? JSON.stringify(envelope.attachments)
        : null,
      published_at: Date.parse(envelope.publishedAt),
    };
  }

  private replayFromWindow(
    mode: ChannelReplayEnvelope["mode"],
    window: OwnerReplayWindow,
    context: ChannelReplayContext,
  ): ChannelReplayEnvelope {
    return {
      mode,
      logEvents: window.items.map(
        (envelope): ServerLogEvent => this.eventFromChannelView(envelope),
      ),
      snapshots: context.snapshots ?? [],
      ready: {
        contextId: context.contextId,
        channelConfig: context.channelConfig,
        totalCount: window.pageInfo.totalCount,
        envelopeCount: window.pageInfo.totalCount,
        firstEnvelopeSeq: window.pageInfo.firstSeq,
        replayFromId: window.pageInfo.returnedFromSeq,
        replayToId: window.pageInfo.returnedToSeq,
        snapshotLastSeq: window.pageInfo.snapshotLastSeq,
        hasMoreBefore: window.pageInfo.hasMoreBefore,
        hasMoreAfter: window.pageInfo.hasMoreAfter,
      },
    };
  }

  private eventFromChannelView(envelope: OwnerChannelEnvelopeView): ChannelEvent {
    return buildChannelEvent(
      envelope.seq,
      envelope.envelopeId,
      envelope.payloadKind ?? "message",
      JSON.stringify(envelope.payload),
      envelope.from.participantId ?? envelope.from.id,
      envelope.metadata ?? envelope.from.metadata,
      Date.parse(envelope.publishedAt),
      envelope.attachments as StoredAttachment[] | undefined,
      policyAnnotations(
        (envelope as { annotations?: Record<string, unknown> }).annotations,
      ),
      {
        contentClass: envelope.contentClass,
        externalKeys: envelope.externalKeys,
      },
    );
  }

  eventFromLogEnvelope(envelope: LogEnvelope): ChannelEvent {
    const annotations = envelope.annotations ?? {};
    return buildChannelEvent(
      envelope.seq,
      String(envelope.envelopeId),
      isAgenticLogEventKind(envelope.payloadKind)
        ? AGENTIC_EVENT_PAYLOAD_KIND
        : envelope.payloadKind,
      JSON.stringify(
        isAgenticLogEventKind(envelope.payloadKind)
          ? agenticEventFromLogEnvelope(envelope)
          : envelope.payload,
      ),
      (envelope.actor as { participantId?: string }).participantId ??
        envelope.actor.id,
      (annotations["metadata"] as Record<string, unknown> | undefined) ??
        (envelope.actor as { metadata?: Record<string, unknown> }).metadata,
      Date.parse(envelope.appendedAt),
      annotations["attachments"] as StoredAttachment[] | undefined,
      policyAnnotations(envelope.annotations),
      contentIntegrityFromAnnotations(annotations),
    );
  }

  private async encodePayload(payload: unknown): Promise<unknown> {
    return encodeChannelPayloadStoredValues(payload, {
      putText: (value) =>
        this.rpc.call("main", mainRpcMethods["blobstore.putText"], [value]),
    });
  }

  private async hydrateReplayPage(
    window: OwnerReplayPage,
  ): Promise<OwnerReplayPage> {
    return {
      ...window,
      items: await Promise.all(
        window.items.map((envelope) => this.hydrate(envelope)),
      ),
    };
  }

  private async readReplayWindow(
    window: ChannelEnvelopeWindow,
    maximumItems: number | "all",
    hydrate: boolean,
  ): Promise<OwnerReplayWindow> {
    const pages = await collectChannelEnvelopePages(
      { channelId: this.channelId, window },
      { maximumItems },
      async (request) => {
        const local = this.ledger.page(request);
        const page: OwnerReplayPage = { ...local, items: local.items.map((envelope) => this.channelView(envelope)) };
        return hydrate ? this.hydrateReplayPage(page) : page;
      },
    );
    const firstPage = pages[0]!;
    const lastPage = pages[pages.length - 1]!;
    const items = pages.flatMap((page) => page.items);
    return {
      items,
      pageInfo: {
        totalCount: firstPage.pageInfo.totalCount,
        ...(firstPage.pageInfo.firstSeq !== undefined
          ? { firstSeq: firstPage.pageInfo.firstSeq }
          : {}),
        ...(firstPage.pageInfo.lastSeq !== undefined
          ? { lastSeq: firstPage.pageInfo.lastSeq }
          : {}),
        ...(firstPage.pageInfo.snapshotLastSeq !== undefined
          ? { snapshotLastSeq: firstPage.pageInfo.snapshotLastSeq }
          : {}),
        ...(items[0]?.seq !== undefined
          ? { returnedFromSeq: items[0].seq }
          : {}),
        ...(items[items.length - 1]?.seq !== undefined
          ? { returnedToSeq: items[items.length - 1]!.seq }
          : {}),
        hasMoreBefore: firstPage.pageInfo.hasMoreBefore,
        hasMoreAfter: lastPage.pageInfo.hasMoreAfter,
      },
    };
  }

  private async hydrate<T>(value: T): Promise<T> {
    return hydrateStoredValueRefs(value, {
      getText: (digest) =>
        this.rpc.call("main", mainRpcMethods["blobstore.getText"], [digest]),
    }) as Promise<T>;
  }
}
