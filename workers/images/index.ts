import { DurableObjectBase, rpc } from "@workspace/runtime/worker/kernel";
import {
  generateImage,
  type GenerateImageInput,
  type CodexSession,
} from "@workspace/harness/image-generation";
import {
  createCredentialClient,
  type StoredCredentialSummary,
} from "@vibestudio/credential-client";
import { canonicalJson, sha256Hex } from "@vibestudio/content-addressing";
import { IMAGE_REFERENCE_LIMIT } from "@workspace/runtime/images";
import type {
  ImageAsset,
  ImageGenerationRequest,
  ImageGenerationJob,
  ArtDirection,
  ArtDirectionRef,
} from "@workspace/runtime/images";

const TERMINAL = new Set(["succeeded", "failed", "cancelled"]);
const IMAGE_EXTENSION = "@workspace-extensions/image-service";
const text = (value: unknown, field: string): string => {
  if (typeof value !== "string" || !value.trim())
    throw new Error(`${field} must be a nonempty string`);
  return value;
};
const hash = (value: string) => sha256Hex(new TextEncoder().encode(value));
type StoredRequest = ImageGenerationRequest & { direction?: ArtDirection };
type Metadata = {
  mimeType: ImageAsset["mimeType"];
  width: number;
  height: number;
  byteLength: number;
};

/** Durable jobs own references; immutable asset descriptors never contain display URLs or bytes. */
export class ImagesDO extends DurableObjectBase {
  private readonly incarnation = crypto.randomUUID();
  private readonly mutations = new Map<string, Promise<unknown>>();
  private async serialized<T>(
    key: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const previous = this.mutations.get(key);
    const next = (
      previous ? previous.catch(() => undefined) : Promise.resolve()
    ).then(operation);
    this.mutations.set(key, next);
    try {
      return await next;
    } finally {
      if (this.mutations.get(key) === next) this.mutations.delete(key);
    }
  }
  private readonly active = new Map<
    string,
    { controller: AbortController; done: Promise<void> }
  >();

