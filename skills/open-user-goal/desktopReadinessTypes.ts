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
  desk: DesktopDesk; admission: unknown; window: DesktopWindowObservation | null;
  updates: DesktopUpdateObservation | null;
};
export type DesktopReadinessFindings = { reason: string };
