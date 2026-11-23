import {goalWorkspace} from "natlang:services";
import type {WorkspaceRevision} from "../../types.js";
export default async function readDocuments(paths:string[]):Promise<WorkspaceRevision[]>{
 const values:WorkspaceRevision[]=[];
 for(let offset=0;offset<paths.length;offset+=4){const batch=await Promise.all(paths.slice(offset,offset+4).map(path=>goalWorkspace.read(path)));for(const item of batch)if(item)values.push(item);}
 return values;
}
