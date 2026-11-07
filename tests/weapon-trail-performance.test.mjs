// Exercise the production ribbon functions with real Three.js objects. Count
// resource creation rather than timing a shared CI CPU or claiming GPU FPS.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import * as THREE from '../vendor/three.module.js';

const source=await readFile(new URL('../game.js',import.meta.url),'utf8');
function productionSection(start,end){
  const first=source.indexOf(start),last=source.indexOf(end,first+start.length);
  assert.ok(first>=0&&last>first,'The actual production section must be available: '+start);
  return source.slice(first,last);
}
const poolDeclarations=source.match(/^const freeWeaponTrails=[^\n]+/m)?.[0];
assert.ok(poolDeclarations,'Load the real pool declarations, not a test implementation');
const effectFunctions=productionSection('function pulse(','function createHammerAura(');
const updateFunction=productionSection('function updateEffects(','let currentDistrict=');

function harness(){
  const allocations={geometry:0,material:0,attribute:0,floatBuffer:0,mesh:0};
  const disposals={geometry:0,material:0};
  function countConstructor(Constructor,name,disposeKind){
    return new Proxy(Constructor,{construct(target,args){
      allocations[name]++;
      const value=Reflect.construct(target,args);
      if(disposeKind)value.addEventListener('dispose',()=>{disposals[disposeKind]++;});
      return value;
    }});
  }
  const tracked={...THREE,
    BufferGeometry:countConstructor(THREE.BufferGeometry,'geometry','geometry'),
    MeshBasicMaterial:countConstructor(THREE.MeshBasicMaterial,'material','material'),
    BufferAttribute:countConstructor(THREE.BufferAttribute,'attribute'),
    Mesh:countConstructor(THREE.Mesh,'mesh')};
  const scene=new THREE.Scene(),camera={position:new THREE.Vector3(13,23,18)};
  const context=vm.createContext({THREE:tracked,scene,camera,
    settings:{quality:'high'},characterStats:{weaponTier:2},color:{gold:0xffc26d},
    Float32Array:countConstructor(Float32Array,'floatBuffer'),
    impactClouds:null,fragments:{update(){}},$:()=>({hidden:false})});
  new vm.Script(`
    let arcs=[],rings=[],hpEchoes=[],numbers=[],announcementTimer=0;
    ${poolDeclarations}
    ${effectFunctions}
    ${updateFunction}
    globalThis.result={weaponTrail,removeEffect,updateEffects,pulse,makeTelegraph,
      arcs,rings,scene,camera,settings,freeWeaponTrails};
  `,{filename:'production-weapon-trails.js'}).runInContext(context);
  return {...context.result,allocations,disposals};
}
function burst(h,count,start=0){
  const a=new THREE.Vector3(),b=new THREE.Vector3();
  for(let i=0;i<count;i++){
    const x=start+i*.03;
    a.set(x,1,0);b.set(x+.4,1.3,.6);
    h.weaponTrail(a,b,.17,i%2?0x8ce4d8:0xffc473,i%3===0);
  }
}
const visible=scene=>scene.children.filter(mesh=>mesh.visible).length;

test('ten thousand real ribbons plateau at 48 reusable Three.js resource sets with no new buffers after warmup',t=>{
  const h=harness();burst(h,48);
  const warm={...h.allocations};
  assert.deepEqual(warm,{geometry:48,material:48,attribute:48,floatBuffer:48,mesh:48});
  const buffers=new Set(h.arcs.map(trail=>trail.mesh.geometry.attributes.position.array.buffer));
  burst(h,9952,1000);
  assert.deepEqual(h.allocations,warm,'A continuing attack must reuse its warmed geometry, materials and ribbon buffers');
  assert.deepEqual(h.disposals,{geometry:0,material:0},'Sustained attacks must not dispose and rebuild ribbon resources');
  assert.equal(h.arcs.length,48);assert.equal(h.scene.children.length,48);assert.equal(visible(h.scene),48);
  for(const trail of h.arcs)assert.ok(buffers.has(trail.mesh.geometry.attributes.position.array.buffer));
  h.updateEffects(.2);
  assert.equal(h.arcs.length,0);assert.equal(visible(h.scene),0);
  burst(h,1000,2000);
  assert.deepEqual(h.allocations,warm,'Natural expiry must recycle the same resources');
  t.diagnostic('10,000 ribbon emissions: 48 geometries, 48 materials, 48 attributes, 48 fixed position buffers, 48 meshes; zero additional resource allocations after the first 48.');
});

test('quality changes bound visible ribbons to 24 or 48 while retaining one bounded pool',()=>{
  const h=harness();burst(h,100);
  const warm={...h.allocations};
  h.settings.quality='low';burst(h,1000);
  assert.equal(h.arcs.length,24);assert.equal(visible(h.scene),24);
  assert.equal(h.scene.children.length,48,'Inactive reusable ribbons remain bounded');
  h.settings.quality='high';burst(h,1000);
  assert.equal(h.arcs.length,48);assert.equal(visible(h.scene),48);
  assert.deepEqual(h.allocations,warm,'Changing quality cannot create a second pool');
});

