import { canonicalJson, sha256HexSyncText } from "@vibestudio/content-addressing";
import { channelEnvelopePageInfo, normalizeChannelEnvelopePageRequest, type ChannelEnvelopePageRequest } from "@vibestudio/shared/channelEnvelopePaging";
import { registryMutationFromLogEnvelope, LOG_GENESIS_HASH, logEnvelopeHashPreimage, logEnvelopeSemantic, type LogEnvelope } from "@workspace/agentic-protocol";
import type { SqlStorage } from "@workspace/runtime/worker";

type SemanticEnvelope = Omit<LogEnvelope, "logId" | "head" | "seq" | "prevHash" | "hash">;
export type ChannelObservation =
  | { kind: "root" }
  | { kind: "fork"; parentChannelId: string; throughSequence: number; expectedParentHash: string }
  | { kind: "append"; sequence: number; envelope: LogEnvelope };

/** The channel owner's immutable event ledger. Global graph delivery is debt,
 * never the channel's history or membership authority. */
export class ChannelLedger {
  constructor(
    readonly sql: SqlStorage,
    private readonly transaction: <T>(operation: () => T) => T,
    private readonly channelId: string,
  ) {}

  static createTables(sql: SqlStorage): void {
    sql.exec(`
      CREATE TABLE IF NOT EXISTS channel_ledger_events (
        sequence INTEGER PRIMARY KEY,
        envelope_id TEXT NOT NULL UNIQUE,
        payload_kind TEXT NOT NULL,
        opened_turn_id TEXT,
        hash TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS channel_ledger_opened_turn ON channel_ledger_events (opened_turn_id) WHERE opened_turn_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS channel_ledger_kind_sequence ON channel_ledger_events (payload_kind, sequence);
      CREATE TABLE IF NOT EXISTS channel_ledger_chunks (
        sequence INTEGER NOT NULL,
        chunk INTEGER NOT NULL,
        body TEXT NOT NULL,
        PRIMARY KEY (sequence, chunk)
      );
      CREATE TABLE IF NOT EXISTS channel_ledger_state (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        head_sequence INTEGER NOT NULL,
        head_hash TEXT NOT NULL,
        observed_sequence INTEGER NOT NULL,
        parent_channel_id TEXT,
        parent_sequence INTEGER,
        parent_hash TEXT,
        root_observed INTEGER NOT NULL DEFAULT 0,
        parent_observed INTEGER NOT NULL DEFAULT 1
      );
    `);
    sql.exec(`INSERT OR IGNORE INTO channel_ledger_state
      (singleton, head_sequence, head_hash, observed_sequence)
      VALUES (1, 0, ?, 0)`, LOG_GENESIS_HASH);
  }

  headSequence(): number {
    return Number(this.state()["head_sequence"]);
  }

  hasObservedRoot(): boolean {
    return Number(this.state()["root_observed"]) === 1;
  }

  observedSequence(): number {
    return Number(this.state()["observed_sequence"]);
  }

  private state(): Record<string, unknown> {
    const row = this.sql.exec(`SELECT * FROM channel_ledger_state WHERE singleton = 1`).toArray()[0];
    if (!row) throw new Error("Channel ledger has no owner state");
    return row;
  }

  envelope(id: string): LogEnvelope | null {
    const row = this.sql.exec(`SELECT sequence FROM channel_ledger_events WHERE envelope_id = ?`, id).toArray()[0];
    return row ? this.at(Number(row["sequence"])) : null;
  }

  at(sequence: number): LogEnvelope | null {
    const chunks = this.sql.exec(`SELECT body FROM channel_ledger_chunks WHERE sequence = ? ORDER BY chunk`, sequence).toArray();
    if (!chunks.length) return null;
    return JSON.parse(chunks.map((row) => String(row["body"])).join("")) as LogEnvelope;
  }