  protected createTables(): void {
    this.sql.exec(
      `CREATE TABLE image_jobs (id TEXT PRIMARY KEY, request_id TEXT UNIQUE NOT NULL, fingerprint TEXT NOT NULL, request_json TEXT NOT NULL, job_json TEXT NOT NULL, status TEXT NOT NULL, incarnation TEXT)`,
    );
    this.sql.exec(
      `CREATE TABLE image_assets (id TEXT PRIMARY KEY, asset_json TEXT NOT NULL, state TEXT NOT NULL, incarnation TEXT NOT NULL)`,
    );
    this.sql.exec(
      `CREATE TABLE image_owners (asset_id TEXT NOT NULL, owner TEXT NOT NULL, PRIMARY KEY(asset_id, owner))`,
    );
    this.sql.exec(
      `CREATE TABLE image_direction_heads (id TEXT PRIMARY KEY, version INTEGER NOT NULL)`,
    );
    this.sql.exec(
      `CREATE TABLE image_directions (id TEXT NOT NULL, version INTEGER NOT NULL, direction_json TEXT NOT NULL, state TEXT NOT NULL, incarnation TEXT NOT NULL, PRIMARY KEY(id, version))`,
    );
    this.sql.exec(
      `CREATE TABLE image_retention_effects (asset_id TEXT NOT NULL, owner TEXT NOT NULL, digest TEXT, PRIMARY KEY(asset_id,owner))`,
    );
  }
  protected override requiredTables(): readonly string[] {
    return [
      "image_jobs",
      "image_assets",
      "image_owners",
      "image_directions",
      "image_direction_heads",
      "image_retention_effects",
    ];
  }
  private retentionKey(assetId: string, owner: string): string {
    return hash(canonicalJson([assetId, JSON.parse(owner) as unknown]));
  }
  private jobOwner(id: string): string {
    return canonicalJson(["job", id]);
  }
  private appOwner(owner: string): string {
    return canonicalJson(["app", owner]);
  }
  private directionOwner(id: string, version: number): string {
    return canonicalJson(["art-direction", id, version]);
  }
  private saveJob(job: ImageGenerationJob): void {
    this.sql.exec(
      "UPDATE image_jobs SET job_json=?, status=?, incarnation=? WHERE id=?",
      JSON.stringify(job),
      job.status,
      this.incarnation,
      job.id,
    );
  }
  private storedRequest(id: string): StoredRequest {
    const row = this.sql
      .exec("SELECT request_json FROM image_jobs WHERE id=?", id)
      .toArray()[0];
    if (!row) throw new Error(`Unknown image job ${id}`);
    return JSON.parse(String(row["request_json"])) as StoredRequest;
  }
  private assetRow(id: string): { asset: ImageAsset; state: string } {
    const row = this.sql
      .exec("SELECT asset_json,state FROM image_assets WHERE id=?", id)
      .toArray()[0];
    if (!row) throw new Error(`Unknown image asset ${id}`);
    return {
      asset: JSON.parse(String(row["asset_json"])) as ImageAsset,
      state: String(row["state"]),
    };
  }
  private setOwnership(
    assetId: string,
    owner: string,
    digest: string | null,
  ): void {
    if (digest === null)
      this.sql.exec(
        "DELETE FROM image_owners WHERE asset_id=? AND owner=?",
        assetId,
        owner,
      );
    else
      this.sql.exec(
        "INSERT OR IGNORE INTO image_owners(asset_id,owner) VALUES (?,?)",
        assetId,
        owner,
      );
    this.sql.exec(
      "INSERT OR REPLACE INTO image_retention_effects(asset_id,owner,digest) VALUES (?,?,?)",
      assetId,
      owner,
      digest,
    );
  }
  private enqueueRelease(assetId: string, owner: string): void {
    this.setOwnership(assetId, owner, null);
  }
  /** Reconcile the CAS ownership projection. Intent is durable; bytes never enter the outbox. */
  private async reconcileAsset(id: string): Promise<void> {
    for (;;) {
      const row = this.sql
        .exec(
          "SELECT owner,digest FROM image_retention_effects WHERE asset_id=? ORDER BY digest IS NULL, owner LIMIT 1",
          id,
        )
        .toArray()[0];
      if (!row) return;
      const owner = String(row["owner"]);
      const digest = row["digest"] === null ? null : String(row["digest"]);
      const key = this.retentionKey(id, owner);
      if (digest === null) await this.releaseContent(key);
      else await this.retainContent(digest, key);
      // A retirement may replace desired state while the host operation is
      // awaited. Acknowledge only the exact projection we applied, then re-read.
      this.sql.exec(
        "DELETE FROM image_retention_effects WHERE asset_id=? AND owner=? AND digest IS ?",
        id,
        owner,
        digest,
      );
    }
  }
  private async reconcileRetentions(): Promise<void> {
    const rows = this.sql
      .exec("SELECT DISTINCT asset_id FROM image_retention_effects")
      .toArray();
    // Register recovery before any external call, including calls that fail.
    if (rows.length) this.setAlarm(20);
    for (const row of rows)
      await this.serialized(`asset:${String(row["asset_id"])}`, () =>
        this.reconcileAsset(String(row["asset_id"])),
      );
  }
  protected override nextAlarmAfterRequest():
    | { wakeAt: number }
    | null
    | undefined {
    const pending =
      this.sql
        .exec(
          "SELECT 1 FROM image_jobs WHERE status='queued' OR (status='running' AND incarnation<>?) LIMIT 1",
          this.incarnation,
        )
        .toArray().length ||
      this.sql.exec("SELECT 1 FROM image_retention_effects LIMIT 1").toArray()
        .length ||
      this.sql
        .exec("SELECT 1 FROM image_directions WHERE state='preparing' LIMIT 1")
        .toArray().length ||
      this.sql
        .exec("SELECT 1 FROM image_assets WHERE state='preparing' LIMIT 1")
        .toArray().length;
    if (pending) return { wakeAt: Date.now() + 20 };
    // Preserve the driver-owned in-flight alarm. A current generation already
    // owns progress; polling its status must not create a second wake loop.
    return this.active.size > 0 ? undefined : null;
  }
  override async alarm(): Promise<{ wakeAt: number } | null> {
    await super.alarm();
    for (const row of this.sql
      .exec(
        "SELECT direction_json FROM image_directions WHERE state='preparing' AND incarnation<>?",
        this.incarnation,
      )
      .toArray())
      this.removeDirection(
        JSON.parse(String(row["direction_json"])) as ArtDirection,
      );
    // A provider request interrupted by process loss is not automatically billed again.
    for (const row of this.sql
      .exec(
        "SELECT id FROM image_jobs WHERE status='running' AND incarnation<>?",
        this.incarnation,
      )
      .toArray()) {
      const job = await this.getJob(String(row["id"]));
      const outputId = `image:${hash(`${job.id}:${job.attempt}`)}`;
      this.ctx.storage.transactionSync(() =>
        this.enqueueRelease(outputId, this.jobOwner(job.id)),
      );
      this.saveJob({
        ...job,
        status: "failed",
        error:
          "Generation was interrupted. Retry explicitly to start a new provider request.",
        updatedAt: Date.now(),
      });
    }
    for (const row of this.sql
      .exec(
        "SELECT id FROM image_assets WHERE state='preparing' AND incarnation<>?",
        this.incarnation,
      )
      .toArray()) {
      const id = String(row["id"]);
      this.ctx.storage.transactionSync(() => {
        for (const owner of this.sql
          .exec("SELECT owner FROM image_owners WHERE asset_id=?", id)
          .toArray())
          this.enqueueRelease(id, String(owner["owner"]));
        this.sql.exec("DELETE FROM image_assets WHERE id=?", id);
      });
    }
    await this.reconcileRetentions();
    const next = this.sql
      .exec(
        "SELECT id FROM image_jobs WHERE status='queued' ORDER BY rowid LIMIT 1",
      )
      .toArray()[0];
    if (next) await this.runJob(String(next["id"]));
    return this.nextAlarmAfterRequest() ?? null;
  }

