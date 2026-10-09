import type { RpcClient } from "@vibestudio/rpc";
import type { Browser, CdpPage } from "@workspace/cdp-client";
import type {
  CdpAutomation,
  CdpEndpoint,
  PanelCdpGeneration,
  PanelCdpSession,
  PanelCdpSessionReceipt,
  PanelConsoleHistoryOptions,
  PanelConsoleHistoryResult,
  PanelScreenshotOptions,
  PanelScreenshotResult,
} from "../core/index.js";
import type { PanelObservation } from "@vibestudio/shared/panel/observation";
import type { CdpInteractionOutcome } from "@workspace/cdp-client";
import {
  consoleHistoryReceipt,
  cdpEvaluationReceipt,
  cdpProfileReceipt,
  cdpInteractionReceipt,
  type OperationJournalEntry,
} from "../shared/journal.js";
import { SCOPE_REF } from "../shared/scopeRef.js";

export type { CdpAutomation, CdpEndpoint };

type CdpClientModule = {
  BrowserImpl: { connect(ws: string, opts: object): Promise<Browser> };
};

type ConnectedPage = { page: CdpPage; close: () => Promise<void> };

const CDP_CLIENT_MODULE = "@workspace/cdp-client";

interface CdpAutomationOptions {
  recordOperation?: (entry: OperationJournalEntry) => void;
  operationSignal?: () => AbortSignal | undefined;
  kind?: "workspace" | "browser";
  requesterPanelId?: string | null;
  /** Closure-held module resolver used by confined hosted runtimes. */
  loadModule?: (id: string) => unknown | Promise<unknown>;
  observe?: (signal?: AbortSignal) => Promise<PanelObservation>;
  /** Express active inspection demand without changing desktop focus. */
  ensureReady?: (signal?: AbortSignal) => Promise<PanelObservation>;
}

function isCdpClientModule(value: unknown): value is CdpClientModule {
  return Boolean((value as CdpClientModule | undefined)?.BrowserImpl?.connect);
}

async function loadCdpClient(
  loadModule?: (id: string) => unknown | Promise<unknown>,
): Promise<CdpClientModule> {
  if (loadModule) {
    try {
      const loaded = await loadModule(CDP_CLIENT_MODULE);
      if (isCdpClientModule(loaded)) return loaded;
      throw new Error("module does not expose BrowserImpl.connect");
    } catch (error) {
      // A closure-held loader is the hosted runtime's authority-bearing module
      // path. Falling through would hide its failure behind another runtime.
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Unable to load ${CDP_CLIENT_MODULE} for CDP automation. ${message}`,
        {
          cause: error,
        },
      );
    }
  }
  try {
    const loaded: unknown = await import("@workspace/cdp-client");
    if (isCdpClientModule(loaded)) return loaded;
    throw new Error("module does not expose BrowserImpl.connect");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Unable to load ${CDP_CLIENT_MODULE} for CDP automation. ${message}. ` +
        `Use handle.cdp.session() only from contexts that expose @workspace/cdp-client.`,
      { cause: error },
    );
  }
}

