import type {ChatContinuityReport,ChatHandoff,ChatIndex,ChatObservation} from "./types.js";
declare module "natlang:services" {
  export const chatContinuityIndex: {list():Promise<ChatIndex>};
  export const chatContinuityState: {read(channelId:string):Promise<ChatObservation|null>};
  export const chatContinuityHandoff: {stage(report:ChatContinuityReport):Promise<ChatHandoff|null>};
}
