/**
 * `@workspace/tendril/agent` — the agent's side of a tendril (tendrils plan
 * §5.4), for eval:
 *
 *   import { createTendril, listDevices } from "@workspace/tendril/agent";
 *   const t = await createTendril({ source: "panels/trip", channelId, contextId, name: "Trip" });
 *   const [phone] = (await listDevices()).filter((d) => d.platform === "mobile");
 *   await t.present(phone.deviceId, { alert: "inbox" });
 *   // edit panels/trip, then:
 *   await t.update();           // rebuilds every presentation; a broken build reverts by itself
 *
 * A presentation is an ordinary panel slot whose stateArgs name the tendril.
 */
import type { RpcCaller } from "@vibestudio/rpc";
import { createRpcMethodCaller } from "@vibestudio/shared/rpcMethods";
import type { StateOp, TendrilAbout, TendrilDescription } from "./protocol.js";
import { tendrilRpcMethods, tendrilTargetId, type TendrilStateArgs } from "./do-contract.js";

export type PresentationTarget = {
  deviceId: string;
  label: string;
  platform: "desktop" | "mobile" | "headless";
  online: boolean;
  clientSessionId: string | null;
};
export type PresentResult = { state: "presented" | "pending-device" | "pushed" };
export type UpdateOutcome = {
  slotId: string;
  outcome: "proven" | "pending-device" | { failed: unknown };
};

export interface TendrilHandle {
  readonly id: string;
  describe(): Promise<TendrilDescription>;
  /** Show the tendril on one of the user's devices (reusing its presentation there). */
  present(
    deviceId: string,
    o?: { focus?: boolean; alert?: "none" | "inbox" | "interrupt" },
  ): Promise<PresentResult & { slotId: string }>;
  /** Rebuild every presentation from the current source, keeping the old build one step back. */
  update(): Promise<UpdateOutcome[]>;
  /** Go back to the previous build of a presentation. */
  back(slotId?: string): Promise<void>;
  /** Run code in a presentation's page; a bare expression returns its value. */
  eval(code: string, o?: { slotId?: string }): Promise<unknown>;
  /** Call a function the page exposed. */
  call(name: string, args?: unknown, o?: { slotId?: string }): Promise<unknown>;
  readonly state: {
    get(): Promise<{ rev: number; state: Record<string, unknown> }>;
    apply(ops: StateOp[]): Promise<{ rev: number }>;
  };
  setAbout(about: TendrilAbout): Promise<void>;
  /** Close every presentation. Channel history and state remain. */
  archive(): Promise<void>;
}

type PanelHandleLike = {
  readonly id: string;
  readonly call: Record<string, (...args: unknown[]) => Promise<unknown>>;
  rebuild(o?: { history?: "append" | "replace" }): Promise<unknown>;
  requestPresentation(r: {
    deviceId: string;
    focus?: boolean;
    alert?: "none" | "inbox" | "interrupt";
  }): Promise<PresentResult>;
  archive(): Promise<unknown>;
};

/** The slice of `@workspace/runtime` used here; injectable for tests. */
export interface TendrilAgentRuntime {
  rpc: Pick<RpcCaller, "call">;
  panelTree: {
    listPresentationTargets(): Promise<PresentationTarget[]>;
    navigateHistory(id: string, delta: -1 | 1): Promise<unknown>;
  };
  createPanelSlot(
    source: string,
    o: { contextId?: string; ref?: string; stateArgs?: Record<string, unknown>; title?: string; parentId?: string | null },
  ): Promise<PanelHandleLike>;
  getPanelHandle(id: string): PanelHandleLike;
}

async function runtimeOf(runtime?: TendrilAgentRuntime): Promise<TendrilAgentRuntime> {
  return runtime ?? ((await import("@workspace/runtime")) as unknown as TendrilAgentRuntime);
}

export async function listDevices(runtime?: TendrilAgentRuntime): Promise<PresentationTarget[]> {
  return (await runtimeOf(runtime)).panelTree.listPresentationTargets();
}

export async function createTendril(
  o: {
    source: string;
    channelId: string;
    contextId: string;
    name: string;
    ref?: string;
    about?: TendrilAbout;
    /** Reuse to make creation retry-safe; defaults to a fresh UUID. */
    tendrilId?: string;
  },
  runtime?: TendrilAgentRuntime,
): Promise<TendrilHandle> {
  const rt = await runtimeOf(runtime);
  const tendrilId = o.tendrilId ?? crypto.randomUUID();
  await createRpcMethodCaller(rt.rpc, tendrilTargetId(tendrilId), tendrilRpcMethods)("create", [
    {
      source: o.source,
      channelId: o.channelId,
      contextId: o.contextId,
      name: o.name,
      ...(o.about ? { about: o.about } : {}),
    },
  ]);
  return handleFor(rt, tendrilId, o.ref);
}

