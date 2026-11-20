import { canonicalJson } from "@vibestudio/content-addressing";
import {
  channelEnvelopePageInfo,
  normalizeChannelEnvelopePageRequest,
  type ChannelEnvelopePageRequest,
} from "@vibestudio/shared/channelEnvelopePaging";
import {
  registryMutationFromLogEnvelope,
  logEnvelopeSemantic,
  type LogEnvelope,
} from "@workspace/agentic-protocol";
import type { SqlStorage } from "@workspace/runtime/worker";

type SemanticEnvelope = Omit<LogEnvelope, "logId" | "head" | "seq">;
export type ChannelObservation =
  | { kind: "root" }
  | {
      kind: "fork";
      parentChannelId: string;
      throughSequence: number;
      /** The event that ends the parent's prefix (null for an empty prefix). A boundary is named by its id. */
      parentEnvelopeId: string | null;
    }
  | { kind: "append"; sequence: number; envelope: LogEnvelope };

/**
 * The ledger's tables. `events` and `chunks` are versioned; `state` is local (the head, the graph
 * observation cursor, the fork's parent), so a fork rebuilds it from the events it holds.
 */
export const CHANNEL_LEDGER_DDL = {
  events: `
      CREATE TABLE IF NOT EXISTS channel_ledger_events (
        sequence INTEGER PRIMARY KEY,
        envelope_id TEXT NOT NULL UNIQUE,
        payload_kind TEXT NOT NULL,
        opened_turn_id TEXT
      )
    `,
  openedTurnIndex: `CREATE UNIQUE INDEX IF NOT EXISTS channel_ledger_opened_turn ON channel_ledger_events (opened_turn_id) WHERE opened_turn_id IS NOT NULL`,
  kindSequenceIndex: `CREATE INDEX IF NOT EXISTS channel_ledger_kind_sequence ON channel_ledger_events (payload_kind, sequence)`,
  chunks: `
      CREATE TABLE IF NOT EXISTS channel_ledger_chunks (
        sequence INTEGER NOT NULL,
        chunk INTEGER NOT NULL,
        body TEXT NOT NULL,
        PRIMARY KEY (sequence, chunk)
      )
    `,
  state: `
      CREATE TABLE IF NOT EXISTS channel_ledger_state (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        head_sequence INTEGER NOT NULL,
        observed_sequence INTEGER NOT NULL,
        parent_channel_id TEXT,
        parent_sequence INTEGER,
        root_observed INTEGER NOT NULL DEFAULT 0,
        parent_observed INTEGER NOT NULL DEFAULT 1
      )
    `,
} as const;

/** The channel owner's immutable event ledger. Global graph delivery is debt,
 * never the channel's history or membership authority. */
/** A write of versioned state and its Dolt commit, one durable step (a plain transaction on SQLite). */
export type ChannelCommitted = <T>(
  describe: (result: T) => string | null,
  operation: () => T,
) => T;

export class ChannelLedger {
  private readonly storedValues = new WeakMap<LogEnvelope, Readonly<Record<string, string>>>();

  constructor(
    readonly sql: SqlStorage,
    private readonly transaction: <T>(operation: () => T) => T,
    private readonly channelId: string,
    /** The commit point of a ledger append: the event and its commit are one durable step. */
    private readonly committed: ChannelCommitted = (_describe, operation) =>
      transaction(operation),
  ) {}

  static createTables(sql: SqlStorage): void {
    sql.exec(CHANNEL_LEDGER_DDL.events);
    sql.exec(CHANNEL_LEDGER_DDL.openedTurnIndex);
    sql.exec(CHANNEL_LEDGER_DDL.kindSequenceIndex);
    sql.exec(CHANNEL_LEDGER_DDL.chunks);
    sql.exec(CHANNEL_LEDGER_DDL.state);
    sql.exec(
      `INSERT OR IGNORE INTO channel_ledger_state
      (singleton, head_sequence, observed_sequence)
      VALUES (1, 0, 0)`,
    );
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
    const row = this.sql
      .exec(`SELECT * FROM channel_ledger_state WHERE singleton = 1`)
      .toArray()[0];
    if (!row) throw new Error("Channel ledger has no owner state");
    return row;
  }

