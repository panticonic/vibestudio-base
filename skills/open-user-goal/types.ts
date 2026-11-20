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
