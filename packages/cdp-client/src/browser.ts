import { BrowserImpl } from "./worker";

export { BrowserImpl };
export { CdpConnection, CdpSession, CdpDialog, CdpError } from "./worker";
export type { CdpDialogData, CdpInteractionOutcome } from "./worker";
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

export type Browser = Awaited<ReturnType<typeof BrowserImpl.connect>>;

export type Options = {
  headless?: boolean;
};

export async function connect(
  wsEndpoint: string,
  _browserName: string,
  options: Options & { authToken?: string } = {},
): Promise<Browser> {
  return BrowserImpl.connect(wsEndpoint, {
    transportOptions: options.authToken
      ? { authToken: options.authToken }
      : undefined,
  });
}

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
