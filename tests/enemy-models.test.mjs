import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { makeCityEnemy, CITY_ENEMY_TYPES } from '../enemy-models.js';
import { enemyStatsForWave } from '../waves.js';

const meshes=root=>{const list=[];root.traverse(n=>{if(n.isMesh)list.push(n);});return list;};
const descendants=root=>{const nodes=new Set();root.traverse(n=>nodes.add(n));return nodes;};

test('new horde silhouettes match their hit heights and expose real articulated body parts',()=>{
  const shapes=new Set();
  for(const type of CITY_ENEMY_TYPES){
    const model=makeCityEnemy(type),u=model.userData,nodes=descendants(model),bounds=new THREE.Box3().setFromObject(model);
    assert.ok(Math.abs(bounds.max.y-enemyStatsForWave(type,1).height)<1e-5,`${type} health/hit height disagrees with its model`);
    assert.ok(bounds.min.y>=-.001);
    for(const key of ['body','leftLeg','rightLeg','leftArm','rightArm']){
      assert.ok(nodes.has(u[key]),`${type} is missing its ${key} joint`);
      assert.ok(meshes(u[key]).length>0,`${type} has an empty ${key} joint`);
    }
    assert.ok(meshes(model).length<=10,'Keep a horde affordable to render');
    let vertices=0;
    for(const mesh of meshes(model)){
      vertices+=mesh.geometry.attributes.position.count;
      for(const attribute of Object.values(mesh.geometry.attributes))for(const value of attribute.array)assert.ok(Number.isFinite(value));
    }
    shapes.add([vertices,u.width.toFixed(3),u.depth.toFixed(3)].join(':'));
    if(u.miniBoss)assert.ok(u.height>4 && u.width>3);
  }
  assert.equal(shapes.size,CITY_ENEMY_TYPES.length,'The new species must have different geometry and silhouettes');
});

test('enemy geometry and animation references survive independent instance disposal',()=>{
  for(const type of CITY_ENEMY_TYPES){
    const first=makeCityEnemy(type),second=makeCityEnemy(type),a=meshes(first),b=meshes(second);
    assert.notEqual(first.userData.body,second.userData.body);
    for(let i=0;i<a.length;i++){
      assert.notEqual(a[i].geometry,b[i].geometry);
      assert.notEqual(a[i].geometry.attributes.position.array,b[i].geometry.attributes.position.array);
      assert.deepEqual(a[i].geometry.attributes.position.array,b[i].geometry.attributes.position.array);
    }
    const x=b[0].geometry.attributes.position.getX(0);
    a[0].geometry.attributes.position.setX(0,999);a[0].geometry.dispose();
    assert.equal(b[0].geometry.attributes.position.getX(0),x);
    assert.equal(meshes(makeCityEnemy(type))[0].geometry.attributes.position.getX(0),x);
  }
});

test('extra legs and weapons animate continuously without touching combat state or another actor',()=>{
  for(const type of ['crawler','mech','siegeMech']){
    const model=makeCityEnemy(type),other=makeCityEnemy(type);
    const muzzle=model.userData.muzzle;
    if(muzzle)assert.ok(descendants(model).has(muzzle));
    for(let i=0;i<50;i++){
      const enemy=Object.freeze({walk:i*.19,state:i<20?'walk':i<35?'windup':'shoot',stagger:0});
      model.userData.animate(enemy,.016,i*.016);
      model.updateMatrixWorld(true);
      for(const n of descendants(model))for(const value of n.matrixWorld.elements)assert.ok(Number.isFinite(value));
    }
    // Compare the actual rig transforms; userData holds object references and is
    // intentionally not serialised as part of an actor's replay/combat state.
    const untouched=makeCityEnemy(type);
    for(const n of descendants(other)){
      const peer=untouched.getObjectByName(n.name);
      if(n.name&&peer){assert.deepEqual(n.position.toArray(),peer.position.toArray());assert.deepEqual(n.quaternion.toArray(),peer.quaternion.toArray());}
    }
    if(type==='crawler')assert.equal(new Set(model.userData.legs.map(l=>l.rotation.x.toFixed(4))).size,6);
    if(type==='mech')assert.ok(model.userData.barrel.rotation.z>1);
  }
});
