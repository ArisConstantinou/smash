import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {throwIndicatorLayout,createThrowIndicator} from '../throw-indicator.js';
import {createSwingSequence,selectHammerSwing,tickSwingSequence,resetSwingSequence,HAMMER_COMBOS} from '../hammer-motion.js';

test('horizontal openers are deterministic after an idle reset, and sustained chains keep all six variations',()=>{
  for(const twoHanded of [false,true])for(const random of [()=>0,()=>.99,()=>.5]){
    const pool=twoHanded?HAMMER_COMBOS.twoHanded:HAMMER_COMBOS.oneHanded;
    const state=createSwingSequence();
    for(let chain=0;chain<4;chain++){
      const moves=[];
      for(let n=0;n<6;n++){
        moves.push(selectHammerSwing(state,{twoHanded,random}));
        tickSwingSequence(state,2,true);tickSwingSequence(state,.1);
      }
      assert.equal(moves[0],pool[0]);assert.deepEqual(new Set(moves),new Set(pool));
      tickSwingSequence(state,.75);assert.equal(state.count,0);
    }
    selectHammerSwing(state,{twoHanded});resetSwingSequence(state);
    assert.equal(selectHammerSwing(state,{twoHanded}),pool[0]);
  }
});

test('ground arrow follows a normalized manual direction and begins outside the swing envelope',()=>{
  for(const direction of [{x:0,z:1},{x:1,z:0},{x:-1,z:-1}]){
    const p={x:4,y:3,z:7},a=throwIndicatorLayout({origin:p,direction,meleeRange:3.4,throwRange:17});
    assert.ok(Math.hypot(a.x-p.x,a.z-p.z)>3.4);assert.ok(a.width>1);assert.ok(a.length>=3);
    assert.ok(Math.abs(a.dx*a.dx+a.dz*a.dz-1)<1e-6);
    assert.equal(a.y,3);
  }
  assert.equal(throwIndicatorLayout({origin:{x:0,z:0},direction:{x:0,z:0}}),null);
});

test('picture geometry follows supporting roof heights and cuts rather than stretching over ledges',()=>{
  const image={complete:true,naturalWidth:256,addEventListener(){},removeEventListener(){}};
  const view=createThrowIndicator(THREE,image);
  const params={active:true,origin:{x:0,y:4,z:0},direction:{x:0,z:1},meleeRange:2,throwRange:10,heightAt:()=>4};
  view.update(params);
  assert.equal(view.mesh.userData.textureReady,true);assert.equal(view.mesh.visible,true);
  const attr=view.mesh.geometry.attributes.position;
  for(let i=0;i<attr.count;i++)assert.ok(Math.abs(attr.getY(i)-.075)<1e-5);
  const full=view.mesh.geometry.index.count;
  view.update({...params,time:1,heightAt:(_,z)=>z<4?4:0});
  assert.ok(view.mesh.geometry.index.count<full,'Roof edge must not draw a vertical stretched arrow');
  view.update({active:false});assert.equal(view.mesh.visible,false);
  const root=new THREE.Scene();root.add(view.mesh);view.dispose();assert.equal(root.children.length,0);
});
