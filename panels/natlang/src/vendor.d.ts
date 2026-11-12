/**
 * Types for natlang's vendored dashboard modules (`@workspace/natlang/dashboard/*`, staged by `pnpm natlang:vendor`).
 * The embedding contract is the vendored `types.d.ts`; the page-building helpers the panel's own pages share with
 * natlang's are declared here as far as the panel uses them.
 */
declare module "@workspace/natlang/dashboard/pages.js" {
  export * from "@workspace/natlang/dashboard/types.js";
}

declare module "@workspace/natlang/dashboard/common.js" {
  import type { DashboardHost, PageModule, RunRecord } from "@workspace/natlang/dashboard/types.js";

  type Child = Node | string | number | null | undefined | false | Child[];
  export type H = (tag: string, attrs?: Record<string, unknown> | null, ...children: Child[]) => HTMLElement;

  /** What a page draws with: natlang's page context (dashboard/common.js `pageContext`). */
  export interface PageContext {
    h: H;
    fill(element: Element, ...children: Child[]): void;
    api: DashboardHost["api"];
    runs: DashboardHost["runs"];
    arg: string;
    navigate(route: string): void;
    href(route: string): string;
    toast(text: unknown, error?: boolean): void;
    scope: { defer(fn: () => void): void; signal: AbortSignal; readonly disposed: boolean };
    attempt<A extends unknown[], R>(fn: (...args: A) => Promise<R>): (...args: A) => Promise<R | undefined>;
    reload(): void;
    can(capability: string): boolean;
  }

  export function createH(doc: Document): H;
  export function fill(element: Element, ...children: Child[]): void;
  export function definePage(page: {
    id: string;
    requires?: readonly string[];
    runKinds?: readonly string[];
    render(target: HTMLElement, ctx: PageContext): Promise<void>;
  }): PageModule["mount"];
  export function widgets(ctx: PageContext): {
    pill(text: string, kind?: string): HTMLElement;
    emptyState(text: string, ...actions: Array<[label: string, route: string, primary?: boolean]>): HTMLElement;
    header(title: string, text?: string, ...actions: Child[]): HTMLElement;
    kv(pairs: Array<[string, Child] | null | undefined | false>): HTMLElement;
    tile(label: string, value: Child, sub?: Child): HTMLElement;
  };
  export function runLabel(run: RunRecord): string;
  export const bytes: (n: number | null | undefined) => string;
  export const ms: (n: number | null | undefined) => string;
  export const ago: (iso: string | null | undefined) => string;
  export const tokens: (n: number | null | undefined) => string;
  export function messageSummary(value: unknown): string;
}

declare module "@workspace/natlang/dashboard/style.css" {}
