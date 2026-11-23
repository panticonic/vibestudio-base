import {pdfGoalVisual} from "natlang:services";
import type {PdfGoalRender} from "../types.js";
export default async function readRenderedPages(operationId:string,pages:number[]):Promise<PdfGoalRender[]>{
 const rendered:PdfGoalRender[]=[];for(const page of pages)rendered.push(await pdfGoalVisual.render(operationId,page));return rendered;
}
