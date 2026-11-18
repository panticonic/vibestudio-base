import type {
  DeviceTerminalRequest,
  DeviceTerminalReview,
  PhoneSetupEvidence,
  TendrilEvidence,
  TerminalAppEvidence,
  TerminalOperationEvidence,
} from "../device-and-terminal-review/types.js";

export type DeviceAndTerminalWorld = {
  id: string;
  sourceGroup: string;
  request: DeviceTerminalRequest;
  expected: DeviceTerminalReview;
};

function world(
  id: string,
  group: string,
  request: DeviceTerminalRequest,
  status: DeviceTerminalReview["status"],
  code: string,
  ...evidenceIds: string[]
): DeviceAndTerminalWorld {
  return {
    id: `device-terminal-${id}`,
    sourceGroup: `vibestudio:device-terminal:${group}`,
    request,
    expected: { status, findings: [{ code, evidenceIds }] },
  };
}

const desktop: PhoneSetupEvidence["providers"][number] = {
  id: "desktop-record",
  providerId: "desktop-a",
  platforms: ["android", "ios"],
  sourcePlatforms: ["android"],
  prepared: true,
};
const android: PhoneSetupEvidence["devices"][number] = {
  id: "android-record",
  providerId: "desktop-a",
  attachedDeviceId: "physical-10",
  platform: "android",
  kind: "physical",
  state: "device",
  ready: true,
};
const pairing: NonNullable<PhoneSetupEvidence["pairing"]> = {
  id: "paired-receipt",
  providerId: "desktop-a",
  platform: "android",
  attachedDeviceId: "physical-10",
  pairedDeviceId: "paired-533",
  status: "paired",
};
const target: PhoneSetupEvidence["target"] = {
  id: "phone-request",
  platform: "android",
  providerId: "desktop-a",
  attachedDeviceId: "physical-10",
  install: "auto",
};

function phone(
  goal: string,
  patch: Partial<PhoneSetupEvidence> = {},
): PhoneSetupEvidence {
  return {
    kind: "phone",
    goal,
    context: { id: "workspace-context", workspace: "system" },
    target,
    providers: [desktop],
    devices: [android],
    pairing: null,
    readiness: null,
    ...patch,
  };
}

const phoneWorlds = [
  world(
    "phone-personal-needs-system",
    "phone-workspace",
    phone(
      "A Personal chat asked to proceed with setting up the attached phone. Which workspace owns the operation?",
      { context: { id: "personal-context", workspace: "personal" } },
    ),
    "blocked",
    "phone-system-workspace-required",
    "personal-context",
  ),
  world(
    "phone-provider-empty",
    "phone-discovery",
    phone(
      "The user opened System setup but discovery has no connected desktop. What is missing?",
      { providers: [], devices: [] },
    ),
    "waiting",
    "desktop-provider-missing",
    "phone-request",
  ),
  world(
    "phone-ios-source-unavailable",
    "phone-discovery",
    phone(
      "A Linux desktop is prepared for Android; the user wants an iOS development build. What does provider capability allow?",
      {
        target: { ...target, platform: "ios", install: "source" },
        devices: [],
      },
    ),
    "blocked",
    "provider-platform-unsupported",
    "phone-request",
  ),
  world(
    "phone-two-desktops",
    "phone-discovery",
    phone(
      "Two suitable desktops are online. Interpret the setup state before any prepare call.",
      {
        target: { ...target, providerId: null },
        providers: [
          desktop,
          { ...desktop, id: "backup-record", providerId: "desktop-b" },
        ],
      },
    ),
    "waiting",
    "choose-desktop",
    "desktop-record",
    "backup-record",
  ),
  world(
    "phone-preparation-before-discovery",
    "phone-discovery",
    phone(
      "The desktop is linked but tools are still preparing. A stale discovery already named a phone. What remains?",
      { providers: [{ ...desktop, prepared: false }] },
    ),
    "waiting",
    "desktop-preparation-pending",
    "desktop-record",
  ),
  world(
    "phone-two-ready-devices",
    "phone-selection",
    phone(
      "The same desktop shows two ready Android devices. The user has not selected either.",
      {
        target: { ...target, attachedDeviceId: null },
        devices: [
          android,
          {
            ...android,
            id: "work-emulator",
            attachedDeviceId: "emu-1",
            kind: "emulator",
          },
        ],
      },
    ),
    "waiting",
    "choose-phone",
    "android-record",
    "work-emulator",
  ),
  world(
    "phone-trust-before-install",
    "phone-selection",
    phone(
      "Discovery returned the right physical phone but it is unauthorized. Which step is waiting?",
      { devices: [{ ...android, state: "unauthorized", ready: false }] },
    ),
    "waiting",
    "accept-phone-trust",
    "android-record",
  ),
  world(
    "phone-emulator-booting",
    "phone-selection",
    phone(
      "The selected Android emulator is still booting. Interpret the wait without asking for a physical cable.",
      {
        target: { ...target, attachedDeviceId: "emu-1" },
        devices: [
          {
            ...android,
            id: "emu-progress",
            attachedDeviceId: "emu-1",
            kind: "emulator",
            state: "booting",
            ready: false,
          },
        ],
      },
    ),
    "waiting",
    "wait-for-emulator",
    "emu-progress",
  ),
  world(
    "phone-expired-retain-proof",
    "phone-readiness",
    phone(
      "The retained pairing attempt records an expired invite. What is the observed blocker?",
      {
        pairing: { ...pairing, id: "expired-pairing", status: "expired" },
        devices: [],
      },
    ),
    "attention",
    "pairing-expired",
    "expired-pairing",
  ),
  world(
    "phone-hub-id-does-not-match",
    "phone-readiness",
    phone(
      "Readiness says ready for a different paired device. Is the user's selected phone ready?",
      {
        pairing,
        readiness: {
          id: "wrong-status",
          pairedDeviceId: "different-hub-id",
          status: "ready",
        },
      },
    ),
    "blocked",
    "workspace-target-mismatch",
    "paired-receipt",
    "wrong-status",
  ),
  world(
    "phone-paired-but-opening",
    "phone-readiness",
    phone(
      "Can we tell the user to unplug? Installation and pairing completed; only an opening workspace receipt exists.",
      {
        pairing,
        providers: [],
        devices: [],
        readiness: {
          id: "opening-workspace",
          pairedDeviceId: "paired-533",
          status: "opening",
        },
      },
    ),
    "waiting",
    "workspace-opening",
    "opening-workspace",
  ),
  world(
    "phone-ready-confirmed",
    "phone-readiness",
    phone(
      "The original paired phone reports the workspace ready. Verify that setup has reached its actual completion condition.",
      {
        pairing,
        providers: [],
        devices: [],
        readiness: {
          id: "confirmed-workspace",
          pairedDeviceId: "paired-533",
          status: "ready",
        },
      },
    ),
    "ready",
    "phone-workspace-ready",
    "confirmed-workspace",
  ),
];

