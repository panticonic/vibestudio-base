import {expect,it} from 'vitest';
import scene from './careForGrimoireScene/finishSceneHandoff.js';
import adoption from './reviewExamplesAdoption/finishAdoptionHandoff.js';
import scaffold from './prepareOwnedScaffold/finishScaffoldDraft.js';
import candidate from './triageSystemTemplate/finishCandidateHandoff.js';
import method from './reconcileOwnedMethodCall/finishMethodExchange.js';
import skill from './maintainWorkspaceSkill/finishSkillMaintenance.js';

it('returns native application handles themselves, without reconstructing their opaque identity',()=>{
 const receipt=Object.freeze({path:'/.tmp/owned/result',digest:'actual-native-digest',event:'current',status:'staged',previewDigest:null,frontier:'current',commandId:'command',draft:'draft',publication:'unchanged',runtime:'unchanged',units:[],coordinate:'coordinate',before:'before',after:'after',disposition:'staged',paths:['SKILL.md']});
 const plan={action:'stage-note',disposition:'record-private',decision:'review-incoming',finding:'Exact current evidence',proof:['internal'],proposedIds:['anchor'],description:null,record:true,kinds:['skill']};
 for(const finish of [scene,adoption,scaffold,candidate,skill])expect((finish as Function)(plan,receipt)).toBe(receipt);
 const terminal=Object.freeze({channel:'channel',transport:'transport',invocation:'invocation',method:'inspect-counts',outcome:'error',detail:'Actual native refusal',executed:1,start:0,terminal:1});
 expect(method({action:'request',method:'inspect-counts',finding:'Read the result'},terminal)).toBe(terminal);
});
it('keeps a disposition when no application artifact exists, rather than copying working evidence',()=>{
 const internal={action:'hold-authority' as const,disposition:'hold-authority' as const,decision:'hold-stale' as const,finding:'A newer owner must authorize this action',proof:['opaque-native-witness'],proposedIds:['internal'],description:null,record:false,kinds:[]};
 expect(scene(internal,null)).toEqual({action:internal.action,finding:internal.finding});
 expect(adoption(internal,null)).toEqual({disposition:internal.disposition,finding:internal.finding});
 expect(scaffold(internal,null)).toEqual({disposition:internal.disposition,finding:internal.finding});
 expect(candidate(internal,null)).toEqual({decision:internal.decision,finding:internal.finding});
 expect(method({action:'hold-authority',method:'inspect-counts',finding:internal.finding},null)).toEqual({action:'hold-authority',finding:internal.finding});
 const decision=Object.freeze({action:'hold-authorization' as const,reason:internal.finding});expect(skill(decision,null)).toBe(decision);
});
