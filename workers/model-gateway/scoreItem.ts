import {batchScoreItem} from "@workspace/natlang-pi";
import type {DecisionRequest} from "@workspace/natlang-pi";
/** The canonical scorer owns rendering, split-tokenization and reasoning-ID opt-outs. */
export function scoreItem(request:DecisionRequest){
 return batchScoreItem(request,request.x_natlang_privileged_context?{x_natlang_privileged_context:request.x_natlang_privileged_context}:undefined);
}
