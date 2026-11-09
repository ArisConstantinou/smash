import test from 'node:test';import assert from 'node:assert/strict';import {armoryParts,WEAPON_BLUEPRINTS,SHIELD_BLUEPRINTS,createArmory,restoreArmory,resolveArmory,equipBlueprint,purchaseArmoryPart,equipArmoryPart,paintArmoryPart,armoryQuote,armoryStats,awardBossWeapon} from '../armory-rules.js';
test('eighteen actual blueprint identities unlock with the existing forge progression',()=>{assert.equal(WEAPON_BLUEPRINTS.filter(b=>!b.bossReward).length,12);assert.equal(SHIELD_BLUEPRINTS.length,6);const a=createArmory();assert.equal(resolveArmory(a,0).weapon,'w01');assert.equal(equipBlueprint(a,'w12',{tier:0}),false);assert.ok(equipBlueprint(a,'w12',{tier:4}));assert.equal(resolveArmory(a,4).weapon,'w12');assert.equal(resolveArmory(a,0).weapon,'w01');for(const b of [...WEAPON_BLUEPRINTS.filter(b=>!b.bossReward),...SHIELD_BLUEPRINTS])assert.ok(equipBlueprint(a,b.id,{tier:4}));});
test('each item retains independent functional upgrades and finishes across save restoration',()=>{const a=createArmory(),m={wood:500,scrap:500,crystal:500};assert.ok(purchaseArmoryPart(a,m,'w05','core','fire',{tier:4}).ok);assert.ok(equipArmoryPart(a,'w05','finish','oxide',{tier:4}));assert.equal(a.items.w06.parts.core.selected,'none');const restored=restoreArmory(JSON.parse(JSON.stringify(a)));assert.equal(restored.items.w05.parts.core.selected,'fire');assert.equal(restored.items.w05.parts.finish.selected,'oxide');assert.equal(restored.items.w06.parts.core.selected,'none');assert.ok(m.crystal<500);});
test('real numerical changes, rank caps, free cosmetic choice and test spending isolation',()=>{const a=createArmory(),m={wood:0,scrap:0,crystal:0},before=armoryStats(a,'w03');for(let i=0;i<5;i++)assert.ok(purchaseArmoryPart(a,m,'w03','haft','extended',{test:true}).ok);assert.ok(armoryStats(a,'w03').reach>before.reach);assert.equal(purchaseArmoryPart(a,m,'w03','haft','extended',{test:true}).ok,false);assert.deepEqual(m,{wood:0,scrap:0,crystal:0});assert.equal(armoryQuote(a,'w03','finish','oxide').ok,false);assert.ok(equipArmoryPart(a,'w03','finish','oxide',{tier:4}));assert.equal(purchaseArmoryPart(a,m,'s15','rim','armored',{tier:0}).ok,false);});
test('legacy, malformed and hostile configurations cannot create unknown parts or unbounded ranks',()=>{const a=restoreArmory({weapon:'unknown',items:{w01:{parts:{core:{selected:'fire',owned:{fire:Infinity,arc:99}},haft:{selected:'extended',owned:{extended:3.8}}}}}});assert.equal(a.weapon,'auto');assert.equal(a.items.w01.parts.core.selected,'none');assert.equal(a.items.w01.parts.core.owned.arc,5);assert.equal(a.items.w01.parts.haft.owned.extended,3);assert.deepEqual(restoreArmory(null),createArmory());});

test('every rankable base component changes real stats while cosmetic finishes and empty cores remain explicit',()=>{for(const id of ['w05','s14'])for(const part of armoryParts(id)){const a=createArmory(),choice=part.options[0].id,q=armoryQuote(a,id,part.id,choice);if(part.cosmetic||choice==='none'){assert.equal(q.ok,false);continue;}const before=armoryStats(a,id);const materials={wood:10000,scrap:10000,crystal:10000};assert.ok(purchaseArmoryPart(a,materials,id,part.id,choice,{tier:4}).ok);assert.notDeepEqual(armoryStats(a,id),before,part.id);}});

test('boss trophies require their own defeat and survive restoration independently of forge tier',()=>{
 const a=restoreArmory({version:1,weapon:'w19',trophies:{siegeTransformer:'true'}});
 assert.equal(a.weapon,'auto');
 assert.equal(equipBlueprint(a,'w19',{tier:4,test:true}),false);
 assert.equal(equipArmoryPart(a,'w19','finish','oxide',{test:true}),false);
 assert.equal(awardBossWeapon(a,'siegeMech'),null);
 assert.equal(awardBossWeapon(a,'siegeTransformer').id,'w19');assert.equal(awardBossWeapon(a,'siegeTransformer'),null);
 assert.ok(equipBlueprint(a,'w19'));assert.equal(equipBlueprint(a,'w20',{tier:4}),false);
 const saved=restoreArmory(JSON.parse(JSON.stringify(a)));
 assert.equal(resolveArmory(saved,0).weapon,'w19');
 assert.equal(awardBossWeapon(saved,'hollowMarshal').id,'w20');assert.ok(equipBlueprint(saved,'w20'));
});

test('part paint survives restoration independently for each slot and variant',()=>{
 const armory=createArmory(),before=armoryStats(armory,'w12'),options={tier:4};
 assert.equal(paintArmoryPart(armory,'w12','haft','wood','#AC31F8',{tier:0}),false);
 assert.equal(paintArmoryPart(armory,'w12','haft','wood','invalid',options),false);
 assert.equal(paintArmoryPart(armory,'w12','core','none','#AC31F8',options),false);
 armory.items.w12.parts.finish.color='#346273';
 assert.ok(paintArmoryPart(armory,'w12','haft','wood','#AC31F8',options));
 assert.ok(paintArmoryPart(armory,'w12','haft','extended','#AA2233',options));
 assert.ok(paintArmoryPart(armory,'w12','grip','leather','#5ea833',options));
 const restored=restoreArmory(JSON.parse(JSON.stringify(armory))),parts=restored.items.w12.parts;
 assert.deepEqual(parts.haft.colors,{wood:'#ac31f8',extended:'#aa2233'});
 assert.equal(parts.grip.colors.leather,'#5ea833');
 assert.equal(parts.finish.color,'#346273');
 assert.deepEqual(armoryStats(restored,'w12'),before);
 assert.ok(paintArmoryPart(restored,'w12','haft','wood',null,options));
 assert.deepEqual(parts.haft.colors,{extended:'#aa2233'});
});