export async function openTendril(
  tendrilId: string,
  o: { ref?: string } = {},
  runtime?: TendrilAgentRuntime,
): Promise<TendrilHandle> {
  const rt = await runtimeOf(runtime);
  const handle = handleFor(rt, tendrilId, o.ref);
  await handle.describe(); // fails clearly for an unknown tendril
  return handle;
}

function handleFor(rt: TendrilAgentRuntime, tendrilId: string, ref?: string): TendrilHandle {
  const tendrilDo = createRpcMethodCaller(rt.rpc, tendrilTargetId(tendrilId), tendrilRpcMethods);
  const describe = () => tendrilDo("describe", []);
  const slotOf = async (slotId?: string) => {
    if (slotId) return slotId;
    const { presentations } = await describe();
    const first = presentations[0];
    if (!first) throw new Error(`Tendril ${tendrilId} is not presented anywhere yet; call present(deviceId)`);
    return first.slotId;
  };
  const pageCall = async (slotId: string | undefined, method: string, input: unknown) => {
    const handle = rt.getPanelHandle(await slotOf(slotId));
    const fn = handle.call[method];
    if (!fn) throw new Error(`Panel ${handle.id} has no ${method}`);
    return fn(input);
  };

  return {
    id: tendrilId,
    describe,
    async present(deviceId, o = {}) {
      const description = await describe();
      const existing = description.presentations.find((p) => p.deviceId === deviceId);
      const stateArgs: { tendril: TendrilStateArgs } = {
        tendril: { tendrilId, channelId: description.channelId, contextId: description.contextId },
      };
      const handle = existing
        ? rt.getPanelHandle(existing.slotId)
        : await rt.createPanelSlot(description.source, {
            contextId: description.contextId,
            ...(ref ? { ref } : {}),
            stateArgs,
            title: description.name,
            parentId: null,
          });
      const result = await handle.requestPresentation({
        deviceId,
        focus: o.focus ?? true,
        alert: o.alert ?? "none",
      });
      return { ...result, slotId: handle.id };
    },
    async update() {
      const [{ presentations }, targets] = await Promise.all([
        describe(),
        rt.panelTree.listPresentationTargets(),
      ]);
      const online = new Set(targets.filter((t) => t.online).map((t) => t.deviceId));
      return Promise.all(
        presentations.map(async ({ slotId, deviceId }): Promise<UpdateOutcome> => {
          // A page nobody is looking at loads the current source when it next opens.
          if (deviceId && !online.has(deviceId)) return { slotId, outcome: "pending-device" };
          try {
            await rt.getPanelHandle(slotId).rebuild({ history: "append" });
            return { slotId, outcome: "proven" };
          } catch (error) {
            return { slotId, outcome: { failed: describeFailure(error) } };
          }
        }),
      );
    },
    async back(slotId) {
      await rt.panelTree.navigateHistory(await slotOf(slotId), -1);
    },
    async eval(code, o = {}) {
      const result = (await pageCall(o.slotId, "tendril.eval", { code })) as {
        ok: boolean;
        value?: unknown;
        error?: { message: string };
        console: unknown[];
      };
      if (!result.ok)
        throw Object.assign(new Error(result.error?.message ?? "Page eval failed"), {
          console: result.console,
        });
      return result.value;
    },
    call: (name, args, o = {}) => pageCall(o.slotId, "tendril.fn", { name, args: args ?? {} }),
    state: {
      get: () => tendrilDo("getState", []),
      apply: (ops) => tendrilDo("applyState", [{ cid: `agent:${crypto.randomUUID()}`, ops }]),
    },
    setAbout: (about) => tendrilDo("setAbout", [about]),
    async archive() {
      const { presentations } = await describe();
      for (const { slotId } of presentations) {
        await rt.getPanelHandle(slotId).archive();
        await tendrilDo("unregisterPresentation", [slotId]);
      }
    },
  };
}

function describeFailure(error: unknown): unknown {
  if (error && typeof error === "object" && "failure" in error)
    return (error as { failure: unknown }).failure;
  return error instanceof Error ? { message: error.message } : { message: String(error) };
}
