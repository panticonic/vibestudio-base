export type GoalCandidate = { url: string; title?: string; snippet?: string };
export type GoalSearchResult = {
  query: string;
  sources: GoalCandidate[];
  error?: string;
};
export type ResearchGoalReport = {
  question: string;
  status: "answered" | "insufficient";
  statements: {
    text: string;
    cites: { url: string; title: string; retrieved: string; published: string | null; quote: string }[];
  }[];
  notRead: { url: string; reason: string }[];
  rejected: number;
};
export type WorkspaceRevision = { path: string; version: string; text: string };
export type WorkspaceWrite =
  | { status: "written"; version: string }
  | { status: "changed" | "unavailable" };
export type WorkspaceEditReport =
  | { status: "edited"; path: string; version: string }
  | { status: "blocked"; reason: string };
export type UserGoalReport =
  | { status: "workspace-skill-reviewed"; skill: "liveTendrilBoard"; outcome: unknown }
  | { status: "workspace-skill-reviewed"; skill: "cliRoute"; outcome: unknown }
  | { status: "workspace-skill-reviewed"; skill: "scaffoldReview"; outcome: ScaffoldOutcome }
  | { status: "workspace-skill-reviewed"; skill: "localMethodExchange"; outcome: LocalMethodOutcome }
  | { status: "workspace-skill-reviewed"; skill: "systemCandidateTriage"; outcome: SystemCandidateOutcome }
  | { status: "workspace-skill-reviewed"; skill: "ownedOperations"; outcome: unknown }
  | { status: "workspace-skill-reviewed"; skill: "examplesAdoption"; outcome: AdoptionOutcome }
  | { status: "workspace-skill-reviewed"; skill: "grimoireScene"; outcome: GrimoireSceneOutcome }
  | { status: "workspace-skill-reviewed"; skill: "testkitCloseout"; outcome: unknown }
  | { status: "workspace-skill-reviewed"; skill: "phoneFirstRun"; outcome: PhoneFirstRunOutcome }
  | { status: "workspace-skill-reviewed"; skill: "skillMaintenance"; outcome: SkillMaintenanceOutcome }
  | { status: "workspace-skill-reviewed"; skill: "desktopReadiness"; outcome: DesktopReadinessOutcome }
  | { status: "workspace-skill-reviewed"; skill: "notificationState"; outcome: NotificationStateOutcome }
  | { status: "workspace-skill-reviewed"; skill: "mobileContinuity"; outcome: MobileContinuityOutcome }
  | { status: "workspace-skill-reviewed"; skill: "webhookAdmission"; outcome: unknown }
  | { status: "workspace-skill-reviewed"; skill: "sameTurnEval"; outcome: unknown }
  | { status: "workspace-skill-reviewed"; skill: "logFollower"; outcome: unknown }
  | { status: "workspace-skill-reviewed"; skill: "ptyContinuity"; outcome: unknown }
  | { status: "workspace-skill-reviewed"; skill: "developmentAudit"; outcome: unknown }
  | { status: "workspace-skill-reviewed"; skill: "contentArchive"; outcome: unknown }
  | { status: "workspace-skill-reviewed"; skill: "systemRelease"; outcome: unknown }
  | { status: "workspace-skill-reviewed"; skill: "panelSourceMigration"; outcome: unknown }
  | { status: "workspace-skill-reviewed"; skill: "workspaceShare"; outcome: unknown }
  | { status: "workspace-skill-reviewed"; skill: "agentCapability"; outcome: unknown }
  | { status: "workspace-skill-reviewed"; skill: "assetIntegrity"; outcome: AssetIntegrityOutcome }
  | { status: "workspace-skill-reviewed"; skill: "tendrilRoute"; outcome: TendrilRouteOutcome }
  | { status: "workspace-skill-reviewed"; skill: "localPresentation"; outcome: LocalPresentationOutcome }
  | { status: "workspace-skill-reviewed"; skill: "workspaceAssembly"; outcome: unknown }
  | { status: "workspace-skill-reviewed"; skill: "capabilityPlan"; outcome: unknown }
  | { status: "workspace-skill-reviewed"; skill: "vaultWork"; outcome: unknown }
  | { status: "workspace-skill-reviewed"; skill: "googleSetup"; outcome: unknown }
  | { status: "workspace-skill-reviewed"; skill: "clientDiagnostics"; outcome: unknown }
  | { status: "workspace-skill-reviewed"; skill: "githubWork"; outcome: unknown }
  | { status: "answered" | "insufficient"; research: ResearchGoalReport }
  | { status: "edited"; path: string; version: string; research: ResearchGoalReport }
  | WorkspaceEditReport
  | BrowserGoalReport
  | WorkspaceSuiteReport
  | { status: "workspace-skill-reviewed"; skill: "news" | "adventureJourney" | "spectrolite" | "google" | "gmail" | "googleHandoff" | "calendar" | "personal" | "personalArtifacts" | "personalHistory" | "scheduledRecovery" | "personalAutomation" | "operator" | "localReconciliation" | "diagnostics" | "ownedTaskRecovery" | "unitRollout" | "localDelivery" | "recovery" | "publication" | "ownedPreview" | "visualRecovery" | "pdf"; outcome: unknown }
  | { status: "workspace-skill-reviewed"; skill: "terminalHandoff"; outcome: unknown }
  | { status: "workspace-skill-reviewed"; skill: "personalWelcome"; outcome: unknown }
  | { status: "workspace-skill-reviewed"; skill: "dictationHandoff"; outcome: unknown }
  | { status: "workspace-skill-reviewed"; skill: "specialistHandoff"; outcome: unknown }
  | { status: "workspace-skill-reviewed"; skill: "providerHandoff"; outcome: unknown }
  | { status: "workspace-skill-reviewed"; skill: "problemReport"; outcome: unknown }
  | { status: "workspace-skill-reviewed"; skill: "compoundRecovery"; outcome: unknown }
  | { status: "workspace-skill-reviewed"; skill: "buildIncident"; outcome: unknown }
  | { status: "workspace-skill-reviewed"; skill: "deployedInterface"; outcome: unknown }
  | { status: "workspace-skill-reviewed"; skill: "apiReadiness"; outcome: unknown }
  | { status: "workspace-skill-reviewed"; skill: "chatContinuity"; outcome: unknown }
  | { status: "workspace-skill-reviewed"; skill: "editorialPacket"; outcome: unknown }
  | { status: "workspace-skill-reviewed"; skill: "demoPortfolio"; outcome: unknown }
  | { status: "workspace-skill-reviewed"; skill: "regencyBriefing"; outcome: unknown }
  | { status: "workspace-skill-reviewed"; skill: "imageCandidate"; outcome: unknown }
  | { status: "workspace-skill-reviewed"; skill: "newsEvidence"; outcome: unknown }
  | { status: "workspace-skill-reviewed"; skill: "installedPackage"; outcome: unknown }
  | { status: "workspace-skill-reviewed"; skill: "extensionDossier"; outcome: unknown }
  | { status: "workspace-skill-reviewed"; skill: "localWidth"; outcome: unknown }
  | { status: "workspace-skill-reviewed"; skill: "evalHandoff"; outcome: unknown }
  | { status: "workspace-skill-reviewed"; skill: "programRun"; outcome: unknown }
  | { status: "workspace-skill-reviewed"; skill: "browserMigration"; outcome: unknown }
  | { status: "workspace-skill-reviewed"; skill: "templateMigration"; outcome: unknown }
  | { status: "workspace-skill-reviewed"; skill: "authoring"; outcome: unknown }
  | { status: "workspace-skill-reviewed"; skill: "bridgeDelivery"; outcome: unknown }
  | { status: "workspace-skill-reviewed"; skill: "workspaceClaims"; outcome: unknown }
  | { status: "workspace-skill-reviewed"; skill: "panelLaunchState"; outcome: unknown }
  | { status: "workspace-skill-reviewed"; skill: "ownedRouteAuthority"; outcome: unknown }
  | { status: "workspace-skill-reviewed"; skill: "intentDiscovery"; outcome: unknown }
  | { status: "workspace-skill-reviewed"; skill: "pdfVault"; outcome: PdfVaultOutcome };

