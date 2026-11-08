import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {LevelStorm,STORM_DURATION} from '../level-storm.js';
test('earned levels queue separately, execute without recursion and freeze with paused time',()=>{
 const scene=new THREE.Scene(),player={x:1,y:0,z:2},camera=new THREE.PerspectiveCamera();camera.position.y=23;
 let callbacks=0;const storm=new LevelStorm(scene,{onStrike:()=>{callbacks++;if(callbacks===1)storm.enqueue(3,4);}});
 storm.enqueue(1,3);storm.enqueue(1,3);assert.deepEqual(storm.pending,[2,3]);
 storm.update(0,player,camera);assert.equal(callbacks,0);
 storm.update(.01,player,camera);assert.equal(callbacks,1);assert.equal(storm.active.level,2);assert.deepEqual(storm.pending,[3,4]);
 const buffer=storm.beam.geometry.attributes.position;assert.ok(storm.beam.visible);assert.ok([...buffer.array].every(Number.isFinite));
 storm.update(STORM_DURATION,player,camera);assert.equal(callbacks,2);assert.equal(storm.active.level,3);assert.equal(storm.beam.geometry.attributes.position,buffer);
 storm.update(STORM_DURATION,player,camera);assert.equal(callbacks,3);storm.update(STORM_DURATION,player,camera);assert.equal(storm.active,null);assert.equal(storm.beam.visible,false);
 storm.reset();assert.equal(storm.strikes,0);storm.dispose();assert.equal(storm.beam.parent,null);assert.equal(storm.wave.parent,null);
});
