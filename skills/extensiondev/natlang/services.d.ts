import type { ExtensionRuntime, ExtensionSource } from "./types.js";

declare module "natlang:services" {
  export const extensionReleaseRead: {
    source(operationId: string): Promise<ExtensionSource>;
    runtime(operationId: string): Promise<ExtensionRuntime>;
  };
}
