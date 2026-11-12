import { availablePages } from "@workspace/natlang/dashboard/pages.js";
import type { DashboardApi, PageModule } from "@workspace/natlang/dashboard/pages.js";
import { createH, fill, messageSummary } from "@workspace/natlang/dashboard/common.js";
import type { NatlangLiveSubscription } from "@workspace/natlang-records/client";
import { evaluationsPage } from "./evaluationsPage.js";
import { executorPage } from "./executorPage.js";
import type { NatlangPanelPorts } from "./ports.js";
import { programsApi } from "./programsApi.js";
import { createRunHost } from "./runHost.js";
import { statusApi } from "./statusApi.js";
import { tracesApi } from "./tracesApi.js";

export interface MountedDashboard {
  navigate(route: string): void;
  /** The page currently mounted (its id), for tests and the status line. */
  readonly page: string;
  dispose(): void;
}

/** The dashboard's `DashboardApi` over Vibestudio services. Natlang's Models and System groups are not provided. */
export function createDashboardApi(ports: NatlangPanelPorts, runHost: ReturnType<typeof createRunHost>): DashboardApi {
  return {
    status: statusApi(ports, () => runHost.running()),
    programs: programsApi(ports, { lastCalls: () => runHost.lastCalls() }),
    traces: tracesApi(ports),
  } as unknown as DashboardApi;
}

/** The pages offered, in navigation order: natlang's own that this host supports, then the panel's executor and evaluations. */
export function dashboardPages(api: DashboardApi, runs: ReturnType<typeof createRunHost>, ports: NatlangPanelPorts): PageModule[] {
  return [
    ...availablePages({ api, runs: runs as never }),
    executorPage(ports),
    evaluationsPage(ports),
  ];
}

/**
 * Mount the dashboard: natlang's own page modules, driven by Vibestudio's `DashboardApi` and `RunHost`, inside a small
 * shell (navigation rail, route, toast). Pages mount and dispose with the route; the live feed of recorded calls is
 * followed only while the Traces page is mounted (the Runs page holds its own through the run host's subscription).
 */
export function mountDashboard(
  root: HTMLElement,
  ports: NatlangPanelPorts,
  options: { theme?: "light" | "dark"; initialRoute?: string } = {}
): MountedDashboard {
  const doc = root.ownerDocument;
  const h = createH(doc);
  const runs = createRunHost(ports);
  const api = createDashboardApi(ports, runs);
  const pages = dashboardPages(api, runs, ports);

  const nav = h("nav", { "aria-label": "Pages" });
  const model = h("div", { class: "rail-foot", id: "rail-model" }, "…");
  const main = h("main", { tabindex: "-1", id: "main" });
  const toastBox = h("div", { id: "toast", role: "status", "aria-live": "polite", hidden: true });
  const banner = h("div", { class: "callout info row", id: "traces-live", hidden: true });
  const shell = h(
    "div",
    { class: "shell" },
    h("aside", { class: "rail", "aria-label": "Sections" }, h("div", { class: "brand" }, h("span", { class: "mark" }, "nl"), h("span", {}, "natlang")), nav, model),
    main
  );
  root.classList.add("nl-dash", "nl-app");
  if (options.theme) root.dataset["theme"] = options.theme;
  fill(root, shell, toastBox);

  /** A notification stays until it is clicked or replaced: an error is never lost to a timer. */
  const toast = (text: unknown, error = false) => {
    toastBox.textContent = messageSummary(text);
    toastBox.className = error ? "error" : "";
    toastBox.hidden = false;
  };
  toastBox.addEventListener("click", () => (toastBox.hidden = true));

  const refreshStatus = () => {
    (api.status!.get() as Promise<any>).then(
      (status) => {
        const info = status.model;
        model.textContent = info.error ? `Executor problem: ${info.error}` : `executor · ${info.model}${info.provider ? ` (${info.provider})` : ""}`;
      },
      (error: Error) => (model.textContent = error.message)
    );
  };

  fill(nav, pages.map((page) => h("a", { href: `#${page.id}`, "data-view": page.id }, page.title)));

  let current = { page: "", dispose: () => {} };
  let disposed = false;
  let liveTraces: { stop(): void } | null = null;

  /** Follow recorded calls while the Traces page is mounted; new calls offer a refresh, they never move the page under you. */
  function followTraces(route: string): void {
    let pending = 0;
    let feed: NatlangLiveSubscription | null = null;
    let stopped = false;
    banner.hidden = true;
    void (async () => {
      try {
        const subscription = await ports.records.subscribeLive({});
        if (stopped) {
          await subscription.close().catch(() => undefined);
          return;
        }
        feed = subscription;
        for await (const delivery of subscription.deliveries) {
          const ended = delivery.events.filter((event) => event.type === "call_end").length;
          if (!ended) continue;
          pending += ended;
          fill(
            banner,
            h("span", {}, `${pending} new call${pending === 1 ? "" : "s"} recorded.`),
            h("button", { onclick: () => navigate(route) }, "Refresh")
          );
          banner.hidden = false;
        }
      } catch (error) {
        if (!stopped) toast(`Live updates stopped: ${(error as Error).message}`, true);
      }
    })();
    liveTraces = {
      stop() {
        stopped = true;
        banner.hidden = true;
        void feed?.close().catch(() => undefined);
      },
    };
  }

  function mountRoute(route: string): void {
    current.dispose();
    liveTraces?.stop();
    liveTraces = null;
    const [name = "", ...rest] = (route || "overview").split("-");
    const page = pages.find((candidate) => candidate.id === name) ?? pages[0]!;
    for (const link of Array.from(nav.querySelectorAll("a")))
      link.classList.toggle("active", (link as HTMLElement).dataset["view"] === page.id);
    const target = h("div");
    fill(main, page.id === "traces" ? banner : null, target);
    if (page.id === "traces") followTraces(route);
    let dispose = () => {};
    try {
      dispose = page.mount(target, { api, runs: runs as never, navigate, toast, refreshStatus, arg: rest.join("-") });
    } catch (error) {
      fill(target, h("div", { class: "callout warn" }, (error as Error).message));
    }
    current = { page: page.id, dispose };
  }

  function navigate(route: string): void {
    if (disposed) return;
    const target = `#${route}`;
    if (root.ownerDocument.defaultView?.location.hash === target) mountRoute(route);
    else root.ownerDocument.defaultView!.location.hash = target;
  }

  const onHash = () => mountRoute(root.ownerDocument.defaultView!.location.hash.slice(1));
  root.ownerDocument.defaultView!.addEventListener("hashchange", onHash);
  refreshStatus();
  const start = root.ownerDocument.defaultView!.location.hash.slice(1) || options.initialRoute || "overview";
  if (root.ownerDocument.defaultView!.location.hash.slice(1) === start) mountRoute(start);
  else navigate(start);

  return {
    navigate,
    get page() {
      return current.page;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      root.ownerDocument.defaultView!.removeEventListener("hashchange", onHash);
      liveTraces?.stop();
      current.dispose();
      root.replaceChildren();
      root.classList.remove("nl-dash", "nl-app");
    },
  };
}
