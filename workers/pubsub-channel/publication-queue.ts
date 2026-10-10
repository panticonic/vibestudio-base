interface CompletionObserver {
  phase: "commit" | "completion";
  failed: boolean;
  failure: unknown;
  finish: (failed: boolean, failure?: unknown) => void;
}

/** Ordered preparation and canonical commitment owned by one channel activation. */
export class PublicationQueue {
  private admission: Promise<void> = Promise.resolve();
  private commitment: Promise<void> = Promise.resolve();
  private readonly pending = new Set<Promise<unknown>>();
  private readonly completions = new Set<Promise<void>>();
  private readonly completionObservers = new Set<CompletionObserver>();
  private completionFailure: unknown;
  private hasCompletionFailure = false;
  private sealed = false;
  private revision = 0;
  private readonly capacity = 128;

  async enqueue<Prepared, Receipt>(
    admit: () => Promise<Prepared>,
    commit: (prepared: Prepared) => Promise<Receipt>,
    complete?: (
      prepared: Prepared,
      outcome: PromiseSettledResult<Receipt>,
    ) => Promise<void>,
  ): Promise<Receipt> {
    while (this.pending.size >= this.capacity) {
      const oldest = this.pending.values().next().value!;
      await oldest.then(
        () => undefined,
        () => undefined,
      );
    }
    if (this.sealed) throw new Error("Channel publication owner is closing");
    this.revision++;
    let resolve!: (value: Receipt) => void;
    let reject!: (error: unknown) => void;
    const receipt = new Promise<Receipt>((accept, fail) => {
      resolve = accept;
      reject = fail;
    });
    this.pending.add(receipt);
    const admitted = this.admission.then(admit);
    this.admission = admitted.then(
      () => undefined,
      () => undefined,
    );
    const committed = this.commitment.then(async () => commit(await admitted));
    this.commitment = committed.then(
      () => undefined,
      () => undefined,
    );
    // A publish receipt certifies commitment, never recipient application work.
    // Releasing capacity here lets live handlers publish their own committed events.
    void committed.then(resolve, reject);
    const completed = committed.then(
      async (value) => {
        await complete?.(await admitted, { status: "fulfilled", value });
      },
      async (reason) => {
        const original = await Promise.allSettled([admitted]);
        if (original[0]?.status === "fulfilled")
          await complete?.(original[0].value, { status: "rejected", reason });
      },
    );
    this.completions.add(completed);
    void completed.then(
      () => {
        this.completions.delete(completed);
        this.settleCompletionObservers();
      },
      (failure) => {
        // Canonical mailbox rows own recovery. Retain only the first original
        // error for release, never a growing activation-wide failure collection.
        if (!this.hasCompletionFailure) {
          this.hasCompletionFailure = true;
          this.completionFailure = failure;
        }
        this.completions.delete(completed);
        this.settleCompletionObservers(true, failure);
      },
    );
    void receipt.then(
      () => {
        this.pending.delete(receipt);
        this.settleCompletionObservers();
      },
      (failure) => {
        this.pending.delete(receipt);
        this.settleCompletionObservers(true, failure);
      },
    );
    return receipt;
  }

  get admissionRevision(): number {
    return this.revision;
  }

  get size(): number {
    return this.pending.size;
  }

  seal(): void {
    this.sealed = true;
  }

  /** Called only after the host authoritatively cancels preparation before release. */
  resume():void {
    this.sealed=false;
  }

  /** Stop admitting writes before capturing a stable owner history horizon. */
  commitBarrier(signal?: AbortSignal | null): Promise<void> {
    return this.observe("commit", signal);
  }

  /** Observe owned completion without transferring or cancelling its work. */
  drain(signal?: AbortSignal | null): Promise<void> {
    return this.observe("completion", signal);
  }

  private observe(phase: "commit" | "completion", signal?: AbortSignal | null): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let observer: CompletionObserver;
      const abort = () => observer.finish(true, signal!.reason);
      observer = {
        phase,
        failed: false,
        failure: undefined,
        finish: (failed, failure) => {
          this.completionObservers.delete(observer);
          signal?.removeEventListener("abort", abort);
          if (failed) reject(failure);
          else resolve();
        },
      };
      this.completionObservers.add(observer);
      if (signal?.aborted) {
        abort();
        return;
      }
      signal?.addEventListener("abort", abort, { once: true });
      this.settleCompletionObservers();
    });
  }

  private settleCompletionObservers(failed = false, failure?: unknown): void {
    for (const observer of this.completionObservers) {
      if (failed && !observer.failed) {
        observer.failed = true;
        observer.failure = failure;
      }
      if (this.pending.size !== 0 || (observer.phase === "completion" && this.completions.size !== 0)) continue;
      if (observer.failed) observer.finish(true, observer.failure);
      else if (observer.phase === "completion" && this.hasCompletionFailure) observer.finish(true, this.completionFailure);
      else observer.finish(false);
    }
  }
}