export type OpenSuiteRoute = { id: string; target: string; suite: string; purpose: string; runtime: "native" | "workerd" | "browser"; stateHash: string };
export type OpenSuiteChoice = {
  routeId: string;
  mode: "inspect" | "verify";
  file: string | null;
  testName: string | null;
};
export type OpenSuiteRequest = {
  operationId: string;
  goal: string;
  target: string;
  suite: string;
  mode: "inspect" | "verify";
  file: string | null;
  testName: string | null;
};
export type WorkspaceSuiteReport =
  | { status: "suite-reviewed"; selection: OpenSuiteChoice; review: unknown }
  | { status: "blocked"; reason: string };

export type BrowserRow = { label: string; state: string; detail: string; controls: { id: string; label: string }[] };
export type BrowserView = { heading: string; revision: string; rows: BrowserRow[] };
export type BrowserDecision =
  | { kind: "act"; control: string }
  | { kind: "report"; labels: string[] }
  | { kind: "blocked"; reason: string };
export type BrowserGoalReport =
  | { status: "observed" | "changed"; revision: string; rows: { label: string; state: string; detail: string }[] }
  | { status: "blocked"; reason: string };

export type PdfVaultDecision =
  | { status: "hold"; reason: string }
  | { status: "use-evidence"; citationIndices: number[] };