test('pooled ribbons retain lifetime, blending and shape after reuse at distant world positions',()=>{
  const h=harness(),a=new THREE.Vector3(0,1,0),b=new THREE.Vector3(0,4,0);
  h.camera.position.set(0,8,0); // Collinear view exercises the nonzero-width fallback.
  h.weaponTrail(a,b,.25,0x6a4421,true);
  const first=h.arcs[0],mesh=first.mesh,attribute=mesh.geometry.attributes.position,array=attribute.array;
  assert.equal(first.life,.13);assert.equal(first.max,.13);assert.equal(first.opacity,.28);
  assert.equal(mesh.material.blending,THREE.NormalBlending);
  const p0=new THREE.Vector3().fromBufferAttribute(attribute,0);
  const p1=new THREE.Vector3().fromBufferAttribute(attribute,1);
  const p2=new THREE.Vector3().fromBufferAttribute(attribute,2);
  assert.ok(p1.clone().sub(p0).cross(p2.clone().sub(p0)).length()>0,'Vertical strokes must have visible ribbon area');
  assert.ok(Math.abs(p0.distanceTo(p1)-.5)<1e-6);
  mesh.geometry.computeBoundingSphere(); // Simulate an earlier renderer's cached world-space bound.
  h.updateEffects(.065);assert.ok(Math.abs(mesh.material.opacity-.14)<1e-9);
  h.updateEffects(.08);assert.equal(mesh.visible,false);assert.equal(h.arcs.length,0);
  h.removeEffect(mesh);h.removeEffect(mesh);
  assert.equal(h.freeWeaponTrails.length,1,'Repeated cleanup cannot insert the same mesh twice');
  const version=attribute.version;
  a.set(1200,3,-900);b.set(1201,3.3,-899);
  h.weaponTrail(a,b,.12,0x8ce4d8,false);
  const reused=h.arcs[0];assert.equal(reused.mesh,mesh);
  assert.equal(mesh.geometry.attributes.position.array,array);
  assert.ok(attribute.version>version,'Reused coordinates must be uploaded');
  assert.equal(mesh.frustumCulled,false,'An old bounding sphere must not hide a ribbon after the player moves');
  assert.equal(mesh.material.color.getHex(),0x8ce4d8);assert.equal(mesh.material.blending,THREE.AdditiveBlending);
  assert.equal(reused.life,.16);assert.equal(reused.max,.16);assert.equal(mesh.material.opacity,.7);
  const start=new THREE.Vector3().fromBufferAttribute(attribute,0).add(new THREE.Vector3().fromBufferAttribute(attribute,1)).multiplyScalar(.5);
  const end=new THREE.Vector3().fromBufferAttribute(attribute,4).add(new THREE.Vector3().fromBufferAttribute(attribute,5)).multiplyScalar(.5);
  assert.ok(start.distanceTo(a)<1e-3&&end.distanceTo(b)<1e-3,'The recycled mesh must draw the new stroke, not the previous one');
  const count=h.arcs.length;h.weaponTrail(a,a);assert.equal(h.arcs.length,count,'A zero-length contact must not consume a ribbon');
});

test('mixed quake lines and telegraph rings still dispose while ribbon reset and expiry recycle safely',()=>{
  const h=harness();burst(h,48);
  const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0,0,0),new THREE.Vector3(1,0,1)]),new THREE.LineBasicMaterial({color:0xffd38f}));
  let lineGeometry=0,lineMaterial=0,ringGeometry=0,ringMaterial=0;
  line.geometry.addEventListener('dispose',()=>lineGeometry++);
  line.material.addEventListener('dispose',()=>lineMaterial++);
  h.scene.add(line);h.arcs.push({mesh:line,life:.06,max:.06});
  const ring=h.makeTelegraph(0,0,2);
  ring.geometry.addEventListener('dispose',()=>ringGeometry++);
  ring.material.addEventListener('dispose',()=>ringMaterial++);
  h.removeEffect(ring);
  burst(h,3);
  assert.equal(h.arcs.length,48);assert.ok(h.arcs.some(effect=>effect.mesh===line),'Non-ribbon effects can share the active effect list');
  h.updateEffects(.2);
  assert.equal(lineGeometry,1);assert.equal(lineMaterial,1);assert.equal(ringGeometry,1);assert.equal(ringMaterial,1);
  assert.equal(line.parent,null);assert.equal(ring.parent,null);
  assert.equal(h.arcs.length,0);assert.equal(h.freeWeaponTrails.length,48);
  assert.equal(h.scene.children.length,48);assert.equal(visible(h.scene),0);
  const allocated={...h.allocations};
  for(let round=0;round<10;round++){
    burst(h,35,round*100);
    // resetWorld's existing cleanup calls this same production release hook
    // for each active effect; already-free records must remain single-owned.
    for(const effect of [...h.arcs])h.removeEffect(effect.mesh);
    h.arcs.length=0;
  }
  assert.deepEqual(h.allocations,allocated);assert.equal(h.freeWeaponTrails.length,48);
  assert.equal(h.disposals.geometry,0,'Only explicitly created non-ribbon resources are disposed');
});
