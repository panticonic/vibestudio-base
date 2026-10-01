/** Frame execution contexts follow Chromium's actual attachment/navigation lifecycle. */
export interface FrameTransport {
  send(method: string, params?: Record<string, unknown>): Promise<unknown>;
  on(method: string, listener: (params: unknown) => void): () => void;
  onClosed(listener: (error: Error) => void): () => void;
  onDisconnect(listener: (error: Error) => void): () => void;
  session(id: string): FrameTransport;
}
export type FrameContext = { channel: FrameTransport; contextId: number };
export class FrameRegistry {
  private readonly channels = new Set<FrameTransport>();
  private readonly channelListeners = new Set<
    (channel: FrameTransport) => void
  >();
  onChannel(listener: (channel: FrameTransport) => void): () => void {
    this.channelListeners.add(listener);
    for (const channel of this.channels) listener(channel);
    return () => {
      this.channelListeners.delete(listener);
    };
  }
  private readonly targetRoots = new Map<FrameTransport, string>();
  targetFrame(channel: FrameTransport): string | undefined {
    return this.targetRoots.get(channel);
  }
  private readonly contexts = new Map<string, FrameContext>();
  private readonly failures = new Map<string, Error>();
  private readonly changed = new Set<() => void>();
  private readonly subscriptions: Array<() => void> = [];
  constructor(private readonly root: FrameTransport) {
    this.track(root);
  }
  private notify(): void {
    for (const listener of this.changed) listener();
  }
  private track(channel: FrameTransport, targetId?: string): void {
    if (targetId) this.targetRoots.set(channel, targetId);
    this.channels.add(channel);
    for (const listener of this.channelListeners) listener(channel);
    const owned = new Map<number, string>();
    const clear = () => {
      for (const frameId of owned.values()) {
        if (this.contexts.get(frameId)?.channel === channel)
          this.contexts.delete(frameId);
      }
      owned.clear();
      this.notify();
    };
    this.subscriptions.push(
      channel.on("Runtime.executionContextCreated", (raw) => {
        const context = (
          raw as {
            context: {
              id: number;
              auxData?: { isDefault?: boolean; frameId?: string };
            };
          }
        ).context;
        const id = context.auxData?.frameId;
        if (id && context.auxData?.isDefault) {
          owned.set(context.id, id);
          this.failures.delete(id);
          this.contexts.set(id, { channel, contextId: context.id });
          this.notify();
        }
      }),
      channel.on("Runtime.executionContextDestroyed", (raw) => {
        const id = (raw as { executionContextId: number }).executionContextId;
        const frame = owned.get(id);
        owned.delete(id);
        if (
          frame &&
          this.contexts.get(frame)?.contextId === id &&
          this.contexts.get(frame)?.channel === channel
        )
          this.contexts.delete(frame);
        this.notify();
      }),
      channel.on("Runtime.executionContextsCleared", clear),
      channel.on("Page.frameDetached", (raw) => {
        const p = raw as { frameId: string; reason?: string };
        this.contexts.delete(p.frameId);
        if (p.reason !== "swap")
          this.failures.set(
            p.frameId,
            new Error(`Frame ${p.frameId} was detached`),
          );
        this.notify();
      }),
      channel.on("Target.attachedToTarget", (raw) => {
        const p = raw as {
          sessionId: string;
          targetInfo: { targetId: string; type: string };
        };
        if (p.targetInfo.type !== "iframe") return;
        const child = this.root.session(p.sessionId);
        this.track(child, p.targetInfo.targetId);
        void Promise.all([
          child.send("Runtime.enable"),
          child.send("DOM.enable"),
          child.send("Page.enable"),
          child.send("Network.enable"),
          this.autoAttach(child),
        ]).catch((error) => {
          this.failures.set(
            p.targetInfo.targetId,
            error instanceof Error ? error : new Error(String(error)),
          );
          this.notify();
        });
      }),
      channel.onClosed((error) => {
        clear();
        this.channels.delete(channel);
        this.targetRoots.delete(channel);
        if (targetId) {
          this.failures.set(targetId, error);
          this.notify();
        }
      }),
    );
  }
  /** Auto-attach only related iframe targets, never unrelated pages or browser-wide targets. */
  autoAttach(channel: FrameTransport = this.root): Promise<unknown> {
    return channel.send("Target.setAutoAttach", {
      autoAttach: true,
      waitForDebuggerOnStart: false,
      flatten: true,
      filter: [{ type: "iframe", exclude: false }, { exclude: true }],
    });
  }
  resolve(frameId: string): Promise<FrameContext> {
    return new Promise((resolve, reject) => {
      const cleanup: Array<() => void> = [];
      let settled = false;
      const finish = (context?: FrameContext, error?: Error) => {
        if (settled) return;
        settled = true;
        for (const release of cleanup) release();
        if (error) reject(error);
        else resolve(context!);
      };
      const observe = () => {
        const error = this.failures.get(frameId),
          context = this.contexts.get(frameId);
        if (error) finish(undefined, error);
        else if (context) finish(context);
      };
      this.changed.add(observe);
      cleanup.push(() => this.changed.delete(observe));
      const release = this.root.onDisconnect((error) =>
        finish(undefined, error),
      );
      if (settled) release();
      else cleanup.push(release);
      observe();
    });
  }
  close(): void {
    for (const release of this.subscriptions.splice(0)) release();
    this.contexts.clear();
    this.targetRoots.clear();
    this.channels.clear();
    this.channelListeners.clear();
    this.failures.clear();
    this.changed.clear();
  }
}
