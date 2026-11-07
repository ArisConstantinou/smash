// Run: node --import ./tools/node-environment.mjs tools/collision-benchmark.mjs
// CPU-only exact-collision microbenchmark, not browser/GPU FPS.
import {performance} from 'node:perf_hooks';
import {readFile} from 'node:fs/promises';
import * as THREE from '../vendor/three.module.js';
import {createGeometryCollision} from '../geometry-collision.js';
import {makeCityBuilding} from '../city-models.js';
import {enableCollisionWasm,setCollisionWasmEnabled,collisionWasmStatus} from '../collision-wasm.js?v=20261107-perf14';
await enableCollisionWasm(await readFile(new URL('../assets/wasm/collision.wasm',import.meta.url)));
const objects=['townhouse','warehouse','shop'].map((type,i)=>{const mesh=makeCityBuilding(type,i);return {mesh,type,x:0,z:0,w:mesh.userData.width,d:mesh.userData.depth,h:mesh.userData.height,dead:false};});
const collision=createGeometryCollision({nearObjects:()=>objects});
const rays=Array.from({length:1200},(_,i)=>{const a=i*.127,object=objects[i%3];return {object,a:{x:-14,y:1+(i%8),z:(i%20)-10},b:{x:14,y:1+(i%8),z:(i%20)-9},r:.5+(i%4)*.7};});
const sample=enabled=>{setCollisionWasmEnabled(enabled);const begin=performance.now();let sum=0;for(const r of rays){const hit=collision.geometryHit(r.object,r.a,r.b,r.r);if(hit)sum+=hit.t;}return {ms:performance.now()-begin,sum};};
for(let i=0;i<4;i++){sample(false);sample(true);}
const js=[],wasm=[];let identical=true;
for(let i=0;i<9;i++){const first=sample(i%2===0),second=sample(i%2!==0);const a=i%2?first:second,b=i%2?second:first;js.push(a.ms);wasm.push(b.ms);identical&&=Math.abs(a.sum-b.sum)<1e-8;}
const median=a=>a.slice().sort((a,b)=>a-b)[Math.floor(a.length/2)];
console.log(JSON.stringify({raysPerSample:rays.length,warmups:4,samples:9,jsMedianMs:median(js),wasmMedianMs:median(wasm),identical,wasm:collisionWasmStatus(),jsSamples:js,wasmSamples:wasm},null,2));
