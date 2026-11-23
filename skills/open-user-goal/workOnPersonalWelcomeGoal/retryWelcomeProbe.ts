import probeWorkspaceText from "./retryWelcomeProbe/explorer/probeWorkspaceText.nl";
import type {ExplorerRequest,ExplorerWitness} from "./types.js";
export default async function retryWelcomeProbe(request:ExplorerRequest):Promise<ExplorerWitness>{return {request,result:await probeWorkspaceText(request)};}
