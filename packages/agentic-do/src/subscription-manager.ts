/**
 * Durable channel relationships owned by an agent vessel.
 *
 * Membership is data, not a response resource. Every operation is a finite
 * RPC to the channel; activation restart has nothing to reopen or recover.
 */

import type { SqlStorage } from "@workspace/runtime/worker";
import type { ChannelSubscriptionConfig } from "@workspace/agentic-core";
import type { ParticipantDescriptor } from "@workspace/harness";
import type { ChannelReplayEnvelope } from "@workspace/pubsub";
import type { DOIdentity } from "./identity.js";
import type {
  ChannelClient,
  ChannelJoinInput,
  ChannelJoinResult,
} from "./channel-client.js";
import { canonicalJson } from "@vibestudio/content-addressing";

export interface RecoveredChannelSubscription {
  channelId: string;
  config?: unknown;
  envelope?: ChannelReplayEnvelope;
}

interface StoredSubscription {
  channelId: string;
  contextId: string;
  revision: number;
  participantId: string;
  config?: unknown;
  relationshipJson: string;
}

/** Exact relationship request retained by native bootstrap before remote admission. */
export interface PreparedChannelSubscription {
  channelId: string;
  input: ChannelJoinInput;
  relationshipJson: string;
}
export interface ChannelSubscriptionOptions {
  channelId: string;
  contextId: string;
  config?: unknown;
  descriptor: ParticipantDescriptor;
  replay?: boolean;
  delivery?: "all" | "addressed";
}

export class SubscriptionManager {
  constructor(
    private sql: SqlStorage,
    private channelFactory: (channelId: string) => ChannelClient,
    private identity: DOIdentity,
  ) {}

  static createTables(sql: SqlStorage): void {
    sql.exec(`
      CREATE TABLE IF NOT EXISTS subscription_intents (
        channel_id TEXT PRIMARY KEY,
        operation_id TEXT NOT NULL,
        relationship_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS subscriptions (
        channel_id TEXT PRIMARY KEY,
        context_id TEXT NOT NULL,
        revision INTEGER NOT NULL CHECK (revision > 0),
        subscribed_at INTEGER NOT NULL,
        config TEXT,
        relationship_json TEXT NOT NULL,
        participant_id TEXT NOT NULL
      )
    `);
  }

  createTables(): void {
    SubscriptionManager.createTables(this.sql);
  }

  private buildParticipantId(): string {
    const ref = this.identity.ref;
    return `do:${ref.source}:${ref.className}:${ref.objectKey}`;
  }

  async prepareSubscription(
    opts: ChannelSubscriptionOptions,
  ): Promise<PreparedChannelSubscription> {
    const participantId = this.buildParticipantId();
    const metadata: Record<string, unknown> = {
      name: opts.descriptor.name,
      handle: opts.descriptor.handle,
      ...opts.descriptor.metadata,
      // A supervisor is present only to receive addressed lifecycle facts. It
      // must not appear as a selectable responding agent in a task-channel UI,
      // even if descriptor extras carry a general agent type.
      type: opts.delivery === "addressed" ? "observer" : opts.descriptor.type,
      ...(opts.descriptor.methods?.length
        ? { methods: opts.descriptor.methods }
        : {}),
    };
    const config =
      opts.config && typeof opts.config === "object" ? opts.config : null;
    const relationship = {
      contextId: opts.contextId,
      metadata,
      delivery: opts.delivery ?? ("all" as const),
      endpoint: {
        kind: "entity" as const,
        entityId: participantId,
        invocation: "direct" as const,
      },
      applicationConfig:
        config === null ? null : { version: 1 as const, value: config },
    };
    const relationshipJson = canonicalJson(relationship);
    const intentJson = canonicalJson({
      relationship,
      replay: opts.replay !== false,
    });
    const retained = this.sql
      .exec(
        `SELECT operation_id, relationship_json FROM subscription_intents WHERE channel_id = ?`,
        opts.channelId,
      )
      .toArray()[0];
    const operationId =
      retained?.["relationship_json"] === intentJson
        ? String(retained["operation_id"])
        : crypto.randomUUID();
    this.sql.exec(
      `INSERT OR REPLACE INTO subscription_intents (channel_id, operation_id, relationship_json) VALUES (?, ?, ?)`,
      opts.channelId,
      operationId,
      intentJson,
    );
    return {
      channelId: opts.channelId,
      input: {
        participantId,
        operationId,
        ...relationship,
        replay: opts.replay !== false,
      },
      relationshipJson,
    };
  }

