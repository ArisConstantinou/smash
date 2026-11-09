import test from 'node:test';import assert from 'node:assert/strict';import {ArmoryEffects} from '../armory-effects.js';
function fixture(){const targets=Array.from({length:4},(_,i)=>({x:i+1,z:0,y:0,hp:100})),visual=[],hits=[];let wall=false;const fx=new ArmoryEffects({targets:()=>targets,blocked:()=>wall,damage:(e,n,p,core)=>{e.hp-=n;hits.push({e,n,core});},visual:(...v)=>visual.push(v)});return{fx,targets,visual,hits,wall:v=>wall=v};}
test('ring trades lower raw impact for one additional real LOS arc contact',()=>{const f=fixture(),p={core:'arc',coreRank:1};f.fx.hit(f.targets[0],p,100);assert.equal(f.hits.length,1);f.hits.length=0;f.fx.hit(f.targets[0],{...p,arcBonusTargets:1,coreEfficiency:1.15},100);assert.equal(f.hits.length,2);assert.ok(f.hits[0].n>20);f.wall(true);f.hits.length=0;f.fx.hit(f.targets[0],p,100);assert.equal(f.hits.length,0);});
test('burn damages six times, refreshes instead of stacking and releases dead targets',()=>{const f=fixture(),t=f.targets[0];f.fx.hit(t,{core:'fire',coreRank:2},100);f.fx.update(.3);f.fx.hit(t,{core:'fire',coreRank:2},100);f.fx.update(.11);assert.equal(f.hits.length,1,'Repeated hits must not postpone the next burn tick');f.hits.length=0;f.fx.clear();for(let i=0;i<30;i++)f.fx.hit(t,{core:'fire',coreRank:2},100);assert.equal(f.fx.burning.size,1);for(let i=0;i<6;i++)f.fx.update(.4);assert.equal(f.hits.length,6);assert.equal(f.fx.burning.size,0);f.fx.hit(t,{core:'fire'},100);t.dead=true;f.fx.update(.4);assert.equal(f.fx.burning.size,0);assert.equal(f.hits.length,6);});
test('frost and impact change actual control state; effect ownership is bounded and resets',()=>{const f=fixture(),t=f.targets[0];f.fx.hit(t,{core:'frost',coreRank:4},100);assert.ok(t.slowTime>2&&t.slowFactor<.6);f.fx.hit(t,{core:'impact',coreRank:3},100);assert.ok(t.stagger>.3);for(let i=0;i<100;i++)f.fx.hit({x:i,z:0},{core:'fire'},100);assert.equal(f.fx.burning.size,64);f.fx.clear();assert.equal(f.fx.burning.size,0);});

test('siege wave respects cover, selects a maximum of five secondary targets and cannot fire before cooldown',()=>{
 const origin={x:0,y:.75,z:0},targets=Array.from({length:8},(_,i)=>({x:(i+1)*.3,z:0})),wall={x:1.1,z:1,w:.4,d:.4,h:2},hits=[];
 const fx=new ArmoryEffects({targets:()=>targets,scenery:()=>[wall],blocked:(_a,_b,t)=>t===targets[1],damage:(t,n)=>hits.push([t,n]),visual:()=>{}});
 const primary=targets[0],p={core:'none',signature:'siegeWave'};
 fx.hit(primary,p,100,origin);
 assert.equal(hits.length,5);assert.ok(hits.some(([t])=>t===wall));assert.ok(hits.every(([t])=>t!==primary&&t!==targets[1]));
 fx.hit(primary,p,100,origin);assert.equal(hits.length,5);
 fx.update(2.6);fx.hit(primary,p,100,origin);assert.equal(hits.length,10);
});

test('the Marshal mark expires and healing cannot stack on one kill or bypass its cooldown',()=>{
 let heals=0;const fx=new ArmoryEffects({targets:()=>[],blocked:()=>false,damage:()=>{},visual:()=>{},heal:()=>{heals++;return true;}});
 const p={core:'none',signature:'marshalBrand'},a={x:0,z:0},b={x:1,z:0},c={x:2,z:0};
 fx.hit(a,p,10);fx.update(4.01);fx.defeat(a);assert.equal(heals,0);
 fx.hit(b,p,10);fx.defeat(b);b.dead=true;fx.hit(b,p,10);assert.equal(heals,1);
 fx.hit(c,p,10);fx.defeat(c);assert.equal(heals,1);
 fx.update(2.8);fx.hit({x:4,z:0,dead:true},p,10);assert.equal(heals,2);
});
