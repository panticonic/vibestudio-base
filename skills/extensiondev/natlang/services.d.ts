declare module "natlang:services" {
  export const extensionReleaseRead: {
    source(operationId: string): Promise<import("./types.js").ExtensionSource>;
    runtime(operationId: string): Promise<import("./types.js").ExtensionRuntime>;
  };
}
