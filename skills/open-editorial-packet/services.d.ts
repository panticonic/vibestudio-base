import type {PacketDocument,PacketEvidence,PacketMission,PacketPdf,PacketPlan,PacketReadRequest,PacketReceipt,PacketReport,
  PacketSnapshot,PacketSourcePlan,PacketWrite} from "./types.js";
declare module "natlang:services" {
  export const editorialMission: {list():Promise<PacketMission[]>};
  export const editorialWorkspace: {read(missionId:string):Promise<PacketSnapshot|null>};
  export const editorialPdf: {
    bind(snapshot:PacketSnapshot,plan:PacketPlan,selection:PacketSourcePlan):Promise<PacketReadRequest|null>;
    attest(report:PacketPdf):Promise<PacketEvidence>;
  };
  export const editorialRevision: {
    apply(missionId:string,proposal:PacketDocument):Promise<PacketWrite>;
    read(missionId:string):Promise<PacketDocument|null>;
  };
  export const editorialHandoff: {stage(report:PacketReport):Promise<PacketReceipt|null>};
}