  append(semantic: SemanticEnvelope, idempotency: "exact" | "idempotent-by-id"): LogEnvelope {
    return this.transaction(() => {
      const previous = this.envelope(String(semantic.envelopeId));
      if (previous) {
        if (idempotency === "exact" && canonicalJson(logEnvelopeSemantic(previous)) !== canonicalJson(logEnvelopeSemantic(semantic)))
          throw new Error("Channel envelope identity names different canonical content");
        return previous;
      }
      const state = this.state();
      const sequence = Number(state["head_sequence"]) + 1;
      const prevHash = String(state["head_hash"]);
      const envelope: LogEnvelope = {
        ...semantic, logId: this.channelId, head: "main", seq: sequence,
        prevHash, hash: sha256HexSyncText(logEnvelopeHashPreimage({
          prevHash, logId: this.channelId, head: "main", seq: sequence,
          semantic: logEnvelopeSemantic(semantic),
        })),
      };
      registryMutationFromLogEnvelope(envelope);
      const openedTurnId=envelope.payloadKind === "turn.opened" ? envelope.causality?.turnId ?? null : null;
      if(openedTurnId && this.sql.exec(`SELECT 1 FROM channel_ledger_events WHERE opened_turn_id=?`,openedTurnId).toArray().length)
        throw new Error(`duplicate turn.opened for turn ${openedTurnId}`);
      this.sql.exec(`INSERT INTO channel_ledger_events (sequence, envelope_id, payload_kind, opened_turn_id, hash) VALUES (?, ?, ?, ?, ?)`, sequence, String(envelope.envelopeId), envelope.payloadKind, openedTurnId, envelope.hash);
      const body = JSON.stringify(envelope);
      // Chunks bound individual SQLite rows independently of event size.
      for (let offset = 0, chunk = 0; offset < body.length; offset += 65536, chunk++)
        this.sql.exec(`INSERT INTO channel_ledger_chunks (sequence, chunk, body) VALUES (?, ?, ?)`, sequence, chunk, body.slice(offset, offset + 65536));
      this.sql.exec(`UPDATE channel_ledger_state SET head_sequence = ?, head_hash = ? WHERE singleton = 1`, sequence, envelope.hash);
      return envelope;
    });
  }

  registrySequence(): number {
    const row = this.sql.exec(`SELECT MAX(sequence) AS sequence FROM channel_ledger_events
      WHERE payload_kind IN ('messageType.registered', 'messageType.cleared')`).toArray()[0];
    return Number(row?.["sequence"] ?? 0);
  }

  registryEvents(): LogEnvelope[] {
    return this.sql.exec(`SELECT sequence FROM channel_ledger_events
      WHERE payload_kind IN ('messageType.registered', 'messageType.cleared')
      ORDER BY sequence`).toArray().map((row) => this.at(Number(row["sequence"]))!);
  }

  read(input: { afterSeq?: number; beforeSeq?: number; limit?: number; payloadKind?: string }): LogEnvelope[] {
    const rows = this.sql.exec(`SELECT sequence FROM channel_ledger_events
      WHERE sequence > ? AND (? IS NULL OR sequence < ?) AND (? IS NULL OR payload_kind = ?)
      ORDER BY sequence LIMIT ?`, input.afterSeq ?? 0, input.beforeSeq ?? null, input.beforeSeq ?? null, input.payloadKind ?? null, input.payloadKind ?? null, input.limit ?? 500).toArray();
    return rows.map((row) => this.at(Number(row["sequence"]))!);
  }

  page(input: ChannelEnvelopePageRequest) {
    const request = normalizeChannelEnvelopePageRequest(input);
    const kind = request.payloadKind ?? null;
    const stats = this.sql.exec(`SELECT COUNT(*) AS total, MIN(sequence) AS first, MAX(sequence) AS last
      FROM channel_ledger_events WHERE (? IS NULL OR payload_kind = ?)`, kind, kind).toArray()[0]!;
    const after = request.window.kind === "after" ? request.window.seq : 0;
    const before = request.window.kind === "before" ? request.window.seq : null;
    const through = request.window.kind === "after" ? request.window.throughSeq ?? this.headSequence() : this.headSequence();
    const descending = request.window.kind !== "after";
    const rows = this.sql.exec(`SELECT sequence FROM channel_ledger_events
      WHERE sequence > ? AND sequence <= ? AND (? IS NULL OR sequence < ?) AND (? IS NULL OR payload_kind = ?)
      ORDER BY sequence ${descending ? "DESC" : "ASC"} LIMIT ?`, after, through, before, before, kind, kind, request.limit).toArray();
    if (descending) rows.reverse();
    const sequences = rows.map((row) => Number(row["sequence"]));
    return {
      items: sequences.map((sequence) => this.at(sequence)!),
      pageInfo: channelEnvelopePageInfo(request, {
        totalCount: Number(stats["total"]),
        ...(stats["first"] === null ? {} : { firstSeq: Number(stats["first"]) }),
        ...(stats["last"] === null ? {} : { lastSeq: Number(stats["last"]) }),
      }, sequences),
    };
  }

