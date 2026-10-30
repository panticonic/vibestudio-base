import { canonicalJson, sha256HexSyncText } from "@vibestudio/content-addressing";
import {
  channelSubscriptionQueuingStrategy,
  encodeChannelSubscriptionRecord,
  enqueueChannelSubscriptionBytes,
} from "@vibestudio/service-schemas/channel";
import {
  DurableObjectBase,
  rpc,
  type DurableObjectContext,
  type LifecyclePrepareInput,
} from "@workspace/runtime/worker/kernel";
import {
  NATLANG_LIST_LIMIT_DEFAULT,
  natlangAnnotateInputSchema,
  natlangBeginInputSchema,
  natlangDiscardInputSchema,
  natlangFeedbackInputSchema,
  natlangGetCallInputSchema,
  natlangGetValueInputSchema,
  natlangImportExamplesInputSchema,
  natlangListCallsFilterSchema,
  natlangProgressInputSchema,
  natlangPublishLiveInputSchema,
  natlangRecordInputSchema,
  natlangSubscribeLiveInputSchema,
  natlangTuneExamplesInputSchema,
  natlangUnsubscribeLiveInputSchema,
  type Annotation,
  type CallDetail,
  type CallRecordJson,
  type CallSummary,
  type NatlangAnnotateInput,
  type NatlangBeginInput,
  type NatlangDiscardInput,
  type NatlangFeedbackInput,
  type NatlangFeedbackResult,
  type NatlangGetCallInput,
  type NatlangGetValueInput,
  type NatlangImportExamplesInput,
  type NatlangListCallsFilter,
  type NatlangLiveDelivery,
  type NatlangLiveFilter,
  type NatlangProgressInput,
  type NatlangPublishLiveInput,
  type NatlangRecordInput,
  type NatlangRecordResult,
  type NatlangRecordsRpc,
  type NatlangTuneExamplesInput,
  type NatlangTuneExamplesResult,
  type NatlangUnsubscribeLiveInput,
  type TuneExample,
} from "@workspace/natlang-records/contract";

/**
 * Size bound of the stored blob bytes (values, event streams, record documents).
 * When a write takes the store over it, the oldest unpinned data is evicted
 * until it is back under 90% of the bound: event streams first, then whole
 * finished calls. Like natlang's own store (`maxStoreBytes`) this is a size
 * bound, never a time limit. Pinned calls (annotated, so carrying feedback)
 * are kept and may hold the store above the bound.
 */
export const NATLANG_RECORDS_BLOB_BUDGET_BYTES = 256 * 1024 * 1024;

const EVICTION_CHUNK = 64;

const WEBSITE_CLOSED = {
  kind: "closed",
  reason:
    "Natlang records hold a workspace's program inputs, outputs and traces; they are not exposed to websites.",
} as const;

type Row = Record<string, unknown>;

interface LiveSubscriber {
  readonly callerId: string;
  readonly filter: NatlangLiveFilter;
  readonly controller: ReadableStreamDefaultController<Uint8Array>;
}

const SUMMARY_COLUMNS = `call_id, parent_call_id, definition_id, definition_name, definition_key, definition_source,
  executor, model_id, outcome, started_at, wall_ms, tokens_in, tokens_out, approach_hash, program_root, audit_of,
  run_label, owner_kind, owner_key, agent_ref, channel_id, run_id`;

const textEncoder = new TextEncoder();
const byteLength = (text: string): number => textEncoder.encode(text).length;

/**
 * The natlang records service: `natlang.calls/1` call records, their
 * content-addressed values and event streams, and tester feedback, kept per
 * workspace in DO SQLite, scoped by owner columns. It also fans live events out
 * to subscribers; live events are never stored (the trace is the record).
 *
 * Authority: every method admits host, user, code, session and mission (an
 * agent's eval is `code`/`session`; missions run programs too) and is closed to
 * websites. All methods are `open`: the service holds telemetry and feedback
 * the workspace's own programs produced and spends nothing. Reads and writes
 * are told apart by `sensitivity`, as for the model gateway; unlike the
 * gateway's `inspectTurns`, reads must be open to code, because agents read
 * their own call traces.
 */
