import type { ArchitectureRoute, ArchitectureDeclaration } from "./types.js";

declare module "natlang:services" {
  export const architectureProviderRead: {
    resolve(operationId: string): Promise<ArchitectureRoute>;
    declaration(routeReceipt: string): Promise<ArchitectureDeclaration | null>;
  };
}
