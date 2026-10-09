// @vitest-environment jsdom

import { act, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MethodDefinition, PubSubClient } from "@workspace/pubsub";

const pubsubMock = vi.hoisted(() => ({
  connectViaRpc: vi.fn(),
}));

vi.mock("@workspace/pubsub", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@workspace/pubsub")>()),
  connectViaRpc: pubsubMock.connectViaRpc,
}));

vi.mock("@workspace/tool-ui", () => ({
  useFeedbackManager: () => ({
    activeFeedbacks: new Map(),
    addFeedback: vi.fn(),
    removeFeedback: vi.fn(),
    dismissFeedback: vi.fn(),
    handleFeedbackError: vi.fn(),
  }),
  useToolApproval: () => ({
    settings: {},
    setGlobalFloor: vi.fn(),
  }),
}));

import * as ReactJsxRuntime from "react/jsx-runtime";
import * as ReactJsxDevRuntime from "react/jsx-dev-runtime";
import { useAgenticChat } from "./useAgenticChat";
import type { ChatContextValue, ConnectionConfig } from "../types";
import {
  FULL_AGENTIC_CHAT_FEATURES,
  type AgenticChatFeature,
} from "../features";

function createClient(
  channelConfig: { title?: string; titleExplicit?: boolean } = {},
): PubSubClient & {
  updateChannelConfig: ReturnType<typeof vi.fn>;
} {
  return {
    clientId: "panel:chat",
    channelConfig,
    connected: false,
    ready: vi.fn(async () => undefined),
    onReady: vi.fn(() => () => undefined),
    close: vi.fn(),
    events: vi.fn(async function* () {}),
    onRoster: vi.fn(() => () => undefined),
    onReconnect: vi.fn(() => () => undefined),
    onConfigChange: vi.fn(() => () => undefined),
    getMessageTypes: vi.fn(async () => []),
    updateChannelConfig: vi.fn(async () => undefined),
  } as unknown as PubSubClient & {
    updateChannelConfig: ReturnType<typeof vi.fn>;
  };
}

function createRpcCall() {
  return vi.fn(async (_target: string, method: string) => {
    if (method === "workers.resolveService") {
      return { kind: "durable-object", targetId: "do:channel:chat-title-test" };
    }
    if (method === "getProvenance") {
      return { kind: "root" };
    }
    return undefined;
  }) as unknown as ConnectionConfig["rpc"]["call"];
}

function Probe({
  config,
  onContext,
  features = FULL_AGENTIC_CHAT_FEATURES,
  loadDynamicImports = true,
}: {
  config: ConnectionConfig;
  onContext?: (value: ChatContextValue) => void;
  features?: readonly AgenticChatFeature[];
  loadDynamicImports?: boolean;
}) {
  const { contextValue } = useAgenticChat({
    config,
    channelName: "chat-title-test",
    metadata: { name: "Chat Panel", type: "panel", handle: "alice" },
    ...(loadDynamicImports
      ? {
          importLoader: vi.fn(async () => ({
            bundle: "",
            format: "cjs" as const,
            requiredModules: [],
          })),
        }
      : {}),
    features,
  });
  onContext?.(contextValue);
  return null;
}

const sandboxGlobals = globalThis as Record<string, unknown>;

