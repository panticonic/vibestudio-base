import {welcomeReceiptStore} from "natlang:services";
import type {WelcomeSnapshot} from "./types.js";
/** Read one scoped retained Personal first-run conversation frontier. */
export default async function readWelcomeFrontier(channelId: string):Promise<WelcomeSnapshot | null>{
 return welcomeReceiptStore.read(channelId);
}