export type PdfVaultHandoff =
  | { status: "hold"; reason: string }
  | {
    status: "bound";
    source: { document: string; digest: string; citations: { page: number; line: number; quote: string }[] };
    directive: string;
  };

export type PdfVaultOutcome = { pdf: unknown; handoff: PdfVaultHandoff; vault: unknown };

export type PresentationSourceCard = {
  id: string;
  title: string;
  desk: string;
  period: string;
  status: "current" | "signed" | "archive" | "draft";
};
export type LocalPresentationSource = PresentationSourceCard & {
  revision: string;
  previewAllowed: boolean;
  sections: { id: string; required: boolean; ask: string; data: string }[];
};
export type LocalPresentationReceipt = { source: string; revision: string; viewIds: string[]; mdxDigests: string[] };
export type PreviewDisposition =
  | { status: "visible"; receipt: LocalPresentationReceipt }
  | { status: "changed"; revision: string }
  | { status: "unavailable"; reason: string };
export type PresentationSourceChoice =
  | { status: "selected"; record: LocalPresentationSource }
  | { status: "held"; reason: string };
export type LocalPresentationOutcome =
  | { status: "visible"; receipt: LocalPresentationReceipt; notes: string[] }
  | { status: "held"; reason: string; revision: string | null };

export type TendrilBoardCard = { id: string; title: string; room: string; audience: string; edition: "current" | "retired" | "draft" };
export type TendrilRouteSlot = {
  id: string;
  label: string;
  device: string | null;
  state: "current" | "offline" | "retired";
  functions: { name: string; phrases: string[] }[];
};
export type TendrilRouteSnapshot = TendrilBoardCard & {
  channel: string;
  source: string;
  revision: string;
  stateRevision: number;
  agent: "attached" | "detached";
  retainAllowed: boolean;
  utterance: { text: string; via: "text" | "voice" };
  slots: TendrilRouteSlot[];
};
export type TendrilRouteProjection =
  | { kind: "local"; name: string; phrase: string; text: string | null; captures: string[] }
  | { kind: "agent"; attached: boolean }
  | { kind: "ambiguous"; names: string[] };
export type TendrilRouteFinding = {
  id: string;
  channel: string;
  audience: string;
  slot: string;
  revision: string;
  utterance: { text: string; via: "text" | "voice" };
  projection: TendrilRouteProjection;
};
export type TendrilRouteProbe = { status: "projected"; finding: TendrilRouteFinding }
  | { status: "changed"; revision: string };
export type TendrilBoardChoice = { status: "selected"; board: TendrilRouteSnapshot }
  | { status: "held"; reason: string };
export type TendrilSlotChoice = TendrilRouteProbe | { status: "held"; reason: string };
export type TendrilRouteReceipt = { path: string; sha256: string; revision: string };
export type TendrilRouteOutcome = {
  status: "verified" | "held";
  finding: TendrilRouteFinding | null;
  receipt: TendrilRouteReceipt | null;
  reason: string;
};

