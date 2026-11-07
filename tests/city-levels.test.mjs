import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {LEVEL_CITIES,getLevelCity} from '../city-levels.js';
import {createCityLayout} from '../city-layout.js';
import {createWorld} from '../world.js';
import * as THREE from '../vendor/three.module.js';

test('15 named city levels have unique seeds, images and deterministic playable skylines',()=>{
 assert.equal(LEVEL_CITIES.length,15);
 for(const key of ['id','seed','image','name'])assert.equal(new Set(LEVEL_CITIES.map(c=>c[key])).size,15);
 const layouts=LEVEL_CITIES.map(city=>createCityLayout(city.seed,city));
 assert.equal(new Set(layouts.map(layout=>JSON.stringify(layout.plots.map(p=>[p.kind,p.variant])))).size,15);
 for(const [i,layout] of layouts.entries()){
  assert.equal(LEVEL_CITIES[i].level,i+1);assert.equal(layout.plots.length,100);
  assert.deepEqual(layout,createCityLayout(LEVEL_CITIES[i].seed,LEVEL_CITIES[i]));
  assert.ok(layout.plots.every(p=>p.kind));
  assert.equal(new Set(layout.plots.map(p=>p.kind)).size,10,'All interaction/building types remain available');
 }
});
test('invalid level values clamp safely and default new/resume layouts remain deterministic',()=>{
 for(const value of [NaN,undefined,'bad',-40,0])assert.equal(getLevelCity(value).level,1);
 assert.equal(getLevelCity(99).level,15);assert.equal(getLevelCity('10').level,10);
 assert.deepEqual(createCityLayout(1700),createCityLayout(1700,null));
});
test('every level has a real, different, compact WebP postcard',async()=>{
 const hashes=[];
 for(const city of LEVEL_CITIES){
  const data=await readFile(new URL('../'+city.image,import.meta.url));
  assert.equal(data.subarray(0,4).toString(),'RIFF');assert.equal(data.subarray(8,12).toString(),'WEBP');
  assert.ok(data.length>10000&&data.length<100000,city.name+' must be a detailed lightweight image');
  hashes.push(createHash('sha256').update(data).digest('hex'));
 }
 assert.equal(new Set(hashes).size,15);
});
test('selected cities use their pictured climate and retain real collisions and open spawns',()=>{
 for(const level of [1,4,5]){
  const city=getLevelCity(level),scene=new THREE.Scene(),world=createWorld(scene,{seed:city.seed,city});
  assert.equal(world.city,city);assert.equal(world.regionAt(0,0).weather,city.weather);
  assert.equal(world.regionAt(-77,-66).weather,city.weather);
  assert.equal(world.buildingCount,100);assert.equal(world.supportHeight(0,0,.44,2),0);
  assert.equal(world.hazards.some(h=>h.type==='lava'),city.weather==='ash');
  assert.doesNotThrow(()=>world.update(.016,3,{x:0,z:0},city.weather));world.dispose();
  assert.equal(scene.children.length,0);
 }
});
test('selection HTML contains a paged image gallery, a separate launch and no level select',async()=>{
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 assert.ok(!/<select[^>]*id="startingLevel"/.test(html));
 assert.match(html,/<input id="startingLevel" type="hidden"/);
 for(const id of ['cityGrid','cityPreviewImage','cityPrevious','cityNext','testStartButton'])assert.ok(html.includes('id="'+id+'"'));
});