  @rpc({
    website: {
      kind: "eligible",
      rationale:
        "Connected websites may request this bounded operation with the ordinary resource and disclosure grants.",
    },
    principals: ["host", "user", "code", "session", "mission", "website"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  async generate(request: ImageGenerationRequest): Promise<ImageGenerationJob> {
    return this.serialized(`request:${request.requestId}`, () =>
      this.enqueueGeneration(request),
    );
  }
  private async enqueueGeneration(
    request: ImageGenerationRequest,
  ): Promise<ImageGenerationJob> {
    text(request.requestId, "requestId");
    text(request.prompt, "prompt");
    if (request.prompt.length > 64_000 || request.requestId.length > 256)
      throw new Error("Image request exceeds the prompt or request-id limit");
    const fingerprint = hash(canonicalJson(request));
    const prior = this.sql
      .exec(
        "SELECT id,fingerprint FROM image_jobs WHERE request_id=?",
        request.requestId,
      )
      .toArray()[0];
    if (prior) {
      if (prior["fingerprint"] !== fingerprint)
        throw new Error(
          "requestId already belongs to a different image request",
        );
      return this.getJob(String(prior["id"]));
    }
    const direction = request.artDirection
      ? await this.getArtDirection(request.artDirection)
      : undefined;
    const references: ImageAsset[] = [];
    for (const asset of [
      ...(request.references ?? []),
      ...(direction?.references ?? []),
    ]) {
      if (!references.some((existing) => existing.id === asset.id))
        references.push(await this.getAsset(asset.id));
    }
    if (references.length > IMAGE_REFERENCE_LIMIT)
      throw new Error(
        "An image request accepts at most sixteen reference images",
      );
    const now = Date.now();
    const id = `image-job:${hash(request.requestId)}`;
    const job: ImageGenerationJob = {
      id,
      requestId: request.requestId,
      status: "queued",
      attempt: 1,
      createdAt: now,
      updatedAt: now,
    };
    const stored: StoredRequest = {
      ...request,
      references,
      ...(direction ? { direction } : {}),
    };
    // Job and its entire input ownership closure are one local commit. No
    // continuation may acquire new roots after cancellation or retirement.
    this.ctx.storage.transactionSync(() => {
      this.sql.exec(
        "INSERT INTO image_jobs(id,request_id,fingerprint,request_json,job_json,status,incarnation) VALUES (?,?,?,?,?,?,?)",
        id,
        request.requestId,
        fingerprint,
        JSON.stringify(stored),
        JSON.stringify(job),
        job.status,
        this.incarnation,
      );
      for (const asset of references)
        this.setOwnership(asset.id, this.jobOwner(id), asset.digest);
    });
    this.setAlarm(20);
    try {
      await this.reconcileRetentions();
    } catch (error) {
      const row = this.sql
        .exec("SELECT job_json FROM image_jobs WHERE id=?", id)
        .toArray()[0];
      if (row) {
        const current = JSON.parse(
          String(row["job_json"]),
        ) as ImageGenerationJob;
        if (current.status === "queued" && current.attempt === job.attempt)
          this.saveJob({
            ...current,
            status: "failed",
            error: this.errorMessage(error),
            updatedAt: Date.now(),
          });
      }
    }
    return this.getJob(id);
  }
  @rpc({
    website: {
      kind: "eligible",
      rationale:
        "Connected websites may request this bounded operation with the ordinary resource and disclosure grants.",
    },
    principals: ["host", "user", "code", "session", "mission", "website"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "read",
  })
  async getJob(id: string): Promise<ImageGenerationJob> {
    return this.readJob(id);
  }
  private readJob(id: string): ImageGenerationJob {
    const row = this.sql
      .exec("SELECT job_json FROM image_jobs WHERE id=?", text(id, "job id"))
      .toArray()[0];
    if (!row) throw new Error(`Unknown image job ${id}`);
    return JSON.parse(String(row["job_json"])) as ImageGenerationJob;
  }
  @rpc({
    website: {
      kind: "eligible",
      rationale:
        "Connected websites may request this bounded operation with the ordinary resource and disclosure grants.",
    },
    principals: ["host", "user", "code", "session", "mission", "website"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  async cancel(id: string): Promise<ImageGenerationJob> {
    const job = this.readJob(id);
    if (TERMINAL.has(job.status)) {
      const active = this.active.get(id);
      if (active) {
        await active.done;
        await this.reconcileRetentions();
      }
      return job;
    }
    const cancelled: ImageGenerationJob = {
      ...job,
      status: "cancelled",
      updatedAt: Date.now(),
    };
    this.saveJob(cancelled);
    const active = this.active.get(id);
    active?.controller.abort(new Error("Image generation cancelled"));
    if (active) {
      await active.done;
      await this.reconcileRetentions();
    }
    return cancelled;
  }
  @rpc({
    website: {
      kind: "eligible",
      rationale:
        "Connected websites may request this bounded operation with the ordinary resource and disclosure grants.",
    },
    principals: ["host", "user", "code", "session", "mission", "website"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  async retry(id: string): Promise<ImageGenerationJob> {
    const job = this.readJob(id);
    if (!["failed", "cancelled"].includes(job.status))
      throw new Error("Only failed or cancelled image jobs can be retried");
    const { error: _error, asset: _asset, ...previous } = job;
    const retried: ImageGenerationJob = {
      ...previous,
      status: "queued",
      attempt: job.attempt + 1,
      updatedAt: Date.now(),
    };
    this.saveJob(retried);
    return retried;
  }
  @rpc({
    website: {
      kind: "eligible",
      rationale:
        "Connected websites may request this bounded operation with the ordinary resource and disclosure grants.",
    },
    principals: ["host", "user", "code", "session", "mission", "website"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  async forgetJob(id: string): Promise<void> {
    text(id, "job id");
    const active = this.active.get(id);
    this.ctx.storage.transactionSync(() => {
      const job = this.sql
        .exec("SELECT status FROM image_jobs WHERE id=?", id)
        .toArray()[0];
      if (job && !TERMINAL.has(String(job["status"])))
        throw new Error("Cancel an active image job before forgetting it");
      // The row can already be gone after an accepted request lost its reply. Its durable release debt still owns cleanup.
      for (const row of this.sql
        .exec(
          "SELECT asset_id FROM image_owners WHERE owner=?",
          this.jobOwner(id),
        )
        .toArray())
        this.enqueueRelease(String(row["asset_id"]), this.jobOwner(id));
      this.sql.exec("DELETE FROM image_jobs WHERE id=?", id);
    });
    await active?.done;
    await this.reconcileRetentions();
  }
  @rpc({
    website: {
      kind: "eligible",
      rationale:
        "Connected websites may request this bounded operation with the ordinary resource and disclosure grants.",
    },
    principals: ["host", "user", "code", "session", "mission", "website"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "read",
  })
  async getAsset(id: string): Promise<ImageAsset> {
    const row = this.assetRow(text(id, "asset id"));
    if (
      row.state !== "ready" ||
      !this.sql
        .exec("SELECT 1 FROM image_owners WHERE asset_id=? LIMIT 1", id)
        .toArray().length
    )
      throw new Error(`Image asset ${id} is not retained`);
    return row.asset;
  }
  @rpc({
    website: {
      kind: "eligible",
      rationale:
        "Connected websites may request this bounded operation with the ordinary resource and disclosure grants.",
    },
    principals: ["host", "user", "code", "session", "mission", "website"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "read",
  })
  async readAsset(id: string): Promise<{ asset: ImageAsset; base64: string }> {
    const asset = await this.getAsset(id);
    const base64 = await this.readContent(asset.digest);
    if (base64 === null)
      throw new Error(`Retained image content ${asset.digest} is missing`);
    return { asset, base64 };
  }
  @rpc({
    website: {
      kind: "eligible",
      rationale:
        "Connected websites may request this bounded operation with the ordinary resource and disclosure grants.",
    },
    principals: ["host", "user", "code", "session", "mission", "website"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  async importAsset(input: {
    base64: string;
    owner?: string;
  }): Promise<ImageAsset> {
    const id = sha256Hex(this.decode(input.base64));
    return this.serialized(`asset:image:${id}`, () =>
      this.importContent(input),
    );
  }
  private async importContent(input: {
    base64: string;
    owner?: string;
  }): Promise<ImageAsset> {
    const logicalOwner = input.owner ?? "import";
    text(logicalOwner, "owner");
    const owner = this.appOwner(logicalOwner);
    if (logicalOwner.length > 256)
      throw new Error("Image owner exceeds 256 characters");
    const bytes = this.decode(input.base64);
    const id = `image:${sha256Hex(bytes)}`;
    const existing = this.sql
      .exec("SELECT state FROM image_assets WHERE id=?", id)
      .toArray()[0];
    if (existing?.["state"] === "ready") {
      const asset = this.assetRow(id).asset;
      this.ctx.storage.transactionSync(() =>
        this.setOwnership(id, owner, asset.digest),
      );
      this.setAlarm(20);
      await this.storeContent(input.base64, this.retentionKey(id, owner));
      await this.reconcileAsset(id);
      return asset;
    }
    return this.storeAsset(id, input.base64, owner, {
      provider: "import",
      imageModel: "original",
      createdAt: Date.now(),
    });
  }
  @rpc({
    website: {
      kind: "eligible",
      rationale:
        "Connected websites may request this bounded operation with the ordinary resource and disclosure grants.",
    },
    principals: ["host", "user", "code", "session", "mission", "website"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  async retain(input: { assetId: string; owner: string }): Promise<void> {
    text(input.owner, "owner");
    if (input.owner.length > 256)
      throw new Error("Image owner exceeds 256 characters");
    await this.retainOwned(input.assetId, this.appOwner(input.owner));
  }
  private async retainOwned(assetId: string, owner: string): Promise<void> {
    await this.serialized(`asset:${assetId}`, async () => {
      const asset = await this.getAsset(assetId);
      this.ctx.storage.transactionSync(() =>
        this.setOwnership(asset.id, owner, asset.digest),
      );
      this.setAlarm(20);
      await this.reconcileAsset(asset.id);
    });
  }
  @rpc({
    website: {
      kind: "eligible",
      rationale:
        "Connected websites may request this bounded operation with the ordinary resource and disclosure grants.",
    },
    principals: ["host", "user", "code", "session", "mission", "website"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  async release(input: { assetId: string; owner: string }): Promise<void> {
    text(input.assetId, "assetId");
    text(input.owner, "owner");
    if (input.owner.length > 256)
      throw new Error("Image owner exceeds 256 characters");
    await this.releaseOwned(input.assetId, this.appOwner(input.owner));
  }
  private async releaseOwned(assetId: string, owner: string): Promise<void> {
    await this.serialized(`asset:${assetId}`, async () => {
      this.ctx.storage.transactionSync(() =>
        this.enqueueRelease(assetId, owner),
      );
      this.setAlarm(20);
      await this.reconcileAsset(assetId);
    });
  }
  @rpc({
    website: {
      kind: "eligible",
      rationale:
        "Connected websites may request this bounded operation with the ordinary resource and disclosure grants.",
    },
    principals: ["host", "user", "code", "session", "mission", "website"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  async putArtDirection(input: {
    id: string;
    brief: string;
    references?: ImageAsset[];
  }): Promise<ArtDirection> {
    text(input.id, "art direction id");
    if (input.id.length > 128)
      throw new Error("Art direction id exceeds 128 characters");
    return this.serialized(`direction:${input.id}`, () =>
      this.createDirection(input),
    );
  }
  private async createDirection(input: {
    id: string;
    brief: string;
    references?: ImageAsset[];
  }): Promise<ArtDirection> {
    text(input.id, "art direction id");
    text(input.brief, "art direction brief");
    if (input.brief.length > 64_000)
      throw new Error("Art direction brief exceeds 64000 characters");
    const references: ImageAsset[] = [];
    for (const asset of input.references ?? [])
      references.push(await this.getAsset(asset.id));
    const row = this.sql
      .exec("SELECT version FROM image_direction_heads WHERE id=?", input.id)
      .toArray()[0];
    const direction: ArtDirection = {
      id: input.id,
      version: Number(row?.["version"] ?? 0) + 1,
      brief: input.brief,
      references,
    };
    this.sql.exec(
      "INSERT OR REPLACE INTO image_direction_heads(id,version) VALUES (?,?)",
      direction.id,
      direction.version,
    );
    this.sql.exec(
      "INSERT INTO image_directions(id,version,direction_json,state,incarnation) VALUES (?,?,?,'preparing',?)",
      direction.id,
      direction.version,
      JSON.stringify(direction),
      this.incarnation,
    );
    this.setAlarm(20);
    try {
      for (const asset of references)
        await this.retainOwned(
          asset.id,
          this.directionOwner(direction.id, direction.version),
        );
      this.sql.exec(
        "UPDATE image_directions SET state='ready' WHERE id=? AND version=?",
        direction.id,
        direction.version,
      );
    } catch (error) {
      this.removeDirection(direction);
      throw error;
    }
    return direction;
  }
  @rpc({
    website: {
      kind: "eligible",
      rationale:
        "Connected websites may request this bounded operation with the ordinary resource and disclosure grants.",
    },
    principals: ["host", "user", "code", "session", "mission", "website"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "read",
  })
  async getArtDirection(ref: ArtDirectionRef): Promise<ArtDirection> {
    const row = this.sql
      .exec(
        "SELECT direction_json FROM image_directions WHERE id=? AND version=? AND state='ready'",
        ref.id,
        ref.version,
      )
      .toArray()[0];
    if (!row) throw new Error(`Unknown art direction ${ref.id}:${ref.version}`);
    return JSON.parse(String(row["direction_json"])) as ArtDirection;
  }
  @rpc({
    website: {
      kind: "eligible",
      rationale:
        "Connected websites may request this bounded operation with the ordinary resource and disclosure grants.",
    },
    principals: ["host", "user", "code", "session", "mission", "website"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  async deleteArtDirection(ref: ArtDirectionRef): Promise<void> {
    const direction = await this.getArtDirection(ref);
    this.removeDirection(direction);
    await this.reconcileRetentions();
  }
  private removeDirection(direction: ArtDirection): void {
    this.ctx.storage.transactionSync(() => {
      for (const asset of direction.references)
        this.enqueueRelease(
          asset.id,
          this.directionOwner(direction.id, direction.version),
        );
      this.sql.exec(
        "DELETE FROM image_directions WHERE id=? AND version=?",
        direction.id,
        direction.version,
      );
    });
    this.setAlarm(20);
  }
  private async runJob(id: string): Promise<void> {
    if (this.active.has(id)) return;
    // Reserve from the current row without yielding between its read and registration.
    const row = this.sql
      .exec("SELECT job_json FROM image_jobs WHERE id=?", id)
      .toArray()[0];
    if (!row) return;
    const job = JSON.parse(String(row["job_json"])) as ImageGenerationJob;
    if (job.status !== "queued" || this.active.has(id)) return;
    const controller = new AbortController();
    let finish!: () => void;
    let fail!: (error: unknown) => void;
    const done = new Promise<void>((resolve, reject) => {
      finish = resolve;
      fail = reject;
    });
    // The alarm owns execution; cancellation and retirement join that same invocation.
    done.catch(() => {});
    const active = { controller, done };
    this.active.set(id, active);
    try {
      await this.executeJob(job, controller);
      finish();
    } catch (error) {
      fail(error);
      throw error;
    } finally {
      if (this.active.get(id) === active) this.active.delete(id);
    }
  }
  private async executeJob(
    job: ImageGenerationJob,
    controller: AbortController,
  ): Promise<void> {
    const id = job.id;
    const outputId = `image:${hash(`${id}:${job.attempt}`)}`;
    try {
      this.saveJob({ ...job, status: "running", updatedAt: Date.now() });
      const request = this.storedRequest(id);
      const references = [];
      for (const asset of request.references ?? []) {
        const content = await this.readAsset(asset.id);
        references.push({
          base64: content.base64,
          mimeType: content.asset.mimeType,
        });
      }
      const generated = await this.generateContent(
        {
          ...request,
          prompt: request.direction
            ? `${request.direction.brief}\n\nScene request:\n${request.prompt}`
            : request.prompt,
          references,
        },
        id,
        controller.signal,
      );
      const current = await this.getJob(id);
      if (current.status !== "running" || current.attempt !== job.attempt)
        return;
      const asset = await this.serialized(`asset:${outputId}`, () =>
        this.storeAsset(outputId, generated.base64, this.jobOwner(id), {
          ...generated.provenance,
          createdAt: Date.now(),
          ...(request.artDirection
            ? { artDirection: request.artDirection }
            : {}),
        }),
      );
      const latest = await this.getJob(id);
      if (latest.status !== "running" || latest.attempt !== job.attempt) {
        await this.releaseOwned(asset.id, this.jobOwner(id));
        return;
      }
      this.saveJob({
        ...latest,
        status: "succeeded",
        asset,
        updatedAt: Date.now(),
      });
    } catch (error) {
      const current = this.sql
        .exec("SELECT job_json FROM image_jobs WHERE id=?", id)
        .toArray()[0];
      if (current) {
        const latest = JSON.parse(
          String(current["job_json"]),
        ) as ImageGenerationJob;
        if (latest.status === "running" && latest.attempt === job.attempt)
          this.saveJob({
            ...latest,
            status: "failed",
            error: this.errorMessage(error),
            updatedAt: Date.now(),
          });
      }
    } finally {
      const row = this.sql
        .exec("SELECT job_json FROM image_jobs WHERE id=?", id)
        .toArray()[0];
      const terminal = row
        ? (JSON.parse(String(row["job_json"])) as ImageGenerationJob)
        : null;
      if (terminal?.status !== "succeeded" || terminal.asset?.id !== outputId) {
        this.ctx.storage.transactionSync(() =>
          this.enqueueRelease(outputId, this.jobOwner(id)),
        );
      }
    }
  }
  private decode(base64: string): Uint8Array {
    if (typeof base64 !== "string")
      throw new Error("Image content must be canonical base64");
    const raw = atob(base64);
    if (btoa(raw) !== base64)
      throw new Error("Image content must be canonical base64");
    return Uint8Array.from(raw, (char) => char.charCodeAt(0));
  }
  private async storeAsset(
    id: string,
    base64: string,
    owner: string,
    provenance: ImageAsset["provenance"],
  ): Promise<ImageAsset> {
    const bytes = this.decode(base64);
    const metadata = await this.metadata(base64);
    if (
      !["image/png", "image/jpeg", "image/webp"].includes(metadata.mimeType) ||
      !(metadata.width > 0 && metadata.height > 0)
    )
      throw new Error("Generated content is not a supported decoded image");
    const asset: ImageAsset = {
      id,
      digest: sha256Hex(bytes),
      ...metadata,
      byteLength: bytes.length,
      provenance,
    };
    this.ctx.storage.transactionSync(() => {
      this.sql.exec(
        "INSERT OR REPLACE INTO image_assets(id,asset_json,state,incarnation) VALUES (?,?,'preparing',?)",
        id,
        JSON.stringify(asset),
        this.incarnation,
      );
      this.setOwnership(id, owner, asset.digest);
    });
    this.setAlarm(20);
    try {
      const stored = await this.storeContent(
        base64,
        this.retentionKey(id, owner),
      );
      if (stored.digest !== asset.digest || stored.size !== asset.byteLength)
        throw new Error(
          "Retained image store returned a different content identity",
        );
      this.ctx.storage.transactionSync(() => {
        this.sql.exec(
          "DELETE FROM image_retention_effects WHERE asset_id=? AND owner=?",
          id,
          owner,
        );
        this.sql.exec("UPDATE image_assets SET state='ready' WHERE id=?", id);
      });
    } catch (error) {
      this.ctx.storage.transactionSync(() => {
        this.enqueueRelease(id, owner);
        this.sql.exec("DELETE FROM image_assets WHERE id=?", id);
      });
      throw error;
    }
    await this.reconcileAsset(id);
    return asset;
  }
  private errorMessage(error: unknown): string {
    return (error instanceof Error ? error.message : String(error)).slice(
      0,
      2000,
    );
  }
  protected metadata(base64: string): Promise<Metadata> {
    return this.rpc.call("main", "extensions.invoke", [
      IMAGE_EXTENSION,
      "getMetadata",
      [base64],
    ]);
  }
  protected storeContent(
    base64: string,
    owner: string,
  ): Promise<{ digest: string; size: number }> {
    return this.rpc.call("main", "blobstore.putRetained", [{ base64, owner }]);
  }
  protected retainContent(digest: string, owner: string): Promise<void> {
    return this.rpc.call("main", "blobstore.retain", [{ digest, owner }]);
  }
  protected releaseContent(owner: string): Promise<void> {
    return this.rpc.call("main", "blobstore.releaseRetention", [{ owner }]);
  }
  protected readContent(digest: string): Promise<string | null> {
    return this.rpc.call("main", "blobstore.getBase64", [digest]);
  }
  protected async generateContent(
    input: GenerateImageInput,
    id: string,
    signal: AbortSignal,
  ): Promise<Awaited<ReturnType<typeof generateImage>>> {
    const session = await this.resolveSession(id);
    return generateImage(
      input,
      {
        session,
        detectMimeType: async (base64) =>
          (await this.metadata(base64)).mimeType,
      },
      signal,
    );
  }
  protected async resolveSession(id: string): Promise<CodexSession> {
    const credential = await this.rpc.call<StoredCredentialSummary | null>(
      "main",
      "credentials.resolveCredential",
      [{ url: "https://chatgpt.com/backend-api" }],
    );
    if (!credential)
      throw new Error(
        "Connect the OpenAI Codex provider before generating images",
      );
    const accountId =
      credential.accountIdentity?.providerUserId ??
      credential.metadata?.["accountId"];
    if (!accountId)
      throw new Error(
        "Reconnect the OpenAI Codex provider: account id is missing",
      );
    const client = createCredentialClient(this.rpc);
    return {
      model: "gpt-5.5",
      accountId,
      sessionId: id,
      fetcher: (url, init) =>
        client.fetch(url, init, { credentialId: credential.id }),
    };
  }
}
