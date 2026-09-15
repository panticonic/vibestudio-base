import {
  createPanelDeepLink,
  createPanelShareUrl,
  type PanelLocation,
  type PanelWorkspace,
} from "@vibestudio/shared/panelLocation";

/** One logical navigation contract, independent of asset-serving URLs. */
export type BuildPanelLinkOptions = Omit<PanelLocation, "source">;

function currentWorkspace(): PanelWorkspace | undefined {
  const id = (
    globalThis as typeof globalThis & {
      __vibestudioGatewayConfig?: { workspace?: string };
    }
  ).__vibestudioGatewayConfig?.workspace;
  return id ? { id } : undefined;
}

function shareableLocation(
  source: string,
  options?: BuildPanelLinkOptions,
): PanelLocation {
  return {
    ...options,
    source,
    workspace: options?.workspace ?? currentWorkspace(),
  };
}

/** Build an OS/app link; a hosted panel captures its current workspace by ID. */
export function buildPanelDeepLink(
  source: string,
  options?: BuildPanelLinkOptions,
): string {
  return createPanelDeepLink(shareableLocation(source, options));
}

/** Build an HTTPS share link for the same logical panel location. */
export function buildPanelShareLink(
  source: string,
  options?: BuildPanelLinkOptions,
): string {
  return createPanelShareUrl(shareableLocation(source, options));
}

/**
 * A navigation link. Omit workspace to stay local, or select a workspace by
 * exact name, { id }, or { role: "system" | "personal" }.
 * Use an anchor or navigate to this URL from a user action.
 */
export function buildPanelLink(
  source: string,
  options?: BuildPanelLinkOptions,
): string {
  return createPanelDeepLink({ ...options, source });
}