export type AssetVersion = { id: string; edition: "archive" | "approved" | "working"; bundle: string; dossier: string };
export type AssetManifestRow = { key: string; path: string; digest: string; mode: number; output: string };
export type AssetManifest = { bundle: string; edition: string; release: "verified" | "review" | "blocked"; assets: AssetManifestRow[] };
export type AssetFile = { id: string; path: string; digest: string; mode: number; size: number; type: "bytes" | "text" };
export type AssetRead = AssetFile & { manifest: AssetManifest | null };
export type AssetVersionRead = {
  version: AssetVersion;
  files: AssetFile[];
  manifest: AssetManifest;
  inspected: AssetRead[];
};
export type AssetDifference = "same" | "moved" | "bytes" | "mode" | "missing" | "replaced" | "manifest";
export type AssetFinding = {
  key: string;
  retained: string | null;
  working: string | null;
  differences: AssetDifference[];
};
export type AssetSelection = { id: string; digest: string; output: string };
export type AssetRecoveryReceipt = { directory: string; manifestDigest: string; source: string; files: AssetSelection[] };
export type AssetStageResult = { status: "staged"; receipt: AssetRecoveryReceipt }
  | { status: "changed"; working: string }
  | { status: "held"; reason: string };
export type AssetIntegrityOutcome = {
  status: "verified" | "staged" | "held";
  approved: string;
  working: string;
  findings: AssetFinding[];
  receipt: AssetRecoveryReceipt | null;
  reason: string;
};
export type AssetRecoveryPlan = { status: "copy"; selection: AssetSelection[] }
  | { status: "verified" | "held"; reason: string };

export type MobileContinuityCard = { id: string; title: string; workspace: string; device: string; edition: "current" | "archive" };
export type MobileContinuityProfile = MobileContinuityCard & { server: string; packageName: string; adbState: string; expectedBuild: string };
export type MobileBuildEvidence = {
  id: string;
  clientSource: string;
  declaredAbi: string;
  providerSource: string;
  clientManifestDigest: string;
  providerManifestDigest: string;
  artifactIntegrity: string | null;
  expectedBuild: string;
  observedBuild: string | null;
  granted: string[];
  failed: string[];
};
export type MobileCacheEvidence = {
  id: string;
  status: "loaded" | "absent" | "rejected";
  preferredSlot: string | null;
  treeRevision: number | null;
  removedBadRecord: boolean;
};
export type MobileTransportEvidence = {
  id: string;
  state: "connected" | "closed" | "revoked";
  opens: number;
  recovered: string[];
  caller: string | null;
  server: string | null;
  error: string | null;
  transient: boolean | null;
  failureKind: string | null;
};
export type MobileRouteEvidence = {
  id: string;
  owned: string[];
  lost: string[];
  unleased: string[];
  invalidated: string[];
};
export type MobileContinuityEvidence = {
  build: MobileBuildEvidence;
  cache: MobileCacheEvidence;
  transport: MobileTransportEvidence;
  routes: MobileRouteEvidence;
};
export type MobileContinuityOutcome = {
  profile: string;
  action: "resume" | "rebuild-shell" | "reacquire-route" | "hold";
  scope: "owned-fixture";
  evidence: MobileContinuityEvidence;
  reason: string;
};

export type NotificationLane = { id: string; label: string; generation: number };
export type NotificationRecord = {
  id: string; kind: string; title: string; message?: string; revision: number;
  createdAt: number; acknowledgedAt?: number; data?: unknown;
};
export type NotificationSnapshot = {
  lane: NotificationLane; attention: NotificationRecord[]; retained: NotificationRecord[];
  unreadCount: number; retainedCount: number;
};
export type NotificationRefresh = {
  authority: "unchanged" | "changed" | "retired";
  lane: NotificationLane | null;
  discardedPriorRead: boolean;
  producerReceipt: "applied" | "idempotent" | "older" | "collision" | "removed" | "missing" | "none";
};
export type NotificationLifecycle = {
  original: NotificationSnapshot; refresh: NotificationRefresh;
  current: NotificationSnapshot | null;
};
export type NotificationFinding = {
  state: "pending" | "read" | "superseded" | "hidden" | "missing" | "ambiguous" | "scope-changed";
  id: string | null;
  revision: number | null;
};
export type NotificationDecision = {
  action: "acknowledge" | "retain" | "hold";
  finding: NotificationFinding;
  reason: string;
};
export type NotificationAcknowledgment = {
  status: "acknowledged" | "already-read" | "stale" | "unavailable";
  id: string; revision: number;
};
export type NotificationStateOutcome = {
  scope: "owned-notification-fixture";
  lifecycle: NotificationLifecycle;
  decision: NotificationDecision;
  acknowledgement: NotificationAcknowledgment | null;
  final: NotificationSnapshot | null;
};

