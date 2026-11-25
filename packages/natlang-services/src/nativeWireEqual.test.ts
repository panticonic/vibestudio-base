import {it,expect} from "vitest";
import {runInNewContext} from "node:vm";
import {nativeWireEqual} from "./nativeWireEqual.js";
it("compares native JSON fields exactly across key order and realms",()=>{
 const native={revision:2,checkpoints:[{revision:1,assessment:{role:"release",decision:"ready",reason:"Native readback",evidenceIds:["one","two"]}}]};
 const other=runInNewContext('('+JSON.stringify(native)+')');
 expect(Object.getPrototypeOf(other)).not.toBe(Object.getPrototypeOf(native));
 expect(nativeWireEqual(native,other)).toBe(true);
 expect(nativeWireEqual({left:1,right:2},{right:2,left:1})).toBe(true);
 expect(nativeWireEqual(Object.assign(Object.create(null),{value:1}),{value:1})).toBe(true);
});
it.each([
 ["missing",{a:1,b:2},{a:1}], ["extra",{a:1},{a:1,b:2}], ["ordered-array",[1,2],[2,1]],
 ["hole",Array(1),[undefined]], ["undefined",{a:undefined},{a:undefined}], ["nan",NaN,NaN],
 ["infinite",Infinity,Infinity], ["negative-zero",-0,0], ["class",new Date(0),new Date(0)],
 ["symbol",{[Symbol.for("owned")]:1},{}], ["nonenumerable",Object.defineProperty({},"a",{value:1}),{}],
])("rejects non-JSON or unequal %s",(_name,a,b)=>{expect(nativeWireEqual(a,b)).toBe(false);});
it("refuses accessors and cycles without invoking user code",()=>{
 let reads=0;const getter=Object.defineProperty({},"value",{enumerable:true,get(){reads++;throw Error("must not read");}});
 expect(nativeWireEqual(getter,getter)).toBe(false);expect(reads).toBe(0);
 const cycle:{self?:unknown}={};cycle.self=cycle;expect(nativeWireEqual(cycle,cycle)).toBe(false);
 const alias={value:"retained"};expect(nativeWireEqual([alias,alias],[{value:"retained"},{value:"retained"}])).toBe(true);
});

it("rejects array subclasses and compares cross-realm arrays as native JSON",()=>{
 class Other extends Array<number>{}
 expect(nativeWireEqual(new Other(1,2),[1,2])).toBe(false);
 expect(nativeWireEqual([1,2],runInNewContext("[1,2]"))).toBe(true);
});
