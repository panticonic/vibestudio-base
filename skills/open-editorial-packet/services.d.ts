declare module "natlang:services" {
  export const editorialMission: {list():Promise<import("./types.js").PacketMission[]>};
  export const editorialWorkspace: {read(missionId:string):Promise<import("./types.js").PacketSnapshot|null>};
  export const editorialPdf: {
    bind(snapshot:import("./types.js").PacketSnapshot,plan:import("./types.js").PacketPlan,selection:import("./types.js").PacketSourcePlan):Promise<import("./types.js").PacketReadRequest|null>;
    attest(report:import("./types.js").PacketPdf):Promise<import("./types.js").PacketEvidence>;
  };
  export const editorialRevision: {
    apply(missionId:string,proposal:import("./types.js").PacketDocument):Promise<import("./types.js").PacketWrite>;
    read(missionId:string):Promise<import("./types.js").PacketDocument|null>;
  };
  export const editorialHandoff: {stage(report:import("./types.js").PacketReport):Promise<import("./types.js").PacketReceipt|null>};
}
