export { CdpDownload } from "./src/download";
export type { BrowserPopup as CdpPopup } from "@vibestudio/shared/panel/browserAutomation";
import type { BrowserPopup as CdpPopup } from "@vibestudio/shared/panel/browserAutomation";
import type { CdpDownload } from "./src/download";
export { CdpRequest, CdpResponse } from "./src/network";
import type {
  CdpRequest,
  CdpResponse,
  CdpNetworkEvent,
  CdpNetworkEvents,
  CdpResponseMatcher,
} from "./src/network";
export type {
  CdpNetworkFailure,
  CdpNetworkEvent,
  CdpNetworkEvents,
  CdpResponseMatcher,
} from "./src/network";
// Public type surface for @workspace/cdp-client — a workerd-native
// CDP client with a Playwright-style Page/Locator API implemented over raw CDP.
// Kept in sync with src/worker.ts (the implementation for the worker/workerd and
// vibestudio-panel conditions).

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CdpViewportSize {
  width: number;
  height: number;
}

export interface CdpScreenshotOptions {
  type?: "png" | "jpeg";
  quality?: number;
  fullPage?: boolean;
}

export interface CdpProfileOptions {
  /** Human-readable operation name copied into the report. */
  label?: string;
  /** Disable the Chromium HTTP cache for this operation, then restore it. */
  disableCache?: boolean;
  /** Collect precise JS coverage. This adds profiler overhead and is off by default. */
  javascriptCoverage?: boolean;
  /** Number of slow network requests retained in the bounded report (default 20, max 100). */
  maxNetworkRecords?: number;
}

export interface SelectOptionMatcher {
  value?: string;
  label?: string;
  index?: number;
}

export interface CdpProfileRuntimeMetrics {
  taskDurationMs: number;
  scriptDurationMs: number;
  layoutDurationMs: number;
  styleRecalcDurationMs: number;
  layoutCount: number;
  styleRecalcCount: number;
  jsHeapUsedBytes: number;
  jsHeapDeltaBytes: number;
  nodes: number;
  documents: number;
}

export interface CdpProfilePageMetrics {
  navigation?: {
    ttfbMs: number;
    responseStartMs: number;
    domContentLoadedMs: number;
    loadMs: number;
  };
  firstContentfulPaintMs?: number;
  largestContentfulPaintMs?: number;
  cumulativeLayoutShift: number;
  layoutShiftCount: number;
  interactionLatencyMs?: number;
  longTasks: {
    count: number;
    totalDurationMs: number;
    maxDurationMs: number;
  };
}

export interface CdpProfileNetworkRequest {
  url: string;
  method: string;
  type: string;
  status?: number;
  mimeType?: string;
  durationMs?: number;
  transferBytes: number;
  fromCache: boolean;
  failedReason?: string;
}

export interface CdpProfileNetworkMetrics {
  requestCount: number;
  failedCount: number;
  cacheHits: number;
  transferBytes: number;
  resourceEncodedBytes: number;
  resourceDecodedBytes: number;
  byType: Record<string, { requestCount: number; transferBytes: number }>;
  slowest: CdpProfileNetworkRequest[];
}

export interface CdpProfileCoverageScript {
  url: string;
  totalBytes: number;
  usedBytes: number;
  unusedBytes: number;
}

export interface CdpProfileCoverage {
  scriptCount: number;
  totalBytes: number;
  usedBytes: number;
  unusedBytes: number;
  usedPercent: number;
  largestUnused: CdpProfileCoverageScript[];
}

export interface CdpProfileReport {
  version: 1;
  label?: string;
  url: string;
  startedAt: string;
  elapsedMs: number;
  runtime: CdpProfileRuntimeMetrics;
  page: CdpProfilePageMetrics;
  network: CdpProfileNetworkMetrics;
  coverage?: CdpProfileCoverage;
}

export interface CdpConsoleEvent {
  type: string;
  text: string;
  args: unknown[];
}

export interface CdpDomInspection {
  selector: string;
  found: boolean;
  tagName?: string;
  id?: string;
  className?: string;
  text?: string;
  role?: string;
  accessibleName?: string;
  visible?: boolean;
  attributes?: Record<string, string>;
  boundingBox?: BoundingBox;
  /** Nearest rendered ancestors first, for disambiguating repeated controls. */
  ancestors?: Array<{
    tagName: string;
    role: string;
    accessibleName: string;
    text: string;
  }>;
}