  /** An exact lost-response retry retains its channel-owned operation identity. */
  async joinPrepared(
    prepared: PreparedChannelSubscription,
  ): Promise<ChannelJoinResult> {
    if (prepared.input.participantId !== this.buildParticipantId())
      throw new Error(
        "Prepared channel relationship belongs to a different entity",
      );
    const { replay: _replay, ...relationship } = prepared.input;
    const {
      participantId: _participantId,
      operationId: _operationId,
      ...semanticRelationship
    } = relationship;
    if (canonicalJson(semanticRelationship) !== prepared.relationshipJson)
      throw new Error(
        "Prepared channel relationship changed its retained request",
      );
    const result = await this.channelFactory(prepared.channelId).join(
      prepared.input,
    );
    if (!Number.isSafeInteger(result.revision) || result.revision < 1)
      throw new Error("Channel join returned an invalid relationship revision");
    this.sql.exec(
      `INSERT OR REPLACE INTO subscriptions
         (channel_id, context_id, revision, subscribed_at, config, relationship_json, participant_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      prepared.channelId,
      prepared.input.contextId,
      result.revision,
      Date.now(),
      prepared.input.applicationConfig === null
        ? null
        : JSON.stringify(prepared.input.applicationConfig.value),
      prepared.relationshipJson,
      prepared.input.participantId,
    );
    return result;
  }

  async subscribe(
    opts: ChannelSubscriptionOptions,
  ): Promise<ChannelJoinResult> {
    return this.joinPrepared(await this.prepareSubscription(opts));
  }

  async unsubscribeFromChannel(channelId: string): Promise<void> {
    const stored = this.getStored(channelId);
    if (!stored) return;
    const channel = this.channelFactory(channelId);
    try {
      await channel.leave(stored.participantId, stored.revision + 1);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/relationship revision/.test(message)) throw error;
      const authoritative = await channel.relationshipState(
        stored.participantId,
      );
      if (authoritative.active) {
        await channel.leave(stored.participantId, authoritative.revision + 1);
      }
    }
    this.deleteSubscription(channelId);
    this.sql.exec(
      `DELETE FROM subscription_intents WHERE channel_id = ?`,
      channelId,
    );
  }

  getParticipantId(channelId: string): string | null {
    return this.getStored(channelId)?.participantId ?? null;
  }

  getContextId(channelId: string): string {
    const stored = this.getStored(channelId);
    if (!stored) throw new Error(`No subscription for channel ${channelId}`);
    return stored.contextId;
  }

  getConfig(channelId: string): ChannelSubscriptionConfig | null {
    const stored = this.getStored(channelId);
    const parsed = stored?.config;
    return parsed && typeof parsed === "object"
      ? (parsed as ChannelSubscriptionConfig)
      : null;
  }

  /** Addressed-only memberships receive targeted lifecycle traffic but do not
   * make the observed channel an execution home for this agent. */
  ownsReasoningLoop(channelId: string): boolean {
    const stored = this.getStored(channelId);
    if (!stored) return false;
    const relationship = JSON.parse(stored.relationshipJson) as {
      delivery?: unknown;
    };
    return relationship.delivery !== "addressed";
  }

  listAll(): Array<{ channelId: string; participantId: string | null }> {
    return this.listStored().map(({ channelId, participantId }) => ({
      channelId,
      participantId,
    }));
  }

  listStored(): StoredSubscription[] {
    return this.sql
      .exec(
        `SELECT channel_id, context_id, revision, config, relationship_json, participant_id FROM subscriptions ORDER BY channel_id`,
      )
      .toArray()
      .map((row) => ({
        channelId: String(row["channel_id"]),
        contextId: String(row["context_id"]),
        revision: Number(row["revision"]),
        participantId: String(row["participant_id"]),
        relationshipJson: String(row["relationship_json"]),
        ...(typeof row["config"] === "string"
          ? { config: JSON.parse(String(row["config"])) as unknown }
          : {}),
      }));
  }

  deleteSubscription(channelId: string): void {
    this.sql.exec(`DELETE FROM subscriptions WHERE channel_id = ?`, channelId);
  }

  count(): number {
    const row = this.sql
      .exec(`SELECT COUNT(*) AS cnt FROM subscriptions`)
      .toArray()[0];
    return Number(row?.["cnt"] ?? 0);
  }

  listChannelIds(): string[] {
    return this.listStored().map(({ channelId }) => channelId);
  }

  rename(
    oldChannelId: string,
    newChannelId: string,
    newContextId: string,
  ): void {
    if (!newContextId)
      throw new Error("SubscriptionManager.rename requires newContextId");
    this.sql.exec(
      `DELETE FROM subscription_intents WHERE channel_id IN (?, ?)`,
      oldChannelId,
      newChannelId,
    );
    this.sql.exec(
      `UPDATE subscriptions SET channel_id = ?, context_id = ?, participant_id = ? WHERE channel_id = ?`,
      newChannelId,
      newContextId,
      this.buildParticipantId(),
      oldChannelId,
    );
  }

  private getStored(channelId: string): StoredSubscription | null {
    const row = this.sql
      .exec(
        `SELECT channel_id, context_id, revision, config, relationship_json, participant_id FROM subscriptions WHERE channel_id = ?`,
        channelId,
      )
      .toArray()[0];
    if (!row) return null;
    return {
      channelId: String(row["channel_id"]),
      contextId: String(row["context_id"]),
      revision: Number(row["revision"]),
      participantId: String(row["participant_id"]),
      relationshipJson: String(row["relationship_json"]),
      ...(typeof row["config"] === "string"
        ? { config: JSON.parse(String(row["config"])) as unknown }
        : {}),
    };
  }
}