export type DesktopDesk = { id: string; name: string; operationId: string };
export type DesktopPane = { id: string; panelId: string; heightFr: number; minWidthOverride?: number };
export type DesktopWindowView = {
  width: number; focused: string | null; resident: string[]; parkedLeft: string[]; parkedRight: string[];
  columns: { id: string; widthFr: number; panes: DesktopPane[] }[];
};
export type DesktopWindowObservation = {
  deskId: string; status: "restored" | "wrong-scope" | "invalid";
  before: DesktopWindowView | null; current: DesktopWindowView | null;
  queuedFocus: string | null; pendingPlacementEdit: boolean;
};
export type DesktopUpdateOffer = {
  clientId: string; source: string; runtime: string; buildKey: string | null;
  toVersion: string | null; fromVersion: string | null; canRollback: boolean;
};
export type DesktopUpdateObservation = {
  deskId: string; runningBuild: string; currentBuild: string;
  before: DesktopUpdateOffer[]; current: DesktopUpdateOffer[];
  notices: { id: string; tone: string; title: string; message: string }[];
  events: string[]; admissionPending: boolean; previousBuilds: string[]; portCalls: number;
};
export type DesktopReadinessEvidence = {
  desk: DesktopDesk; admission: unknown; window: DesktopWindowObservation;
  updates: DesktopUpdateObservation;
};
export type DesktopReadinessDecision = {
  action: "keep-open" | "review-ready-update" | "defer-update" | "inspect-offer" |
    "review-rollback" | "restore-layout" | "hold-scope" | "wait-for-admission";
  reason: string;
};
export type DesktopReadinessOutcome = {
  scope: "owned-desktop-readiness-fixture";
  evidence: DesktopReadinessEvidence; decision: DesktopReadinessDecision;
};

export type SkillMaintenanceCard = { id: string; label: string; edition: "working" | "archive" };
export type SkillMaintenanceClause = { path: string; parameters: string[]; returns: string };
export type SkillMaintenanceCheck = {
  path: string; revision: string; runId: string; runDigest: string; resultDigest: string;
  satisfied: boolean; failures: string[]; expected: SkillMaintenanceClause[];
  absent: string[]; requiredSelectors: string[] | null;
};
export type SkillMaintenanceFile = { path: string; text: string };
export type SkillMaintenanceObservation = {
  card: SkillMaintenanceCard; path: string; revision: string;
  files: SkillMaintenanceFile[]; check: SkillMaintenanceCheck;
  editable: string[]; approval: "approved" | "denied";
  authoringRequest: {
    goal: string; compare: boolean;
    contract: {
      entry: string; expectedParameters: string[] | null; expectedReturn: string | null;
      declaredServices: string[] | null; expectedServiceScopes?: Record<string, string[] | null>;
      requiredHelpers: string[]; preserveBaseline: boolean;
    };
  };
};
export type SkillMaintenanceGate = { current: string; status: "current" | "changed" | "denied" };
export type SkillMaintenanceDecision = {
  action: "stage-local-patch" | "hold-authorization" | "hold-stale" | "hold-evidence" | "keep-current";
  reason: string;
};
export type SkillMaintenanceChange = { path: string; text: string | null };
export type SkillMaintenanceReceipt = {
  before: string; after: string;
  disposition: "staged" | "stale" | "denied";
  paths: string[];
};
export type SkillMaintenanceOutcome = {
  scope: "owned-working-skill";
  observation: SkillMaintenanceObservation; authoring: unknown;
  gate: SkillMaintenanceGate; decision: SkillMaintenanceDecision;
  receipt: SkillMaintenanceReceipt | null; final: SkillMaintenanceCheck;
};