export class NatlangRecordsDO
  extends DurableObjectBase
  implements NatlangRecordsRpc
{
  static override schemaVersion = 1;

  /** Live subscribers of this activation: their response streams are the subscriptions. */
  private readonly live = new Map<string, LiveSubscriber>();
  /** Sum of `blobs.bytes`, read once per activation and then maintained. */
  private blobBytes: number | null = null;

  constructor(ctx: DurableObjectContext, env: unknown) {
    super(ctx, env);
  }

  protected createTables(): void {
    this.sql.exec(`
      CREATE TABLE blobs (
        hash TEXT PRIMARY KEY,
        bytes INTEGER NOT NULL,
        text TEXT NOT NULL
      );
      CREATE TABLE calls (
        call_id TEXT PRIMARY KEY,
        parent_call_id TEXT,
        parent_action_index INTEGER,
        task_id TEXT,
        program_id TEXT,
        program_root TEXT,
        definition_id TEXT NOT NULL,
        definition_name TEXT NOT NULL,
        definition_source TEXT,
        definition_key TEXT NOT NULL,
        interface_hash TEXT,
        site TEXT,
        executor TEXT NOT NULL,
        model_id TEXT,
        outcome TEXT NOT NULL,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        wall_ms INTEGER,
        tokens_in INTEGER,
        tokens_out INTEGER,
        model_requests INTEGER,
        approach_hash TEXT,
        audit_of TEXT,
        record_hash TEXT,
        events_hash TEXT,
        run_label TEXT,
        owner_kind TEXT NOT NULL,
        owner_key TEXT NOT NULL,
        agent_ref TEXT,
        channel_id TEXT,
        run_id TEXT,
        pinned INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX calls_started ON calls(started_at);
      CREATE INDEX calls_definition ON calls(definition_id, started_at);
      CREATE INDEX calls_parent ON calls(parent_call_id);
      CREATE INDEX calls_run ON calls(run_id, started_at);
      CREATE INDEX calls_agent ON calls(agent_ref, started_at);
      CREATE INDEX calls_channel ON calls(channel_id, started_at);
      CREATE INDEX calls_owner ON calls(owner_key, started_at);
      CREATE TABLE call_blobs (
        call_id TEXT NOT NULL,
        hash TEXT NOT NULL,
        kind TEXT NOT NULL,
        PRIMARY KEY (call_id, hash, kind)
      );
      CREATE INDEX call_blobs_hash ON call_blobs(hash);
      CREATE TABLE annotations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        call_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        value TEXT NOT NULL,
        source TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX annotations_call ON annotations(call_id);
      CREATE TABLE tune_examples (
        program_root TEXT NOT NULL,
        function TEXT NOT NULL,
        input_key TEXT NOT NULL,
        line_json TEXT NOT NULL,
        protected INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (program_root, function, input_key)
      );
    `);
  }

  protected override requiredTables(): readonly string[] {
    return ["blobs", "calls", "call_blobs", "annotations", "tune_examples"];
  }

  /** The blob size bound; a seam so eviction is testable without 256 MiB. */
  protected blobBudgetBytes(): number {
    return NATLANG_RECORDS_BLOB_BUDGET_BYTES;
  }

  // ── Writes ────────────────────────────────────────────────────────────────

  /** A running row, so calls show in listings while they run; `record` replaces it. */
  @rpc({
    website: WEBSITE_CLOSED,
    principals: ["host", "user", "code", "session", "mission"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  async begin(input: NatlangBeginInput): Promise<void> {
    const row = natlangBeginInputSchema.parse(input);
    this.sql.exec(
      `INSERT OR IGNORE INTO calls (
         call_id, parent_call_id, parent_action_index, task_id, program_id, program_root,
         definition_id, definition_name, definition_source, definition_key, interface_hash, site,
         executor, model_id, outcome, started_at, audit_of, run_label,
         owner_kind, owner_key, agent_ref, channel_id, run_id
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'agent', ?, 'running', ?, ?, ?, ?, ?, ?, ?, ?)`,
      row.callId,
      row.parentCallId,
      row.parentActionIndex,
      row.taskId,
      row.programId,
      row.programRoot,
      row.definition.id,
      row.definition.name,
      row.definition.source,
      row.definition.key,
      row.definition.interface,
      row.definition.site,
      row.modelId,
      row.startedAt,
      row.auditOf,
      row.runLabel ?? null,
      row.owner.kind,
      row.owner.objectKey,
      row.owner.agentRef ?? null,
      row.owner.channelId ?? null,
      row.runId ?? null,
    );
  }

  /** The trace events so far of a running call, kept as its latest event stream. */
  @rpc({
    website: WEBSITE_CLOSED,
    principals: ["host", "user", "code", "session", "mission"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  async progress(input: NatlangProgressInput): Promise<void> {
    const { callId, events } = natlangProgressInputSchema.parse(input);
    const running = this.sql
      .exec(`SELECT events_hash FROM calls WHERE call_id = ? AND outcome = 'running'`, callId)
      .toArray()[0];
    // Progress for a call that is not running (already recorded, discarded) is stale.
    if (!running) return;
    const previous = running["events_hash"] as string | null;
    this.write(() => {
      const hash = this.putBlob(events);
      this.sql.exec(`UPDATE calls SET events_hash = ? WHERE call_id = ?`, hash, callId);
      this.sql.exec(`DELETE FROM call_blobs WHERE call_id = ? AND kind = 'events'`, callId);
      this.sql.exec(
        `INSERT OR IGNORE INTO call_blobs (call_id, hash, kind) VALUES (?, ?, 'events')`,
        callId,
        hash,
      );
      if (previous) this.collect([previous]);
    });
    this.evict();
  }

  /** Drop the row of a call that started and will not be recorded. */
  @rpc({
    website: WEBSITE_CLOSED,
    principals: ["host", "user", "code", "session", "mission"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  async discard(input: NatlangDiscardInput): Promise<void> {
    const { callId } = natlangDiscardInputSchema.parse(input);
    this.write(() => {
      if (!this.one(`SELECT 1 AS present FROM calls WHERE call_id = ? AND outcome = 'running'`, callId))
        return;
      this.deleteCall(callId);
    });
  }

  /** Store a finished call, replacing its running row. Idempotent per call ID. */
  @rpc({
    website: WEBSITE_CLOSED,
    principals: ["host", "user", "code", "session", "mission"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  async record(input: NatlangRecordInput): Promise<NatlangRecordResult> {
    const checked = natlangRecordInputSchema.parse(input);
    const record = checked.record as unknown as CallRecordJson;
    for (const [hash, text] of Object.entries(checked.blobs))
      if (sha256HexSyncText(text) !== hash)
        throw new Error(`Blob ${hash} is not the SHA-256 of its text`);
    this.write(() => {
      const callId = record.call_id;
      const prior = this.one(`SELECT pinned FROM calls WHERE call_id = ?`, callId);
      const priorBlobs = this.sql
        .exec(`SELECT hash FROM call_blobs WHERE call_id = ?`, callId)
        .toArray()
        .map((row) => row["hash"] as string);
      const values = Object.entries(checked.blobs).map(([hash, text]) => this.putBlob(text, hash));
      let eventsHash: string | null = null;
      let stored: CallRecordJson = record;
      if (checked.events !== undefined) {
        eventsHash = this.putBlob(checked.events);
        stored = {
          ...record,
          events: { complete: true, hash: eventsHash, bytes: byteLength(checked.events) },
        };
      }
      const recordHash = this.putBlob(JSON.stringify(stored));
      const { definition, cost } = record;
      this.sql.exec(
        `INSERT OR REPLACE INTO calls (
           call_id, parent_call_id, parent_action_index, task_id, program_id, program_root,
           definition_id, definition_name, definition_source, definition_key, interface_hash, site,
           executor, model_id, outcome, started_at, ended_at, wall_ms, tokens_in, tokens_out,
           model_requests, approach_hash, audit_of, record_hash, events_hash, run_label,
           owner_kind, owner_key, agent_ref, channel_id, run_id, pinned
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        callId,
        record.parent_call_id,
        record.parent_action_index,
        record.task_id,
        record.program_id,
        record.program_root,
        definition.id,
        definition.name,
        definition.source,
        definition.key,
        definition.interface,
        definition.site,
        record.executor.kind,
        record.executor.model_id,
        record.outcome,
        record.started_at,
        record.ended_at,
        cost.wall_ms,
        cost.tokens_in,
        cost.tokens_out,
        cost.model_requests,
        record.approach.hash,
        record.audit_of ?? null,
        recordHash,
        eventsHash,
        record.run_label ?? null,
        checked.owner.kind,
        checked.owner.objectKey,
        checked.owner.agentRef ?? null,
        checked.owner.channelId ?? null,
        checked.runId ?? null,
        prior ? (prior["pinned"] as number) : 0,
      );
      this.sql.exec(`DELETE FROM call_blobs WHERE call_id = ?`, callId);
      const link = (hash: string, kind: string) =>
        this.sql.exec(
          `INSERT OR IGNORE INTO call_blobs (call_id, hash, kind) VALUES (?, ?, ?)`,
          callId,
          hash,
          kind,
        );
      link(recordHash, "record");
      if (eventsHash) link(eventsHash, "events");
      for (const hash of values) link(hash, "value");
      this.collect(priorBlobs);
    });
    this.evict();
    return { recordId: record.call_id };
  }

  /** Attach evidence to a call. Annotated calls are pinned: eviction keeps them. */
  @rpc({
    website: WEBSITE_CLOSED,
    principals: ["host", "user", "code", "session", "mission"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  async annotate(input: NatlangAnnotateInput): Promise<void> {
    const checked = natlangAnnotateInputSchema.parse(input);
    if (!this.one(`SELECT 1 AS present FROM calls WHERE call_id = ?`, checked.callId))
      throw new Error(`No call ${checked.callId}`);
    this.annotateCall(checked.callId, checked.kind, checked.value, checked.source);
  }

  /**
   * A tester's verdict on a recorded call (natlang `traces good|bad|fix`). It is
   * annotated on the call; for a root `.nl` program call with a known expected
   * result it also becomes a tune example, stored here in `tune_examples`.
   * Differences from natlang's `recordFeedback`: no producer allowlist, no
   * filesystem (the worker never touches workspace files; the caller writes
   * `tuneExamples` into the program folder), and the default group names the
   * caller rather than the machine's user.
   */
  @rpc({
    website: WEBSITE_CLOSED,
    principals: ["host", "user", "code", "session", "mission"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  async feedback(input: NatlangFeedbackInput): Promise<NatlangFeedbackResult> {
    const checked = natlangFeedbackInputSchema.parse(input);
    const { callId, verdict } = checked;
    const record = this.readRecord(callId);
    if (!record)
      throw new Error(
        this.one(`SELECT 1 AS present FROM calls WHERE call_id = ?`, callId)
          ? `call ${callId} is still running; give feedback once it is recorded`
          : `no call ${callId}`,
      );
    const given = checked.expected !== undefined;
    if (verdict === "fix" && !given)
      throw new Error("a fix verdict needs expected, the right answer as JSON");
    this.annotateCall(
      callId,
      "feedback",
      { verdict, ...(given ? { expected: checked.expected } : {}) },
      "feedback",
    );
    const said = `annotated ${callId} as ${verdict}`;
    if (verdict === "bad" && !given)
      return {
        message: `${said}; no example appended (give the right answer as expected)`,
        example: null,
      };
    let built: { root: string; line: TuneExample };
    try {
      built = this.exampleOf(record, checked.group, verdict === "good" ? undefined : { value: checked.expected });
    } catch (error) {
      throw new Error(`${said}; not added as a tune example: ${(error as Error).message}`);
    }
    const stored = this.upsertExample(built.root, built.line);
    if (stored.status === "protected")
      throw new Error(
        `${said}; not added as a tune example: ${built.root} holds this input as a protected example; it is kept unchanged`,
      );
    const action =
      stored.status === "added"
        ? "appended to"
        : stored.status === "updated"
          ? "updated the expected result in"
          : "already in";
    return {
      message: `${said}; ${action} the tune examples of ${built.root} (group ${built.line.group})`,
      example: stored.line,
    };
  }

  /**
   * Seed the stored examples of a program from the text of its
   * `tune.examples.jsonl`, with the same upsert rules as feedback (protected
   * examples never change). This is how a protected example, which only the
   * program's own file can declare, enters the store.
   */
  @rpc({
    website: WEBSITE_CLOSED,
    principals: ["host", "user", "code", "session", "mission"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  async importExamples(
    input: NatlangImportExamplesInput,
  ): Promise<{ added: number; updated: number; unchanged: number }> {
    const { jsonl, program } = natlangImportExamplesInputSchema.parse(input);
    const lines = jsonl
      .split("\n")
      .filter((text) => text.trim())
      .map((text, index) => {
        let item: unknown;
        try {
          item = JSON.parse(text);
        } catch {
          throw new Error(`line ${index + 1} of the examples is not JSON`);
        }
        const line = item as Partial<TuneExample> | null;
        if (
          !line ||
          typeof line !== "object" ||
          typeof line.function !== "string" ||
          !line.input ||
          typeof line.input !== "object"
        )
          throw new Error(`line ${index + 1} of the examples needs a function and an input object`);
        return line as TuneExample;
      });
    const counts = { added: 0, updated: 0, unchanged: 0 };
    this.write(() => {
      for (const line of lines) {
        const { status } = this.upsertExample(program, line);
        counts[status === "protected" ? "unchanged" : status] += 1;
      }
    });
    return counts;
  }

  // ── Reads ─────────────────────────────────────────────────────────────────

  @rpc({
    website: WEBSITE_CLOSED,
    principals: ["host", "user", "code", "session", "mission"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "read",
  })
  async listCalls(filter: NatlangListCallsFilter): Promise<CallSummary[]> {
    const f = natlangListCallsFilterSchema.parse(filter ?? {});
    const where: string[] = [];
    const params: Array<string | number> = [];
    const add = (sql: string, ...values: Array<string | number>) => {
      where.push(sql);
      params.push(...values);
    };
    if (f.runId !== undefined) add("run_id = ?", f.runId);
    if (f.agentRef !== undefined) add("agent_ref = ?", f.agentRef);
    if (f.channelId !== undefined) add("channel_id = ?", f.channelId);
    if (f.ownerKey !== undefined) add("owner_key = ?", f.ownerKey);
    if (f.definition !== undefined)
      add(
        "(definition_id = ? OR definition_name = ? OR definition_source = ?)",
        f.definition,
        f.definition,
        f.definition,
      );
    if (f.outcome !== undefined) add("outcome = ?", f.outcome);
    if (f.since !== undefined) add("started_at >= ?", f.since);
    if (f.parentCallId === null) where.push("parent_call_id IS NULL");
    else if (f.parentCallId !== undefined) add("parent_call_id = ?", f.parentCallId);
    if (!f.audits) where.push("audit_of IS NULL");
    if (f.after !== undefined) {
      const at = this.one(`SELECT started_at FROM calls WHERE call_id = ?`, f.after);
      if (at)
        add(
          "(started_at < ? OR (started_at = ? AND call_id < ?))",
          at["started_at"] as string,
          at["started_at"] as string,
          f.after,
        );
    }
    return this.sql
      .exec(
        `SELECT ${SUMMARY_COLUMNS} FROM calls ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
         ORDER BY started_at DESC, call_id DESC LIMIT ?`,
        ...params,
        f.limit ?? NATLANG_LIST_LIMIT_DEFAULT,
      )
      .toArray()
      .map((row) => row as unknown as CallSummary);
  }

  @rpc({
    website: WEBSITE_CLOSED,
    principals: ["host", "user", "code", "session", "mission"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "read",
  })
  async getCall(input: NatlangGetCallInput): Promise<CallDetail | null> {
    const { callId } = natlangGetCallInputSchema.parse(input);
    const row = this.one(`SELECT ${SUMMARY_COLUMNS}, record_hash, events_hash FROM calls WHERE call_id = ?`, callId);
    if (!row) return null;
    const recordHash = row["record_hash"] as string | null;
    const eventsHash = row["events_hash"] as string | null;
    const recordText = recordHash ? this.blob(recordHash) : null;
    const { record_hash: _record, events_hash: _events, ...summary } = row;
    return {
      record: recordText ? (JSON.parse(recordText) as CallRecordJson) : null,
      summary: summary as unknown as CallSummary,
      events: eventsHash ? this.blob(eventsHash) : null,
      annotations: this.sql
        .exec(`SELECT kind, value, source, created_at FROM annotations WHERE call_id = ? ORDER BY id`, callId)
        .toArray()
        .map((a) => ({
          kind: a["kind"] as string,
          value: JSON.parse(a["value"] as string) as unknown,
          source: a["source"] as string | null,
          created_at: a["created_at"] as string,
        })) satisfies Annotation[],
    };
  }

  /** The text of a stored value, event stream or record document by hash; null when evicted or unknown. */
  @rpc({
    website: WEBSITE_CLOSED,
    principals: ["host", "user", "code", "session", "mission"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "read",
  })
  async getValue(input: NatlangGetValueInput): Promise<string | null> {
    const { hash } = natlangGetValueInputSchema.parse(input);
    return this.blob(hash);
  }

  /** The stored tune examples as the text of `tune.examples.jsonl`, in the order they were added. */
  @rpc({
    website: WEBSITE_CLOSED,
    principals: ["host", "user", "code", "session", "mission"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "read",
  })
  async tuneExamples(input: NatlangTuneExamplesInput): Promise<NatlangTuneExamplesResult> {
    const { program } = natlangTuneExamplesInputSchema.parse(input ?? {});
    const rows = this.sql
      .exec(
        `SELECT line_json FROM tune_examples ${program === undefined ? "" : "WHERE program_root = ?"} ORDER BY rowid`,
        ...(program === undefined ? [] : [program]),
      )
      .toArray();
    return {
      jsonl: rows.length ? `${rows.map((row) => row["line_json"] as string).join("\n")}\n` : "",
      count: rows.length,
    };
  }

  // ── Live events ───────────────────────────────────────────────────────────

  /**
   * Subscribe the calling participant to published live events. The response
   * body is the subscription (the platform's channel-subscription framing): the
   * first record acknowledges with the subscription ID, then each delivery is a
   * record. Cancelling or losing the response ends the subscription, so a
   * subscriber that disconnects is dropped without any expiry.
   */
  @rpc({
    website: WEBSITE_CLOSED,
    principals: ["host", "user", "code", "session", "mission"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "read",
  })
  async subscribeLive(filter: NatlangLiveFilter): Promise<Response> {
    const checked = natlangSubscribeLiveInputSchema.parse(filter ?? {});
    const callerId = this.caller?.callerId;
    if (!callerId) throw new Error("Live subscriptions require an authenticated caller");
    const subscriptionId = crypto.randomUUID();
    const body = new ReadableStream<Uint8Array>(
      {
        start: (controller) => {
          this.live.set(subscriptionId, { callerId, filter: checked, controller });
          const ack = encodeChannelSubscriptionRecord({
            kind: "subscribed",
            result: { subscriptionId },
          });
          if (enqueueChannelSubscriptionBytes(controller, ack) !== "enqueued")
            throw new Error("Live subscription acknowledgement could not be queued");
        },
        cancel: () => {
          this.live.delete(subscriptionId);
        },
      },
      channelSubscriptionQueuingStrategy(),
    );
    return new Response(body, {
      headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" },
    });
  }

  /** Acknowledged end of the caller's own subscription; unknown or foreign IDs are no-ops. */
  @rpc({
    website: WEBSITE_CLOSED,
    principals: ["host", "user", "code", "session", "mission"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  async unsubscribeLive(input: NatlangUnsubscribeLiveInput): Promise<void> {
    const { subscriptionId } = natlangUnsubscribeLiveInputSchema.parse(input);
    const subscriber = this.live.get(subscriptionId);
    if (!subscriber || subscriber.callerId !== this.caller?.callerId) return;
    this.live.delete(subscriptionId);
    try {
      subscriber.controller.close();
    } catch {
      // Already terminal.
    }
  }

  /** Whether anything subscribes: the provider forwards live events only when true. */
  @rpc({
    website: WEBSITE_CLOSED,
    principals: ["host", "user", "code", "session", "mission"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "read",
  })
  async liveInterest(): Promise<{ subscribed: boolean }> {
    return { subscribed: this.live.size > 0 };
  }

  /** Deliver live events to the subscribers whose filter matches. Nothing is stored. */
  @rpc({
    website: WEBSITE_CLOSED,
    principals: ["host", "user", "code", "session", "mission"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  async publishLive(input: NatlangPublishLiveInput): Promise<{ delivered: number }> {
    const checked = natlangPublishLiveInputSchema.parse(input);
    if (this.live.size === 0 || checked.events.length === 0) return { delivered: 0 };
    const delivery: NatlangLiveDelivery = {
      owner: checked.owner,
      ...(checked.runId !== undefined ? { runId: checked.runId } : {}),
      events: checked.events as NatlangLiveDelivery["events"],
    };
    const bytes = encodeChannelSubscriptionRecord({ kind: "message", payload: delivery });
    let delivered = 0;
    for (const [subscriptionId, subscriber] of [...this.live]) {
      const { filter } = subscriber;
      if (
        (filter.runId !== undefined && filter.runId !== checked.runId) ||
        (filter.agentRef !== undefined && filter.agentRef !== checked.owner.agentRef) ||
        (filter.channelId !== undefined && filter.channelId !== checked.owner.channelId)
      )
        continue;
      let outcome: ReturnType<typeof enqueueChannelSubscriptionBytes> = "closed";
      try {
        outcome = enqueueChannelSubscriptionBytes(subscriber.controller, bytes);
      } catch {
        // A stream that cannot accept bytes is terminal.
      }
      if (outcome === "enqueued") {
        delivered += 1;
        continue;
      }
      // A subscriber that cannot keep up is ended with an error rather than
      // silently losing events; it can subscribe again.
      this.live.delete(subscriptionId);
      try {
        subscriber.controller.error(new Error(`Live subscription terminated: ${outcome}`));
      } catch {
        // Already terminal.
      }
    }
    return { delivered };
  }

  /** Retirement ends every subscription: subscribers see their stream finish. */
  protected override beginLifecycleRelease(_input: LifecyclePrepareInput): void {
    for (const subscriber of this.live.values()) {
      try {
        subscriber.controller.close();
      } catch {
        // Already terminal.
      }
    }
    this.live.clear();
  }

  // ── Storage ───────────────────────────────────────────────────────────────

  private one(query: string, ...bindings: unknown[]): Row | undefined {
    return this.sql.exec(query, ...bindings).toArray()[0];
  }

  /** Run storage changes as one commit. A failure rolls back, so the cached byte total is re-read. */
  private write<T>(body: () => T): T {
    try {
      return this.ctx.storage.transactionSync(body);
    } catch (error) {
      this.blobBytes = null;
      throw error;
    }
  }

  private storedBytes(): number {
    this.blobBytes ??= Number(
      this.sql.exec(`SELECT COALESCE(SUM(bytes), 0) AS n FROM blobs`).one()["n"],
    );
    return this.blobBytes;
  }

  /** Store `text` under its SHA-256 (unless it is already there); returns the hash. */
  private putBlob(text: string, hash = sha256HexSyncText(text)): string {
    if (!this.one(`SELECT 1 AS present FROM blobs WHERE hash = ?`, hash)) {
      const bytes = byteLength(text);
      const before = this.storedBytes();
      this.sql.exec(`INSERT INTO blobs (hash, bytes, text) VALUES (?, ?, ?)`, hash, bytes, text);
      this.blobBytes = before + bytes;
    }
    return hash;
  }

  private blob(hash: string): string | null {
    const row = this.one(`SELECT text FROM blobs WHERE hash = ?`, hash);
    return row ? (row["text"] as string) : null;
  }

  /** Delete the named blobs that no call references any more; returns the bytes freed. */
  private collect(hashes: readonly string[]): number {
    const before = this.storedBytes();
    let freed = 0;
    for (const hash of new Set(hashes)) {
      const orphan = this.one(
        `SELECT bytes FROM blobs WHERE hash = ?
         AND NOT EXISTS (SELECT 1 FROM call_blobs WHERE call_blobs.hash = blobs.hash)`,
        hash,
      );
      if (!orphan) continue;
      this.sql.exec(`DELETE FROM blobs WHERE hash = ?`, hash);
      freed += orphan["bytes"] as number;
    }
    this.blobBytes = before - freed;
    return freed;
  }

  /** Remove a call's row, annotations, links, and the blobs only it referenced. */
  private deleteCall(callId: string): void {
    const hashes = this.sql
      .exec(`SELECT hash FROM call_blobs WHERE call_id = ?`, callId)
      .toArray()
      .map((row) => row["hash"] as string);
    this.sql.exec(`DELETE FROM calls WHERE call_id = ?`, callId);
    this.sql.exec(`DELETE FROM call_blobs WHERE call_id = ?`, callId);
    this.sql.exec(`DELETE FROM annotations WHERE call_id = ?`, callId);
    this.collect(hashes);
  }

  /**
   * Bring the stored blob bytes back under the bound after a write took them
   * over it: event streams of unpinned calls first, oldest first, then whole
   * finished unpinned calls. Running calls keep their rows.
   */
  private evict(): void {
    const budget = this.blobBudgetBytes();
    if (this.storedBytes() <= budget) return;
    const target = Math.floor(budget * 0.9);
    const sweep = (select: string, release: (callId: string) => void): void => {
      while (this.storedBytes() > target) {
        const rows = this.sql.exec(select, EVICTION_CHUNK).toArray();
        if (!rows.length) return;
        this.write(() => {
          for (const row of rows) {
            if (this.storedBytes() <= target) break;
            release(row["call_id"] as string);
          }
        });
      }
    };
    sweep(
      `SELECT call_id FROM calls WHERE events_hash IS NOT NULL AND pinned = 0
       ORDER BY started_at ASC, call_id ASC LIMIT ?`,
      (callId) => {
        const hashes = this.sql
          .exec(`SELECT hash FROM call_blobs WHERE call_id = ? AND kind = 'events'`, callId)
          .toArray()
          .map((row) => row["hash"] as string);
        this.sql.exec(`UPDATE calls SET events_hash = NULL WHERE call_id = ?`, callId);
        this.sql.exec(`DELETE FROM call_blobs WHERE call_id = ? AND kind = 'events'`, callId);
        this.collect(hashes);
      },
    );
    sweep(
      `SELECT call_id FROM calls WHERE pinned = 0 AND outcome != 'running'
       ORDER BY started_at ASC, call_id ASC LIMIT ?`,
      (callId) => this.deleteCall(callId),
    );
  }

  // ── Feedback ──────────────────────────────────────────────────────────────

  private annotateCall(callId: string, kind: string, value: unknown, source?: string): void {
    this.write(() => {
      this.sql.exec(
        `INSERT INTO annotations (call_id, kind, value, source, created_at) VALUES (?, ?, ?, ?, ?)`,
        callId,
        kind,
        JSON.stringify(value),
        source ?? null,
        new Date().toISOString(),
      );
      this.sql.exec(`UPDATE calls SET pinned = 1 WHERE call_id = ?`, callId);
    });
  }

  private readRecord(callId: string): CallRecordJson | null {
    const row = this.one(`SELECT record_hash FROM calls WHERE call_id = ?`, callId);
    const text = row?.["record_hash"] ? this.blob(row["record_hash"] as string) : null;
    return text ? (JSON.parse(text) as CallRecordJson) : null;
  }

  private value(ref: unknown): unknown {
    const complete = ref as { complete?: boolean; hash?: string } | null | undefined;
    if (!complete?.complete || !complete.hash) return undefined;
    const text = this.blob(complete.hash);
    return text === null ? undefined : (JSON.parse(text) as unknown);
  }

  /** The default feedback group: one per tester and day, `feedback-<YYYYMMDD>-<hash of the tester>`. */
  private feedbackGroup(record: CallRecordJson, explicit?: string): string {
    if (explicit) return explicit;
    const caller = this.caller;
    const who = sha256HexSyncText(caller?.userId ?? caller?.callerId ?? "unknown").slice(0, 8);
    return `feedback-${record.started_at.slice(0, 10).replaceAll("-", "")}-${who}`;
  }

  /** The example a call gives, or the one sentence saying what is missing. */
  private exampleOf(
    record: CallRecordJson,
    group: string | undefined,
    expected: { value: unknown } | undefined,
  ): { root: string; line: TuneExample } {
    const { definition } = record;
    if (record.parent_call_id)
      throw new Error(`call ${record.call_id} ran inside ${record.parent_call_id}; give feedback on the root call`);
    if (record.audit_of)
      throw new Error(`call ${record.call_id} is an audit of ${record.audit_of}, not a program call`);
    if (!definition.source?.endsWith(".nl"))
      throw new Error(
        `the trace of ${definition.name} records no program .nl file (source ${definition.source ?? "none"}), so it names no tune root function`,
      );
    const root = record.program_root;
    if (!root) throw new Error("the trace records no program root");
    const input: Record<string, unknown> = {};
    for (const [name, ref] of Object.entries(record.inputs)) {
      if (!(ref as { complete?: boolean } | null)?.complete)
        throw new Error(
          `input ${name} of ${record.call_id} was not recorded completely (recording excludes or truncates it)`,
        );
      const value = this.value(ref);
      if (value === undefined)
        throw new Error(`input ${name} of ${record.call_id} is no longer in the store`);
      input[name] = value;
    }
    if (expected)
      return {
        root,
        line: {
          function: definition.source,
          input,
          expected: expected.value,
          group: this.feedbackGroup(record, group),
          producer: "tester",
        },
      };
    if (record.outcome !== "done")
      throw new Error(
        `call ${record.call_id} ended ${record.outcome}, so its output is not an expected result; give a fix verdict with expected`,
      );
    const output = record.output as { complete?: boolean } | null;
    if (!output?.complete)
      throw new Error(`the output of ${record.call_id} was not recorded completely; give a fix verdict with expected`);
    const result = this.value(output);
    if (result === undefined)
      throw new Error(`the output of ${record.call_id} is no longer in the store; give a fix verdict with expected`);
    return {
      root,
      line: {
        function: definition.source,
        input,
        expected: result,
        group: this.feedbackGroup(record, group),
        producer: record.executor.model_id ?? record.executor.kind,
      },
    };
  }

  /**
   * Add `line` to a program's stored examples, or replace the expected result of
   * the same (function, input) line (natlang `upsertExample`). Protected
   * examples never change.
   */
  private upsertExample(
    root: string,
    line: TuneExample,
  ): { status: "added" | "updated" | "unchanged" | "protected"; line: TuneExample } {
    const inputKey = canonicalJson([line.function, line.input]);
    const existing = this.one(
      `SELECT line_json, protected FROM tune_examples WHERE program_root = ? AND function = ? AND input_key = ?`,
      root,
      line.function,
      inputKey,
    );
    if (!existing) {
      this.sql.exec(
        `INSERT INTO tune_examples (program_root, function, input_key, line_json, protected) VALUES (?, ?, ?, ?, ?)`,
        root,
        line.function,
        inputKey,
        JSON.stringify(line),
        line.protected === true ? 1 : 0,
      );
      return { status: "added", line };
    }
    const item = JSON.parse(existing["line_json"] as string) as TuneExample;
    if (existing["protected"] === 1) return { status: "protected", line: item };
    if ("expected" in item && canonicalJson(item.expected) === canonicalJson(line.expected))
      return { status: "unchanged", line: item };
    const updated: TuneExample = {
      ...item,
      expected: line.expected,
      ...("producer" in line ? { producer: line.producer } : {}),
    };
    this.sql.exec(
      `UPDATE tune_examples SET line_json = ? WHERE program_root = ? AND function = ? AND input_key = ?`,
      JSON.stringify(updated),
      root,
      line.function,
      inputKey,
    );
    return { status: "updated", line: updated };
  }
}