export type WaitState =
  | "attached"
  | "detached"
  | "visible"
  | "hidden"
  | "checked"
  | "unchecked";
export interface ActionOptions {
  timeout?: number;
}
export interface InteractionOptions extends ActionOptions {
  /** Observe one semantic locator state after the interaction completes. */
  expect?: {
    locator: CdpLocator;
    state?: WaitState;
    timeout?: number;
  };
}
export interface CdpInteractionOutcome {
  protocol: "cdp-interaction-outcome.v1";
  action:
    | "click"
    | "dblclick"
    | "fill"
    | "clear"
    | "selectOption"
    | "setInputFiles"
    | "focus"
    | "blur"
    | "selectText"
    | "scrollIntoView"
    | "dispatchEvent"
    | "press"
    | "hover"
    | "check"
    | "uncheck";
  delivery: "dispatched" | "not-needed";
  target: CdpDomInspection;
  effect:
    | { status: "not-asserted" }
    | {
        status: "observed" | "not-observed";
        locator: string;
        state: WaitState;
      };
}
export interface ByTextOptions {
  /** Case-sensitive whole-string matching. Strings otherwise match case-insensitive substrings. */
  exact?: boolean;
}
export type TextMatcher = string | RegExp;
export interface ByRoleOptions {
  /** String names identify the whole normalized accessible name; regex names search explicitly. */
  name?: TextMatcher;
  /** Defaults to true for string names. Set false for case-insensitive substring search. */
  exact?: boolean;
}

/**
 * A Playwright-style locator. Actions auto-wait for readiness and resolve
 * after their browser event turn, so the next action observes framework state.
 */
export type CdpFilePayload = {
  name: string;
  mimeType?: string;
  buffer: Uint8Array;
};

export interface CdpLocator {
  contentFrame(): CdpFrameLocator;
  // Scoping / chaining
  /** CSS, or `text=...` compiled into the same semantic engine as getByText. */
  locator(selector: string): CdpLocator;
  getByRole(role: string, options?: ByRoleOptions): CdpLocator;
  getByText(text: TextMatcher, options?: ByTextOptions): CdpLocator;
  getByLabel(text: TextMatcher, options?: ByTextOptions): CdpLocator;
  getByPlaceholder(text: TextMatcher, options?: ByTextOptions): CdpLocator;
  getByTestId(testId: string): CdpLocator;
  getByAltText(text: TextMatcher, options?: ByTextOptions): CdpLocator;
  getByTitle(text: TextMatcher, options?: ByTextOptions): CdpLocator;
  filter(options?: {
    hasText?: TextMatcher;
    hasTextExact?: boolean;
  }): CdpLocator;
  nth(index: number): CdpLocator;
  first(): CdpLocator;
  last(): CdpLocator;
  all(): Promise<CdpLocator[]>;
  // Actions (auto-waiting)
  click(opts?: InteractionOptions): Promise<CdpInteractionOutcome>;
  dblclick(opts?: InteractionOptions): Promise<CdpInteractionOutcome>;
  hover(opts?: ActionOptions): Promise<void>;
  fill(value: string, opts?: ActionOptions): Promise<void>;
  type(text: string, opts?: ActionOptions): Promise<void>;
  /** Upload portable bytes; an empty array clears the input. Hidden file inputs are supported. */
  setInputFiles(
    files: CdpFilePayload | CdpFilePayload[],
    opts?: ActionOptions,
  ): Promise<void>;
  clear(opts?: ActionOptions): Promise<void>;
  press(key: string, opts?: InteractionOptions): Promise<CdpInteractionOutcome>;
  check(opts?: InteractionOptions): Promise<CdpInteractionOutcome>;
  uncheck(opts?: InteractionOptions): Promise<CdpInteractionOutcome>;
  setChecked(
    checked: boolean,
    opts?: InteractionOptions,
  ): Promise<CdpInteractionOutcome>;
  selectOption(
    value: string | string[] | SelectOptionMatcher | SelectOptionMatcher[],
    opts?: ActionOptions,
  ): Promise<string[]>;
  focus(opts?: ActionOptions): Promise<void>;
  blur(opts?: ActionOptions): Promise<void>;
  selectText(opts?: ActionOptions): Promise<void>;
  scrollIntoViewIfNeeded(opts?: ActionOptions): Promise<void>;
  dispatchEvent(type: string, opts?: ActionOptions): Promise<void>;
  // State / reads
  waitFor(options?: { state?: WaitState; timeout?: number }): Promise<void>;
  count(): Promise<number>;
  /** Immediate snapshot; false when there is no current match. */
  isVisible(): Promise<boolean>;
  /** Immediate snapshot; false when there is no current match. */
  isChecked(opts?: ActionOptions): Promise<boolean>;
  /** Immediate snapshot; false when there is no current match. */
  isEnabled(opts?: ActionOptions): Promise<boolean>;
  /** Immediate snapshot; false when there is no current match. */
  isDisabled(opts?: ActionOptions): Promise<boolean>;
  /** Immediate snapshot; false when there is no current match. */
  isEditable(opts?: ActionOptions): Promise<boolean>;
  getAttribute(name: string, opts?: ActionOptions): Promise<string | null>;
  inputValue(opts?: ActionOptions): Promise<string>;
  /** Read rendered text once the element is attached; empty/zero-sized elements are valid. */
  innerText(opts?: ActionOptions): Promise<string>;
  textContent(): Promise<string | null>;
  allInnerTexts(): Promise<string[]>;
  allTextContents(): Promise<string[]>;
  evaluate<Result, Arg = unknown>(
    pageFunction: (element: Element, arg: Arg) => Result | Promise<Result>,
    arg?: Arg,
  ): Promise<Result>;
  evaluateAll<Result, Arg = unknown>(
    pageFunction: (elements: Element[], arg: Arg) => Result | Promise<Result>,
    arg?: Arg,
  ): Promise<Result>;
  boundingBox(): Promise<BoundingBox | null>;
  inspect(): Promise<CdpDomInspection>;
  /** Playwright-style description, e.g. `getByRole("button", { name: "Go" })`. */
  toString(): string;
}

