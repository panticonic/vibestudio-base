declare module "natlang:services" {
  export const extensionDesignRead: {
    inspect(operationId: string): Promise<import("./types.js").LiveExtensionDesignEvidence>;
  };
}
