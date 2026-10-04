/** One operation record owns its live body and deduplicates its settled outcome
 * until the original domain terminal is confirmed. A rejected outcome alone is
 * not a resource that can be cleaned up again. */
export class OwnedMethodCalls<T> {
  private released = false;
  private readonly calls = new Map<
    string,
    {
      identity: string;
      controller: AbortController;
      operation: Promise<T>;
      settled: boolean;
      terminal: boolean;
      isTerminal: () => Promise<boolean>;
    }
  >();

  run(
    key: string,
    identity: string,
    execute: (signal: AbortSignal) => Promise<T>,
    isTerminal: () => Promise<boolean>,
  ): Promise<T> {
    if (this.released)
      throw new Error("Method provider activation is released");
    const existing = this.calls.get(key);
    if (existing) {
      if (existing.identity !== identity)
        throw new Error(
          "Method call identity conflicts with its owned operation",
        );
      return existing.operation;
    }
    const controller = new AbortController();
    const operation = Promise.resolve().then(() => {
      controller.signal.throwIfAborted();
      return execute(controller.signal);
    });
    const call = {
      identity,
      controller,
      operation,
      settled: false,
      terminal: false,
      isTerminal,
    };
    this.calls.set(key, call);
    const settled = () => {
      call.settled = true;
      if (call.terminal && this.calls.get(key) === call) this.calls.delete(key);
    };
    void operation.then(settled, settled);
    return operation;
  }

  /** Delivery only prompts this read; original canonical domain truth retires
   * the cache. A terminal cannot make a still-running body unowned. */
  async observeTerminal(key: string): Promise<boolean> {
    const call = this.calls.get(key);
    if (!call) return false;
    const terminal = await call.isTerminal();
    if (terminal) {
      call.terminal = true;
      if (call.settled && this.calls.get(key) === call) this.calls.delete(key);
    }
    return terminal;
  }

  async cancel(key: string, reason: Error): Promise<void> {
    const call = this.calls.get(key);
    if (!call || call.settled) return;
    call.controller.abort(reason);
    try {
      await call.operation;
    } catch (error) {
      if (error !== call.controller.signal.reason) throw error;
    }
  }

  async release(reason: Error): Promise<void> {
    this.released = true;
    const outcomes = await Promise.allSettled(
      [...this.calls.keys()].map((key) => this.cancel(key, reason)),
    );
    // All bodies have joined. Domain resources retain their own exact cleanup
    // debt; completed provider outcomes no longer need activation-local dedup.
    this.calls.clear();
    const failures = outcomes
      .filter(
        (outcome): outcome is PromiseRejectedResult =>
          outcome.status === "rejected",
      )
      .map((outcome) => outcome.reason);
    if (failures.length === 1) throw failures[0];
    if (failures.length)
      throw new AggregateError(failures, "Method provider cleanup failed", {
        cause: failures[0],
      });
  }

  get size(): number {
    return this.calls.size;
  }
}
