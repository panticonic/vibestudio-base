export type PhonePlatform = "android" | "ios";
export type PhoneSetupRequest = { goal: string; operationId: string };
export type DesktopCandidate = {
  providerId: string;
  label: string;
  supportsSource: boolean;
};
export type SetupStart = {
  receipt: string;
  platform: PhonePlatform;
  providerId: string | null;
  deviceId: string | null;
  desktops: DesktopCandidate[];
  pairedDeviceId: string | null;
};
export type PreparedDesktop = {
  receipt: string;
  state: "prepared" | "preparation-unconfirmed";
};
export type DiscoveredPhones = {
  receipt: string;
  devices: {
    deviceId: string;
    name: string;
    kind: string;
    state: string;
    ready: boolean;
  }[];
  actions: string[];
};
export type PhoneSelection = {
  status: "selected" | "choose-phone" | "physical-action";
  deviceId: string | null;
  guidance: string | null;
};
export type PhoneDiscoveryReport = {
  status:
    | "selected"
    | "desktop-unavailable"
    | "choose-desktop"
    | "preparation-unconfirmed"
    | "choose-phone"
    | "physical-action";
  deviceId: string | null;
  guidance: string | null;
  evidenceIds: string[];
};
export type PhonePairing = {
  receipt: string;
  pairedDeviceId: string | null;
};
export type WorkspaceObservation = {
  receipt: string;
  state: "opening" | "ready" | "failed" | "unreachable";
};
export type PhoneWorkspaceStatus =
  | "workspace-opening"
  | "workspace-ready"
  | "workspace-failed"
  | "workspace-unreachable";
export type PhoneSetupReport = {
  status:
    | PhoneWorkspaceStatus
    | "desktop-unavailable"
    | "choose-desktop"
    | "preparation-unconfirmed"
    | "choose-phone"
    | "physical-action"
    | "pairing-unconfirmed";
  pairedDeviceId: string | null;
  guidance: string | null;
  evidenceIds: string[];
};

export type WorkspaceCheck = {
  status: PhoneWorkspaceStatus;
  evidenceIds: string[];
};
