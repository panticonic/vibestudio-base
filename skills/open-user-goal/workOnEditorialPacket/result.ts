import type {PacketReport,EditorialPacketResult} from "./types.js";
export default function result(report:PacketReport):EditorialPacketResult {
 return {document:{path:report.edit.stored.path,version:report.edit.stored.version},decision:report.decision,note:report.note};
}
