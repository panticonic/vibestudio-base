/**
 * TendrilDO — one tendril (tendrils plan §4.1, §5.2), keyed by a creator-chosen
 * UUID. Owns identity, the `about` handover note, shared JSON state, the list
 * of presentations and the functions each presentation exposes. Events live in
 * the channel; code versions live in slot history.
 *
 * State writes are last-writer-wins per path in this object's order. Each write
 * carries a client id (`cid`); a repeated cid returns the original revision
 * and re-sends that revision's live signal, so outbound queues can resend
 * blindly.
 */
import { DurableObjectBase, rpc } from "@workspace/runtime/worker/kernel";
import type { DurableObjectContext } from "@workspace/runtime/worker/kernel";
import { createRpcMethodCaller } from "@vibestudio/shared/rpcMethods";
import { doTargetId } from "@vibestudio/shared/workspaceServiceRpc";
import { resolveChannelEndpoint } from "@workspace/pubsub";
import { channelClientRpcMethods } from "@workspace/pubsub/rpc-contract";
import {
  StateOpSchema,
  TENDRIL_STATE_SIGNAL,
  TendrilAboutSchema,
  TendrilCreateInputSchema,
  TendrilFunctionDeclSchema,
  TendrilPresentationSchema,
  applyOps,
  type StateOp,
  type StateRoot,
  type TendrilAbout,
  type TendrilCreateInput,
  type TendrilDescription,
  type TendrilFunctionDecl,
  type TendrilStateSignal,
} from "@workspace/tendril";
import { z } from "zod";

const CHANNEL_SERVICE_PROTOCOL = "vibestudio.channel.v1";
const IDENTITY_KEY = "tendril.identity";
const STATE_KEY = "tendril.state";
const REV_KEY = "tendril.rev";

const OPEN_WRITE = {
  website: {
    kind: "closed",
    reason: "Tendril state belongs to the workspace's own panels and agents.",
  },
  principals: ["host", "user", "code"],
  effect: { kind: "open" },
  tier: "open",
  sensitivity: "write",
} as const;
const OPEN_READ = { ...OPEN_WRITE, sensitivity: "read" } as const;

type Identity = Omit<TendrilCreateInput, "about">;

export class TendrilDO extends DurableObjectBase {
  static override schemaVersion = 1;

  constructor(ctx: DurableObjectContext, env: unknown) {
    super(ctx, env);
  }

  protected createTables(): void {
    this.sql.exec(`
      CREATE TABLE presentations (
        slot_id TEXT PRIMARY KEY,
        device_id TEXT,
        label TEXT NOT NULL
      );
      CREATE TABLE functions (
        slot_id TEXT NOT NULL,
        name TEXT NOT NULL,
        decl TEXT NOT NULL,
        PRIMARY KEY (slot_id, name)
      );
      CREATE TABLE applied (
        cid TEXT PRIMARY KEY,
        rev INTEGER NOT NULL,
        ops TEXT NOT NULL,
        by TEXT NOT NULL
      );
    `);
  }

  protected override requiredTables(): readonly string[] {
    return ["presentations", "functions", "applied"];
  }

  @rpc(OPEN_WRITE)
  async create(input: TendrilCreateInput): Promise<TendrilDescription> {
    const parsed = TendrilCreateInputSchema.parse(input);
    const existing = this.identity();
    if (existing) {
      for (const key of ["source", "channelId", "contextId"] as const)
        if (existing[key] !== parsed[key])
          throw new Error(
            `create: tendril ${this.objectKey} already exists with ${key} ${JSON.stringify(existing[key])}`,
          );
      return this.describeNow();
    }
    const { about, ...identity } = parsed;
    this.ctx.storage.transactionSync(() => {
      this.setStateValue(IDENTITY_KEY, JSON.stringify(identity));
      if (about) this.setStateValue("tendril.about", JSON.stringify(about));
    });
    return this.describeNow();
  }

  @rpc(OPEN_READ)
  async describe(): Promise<TendrilDescription> {
    return this.describeNow();
  }

  @rpc(OPEN_WRITE)
  async setAbout(about: TendrilAbout): Promise<void> {
    this.requireIdentity();
    this.setStateValue("tendril.about", JSON.stringify(TendrilAboutSchema.parse(about)));
  }

  @rpc(OPEN_READ)
  async getState(): Promise<{ rev: number; state: Record<string, unknown> }> {
    this.requireIdentity();
    return { rev: this.rev(), state: this.state() };
  }

