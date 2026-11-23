declare module "natlang:services" {
  export const nativeIntentDiscovery:{
    notice():Promise<import("./types.js").IntentNotice>;
    search(query:string):Promise<import("./types.js").IntentHit[]>;
    describe(id:string):Promise<import("./types.js").IntentDescription|null>;
    inspect(methodId:string,scope:string):Promise<import("./types.js").IntentObservation|null>;
  };
  export const nativeIntentHandoff:{stage(report:import("./types.js").IntentReport):Promise<import("./types.js").IntentNote|null>};
}
