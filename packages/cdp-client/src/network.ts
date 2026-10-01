/** Browser network observations. Bodies remain in Chromium until explicitly read. */
export interface NetworkTransport {
  send(method: string, params?: Record<string, unknown>): Promise<unknown>;
  on(method: string, listener: (params: unknown) => void): () => void;
  onDisconnect(listener: (error: Error) => void): () => void;
  onClosed?(listener: (error: Error) => void): () => void;
}
export type CdpNetworkFailure = {
  errorText: string;
  canceled?: boolean;
  blockedReason?: string;
  corsErrorStatus?: unknown;
};
export type CdpNetworkEvent =
  | "request"
  | "response"
  | "requestfinished"
  | "requestfailed";
export type CdpNetworkEvents = {
  request: CdpRequest;
  response: CdpResponse;
  requestfinished: CdpRequest;
  requestfailed: CdpRequest;
};
export type CdpResponseMatcher =
  | string
  | RegExp
  | ((response: CdpResponse) => boolean);

type RequestData = {
  url: string;
  method: string;
  headers: Record<string, string>;
  postData?: string;
};
type ResponseData = {
  url: string;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  mimeType?: string;
  fromDiskCache?: boolean;
  fromServiceWorker?: boolean;
};

export class CdpRequest {
  private responseValue: CdpResponse | null = null;
  private failureValue: CdpNetworkFailure | null = null;
  private settled = false;
  private completionError: Error | null = null;
  private complete!: (error: Error | null) => void;
  private readonly completion = new Promise<Error | null>((resolve) => {
    this.complete = resolve;
  });
  constructor(
    readonly id: string,
    private readonly data: RequestData,
    readonly resourceType: string,
    readonly frameId: string | undefined,
    private readonly previous: CdpRequest | null,
    private readonly transport: NetworkTransport,
  ) {}
  url(): string {
    return this.data.url;
  }
  method(): string {
    return this.data.method;
  }
  headers(): Record<string, string> {
    return { ...this.data.headers };
  }
  postData(): string | null {
    return this.data.postData ?? null;
  }
  response(): CdpResponse | null {
    return this.responseValue;
  }
  failure(): CdpNetworkFailure | null {
    return this.failureValue ? { ...this.failureValue } : null;
  }
  redirectedFrom(): CdpRequest | null {
    return this.previous;
  }
  /** Resolve on actual loading completion; reject with the original transport/loading error. */
  async finished(): Promise<void> {
    if (this.settled) {
      if (this.completionError) throw this.completionError;
      return;
    }
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      let release = () => {};
      const finish = (error: Error | null) => {
        if (settled) return;
        settled = true;
        release();
        if (error) reject(error);
        else resolve();
      };
      release = this.transport.onDisconnect(finish);
      if (settled) release();
      else void this.completion.then(finish);
    });
  }
  /** @internal */ respond(response: CdpResponse): void {
    this.responseValue = response;
  }
  /** @internal */ finish(
    error: Error | null,
    failure?: CdpNetworkFailure,
  ): void {
    if (this.settled) return;
    this.settled = true;
    this.completionError = error;
    this.failureValue = failure ?? null;
    this.complete(error);
  }
}

export class CdpResponse {
  constructor(
    private readonly owner: CdpRequest,
    private readonly data: ResponseData,
    private readonly transport: NetworkTransport,
    private readonly redirected = false,
  ) {}
  request(): CdpRequest {
    return this.owner;
  }
  url(): string {
    return this.data.url;
  }
  status(): number {
    return this.data.status;
  }
  statusText(): string {
    return this.data.statusText;
  }
  ok(): boolean {
    return this.data.status >= 200 && this.data.status < 300;
  }
  headers(): Record<string, string> {
    return { ...this.data.headers };
  }
  fromCache(): boolean {
    return !!this.data.fromDiskCache;
  }
  fromServiceWorker(): boolean {
    return !!this.data.fromServiceWorker;
  }
  finished(): Promise<void> {
    return this.owner.finished();
  }
  async body(): Promise<Uint8Array> {
    await this.finished();
    if (this.redirected)
      throw new Error("Chromium does not retain redirect response bodies");
    const result = (await this.transport.send("Network.getResponseBody", {
      requestId: this.owner.id,
    })) as { body: string; base64Encoded: boolean };
    return result.base64Encoded
      ? Uint8Array.from(atob(result.body), (c) => c.charCodeAt(0))
      : new TextEncoder().encode(result.body);
  }
  async text(): Promise<string> {
    return new TextDecoder().decode(await this.body());
  }
  async json(): Promise<unknown> {
    return JSON.parse(await this.text());
  }
}