  @rpc(OPEN_WRITE)
  async applyState(input: { cid: string; ops: StateOp[] }): Promise<{ rev: number }> {
    const identity = this.requireIdentity();
    const { cid, ops } = z
      .object({ cid: z.string().min(1), ops: z.array(StateOpSchema) })
      .parse(input) as { cid: string; ops: StateOp[] };
    const prior = this.sql
      .exec(`SELECT rev, ops, by FROM applied WHERE cid = ?`, cid)
      .toArray()[0];
    let signal: TendrilStateSignal;
    if (prior) {
      signal = {
        tendrilId: this.objectKey,
        rev: Number(prior["rev"]),
        ops: JSON.parse(String(prior["ops"])) as StateOp[],
        by: String(prior["by"]),
      };
    } else {
      const by = this.caller?.callerId ?? "unknown";
      // Validate by applying to a copy first: a refused op leaves nothing behind.
      const next = applyOps(this.state(), ops);
      const rev = this.rev() + 1;
      this.ctx.storage.transactionSync(() => {
        this.setStateValue(STATE_KEY, JSON.stringify(next));
        this.setStateValue(REV_KEY, String(rev));
        this.sql.exec(
          `INSERT INTO applied(cid, rev, ops, by) VALUES (?, ?, ?, ?)`,
          cid,
          rev,
          JSON.stringify(ops),
          by,
        );
      });
      signal = { tendrilId: this.objectKey, rev, ops, by };
    }
    await this.sendStateSignal(identity, signal);
    return { rev: signal.rev };
  }

  @rpc(OPEN_WRITE)
  async registerPresentation(p: {
    slotId: string;
    deviceId: string | null;
    label: string;
  }): Promise<void> {
    this.requireIdentity();
    const parsed = TendrilPresentationSchema.parse(p);
    this.sql.exec(
      `INSERT INTO presentations(slot_id, device_id, label) VALUES (?, ?, ?)
       ON CONFLICT(slot_id) DO UPDATE SET device_id = excluded.device_id, label = excluded.label`,
      parsed.slotId,
      parsed.deviceId,
      parsed.label,
    );
  }

  @rpc(OPEN_WRITE)
  async unregisterPresentation(slotId: string): Promise<void> {
    this.ctx.storage.transactionSync(() => {
      this.sql.exec(`DELETE FROM presentations WHERE slot_id = ?`, slotId);
      this.sql.exec(`DELETE FROM functions WHERE slot_id = ?`, slotId);
    });
  }

  /** Replace the full set of functions one presentation exposes. */
  @rpc(OPEN_WRITE)
  async registerFunctions(slotId: string, fns: TendrilFunctionDecl[]): Promise<void> {
    this.requireIdentity();
    const parsed = z.array(TendrilFunctionDeclSchema).parse(fns);
    this.ctx.storage.transactionSync(() => {
      this.sql.exec(`DELETE FROM functions WHERE slot_id = ?`, slotId);
      for (const fn of parsed)
        this.sql.exec(
          `INSERT INTO functions(slot_id, name, decl) VALUES (?, ?, ?)`,
          slotId,
          fn.name,
          JSON.stringify(fn),
        );
    });
  }

  /**
   * Live fan-out to the tendril's pages: an ephemeral channel signal sent as
   * this object. Pages that miss it refetch the snapshot on reconnect.
   */
  protected async sendStateSignal(
    identity: Identity,
    signal: TendrilStateSignal,
  ): Promise<void> {
    const endpoint = await resolveChannelEndpoint(
      this.rpc,
      identity.channelId,
      undefined,
      CHANNEL_SERVICE_PROTOCOL,
      identity.contextId,
    );
    await createRpcMethodCaller(
      this.rpc,
      doTargetId(endpoint),
      channelClientRpcMethods,
    )("sendSignal", [this.rpcSelfId, JSON.stringify(signal), TENDRIL_STATE_SIGNAL]);
  }

  private identity(): Identity | null {
    const raw = this.getStateValue(IDENTITY_KEY);
    return raw ? (JSON.parse(raw) as Identity) : null;
  }

  private requireIdentity(): Identity {
    const identity = this.identity();
    if (!identity)
      throw new Error(`Tendril ${this.objectKey} does not exist; call create() first`);
    return identity;
  }

  private state(): StateRoot {
    const raw = this.getStateValue(STATE_KEY);
    return raw ? (JSON.parse(raw) as StateRoot) : {};
  }

  private rev(): number {
    return Number(this.getStateValue(REV_KEY) ?? "0");
  }

  private describeNow(): TendrilDescription {
    const identity = this.requireIdentity();
    const about = this.getStateValue("tendril.about");
    return {
      tendrilId: this.objectKey,
      ...identity,
      about: about ? (JSON.parse(about) as TendrilAbout) : null,
      presentations: this.sql
        .exec(`SELECT slot_id, device_id, label FROM presentations ORDER BY slot_id`)
        .toArray()
        .map((row) => ({
          slotId: String(row["slot_id"]),
          deviceId: row["device_id"] === null ? null : String(row["device_id"]),
          label: String(row["label"]),
        })),
      functions: this.sql
        .exec(`SELECT slot_id, decl FROM functions ORDER BY slot_id, name`)
        .toArray()
        .map((row) => ({
          ...(JSON.parse(String(row["decl"])) as TendrilFunctionDecl),
          slotId: String(row["slot_id"]),
        })),
      rev: this.rev(),
    };
  }
}
