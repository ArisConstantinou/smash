import * as THREE from './vendor/three.module.js';
import {makeWarrior} from './models.js?v=20261108-workshop1';
import {createMountModel} from './mount-models.js?v=20261108-workshop1';import {poseMountedRider,resetMountedRider} from './mount-rider.js?v=20261108-startup1';
import {applyPlayerCustomization} from './player-customization.js?v=20261108-workshop1';
import {partArt,toolArt} from './workshop-art.js?v=20261108-workshop1';
import {equipmentBuilder} from './equipment-shapes.js?v=20261108-workshop1';
import {MOUNT_FAMILIES,partDefinitions,partRank,garageParts,upgradeQuote,purchasePart,equipPart,restoreGarage,mountStats,playerCustomStats,familyUnlocked,resolveMount} from './mount-rules.js?v=20261108-workshop1';

const names={hp:'ΖΩΗ',speed:'ΤΑΧΥΤΗΤΑ',power:'ΙΣΧΥΣ',defence:'ΑΜΥΝΑ',energy:'ΕΝΕΡΓΕΙΑ',regen:'ΑΝΑΠΛΗΡΩΣΗ',contact:'ΖΗΜΙΑ ΤΡΟΧΩΝ',frontContact:'ΕΜΒΟΛΙΣΜΟΣ',handling:'ΣΤΡΟΦΗ',riderProtection:'ΠΡΟΣΤΑΣΙΑ ΑΝΑΒΑΤΗ',mass:'ΒΑΡΟΣ'};
const format=(key,v)=>['defence','riderProtection'].includes(key)?Math.round(v*100)+'%':Number.isInteger(v)?String(v):v.toFixed(2);
export function createMountWorkshop({document:doc=globalThis.document,getContext,onChange,onSave=()=>false,onOpen=()=>{},onClose=()=>{},onTestStart=()=>{},canModify=()=>'',onRepair=()=>({ok:false,reason:'Η επισκευή γίνεται στον γύρο.'})}){
 const $=id=>doc.getElementById(id),root=$('mountWorkshop');
 let open=false,view='together',kind='bicycle',slot='frontWheel',option='standard',renderer,scene,camera,assembly,hero,model,drag=null,rotation=.1,zoom=1,context,previewGarage,returnFocus,highlights=[],drawKey='',previewWidth=1,previewHeight=1;
 const button=(text,fn,selected=false,art)=>{const b=doc.createElement('button');b.type='button';if(art)b.append(art);const label=doc.createElement('span');label.className='card-label';label.textContent=text;b.append(label);b.setAttribute('aria-pressed',String(selected));b.onclick=fn;return b;};
 const art=(target,slot,id)=>partArt(doc,target,slot,id,context.weaponTier??0);
 function dirty(saved){const s=$('workshopSaveState');s.textContent=context.test?'ΠΡΟΣΩΡΙΝΗ ΔΟΚΙΜΗ':saved?'ΑΥΤΟΜΑΤΑ ΑΠΟΘΗΚΕΥΜΕΝΟ':'ΑΠΑΙΤΕΙΤΑΙ SAVE';}
 function ensurePreview(){
  if(renderer)return;
  // The isolated workshop follows the existing title-screen preview renderer.
  // Main gameplay remains on its explicitly selected WebGPU backend.
  renderer=new THREE.WebGLRenderer({canvas:$('mountPreview'),antialias:true,alpha:true});renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio||1,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;
  scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(35,1,.1,100);scene.add(new THREE.HemisphereLight(0xd7eff1,0x3c4d52,2.4));const light=new THREE.DirectionalLight(0xffe0ad,3);light.position.set(-3,7,6);scene.add(light);
  light.castShadow=true;light.shadow.mapSize.set(512,512);Object.assign(light.shadow.camera,{left:-4,right:4,top:5,bottom:-3,near:.1,far:20});light.shadow.bias=-.0003;light.shadow.normalBias=.02;
  assembly=new THREE.Group();scene.add(assembly);hero=makeWarrior();assembly.add(hero);
  const floor=new THREE.Mesh(new THREE.CylinderGeometry(2,2.12,.15,48),new THREE.MeshLambertMaterial({color:0x29434b}));floor.position.y=-.12;floor.receiveShadow=true;scene.add(floor);
  const plinth=new THREE.Mesh(new THREE.CylinderGeometry(2.12,2.28,.20,12),new THREE.MeshLambertMaterial({color:0x122c39}));plinth.position.y=-.29;scene.add(plinth);
  const trim=equipmentBuilder();for(let i=0;i<12;i++){const a=i*Math.PI/6;trim.box(i%3?0xb18a47:0x77dbe7,Math.sin(a)*2.10,-.16,Math.cos(a)*2.10,.24,.07,.12,0,a);}scene.add(trim.finish(new THREE.MeshLambertMaterial({vertexColors:true})));
  const edge=new THREE.Mesh(new THREE.TorusGeometry(2.02,.025,4,64),new THREE.MeshBasicMaterial({color:0xd4ab60}));edge.rotation.x=Math.PI/2;edge.position.y=-.04;scene.add(edge);
  const canvas=$('mountPreview'),resize=()=>{previewWidth=Math.max(1,canvas.clientWidth);previewHeight=Math.max(1,canvas.clientHeight);};resize();if(typeof ResizeObserver!=='undefined')new ResizeObserver(resize).observe(canvas);else globalThis.addEventListener?.('resize',resize);canvas.addEventListener('webglcontextrestored',()=>{drawKey='';});canvas.onpointerdown=e=>{drag={id:e.pointerId,x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);};
  canvas.onpointermove=e=>{if(!drag||drag.id!==e.pointerId)return;rotation+=(e.clientX-drag.x)*.012;drag.x=e.clientX;drag.y=e.clientY;};
  for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,()=>drag=null);
  canvas.addEventListener('wheel',e=>{e.preventDefault();zoom=Math.max(.65,Math.min(1.65,zoom+Math.sign(e.deltaY)*.08));},{passive:false});
 }
 function currentKind(){return view==='player'?'player':kind;}
 function rebuildPreview(){
  drawKey='';
  ensurePreview();for(const {mesh,original,clone}of highlights){mesh.geometry=original;delete mesh.userData.workshopSelected;clone.dispose();}highlights=[];model?.userData.dispose();resetMountedRider(hero);
  hero.position.set(0,0,0);hero.rotation.set(0,0,0);const equipment=context.weaponTier??0;hero.userData.setEquipment(equipment);applyPlayerCustomization(hero,previewGarage);
  hero.visible=view!=='mount';hero.userData.setStance(0);hero.userData.body.rotation.set(0,0,0);
  const u=hero.userData;u.weaponRig.position.copy(u.weaponRestPosition);u.weaponRig.rotation.set(u.weaponRest.x,u.weaponRest.y,u.weaponRest.z);
  model=createMountModel(kind,previewGarage);assembly.add(model);model.visible=view!=='player';
  if(view==='together')poseMountedRider(hero,model);else if(view==='player'){hero.updateMatrixWorld(true);const feet=new THREE.Box3().setFromObject(u.leftLeg);feet.union(new THREE.Box3().setFromObject(u.rightLeg));hero.position.y=-.045-feet.min.y;}u.updateGrip();
  const tint=(mesh,filter=()=>true)=>{const original=mesh.geometry,clone=original.clone(),p=clone.attributes.position,c=clone.attributes.color;if(!c){clone.dispose();return;}for(let i=0;i<c.count;i++)if(filter(p,i))c.setXYZ(i,Math.min(1,c.getX(i)*1.2+.12),Math.min(1,c.getY(i)*1.1+.08),c.getZ(i)*.82);mesh.geometry=clone;mesh.userData.workshopSelected=true;highlights.push({mesh,original,clone});};
  // Keep authored colors. The selected card identifies the part without tinting it.
 }
 function statsFor(g){return currentKind()==='player'?playerCustomStats(g,{hasShield:context.weaponTier>=2}):mountStats(g,kind);}
 function candidate(){
  const g=restoreGarage(context.garage),entry=garageParts(g,currentKind())[slot];
  const rank=entry.owned[option]||1;entry.owned[option]=rank;entry.selected=option;return g;
 }
 function render(){
  if(!open)return;context=getContext();const target=currentKind(),defs=partDefinitions(target);
  if(!defs.some(p=>p.id===slot))slot=defs[0].id;
  const part=defs.find(p=>p.id===slot);if(!part.options.some(o=>o.id===option))option=garageParts(context.garage,target)[slot].selected;
  $('workshopTabs').replaceChildren(...[['player','ΠΑΙΚΤΗΣ'],['mount','ΟΧΗΜΑ'],['together','ΜΑΖΙ']].map(([id,label])=>button(label,()=>{view=id;slot=id==='player'?'head':'frontWheel';option=garageParts(context.garage,currentKind())[slot].selected;render();},view===id,id==='mount'?art(kind,'chassis'):toolArt(doc,id))));
  $('workshopFamilies').replaceChildren(...MOUNT_FAMILIES.map(f=>button(f.name+' · LV '+f.level+(familyUnlocked(f.id,context.level)?'':' 🔒'),()=>{kind=f.id;option=garageParts(context.garage,currentKind())[slot]?.selected||'standard';render();},kind===f.id,art(f.id,'chassis'))));
  $('workshopParts').replaceChildren(...defs.filter(p=>p.id!=='mobility'||kind==='scifi').map(p=>button(p.name,()=>{slot=p.id;option=garageParts(context.garage,target)[slot].selected;render();},slot===p.id,art(target,p.id,garageParts(context.garage,target)[p.id].selected))));
  $('workshopPartName').textContent=part.name;
  const chosen=part.options.find(o=>o.id===option),entry=garageParts(context.garage,target)[slot];
  $('workshopOptions').replaceChildren(...part.options.map(o=>{const rank=partRank(context.garage,target,slot,o.id),b=button(o.name,()=>{option=o.id;render();},option===o.id,art(target,slot,o.id));const status=doc.createElement('small');status.textContent=rank?' '+'◆'.repeat(rank)+'◇'.repeat(5-rank):' ΚΑΤΑΣΚΕΥΗ';b.append(status);b.title=o.description;b.dataset.equipped=entry.selected===o.id;return b;}));
  $('workshopDescription').textContent=chosen.description+((slot==='frontWheel'||slot==='rearWheel')&&garageParts(context.garage,kind).mobility?.selected==='hover'?' Στο hover οι τροχοί αντικαθίστανται από pods· οι ακίδες και τα πριόνια ενεργοποιούνται όταν επανέλθουν οι τροχοί.':'');
  const quote=upgradeQuote(context.garage,target,slot,option),rank=partRank(context.garage,target,slot,option);
  previewGarage=candidate();const before=statsFor(context.garage),after=statsFor(previewGarage),upgraded=restoreGarage(previewGarage);
  if(quote.ok)garageParts(upgraded,target)[slot].owned[option]=quote.nextRank;
  const next=statsFor(upgraded),valueText=(key,value)=>key==='mass'||target==='player'&&['power','speed'].includes(key)?value.toFixed(2)+'×':format(key,value);
  const stats=$('workshopStats');stats.replaceChildren();const legend=doc.createElement('p');legend.textContent='ΤΩΡΑ → ΕΠΙΛΟΓΗ · ↑ ΜΕΤΑ ΤΗΝ ΑΝΑΒΑΘΜΙΣΗ';stats.appendChild(legend);for(const key of Object.keys(names)){
   if(before[key]===undefined||after[key]===undefined)continue;
   const row=doc.createElement('div'),label=doc.createElement('span'),value=doc.createElement('strong');label.textContent=names[key];value.textContent=valueText(key,before[key])+(before[key]!==after[key]?' → '+valueText(key,after[key]):'')+(quote.ok&&next[key]!==after[key]?' · ↑ '+valueText(key,next[key]):'');row.appendChild(label);row.appendChild(value);stats.appendChild(row);
  }
  if(after.weapons?.length){const row=doc.createElement('p');row.textContent=after.weapons.map(w=>{const name=partDefinitions(kind).find(p=>p.id===w.slot)?.options.find(o=>o.id===w.id)?.name||w.id,n=next.weapons.find(v=>v.slot===w.slot);return name+' · '+w.damage+(n?.damage!==w.damage?' → ↑ '+n.damage:'')+' ΖΗΜΙΑ / '+w.interval.toFixed(2)+(n?.interval!==w.interval?' → ↑ '+n.interval.toFixed(2):'')+' s · '+w.cost+' ⚡';}).join(' | ');stats.appendChild(row);}
  $('workshopCost').replaceChildren();if(quote.ok)for(const [k,v]of Object.entries(quote.cost)){const cell=doc.createElement('span');cell.append(toolArt(doc,k));const label=doc.createElement('span');label.textContent=({wood:'ΞΥΛΟ',scrap:'ΜΕΤΑΛΛΟ',crystal:'ΚΡΥΣΤΑΛΛΟΙ'}[k])+' '+(context.materials[k]||0)+' / '+v;cell.append(label);$('workshopCost').append(cell);}else $('workshopCost').textContent=quote.reason;
  $('workshopMode').textContent=context.test?'ΔΟΚΙΜΗ · οι αγορές δεν δαπανούν ή αποθηκεύουν υλικά':'LV '+context.level+' · οι αναβαθμίσεις αλλάζουν πραγματικές επιδόσεις';
  const locked=target!=='player'&&!familyUnlocked(kind,context.level)||target==='player'&&slot==='shield'&&context.weaponTier<2;
  $('workshopEquip').disabled=locked||!rank||entry.selected===option;
  $('workshopUpgrade').disabled=locked||!quote.ok||(!context.test&&Object.entries(quote.cost).some(([k,n])=>(context.materials[k]||0)<n));
  $('workshopUpgradeLabel').textContent=rank?'ΑΝΑΒΑΘΜΙΣΗ → '+(quote.nextRank||5):'ΚΑΤΑΣΚΕΥΗ';
  $('workshopUse').disabled=!familyUnlocked(kind,context.level)||context.garage.selectedMount===kind;
  $('workshopUseLabel').textContent='ΧΡΗΣΗ '+MOUNT_FAMILIES.find(f=>f.id===kind).name;$('workshopUse').hidden=target==='player';$('workshopAuto').hidden=target==='player';
  const repair=context.actualMount?.repairCost||0;$('workshopRepair').hidden=context.menu||target==='player';$('workshopRepair').disabled=locked||context.actualMountKind!==kind||!repair||!context.test&&(context.materials.scrap||0)<repair;$('workshopRepairLabel').textContent=repair?'ΕΠΙΣΚΕΥΗ · '+repair+' ΜΕΤΑΛΛΟ':'ΠΛΗΡΗΣ ΖΩΗ ΟΧΗΜΑΤΟΣ';
  $('workshopTestControls').hidden=!context.menu;
  $('workshopSave').disabled=context.test;$('workshopSave').title=context.test?'Οι δοκιμαστικές αγορές δεν αποθηκεύονται.':'Αποθήκευση εξοπλισμού, βαθμίδων και υλικών στη συσκευή.';root.dataset.view=view;
  rebuildPreview();
 }
 function transact(upgrade){
  const target=currentKind(),reason=canModify({kind:target,slot,option});if(reason){$('workshopFeedback').textContent=reason;return;}
  const result=upgrade?purchasePart(context.garage,context.materials,target,slot,option,{level:context.level,test:context.test}):{ok:equipPart(context.garage,target,slot,option,{level:context.level})};
  if(result.ok){dirty(onChange(context));$('workshopFeedback').textContent=upgrade?'Η αναβάθμιση εφαρμόστηκε.':'Το εξάρτημα εξοπλίστηκε.';render();}else $('workshopFeedback').textContent=result.reason||'Το εξάρτημα δεν είναι διαθέσιμο.';
 }
 function close(){if(!open)return;open=false;root.hidden=true;drag=null;onClose();returnFocus?.focus?.({preventScroll:true});}
 for(let n=1;n<=30;n++){const o=doc.createElement('option');o.value=String(n);o.textContent='LV '+n;$('workshopTestLevel').appendChild(o);}
 $('workshopTestStart').onclick=()=>{const level=Number($('workshopTestLevel').value);close();onTestStart(level);};
 $('workshopClose').onclick=close;$('workshopEquip').onclick=()=>transact(false);$('workshopUpgrade').onclick=()=>transact(true);
 $('workshopSave').onclick=()=>{if(context.test)return;const ok=onSave(context);$('workshopSaveState').textContent=ok?'ΑΠΟΘΗΚΕΥΤΗΚΕ ✓':'ΑΠΟΤΥΧΙΑ ΑΠΟΘΗΚΕΥΣΗΣ';$('workshopFeedback').textContent=ok?'Ο εξοπλισμός και τα υλικά αποθηκεύτηκαν σε αυτή τη συσκευή.':'Δεν ήταν δυνατή η αποθήκευση. Έλεγξε τον διαθέσιμο χώρο του browser.';};
 for(const [id,icon]of [['workshopSave','save'],['workshopClose','close'],['workshopReset','rotate'],['workshopZoomOut','zoom-out'],['workshopZoomIn','zoom-in'],['workshopEquip','equip'],['workshopUpgrade','upgrade'],['workshopTestStart','play'],['workshopAuto','rotate'],['workshopUse','equip'],['workshopRepair','repair']])$(id).prepend(toolArt(doc,icon));
 $('workshopUse').onclick=()=>{const reason=canModify({kind,slot:'chassis'});if(reason){$('workshopFeedback').textContent=reason;return;}context.garage.selectedMount=kind;dirty(onChange(context));render();};
 $('workshopAuto').onclick=()=>{const reason=canModify({kind,slot:'chassis'});if(reason){$('workshopFeedback').textContent=reason;return;}context.garage.selectedMount='auto';dirty(onChange(context));kind=resolveMount(context.garage,context.level);render();};
 $('workshopRepair').onclick=()=>{const result=onRepair({...context,repairKind:kind});$('workshopFeedback').textContent=result.ok?'Η επισκευή ολοκληρώθηκε.':result.reason;render();};
 $('workshopReset').onclick=()=>{rotation=.1;zoom=1;};$('workshopZoomIn').onclick=()=>zoom=Math.max(.65,zoom-.1);$('workshopZoomOut').onclick=()=>zoom=Math.min(1.65,zoom+.1);
 // Rebuilding a part list can remove the focused button. Capture at document
 // level so Escape/Tab still belong to the dialog instead of resuming combat.
 doc.addEventListener('keydown',e=>{if(!open)return;e.stopPropagation();if(e.code==='Escape'||e.code==='KeyI'&&!e.repeat&&!['INPUT','SELECT','TEXTAREA'].includes(doc.activeElement?.tagName)){e.preventDefault();close();}if(e.code==='Tab'){const items=[...root.querySelectorAll('button:not([disabled]),select,canvas')].filter(n=>!n.hidden&&n.offsetParent!==null),first=items[0],last=items.at(-1);if(!root.contains(doc.activeElement)){e.preventDefault();first?.focus();}else if(e.shiftKey&&doc.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&doc.activeElement===last){e.preventDefault();first?.focus();}}},true);
 return {
  get isOpen(){return open;},
  open(){if(open)return;returnFocus=doc.activeElement;context=getContext();kind=resolveMount(context.garage,context.level);view='together';slot='frontWheel';option=garageParts(context.garage,kind)[slot].selected;open=true;root.hidden=false;$('workshopTestLevel').value=String(context.level);$('workshopFeedback').textContent='';$('workshopSaveState').textContent=context.test?'ΠΡΟΣΩΡΙΝΗ ΔΟΚΙΜΗ':'Ο ΕΞΟΠΛΙΣΜΟΣ ΣΟΥ';onOpen();render();$('workshopClose').focus();},close,
  update(){if(!open||!renderer)return;const canvas=$('mountPreview'),w=previewWidth,h=previewHeight,key=[w,h,rotation,zoom].join(':');if(drawKey===key)return;if(!drawKey||assembly.rotation.y!==rotation)renderer.shadowMap.needsUpdate=true;drawKey=key;if(canvas.width!==Math.round(w*renderer.getPixelRatio())||canvas.height!==Math.round(h*renderer.getPixelRatio()))renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();assembly.rotation.y=rotation;camera.position.set(4.4*zoom,2.8*zoom,5.2*zoom);camera.lookAt(0,1.35,0);renderer.render(scene,camera);},
 };
}
