import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { makeCityEnemy, CITY_ENEMY_TYPES, installEnemyHead } from '../enemy-models.js';
import { makeEnemy, makeBoss } from '../models.js';
import { enemyStatsForWave } from '../waves.js';

const meshes=root=>{const list=[];root.traverse(n=>{if(n.isMesh)list.push(n);});return list;};
const descendants=root=>{const nodes=new Set();root.traverse(n=>nodes.add(n));return nodes;};

test('new horde silhouettes match their hit heights and expose real articulated body parts',()=>{
  const shapes=new Set();
  for(const type of CITY_ENEMY_TYPES){
    const model=makeCityEnemy(type),u=model.userData,nodes=descendants(model),bounds=new THREE.Box3().setFromObject(model);
    assert.ok(Math.abs(bounds.max.y-enemyStatsForWave(type,1).height)<1e-5,`${type} health/hit height disagrees with its model`);
    assert.ok(bounds.min.y>=-.001);
    for(const key of ['body','head','leftLeg','rightLeg','leftArm','rightArm']){
      assert.ok(nodes.has(u[key]),`${type} is missing its ${key} joint`);
      assert.ok(meshes(u[key]).length>0,`${type} has an empty ${key} joint`);
    }
    assert.ok(meshes(model).length<=12,'Articulating a head must keep a horde affordable to render');
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

test('legacy enemies gain an articulated head without losing triangles or changing their resting silhouette',()=>{
  for(const type of ['zombie','robot','brute','boss']){
    const model=type==='boss'?makeBoss():makeEnemy(type);
    const before=new THREE.Box3().setFromObject(model);
    const count=meshes(model).reduce((sum,mesh)=>sum+mesh.geometry.attributes.position.count,0);
    const head=installEnemyHead(model,type);
    const after=new THREE.Box3().setFromObject(model);
    assert.ok(head&&meshes(head).length,`${type} needs a real head, not an empty pivot`);
    assert.equal(head.parent,model.userData.body);
    assert.equal(meshes(model).reduce((sum,mesh)=>sum+mesh.geometry.attributes.position.count,0),count);
    assert.ok(before.min.distanceTo(after.min)<1e-6&&before.max.distanceTo(after.max)<1e-6);
    assert.equal(installEnemyHead(model,type),head,'Installing twice must not split the head again');
    const torso=meshes(model.userData.body).filter(mesh=>mesh.parent!==head);
    const positions=torso.map(mesh=>mesh.getWorldPosition(new THREE.Vector3()));
    head.rotation.x=-.8;model.updateMatrixWorld(true);
    torso.forEach((mesh,i)=>assert.ok(mesh.getWorldPosition(new THREE.Vector3()).distanceTo(positions[i])<1e-8));
  }
});

test('each city enemy can look upward without moving another actor or its torso geometry',()=>{
  for(const type of CITY_ENEMY_TYPES){
    const first=makeCityEnemy(type),second=makeCityEnemy(type),a=first.userData.head,b=second.userData.head;
    assert.ok(a&&b);assert.notEqual(a,b);
    const before=new THREE.Box3().setFromObject(a),torso=meshes(first.userData.body).filter(mesh=>mesh.parent!==a);
    const arrays=torso.map(mesh=>new Float32Array(mesh.geometry.attributes.position.array));
    a.rotation.x=-.65;first.updateMatrixWorld(true);
    const after=new THREE.Box3().setFromObject(a);
    assert.ok(before.min.distanceTo(after.min)+before.max.distanceTo(after.max)>.025);
    assert.ok(Math.abs(b.rotation.x)<1e-10);
    torso.forEach((mesh,i)=>assert.deepEqual(mesh.geometry.attributes.position.array,arrays[i]));
  }
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
