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
  | { status: "workspace-skill-reviewed"; skill: "newsEvidence"; outcome: unknown }
  | { status: "workspace-skill-reviewed"; skill: "installedPackage"; outcome: unknown }
  | { status: "workspace-skill-reviewed"; skill: "extensionDossier"; outcome: unknown }
  | { status: "workspace-skill-reviewed"; skill: "localWidth"; outcome: unknown }
  | { status: "workspace-skill-reviewed"; skill: "evalHandoff"; outcome: unknown }
  | { status: "workspace-skill-reviewed"; skill: "programRun"; outcome: unknown }
  | { status: "workspace-skill-reviewed"; skill: "browserMigration"; outcome: unknown }
  | { status: "workspace-skill-reviewed"; skill: "templateMigration"; outcome: unknown }
  | { status: "workspace-skill-reviewed"; skill: "authoring"; outcome: unknown }
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
