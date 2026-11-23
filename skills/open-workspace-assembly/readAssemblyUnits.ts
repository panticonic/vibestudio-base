import {assemblySource} from "natlang:services";
import type {AssemblyRevision,UnitSource} from "./types.js";
export default async function readAssemblyUnits(selected:string[],head:AssemblyRevision):Promise<UnitSource[]>{
 const sources:UnitSource[]=[];
 for(const unit of selected){const source=await assemblySource.read(unit,head);if(source)sources.push(source);}
 return sources;
}
