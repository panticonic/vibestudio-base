declare module "natlang:services" {
  export const tendrilPresentation: {
    devices(): Promise<import("./types.js").TendrilDevice[]>;
    present(deviceId: string): Promise<import("./types.js").TendrilPresentation>;
  };
  export const tendrilPage: {
    inspect(): Promise<import("./types.js").TendrilPage>;
    write(field: import("./types.js").TendrilField): Promise<import("./types.js").TendrilPage>;
    invoke(name: string): Promise<import("./types.js").TendrilPage>;
  };
  export const tendrilBuild: {
    update(candidate: string): Promise<import("./types.js").TendrilBuildResult>;
    back(): Promise<import("./types.js").TendrilPage>;
  };
}
