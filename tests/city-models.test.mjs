import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { makeCityBuilding, makeCityVehicle, CITY_BUILDING_KINDS } from '../city-models.js';

const meshes = root => { const result=[]; root.traverse(node=>{if(node.isMesh)result.push(node);}); return result; };

test('all building variants fit their lot and report actual, centred collision bounds', () => {
  for (const kind of CITY_BUILDING_KINDS) for (let variant=0;variant<4;variant++) {
    const model=makeCityBuilding(kind,variant), bounds=new THREE.Box3().setFromObject(model);
    const size=bounds.getSize(new THREE.Vector3()), center=bounds.getCenter(new THREE.Vector3());
    assert.ok(size.x<=14 && size.z<=14, `${kind} extends into the street`);
    assert.ok(Math.abs(center.x)<1e-5 && Math.abs(center.z)<1e-5, `${kind} collision is offset`);
    assert.ok(Math.abs(size.x-model.userData.width)<1e-5 && Math.abs(size.z-model.userData.depth)<1e-5);
    assert.ok(Math.abs(bounds.max.y-model.userData.height)<1e-5);
    assert.ok(bounds.min.y>=-1e-5 && bounds.max.y>6);
    assert.equal(model.userData.isBuilding,true);
    assert.equal(model.userData.buildingKind,kind);
    assert.ok(meshes(model).length<=4, 'Architectural detail must remain batched for the 100-building city');
    for(const mesh of meshes(model)) {
      for(const attribute of Object.values(mesh.geometry.attributes)) for(const value of attribute.array) assert.ok(Number.isFinite(value));
      assert.ok(mesh.geometry.attributes.position.count>0);
    }
  }
});

test('cached buildings return independently owned geometry and animation nodes', () => {
  const a=makeCityBuilding('construction',1), b=makeCityBuilding('construction',5);
  const first=meshes(a),second=meshes(b);
  assert.equal(first.length,second.length);
  for(let i=0;i<first.length;i++) {
    assert.notEqual(first[i].geometry,second[i].geometry);
    assert.notEqual(first[i].geometry.attributes.position.array,second[i].geometry.attributes.position.array);
    assert.deepEqual(first[i].geometry.attributes.position.array,second[i].geometry.attributes.position.array);
    assert.equal(first[i].material,second[i].material,'Shared source materials are cloned by prepareMaterials');
  }
  assert.notEqual(a.userData.crane.pivot,b.userData.crane.pivot);
  assert.equal(a.userData.crane.pivot,a.getObjectByName('Tower crane slew'));
  const old=second[0].geometry.attributes.position.getX(0);
  first[0].geometry.attributes.position.setX(0,123); first[0].geometry.dispose();
  assert.equal(second[0].geometry.attributes.position.getX(0),old);
  assert.equal(meshes(makeCityBuilding('construction',1))[0].geometry.attributes.position.getX(0),old);
});

test('a moving construction crane remains inside its collision apron', () => {
  const model=makeCityBuilding('construction'), crane=model.userData.crane;
  for(let frame=0;frame<40;frame++) {
    crane.pivot.rotation.y=frame*Math.PI/20;
    const drop=crane.baseDrop+Math.sin(frame*.37)*.5;
    crane.hook.position.y=-drop;crane.wire.position.y=-drop/2;crane.wire.scale.y=drop;
    const bounds=new THREE.Box3().setFromObject(model);
    assert.ok(bounds.max.x<=7 && bounds.min.x>=-7 && bounds.max.z<=7 && bounds.min.z>=-7);
  }
});

test('emergency vehicles expose their own light references and match the world aliases', () => {
  for(const kind of ['police','policecar','ambulance']) {
    const model=makeCityVehicle(kind), other=makeCityVehicle(kind), bounds=new THREE.Box3().setFromObject(model);
    assert.equal(model.userData.isBuilding,false);
    assert.equal(model.userData.vehicleKind,kind==='ambulance'?'ambulance':'police');
    assert.equal(model.userData.lightMeshes.length,2);
    assert.ok(bounds.max.y>2 && bounds.max.y<3.5);
    assert.ok(model.userData.width<3 && model.userData.depth<5);
    for(const light of model.userData.lightMeshes) {
      assert.ok(meshes(model).includes(light));
      assert.ok(!other.userData.lightMeshes.includes(light));
      assert.ok(light.material.emissiveIntensity>0);
    }
  }
});
