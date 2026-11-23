import {pdfGoalDocuments} from "natlang:services";
import choosePdfScope from "./workOnPdfGoal/choosePdfScope.nl";
import extractPdfEvidence from "./extractPdfEvidence.nl";
import reviewPdfLayout from "./reviewPdfLayout.nl";
import readRenderedPages from "./workOnPdfGoal/readRenderedPages.js";
import recommendPdfAction from "./workOnPdfGoal/recommendPdfAction.nl";
import type {PdfGoalReport,PdfLayoutReport} from "./types.js";
export default async function workOnPdfGoal(goal:string):Promise<PdfGoalReport>{
 const observed=await pdfGoalDocuments.discover(),selection=await choosePdfScope(goal,observed);
 if(!selection)return {status:"blocked",reason:"The current PDF observations do not justify a document and page scope."};
 const binding=await pdfGoalDocuments.bind(observed.revision,selection);
 if(!binding)return {status:"blocked",reason:"The selected PDF pages could not be bound to the observed document revision."};
 const text=binding.text?await extractPdfEvidence(binding.text):null,layouts:PdfLayoutReport[]=[];
 for(const request of binding.layouts)layouts.push(await reviewPdfLayout(request));
 const rendered=binding.visual?await readRenderedPages(binding.visual.operationId,binding.visual.pages):[];
 const recommendation=await recommendPdfAction(goal,binding.missingPages,text,layouts,rendered);
 return {status:"inspected",document:binding.document,selection,missingPages:binding.missingPages,text,layouts,rendered,recommendation};
}