export class NetworkObserver {
  private readonly active = new Map<string, CdpRequest>();
  private readonly recent: CdpRequest[] = [];
  private readonly listeners = new Map<
    CdpNetworkEvent,
    Set<(value: any) => void>
  >();
  private readonly subscriptions: Array<() => void> = [];
  private channelSequence = 0;
  constructor(private readonly transport: NetworkTransport) {
    this.attach(transport);
  }
  /** Observe a related native frame session; request IDs are local to each session. */
  attach(transport: NetworkTransport): void {
    const prefix = `${++this.channelSequence}:`;
    const key = (id: string) => prefix + id;
    this.subscriptions.push(
      transport.on("Network.requestWillBeSent", (raw) => {
        const p = raw as {
          requestId: string;
          request: RequestData;
          type: string;
          frameId?: string;
          redirectResponse?: ResponseData;
        };
        const previous = this.active.get(key(p.requestId)) ?? null;
        if (previous) {
          if (p.redirectResponse)
            this.respond(previous, p.redirectResponse, transport, true);
          previous.finish(null);
          this.emit("requestfinished", previous);
        }
        const request = new CdpRequest(
          p.requestId,
          p.request,
          p.type,
          p.frameId,
          previous,
          transport,
        );
        this.active.set(key(p.requestId), request);
        this.recent.push(request);
        // Capacity, not expiry: every in-flight request retains its own completion owner.
        if (this.recent.length > 1000) this.recent.shift();
        this.emit("request", request);
      }),
      transport.on("Network.responseReceived", (raw) => {
        const p = raw as { requestId: string; response: ResponseData };
        const request = this.active.get(key(p.requestId));
        if (request) this.respond(request, p.response, transport);
      }),
      transport.on("Network.loadingFinished", (raw) =>
        this.finish(key((raw as { requestId: string }).requestId)),
      ),
      transport.on("Network.loadingFailed", (raw) => {
        const p = raw as CdpNetworkFailure & { requestId: string };
        this.finish(key(p.requestId), {
          errorText: p.errorText,
          canceled: p.canceled,
          blockedReason: p.blockedReason,
          corsErrorStatus: p.corsErrorStatus,
        });
      }),
    );
    if (transport.onClosed)
      this.subscriptions.push(
        transport.onClosed((error) => {
          for (const [id, request] of this.active) {
            if (!id.startsWith(prefix)) continue;
            this.active.delete(id);
            request.finish(error);
            this.emit("requestfailed", request);
          }
        }),
      );
  }
  private respond(
    request: CdpRequest,
    data: ResponseData,
    transport: NetworkTransport,
    redirected = false,
  ): void {
    const response = new CdpResponse(request, data, transport, redirected);
    request.respond(response);
    this.emit("response", response);
  }
  private finish(id: string, failure?: CdpNetworkFailure): void {
    const request = this.active.get(id);
    if (!request) return;
    this.active.delete(id);
    request.finish(
      failure ? new Error(failure.errorText, { cause: failure }) : null,
      failure,
    );
    this.emit(failure ? "requestfailed" : "requestfinished", request);
  }
  on<K extends CdpNetworkEvent>(
    event: K,
    listener: (value: CdpNetworkEvents[K]) => void,
  ): () => void {
    const set = this.listeners.get(event) ?? new Set();
    set.add(listener);
    this.listeners.set(event, set);
    return () => {
      set.delete(listener);
      if (!set.size) this.listeners.delete(event);
    };
  }
  private emit<K extends CdpNetworkEvent>(
    event: K,
    value: CdpNetworkEvents[K],
  ): void {
    for (const listener of this.listeners.get(event) ?? []) listener(value);
  }
  requests(): CdpRequest[] {
    return [...this.recent];
  }
  waitForResponse(matcher: CdpResponseMatcher): Promise<CdpResponse> {
    return new Promise((resolve, reject) => {
      let disposed = false;
      const cleanup: Array<() => void> = [];
      const settle = (response?: CdpResponse, error?: unknown) => {
        if (disposed) return;
        disposed = true;
        for (const release of cleanup) release();
        if (error !== undefined) reject(error);
        else resolve(response!);
      };
      cleanup.push(
        this.on("response", (response) => {
          try {
            const matches =
              typeof matcher === "string"
                ? response.url() === matcher
                : matcher instanceof RegExp
                  ? new RegExp(matcher.source, matcher.flags).test(
                      response.url(),
                    )
                  : matcher(response);
            if (matches) settle(response);
          } catch (error) {
            settle(undefined, error);
          }
        }),
      );
      const release = this.transport.onDisconnect((error) =>
        settle(undefined, error),
      );
      if (disposed) release();
      else cleanup.push(release);
    });
  }
  close(error: Error): void {
    for (const request of this.active.values()) request.finish(error);
    this.active.clear();
    for (const release of this.subscriptions.splice(0)) release();
    this.listeners.clear();
  }
}
