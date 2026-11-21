import type { IntentDescription,IntentHit,IntentNote,IntentNotice,IntentObservation,IntentReport } from "./types.js";
declare module "natlang:services" {
  export const nativeIntentDiscovery:{
    notice():Promise<IntentNotice>;
    search(query:string):Promise<IntentHit[]>;
    describe(id:string):Promise<IntentDescription|null>;
    inspect(methodId:string,scope:string):Promise<IntentObservation|null>;
  };
  export const nativeIntentHandoff:{stage(report:IntentReport):Promise<IntentNote|null>};
}
