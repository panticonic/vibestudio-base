import {
  templatesMethods,
  workspaceTemplateSourceMethods,
  type TemplatesClient,
} from "@vibestudio/service-schemas/templates";
import { createTypedServiceClient } from "@vibestudio/shared/typedServiceClient";

/** The same schema owns inspection and authoring signatures on every runtime. */
export type TemplateManagementClient = TemplatesClient;
export function createTemplateManagementClient(
  invoke: (
    extension: string,
    method: string,
    args: unknown[],
  ) => Promise<unknown>,
): TemplateManagementClient {
  return createTypedServiceClient(
    "templates",
    templatesMethods,
    (_service, method, args) =>
      invoke("@workspace-extensions/templates", method, args),
  );
}

/**
 * Trusted shell composition: moving URLs resolve in the extension, while every
 * exact pin is inspected by the host's single acquisition owner.
 */
export function createShellTemplateManagementClient(
  invoke: (
    extension: string,
    method: string,
    args: unknown[],
  ) => Promise<unknown>,
  callHost: (
    service: string,
    method: string,
    args: unknown[],
  ) => Promise<unknown>,
): TemplateManagementClient {
  const extension = createTemplateManagementClient(invoke);
  const exact = createTypedServiceClient(
    "workspaceTemplateSource",
    workspaceTemplateSourceMethods,
    callHost,
  );
  return {
    ...extension,
    async inspect(locator) {
      const pin =
        "pin" in locator ? locator.pin : await extension.resolveSource(locator);
      return exact.inspectExact(pin);
    },
  };
}