/** A Playwright-style page bound to one CDP target. */
export interface CdpDialogData {
  type: "alert" | "confirm" | "prompt" | "beforeunload";
  message: string;
  defaultPrompt: string;
  url: string;
}

export class CdpDialog {
  readonly data: Readonly<CdpDialogData>;
  constructor(
    data: Readonly<CdpDialogData>,
    respond: (accept: boolean, promptText?: string) => Promise<void>,
  );
  type(): CdpDialogData["type"];
  message(): string;
  defaultValue(): string;
  accept(promptText?: string): Promise<void>;
  dismiss(): Promise<void>;
}

export interface CdpFrameLocator {
  locator(selector: string): CdpLocator;
  getByRole(role: string, options?: ByRoleOptions): CdpLocator;
  getByText(text: TextMatcher, options?: ByTextOptions): CdpLocator;
  getByLabel(text: TextMatcher, options?: ByTextOptions): CdpLocator;
  getByPlaceholder(text: TextMatcher, options?: ByTextOptions): CdpLocator;
  getByTestId(id: string): CdpLocator;
  getByAltText(text: TextMatcher, options?: ByTextOptions): CdpLocator;
  getByTitle(text: TextMatcher, options?: ByTextOptions): CdpLocator;
  frameLocator(selector: string): CdpFrameLocator;
  evaluate<Result, Arg = unknown>(
    fn: string | ((arg: Arg) => Result | Promise<Result>),
    arg?: Arg,
  ): Promise<Result>;
}

