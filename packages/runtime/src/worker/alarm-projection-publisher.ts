/** Publishes one host alarm slot in request order. Acknowledged projections
 * are disposable knowledge: alarm delivery and lifecycle transitions discard
 * them, so reopening always repairs the host projection from domain state. */
export class AlarmProjectionPublisher {
  private acknowledged: number | null | undefined;
  private epoch = 0;
  private tail: Promise<void> = Promise.resolve();
  private pending?: { wakeAt: number | null; epoch: number; promise: Promise<void> };

  constructor(private readonly write: (wakeAt: number | null) => Promise<void>) {}

  invalidate(): void {
    this.epoch += 1;
    this.acknowledged = undefined;
  }

  publish(wakeAt: number | null): Promise<void> {
    const epoch = this.epoch;
    if (this.pending?.epoch === epoch && this.pending.wakeAt === wakeAt)
      return this.pending.promise;
    const promise = this.tail.then(async () => {
      if (epoch === this.epoch && this.acknowledged === wakeAt) return;
      try {
        await this.write(wakeAt);
        if (epoch === this.epoch) this.acknowledged = wakeAt;
      } catch (error) {
        // A lost acknowledgement cannot establish what the host retained.
        if (epoch === this.epoch) this.acknowledged = undefined;
        throw error;
      }
    });
    const pending = { wakeAt, epoch, promise };
    this.pending = pending;
    // Retain the original rejection for each invocation's owned drain; a
    // failed publication must not strand a later explicitly requested write.
    this.tail = promise.then(
      () => { if (this.pending === pending) this.pending = undefined; },
      () => { if (this.pending === pending) this.pending = undefined; },
    );
    return promise;
  }
}
