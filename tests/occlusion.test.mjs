import test from 'node:test';
import assert from 'node:assert/strict';
import {occludesBattlePoint,findBattleOccluders,applyOccluderFade} from '../occlusion.js';

const view={x:13,y:23,z:18};
const tower={x:5,z:7,w:6,d:6,h:24,dead:false};
test('camera-parallel rays reveal tall foreground facades but leave rear buildings opaque',()=>{
  assert.equal(occludesBattlePoint(tower,{x:0,y:1,z:0},view),true);
  assert.equal(occludesBattlePoint({...tower,x:-10,z:-15},{x:0,y:1,z:0},view),false);
  assert.equal(occludesBattlePoint({...tower,h:1.5},{x:0,y:1,z:0},view),false);
  assert.equal(occludesBattlePoint(tower,{x:5,y:25,z:7},view),false,'Standing on the roof must not erase the supporting building');
});
test('a visible player does not leave nearby combat hidden behind a different building',()=>{
  const player={x:-8,y:1,z:0},enemy={x:0,y:1,z:0};
  assert.equal(occludesBattlePoint(tower,player,view),false);
  assert.equal(findBattleOccluders([tower],[player,enemy],view).has(tower),true);
  assert.equal(findBattleOccluders([{...tower,dead:true}],[enemy],view).size,0);
});
test('fades restore authored glass and opaque depth state, without swapping materials',()=>{
  const opaque={opacity:1,transparent:false,depthWrite:true,userData:{}},glass={opacity:.6,transparent:true,depthWrite:false,userData:{}};
  const object={materials:[opaque,glass]};
  for(let i=0;i<50;i++)applyOccluderFade(object,true,.016);
  assert.ok(opaque.opacity<.07);assert.equal(opaque.depthWrite,false);
  for(let i=0;i<100;i++)applyOccluderFade(object,false,.016);
  assert.equal(opaque.opacity,1);assert.equal(opaque.transparent,false);assert.equal(opaque.depthWrite,true);
  assert.equal(glass.opacity,.6);assert.equal(glass.transparent,true);assert.equal(glass.depthWrite,false);
});