const tendrilTarget: TendrilEvidence["target"] = {
  id: "page-selection",
  tendrilId: "board-id",
  channelId: "channel-7",
  slotId: "phone-slot",
  deviceId: "phone-dev",
};
const activePage: NonNullable<TendrilEvidence["presentation"]> = {
  ...tendrilTarget,
  id: "presentation",
  state: "presented",
};
const update: Extract<TendrilEvidence["detail"], { kind: "update" }> = {
  kind: "update",
  id: "update-receipt",
  slotId: "phone-slot",
  requestedBuild: "rev-2",
  activeBuild: "rev-2",
  previousBuild: "rev-1",
  outcome: "proven",
};
const wake: Extract<TendrilEvidence["detail"], { kind: "event" }> = {
  kind: "event",
  id: "tap-receipt",
  channelId: "channel-7",
  slotId: "phone-slot",
  origin: "page",
  tier: "event",
  consecutivePageTurns: 5,
};

function tendril(
  goal: string,
  detail: TendrilEvidence["detail"] = { kind: "presence" },
  presentation: TendrilEvidence["presentation"] = activePage,
): TendrilEvidence {
  return { kind: "tendril", goal, target: tendrilTarget, detail, presentation };
}

const tendrilWorlds = [
  world(
    "tendril-push-not-on-screen",
    "tendril-presence",
    tendril(
      "The phone received a notification. Does that prove the dashboard is visible now?",
      { kind: "presence" },
      { ...activePage, state: "pushed" },
    ),
    "waiting",
    "notification-only",
    "presentation",
  ),
  world(
    "tendril-offline-target",
    "tendril-presence",
    tendril(
      "The next connected phone should get the board. What is the current state of this exact slot?",
      { kind: "presence" },
      { ...activePage, state: "pending-device" },
    ),
    "waiting",
    "waiting-for-device",
    "presentation",
  ),
  world(
    "tendril-other-device",
    "tendril-presence",
    tendril(
      "One tablet shows the board. Does that establish it is on the selected phone?",
      { kind: "presence" },
      { ...activePage, deviceId: "tablet-dev" },
    ),
    "blocked",
    "presentation-target-mismatch",
    "page-selection",
    "presentation",
  ),
  world(
    "tendril-new-build-proven",
    "tendril-update",
    tendril(
      "The new checklist build was proven. Check whether its exact revision is active on the selected device.",
      update,
    ),
    "ready",
    "requested-build-active",
    "update-receipt",
  ),
  world(
    "tendril-proven-flag-stale",
    "tendril-update",
    tendril(
      "A success marker arrived but an older build is still active. Verify whether the requested revision is serving.",
      { ...update, activeBuild: "rev-1" },
    ),
    "attention",
    "build-readback-mismatch",
    "update-receipt",
  ),
  world(
    "tendril-rollback-happened",
    "tendril-update",
    tendril(
      "The updated board failed before starting. Check if the known good build took over on the same slot.",
      { ...update, outcome: "failed", activeBuild: "rev-1" },
    ),
    "attention",
    "rollback-observed",
    "update-receipt",
  ),
  world(
    "tendril-rollback-unproved",
    "tendril-update",
    tendril(
      "An update failed. Before saying it rolled back, check which build the current slot actually names.",
      { ...update, outcome: "failed", activeBuild: null },
    ),
    "attention",
    "rollback-unobserved",
    "update-receipt",
  ),
  world(
    "tendril-event-fifth",
    "tendril-event-tier",
    tendril(
      "A timer completion arrived from this page. Explain how its fifth consecutive page wake is treated.",
      wake,
    ),
    "ready",
    "event-data-delivered",
    "tap-receipt",
  ),
  world(
    "tendril-event-wake-bound",
    "tendril-event-tier",
    tendril(
      "There have already been six consecutive turns caused by this page. What happens to the next matching event?",
      { ...wake, consecutivePageTurns: 6 },
    ),
    "waiting",
    "held-by-wake-bound",
    "tap-receipt",
  ),
  world(
    "tendril-record-without-wake",
    "tendril-event-tier",
    tendril(
      "The kitchen dashboard logged a temperature summary silently. Did it need to start a turn?",
      { ...wake, tier: "record" },
    ),
    "ready",
    "recorded-without-wake",
    "tap-receipt",
  ),
  world(
    "tendril-reflex-local",
    "tendril-event-tier",
    tendril(
      "A page-only countdown updated the on-screen number. Where was it handled?",
      { ...wake, tier: "reflex" },
    ),
    "ready",
    "page-local",
    "tap-receipt",
  ),
  world(
    "tendril-person-resets-interpretation",
    "tendril-event-tier",
    tendril(
      "At the page wake bound, the person types a question in the control. Identify who made this request.",
      { ...wake, origin: "human", consecutivePageTurns: 6 },
    ),
    "ready",
    "user-message",
    "tap-receipt",
  ),
  world(
    "tendril-archive-retains",
    "tendril-archive",
    tendril(
      "Check if the archived board closed all pages while retaining the saved channel history and durable state.",
      {
        kind: "archive",
        id: "closed-archive",
        activeSlots: 0,
        retainedHistory: true,
        retainedState: true,
      },
      { ...activePage, state: "archived" },
    ),
    "ready",
    "archived-with-retention",
    "closed-archive",
  ),
];

