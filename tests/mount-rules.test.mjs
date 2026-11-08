import test from 'node:test';import assert from 'node:assert/strict';
import {createGarage,restoreGarage,familyForLevel,familyUnlocked,purchasePart,equipPart,mountStats,playerCustomStats,MAX_PART_RANK}from '../mount-rules.js';
test('mount families unlock at the actual 1/11/21 boundaries',()=>{
 for(const [level,kind]of [[1,'bicycle'],[10,'bicycle'],[11,'motorcycle'],[20,'motorcycle'],[21,'scifi'],[30,'scifi']]){assert.equal(familyForLevel(level),kind);assert.ok(familyUnlocked(kind,level));}
 assert.equal(familyUnlocked('motorcycle',10),false);assert.equal(familyUnlocked('scifi',20),false);
});
test('real wheel upgrades spend materials once and change actual contact and durability stats',()=>{
 const g=createGarage(),m={wood:500,scrap:500,crystal:500},before=mountStats(g,'bicycle');
 const bought=purchasePart(g,m,'bicycle','frontWheel','spiked');assert.ok(bought.ok);assert.equal(m.scrap,495);assert.ok(mountStats(g,'bicycle').contact>before.contact);
 assert.equal(equipPart(g,'bicycle','frontWheel','standard'),true);assert.equal(m.scrap,495);
 assert.equal(equipPart(g,'bicycle','frontWheel','armored'),false);
 for(let i=1;i<MAX_PART_RANK;i++)assert.ok(purchasePart(g,m,'bicycle','frontWheel','spiked').ok);
 const snapshot=structuredClone(m);assert.equal(purchasePart(g,m,'bicycle','frontWheel','spiked').ok,false);assert.deepEqual(m,snapshot);
});
test('weapons are available on all chassis, while hover is a real sci-fi mobility choice',()=>{
 const g=createGarage(),m={wood:9999,scrap:9999,crystal:9999};
 for(const kind of ['bicycle','motorcycle','scifi']){assert.ok(purchasePart(g,m,kind,'rearModule','turret',{level:30}).ok);assert.ok(mountStats(g,kind).weapons.some(w=>w.id==='turret'));}
 assert.equal(purchasePart(g,m,'bicycle','mobility','hover',{level:30}).ok,false);
 assert.ok(purchasePart(g,m,'scifi','mobility','hover',{level:30}).ok);assert.equal(mountStats(g,'scifi').hover,true);
});
test('garage restore preserves each owned chassis and rejects invalid selections/ranks',()=>{
 const g=createGarage();purchasePart(g,{wood:100,scrap:100,crystal:100},'bicycle','frame','reinforced');g.selectedMount='bicycle';
 const saved=JSON.parse(JSON.stringify(g));assert.deepEqual(restoreGarage(saved),g);
 saved.mounts.bicycle.frame.selected='unknown';saved.mounts.bicycle.frame.owned.reinforced=999;
 const r=restoreGarage(saved);assert.equal(r.mounts.bicycle.frame.selected,'standard');assert.equal(r.mounts.bicycle.frame.owned.reinforced,5);
});
test('unaffordable and locked purchases cannot spend materials, and player armor changes protection',()=>{
 const g=createGarage(),m={wood:0,scrap:0,crystal:0},before=JSON.stringify(g);
 assert.equal(purchasePart(g,m,'bicycle','frontModule','gun').ok,false);assert.equal(JSON.stringify(g),before);
 assert.equal(purchasePart(g,m,'motorcycle','frontModule','gun',{level:10,test:true}).ok,false);
 const old=playerCustomStats(g);assert.ok(purchasePart(g,m,'player','chest','reinforced',{test:true}).ok);assert.ok(playerCustomStats(g).defence>old.defence);assert.ok(playerCustomStats(g).hp>old.hp);
});
