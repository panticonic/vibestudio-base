import { describe, expect, it } from "vitest";
import { envelopeOrigin } from "@workspace/agentic-protocol";
import { originFromVerifiedCaller } from "./channel-origin.js";

describe("originFromVerifiedCaller", () => {
  it("stamps a panel caller with its verified slot, source and device", () => {
    expect(
      originFromVerifiedCaller(
        {
          callerKind: "panel",
          callerPanelId: "slot-1",
          callerPanelSource: "panels/road-trip",
          callerDeviceId: "device-9",
        },
        "code",
      ),
    ).toEqual({
      surface: "panel",
      panelSource: "panels/road-trip",
      slotId: "slot-1",
      deviceId: "device-9",
    });
  });

  it("falls back to the verified slot alone before caller device facts exist", () => {
    expect(
      originFromVerifiedCaller({ callerKind: "panel", callerPanelId: "slot-1" }, "user"),
    ).toEqual({ surface: "panel", slotId: "slot-1" });
  });

  it.each([
    [{ callerKind: "shell" }, "user", { surface: "shell" }],
    [{ callerKind: "client" }, "user", { surface: "client" }],
    [{ callerKind: "do" }, "code", { surface: "agent" }],
    [{ callerKind: "agent" }, "session", { surface: "agent" }],
    [{ callerKind: "server" }, "host", { surface: "host" }],
    [{ callerKind: "panel", callerPanelId: "s" }, "website", { surface: "website" }],
    [null, null, { surface: "host" }],
  ] as const)("maps caller %j / %s", (caller, kind, expected) => {
    expect(originFromVerifiedCaller(caller, kind)).toEqual(expected);
  });
});

describe("envelopeOrigin", () => {
  it("reads a stamped origin from annotations", () => {
    expect(
      envelopeOrigin({ annotations: { origin: { surface: "panel", slotId: "slot-1" } } }),
    ).toEqual({ surface: "panel", slotId: "slot-1" });
  });

  it.each([
    {},
    { annotations: {} },
    { annotations: { origin: { surface: "satellite" } } },
    { annotations: { origin: { surface: "panel", slotId: 3 } } },
    { annotations: { origin: "panel" } },
  ])("reads malformed or absent origin as null %#", (event) => {
    expect(envelopeOrigin(event as never)).toBeNull();
  });
});
