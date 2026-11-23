import {newsEditionReview} from "natlang:services";
import readonlyEditionQuestion from "./prepareNewsEditionReview/readonlyEditionQuestion.nl";
import reviewNewsEvidence from "./reviewNewsEvidence.nl";
import reviewBriefing from "./prepareNewsEditionReview/reviewBriefing.nl";
import choosePacket from "./prepareNewsEditionReview/choosePacket.nl";
import attributeBasis from "./prepareNewsEditionReview/attributeBasis.nl";
import designEditorPacket from "./prepareNewsEditionReview/designEditorPacket.nl";
import type {NewsEditionReviewResult} from "./prepareNewsEditionReview/types.js";
export default async function prepareNewsEditionReview(goal:string):Promise<NewsEditionReviewResult>{
 const desk=await newsEditionReview.readDesk();
 const news=await reviewNewsEvidence(await readonlyEditionQuestion(goal,desk));
 const briefingReady=await reviewBriefing(news),plan=await choosePacket(goal,desk,news);
 const attribution=await attributeBasis(goal,desk,news,plan);
 const presentation=plan.action==="packet"&&briefingReady?await designEditorPacket(goal,desk,plan,news):null;
 const artifact=presentation?await newsEditionReview.stage(desk,plan,news,presentation):null;
 return {plan,artifact,attribution};
}
