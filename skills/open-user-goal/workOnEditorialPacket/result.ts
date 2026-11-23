import type {PacketDocument,PacketDecision,PacketReceipt,EditorialPacketResult} from "./types.js";
export default function result(stored:PacketDocument,decision:PacketDecision,note:PacketReceipt|null):EditorialPacketResult {
 return {document:{path:stored.path,version:stored.version},decision,note};
}