  /** The copied prefix survives cloning; source-owned observer progress does not. */
  initializeClone(): void {
    this.sql.exec(`UPDATE channel_ledger_state SET observed_sequence = 0,
      parent_channel_id = NULL, parent_sequence = NULL, parent_hash = NULL,
      parent_observed = 1, root_observed = 0 WHERE singleton = 1`);
  }

  /** The clone owns its copied immutable prefix, with original envelope hashes. */
  forkFrom(parentChannelId: string, throughSequence: number | null): void {
    this.transaction(() => {
      const state = this.state();
      const through = throughSequence ?? (state["parent_channel_id"] === null
        ? this.headSequence() : Number(state["parent_sequence"]));
      if (state["parent_channel_id"] !== null) {
        if (state["parent_channel_id"] !== parentChannelId ||
            Number(state["parent_sequence"]) !== through)
          throw new Error("Channel fork changed its immutable parent prefix");
        return;
      }
      if (!Number.isSafeInteger(through) || through < 0 || through > this.headSequence())
        throw new Error("Channel fork does not own the requested canonical prefix");
      const hash = through === 0 ? LOG_GENESIS_HASH : this.at(through)?.hash;
      if (!hash) throw new Error("Channel fork prefix lost its canonical boundary");
      this.sql.exec(`DELETE FROM channel_ledger_chunks WHERE sequence > ?`, through);
      this.sql.exec(`DELETE FROM channel_ledger_events WHERE sequence > ?`, through);
      this.sql.exec(`UPDATE channel_ledger_state SET head_sequence = ?, head_hash = ?, observed_sequence = 0,
        parent_channel_id = ?, parent_sequence = ?, parent_hash = ?, parent_observed = 0 WHERE singleton = 1`, through, hash, parentChannelId, through, hash);
    });
  }

  peekObservation(): ChannelObservation | null {
    const state = this.state();
    if (Number(state["parent_observed"]) === 0)
      return { kind: "fork", parentChannelId: String(state["parent_channel_id"]), throughSequence: Number(state["parent_sequence"]), expectedParentHash: String(state["parent_hash"]) };
    if (Number(state["root_observed"]) === 0 && Number(state["head_sequence"]) === 0) return {kind:"root"};
    const next = Number(state["observed_sequence"]) + 1;
    if (next > Number(state["head_sequence"])) return null;
    const envelope = this.at(next);
    if (!envelope) throw new Error("Channel observation lost its canonical event");
    return { kind: "append", sequence: next, envelope };
  }

  markRootObserved():void {
    this.transaction(()=>{
      const state=this.state();
      if(Number(state["root_observed"])!==0 || Number(state["parent_observed"])!==1)
        throw new Error("Channel root observation changed its original obligation");
      this.sql.exec(`UPDATE channel_ledger_state SET root_observed=1 WHERE singleton=1`);
    });
  }

  /** Settle exactly the immutable prefix leased by the canonical host claim. */
  markObservedThrough(first:number,through:number,envelopeId:string):void {
    this.transaction(()=>{
      const next=this.peekObservation();
      const last=this.at(through);
      if(!next || next.kind!=="append" || next.sequence!==first || !Number.isSafeInteger(through) || through<first || !last || String(last.envelopeId)!==envelopeId)
        throw new Error("Channel observation receipt changed its owned prefix");
      this.sql.exec(`UPDATE channel_ledger_state SET observed_sequence=?,root_observed=1 WHERE singleton=1`,through);
    });
  }

  markForkObserved(parentChannelId: string, throughSequence: number, hash: string): void {
    this.transaction(() => {
      const next = this.peekObservation();
      if (!next || next.kind !== "fork" || next.parentChannelId !== parentChannelId || next.throughSequence !== throughSequence || next.expectedParentHash !== hash)
        throw new Error("Channel fork observation changed its original prefix");
      this.sql.exec(`UPDATE channel_ledger_state SET parent_observed = 1, root_observed = 1, observed_sequence = ? WHERE singleton = 1`, throughSequence);
    });
  }
}