const opTarget: TerminalOperationEvidence["target"] = {
  id: "operation-request",
  contextId: "workspace-op",
  operationId: "job-17",
  purpose: "ordinary-process",
};
const invocation: NonNullable<TerminalOperationEvidence["invocation"]> = {
  id: "admission-record",
  contextId: "workspace-op",
  operationId: "job-17",
  mode: "argv",
  admission: "admitted",
};
const result: NonNullable<TerminalOperationEvidence["result"]> = {
  id: "terminal-exit",
  contextId: "workspace-op",
  operationId: "job-17",
  exitCode: 0,
  timedOut: false,
  truncated: false,
  hasStdout: true,
  hasStderr: false,
};

function terminal(
  goal: string,
  patch: Partial<TerminalOperationEvidence> = {},
): TerminalOperationEvidence {
  return {
    kind: "terminal",
    goal,
    target: opTarget,
    invocation,
    result,
    ...patch,
  };
}

const terminalWorlds = [
  world(
    "terminal-filesystem-route",
    "terminal-mode",
    terminal(
      "Review a workspace listing that only needed the scoped filesystem API.",
      {
        target: { ...opTarget, purpose: "filesystem" },
        invocation: { ...invocation, mode: "filesystem" },
        result: null,
      },
    ),
    "ready",
    "scoped-filesystem-admitted",
    "admission-record",
  ),
  world(
    "terminal-filesystem-unnecessary-process",
    "terminal-mode",
    terminal(
      "The operation only needed a scratch file listing, but the trace shows it ran a shell process. Check the mode.",
      {
        target: { ...opTarget, purpose: "filesystem" },
        invocation: { ...invocation, mode: "shell" },
      },
    ),
    "attention",
    "execution-mode-mismatch",
    "admission-record",
  ),
  world(
    "terminal-argv-literal",
    "terminal-mode",
    terminal(
      "Confirm the bounded ordinary local program completed in literal argument mode.",
    ),
    "ready",
    "execution-succeeded",
    "terminal-exit",
  ),
  world(
    "terminal-explicit-pipeline",
    "terminal-mode",
    terminal(
      "The user explicitly asked for a piped check. A shell-mode execution returned zero. Report what occurred.",
      {
        target: { ...opTarget, purpose: "shell-composition" },
        invocation: { ...invocation, mode: "shell" },
      },
    ),
    "ready",
    "execution-succeeded",
    "terminal-exit",
  ),
  world(
    "terminal-pending-no-process",
    "terminal-admission",
    terminal(
      "A local operation is awaiting approval. A previous visible exit should not tell us the current invocation has started.",
      { invocation: { ...invocation, admission: "pending" } },
    ),
    "waiting",
    "approval-pending",
    "admission-record",
  ),
  world(
    "terminal-denied-is-final",
    "terminal-admission",
    terminal(
      "A tool denied the exact operation. Is there authority to retry or interpret a later-looking result?",
      { invocation: { ...invocation, admission: "denied" } },
    ),
    "blocked",
    "admission-denied",
    "admission-record",
  ),
  world(
    "terminal-foreign-operation",
    "terminal-attribution",
    terminal(
      "A result has the same target context but belongs to an older operation. Did this requested process succeed?",
      { result: { ...result, operationId: "job-16" } },
    ),
    "blocked",
    "result-target-mismatch",
    "operation-request",
    "terminal-exit",
  ),
  world(
    "terminal-timeout-precedes-zero",
    "terminal-result",
    terminal(
      "A wrapper emitted an exit code along with a timeout. What is the verified outcome of the bounded process?",
      { result: { ...result, timedOut: true } },
    ),
    "attention",
    "execution-timed-out",
    "terminal-exit",
  ),
  world(
    "terminal-no-exit",
    "terminal-result",
    terminal(
      "The process stopped returning output. The result has no exit code. Is success established?",
      { result: { ...result, exitCode: null } },
    ),
    "attention",
    "exit-unconfirmed",
    "terminal-exit",
  ),
  world(
    "terminal-nonzero-with-stdout",
    "terminal-result",
    terminal(
      "The locally executed check printed useful stdout but ended with an error code. Report the outcome.",
      { result: { ...result, exitCode: 2, hasStderr: true, truncated: true } },
    ),
    "attention",
    "execution-failed",
    "terminal-exit",
  ),
  world(
    "terminal-zero-truncated",
    "terminal-result",
    terminal(
      "The check returned zero while hitting its output cap. Can the caller treat this as the complete report?",
      { result: { ...result, truncated: true } },
    ),
    "attention",
    "success-output-truncated",
    "terminal-exit",
  ),
  world(
    "terminal-stderr-success",
    "terminal-result",
    terminal(
      "The tool writes progress on stderr and ended at zero with complete output. Does stderr change the exit outcome?",
      { result: { ...result, hasStderr: true } },
    ),
    "ready",
    "execution-succeeded",
    "terminal-exit",
  ),
];

