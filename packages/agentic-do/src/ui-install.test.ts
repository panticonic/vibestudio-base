import { describe, expect, it, vi } from "vitest";
import type { ChannelClient } from "./channel-client.js";
import { installMessageTypes, type InstallMessageTypesOptions } from "./ui-install.js";

function installation(readFile: InstallMessageTypesOptions["readFile"]) {
  const publish = vi.fn<ChannelClient["publishAgenticEvent"]>(async () => ({ id: 1 }));
  const options: InstallMessageTypesOptions = {
    channel: { publishAgenticEvent: publish } as unknown as ChannelClient,
    actor: { kind: "agent", id: "agent" },
    specs: [{ typeId: "card", displayMode: "inline", path: "renderer.tsx", stateSchema: {} }],
    imports: {},
    version: 1,
    keyPrefix: "test",
    retiredTypeIds: ["old-card"],
    readFile,
  };
  return { options, publish };
}

describe("message type renderer lint before publication", () => {
  it("loads the renderer lint and rejects unsupported imports before any tombstone or registration", async () => {
    const { options, publish } = installation(async () => "import missing from 'unsupported-package'; export default missing;");
    await expect(installMessageTypes(options)).rejects.toThrow("Renderer registration blocked:");
    expect(publish).not.toHaveBeenCalled();
  });

  it("validates every readable renderer and action bar before any publication", async () => {
    const { options, publish } = installation(async (path) => path === "actions.tsx"
      ? "import missing from 'unsupported-package'; export default missing;"
      : "export default function Card() { return null; }");
    options.actionBar = { id: "actions", path: "actions.tsx" };
    await expect(installMessageTypes(options)).rejects.toThrow("actions.tsx:");
    expect(publish).not.toHaveBeenCalled();
  });

  it("publishes the existing ordered install after valid renderer lint", async () => {
    const { options, publish } = installation(async () => "import React from 'react'; export default React;");
    await installMessageTypes(options);
    expect(publish.mock.calls.map((args) => args[1].kind)).toEqual(["messageType.cleared", "messageType.registered"]);
  });

  it("preserves unreadable-source install and original read failures", async () => {
    const { options, publish } = installation(async () => null);
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await installMessageTypes(options);
      expect(publish).toHaveBeenCalledTimes(2);
      publish.mockClear();
      const failure = new Error("renderer read failed");
      options.readFile = async () => { throw failure; };
      await expect(installMessageTypes(options)).rejects.toBe(failure);
      expect(publish).not.toHaveBeenCalled();
    } finally {
      warning.mockRestore();
    }
  });
});
