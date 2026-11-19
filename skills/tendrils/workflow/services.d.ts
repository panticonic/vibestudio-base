import type {
  TendrilBuildResult,
  TendrilDevice,
  TendrilField,
  TendrilPage,
  TendrilPresentation,
} from "./types.js";

declare module "natlang:services" {
  export const tendrilPresentation: {
    devices(): Promise<TendrilDevice[]>;
    present(deviceId: string): Promise<TendrilPresentation>;
  };
  export const tendrilPage: {
    inspect(): Promise<TendrilPage>;
    write(field: TendrilField): Promise<TendrilPage>;
    invoke(name: string): Promise<TendrilPage>;
  };
  export const tendrilBuild: {
    update(candidate: string): Promise<TendrilBuildResult>;
    back(): Promise<TendrilPage>;
  };
}