const appTarget: TerminalAppEvidence["target"] = {
  id: "app-selected",
  sessionId: "session-42",
  contextId: "workspace-a",
  source: "terminal-apps/chat",
};
const appSession: NonNullable<TerminalAppEvidence["session"]> = {
  id: "session-row",
  sessionId: "session-42",
  kind: "app",
  contextId: "workspace-a",
  source: "terminal-apps/chat",
  principalId: "principal-chat",
  running: true,
  shellSessionId: "pty-10",
  exitCode: null,
  failure: false,
};
const attach: NonNullable<
  Extract<TerminalAppEvidence["detail"], { kind: "continuity" }>["observations"]
> = {
  id: "attach-observed",
  previousPty: "pty-10",
  attachedPty: "pty-10",
  attachedSessionId: "session-42",
  previousStateRev: 13,
  resumedStateRev: 13,
};
const approval: NonNullable<
  Extract<TerminalAppEvidence["detail"], { kind: "approval" }>["approval"]
> = {
  id: "app-approval",
  principalId: "principal-chat",
  contextId: "workspace-a",
  state: "pending",
  hidden: false,
  hostRendered: true,
};

function app(
  goal: string,
  detail: TerminalAppEvidence["detail"] = {
    kind: "continuity",
    observations: attach,
  },
  session: TerminalAppEvidence["session"] = appSession,
): TerminalAppEvidence {
  return { kind: "terminal-app", goal, target: appTarget, session, detail };
}