  envelope(id: string): LogEnvelope | null {
    const row = this.sql
      .exec(
        `SELECT sequence FROM channel_ledger_events WHERE envelope_id = ?`,
        id,
      )
      .toArray()[0];
    return row ? this.at(Number(row["sequence"])) : null;
  }

  at(sequence: number): LogEnvelope | null {
    const chunks = this.sql
      .exec(
        `SELECT body FROM channel_ledger_chunks WHERE sequence = ? ORDER BY chunk`,
        sequence,
      )
      .toArray();
    if (!chunks.length) return null;
    const { storedValues, ...envelope } = JSON.parse(
      chunks.map((row) => String(row["body"])).join(""),
    ) as LogEnvelope & {
      storedValues?: Record<string, string>;
      prevHash?: unknown;
      hash?: unknown;
    };
    // An event stored before the hash chain was deleted still carries its two fields.
    delete envelope.prevHash;
    delete envelope.hash;
    if (storedValues) this.storedValues.set(envelope, storedValues);
    return envelope;
  }

  storedText(envelope: LogEnvelope, digest: string): string | null {
    const values = this.storedValues.get(envelope);
    return values && Object.hasOwn(values, digest) ? values[digest]! : null;
  }

  /** The id of the event at `sequence`: how a boundary of the ledger is named. Null for sequence 0. */
  boundaryEnvelopeId(sequence: number): string | null {
    if (sequence === 0) return null;
    const row = this.sql
      .exec(`SELECT envelope_id FROM channel_ledger_events WHERE sequence = ?`, sequence)
      .toArray()[0];
    if (!row) throw new Error("Channel ledger boundary names no event");
    return String(row["envelope_id"]);
  }

  /** The commit message of an append. Its first words name the event; `commitMessageSequence` reads the sequence back. */
  static appendMessage(
    envelope: Pick<LogEnvelope, "seq" | "payloadKind" | "envelopeId">,
  ): string {
    return `channel: append ${envelope.seq} ${envelope.payloadKind} ${envelope.envelopeId}`;
  }

  append(
    semantic: SemanticEnvelope,
    idempotency: "exact" | "idempotent-by-id",
    values?: Readonly<Record<string, string>>,
  ): LogEnvelope {
    let appended = false;
    return this.committed(
      (envelope: LogEnvelope) =>
        appended ? ChannelLedger.appendMessage(envelope) : null,
      () => {
        const previous = this.envelope(String(semantic.envelopeId));
        if (previous) {
          if (
            idempotency === "exact" &&
            canonicalJson(logEnvelopeSemantic(previous)) !==
              canonicalJson(logEnvelopeSemantic(semantic))
          )
            throw new Error(
              "Channel envelope identity names different canonical content",
            );
          return previous;
        }
        const state = this.state();
        const sequence = Number(state["head_sequence"]) + 1;
        const envelope: LogEnvelope = {
          ...semantic,
          logId: this.channelId,
          head: "main",
          seq: sequence,
        };
        registryMutationFromLogEnvelope(envelope);
        const openedTurnId =
          envelope.payloadKind === "turn.opened"
            ? (envelope.causality?.turnId ?? null)
            : null;
        if (
          openedTurnId &&
          this.sql
            .exec(
              `SELECT 1 FROM channel_ledger_events WHERE opened_turn_id=?`,
              openedTurnId,
            )
            .toArray().length
        )
          throw new Error(`duplicate turn.opened for turn ${openedTurnId}`);
        this.sql.exec(
          `INSERT INTO channel_ledger_events (sequence, envelope_id, payload_kind, opened_turn_id) VALUES (?, ?, ?, ?)`,
          sequence,
          String(envelope.envelopeId),
          envelope.payloadKind,
          openedTurnId,
        );
        const body = JSON.stringify(values ? { ...envelope, storedValues: values } : envelope);
        // Chunks bound individual SQLite rows independently of event size.
        for (let offset = 0, chunk = 0; offset < body.length; chunk++) {
          let end = Math.min(offset + 65536, body.length);
          const last = body.charCodeAt(end - 1);
          if (end < body.length && last >= 0xd800 && last <= 0xdbff) end--;
          this.sql.exec(
            `INSERT INTO channel_ledger_chunks (sequence, chunk, body) VALUES (?, ?, ?)`,
            sequence,
            chunk,
            body.slice(offset, end),
          );
          offset = end;
        }
        this.sql.exec(
          `UPDATE channel_ledger_state SET head_sequence = ? WHERE singleton = 1`,
          sequence,
        );
        appended = true;
        if (values) this.storedValues.set(envelope, values);
        return envelope;
      },
    );
  }

