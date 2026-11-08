// Stable blueprint IDs match the approved numbered reference. Shapes unlock
// with the existing forged tier; choosing an unlocked shape is free. Functional
// components retain their own purchases/ranks for each individual item.
export const WEAPON_BLUEPRINTS=Object.freeze([
 ['w01',1,'ΡΟΖΙΑΣΜΕΝΟ ΡΟΠΑΛΟ','club',0,1,1,1,1],['w02',2,'ΣΙΔΕΡΟΔΕΤΟ ΡΟΠΑΛΟ','club',0,1.05,.98,.97,1.08],
 ['w03',3,'ΑΥΛΑΚΩΤΟ ΡΟΠΑΛΟ','club',1,.96,1,1.14,.96],['w04',4,'ΟΚΤΑΓΩΝΟ ΡΟΠΑΛΟ','club',1,1.12,1.04,.88,1.15],
 ['w05',5,'ΣΦΥΡΙ ΤΕΧΝΙΤΗ','hammer',2,1,1,1,1],['w06',6,'ΚΥΛΙΝΔΡΙΚΟ ΣΦΥΡΙ','hammer',2,1.05,1,.95,1.13],
 ['w07',7,'ΣΤΑΥΡΩΤΟ ΣΦΥΡΙ','hammer',2,1.12,.98,1.03,.95],['w08',8,'ΔΙΠΛΟ ΕΜΒΟΛΟ','hammer',2,.94,1,1.14,1.12],
 ['w09',9,'ΒΑΡΙΑ ΣΦΥΡΑ','heavy',3,1.12,1.08,.88,1.20],['w10',10,'ΕΞΑΓΩΝΗ ΒΑΡΙΟΠΟΥΛΑ','heavy',3,1.18,1.07,.80,1.30],
 ['w11',11,'ΣΦΥΡΙ ΚΑΤΕΔΑΦΙΣΗΣ','heavy',3,1.14,1.02,.84,1.35],['w12',12,'ΔΑΚΤΥΛΙΟΣ ΚΑΤΑΙΓΙΔΑΣ','heavy',4,.88,1.03,1.10,.85],
].map(([id,number,name,family,tier,power,reach,handling,force])=>Object.freeze({id,number,name,family,tier,power,reach,handling,force})));
export const SHIELD_BLUEPRINTS=Object.freeze([
 ['s13',13,'ΣΤΡΟΓΓΥΛΗ ΑΣΠΙΔΑ',2,.25,.25,0,1],['s14',14,'ΑΣΠΙΔΑ ΧΑΡΤΑΕΤΟΣ',2,.35,.32,0,1],
 ['s15',15,'ΑΣΠΙΔΑ ΠΥΡΓΟΣ',2,.52,.42,18,.96],['s16',16,'ΕΞΑΓΩΝΟΣ ΑΝΤΙΔΡΑΣΤΗΡΑΣ',2,.40,.34,8,.99],
 ['s17',17,'ΑΡΘΡΩΤΗ ΑΣΠΙΔΑ',3,.45,.40,12,.97],['s18',18,'ΑΣΠΙΔΑ ΔΙΠΛΟΥ ΛΟΦΙΟΥ',3,.38,.35,6,1],
].map(([id,number,name,tier,protection,coverage,hp,speed])=>Object.freeze({id,number,name,tier,protection,coverage:coverage*Math.PI,hp,speed})));
const o=(id,name,description,effect={},cost={wood:3,scrap:4,crystal:0})=>({id,name,description,effect,cost});
const cores={id:'core',name:'ΠΥΡΗΝΑΣ ΕΦΕ',options:[
 o('none','ΧΩΡΙΣ ΠΥΡΗΝΑ','Η καθαρή μηχανική κατασκευή, χωρίς πρόσθετο στοιχειακό εφέ.',{},{}),
 o('impact','IMPACT','Έμβολο κρούσης: πραγματική απώθηση και παραπάτημα.',{force:.04},{wood:3,scrap:4,crystal:0}),
 o('arc','ARC','Πηνίο: περιορισμένη αλυσιδωτή ζημιά με ορατή διαδρομή.',{power:.01},{wood:2,scrap:7,crystal:3}),
 o('fire','FIRE','Θάλαμος καύσης: πεπερασμένη ζημιά εγκαύματος.',{power:.012},{wood:4,scrap:5,crystal:2}),
 o('frost','FROST','Ψυκτική κυψέλη: πραγματική προσωρινή επιβράδυνση.',{handling:.012},{wood:2,scrap:6,crystal:3}),
]};
const finish={id:'finish',name:'ΥΛΙΚΑ / ΒΑΦΗ',cosmetic:true,options:[
 o('navy','ΜΠΛΕ ΑΤΣΑΛΙ','Βαφή μεταλλικών πλακών. Τα ξύλινα μέρη διατηρούν τα νερά τους.',{},{}),
 o('oxide','ΒΑΘΥ ΚΟΚΚΙΝΟ','Οξειδωμένο κόκκινο μέταλλο και σκούρες συνδέσεις.',{},{}),
 o('ivory','ΕΛΕΦΑΝΤΟΔΟΝΤΟ','Ανοιχτές θωρακισμένες πλάκες και μπρούντζινες συνδέσεις.',{},{}),
 o('bronze','ΜΠΡΟΥΝΤΖΟΣ','Μπρούντζινες πλάκες, ατσάλινα άκρα και δέρμα.',{},{}),
]};
export const WEAPON_PARTS=Object.freeze([
 {id:'haft',name:'ΣΤΕΛΕΧΟΣ',options:[o('wood','ΣΚΛΗΡΟ ΞΥΛΟ','Συνεχές ξύλινο στέλεχος· οι βαθμίδες αυξάνουν ισχύ και δύναμη.',{power:.012,force:.008}),o('steel','ΑΤΣΑΛΙ','Μεταλλικό στέλεχος με ενισχύσεις και μεγαλύτερη ισχύ.',{power:.025,force:.02,handling:-.012},{wood:2,scrap:6,crystal:0}),o('extended','ΜΑΚΡΥ','Μεγαλύτερη πραγματική εμβέλεια, βραδύτερη επαναφορά.',{reach:.035,handling:-.012},{wood:5,scrap:4,crystal:0}),o('spring','ΑΠΟΣΒΕΣΤΗΡΑΣ','Αρθρωτό στέλεχος με ελατήριο και καλύτερο έλεγχο.',{handling:.025,force:.015},{wood:2,scrap:6,crystal:1})]},
 {id:'grip',name:'ΛΑΒΗ',options:[o('leather','ΔΕΡΜΑ','Δερμάτινη λαβή· οι βαθμίδες βελτιώνουν τον χειρισμό.',{handling:.018}),o('guarded','ΠΡΟΦΥΛΑΚΤΗΡΑΣ','Στερεός προφυλακτήρας δακτύλων και προστασία.',{defence:.006,hp:2},{wood:4,scrap:5,crystal:0}),o('counterweight','ΑΝΤΙΒΑΡΟ','Βαρύτερος κόμβος λαβής με καλύτερη επαναφορά.',{handling:.022,force:.012},{wood:3,scrap:6,crystal:0}),o('coil','ΕΝΕΡΓΗ ΛΑΒΗ','Μονωμένη λαβή με ξεχωριστό πηνίο και ισχύ.',{power:.022,handling:.01},{wood:3,scrap:5,crystal:2})]},
 {id:'strike',name:'ΕΞΑΡΤΗΜΑ ΚΕΦΑΛΗΣ',options:[o('plain','ΚΑΘΑΡΗ ΚΕΦΑΛΗ','Η αυθεντική επιφάνεια κρούσης· οι βαθμίδες αυξάνουν τη ζημιά.',{power:.018}),o('studded','ΚΑΡΦΙΑ','Πραγματικοί μεταλλικοί ήλοι στις επιφάνειες.',{power:.023,force:.012},{wood:3,scrap:5,crystal:0}),o('spiked','ΑΚΙΔΕΣ','Ενσωματωμένες αιχμές με αυξημένη ζημιά και βάρος.',{power:.038,handling:-.015},{wood:3,scrap:7,crystal:1}),o('flanged','ΕΝΙΣΧΥΤΙΚΕΣ ΝΕΥΡΩΣΕΙΣ','Πρόσθετες νευρώσεις με μεγάλη δύναμη κρούσης.',{force:.032,power:.018,handling:-.008},{wood:2,scrap:7,crystal:0})]},cores,finish,
]);
export const SHIELD_PARTS=Object.freeze([
 {id:'rim',name:'ΠΕΡΙΜΕΤΡΙΚΗ ΘΩΡΑΚΙΣΗ',options:[o('light','ΕΛΑΦΡΙΑ','Το αυθεντικό πλαίσιο· οι βαθμίδες αυξάνουν την προστασία.',{protection:.012}),o('armored','ΘΩΡΑΚΙΣΜΕΝΗ','Πρόσθετες ακμές και μεγαλύτερη προστασία.',{protection:.018,hp:4,speed:-.003},{wood:3,scrap:6,crystal:0}),o('serrated','ΟΔΟΝΤΩΤΗ','Αιχμές περιμέτρου που τραυματίζουν κοντινό επιτιθέμενο στην απόκρουση.',{counter:.018,protection:.008},{wood:3,scrap:7,crystal:1}),o('absorber','ΑΠΟΣΒΕΣΗ','Ορατοί μηχανισμοί απορρόφησης και ευρύτερη κάλυψη.',{coverage:.012,protection:.012},{wood:2,scrap:6,crystal:2})]},
 {id:'boss',name:'ΚΕΝΤΡΙΚΟ ΕΞΑΡΤΗΜΑ',options:[o('native','ΑΡΧΙΚΟ ΣΧΕΔΙΟ','Η αρχική κατασκευή· οι βαθμίδες ενισχύουν προστασία και αντεπίθεση.',{protection:.008,counter:.01}),o('spiked','ΑΙΧΜΗ','Προεξέχον κεντρικό εξάρτημα αντεπίθεσης.',{counter:.028},{wood:3,scrap:6,crystal:0}),o('reflector','ΑΝΑΚΛΑΣΤΗΡΑΣ','Επιστρέφει μέρος της αποκρουόμενης ζημιάς στον κοντινό επιτιθέμενο.',{counter:.023,protection:.009},{wood:2,scrap:7,crystal:2}),o('reactor','ΑΝΤΙΔΡΑΣΤΗΡΑΣ','Θωρακισμένος πυρήνας με ισχυρότερη ενεργή απόκριση.',{corePower:.12,hp:3},{wood:2,scrap:7,crystal:3})]},cores,finish,
]);
const all=[...WEAPON_BLUEPRINTS,...SHIELD_BLUEPRINTS],weaponIds=WEAPON_BLUEPRINTS.map(b=>b.id),defaults=['w01','w02','w05','w09','w12'];
export const blueprint=id=>all.find(b=>b.id===id);
export const armoryCategory=id=>weaponIds.includes(id)?'weapons':'shields';
export const armoryParts=id=>weaponIds.includes(id)?WEAPON_PARTS:SHIELD_PARTS;
export const armoryAvailable=(id,tier)=>!!blueprint(id)&&Number.isFinite(tier)&&tier>=blueprint(id).tier;
const freshParts=id=>Object.fromEntries(armoryParts(id).map(p=>{const initial=p.id==='core'&&['w08','w12','s16'].includes(id)?p.options.find(o=>o.id==='arc'):p.options[0];return [p.id,{selected:initial.id,owned:Object.fromEntries((p.cosmetic?p.options:p.id==='core'?[...new Set([p.options[0],initial])]:[initial]).map(o=>[o.id,1]))}];}));
export function createArmory(){return {version:1,weapon:'auto',shield:'auto',items:Object.fromEntries(all.map(b=>[b.id,{parts:freshParts(b.id)}]))};}
export function restoreArmory(saved){const a=createArmory();if(!saved||typeof saved!=='object')return a;for(const field of ['weapon','shield']){const ids=field==='weapon'?weaponIds:SHIELD_BLUEPRINTS.map(b=>b.id);if(saved[field]==='auto'||ids.includes(saved[field]))a[field]=saved[field];}for(const b of all)for(const part of armoryParts(b.id)){const source=saved.items?.[b.id]?.parts?.[part.id],entry=a.items[b.id].parts[part.id];if(!source)continue;for(const o of part.options){const rank=Number(source.owned?.[o.id]);if(Number.isFinite(rank)&&rank>=1)entry.owned[o.id]=part.cosmetic?1:Math.min(5,Math.floor(rank));}if(part.options.some(o=>o.id===source.selected)&&entry.owned[source.selected])entry.selected=source.selected;}return a;}
export function resolveArmory(a,tier=0){tier=Math.max(0,Math.min(4,Math.floor(Number(tier)||0)));return {weapon:a.weapon!=='auto'&&armoryAvailable(a.weapon,tier)?a.weapon:defaults[tier],shield:a.shield!=='auto'&&armoryAvailable(a.shield,tier)?a.shield:'s14'};}
export function equipBlueprint(a,id,{tier=0,test=false}={}){const b=blueprint(id);if(!b||!test&&!armoryAvailable(id,tier))return false;a[weaponIds.includes(id)?'weapon':'shield']=id;return true;}
export function armoryQuote(a,id,slot,choice){const part=armoryParts(id).find(p=>p.id===slot),option=part?.options.find(o=>o.id===choice),rank=a.items?.[id]?.parts?.[slot]?.owned?.[choice]||0;if(!option)return {ok:false,reason:'Άγνωστο εξάρτημα.'};if(part.cosmetic)return {ok:false,reason:'ΚΟΣΜΗΤΙΚΟ · χωρίς αλλαγή επιδόσεων',rank};if(choice==='none')return {ok:false,reason:'Επίλεξε λειτουργικό πυρήνα.',rank};if(rank>=5)return {ok:false,reason:'ΜΕΓΙΣΤΗ ΒΑΘΜΙΔΑ',rank};const scale=(rank+1)*(blueprint(id).tier>=3?1.5:1);return {ok:true,rank,nextRank:rank+1,cost:Object.fromEntries(['wood','scrap','crystal'].map(k=>[k,Math.ceil((option.cost[k]||0)*scale)]))};}
export function equipArmoryPart(a,id,slot,choice,{tier=0,test=false}={}){const entry=a.items?.[id]?.parts?.[slot];if(!entry?.owned?.[choice]||!test&&!armoryAvailable(id,tier))return false;entry.selected=choice;return true;}
export function purchaseArmoryPart(a,materials,id,slot,choice,{tier=0,test=false}={}){if(!test&&!armoryAvailable(id,tier))return {ok:false,reason:'Χρειάζεται πρώτα η αντίστοιχη κατασκευή όπλου.'};const q=armoryQuote(a,id,slot,choice);if(!q.ok)return q;if(!test&&Object.entries(q.cost).some(([k,n])=>(materials[k]||0)<n))return {...q,ok:false,reason:'Δεν υπάρχουν αρκετά υλικά.'};if(!test)for(const [k,n]of Object.entries(q.cost))materials[k]-=n;const entry=a.items[id].parts[slot];entry.selected=choice;entry.owned[choice]=q.nextRank;return {...q,ok:true};}
export function armoryStats(a,id){const b=blueprint(id);if(!b)return null;const weapon=weaponIds.includes(id),s=weapon?{power:b.power,reach:b.reach,handling:b.handling,force:b.force,hp:0,defence:0}:{protection:b.protection,coverage:b.coverage,hp:b.hp,speed:b.speed,counter:0,corePower:1};for(const part of armoryParts(id)){if(part.cosmetic)continue;const entry=a.items[id].parts[part.id],option=part.options.find(o=>o.id===entry.selected),rank=entry.owned[entry.selected]||1,factor=entry.selected===part.options[0].id?rank-1:rank;for(const [k,n]of Object.entries(option.effect)){if(!(k in s))continue;if(k==='coverage')s.coverage+=n*factor*Math.PI;else s[k]=(s[k]||0)+n*factor;}}const core=a.items[id].parts.core;s.core=core.selected;s.coreRank=core.owned[core.selected]||1;if(weapon){s.maxContacts=id==='w08'?2:1;s.damagePerContact=id==='w08'?.60:1;s.arcBonusTargets=id==='w12'?1:0;s.coreEfficiency=id==='w12'?1.15:1;}if(weapon){s.power=Math.min(2.4,s.power);s.reach=Math.min(1.5,s.reach);s.handling=Math.max(.6,Math.min(1.6,s.handling));s.defence=Math.min(.15,s.defence);}else{s.protection=Math.min(.8,s.protection);s.coverage=Math.min(Math.PI*.49,s.coverage);s.counter=Math.min(.4,s.counter);}return s;}
