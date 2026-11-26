import {expect,it,vi} from 'vitest';
const native=vi.hoisted(()=>({readWindow:vi.fn(),readUpdates:vi.fn()}));
vi.mock('natlang:services',()=>({desktopReadiness:native}));
import inspectWindow from './inspectDesktopEvidence/inspectDesktopWindow.js';
import inspectUpdates from './inspectDesktopEvidence/inspectDesktopUpdates.js';
it('forwards the exact scoped native observations without a sampled copy or changed authority',async()=>{
 const desk={id:'actual-owned',name:'Desk',operationId:'operation'};
 const window={deskId:desk.id,status:'restored',before:null,current:null,queuedFocus:null,pendingPlacementEdit:false};
 const updates={deskId:desk.id,runningBuild:'running',currentBuild:'running',before:[],current:[],notices:[],events:[],admissionPending:false,previousBuilds:[],portCalls:0};
 native.readWindow.mockResolvedValue(window);native.readUpdates.mockResolvedValue(updates);
 expect(await inspectWindow(desk)).toBe(window);expect(await inspectUpdates(desk)).toBe(updates);
 expect(native.readWindow).toHaveBeenCalledExactlyOnceWith(desk.id);expect(native.readUpdates).toHaveBeenCalledExactlyOnceWith(desk.id);
});
it('preserves an actual native refusal instead of manufacturing an observation',async()=>{
 const error=new Error('Scope refused');native.readWindow.mockRejectedValue(error);
 await expect(inspectWindow({id:'foreign',name:'Foreign',operationId:'unissued'})).rejects.toBe(error);
});
