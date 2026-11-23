import {gadDurableHistory} from "natlang:services";
import type {DurableQuestionHistory} from "../../types.js";
/** Read the assigned conversation's exact published user and assistant messages. */
export default async function readMessages():Promise<DurableQuestionHistory>{
 return gadDurableHistory.read();
}
