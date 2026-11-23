declare module "natlang:services" {
  export const launchStateRead:{
    enumerate():Promise<import("./types.js").LaunchIndex>;
    read(panelId:string):Promise<import("./types.js").LaunchSnapshot|null>;
    seal(panelId:string):Promise<import("./types.js").LaunchSnapshot|null>;
    bind(panelId:string,basis:string,patch:import("./types.js").LaunchPatch):Promise<import("./types.js").LaunchAuthorityRequest|null>;
  };
  export const launchStateWrite:{
    patch(panelId:string,basis:string,patch:import("./types.js").LaunchPatch):Promise<import("./types.js").LaunchEffect|null>;
    stage(report:import("./types.js").LaunchReport):Promise<import("./types.js").LaunchNote|null>;
  };
}