  registrySequence(): number {
    const row = this.sql
      .exec(
        `SELECT MAX(sequence) AS sequence FROM channel_ledger_events
      WHERE payload_kind IN ('messageType.registered', 'messageType.cleared')`,
      )
      .toArray()[0];
    return Number(row?.["sequence"] ?? 0);
  }

  registryEvents(): LogEnvelope[] {
    return this.sql
      .exec(
        `SELECT sequence FROM channel_ledger_events
      WHERE payload_kind IN ('messageType.registered', 'messageType.cleared')
      ORDER BY sequence`,
      )
      .toArray()
      .map((row) => this.at(Number(row["sequence"]))!);
  }

  read(input: {
    afterSeq?: number;
    beforeSeq?: number;
    limit?: number;
    payloadKind?: string;
  }): LogEnvelope[] {
    const rows = this.sql
      .exec(
        `SELECT sequence FROM channel_ledger_events
      WHERE sequence > ? AND (? IS NULL OR sequence < ?) AND (? IS NULL OR payload_kind = ?)
      ORDER BY sequence LIMIT ?`,
        input.afterSeq ?? 0,
        input.beforeSeq ?? null,
        input.beforeSeq ?? null,
        input.payloadKind ?? null,
        input.payloadKind ?? null,
        input.limit ?? 500,
      )
      .toArray();
    return rows.map((row) => this.at(Number(row["sequence"]))!);
  }

  page(input: ChannelEnvelopePageRequest) {
    const request = normalizeChannelEnvelopePageRequest(input);
    const kind = request.payloadKind ?? null;
    const stats = this.sql
      .exec(
        `SELECT COUNT(*) AS total, MIN(sequence) AS first, MAX(sequence) AS last
      FROM channel_ledger_events WHERE (? IS NULL OR payload_kind = ?)`,
        kind,
        kind,
      )
      .toArray()[0]!;
    const after = request.window.kind === "after" ? request.window.seq : 0;
    const before = request.window.kind === "before" ? request.window.seq : null;
    const through =
      request.window.kind === "after"
        ? (request.window.throughSeq ?? this.headSequence())
        : this.headSequence();
    const descending = request.window.kind !== "after";
    const rows = this.sql
      .exec(
        `SELECT sequence FROM channel_ledger_events
      WHERE sequence > ? AND sequence <= ? AND (? IS NULL OR sequence < ?) AND (? IS NULL OR payload_kind = ?)
      ORDER BY sequence ${descending ? "DESC" : "ASC"} LIMIT ?`,
        after,
        through,
        before,
        before,
        kind,
        kind,
        request.limit,
      )
      .toArray();
    if (descending) rows.reverse();
    const sequences = rows.map((row) => Number(row["sequence"]));
    return {
      items: sequences.map((sequence) => this.at(sequence)!),
      pageInfo: channelEnvelopePageInfo(
        request,
        {
          totalCount: Number(stats["total"]),
          ...(stats["first"] === null
            ? {}
            : { firstSeq: Number(stats["first"]) }),
          ...(stats["last"] === null ? {} : { lastSeq: Number(stats["last"]) }),
        },
        sequences,
      ),
    };
  }

