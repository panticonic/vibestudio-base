declare module "natlang:services" {
  export const architectureProviderRead: {
    resolve(operationId: string): Promise<import("./types.js").ArchitectureRoute>;
    declaration(routeReceipt: string): Promise<import("./types.js").ArchitectureDeclaration | null>;
  };
}