export interface CdpPage {
  waitForPopup(): Promise<CdpPopup>;
  waitForDownload(): Promise<CdpDownload>;
  downloads(): Promise<CdpDownload[]>;
  frameLocator(selector: string): CdpFrameLocator;
  on<K extends CdpNetworkEvent>(
    event: K,
    handler: (value: CdpNetworkEvents[K]) => void,
  ): this;
  off<K extends CdpNetworkEvent>(
    event: K,
    handler: (value: CdpNetworkEvents[K]) => void,
  ): this;
  requests(): CdpRequest[];
  waitForResponse(matcher: CdpResponseMatcher): Promise<CdpResponse>;
  dialog(): CdpDialog | null;
  on(
    event: "dialog",
    handler: (dialog: CdpDialog) => void | Promise<void>,
  ): this;
  off(
    event: "dialog",
    handler: (dialog: CdpDialog) => void | Promise<void>,
  ): this;
  goto(url: string): Promise<unknown>;
  reload(): Promise<void>;
  goBack(): Promise<void>;
  goForward(): Promise<void>;
  title(): Promise<string>;
  /** Playwright-compatible synchronous current URL. Do not await or attach `.catch()`. */
  url(): string;
  content(): Promise<string>;
  /** Set a caller-selected deadline for actions/reads. Default: no deadline; zero disables it. */
  setDefaultTimeout(timeoutMs: number): void;
  /** Emulate a CSS viewport on the current target. */
  setViewportSize(viewportSize: CdpViewportSize): Promise<void>;
  /** Current configured or observed CSS viewport. */
  viewportSize(): CdpViewportSize | null;
  /**
   * Profile one exact reload or interaction. Await readiness/settling inside
   * the callback so the bounded JSON report matches the intended UX boundary.
   */
  profile(
    action: () => unknown | Promise<unknown>,
    options?: CdpProfileOptions,
  ): Promise<CdpProfileReport>;
  /** Evaluate in the page; an explicit timeout is forwarded to Chrome. */
  evaluate<Result = unknown, Arg = unknown>(
    pageFunction: string | ((arg: Arg) => Result | Promise<Result>),
    arg?: Arg,
    options?: { timeout?: number; operation?: string },
  ): Promise<Result>;
  /**
   * Find by CSS or `text=...`. A quoted JSON string is exact text; unquoted
   * text is substring matching. Prefer getBy* helpers for resilient locators.
   */
  locator(selector: string): CdpLocator;
  /** Find by ARIA role, optionally narrowed by accessible name. */
  getByRole(role: string, options?: ByRoleOptions): CdpLocator;
  getByText(text: TextMatcher, options?: ByTextOptions): CdpLocator;
  getByLabel(text: TextMatcher, options?: ByTextOptions): CdpLocator;
  getByPlaceholder(text: TextMatcher, options?: ByTextOptions): CdpLocator;
  getByTestId(testId: string): CdpLocator;
  getByAltText(text: TextMatcher, options?: ByTextOptions): CdpLocator;
  getByTitle(text: TextMatcher, options?: ByTextOptions): CdpLocator;
  waitForTimeout(timeout: number): Promise<void>;
  waitForFunction(
    pageFunction: string | ((arg?: unknown) => unknown),
    arg?: unknown,
    options?: { timeout?: number; polling?: number | "raf" },
  ): Promise<unknown>;
  waitForLoadState(
    state?: "load" | "domcontentloaded" | "networkidle",
    options?: { timeout?: number },
  ): Promise<void>;
  waitForSelector(
    selector: string,
    options?: { state?: WaitState; timeout?: number },
  ): Promise<CdpLocator | null>;
  keyboard: {
    down(key: string): Promise<void>;
    up(key: string): Promise<void>;
    press(key: string): Promise<void>;
    type(text: string): Promise<void>;
    insertText(text: string): Promise<void>;
  };
  /** Alias for `keyboard.press(key)`. */
  pressKey(key: string): Promise<void>;
  consoleEvents(): CdpConsoleEvent[];
  clearConsoleEvents(): void;
  screenshot(options?: CdpScreenshotOptions): Promise<Uint8Array>;
  /** Disconnect this automation client. The owning panel remains open. */
  close(): Promise<void>;
  /** True after client close, bridge replacement, transport loss, or command timeout. */
  isClosed(): boolean;
}

/** Low-level raw CDP connection. Use for protocol-level work beyond the Page API. */
export class CdpConnection {
  dialog(): CdpDialog | null;
  onDialog(handler: (dialog: CdpDialog) => void | Promise<void>): () => void;
  static connect(
    wsEndpoint: string,
    authToken?: string,
    preferFetchUpgrade?: boolean,
    options?: {
      signal?: AbortSignal;
      operationSignal?: () => AbortSignal | undefined;
    },
  ): Promise<CdpConnection>;
  send(
    method: string,
    params?: Record<string, unknown>,
    sessionId?: string,
  ): Promise<unknown>;
  onClosed(listener: (error: Error) => void): () => void;
  onDisconnect(listener: (error: Error) => void): () => void;
  session(id: string): CdpSession;
  on(
    method: string,
    listener: (params: unknown) => void,
    sessionId?: string,
  ): () => void;
  close(): void;
  isClosed(): boolean;
}

export class CdpSession {
  readonly id: string;
  send(method: string, params?: Record<string, unknown>): Promise<unknown>;
  on(method: string, listener: (params: unknown) => void): () => void;
  onClosed(listener: (error: Error) => void): () => void;
  onDisconnect(listener: (error: Error) => void): () => void;
  session(id: string): CdpSession;
  dialog(): CdpDialog | null;
  onDialog(handler: (dialog: CdpDialog) => void | Promise<void>): () => void;
  close(): void;
  isClosed(): boolean;
}

