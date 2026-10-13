import { describe, expect, it } from "vitest";
import manifest from "./package.json";

describe("chat panel authority", () => {
  it("declares the Missions service used by the automation inspector", () => {
    expect(
      manifest.vibestudio.authority.serviceRequests.find(
        (request) => request.protocol === "vibestudio.missions.v1"
      )
    ).toEqual({
      protocol: "vibestudio.missions.v1",
      availability: "required",
    });
    expect(
      manifest.vibestudio.authority.requests.find(
        (request) => request.capability === "workspace-service:missions"
      )
    ).toEqual({
      capability: "workspace-service:missions",
      resource: {
        kind: "exact",
        key: "do:workers/missions:MissionsDO:workspace-missions",
      },
      tier: "gated",
      evidence: "exact",
    });
  });

  it("configures an OAuth client from client eval without a manifest request", () => {
    // credentials.configureClient is reviewed open (a host-owned protected-input
    // prompt), which waives the unit request and grant at the live gate and in
    // build admission. A gated request for it would be dead authority.
    expect(
      manifest.vibestudio.authority.requests.some(
        (request) => request.capability === "account-providers.configure"
      )
    ).toBe(false);
  });

  it("can request a destination-scoped external browser approval from client eval", () => {
    expect(
      manifest.vibestudio.authority.requests.find(
        (request) => request.capability === "external.open"
      )
    ).toEqual({
      capability: "external.open",
      resource: { kind: "prefix", prefix: "" },
      tier: "gated",
      evidence: "intentional-broad",
    });
  });
});
