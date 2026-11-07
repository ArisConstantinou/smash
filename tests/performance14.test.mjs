import test from 'node:test';
import assert from 'node:assert/strict';
import {FrameTelemetry} from '../performance-hud.js';
import {createGameRenderer} from '../renderer-policy.js';
import {vehicleDamageStage} from '../vehicle-effects.js';
test('FPS reports one real frame per second rather than simulation-clamped FPS',()=>{
 const m=new FrameTelemetry();m.sample(0);let measured;
 for(let i=1;i<=60;i++){const next=m.sample(i*1000/60);if(next)measured=next;}
 assert.ok(Math.abs(measured.fps-60)<1e-8);
 m.reset();m.sample(2000);measured=m.sample(3000);assert.equal(measured.fps,1);assert.equal(measured.p95,1000);
 m.reset();assert.equal(m.sample(900000),null);assert.equal(m.sample(900010),null);
 for(let n=1;n<=300;n++)m.sample(900010+n*1000);assert.equal(m.history.length,120);
});
test('WebGPU is mandatory by default and unavailable adapters cannot silently use WebGL',async()=>{
 let fallback=0,disposed=0;
 class GPU{constructor(){this._getFallback=()=>fallback++;}async init(){assert.equal(this._getFallback,null);this.backend={isWebGPUBackend:true};}dispose(){disposed++;}}
 const renderer=await createGameRenderer({THREE:{WebGPURenderer:GPU},canvas:{},gpu:{}});assert.equal(renderer.userData.backend,'WebGPU');assert.equal(fallback,0);
 await assert.rejects(createGameRenderer({THREE:{},gpu:null}),/WebGPU/);
 class Wrong extends GPU{async init(){this.backend={isWebGLBackend:true};}}
 await assert.rejects(createGameRenderer({THREE:{WebGPURenderer:Wrong},gpu:{}}),/WebGPU backend/);assert.equal(disposed,1);
 class Compat{};assert.match((await createGameRenderer({THREE:{WebGLRenderer:Compat},mode:'webgl'})).userData.backend,/diagnostic/);
});
test('vehicle smoke and fire have explicit damage stages; buildings cannot be emitters',()=>{
 const car={type:'car',maxHp:100};
 assert.equal(vehicleDamageStage({...car,hp:100}),0);assert.equal(vehicleDamageStage({...car,hp:55}),1);
 assert.equal(vehicleDamageStage({...car,hp:28}),2);assert.equal(vehicleDamageStage({...car,hp:0}),2);
 assert.equal(vehicleDamageStage({type:'townhouse',hp:0,maxHp:100}),0);
});