  /**
   * A fork's local ledger state. The versioned prefix came with the fork (it was
   * taken at a commit, so it ends at the fork point); the local state row did
   * not, so its head is read from the events and observation starts over.
   */
  initializeClone(): void {
    const head = Number(
      this.sql.exec(`SELECT COALESCE(MAX(sequence), 0) AS head FROM channel_ledger_events`).toArray()[0]?.["head"] ?? 0,
    );
    this.boundaryEnvelopeId(head);
    this.sql.exec(
      `INSERT OR REPLACE INTO channel_ledger_state
         (singleton, head_sequence, observed_sequence, parent_channel_id,
          parent_sequence, root_observed, parent_observed)
       VALUES (1, ?, 0, NULL, NULL, 0, 1)`,
      head,
    );
  }

  /**
   * The fork records its parent: the immutable prefix it was taken at. The
   * ledger already ends there (the fork was a copy at the commit that appended
   * the fork point), so this only names the parent and makes its observation
   * pending.
   */
  adoptParent(parentChannelId: string, throughSequence: number): void {
    this.transaction(() => {
      const state = this.state();
      if (state["parent_channel_id"] !== null) {
        if (
          state["parent_channel_id"] !== parentChannelId ||
          Number(state["parent_sequence"]) !== throughSequence
        )
          throw new Error("Channel fork changed its immutable parent prefix");
        return;
      }
      if (this.headSequence() !== throughSequence)
        throw new Error("Channel fork does not end at the requested canonical prefix");
      this.boundaryEnvelopeId(throughSequence);
      this.sql.exec(
        `UPDATE channel_ledger_state SET observed_sequence = 0,
           parent_channel_id = ?, parent_sequence = ?, parent_observed = 0 WHERE singleton = 1`,
        parentChannelId,
        throughSequence,
      );
    });
  }

  peekObservation(): ChannelObservation | null {
    const state = this.state();
    if (Number(state["parent_observed"]) === 0)
      return {
        kind: "fork",
        parentChannelId: String(state["parent_channel_id"]),
        throughSequence: Number(state["parent_sequence"]),
        parentEnvelopeId: this.boundaryEnvelopeId(Number(state["parent_sequence"])),
      };
    if (
      Number(state["root_observed"]) === 0 &&
      Number(state["head_sequence"]) === 0
    )
      return { kind: "root" };
    const next = Number(state["observed_sequence"]) + 1;
    if (next > Number(state["head_sequence"])) return null;
    const envelope = this.at(next);
    if (!envelope)
      throw new Error("Channel observation lost its canonical event");
    return { kind: "append", sequence: next, envelope };
  }

  markRootObserved(): void {
    this.transaction(() => {
      const state = this.state();
      if (
        Number(state["root_observed"]) !== 0 ||
        Number(state["parent_observed"]) !== 1
      )
        throw new Error(
          "Channel root observation changed its original obligation",
        );
      this.sql.exec(
        `UPDATE channel_ledger_state SET root_observed=1 WHERE singleton=1`,
      );
    });
  }

  /** Settle exactly the immutable prefix leased by the canonical host claim. */
  markObservedThrough(
    first: number,
    through: number,
    envelopeId: string,
  ): void {
    this.transaction(() => {
      const next = this.peekObservation();
      const last = this.at(through);
      if (
        !next ||
        next.kind !== "append" ||
        next.sequence !== first ||
        !Number.isSafeInteger(through) ||
        through < first ||
        !last ||
        String(last.envelopeId) !== envelopeId
      )
        throw new Error("Channel observation receipt changed its owned prefix");
      this.sql.exec(
        `UPDATE channel_ledger_state SET observed_sequence=?,root_observed=1 WHERE singleton=1`,
        through,
      );
    });
  }

  markForkObserved(
    parentChannelId: string,
    throughSequence: number,
    parentEnvelopeId: string | null,
  ): void {
    this.transaction(() => {
      const next = this.peekObservation();
      if (
        !next ||
        next.kind !== "fork" ||
        next.parentChannelId !== parentChannelId ||
        next.throughSequence !== throughSequence ||
        next.parentEnvelopeId !== parentEnvelopeId
      )
        throw new Error("Channel fork observation changed its original prefix");
      this.sql.exec(
        `UPDATE channel_ledger_state SET parent_observed = 1, root_observed = 1, observed_sequence = ? WHERE singleton = 1`,
        throughSequence,
      );
    });
  }
}