export interface CdpInspectionIdentity {
  panelId: string;
  attemptId: string;
  runtimeEntityId: string;
  buildKey: string | null;
}

/** Bounded live observation collected after failure; it never changes the action outcome. */
export type CdpLocatorEvidence = { session?: CdpInspectionIdentity } & (
  | {
      status: "captured";
      capturedAt: number;
      url: string;
      urlTruncated: boolean;
      matchCount: number;
      matchesTruncated: boolean;
      matches: Array<{
        tagName: string;
        role: string;
        accessibleName: string;
        accessibleNameTruncated: boolean;
        text: string;
        textTruncated: boolean;
        visible: boolean;
        enabled: boolean;
        checked: boolean | null;
      }>;
      snapshot: {
        scope: "container" | "page";
        scopeCount: number;
        text: string;
        totalChars: number;
        truncated: boolean;
      };
    }
  | { status: "unavailable"; reason: string }
);

export interface CdpFailureData {
  code:
    | "cdp_target_connection_failed"
    | "cdp_target_closed"
    | "cdp_protocol_error"
    | "cdp_evaluation_timeout"
    | "cdp_evaluation_failed"
    | "cdp_readiness_exhausted"
    | "cdp_locator_operation_failed"
    | "cdp_locator_not_actionable"
    | "cdp_locator_state_mismatch"
    | "cdp_locator_ambiguous"
    | "cdp_interaction_outcome_not_observed"
    | "cdp_workspace_navigation_forbidden"
    | "cdp_dialog_open"
    | "cdp_dialog_closed";
  operation: string;
  failureKind: "user-code" | "infrastructure";
  recovery:
    | "correct-page-function"
    | "reobserve-locator"
    | "reacquire-page"
    | "inspect-panel-and-reacquire-page"
    | "use-panel-handle-lifecycle"
    | "handle-dialog-and-observe";
  locator?: string;
  timeoutMs?: number;
  /** Completed readiness observations, including the initial observation. */
  observations?: number;
  maxObservations?: number;
  state?: WaitState;
  expectedLocator?: string;
  matchCount?: number;
  candidates?: Array<{ role: string; accessibleName: string; tagName: string }>;
  instruction?: string;
  dialog?: Readonly<CdpDialogData>;
  evidence?: CdpLocatorEvidence;
}

/** Structured error thrown by CDP evaluation, connection, and locator operations. */
export class CdpError extends Error {
  readonly locator?: string;
  readonly code: CdpFailureData["code"];
  readonly errorKind: "application" | "infrastructure";
  readonly errorData: CdpFailureData;
  constructor(
    message: string,
    options?: {
      cause?: unknown;
      locator?: string;
      code?: CdpFailureData["code"];
      operation?: string;
      failureKind?: CdpFailureData["failureKind"];
      recovery?: CdpFailureData["recovery"];
      timeoutMs?: number;
      observations?: number;
      maxObservations?: number;
      state?: WaitState;
      expectedLocator?: string;
      matchCount?: number;
      candidates?: CdpFailureData["candidates"];
      instruction?: string;
      dialog?: Readonly<CdpDialogData>;
      evidence?: CdpLocatorEvidence;
    },
  );
}

export interface Browser {
  contexts(): Array<{ pages(): CdpPage[] }>;
  close(): Promise<void>;
}

export const BrowserImpl: {
  connect(
    wsEndpoint: string,
    options?: {
      transportOptions?: { authToken?: string };
      /** Hosted EvalDO runtimes must use the egress-aware fetch upgrade. */
      preferFetchUpgrade?: boolean;
      /** Cancels connection acquisition; the connected browser owns its lifetime. */
      signal?: AbortSignal;
      operationSignal?: () => AbortSignal | undefined;
      /** Observe completed input outcomes independently of caller return projections. */
      onInteraction?: (outcome: CdpInteractionOutcome) => void;
      inspectionIdentity?: CdpInspectionIdentity;
      browserOperation?: import("./src/download").BrowserOperation;
    },
  ): Promise<Browser>;
};

export type Options = {
  headless?: boolean;
};

export function connect(
  wsEndpoint: string,
  browserName: string,
  options?: Options & { authToken?: string },
): Promise<Browser>;
