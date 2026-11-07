// Same city and world matrices, alternating recomposition on/off. CPU only.
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import * as THREE from '../vendor/three.module.js';
import {createWorld} from '../world.js';
const scene=new THREE.Scene(),world=createWorld(scene,{seed:41});
const nodes=[];world.group.traverse(n=>nodes.push({n,automatic:n.matrixAutoUpdate}));
const sample=optimized=>{
 for(const {n,automatic}of nodes)n.matrixAutoUpdate=optimized?automatic:true;
 const begin=performance.now();for(let i=0;i<200;i++)scene.updateMatrixWorld(true);
 return performance.now()-begin;
};
sample(false);const original=nodes.map(({n})=>n.matrixWorld.clone());sample(true);
assert.ok(nodes.every(({n},i)=>n.matrixWorld.equals(original[i])),'Every authored world transform must remain identical');
const before=[],after=[];for(let i=0;i<9;i++){if(i%2){after.push(sample(true));before.push(sample(false));}else{before.push(sample(false));after.push(sample(true));}}
const median=a=>a.slice().sort((a,b)=>a-b)[Math.floor(a.length/2)];
console.log(JSON.stringify({framesPerSample:200,nodes:nodes.length,reusedLocalMatrices:nodes.filter(n=>!n.automatic).length,beforeMedianMs:median(before),afterMedianMs:median(after),identicalWorldMatrices:true,before,after},null,2));
world.dispose();
