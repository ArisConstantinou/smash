import * as THREE from './vendor/three.module.js';
import {makeWarrior} from './models.js?v=20261108-mount1';
import {createMountModel} from './mount-models.js?v=20261108-mount1';import {poseMountedRider,resetMountedRider} from './mount-rider.js?v=20261108-startup1';
import {applyPlayerCustomization} from './player-customization.js?v=20261108-mount1';
import {MOUNT_FAMILIES,partDefinitions,partRank,garageParts,upgradeQuote,purchasePart,equipPart,restoreGarage,mountStats,playerCustomStats,familyUnlocked,resolveMount} from './mount-rules.js?v=20261108-mount1';

const names={hp:'ΖΩΗ',speed:'ΤΑΧΥΤΗΤΑ',power:'ΙΣΧΥΣ',defence:'ΑΜΥΝΑ',energy:'ΕΝΕΡΓΕΙΑ',regen:'ΑΝΑΠΛΗΡΩΣΗ',contact:'ΖΗΜΙΑ ΤΡΟΧΩΝ',frontContact:'ΕΜΒΟΛΙΣΜΟΣ',handling:'ΣΤΡΟΦΗ',riderProtection:'ΠΡΟΣΤΑΣΙΑ ΑΝΑΒΑΤΗ',mass:'ΒΑΡΟΣ'};
const format=(key,v)=>['defence','riderProtection'].includes(key)?Math.round(v*100)+'%':Number.isInteger(v)?String(v):v.toFixed(2);
export function createMountWorkshop({document:doc=globalThis.document,getContext,onChange,onOpen=()=>{},onClose=()=>{},onTestStart=()=>{},canModify=()=>'',onRepair=()=>({ok:false,reason:'Η επισκευή γίνεται στον γύρο.'})}){
 const $=id=>doc.getElementById(id),root=$('mountWorkshop');
 let open=false,view='together',kind='bicycle',slot='frontWheel',option='standard',renderer,scene,camera,assembly,hero,model,drag=null,rotation=-.65,zoom=1,context,previewGarage,returnFocus,highlights=[];
 const button=(text,fn,selected=false)=>{const b=doc.createElement('button');b.type='button';b.textContent=text;b.setAttribute('aria-pressed',String(selected));b.onclick=fn;return b;};
 function ensurePreview(){
  if(renderer)return;
  // The isolated workshop follows the existing title-screen preview renderer.
  // Main gameplay remains on its explicitly selected WebGPU backend.
  renderer=new THREE.WebGLRenderer({canvas:$('mountPreview'),antialias:true,alpha:true});renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio||1,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;
  scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(35,1,.1,100);scene.add(new THREE.HemisphereLight(0xd7eff1,0x3c4d52,2.4));const light=new THREE.DirectionalLight(0xffe0ad,3);light.position.set(-3,7,6);scene.add(light);
  assembly=new THREE.Group();scene.add(assembly);hero=makeWarrior();assembly.add(hero);
  const floor=new THREE.Mesh(new THREE.CylinderGeometry(2,2.12,.15,48),new THREE.MeshLambertMaterial({color:0x29434b}));floor.position.y=-.12;scene.add(floor);
  const edge=new THREE.Mesh(new THREE.TorusGeometry(2.02,.025,4,64),new THREE.MeshBasicMaterial({color:0xd4ab60}));edge.rotation.x=Math.PI/2;edge.position.y=-.04;scene.add(edge);
  const canvas=$('mountPreview');canvas.onpointerdown=e=>{drag={id:e.pointerId,x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);};
  canvas.onpointermove=e=>{if(!drag||drag.id!==e.pointerId)return;rotation+=(e.clientX-drag.x)*.012;drag.x=e.clientX;drag.y=e.clientY;};
  for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,()=>drag=null);
  canvas.addEventListener('wheel',e=>{e.preventDefault();zoom=Math.max(.65,Math.min(1.65,zoom+Math.sign(e.deltaY)*.08));},{passive:false});
 }
 function currentKind(){return view==='player'?'player':kind;}
 function rebuildPreview(){
  ensurePreview();for(const {mesh,original,clone}of highlights){mesh.geometry=original;delete mesh.userData.workshopSelected;clone.dispose();}highlights=[];model?.userData.dispose();resetMountedRider(hero);
  const equipment=context.weaponTier??0;hero.userData.setEquipment(equipment);applyPlayerCustomization(hero,previewGarage);
  hero.visible=view!=='mount';hero.userData.setStance(0);hero.userData.body.rotation.set(0,0,0);
  const u=hero.userData;u.weaponRig.position.copy(u.weaponRestPosition);u.weaponRig.rotation.set(u.weaponRest.x,u.weaponRest.y,u.weaponRest.z);
  model=createMountModel(kind,previewGarage);assembly.add(model);model.visible=view!=='player';
  if(view==='together')poseMountedRider(hero,model);u.updateGrip();
  const tint=(mesh,filter=()=>true)=>{const original=mesh.geometry,clone=original.clone(),p=clone.attributes.position,c=clone.attributes.color;if(!c){clone.dispose();return;}for(let i=0;i<c.count;i++)if(filter(p,i))c.setXYZ(i,Math.min(1,c.getX(i)*1.2+.12),Math.min(1,c.getY(i)*1.1+.08),c.getZ(i)*.82);mesh.geometry=clone;mesh.userData.workshopSelected=true;highlights.push({mesh,original,clone});};
  if(view==='player'){
   const groups=slot==='head'||slot==='chest'?[u.body]:slot==='arms'?[u.leftArm,u.rightArm]:slot==='legs'||slot==='boots'?[u.leftLeg,u.rightLeg]:slot==='shield'?[u.shield]:[u.weaponRig];
   for(const group of groups)group.traverse(mesh=>{if(!mesh.isMesh)return;if(slot==='head'||slot==='chest')tint(mesh,(p,i)=>slot==='head'?p.getY(i)>1.4:p.getY(i)>.69&&p.getY(i)<1.4);else if(slot==='boots'){if(mesh.parent===u.leftLeg.userData.shin||mesh.parent===u.rightLeg.userData.shin)tint(mesh,(p,i)=>p.getY(i)<-.16);}else tint(mesh);});
  }else model.traverse(mesh=>{if(!mesh.isMesh)return;for(let node=mesh;node&&node!==model;node=node.parent)if(node.userData.slot){if(node.userData.slot===slot)tint(mesh);break;}});
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
  $('workshopTabs').replaceChildren(...[['player','ΠΑΙΚΤΗΣ'],['mount','ΟΧΗΜΑ'],['together','ΜΑΖΙ']].map(([id,label])=>button(label,()=>{view=id;slot=id==='player'?'head':'frontWheel';option=garageParts(context.garage,currentKind())[slot].selected;render();},view===id)));
  $('workshopFamilies').replaceChildren(...MOUNT_FAMILIES.map(f=>button(f.name+' · LV '+f.level+(familyUnlocked(f.id,context.level)?'':' 🔒'),()=>{kind=f.id;option=garageParts(context.garage,currentKind())[slot]?.selected||'standard';render();},kind===f.id)));
  $('workshopParts').replaceChildren(...defs.filter(p=>p.id!=='mobility'||kind==='scifi').map(p=>button(p.name,()=>{slot=p.id;option=garageParts(context.garage,target)[slot].selected;render();},slot===p.id)));
  $('workshopPartName').textContent=part.name;
  const chosen=part.options.find(o=>o.id===option),entry=garageParts(context.garage,target)[slot];
  $('workshopOptions').replaceChildren(...part.options.map(o=>{const rank=partRank(context.garage,target,slot,o.id);return button(o.name+(rank?' · '+rank+'/5':' · ΝΕΟ'),()=>{option=o.id;render();},option===o.id);}));
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
  $('workshopCost').textContent=quote.ok?Object.entries(quote.cost).map(([k,v])=>({wood:'ΞΥΛΟ',scrap:'ΜΕΤΑΛΛΟ',crystal:'ΚΡΥΣΤΑΛΛΟΙ'}[k])+' '+(context.materials[k]||0)+' / '+v).join(' · '):quote.reason;
  $('workshopMode').textContent=context.test?'ΔΟΚΙΜΗ · οι αγορές δεν δαπανούν ή αποθηκεύουν υλικά':'LV '+context.level+' · οι αναβαθμίσεις αλλάζουν πραγματικές επιδόσεις';
  const locked=target!=='player'&&!familyUnlocked(kind,context.level)||target==='player'&&slot==='shield'&&context.weaponTier<2;
  $('workshopEquip').disabled=locked||!rank||entry.selected===option;
  $('workshopUpgrade').disabled=locked||!quote.ok||(!context.test&&Object.entries(quote.cost).some(([k,n])=>(context.materials[k]||0)<n));
  $('workshopUpgrade').textContent=rank?'ΑΝΑΒΑΘΜΙΣΗ → '+(quote.nextRank||5):'ΚΑΤΑΣΚΕΥΗ';
  $('workshopUse').disabled=!familyUnlocked(kind,context.level)||context.garage.selectedMount===kind;
  $('workshopUse').textContent='ΧΡΗΣΗ '+MOUNT_FAMILIES.find(f=>f.id===kind).name;
  const repair=context.actualMount?.repairCost||0;$('workshopRepair').hidden=context.menu||target==='player';$('workshopRepair').disabled=locked||context.actualMountKind!==kind||!repair||!context.test&&(context.materials.scrap||0)<repair;$('workshopRepair').textContent=repair?'ΕΠΙΣΚΕΥΗ · '+repair+' ΜΕΤΑΛΛΟ':'ΠΛΗΡΗΣ ΖΩΗ ΟΧΗΜΑΤΟΣ';
  $('workshopTestControls').hidden=!context.menu;
  rebuildPreview();
 }
 function transact(upgrade){
  const target=currentKind(),reason=canModify({kind:target,slot,option});if(reason){$('workshopFeedback').textContent=reason;return;}
  const result=upgrade?purchasePart(context.garage,context.materials,target,slot,option,{level:context.level,test:context.test}):{ok:equipPart(context.garage,target,slot,option,{level:context.level})};
  if(result.ok){onChange(context);$('workshopFeedback').textContent=upgrade?'Η αναβάθμιση εφαρμόστηκε.':'Το εξάρτημα εξοπλίστηκε.';render();}else $('workshopFeedback').textContent=result.reason||'Το εξάρτημα δεν είναι διαθέσιμο.';
 }
 function close(){if(!open)return;open=false;root.hidden=true;drag=null;onClose();returnFocus?.focus?.({preventScroll:true});}
 for(let n=1;n<=30;n++){const o=doc.createElement('option');o.value=String(n);o.textContent='LV '+n;$('workshopTestLevel').appendChild(o);}
 $('workshopTestStart').onclick=()=>{const level=Number($('workshopTestLevel').value);close();onTestStart(level);};
 $('workshopClose').onclick=close;$('workshopEquip').onclick=()=>transact(false);$('workshopUpgrade').onclick=()=>transact(true);
 $('workshopUse').onclick=()=>{const reason=canModify({kind,slot:'chassis'});if(reason){$('workshopFeedback').textContent=reason;return;}context.garage.selectedMount=kind;onChange(context);render();};
 $('workshopAuto').onclick=()=>{const reason=canModify({kind,slot:'chassis'});if(reason){$('workshopFeedback').textContent=reason;return;}context.garage.selectedMount='auto';onChange(context);kind=resolveMount(context.garage,context.level);render();};
 $('workshopRepair').onclick=()=>{const result=onRepair({...context,repairKind:kind});$('workshopFeedback').textContent=result.ok?'Η επισκευή ολοκληρώθηκε.':result.reason;render();};
 $('workshopReset').onclick=()=>{rotation=-.65;zoom=1;};$('workshopZoomIn').onclick=()=>zoom=Math.max(.65,zoom-.1);$('workshopZoomOut').onclick=()=>zoom=Math.min(1.65,zoom+.1);
 // Rebuilding a part list can remove the focused button. Capture at document
 // level so Escape/Tab still belong to the dialog instead of resuming combat.
 doc.addEventListener('keydown',e=>{if(!open)return;e.stopPropagation();if(e.code==='Escape'){e.preventDefault();close();}if(e.code==='Tab'){const items=[...root.querySelectorAll('button:not([disabled]),select,canvas')].filter(n=>!n.hidden&&n.offsetParent!==null),first=items[0],last=items.at(-1);if(!root.contains(doc.activeElement)){e.preventDefault();first?.focus();}else if(e.shiftKey&&doc.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&doc.activeElement===last){e.preventDefault();first?.focus();}}},true);
 return {
  get isOpen(){return open;},
  open(){if(open)return;returnFocus=doc.activeElement;context=getContext();kind=resolveMount(context.garage,context.level);view='together';slot='frontWheel';option=garageParts(context.garage,kind)[slot].selected;open=true;root.hidden=false;$('workshopTestLevel').value=String(context.level);$('workshopFeedback').textContent='';onOpen();render();$('workshopClose').focus();},close,
  update(){if(!open||!renderer)return;const canvas=$('mountPreview'),w=Math.max(1,canvas.clientWidth),h=Math.max(1,canvas.clientHeight);if(canvas.width!==Math.round(w*renderer.getPixelRatio())||canvas.height!==Math.round(h*renderer.getPixelRatio()))renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();assembly.rotation.y=rotation;camera.position.set(4.4*zoom,2.8*zoom,5.2*zoom);camera.lookAt(0,1.35,0);renderer.render(scene,camera);},
 };
}
