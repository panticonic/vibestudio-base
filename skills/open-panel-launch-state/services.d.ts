import type { LaunchEffect,LaunchIndex,LaunchNote,LaunchPatch,LaunchReport,LaunchSnapshot,LaunchAuthorityRequest } from "./types.js";
declare module "natlang:services" {
  export const launchStateRead:{
    enumerate():Promise<LaunchIndex>;
    read(panelId:string):Promise<LaunchSnapshot|null>;
    seal(panelId:string):Promise<LaunchSnapshot|null>;
    bind(panelId:string,basis:string,patch:LaunchPatch):Promise<LaunchAuthorityRequest|null>;
  };
  export const launchStateWrite:{
    patch(panelId:string,basis:string,patch:LaunchPatch):Promise<LaunchEffect|null>;
    stage(report:LaunchReport):Promise<LaunchNote|null>;
  };
}
