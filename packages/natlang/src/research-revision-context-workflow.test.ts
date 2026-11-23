import {expect,it} from 'vitest';
import {readFile,readdir,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {ProgramLoader} from './programs.js';
import {createNatlangRuntime,workerdPlatform} from '../vendor/workerd/natlang-workerd.js';
import {confinedRealm} from './realm.js';
import {testNewFunction} from './testSupport.js';
it('forms the factual question from actual document observations before public research and preserves unrelated text',async()=>{
 const root=fileURLToPath(new URL('../../..',import.meta.url));
 const platform=workerdPlatform({realm:confinedRealm(testNewFunction())});
 const scripts:Record<string,string>={
  reviseFromPublicResearch:'const documents=await inspectRevisionContext(goal); const question=await identifyResearchQuestion(goal,documents);const research=await investigatePublicQuestion(question);const revision=await reviseWorkspaceDocument(goal,research);return {research,revision};',
  inspectRevisionContext:'const paths=await listDocuments();return await readDocuments(paths);',
  identifyResearchQuestion:'if(!documents.some(document=>document.text.includes("reserved example domains")))throw new Error("Missing actual document context");return "Can reserved example domains used in documentation be registered?";',
  investigatePublicQuestion:'goalDiscovery.snapshotTime();return {question:goal,status:"answered",statements:[{text:"Reserved example domains cannot be registered.",cites:[{url:"https://authority.test/examples",title:"Reserved examples",retrieved:"2026-11-23",published:null,quote:"Reserved example domains cannot be registered."}]}],notRead:[],rejected:0};',
  reviseWorkspaceDocument:'const target=await goalWorkspace.read("tutorial.md");if(!target||!research||research.status!=="answered")return {status:"blocked",reason:"Missing grounded revision"};const text=target.text.replace("You may register reserved example domains.","Reserved example domains cannot be registered.");const written=await goalWorkspace.revise(target.path,target.version,text);return written.status==="written"?{status:"edited",path:target.path,version:written.version}:{status:"blocked",reason:"Write was not admitted"};',
 };
 const runtime=createNatlangRuntime({platform,agent:async session=>{const code=scripts[session.lam.functionName!];if(!code)throw new Error('Unexpected policy '+session.lam.functionName);const action=await session.applyAsync('eval',{code,finish:true});if(action.kind!=='completed')throw new Error(action.text);}});
 const reads:string[]=[];let text='# DNS tutorial\nYou may register reserved example domains.\nKeep this separate setup paragraph.';let researchStarted=false;
 const loader=new ProgramLoader({platform,fs:{readFile:path=>readFile(join(root,path),'utf8'),readdir:path=>readdir(join(root,path),{withFileTypes:true}),stat:path=>stat(join(root,path))},bindings:{},runTask:(run,task)=>runtime.run(run,task)});
 const run=await loader.load('skills/open-user-goal/reviseFromPublicResearch.nl',{services:{goalWorkspace:{list:async()=>['tutorial.md','editor-notes.md'],read:async(path:string)=>{reads.push(path);return {path,version:'original',text:path==='tutorial.md'?text:'The tutorial uses reserved example domains for documentation.'};},revise:async(path:string,version:string,next:string)=>{expect(path).toBe('tutorial.md');expect(version).toBe('original');text=next;return {status:'written',version:'updated'};}},goalDiscovery:{snapshotTime:()=>{expect(reads).toContain('tutorial.md');expect(reads).toContain('editor-notes.md');researchStarted=true;return 1795449600000;},search:async()=>[]}}}) as (goal:string)=>Promise<any>;
 const result=await run('Verify the tutorial examples with the authority and correct the registration sentence, keeping other paragraphs.');
 expect(researchStarted).toBe(true);expect(result.research.question).toContain('reserved example domains');expect(result.revision).toEqual({status:'edited',path:'tutorial.md',version:'updated'});expect(text).toContain('Reserved example domains cannot be registered.');expect(text).toContain('Keep this separate setup paragraph.');
});
