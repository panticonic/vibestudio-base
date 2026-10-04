import { afterEach, describe, expect, it, vi } from "vitest";
import { runInNewContext } from "node:vm";

import { BrowserImpl, CdpConnection, CdpError } from "./worker";
import { webSocketAuthProtocol } from "@vibestudio/rpc/protocol/webSocketAuthProtocol";

/**
 * Fake CDP transport. Understands two kinds of Runtime.evaluate:
 *  - direct arrow-function evals (title/url/content/readyState), matched by substring;
 *  - op evals of the form `(async function(P){ <INPAGE> ... })(<JSON>)`, whose trailing
 *    JSON payload `{op, descriptor, arg, ...}` is decoded and simulated against a tiny
 *    fixed DOM.
 * Records every dispatched CDP method so pointer/key actions can be asserted.
 */
class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static sent: Array<{ method: string; params?: Record<string, unknown> }> = [];
  static dropMethods = new Set<string>();
  static rejectMethods = new Map<string, string>();
  static evaluationException: {
    text: string;
    exception: { description: string };
  } | null = null;
  static emitNavigationEventBeforeResponse = false;
  static deferNextClickEffect = false;
  static deferNextCheckPolls = 0;
  static dropFailureEvidence = false;

  private listeners = new Map<
    string,
    Set<(event: { data?: string }) => void>
  >();
  private nextTitle = "Example";
  private nextUrl = "https://example.com/current";
  private html = "<html><body>Hello</body></html>";
  private inputValue = "";
  private checked = false;
  private checking = false;
  private pendingChecked = false;
  private revealAfterLocatorEvaluation = false;
  private revealed = false;
  closed = false;

  constructor(
    readonly url: string,
    readonly protocols?: string | string[],
  ) {
    FakeWebSocket.instances.push(this);
    setTimeout(() => this.dispatch("open", {}), 0);
  }

  addEventListener(
    event: string,
    handler: (event: { data?: string }) => void,
  ): void {
    const listeners = this.listeners.get(event) ?? new Set();
    listeners.add(handler);
    this.listeners.set(event, listeners);
  }
  removeEventListener(
    event: string,
    handler: (event: { data?: string }) => void,
  ): void {
    this.listeners.get(event)?.delete(handler);
  }

  send(raw: string): void {
    const message = JSON.parse(raw) as {
      id?: number;
      type?: string;
      method?: string;
      params?: Record<string, unknown>;
      sessionId?: string;
    };
    if (typeof message.id !== "number") return;
    if (message.method)
      FakeWebSocket.sent.push({
        method: message.method,
        params: message.params,
      });
    if (message.method && FakeWebSocket.dropMethods.has(message.method)) return;
    if (
      FakeWebSocket.dropFailureEvidence &&
      message.method === "Runtime.evaluate" &&
      String(message.params?.["expression"]).includes('"op":"failureEvidence"')
    )
      return;
    const rejection =
      message.method && FakeWebSocket.rejectMethods.get(message.method);
    if (rejection) {
      setTimeout(
        () =>
          this.dispatch("message", {
            data: JSON.stringify({
              id: message.id,
              ...(message.sessionId ? { sessionId: message.sessionId } : {}),
              error: { message: rejection },
            }),
          }),
        0,
      );
      return;
    }
    if (
      message.method === "Input.dispatchMouseEvent" &&
      message.params?.["type"] === "mouseReleased" &&
      this.checking
    ) {
      if (FakeWebSocket.deferNextCheckPolls > 0) {
        this.pendingChecked = !this.checked;
      } else {
        this.checked = !this.checked;
      }
      this.checking = false;
    }
    if (
      message.method === "Input.dispatchMouseEvent" &&
      message.params?.["type"] === "mouseReleased" &&
      FakeWebSocket.deferNextClickEffect
    ) {
      this.revealAfterLocatorEvaluation = true;
      FakeWebSocket.deferNextClickEffect = false;
    }
    if (message.method === "Runtime.enable") {
      setTimeout(
        () =>
          this.dispatch("message", {
            data: JSON.stringify({
              method: "Runtime.consoleAPICalled",
              params: {
                type: "log",
                args: [{ value: "ready" }, { value: 42 }],
              },
            }),
          }),
        0,
      );
    }
    const result = this.resultFor(message.method, message.params);
    if (
      message.method === "Page.navigate" &&
      FakeWebSocket.emitNavigationEventBeforeResponse
    ) {
      this.dispatch("message", {
        data: JSON.stringify({
          method: "Page.loadEventFired",
          params: { timestamp: 0 },
        }),
      });
    }
    setTimeout(() => {
      if (
        message.method === "Runtime.evaluate" &&
        String(message.params?.["expression"] ?? "").includes("__nsRun") &&
        this.revealAfterLocatorEvaluation
      ) {
        this.revealAfterLocatorEvaluation = false;
        this.revealed = true;
      }
      this.dispatch("message", {
        data: JSON.stringify({ id: message.id, result }),
      });
    }, 0);
    if (message.method === "Page.navigate") {
      // Real Chrome fires the load lifecycle event AFTER the navigate response. Emit it after the
      // response (queued later) so the client's navigation-settled wait — which goto() only registers
      // once it has awaited the navigate response — actually catches it instead of hanging to timeout.
      if (!FakeWebSocket.emitNavigationEventBeforeResponse) {
        setTimeout(
          () =>
            this.dispatch("message", {
              data: JSON.stringify({
                method: "Page.loadEventFired",
                params: { timestamp: 0 },
              }),
            }),
          0,
        );
      }
    }
  }

  emitRawFrame(data: string): void {
    this.dispatch("message", { data });
  }

  emitCdpResponse(id: number, result: unknown): void {
    this.dispatch("message", { data: JSON.stringify({ id, result }) });
  }

  close(): void {
    this.closed = true;
    this.dispatch("close", {});
  }

  remoteClose(): void {
    this.closed = true;
    this.dispatch("close", {});
  }

  emitCdpEvent(method: string, params: Record<string, unknown> = {}): void {
    this.dispatch("message", {
      data: JSON.stringify({ method, params }),
    });
  }

  private resultFor(
    method?: string,
    params?: Record<string, unknown>,
  ): unknown {
    if (method === "Page.getFrameTree")
      return { frameTree: { frame: { id: "main" } } };
    if (method === "Page.navigate") {
      this.nextUrl = (params?.["url"] as string) ?? this.nextUrl;
      return {};
    }
    if (method === "Page.getNavigationHistory") {
      return { currentIndex: 1, entries: [{ id: 0 }, { id: 1 }, { id: 2 }] };
    }
    if (method === "Page.captureScreenshot") return { data: "AAAA" };
    if (method !== "Runtime.evaluate") return {};
    if (FakeWebSocket.evaluationException) {
      return { exceptionDetails: FakeWebSocket.evaluationException };
    }

    const expression = (params?.["expression"] as string) ?? "";
    if (expression.includes("boom-marker")) {
      return {
        exceptionDetails: {
          text: "Uncaught",
          url: "https://example.com/panel.js",
          lineNumber: 11,
          columnNumber: 6,
          exception: {
            description:
              "ReferenceError: boom-marker is not defined\n    at save (https://example.com/panel.js:12:7)",
          },
        },
      };
    }
    // Op-protocol eval: decode the trailing JSON payload and simulate __nsRun.
    if (expression.includes("__nsRun")) {
      return { result: { value: this.runOp(expression) } };
    }
    // Direct arrow-function evals.
    if (expression.includes("location.href"))
      return { result: { value: this.nextUrl } };
    if (expression.includes("window.innerWidth")) {
      return { result: { value: { width: 1280, height: 720 } } };
    }
    if (expression.includes("document.title"))
      return { result: { value: this.nextTitle } };
    if (expression.includes("document.readyState"))
      return { result: { value: true } };
    if (expression.includes("document.documentElement"))
      return { result: { value: this.html } };
    return { result: { value: undefined } };
  }

  private runOp(expression: string): unknown {
    const marker = "})(";
    const start = expression.lastIndexOf(marker) + marker.length;
    const end = expression.lastIndexOf(")");
    const payload = JSON.parse(expression.slice(start, end)) as {
      op: string;
      arg: {
        name?: string;
        value?: string;
        values?: Array<
          string | { value?: string; label?: string; index?: number }
        >;
        checked?: boolean;
        retainToken?: string;
        token?: string;
      } | null;
      descriptor: { steps: Array<Record<string, unknown>> };
      state?:
        | "attached"
        | "detached"
        | "visible"
        | "hidden"
        | "checked"
        | "unchecked"
        | null;
    };
    const targetsMissing = payload.descriptor.steps.some(
      (s) =>
        (s["by"] === "testid" && s["value"] === "missing") ||
        (s["by"] === "role" && s["name"] === "Revealed" && !this.revealed) ||
        (s["by"] === "role" &&
          (s["name"] === "Done" ||
            s["name"] === "Completed" ||
            s["name"] === "Add another column")),
    );
    const requiredState = {
      waitFor: payload.state ?? "visible",
      innerText: "attached",
      inputValue: "attached",
      getAttribute: "attached",
      evaluate: "attached",
      fill: "visible",
      clear: "visible",
      selectOption: "visible",
      focus: "visible",
      blur: "attached",
      scrollIntoView: "attached",
      selectText: "visible",
      dispatchEvent: "attached",
      focusForKey: "visible",
    }[payload.op];
    if (targetsMissing && requiredState) {
      return {
        __nsLocatorFailure: "state-timeout",
        state: requiredState,
        timeout: 30_000,
      };
    }
    const actionOutcome = (value: unknown) => ({
      __nsActionOutcome: true,
      value,
      target: {
        found: true,
        tagName: "INPUT",
        role: "textbox",
        accessibleName: "Name",
        text: "",
        visible: true,
        id: "input",
        className: "",
        attributes: {},
        boundingBox: { x: 0, y: 0, width: 100, height: 20 },
        ancestors: [],
      },
    });
    switch (payload.op) {
      case "failureEvidence":
        return {
          capturedAt: 123,
          url: this.nextUrl,
          urlTruncated: false,
          matchCount: targetsMissing ? 0 : 1,
          matchesTruncated: false,
          matches: [],
          snapshot: {
            scope: "page",
            scopeCount: 1,
            text: "0 tasks left",
            totalChars: 12,
            truncated: false,
          },
        };
      case "probe":
        if (payload.arg?.retainToken) this.checking = true;
        return targetsMissing
          ? { ok: false, reason: "not found" }
          : {
              ok: true,
              x: 50,
              y: 10,
              box: { x: 0, y: 0, width: 100, height: 20 },
            };
      case "waitFor":
        if (payload.state === "checked" || payload.state === "unchecked") {
          return this.checked === (payload.state === "checked")
            ? true
            : {
                __nsLocatorFailure: "state-timeout",
                state: payload.state,
              };
        }
        return true;
      case "count":
        return 1;
      case "exists":
        return true;
      case "isVisible":
      case "isEnabled":
      case "isEditable":
        return !targetsMissing;
      case "checkedState":
        return this.checked;
      case "retainedCheckedState":
        return this.checked;
      case "retainedCheckedStateEquals":
        if (FakeWebSocket.deferNextCheckPolls > 0) {
          FakeWebSocket.deferNextCheckPolls -= 1;
          if (FakeWebSocket.deferNextCheckPolls === 0)
            this.checked = this.pendingChecked;
        }
        return this.checked === payload.arg?.checked
          ? true
          : {
              __nsLocatorFailure: "state-timeout",
              state: payload.arg?.checked ? "checked" : "unchecked",
            };
      case "releaseRetainedElement":
        return true;
      case "isChecked":
        return this.checked;
      case "isDisabled":
        return false;
      case "textContent":
        return "Hello text";
      case "innerText":
        return "Hello";
      case "inputValue":
        return this.inputValue;
      case "getAttribute":
        return payload.arg?.name === "id" ? "main" : null;
      case "boundingBox":
        return { x: 0, y: 0, width: 100, height: 20 };
      case "allTextContents":
        return ["Hello text"];
      case "allInnerTexts":
        return ["Hello"];
      case "evaluateAll":
        return ["Hello"];
      case "evaluate":
        return "<strong>Hello</strong>";
      case "roleCandidates":
        if (
          payload.descriptor.steps.some((step) => step["name"] === "Completed")
        ) {
          return [
            { role: "radio", accessibleName: "Completed" },
            { role: "tab", accessibleName: "Completed" },
          ];
        }
        return [
          { role: "button", accessibleName: "All 5" },
          { role: "button", accessibleName: "Open 2" },
          { role: "button", accessibleName: "Done 3" },
        ];
      case "inspect":
        return {
          found: true,
          tagName: "BODY",
          id: "",
          className: "ready",
          text: "Hello",
          role: "document",
          accessibleName: "Hello",
          visible: true,
          attributes: { class: "ready" },
          boundingBox: { x: 0, y: 0, width: 100, height: 20 },
          ancestors: [
            {
              tagName: "MAIN",
              role: "main",
              accessibleName: "Example panel",
              text: "Example panel Hello",
            },
          ],
        };
      case "fill":
        this.inputValue = payload.arg?.value ?? "";
        return actionOutcome(true);
      case "clear":
        this.inputValue = "";
        return actionOutcome(true);
      case "selectOption":
        return actionOutcome(payload.arg?.values ?? []);
      case "setInputFiles":
      case "focus":
      case "blur":
      case "scrollIntoView":
      case "selectText":
      case "dispatchEvent":
        return actionOutcome(true);
      case "focusForKey":
        return true;
      default:
        return undefined;
    }
  }

  private dispatch(event: string, payload: { data?: string }): void {
    for (const listener of this.listeners.get(event) ?? []) listener(payload);
  }
}

