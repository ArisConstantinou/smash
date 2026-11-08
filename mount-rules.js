// Deterministic garage rules shared by gameplay and the two workshop entry points.
import {createArmory,restoreArmory} from './armory-rules.js?v=20261108-armory1';
export const MAX_PART_RANK=5;
export const MOUNT_FAMILIES=Object.freeze([
 {id:'bicycle',name:'ΠΟΔΗΛΑΤΟ',level:1,speed:8.4,hp:130,energy:32,regen:6,mass:1},
 {id:'motorcycle',name:'ΜΟΤΟΣΙΚΛΕΤΑ',level:11,speed:12.4,hp:230,energy:52,regen:8,mass:1.6},
 {id:'scifi',name:'SCI-FI',level:21,speed:14,hp:320,energy:80,regen:11,mass:1.9},
]);
const option=(id,name,description,effect={},cost={wood:3,scrap:2,crystal:0})=>({id,name,description,effect,cost});
export const MOUNT_PARTS=Object.freeze([
 {id:'frame',name:'ΣΚΕΛΕΤΟΣ',options:[
  option('standard','ΚΑΝΟΝΙΚΟΣ','Ισορροπία βάρους και αντοχής.',{hp:12}),
  option('light','ΕΛΑΦΡΥΣ','Πιο γρήγορη επιτάχυνση, λιγότερη θωράκιση.',{speed:.3,acceleration:1.4,mass:-.08},{wood:5,scrap:4,crystal:0}),
  option('reinforced','ΕΝΙΣΧΥΜΕΝΟΣ','Περισσότερη ζωή και ικανότητα μεταφοράς.',{hp:35,defence:.014,mass:.06},{wood:6,scrap:6,crystal:0})]},
 ...['frontWheel','rearWheel'].map((id,i)=>({id,name:i?'ΠΙΣΩ ΤΡΟΧΟΣ':'ΜΠΡΟΣΤΑ ΤΡΟΧΟΣ',options:[
  option('standard','ΚΑΝΟΝΙΚΟΣ','Σταθερό κράτημα και κύλιση.',{grip:.07}),
  option('spiked','ΑΚΙΔΕΣ','Ζημιά κατά την πραγματική επαφή του τροχού.',{contact:12,grip:.05,mass:.02},{wood:3,scrap:5,crystal:0}),
  option('armored','ΘΩΡΑΚΙΣΜΕΝΟΣ','Ενίσχυση ζωής και προστασίας.',{hp:22,defence:.012,grip:.03,mass:.04},{wood:2,scrap:6,crystal:0}),
  option('saw','ΠΡΙΟΝΩΤΟΣ','Ισχυρή ζημιά επαφής, μεγαλύτερο βάρος.',{contact:19,grip:.025,mass:.055},{wood:3,scrap:8,crystal:1})]})),
 {id:'drive',name:'ΜΕΤΑΔΟΣΗ / ΙΣΧΥΣ',options:[
  option('standard','ΙΣΟΡΡΟΠΗΜΕΝΗ','Μετάδοση, κινητήρας ή κυψέλη ανά σασί.',{speed:.25,regen:.8}),
  option('performance','ΤΑΧΥΤΗΤΑ','Περισσότερη ισχύς και επιτάχυνση.',{speed:.65,acceleration:1.6,mass:.025},{wood:4,scrap:6,crystal:1}),
  option('generator','ΓΕΝΝΗΤΡΙΑ','Μεγαλύτερο απόθεμα και αναπλήρωση ενέργειας.',{energy:12,regen:2,mass:.03},{wood:3,scrap:5,crystal:2})]},
 {id:'frontModule',name:'ΕΜΠΡΟΣ MODULE',options:[
  option('none','ΧΩΡΙΣ MODULE','Χαμηλό βάρος και κατανάλωση.',{},{}),
  option('ram','ΠΡΟΦΥΛΑΚΤΗΡΑΣ','Εμβολισμός με πραγματική ταχύτητα επαφής.',{contact:19,hp:8,mass:.05},{wood:4,scrap:4,crystal:0}),
  option('crossbow','ΒΑΛΛΙΣΤΡΑ','Αυτόματη μετωπική βολή όταν υπάρχει στόχος.',{damage:18,range:10,interval:1.0,shotCost:3,mass:.04},{wood:7,scrap:3,crystal:0}),
  option('gun','ΠΟΛΥΒΟΛΟ','Ταχύτερες μετωπικές βολές.',{damage:11,range:12,interval:.36,shotCost:2.5,mass:.06},{wood:3,scrap:10,crystal:1}),
  option('cannon','ΕΝΕΡΓΕΙΑΚΟ','Βαρύτερη βολή με μεγαλύτερη κατανάλωση.',{damage:35,range:14,interval:1.1,shotCost:8,mass:.08},{wood:2,scrap:12,crystal:4})]},
 {id:'sideModule',name:'ΠΛΑΪΝΟ MODULE',options:[
  option('none','ΧΩΡΙΣ MODULE','Διατηρεί το χαμηλό βάρος.',{},{}),
  option('rockets','ΡΟΥΚΕΤΕΣ','Βολές με μικρή έκρηξη στο πρώτο εμπόδιο.',{damage:27,range:15,interval:1.5,shotCost:8,mass:.09},{wood:4,scrap:10,crystal:2}),
  option('shield','ΠΡΟΣΤΑΤΕΥΤΙΚΟ','Πραγματική μείωση εισερχόμενης ζημιάς.',{defence:.025,hp:15,mass:.055},{wood:4,scrap:7,crystal:1}),
  option('battery','ΜΠΑΤΑΡΙΑ','Περισσότερη ενέργεια για όπλα και boost.',{energy:17,regen:.5,mass:.035},{wood:2,scrap:6,crystal:2})]},
 {id:'rearModule',name:'ΠΙΣΩ MODULE',options:[
  option('none','ΧΩΡΙΣ MODULE','Ελεύθερο πίσω μέρος.',{},{}),
  option('turret','AUTO TURRET','Ανεξάρτητη περιστροφή και βολές σε ορατούς στόχους.',{damage:12,range:13,interval:.48,shotCost:3,mass:.07},{wood:5,scrap:12,crystal:2}),
  option('heavyTurret','ΒΑΡΥ TURRET','Ισχυρότερη βολή με βραδύτερο ρυθμό.',{damage:30,range:16,interval:.95,shotCost:7,mass:.10},{wood:4,scrap:15,crystal:4}),
  option('battery','ΕΦΕΔΡΕΙΑ','Απόθεμα και αναπλήρωση ενέργειας.',{energy:22,regen:1.1,mass:.04},{wood:3,scrap:7,crystal:2})]},
 {id:'armor',name:'ΘΩΡΑΚΙΣΗ',options:[
  option('standard','ΒΑΣΙΚΗ','Ελαφριά προστατευτικά.',{defence:.009,hp:5}),
  option('plated','ΠΛΑΚΕΣ','Περισσότερη άμυνα και ζωή, με βάρος.',{defence:.024,hp:21,mass:.05},{wood:4,scrap:8,crystal:0}),
  option('reactive','ΕΝΙΣΧΥΜΕΝΗ','Προστασία οχήματος και αναβάτη.',{defence:.027,hp:18,riderProtection:.018,mass:.04},{wood:3,scrap:9,crystal:3})]},
 {id:'controls',name:'ΣΕΛΑ / ΧΕΙΡΙΣΜΟΣ',options:[
  option('standard','ΣΤΑΘΕΡΑ','Κανονική απόκριση τιμονιού.',{handling:.08}),
  option('agile','ΕΥΕΛΙΚΤΑ','Ταχύτερη στροφή και επιτάχυνση.',{handling:.17,acceleration:.6},{wood:6,scrap:5,crystal:0}),
  option('protected','ΠΡΟΣΤΑΤΕΥΜΕΝΑ','Λιγότερη ζημιά στον αναβάτη.',{riderProtection:.035,hp:10},{wood:5,scrap:7,crystal:1})]},
 {id:'mobility',name:'ΚΙΝΗΣΗ',options:[
  option('wheels','ΤΡΟΧΟΙ','Πραγματική κύλιση και πρόσφυση.',{grip:.05}),
  option('hover','HOVER','Ελεύθερα ελεγχόμενο ύψος με συγκρούσεις σε όλο το όχημα.',{speed:.1,energy:5},{wood:4,scrap:14,crystal:6})]},
]);
export const PLAYER_PARTS=Object.freeze(['head','chest','arms','legs','boots','shield','hammer'].map((id,i)=>({id,name:['ΚΕΦΑΛΙ','ΚΟΡΜΟΣ','ΧΕΡΙΑ','ΠΟΔΙΑ','ΜΠΟΤΕΣ','ΑΣΠΙΔΑ','ΣΦΥΡΙ'][i],options:[
 option('standard','ΒΑΣΙΚΟ','Αναβάθμιση του υπάρχοντος εξοπλισμού.',{hp:2,power:.006}),
 option('reinforced','ΕΝΙΣΧΥΜΕΝΟ','Περισσότερη ζωή και άμυνα.',{hp:i===1?10:5,defence:.008},{wood:4,scrap:5,crystal:0}),
 option('powered','ΕΝΔΥΝΑΜΩΜΕΝΟ','Ισχύς, κίνηση και ενεργός εξοπλισμός.',{power:.018,speed:.012},{wood:3,scrap:6,crystal:2}),
 option('assault','ΕΦΟΔΟΥ','Βαριά λειτουργική πανοπλία με πρόσθετη ισχύ και προστασία.',{hp:i===1?12:6,power:.012,defence:.006,speed:-.004},{wood:5,scrap:9,crystal:2}),
]})));
const ids=MOUNT_FAMILIES.map(f=>f.id);
export const familyForLevel=level=>level>=21?'scifi':level>=11?'motorcycle':'bicycle';
export const familyUnlocked=(id,level)=>ids.includes(id)&&level>=MOUNT_FAMILIES.find(f=>f.id===id).level;
const freshParts=parts=>Object.fromEntries(parts.map(p=>[p.id,{selected:p.options[0].id,owned:{[p.options[0].id]:1}}]));
export function createGarage(){const g={version:2,selectedMount:'auto',mounts:Object.fromEntries(ids.map(id=>[id,freshParts(MOUNT_PARTS)])),player:freshParts(PLAYER_PARTS),armory:createArmory()};g.mounts.scifi.rearModule.owned.turret=1;g.mounts.scifi.rearModule.selected='turret';return g;}
export function restoreGarage(saved){
 const state=createGarage();if(!saved||typeof saved!=='object')return state;state.armory=restoreArmory(saved.armory);
 state.selectedMount=saved.selectedMount==='auto'||ids.includes(saved.selectedMount)?saved.selectedMount:'auto';
 for(const [key,parts] of [...ids.map(id=>[id,MOUNT_PARTS]),['player',PLAYER_PARTS]]){
  const source=key==='player'?saved.player:saved.mounts?.[key],target=key==='player'?state.player:state.mounts[key];
  for(const part of parts){const old=source?.[part.id];if(!old||typeof old!=='object')continue;
   for(const option of part.options){const n=Number(old.owned?.[option.id]);if(Number.isFinite(n)&&n>=1)target[part.id].owned[option.id]=Math.min(MAX_PART_RANK,Math.floor(n));}
   if(part.options.some(o=>o.id===old.selected)&&target[part.id].owned[old.selected])target[part.id].selected=old.selected;
  }
 }return state;
}
export function garageParts(garage,kind){return kind==='player'?garage.player:garage.mounts[kind];}
export function partDefinitions(kind){return kind==='player'?PLAYER_PARTS:MOUNT_PARTS;}
export function partOption(kind,slot,id){return partDefinitions(kind).find(p=>p.id===slot)?.options.find(o=>o.id===id);}
export function partRank(garage,kind,slot,id){return garageParts(garage,kind)?.[slot]?.owned?.[id]||0;}
export function resolveMount(garage,level){return garage.selectedMount!=='auto'&&familyUnlocked(garage.selectedMount,level)?garage.selectedMount:familyForLevel(level);}
export function upgradeQuote(garage,kind,slot,id){
 const o=partOption(kind,slot,id),rank=partRank(garage,kind,slot,id);
 if(!o)return {ok:false,reason:'Άγνωστο εξάρτημα.'};
 if(rank>=MAX_PART_RANK||id==='none')return {ok:false,reason:rank>=MAX_PART_RANK?'ΜΕΓΙΣΤΗ ΒΑΘΜΙΔΑ':'Επίλεξε module.',rank};
 const factor=(rank+1)*(kind==='scifi'?2:kind==='motorcycle'?1.5:1);
 return {ok:true,rank,nextRank:rank+1,cost:Object.fromEntries(['wood','scrap','crystal'].map(t=>[t,Math.ceil((o.cost[t]||0)*factor)]))};
}
export function purchasePart(garage,materials,kind,slot,id,{level=1,test=false}={}){
 if(kind!=='player'&&!familyUnlocked(kind,level))return {ok:false,reason:'Το σασί δεν έχει ξεκλειδωθεί.'};
 if(slot==='mobility'&&id==='hover'&&kind!=='scifi')return {ok:false,reason:'Το hover ανήκει στο sci-fi σασί.'};
 const q=upgradeQuote(garage,kind,slot,id);if(!q.ok)return q;
 if(!test&&Object.entries(q.cost).some(([t,n])=>(materials?.[t]||0)<n))return {...q,ok:false,reason:'Δεν υπάρχουν αρκετά υλικά.'};
 if(!test)for(const [t,n]of Object.entries(q.cost))materials[t]-=n;
 const entry=garageParts(garage,kind)[slot];entry.owned[id]=q.nextRank;entry.selected=id;
 return {...q,ok:true};
}
export function equipPart(garage,kind,slot,id,{level=1}={}){
 if(kind!=='player'&&!familyUnlocked(kind,level))return false;
 if(slot==='mobility'&&id==='hover'&&kind!=='scifi')return false;
 if(!partRank(garage,kind,slot,id))return false;
 garageParts(garage,kind)[slot].selected=id;return true;
}
export function mountStats(garage,kind){
 const base=MOUNT_FAMILIES.find(f=>f.id===kind)||MOUNT_FAMILIES[0],parts=garage.mounts[base.id];
 const s={kind:base.id,hp:base.hp,speed:base.speed,acceleration:12,handling:8,grip:1,defence:0,riderProtection:.25,energy:base.energy,regen:base.regen,mass:base.mass,contact:0,frontContact:0,weapons:[],hover:false};
 for(const p of MOUNT_PARTS){const entry=parts[p.id],o=partOption(kind,p.id,entry.selected),rank=entry.owned[entry.selected]||1,e=o.effect;
  if(p.id==='mobility'){s.hover=kind==='scifi'&&entry.selected==='hover';if(kind!=='scifi')continue;}
  for(const key of ['hp','speed','acceleration','handling','grip','defence','riderProtection','energy','regen','mass'])s[key]+=(e[key]||0)*rank;
  if(e.contact){if(p.id==='frontModule')s.frontContact+=e.contact*rank;else s.contact+=e.contact*rank;}
  if(e.damage)s.weapons.push({slot:p.id,id:o.id,rank,damage:Math.round(e.damage*(1+.27*(rank-1))),range:e.range+.8*(rank-1),interval:e.interval/(1+.13*(rank-1)),cost:e.shotCost});
 }
 const load=Math.max(.85,1+(s.mass-base.mass)*.32);s.speed/=load;s.acceleration/=load;
 if(s.hover)s.contact=0;
 s.defence=Math.min(.65,s.defence);s.riderProtection=Math.min(.8,s.riderProtection);s.hp=Math.round(s.hp);
 return s;
}
export function playerCustomStats(garage,{hasShield=true}={}){
 const s={hp:0,defence:0,power:1,speed:1};
 for(const p of PLAYER_PARTS){if(p.id==='shield'&&!hasShield)continue;const v=garage.player[p.id],o=partOption('player',p.id,v.selected),rank=v.owned[v.selected]||1,factor=v.selected==='standard'?rank-1:rank;for(const k of ['hp','defence','power','speed'])s[k]+=(o.effect[k]||0)*factor;}
 s.defence=Math.min(.45,s.defence);return s;
}
export function configurationSignature(garage,kind){return JSON.stringify(garageParts(garage,kind));}