export function createCdpAutomation(
  rpc: Pick<RpcClient, "call">,
  id: string,
  options: CdpAutomationOptions = {},
): CdpAutomation {
  // CDP automation is available for every panel target — workspace panels and
  // browser panels alike. (A prior commit restricted this to browser panels to
  // stop test agents from navigating the panel they were running in; that
  // over-corrected and blocked legitimate inspection of other workspace panels.)
  const fetchCdpEndpoint = (signal?: AbortSignal): Promise<CdpEndpoint> =>
    rpc.call<CdpEndpoint>(
      "main",
      "panelCdp.getCdpEndpoint",
      [id],
      signal ? { signal } : undefined,
    );
  const getCdpEndpoint = async (signal?: AbortSignal): Promise<CdpEndpoint> => {
    const activeSignal = operationSignalWith(signal);
    if (activeSignal?.aborted) throw activeSignal.reason;
    return fetchCdpEndpoint(activeSignal);
  };

  const workspaceNavigationError = (
    operation: string,
    lifecycleMethod: string,
  ): Error =>
    Object.assign(
      new Error(
        `Direct ${operation} is unavailable for workspace panel ${JSON.stringify(
          id,
        )}; use ${lifecycleMethod} so panel generation and readiness remain coherent.`,
      ),
      {
        name: "CdpError",
        code: "cdp_workspace_navigation_forbidden" as const,
        errorKind: "application" as const,
        errorData: {
          code: "cdp_workspace_navigation_forbidden" as const,
          operation,
          failureKind: "user-code" as const,
          recovery: {
            action: "correct-request" as const,
            instruction: `Use ${lifecycleMethod}; the session binds the resulting generation at its next operation.`,
          },
        },
      },
    );

  const connectPage = async (
    generation?: PanelCdpGeneration,
    kind = options.kind,
    signal?: AbortSignal,
  ): Promise<ConnectedPage> => {
    const activeSignal = operationSignalWith(signal);
    if (activeSignal?.aborted) throw activeSignal.reason;
    const { BrowserImpl } = await loadCdpClient(options.loadModule);
    if (activeSignal?.aborted) throw activeSignal.reason;
    const endpoint = await fetchCdpEndpoint(activeSignal);
    const connectOptions: {
      isElectronWebview: boolean;
      preferFetchUpgrade: boolean;
      signal?: AbortSignal;
      operationSignal?: () => AbortSignal | undefined;
      transportOptions?: { authToken: string };
      onInteraction: (outcome: CdpInteractionOutcome) => void;
      onObservation: (value: unknown) => void;
      inspectionIdentity?: PanelCdpGeneration;
      browserOperation: (
        request: import("@vibestudio/shared/panel/browserAutomation").BrowserAutomationRequest,
        signal?: AbortSignal,
      ) => Promise<unknown>;
    } = {
      isElectronWebview: true,
      // Hosted EvalDO runtimes receive a closure-held loader and must route
      // CDP through the egress-aware fetch-upgrade transport. Browser panels
      // use their native WebSocket implementation instead.
      preferFetchUpgrade: Boolean(options.loadModule),
      signal: activeSignal,
      operationSignal: options.operationSignal,
      browserOperation: (request, signal) => {
        const owner = options.operationSignal?.();
        return rpc.call("main", "panelCdp.browserOperation", [id, request], {
          signal:
            signal && owner
              ? AbortSignal.any([signal, owner])
              : (signal ?? owner),
        });
      },
      onObservation: (value) =>
        options.recordOperation?.({
          type: "evaluation",
          id,
          receipt: cdpEvaluationReceipt(value),
        }),
      onInteraction: (receipt) =>
        options.recordOperation?.({
          type: "interaction",
          id,
          receipt: cdpInteractionReceipt(receipt),
        }),
    };
    if (generation) connectOptions.inspectionIdentity = generation;
    if (endpoint.token)
      connectOptions.transportOptions = { authToken: endpoint.token };
    const browser = await BrowserImpl.connect(
      endpoint.wsEndpoint,
      connectOptions,
    );
    const resolvedPage = browser.contexts()[0]?.pages()[0];
    if (!resolvedPage) {
      await browser.close();
      throw new Error(
        `CDP connected to panel ${JSON.stringify(id)}, but the target exposed no page. ` +
          "The panel may still be starting or its target may have been replaced; inspect " +
          "handle.diagnose() before the next session operation.",
      );
    }
    const navigationMethods = new Map<PropertyKey, string>([
      ["goto", "handle.navigate(...)"],
      ["reload", "handle.reload()"],
      ["goBack", "handle.navigate(...)"],
      ["goForward", "handle.navigate(...)"],
      ["setContent", 'a browser panel (openPanel("about:blank"))'],
    ]);
    const page = new Proxy(resolvedPage as CdpPage & object, {
      get(target, property) {
        if (property === "evaluate") {
          return async (...args: Parameters<CdpPage["evaluate"]>) => {
            const value = await resolvedPage.evaluate(...args);
            options.recordOperation?.({
              type: "evaluation",
              id,
              receipt: cdpEvaluationReceipt(value),
            });
            return value;
          };
        }
        if (property === "profile") {
          return async (...args: Parameters<CdpPage["profile"]>) => {
            options.recordOperation?.({ type: "profile.start", id });
            const report = await resolvedPage.profile(...args);
            options.recordOperation?.({
              type: "profile",
              id,
              receipt: cdpProfileReceipt(report),
            });
            return report;
          };
        }
        if (property === "screenshot") {
          return async (
            screenshotOptions?: Parameters<CdpPage["screenshot"]>[0],
          ) => {
            const bytes = await resolvedPage.screenshot(screenshotOptions);
            options.recordOperation?.({
              type: "screenshot",
              id,
              receipt: {
                capturedAt: Date.now(),
                mimeType:
                  screenshotOptions?.type === "jpeg"
                    ? "image/jpeg"
                    : "image/png",
                byteSize: bytes.byteLength,
              },
            });
            return bytes;
          };
        }
        const lifecycleMethod = navigationMethods.get(property);
        if (kind === "workspace" && lifecycleMethod) {
          return async () => {
            throw workspaceNavigationError(
              `page.${String(property)}()`,
              lifecycleMethod,
            );
          };
        }
        const value = Reflect.get(target, property, target) as unknown;
        return typeof value === "function" ? value.bind(target) : value;
      },
    }) as CdpPage;
    let closePromise: Promise<void> | null = null;
    return {
      page,
      close: () => (closePromise ??= browser.close()),
    };
  };

  const generationOf = (observation: PanelObservation): PanelCdpGeneration => {
    if (observation.phase !== "ready" || !observation.runtimeEntityId) {
      throw Object.assign(
        new Error(
          `Panel ${JSON.stringify(id)} is ${observation.phase}; CDP acquisition could not obtain a ready generation.`,
        ),
        {
          code: "panel_cdp_generation_unavailable",
          errorData: {
            code: "panel_cdp_generation_unavailable",
            panelId: id,
            phase: observation.phase,
            attemptId: observation.attemptId,
            recovery: {
              action: "reobserve",
              instruction:
                observation.phase === "pending"
                  ? "Inspect panel diagnostics: CDP acquisition requested materialization, but the panel did not become ready."
                  : "Inspect the panel lifecycle and repair its failed or stopped attempt before reacquiring CDP.",
            },
          },
        },
      );
    }
    return {
      protocol: "panel-cdp-generation.v1",
      panelId: id,
      attemptId: observation.attemptId,
      runtimeEntityId: observation.runtimeEntityId,
      buildKey: observation.buildKey,
    };
  };

  const sameGeneration = (
    left: PanelCdpGeneration,
    right: PanelCdpGeneration,
  ): boolean =>
    left.panelId === right.panelId &&
    left.attemptId === right.attemptId &&
    left.runtimeEntityId === right.runtimeEntityId;

  const operationSignalWith = (
    signal?: AbortSignal,
  ): AbortSignal | undefined => {
    const ownerSignal = options.operationSignal?.();
    if (!signal) return ownerSignal;
    if (!ownerSignal || ownerSignal === signal) return signal;
    return AbortSignal.any([signal, ownerSignal]);
  };

  const observe = (signal?: AbortSignal): Promise<PanelObservation> => {
    if (!options.observe) {
      throw new Error(
        "Generation-fenced CDP sessions are unavailable in this runtime; use a PanelHandle created by panelTree/openPanel.",
      );
    }
    return options.observe(signal);
  };

  const ensureReady = (signal?: AbortSignal): Promise<PanelObservation> => {
    const activeSignal = operationSignalWith(signal);
    if (activeSignal?.aborted) return Promise.reject(activeSignal.reason);
    return options.ensureReady
      ? options.ensureReady(activeSignal)
      : observe(activeSignal);
  };

  // ---------------------------------------------------------------------------
  // The panel's one stable session
  // ---------------------------------------------------------------------------

  /** The connected target for one generation. */
  type Binding = ConnectedPage & { generation: PanelCdpGeneration };
  let binding: Binding | null = null;
  /** Last bound generation; survives close() so a rebind can report replacement. */
  let boundGeneration: PanelCdpGeneration | null = null;
  let receipt: PanelCdpSessionReceipt | null = null;
  /** The owning lifecycle may have changed the generation since the last binding. */
  let stale = true;
  /** Advances on every lifecycle invalidation; fences operations in flight. */
  let epoch = 0;
  let bindPending: Promise<Binding> | null = null;
  let bindController: AbortController | null = null;
  let bindCandidate: ConnectedPage | null = null;
  let defaultTimeoutMs: number | undefined;

  const sessionCloseError = (): Error =>
    Object.assign(new Error("CDP session closed during acquisition"), {
      name: "AbortError",
      code: "panel_cdp_session_closed",
      errorData: {
        code: "panel_cdp_session_closed",
        panelId: id,
        recovery: {
          action: "reobserve",
          instruction: "Acquire the panel CDP session again before retrying.",
        },
      },
    });

  const isLive = (current: Binding | null): current is Binding =>
    current !== null && !stale && !current.page.isClosed();

  const bind = async (
    controller: AbortController,
    bindEpoch: number,
  ): Promise<Binding> => {
    // Binding is active inspection demand. Ensure residency/readiness here
    // without coupling automation to desktop focus.
    const observation = await ensureReady(controller.signal);
    if (epoch !== bindEpoch) throw sessionCloseError();
    const current = generationOf(observation);
    if (
      binding &&
      sameGeneration(binding.generation, current) &&
      !binding.page.isClosed()
    ) {
      stale = false;
      return binding;
    }
    // A handle obtained synchronously by slot id can still carry an initial
    // workspace hint. Navigation policy belongs to the observed generation,
    // not that hint; the same slot can also change source kind over time.
    const candidate = await acquireForObservation(
      observation,
      controller.signal,
      (value) => {
        if (bindController === controller) bindCandidate = value;
      },
    );
    if (epoch !== bindEpoch) {
      return closeCandidateAfterFailure(candidate, sessionCloseError());
    }
    const previous = binding;
    const next = candidate;
    binding = next;
    stale = false;
    if (defaultTimeoutMs !== undefined)
      next.page.setDefaultTimeout(defaultTimeoutMs);
    if (previous) await previous.close();
    const prior = boundGeneration;
    boundGeneration = candidate.generation;
    receipt = !prior
      ? { status: "acquired", generation: candidate.generation }
      : sameGeneration(prior, candidate.generation)
        ? { status: "reconnected", generation: candidate.generation }
        : {
            status: "replaced",
            generation: candidate.generation,
            previousGeneration: prior,
          };
    options.recordOperation?.({ type: "cdp.session", id, receipt });
    return next;
  };

  /** Resolve the bound target at an operation boundary. */
  const ensureBound = (): Promise<Binding> => {
    if (isLive(binding)) return Promise.resolve(binding);
    if (bindPending) return bindPending;
    const controller = new AbortController();
    const bindEpoch = epoch;
    const pending = bind(controller, bindEpoch);
    bindPending = pending;
    bindController = controller;
    const clear = () => {
      if (bindPending === pending) {
        bindPending = null;
        bindController = null;
        bindCandidate = null;
      }
    };
    void pending.then(clear, clear);
    return pending;
  };

  const generationChanged = (
    operation: string,
    previousGeneration: PanelCdpGeneration,
    currentGeneration: PanelCdpGeneration | null,
    cause?: unknown,
  ): Error =>
    Object.assign(
      new Error(
        `Panel ${JSON.stringify(id)} changed generation during ${operation}; ` +
          "the operation was not replayed.",
        cause === undefined ? undefined : { cause },
      ),
      {
        name: "CdpError",
        code: "panel_cdp_generation_changed" as const,
        errorKind: "application" as const,
        errorData: {
          code: "panel_cdp_generation_changed" as const,
          panelId: id,
          operation,
          previousGeneration,
          currentGeneration,
          recovery: {
            action: "reobserve" as const,
            instruction:
              "Observe the panel, then repeat the intended action on session.page if it still applies; the next operation binds the current generation.",
          },
        },
      },
    );

  const closeCandidateAfterFailure = async (
    candidate: ConnectedPage,
    failure: unknown,
  ): Promise<never> => {
    try {
      await candidate.close();
    } catch (cleanupError) {
      throw new AggregateError(
        [failure, cleanupError],
        "CDP acquisition failed and its candidate connection could not be closed",
        { cause: failure },
      );
    }
    throw failure;
  };

  /** Acquire and fence one independent connection against the observed generation. */
  const acquireForObservation = async (
    observation: PanelObservation,
    signal?: AbortSignal,
    onConnected?: (page: ConnectedPage) => void,
  ): Promise<Binding> => {
    const activeSignal = operationSignalWith(signal);
    if (activeSignal?.aborted) throw activeSignal.reason;
    const current = generationOf(observation);
    const candidate = await connectPage(
      current,
      observation.kind,
      activeSignal,
    );
    onConnected?.(candidate);
    if (activeSignal?.aborted) {
      return closeCandidateAfterFailure(
        candidate,
        activeSignal.reason ?? sessionCloseError(),
      );
    }
    let after: PanelCdpGeneration;
    try {
      after = generationOf(await ensureReady(activeSignal));
    } catch (error) {
      const failure = activeSignal?.aborted
        ? (activeSignal.reason ?? sessionCloseError())
        : generationChanged("session acquisition", current, null, error);
      return closeCandidateAfterFailure(candidate, failure);
    }
    if (activeSignal?.aborted) {
      return closeCandidateAfterFailure(
        candidate,
        activeSignal.reason ?? sessionCloseError(),
      );
    }
    if (!sameGeneration(current, after)) {
      return closeCandidateAfterFailure(
        candidate,
        generationChanged("session acquisition", current, after),
      );
    }
    return { generation: after, ...candidate };
  };

  /**
   * After the owning lifecycle invalidated an operation's generation, or its
   * target closed, report whether that generation is still the live one. A
   * plain observation is used: verification is not demand to rematerialize.
   */
  const assertGenerationCurrent = async (
    operation: string,
    bound: Binding,
    cause?: unknown,
  ): Promise<void> => {
    let observation: PanelObservation;
    try {
      observation = await observe();
    } catch (error) {
      stale = true;
      if (cause !== undefined) {
        throw new AggregateError(
          [cause, error],
          `Unable to verify panel generation after ${operation} failed`,
          { cause },
        );
      }
      throw error;
    }
    const current =
      observation.phase === "ready" && observation.runtimeEntityId
        ? generationOf(observation)
        : null;
    if (current && sameGeneration(current, bound.generation)) return;
    stale = true;
    throw generationChanged(operation, bound.generation, current, cause);
  };

  /**
   * Run one operation on the bound target. `boundTo` fences values created on
   * an earlier generation (locators); a fresh operation binds the current one.
   */
  const run = async <T>(
    operation: string,
    action: (page: CdpPage) => T | Promise<T>,
    boundTo?: () => PanelCdpGeneration | null,
  ): Promise<T> => {
    const bound = await ensureBound();
    const expected = boundTo?.();
    if (expected && !sameGeneration(expected, bound.generation)) {
      throw generationChanged(operation, expected, bound.generation);
    }
    const startEpoch = epoch;
    let result: T;
    try {
      result = await action(bound.page);
    } catch (error) {
      if (epoch !== startEpoch || bound.page.isClosed()) {
        await assertGenerationCurrent(operation, bound, error);
      }
      throw error;
    }
    if (epoch !== startEpoch) await assertGenerationCurrent(operation, bound);
    return result;
  };

  const unbound = (operation: string): Error =>
    Object.assign(
      new Error(
        `session.page.${operation} reads the bound generation of panel ${JSON.stringify(id)}, ` +
          "but none is bound since its last generation change.",
      ),
      {
        name: "CdpError",
        code: "panel_cdp_session_unbound" as const,
        errorKind: "application" as const,
        errorData: {
          code: "panel_cdp_session_unbound" as const,
          panelId: id,
          operation,
          recovery: {
            action: "reobserve" as const,
            instruction:
              "Await handle.cdp.session() (or any awaited session.page operation) to bind the current generation, then read again.",
          },
        },
      },
    );

  const requireLive = (operation: string): CdpPage => {
    if (!isLive(binding)) throw unbound(operation);
    return binding.page;
  };

  // Lazily bound locators: a chain recorded on the stable page and replayed on
  // the bound target when an awaited operation runs. A locator belongs to the
  // generation bound when it was created (or, if none was, at its first use).
  type LocatorStep = readonly [string, readonly unknown[]];
  const LOCATOR_STEPS = new Set([
    "locator",
    "getByRole",
    "getByText",
    "getByLabel",
    "getByPlaceholder",
    "getByTestId",
    "getByAltText",
    "getByTitle",
    "filter",
    "nth",
    "first",
    "last",
    "contentFrame",
    "frameLocator",
  ]);
  const LAZY_LOCATOR = Symbol("panelCdpLazyLocator");
  type LazyLocatorState = {
    steps: LocatorStep[];
    generation: () => PanelCdpGeneration | null;
  };

  const replay = (page: CdpPage, steps: LocatorStep[]): unknown =>
    steps.reduce<unknown>(
      (target, [method, args]) =>
        (target as Record<string, (...a: unknown[]) => unknown>)[method]!(
          ...args,
        ),
      page,
    );

  const describeSteps = (steps: LocatorStep[]): string =>
    steps
      .map(
        ([method, args]) =>
          `${method}(${args.map((arg) => (arg instanceof RegExp ? String(arg) : JSON.stringify(arg))).join(", ")})`,
      )
      .join(".");

  /** Replace lazy locators passed as interaction expectations with bound ones. */
  const bindArgs = (page: CdpPage, args: unknown[]): unknown[] =>
    args.map((arg) => {
      const expectation = (arg as { expect?: { locator?: unknown } } | null)
        ?.expect;
      const state = (
        expectation?.locator as
          | { [LAZY_LOCATOR]?: LazyLocatorState }
          | undefined
      )?.[LAZY_LOCATOR];
      if (!state) return arg;
      return {
        ...(arg as object),
        expect: { ...expectation, locator: replay(page, state.steps) },
      };
    });

  const lazyLocator = (
    steps: LocatorStep[],
    fixed: PanelCdpGeneration | null,
  ): unknown => {
    let generation = fixed;
    const state: LazyLocatorState = { steps, generation: () => generation };
    const runOn = <T>(
      operation: string,
      action: (
        target: Record<string, (...a: unknown[]) => unknown>,
        page: CdpPage,
      ) => T | Promise<T>,
    ) =>
      run(
        operation,
        (page) => {
          generation ??= binding?.generation ?? null;
          return action(
            replay(page, steps) as Record<string, (...a: unknown[]) => unknown>,
            page,
          );
        },
        () => generation,
      );
    return new Proxy(
      {},
      {
        get(_target, property) {
          if (property === LAZY_LOCATOR) return state;
          if (property === "then") return undefined;
          if (property === "toString" || property === Symbol.toPrimitive) {
            return () =>
              isLive(binding) &&
              (!generation || sameGeneration(generation, binding.generation))
                ? String(replay(binding.page, steps))
                : describeSteps(steps);
          }
          if (typeof property !== "string") return undefined;
          if (LOCATOR_STEPS.has(property)) {
            return (...args: unknown[]) =>
              lazyLocator([...steps, [property, args]], generation);
          }
          if (property === "all") {
            return async () => {
              const count = await runOn("locator.all()", (target) =>
                target["count"]!(),
              );
              return Array.from({ length: count as number }, (_, index) =>
                lazyLocator([...steps, ["nth", [index]]], generation),
              );
            };
          }
          return (...args: unknown[]) =>
            runOn(`locator.${property}()`, (target, page) =>
              target[property]!(...bindArgs(page, args)),
            );
        },
      },
    );
  };

  const creationGeneration = (): PanelCdpGeneration | null =>
    isLive(binding) ? binding.generation : null;

  const SYNC_READS = new Set([
    "url",
    "viewportSize",
    "dialog",
    "consoleEvents",
    "clearConsoleEvents",
    "requests",
  ]);

  const stablePage: CdpPage = new Proxy({} as CdpPage, {
    get(_target, property) {
      if (property === "then") return undefined;
      if (typeof property !== "string") return undefined;
      if (LOCATOR_STEPS.has(property)) {
        return (...args: unknown[]) =>
          lazyLocator([[property, args]], creationGeneration());
      }
      if (SYNC_READS.has(property)) {
        return (...args: unknown[]) =>
          (
            requireLive(`${property}()`) as unknown as Record<
              string,
              (...a: unknown[]) => unknown
            >
          )[property]!(...args);
      }
      switch (property) {
        case "on":
          return (event: never, handler: never) => {
            requireLive("on()").on(event, handler);
            return stablePage;
          };
        case "off":
          return (event: never, handler: never) => {
            // A listener belongs to the target it was attached to; removing
            // one from a superseded target is a no-op, not an error.
            binding?.page.off(event, handler);
            return stablePage;
          };
        case "setDefaultTimeout":
          return (timeoutMs: number) => {
            defaultTimeoutMs = timeoutMs;
            binding?.page.setDefaultTimeout(timeoutMs);
          };
        case "isClosed":
          return () => !binding || binding.page.isClosed();
        case "close":
          return () => session.close();
        case "keyboard":
          return new Proxy(
            {},
            {
              get(_keyboard, method) {
                if (typeof method !== "string" || method === "then")
                  return undefined;
                return (...args: unknown[]) =>
                  run(`keyboard.${method}()`, (page) =>
                    (
                      page.keyboard as unknown as Record<
                        string,
                        (...a: unknown[]) => unknown
                      >
                    )[method]!(...args),
                  );
              },
            },
          );
      }
      return (...args: unknown[]) =>
        run(`page.${property}()`, (page) =>
          (page as unknown as Record<string, (...a: unknown[]) => unknown>)[
            property
          ]!(...bindArgs(page, args)),
        );
    },
  });

  const session: PanelCdpSession & {
    [SCOPE_REF]: () => { kind: string; id: string };
  } = {
    protocol: "panel-cdp-session.v1",
    get generation() {
      return boundGeneration;
    },
    get receipt() {
      return receipt;
    },
    page: stablePage,
    close: async () => {
      const closing = binding;
      const pending = bindPending;
      binding = null;
      stale = true;
      epoch += 1;
      const controller = bindController;
      const candidate = bindCandidate;
      controller?.abort(sessionCloseError());
      const failures: unknown[] = [];
      for (const owned of new Set([closing, candidate])) {
        if (!owned) continue;
        try {
          await owned.close();
        } catch (error) {
          failures.push(error);
        }
      }
      // Abort and join an acquisition already in progress. Its caller still
      // receives its own cancellation/failure; close only waits for cleanup.
      if (pending) await pending.catch(() => undefined);
      if (bindPending === pending) {
        bindPending = null;
        bindController = null;
        bindCandidate = null;
      }
      if (failures.length === 1) throw failures[0];
      if (failures.length > 1) {
        throw new AggregateError(
          failures,
          "CDP session resources could not all be closed",
        );
      }
    },
    [SCOPE_REF]: () => ({
      kind: "panel-cdp-session",
      id,
    }),
  };

  const automation: CdpAutomation = {
    session: async () => {
      // An explicit acquisition re-observes even a live binding.
      stale = true;
      await ensureBound();
      return session;
    },
    consoleHistory: async (historyOptions?: PanelConsoleHistoryOptions) => {
      const history = await rpc.call<PanelConsoleHistoryResult>(
        "main",
        "panelCdp.consoleHistory",
        [id, historyOptions],
      );
      options.recordOperation?.({
        type: "consoleHistory",
        id,
        receipt: consoleHistoryReceipt(history, historyOptions),
      });
      return history;
    },
    getCdpEndpoint,
    stop: () => {
      return rpc.call<void>("main", "panelCdp.stop", [id]);
    },
    click: async (selector) => {
      await stablePage.locator(selector).click();
    },
    screenshot: async (screenshotOptions?: PanelScreenshotOptions) => {
      const image = await rpc.call<PanelScreenshotResult>(
        "main",
        "panelCdp.screenshot",
        [id, screenshotOptions],
      );
      options.recordOperation?.({
        type: "screenshot",
        id,
        receipt: {
          capturedAt: Date.now(),
          mimeType: image.mimeType,
          width: image.width,
          height: image.height,
          byteSize:
            (image.data.length * 3) / 4 -
            (image.data.endsWith("==") ? 2 : image.data.endsWith("=") ? 1 : 0),
        },
      });
      return image;
    },
  };
  panelSessions.set(automation, {
    session,
    invalidate: () => {
      epoch += 1;
      stale = true;
    },
  });
  return automation;
}

/** Internal session control for the owning panel runtime and eval host. */
const panelSessions = new WeakMap<
  CdpAutomation,
  { session: PanelCdpSession; invalidate(): void }
>();

/**
 * The panel's stable session without binding it: the eval host rehydrates a
 * persisted session through this, and it binds at its first operation.
 */
export function cdpSessionOf(cdp: CdpAutomation): PanelCdpSession {
  const entry = panelSessions.get(cdp);
  if (!entry) throw new Error("CDP automation has no panel session");
  return entry.session;
}

/**
 * The owning lifecycle (rebuild, navigate, reload, unload, archive) may change
 * the panel's generation: operations in flight are fenced and the next
 * operation re-observes before using the bound target.
 */
export function invalidateCdpGeneration(cdp: CdpAutomation): void {
  panelSessions.get(cdp)?.invalidate();
}