const appWorlds = [
  world(
    "app-detach-reattach-existing",
    "app-pty",
    app(
      "After changing devices, the user reopens chat. Verify whether this is the same running session and PTY.",
    ),
    "ready",
    "existing-pty-reattached",
    "attach-observed",
  ),
  world(
    "app-same-title-other-workspace",
    "app-attribution",
    app(
      "Two chat apps share a title. Check whether this registry row belongs to the selected workspace.",
      { kind: "continuity", observations: attach },
      { ...appSession, contextId: "workspace-b" },
    ),
    "blocked",
    "app-session-mismatch",
    "app-selected",
    "session-row",
  ),
  world(
    "app-shell-is-not-chat",
    "app-attribution",
    app(
      "A plain shell has the same ID in this stray readback; can we use it as proof of the selected chat app?",
      { kind: "continuity", observations: attach },
      { ...appSession, kind: "shell", source: null },
    ),
    "blocked",
    "app-session-mismatch",
    "app-selected",
    "session-row",
  ),
  world(
    "app-foreign-pty",
    "app-pty",
    app(
      "The session is correct but the attach callback captured a PTY from another tab. Did the user attach to chat?",
      {
        kind: "continuity",
        observations: { ...attach, attachedPty: "pty-other" },
      },
    ),
    "blocked",
    "app-attach-mismatch",
    "session-row",
    "attach-observed",
  ),
  world(
    "app-exit-in-registry",
    "app-pty",
    app(
      "The closed tab still shows failed output. Is the program running or should the user use the app restart control?",
      { kind: "continuity", observations: null },
      { ...appSession, running: false, exitCode: 1, failure: true },
    ),
    "attention",
    "app-exit-needs-restart",
    "session-row",
  ),
  world(
    "app-relaunch-persists-state",
    "app-state",
    app(
      "The old PTY ended. Verify that the relaunched same session kept its durable app state.",
      {
        kind: "continuity",
        observations: { ...attach, attachedPty: "pty-11", resumedStateRev: 14 },
      },
      { ...appSession, shellSessionId: "pty-11" },
    ),
    "ready",
    "app-state-preserved",
    "attach-observed",
  ),
  world(
    "app-new-pty-loses-state",
    "app-state",
    app(
      "A new PTY appears after relaunch, but the readback revision regressed. Is recovery complete?",
      {
        kind: "continuity",
        observations: { ...attach, attachedPty: "pty-13", resumedStateRev: 0 },
      },
      { ...appSession, shellSessionId: "pty-13" },
    ),
    "attention",
    "app-state-unproved",
    "attach-observed",
  ),
  world(
    "app-approval-has-other-principal",
    "app-approval",
    app(
      "A host approval prompt showed in the workspace while chat was running. Verify whether it belongs to this app.",
      {
        kind: "approval",
        approval: { ...approval, principalId: "other-app-principal" },
      },
    ),
    "blocked",
    "app-approval-mismatch",
    "session-row",
    "app-approval",
  ),
  world(
    "app-approval-hidden-still-pending",
    "app-approval",
    app("The person hid the approval chrome. Did that resolve the decision?", {
      kind: "approval",
      approval: { ...approval, hidden: true },
    }),
    "waiting",
    "app-approval-hidden",
    "app-approval",
  ),
  world(
    "app-approval-drawn-in-tab",
    "app-approval",
    app(
      "A consent-like message appears in the terminal application's drawing instead of host chrome. Can that authorize a gated action?",
      { kind: "approval", approval: { ...approval, hostRendered: false } },
    ),
    "blocked",
    "approval-not-host-rendered",
    "app-approval",
  ),
  world(
    "app-approval-granted",
    "app-approval",
    app(
      "Verify the host granted the visible approval to the selected app principal.",
      { kind: "approval", approval: { ...approval, state: "granted" } },
    ),
    "ready",
    "app-approval-granted",
    "app-approval",
  ),
  world(
    "app-approval-denied",
    "app-approval",
    app(
      "A person denied the exact app-owned approval. Report the observed permission state.",
      { kind: "approval", approval: { ...approval, state: "denied" } },
    ),
    "blocked",
    "app-approval-denied",
    "app-approval",
  ),
];

export const deviceAndTerminalWorlds: DeviceAndTerminalWorld[] = [
  ...phoneWorlds,
  ...tendrilWorlds,
  ...terminalWorlds,
  ...appWorlds,
];
