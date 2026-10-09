import { describe, expect, it } from "vitest";
import { sha256Hex } from "@vibestudio/content-addressing";
import { createTestDO } from "@workspace/runtime/worker/test-utils";
import type { ImageAsset, ImageGenerationJob } from "@workspace/runtime/images";
import type { GenerateImageInput } from "@workspace/harness/image-generation";
import { ImagesDO } from "./index.js";

const BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
const bytes = (value: string) =>
  Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
function fixtureClass() {
  const content = new Map<string, string>();
  const roots = new Map<string, string>();
  let providerCalls = 0;
  let retaining: (owner: string) => Promise<void> = async () => {};
  let storing: (owner: string) => Promise<void> = async () => {};
  let releasing: (owner: string) => Promise<void> = async () => {};
  let provider: (
    input: GenerateImageInput,
    signal: AbortSignal,
  ) => Promise<string> = async () => BASE64;
  class TestImagesDO extends ImagesDO {
    protected override async persistAlarmSchedule(
      schedule: { wakeAt: number } | null,
    ): Promise<void> {
      if (schedule) this.ctx.storage.setAlarm(schedule.wakeAt);
    }
    protected override async metadata() {
      return {
        mimeType: "image/png" as const,
        width: 1,
        height: 1,
        byteLength: bytes(BASE64).length,
      };
    }
    protected override async storeContent(base64: string, owner: string) {
      const digest = sha256Hex(bytes(base64));
      content.set(digest, base64);
      roots.set(owner, digest);
      await storing(owner);
      return { digest, size: bytes(base64).length };
    }
    protected override async retainContent(digest: string, owner: string) {
      await retaining(owner);
      if (!content.has(digest)) throw new Error("missing blob");
      roots.set(owner, digest);
    }
    protected override async releaseContent(owner: string) {
      roots.delete(owner);
      await releasing(owner);
    }
    protected override async readContent(digest: string) {
      return content.get(digest) ?? null;
    }
    protected override async generateContent(
      input: GenerateImageInput,
      _id: string,
      signal: AbortSignal,
    ) {
      providerCalls += 1;
      return {
        base64: await provider(input, signal),
        mimeType: "image/png" as const,
        provenance: {
          provider: "openai-codex",
          responseModel: "fixture-model",
          imageModel: "gpt-image-2",
          responseId: undefined,
          imageId: undefined,
          revisedPrompt: undefined,
        },
      };
    }
  }
  return {
    TestImagesDO,
    content,
    roots,
    calls: () => providerCalls,
    setRetaining: (next: typeof retaining) => {
      retaining = next;
    },
    setStoring: (next: typeof storing) => {
      storing = next;
    },
    setReleasing: (next: typeof releasing) => {
      releasing = next;
    },
    setProvider: (next: typeof provider) => {
      provider = next;
    },
  };
}

