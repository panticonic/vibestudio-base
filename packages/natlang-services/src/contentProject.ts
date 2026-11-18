import type { VcsClient } from "@workspace/runtime";
import type { VcsEditChange, VcsStateNodeRef, VcsEditInput } from "@vibestudio/service-schemas/vcs";
import type { ContentProjectRequest as Request, ContentProjectDraft as Draft, ContentProjectSnapshot as Snapshot } from "./contentProjectContracts.js";

type PrepareProjectPort = (projects: {projectType:"project";name:string;title:string}[], command:Pick<VcsEditInput,"commandId"|"expectedWorkingHead">) => Promise<{created:string;preflight:{ok:boolean};preparation:{contextId:string}}[]>;

type Client = Pick<VcsClient,"status"|"resolveRepository"|"listFiles"|"readFile"|"edit"|"commit">;
/** Called in the assigned ordinary EvalDO/worker context; no host-device authority or second VCS implementation. */
export function createProjectDelivery(ports:{contextId:string;vcs:Client;prepareProjects:PrepareProjectPort}, assignment:{contextId:string;name:string;title:string;request:Request}) {
  if(ports.contextId!==assignment.contextId) throw new Error("Project binding belongs to another execution context");
  if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(assignment.name)) throw new Error("Assigned project name must be a canonical repository basename");
  const repoPath=`projects/${assignment.name}`, facts=JSON.stringify(assignment.request.facts,null,2)+"\n";
  const remembered=new Map<string,VcsStateNodeRef>();
  const remember=(state:VcsStateNodeRef)=>{const head=JSON.stringify(state);remembered.set(head,state);return head;};
  const basis=async(head:string)=>{
    const known=remembered.get(head),actual=await ports.vcs.status({contextId:assignment.contextId});
    if(!known||JSON.stringify(actual.workingHead)!==head) throw new Error("Project basis changed; observe actual state before writing");
    return actual;
  };
  const observe=async():Promise<Snapshot>=>{
    const status=await ports.vcs.status({contextId:assignment.contextId});
    const repository=await ports.vcs.resolveRepository({state:status.workingHead,repoPath});
    const files:Draft[]=[];
    if(repository){
      const page=async(cursor?:string,seen:string[]=[]):Promise<void>=>{
        const batch=await ports.vcs.listFiles({state:status.workingHead,repositoryId:repository.repositoryId,...(cursor?{cursor}:{})});
        for(const item of batch.files){
          const read=await ports.vcs.readFile({state:status.workingHead,repositoryId:repository.repositoryId,file:{kind:"id",fileId:item.fileId}});
          if(!read||read.content.kind!=="text") throw new Error("Content project has an unreadable nontext file");
          files.push({path:read.path,text:read.content.text});
        }
        if(batch.nextCursor){if(seen.includes(batch.nextCursor))throw new Error("Project file cursor repeated");await page(batch.nextCursor,[...seen,batch.nextCursor]);}
      };
      await page();
    }
    return {contextId:assignment.contextId,repoPath,repositoryId:repository?.repositoryId??null,head:remember(status.workingHead),mainEventId:status.mainEventId,committedEventId:status.committed.eventId,clean:status.clean,files};
  };
  return {
    observe,
    async prepare(head:string){
      const before=await basis(head);
      if(await ports.vcs.resolveRepository({state:before.workingHead,repoPath}))throw new Error("Assigned project already exists");
      const receipts=await ports.prepareProjects([{projectType:"project",name:assignment.name,title:assignment.title}],{commandId:crypto.randomUUID(),expectedWorkingHead:before.workingHead});
      const receipt=receipts[0];
      if(receipts.length!==1||receipt?.created!==repoPath||receipt.preparation.contextId!==assignment.contextId||!receipt.preflight.ok)throw new Error("Preparation did not establish the assigned content project");
      return observe();
    },
    async writeDocuments(head:string,documents:Draft[]){
      const before=await basis(head);
      const repository=await ports.vcs.resolveRepository({state:before.workingHead,repoPath});
      if(!repository)throw new Error("Prepare the assigned project before writing documents");
      const paths=new Set<string>();
      for(const document of documents){
        if(!(document.path==="README.md"||/^docs\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.md$/u.test(document.path)))throw new Error("Write only README.md or canonical Markdown paths under docs/");
        if(paths.has(document.path)||!document.text.trim())throw new Error("Document paths must be unique and content nonempty");paths.add(document.path);
      }
      const changes:VcsEditChange[]=[];
      for(const document of [...documents,{path:"sources.json",text:facts}]){
        const current=await ports.vcs.readFile({state:before.workingHead,repositoryId:repository.repositoryId,file:{kind:"path",path:document.path}});
        changes.push(current?{kind:"content-replace",repositoryId:repository.repositoryId,fileId:current.fileId,content:{kind:"text",text:document.text}}:{kind:"file-create",repositoryId:repository.repositoryId,path:document.path,mode:0o644,content:{kind:"text",text:document.text}});
      }
      await ports.vcs.edit({contextId:assignment.contextId,commandId:crypto.randomUUID(),expectedWorkingHead:before.workingHead,intentSummary:"Write grounded project documents and immutable source ledger",changes});
      return observe();
    },
    async commit(head:string,message:string){
      const before=await basis(head);
      const result=await ports.vcs.commit({contextId:assignment.contextId,commandId:crypto.randomUUID(),expectedWorkingHead:before.workingHead,message});
      const after=await observe();
      if(!after.clean||after.committedEventId!==result.event.eventId)throw new Error("Project local commit did not establish a clean actual event");
      return {eventId:result.event.eventId,head:after.head};
    },
  };
}
