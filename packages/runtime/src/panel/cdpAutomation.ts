import type { RpcClient } from "@vibestudio/rpc";
import type { Browser, CdpPage } from "@workspace/cdp-client";
import type {
  CdpAutomation,
  CdpEndpoint,
  PanelCdpGeneration,
  PanelCdpSession,
  PanelCdpSessionRefresh,
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

export type { CdpAutomation, CdpEndpoint };

type CdpClientModule = {
  BrowserImpl: { connect(ws: string, opts: object): Promise<Browser> };
};

const CDP_CLIENT_MODULE = "@workspace/cdp-client";

interface CdpAutomationOptions {
  recordOperation?: (entry: OperationJournalEntry) => void;
  operationSignal?: () => AbortSignal | undefined;
  kind?: "workspace" | "browser";
  requesterPanelId?: string | null;
  /** Closure-held module resolver used by confined hosted runtimes. */
  loadModule?: (id: string) => unknown | Promise<unknown>;
  navigate?: (url: string) => Promise<void>;
  navigateHistory?: (delta: -1 | 1) => Promise<void>;
  reload?: () => Promise<void>;
  observe?: () => Promise<PanelObservation>;
  /** Express active inspection demand without changing desktop focus. */
  ensureReady?: () => Promise<PanelObservation>;
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
        `Call handle.cdp.page() only from contexts that expose @workspace/cdp-client.`,
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
  const getCdpEndpoint = async (): Promise<CdpEndpoint> => {
    return rpc.call<CdpEndpoint>("main", "panelCdp.getCdpEndpoint", [id]);
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
          recovery: "use-panel-handle-lifecycle" as const,
          instruction: `Use ${lifecycleMethod}, then call session.refresh() before continuing with automation.`,
        },
      },
    );

  const connectPage = async (
    generation?: PanelCdpGeneration,
    kind = options.kind,
  ): Promise<CdpPage> => {
    const { BrowserImpl } = await loadCdpClient(options.loadModule);
    const endpoint = await getCdpEndpoint();
    const connectOptions: {
      isElectronWebview: boolean;
      preferFetchUpgrade: boolean;
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
          "handle.diagnose() and retry handle.cdp.page() once the panel is ready.",
      );
    }
    const navigationMethods = new Map<PropertyKey, string>([
      ["goto", "handle.navigate(...)"],
      ["reload", "handle.reload()"],
      ["goBack", "handle.navigate(...)"],
      ["goForward", "handle.navigate(...)"],
    ]);
    return new Proxy(resolvedPage as CdpPage & object, {
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

  let activeSession: PanelCdpSession | null = null;
  let sessionAcquisition: Promise<PanelCdpSession> | null = null;

  const ensureReady = (): Promise<PanelObservation> => {
    if (!options.observe) {
      throw new Error(
        "Generation-fenced CDP sessions are unavailable in this runtime; use a PanelHandle created by panelTree/openPanel.",
      );
    }
    return options.ensureReady ? options.ensureReady() : options.observe();
  };

  const createSession = async (): Promise<PanelCdpSession> => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      // A session is active inspection demand. Ensure residency/readiness here
      // without coupling automation to desktop focus.
      const observation = await ensureReady();
      const before = generationOf(observation);
      // A handle obtained synchronously by slot id can still carry an initial
      // workspace hint. Navigation policy belongs to the observed generation,
      // not that hint; the same slot can also change source kind over time.
      const page = await connectPage(before, observation.kind);
      const after = generationOf(await ensureReady());
      if (!sameGeneration(before, after)) {
        await page.close();
        continue;
      }

      let closed = false;
      let session!: PanelCdpSession;
      session = {
        protocol: "panel-cdp-session.v1",
        generation: after,
        page,
        refresh: async (): Promise<PanelCdpSessionRefresh> => {
          const current = generationOf(await ensureReady());
          if (sameGeneration(session.generation, current) && !page.isClosed()) {
            options.recordOperation?.({
              type: "cdp.session",
              id,
              receipt: { status: "current", generation: current },
            });
            return { status: "current", session };
          }
          await session.close();
          const replacement = await acquireSession();
          const status = sameGeneration(session.generation, current)
            ? ("reconnected" as const)
            : ("replaced" as const);
          options.recordOperation?.({
            type: "cdp.session",
            id,
            receipt: {
              status,
              generation: replacement.generation,
              previousGeneration: session.generation,
            },
          });
          if (sameGeneration(session.generation, current)) {
            return {
              status: "reconnected",
              generation: current,
              session: replacement,
            };
          }
          return {
            status: "replaced",
            previousGeneration: session.generation,
            session: replacement,
          };
        },
        close: async () => {
          if (closed) return;
          closed = true;
          try {
            await page.close();
          } finally {
            if (activeSession === session) activeSession = null;
          }
        },
      };
      activeSession = session;
      options.recordOperation?.({
        type: "cdp.session",
        id,
        receipt: { status: "acquired", generation: session.generation },
      });
      return session;
    }
    throw Object.assign(
      new Error(
        `Panel ${JSON.stringify(id)} changed generation during three CDP acquisitions`,
      ),
      {
        code: "panel_cdp_generation_churn",
        errorData: {
          code: "panel_cdp_generation_churn",
          panelId: id,
          recovery: {
            action: "reobserve",
            instruction:
              "Inspect the panel lifecycle before acquiring another CDP session.",
          },
        },
      },
    );
  };

  const acquireSession = (): Promise<PanelCdpSession> => {
    if (sessionAcquisition) return sessionAcquisition;
    const pending = (async () => {
      if (activeSession) {
        const current = generationOf(await ensureReady());
        if (
          sameGeneration(activeSession.generation, current) &&
          !activeSession.page.isClosed()
        ) {
          return activeSession;
        }
        await activeSession.close();
      }
      return createSession();
    })();
    sessionAcquisition = pending;
    const clearPending = () => {
      if (sessionAcquisition === pending) sessionAcquisition = null;
    };
    void pending.then(clearPending, clearPending);
    return pending;
  };

  return {
    page: async () => {
      if (options.observe || options.ensureReady) {
        const observation = await ensureReady();
        return connectPage(generationOf(observation), observation.kind);
      }
      return connectPage();
    },
    session: acquireSession,
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
    navigate: (url) => {
      if (!options.navigate)
        throw new Error("Panel navigation runtime is unavailable");
      return options.navigate(url);
    },
    goBack: () => {
      if (!options.navigateHistory) {
        throw new Error("Panel history navigation runtime is unavailable");
      }
      return options.navigateHistory(-1);
    },
    goForward: () => {
      if (!options.navigateHistory) {
        throw new Error("Panel history navigation runtime is unavailable");
      }
      return options.navigateHistory(1);
    },
    reload: () => {
      if (!options.reload)
        throw new Error("Panel reload runtime is unavailable");
      return options.reload();
    },
    stop: () => {
      return rpc.call<void>("main", "panelCdp.stop", [id]);
    },
    click: async (selector) => {
      const p = await connectPage();
      try {
        await p.locator(selector).click();
      } finally {
        await p.close();
      }
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
}
