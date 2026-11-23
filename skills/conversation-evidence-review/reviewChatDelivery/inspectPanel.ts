import {chatDeliveryPanel} from "natlang:services";
import type {ChatDeliveryPanel} from "../types.js";
/** Read the assigned chat panel with its current context, channel, and visible message evidence. */
export default async function inspectPanel(panelId: string):Promise<ChatDeliveryPanel>{
 return chatDeliveryPanel.inspect(panelId);
}
