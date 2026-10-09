import { describe, expect, it, vi } from "vitest";
import { CdpError } from "@workspace/cdp-client";
import { createCdpAutomation } from "./cdpAutomation.js";
import { Journal, withJournal, currentJournal } from "../shared/journal.js";

const readyObservation = (
  panelId: string,
  kind: "workspace" | "browser" = "workspace",
): import("@vibestudio/shared/panel/observation").PanelObservation => ({
  panelId,
  title: "Test panel",
  source: "panels/test",
  parentId: null,
  contextId: "ctx:test",
  requestedRef: "main",
  effectiveVersion: "version:test",
  attemptRef: { epoch: "epoch:test", attemptId: `attempt:${panelId}` },
  updatedAt: 1,
  kind,
  phase: "ready",
  attemptId: `attempt:${panelId}`,
  runtimeEntityId: `runtime:${panelId}`,
  buildKey: `build:${panelId}`,
});

const connectedBrowser = (
  page: unknown,
  close = vi.fn(async () => undefined),
) => {
  const fakePage = page as { isClosed?: () => boolean };
  fakePage.isClosed ??= () => false;
  return { contexts: () => [{ pages: () => [page] }], close };
};

describe("createCdpAutomation screenshot", () => {
  it("session derives browser navigation policy from the ready generation, not a lazy handle hint", async () => {
    const page = {
      goto: vi.fn(async () => undefined),
      close: vi.fn(),
      isClosed: () => false,
    };
    const ready = {
      panelId: "panel:lazy",
      kind: "browser",
      source: "browser:data:text/html,<h1>Owned page</h1>",
      phase: "ready",
      attemptId: "attempt:browser",
      runtimeEntityId: "panel:browser-runtime",
      buildKey: null,
    } as const;
    const cdp = createCdpAutomation(
      {
        call: vi.fn(async () => ({
          wsEndpoint: "ws://panel",
          token: "grant",
        })),
      } as never,
      ready.panelId,
      {
        kind: "workspace",
        observe: async () => ready as never,
        ensureReady: async () => ready as never,
        loadModule: async () => ({
          BrowserImpl: {
            connect: async () => ({
              ...connectedBrowser(page),
            }),
          },
        }),
      },
    );
    const connected = (await cdp.session()).page;
    await connected.goto("data:text/html,<h1>Destination</h1>");
    expect(page.goto).toHaveBeenCalledWith(
      "data:text/html,<h1>Destination</h1>",
    );
    await connected.close();
  });
  it("records native interaction receipts in the journal active when the action completes", async () => {
    let onInteraction: ((receipt: unknown) => void) | undefined;
    const page = { isClosed: () => false };
    const connect = vi.fn(async (_endpoint: string, options: object) => {
      onInteraction = (options as { onInteraction: (receipt: unknown) => void })
        .onInteraction;
      return connectedBrowser(page);
    });
    let currentOwner = new AbortController();
    const operationSignal = () => currentOwner.signal;
    const cdp = createCdpAutomation(
      {
        call: vi.fn(async () => ({ wsEndpoint: "ws://panel", token: "grant" })),
      } as never,
      "panel:journal",
      {
        loadModule: async () => ({ BrowserImpl: { connect }, CdpError }),
        observe: async () => readyObservation("panel:journal"),
        recordOperation: (entry) => currentJournal()?.append(entry),
        operationSignal,
      },
    );
    (await cdp.session()).page;
    const passedSignal = (
      connect.mock.calls[0]![1] as { operationSignal: () => AbortSignal }
    ).operationSignal;
    expect(passedSignal()).toBe(currentOwner.signal);
    currentOwner = new AbortController();
    expect(passedSignal()).toBe(currentOwner.signal);
    const receipt = {
      protocol: "cdp-interaction-outcome.v1",
      action: "click",
      delivery: "dispatched",
      target: {
        selector: "button",
        found: true,
        tagName: "BUTTON",
        id: "save",
        role: "button",
        accessibleName: "Save",
        ancestors: [{ text: "large DOM inspection".repeat(2_000) }],
        attributes: { class: "styling" },
      },
      effect: { status: "observed", locator: "Saved", state: "visible" },
    };
    const journal = new Journal();
    await withJournal(journal, async () => onInteraction!(receipt));
    expect(journal.entries).toEqual([
      {
        type: "interaction",
        id: "panel:journal",
        receipt: {
          protocol: receipt.protocol,
          action: receipt.action,
          delivery: receipt.delivery,
          target: {
            selector: "button",
            found: true,
            tagName: "BUTTON",
            id: "save",
            role: "button",
            accessibleName: "Save",
          },
          effect: receipt.effect,
        },
      },
    ]);
    expect(JSON.stringify(journal.entries).length).toBeLessThan(500);
    expect(receipt.target.ancestors[0]!.text.length).toBeGreaterThan(24_000);
    // A resident session must not retain a previous cell's journal.
    onInteraction!(receipt);
    expect(journal.entries).toHaveLength(1);
  });

  it("journals only completed bounded native profiles and preserves original failures", async () => {
    const report = {
      elapsedMs: 18,
      runtime: { taskDurationMs: 5 },
      page: { longTasks: { count: 0 }, navigation: { ttfbMs: 1 } },
      network: {
        requestCount: 0,
        failedCount: 0,
        transferBytes: 0,
        slowest: [{ url: "private request detail" }],
      },
    };
    const failure = new Error("native profile failed");
    const profile = vi.fn(async (action: () => Promise<void>) => {
      await action();
      return report;
    });
    const journal = new Journal();
    const cdp = createCdpAutomation(
      { call: vi.fn(async () => ({ wsEndpoint: "ws://panel" })) } as never,
      "panel:profile",
      {
        observe: async () => readyObservation("panel:profile"),
        recordOperation: (entry) => currentJournal()?.append(entry),
        loadModule: async () => ({
          BrowserImpl: {
            connect: async () => ({
              ...connectedBrowser({ profile }),
            }),
          },
        }),
      },
    );
    const page = (await cdp.session()).page;
    await withJournal(journal, async () => {
      expect(await page.profile(async () => undefined)).toBe(report);
    });
    expect(journal.entries.map((entry) => entry.type)).toEqual([
      "profile.start",
      "profile",
    ]);
    expect(JSON.stringify(journal.entries)).not.toContain(
      "private request detail",
    );
    report.runtime.taskDurationMs = 999;
    report.page.navigation.ttfbMs = 999;
    expect(journal.entries[1]).toMatchObject({
      receipt: {
        runtime: { taskDurationMs: 5 },
        page: { navigation: { ttfbMs: 1 } },
      },
    });
    profile.mockRejectedValueOnce(failure);
    await expect(
      withJournal(journal, () => page.profile(async () => undefined)),
    ).rejects.toBe(failure);
    expect(journal.entries.map((entry) => entry.type)).toEqual([
      "profile.start",
      "profile",
      "profile.start",
    ]);
  });

  it("journals native evaluation values without retaining mutable or oversized projections", async () => {
    const result = { status: "Clicked successfully" };
    const failure = new Error("page closed");
    const evaluate = vi.fn(async () => result as unknown);
    const journal = new Journal();
    const cdp = createCdpAutomation(
      { call: vi.fn(async () => ({ wsEndpoint: "ws://panel" })) } as never,
      "panel:evaluate",
      {
        observe: async () => readyObservation("panel:evaluate"),
        recordOperation: (entry) => currentJournal()?.append(entry),
        loadModule: async () => ({
          BrowserImpl: {
            connect: async () => ({
              ...connectedBrowser({ evaluate }),
            }),
          },
        }),
      },
    );
    const page = (await cdp.session()).page;
    await withJournal(journal, async () => {
      expect(await page.evaluate("document.body.innerText")).toBe(result);
      result.status = "guest mutation";
      evaluate.mockResolvedValueOnce("x".repeat(20_000));
      await page.evaluate("large read");
      evaluate.mockRejectedValueOnce(failure);
      await expect(page.evaluate("crashed read")).rejects.toBe(failure);
    });
    expect(journal.entries).toEqual([
      {
        type: "evaluation",
        id: "panel:evaluate",
        receipt: {
          protocol: "cdp-evaluation-outcome.v1",
          capturedAt: expect.any(Number),
          value: { status: "Clicked successfully" },
          truncated: false,
        },
      },
      {
        type: "evaluation",
        id: "panel:evaluate",
        receipt: {
          protocol: "cdp-evaluation-outcome.v1",
          capturedAt: expect.any(Number),
          value: null,
          truncated: true,
        },
      },
    ]);
  });

  it("records completed native console and capture observations independently of returned projections", async () => {
    const history = {
      entries: [],
      errors: [],
      page: { nextBeforeSeq: null, hasOlder: false },
      dropped: { entries: 0, errors: 2 },
      capacity: { entries: 200, errors: 100 },
    };
    const image = {
      data: "iVBORw0KGgo=",
      mimeType: "image/png" as const,
      width: 1280,
      height: 720,
    };
    const recordOperation = vi.fn();
    const failure = new Error("native console unavailable");
    let failConsole = false;
    const call = vi.fn(async (_target: string, method: string) => {
      if (method === "panelCdp.consoleHistory") {
        if (failConsole) throw failure;
        return history;
      }
      if (method === "panelCdp.screenshot") return image;
      if (method === "panelCdp.getCdpEndpoint")
        return { wsEndpoint: "ws://panel" };
      throw new Error(method);
    });
    const bytes = new Uint8Array([1, 2, 3]);
    const screenshot = vi.fn(async () => bytes);
    const cdp = createCdpAutomation({ call } as never, "panel:observations", {
      observe: async () => readyObservation("panel:observations"),
      recordOperation,
      loadModule: async () => ({
        BrowserImpl: {
          connect: async () => ({
            ...connectedBrowser({ screenshot }),
          }),
        },
      }),
    });
    // Evidence is recorded even when the caller returns only a compact count.
    expect((await cdp.consoleHistory()).errors.length).toBe(0);
    await cdp.screenshot();
    const page = (await cdp.session()).page;
    expect(await page.screenshot({ type: "jpeg" })).toBe(bytes);
    expect(recordOperation.mock.calls.map(([entry]) => entry)).toEqual([
      {
        type: "consoleHistory",
        id: "panel:observations",
        receipt: {
          capturedAt: expect.any(Number),
          errorCount: 0,
          droppedErrors: 2,
          errorCoverage: "full",
        },
      },
      {
        type: "screenshot",
        id: "panel:observations",
        receipt: {
          capturedAt: expect.any(Number),
          mimeType: "image/png",
          width: 1280,
          height: 720,
          byteSize: 8,
        },
      },
      {
        type: "cdp.session",
        id: "panel:observations",
        receipt: {
          status: "acquired",
          generation: expect.objectContaining({
            panelId: "panel:observations",
          }),
        },
      },
      {
        type: "screenshot",
        id: "panel:observations",
        receipt: {
          capturedAt: expect.any(Number),
          mimeType: "image/jpeg",
          byteSize: 3,
        },
      },
    ]);
    failConsole = true;
    await expect(cdp.consoleHistory()).rejects.toBe(failure);
    expect(recordOperation).toHaveBeenCalledTimes(4);
  });

  it.each([
    { errorLimit: 0 },
    { levels: ["info"] as const },
    { since: 1 },
    { beforeSeq: 2 },
    { contains: "irrelevant" },
  ])(
    "marks scoped or suppressed console errors as incomplete coverage: %j",
    async (query) => {
      const history = {
        entries: [],
        errors: [],
        page: { nextBeforeSeq: null, hasOlder: false },
        dropped: { entries: 0, errors: 0 },
        capacity: { entries: 200, errors: 100 },
      };
      const recordOperation = vi.fn();
      const cdp = createCdpAutomation(
        { call: vi.fn(async () => history) } as never,
        "panel:filtered",
        { recordOperation },
      );
      await cdp.consoleHistory(
        query as Parameters<typeof cdp.consoleHistory>[0],
      );
      expect(recordOperation).toHaveBeenCalledWith({
        type: "consoleHistory",
        id: "panel:filtered",
        receipt: {
          capturedAt: expect.any(Number),
          errorCount: 0,
          droppedErrors: 0,
          errorCoverage: "filtered",
        },
      });
    },
  );

  it("treats the hosted module loader as authoritative without trying runtime fallbacks", async () => {
    const hostedFailure = new Error(
      "cell execution session is no longer active",
    );
    const loadModule = vi.fn(async () => {
      throw hostedFailure;
    });
    const fallback = vi.fn(() => ({
      BrowserImpl: { connect: vi.fn() },
      CdpError,
    }));
    (globalThis as Record<string, unknown>)["__vibestudioRequire__"] = fallback;
    const cdp = createCdpAutomation(
      { call: vi.fn() } as never,
      "panel:tree/retained",
      {
        loadModule,
        observe: async () => readyObservation("panel:tree/retained"),
      },
    );

    try {
      await expect(cdp.session()).rejects.toMatchObject({
        message: expect.stringContaining(
          "cell execution session is no longer active",
        ),
        cause: hostedFailure,
      });
      expect(loadModule).toHaveBeenCalledWith("@workspace/cdp-client");
      expect(fallback).not.toHaveBeenCalled();
    } finally {
      delete (globalThis as Record<string, unknown>)["__vibestudioRequire__"];
    }
  });

  it("uses the one-RPC host capture path and returns its typed metadata", async () => {
    const shot = {
      data: "iVBORw0KGgo=",
      mimeType: "image/png" as const,
      width: 1280,
      height: 720,
    };
    const call = vi.fn(async (_target: string, method: string) => {
      if (method === "panelCdp.screenshot") return shot;
      throw new Error(`Unexpected RPC method: ${method}`);
    });
    const cdp = createCdpAutomation({ call } as never, "panel:child");

    await expect(
      cdp.screenshot({ format: "png", quality: 90 }),
    ).resolves.toEqual(shot);

    expect(call).toHaveBeenCalledTimes(1);
    expect(call).toHaveBeenCalledWith("main", "panelCdp.screenshot", [
      "panel:child",
      { format: "png", quality: 90 },
    ]);
    expect(
      call.mock.calls.some(
        ([, method]) => method === "panelCdp.getCdpEndpoint",
      ),
    ).toBe(false);
  });

  it("materializes a deferred target without requiring panel focus", async () => {
    const page = {
      close: vi.fn(async () => undefined),
      isClosed: () => false,
    };
    const connect = vi.fn(async () => connectedBrowser(page));
    const loadModule = vi.fn(async () => ({
      BrowserImpl: { connect },
      CdpError,
    }));
    const call = vi.fn(async (_target: string, method: string) => {
      if (method === "panelCdp.getCdpEndpoint") {
        return { wsEndpoint: "ws://panel", token: "grant" };
      }
      throw new Error(`Unexpected RPC method: ${method}`);
    });
    const ready = {
      panelId: "panel:deferred",
      phase: "ready",
      attemptId: "attempt-materialized",
      runtimeEntityId: "panel:runtime-materialized",
      buildKey: "build-materialized",
    } as const;
    const ensureReady = vi.fn(async () => ready);
    const observe = vi.fn(async () => ({
      ...ready,
      phase: "pending" as const,
      attemptId: "unknown-attempt",
      runtimeEntityId: null,
    }));
    const cdp = createCdpAutomation({ call } as never, "panel:deferred", {
      loadModule,
      observe: observe as never,
      ensureReady: ensureReady as never,
    });

    const session = await cdp.session();

    expect(ensureReady).toHaveBeenCalledTimes(2);
    expect(observe).not.toHaveBeenCalled();
    expect(session.generation).toMatchObject({
      attemptId: "attempt-materialized",
      runtimeEntityId: "panel:runtime-materialized",
    });
    await session.close();
  });

  it("fences a CDP session to one panel attempt and explicitly replaces a stale page", async () => {
    const oldPage = { isClosed: () => false };
    const newPage = { isClosed: () => false };
    const oldBrowserClose = vi.fn(async () => undefined);
    const connect = vi
      .fn()
      .mockResolvedValueOnce(connectedBrowser(oldPage, oldBrowserClose))
      .mockResolvedValueOnce(connectedBrowser(newPage));
    const loadModule = vi.fn(async () => ({
      BrowserImpl: { connect },
      CdpError,
    }));
    const call = vi.fn(async (_target: string, method: string) => {
      if (method === "panelCdp.getCdpEndpoint") {
        return { wsEndpoint: "ws://panel", token: "grant" };
      }
      throw new Error(`Unexpected RPC method: ${method}`);
    });
    const generation = (attemptId: string, runtimeEntityId: string) =>
      ({
        panelId: "panel:child",
        phase: "ready",
        attemptId,
        runtimeEntityId,
        buildKey: `build:${attemptId}`,
      }) as never;
    const oldGeneration = generation("attempt:old", "panel-runtime:old");
    const newGeneration = generation("attempt:new", "panel-runtime:new");
    const recordOperation = vi.fn();
    const observe = vi
      .fn()
      .mockResolvedValueOnce(oldGeneration)
      .mockResolvedValueOnce(oldGeneration)
      .mockResolvedValueOnce(newGeneration)
      .mockResolvedValueOnce(newGeneration)
      .mockResolvedValueOnce(newGeneration);
    const cdp = createCdpAutomation({ call } as never, "panel:child", {
      loadModule,
      observe,
      recordOperation,
    });

    const session = await cdp.session();
    const firstGeneration = session.generation;
    expect(session.generation).toMatchObject({
      protocol: "panel-cdp-generation.v1",
      attemptId: "attempt:old",
      runtimeEntityId: "panel-runtime:old",
    });

    const rebound = await cdp.session();
    expect(rebound).toBe(session);
    expect(rebound.receipt).toMatchObject({
      status: "replaced",
      previousGeneration: { attemptId: "attempt:old" },
      generation: { attemptId: "attempt:new" },
    });
    expect(oldBrowserClose).toHaveBeenCalledOnce();
    expect(connect).toHaveBeenCalledTimes(2);
    expect(connect.mock.calls[0]?.[1]).toMatchObject({
      inspectionIdentity: firstGeneration,
    });
    expect(connect.mock.calls[1]?.[1]).toMatchObject({
      inspectionIdentity: rebound.generation,
    });
    expect(recordOperation.mock.calls.map(([entry]) => entry)).toEqual([
      {
        type: "cdp.session",
        id: "panel:child",
        receipt: {
          status: "acquired",
          generation: firstGeneration,
        },
      },
      {
        type: "cdp.session",
        id: "panel:child",
        receipt: {
          status: "replaced",
          generation: rebound.generation,
          previousGeneration: firstGeneration,
        },
      },
    ]);
    expect(rebound.page.isClosed()).toBe(false);
    await rebound.close();
  });

  it("closes a candidate and reports generation replacement without retrying acquisition", async () => {
    const oldGeneration = readyObservation("panel:race");
    const newGeneration = {
      panelId: "panel:race",
      kind: "workspace",
      phase: "ready",
      buildKey: "build:replacement",
      attemptId: "attempt:replacement",
      runtimeEntityId: "runtime:replacement",
    } as never;
    const observe = vi
      .fn()
      .mockResolvedValueOnce(oldGeneration)
      .mockResolvedValueOnce(newGeneration)
      .mockResolvedValueOnce(newGeneration)
      .mockResolvedValueOnce(newGeneration);
    const firstClose = vi.fn(async () => undefined);
    const secondClose = vi.fn(async () => undefined);
    const connect = vi
      .fn()
      .mockResolvedValueOnce(
        connectedBrowser({ isClosed: () => false }, firstClose),
      )
      .mockResolvedValueOnce(
        connectedBrowser({ isClosed: () => false }, secondClose),
      );
    const cdp = createCdpAutomation(
      { call: vi.fn(async () => ({ wsEndpoint: "ws://panel" })) } as never,
      "panel:race",
      {
        observe,
        loadModule: async () => ({ BrowserImpl: { connect }, CdpError }),
      },
    );

    await expect(cdp.session()).rejects.toMatchObject({
      code: "panel_cdp_generation_changed",
      errorData: { currentGeneration: { attemptId: "attempt:replacement" } },
    });
    expect(connect).toHaveBeenCalledOnce();
    expect(firstClose).toHaveBeenCalledOnce();

    const rebound = await cdp.session();
    expect(connect).toHaveBeenCalledTimes(2);
    await rebound.close();
    expect(secondClose).toHaveBeenCalledOnce();
  });

  it("closes a late CDP candidate when the stable session closes during reacquisition", async () => {
    let resolveLateConnection!: (
      browser: ReturnType<typeof connectedBrowser>,
    ) => void;
    let signalAtConnect: AbortSignal | undefined;
    let announceConnect!: () => void;
    const connectStarted = new Promise<void>((resolve) => {
      announceConnect = resolve;
    });
    const lateClose = vi.fn(async () => undefined);
    const connect = vi
      .fn()
      .mockResolvedValueOnce(connectedBrowser({ isClosed: () => false }))
      .mockImplementationOnce(
        (_endpoint: string, options: { signal?: AbortSignal }) => {
          signalAtConnect = options.signal;
          announceConnect();
          return new Promise((resolve) => {
            resolveLateConnection = resolve;
          });
        },
      );
    const cdp = createCdpAutomation(
      { call: vi.fn(async () => ({ wsEndpoint: "ws://panel" })) } as never,
      "panel:close-during-bind",
      {
        observe: async () => readyObservation("panel:close-during-bind"),
        loadModule: async () => ({ BrowserImpl: { connect }, CdpError }),
      },
    );

    const session = await cdp.session();
    await session.close();
    const reacquiring = cdp.session();
    await connectStarted;

    const closingSession = session.close();
    expect(signalAtConnect?.aborted).toBe(true);

    resolveLateConnection(
      connectedBrowser({ isClosed: () => false }, lateClose),
    );
    await closingSession;
    await expect(reacquiring).rejects.toMatchObject({
      name: "AbortError",
      code: "panel_cdp_session_closed",
    });
    expect(lateClose).toHaveBeenCalledOnce();
  });

  it.each(["session", "click"] as const)(
    "propagates the active owner abort while %s waits for readiness",
    async (operation) => {
      const owner = new AbortController();
      const ownerReason = new Error("owning eval was cancelled");
      let announceReadiness!: () => void;
      const readinessStarted = new Promise<void>((resolve) => {
        announceReadiness = resolve;
      });
      const ensureReady = vi.fn((signal?: AbortSignal): Promise<never> => {
        announceReadiness();
        return new Promise((_, reject) => {
          signal?.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
        });
      });
      const connect = vi.fn();
      const cdp = createCdpAutomation(
        { call: vi.fn(async () => ({ wsEndpoint: "ws://panel" })) } as never,
        `panel:owner-abort-${operation}`,
        {
          operationSignal: () => owner.signal,
          ensureReady,
          loadModule: async () => ({ BrowserImpl: { connect }, CdpError }),
        },
      );

      const pending =
        operation === "session" ? cdp.session() : cdp.click("button");
      await readinessStarted;
      owner.abort(ownerReason);

      await expect(pending).rejects.toBe(ownerReason);
      expect(connect).not.toHaveBeenCalled();
      expect(ensureReady.mock.calls[0]?.[0]?.aborted).toBe(true);
    },
  );

  it.each(["session", "click"] as const)(
    "closes the candidate and preserves the owner abort during %s readiness verification",
    async (operation) => {
      const owner = new AbortController();
      const ownerReason = new Error(
        "owning eval was cancelled during verification",
      );
      let announceReadiness!: () => void;
      const readinessStarted = new Promise<void>((resolve) => {
        announceReadiness = resolve;
      });
      const ready = readyObservation(`panel:verify-abort-${operation}`);
      const ensureReady = vi.fn((signal?: AbortSignal) => {
        // The mock records this call before running it: the first call is
        // the binding observation, the second the post-connect verification.
        if (ensureReady.mock.calls.length === 1) return Promise.resolve(ready);
        announceReadiness();
        return new Promise<never>((_, reject) => {
          signal?.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
        });
      });
      const close = vi.fn(async () => undefined);
      const connect = vi.fn(async () =>
        connectedBrowser({ isClosed: () => false }, close),
      );
      const cdp = createCdpAutomation(
        { call: vi.fn(async () => ({ wsEndpoint: "ws://panel" })) } as never,
        `panel:verify-abort-${operation}`,
        {
          operationSignal: () => owner.signal,
          ensureReady: ensureReady as never,
          loadModule: async () => ({ BrowserImpl: { connect }, CdpError }),
        },
      );

      const pending =
        operation === "session" ? cdp.session() : cdp.click("button");
      await readinessStarted;
      owner.abort(ownerReason);

      await expect(pending).rejects.toBe(ownerReason);
      expect(connect).toHaveBeenCalledOnce();
      expect(close).toHaveBeenCalledOnce();
    },
  );

  it("reconnects a closed page without pretending the panel generation changed", async () => {
    let firstClosed = false;
    const firstPage = {
      isClosed: () => firstClosed,
    };
    const secondPage = {
      close: vi.fn(async () => undefined),
      isClosed: () => false,
    };
    const connect = vi
      .fn()
      .mockResolvedValueOnce(
        connectedBrowser(
          firstPage,
          vi.fn(async () => {
            firstClosed = true;
          }),
        ),
      )
      .mockResolvedValueOnce(connectedBrowser(secondPage));
    const generation = {
      panelId: "panel:child",
      phase: "ready",
      attemptId: "attempt:stable",
      runtimeEntityId: "panel-runtime:stable",
      buildKey: "build:stable",
    } as never;
    const cdp = createCdpAutomation(
      {
        call: vi.fn(async () => ({ wsEndpoint: "ws://panel", token: "grant" })),
      } as never,
      "panel:child",
      {
        loadModule: async () => ({ BrowserImpl: { connect }, CdpError }),
        observe: async () => generation,
      },
    );

    const session = await cdp.session();
    await session.close();
    const rebound = await cdp.session();

    expect(rebound).toBe(session);
    expect(rebound.receipt).toMatchObject({
      status: "reconnected",
      generation: { attemptId: "attempt:stable" },
    });
    expect(connect).toHaveBeenCalledTimes(2);
    expect(rebound.page.isClosed()).toBe(false);
    await rebound.close();
  });

  it("rejects raw navigation on workspace pages with lifecycle recovery guidance", async () => {
    const page = {
      goto: vi.fn(),
      reload: vi.fn(),
      goBack: vi.fn(),
      goForward: vi.fn(),
      close: vi.fn(async () => undefined),
      isClosed: () => false,
    };
    const cdp = createCdpAutomation(
      { call: vi.fn(async () => ({ wsEndpoint: "ws://panel" })) } as never,
      "panel:workspace",
      {
        kind: "browser",
        observe: async () =>
          ({
            panelId: "panel:workspace",
            kind: "workspace",
            phase: "ready",
            attemptId: "attempt:workspace",
            runtimeEntityId: "panel:workspace-runtime",
            buildKey: "build:workspace",
          }) as never,
        loadModule: async () => ({
          BrowserImpl: {
            connect: vi.fn(async () => connectedBrowser(page)),
          },
          CdpError,
        }),
      },
    );

    const connected = (await cdp.session()).page;
    const failure = await connected.reload().catch((error: unknown) => error);

    expect(failure).toMatchObject({
      name: "CdpError",
      code: "cdp_workspace_navigation_forbidden",
      errorData: {
        recovery: {
          action: "correct-request",
          instruction: expect.stringContaining("handle.reload()"),
        },
      },
    });
    expect(page.reload).not.toHaveBeenCalled();
    await connected.close();
  });

  it("keeps raw navigation available on browser pages", async () => {
    const page = {
      goto: vi.fn(async () => ({ frameId: "frame" })),
      close: vi.fn(async () => undefined),
      isClosed: () => false,
    };
    const cdp = createCdpAutomation(
      { call: vi.fn(async () => ({ wsEndpoint: "ws://panel" })) } as never,
      "panel:browser",
      {
        kind: "browser",
        observe: async () => readyObservation("panel:browser", "browser"),
        loadModule: async () => ({
          BrowserImpl: {
            connect: vi.fn(async () => connectedBrowser(page)),
          },
          CdpError,
        }),
      },
    );

    await expect(
      (await cdp.session()).page.goto("https://example.com"),
    ).resolves.toEqual({
      frameId: "frame",
    });
    expect(page.goto).toHaveBeenCalledWith("https://example.com");
  });

  it.each(["success", "failure"] as const)(
    "uses the stable session page for click %s",
    async (outcome) => {
      const clickFailure = new Error("click failed");
      const page = {
        locator: vi.fn(() => ({
          click:
            outcome === "success"
              ? vi.fn(async () => undefined)
              : vi.fn(async () => {
                  throw clickFailure;
                }),
        })),
        close: vi.fn(async () => undefined),
        isClosed: () => false,
      };
      const browserClose = vi.fn(async () => undefined);
      const connect = vi.fn(async () => connectedBrowser(page, browserClose));
      const cdp = createCdpAutomation(
        { call: vi.fn(async () => ({ wsEndpoint: "ws://panel" })) } as never,
        "panel:child",
        {
          kind: "browser",
          loadModule: async () => ({
            BrowserImpl: { connect },
            CdpError,
          }),
          observe: async () =>
            ({
              panelId: "panel:child",
              phase: "ready",
              attemptId: "attempt:stable",
              runtimeEntityId: "panel:child-runtime",
              buildKey: "build:stable",
            }) as never,
        },
      );

      if (outcome === "success")
        await expect(cdp.click("button")).resolves.toBeUndefined();
      else await expect(cdp.click("button")).rejects.toBe(clickFailure);
      expect(browserClose).not.toHaveBeenCalled();
      await (await cdp.session()).close();
      expect(browserClose).toHaveBeenCalledOnce();
    },
  );

  it("single-flights concurrent session acquisition and reuses the active session", async () => {
    const page = { close: vi.fn(async () => undefined), isClosed: () => false };
    const browserClose = vi.fn(async () => undefined);
    const connect = vi.fn(async () => connectedBrowser(page, browserClose));
    const generation = {
      panelId: "panel:child",
      phase: "ready",
      attemptId: "attempt:stable",
      runtimeEntityId: "panel-runtime:stable",
      buildKey: "build:stable",
    } as never;
    const cdp = createCdpAutomation(
      { call: vi.fn(async () => ({ wsEndpoint: "ws://panel" })) } as never,
      "panel:child",
      {
        loadModule: async () => ({ BrowserImpl: { connect }, CdpError }),
        observe: async () => generation,
      },
    );

    const [first, second] = await Promise.all([cdp.session(), cdp.session()]);
    const third = await cdp.session();

    expect(second).toBe(first);
    expect(third).toBe(first);
    expect(connect).toHaveBeenCalledOnce();
    await first.close();
  });
});
