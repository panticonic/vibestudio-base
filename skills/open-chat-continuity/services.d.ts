declare module "natlang:services" {
  export const chatContinuityIndex: {list():Promise<import("./types.js").ChatIndex>};
  export const chatContinuityState: {read(channelId:string):Promise<import("./types.js").ChatObservation|null>};
  export const chatContinuityHandoff: {stage(report:import("./types.js").ChatContinuityReport):Promise<import("./types.js").ChatHandoff|null>};
}