describe("durable image jobs and assets", () => {
  it("joins retained release debt after a forget acknowledgement was lost and the job row is already gone", async () => {
    const fixture = fixtureClass();
    const first = await createTestDO(fixture.TestImagesDO);
    const job = await first.call<ImageGenerationJob>("generate", {
      requestId: "forget-lost-ack",
      prompt: "A ship",
    });
    await first.instance.alarm();
    const original = new Error("Original CAS release acknowledgement lost");
    let refused = true;
    fixture.setReleasing(async () => {
      if (refused) throw original;
    });
    await expect(first.call("forgetJob", job.id)).rejects.toThrow(
      original.message,
    );
    expect(first.sql.exec("SELECT * FROM image_jobs").toArray()).toEqual([]);
    expect(
      first.sql.exec("SELECT * FROM image_retention_effects").toArray(),
    ).toHaveLength(1);
    expect(fixture.roots.size).toBe(0);
    const reopened = await createTestDO(
      fixture.TestImagesDO,
      {},
      { db: first.db },
    );
    await expect(reopened.call("forgetJob", job.id)).rejects.toThrow(
      original.message,
    );
    expect(
      reopened.sql.exec("SELECT * FROM image_retention_effects").toArray(),
    ).toHaveLength(1);
    refused = false;
    await reopened.call("forgetJob", job.id);
    await reopened.call("forgetJob", job.id);
    expect(
      reopened.sql.exec("SELECT * FROM image_retention_effects").toArray(),
    ).toEqual([]);
    expect(reopened.sql.exec("SELECT * FROM image_owners").toArray()).toEqual(
      [],
    );
    expect(fixture.calls()).toBe(1);
  });

  it("refuses forgetting a live job and accepts exact repeated terminal cleanup without re-creating it", async () => {
    const fixture = fixtureClass();
    const host = await createTestDO(fixture.TestImagesDO);
    const job = await host.call<ImageGenerationJob>("generate", {
      requestId: "forget-live",
      prompt: "A lantern",
    });
    await expect(host.call("forgetJob", job.id)).rejects.toThrow(
      "Cancel an active image job",
    );
    expect(await host.call("getJob", job.id)).toMatchObject({
      status: "queued",
    });
    await host.call("cancel", job.id);
    await Promise.all([
      host.call("forgetJob", job.id),
      host.call("forgetJob", job.id),
    ]);
    await expect(host.call("getJob", job.id)).rejects.toThrow(
      "Unknown image job",
    );
    expect(
      host.sql.exec("SELECT * FROM image_retention_effects").toArray(),
    ).toEqual([]);
    expect(fixture.calls()).toBe(0);
  });

  it("maps maximally escaped logical owners to stable bounded CAS keys across restart", async () => {
    const fixture = fixtureClass();
    const host = await createTestDO(fixture.TestImagesDO);
    const owner = '\\"'.repeat(128);
    const asset = await host.call<ImageAsset>("importAsset", {
      base64: BASE64,
      owner,
    });
    const [key] = fixture.roots.keys();
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    const reopened = await createTestDO(
      fixture.TestImagesDO,
      {},
      { db: host.db },
    );
    await reopened.call("retain", { assetId: asset.id, owner });
    expect([...fixture.roots.keys()]).toEqual([key]);
    await reopened.call("release", { assetId: asset.id, owner });
    expect(fixture.roots.size).toBe(0);
  });

  it("atomically owns every input before admission awaits and releases all of them when forgotten", async () => {
    const fixture = fixtureClass();
    const host = await createTestDO(fixture.TestImagesDO);
    const first = await host.call<ImageAsset>("importAsset", {
      base64: BASE64,
    });
    const second = await host.call<ImageAsset>("importAsset", {
      base64: btoa(atob(BASE64) + "variant"),
    });
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    let resume!: () => void;
    const blocked = new Promise<void>((resolve) => {
      resume = resolve;
    });
    fixture.setRetaining(async () => {
      entered();
      await blocked;
    });
    const admission = host.call<ImageGenerationJob>("generate", {
      requestId: "forgotten-admission",
      prompt: "A harbor",
      references: [first, second],
    });
    const outcome = admission.then(
      () => null,
      (error: unknown) => error,
    );
    await started;
    const id = String(
      host.sql.exec("SELECT id FROM image_jobs").toArray()[0]!["id"],
    );
    await host.call("cancel", id);
    const retirement = host.call("forgetJob", id);
    resume();
    await Promise.all([outcome, retirement]);
    await host.instance.alarm();
    expect(host.sql.exec("SELECT * FROM image_jobs").toArray()).toEqual([]);
    expect(host.sql.exec("SELECT * FROM image_owners").toArray()).toHaveLength(
      2,
    );
    expect(
      host.sql.exec("SELECT * FROM image_retention_effects").toArray(),
    ).toEqual([]);
    expect(fixture.roots.size).toBe(2);
    expect(fixture.calls()).toBe(0);
  });

  it("keeps public application owner strings separate from internal job roots", async () => {
    const fixture = fixtureClass();
    const host = await createTestDO(fixture.TestImagesDO);
    const job = await host.call<ImageGenerationJob>("generate", {
      requestId: "owner-separation",
      prompt: "A harbor",
    });
    await host.instance.alarm();
    const result = await host.call<ImageGenerationJob>("getJob", job.id);
    await host.call("release", {
      assetId: result.asset!.id,
      owner: JSON.stringify(["job", job.id]),
    });
    await host.call("release", {
      assetId: result.asset!.id,
      owner: `job:${job.id}`,
    });
    expect(await host.call("getAsset", result.asset!.id)).toEqual(result.asset);
    expect(fixture.roots.size).toBe(1);
    await host.call("forgetJob", job.id);
    expect(fixture.roots.size).toBe(0);
  });

  it("serializes concurrent request replays while retaining references", async () => {
    const fixture = fixtureClass();
    const host = await createTestDO(fixture.TestImagesDO);
    const reference = await host.call<ImageAsset>("importAsset", {
      base64: BASE64,
    });
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    let resume!: () => void;
    const blocked = new Promise<void>((resolve) => {
      resume = resolve;
    });
    fixture.setRetaining(async () => {
      entered();
      await blocked;
    });
    const request = {
      requestId: "concurrent",
      prompt: "A lantern",
      references: [reference],
    };
    const first = host.call<ImageGenerationJob>("generate", request);
    await started;
    const second = host.call<ImageGenerationJob>("generate", request);
    resume();
    const [left, right] = await Promise.all([first, second]);
    expect(left).toEqual(right);
    expect(host.sql.exec("SELECT id FROM image_jobs").toArray()).toHaveLength(
      1,
    );
    await host.instance.alarm();
    expect(fixture.calls()).toBe(1);
  });

  it("keeps retry queued until the cancelled provider attempt has unwound", async () => {
    const fixture = fixtureClass();
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    let finish!: (value: string) => void;
    let abort!: () => void;
    const aborted = new Promise<void>((resolve) => {
      abort = resolve;
    });
    fixture.setProvider(async (_input, signal) => {
      signal.addEventListener("abort", abort, { once: true });
      entered();
      return new Promise<string>((resolve) => {
        finish = resolve;
      });
    });
    const host = await createTestDO(fixture.TestImagesDO);
    const job = await host.call<ImageGenerationJob>("generate", {
      requestId: "retry-inflight",
      prompt: "A boat",
    });
    const first = host.instance.alarm();
    await started;
    const cancellation = host.call("cancel", job.id);
    await aborted;
    await host.call("retry", job.id);
    expect(await host.instance.alarm()).toMatchObject({
      wakeAt: expect.any(Number),
    });
    expect(fixture.calls()).toBe(1);
    fixture.setProvider(async () => BASE64);
    finish(BASE64);
    await Promise.all([first, cancellation]);
    await host.instance.alarm();
    expect(await host.call("getJob", job.id)).toMatchObject({
      status: "succeeded",
      attempt: 2,
    });
    expect(fixture.calls()).toBe(2);
  });

  it("does not lose retirement intent when a cancelled job is forgotten during CAS storage", async () => {
    const fixture = fixtureClass();
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    let resume!: () => void;
    const blocked = new Promise<void>((resolve) => {
      resume = resolve;
    });
    fixture.setStoring(async () => {
      entered();
      await blocked;
    });
    let abort!: () => void;
    const aborted = new Promise<void>((resolve) => {
      abort = resolve;
    });
    fixture.setProvider(async (_input, signal) => {
      signal.addEventListener("abort", abort, { once: true });
      return BASE64;
    });
    const host = await createTestDO(fixture.TestImagesDO);
    const job = await host.call<ImageGenerationJob>("generate", {
      requestId: "forget-inflight",
      prompt: "A boat",
    });
    const running = host.instance.alarm();
    await started;
    const cancellation = host.call("cancel", job.id);
    await aborted;
    const forgotten = host.call("forgetJob", job.id);
    resume();
    await Promise.all([running, forgotten, cancellation]);
    await host.instance.alarm();
    expect(fixture.roots.size).toBe(0);
    expect(host.sql.exec("SELECT * FROM image_owners").toArray()).toEqual([]);
    expect(
      host.sql.exec("SELECT * FROM image_retention_effects").toArray(),
    ).toEqual([]);
  });

  it("hides failed art-direction publication and never reuses a deleted version", async () => {
    const fixture = fixtureClass();
    const host = await createTestDO(fixture.TestImagesDO);
    const reference = await host.call<ImageAsset>("importAsset", {
      base64: BASE64,
    });
    fixture.setRetaining(async () => {
      throw new Error("CAS retention failed");
    });
    await expect(
      host.call("putArtDirection", {
        id: "style",
        brief: "Copper etching",
        references: [reference],
      }),
    ).rejects.toThrow("CAS retention failed");
    await expect(
      host.call("getArtDirection", { id: "style", version: 1 }),
    ).rejects.toThrow("Unknown art direction");
    fixture.setRetaining(async () => {});
    await host.instance.alarm();
    expect(fixture.roots.size).toBe(1);
    const second = await host.call<{ id: string; version: number }>(
      "putArtDirection",
      {
        id: "style",
        brief: "Copper etching",
        references: [reference],
      },
    );
    expect(second.version).toBe(2);
    await host.call("deleteArtDirection", second);
    expect(
      await host.call("putArtDirection", {
        id: "style",
        brief: "Amber painting",
      }),
    ).toMatchObject({ version: 3 });
  });

  it("replays requests and reads retained output after a fresh durable-object incarnation", async () => {
    const fixture = fixtureClass();
    const first = await createTestDO(fixture.TestImagesDO);
    const queued = await first.call<ImageGenerationJob>("generate", {
      requestId: "scene:one",
      prompt: "A warm lantern in an engraving",
    });
    expect(queued.status).toBe("queued");
    await first.instance.alarm();
    const result = await first.call<ImageGenerationJob>("getJob", queued.id);
    expect(result.status).toBe("succeeded");
    expect(result.asset).toMatchObject({
      width: 1,
      height: 1,
      digest: sha256Hex(bytes(BASE64)),
      provenance: { imageModel: "gpt-image-2" },
    });
    const reopened = await createTestDO(
      fixture.TestImagesDO,
      {},
      { db: first.db },
    );
    expect(
      await reopened.call("generate", {
        requestId: "scene:one",
        prompt: "A warm lantern in an engraving",
      }),
    ).toEqual(result);
    expect(await reopened.call("readAsset", result.asset!.id)).toEqual({
      asset: result.asset,
      base64: BASE64,
    });
    expect(fixture.calls()).toBe(1);
    await expect(
      reopened.call("generate", {
        requestId: "scene:one",
        prompt: "A different image",
      }),
    ).rejects.toThrow("different image request");
    const durable = first.sql
      .exec("SELECT request_json,job_json FROM image_jobs")
      .toArray();
    expect(JSON.stringify(durable)).not.toContain(BASE64);
  });

  it("retains reference closure and versioned art direction across deletion until a job is forgotten", async () => {
    const fixture = fixtureClass();
    const host = await createTestDO(fixture.TestImagesDO);
    const reference = await host.call<ImageAsset>("importAsset", {
      base64: BASE64,
    });
    const direction = await host.call<{ id: string; version: number }>(
      "putArtDirection",
      {
        id: "etching",
        brief: "Copperplate lines, warm amber",
        references: [reference],
      },
    );
    const job = await host.call<ImageGenerationJob>("generate", {
      requestId: "scene:two",
      prompt: "A lighthouse",
      artDirection: direction,
    });
    await host.call("deleteArtDirection", direction);
    await host.call("release", { assetId: reference.id, owner: "import" });
    fixture.setProvider(async (input) => {
      expect(input.prompt).toContain("Copperplate lines, warm amber");
      expect(input.references).toEqual([
        { base64: BASE64, mimeType: "image/png" },
      ]);
      return BASE64;
    });
    await host.instance.alarm();
    const result = await host.call<ImageGenerationJob>("getJob", job.id);
    expect(result.status).toBe("succeeded");
    await host.call("retain", {
      assetId: result.asset!.id,
      owner: "app:chosen-scene",
    });
    await host.call("forgetJob", job.id);
    expect(await host.call("getAsset", result.asset!.id)).toEqual(result.asset);
    await expect(host.call("getAsset", reference.id)).rejects.toThrow(
      "not retained",
    );
    await host.call("release", {
      assetId: result.asset!.id,
      owner: "app:chosen-scene",
    });
    expect(fixture.roots.size).toBe(0);
  });

  it("cancels in-flight generation and fences a late provider result before explicit retry", async () => {
    const fixture = fixtureClass();
    let started!: () => void;
    const waiting = new Promise<void>((resolve) => {
      started = resolve;
    });
    let finish!: (value: string) => void;
    let abort!: () => void;
    const aborted = new Promise<void>((resolve) => {
      abort = resolve;
    });
    fixture.setProvider(async (_input, signal) => {
      signal.addEventListener("abort", abort, { once: true });
      started();
      const result = await new Promise<string>((resolve) => {
        finish = resolve;
      });
      expect(signal.aborted).toBe(true);
      return result;
    });
    const host = await createTestDO(fixture.TestImagesDO);
    const job = await host.call<ImageGenerationJob>("generate", {
      requestId: "scene:cancel",
      prompt: "A ship",
    });
    const generation = host.instance.alarm();
    await waiting;
    let settled = false;
    const cancellation = host
      .call<ImageGenerationJob>("cancel", job.id)
      .finally(() => {
        settled = true;
      });
    await aborted;
    expect(settled).toBe(false);
    finish(BASE64);
    expect((await cancellation).status).toBe("cancelled");
    await generation;
    expect(fixture.roots.size).toBe(0);
    fixture.setProvider(async () => BASE64);
    expect((await host.call<ImageGenerationJob>("retry", job.id)).attempt).toBe(
      2,
    );
    await host.instance.alarm();
    expect((await host.call<ImageGenerationJob>("getJob", job.id)).status).toBe(
      "succeeded",
    );
    expect(fixture.calls()).toBe(2);
  });

  it("marks an interrupted provider attempt failed after restart without silently generating twice", async () => {
    const fixture = fixtureClass();
    const host = await createTestDO(fixture.TestImagesDO);
    const job = await host.call<ImageGenerationJob>("generate", {
      requestId: "scene:crash",
      prompt: "A bridge",
    });
    host.sql.exec(
      "UPDATE image_jobs SET status='running', job_json=? WHERE id=?",
      JSON.stringify({ ...job, status: "running" }),
      job.id,
    );
    const restarted = await createTestDO(
      fixture.TestImagesDO,
      {},
      { db: host.db },
    );
    await restarted.instance.alarm();
    expect(await restarted.call("getJob", job.id)).toMatchObject({
      status: "failed",
      error: expect.stringContaining("interrupted"),
    });
    expect(fixture.calls()).toBe(0);
    await restarted.call("retry", job.id);
    await restarted.instance.alarm();
    expect(
      (await restarted.call<ImageGenerationJob>("getJob", job.id)).status,
    ).toBe("succeeded");
  });
});
