import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildPanelDeepLink,
  buildPanelLink,
  buildPanelShareLink,
} from "./panelLinks.js";
import { parsePanelLocationLink } from "@vibestudio/shared/panelLocation";

afterEach(() => {
  vi.unstubAllGlobals();
  delete (globalThis as { __vibestudioGatewayConfig?: unknown })
    .__vibestudioGatewayConfig;
});

describe("panel link builders", () => {
  it("keeps local navigation independent of gateway routes and selected workspace", () => {
    vi.stubGlobal("__vibestudioGatewayConfig", {
      serverUrl: "not a serving URL",
      workspace: "other",
    });
    expect(parsePanelLocationLink(buildPanelLink("panels/chat"))).toMatchObject(
      {
        kind: "ok",
        location: { source: "panels/chat" },
      },
    );
    expect(buildPanelLink("panels/chat")).not.toContain("workspace");
  });

  it("preserves every navigation option on the canonical link", () => {
    const options = {
      workspace: { id: "destination" },
      contextId: "target-context",
      ref: "state:abc",
      stateArgs: { prompt: "hello" },
      title: "Research",
      slug: "research",
      focus: false,
      disposition: "child" as const,
      placement: {
        disposition: "side" as const,
        preferredWidth: 640,
        minWidth: 440,
      },
    };
    expect(
      parsePanelLocationLink(buildPanelLink("panels/chat", options)),
    ).toMatchObject({
      kind: "ok",
      location: { source: "panels/chat", ...options },
    });
  });

  it.each(["Project", { id: "ws-exact" }, { role: "system" as const }])(
    "uses the same explicit destination %j on every carrier",
    (workspace) => {
      for (const builder of [
        buildPanelLink,
        buildPanelDeepLink,
        buildPanelShareLink,
      ]) {
        expect(
          parsePanelLocationLink(builder("about/automations", { workspace })),
        ).toMatchObject({
          kind: "ok",
          location: { source: "about/automations", workspace },
        });
      }
    },
  );

  it("captures the desktop workspace ID independently of its serving URL", () => {
    vi.stubGlobal("__vibestudioGatewayConfig", {
      serverUrl: "http://localhost:43873/_workspace/dev-123",
      workspace: "desktop-workspace",
    });
    for (const builder of [buildPanelDeepLink, buildPanelShareLink]) {
      expect(
        parsePanelLocationLink(
          builder("panels/chat", { stateArgs: { prompt: "hi" } }),
        ),
      ).toMatchObject({
        kind: "ok",
        location: {
          workspace: { id: "desktop-workspace" },
          stateArgs: { prompt: "hi" },
        },
      });
    }
  });

  it("captures an injected workspace ID as an ID, not as a name", () => {
    vi.stubGlobal("__vibestudioGatewayConfig", {
      serverUrl: "http://127.0.0.1:43873",
      workspace: "mobile-workspace",
    });
    expect(
      parsePanelLocationLink(buildPanelShareLink("about/server-logs")),
    ).toMatchObject({
      kind: "ok",
      location: { workspace: { id: "mobile-workspace" } },
    });
  });

  it("rejects invalid destinations and non-JSON state before navigation", () => {
    expect(() => buildPanelLink("../escape")).toThrow();
    expect(() => buildPanelLink("panels/chat", { workspace: "" })).toThrow();
    expect(() =>
      buildPanelLink("panels/chat", { stateArgs: { value: undefined } }),
    ).toThrow();
  });
});
