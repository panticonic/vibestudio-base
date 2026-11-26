import {beforeEach,expect,it,vi} from 'vitest';
const memory=vi.hoisted(()=>({head:'initial',history:new Map<string,{manifest:string;artwork:string}>(),attempts:0,failWrite:false,failRead:false}));
vi.mock('@workspace/runtime',()=>({
 contextId:'unit-owner',fs:{readdir:async()=>['first.svg','second.svg']},
 vcs:{status:async({contextId}:any)=>{expect(contextId).toBe('unit-owner');if(memory.failRead){memory.failRead=false;throw Error('Temporary read unavailable');}return{mainEventId:'protected-main',workingHead:{kind:'event',eventId:memory.head}};},
 resolveRepository:async()=>({repositoryId:'unit-repository'}),
 readFile:async({state,file}:any)=>{const stored=memory.history.get(state.eventId)!;const text=file.path==='package.json'?stored.manifest:stored.artwork;return{content:{kind:'text',text}};}}
}));
vi.mock('@workspace-skills/workspace-dev',()=>({
 prepareUnitIcon:async(id:string)=>({icon:'./assets/icon.svg',files:{'assets/icon.svg':'<svg>'+id+'</svg>'}}),
 setUnitIcon:async({repoPath,icon,expectedWorkingHead}:any)=>{
  expect(repoPath).toBe('panels/review');memory.attempts++;
  if(memory.head!==expectedWorkingHead.eventId)throw Error('Working head changed');
  if(memory.failWrite){memory.failWrite=false;throw Error('Temporary write unavailable');}
  const old=memory.history.get(memory.head)!,manifest=JSON.parse(old.manifest);manifest.vibestudio.icon='./assets/icon.svg';
  memory.head='prepared';memory.history.set(memory.head,{manifest:JSON.stringify(manifest),artwork:'<svg>'+icon+'</svg>'});
  return{preparation:{workingHead:{kind:'event',eventId:memory.head}},files:['package.json','assets/icon.svg']};
 }
}));
import {bindUnitIdentity} from './index.js';
function binding(){return bindUnitIdentity({repoPath:'panels/review',goal:'Review the exact first Lucide symbol for this local draft.',unit:{name:'review',kind:'panel',description:'Reviews local work'},prepare:true});}
beforeEach(()=>{memory.head='initial';memory.history.clear();memory.history.set('initial',{manifest:JSON.stringify({name:'review',vibestudio:{icon:'./assets/icon.svg',displayName:'Review',other:'protected'}}),artwork:'<svg>old</svg>'});memory.attempts=0;memory.failWrite=false;memory.failRead=false;});
it('returns fresh observations without renewing the original mutation CAS authority',async()=>{
 const b=binding(),id=b.request.operationId,s=b.services.unitIdentity;
 const opening=await s.observe(id);memory.history.set('coedit',{...memory.history.get('initial')!});memory.head='coedit';
 const fresh=await s.observe(id);expect(fresh.revision).toBe('coedit');expect(opening.revision).toBe('initial');
 const candidate=await s.resolve(id,{family:'lucide',term:'first'});
 await expect(s.stage(id,fresh.revision,candidate!.choice.id)).rejects.toThrow('assigned revision');expect(memory.attempts).toBe(0);
});
it('supports actual catalog alternatives and fresh persisted readback after one scoped edit',async()=>{
 const b=binding(),id=b.request.operationId,s=b.services.unitIdentity;
 const first=await s.resolve(id,{family:'lucide',term:'first'}),second=await s.resolve(id,{family:'lucide',term:'second'});
 expect(first!.choice.id).toBe('lucide:first');expect(second!.choice.id).toBe('lucide:second');
 const opening=await s.observe(id),change=await s.stage(id,opening.revision,first!.choice.id),fresh=await s.observe(id);
 expect(fresh.revision).toBe(change.revision);expect(fresh.artworkDigest).toBe(first!.artworkDigest);expect(change.manifestOtherwiseUnchanged).toBe(true);expect(change.mainUnchanged).toBe(true);expect(memory.attempts).toBe(1);
 await expect(s.stage(id,opening.revision,second!.choice.id)).rejects.toThrow('assigned revision');expect(memory.attempts).toBe(1);
});
it('allows a failed uncommitted write to be retried under the same original native CAS',async()=>{
 const b=binding(),id=b.request.operationId,s=b.services.unitIdentity,opening=await s.observe(id),candidate=await s.resolve(id,{family:'lucide',term:'first'});
 memory.failWrite=true;await expect(s.stage(id,opening.revision,candidate!.choice.id)).rejects.toThrow('Temporary write unavailable');expect(memory.head).toBe('initial');
 const change=await s.stage(id,opening.revision,candidate!.choice.id);expect(change.revision).toBe('prepared');expect(memory.attempts).toBe(2);expect(memory.history.size).toBe(2);
});
it('does not poison the original observation baseline after a failed initial read',async()=>{
 const b=binding(),id=b.request.operationId,s=b.services.unitIdentity;memory.failRead=true;await expect(s.observe(id)).rejects.toThrow('Temporary read unavailable');
 const opening=await s.observe(id),candidate=await s.resolve(id,{family:'lucide',term:'first'});expect((await s.stage(id,opening.revision,candidate!.choice.id)).revision).toBe('prepared');
});
