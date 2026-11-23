import {expect,it} from 'vitest';
import {bindDisposition,dispositionEvidence} from './bindDisposition.js';
const evidence={title:'A grounded project',audience:'Operators',documentRoles:['Instructions'],occupied:false,repoPath:'projects/owned',revision:'current',records:[{id:'opaque-source',path:'source.json',fileId:'file',digest:'opaque-digest',edition:'current' as const,purpose:'requirements' as const,localApproval:null,facts:[{id:'opaque-fact',text:'Close the valve before moving the case.'}]}]};
it('binds semantic fact choices to exact native identities without asking NL to copy opaque IDs',()=>{
 const offered=dispositionEvidence(evidence);expect(offered.records[0]?.facts).toEqual([{handle:0,text:evidence.records[0]!.facts[0]!.text}]);
 expect(offered).not.toHaveProperty('revision');expect(offered.records[0]).not.toHaveProperty('digest');
 const decision=bindDisposition(evidence,{action:'commit',basis:'authorized',selected:[0,0],reason:'The condition is applicable.'});
 expect(decision.selected).toEqual([{source:'opaque-source',digest:'opaque-digest',fact:'opaque-fact'}]);
 expect(()=>bindDisposition(evidence,{...decision,selected:[1]})).toThrow(/fact handle/);
});
