export { BrowserImpl, connect } from "./browser";
export type { Browser, Options } from "./browser";
export { CdpConnection, CdpSession, CdpDialog, CdpError } from "./worker";
export type { CdpDialogData, CdpInteractionOutcome } from "./worker";
export type { WorkerCdpPage as CdpPage } from "./worker";
export type {
  CdpProfileCoverage,
  CdpProfileCoverageScript,
  CdpProfileNetworkMetrics,
  CdpProfileNetworkRequest,
  CdpProfileOptions,
  CdpProfilePageMetrics,
  CdpProfileReport,
  CdpProfileRuntimeMetrics,
} from "./profile";

export { CdpRequest, CdpResponse } from "./network";
export type {
  CdpNetworkFailure,
  CdpNetworkEvents,
  CdpNetworkEvent,
  CdpResponseMatcher,
} from "./network";
export type { CdpFilePayload } from "./worker";

export { CdpDownload } from "./download";
export type { BrowserPopup as CdpPopup } from "@vibestudio/shared/panel/browserAutomation";

export type { WorkerCdpFrameLocator as CdpFrameLocator } from "./worker";
