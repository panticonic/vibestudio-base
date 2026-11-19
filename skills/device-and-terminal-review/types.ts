export type DeviceFinding = { code: string; evidenceIds: string[] };
export type DeviceTerminalReview = {
  status: "ready" | "attention" | "waiting" | "blocked";
  findings: DeviceFinding[];
};
export type DevicePlatform = "android" | "ios";

export type PhoneDiscoveryRecord = {
  id: string;
  providerId: string;
  attachedDeviceId: string;
  platform: DevicePlatform;
  kind: "physical" | "emulator" | "simulator";
  state: string;
  ready: boolean;
};

export type PhoneSetupEvidence = {
  kind: "phone";
  goal: string;
  context: { id: string; workspace: "system" | "personal" | "project" };
  target: {
    id: string;
    platform: DevicePlatform;
    providerId: string | null;
    attachedDeviceId: string | null;
    install: "source" | "release" | "auto";
  };
  providers: {
    id: string;
    providerId: string;
    platforms: DevicePlatform[];
    sourcePlatforms: DevicePlatform[];
    prepared: boolean;
  }[];
  devices: PhoneDiscoveryRecord[];
  pairing: {
    id: string;
    providerId: string;
    platform: DevicePlatform;
    attachedDeviceId: string;
    pairedDeviceId: string;
    status: "paired" | "failed" | "expired";
  } | null;
  readiness: {
    id: string;
    pairedDeviceId: string;
    status: "opening" | "ready" | "failed";
  } | null;
};

export type TendrilEvidence = {
  kind: "tendril";
  goal: string;
  target: {
    id: string;
    tendrilId: string;
    channelId: string;
    slotId: string;
    deviceId: string;
  };
  presentation: {
    id: string;
    tendrilId: string;
    channelId: string;
    slotId: string;
    deviceId: string;
    state: "presented" | "pushed" | "pending-device" | "archived";
  } | null;
  detail:
    | { kind: "presence" }
    | {
        kind: "update";
        id: string;
        slotId: string;
        requestedBuild: string;
        activeBuild: string | null;
        previousBuild: string | null;
        outcome: "proven" | "pending-device" | "failed";
      }
    | {
        kind: "event";
        id: string;
        channelId: string;
        slotId: string;
        origin: "page" | "human";
        tier: "reflex" | "record" | "event";
        consecutivePageTurns: number;
      }
    | {
        kind: "archive";
        id: string;
        activeSlots: number;
        retainedHistory: boolean;
        retainedState: boolean;
      };
};

export type TerminalOperationEvidence = {
  kind: "terminal";
  goal: string;
  target: {
    id: string;
    contextId: string;
    operationId: string;
    purpose: "filesystem" | "ordinary-process" | "shell-composition";
  };
  invocation: {
    id: string;
    contextId: string;
    operationId: string;
    mode: "filesystem" | "argv" | "shell";
    admission: "pending" | "denied" | "admitted";
  } | null;
  result: {
    id: string;
    contextId: string;
    operationId: string;
    exitCode: number | null;
    timedOut: boolean;
    truncated: boolean;
    hasStdout: boolean;
    hasStderr: boolean;
  } | null;
};

export type TerminalAppEvidence = {
  kind: "terminal-app";
  goal: string;
  target: { id: string; contextId: string; sessionId: string; source: string };
  session: {
    id: string;
    kind: "app" | "shell";
    contextId: string;
    sessionId: string;
    source: string | null;
    principalId: string | null;
    running: boolean;
    shellSessionId: string | null;
    exitCode: number | null;
    failure: boolean;
  } | null;
  detail:
    | {
        kind: "continuity";
        observations: {
          id: string;
          previousPty: string | null;
          attachedPty: string | null;
          attachedSessionId: string | null;
          previousStateRev: number | null;
          resumedStateRev: number | null;
        } | null;
      }
    | {
        kind: "approval";
        approval: {
          id: string;
          contextId: string;
          principalId: string;
          state: "pending" | "granted" | "denied";
          hidden: boolean;
          hostRendered: boolean;
        } | null;
      };
};

export type DeviceTerminalRequest =
  | PhoneSetupEvidence
  | TendrilEvidence
  | TerminalOperationEvidence
  | TerminalAppEvidence;
