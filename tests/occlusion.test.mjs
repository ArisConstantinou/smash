import test from 'node:test';
import * as THREE from '../vendor/three.module.js';
import assert from 'node:assert/strict';
import {occludesBattlePoint,findBattleOccluders,applyOccluderFade,OcclusionDepth} from '../occlusion.js';

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


test('a weapon inside the struck building cannot hide that building',()=>{
  for(const point of [{x:5,y:1,z:7},{x:5,y:2,z:4.01},{x:5,y:2,z:4}]){
    assert.equal(occludesBattlePoint(tower,point,view),false);
  }
  assert.equal(occludesBattlePoint(tower,{x:0,y:1,z:0},view),true);
});

test('nearby buildings outside actual actor rays stay fully opaque',()=>{
  const player={x:0,y:1,z:0};const rear={x:0,z:-4,w:6,d:6,h:8};
  const blocked=findBattleOccluders([rear,tower],[player],view);
  assert.equal(blocked.has(rear),false);assert.equal(blocked.has(tower),true);
});


test('empty space inside an oversized building bounding box must not fade its actual facade',()=>{
  const mesh=new THREE.Group();
  const facade=new THREE.Mesh(new THREE.BoxGeometry(2,12,2),new THREE.MeshBasicMaterial());
  facade.position.set(-5,6,0);mesh.add(facade);mesh.position.set(5,0,7);
  const building={...tower,w:12,d:12,mesh};
  const point={x:0,y:1,z:0};
  assert.equal(occludesBattlePoint({...building,mesh:undefined},point,view),true,'The conservative box alone is a false positive');
  assert.equal(occludesBattlePoint(building,point,view),false,'The actual wall misses the body ray');
  facade.position.set(0,6,0);
  assert.equal(occludesBattlePoint(building,point,view),true,'Moving the real wall into the ray must reveal the player');
  const material=facade.material;building.materials=[material];
  for(let i=0;i<40;i++)applyOccluderFade(building,true,.016);
  assert.equal(occludesBattlePoint(building,point,view),true,'A faded occluder must not flicker on/off by testing its temporary opacity');
  facade.visible=false;
  assert.equal(occludesBattlePoint(building,point,view),false,'Invisible child meshes cannot justify fading');
  facade.geometry.dispose();material.dispose();
});

test('a cleared view restores a building promptly rather than leaving a ghost behind',()=>{
  const material={opacity:1,transparent:false,depthWrite:true,userData:{}},o={materials:[material]};
  applyOccluderFade(o,true,1);
  for(let i=0;i<24;i++)applyOccluderFade(o,false,1/60);
  assert.equal(o.occlusionFade,0);assert.equal(material.opacity,1);assert.equal(material.depthWrite,true);
});


test('occluder depth uses shared live geometry without adding duplicate building parts and restores draw order',()=>{
 const scene=new THREE.Scene(),group=new THREE.Group();scene.add(group);
 const geometry=new THREE.BoxGeometry(4,8,4),material=new THREE.MeshBasicMaterial(),source=new THREE.Mesh(geometry,material);source.renderOrder=7;group.add(source);
 const object={mesh:group,occlusionFade:1},depth=new OcclusionDepth(scene);depth.sync([object]);
 const record=depth.records.get(source);assert.equal(group.children.length,1);assert.equal(record.proxy.geometry,geometry);
 assert.equal(depth.material.colorWrite,false);assert.equal(depth.material.depthWrite,true);assert.ok(record.proxy.renderOrder<source.renderOrder);assert.ok(record.proxy.renderOrder>45);
 assert.equal(depth.activeCount,1);const fractured=new THREE.BoxGeometry(3,5,4);source.geometry=fractured;source.position.x=2;depth.sync([object]);
 assert.equal(record.proxy.geometry,fractured);assert.equal(record.proxy.matrix.elements[12],2);
 object.occlusionFade=0;depth.sync([object]);assert.equal(source.renderOrder,7);assert.equal(record.proxy.visible,false);
 let disposed=0;fractured.addEventListener('dispose',()=>disposed++);depth.dispose();assert.equal(disposed,0,'Shared fracture geometry remains owned by the building');assert.equal(scene.children.length,1);geometry.dispose();fractured.dispose();material.dispose();
});
test('hidden and destroyed building surfaces cannot leave occluder depth ghosts',()=>{
 const scene=new THREE.Scene(),mesh=new THREE.Mesh(new THREE.BoxGeometry(2,2,2),new THREE.MeshBasicMaterial());scene.add(mesh);
 const object={mesh,occlusionFade:1},depth=new OcclusionDepth(scene);depth.sync([object]);assert.equal(depth.activeCount,1);
 mesh.visible=false;depth.sync([object]);assert.equal(depth.activeCount,0);
 mesh.visible=true;object.dead=true;depth.sync([object]);assert.equal(depth.activeCount,0);depth.reset();assert.equal(depth.records.size,0);depth.dispose();mesh.geometry.dispose();mesh.material.dispose();
});
