import openTerminal from "./workOnTerminalGoal/terminal/openTerminal.js";
import applyChecklistChange from "./workOnTerminalGoal/terminal/applyChecklistChange.js";
import advanceTerminal from "./workOnTerminalGoal/terminal/advanceTerminal.js";
import discoverTerminalOptions from "./workOnTerminalGoal/terminal/discoverTerminalOptions.nl";
import stageTerminalHandoff from "./workOnTerminalGoal/terminal/stageTerminalHandoff.js";
import runTerminalChecks from "./workOnTerminalGoal/checks/runTerminalChecks.nl";
import chooseTerminalAction from "./workOnTerminalGoal/chooseTerminalAction.nl";
import reviewTransition from "./workOnTerminalGoal/reviewTransition.nl";
import composeTerminalOutcome from "./workOnTerminalGoal/composeTerminalOutcome.nl";
import applicationResult from "./workOnTerminalGoal/applicationResult.js";
import type {TerminalProgress,TerminalResult} from "./workOnTerminalGoal/types.js";
export default async function workOnTerminalGoal(goal:string):Promise<TerminalResult>{
 const opening=await openTerminal();
 const progress:TerminalProgress={events:[],checkReport:null,discovery:null,handoff:null,refused:false};
 let checked=false,discovered=false,staged=false;
 for(let turn=0;turn<12;turn++){
  const action=await chooseTerminalAction(goal,opening,progress);
  if(action.kind==="finish")break;
  if(action.kind==="change"||action.kind==="transition"){
   const event=action.kind==="change"?await applyChecklistChange(action.change):await advanceTerminal(action.transition);
   if(!event){progress.refused=true;continue;}
   progress.events.push(event);
   if(["reattach","restart","resume"].includes(event.operation)&&!await reviewTransition(goal,event)){progress.refused=true;break;}
  }else if(action.kind==="check"){
   if(checked||!opening.checkOperationId){progress.refused=true;break;}
   checked=true;progress.checkReport=await runTerminalChecks({goal,operationId:opening.checkOperationId});
  }else if(action.kind==="discover"){
   if(discovered){progress.refused=true;break;}
   discovered=true;progress.discovery=await discoverTerminalOptions(goal,opening.screen);
  }else if(action.kind==="stage"){
   if(staged){progress.refused=true;break;}
   staged=true;progress.handoff=await stageTerminalHandoff();if(!progress.handoff)progress.refused=true;
  }
 }
 const summary=await composeTerminalOutcome(goal,opening,progress);
 return applicationResult(opening.screen,progress.events,progress.checkReport,progress.discovery,progress.handoff,summary);
}
