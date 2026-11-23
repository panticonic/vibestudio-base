import {goalWorkspace} from "natlang:services";
export default function listDocuments():Promise<string[]>{return goalWorkspace.list();}
