/** Actual public loader controls; scripted model replies are not teacher data. */
import {expect,it,vi} from 'vitest';
import {readFile,readdir,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {URL as NodeURL,fileURLToPath} from 'node:url';
import {createEvalNatlang} from './index.js';
import {fakeRpc,testNewFunction,toolCallMessage} from './testSupport.js';
const base=fileURLToPath(new NodeURL('../../..',import.meta.url));
const examples=process.env.PORTFOLIO_EXAMPLES_ROOT!;
async function directory(path:string){const entries=new Map<string,import('node:fs').Dirent>();for(const root of [base,examples]){try{for(const entry of await readdir(join(root,path),{withFileTypes:true}))if(!entries.has(entry.name))entries.set(entry.name,entry)}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error}}return [...entries.values()]}
async function local(path:string){for(const root of [base,examples]){try{await stat(join(root,path));return join(root,path)}catch{}}return join(base,path)}
async function execute(write:boolean,refine=false){
 let turns=0;const records:any[]=[];const reads=vi.fn();
 const garden={id:'g-current',day:2,phase:1,weather:'rain',homes:[],residents:[],discoveries:[]};
 const realm={id:'r-current',month:1,treasury:10,debt:0,income:1,spending:1,serviceCost:0,worksCost:0,routes:[],regions:[],borderTension:null};
 const opening={portfolio:'owned-pair',id:'before',garden:{...garden,id:'g-before',day:1},realm,card:null};
 const current={portfolio:'owned-pair',id:'after',garden,realm,card:null};
 const receipt={path:'/.tmp/actual/handoff.json',digest:'native-digest',portfolio:'owned-pair',basis:'after'};
 const stage=vi.fn(async(report:any)=>{expect(report.opening).toEqual(opening);expect(report.current).toEqual(current);return receipt});
 const codes=[
 refine?'const first=await investigatePortfolio(goal,null);const report=await investigatePortfolio(goal,first);return finishPortfolioReport(report);':'const report=await investigatePortfolio(goal,null);return finishPortfolioReport(report);',
 'const index=await portfolio.findPortfolio();const observedOpening=await portfolio.readPortfolioFrame(index.id);const opening=previous?previous.opening:observedOpening;const ignored=await portfolio.readPortfolioFrame(index.id);const current=await portfolio.readPortfolioFrame(index.id);if(!opening||!current)throw Error("No actual pair");const plan=await choosePortfolioCriteria(goal,opening,current);const garden=await reviewPortfolioGarden(plan.garden,opening,current);const realm=await reviewPortfolioRealm(plan.realm,opening,current,null);const decision=await decidePortfolioDelivery(goal,current,plan,garden,realm);return {plan,opening,current,projection:null,garden,realm,decision,note:null};',
 `return {criteriaBasis:null,garden:[{kind:"transition",check:{kind:"day-advanced"}}],realm:[],months:null,note:${JSON.stringify(write?'decision':'none')}};`,
 'return criteria.map(criterion=>({criterion,review:{decision:"supported",finding:"The observed day changed.",evidenceIds:[opening.garden.id,current.garden.id]}}));',
 'return [];',
 `return {status:"ready",write:${write},explanation:"The actual native day advanced; the user requested ${write?'a private note':'a read-only finding'}."};`,
 ];
 if(refine)codes.push(...codes.slice(1));
 const {rpc}=fakeRpc({records:{record:(input)=>{records.push(input.record);return{recordId:input.record.call_id}}},turn:async()=>{const code=codes[turns++];if(!code)throw Error('Unexpected extra semantic call');return toolCallMessage('eval',{code,finish:true},{input:0,output:0});}});
 const runtime=createEvalNatlang({newFunction:testNewFunction(),owner:{kind:'user',objectKey:'portfolio-composition-control'},bindings:{rpc,fs:{readFile:async(path:string)=>readFile(await local(path),'utf8'),readdir:directory,stat:async(path:string)=>stat(await local(path))}}});
 try{const result=await runtime.runCell(async()=>{const natlang=runtime.ambient.natlang as {load(path:string,options:object):Promise<unknown>};const program=await natlang.load('skills/open-user-goal/workOnDemoPortfolio.nl',{services:{demoPortfolioIndex:{list:async()=>({id:'owned-pair',gardenId:'g',realmId:'r',title:'Native pair',allowedHorizons:[1,2,3]})},demoPortfolioState:{read:async()=>{reads();return reads.mock.calls.length===1?opening:current}},demoPortfolioForecast:{preview:async()=>null},demoPortfolioHandoff:{stage}}}) as (goal:string)=>Promise<any>;return program(write?'Check whether the day changed and write a private decision.':'Tell me whether the day changed without writing.')},{runId:'portfolio-composition-control',signal:new AbortController().signal});
 expect(turns).toBe(refine?11:6);const root=records.find(row=>row.parent_call_id===null&&row.definition.source.endsWith('workOnDemoPortfolio.nl'));expect(root).toBeDefined();const investigation=records.find(row=>row.parent_call_id===root.call_id&&row.definition.source.endsWith('investigatePortfolio.nl'));expect(investigation).toBeDefined();expect(records.some(row=>row.parent_call_id===investigation.call_id&&row.definition.source.endsWith('choosePortfolioCriteria.nl'))).toBe(true);expect(reads).toHaveBeenCalledTimes(refine?6:3);expect(result.value.note).toEqual(write?receipt:null);expect(stage).toHaveBeenCalledTimes(write?1:0);expect(result.value.decision.explanation).toContain('native day');
 }finally{await runtime.close()}
}
it('loads model-owned paired-demo investigation and exact requested native note',()=>execute(true),180000);
it('allows additional real observations and read-only findings without staging',()=>execute(false),180000);

it('retains the original before frame across a second model-owned investigation',()=>execute(true,true),180000);
