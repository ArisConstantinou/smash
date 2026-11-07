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

test('ground arrow joins the front-center of the arc and stays readable at every reach upgrade',()=>{
  for(const meleeRange of [2.75,3.4,6,12,24])for(const direction of [{x:0,z:1},{x:1,z:0},{x:-1,z:-1}]){
    const p={x:4,y:3,z:7},a=throwIndicatorLayout({origin:p,direction,meleeRange,throwRange:17});
    assert.ok(a.start<meleeRange&&a.start+a.length>meleeRange,'The filled arrow must straddle the arc, not float beyond it');
    assert.ok(a.width>=1.25&&a.width<=1.55);assert.ok(a.length>=2.1&&a.length<=3.1);
    // The arc crosses the opaque lower shaft of the SVG, not transparent
    // padding or the arrowhead. This is the actual join in world space.
    assert.ok(a.arcOffset>.1&&a.arcOffset<.3);
    assert.ok(Math.abs(a.x+a.dx*a.length*a.arcOffset-(p.x+a.dx*meleeRange))<1e-6);
    assert.ok(Math.abs(a.z+a.dz*a.length*a.arcOffset-(p.z+a.dz*meleeRange))<1e-6);
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
  const full=view.mesh.geometry.drawRange.count,index=view.mesh.geometry.index;
  const ledge=view.mesh.position.z+view.mesh.userData.layout.length*.53;
  view.update({...params,time:1,heightAt:(_,z)=>z<ledge?4:0});
  assert.ok(view.mesh.geometry.drawRange.count<full,'Roof edge must not draw a vertical stretched arrow');
  assert.equal(view.mesh.geometry.index,index,'Terrain updates reuse the same GPU index buffer');
  view.update({active:false});assert.equal(view.mesh.visible,false);
  const root=new THREE.Scene();root.add(view.mesh);view.dispose();assert.equal(root.children.length,0);
});
