import { describe, expect, it, vi } from "vitest";
import { PublicationQueue } from "./publication-queue.js";
function gate() {
  let resolve!: () => void;
  const promise = new Promise<void>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}
describe("channel publication ownership", () => {
  it.each(["commit", "completion"] as const)("cancels a %s observer while preserving the owner's real work", async (phase) => {
    const queue = new PublicationQueue();
    const entered = gate();
    const release = gate();
    let finished = false;
    const receipt = queue.enqueue(
      async () => {
        if (phase === "commit") {
          entered.resolve();
          await release.promise;
        }
        return "prepared";
      },
      async () => "retained",
      async () => {
        if (phase === "completion") {
          entered.resolve();
          await release.promise;
        }
        finished = true;
      },
    );
    await entered.promise;
    const controller = new AbortController();
    const reason = new Error("Actual lifecycle cancellation");
    const observer = phase === "commit" ? queue.commitBarrier(controller.signal) : queue.drain(controller.signal);
    controller.abort(reason);
    await expect(observer).rejects.toBe(reason);
    expect(finished).toBe(false);
    expect((queue as unknown as { completionObservers: Set<unknown> }).completionObservers.size).toBe(0);
    const actualRelease = queue.drain();
    release.resolve();
    await receipt;
    await actualRelease;
    expect(finished).toBe(true);
  });

  it("admits ordered live events while the first retention is still blocked", async () => {
    const queue = new PublicationQueue();
    const retaining = gate();
    const release = gate();
    const secondLive = gate();
    const order: string[] = [];
    const first = queue.enqueue(
      async () => {
        order.push("live1");
        return 1;
      },
      async (value) => {
        retaining.resolve();
        await release.promise;
        order.push("retained1");
        return value;
      },
    );
    await retaining.promise;
    const second = queue.enqueue(
      async () => {
        order.push("live2");
        secondLive.resolve();
        return 2;
      },
      async (value) => {
        order.push("retained2");
        return value;
      },
    );
    await secondLive.promise;
    expect(order).toEqual(["live1", "live2"]);
    release.resolve();
    await expect(Promise.all([first, second])).resolves.toEqual([1, 2]);
    queue.seal();
    await queue.drain();
    expect(order).toEqual(["live1", "live2", "retained1", "retained2"]);
  });
  it("permits a live handler to publish and await a nested retained event", async () => {
    const queue = new PublicationQueue();
    const order: string[] = [];
    const parent = queue.enqueue(
      async () => "parent",
      async (value) => {
        order.push("parent retained");
        return value;
      },
      async () => {
        await queue.enqueue(
          async () => "nested",
          async (value) => {
            order.push("nested retained");
            return value;
          },
        );
        order.push("parent joined");
      },
    );
    await expect(parent).resolves.toBe("parent");
    await queue.drain();
    expect(order).toEqual([
      "parent retained",
      "nested retained",
      "parent joined",
    ]);
    queue.seal();
    await queue.drain();
  });

  it("releases a full admission backlog before joining nested receiver work", async () => {
    const queue = new PublicationQueue();
    const release = gate();
    const admitted = gate();
    let count = 0;
    const parents = Array.from({ length: 128 }, (_, index) => queue.enqueue(
      async () => {
        if (++count === 128) admitted.resolve();
        return index;
      },
      async (value) => {
        await release.promise;
        return value;
      },
      async () => {
        await queue.enqueue(async () => "nested", async (value) => value);
      },
    ));
    await admitted.promise;
    expect(queue.size).toBe(128);
    release.resolve();
    await Promise.all(parents);
    await queue.drain();
    expect(queue.size).toBe(0);
    queue.seal();
  });

  it("reports committed receipt before receiver completion and owns its failure", async () => {
    const queue = new PublicationQueue();
    const release = gate();
    const receiverFailure = new Error("recipient disconnected");
    await expect(queue.enqueue(async () => "live", async () => "retained", async () => {
      await release.promise;
      throw receiverFailure;
    })).resolves.toBe("retained");
    const draining = expect(queue.drain()).rejects.toBe(receiverFailure);
    release.resolve();
    await draining;
  });

  it("propagates the original retention failure and permits an explicit repair", async () => {
    const queue = new PublicationQueue();
    const original = new Error("journal disconnected");
    const started = gate();
    const release = gate();
    const receipt = queue.enqueue(
      async () => "live",
      async () => {
        started.resolve();
        await release.promise;
        throw original;
      },
    );
    const assertion = expect(receipt).rejects.toBe(original);
    await started.promise;
    const draining = expect(queue.drain()).rejects.toBe(original);
    release.resolve();
    await Promise.all([assertion, draining]);
    await expect(
      queue.enqueue(
        async () => "repair",
        async () => "retained",
      ),
    ).resolves.toBe("retained");
    queue.seal();
    const admit = vi.fn();
    await expect(queue.enqueue(admit, async () => null)).rejects.toThrow(
      "closing",
    );
    expect(admit).not.toHaveBeenCalled();
    await queue.drain();
  });
});