export type PhoneFirstRunCard = { id: string; title: string; edition: "current" | "archive" };
export type PhoneFirstRunAssignment = {
  id: string; targetId: string; platform: "android" | "ios"; mode: "auto" | "release" | "source";
  paired: "owned" | "foreign-owner" | "foreign-workspace" | "none";
  installed: "absent" | "release" | "internal";
  desktops: { providerId: string; label: string; supportsSource: boolean }[];
  setupRequest: { goal: string; operationId: string } | null;
};
export type PhonePhaseEvidence = {
  id: string; status: "unavailable" | "rejected" | "await-shell" | "await-connection" | "complete" | "failed";
  observedConnection: boolean; observedShell: boolean; observedPanel: boolean; issues: string[];
};
export type PhoneProviderEvidence = {
  id: string; revision: string; client: string; runtime: string; abi: string; expectedAbi: string;
  provider: string; providerPackage: string; manifestDigest: string; clientDigest: string;
};
export type PhoneFirstRunEvidence = {
  card: PhoneFirstRunCard; assignment: PhoneFirstRunAssignment;
  startup: PhonePhaseEvidence; build: PhoneProviderEvidence; resume: unknown;
};
export type PhoneFirstRunDecision = {
  action: "record-ready-evidence" | "wait-workspace" | "review-startup-failure" |
    "hold-owner" | "choose-desktop" | "review-release" | "review-source" |
    "open-owned-desktop" | "continue-existing-install" | "inspect-native-evidence";
  reason: string;
};
export type PhoneFirstRunOutcome = {
  scope: "owned-phone-eligibility-rehearsal"; evidence: PhoneFirstRunEvidence; decision: PhoneFirstRunDecision;
};

export type GrimoireDocket = { id: string; title: string; edition: "current" | "archive" };
export type GrimoireSceneSource = {
  id: string; title: string; detail: string; x: number; y: number; kind: "observed" | "planned";
};
export type GrimoireSceneView = {
  docketId: string; ownerId: string; frontier: string; sceneDigest: string; description: string;
  turn: number; day: number; weather: string; pending: boolean; assets: string[];
  anchors: GrimoireSceneSource[];
};
export type GrimoireCaretakerScope = {
  docketId: string; ownerId: string; frontier: string; directive: string; approved: boolean;
  proposed: GrimoireSceneSource | null; requestedAsset: string | null;
};
export type GrimoireSceneEvidence = { scene: GrimoireSceneView; scope: GrimoireCaretakerScope };
export type GrimoirePlan = {
  action: "stage-scene" | "stage-note" | "keep-current" | "hold-foreign" | "hold-no-art" | "hold-authority" | "hold-stale";
  finding: string; proposedIds: string[]; description: string | null;
};
export type GrimoireSceneGate = { ownerId: string; frontier: string; status: "current" | "changed" };
export type GrimoireSceneReceipt = {
  status: "staged"; path: string; digest: string; previewDigest: string | null; frontier: string;
};
export type GrimoireSceneReadback = {
  ownerId: string; frontier: string; sceneDigest: string; fileDigest: string | null;
};
export type GrimoireSceneOutcome = {
  scope: "owned-grimoire-caretaker-draft"; docket: GrimoireDocket; evidence: GrimoireSceneEvidence;
  plan: GrimoirePlan; gate: GrimoireSceneGate; receipt: GrimoireSceneReceipt | null; readback: GrimoireSceneReadback;
};

export type AdoptionReviewCard = { id: string; title: string; event: string; edition: "staged" | "retired"; mayRecord: boolean };
export type AdoptionInstalled = { repository: string; packageName: string; manifestDigest: string; templateDigest: string; main: string };
export type AdoptionComposition = {
  id: string; event: string; status: "composed" | "conflict" | "bad-override" | "epoch" | "missing-unit" | "duplicate-source";
  issue: string | null; owner: string | null; privateFiles: string[]; pulledUnits: string[];
  settings: string[]; minimumAppVersion: string | null; digest: string | null;
};
export type AdoptionEvidence = { installed: AdoptionInstalled; composition: AdoptionComposition };
export type AdoptionPlan = {
  disposition: "record-private" | "explain-only" | "hold-authority" | "hold-conflict" | "hold-override" |
    "hold-epoch" | "hold-closure" | "hold-duplicate" | "hold-stale";
  finding: string; proof: string[];
};
export type AdoptionGate = { event: string; status: "current" | "changed" };
export type AdoptionReceipt = { path: string; digest: string; event: string };
export type AdoptionReadback = { main: string; event: string; digest: string | null };
export type AdoptionOutcome = {
  scope: "owned-examples-composition-rehearsal"; card: AdoptionReviewCard; evidence: AdoptionEvidence;
  plan: AdoptionPlan; gate: AdoptionGate; receipt: AdoptionReceipt | null; readback: AdoptionReadback;
};