describe("useAgenticChat set_title", () => {
  beforeEach(() => {
    // Component compilation resolves requires through the runtime module map.
    const moduleMap: Record<string, unknown> = {
      "react/jsx-runtime": ReactJsxRuntime,
      "react/jsx-dev-runtime": ReactJsxDevRuntime,
    };
    sandboxGlobals["__vibestudioModuleMap__"] = moduleMap;
    sandboxGlobals["__vibestudioRequire__"] = (id: string) => {
      if (id in moduleMap) return moduleMap[id];
      throw new Error(`Module not found: ${id}`);
    };
    sandboxGlobals["__vibestudioPreloadModules__"] = async (ids: string[]) =>
      ids.map((id) => {
        if (id in moduleMap) return moduleMap[id];
        throw new Error(`Module not found: ${id}`);
      });
    document.title = "";
    pubsubMock.connectViaRpc.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete sandboxGlobals["__vibestudioModuleMap__"];
    delete sandboxGlobals["__vibestudioRequire__"];
    delete sandboxGlobals["__vibestudioPreloadModules__"];
  });

  it("uses the runtime RPC id, not the channel participant id, for browser handoff", async () => {
    const client = createClient();
    pubsubMock.connectViaRpc.mockReturnValue(client);
    const latestContext: { current: ChatContextValue | null } = {
      current: null,
    };
    const config: ConnectionConfig = {
      clientId: "panel:slot-id",
      rpc: {
        selfId: "panel:runtime-entity",
        call: createRpcCall(),
        stream: vi.fn(async () => new Response()),
        on: vi.fn(() => () => undefined),
      },
    };

    const { unmount } = render(
      <Probe
        config={config}
        onContext={(value) => {
          latestContext.current = value;
        }}
      />,
    );

    await waitFor(() => {
      expect(latestContext.current?.selfId).toBe("panel:chat");
    });
    expect(latestContext.current?.browserHandoffCaller).toEqual({
      id: "panel:runtime-entity",
      kind: "panel",
    });
    expect(pubsubMock.connectViaRpc).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: "panel:slot-id" }),
    );

    unmount();
  });

  it("keeps child transcript connection material stable across parent updates", async () => {
    const client = createClient();
    let publishConfig: ((config: { title?: string }) => void) | undefined;
    client.onConfigChange = vi.fn(
      (callback: (config: { title?: string }) => void) => {
        publishConfig = callback;
        return () => undefined;
      },
    ) as never;
    pubsubMock.connectViaRpc.mockReturnValue(client);
    const latestContext: { current: ChatContextValue | null } = {
      current: null,
    };
    const config: ConnectionConfig = {
      clientId: "panel:slot-id",
      rpc: {
        selfId: "panel:runtime-entity",
        call: createRpcCall(),
        stream: vi.fn(async () => new Response()),
        on: vi.fn(() => () => undefined),
      },
    };

    const { unmount } = render(
      <Probe
        config={config}
        onContext={(value) => {
          latestContext.current = value;
        }}
      />,
    );
    await waitFor(() => expect(publishConfig).toBeDefined());
    const initialConnection = latestContext.current!.childTranscript;

    act(() => publishConfig?.({ title: "Parent changed" }));

    await waitFor(() =>
      expect(latestContext.current?.channelTitle).toBe("Parent changed"),
    );
    expect(latestContext.current?.childTranscript).toBe(initialConnection);
    unmount();
  });

  it("keeps a transient connection failure visible while automatic retry is pending", async () => {
    const client = createClient();
    client.close = vi.fn(async () => undefined);
    client.ready = vi.fn(async () => {
      throw new Error("ReadError(Reset(513))");
    });
    pubsubMock.connectViaRpc.mockReturnValue(client);
    const latestContext: { current: ChatContextValue | null } = {
      current: null,
    };
    const config: ConnectionConfig = {
      clientId: "panel:chat",
      rpc: {
        selfId: "panel:chat",
        call: createRpcCall(),
        stream: vi.fn(async () => new Response()),
        on: vi.fn(() => () => undefined),
      },
    };

    const { unmount } = render(
      <Probe
        config={config}
        onContext={(value) => {
          latestContext.current = value;
        }}
      />,
    );

    await waitFor(
      () => {
        expect(latestContext.current?.connectionError?.message).toBe(
          "ReadError(Reset(513))",
        );
      },
      { timeout: 200 },
    );
    expect(pubsubMock.connectViaRpc).toHaveBeenCalledOnce();

    unmount();
  });

  it("recovers automatically after a transient initial connection failure", async () => {
    const failedClient = createClient();
    failedClient.close = vi.fn(async () => undefined);
    failedClient.ready = vi.fn(async () => {
      throw new Error("ReadError(Reset(513))");
    });
    const recoveredClient = createClient();
    pubsubMock.connectViaRpc
      .mockReturnValueOnce(failedClient)
      .mockReturnValueOnce(recoveredClient);
    const latestContext: { current: ChatContextValue | null } = {
      current: null,
    };
    const config: ConnectionConfig = {
      clientId: "panel:chat",
      rpc: {
        selfId: "panel:chat",
        call: createRpcCall(),
        stream: vi.fn(async () => new Response()),
        on: vi.fn(() => () => undefined),
      },
    };

    const { unmount } = render(
      <Probe
        config={config}
        onContext={(value) => {
          latestContext.current = value;
        }}
      />,
    );

    await waitFor(() => expect(latestContext.current?.connected).toBe(true), {
      timeout: 1_000,
    });
    expect(pubsubMock.connectViaRpc).toHaveBeenCalledTimes(2);
    expect(latestContext.current?.connectionError).toBeNull();

    unmount();
  });

  it("does not advertise a panel-owned set_title method", async () => {
    const client = createClient();
    let methods: Record<string, MethodDefinition> | undefined;
    pubsubMock.connectViaRpc.mockImplementation(
      (options: { methods: Record<string, MethodDefinition> }) => {
        methods = options.methods;
        return client;
      },
    );
    const call = createRpcCall();
    const config: ConnectionConfig = {
      clientId: "panel:chat",
      rpc: {
        selfId: "panel:chat",
        call,
        stream: vi.fn(async () => new Response()),
        on: vi.fn(() => () => undefined),
      },
    };

    const { unmount } = render(<Probe config={config} />);

    await waitFor(() => {
      expect(methods).toBeDefined();
    });
    expect(methods?.["set_title"]).toBeUndefined();

    unmount();
  });

  it("records the method caller as requestedBy on published inline UI and action bar events", async () => {
    const client = createClient();
    const publish = vi.fn(async () => 1);
    Object.assign(client, {
      publish,
      roster: { "do:author": { metadata: { name: "Author", type: "agent", handle: "author" } } },
    });
    let methods: Record<string, MethodDefinition> | undefined;
    pubsubMock.connectViaRpc.mockImplementation(
      (options: { methods: Record<string, MethodDefinition> }) => {
        methods = options.methods;
        return client;
      },
    );
    const config: ConnectionConfig = {
      clientId: "panel:chat",
      rpc: {
        selfId: "panel:chat",
        call: createRpcCall(),
        stream: vi.fn(async () => new Response()),
        on: vi.fn(() => () => undefined),
      },
    };
    const { unmount } = render(<Probe config={config} />);
    await waitFor(() => expect(methods).toBeDefined());
    // Wait until the hook has adopted the connected client.
    await waitFor(async () => {
      const ctx = { callerId: "do:author", result: vi.fn() } as never;
      await methods!["inline_ui"]!.execute(
        { id: "card-1", code: "export default () => null" },
        ctx,
      );
      expect(publish).toHaveBeenCalled();
    });
    await methods!["load_action_bar"]!.execute(
      { clear: true },
      { callerId: "do:author", result: vi.fn() } as never,
    );
    const requestedBy = {
      kind: "agent",
      id: "do:author",
      participantId: "do:author",
      displayName: "Author",
    };
    const events = publish.mock.calls.map((call) => (call as unknown[])[1] as {
      kind: string;
      actor: { id: string };
      payload: { requestedBy?: unknown };
    });
    const inline = events.find((e) => e.kind === "ui.inline_rendered");
    const bar = events.find((e) => e.kind === "ui.action_bar.updated");
    expect(inline?.actor.id).toBe("panel:chat");
    expect(inline?.payload.requestedBy).toMatchObject(requestedBy);
    expect(bar?.payload.requestedBy).toMatchObject(requestedBy);

    unmount();
  });

  it("loads inline action bar code through the panel-owned persisted file", async () => {
    const client = createClient();
    const publish = vi.fn(async () => 1);
    Object.assign(client, { publish, roster: {} });
    let methods: Record<string, MethodDefinition> | undefined;
    pubsubMock.connectViaRpc.mockImplementation(
      (options: { methods: Record<string, MethodDefinition> }) => {
        methods = options.methods;
        return client;
      },
    );
    const files = new Map<string, string>();
    const base = createRpcCall();
    const call = vi.fn(async (target: string, method: string, args: unknown[]) => {
      if (method === "fs.writeFile") {
        files.set(args[0] as string, args[1] as string);
        return undefined;
      }
      if (method === "fs.readFile") {
        const value = files.get(args[0] as string);
        if (value === undefined) throw new Error(`ENOENT ${String(args[0])}`);
        return value;
      }
      return (base as (...values: unknown[]) => Promise<unknown>)(target, method, args);
    }) as unknown as ConnectionConfig["rpc"]["call"];
    const onActionBarFileChange = vi.fn();
    function ActionBarProbe() {
      useAgenticChat({
        config: {
          clientId: "panel:chat",
          rpc: {
            selfId: "panel:chat",
            call,
            stream: vi.fn(async () => new Response()),
            on: vi.fn(() => () => undefined),
          },
        },
        channelName: "chat-title-test",
        metadata: { name: "Chat Panel", type: "panel" },
        onActionBarFileChange,
        features: FULL_AGENTIC_CHAT_FEATURES,
      });
      return null;
    }
    const { unmount } = render(<ActionBarProbe />);
    await waitFor(() => expect(methods).toBeDefined());
    const result = vi.fn((value: unknown, options?: unknown) => ({ value, options }));
    const ctx = { callerId: "do:author", result } as never;
    const code = "export default function ActionBar() { return <div>bar</div>; }";
    await waitFor(async () => {
      const loaded = (await methods!["load_action_bar"]!.execute({ code }, ctx)) as {
        ok?: boolean;
      };
      expect(loaded.ok).toBe(true);
    });
    const managedPath = ".tmp/action-bars/panel_chat.tsx";
    expect(files.get(managedPath)).toBe(code);
    expect(onActionBarFileChange).toHaveBeenLastCalledWith({
      path: managedPath,
      props: undefined,
      maxHeight: undefined,
    });

    // A compile failure leaves the persisted file backing the current bar intact.
    const broken = (await methods!["load_action_bar"]!.execute(
      { code: "export default function A( { return <div>; }" },
      ctx,
    )) as { value: { ok: boolean; compileError: boolean } };
    expect(broken.value).toMatchObject({ ok: false, compileError: true });
    expect(files.get(managedPath)).toBe(code);

    const ambiguous = (await methods!["load_action_bar"]!.execute(
      { code, path: "panels/bar/index.tsx" },
      ctx,
    )) as { value: { ok: boolean; error: string } };
    expect(ambiguous.value).toEqual({ ok: false, error: "Provide exactly one of code or path" });

    unmount();
  });

  it("rejects uncompilable inline UI and action bar sources without publishing", async () => {
    const client = createClient();
    const publish = vi.fn(async () => 1);
    Object.assign(client, { publish, roster: {} });
    let methods: Record<string, MethodDefinition> | undefined;
    pubsubMock.connectViaRpc.mockImplementation(
      (options: { methods: Record<string, MethodDefinition> }) => {
        methods = options.methods;
        return client;
      },
    );
    const config: ConnectionConfig = {
      clientId: "panel:chat",
      rpc: {
        selfId: "panel:chat",
        call: createRpcCall(),
        stream: vi.fn(async () => new Response()),
        on: vi.fn(() => () => undefined),
      },
    };
    const { unmount } = render(<Probe config={config} loadDynamicImports={false} />);
    await waitFor(() => expect(methods).toBeDefined());
    // Wait until the hook has adopted the connected client.
    await waitFor(async () => {
      await methods!["inline_ui"]!.execute(
        { code: "export default () => null" },
        { callerId: "do:author", result: vi.fn() } as never,
      );
      expect(publish).toHaveBeenCalled();
    });
    publish.mockClear();
    const result = vi.fn((value: unknown, options?: unknown) => ({ value, options }));
    const ctx = { callerId: "do:author", result } as never;

    const syntax = (await methods!["inline_ui"]!.execute(
      { code: "export default function A( { return <div>; }" },
      ctx,
    )) as { value: { ok: boolean; error: string; compileError: boolean }; options: unknown };
    expect(syntax.value).toMatchObject({ ok: false, compileError: true });
    expect(syntax.value.error).toBeTruthy();
    expect(syntax.options).toEqual({ isError: true });

    const unresolved = (await methods!["inline_ui"]!.execute(
      {
        code: 'import x from "definitely-not-a-package-xyz"; export default () => <div>{String(x)}</div>;',
      },
      ctx,
    )) as { value: { ok: boolean; error: string } };
    expect(unresolved.value.ok).toBe(false);
    expect(unresolved.value.error).toContain("definitely-not-a-package-xyz");
    expect(publish).not.toHaveBeenCalled();

    await methods!["inline_ui"]!.execute(
      { id: "valid", code: "export default () => <div>ok</div>;" },
      ctx,
    );
    expect(publish).toHaveBeenCalledTimes(1);

    unmount();
  });

  it("advertises the explicit full feature surface", async () => {
    const client = createClient();
    let methods: Record<string, MethodDefinition> | undefined;
    pubsubMock.connectViaRpc.mockImplementation(
      (options: { methods: Record<string, MethodDefinition> }) => {
        methods = options.methods;
        return client;
      },
    );
    const config: ConnectionConfig = {
      clientId: "panel:chat",
      rpc: {
        selfId: "panel:chat",
        call: createRpcCall(),
        stream: vi.fn(async () => new Response()),
        on: vi.fn(() => () => undefined),
      },
    };

    const { unmount } = render(<Probe config={config} />);

    await waitFor(() => expect(methods).toBeDefined());
    expect(Object.keys(methods ?? {})).toEqual(
      expect.arrayContaining([
        "feedback_form",
        "feedback_custom",
        "inline_ui",
        "load_action_bar",
        "client_eval",
      ]),
    );

    unmount();
  });

  it("does not advertise feature-owned methods when no features are selected", async () => {
    const client = createClient();
    let methods: Record<string, MethodDefinition> | undefined;
    pubsubMock.connectViaRpc.mockImplementation(
      (options: { methods: Record<string, MethodDefinition> }) => {
        methods = options.methods;
        return client;
      },
    );
    const config: ConnectionConfig = {
      clientId: "panel:chat",
      rpc: {
        selfId: "panel:chat",
        call: createRpcCall(),
        stream: vi.fn(async () => new Response()),
        on: vi.fn(() => () => undefined),
      },
    };

    const { unmount } = render(
      <Probe config={config} features={[]} loadDynamicImports={false} />,
    );

    await waitFor(() => expect(methods).toBeDefined());
    for (const name of [
      "feedback_form",
      "feedback_custom",
      "inline_ui",
      "load_action_bar",
      "client_eval",
    ]) {
      expect(methods?.[name]).toBeUndefined();
    }

    unmount();
  });

  it("projects an explicit channel title onto an attached panel", async () => {
    let onConfigChange:
      | ((config: { title?: string; titleExplicit?: boolean }) => void)
      | undefined;
    const client = {
      ...createClient(),
      onConfigChange: vi.fn((handler) => {
        onConfigChange = handler;
        return () => undefined;
      }),
    } as unknown as PubSubClient;
    pubsubMock.connectViaRpc.mockReturnValue(client);
    const call = createRpcCall();
    const config: ConnectionConfig = {
      clientId: "panel:chat",
      rpc: {
        selfId: "panel:chat",
        call,
        stream: vi.fn(async () => new Response()),
        on: vi.fn(() => () => undefined),
      },
    };

    const { unmount } = render(<Probe config={config} />);

    await waitFor(() => {
      expect(onConfigChange).toBeDefined();
    });
    act(() => {
      onConfigChange?.({ title: "Persistent task store", titleExplicit: true });
    });
    await waitFor(() => {
      expect(document.title).toBe("Persistent task store");
      expect(call).toHaveBeenCalledWith("main", "runtime.setTitle", [
        "Persistent task store",
        { explicit: true },
      ]);
    });

    unmount();
  });

  it("projects a durable explicit title when the panel connects late", async () => {
    const client = createClient({
      title: "Existing task title",
      titleExplicit: true,
    });
    pubsubMock.connectViaRpc.mockReturnValue(client);
    const call = createRpcCall();
    const config: ConnectionConfig = {
      clientId: "panel:chat",
      rpc: {
        selfId: "panel:runtime-entity",
        call,
        stream: vi.fn(async () => new Response()),
        on: vi.fn(() => () => undefined),
      },
    };

    const { unmount } = render(<Probe config={config} />);

    await waitFor(() => {
      expect(document.title).toBe("Existing task title");
      expect(call).toHaveBeenCalledWith("main", "runtime.setTitle", [
        "Existing task title",
        { explicit: true },
      ]);
    });

    unmount();
  });
});