function installFakeWebSocket(): void {
  Object.defineProperty(globalThis, "WebSocket", {
    configurable: true,
    writable: true,
    value: FakeWebSocket,
  });
}

describe("worker CDP client", () => {
  const originalWebSocket = globalThis.WebSocket;
  const originalFetch = globalThis.fetch;
  const originalWebSocketPair = (globalThis as Record<string, unknown>)[
    "WebSocketPair"
  ];

  afterEach(() => {
    vi.useRealTimers();
    FakeWebSocket.instances = [];
    FakeWebSocket.sent = [];
    FakeWebSocket.dropMethods.clear();
    FakeWebSocket.rejectMethods.clear();
    FakeWebSocket.evaluationException = null;
    FakeWebSocket.emitNavigationEventBeforeResponse = false;
    FakeWebSocket.deferNextClickEffect = false;
    FakeWebSocket.deferNextCheckPolls = 0;
    FakeWebSocket.dropFailureEvidence = false;
    vi.restoreAllMocks();
    Object.defineProperty(globalThis, "WebSocket", {
      configurable: true,
      writable: true,
      value: originalWebSocket,
    });
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      writable: true,
      value: originalFetch,
    });
    Object.defineProperty(globalThis, "WebSocketPair", {
      configurable: true,
      writable: true,
      value: originalWebSocketPair,
    });
  });

  it("uploads portable file bytes through hidden file inputs and keeps them out of interaction receipts", async () => {
    installFakeWebSocket();
    const receipts: unknown[] = [];
    const browser = await BrowserImpl.connect("ws://cdp", {
      onInteraction: (value) => receipts.push(value),
    });
    const page = browser.contexts()[0]!.pages()[0]!;
    await page.locator("#upload").setInputFiles({
      name: "note.txt",
      mimeType: "text/plain",
      buffer: new Uint8Array([0, 255, 65]),
    });
    const expression = FakeWebSocket.sent
      .filter((e) => e.method === "Runtime.evaluate")
      .map((e) => String(e.params?.["expression"]))
      .find((e) => e.includes('"op":"setInputFiles"'))!;
    const events: string[] = [];
    const input = {
      tagName: "INPUT",
      type: "file",
      multiple: false,
      attributes: [],
      files: [] as unknown[],
      getAttribute: () => null,
      querySelectorAll: () => [],
      getBoundingClientRect: () => ({ x: 0, y: 0, width: 0, height: 0 }),
      dispatchEvent: (event: Event) => {
        events.push(event.type);
      },
    };
    class Transfer {
      files: unknown[] = [];
      items = { add: (file: unknown) => this.files.push(file) };
    }
    await runInNewContext(expression, {
      document: { querySelectorAll: () => [input] },
      DataTransfer: Transfer,
      File,
      Uint8Array,
      atob,
      Event,
      setTimeout,
      getComputedStyle: () => ({ display: "none" }),
    });
    const file = input.files[0] as File;
    expect(file.name).toBe("note.txt");
    expect(file.type).toBe("text/plain");
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(
      new Uint8Array([0, 255, 65]),
    );
    expect(events).toEqual(["input", "change"]);
    expect(JSON.stringify(receipts)).not.toContain("AP9B");
    await page.locator("#upload").setInputFiles([]);
    const clear = FakeWebSocket.sent
      .filter((e) => e.method === "Runtime.evaluate")
      .map((e) => String(e.params?.["expression"]))
      .filter((e) => e.includes('"op":"setInputFiles"'))
      .at(-1)!;
    await runInNewContext(clear, {
      document: { querySelectorAll: () => [input] },
      DataTransfer: Transfer,
      File,
      Uint8Array,
      atob,
      Event,
      setTimeout,
      getComputedStyle: () => ({ display: "none" }),
    });
    expect(input.files).toEqual([]);
    input.type = "text";
    await expect(
      runInNewContext(clear, { document: { querySelectorAll: () => [input] } }),
    ).rejects.toThrow("input of type file");
    await expect(
      page.locator("#upload").setInputFiles("/tmp/private" as never),
    ).rejects.toThrow("payloads");
    await browser.close();
  });

  it("matches UI text without treating CSS, scripts, or their hidden containers as content", async () => {
    installFakeWebSocket();
    const browser = await BrowserImpl.connect("ws://cdp");
    const page = browser.contexts()[0]!.pages()[0]!;
    await page.getByText("1").count();
    const expression = FakeWebSocket.sent
      .filter((entry) => entry.method === "Runtime.evaluate")
      .map((entry) => String(entry.params?.["expression"] ?? ""))
      .find((value) => value.includes('"op":"count"'))!;
    const leaf = (tagName: string, textContent: string) => ({
      tagName,
      textContent,
      innerText: textContent,
      querySelectorAll: () => [],
    });
    const sourceNodes = [
      "STYLE",
      "SCRIPT",
      "TEMPLATE",
      "NOSCRIPT",
      "TITLE",
      "HEAD",
    ].map((tag) => leaf(tag, "source 1: height: 100dvh"));
    const hiddenContainer = {
      ...leaf("DIV", "source 1: height: 100dvh"),
      childNodes: [sourceNodes[0]],
      querySelectorAll: () => [sourceNodes[0]],
    };
    const document = {
      querySelectorAll: () => [
        ...sourceNodes,
        hiddenContainer,
        leaf("SPAN", "1"),
      ],
    };
    await expect(runInNewContext(expression, { document })).resolves.toBe(1);
    await browser.close();
  });

  it("finds HTML dialogs by their implicit role and accessible name", async () => {
    installFakeWebSocket();
    const browser = await BrowserImpl.connect("ws://cdp");
    const page = browser.contexts()[0]!.pages()[0]!;
    await page
      .getByRole("dialog", { name: "Create board", exact: true })
      .count();
    const expression = FakeWebSocket.sent
      .filter((entry) => entry.method === "Runtime.evaluate")
      .map((entry) => String(entry.params?.["expression"] ?? ""))
      .find((value) => value.includes('"op":"count"'))!;
    const dialog = {
      tagName: "DIALOG",
      getAttribute: (name: string) =>
        name === "aria-label" ? "Create board" : null,
    };
    await expect(
      runInNewContext(expression, {
        document: { querySelectorAll: () => [dialog] },
      }),
    ).resolves.toBe(1);
    await browser.close();
  });

  it("resolves associated and ARIA labels on output elements without treating plain button text as a label", async () => {
    installFakeWebSocket();
    const browser = await BrowserImpl.connect("ws://cdp");
    const page = browser.contexts()[0]!.pages()[0]!;
    await page.getByLabel("Counter value", { exact: true }).count();
    const expression = FakeWebSocket.sent
      .filter((entry) => entry.method === "Runtime.evaluate")
      .map((entry) => String(entry.params?.["expression"] ?? ""))
      .find((value) => value.includes('"op":"count"'))!;
    const node = (
      tagName: string,
      attributes: Record<string, string>,
      innerText = "",
    ) => ({
      tagName,
      innerText,
      getAttribute: (name: string) => attributes[name] ?? null,
      labels: [] as unknown[],
    });
    const ariaLabel = node("OUTPUT", { "aria-label": "Counter value" });
    const ariaLabelledby = node("OUTPUT", {
      "aria-labelledby": "counter-label",
    });
    const associated = node("OUTPUT", {});
    associated.labels = [
      {
        cloneNode: () => ({
          innerText: "Counter value",
          querySelectorAll: () => [],
        }),
      },
    ];
    const plainButton = node("BUTTON", {}, "Counter value");
    const document = {
      querySelectorAll: () => [
        ariaLabel,
        ariaLabelledby,
        associated,
        plainButton,
      ],
      getElementById: (id: string) =>
        id === "counter-label" ? node("SPAN", {}, "Counter value") : null,
    };
    await expect(runInNewContext(expression, { document })).resolves.toBe(3);
    await browser.close();
  });

  it("uses the Workers fetch-upgrade transport when WebSocket is not global", async () => {
    Object.defineProperty(globalThis, "WebSocket", {
      configurable: true,
      writable: true,
      value: undefined,
    });
    const socket = new FakeWebSocket("ws://cdp");
    const accept = vi.fn();
    Object.assign(socket, { accept });
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        ({
          status: 101,
          webSocket: socket,
        }) as unknown as Response,
    );
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      writable: true,
      value: fetchMock,
    });

    const connection = await CdpConnection.connect("ws://cdp", "token");
    await expect(connection.send("Runtime.evaluate", {})).resolves.toEqual({
      result: { value: undefined },
    });

    const [upgradeUrl, init] = fetchMock.mock.calls[0]!;
    expect(init).toMatchObject({ headers: { Upgrade: "websocket" } });
    expect(init?.signal).toBeUndefined();
    const parsedUpgradeUrl = new URL(String(upgradeUrl));
    const encodedHeaders = parsedUpgradeUrl.searchParams.get(
      "__vibestudio_ws_headers",
    );
    expect(encodedHeaders).toBeTruthy();
    const normalized = encodedHeaders!.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      "=",
    );
    expect(JSON.parse(atob(padded))).toEqual([
      ["x-vibestudio-cdp-grant", "token"],
    ]);
    parsedUpgradeUrl.searchParams.delete("__vibestudio_ws_headers");
    expect(parsedUpgradeUrl).toEqual(new URL("http://cdp/"));
    expect(accept).toHaveBeenCalledOnce();
  });

  it("uses fetch upgrades in workerd even when a global WebSocket exists", async () => {
    installFakeWebSocket();
    Object.defineProperty(globalThis, "WebSocketPair", {
      configurable: true,
      writable: true,
      value: class WebSocketPair {},
    });
    const socket = new FakeWebSocket("ws://cdp");
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        ({
          status: 101,
          webSocket: socket,
        }) as unknown as Response,
    );
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      writable: true,
      value: fetchMock,
    });

    const connection = await CdpConnection.connect("ws://cdp", "token");
    await expect(connection.send("Runtime.evaluate", {})).resolves.toEqual({
      result: { value: undefined },
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(FakeWebSocket.instances[0]).toBe(socket);
  });

  it("scopes child session events and failures without closing the parent", async () => {
    installFakeWebSocket();
    const connection = await CdpConnection.connect("ws://cdp");
    const socket = FakeWebSocket.instances[0]!;
    const child = connection.session("child");
    const observed = vi.fn(),
      root = vi.fn();
    child.on("Page.loadEventFired", observed);
    connection.on("Page.loadEventFired", root);
    socket.emitRawFrame(
      JSON.stringify({
        method: "Page.loadEventFired",
        sessionId: "child",
        params: { timestamp: 1 },
      }),
    );
    await vi.waitFor(() => expect(observed).toHaveBeenCalledOnce());
    expect(root).not.toHaveBeenCalled();
    FakeWebSocket.dropMethods.add("Runtime.evaluate");
    const pending = child.send("Runtime.evaluate", {});
    const rejected = expect(pending).rejects.toThrow("detached");
    socket.emitRawFrame(
      JSON.stringify({
        method: "Target.detachedFromTarget",
        params: { sessionId: "child" },
      }),
    );
    await rejected;
    expect(child.isClosed()).toBe(true);
    expect(connection.isClosed()).toBe(false);
    FakeWebSocket.dropMethods.clear();
    await expect(connection.send("Page.enable")).resolves.toEqual({});
    connection.close();
  });

  it("joins explicit cancellation of a slow fetch upgrade without a deadline", async () => {
    Object.defineProperty(globalThis, "WebSocket", {
      configurable: true,
      writable: true,
      value: undefined,
    });
    const fetchMock = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(init.signal?.reason),
            { once: true },
          );
        }),
    );
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      writable: true,
      value: fetchMock,
    });
    vi.useFakeTimers();
    const controller = new AbortController();
    let settled = false;
    const pending = CdpConnection.connect("ws://cdp", "token", false, {
      signal: controller.signal,
    })
      .catch((error) => error)
      .finally(() => {
        settled = true;
      });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(settled).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    const reason = new Error("Owner cancelled acquisition");
    controller.abort(reason);
    expect(await pending).toBe(reason);
    expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });

  it("authenticates and exposes page navigation + console capture", async () => {
    installFakeWebSocket();
    const browser = await BrowserImpl.connect("ws://cdp", {
      transportOptions: { authToken: "token" },
    });
    expect(FakeWebSocket.instances[0]?.protocols).toEqual([
      webSocketAuthProtocol("inspection", "token"),
    ]);
    const page = browser.contexts()[0]!.pages()[0]!;

    await expect(page.title()).resolves.toBe("Example");
    expect(page.url()).toBe("https://example.com/current");
    await expect(page.content()).resolves.toBe(
      "<html><body>Hello</body></html>",
    );
    await page.goto("https://example.com/next");
    expect(page.url()).toBe("https://example.com/next");
    await expect(
      page.waitForLoadState("domcontentloaded"),
    ).resolves.toBeUndefined();
    await expect(
      page.waitForFunction(() => document.readyState === "complete"),
    ).resolves.toBe(true);

    expect(page.consoleEvents()).toEqual([
      { type: "log", text: "ready 42", args: ["ready", 42] },
    ]);
    page.clearConsoleEvents();
    expect(page.consoleEvents()).toEqual([]);
  });

  it("subscribes to navigation lifecycle before sending Page.navigate", async () => {
    installFakeWebSocket();
    const browser = await BrowserImpl.connect("ws://cdp");
    const page = browser.contexts()[0]!.pages()[0]!;
    FakeWebSocket.emitNavigationEventBeforeResponse = true;

    await expect(page.goto("https://example.com/fast")).resolves.toBeDefined();
    expect(page.url()).toBe("https://example.com/fast");
  });

  it("waits for navigation settling after Page.reload is acknowledged", async () => {
    installFakeWebSocket();
    const browser = await BrowserImpl.connect("ws://cdp");
    const page = browser.contexts()[0]!.pages()[0]!;
    const socket = FakeWebSocket.instances[0]!;
    let resolved = false;

    const reload = page.reload().then(() => {
      resolved = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 5));

    expect(resolved).toBe(false);
    socket.emitCdpEvent("Page.loadEventFired", { timestamp: 0 });
    await reload;
    expect(resolved).toBe(true);
  });

  it("joins same-document navigation even when its event precedes the command response", async () => {
    installFakeWebSocket();
    const browser = await BrowserImpl.connect("ws://cdp");
    const page = browser.contexts()[0]!.pages()[0]!;
    FakeWebSocket.dropMethods.add("Page.navigate");
    const navigation = page.goto("https://example.com/current#section");
    const socket = FakeWebSocket.instances[0]!;
    socket.emitCdpEvent("Page.navigatedWithinDocument", { frameId: "main" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const commands = (
      page.connection as unknown as { pending: Map<number, unknown> }
    ).pending;
    socket.emitCdpResponse([...commands.keys()][0]!, { frameId: "main" });
    await expect(navigation).resolves.toEqual({ frameId: "main" });
    await browser.close();
  });

  it("keeps navigation pending without a deadline and rejects on target loss", async () => {
    installFakeWebSocket();
    const browser = await BrowserImpl.connect("ws://cdp");
    const page = browser.contexts()[0]!.pages()[0]!;
    vi.useFakeTimers();
    let settled = false;
    const navigation = page
      .reload()
      .catch((error) => error)
      .finally(() => {
        settled = true;
      });
    await vi.advanceTimersByTimeAsync(120_000);
    expect(settled).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    FakeWebSocket.instances[0]!.remoteClose();
    expect(await navigation).toMatchObject({ code: "cdp_target_closed" });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("exhausts locator observations with evidence and preserves the usable connection", async () => {
    installFakeWebSocket();
    const browser = await BrowserImpl.connect("ws://cdp");
    const page = browser.contexts()[0]!.pages()[0]!;
    vi.useFakeTimers();
    const observation = page
      .getByTestId("missing")
      .waitFor()
      .catch((error) => error);
    await vi.advanceTimersByTimeAsync(10_000);
    const error = await observation;
    expect(error).toMatchObject({
      code: "cdp_locator_state_mismatch",
      errorData: {
        observations: 100,
        maxObservations: 100,
        locator: 'getByTestId("missing")',
        state: "visible",
        evidence: { status: "captured", matchCount: 0 },
      },
    });
    expect(error.errorData).not.toHaveProperty("timeoutMs");
    expect(
      FakeWebSocket.sent.filter((command) =>
        String(command.params?.["expression"]).includes('"op":"waitFor"'),
      ),
    ).toHaveLength(100);
    expect(page.isClosed()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    await browser.close();
  });

  it("bounds predicate observations without imposing a default CDP deadline", async () => {
    installFakeWebSocket();
    const browser = await BrowserImpl.connect("ws://cdp");
    const page = browser.contexts()[0]!.pages()[0]!;
    vi.useFakeTimers();
    const observation = page
      .waitForFunction(() => false)
      .catch((error) => error);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await observation).toMatchObject({
      code: "cdp_readiness_exhausted",
      errorData: {
        operation: "waitForFunction",
        observations: 100,
        maxObservations: 100,
      },
    });
    const command = FakeWebSocket.sent.at(-1)!;
    expect(command.params).not.toHaveProperty("timeout");
    expect(command.params!["expression"]).not.toContain("setTimeout");
    expect(vi.getTimerCount()).toBe(0);
    await browser.close();
  });

  it("bounds missing click targets without dispatching or replaying input", async () => {
    installFakeWebSocket();
    const browser = await BrowserImpl.connect("ws://cdp");
    const page = browser.contexts()[0]!.pages()[0]!;
    vi.useFakeTimers();
    // An explicit zero disables only the time deadline, never the attempt budget.
    const observation = page
      .getByTestId("missing")
      .click({ timeout: 0 })
      .catch((error) => error);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await observation).toMatchObject({
      code: "cdp_locator_not_actionable",
      errorData: {
        observations: 100,
        maxObservations: 100,
        evidence: { status: "captured" },
      },
    });
    expect(
      FakeWebSocket.sent.filter((command) =>
        String(command.params?.["expression"]).includes('"op":"probe"'),
      ),
    ).toHaveLength(100);
    expect(
      FakeWebSocket.sent.some((command) => command.method.startsWith("Input.")),
    ).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    await browser.close();
  });

  it("exhausts a click postcondition while retaining delivery and never replaying input", async () => {
    installFakeWebSocket();
    const browser = await BrowserImpl.connect("ws://cdp");
    const page = browser.contexts()[0]!.pages()[0]!;
    vi.useFakeTimers();
    const observation = page
      .getByRole("button")
      .click({
        expect: { locator: page.getByTestId("missing"), state: "visible" },
      })
      .catch((error) => error);
    await vi.advanceTimersByTimeAsync(10_000);
    const error = await observation;
    expect(error).toMatchObject({
      code: "cdp_interaction_outcome_not_observed",
      errorData: {
        observations: 100,
        maxObservations: 100,
        evidence: { status: "captured" },
      },
      cause: { code: "cdp_locator_state_mismatch" },
    });
    expect(error.errorData).not.toHaveProperty("timeoutMs");
    expect(
      FakeWebSocket.sent.filter(
        (command) =>
          command.method === "Input.dispatchMouseEvent" &&
          command.params?.["type"] === "mouseReleased",
      ),
    ).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
    await browser.close();
  });

  it("accepts readiness on the final observation", async () => {
    installFakeWebSocket();
    const browser = await BrowserImpl.connect("ws://cdp");
    const page = browser.contexts()[0]!.pages()[0]!;
    vi.useFakeTimers();
    let observations = 0;
    vi.spyOn(page, "evaluate").mockImplementation(
      async () => ++observations === 100,
    );
    const observation = page.waitForFunction(() => false);
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(observation).resolves.toBe(true);
    expect(observations).toBe(100);
    expect(vi.getTimerCount()).toBe(0);
    await browser.close();
  });

  it("lets target loss terminate an observation before the budget is exhausted", async () => {
    installFakeWebSocket();
    const browser = await BrowserImpl.connect("ws://cdp");
    const page = browser.contexts()[0]!.pages()[0]!;
    vi.useFakeTimers();
    const observation = page
      .getByTestId("missing")
      .waitFor()
      .catch((error) => error);
    await vi.advanceTimersByTimeAsync(100);
    FakeWebSocket.instances[0]!.remoteClose();
    expect(await observation).toMatchObject({ code: "cdp_target_closed" });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("uses the current owner when cancelling a retained page's observation", async () => {
    installFakeWebSocket();
    const firstOwner = new AbortController();
    const nextOwner = new AbortController();
    let owner = firstOwner;
    const browser = await BrowserImpl.connect("ws://cdp", {
      operationSignal: () => owner.signal,
    });
    const page = browser.contexts()[0]!.pages()[0]!;
    owner = nextOwner;
    vi.useFakeTimers();
    const observation = page
      .waitForFunction(() => false)
      .catch((error) => error);
    await vi.advanceTimersByTimeAsync(1);
    firstOwner.abort(new Error("Previous invocation ended"));
    expect(FakeWebSocket.instances[0]!.closed).toBe(false);
    const reason = new Error("Current invocation cancelled");
    nextOwner.abort(reason);
    expect(await observation).toBe(reason);
    expect(FakeWebSocket.instances[0]!.closed).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("propagates owner cancellation to navigation after the command response", async () => {
    installFakeWebSocket();
    const owner = new AbortController();
    const browser = await BrowserImpl.connect("ws://cdp", {
      operationSignal: () => owner.signal,
    });
    vi.useFakeTimers();
    const navigation = browser
      .contexts()[0]!
      .pages()[0]!
      .reload()
      .catch((error) => error);
    await vi.advanceTimersByTimeAsync(1);
    const reason = new Error("Navigation owner cancelled");
    owner.abort(reason);
    expect(await navigation).toBe(reason);
    expect(FakeWebSocket.instances[0]!.closed).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps explicit readiness deadlines scoped to the requested native evaluation", async () => {
    installFakeWebSocket();
    const browser = await BrowserImpl.connect("ws://cdp");
    const page = browser.contexts()[0]!.pages()[0]!;
    vi.useFakeTimers();
    const observation = page
      .waitForFunction(() => false, undefined, { timeout: 100 })
      .catch((error) => error);
    await vi.advanceTimersByTimeAsync(101);
    expect(await observation).toBeInstanceOf(Error);
    const evaluation = FakeWebSocket.sent
      .filter((command) => command.method === "Runtime.evaluate")
      .at(-1)!;
    expect(evaluation.params!["timeout"]).toBeLessThanOrEqual(100);
    await browser.close();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("reports an unhandled native dialog immediately, retains its pending decision, and preserves the connection", async () => {
    installFakeWebSocket();
    const browser = await BrowserImpl.connect("ws://cdp");
    const page = browser.contexts()[0]!.pages()[0]!;
    const socket = FakeWebSocket.instances[0]!;
    vi.useFakeTimers();
    FakeWebSocket.dropMethods.add("Input.dispatchMouseEvent");
    const command = page.connection
      .send("Input.dispatchMouseEvent", { type: "mouseReleased" })
      .catch((error: unknown) => error);
    socket.emitCdpEvent("Page.javascriptDialogOpening", {
      type: "confirm",
      message: "Delete this item?",
      url: "https://example.com",
    });
    expect(await command).toMatchObject({
      code: "cdp_dialog_open",
      errorData: {
        operation: "Input.dispatchMouseEvent",
        recovery: "handle-dialog-and-observe",
        dialog: { type: "confirm", message: "Delete this item?" },
      },
    });
    expect(socket.closed).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    expect(page.dialog()?.defaultValue()).toBe("");
    await expect(page.title()).rejects.toMatchObject({
      code: "cdp_dialog_open",
    });
    const pending = page.dialog()!;
    const dismissed = pending.dismiss();
    await vi.runOnlyPendingTimersAsync();
    await dismissed;
    expect(page.dialog()).toBeNull();
    await expect(pending.accept()).rejects.toMatchObject({
      code: "cdp_dialog_closed",
    });
    expect(FakeWebSocket.sent).toContainEqual({
      method: "Page.handleJavaScriptDialog",
      params: { accept: false },
    });
    await browser.close();
  });

  it("uses a prepared dialog handler to settle the original command without replaying it", async () => {
    installFakeWebSocket();
    const browser = await BrowserImpl.connect("ws://cdp");
    const page = browser.contexts()[0]!.pages()[0]!;
    const socket = FakeWebSocket.instances[0]!;
    FakeWebSocket.dropMethods.add("Input.dispatchMouseEvent");
    const handler = vi.fn(
      async (dialog: NonNullable<ReturnType<typeof page.dialog>>) => {
        expect(dialog.message()).toBe("Your name?");
        await dialog.accept("Test name");
        socket.emitCdpResponse(commandId, {});
      },
    );
    page.on("dialog", handler);
    const dispatched = page.connection.send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
    });
    const commandId = [
      ...(
        page.connection as unknown as { pending: Map<number, unknown> }
      ).pending.keys(),
    ][0]!;
    socket.emitCdpEvent("Page.javascriptDialogOpening", {
      type: "prompt",
      message: "Your name?",
      defaultPrompt: "",
      url: "https://example.com",
    });
    await dispatched;
    expect(handler).toHaveBeenCalledOnce();
    expect(page.dialog()).toBeNull();
    expect(
      FakeWebSocket.sent.filter(
        ({ method }) => method === "Input.dispatchMouseEvent",
      ),
    ).toHaveLength(1);
    expect(FakeWebSocket.sent).toContainEqual({
      method: "Page.handleJavaScriptDialog",
      params: { accept: true, promptText: "Test name" },
    });
    page.off("dialog", handler);
    await browser.close();
  });

  it("owns a response initiated by a void-returning handler and queues new work until it settles", async () => {
    installFakeWebSocket();
    const browser = await BrowserImpl.connect("ws://cdp");
    const page = browser.contexts()[0]!.pages()[0]!;
    const socket = FakeWebSocket.instances[0]!;
    FakeWebSocket.dropMethods.add("Input.dispatchMouseEvent");
    FakeWebSocket.dropMethods.add("Page.handleJavaScriptDialog");
    page.on("dialog", (dialog) => {
      void dialog.accept();
    });
    const original = page.connection.send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
    });
    const pending = (
      page.connection as unknown as { pending: Map<number, { method: string }> }
    ).pending;
    const originalId = [...pending.keys()][0]!;
    socket.emitCdpEvent("Page.javascriptDialogOpening", {
      type: "confirm",
      message: "Delete?",
      url: "https://example.com",
    });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    const decisionId = [...pending].find(
      ([, command]) => command.method === "Page.handleJavaScriptDialog",
    )![0];
    const title = page.title();
    await expect(page.dialog()!.accept()).rejects.toMatchObject({
      code: "cdp_dialog_closed",
    });
    expect(
      FakeWebSocket.sent.filter(
        ({ method }) => method === "Page.handleJavaScriptDialog",
      ),
    ).toHaveLength(1);
    expect(FakeWebSocket.sent.at(-1)?.method).toBe(
      "Page.handleJavaScriptDialog",
    );
    socket.emitCdpResponse(decisionId, {});
    socket.emitCdpResponse(originalId, {});
    await original;
    expect(await title).toBe("Example");
    expect(page.dialog()).toBeNull();
    expect(
      FakeWebSocket.sent.filter(
        ({ method }) => method === "Input.dispatchMouseEvent",
      ),
    ).toHaveLength(1);
    await browser.close();
  });

  it("rejects blocked commands when a dialog listener completes without making a decision", async () => {
    installFakeWebSocket();
    const browser = await BrowserImpl.connect("ws://cdp");
    const page = browser.contexts()[0]!.pages()[0]!;
    const socket = FakeWebSocket.instances[0]!;
    vi.useFakeTimers();
    page.on("dialog", () => {});
    FakeWebSocket.dropMethods.add("Runtime.evaluate");
    const pending = page.title().catch((error: unknown) => error);
    socket.emitCdpEvent("Page.javascriptDialogOpening", {
      type: "alert",
      message: "Notice",
      defaultPrompt: "",
      url: "https://example.com",
    });
    expect(await pending).toMatchObject({ code: "cdp_dialog_open" });
    expect(vi.getTimerCount()).toBe(0);
    await browser.close();
  });

  it.each([
    ["Inspector.targetCrashed", "cdp_target_crashed", {}],
    [
      "Inspector.detached",
      "cdp_target_detached",
      { reason: "replaced_with_devtools" },
    ],
  ])(
    "rejects pending work immediately on %s without advancing a deadline",
    async (event, code, params) => {
      installFakeWebSocket();
      const browser = await BrowserImpl.connect("ws://cdp");
      const page = browser.contexts()[0]!.pages()[0]!;
      const socket = FakeWebSocket.instances[0]!;
      vi.useFakeTimers();
      FakeWebSocket.dropMethods.add("Runtime.evaluate");
      const failure = page
        .getByTestId("missing")
        .innerText()
        .catch((error: unknown) => error);

      socket.emitCdpEvent(event, params);

      expect(await failure).toMatchObject({
        code,
        errorData: {
          code,
          failureKind: "infrastructure",
          operation: "innerText",
        },
      });
      expect(socket.closed).toBe(true);
      await expect(page.title()).rejects.toMatchObject({ code });
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it.each([
    "Inspector.enable",
    "Page.enable",
    "Runtime.enable",
    "DOM.enable",
    "Runtime.evaluate",
  ])(
    "rejects initialization and retires the connection when %s fails",
    async (method) => {
      installFakeWebSocket();
      FakeWebSocket.rejectMethods.set(method, `Cannot initialize ${method}`);
      await expect(BrowserImpl.connect("ws://cdp")).rejects.toThrow(
        `Cannot initialize ${method}`,
      );
      expect(FakeWebSocket.instances[0]!.closed).toBe(true);
    },
  );

  it("propagates an invalid CSS selector immediately instead of retrying it as absent", async () => {
    installFakeWebSocket();
    const browser = await BrowserImpl.connect("ws://cdp");
    const page = browser.contexts()[0]!.pages()[0]!;
    await page.locator("[").innerText({ timeout: 1 });
    const expression = [...FakeWebSocket.sent]
      .reverse()
      .find((entry) => entry.method === "Runtime.evaluate")!.params![
      "expression"
    ] as string;
    const syntaxError = await runInNewContext(expression, {
      document: {
        querySelectorAll: () => {
          throw new SyntaxError("'[' is not a valid selector");
        },
      },
    }).catch((error: Error) => error);
    expect(syntaxError.name).toBe("SyntaxError");
    FakeWebSocket.evaluationException = {
      text: "Uncaught",
      exception: { description: `${syntaxError.name}: ${syntaxError.message}` },
    };
    const previousCount = FakeWebSocket.sent.length;
    await expect(page.locator("[").innerText()).rejects.toMatchObject({
      code: "cdp_evaluation_failed",
      message: expect.stringContaining("not a valid selector"),
      errorData: { locator: 'locator("[")', failureKind: "user-code" },
    });
    expect(FakeWebSocket.sent.slice(previousCount)).toHaveLength(1);
    expect(FakeWebSocket.instances[0]!.closed).toBe(false);
  });

  it("keeps slow commands owned until the response or target closure", async () => {
    installFakeWebSocket();
    const browser = await BrowserImpl.connect("ws://cdp");
    const page = browser.contexts()[0]!.pages()[0]!;
    const socket = FakeWebSocket.instances[0]!;
    vi.useFakeTimers();
    FakeWebSocket.dropMethods.add("Runtime.evaluate");
    let settled = false;
    const pending = page.title().finally(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(120_000);
    expect(settled).toBe(false);
    expect(socket.closed).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    const commands = (
      page.connection as unknown as { pending: Map<number, unknown> }
    ).pending;
    socket.emitCdpResponse([...commands.keys()][0]!, {
      result: { value: "Slow title" },
    });
    await expect(pending).resolves.toBe("Slow title");
    const closed = page.title().catch((error: unknown) => error);
    socket.remoteClose();
    await expect(closed).resolves.toMatchObject({ code: "cdp_target_closed" });
    expect(commands.size).toBe(0);
  });

  it.each(["{", "null", '{"id":"invalid"}'])(
    "propagates invalid protocol frame %s to all pending commands",
    async (frame) => {
      installFakeWebSocket();
      const browser = await BrowserImpl.connect("ws://cdp");
      const page = browser.contexts()[0]!.pages()[0]!;
      const socket = FakeWebSocket.instances[0]!;
      FakeWebSocket.dropMethods.add("Runtime.evaluate");
      const pending = [page.title(), page.content()].map((p) =>
        p.catch((error: unknown) => error),
      );
      socket.emitRawFrame(frame);
      for (const result of await Promise.all(pending))
        expect(result).toMatchObject({
          code: "cdp_protocol_error",
          errorData: { failureKind: "infrastructure" },
        });
      expect(socket.closed).toBe(true);
      expect(
        (page.connection as unknown as { pending: Map<number, unknown> })
          .pending.size,
      ).toBe(0);
    },
  );

  it("serializes typed page callback arguments and infers the result", async () => {
    installFakeWebSocket();
    const browser = await BrowserImpl.connect("ws://cdp");
    try {
      const page = browser.contexts()[0]!.pages()[0]!;
      const result: Promise<number> = page.evaluate(
        (input: { value: number }) => input.value + 1,
        { value: 7 },
      );
      await result;
      const expression = [...FakeWebSocket.sent]
        .reverse()
        .find((entry) => entry.method === "Runtime.evaluate")!.params![
        "expression"
      ] as string;
      expect(runInNewContext(expression)).toBe(8);
    } finally {
      await browser.close();
    }
  });

  it("passes only an explicitly requested evaluation deadline to the browser", async () => {
    installFakeWebSocket();
    const browser = await BrowserImpl.connect("ws://cdp");
    const page = browser.contexts()[0]!.pages()[0]!;
    page.setDefaultTimeout(10);
    await page.evaluate("1");
    expect(FakeWebSocket.sent.at(-1)?.params).not.toHaveProperty("timeout");
    await page.evaluate("1", undefined, { timeout: 250 });
    expect(FakeWebSocket.sent.at(-1)?.params).toHaveProperty("timeout", 250);
    await browser.close();
  });

  it("does not impose a one-second deadline on a zero-wait locator probe", async () => {
    installFakeWebSocket();
    const browser = await BrowserImpl.connect("ws://cdp");
    const page = browser.contexts()[0]!.pages()[0]!;
    const socket = FakeWebSocket.instances[0]!;
    vi.useFakeTimers();
    FakeWebSocket.dropMethods.add("Runtime.evaluate");
    let settled = false;
    const pending = page
      .runLocatorOp(
        "probe",
        { steps: [{ by: "role", value: "button" }] },
        null,
        { timeout: 0 },
      )
      .finally(() => {
        settled = true;
      });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(settled).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    const commands = (
      page.connection as unknown as { pending: Map<number, unknown> }
    ).pending;
    socket.emitCdpResponse([...commands.keys()][0]!, {
      result: { value: { ok: true } },
    });
    await expect(pending).resolves.toEqual({ ok: true });
    await browser.close();
  });

  it("compiles CSS, text selectors, and getBy locators into one descriptor model", async () => {
    installFakeWebSocket();
    const browser = await BrowserImpl.connect("ws://cdp");
    const page = browser.contexts()[0]!.pages()[0]!;

    await expect(page.locator("body").count()).resolves.toBe(1);
    await expect(page.locator("body").textContent()).resolves.toBe(
      "Hello text",
    );
    await expect(page.locator('text="Hello"').innerText()).resolves.toBe(
      "Hello",
    );
    expect(page.locator('text="Hello"')).toMatchObject({
      descriptor: { steps: [{ by: "text", value: "Hello", exact: true }] },
    });
    expect(page.locator("text=Hello")).toMatchObject({
      descriptor: { steps: [{ by: "text", value: "Hello", exact: false }] },
    });
    expect(() => page.locator('text="unterminated')).toThrow(
      "quoted text must be a valid JSON string",
    );
    await expect(page.getByText("Hello").innerText()).resolves.toBe("Hello");
    const textEvaluation = FakeWebSocket.sent
      .filter((entry) => entry.method === "Runtime.evaluate")
      .map((entry) => String(entry.params?.["expression"] ?? ""))
      .find((expression) => expression.includes('"op":"innerText"'));
    expect(textEvaluation).toContain("nsHasTextMatchingDescendant");
    expect(textEvaluation).toContain(
      'case "innerText": { var e=await nsWaitForState(d,"attached",t)',
    );
    expect(textEvaluation).not.toContain(
      'case "innerText": { var e=await nsWaitForState(d,"visible",t)',
    );
    await expect(
      page.getByRole("button", { name: "Sign in" }).isVisible(),
    ).resolves.toBe(true);
    await expect(page.getByTestId("widget").isEnabled()).resolves.toBe(true);
    await expect(
      page.getByRole("button", { name: "Add another column" }).isEnabled(),
    ).resolves.toBe(false);
    await expect(page.getByLabel("Email").getAttribute("id")).resolves.toBe(
      "main",
    );
    await expect(page.locator("li").allInnerTexts()).resolves.toEqual([
      "Hello",
    ]);
    await expect(
      page
        .locator("li")
        .evaluateAll((elements) =>
          elements.map((element) => element.textContent),
        ),
    ).resolves.toEqual(["Hello"]);
    await expect(
      page.locator("body").evaluate((element) => element.innerHTML),
    ).resolves.toBe("<strong>Hello</strong>");
    await expect(page.locator("body").inspect()).resolves.toMatchObject({
      found: true,
      tagName: "BODY",
      className: "ready",
      role: "document",
      accessibleName: "Hello",
      ancestors: [
        {
          tagName: "MAIN",
          role: "main",
          accessibleName: "Example panel",
          text: "Example panel Hello",
        },
      ],
    });
    expect("innerText" in page).toBe(false);
    expect("isVisible" in page).toBe(false);

    const locatorRuntime = FakeWebSocket.sent
      .filter((entry) => entry.method === "Runtime.evaluate")
      .map((entry) => String(entry.params?.["expression"] ?? ""))
      .find((expression) => expression.includes('"op":"isEnabled"'));
    expect(locatorRuntime).toContain(
      "return exact ? t===n : t.toLowerCase().indexOf(n.toLowerCase())!==-1",
    );
    expect(locatorRuntime).toContain(
      'case "isEnabled": { var e=nsFirst(d); return !!e && nsEnabled(e); }',
    );
  });

  it("reports locator wait timeouts as state mismatches with recovery data", async () => {
    installFakeWebSocket();
    const browser = await BrowserImpl.connect("ws://cdp");
    const page = browser.contexts()[0]!.pages()[0]!;

    const failure = await page
      .getByRole("button", { name: "Add another column" })
      .waitFor({ state: "visible", timeout: 25 })
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(CdpError);
    expect(failure).toMatchObject({
      code: "cdp_locator_state_mismatch",
      errorData: {
        code: "cdp_locator_state_mismatch",
        operation: "waitFor",
        recovery: "reobserve-locator",
        locator:
          'getByRole("button", { name: "Add another column", exact: true })',
        timeoutMs: 25,
        state: "visible",
      },
    });

    const readFailure = await page
      .getByTestId("missing")
      .innerText({ timeout: 15 })
      .catch((error: unknown) => error);
    expect(readFailure).toMatchObject({
      code: "cdp_locator_state_mismatch",
      errorData: {
        operation: "innerText",
        locator: 'getByTestId("missing")',
        timeoutMs: 15,
        state: "attached",
      },
    });

    const waitEvaluations = FakeWebSocket.sent.filter(
      (entry) =>
        entry.method === "Runtime.evaluate" &&
        String(entry.params?.["expression"] ?? "").includes('"op":"waitFor"'),
    );
    expect(waitEvaluations.length).toBeGreaterThan(1);
    expect(
      String(waitEvaluations[0]?.params?.["expression"] ?? ""),
    ).not.toContain("await nsSleep(50)");
  });

  it("disconnects page automation without implying target ownership", async () => {
    installFakeWebSocket();
    const browser = await BrowserImpl.connect("ws://cdp");
    const page = browser.contexts()[0]!.pages()[0]!;
    const socket = FakeWebSocket.instances[0]!;

    await page.close();
    await page.close();

    expect(socket.closed).toBe(true);
    await expect(page.title()).rejects.toThrow(
      "Cannot send Runtime.evaluate: CDP connection closed by the client",
    );
  });

  it("preserves the runtime-replacement recovery reason after a remote target close", async () => {
    installFakeWebSocket();
    const browser = await BrowserImpl.connect("ws://cdp");
    const page = browser.contexts()[0]!.pages()[0]!;
    const socket = FakeWebSocket.instances[0]!;

    socket.remoteClose();

    await expect(page.title()).rejects.toThrow(
      "runtime may have been replaced by handle.navigate() or handle.rebuild()",
    );
    await expect(page.title()).rejects.toThrow(
      "obtain a fresh page with await handle.cdp.page(); do not reuse the cached page",
    );
  });

  it("sets and reports the CSS viewport through CDP emulation", async () => {
    installFakeWebSocket();
    const browser = await BrowserImpl.connect("ws://cdp");
    const page = browser.contexts()[0]!.pages()[0]!;

    expect(page.viewportSize()).toEqual({ width: 1280, height: 720 });
    await page.setViewportSize({ width: 390, height: 844 });

    expect(page.viewportSize()).toEqual({ width: 390, height: 844 });
    expect(FakeWebSocket.sent).toContainEqual({
      method: "Emulation.setDeviceMetricsOverride",
      params: {
        width: 390,
        height: 844,
        deviceScaleFactor: 1,
        mobile: false,
      },
    });
    await expect(
      page.setViewportSize({ width: 0, height: 844 }),
    ).rejects.toThrow("positive integer width and height");
  });

  it("dispatches a real CDP mouse sequence for click (auto-waited)", async () => {
    installFakeWebSocket();
    const browser = await BrowserImpl.connect("ws://cdp");
    const page = browser.contexts()[0]!.pages()[0]!;

    const outcome = await page.getByRole("button", { name: "Go" }).click();

    expect(outcome).toMatchObject({
      protocol: "cdp-interaction-outcome.v1",
      action: "click",
      delivery: "dispatched",
      target: { found: true },
      effect: { status: "not-asserted" },
    });

    const probeEvaluation = FakeWebSocket.sent
      .filter((entry) => entry.method === "Runtime.evaluate")
      .map((entry) => String(entry.params?.["expression"] ?? ""))
      .find((expression) => expression.includes('"op":"probe"'));
    expect(probeEvaluation).toContain("document.elementFromPoint(x,y)");
    expect(probeEvaluation).toContain("hit!==el && !el.contains(hit)");
    const mouse = FakeWebSocket.sent.filter(
      (s) => s.method === "Input.dispatchMouseEvent",
    );
    expect(mouse.map((m) => m.params?.["type"])).toEqual([
      "mouseMoved",
      "mousePressed",
      "mouseReleased",
    ]);
    expect(mouse[1]?.params).toMatchObject({
      x: 50,
      y: 10,
      button: "left",
      clickCount: 1,
    });
    const releaseIndex = FakeWebSocket.sent.findIndex(
      (event) =>
        event.method === "Input.dispatchMouseEvent" &&
        event.params?.["type"] === "mouseReleased",
    );
    expect(
      FakeWebSocket.sent
        .slice(releaseIndex + 1)
        .some((event) => event.method === "Runtime.evaluate"),
    ).toBe(false);
  });

  it("polls actionability between one-shot page evaluations", async () => {
    installFakeWebSocket();
    const browser = await BrowserImpl.connect("ws://cdp");
    const page = browser.contexts()[0]!.pages()[0]!;

    await page
      .getByRole("button", { name: "Add another column" })
      .click({ timeout: 40 })
      .catch(() => undefined);

    const probes = FakeWebSocket.sent
      .filter(
        (entry) =>
          entry.method === "Runtime.evaluate" &&
          String(entry.params?.["expression"] ?? "").includes('"op":"probe"'),
      )
      .map((entry) => String(entry.params?.["expression"] ?? ""));
    expect(probes.length).toBeGreaterThan(1);
    expect(
      probes.every((expression) => !expression.includes("await nsSleep(30)")),
    ).toBe(true);
  });

  it("reports completed locator reads independently of caller projections", async () => {
    installFakeWebSocket();
    const onObservation = vi.fn();
    const browser = await BrowserImpl.connect("ws://cdp", { onObservation });
    const page = browser.contexts()[0]!.pages()[0]!;
    const locator = page.locator("body");
    const text = await locator.textContent();
    expect(onObservation).toHaveBeenCalledExactlyOnceWith(text);
    onObservation.mockClear();
    const visible = await locator.innerText();
    expect(onObservation).toHaveBeenCalledExactlyOnceWith(visible);
    onObservation.mockClear();
    await locator.count();
    expect(onObservation).not.toHaveBeenCalled();
    FakeWebSocket.evaluationException = {
      text: "read failed",
      exception: { description: "original locator read failure" },
    };
    await expect(locator.textContent()).rejects.toThrow(
      "original locator read failure",
    );
    expect(onObservation).not.toHaveBeenCalled();
  });

  it("returns an observed semantic postcondition from a click", async () => {
    installFakeWebSocket();
    const onInteraction = vi.fn();
    const browser = await BrowserImpl.connect("ws://cdp", { onInteraction });
    const page = browser.contexts()[0]!.pages()[0]!;
    const dialog = page.getByRole("dialog", { name: "Card details" });

    const outcome = await page
      .getByRole("button", { name: "Open card" })
      .click({
        expect: { locator: dialog, state: "visible" },
      });

    expect(outcome).toMatchObject({
      protocol: "cdp-interaction-outcome.v1",
      action: "click",
      delivery: "dispatched",
      effect: {
        status: "observed",
        locator: 'getByRole("dialog", { name: "Card details", exact: true })',
        state: "visible",
      },
    });
    expect(onInteraction).toHaveBeenCalledExactlyOnceWith(outcome);
  });

  it("lets queued input run between locator wait probes", async () => {
    installFakeWebSocket();
    FakeWebSocket.deferNextClickEffect = true;
    const browser = await BrowserImpl.connect("ws://cdp");
    const page = browser.contexts()[0]!.pages()[0]!;

    await page.getByRole("button", { name: "Trigger" }).click();
    await page
      .getByRole("dialog", { name: "Revealed" })
      .waitFor({ timeout: 200 });

    const probes = FakeWebSocket.sent.filter(
      (entry) =>
        entry.method === "Runtime.evaluate" &&
        String(entry.params?.["expression"] ?? "").includes('"op":"waitFor"') &&
        String(entry.params?.["expression"] ?? "").includes(
          '"name":"Revealed"',
        ),
    );
    expect(probes.length).toBeGreaterThan(1);
  });

  it("observes a keyboard postcondition through the same receipt contract as a click", async () => {
    installFakeWebSocket();
    const onInteraction = vi.fn();
    const browser = await BrowserImpl.connect("ws://cdp", { onInteraction });
    const page = browser.contexts()[0]!.pages()[0]!;
    const expected = page.getByRole("dialog", { name: "Card details" });
    const outcome = await page.getByPlaceholder("Name").press("Enter", {
      expect: { locator: expected, state: "visible" },
    });
    expect(outcome).toMatchObject({
      action: "press",
      delivery: "dispatched",
      effect: {
        status: "observed",
        locator: expected.toString(),
        state: "visible",
      },
    });
    expect(onInteraction).toHaveBeenCalledExactlyOnceWith(outcome);
    await browser.close();
  });

  it("describes the missing postcondition when a dispatched click has no observed effect", async () => {
    installFakeWebSocket();
    const onInteraction = vi.fn();
    const browser = await BrowserImpl.connect("ws://cdp", { onInteraction });
    const page = browser.contexts()[0]!.pages()[0]!;
    const expected = page.getByRole("button", { name: "Add another column" });

    const failure = await page
      .getByRole("button", { name: "Create task", exact: true })
      .click({ expect: { locator: expected, state: "visible", timeout: 40 } })
      .catch((error: unknown) => error);

    expect(failure).toMatchObject({
      code: "cdp_interaction_outcome_not_observed",
      errorData: {
        code: "cdp_interaction_outcome_not_observed",
        locator: 'getByRole("button", { name: "Create task", exact: true })',
        expectedLocator:
          'getByRole("button", { name: "Add another column", exact: true })',
        state: "visible",
        timeoutMs: 40,
        evidence: { status: "captured", matchCount: 0 },
      },
    });
    expect(onInteraction).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        action: "click",
        delivery: "dispatched",
        effect: {
          status: "not-observed",
          locator: expected.toString(),
          state: "visible",
        },
      }),
    );
    expect(
      FakeWebSocket.sent.filter(
        (event) =>
          event.method === "Input.dispatchMouseEvent" &&
          event.params?.["type"] === "mouseReleased",
      ),
    ).toHaveLength(1);
  });

  it("fills and reads back input value, and toggles a checkbox", async () => {
    installFakeWebSocket();
    const browser = await BrowserImpl.connect("ws://cdp");
    const page = browser.contexts()[0]!.pages()[0]!;

    await page.getByPlaceholder("Name").fill("abc");
    await expect(page.locator("input").inputValue()).resolves.toBe("abc");
    const fillEvaluation = FakeWebSocket.sent
      .filter((entry) => entry.method === "Runtime.evaluate")
      .map((entry) => String(entry.params?.["expression"] ?? ""))
      .find((expression) => expression.includes('"op":"fill"'));
    expect(fillEvaluation).toContain(
      "Object.getOwnPropertyDescriptor(proto,name)",
    );
    expect(fillEvaluation).toContain("new InputEvent");
    expect(fillEvaluation).toContain("await nsAfterAction()");
    await page.locator("input").type("123");
    await expect(page.locator("input").inputValue()).resolves.toBe("abc123");

    await page.getByRole("checkbox").check();
    await expect(page.getByRole("checkbox").isChecked()).resolves.toBe(true);
    await page.getByRole("checkbox").uncheck();
    await expect(page.getByRole("checkbox").isChecked()).resolves.toBe(false);
    const checkboxOps = FakeWebSocket.sent
      .filter((entry) => entry.method === "Runtime.evaluate")
      .map((entry) => String(entry.params?.["expression"] ?? ""));
    expect(
      checkboxOps.some((expression) =>
        expression.includes('"op":"retainedCheckedState"'),
      ),
    ).toBe(true);
    expect(
      checkboxOps.some((expression) =>
        expression.includes('"op":"releaseRetainedElement"'),
      ),
    ).toBe(true);
    await expect(
      page.getByRole("combobox").selectOption("two"),
    ).resolves.toEqual(["two"]);
  });

  it("waits for an asynchronously controlled checkbox without replaying the click", async () => {
    installFakeWebSocket();
    FakeWebSocket.deferNextCheckPolls = 2;
    const browser = await BrowserImpl.connect("ws://cdp");
    const page = browser.contexts()[0]!.pages()[0]!;

    const outcome = await page.getByRole("checkbox").check({ timeout: 1_000 });
    expect(outcome).toMatchObject({
      action: "check",
      delivery: "dispatched",
      effect: { status: "observed", state: "checked" },
    });

    expect(
      FakeWebSocket.sent.filter(
        ({ method, params }) =>
          method === "Input.dispatchMouseEvent" &&
          params?.["type"] === "mouseReleased",
      ),
    ).toHaveLength(1);
    expect(
      FakeWebSocket.sent.filter(
        ({ method, params }) =>
          method === "Runtime.evaluate" &&
          String(params?.["expression"] ?? "").includes(
            '"op":"retainedCheckedStateEquals"',
          ),
      ).length,
    ).toBeGreaterThan(1);
    await expect(page.getByRole("checkbox").isChecked()).resolves.toBe(true);
    await browser.close();
  });

  it("returns observed idempotent checkbox receipts without inventing a second click", async () => {
    installFakeWebSocket();
    const onInteraction = vi.fn();
    const browser = await BrowserImpl.connect("ws://cdp", { onInteraction });
    const page = browser.contexts()[0]!.pages()[0]!;
    const checkbox = page.getByRole("checkbox");
    await checkbox.check();
    const actionability = vi
      .spyOn(page, "resolveHitPoint")
      .mockRejectedValue(new Error("Control is disabled"));
    const noChange = await checkbox.check();
    expect(noChange).toMatchObject({
      action: "check",
      delivery: "not-needed",
      effect: { status: "observed", state: "checked" },
    });
    expect(
      FakeWebSocket.sent.filter(
        ({ method, params }) =>
          method === "Input.dispatchMouseEvent" &&
          params?.["type"] === "mouseReleased",
      ),
    ).toHaveLength(1);
    expect(actionability).not.toHaveBeenCalled();
    actionability.mockRestore();
    expect(
      await checkbox.setChecked(false, {
        expect: { locator: checkbox, state: "unchecked" },
      }),
    ).toMatchObject({
      action: "uncheck",
      delivery: "dispatched",
      effect: { status: "observed", state: "unchecked" },
    });
    expect(onInteraction.mock.calls.map(([receipt]) => receipt)).toHaveLength(
      3,
    );
    const waits = FakeWebSocket.sent.filter(
      ({ method, params }) =>
        method === "Runtime.evaluate" &&
        String(params?.["expression"]).includes('"op":"waitFor"'),
    );
    expect(
      waits.some(({ params }) =>
        String(params?.["expression"]).includes(
          'state==="checked"||state==="unchecked"',
        ),
      ),
    ).toBe(true);
    await browser.close();
  });

  it("observes an external postcondition even when checkbox delivery is unnecessary", async () => {
    installFakeWebSocket();
    const onInteraction = vi.fn();
    const browser = await BrowserImpl.connect("ws://cdp", { onInteraction });
    const page = browser.contexts()[0]!.pages()[0]!;
    await page.getByRole("checkbox").check();
    onInteraction.mockClear();
    await expect(
      page.getByRole("checkbox").check({
        expect: { locator: page.getByTestId("missing"), timeout: 40 },
      }),
    ).rejects.toMatchObject({ code: "cdp_interaction_outcome_not_observed" });
    expect(onInteraction.mock.calls).toHaveLength(1);
    expect(onInteraction.mock.calls[0]?.[0]).toMatchObject({
      delivery: "not-needed",
      effect: { status: "not-observed" },
    });
    expect(
      FakeWebSocket.sent.filter(
        ({ method, params }) =>
          method === "Input.dispatchMouseEvent" &&
          params?.["type"] === "mouseReleased",
      ),
    ).toHaveLength(1);
    await browser.close();
  });

  it("does not mistake a missing control for an unchecked state", async () => {
    installFakeWebSocket();
    const browser = await BrowserImpl.connect("ws://cdp");
    const page = browser.contexts()[0]!.pages()[0]!;
    await expect(
      page.getByTestId("missing").waitFor({ state: "unchecked", timeout: 40 }),
    ).rejects.toThrow();
    await browser.close();
  });

  it("observes checkbox postconditions and retains exactly one dispatched receipt on failure", async () => {
    installFakeWebSocket();
    const onInteraction = vi.fn();
    const browser = await BrowserImpl.connect("ws://cdp", { onInteraction });
    const page = browser.contexts()[0]!.pages()[0]!;
    await expect(
      page.getByRole("checkbox").check({
        expect: { locator: page.getByTestId("missing"), timeout: 40 },
      }),
    ).rejects.toMatchObject({ code: "cdp_interaction_outcome_not_observed" });
    expect(onInteraction).toHaveBeenCalledTimes(1);
    expect(onInteraction.mock.calls[0]?.[0]).toMatchObject({
      action: "check",
      delivery: "dispatched",
      effect: { status: "not-observed" },
    });
    expect(
      FakeWebSocket.sent.filter(
        ({ method, params }) =>
          method === "Input.dispatchMouseEvent" &&
          params?.["type"] === "mouseReleased",
      ),
    ).toHaveLength(1);
    await browser.close();
  });

  it("retains delivery when a controlled checkbox never reaches its requested state", async () => {
    installFakeWebSocket();
    FakeWebSocket.deferNextCheckPolls = 1000;
    const onInteraction = vi.fn();
    const browser = await BrowserImpl.connect("ws://cdp", { onInteraction });
    const page = browser.contexts()[0]!.pages()[0]!;
    await expect(
      page.getByRole("checkbox").check({ timeout: 40 }),
    ).rejects.toThrow();
    expect(onInteraction).toHaveBeenCalledTimes(1);
    expect(onInteraction.mock.calls[0]?.[0]).toMatchObject({
      action: "check",
      delivery: "dispatched",
      effect: { status: "not-observed", state: "checked" },
    });
    expect(
      FakeWebSocket.sent.filter(
        ({ method, params }) =>
          method === "Input.dispatchMouseEvent" &&
          params?.["type"] === "mouseReleased",
      ),
    ).toHaveLength(1);
    expect(
      FakeWebSocket.sent.some(
        ({ method, params }) =>
          method === "Runtime.evaluate" &&
          String(params?.["expression"]).includes(
            '"op":"releaseRetainedElement"',
          ),
      ),
    ).toBe(true);
    await browser.close();
  });

  it("records text, selection and keyboard actions from native execution, without input contents", async () => {
    installFakeWebSocket();
    const onInteraction = vi.fn();
    const browser = await BrowserImpl.connect("ws://cdp", { onInteraction });
    const page = browser.contexts()[0]!.pages()[0]!;
    await page.getByPlaceholder("Name").fill("private input");
    await page.getByPlaceholder("Name").clear();
    await page.getByRole("combobox").selectOption("high");
    await page.getByPlaceholder("Name").press("Enter");
    expect(onInteraction.mock.calls.map(([receipt]) => receipt.action)).toEqual(
      ["fill", "clear", "selectOption", "press"],
    );
    for (const [receipt] of onInteraction.mock.calls) {
      expect(receipt).toMatchObject({
        protocol: "cdp-interaction-outcome.v1",
        delivery: "dispatched",
        target: { found: true },
      });
      expect(JSON.stringify(receipt)).not.toContain("private input");
    }
    FakeWebSocket.rejectMethods.set("Runtime.evaluate", "page crashed");
    await expect(
      page.getByPlaceholder("Name").fill("failed"),
    ).rejects.toThrow();
    expect(onInteraction).toHaveBeenCalledTimes(4);
    await browser.close();
  });

  it("never passes portable Windows key codes as platform-native codes", async () => {
    installFakeWebSocket();
    const browser = await BrowserImpl.connect("ws://cdp");
    const page = browser.contexts()[0]!.pages()[0]!;
    await page.keyboard.press("Enter");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Shift+Tab");
    const events = FakeWebSocket.sent.filter(
      (entry) => entry.method === "Input.dispatchKeyEvent",
    );
    expect(events.length).toBeGreaterThan(0);
    for (const event of events)
      expect(event.params).not.toHaveProperty("nativeVirtualKeyCode");
    expect(events).toContainEqual(
      expect.objectContaining({
        params: expect.objectContaining({
          type: "keyDown",
          key: "Enter",
          windowsVirtualKeyCode: 13,
        }),
      }),
    );
    await browser.close();
  });

  it("accepts Playwright-style select option matchers", async () => {
    installFakeWebSocket();
    const browser = await BrowserImpl.connect("ws://cdp");
    const page = browser.contexts()[0]!.pages()[0]!;

    await expect(
      page.getByRole("combobox").selectOption({ label: "Two" }),
    ).resolves.toEqual([{ label: "Two" }]);
    await expect(
      page.getByRole("combobox").selectOption({ index: 1 }),
    ).resolves.toEqual([{ index: 1 }]);

    const selectEvaluation = FakeWebSocket.sent
      .filter((entry) => entry.method === "Runtime.evaluate")
      .map((entry) => String(entry.params?.["expression"] ?? ""))
      .filter((expression) => expression.includes('"op":"selectOption"'));
    expect(selectEvaluation.at(-2)).toContain('"values":[{"label":"Two"}]');
    expect(selectEvaluation.at(-1)).toContain('"values":[{"index":1}]');
  });

  it("rejects malformed select option matchers before sending CDP work", async () => {
    installFakeWebSocket();
    const browser = await BrowserImpl.connect("ws://cdp");
    const page = browser.contexts()[0]!.pages()[0]!;
    const sentBefore = FakeWebSocket.sent.length;

    await expect(
      page
        .getByRole("combobox")
        .selectOption({ label: 42 as unknown as string }),
    ).rejects.toThrow("selectOption option.label must be a string");
    expect(FakeWebSocket.sent).toHaveLength(sentBefore);
  });

  it("delivers printable keyboard text once, without text on down or up edges", async () => {
    installFakeWebSocket();
    const browser = await BrowserImpl.connect("ws://cdp");
    const page = browser.contexts()[0]!.pages()[0]!;
    await page.keyboard.type("aZ.");
    const events = FakeWebSocket.sent.filter(
      (event) => event.method === "Input.dispatchKeyEvent",
    );
    expect(events.filter((event) => event.params?.["text"])).toHaveLength(3);
    expect(
      events
        .filter((event) => event.params?.["text"])
        .map((event) => event.params?.["type"]),
    ).toEqual(["char", "char", "char"]);
    expect(
      events
        .filter((event) => event.params?.["text"])
        .map((event) => event.params?.["text"]),
    ).toEqual(["a", "Z", "."]);
    await browser.close();
  });

  it("supports page keyboard chords and text insertion", async () => {
    installFakeWebSocket();
    const browser = await BrowserImpl.connect("ws://cdp");
    const page = browser.contexts()[0]!.pages()[0]!;

    await page.keyboard.press("Control+A");
    await page.keyboard.insertText("replacement");

    const keyEvents = FakeWebSocket.sent.filter(
      (event) => event.method === "Input.dispatchKeyEvent",
    );
    expect(
      keyEvents.some(
        (event) =>
          event.params?.["key"] === "A" &&
          event.params?.["type"] === "keyDown" &&
          event.params?.["modifiers"] === 2,
      ),
    ).toBe(true);
    expect(
      FakeWebSocket.sent.some(
        (event) =>
          event.method === "Input.insertText" &&
          event.params?.["text"] === "replacement",
      ),
    ).toBe(true);
  });

  it("dispatches Shift+Enter's newline between keydown and keyup", async () => {
    installFakeWebSocket();
    const browser = await BrowserImpl.connect("ws://cdp");
    const page = browser.contexts()[0]!.pages()[0]!;

    await page.keyboard.press("Shift+Enter");

    const events = FakeWebSocket.sent.filter(
      (event) => event.method === "Input.dispatchKeyEvent",
    );
    expect(
      events.map((event) => ({
        type: event.params?.["type"],
        key: event.params?.["key"],
        text: event.params?.["text"],
        modifiers: event.params?.["modifiers"],
      })),
    ).toEqual([
      { type: "keyDown", key: "Shift", text: undefined, modifiers: 8 },
      { type: "keyDown", key: "Enter", text: undefined, modifiers: 8 },
      { type: "char", key: "Enter", text: "\r", modifiers: 8 },
      { type: "keyUp", key: "Enter", text: undefined, modifiers: 8 },
      { type: "keyUp", key: "Shift", text: undefined, modifiers: 8 },
    ]);
  });

  it.each(["Control", "Meta", "Alt"])(
    "suppresses Enter text for %s shortcuts, including held modifiers",
    async (modifier) => {
      installFakeWebSocket();
      const browser = await BrowserImpl.connect("ws://cdp");
      const page = browser.contexts()[0]!.pages()[0]!;

      await page.keyboard.press(modifier + "+Shift+Enter");
      await page.keyboard.down(modifier);
      await page.keyboard.press("Enter");
      await page.keyboard.up(modifier);
      expect(
        FakeWebSocket.sent.filter(
          (event) =>
            event.method === "Input.dispatchKeyEvent" &&
            event.params?.["type"] === "char",
        ),
      ).toEqual([]);

      await page.keyboard.down("Shift");
      await page.keyboard.press("Enter");
      await page.keyboard.up("Shift");
      await page.keyboard.press("Enter");
      expect(
        FakeWebSocket.sent
          .filter(
            (event) =>
              event.method === "Input.dispatchKeyEvent" &&
              event.params?.["type"] === "char",
          )
          .map((event) => ({
            text: event.params?.["text"],
            modifiers: event.params?.["modifiers"],
          })),
      ).toEqual([
        { text: "\r", modifiers: 8 },
        { text: "\r", modifiers: 0 },
      ]);
    },
  );

  it("surfaces browser exception identity, message, and stack", async () => {
    installFakeWebSocket();
    const browser = await BrowserImpl.connect("ws://cdp");
    const page = browser.contexts()[0]!.pages()[0]!;

    let failure: unknown;
    try {
      await page.evaluate(() => {
        throw new Error("boom-marker");
      });
    } catch (error) {
      failure = error;
    }
    if (!(failure instanceof CdpError))
      throw new Error("Expected a structured CdpError");
    expect(failure.message).toBe(
      "Browser evaluation failed: ReferenceError: boom-marker is not defined\n" +
        "    at save (https://example.com/panel.js:12:7)",
    );
    expect(failure.errorData).toEqual({
      code: "cdp_evaluation_failed",
      operation: "Runtime.evaluate",
      failureKind: "user-code",
      recovery: "correct-page-function",
    });
  });

  it("captures a screenshot via Page.captureScreenshot and maps type to CDP format", async () => {
    installFakeWebSocket();
    const browser = await BrowserImpl.connect("ws://cdp");
    const page = browser.contexts()[0]!.pages()[0]!;
    const shot = await page.screenshot({ type: "jpeg", quality: 80 });
    expect(shot).toBeInstanceOf(Uint8Array);
    expect(shot.length).toBeGreaterThan(0);
    const capture = FakeWebSocket.sent
      .filter((entry) => entry.method === "Page.captureScreenshot")
      .pop();
    expect(capture).toEqual({
      method: "Page.captureScreenshot",
      params: { format: "jpeg", quality: 80 },
    });
  });

  it("supports full-page capture and rejects silently ignored screenshot options", async () => {
    installFakeWebSocket();
    const browser = await BrowserImpl.connect("ws://cdp");
    const page = browser.contexts()[0]!.pages()[0]!;

    await page.screenshot({ fullPage: true });
    expect(FakeWebSocket.sent).toContainEqual({
      method: "Page.captureScreenshot",
      params: { captureBeyondViewport: true },
    });
    await expect(
      page.screenshot({ path: ".tmp/panel.png" } as unknown as {
        type?: "png";
      }),
    ).rejects.toThrow(
      "store it explicitly with @workspace/runtime blobstore.putBytes",
    );
  });

  it("exposes a raw CdpConnection for protocol-level work", async () => {
    installFakeWebSocket();
    const conn = await CdpConnection.connect("ws://cdp", "token");
    const events: unknown[] = [];
    conn.on("Custom.event", (p) => events.push(p));
    await expect(
      conn.send("Page.navigate", { url: "https://x" }),
    ).resolves.toBeDefined();
    conn.close();
  });

  it("renders Playwright-style locator descriptions via toString()", async () => {
    installFakeWebSocket();
    const browser = await BrowserImpl.connect("ws://cdp");
    const page = browser.contexts()[0]!.pages()[0]!;

    expect(page.getByRole("button", { name: "Go" }).toString()).toBe(
      'getByRole("button", { name: "Go", exact: true })',
    );
    expect(page.getByRole("button", { name: /delete item/i }).toString()).toBe(
      'getByRole("button", { name: /delete item/i })',
    );
    expect(page.getByRole("button", { name: /delete item/i })).toMatchObject({
      descriptor: {
        steps: [
          {
            by: "role",
            name: { regex: { source: "delete item", flags: "i" } },
          },
        ],
      },
    });
    expect(page.getByText("Hello").nth(2).toString()).toBe(
      'getByText("Hello").nth(2)',
    );
    expect(page.locator("div").first().toString()).toBe(
      'locator("div").first()',
    );
    expect(page.locator('text="Hello"').toString()).toBe(
      'getByText("Hello", { exact: true })',
    );
    expect(page.getByTestId("save").toString()).toBe('getByTestId("save")');
  });

  it("throws a CdpError that names the locator when an element is not actionable", async () => {
    installFakeWebSocket();
    const browser = await BrowserImpl.connect("ws://cdp");
    const page = browser.contexts()[0]!.pages()[0]!;

    const err = await page
      .getByTestId("missing")
      .click({ timeout: 40 })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CdpError);
    expect((err as CdpError).message).toContain('getByTestId("missing")');
    expect((err as CdpError).locator).toBe('getByTestId("missing")');
    expect((err as CdpError).errorData).toMatchObject({
      code: "cdp_locator_not_actionable",
      failureKind: "user-code",
      recovery: "reobserve-locator",
      locator: 'getByTestId("missing")',
      timeoutMs: 40,
    });
  });

  it("adds locator context without replacing a typed CDP failure", async () => {
    installFakeWebSocket();
    const browser = await BrowserImpl.connect("ws://cdp");
    const page = browser.contexts()[0]!.pages()[0]!;
    vi.spyOn(page, "evaluate").mockRejectedValueOnce(
      new CdpError("Browser evaluation failed", {
        code: "cdp_evaluation_failed",
        operation: "Runtime.evaluate",
        recovery: "correct-page-function",
      }),
    );

    const failure = await page
      .getByTestId("save")
      .count()
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(CdpError);
    expect(failure).toMatchObject({
      code: "cdp_evaluation_failed",
      locator: 'getByTestId("save")',
      errorData: {
        code: "cdp_evaluation_failed",
        operation: "count",
        recovery: "correct-page-function",
        locator: 'getByTestId("save")',
      },
    });
  });

  it("names a segmented radio from accessible content without its decorative label clone", async () => {
    installFakeWebSocket();
    const browser = await BrowserImpl.connect("ws://cdp");
    const page = browser.contexts()[0]!.pages()[0]!;
    await page.getByRole("radio", { name: "Saved", exact: true }).count();
    const expression = FakeWebSocket.sent
      .filter((entry) => entry.method === "Runtime.evaluate")
      .map((entry) => String(entry.params?.["expression"] ?? ""))
      .find((value) => value.includes('"op":"count"'))!;
    const text = { nodeType: 3, nodeValue: "Saved" };
    const decorative = {
      nodeType: 1,
      tagName: "SPAN",
      childNodes: [text],
      getAttribute: (key: string) => (key === "aria-hidden" ? "true" : null),
    };
    const label = {
      nodeType: 1,
      tagName: "SPAN",
      childNodes: [text],
      getAttribute: () => null,
    };
    const radio = {
      tagName: "BUTTON",
      innerText: "Saved Saved",
      textContent: "SavedSaved",
      childNodes: [decorative, label],
      getAttribute: (key: string) => (key === "role" ? "radio" : null),
    };
    await expect(
      runInNewContext(expression, {
        document: { querySelectorAll: () => [radio] },
      }),
    ).resolves.toBe(1);
    await browser.close();
  });

  it("keeps exact element text distinct from a decorative descendant's accessible visibility", async () => {
    installFakeWebSocket();
    const browser = await BrowserImpl.connect("ws://cdp");
    const page = browser.contexts()[0]!.pages()[0]!;
    const mark = {
      tagName: "SPAN",
      textContent: "✓",
      getAttribute: (key: string) => (key === "aria-hidden" ? "true" : null),
      querySelectorAll: () => [],
    };
    const message = {
      tagName: "DIV",
      textContent: "✓ No done tasks right now.",
      querySelectorAll: () => [mark],
    };
    const document = { querySelectorAll: () => [message, mark] };
    const count = async (text: string, exact: boolean) => {
      await page.getByText(text, { exact }).count();
      const expression = FakeWebSocket.sent
        .filter((entry) => entry.method === "Runtime.evaluate")
        .map((entry) => String(entry.params?.["expression"] ?? ""))
        .filter((value) => value.includes('"op":"count"'))
        .at(-1)!;
      return runInNewContext(expression, { document });
    };
    await expect(count("No done tasks right now.", true)).resolves.toBe(0);
    await expect(count("✓ No done tasks right now.", true)).resolves.toBe(1);
    await expect(count("No done tasks right now.", false)).resolves.toBe(1);
    await browser.close();
  });

  it("identifies named roles exactly on pages and scoped locators, with explicit pattern searches", async () => {
    installFakeWebSocket();
    const browser = await BrowserImpl.connect("ws://cdp");
    const page = browser.contexts()[0]!.pages()[0]!;
    const button = (name: string) => ({
      tagName: "BUTTON",
      getAttribute: (key: string) => (key === "aria-label" ? name : null),
    });
    const buttons = [
      button("Active"),
      button("Mark active Take a lunch break"),
    ];
    const document = { querySelectorAll: () => buttons };
    const evaluateCount = async (
      locator: ReturnType<typeof page.getByRole>,
    ) => {
      await locator.count();
      const expression = FakeWebSocket.sent
        .filter((entry) => entry.method === "Runtime.evaluate")
        .map((entry) => String(entry.params?.["expression"] ?? ""))
        .filter((value) => value.includes('"op":"count"'))
        .at(-1)!;
      return runInNewContext(expression, { document });
    };
    await expect(
      evaluateCount(page.getByRole("button", { name: "Active" })),
    ).resolves.toBe(1);
    await expect(
      evaluateCount(page.getByRole("button", { name: "active" })),
    ).resolves.toBe(0);
    await expect(
      evaluateCount(page.getByRole("button", { name: "Active", exact: false })),
    ).resolves.toBe(2);
    await expect(
      evaluateCount(page.getByRole("button", { name: /active/i })),
    ).resolves.toBe(2);
    const container = { querySelectorAll: () => buttons };
    const scoped = page
      .locator("section")
      .getByRole("button", { name: "Active" });
    await scoped.count();
    const expression = FakeWebSocket.sent
      .filter((entry) => entry.method === "Runtime.evaluate")
      .map((entry) => String(entry.params?.["expression"] ?? ""))
      .filter((value) => value.includes('"op":"count"'))
      .at(-1)!;
    expect(
      await runInNewContext(expression, {
        document: { querySelectorAll: () => [container] },
      }),
    ).toBe(1);
    buttons.push(button("Active"));
    await expect(
      evaluateCount(page.getByRole("button", { name: "Active" })),
    ).resolves.toBe(2);
    const duplicateExpression = FakeWebSocket.sent
      .filter((entry) => entry.method === "Runtime.evaluate")
      .map((entry) => String(entry.params?.["expression"] ?? ""))
      .filter((value) => value.includes('"op":"count"'))
      .at(-1)!;
    expect(
      await runInNewContext(
        duplicateExpression.replace('"op":"count"', '"op":"focus"'),
        { document },
      ),
    ).toMatchObject({ __nsLocatorFailure: "ambiguous", matchCount: 2 });
    expect(
      page.getByRole("button", { name: "Active", exact: false }).toString(),
    ).toContain("exact: false");
    await browser.close();
  });

  it("captures expected-versus-observed evidence only on failure with session provenance", async () => {
    installFakeWebSocket();
    const identity = {
      panelId: "panel:todo",
      attemptId: "attempt:old",
      runtimeEntityId: "runtime:old",
      buildKey: "build:old",
    };
    const browser = await BrowserImpl.connect("ws://cdp", {
      inspectionIdentity: identity,
    });
    const page = browser.contexts()[0]!.pages()[0]!;
    page.setDefaultTimeout(40);
    await page.getByRole("button", { name: "Go" }).count();
    expect(
      FakeWebSocket.sent.some((e) =>
        String(e.params?.["expression"]).includes('"op":"failureEvidence"'),
      ),
    ).toBe(false);
    const failure = await page
      .getByTestId("missing")
      .innerText()
      .catch((e) => e);
    expect(failure).toMatchObject({
      code: "cdp_locator_state_mismatch",
      errorData: {
        state: "attached",
        evidence: {
          status: "captured",
          session: identity,
          matchCount: 0,
          snapshot: { text: "0 tasks left" },
        },
      },
    });
    expect(
      FakeWebSocket.sent.filter((e) =>
        String(e.params?.["expression"]).includes('"op":"failureEvidence"'),
      ),
    ).toHaveLength(1);
    expect(FakeWebSocket.sent.some((e) => e.method.startsWith("Input."))).toBe(
      false,
    );
    await browser.close();
  });

  it("bounds native failure snapshots and reports actual matching control state and scope", async () => {
    installFakeWebSocket();
    const browser = await BrowserImpl.connect("ws://cdp");
    const page = browser.contexts()[0]!.pages()[0]!;
    await page.locator("section").getByRole("checkbox").count();
    const expression = FakeWebSocket.sent
      .filter((e) => e.method === "Runtime.evaluate")
      .map((e) => String(e.params?.["expression"]))
      .filter((e) => e.includes('"op":"count"'))
      .at(-1)!
      .replace('"op":"count"', '"op":"failureEvidence"');
    const controls = Array.from({ length: 10 }, () => ({
      tagName: "INPUT",
      checked: false,
      disabled: true,
      innerText: "x".repeat(400),
      getAttribute: (key: string) =>
        key === "aria-label"
          ? "Complete task"
          : key === "type"
            ? "checkbox"
            : null,
      getBoundingClientRect: () => ({ width: 10, height: 10 }),
    }));
    const container = {
      innerText: "0 tasks left\n" + "x".repeat(5000),
      querySelectorAll: () => controls,
    };
    const document = {
      body: { innerText: "Unrelated page text" },
      querySelectorAll: () => [container],
    };
    const evidence = await runInNewContext(expression, {
      document,
      location: { href: "https://example.test" },
      getComputedStyle: () => ({
        visibility: "visible",
        display: "block",
        opacity: "1",
      }),
    });
    expect(evidence).toMatchObject({
      matchCount: 10,
      matchesTruncated: true,
      snapshot: {
        scope: "container",
        scopeCount: 1,
        totalChars: 5013,
        truncated: true,
      },
    });
    expect(evidence.matches).toHaveLength(8);
    expect(evidence.matches[0]).toMatchObject({
      checked: false,
      enabled: false,
      visible: true,
      textTruncated: true,
    });
    expect(evidence.snapshot.text).toHaveLength(4000);
    expect(evidence.snapshot.text).toContain("0 tasks left");
    controls[0]!.checked = true;
    expect(
      (
        await runInNewContext(expression, {
          document,
          location: { href: "https://example.test" },
          getComputedStyle: () => ({ display: "none" }),
        })
      ).matches[0],
    ).toMatchObject({ checked: true, visible: false });
    container.querySelectorAll = () => [];
    expect(
      await runInNewContext(expression, {
        document,
        location: { href: "https://example.test" },
      }),
    ).toMatchObject({ matchCount: 0, snapshot: { scope: "container" } });
    document.querySelectorAll = () => [];
    expect(
      await runInNewContext(expression, {
        document,
        location: { href: "https://example.test" },
      }),
    ).toMatchObject({
      matchCount: 0,
      snapshot: { scope: "page", text: "Unrelated page text" },
    });
    await browser.close();
  });

  it("preserves the primary failure when evidence collection fails", async () => {
    installFakeWebSocket();
    const browser = await BrowserImpl.connect("ws://cdp");
    const page = browser.contexts()[0]!.pages()[0]!;
    page.setDefaultTimeout(40);
    const evaluate = page.evaluate.bind(page);
    vi.spyOn(page, "evaluate").mockImplementation((fn, arg, opts) => {
      if (opts?.operation === "locator.failureEvidence")
        return Promise.reject(new Error("Evidence target disappeared"));
      return evaluate(fn, arg, opts);
    });
    const failure = await page
      .getByTestId("missing")
      .innerText()
      .catch((e) => e);
    expect(failure).toMatchObject({
      code: "cdp_locator_state_mismatch",
      errorData: {
        state: "attached",
        evidence: {
          status: "unavailable",
          reason: "Evidence target disappeared",
        },
      },
    });
    await browser.close();
  });

  it("retains the primary locator failure when its evidence target closes", async () => {
    installFakeWebSocket();
    const browser = await BrowserImpl.connect("ws://cdp");
    const page = browser.contexts()[0]!.pages()[0]!;
    page.setDefaultTimeout(40);
    vi.useFakeTimers();
    FakeWebSocket.dropFailureEvidence = true;
    let settled = false;
    const pending = page
      .getByTestId("missing")
      .innerText()
      .catch((error) => error)
      .finally(() => {
        settled = true;
      });
    await vi.advanceTimersByTimeAsync(50);
    expect(
      FakeWebSocket.sent.some((e) =>
        String(e.params?.["expression"]).includes('"op":"failureEvidence"'),
      ),
    ).toBe(true);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(settled).toBe(false);
    FakeWebSocket.instances[0]!.remoteClose();
    expect(await pending).toMatchObject({
      code: "cdp_locator_state_mismatch",
      errorData: {
        evidence: {
          status: "unavailable",
          reason: expect.stringContaining("closed"),
        },
      },
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("reports available accessible names when a named role locator misses", async () => {
    installFakeWebSocket();
    const browser = await BrowserImpl.connect("ws://cdp");
    const page = browser.contexts()[0]!.pages()[0]!;

    const err = await page
      .getByRole("button", { name: "Done" })
      .click({ timeout: 40 })
      .catch((error: unknown) => error);

    expect((err as Error).message).toContain(
      'Available button names: "All 5", "Open 2", "Done 3"',
    );
  });

  it("reports matching accessible targets when the requested role is wrong", async () => {
    installFakeWebSocket();
    const browser = await BrowserImpl.connect("ws://cdp");
    const page = browser.contexts()[0]!.pages()[0]!;

    const err = await page
      .getByRole("button", { name: "Completed" })
      .click({ timeout: 40 })
      .catch((error: unknown) => error);

    expect((err as Error).message).toContain(
      'Available accessible targets: radio "Completed", tab "Completed"',
    );
  });

  it("honors setDefaultTimeout in actionability errors", async () => {
    installFakeWebSocket();
    const browser = await BrowserImpl.connect("ws://cdp");
    const page = browser.contexts()[0]!.pages()[0]!;
    page.setDefaultTimeout(40);

    const err = await page
      .getByTestId("missing")
      .click()
      .catch((e: unknown) => e);
    expect((err as Error).message).toContain("40ms");
  });
  it("uses control-free associated labels and refuses ambiguous single-element operations", async () => {
    installFakeWebSocket();
    const browser = await BrowserImpl.connect("ws://cdp");
    const page = browser.contexts()[0]!.pages()[0]!;
    await page
      .getByRole("combobox", { name: "Priority", exact: false })
      .count();
    const expression = FakeWebSocket.sent
      .filter((entry) => entry.method === "Runtime.evaluate")
      .map((entry) => String(entry.params?.["expression"] ?? ""))
      .find((value) => value.includes('"op":"count"'))!;
    const associatedLabel = {
      innerText: "PriorityLowNormalHigh",
      cloneNode: () => {
        const clone = {
          innerText: "PriorityLowNormalHigh",
          querySelectorAll: () => [
            {
              remove: () => {
                clone.innerText = "Priority";
              },
            },
          ],
        };
        return clone;
      },
    };
    const focus = vi.fn();
    const filter = {
      tagName: "SELECT",
      labels: [],
      focus,
      getAttribute: (name: string) =>
        name === "aria-label" ? "Filter priority" : null,
    };
    const editor = {
      tagName: "SELECT",
      labels: [associatedLabel],
      focus,
      getAttribute: () => null,
    };
    const document = { querySelectorAll: () => [filter, editor] };
    expect(await runInNewContext(expression, { document })).toBe(2);
    expect(
      await runInNewContext(
        expression.replace('"exact":false', '"exact":true'),
        { document },
      ),
    ).toBe(1);
    const failure = await runInNewContext(
      expression.replace('"op":"count"', '"op":"selectOption"'),
      { document },
    );
    expect(failure).toMatchObject({
      __nsLocatorFailure: "ambiguous",
      matchCount: 2,
      candidates: [
        { role: "combobox", accessibleName: "Filter priority" },
        { role: "combobox", accessibleName: "Priority" },
      ],
    });
    expect(focus).not.toHaveBeenCalled();
    vi.spyOn(page, "evaluate").mockResolvedValueOnce(failure);
    await expect(
      page
        .getByRole("combobox", { name: "Priority", exact: false })
        .selectOption("high"),
    ).rejects.toMatchObject({
      code: "cdp_locator_ambiguous",
      errorData: { operation: "selectOption", matchCount: 2 },
    });
    expect(
      FakeWebSocket.sent.some((entry) => entry.method.startsWith("Input.")),
    ).toBe(false);
    await browser.close();
  });
});