export type SystemCandidateCard = {
  id: string; title: string; usual: string; workingEvent: string; deltaId: string;
  main: string; mayRecord: boolean; edition: "working" | "retired";
};
export type SystemCandidateCoordinate = {
  id: string; path: string; status: "adopt" | "convergent" | "composed" | "conflict" | "resolved";
  aspects: string[];
};
export type SystemCandidateFrontier = {
  id: string; workingEvent: string; deltaId: string; repository: string; installedDigest: string;
  coordinates: SystemCandidateCoordinate[];
};
export type SystemCandidateSide = { status: "text" | "missing" | "too-large" | "binary"; digest: string | null; text: string | null };
export type SystemCandidatePreview = {
  coordinate: SystemCandidateCoordinate; base: SystemCandidateSide; ours: SystemCandidateSide; theirs: SystemCandidateSide;
  result: "compose" | "same-change" | "incoming-only" | "collision" | "absence" | "limited";
  composedDigest: string | null;
};
export type SystemCandidateDecision = "carry-both" | "keep-converged" | "review-incoming" | "hold-collision" |
  "hold-absence" | "hold-preview" | "hold-stale";
export type SystemCandidatePlan = { decision: SystemCandidateDecision; record: boolean; finding: string; proof: string[] };
export type SystemCandidateGate = { current: boolean; event: string; main: string };
export type SystemCandidateReceipt = { path: string; digest: string; coordinate: string; event: string };
export type SystemCandidateReadback = { event: string; main: string; artifactDigest: string | null };
export type SystemCandidateOutcome = {
  scope: "owned-system-template-conflict-review"; card: SystemCandidateCard; frontier: SystemCandidateFrontier;
  preview: SystemCandidatePreview; plan: SystemCandidatePlan; gate: SystemCandidateGate;
  receipt: SystemCandidateReceipt | null; readback: SystemCandidateReadback;
};

export type ScaffoldKind = "react" | "react-site" | "svelte" | "svelte-site" | "stateless" | "agentic" |
  "package" | "skill" | "content" | "web-client" | "terminal-client" | "native-client";
export type ScaffoldCard = { id: string; label: string; names: string[]; event: string; edition: "owned" | "archived"; permission: "draft" | "read-only" };
export type ScaffoldOptions = { id: string; available: ScaffoldKind[]; occupied: string[]; svelteSource: string | null; protectedMain: string };
export type ScaffoldPlan = {
  disposition: "prepare" | "advise-only" | "hold-authority" | "hold-unavailable" | "hold-occupied";
  kinds: ScaffoldKind[]; finding: string;
};
export type ScaffoldDraftUnit = { target: string; kind: ScaffoldKind; files: string[]; manifestDigest: string | null; entry: string | null; portableEntry: string | null; hostAbi: string | null; authority: string[]; nativeTests: string[] };
export type ScaffoldReceipt = { commandId: string; draft: string; publication: "unchanged"; runtime: "unchanged"; units: ScaffoldDraftUnit[] };
export type ScaffoldReadback = { main: string; draft: string; units: ScaffoldDraftUnit[] };
export type ScaffoldOutcome = {
  scope: "owned-scaffold-draft"; card: ScaffoldCard; options: ScaffoldOptions; plan: ScaffoldPlan;
  receipt: ScaffoldReceipt | null; readback: ScaffoldReadback;
};

export type LocalMethodKind = "inspect-counts" | "compare-template" | "verify-ownership" | "confirm-state";
export type LocalMethodCard = { id: string; title: string; method: LocalMethodKind; edition: "current" | "retired" };
export type LocalMethodEvidence = {
  cardId: string; channel: string; caller: string; provider: string | null; basis: string;
  permitted: boolean; current: boolean; retained: LocalMethodReport | null;
};
export type LocalMethodPlan = {
  action: "request" | "recover" | "hold-authority" | "hold-route" | "hold-moved";
  method: LocalMethodKind; finding: string;
};
export type LocalMethodAttempt = { transport: string; invocation: string; disposition: "submitted" | "interrupted" };
export type LocalMethodReport = {
  channel: string; transport: string; invocation: string; method: LocalMethodKind;
  outcome: "success" | "error"; detail: string; executed: number; start: number; terminal: number;
};
export type LocalMethodOutcome = {
  scope: "owned-local-method-exchange"; card: LocalMethodCard; evidence: LocalMethodEvidence; plan: LocalMethodPlan;
  attempt: LocalMethodAttempt | null; terminal: LocalMethodReport | null;
};
