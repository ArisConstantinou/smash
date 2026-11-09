import {createWeaponModel,createShieldModel} from './armory-models.js?v=20261109-trophies1';import {resolveArmory,armoryAvailable} from './armory-rules.js?v=20261109-trophies1';
const records=new WeakMap();
/** Replace only authored appearance-slot children. Original cached meshes and
 * all grip/IK/pivot/effect-helper nodes remain owned by makeWarrior. */
export function applyArmoryCustomization(hero,garage){
 const u=hero.userData,a=garage.armory;if(!a)return;let record=records.get(hero);if(!record){record={};records.set(hero,record);}const tier=u.equipmentTier,selected=resolveArmory(a,tier);
 for(const category of ['weapon','shield']){const id=selected[category],active=a[category]!=='auto'&&armoryAvailable(id,tier,a),kit=garage.player[category==='weapon'?'hammer':'shield'],key=active?tier+':'+id+':'+JSON.stringify(a.items[id])+JSON.stringify(kit):'classic',previous=record[category];if(previous?.key===key)continue;
  previous?.model?.userData.dispose();if(!active){if(previous?.model)u.resetArmoryParts(category==='weapon'?['head','handle','shaft','collar','guard']:['shield']);record[category]={key};u[category==='weapon'?'armoryWeaponId':'armoryShieldId']=null;}
  else{const model=category==='weapon'?createWeaponModel(id,a,{kit}):createShieldModel(id,a,{kit});if(category==='weapon'){for(const [slot,mesh]of Object.entries(model.userData.parts))u.installArmoryPart(slot,mesh);}else u.installArmoryPart('shield',model);record[category]={key,model};u[category==='weapon'?'armoryWeaponId':'armoryShieldId']=id;}
  u.armoryRevision=(u.armoryRevision||0)+1;
 }
 u.armoryMaterials=[...new Set(Object.values(record).flatMap(r=>r.model?(Array.isArray(r.model.userData.material)?r.model.userData.material:[r.model.userData.material]):[]))];
 u.armoryWeaponMaterials=record.weapon?.model?.userData.material||[];u.armoryRing=record.weapon?.model?.userData.parts.head.userData.compoundRing||null;u.armoryShieldModel=record.shield?.model||null;u.invalidateEquipmentBounds();u.setReach(u.reachScale);u.updateGrip();
}
