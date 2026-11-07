import {DestructionSystem} from './destruction.js?v=20261107-damage8';
import {selectThrowLock,punchStats,samplePunchMotion,restSpotClear,nearestPickupPoint,findWeaponRest} from './combat-tools.js?v=20261107-forge9';
import {bodyMass,enemyLevel,enemyHealthColor,isVehicle,kickStats,kickVelocity,transferMomentum,wallSlamResponse,firstVehicleContact,sampleKickMotion} from './kick-physics.js?v=20261107-forge9';
import * as THREE from './vendor/three.module.js';
import {makeWarrior,makeEnemy,makeBoss,makeTreasure} from './models.js?v=20261107-forge9';
import {makeCityEnemy,installEnemyHead} from './enemy-models.js?v=20261107-forge9';
import {createWorld} from './world.js?v=20261107-forge9';
import {GameAudio} from './audio.js?v=20261107-forge9';
import {COMBO_WINDOW,createHitCombo,resetHitCombo,tickHitCombo,registerComboHit,comboMultiplier,scaleComboReward,impactMaterial} from './combat-feedback.js?v=20261106-feel1';
import {findBattleOccluders,applyOccluderFade} from './occlusion.js?v=20261107-forge9';
import {GOAL,BOUNDS,clamp,lerp,normalize,screenMovement,nearestPoint,circleOverlaps,moveCircle,attackStats,destructionPercent,UPGRADE_DEFS,calculateStats} from './core.js?v=20261107-forge9';
import {segmentCircleHit,firstHammerHit,facingCoverage} from './combat.js?v=20261107-forge9';
import {wavePlan,waveBatch,enemyTypeForWave,enemyStatsForWave} from './waves.js?v=20261106-feel1';
import {createSwingSequence,selectHammerSwing,sampleSpinMotion,getHammerSwingDuration,sampleHammerSwing,SWING_CONTACT_START,SWING_CONTACT_END} from './hammer-motion.js?v=20261106-kick6';
import {MAX_CHARACTER_LEVEL,CHARACTER_WEAPONS,MATERIAL_TYPES,createCharacterProgression,awardCharacterXp,collectCharacterMaterial,getCharacterStats,getForgeStatus,forgeNextWeapon,xpForNextLevel,restoreCharacterProgression} from './character-progression.js?v=20261107-combat7';
import {initEnemyReaction,updateEnemyThreat,startEnemyFear,interruptEnemyAttack,poseEnemyReaction,applyEnemyFlash} from './enemy-reactions.js?v=20261106-feel1';
import {createForgeMenu} from './forge-menu.js?v=20261107-forge9';

const $ = id => document.getElementById(id);
const save = (key,value) => {try {localStorage.setItem(key,JSON.stringify(value));} catch {}};
const read = (key,fallback) => {try {return JSON.parse(localStorage.getItem(key)) ?? fallback;} catch {return fallback;}};
const settings = Object.assign({quality:'high',shake:true,volume:0.75,muted:false,throwAutoLock:true,throwMode:'tap'},read('ironfall.settings',{}));
settings.volume=Number.isFinite(Number(settings.volume))?clamp(Number(settings.volume),0,1):.75;
settings.muted=!!settings.muted;
settings.throwAutoLock=settings.throwAutoLock!==false;
settings.throwMode=settings.throwMode==='hold'?'hold':'tap';
const keys = new Set();
const touch = {x:0,y:0,attack:false};
const inputResetters=[];
let touchLayout=false,touchCanvasPointer=null,touchThrowAim=null,touchThrowQueued=null;
const audio = new GameAudio();
audio.muted=settings.muted;
audio.setVolume(settings.volume);
audio.onStatusChange=updateSoundButtons;
audio.bindUnlock?.(document);
audio.preload?.();
// Sound controls work even while the renderer is still loading.
if($('testAudioButton'))$('testAudioButton').onclick=testGameAudio;
if($('menuAudioButton'))$('menuAudioButton').onclick=toggleSound;
let destruction=null;
let renderer,scene,camera,world,hero,sun,fillLight,chargeRing,directionMarker;
let phase='menu', previousPhase='menu', elapsed=0, roundTime=0, round=1, sector=1, kills=0, relics=0, level=1, xp=0, xpTarget=12, score=0;
let forgeMenu=null;
let enemies=[],enemyFalls=[],drops=[],bolts=[],rings=[],arcs=[],numbers=[],telegraphs=[];
let boss=null,bossSpawned=false,spawnCounter=0,lootCounter=0,announcementTimer=0;
let wave=null,upgradeQueue=[],upgradePanelOpen=false,upgradeTab='powers',upgradeFeedback='';
let character=createCharacterProgression(),characterStats=getCharacterStats(character),testRun=false,checkpointTimer=0,forgeReadyAnnounced=false;
const MATERIAL_LABELS={wood:'Ξύλο',scrap:'Μέταλλο',crystal:'Κρύσταλλοι'};
let shake=0,hitStop=0,redFlash=0,best=read('ironfall.best',0),visualTime=0,hudTimer=0,minimapTimer=0;
const combatCombo=createHitCombo();
let comboXpCarry=0,comicState=null,lastComicAt=-10,occlusionTimer=0,heroOccluded=false,heroSilhouette=null;
let battleOccluders=new Set(),silhouetteParts=[];
let chargeHeld=false,chargeStarted=false,charge=0,swing=null,attackCooldown=0,dashTime=0,dashCooldown=0;
const swingSequences=[createSwingSequence(),createSwingSequence()];
let attackBuffer=null,spin=null,spinRecovery=null,holdElapsed=0;
const SPIN_HOLD_SECONDS=.22,SPIN_TURN_SECONDS=.52,ATTACK_BUFFER_SECONDS=.45,TOUCH_THROW_BUFFER_SECONDS=.30,SIMULATION_STEP=1/120;
let facing={x:-0.585491,z:-0.810679},dashDirection={x:0,z:-1},levels={power:0,size:0,range:0,speed:0,vitality:0,quake:0,kick:0},stats=calculateStats(levels);
let stance=0,stanceTarget=0,guardHeld=false,guarding=false,guardAngle=0;
let combatPointer=null,mouseButtons=0;
let leap=null,leapCooldown=0,throwWindup=null,throwFlight=null,throwCooldown=0,landingRecovery=0,landingPose=null;
let kick=null,kickCooldown=0,vehicleNavTimer=0;
let punch=null,punchSequence=0,throwLock=null,dashFollowup=0;
const movingVehicles=new Set();
const THROW_CHAIN_RADIUS=9,THROW_MAX_HITS=5,HAMMER_LIGHTNING_SECONDS=2.8;
let hammerLightning=0,hammerAura=null,hammerMaterials=[];
let hpEchoes=[],aimPreview=null,nearbyTargets=[],focusedTarget=null,guardRing,landingMarker,groundShadow;
const pointer={active:false,x:0,y:0},aim={x:-.585491,z:-.810679};
const raycaster=new THREE.Raycaster(),aimPlane=new THREE.Plane(new THREE.Vector3(0,1,0),-1.2);
const headPrevious=new THREE.Vector3(),headNow=new THREE.Vector3(),shaftUp=new THREE.Vector3(0,1,0),poseDirection=new THREE.Vector3();
const guardHits=new Map();
let player={x:0,z:0,y:0,vx:0,vz:0,radius:0.44,hp:120,maxHp:120,invincible:0,hurtAgo:100,walk:0};
const cameraTarget=new THREE.Vector3(0,0,0),cameraOffset=new THREE.Vector3(13,23,18),tempV=new THREE.Vector3();
const fx=$('fxCanvas'),fxContext=fx.getContext('2d'),map=$('minimap'),mapContext=map.getContext('2d');
let screenW=innerWidth,screenH=innerHeight,fxDpr=1;
const color={gold:0xffc26d,white:0xfff2cc,teal:0x8ce4d8,red:0xff6f69};
const colorCache=new Map();
function cachedColor(value){if(!colorCache.has(value))colorCache.set(value,new THREE.Color(value));return colorCache.get(value);}

class Fragments {
  constructor() {
    this.capacity=680;this.items=[];this.dummy=new THREE.Object3D();
    this.material=new THREE.MeshLambertMaterial({color:0xffffff,flatShading:true});
    this.mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),this.material,this.capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.mesh.count=0;this.mesh.frustumCulled=false;
    this.mesh.castShadow=true;scene.add(this.mesh);
  }
  add(x,y,z,count,palette,force=4,size=0.14,long=false) {
    for(let i=0;i<count;i++){
      const angle=Math.random()*Math.PI*2, speed=force*(0.3+Math.random()*0.8),s=size*(0.5+Math.random());
      this.items.push({x:x+(Math.random()-.5)*size*3,y:y+Math.random()*size*3,z:z+(Math.random()-.5)*size*3,
        vx:Math.sin(angle)*speed,vz:Math.cos(angle)*speed,vy:force*(.4+Math.random()*.7),rx:Math.random()*5,rz:Math.random()*5,
        spin:(Math.random()-.5)*12,sx:s,sy:long?s*.45:s,sz:s*(.7+Math.random()*.8),life:long?13+Math.random()*9:.5+Math.random()*.7,
        max:long?22:1.2,color:palette[Math.floor(Math.random()*palette.length)],bounces:0,long});
    }
    if(this.items.length>this.capacity)this.items.splice(0,this.items.length-this.capacity);
  }
  update(dt){
    let count=0;
    for(let i=this.items.length-1;i>=0;i--){
      const p=this.items[i];p.life-=dt;if(p.life<=0){this.items.splice(i,1);continue;}
      p.vy-=15*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;
      if(p.y<p.sy/2+.04){p.y=p.sy/2+.04;p.vy=-p.vy*.3;p.vx*=.65;p.vz*=.65;p.bounces++;if(p.bounces>4){p.vy=0;p.spin=0;}}
      p.rx+=p.spin*dt;p.rz+=p.spin*.7*dt;
      const scale=Math.min(1,p.life/(p.long?1.5:.18));
      this.dummy.position.set(p.x,p.y,p.z);this.dummy.rotation.set(p.rx,0,p.rz);this.dummy.scale.set(p.sx*scale,p.sy*scale,p.sz*scale);this.dummy.updateMatrix();
      this.mesh.setMatrixAt(count,this.dummy.matrix);this.mesh.setColorAt(count,cachedColor(p.color));count++;
    }
    this.mesh.count=count;this.mesh.instanceMatrix.needsUpdate=true;if(this.mesh.instanceColor)this.mesh.instanceColor.needsUpdate=true;
  }
  clear(){this.items.length=0;this.mesh.count=0;}
}
let fragments;
class ImpactClouds {
  constructor(){
    this.pool=[];
    const texture=star=>{
      const canvas=document.createElement('canvas');canvas.width=canvas.height=64;const c=canvas.getContext('2d');
      if(star){c.fillStyle='#fff';c.beginPath();for(let n=0;n<16;n++){const a=n*Math.PI/8,r=n%2?8:n%4?23:31;const x=32+Math.cos(a)*r,y=32+Math.sin(a)*r;if(n)c.lineTo(x,y);else c.moveTo(x,y);}c.closePath();c.fill();}
      else{const g=c.createRadialGradient(32,32,1,32,32,32);g.addColorStop(0,'rgba(255,255,255,.8)');g.addColorStop(.45,'rgba(255,255,255,.5)');g.addColorStop(1,'rgba(255,255,255,0)');c.fillStyle=g;c.fillRect(0,0,64,64);}
      return new THREE.CanvasTexture(canvas);
    };
    this.dust=texture(false);this.star=texture(true);
    for(let n=0;n<72;n++){const mesh=new THREE.Sprite(new THREE.SpriteMaterial({map:this.dust,transparent:true,opacity:0,depthWrite:false,toneMapped:false}));mesh.visible=false;scene.add(mesh);this.pool.push({mesh,life:0,max:0,x:0,y:0,z:0,vx:0,vz:0,vy:0,size:1,star:false});}
  }
  emit(x,y,z,dir,radius=1){
    const count=settings.quality==='low'?5:8;
    for(let n=0;n<count;n++){
      const p=this.pool.find(p=>p.life<=0);if(!p)break;
      const star=n<2,angle=Math.random()*Math.PI*2,speed=star?.15:1.1+Math.random()*1.7;
      Object.assign(p,{star,life:star?.13:.42+Math.random()*.2,x:x+(star?0:Math.cos(angle)*.3),y:y+(star?1.05:.15+Math.random()*.18),z:z+(star?0:Math.sin(angle)*.3),
        vx:star?0:dir.x*.8+Math.cos(angle)*speed,vz:star?0:dir.z*.8+Math.sin(angle)*speed,vy:star?0:.45+Math.random()*.5,size:(star?n===0?1.05:.57:.55)*radius});
      p.max=p.life;p.mesh.material.map=star?this.star:this.dust;p.mesh.material.color.setHex(star?n===0?0xffca67:0xffffff:0xc7b99c);
      p.mesh.material.rotation=Math.random()*Math.PI;p.mesh.material.opacity=star?1:.5;p.mesh.position.set(p.x,p.y,p.z);p.mesh.scale.setScalar(p.size);p.mesh.visible=true;
    }
  }
  update(dt){for(const p of this.pool){if(p.life<=0)continue;p.life-=dt;if(p.life<=0){p.mesh.visible=false;continue;}const t=1-p.life/p.max;p.x+=p.vx*dt;p.z+=p.vz*dt;p.y+=p.vy*dt;p.mesh.position.set(p.x,p.y,p.z);p.mesh.scale.setScalar(p.size*(p.star?1+t*.5:1+t*1.65));p.mesh.material.opacity=(p.star?1:.5)*(1-t);}}
  clear(){for(const p of this.pool){p.life=0;p.mesh.visible=false;}}
}
let impactClouds;
function frightenNearby(x,z,severity=1,radius=4.3,exclude=null){
  for(const e of enemies){if(e===exclude||e.dead||Math.hypot(e.x-x,e.z-z)>radius)continue;
    if(!(world.hasLineOfSight?.(x,z,e.x,e.z,.16)??true))continue;
    startEnemyFear(e,x,z,severity);
  }
}

function recordCombatContact(target){
  const result=registerComboHit(combatCombo);
  if(!result.milestone)return;
  // Sparse rewards at real chain milestones; misses and scenery cannot farm it.
  const kind=target.palette==='metal'||target===boss?'scrap':'wood';
  const amount=Math.min(3,result.tier);
  spawnDrop(target.x,target.z,kind);drops[drops.length-1].amount=amount;
  audio.play('combo',result.tier/4,{tier:result.tier});
  if(elapsed-lastComicAt>=1.25){
    lastComicAt=elapsed;comicState={x:target.x,y:(target.y||0)+Math.min(2.6,target.height||2),z:target.z,life:.64,tier:result.tier,text:result.tier>=3?'ΚΡΑΜ!':'ΜΠΑΜ!'};
    const burst=$('comicBurst');if(burst){burst.classList.remove('pop');void burst.offsetWidth;burst.classList.add('pop');}
  }
}
function updateComboDisplay(){
  const hud=$('comboHud'),burst=$('comicBurst');
  if(hud){
    const point=screenPoint(player.x,player.y+2.8,player.z),visible=phase==='playing'&&combatCombo.hits>=2&&point.inside;
    hud.hidden=!visible;
    if(visible){
      hud.style.left=clamp(point.x,65,screenW-65)+'px';hud.style.top=clamp(point.y,130,screenH-125)+'px';
      hud.dataset.tier=String(combatCombo.tier);$('comboCount').textContent=combatCombo.hits+' HIT';
      $('comboFill').style.transform='scaleX('+clamp(combatCombo.remaining/COMBO_WINDOW,0,1)+')';
      $('comboReward').textContent='×'+comboMultiplier(combatCombo)+' XP · ΣΚΟΡ';
    }
  }
  if(burst){
    burst.hidden=phase!=='playing'||!comicState;
    if(comicState){const p=screenPoint(comicState.x,comicState.y+.6,comicState.z);burst.textContent=comicState.text;burst.dataset.tier=String(comicState.tier);burst.style.left=clamp(p.x+34,48,screenW-55)+'px';burst.style.top=clamp(p.y-20,135,screenH-145)+'px';}
  }
}
function rebuildHeroSilhouette(){
  if(heroSilhouette){scene.remove(heroSilhouette);heroSilhouette.material?.dispose();}
  const root=new THREE.Group();root.name='Player visibility silhouette';root.visible=false;
  const material=new THREE.MeshBasicMaterial({color:0xffdf9d,transparent:true,opacity:.16,depthTest:false,depthWrite:false,toneMapped:false,fog:false});
  root.material=material;silhouetteParts=[];
  hero.traverse(source=>{if(!source.isMesh)return;const proxy=new THREE.Mesh(source.geometry,material);proxy.matrixAutoUpdate=false;proxy.frustumCulled=false;proxy.renderOrder=45;root.add(proxy);silhouetteParts.push({source,proxy});});
  scene.add(root);heroSilhouette=root;
}
function updateBattleVisibility(dt){
  if(!world||!camera)return;
  occlusionTimer-=dt;
  if(occlusionTimer<=0){
    occlusionTimer=.055;
    const direction=new THREE.Vector3().subVectors(camera.position,cameraTarget);
    // Only the visible body is protected. Idle weapons, hidden enemies and
    // an empty area around the hero must never erase an unrelated building.
    const side={x:Math.cos(hero.rotation.y)*.28,z:-Math.sin(hero.rotation.y)*.28};
    const heroPoints=[
      {x:player.x,y:player.y+.85,z:player.z},
      {x:player.x,y:player.y+1.35,z:player.z},
      {x:player.x,y:player.y+1.85,z:player.z},
      {x:player.x+side.x,y:player.y+1.35,z:player.z+side.z},
      {x:player.x-side.x,y:player.y+1.35,z:player.z-side.z}
    ];
    const candidates=world.objects.filter(o=>!o.dead&&o.h>1.7&&o.renderActive!==false&&Math.hypot(o.x-player.x,o.z-player.z)<65);
    battleOccluders=phase==='menu'?new Set():findBattleOccluders(candidates,heroPoints,direction);
    heroOccluded=battleOccluders.size>0;
  }
  for(const o of world.objects)if(!o.dead&&(battleOccluders.has(o)||o.occlusionFade>0))applyOccluderFade(o,battleOccluders.has(o),dt);
  if(!heroSilhouette)rebuildHeroSilhouette();
  heroSilhouette.visible=phase==='playing'&&heroOccluded;
  if(heroSilhouette.visible){
    hero.updateMatrixWorld(true);
    for(const {source,proxy} of silhouetteParts){let visible=true;for(let node=source;node&&node!==scene;node=node.parent)if(!node.visible){visible=false;break;}proxy.visible=visible;proxy.matrix.copy(source.matrixWorld);}
  }
}

function setPhase(next){
  phase=next;document.body.dataset.state=next;
  $('menu').hidden=next!=='menu';$('hud').hidden=next==='menu';
  $('pauseMenu').hidden=next!=='paused';$('settingsMenu').hidden=next!=='settings';
  $('endMenu').hidden=next!=='dead'&&next!=='victory';syncUpgradePanel();
  forgeMenu?.setActive(next==='menu');
  if(next!=='playing'){audio.stopEnvironment?.();clearInput();if(guardRing)guardRing.visible=false;if(hammerAura)hammerAura.root.visible=false;}
  else $('gameCanvas').focus({preventScroll:true});
  syncTouchControls();
}
function clearInput(){
  for(const reset of inputResetters)reset();
  keys.clear();touch.x=0;touch.y=0;touch.attack=false;touchCanvasPointer=null;touchThrowAim=null;touchThrowQueued=null;throwLock=null;
  combatPointer=null;mouseButtons=0;cancelAttack();guardHeld=false;guarding=false;kick=null;punch=null;
  if(touchLayout)pointer.active=false;
  document.querySelectorAll('[data-key]').forEach(e=>e.classList.remove('active'));
  for(const id of ['attackButton','guardButton','kickButton'])$(id)?.classList.remove('active');
  if($('joystickKnob'))$('joystickKnob').style.transform='translate(0,0)';
}
function prepareMaterials(group){
  const clones=new Map(),list=[];
  group.traverse(n=>{if(n.isMesh){
    const convert=m=>{if(!clones.has(m)){const clone=m.clone();clone.userData.originalEmissive=clone.emissive?.clone();clones.set(m,clone);list.push(clone);}return clones.get(m);};
    n.material=Array.isArray(n.material)?n.material.map(convert):convert(n.material);
  }});return list;
}
function flashMaterials(entity,amount,tint=0xffdf9f){
  for(const m of entity.materials||[]){if(!m.emissive)continue;const base=m.userData.originalEmissive||cachedColor(0);m.emissive.copy(base).lerp(cachedColor(tint),amount);}
}
function randomBetween(a,b){return a+Math.random()*(b-a);}
function nearbyObjects(x,z,r,options){return world.nearObjects?.(x,z,r,options)||world.objects.filter(o=>options?.includeDead||!o.dead);}
function segmentObjects(from,to,radius=0){return nearbyObjects((from.x+to.x)/2,(from.z+to.z)/2,Math.hypot(to.x-from.x,to.z-from.z)/2+radius);}
function disposeModelGeometry(mesh){const unique=new Set();mesh.traverse(n=>{if(n.geometry)unique.add(n.geometry);});for(const geometry of unique)geometry.dispose();}
function disposeInstance(entity){if(!entity?.mesh)return;scene.remove(entity.mesh);disposeModelGeometry(entity.mesh);for(const m of entity.materials||[])m.dispose();}
function toast(title,text='',accent='#ffc271'){
  const el=document.createElement('div');el.className='toast';el.style.setProperty('--toast-accent',accent);
  const strong=document.createElement('strong');strong.textContent=title;el.appendChild(strong);
  if(text){const small=document.createElement('span');small.textContent=text;el.appendChild(small);}
  $('toasts').appendChild(el);setTimeout(()=>{el.classList.add('leaving');setTimeout(()=>el.remove(),300);},3400);
  while($('toasts').children.length>3)$('toasts').firstChild.remove();
}
function announce(title,text,duration=3){$('announcementTitle').textContent=title;$('announcementText').textContent=text;$('announcement').hidden=false;announcementTimer=duration;}
function floatText(x,y,z,text,color='#fff0c8',size=17){numbers.push({x,y,z,text,color,size,life:1.05,max:1.05});}
function showHitPoints(entity,damage){
  entity.hurtTimer=3.8;
  const height=entity.w!==undefined?Math.min(entity.h,player.y+4):entity.height||entity.h||5.1;
  const anchor=entity.w!==undefined&&entity.h>6?nearestPoint(player.x,player.z,entity):entity;
  entity.damagePending=(entity.damagePending||0)+damage;
  if(entity.damagePending>=5||entity.hp<=0){floatText(anchor.x,(entity.y||0)+height+.95,anchor.z,'−'+Math.round(entity.damagePending),damage>=100?'#ffd47d':'#fff4d8',damage>=100?24:17);entity.damagePending=0;}
  if(entity.hp<=0)hpEchoes.push({x:anchor.x,z:anchor.z,y:(entity.y||0)+height+.35,maxHp:entity.maxHp,life:1.1});
}
function pulse(x,z,radius=3,tint=color.gold,duration=.45){
  const mesh=new THREE.Mesh(new THREE.RingGeometry(.94,1,48),new THREE.MeshBasicMaterial({color:tint,transparent:true,opacity:.8,side:THREE.DoubleSide,depthWrite:false}));
  mesh.rotation.x=-Math.PI/2;mesh.position.set(x,.08,z);scene.add(mesh);rings.push({mesh,life:duration,max:duration,radius});return mesh;
}
function makeTelegraph(x,z,radius,tint=0xff665b){
  const mesh=new THREE.Mesh(new THREE.RingGeometry(.88,1,48),new THREE.MeshBasicMaterial({color:tint,transparent:true,opacity:.5,side:THREE.DoubleSide,depthWrite:false}));
  mesh.rotation.x=-Math.PI/2;mesh.position.set(x,.09,z);mesh.scale.setScalar(radius);scene.add(mesh);return mesh;
}
function removeEffect(mesh){scene.remove(mesh);mesh.geometry.dispose();mesh.material.dispose();}
function weaponTrail(a,b,width=.3,tint=0xffc473,physical=characterStats.weaponTier<2){
  if(a.distanceToSquared(b)<.00001)return;
  // A camera-facing ribbon has width even on a vertical overhead stroke.
  // Offsetting only along world Y collapses that stroke into a zero-area line.
  const side=new THREE.Vector3().subVectors(b,a).cross(new THREE.Vector3().subVectors(camera.position,a));
  if(side.lengthSq()<1e-8)side.set(1,0,0);side.normalize().multiplyScalar(width);
  const positions=[a.x-side.x,a.y-side.y,a.z-side.z,a.x+side.x,a.y+side.y,a.z+side.z,b.x+side.x,b.y+side.y,b.z+side.z,
    a.x-side.x,a.y-side.y,a.z-side.z,b.x+side.x,b.y+side.y,b.z+side.z,b.x-side.x,b.y-side.y,b.z-side.z];
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color:tint,transparent:true,opacity:physical?.28:.7,side:THREE.DoubleSide,depthWrite:false,blending:physical?THREE.NormalBlending:THREE.AdditiveBlending}));
  scene.add(mesh);arcs.push({mesh,life:physical?.13:.16,max:physical?.13:.16,opacity:physical?.28:.7});
}
function createHammerAura(){
  // Keep visual energy outside the hammer hierarchy: it must never enlarge
  // collision bounds or get cloned into a thrown weapon.
  const root=new THREE.Group();root.name='Hammer lightning aura';root.visible=false;
  const canvas=document.createElement('canvas');canvas.width=canvas.height=64;
  const context=canvas.getContext('2d'),gradient=context.createRadialGradient(32,32,1,32,32,32);
  gradient.addColorStop(0,'rgba(255,255,255,.95)');gradient.addColorStop(.19,'rgba(170,240,255,.6)');
  gradient.addColorStop(.48,'rgba(80,195,255,.18)');gradient.addColorStop(1,'rgba(40,120,255,0)');
  context.fillStyle=gradient;context.fillRect(0,0,64,64);
  const glow=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(canvas),color:0x77dfff,
    transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false}));
  glow.scale.set(2.7,2.7,1);root.add(glow);
  // A fixed pool of short, jagged arcs. No new geometry, lights, or materials
  // are allocated while a charge/catch is active, including on phones.
  const positions=new Float32Array(8*5*2*3),geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));
  const bolts=new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:0xb5f5ff,
    transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false}));
  bolts.frustumCulled=false;root.add(bolts);scene.add(root);
  return {root,glow,bolts,positions,lastPattern:-1};
}
function updateHammerAura(){
  if(!hammerAura)return;
  const channeling=!!touchThrowAim?.channeling&&characterStats.canLightning,airReady=!!leap&&!leap.slam&&characterStats.canAirSmash;
  const held=hero.userData.weaponHeld,active=phase==='playing'&&held&&(hammerLightning>0||channeling||airReady||leap?.slam);
  hammerAura.root.visible=!!active;
  if(!active)return;
  const electric=hammerLightning>0,fade=electric?Math.min(1,hammerLightning/.45):1;
  const energy=electric?1:channeling?.5:leap?.slam?.72:.38;
  const clock=electric?HAMMER_LIGHTNING_SECONDS-hammerLightning:touchThrowAim?.channelTime||leap?.time||0;
  const shimmer=.88+Math.sin(clock*23)*.12,tint=electric||channeling?0x80deff:leap?.slam?0x9bfff0:0xffd977;
  hero.userData.hammerHead.getWorldPosition(hammerAura.root.position);
  hero.userData.hammerHead.getWorldQuaternion(hammerAura.root.quaternion);
  hammerAura.root.scale.setScalar(stats.size);
  hammerAura.glow.material.color.setHex(tint);hammerAura.glow.material.opacity=energy*fade*shimmer*.66;
  hammerAura.bolts.material.color.setHex(electric?0xc9f6ff:tint);hammerAura.bolts.material.opacity=energy*fade;
  // Apply after player hurt flashing, on separately owned hammer materials.
  for(const m of hammerMaterials)if(m.emissive)m.emissive.lerp(cachedColor(tint),energy*fade*(.42+shimmer*.12));
  const pattern=Math.floor(clock*18);
  if(pattern===hammerAura.lastPattern)return;hammerAura.lastPattern=pattern;
  const a=hammerAura.positions;
  for(let bolt=0;bolt<8;bolt++){
    const angle=bolt*Math.PI/4+pattern*.31;
    let px=Math.cos(angle)*.55,py=Math.sin(angle)*.23,pz=(bolt%2?1:-1)*.37;
    for(let step=1;step<=5;step++){
      const t=step/5,jitter=Math.sin((pattern+1)*17+bolt*11+step*23)*.13*Math.sin(t*Math.PI);
      const x=Math.cos(angle+t*.9)*(.58+t*.48)+jitter,y=Math.sin(angle+t*.9)*(.25+t*.50)+jitter;
      const z=(bolt%2?1:-1)*(.37+t*.24)+Math.cos(step*7+pattern)*.09;
      const offset=(bolt*5+step-1)*6;a[offset]=px;a[offset+1]=py;a[offset+2]=pz;a[offset+3]=x;a[offset+4]=y;a[offset+5]=z;
      px=x;py=y;pz=z;
    }
  }
  hammerAura.bolts.geometry.attributes.position.needsUpdate=true;
}
function resetWorld(keepUpgrades=false,startLevel=1){
  if(!keepUpgrades){round=1;sector=1;upgradeQueue=[];upgradeFeedback='';}
  kick=null;kickCooldown=0;movingVehicles.clear();vehicleNavTimer=0;
  punch=null;punchSequence=0;throwLock=null;dashFollowup=0;hero.userData.setUnarmedPose?.(null);
  swingSequences[0]=createSwingSequence();swingSequences[1]=createSwingSequence();landingPose=null;
  upgradePanelOpen=false;upgradeTab='powers';nearbyTargets=[];focusedTarget=null;
  battleOccluders.clear();occlusionTimer=0;heroOccluded=false;comicState=null;lastComicAt=-10;resetHitCombo(combatCombo);if(!keepUpgrades)comboXpCarry=0;
  for(const e of enemies){if(e.telegraph)removeEffect(e.telegraph);disposeInstance(e);}enemies=[];if(boss){if(boss.telegraph)removeEffect(boss.telegraph);disposeInstance(boss);}boss=null;
  for(const e of enemyFalls)disposeInstance(e);enemyFalls=[];
  for(const d of drops){scene.remove(d.mesh);disposeModelGeometry(d.mesh);}drops=[];
  for(const b of bolts){scene.remove(b.mesh);b.mesh.geometry.dispose();b.mesh.material.dispose();}bolts=[];
  for(const e of [...rings,...arcs])removeEffect(e.mesh);rings=[];arcs=[];
  if(throwFlight){disposeInstance(throwFlight);throwFlight=null;}
  hammerLightning=0;if(hammerAura){hammerAura.root.visible=false;hammerAura.lastPattern=-1;}
  stance=0;stanceTarget=0;guardHeld=false;guarding=false;guardHits.clear();leap=null;leapCooldown=0;throwWindup=null;throwCooldown=0;landingRecovery=0;hpEchoes=[];aimPreview=null;pointer.active=false;touchThrowAim=null;touchThrowQueued=null;
  hero.userData.setWeaponVisible?.(true);hero.userData.setStance?.(0);if(guardRing)guardRing.visible=false;if(landingMarker)landingMarker.visible=false;
  destruction?.dispose();
  world?.dispose();
  world=createWorld(scene,{seed:1527+sector*173,round:sector});
  for(const o of world.objects){o.materials=prepareMaterials(o.mesh);o.flash=0;o.shudder=0;o.hurtTimer=0;o.baseY=o.mesh.position.y;o.baseRotation=o.mesh.rotation.clone();}
  destruction=new DestructionSystem(scene,{audio,quality:settings.quality,nearObjects:(x,z,r)=>world.nearObjects(x,z,r),onDust:(point,size)=>impactClouds?.emit(point.x,point.y??1,point.z,{x:0,z:1},size)});
  player.x=0;player.z=0;player.y=0;player.vy=0;player.vx=0;player.vz=0;player.invincible=2;player.hurtAgo=100;
  if(!keepUpgrades){round=1;elapsed=0;kills=0;relics=0;character=createCharacterProgression(startLevel);level=character.level;xp=character.xp;xpTarget=xpForNextLevel(level);score=0;levels={power:0,size:0,range:0,speed:0,vitality:0,quake:0,kick:0};forgeReadyAnnounced=false;checkpointTimer=0;}
  stats=calculateStats(levels);player.maxHp=stats.maxHp;player.hp=stats.maxHp;
  roundTime=0;currentDistrict='';bossSpawned=false;beginWave(round);spawnCounter=0;lootCounter=0;chargeHeld=false;chargeStarted=false;charge=0;swing=null;attackBuffer=null;spin=null;spinRecovery=null;holdElapsed=0;hitStop=0;attackCooldown=0;dashCooldown=0;dashTime=0;
  $('bossHud').hidden=true;fragments?.clear();impactClouds?.clear();numbers=[];cameraTarget.set(0,.6,0);
  hero.position.set(0,0,0);facing={x:-.585491,z:-.810679};hero.rotation.y=Math.atan2(facing.x,facing.z);
  applyStats();stance=stanceTarget=characterStats.hasShield?0:1;hero.userData.setStance?.(stance);poseHero(0);player.hp=player.maxHp;renderUpgradePanel();updateHUD(true);
}
function startGame(startLevel=1,options={}){
  const requested=typeof startLevel==='number'?startLevel:1;
  testRun=!!options.test||requested>1;audio.unlock().then(()=>audio.play('start'));resetWorld(false,requested);
  if(options.resume){
    const stored=read('ironfall.character',null),restored=restoreCharacterProgression(stored?.character);
    if(restored){character=restored;for(const key of Object.keys(levels))levels[key]=clamp(Math.floor(Number(stored.levels?.[key])||0),0,30);applyStats();stance=stanceTarget=characterStats.hasShield?0:1;hero.userData.setStance?.(stance);poseHero(0);player.hp=player.maxHp;renderUpgradePanel();}
  }
  setPhase('playing');persistCharacter();
  announce(testRun?'ΔΟΚΙΜΗ · ΕΠΙΠΕΔΟ '+level:options.resume?'Η ΕΞΕΛΙΞΗ ΣΟΥ ΣΥΝΕΧΙΖΕΤΑΙ':'ΑΠΟ ΞΥΛΟ ΣΕ ΚΑΤΑΙΓΙΔΑ',
    testRun?characterStats.weaponName+' · Πλήρης εξοπλισμός αυτού του σταδίου.':characterStats.weaponTier===0?'Μάζεψε ξύλο και μέταλλο. Κατασκεύασε καλύτερο όπλο στις Αναβαθμίσεις.':characterStats.weaponName+' · Μάζεψε υλικά για την επόμενη κατασκευή.',4.3);
}
function persistCharacter(){
  if(testRun||phase==='menu')return;
  save('ironfall.character',{character,levels});updateSavedCharacter();
}
function updateSavedCharacter(){
  const stored=restoreCharacterProgression(read('ironfall.character',null)?.character),button=$('resumeCharacterButton');
  const ready=!$('startButton').disabled,progress=stored||createCharacterProgression(),gear=getCharacterStats(progress);
  if(button){button.hidden=false;button.disabled=!stored||!ready;}
  forgeMenu?.setProgress({level:progress.level,xp:progress.xp,xpTarget:xpForNextLevel(progress.level),maxLevel:MAX_CHARACTER_LEVEL,
    weaponTier:gear.weaponTier,weaponName:gear.weaponName,hasSave:!!stored,ready,best});
}
function syncCharacterModel(){
  const u=hero.userData;
  if(u.setEquipment&&u.equipmentTier!==characterStats.weaponTier){
    u.setEquipment(characterStats.weaponTier);player.materials=u.getEquipmentMaterials?.()||prepareMaterials(hero);
    hammerMaterials=u.getWeaponMaterials?.()||[];rebuildHeroSilhouette();
  }
}
function applyStats(){
  characterStats=getCharacterStats(character);level=character.level;xp=character.xp;xpTarget=xpForNextLevel(level);
  stats={...calculateStats(levels),power:characterStats.power*(1+(levels.power||0)*.25),size:characterStats.size*(1+(levels.size||0)*.18),
    range:characterStats.range*(1+(levels.range||0)*.22+(levels.size||0)*.08),speed:characterStats.speed*(1+(levels.speed||0)*.12),maxHp:characterStats.maxHp+(levels.vitality||0)*25};
  player.maxHp=stats.maxHp;player.hp=Math.min(player.hp,player.maxHp);syncCharacterModel();
  if(hero.userData.hammerHead)hero.userData.hammerHead.scale.setScalar(stats.size);
  if($('powerValue'))$('powerValue').textContent=Math.round(stats.power);
  if($('sizeValue'))$('sizeValue').textContent=stats.size.toFixed(2)+'×';
  if($('rangeValue'))$('rangeValue').textContent=stats.range.toFixed(1)+' m';
  if($('speedValue'))$('speedValue').textContent=(stats.speed/5.9).toFixed(2)+'×';
  $('levelValue').textContent=level;
  if($('relicSlots'))$('relicSlots').innerHTML=UPGRADE_DEFS.filter(d=>levels[d.id]).map(d=>'<span class="relic-installed" title="'+d.name+'" style="--relic-color:'+d.color+'"><svg viewBox="0 0 96 80" aria-hidden="true"><use href="#upgrade-'+d.id+'"/></svg><b>'+levels[d.id]+'</b></span>').join('');
}
function gainXP(value){
  const oldHp=player.maxHp,result=awardCharacterXp(character,value);applyStats();
  player.hp=Math.min(player.maxHp,player.hp+Math.max(0,player.maxHp-oldHp));
  for(let i=0;i<result.levelsGained;i++)spawnDrop(player.x+randomBetween(-1,1),player.z+randomBetween(-1,1),'relic');
  if(result.levelsGained){
    const message='ΜΟΝΙΜΑ +'+(result.levelsGained*2)+' ΖΗΜΙΑ · +'+(result.levelsGained*8)+' ΜΕΓΙΣΤΗ ΖΩΗ';
    upgradeFeedback='LV '+level+' · '+message;toast('ΕΠΙΠΕΔΟ '+level,message,'#9de3cb');persistCharacter();
  }
  renderCharacterProgress();
}
function renderCharacterProgress(){
  const progress=level>=MAX_CHARACTER_LEVEL?1:xp/Math.max(1,xpTarget),status=getForgeStatus(character),busy=weaponBusy()||!!swing||!!spin;
  if($('characterHudLevel'))$('characterHudLevel').textContent='LV '+level+(testRun?' · ΔΟΚΙΜΗ':'');
  if($('characterHudWeapon'))$('characterHudWeapon').textContent=characterStats.weaponName;
  for(const id of ['characterXpFill','forgeXpFill'])if($(id))$(id).style.width=Math.min(100,progress*100)+'%';
  if($('characterXpText'))$('characterXpText').textContent=level>=MAX_CHARACTER_LEVEL?'ΜΕΓΙΣΤΟ ΕΠΙΠΕΔΟ':xp+' / '+xpTarget+' XP';
  if($('equippedWeapon'))$('equippedWeapon').textContent=characterStats.weaponName;
  if($('permanentStats'))$('permanentStats').textContent='Μόνιμα από LV: +'+characterStats.levelDamageBonus+' ζημιά · +'+characterStats.levelHealthBonus+' μέγιστη ζωή. Σύνολο: '+Math.round(stats.power)+' ζημιά / '+player.maxHp+' HP';
  if($('weaponAbilities'))$('weaponAbilities').textContent=characterStats.canLightning?'Ψηλό άλμα · συντριβή · 5 στόχοι · επιστροφή · κεραυνοί':characterStats.canReturn?'Ψηλό άλμα · συντριβή · αυτόματη επιστροφή':characterStats.canAirSmash?'Δυνατό άλμα · εναέρια συντριβή · μάζεψε το όπλο μετά τη ρίψη':'Άλμα · μικρό smash · dash στον αέρα · μάζεψε το όπλο μετά τη ρίψη';
  for(const type of MATERIAL_TYPES)if($('material-'+type))$('material-'+type).textContent=String(character.materials[type]);
  if($('nextWeaponName'))$('nextWeaponName').textContent=status.next?status.next.name:'ΤΟ ΣΦΥΡΙ ΤΗΣ ΚΑΤΑΙΓΙΔΑΣ ΕΙΝΑΙ ΔΙΚΟ ΣΟΥ';
  if($('forgeRequirements'))$('forgeRequirements').textContent=status.next?'LV '+status.next.minLevel+' · '+MATERIAL_TYPES.filter(t=>status.next.cost[t]).map(t=>MATERIAL_LABELS[t]+' '+character.materials[t]+'/'+status.next.cost[t]).join(' · '):'Συνέχισε να ενισχύεις τα στατιστικά σου με ευρήματα.';
  if($('forgeButton')){$('forgeButton').disabled=!status.canForge||busy;$('forgeButton').textContent=!status.next?'ΠΛΗΡΕΣ':!status.levelReady?'LEVEL '+status.next.minLevel:!status.materialsReady?'ΛΕΙΠΟΥΝ ΥΛΙΚΑ':busy?'ΠΕΡΙΜΕΝΕ':'ΚΑΤΑΣΚΕΥΑΣΕ';}
  $('upgradesToggle')?.classList.toggle('forge-ready',!!status.canForge);
  if(status.canForge&&!forgeReadyAnnounced&&phase==='playing'){forgeReadyAnnounced=true;toast('ΕΤΟΙΜΗ ΚΑΤΑΣΚΕΥΗ',status.next.name+' · Άνοιξε τις Αναβαθμίσεις.','#9de3cb');}
}
function forgeWeapon(){
  if(phase!=='playing'||weaponBusy()||swing||spin)return;
  const result=forgeNextWeapon(character);if(!result.ok)return;
  forgeReadyAnnounced=false;applyStats();persistCharacter();renderUpgradePanel();
  pulse(player.x,player.z,3,0xa3e8cc,.5);audio.play('pickup');toast('ΝΕΟΣ ΕΞΟΠΛΙΣΜΟΣ',characterStats.weaponName+' · '+(characterStats.canReturn?'Το όπλο επιστρέφει στο χέρι σου.':characterStats.canAirSmash?'Ξεκλείδωσες την εναέρια συντριβή.':'Το όπλο και ο χαρακτήρας σου δυνάμωσαν.'));
}

function spawnDrop(x,z,kind='gold'){
  if(drops.length>70){const gone=drops.shift();scene.remove(gone.mesh);disposeModelGeometry(gone.mesh);}
  const mesh=makeTreasure(kind);mesh.position.set(x,.4,z);scene.add(mesh);
  drops.push({mesh,x,z,kind,age:0,life:55,phase:Math.random()*6.28});
}
function openUpgrade(){
  const pool=[...UPGRADE_DEFS],choices=[];
  while(choices.length<3)choices.push(pool.splice(Math.floor(Math.random()*pool.length),1)[0]);
  upgradeQueue.push(choices);audio.play('pickup',1);renderUpgradePanel();
}
function syncUpgradePanel(){
  $('upgradePanel').hidden=phase!=='playing'||!upgradePanelOpen;
  $('upgradePanel').dataset.tab=upgradeTab;
  $('upgradesToggle').setAttribute('aria-expanded',String(phase==='playing'&&upgradePanelOpen));
  $('upgradesToggle').classList.toggle('has-pending',upgradeQueue.length>0);
  $('pendingUpgradeCount').textContent=String(upgradeQueue.length);
  $('pendingUpgradeCount').hidden=upgradeQueue.length===0;
  $('upgradesToggle').setAttribute('aria-label','Αναβαθμίσεις · '+upgradeQueue.length+' διαθέσιμες επιλογές');
  for(const [tab,id,view] of [['powers','upgradePowerTab','upgradePowerView'],['gear','upgradeGearTab','upgradeGearView']]){
    if($(id)){$(id).setAttribute('aria-selected',String(upgradeTab===tab));$(id).tabIndex=upgradeTab===tab?0:-1;}
    if($(view))$(view).hidden=upgradeTab!==tab;
  }
}
function toggleUpgradePanel(force){
  if(phase!=='playing')return;
  const wasOpen=upgradePanelOpen;upgradePanelOpen=typeof force==='boolean'?force:!upgradePanelOpen;
  if(upgradePanelOpen&&!wasOpen)upgradeTab=upgradeQueue.length?'powers':'gear';
  renderUpgradePanel();audio.play('ui');
  if(!upgradePanelOpen)$('gameCanvas').focus({preventScroll:true});
}
function renderUpgradePanel(){
  syncUpgradePanel();
  renderCharacterProgress();
  $('upgradeQueueText').textContent=upgradeQueue.length?upgradeQueue.length+' ΔΙΑΘΕΣΙΜ'+(upgradeQueue.length===1?'Η':'ΕΣ')+' · ΔΙΑΛΕΞΕ ΜΙΑ':upgradeFeedback||'ΜΑΖΕΨΕ ΕΥΡΗΜΑΤΑ ΓΙΑ ΑΝΑΒΑΘΜΙΣΗ';
  const choices=upgradeQueue[0]||[];
  const wrap=$('upgradeChoices');wrap.replaceChildren();
  choices.forEach((choice,index)=>{
    const button=document.createElement('button');button.className='upgrade-card';button.style.setProperty('--card-accent',choice.color);
    const compact={power:['ΔΥΝΑΜΗ','+25% ζημιά'],size:['ΜΕΓΕΘΟΣ','+18% κεφαλή · +8% εμβέλεια'],range:['ΕΜΒΕΛΕΙΑ','+22% εμβέλεια'],speed:['ΤΑΧΥΤΗΤΑ','+12% κίνηση'],vitality:['ΑΝΤΟΧΗ','+25 ζωή · +40 αναπλήρωση'],quake:['ΣΥΝΤΡΙΒΗ','Μεγαλύτερη περιοχή'],kick:['ΚΛΩΤΣΙΑ','+δύναμη · αυτοκίνητα στη βαθμίδα 3']}[choice.id];
    button.setAttribute('aria-label',choice.name+' · '+choice.text);button.setAttribute('title',choice.name+' · '+choice.text);
    button.innerHTML='<kbd class="upgrade-key">'+(index+1)+'</kbd><svg class="upgrade-icon" viewBox="0 0 96 80" aria-hidden="true"><use href="#upgrade-'+choice.id+'"/></svg><small>'+choice.label+'</small><h3>'+compact[0]+'</h3><p>'+compact[1]+'</p><span class="upgrade-level">'+((levels[choice.id]||0)+(choice.id==='kick'?2:1))+' <b>+</b></span>';
    button.onclick=()=>{
      if(phase!=='playing'||!upgradePanelOpen||upgradeTab!=='powers'||upgradeQueue[0]!==choices)return;
      levels[choice.id]=(levels[choice.id]||0)+1;relics++;upgradeQueue.shift();applyStats();
      if(choice.id==='vitality')player.hp=Math.min(player.maxHp,player.hp+40);
      upgradeFeedback=choice.name+' · ΒΑΘΜΙΔΑ '+(levels[choice.id]+(choice.id==='kick'?1:0));if(!upgradeQueue.length)upgradePanelOpen=false;audio.play('pickup');persistCharacter();renderUpgradePanel();
      pulse(player.x,player.z,2.5,color.gold,.4);$('gameCanvas').focus({preventScroll:true});
    };
    wrap.appendChild(button);
  });
}

function weaponBusy(){return !!(punch||kick||throwFlight||throwWindup||leap||Math.abs(stance-stanceTarget)>.005||landingRecovery>0);}
function stancePower(){return stance>.95?1.25:1;}
function movementDirection(){
  const horizontal=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0)+touch.x;
  const vertical=(keys.has('KeyS')||keys.has('ArrowDown')?1:0)-(keys.has('KeyW')||keys.has('ArrowUp')?1:0)+touch.y;
  return screenMovement(horizontal,vertical);
}
function movementStrength(){
  const horizontal=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0);
  const vertical=(keys.has('KeyS')||keys.has('ArrowDown')?1:0)-(keys.has('KeyW')||keys.has('ArrowUp')?1:0);
  return horizontal||vertical?1:Math.min(1,Math.hypot(touch.x,touch.y));
}
function beginSwing(){
  if(phase!=='playing'||!chargeStarted||spin||attackCooldown>0||weaponBusy()||guarding)return;
  updateAim();const move=movementDirection();
  if(move.x||move.z)facing=move;else if(pointer.active)facing={...aim};
  hero.rotation.y=Math.atan2(facing.x,facing.z);
  const q=charge,details=attackStats(stats,q);
  const twoHanded=stance>.9,comboIndex=twoHanded?1:0;
  const variant=selectHammerSwing(swingSequences[comboIndex],{twoHanded,moving:!!(move.x||move.z)});
  swing={time:0,q,...details,twoHanded,variant,duration:getHammerSwingDuration(variant)+q*.10,damage:Math.round(details.damage*stancePower()),fx:facing.x,fz:facing.z,hit:false,hits:new Set(),blocked:false,fromRotation:hero.userData.weaponRig.quaternion.clone(),fromPosition:hero.userData.weaponRig.position.clone()};
  if(dashFollowup>0){swing.damage=Math.round(swing.damage*1.25);swing.dashBoost=true;dashFollowup=0;}
  swing.fromBody=hero.userData.body.rotation.clone();swing.fromBodyY=hero.userData.body.position.y;
  chargeStarted=false;charge=0;spinRecovery=null;attackCooldown=swing.duration+.012;audio.play('swing',q,{variant,duration:swing.duration,weapon:characterStats.weaponTier<2?'wood':'metal',exert:true});
  hero.updateMatrixWorld(true);hero.userData.hammerHead.getWorldPosition(headPrevious);
}
function beginPunch(){
  if(phase!=='playing'||!throwFlight||punch||kick||throwWindup||attackCooldown>0||guardHeld||dashTime>0)return false;
  updateAim();const move=movementDirection();
  const dir=(move.x||move.z)?move:pointer.active?{...aim}:{...facing};
  facing={...dir};hero.rotation.y=Math.atan2(dir.x,dir.z);
  const spec=punchStats(level,levels.power,punchSequence++);
  punch={...spec,time:0,hit:false,dir:{...dir}};
  if(dashFollowup>0){punch.damage=Math.round(punch.damage*1.25);punch.dashBoost=true;dashFollowup=0;}
  poseHero(0);hero.updateMatrixWorld(true);
  punch.previousHand=hero.userData[punch.hand+'Grip'].getWorldPosition(new THREE.Vector3());
  attackCooldown=punch.duration+.025;attackBuffer=null;chargeStarted=false;charge=0;
  audio.play('punch',.25,{exert:true});return true;
}
function punchImpact(from,hand){
  if(!punch||punch.hit)return false;
  const p=punch,origin={x:player.x,y:player.y+1.3,z:player.z};
  const targets=[...nearbyObjects(player.x,player.z,2),...enemies,...(boss&&!boss.dead?[boss]:[])];
  const direct=firstHammerHit(origin,hand,targets,p.radius),swept=firstHammerHit(from,hand,targets,p.radius);
  const hit=direct||swept;if(!hit)return false;
  p.hit=true;const t=hit.target;
  if(t===boss)hitBoss(p.damage,p.dir,1,{weapon:'fist',interrupt:false,stagger:.08});
  else if(enemies.includes(t))hitEnemy(t,p.damage,p.dir,1.7,0,hit,{weapon:'fist',stagger:.22,fear:false});
  else hurtObject(t,Math.max(1,Math.round(p.damage*.45)),.08,hit,'fist');
  shake=Math.max(shake,.045);hitStop=Math.max(hitStop,.006);checkGoal();return true;
}
function startSpin(previousHits=null){
  if(spin)return true;
  if(phase!=='playing'||swing||weaponBusy()||guardHeld)return false;
  const rig=hero.userData.weaponRig;
  hero.updateMatrixWorld(true);const entryHead=hero.worldToLocal(hero.userData.hammerHead.getWorldPosition(new THREE.Vector3()));
  spin={startLocalAzimuth:Math.atan2(entryHead.x,entryHead.z),entryYawOffset:0,time:0,angle:hero.rotation.y,rotation:0,cycle:0,hitTimes:new Map(),entryHits:new Set(previousHits||[]),trailTime:0,soundTime:-1,recoil:0,
    damage:Math.round(stats.power*.9*stancePower()),knockback:4.6,lift:1.1,
    fromRotation:rig.quaternion.clone(),fromPosition:rig.position.clone(),fromBody:hero.userData.body.rotation.clone(),fromBodyY:hero.userData.body.position.y};
  spinRecovery=null;chargeStarted=false;charge=0;attackBuffer=null;attackCooldown=0;guarding=false;
  hero.updateMatrixWorld(true);hero.userData.hammerHead.getWorldPosition(headPrevious);audio.play('swing',.3,{weapon:characterStats.weaponTier<2?'wood':'metal',exert:false});return true;
}
function stopSpin(){
  if(!spin)return;
  const rig=hero.userData.weaponRig;
  spinRecovery={time:0,fromRotation:rig.quaternion.clone(),fromPosition:rig.position.clone()};
  facing={x:Math.sin(hero.rotation.y),z:Math.cos(hero.rotation.y)};
  hero.rotation.y=Math.atan2(facing.x,facing.z);spin=null;
  if(chargeRing)chargeRing.visible=false;
}
function spinImpact(from,to){
  const s=spin;if(!s)return;
  const radius=hero.userData.getHeadContactRadius?.()||.52*stats.size,shaftRadius=hero.userData.getShaftContactRadius?.()||.15;
  const grip=hero.userData.hammerPivot.getWorldPosition(new THREE.Vector3());
  // A struck wall remains an occluder for the entire turn. Targets are eligible
  // again only after a full revolution, including across the angle wrap.
  const objects=nearbyObjects(player.x,player.z,stats.range+stats.size+2);
  const headWall=firstHammerHit(from,to,objects,radius),shaftWall=firstHammerHit(grip,to,objects,shaftRadius);
  const wall=shaftWall||headWall;
  // A carried opening hit is blocked only while the weapon still touches
  // it. Starting a fresh full-turn cooldown here skipped the entire next pass.
  for(const target of s.entryHits)if(target.dead||(!firstHammerHit(from,to,[target],radius)&&!firstHammerHit(grip,to,[target],shaftRadius)))s.entryHits.delete(target);
  const ready=e=>!s.entryHits.has(e)&&s.time-(s.hitTimes.get(e)??-Infinity)>=SPIN_TURN_SECONDS-1e-7;
  let hits=0,breaks=0;
  for(const e of [...enemies,...(boss&&!boss.dead?[boss]:[])]){
    if(!ready(e))continue;
    const headContact=firstHammerHit(from,to,[e],radius),shaftContact=firstHammerHit(grip,to,[e],shaftRadius);
    if(!headContact&&!shaftContact)continue;
    if(headWall&&headContact&&headContact.t>headWall.t&&!shaftContact)continue;
    const lineOfContact=firstHammerHit(grip,{x:e.x,y:grip.y,z:e.z},[...objects,e],shaftRadius);
    if(lineOfContact&&lineOfContact.target!==e)continue;
    s.hitTimes.set(e,s.time);hits++;
    const dir=normalize(e.x-player.x,e.z-player.z);
    if(e===boss)hitBoss(s.damage,dir,s.knockback);else hitEnemy(e,s.damage,dir,s.knockback,s.lift,headContact||shaftContact);
  }
  if(wall&&ready(wall.target)){
    s.hitTimes.set(wall.target,s.time);hits++;
    if(hurtObject(wall.target,s.damage,.15,wall))breaks++;else s.recoil=1;
  }
  if(hits){
    shake=Math.max(shake,breaks?.10:.065);
    if(s.time-s.soundTime>.09)s.soundTime=s.time;
    // No hit-stop on a sustained spin: contact sparks and recoil carry the hit.
    checkGoal();
  }
}
function followupDamage(target,damage,weapon){
  if(weapon!=='foot'&&weapon!=='body'&&(target.openUntil||0)>elapsed){
    target.openUntil=0;floatText(target.x,(target.y||0)+1.8,target.z,'ΑΝΟΙΓΜΑ +25%','#a7efcc',13);
    return Math.round(damage*1.25);
  }
  return damage;
}
function hitEnemy(e,damage,dir,strength,lift,contact=null,response={}){
  if(e.dead||!Number.isFinite(damage)||damage<=0)return;
  damage=followupDamage(e,damage,response.weapon);
  if(response.combo!==false)recordCombatContact(e);
  const force=clamp(Number.isFinite(strength)?strength:0,0,18);
  const mass=bodyMass(e);
  let direction=normalize(dir?.x||0,dir?.z||0);
  if(!direction.x&&!direction.z)direction=normalize(e.x-player.x,e.z-player.z);
  if(!direction.x&&!direction.z)direction={x:0,z:1};
  const duration=.40+Math.min(force/18,1)*.08,impulse=Math.min(force*1.05,6.4)/mass**.75;
  e.facingYaw??=e.mesh.rotation.y;
  e.impact={time:0,duration,dirX:direction.x,dirZ:direction.z,mass,
    amplitude:(.38+Math.min(force/18,1)*.13)/mass**.35,bounced:false,
    axis:new THREE.Vector3(direction.z,0,-direction.x),rotation:new THREE.Quaternion(),fromRotation:e.mesh.quaternion.clone()};
  e.hp-=damage;e.flash=.16;e.stagger=Math.max(e.stagger||0,response.stagger??duration);
  // Put a visible recoil on the mesh in the SAME contact step, including the
  // frozen impact frame. Do not wait for a 45 ms animation blend after damage.
  e.impact.startFraction=Math.min(.60,Math.max(.32,.10/e.impact.amplitude));
  e.mesh.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(e.impact.axis,e.impact.amplitude*e.impact.startFraction));
  e.mesh.updateMatrixWorld(true);
  const hitPoint=contact||{x:e.x,y:e.y+Math.min(1.1,e.height*.6),z:e.z};
  // A normal hit moves a light enemy about .7m, not an unlimited launch.
  // Heavy bodies keep a clear flinch while resisting most of the displacement.
  if(!response.preserveVelocity){
    e.vx=direction.x*impulse;e.vz=direction.z*impulse;
    e.vy=force>0?clamp((Number.isFinite(lift)?lift:0)*1.12+.15,2.2,4.1)/Math.sqrt(mass):Math.min(e.vy||0,0);
    e.kickFlight=null;
  }
  e.hurtTimer=2.4;
  if(response.interrupt!==false){const interrupted=interruptEnemyAttack(e,(response.stagger??duration)+.18);if(interrupted)removeEffect(interrupted);}
  applyEnemyFlash(e.materials,1);
  impactClouds?.emit(hitPoint.x,hitPoint.y,hitPoint.z,direction,Math.min(1.5,e.radius*1.6));
  if(response.fear!==false)frightenNearby(e.x,e.z,.55+characterStats.weaponTier*.2,3.6+characterStats.weaponTier*.35,e);
  showHitPoints(e,damage);
  audio.play('hit',Math.min(1,damage/100),{material:impactMaterial(e),weapon:response.weapon||(characterStats.weaponTier<2?'wood':'metal')});
  audio.play('enemyHurt',Math.min(1,damage/100),{type:e.type,fatal:e.hp<=0});
  fragments.add(hitPoint.x,hitPoint.y,hitPoint.z,8,e.palette==='organic'?[0x8fbea2,0xb6d5b4,0x83ceaa]:[0xffc271,0xf9e5b1,0x7eacb9],4,.07);
  if(e.hp<=0)killEnemy(e);
}
function killEnemy(e){
  if(e.dead)return;
  e.dead=true;guardHits.delete(e);enemies=enemies.filter(n=>n!==e);kills++;score+=Math.round((e.miniBoss?420:25*(e.xp||1))*comboMultiplier(combatCombo));
  if(e.waveNumber===wave?.number)wave.defeated++;
  nearbyTargets=nearbyTargets.filter(t=>t!==e);if(focusedTarget===e)focusedTarget=null;
  fragments.add(e.x,1,e.z,e.miniBoss?35:e.radius>.65?19:12,e.palette==='metal'?[0x6c91a0,0xa5bec3,0xff9864]:[0x679378,0x9eaf83,0x4a6265],5,e.miniBoss?.38:e.radius>.65?.24:.16,true);
  if(e.telegraph){removeEffect(e.telegraph);e.telegraph=null;}
  // Remove combat participation immediately, but let the struck body visibly
  // recoil and fall before releasing its existing, instance-owned resources.
  if(e.impact){
    e.state='dead';e.deathTime=0;e.deathDuration=e.miniBoss?.8:.65;enemyFalls.push(e);
    const fallLimit=settings.quality==='low'?20:32;
    while(enemyFalls.length>fallLimit)disposeInstance(enemyFalls.shift());
  }else disposeInstance(e);
  const reward=scaleComboReward(e.xp||1,comboMultiplier(combatCombo),comboXpCarry);comboXpCarry=reward.carry;gainXP(reward.amount);
  spawnDrop(e.x,e.z,e.palette==='metal'?'scrap':kills%3===0?'scrap':'wood');
  if(e.miniBoss||level>=6&&kills%8===0)spawnDrop(e.x+.35,e.z+.25,'crystal');
  if(e.miniBoss){spawnDrop(e.x,e.z,'relic');spawnDrop(e.x+.5,e.z,'heart');}
  if(Math.random()<.16)spawnDrop(e.x,e.z,player.hp<player.maxHp*.7&&Math.random()<.65?'heart':'gold');
}
function hurtObject(o,damage,q=0,impactPoint=null,weapon=null){
  if(o.dead||!Number.isFinite(damage)||damage<=0)return false;o.hp-=damage;o.flash=.15;o.shudder=.22;flashMaterials(o,.85);showHitPoints(o,damage);
  const nearest=impactPoint||nearestPoint(player.x,player.z,o),contact={x:nearest.x,y:nearest.y??Math.min(player.y+1,o.h),z:nearest.z};
  const fracture=destruction?.hit(o,contact,player);
  if(!fracture)audio.play(o.hp<=0?'break':'hit',Math.max(q,Math.min(1,damage/120)),{material:impactMaterial(o),weapon:weapon||(characterStats.weaponTier<2?'wood':'metal')});
  impactClouds?.emit(contact.x,contact.y,contact.z,normalize(contact.x-player.x,contact.z-player.z),o.isBuilding?1:.7);
  if(o.hp>0){fragments.add(o.x+randomBetween(-o.w/2,o.w/2),.7,o.z+randomBetween(-o.d/2,o.d/2),5,[o.color||0x8c9a91,0xf1c588],3,.1);return false;}
  o.dead=true;o.mesh.visible=false;world.invalidateNavigation?.();score+=Math.round(o.weight*80);lootCounter++;
  const palette=o.mesh.userData.fragments||[o.color||0x879893,0xcab596,0x50666a];
  fragments.add(o.x,o.h*.35,o.z,o.weight>2?30:16,palette,5+q*5,o.weight>2?.5:.25,true);
  pulse(o.x,o.z,Math.max(o.w,o.d)*.65,0xbb9f78,.3);
  if(o.type==='barrel'){fragments.add(o.x,.7,o.z,18,[0xffaa43,0xff6f37,0xffde92],7,.13);pulse(o.x,o.z,3.5,0xff783d,.4);for(const e of [...enemies])if(Math.hypot(e.x-o.x,e.z-o.z)<3.6)hitEnemy(e,65,normalize(e.x-o.x,e.z-o.z),8,3);}
  const point=nearestPoint(player.x,player.z,o),dx=point.x+(player.x-point.x)*.2,dz=point.z+(player.z-point.z)*.2;
  if(lootCounter%4===0||Math.random()<.1)spawnDrop(dx,dz,'relic');
  else if(player.hp<player.maxHp*.85&&Math.random()<.35)spawnDrop(dx,dz,'heart');
  else spawnDrop(dx,dz,'gold');
  gainXP(o.weight>2?3:1);return true;
}
function hitBoss(damage,dir,strength=5,response={}){
  if(!boss||boss.dead||!Number.isFinite(damage)||damage<=0)return;
  damage=followupDamage(boss,damage,response.weapon);
  if(response.combo!==false)recordCombatContact(boss);audio.play('hit',Math.min(1,damage/120),{material:'metal',weapon:response.weapon||(characterStats.weaponTier<2?'wood':'metal')});audio.play('enemyHurt',.8,{type:'siegeMech',fatal:boss.hp<=damage});
  boss.hp-=damage;boss.flash=.15;boss.stagger=Math.max(boss.stagger,response.stagger??.12);if(!response.preserveVelocity){boss.vx=dir.x*strength*.13;boss.vz=dir.z*strength*.13;}
  boss.impact={time:0,duration:.32,dirX:dir.x,dirZ:dir.z};
  if(response.interrupt!==false&&boss.state!=='enter'){boss.state='recover';boss.timer=Math.max(.32,boss.timer*.35);if(boss.telegraph){removeEffect(boss.telegraph);boss.telegraph=null;}}
  applyEnemyFlash(boss.materials,1);impactClouds?.emit(boss.x,boss.y+1.1,boss.z,dir,1.8);showHitPoints(boss,damage);fragments.add(boss.x,2,boss.z,12,[0xffbe75,0xff7546,0xb7cdd2],5,.1);
  if(boss.hp<=0)defeatBoss();
}
function checkGoal(){if(phase==='playing'&&!bossSpawned&&destructionPercent(world.objects)>=GOAL)spawnBoss();}
function impact(from=headPrevious,to=headNow){
  const s=swing;if(!s||s.blocked)return;
  // The load behind a shoulder/crown is anticipation. Normal cuts deal
  // damage across the forward arc; the separate held spin owns rear hits.
  if(sampleHammerSwing(s.time/s.duration,{variant:s.variant,charge:s.q}).directionZ<.04)return;
  const radius=hero.userData.getHeadContactRadius?.()||.52*stats.size,shaftRadius=hero.userData.getShaftContactRadius?.()||.15;
  const grip=hero.userData.hammerPivot.getWorldPosition(new THREE.Vector3());
  const objects=nearbyObjects(player.x,player.z,stats.range+stats.size+2).filter(o=>!s.hits.has(o));
  const headWall=firstHammerHit(from,to,objects,radius),shaftWall=firstHammerHit(grip,to,objects,shaftRadius);
  const wall=shaftWall||headWall;
  let hits=0,breaks=0;
  for(const e of [...enemies,...(boss&&!boss.dead?[boss]:[])]){
    if(s.hits.has(e))continue;
    if((e.x-player.x)*s.fx+(e.z-player.z)*s.fz<0)continue;
    // The moving head and the physical shaft both make contact. This removes
    // the dead zone that let enemies touching the warrior survive every swing.
    const headContact=firstHammerHit(from,to,[e],radius),shaftContact=firstHammerHit(grip,to,[e],shaftRadius);
    if(!headContact&&!shaftContact)continue;
    if(headWall&&headContact&&headContact.t>headWall.t&&!shaftContact)continue;
    const lineOfContact=firstHammerHit(grip,{x:e.x,y:grip.y,z:e.z},[...objects,e],shaftRadius);
    if(lineOfContact&&lineOfContact.target!==e)continue;
    const dir=normalize(e.x-player.x+s.fx*.3,e.z-player.z+s.fz*.3);s.hits.add(e);hits++;
    if(e===boss)hitBoss(s.damage,dir,s.knockback);else hitEnemy(e,s.damage,dir,s.knockback,s.lift,headContact||shaftContact);
  }
  if(wall){s.hits.add(wall.target);hits++;if(hurtObject(wall.target,s.damage,s.q,wall))breaks++;else{s.blocked=true;s.blockTime=s.time;s.blockRotation=hero.userData.weaponRig.quaternion.clone();s.blockPosition=hero.userData.weaponRig.position.clone();s.blockPose=sampleHammerSwing(s.time/s.duration,{twoHanded:s.twoHanded,charge:s.q,variant:s.variant});attackCooldown=Math.min(attackCooldown,.125);}}
  if(hits){s.hit=true;shake=Math.max(shake,(.105+s.q*.14)*(breaks?1.2:1));if(!s.feedbackDone){s.feedbackDone=true;s.contactTime=s.time;hitStop=(s.variant==='two-overhead'?.032:s.variant==='two-cross'?.026:.022)+s.q*.006;}}
  if(hits&&s.charged&&!s.quakeDone){
    s.quakeDone=true;const radius=2.3+stats.quake*.7;pulse(to.x,to.z,radius,0xffd48b,.35);
    for(const e of [...enemies])if(!s.hits.has(e)&&Math.hypot(e.x-to.x,e.z-to.z)<radius){s.hits.add(e);hitEnemy(e,s.damage*(.25+stats.quake*.12),normalize(e.x-to.x,e.z-to.z),s.knockback*.7,s.lift);}
    fragments.add(to.x,.2,to.z,20,[0xffbd6a,0xffedbf,0x9ba9a0],7,.1);
  }
  checkGoal();
}

function toggleStance(){
  if(phase==='playing'&&(touchThrowAim||touchThrowQueued))cancelTouchThrow();
  if(phase!=='playing'||kick||swing||throwFlight||throwWindup||leap||Math.abs(stance-stanceTarget)>.005)return;
  cancelAttack();spinRecovery=null;stanceTarget=stanceTarget===0?1:0;guardHeld=false;guarding=false;
  audio.play('ui');
}
function updateAim(){
  if(touchThrowAim?.dragged){
    // Thumb travel is relative to its button. Re-anchor it to the warrior
    // each frame so movement and Safari's viewport never shift the aim.
    const origin=screenPoint(player.x,player.y+1.2,player.z),g=touchThrowAim,d=Math.hypot(g.dx,g.dy);
    const reach=Math.min(screenW,screenH)*.31;
    pointer.x=origin.x+g.dx/d*reach;pointer.y=origin.y+g.dy/d*reach;pointer.active=true;
  }
  const committedDirection=!touchThrowAim?.dragged&&(touchThrowQueued?.dir||throwWindup?.dir||touchThrowAim?.manualDirection);
  if(committedDirection){
    // Guidance must show the direction the animation will actually release.
    // A stale screen coordinate drifts as the warrior and camera move.
    aim.x=committedDirection.x;aim.z=committedDirection.z;
  }else if(pointer.active){
    aimPlane.constant=-(player.y+1.2);camera.updateMatrixWorld(true);raycaster.setFromCamera({x:pointer.x/screenW*2-1,y:1-pointer.y/screenH*2},camera);
    const point=raycaster.ray.intersectPlane(aimPlane,tempV);
    if(point){const d=normalize(point.x-player.x,point.z-player.z);if(d.x||d.z){aim.x=d.x;aim.z=d.z;}}
  }else{aim.x=facing.x;aim.z=facing.z;}
  const u=hero.userData,twoHanded=stance>.9,gripCenter=twoHanded?.255:.43;
  const releaseReach=Math.max(.65,stats.range-.55-u.getHeadForwardExtent()-.43),metrics=u.getThrowMetrics(releaseReach),headBounds=u.getHeadHalfExtents();
  const releaseQ=new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI/2,0,0))
    .premultiply(new THREE.Quaternion().setFromAxisAngle(shaftUp,Math.atan2(aim.x,aim.z)));
  const wrist=new THREE.Vector3(twoHanded?0:.52,Math.max(1.3,headBounds.z+.08),.40).applyQuaternion(hero.quaternion).add(hero.position);
  const start=new THREE.Vector3(metrics.x,metrics.y-gripCenter,metrics.z).applyQuaternion(releaseQ).add(wrist);
  const end={x:start.x+aim.x*characterStats.throwRange,y:start.y,z:start.z+aim.z*characterStats.throwRange};
  const throwRadius=metrics.radius;
  const contact=firstHammerHit(start,end,[...segmentObjects(start,end,throwRadius),...enemies,...(boss&&!boss.dead?[boss]:[])],throwRadius);
  aimPreview={start,end:contact?{x:contact.x,y:start.y,z:contact.z}:end,contact};
  // Marks are a fresh proximity/visibility result, never a persistent aim lock.
  nearbyTargets=[];focusedTarget=null;let bestAlignment=Math.cos(Math.PI/10);
  const origin={x:player.x,y:player.y+1.1,z:player.z};
  for(const e of [...enemies,...(boss&&!boss.dead?[boss]:[])]){
    const dx=e.x-player.x,dz=e.z-player.z,distance=Math.hypot(dx,dz);
    if(e.dead||distance>12||distance<.001)continue;
    const endpoint={x:e.x,y:(e.y||0)+Math.min(1.1,e.height||1.1),z:e.z};
    if(firstHammerHit(origin,endpoint,segmentObjects(origin,endpoint,.06),.06))continue;
    nearbyTargets.push(e);const alignment=(dx*aim.x+dz*aim.z)/distance;
    if(alignment>bestAlignment){bestAlignment=alignment;focusedTarget=e;}
  }
  if(contact&&nearbyTargets.includes(contact.target))focusedTarget=contact.target;
  throwLock=settings.throwAutoLock&&!!touchThrowAim&&!throwFlight?chooseThrowLock(aim):null;
  if(throwLock){focusedTarget=throwLock;if(!nearbyTargets.includes(throwLock))nearbyTargets.push(throwLock);}

}
function startLeap(){
  if(phase==='playing'&&(touchThrowAim||touchThrowQueued))cancelTouchThrow();
  if(phase!=='playing'||leap||leapCooldown>0||throwWindup||Math.abs(stance-stanceTarget)>.005)return false;
  punch=null;kick=null;cancelAttack();spinRecovery=null;guarding=false;guardHeld=false;swing=null;attackCooldown=0;landingRecovery=0;landingPose=null;
  const mx=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0)+touch.x;
  const mz=(keys.has('KeyS')||keys.has('ArrowDown')?1:0)-(keys.has('KeyW')||keys.has('ArrowUp')?1:0)+touch.y;
  updateAim();const direction=Math.hypot(mx,mz)>.05?screenMovement(mx,mz):{...(pointer.active?aim:facing)};facing={...direction};
  // A smash is a deliberate second input during this jump, never inherited
  // from a mouse button or spin finger already held before take-off.
  leap={time:0,dir:dashTime>0?{...dashDirection}:direction,vy:characterStats.jumpVelocity,slam:false,strike:false,diving:false,startY:player.y,airDashed:dashTime>0,attackHeld:false,attackTime:0};leapCooldown=characterStats.jumpCooldown;
  fragments.add(player.x,.1,player.z,15,[0xc7b78e,0x7d9690],5,.12);pulse(player.x,player.z,2.2,0xb9dac4,.25);audio.play('dash');return true;
}
function armAirSmash(){
  if(!leap||leap.slam||leap.strike||throwFlight)return false;
  // Every weapon can do a small, deliberate landing strike. The heavy
  // smash is an optional held input with forged iron gear, never a tap gate.
  leap.strike=true;leap.attackHeld=true;leap.attackTime=0;
  leap.attackFromRotation=hero.userData.weaponRig.quaternion.clone();
  leap.attackFromPosition=hero.userData.weaponRig.position.clone();
  chargeHeld=false;chargeStarted=false;charge=0;attackBuffer=null;
  return true;
}
const SUPPORT_EPSILON=1e-6,PLAYER_BODY_HEIGHT=2.05;
function supportHeight(x,z,ceiling=Infinity){
  if(world.supportHeight)return world.supportHeight(x,z,player.radius,ceiling);
  let height=0;
  for(const o of nearbyObjects(x,z,player.radius))if(o.h<=ceiling+SUPPORT_EPSILON&&circleOverlaps(x,z,player.radius,o))height=Math.max(height,o.h);
  return height;
}
function moveActor(entity,dx,dz,{feetY=entity.y||0,height=entity.height||PLAYER_BODY_HEIGHT,allowStep=false}={}){
  if(world.moveActor)return world.moveActor(entity,dx,dz,{feetY,height,allowStep});
  return moveCircle(entity,dx,dz,nearbyObjects(entity.x,entity.z,(entity.radius||.44)+Math.hypot(dx,dz)+.1).filter(o=>o.h>feetY+SUPPORT_EPSILON),entity.radius);
}
function landLeap(){
  if(!leap)return;
  const slam=leap.slam,strike=leap.strike;leap=null;player.vy=0;
  landingRecovery=slam?.18:strike?.14:.07;
  landingPose={duration:landingRecovery,rotation:hero.userData.weaponRig.quaternion.clone(),position:hero.userData.weaponRig.position.clone()};
  const radius=slam?5.2+stats.quake*.7:strike?1.65:characterStats.canAirSmash?2.35:.9;
  const damage=throwFlight?0:Math.round(stats.power*(slam?3.8:strike?.70:characterStats.canAirSmash?.25:0)*stancePower());
  if(!damage){pulse(player.x,player.z,.9,0xb9d9cb,.2).position.y=player.y+.08;return;}
  impactClouds?.emit(player.x,player.y,player.z,{x:0,z:0},slam?2.2:1);
  frightenNearby(player.x,player.z,slam?1.5:.65,radius+2);
  for(const e of [...enemies]){const d=Math.hypot(e.x-player.x,e.z-player.z);if(d<=radius+e.radius&&Math.abs((e.y||0)-player.y)<=Math.max(1.1,(e.height||1)*.65))hitEnemy(e,Math.round(damage*lerp(1,.58,clamp(d/radius,0,1))),normalize(e.x-player.x,e.z-player.z),slam?13:5,slam?6:2.2);}
  for(const o of nearbyObjects(player.x,player.z,radius)){const point=nearestPoint(player.x,player.z,o),d=Math.hypot(point.x-player.x,point.z-player.z);if(d<=radius)hurtObject(o,Math.round(damage*lerp(1,.65,d/radius)),slam?1:.2);}
  if(boss&&!boss.dead&&Math.hypot(boss.x-player.x,boss.z-player.z)<=radius+boss.radius)hitBoss(damage,normalize(boss.x-player.x,boss.z-player.z),slam?15:5);
  for(const r of slam?[radius,radius*.68,radius*.38]:[radius])pulse(player.x,player.z,r,slam?0xffd28b:0xb9d9cb,slam?.55:.3).position.y=player.y+.09;
  fragments.add(player.x,player.y+.15,player.z,slam?65:16,slam?[0xffcb80,0xfff0be,0x9a9d8b,0x5e7370]:[0xbeb594,0x738680],slam?11:4,slam?.22:.11,slam);
  if(slam)for(let i=0;i<10;i++){const angle=i*Math.PI/5+Math.random()*.2,points=[];for(let j=0;j<4;j++){const r=j/3*radius;points.push(new THREE.Vector3(player.x+Math.sin(angle+j*.08)*r,player.y+.1,player.z+Math.cos(angle+j*.08)*r));}const mesh=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:0xffd38f,transparent:true,opacity:1}));scene.add(mesh);arcs.push({mesh,life:.6,max:.6});}
  shake=slam?.38:.1;hitStop=slam?.022:.005;audio.play(slam?'slam':'hit',slam?1:.2,{material:'masonry',weapon:characterStats.weaponTier<2?'wood':'metal'});checkGoal();
}
function canThrow(){return !kick&&phase==='playing'&&!throwFlight&&!throwWindup&&throwCooldown<=0&&!swing&&!leap&&Math.abs(stance-stanceTarget)<=.005;}
function startThrow(direction=null,channelAngle=null){
  if(!canThrow())return false;
  if(direction){const d=normalize(direction.x,direction.z);aim.x=d.x;aim.z=d.z;}else updateAim();
  const locked=settings.throwAutoLock?chooseThrowLock(aim):null;
  const launchDirection=locked?normalize(locked.x-player.x,locked.z-player.z):{...aim};
  const rig=hero.userData.weaponRig;
  cancelAttack();spinRecovery=null;throwWindup={time:0,dir:launchDirection,channelAngle,target:locked,
    fromRotation:rig.quaternion.clone(),fromPosition:rig.position.clone(),fromReach:hero.userData.reachScale};
  const move=movementDirection();facing=move.x||move.z?move:{...aim};guardHeld=false;guarding=false;
  return true;
}
function releaseHammer(){
  const dir=throwWindup.dir,mesh=hero.userData.createThrownHammer();
  hero.updateMatrixWorld(true);
  const balance=mesh.userData.balance||{x:0,y:mesh.userData.balanceY,z:0};
  const origin=hero.userData.hammerPivot.localToWorld(new THREE.Vector3(balance.x,balance.y,balance.z));
  const {x,y,z}=origin,quaternion=hero.userData.hammerPivot.getWorldQuaternion(new THREE.Quaternion());
  mesh.position.copy(origin);mesh.quaternion.copy(quaternion);scene.add(mesh);
  const materials=new Set();mesh.traverse(n=>{if(n.material)for(const m of Array.isArray(n.material)?n.material:[n.material])materials.add(m);});
  throwFlight={mesh,materials:[...materials],x,y,z,dir:{...dir},quaternion,
    retrievable:!characterStats.canReturn,grounded:false,vy:1.8,groundY:0,maxRange:characterStats.throwRange,
    spinAxis:new THREE.Vector3(dir.z,0,-dir.x),radius:mesh.userData.radius,speed:characterStats.canReturn?23:18,distance:0,
    legDistance:0,returning:false,life:0,returnTime:0,hits:new Set(),hitCount:0,bounces:0,chainTarget:null,
    damage:Math.round(stats.power*characterStats.throwDamageMultiplier*stancePower()),trailTime:0,
    breadcrumbs:[{x:player.x,z:player.z}],lastBreadcrumb:0,launchGroundY:player.y};
  const target=throwWindup.target;
  if(settings.throwAutoLock&&target&&!target.dead){
    const point=throwTargetPoint(target),distance=Math.hypot(point.x-x,point.z-z);
    if(distance>.2&&!firstHammerHit(origin,point,segmentObjects(origin,point,throwFlight.radius),throwFlight.radius)){
      const time=distance/throwFlight.speed;
      throwFlight.dir=normalize(point.x-x,point.z-z);throwFlight.spinAxis.set(throwFlight.dir.z,0,-throwFlight.dir.x);
      if(throwFlight.retrievable)throwFlight.vy=(point.y-y+3.75*time*time)/time;
      else throwFlight.chainTarget=target;
    }
  }
  hammerLightning=0;if(hammerAura)hammerAura.root.visible=false;
  hero.userData.setWeaponVisible(false);throwWindup=null;throwCooldown=1.25;audio.play('swing',1,{weapon:characterStats.weaponTier<2?'wood':'metal',exert:false});
}
function chooseThrowLock(direction){
  const origin={x:player.x,y:player.y+1.2,z:player.z};
  const targets=[...enemies,...(boss&&!boss.dead?[boss]:[])];
  return selectThrowLock(origin,direction,targets,nearbyObjects(player.x,player.z,characterStats.throwRange+2),
    {range:characterStats.throwRange,radius:hero.userData.getThrowRadius?.()||.45});
}
function throwTargetPoint(target){
  return {x:target.x,y:(target.y||0)+Math.min(1.35,(target.height||target.h||2)*.6),z:target.z};
}
function validChainTarget(h,target){
  return target&&!target.dead&&!h.hits.has(target)&&(target===boss||enemies.includes(target));
}
function nextThrowTarget(h){
  if(!settings.throwAutoLock||!characterStats.canRicochet||h.hitCount>=Math.min(THROW_MAX_HITS,characterStats.maxChainHits))return null;
  let nearest=null,bestDistance=THROW_CHAIN_RADIUS;
  for(const target of [...enemies,...(boss&&!boss.dead?[boss]:[])]){
    if(!validChainTarget(h,target))continue;
    const point=throwTargetPoint(target),distance=Math.hypot(point.x-h.x,point.y-h.y,point.z-h.z);
    if(distance>bestDistance||distance<.001)continue;
    // The bouncing weapon respects the same full-size swept collider as the
    // initial throw. A target behind a building is never selected through it.
    if(firstHammerHit(h,point,segmentObjects(h,point,h.radius),h.radius))continue;
    bestDistance=distance;nearest=target;
  }
  return nearest;
}
function settleThrownWeapon(h){
  const original={x:h.x,z:h.z},breadcrumbs=h.breadcrumbs||[{x:player.x,z:player.z}];
  const heading=Math.atan2(h.dir.x,h.dir.z),oldRotation=h.mesh.quaternion.clone();
  let placement=null,footprint=null,restY=0,floor=0;
  // A long log can lie across a lane but not through a parked car. Try its
  // natural pose, a quarter-turn, then upright if the alley is very narrow.
  for(const rotation of [[Math.PI/2,0,heading],[Math.PI/2,0,heading+Math.PI/2],[0,heading,0]]){
    h.mesh.position.set(0,0,0);h.mesh.rotation.set(...rotation);h.mesh.updateMatrixWorld(true);
    const box=new THREE.Box3().setFromObject(h.mesh);
    footprint={minX:box.min.x,maxX:box.max.x,minZ:box.min.z,maxZ:box.max.z,height:box.max.y-box.min.y};
    floor=0;
    if(world.findWeaponRest){
      const ceiling=Math.max(0,h.y+.01);
      placement=world.findWeaponRest(original,footprint,{bounds:BOUNDS,breadcrumbs,ceiling});
      if(!placement&&breadcrumbs.length)placement=world.findWeaponRest(breadcrumbs[0],footprint,{bounds:BOUNDS,breadcrumbs,ceiling});
      if(placement)floor=placement.groundY;
    }else{
      const support=h.launchGroundY>.1?world.objects.find(o=>!o.dead&&o.h<=h.launchGroundY+.05&&o.h<=h.y+.01&&Math.abs(o.x-h.x)<=o.w/2&&Math.abs(o.z-h.z)<=o.d/2):null;
      if(support){
        placement=findWeaponRest(original,footprint,world.objects.filter(o=>o.h>support.h+.04),{bounds:BOUNDS,breadcrumbs,support});
        if(placement)floor=support.h;
      }
      if(!placement)placement=findWeaponRest(original,footprint,world.objects,{bounds:BOUNDS,breadcrumbs});
      if(!placement&&breadcrumbs.length)placement=findWeaponRest(breadcrumbs[0],footprint,world.objects,{bounds:BOUNDS,breadcrumbs});
    }
    if(placement){restY=floor+.09-box.min.y;break;}
  }
  if(!placement){
    // Do not park invalid geometry. Retry after the obstruction moves/breaks;
    // the last non-penetrating airborne pose remains visible and retrievable.
    h.mesh.quaternion.copy(oldRotation);h.mesh.position.set(h.x,h.y,h.z);h.restPending=true;return false;
  }
  h.returning=false;h.chainTarget=null;h.grounded=true;h.groundY=floor;h.vy=0;h.restPending=false;
  h.x=placement.x;h.z=placement.z;h.y=restY;h.restFootprint=footprint;h.restCheck=0;
  h.mesh.position.set(h.x,h.y,h.z);
  pulse(h.x,h.z,1.1,0xf0d39b,.5).position.y=floor+.06;
  updateAttackFeedback();return true;
}
function returnHammer(h){if(h.retrievable){settleThrownWeapon(h);return;}h.returning=true;h.chainTarget=null;h.returnTime=0;}
function catchHammer(h){
  if(throwFlight!==h)return;
  punch=null;chargeHeld=false;chargeStarted=false;attackBuffer=null;holdElapsed=0;
  hero.userData.setUnarmedPose?.(null);
  disposeInstance(h);throwFlight=null;hero.userData.setWeaponVisible(true);updateAttackFeedback();
  hammerLightning=characterStats.canLightning?HAMMER_LIGHTNING_SECONDS:0;
  if(hammerAura)hammerAura.lastPattern=-1;
  audio.play('pickup',.7);pulse(player.x,player.z,1.15,characterStats.canLightning?0x9cecff:0xd3bd91,.27).position.y=player.y+.06;
  const head=hero.userData.hammerHead.getWorldPosition(new THREE.Vector3());
  if(characterStats.canLightning)fragments.add(head.x,head.y,head.z,12,[0xecffff,0x82e8ff,0x5ab9ff],3.2,.055);
}
function updateThrownHammer(dt){
  if(!throwFlight)return;const h=throwFlight;h.life+=dt;
  if(h.restPending){
    if(Math.hypot(player.x-h.x,player.z-h.z)<1.3&&Math.abs(player.y+.8-h.y)<1.8){
      const from={x:player.x,y:player.y+.8,z:player.z},to={x:h.x,y:h.y,z:h.z};
      if(!firstHammerHit(from,to,segmentObjects(from,to,.08),.08)){catchHammer(h);return;}
    }
    if((h.restCheck=(h.restCheck||0)-dt)<=0){h.restCheck=.15;settleThrownWeapon(h);}return;
  }
  if(h.grounded){
    h.restCheck-=dt;if(movingVehicles.size)h.restCheck=0;
    if(h.restCheck<=0){
      h.restCheck=.10;
      const support=world.weaponSupportAt?.(h.x,h.z,h.restFootprint,h.groundY+.02);
      const supported=world.weaponSupportAt?!!support&&Math.abs(support.height-h.groundY)<.05:
        h.groundY<=.04||world.objects.some(o=>!o.dead&&Math.abs(o.h-h.groundY)<.04&&h.x+h.restFootprint.minX>=o.x-o.w/2&&h.x+h.restFootprint.maxX<=o.x+o.w/2&&h.z+h.restFootprint.minZ>=o.z-o.d/2&&h.z+h.restFootprint.maxZ<=o.z+o.d/2);
      const clear=world.weaponRestClear?world.weaponRestClear(h,h.restFootprint,BOUNDS):restSpotClear(h,h.restFootprint,nearbyObjects(h.x,h.z,6),BOUNDS);
      if(!supported||!clear){settleThrownWeapon(h);return;}
    }
    h.mesh.position.y=h.y+Math.sin(visualTime*4)*.025;
    const edge=nearestPickupPoint(player,h,h.restFootprint);
    if(Math.hypot(player.x-edge.x,player.z-edge.z)<player.radius+.65&&Math.abs(player.y-h.groundY)<1){
      const from={x:player.x,y:player.y+.65,z:player.z},to={x:edge.x,y:h.groundY+.65,z:edge.z};
      const walls=segmentObjects(from,to,.08).filter(o=>o.h>Math.min(player.y,h.groundY)+.65);
      if(!firstHammerHit(from,to,walls,.08))catchHammer(h);
    }
    return;
  }
  if(h.distance-(h.lastBreadcrumb||0)>.35){
    h.breadcrumbs.push({x:h.x,z:h.z});h.lastBreadcrumb=h.distance;
    if(h.breadcrumbs.length>160)h.breadcrumbs.splice(1,1);
  }
  const from=new THREE.Vector3(h.x,h.y,h.z);
  if(!h.returning&&(h.life>3.2||h.distance>52)){returnHammer(h);if(h.grounded||h.restPending)return;}
  if(h.returning){
    h.returnTime+=dt;
    // The projectile is centered on its balance point, so home to the held
    // weapon's balance point too. This follows the actual moving hand pose.
    hero.updateMatrixWorld(true);
    const target=hero.userData.getThrowCenterWorld(new THREE.Vector3()),delta=target.clone().sub(from),distance=delta.length();
    const step=(29+Math.min(12,h.returnTime*4))*dt;
    if(distance<=Math.max(.1,step)){
      h.mesh.position.copy(target);h.mesh.quaternion.copy(hero.userData.hammerPivot.getWorldQuaternion(new THREE.Quaternion()));
      catchHammer(h);return;
    }
    delta.multiplyScalar(step/distance);h.x+=delta.x;h.y+=delta.y;h.z+=delta.z;
    if(distance<2.5)h.mesh.quaternion.slerp(hero.userData.hammerPivot.getWorldQuaternion(new THREE.Quaternion()),1-Math.exp(-dt*26));
    else h.mesh.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(h.spinAxis,dt*22));
  }else{
    if(h.chainTarget&&!validChainTarget(h,h.chainTarget)){
      h.chainTarget=nextThrowTarget(h);h.legDistance=0;
      if(!h.chainTarget)returnHammer(h);
    }
    if(!h.returning){
      let dy=0;
      if(h.chainTarget){
        const point=throwTargetPoint(h.chainTarget),delta=new THREE.Vector3(point.x-h.x,point.y-h.y,point.z-h.z).normalize();
        h.dir={x:delta.x,z:delta.z};dy=delta.y;h.spinAxis.set(delta.z,0,-delta.x).normalize();
      }
      if(h.retrievable)h.vy-=7.5*dt;
      const to={x:h.x+h.dir.x*h.speed*dt,y:h.y+dy*h.speed*dt+(h.retrievable?h.vy*dt:0),z:h.z+h.dir.z*h.speed*dt};
      const targets=[...segmentObjects(from,to,h.radius),...enemies,...(boss&&!boss.dead?[boss]:[])].filter(target=>!h.hits.has(target));
      const hit=firstHammerHit(from,to,targets,h.radius);
      h.x=hit?hit.x:to.x;h.y=hit?hit.y:to.y;h.z=hit?hit.z:to.z;
      const traveled=Math.hypot(h.x-from.x,h.y-from.y,h.z-from.z);h.distance+=traveled;h.legDistance+=traveled;
      if(hit){
        const target=hit.target;h.hits.add(target);
        if(target===boss)hitBoss(h.damage,h.dir,11);
        else if(target.w!==undefined)hurtObject(target,h.damage,.7,hit);
        else hitEnemy(target,h.damage,h.dir,11,3.2);
        if(target.w===undefined){
          h.hitCount++;h.chainTarget=nextThrowTarget(h);h.legDistance=0;
          if(h.chainTarget){h.bounces++;h.speed=26;}
          else returnHammer(h);
        }else returnHammer(h);
        fragments.add(h.x,h.y,h.z,14,[0xffd992,0xecffff,0x83dfff],5,.09);
        pulse(h.x,h.z,1.5,h.hitCount>1?0x8ae8ff:color.gold,.23).position.y=Math.max(.08,h.y-.5);
        shake=Math.max(shake,.13);checkGoal();
      }else if((!h.chainTarget&&h.distance>=h.maxRange)||h.legDistance>12&&h.chainTarget||Math.abs(h.x)>BOUNDS||Math.abs(h.z)>BOUNDS||h.retrievable&&h.y<=.24)returnHammer(h);
      // Integrating rotation preserves the visible pose when a bounce changes
      // its spin axis, unlike rebuilding from total lifetime on each new axis.
      if(!h.grounded&&!h.restPending)h.mesh.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(h.spinAxis,dt*22));
    }
  }
  h.mesh.position.set(h.x,h.y,h.z);
  if(h.life-h.trailTime>=1/60){
    weaponTrail(h.trailFrom||from,new THREE.Vector3(h.x,h.y,h.z),h.returning?.18:.26,h.returning?0x9dedff:h.hitCount?0x77dcff:0xffc473);
    h.trailFrom=new THREE.Vector3(h.x,h.y,h.z);h.trailTime=h.life;
  }
}

function beginWave(number=1){
  const plan=wavePlan(number);round=plan.number;
  wave={number:round,total:plan.total,spawned:0,defeated:0,batch:0,timer:plan.firstDelay,state:'active',breakTimer:0};
}
function updateWaves(dt){
  if(!wave||boss&&!boss.dead)return;
  const plan=wavePlan(wave.number);
  if(wave.state==='break'){
    wave.breakTimer-=dt;
    if(wave.breakTimer<=0){beginWave(round+1);player.hp=Math.min(player.maxHp,player.hp+12);audio.play('start');}
    return;
  }
  if(wave.spawned>=wave.total&&wave.defeated>=wave.total&&enemies.length===0){
    wave.state='break';wave.breakTimer=plan.breakTime;return;
  }
  wave.timer-=dt;
  if(wave.timer>0||wave.spawned>=wave.total)return;
  const cap=Math.min(plan.aliveCap,settings.quality==='low'?36:48),slots=cap-enemies.length;
  if(slots<=0){wave.timer=.6;return;}
  const batch=waveBatch(round,wave.spawned,wave.batch,slots);
  let created=0;
  for(const type of batch){
    // Keep the scheduled order on failure: the final mini-boss cannot consume
    // an earlier missing member's slot and then be scheduled a second time.
    if(!spawnEnemy(type,null,{waveNumber:round}))break;
    wave.spawned++;created++;
  }
  if(created)wave.batch++;
  wave.timer=created?plan.interval:.6;
}
function spawnPosition(distance=17,radius=.8){
  const free=p=>Math.hypot(p.x-player.x,p.z-player.z)>10&&!nearbyObjects(p.x,p.z,radius+.2).some(o=>circleOverlaps(p.x,p.z,radius,o));
  const roads=world.layout?.roads||[];
  for(let i=0;i<48;i++){
    const angle=Math.random()*Math.PI*2,r=distance+Math.random()*5;
    const p={x:clamp(player.x+Math.sin(angle)*r,-BOUNDS+2,BOUNDS-2),z:clamp(player.z+Math.cos(angle)*r,-BOUNDS+2,BOUNDS-2)};
    // Spawn on the connected road network, with arrivals distributed all around.
    if(roads.length){const axis=i%2?'x':'z';p[axis]=roads.reduce((best,v)=>Math.abs(v-p[axis])<Math.abs(best-p[axis])?v:best,roads[0]);}
    if(free(p)&&!enemies.some(e=>Math.hypot(e.x-p.x,e.z-p.z)<e.radius+radius+.4))return p;
  }
  // Junctions are reserved by the city layout. Search closest valid junctions
  // instead of dropping a wave member into an inaccessible building footprint.
  const fallback=[];for(const x of roads.length?roads:[0])for(const z of roads.length?roads:[-BOUNDS+5,BOUNDS-5]){
    const p={x,z};if(free(p))fallback.push(p);
  }
  fallback.sort((a,b)=>Math.abs(Math.hypot(a.x-player.x,a.z-player.z)-distance)-Math.abs(Math.hypot(b.x-player.x,b.z-player.z)-distance));
  return fallback[0]||null;
}
function spawnEnemy(forcedType=null,position=null,{waveNumber=null}={}){
  const qualityCap=settings.quality==='low'?36:48;if(enemies.length>=qualityCap)return null;
  const type=forcedType||enemyTypeForWave(round),base=enemyStatsForWave(type,round);
  let pos=position||spawnPosition(17,base.radius);
  if(!pos)return null;
  if(nearbyObjects(pos.x,pos.z,base.radius+.1).some(o=>circleOverlaps(pos.x,pos.z,base.radius,o))){
    const origin={...pos};let found=false;
    for(let ring=1;ring<6&&!found;ring++)for(let i=0;i<12;i++){
      const a=i*Math.PI/6,p={x:clamp(origin.x+Math.sin(a)*ring,-BOUNDS+2,BOUNDS-2),z:clamp(origin.z+Math.cos(a)*ring,-BOUNDS+2,BOUNDS-2)};
      if(!nearbyObjects(p.x,p.z,base.radius+.1).some(o=>circleOverlaps(p.x,p.z,base.radius,o))){pos=p;found=true;break;}
    }
    if(!found)pos=spawnPosition(17,base.radius);
    if(!pos)return null;
  }
  const mesh=['zombie','robot','brute'].includes(type)?makeEnemy(type):makeCityEnemy(type);installEnemyHead(mesh,type);scene.add(mesh);
  const e={mesh,type,x:pos.x,z:pos.z,y:0,vx:0,vz:0,vy:0,...base,maxHp:base.hp,materials:prepareMaterials(mesh),flash:0,stagger:0,hurtTimer:0,walk:Math.random()*5,timer:randomBetween(1.1,2.6),state:'walk',dead:false,level:enemyLevel(type,waveNumber||round),slowTime:0,slowFactor:1,stunTime:0,kickFlight:null,telegraph:null,attackDir:{x:0,z:1},waveNumber,navTimer:0,navDirection:{x:0,z:1}};
  initEnemyReaction(e,spawnCounter);mesh.position.set(e.x,0,e.z);enemies.push(e);spawnCounter++;
  if(roundTime>5)fragments.add(e.x,.1,e.z,e.miniBoss?18:4,e.palette==='metal'?[0x537b77,0xffac69]:[0x537b77,0x81958a],e.miniBoss?5:2,.09);
  if(e.miniBoss){pulse(e.x,e.z,4.4,0xff866b,1);audio.play('boss');}
  return e;
}
function hurtPlayer(damage,dx=0,dz=0,blockable=true){
  if(phase!=='playing'||player.invincible>0||dashTime>0||(player.y>1.6&&blockable))return;
  const directionLength=Math.hypot(dx,dz),source={x:player.x-dx,z:player.z-dz};
  if(blockable&&directionLength>.01&&guarding&&facingCoverage(facing,source,player,Math.PI*.36)){
    fragments.add(player.x+facing.x,player.y+1.3,player.z+facing.z,7,[0xa5e5de,0xffd490],4,.07);audio.play('hit',.1,{material:characterStats.weaponTier<2?'wood':'metal'});return;
  }
  const shieldFacing=spin?{x:Math.sin(hero.rotation.y),z:Math.cos(hero.rotation.y)}:facing;
  if(blockable&&characterStats.hasShield&&directionLength>.01&&stance<.05&&!throwWindup&&!throwFlight&&facingCoverage(shieldFacing,source,player,Math.PI*.32)){damage*=.65;fragments.add(player.x+shieldFacing.x*.6,player.y+1,player.z+shieldFacing.z*.6,4,[0xffd490,0x8dc9cd],3,.06);}

  player.hp=Math.max(0,player.hp-damage);player.invincible=.85;player.hurtAgo=0;player.vx=dx*4;player.vz=dz*4;
  redFlash=.55;shake=Math.max(shake,.19);resetHitCombo(combatCombo);comicState=null;audio.play('hurt');floatText(player.x,2.5,player.z,'−'+Math.ceil(damage),'#ff8d80',21);
  if(player.hp<=0)endGame(false);
}
function guardContact(from,to){
  if(!guarding||!facingCoverage(facing,from,player,Math.PI*.42))return null;
  const g=guardDimensions();
  const before=(from.x-player.x)*facing.x+(from.z-player.z)*facing.z-g.forward;
  const after=(to.x-player.x)*facing.x+(to.z-player.z)*facing.z-g.forward;
  if(before<0||after>0||before===after)return null;
  const t=before/(before-after),x=lerp(from.x,to.x,t)-player.x,z=lerp(from.z,to.z,t)-player.z;
  const lateral=x*facing.z-z*facing.x,vertical=lerp(from.y,to.y,t)-player.y-g.height;
  return lateral*lateral+vertical*vertical<=(g.radius+.13)**2?t:null;
}
function shoot(e){
  const dir=normalize(player.x-e.x,player.z-e.z),count=e.burst||1;
  for(let i=0;i<count;i++){
    const angle=(i-(count-1)/2)*.16,cos=Math.cos(angle),sin=Math.sin(angle);
    const dx=dir.x*cos+dir.z*sin,dz=dir.z*cos-dir.x*sin;
    const mesh=new THREE.Mesh(new THREE.OctahedronGeometry(e.miniBoss?.21:.13),new THREE.MeshBasicMaterial({color:e.miniBoss?0xffbd64:0xff7963}));
    const speed=e.boltSpeed||10.5;
    mesh.position.set(e.x,1,e.z);scene.add(mesh);bolts.push({mesh,x:e.x,z:e.z,vx:dx*speed,vz:dz*speed,life:3.5,damage:e.damage});
  }
}
function updateEnemies(dt){
  function advanceBody(e){
    const oldY=e.y;
    const collisionMoved=advanceKickedEnemy(e,dt);
    const speed=Math.hypot(e.vx,e.vz);
    // Use the same live pieces for side walls and roof/ledge support.
    moveActor(e,collisionMoved?0:e.vx*dt,collisionMoved?0:e.vz*dt,{feetY:oldY,height:e.height,allowStep:!e.kickFlight});
    const damp=Math.exp(-(e.kickFlight?3.4:8)*dt);e.vx*=damp;e.vz*=damp;
    const feetBeforeGravity=e.y;
    e.vy-=18*dt;e.y+=e.vy*dt;
    if(e.vy>0&&world.ceilingHeight){const ceiling=world.ceilingHeight(e.x,e.z,e.radius,feetBeforeGravity+e.height);if(e.y+e.height>=ceiling){e.y=Math.max(feetBeforeGravity,ceiling-e.height);e.vy=0;}}
    let floor=world.supportHeight?.(e.x,e.z,e.radius,Math.max(oldY,feetBeforeGravity))??0;
    if(!world.supportHeight)for(const o of nearbyObjects(e.x,e.z,e.radius))if(o.h<=oldY+SUPPORT_EPSILON&&circleOverlaps(e.x,e.z,e.radius,o))floor=Math.max(floor,o.h);
    e.supportY=floor;
    if(e.vy<=0&&e.y<=floor){
      e.y=floor;
      if(e.impact&&!e.impact.bounced&&e.vy< -1.8){e.vy=Math.min(1,-e.vy*.2);e.impact.bounced=true;}
      else e.vy=0;
    }
    if(e.impact)e.impact.time+=dt;
  }
  function poseBody(e,falling=false){
    const u=e.mesh.userData,i=e.impact;
    e.facingYaw??=e.mesh.rotation.y;
    e.mesh.position.set(e.x,e.y,e.z);e.mesh.rotation.set(0,e.facingYaw,0);
    if(u.leftLeg){u.leftLeg.rotation.x=Math.sin(e.walk)*.5;u.leftLeg.rotation.z=u.leftLeg.userData.restRoll||0;u.leftLeg.rotation.y=u.leftLeg.userData.restYaw||0;}
    if(u.rightLeg){u.rightLeg.rotation.x=-Math.sin(e.walk)*.5;u.rightLeg.rotation.z=u.rightLeg.userData.restRoll||0;u.rightLeg.rotation.y=u.rightLeg.userData.restYaw||0;}
    if(u.body){u.body.rotation.x=e.state==='windup'?-.22:Math.sin(e.walk*2)*.03;u.body.rotation.z=0;}
    if(u.leftArm){u.leftArm.rotation.x=e.state==='windup'?-1.3:.1+Math.sin(e.walk)*.23;u.leftArm.rotation.z=u.leftArm.userData.restRoll||0;}
    if(u.rightArm){u.rightArm.rotation.x=e.state==='windup'?-1.3:.1-Math.sin(e.walk)*.23;u.rightArm.rotation.z=u.rightArm.userData.restRoll||0;}
    u.animate?.(e,dt,visualTime);
    if(!falling)poseEnemyReaction(e,visualTime);
    if(!i)return;
    const start=i.startFraction??.30,kick=start+(1-start)*smooth(i.time/.035),recover=1-smooth((i.time-.08)/(i.duration-.08));
    const recoil=kick*recover,fall=falling?smooth(e.deathTime/(e.deathDuration*.85)):0;
    const tilt=i.amplitude*recoil+fall*1.27;
    i.rotation.setFromAxisAngle(i.axis,tilt);
    // Apply AFTER every species' walking/weapon animation. Tilting the whole
    // articulated rig keeps shoulders, hands and feet attached during recoil.
    e.mesh.quaternion.premultiply(i.rotation);
    e.mesh.position.y+=Math.sin(tilt)*Math.min(.3,e.radius*.45);
    const localX=i.dirX*Math.cos(e.facingYaw)-i.dirZ*Math.sin(e.facingYaw);
    const localZ=i.dirX*Math.sin(e.facingYaw)+i.dirZ*Math.cos(e.facingYaw);
    const pose=Math.max(recoil,fall*.75);
    if(u.leftArm){u.leftArm.rotation.x-=pose*(.55+localZ*.15);u.leftArm.rotation.z-=pose*(.32+localX*.12);}
    if(u.rightArm){u.rightArm.rotation.x-=pose*(.68+localZ*.15);u.rightArm.rotation.z+=pose*(.32-localX*.12);}
    const legs=u.legs||[u.leftLeg,u.rightLeg];
    for(let n=0;n<legs.length;n++)if(legs[n]){
      const side=legs.length>2?(n<legs.length/2?-1:1):(n===0?-1:1);
      legs[n].rotation.x+=pose*(-localZ*.25+side*.17);
      legs[n].rotation.z+=side*pose*.16;
    }
    if(!falling&&i.time>=i.duration)e.impact=null;
  }
  for(const e of [...enemies]){
    if(e.dead)continue;
    e.facingYaw??=e.mesh.rotation.y;
    e.flash=Math.max(0,e.flash-dt);e.stagger=Math.max(0,e.stagger-dt);e.hurtTimer=Math.max(0,e.hurtTimer-dt);
    applyEnemyFlash(e.materials,e.flash/.16);
    const dx=player.x-e.x,dz=player.z-e.z,dist=Math.hypot(dx,dz),dir=normalize(dx,dz);
    advanceBody(e);
    e.slowTime=Math.max(0,(e.slowTime||0)-dt);e.stunTime=Math.max(0,(e.stunTime||0)-dt);
    const movementScale=e.slowTime>0?(e.slowFactor??1):1;
    e.timer-=dt*movementScale;
    e.sightTimer=(e.sightTimer||0)-dt;
    if(e.sightTimer<=0){e.sightTimer=.13;e.seesPlayer=dist<13&&(world.hasLineOfSight?.(e.x,e.z,player.x,player.z,.16)??true);}
    const afraid=updateEnemyThreat(e,player,dt,{airborne:!!leap,smashing:!!leap?.slam,canSee:e.seesPlayer,threatPower:.6+characterStats.weaponTier*.22});
    if(afraid&&e.stagger<=0){
      const telegraph=interruptEnemyAttack(e,.45);if(telegraph)removeEffect(telegraph);
      const speed=e.speed*1.3*movementScale,delta=moveActor(e,e.fearMoveX*speed*dt,e.fearMoveZ*speed*dt,{height:e.height,allowStep:true});
      e.walk+=Math.hypot(delta.x,delta.z)*6;e.facingYaw=Math.atan2(dir.x,dir.z);
    }
    if(!afraid&&e.stagger<=0&&(e.y-e.supportY<.2||e.state==='lunge')){
      if(e.state==='walk'){
        e.navTimer-=dt;
        if(e.navTimer<=0){e.navTimer=.18;e.navDirection=world.getChaseDirection?.(e.x,e.z,player.x,player.z,e.radius)||dir;}
        let mx=e.navDirection.x,mz=e.navDirection.z;
        const separation={x:0,z:0};
        for(const other of enemies){if(other===e)continue;const ox=e.x-other.x,oz=e.z-other.z,dd=ox*ox+oz*oz;if(dd>.01&&dd<1.65){const repel=(1.3-Math.sqrt(dd))*.55;separation.x+=ox/Math.sqrt(dd)*repel;separation.z+=oz/Math.sqrt(dd)*repel;}}
        const clearShot=e.attackKind==='ranged'&&dist<12&&(world.hasLineOfSight?.(e.x,e.z,player.x,player.z,.18)??true);
        const stop=clearShot&&dist<6.5?0:1;
        const delta=moveActor(e,(mx*e.speed*movementScale*stop+separation.x)*dt,(mz*e.speed*movementScale*stop+separation.z)*dt,{height:e.height,allowStep:true});
        e.walk+=Math.hypot(delta.x,delta.z)*6;
        e.facingYaw=Math.atan2(dir.x,dir.z);
        if(e.timer<=0&&((e.attackKind==='ranged'&&clearShot)||(e.attackKind==='lunge'&&dist<3.1+e.radius*.25)||(e.attackKind==='slam'&&dist<(e.attackRadius||2.95)+.5))){
          e.state='windup';e.timer=e.windup;e.attackDir=dir;
          e.telegraph=makeTelegraph(e.x,e.z,e.attackKind==='slam'?e.attackRadius:e.attackKind==='ranged'?e.radius+.3:1.05,e.attackKind==='ranged'?0xff8d62:0xef6863);
        }
      }else if(e.state==='windup'){
        if(e.telegraph){e.telegraph.position.set(e.x,.09,e.z);e.telegraph.material.opacity=.35+Math.sin(visualTime*25)*.2;}
        if(e.timer<=0){
          if(e.telegraph){removeEffect(e.telegraph);e.telegraph=null;}
          if(e.attackKind==='ranged'){shoot(e);e.state='walk';e.timer=e.attackRecovery+Math.random()*.6;}
          else if(e.attackKind==='slam'){
            pulse(e.x,e.z,e.attackRadius,0xfc7765,.42);fragments.add(e.x,.1,e.z,e.miniBoss?28:12,[0xc4bb97,0x75897d],e.miniBoss?8:5,.12);if(dist<e.attackRadius&&player.y<.8)hurtPlayer(e.damage,dir.x,dir.z,false);e.state='walk';e.timer=e.attackRecovery;
          }else{e.state='lunge';e.timer=.27;e.vy=3.4;}
        }
      }else if(e.state==='lunge'){
        moveActor(e,e.attackDir.x*e.lungeSpeed*movementScale*dt,e.attackDir.z*e.lungeSpeed*movementScale*dt,{height:e.height});
        if(dist<e.radius+player.radius+.2)hurtPlayer(e.damage,e.attackDir.x,e.attackDir.z);
        if(e.timer<=0){e.state='walk';e.timer=e.attackRecovery;}
      }
    }
    // Damage belongs to the telegraphed lunge, slam or projectile; merely
    // touching a walking enemy must not drain health between its attacks.
    poseBody(e);
  }
  for(let n=enemyFalls.length-1;n>=0;n--){
    const e=enemyFalls[n];e.deathTime+=dt;
    if(e.deathTime>=e.deathDuration){disposeInstance(e);enemyFalls.splice(n,1);continue;}
    advanceBody(e);poseBody(e,true);
    e.flash=Math.max(0,e.flash-dt);applyEnemyFlash(e.materials,e.flash/.16);
    const opacity=1-smooth((e.deathTime-(e.deathDuration-.18))/.18);
    if(opacity<1)for(const m of e.materials||[]){m.transparent=true;m.opacity=opacity;m.depthWrite=false;}
  }
  for(let i=bolts.length-1;i>=0;i--){
    const b=bolts[i],from={x:b.x,y:1,z:b.z},to={x:b.x+b.vx*dt,y:1,z:b.z+b.vz*dt};b.life-=dt;
    const localObjects=segmentObjects(from,to,.13);
    const targets=b.reflected?[...localObjects,...enemies,...(boss&&!boss.dead?[boss]:[])]:localObjects;
    const hit=firstHammerHit(from,to,targets,.13);
    const playerT=player.y<1.6?segmentCircleHit(from.x,from.z,to.x,to.z,player.x,player.z,.65):null;
    const guardT=b.reflected?null:guardContact(from,to);
    if(guardT!==null&&(!hit||guardT<hit.t)&&(!playerT||guardT<=playerT)){
      b.x=lerp(from.x,to.x,guardT)+facing.x*.12;b.z=lerp(from.z,to.z,guardT)+facing.z*.12;b.vx=facing.x*14;b.vz=facing.z*14;b.damage=Math.round(stats.power*.8);b.reflected=true;b.life=1.5;b.mesh.material.color.setHex(0x8ce4d8);
      fragments.add(b.x,1,b.z,8,[0x8ce4d8,0xffe1a5],4,.06);audio.play('hit',.15,{material:characterStats.weaponTier<2?'wood':'metal'});
    }else if(!b.reflected&&playerT!==null&&(!hit||playerT<hit.t)){
      hurtPlayer(b.damage,b.vx/10,b.vz/10);b.life=0;
    }else if(hit){
      b.x=hit.x;b.z=hit.z;b.life=0;
      if(b.reflected){const dir=normalize(b.vx,b.vz);if(hit.target===boss)hitBoss(b.damage,dir,5);else if(hit.target.w!==undefined)hurtObject(hit.target,b.damage,.1,hit);else hitEnemy(hit.target,b.damage,dir,5,1.5);}
    }else{b.x=to.x;b.z=to.z;}
    b.mesh.position.set(b.x,1,b.z);b.mesh.rotation.y+=dt*12;
    if(b.life<=0){scene.remove(b.mesh);b.mesh.geometry.dispose();b.mesh.material.dispose();bolts.splice(i,1);}
  }
}

function spawnBoss(){
  bossSpawned=true;
  let pos=spawnPosition(13,1.65)||{x:0,z:22};
  // A wide, announced arrival gives the player space to react.
  const mesh=makeBoss();installEnemyHead(mesh,'boss');scene.add(mesh);const hp=1650*(1+(sector-1)*.5)+(round-1)*120;
  boss={mesh,type:'boss',level:enemyLevel('boss',round),slowTime:0,slowFactor:1,x:pos.x,z:pos.z,y:-5,vx:0,vz:0,radius:1.65,height:5.7,hp,maxHp:hp,materials:prepareMaterials(mesh),flash:0,stagger:0,state:'enter',timer:2.6,attack:0,telegraph:null,enraged:false,dead:false,walk:0};initEnemyReaction(boss,spawnCounter+100);
  for(const o of world.objects)if(!o.dead&&Math.hypot(o.x-pos.x,o.z-pos.z)<5)hurtObject(o,999,1);
  boss.telegraph=makeTelegraph(pos.x,pos.z,5,0xff9852);$('bossHud').hidden=false;
  announce('Ο ΣΙΔΕΡΕΝΙΟΣ ΚΟΛΟΣΣΟΣ','Η πόλη ξύπνησε. Τώρα ρίξε τον γίγαντα.',4.2);audio.play('boss');
  pulse(pos.x,pos.z,8,0xff8052,1.5);player.hp=Math.min(player.maxHp,player.hp+30);
  toast('ΣΤΟΧΟΣ ΚΑΤΑΣΤΡΟΦΗΣ: ΕΠΙΤΕΥΧΘΗΚΕ','+30 ζωή · Ο boss σημειώνεται κόκκινος στον χάρτη.');
}
function bossSlam(){
  if(!boss)return;const b=boss;const radius=b.enraged?8:6.5;
  pulse(b.x,b.z,radius,0xff8a50,.7);pulse(b.x,b.z,radius*.7,0xffdca1,.48);
  fragments.add(b.x,.15,b.z,45,[0xffb46d,0x8e9290,0x505b5c],10,.2,true);shake=.5;audio.play('break',1);
  const dir=normalize(player.x-b.x,player.z-b.z);if(player.y<.8&&Math.hypot(player.x-b.x,player.z-b.z)<radius)hurtPlayer(b.enraged?32:25,dir.x,dir.z,false);
  for(const o of world.objects)if(!o.dead&&Math.hypot(o.x-b.x,o.z-b.z)<radius)hurtObject(o,180,.8);
  for(const e of [...enemies])if(Math.hypot(e.x-b.x,e.z-b.z)<radius)hitEnemy(e,80,normalize(e.x-b.x,e.z-b.z),10,4);
}
function updateBoss(dt){
  if(!boss||boss.dead)return;const b=boss;b.slowTime=Math.max(0,b.slowTime-dt);const movementScale=b.slowTime>0?b.slowFactor:1;b.timer-=dt*movementScale;b.stagger=Math.max(0,b.stagger-dt);b.flash=Math.max(0,b.flash-dt);applyEnemyFlash(b.materials,b.flash/.15);
  updateEnemyThreat(b,player,dt,{airborne:!!leap,smashing:!!leap?.slam,canSee:world.hasLineOfSight?.(b.x,b.z,player.x,player.z,.16)??true,threatPower:1});
  moveCircle(b,b.vx*dt,b.vz*dt,nearbyObjects(b.x,b.z,b.radius+1),b.radius);b.vx*=Math.exp(-7*dt);b.vz*=Math.exp(-7*dt);
  const dir=normalize(player.x-b.x,player.z-b.z),dist=Math.hypot(player.x-b.x,player.z-b.z);
  if(!b.enraged&&b.hp<b.maxHp*.45){b.enraged=true;announce('ΥΠΕΡΦΟΡΤΩΣΗ','Ο Κολοσσός εξαγριώθηκε. Πρόσεχε τις κόκκινες ζώνες!',3);audio.play('boss');}
  if(b.state==='enter'){
    b.y=lerp(-5,0,clamp(1-b.timer/2.6,0,1));if(b.timer<=0){b.y=0;b.state='walk';b.timer=1.6;if(b.telegraph){removeEffect(b.telegraph);b.telegraph=null;}shake=.5;fragments.add(b.x,.2,b.z,30,[0x657779,0xffac69],9,.3,true);}
  }else if(b.state==='walk'){
    if(b.stagger<=0){const speed=(b.enraged?2.5:1.85)*movementScale;moveCircle(b,dir.x*speed*dt,dir.z*speed*dt,nearbyObjects(b.x,b.z,b.radius+1),b.radius);b.walk+=dt*speed*2.8;}
    b.mesh.rotation.y=Math.atan2(dir.x,dir.z);
    // Crush blocking scenery so the boss never becomes trapped in buildings.
    if(dist>3)for(const o of world.objects)if(!o.dead&&circleOverlaps(b.x+dir.x*1.1,b.z+dir.z*1.1,b.radius,o))hurtObject(o,75*dt,.6);
    if(b.timer<=0){
      b.attack=(b.attack+1)%3;b.state=b.attack===1?'slamWindup':b.attack===2?'chargeWindup':'summonWindup';
      b.timer=b.enraged?.85:1.2;b.target={x:dir.x,z:dir.z};
      b.telegraph=makeTelegraph(b.x,b.z,b.state==='slamWindup'?(b.enraged?8:6.5):b.state==='summonWindup'?4:2.8,0xff6453);
    }
  }else if(b.state==='slamWindup'||b.state==='chargeWindup'||b.state==='summonWindup'){
    if(b.telegraph){b.telegraph.material.opacity=.35+Math.sin(visualTime*22)*.22;b.telegraph.position.set(b.x,.1,b.z);}
    if(b.state==='chargeWindup'&&b.timer>.4){b.target=dir;b.mesh.rotation.y=Math.atan2(dir.x,dir.z);}
    if(b.timer<=0){
      if(b.telegraph){removeEffect(b.telegraph);b.telegraph=null;}
      if(b.state==='slamWindup'){bossSlam();b.state='recover';b.timer=1.5;}
      else if(b.state==='summonWindup'){
        pulse(b.x,b.z,5,0xff735c,.6);for(let i=0;i<7;i++){const a=i/7*Math.PI*2;spawnEnemy(i%3===0?'robot':'zombie',{x:clamp(b.x+Math.sin(a)*4,-BOUNDS+2,BOUNDS-2),z:clamp(b.z+Math.cos(a)*4,-BOUNDS+2,BOUNDS-2)});}b.state='recover';b.timer=1.3;
      }else{b.state='charge';b.timer=.8;audio.play('boss');}
    }
  }else if(b.state==='charge'){
    for(const o of world.objects)if(!o.dead&&circleOverlaps(b.x+b.target.x*.8,b.z+b.target.z*.8,b.radius+.5,o))hurtObject(o,999,1);
    moveCircle(b,b.target.x*17*dt,b.target.z*17*dt,nearbyObjects(b.x,b.z,b.radius+1),b.radius);
    if(dist<2.3)hurtPlayer(34,b.target.x,b.target.z);
    if(Math.random()<.35)fragments.add(b.x,.1,b.z,2,[0xffb66c,0x657578],4,.2);
    shake=Math.max(shake,.05);if(b.timer<=0){b.state='recover';b.timer=1.6;}
  }else if(b.state==='recover'&&b.timer<=0){b.state='walk';b.timer=b.enraged?1.8:2.5;}
  b.mesh.position.set(b.x,b.y,b.z);const u=b.mesh.userData;
  if(u.leftLeg){u.leftLeg.rotation.x=b.state==='walk'?Math.sin(b.walk)*.25:0;u.leftLeg.rotation.z=u.leftLeg.userData.restRoll||0;u.leftLeg.rotation.y=u.leftLeg.userData.restYaw||0;}
  if(u.rightLeg){u.rightLeg.rotation.x=b.state==='walk'?-Math.sin(b.walk)*.25:0;u.rightLeg.rotation.z=u.rightLeg.userData.restRoll||0;u.rightLeg.rotation.y=u.rightLeg.userData.restYaw||0;}
  if(u.leftArm){u.leftArm.rotation.x=b.state==='slamWindup'?-2.4:b.state==='recover'?.65:Math.sin(b.walk)*.15;u.leftArm.rotation.z=u.leftArm.userData.restRoll||0;}
  if(u.rightArm){u.rightArm.rotation.x=b.state==='slamWindup'?-2.4:b.state==='recover'?.65:-Math.sin(b.walk)*.15;u.rightArm.rotation.z=u.rightArm.userData.restRoll||0;}
  if(u.body)u.body.rotation.x=b.state==='charge'?.25:b.stagger>0?-.1:0;
  b.mesh.rotation.x=0;b.mesh.rotation.z=0;poseEnemyReaction(b,visualTime);
  if(b.impact){
    const hit=b.impact;hit.time+=dt;
    const envelope=Math.sin(Math.min(1,hit.time/.055)*Math.PI/2)*(1-smooth(hit.time/hit.duration));
    const yaw=b.mesh.rotation.y,lateral=hit.dirX*Math.cos(yaw)-hit.dirZ*Math.sin(yaw),forward=hit.dirX*Math.sin(yaw)+hit.dirZ*Math.cos(yaw);
    b.mesh.rotation.x+=forward*envelope*.075;b.mesh.rotation.z-=lateral*envelope*.075;
    if(u.body)u.body.rotation.x+=forward*envelope*.12;
    if(hit.time>=hit.duration)b.impact=null;
  }
}
function defeatBoss(){
  if(!boss||boss.dead)return;boss.dead=true;if(boss.telegraph){removeEffect(boss.telegraph);boss.telegraph=null;}
  const x=boss.x,z=boss.z;fragments.add(x,3,z,100,[0xffc675,0xb8c7c6,0x566e7a,0xff874a],13,.45,true);pulse(x,z,10,0xffd7a0,1.2);
  disposeInstance(boss);score+=Math.round(2500*comboMultiplier(combatCombo));const reward=scaleComboReward(60,comboMultiplier(combatCombo),comboXpCarry);comboXpCarry=reward.carry;gainXP(reward.amount);for(let n=0;n<4;n++)spawnDrop(x+(n-1.5)*.4,z,'crystal');shake=.7;audio.play('victory');endGame(true);
}
function endGame(won){
  setPhase(won?'victory':'dead');if(!testRun){best=Math.max(best,score);save('ironfall.best',best);}persistCharacter();
  $('endTitle').textContent=won?'Ο ΚΟΛΟΣΣΟΣ ΕΠΕΣΕ.':'ΤΟ ΣΦΥΡΙ ΣΙΩΠΗΣΕ.';
  $('endText').textContent=won?'Η ορδή δεν τελειώνει. Συνέχισε στην ίδια πόλη με τον εξοπλισμό και την εξέλιξή σου.':'Η εξέλιξη και ο εξοπλισμός σου σε περιμένουν. Πάρε μια ανάσα και ξαναχτύπα.';
  $('endStats').innerHTML='<div><strong>'+kills+'</strong><span>ΕΧΘΡΟΙ</span></div><div><strong>'+Math.floor(destructionPercent(world.objects))+'%</strong><span>ΚΑΤΑΣΤΡΟΦΗ</span></div><div><strong>'+relics+'</strong><span>ΚΕΙΜΗΛΙΑ</span></div><div><strong>'+score.toLocaleString('el-GR')+'</strong><span>ΣΚΟΡ · ΡΕΚΟΡ '+best.toLocaleString('el-GR')+'</span></div>';
  $('continueButton').hidden=!won;$('retryButton').textContent=won?'ΝΕΑ ΔΙΑΔΡΟΜΗ':'ΞΑΝΑΠΑΙΞΕ';
  if(!won)audio.play('death');
}

function dodge(){
  if(phase!=='playing'||dashCooldown>0||dashTime>0||leap?.airDashed||Math.abs(stance-stanceTarget)>.005)return false;
  const mx=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0)+touch.x;
  const mz=(keys.has('KeyS')||keys.has('ArrowDown')?1:0)-(keys.has('KeyW')||keys.has('ArrowUp')?1:0)+touch.y;
  punch=null;dashFollowup=1.1;kick=null;dashDirection=Math.hypot(mx,mz)>.05?screenMovement(mx,mz):{...facing};dashTime=leap?.18:.23;dashCooldown=1.5;
  if(leap){leap.airDashed=true;leap.dir={...dashDirection};}player.invincible=Math.max(player.invincible,.3);
  audio.play('dash');pulse(player.x,player.z,1.5,0x86d3c2,.25).position.y=player.y+.08;return true;
}
// Physical kick and secondary impacts. Damage is emitted only on contact,
// once per target per launch; a slowed heavy body is not launched like a zombie.
function startKick(){
  if(phase!=='playing'||kick||kickCooldown>0||leap||dashTime>0||throwWindup||Math.abs(stance-stanceTarget)>.005)return false;
  updateAim();const move=movementDirection(),dir=(move.x||move.z)?move:pointer.active?{...aim}:{...facing};
  punch=null;cancelAttack();swing=null;attackCooldown=0;guardHeld=false;guarding=false;spinRecovery=null;
  facing={...dir};hero.rotation.y=Math.atan2(dir.x,dir.z);
  const spec=kickStats(level,levels.kick),rig=hero.userData.weaponRig;
  kick={time:0,...spec,dir:{...dir},hit:false,fromRotation:rig.quaternion.clone(),fromPosition:rig.position.clone(),
    previousFoot:hero.userData.rightLeg.userData.foot.getWorldPosition(new THREE.Vector3())};
  kickCooldown=spec.cooldown;audio.play('kick',.25,{exert:true});return true;
}
function makeKickFlight(source,hits=null){
  return {life:1.4,level:source?.level??level,damage:source?.damage??kickStats(level,levels.kick).damage,
    hits:hits||new Set(),wallHit:false};
}
function kickImpact(from,foot){
  if(!kick||kick.hit)return false;
  const k=kick,origin={x:player.x,y:foot.y,z:player.z};
  const toe={x:foot.x+k.dir.x*.10,y:foot.y,z:foot.z+k.dir.z*.10};
  const targets=[...nearbyObjects(player.x,player.z,2),...enemies,...(boss&&!boss.dead?[boss]:[])];
  const direct=firstHammerHit(origin,toe,targets,k.radius),swept=firstHammerHit(from,toe,targets,k.radius);
  const contact=direct||swept;
  if(!contact)return false;
  const target=contact.target;k.hit=true;const dir={...k.dir};
  if(target===boss||enemies.includes(target))target.openUntil=elapsed+1.6;
  if(target===boss){hitBoss(k.damage,dir,.45,{interrupt:false,stagger:0,weapon:'foot'});target.slowTime=.35;target.slowFactor=.7;}
  else if(enemies.includes(target)){
    const speed=kickVelocity(target,k),mass=bodyMass(target);
    target.vx=dir.x*speed;target.vz=dir.z*speed;
    target.kickFlight=makeKickFlight({level,damage:k.damage});
    const stagger=Math.max(.08,.46/Math.sqrt(mass));
    hitEnemy(target,k.damage,dir,3,0,contact,{preserveVelocity:true,stagger,weapon:'foot'});
    target.stunTime=Math.max(target.stunTime||0,stagger);target.vy=Math.max(0,target.vy||0);
  }else{
    hurtObject(target,k.damage,.15,contact,'foot');
    if(!target.dead&&isVehicle(target)&&k.canMoveCars){
      const speed=kickVelocity(target,k);target.vx=dir.x*speed;target.vz=dir.z*speed;
      target.kickFlight=makeKickFlight({level,damage:k.damage});target.kickFlight.life=3;
      movingVehicles.add(target);
    }
  }
  shake=Math.max(shake,.07);hitStop=Math.max(hitStop,.008);checkGoal();return true;
}
function applyBodyCollisionHit(target,damage,normal,sourceFlight,impact,sourceMass){
  if(target.dead||sourceFlight.hits.has(target))return;
  sourceFlight.hits.add(target);
  const heavy=bodyMass(target)>sourceMass*1.35;
  const stagger=heavy?0:Math.min(.65,.18+impact.impulse/bodyMass(target)*.04);
  const response={preserveVelocity:true,stagger,interrupt:!heavy,fear:!heavy,weapon:'body',combo:false};
  if(target===boss)hitBoss(Math.max(1,Math.round(damage)),normal,0,response);
  else hitEnemy(target,Math.max(1,Math.round(damage)),normal,2,0,null,response);
  if(heavy){target.slowTime=Math.max(target.slowTime||0,.50);target.slowFactor=.55;}
  else if(!target.dead&&target!==boss){
    target.kickFlight=makeKickFlight(sourceFlight,new Set(sourceFlight.hits));
    target.stunTime=Math.max(target.stunTime||0,stagger);
  }
}
function advanceKickedEnemy(e,dt){
  const flight=e.kickFlight;if(!flight||e.dead)return;
  flight.life-=dt;const speed=Math.hypot(e.vx,e.vz);
  if(flight.life<=0||speed<.18){e.kickFlight=null;return;}
  const start={x:e.x,y:e.y+Math.min(.7,e.height*.45),z:e.z},end={x:e.x+e.vx*dt,y:start.y,z:e.z+e.vz*dt};
  const solids=segmentObjects(start,end,e.radius).filter(o=>o.h>(e.y||0)+SUPPORT_EPSILON);
  const targets=[...solids,...enemies.filter(other=>other!==e&&!other.dead),...(boss&&!boss.dead?[boss]:[])];
  const hit=firstHammerHit(start,end,targets,e.radius);
  if(!hit)return;
  const target=hit.target,dir=normalize(e.vx,e.vz),sourceMass=bodyMass(e);
  if(target===boss||enemies.includes(target)){
    let normal=normalize(target.x-hit.x,target.z-hit.z);if(!normal.x&&!normal.z)normal=dir;
    // Closing speed uses the target's real imposed velocity; walking is only
    // slowed below, not converted into an unrelated high-energy impulse.
    const impact=transferMomentum(e,target,normal,.08);
    if(!impact.impulse)return;
    e.x=lerp(start.x,end.x,Math.max(0,hit.t-1e-4));e.z=lerp(start.z,end.z,Math.max(0,hit.t-1e-4));
    applyBodyCollisionHit(target,Math.min(flight.damage*.8,impact.energy*.55),normal,flight,impact,sourceMass);
    if(target.kickFlight)target.kickFlight.hits.add(e);
    // Lose remaining forward speed when a heavier actor stops the launch.
    if(bodyMass(target)>sourceMass*1.35){e.vx*=.25;e.vz*=.25;}
  }else{
    const point=nearestPoint(hit.x,hit.z,target),away=normalize(hit.x-point.x,hit.z-point.z);
    const normal=away.x||away.z?{x:-away.x,z:-away.z}:dir;
    const speedIntoWall=Math.max(0,e.vx*normal.x+e.vz*normal.z);
    if(speedIntoWall<.25)return;
    e.x=lerp(start.x,end.x,Math.max(0,hit.t-1e-4));e.z=lerp(start.z,end.z,Math.max(0,hit.t-1e-4));
    e.vx-=normal.x*speedIntoWall;e.vz-=normal.z*speedIntoWall;
    if(!flight.wallHit){
      flight.wallHit=true;
      const result=wallSlamResponse(e,speedIntoWall,flight.level);
      if(result.damage)hitEnemy(e,result.damage,normal,2,0,hit,{preserveVelocity:true,stagger:result.stun,combo:false,weapon:'masonry'});
      e.stunTime=Math.max(e.stunTime||0,result.stun);e.stagger=Math.max(e.stagger||0,result.stun);
      if(result.stun>.25&&!e.dead)floatText(e.x,e.y+e.height+.4,e.z,'ΖΑΛΙΣΜΕΝΟΣ','#ffe2a5',12);
      hurtObject(target,Math.max(1,Math.round(result.damage*.30)),.1,hit,'body');
      impactClouds?.emit(hit.x,hit.y,hit.z,normal,.8);shake=Math.max(shake,.065);
    }
  }
  return true;
}
function relocateVehicle(car,x,z){
  const nx=clamp(x,-BOUNDS+car.w/2,BOUNDS-car.w/2),nz=clamp(z,-BOUNDS+car.d/2,BOUNDS-car.d/2);
  if(nx!==x)car.vx=0;if(nz!==z)car.vz=0;
  if(world.relocateObject)world.relocateObject(car,nx,nz,false);
  else{car.x=nx;car.z=nz;world.rebuildSpatialIndex?.();}
  car.mesh.position.x=nx;car.mesh.position.z=nz;
}
function updateMovingVehicles(dt){
  if(!movingVehicles.size)return;
  vehicleNavTimer-=dt;
  for(const car of [...movingVehicles]){
    const flight=car.kickFlight;
    if(car.dead||!flight){movingVehicles.delete(car);continue;}
    flight.life-=dt;
    const speed=Math.hypot(car.vx,car.vz);
    if(flight.life<=0||speed<.12){car.vx=car.vz=0;car.kickFlight=null;movingVehicles.delete(car);world.invalidateNavigation?.();continue;}
    const dx=car.vx*dt,dz=car.vz*dt;
    const nearby=nearbyObjects(car.x,car.z,Math.hypot(car.w,car.d)/2+speed*dt+2);
    const targets=[...nearby,...enemies,...(boss&&!boss.dead?[boss]:[])];
    const contact=firstVehicleContact(car,dx,dz,targets);
    if(!contact){relocateVehicle(car,car.x+dx,car.z+dz);}
    else{
      const target=contact.target,n=contact.normal,oldV={x:car.vx,z:car.vz};
      relocateVehicle(car,car.x+dx*Math.max(0,contact.t-1e-4),car.z+dz*Math.max(0,contact.t-1e-4));
      if(target===boss||enemies.includes(target)){
        const impact=transferMomentum(car,target,n,.05);
        if(impact.impulse){
          applyBodyCollisionHit(target,Math.min(160,impact.energy*.65+speed*2),n,flight,impact,bodyMass(car));
          if(target.kickFlight)target.kickFlight.hits.add(car);
        }
      }else{
        // Buildings never acquire velocity. Vehicles can shunt another car,
        // using the same mass law rather than copying the attacker's speed.
        const obstacle=isVehicle(target)?target:{...target,mass:Infinity,isBuilding:true,vx:0,vz:0};
        const impact=transferMomentum(car,obstacle,n,.03);
        if(!flight.hits.has(target)&&impact.impulse){
          flight.hits.add(target);const damage=Math.min(200,Math.round(impact.energy*.40));
          const p={x:contact.x+n.x*car.w*.35,y:.75,z:contact.z+n.z*car.d*.35};
          hurtObject(target,Math.max(1,damage),.35,p,'metal');hurtObject(car,Math.max(1,Math.round(damage*.45)),.2,p,'metal');
          if(isVehicle(target)&&!target.dead){target.kickFlight=makeKickFlight(flight,new Set([car,...flight.hits]));target.kickFlight.life=2;movingVehicles.add(target);}
          shake=Math.max(shake,.12);
        }
        if(!isVehicle(target)){const into=oldV.x*n.x+oldV.z*n.z;car.vx=(oldV.x-into*n.x)*.45;car.vz=(oldV.z-into*n.z)*.45;}
      }
      // Do not consume the remainder through a collider. The next fixed step
      // sees updated positions and velocities for every affected body.
    }
    const damping=Math.exp(-1.7*dt);car.vx*=damping;car.vz*=damping;
    // A car must not overlap the player's movement collider after being kicked
    // past them. Resolution uses the moved box, never the stale spatial index.
    if(!car.dead&&player.y<car.h&&circleOverlaps(player.x,player.z,player.radius,car))moveCircle(player,0,0,[car],player.radius);
  }
  if(vehicleNavTimer<=0){world.invalidateNavigation?.();vehicleNavTimer=.20;}
}

function guardDimensions(){
  const h=hero.userData.getHeadHalfExtents?.()||{x:.725*stats.size,y:.365*stats.size},gripCenter=stance>.9?.255:.43;
  // Wind around the held grip, with enough room for the complete equipped
  // head. Stock equipment fits a 1.30 m disk within the articulated arm span;
  // very large head upgrades retain their actual larger physical clearance.
  const reach=Math.max(.35,Math.min(1.05,Math.sqrt(Math.max(0,1.3**2-h.x**2))-h.y-.43+gripCenter));
  const radius=Math.hypot(.43+reach-gripCenter+h.y,h.x);
  return {reach,radius,height:radius+.08,forward:.70,gripCenter};
}
const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
function updatePlayer(dt){
  player.invincible=Math.max(0,player.invincible-dt);player.hurtAgo+=dt;
  hammerLightning=Math.max(0,hammerLightning-dt);
  kickCooldown=Math.max(0,kickCooldown-dt);if(kick)kick.time+=dt;
  dashFollowup=Math.max(0,dashFollowup-dt);if(punch)punch.time+=dt;
  dashCooldown=Math.max(0,dashCooldown-dt);attackCooldown=Math.max(0,attackCooldown-dt);leapCooldown=Math.max(0,leapCooldown-dt);throwCooldown=Math.max(0,throwCooldown-dt);landingRecovery=Math.max(0,landingRecovery-dt);
  if(player.hurtAgo>8&&player.hp<player.maxHp)player.hp=Math.min(player.maxHp,player.hp+1.25*dt);
  if(stance!==stanceTarget){const step=dt/1.05;stance=Math.abs(stance-stanceTarget)<=step?stanceTarget:stance+Math.sign(stanceTarget-stance)*step;}
  const move=movementDirection(),moving=Math.hypot(move.x,move.z)>.01;
  updateAim();guarding=guardHeld&&!swing&&!spin&&!weaponBusy()&&!chargeStarted;
  // Locomotion owns facing. Cursor aim is independent only for the thrown
  // hammer, or while standing still; attacks never turn a running hero sideways.
  if(!spin){
    if(punch)facing={...punch.dir};
    else if(kick)facing={...kick.dir};
    else if(leap)facing={...leap.dir};
    else if(dashTime>0)facing={...dashDirection};
    else if(moving)facing=move;
    else if(throwWindup)facing={...throwWindup.dir};
    else if(!swing&&pointer.active)facing={...aim};
    if(swing){swing.fx=facing.x;swing.fz=facing.z;}
  }
  if(guarding)guardAngle+=dt*19;
  if(leap){
    const l=leap;l.time+=dt;const oldY=player.y;
    if(l.strike){
      l.attackTime+=dt;
      if(l.attackHeld&&characterStats.canAirSmash&&!l.slam&&l.attackTime>=.22){l.slam=true;audio.play('charge',.65);}
      const ready=l.attackTime>=(l.attackHeld&&characterStats.canAirSmash?.22:.075);
      if(ready&&l.time>=.12&&!l.diving){
        l.diving=true;l.vy=Math.min(l.vy,l.slam?-22:-8.5);
        audio.play('swing',l.slam?1:.35,{variant:'two-overhead',weapon:characterStats.weaponTier<2?'wood':'metal',exert:true});
      }
    }
    l.vy-=(l.diving?38:30)*dt;player.y+=l.vy*dt;
    // Real roofs/slabs below the feet catch a descent; walls at this height
    // block the body. Open space under an awning or between floors stays open.
    const inAirDash=dashTime>0;
    const leapSpeed=inAirDash?19:characterStats.canAirSmash?(l.diving?7.2:8.2):5.8;
    const travel=inAirDash?dashDirection:l.dir;
    moveActor(player,travel.x*leapSpeed*dt,travel.z*leapSpeed*dt,{feetY:oldY});
    if(l.vy>0&&world.ceilingHeight){
      const ceiling=world.ceilingHeight(player.x,player.z,player.radius,oldY+PLAYER_BODY_HEIGHT);
      if(player.y+PLAYER_BODY_HEIGHT>=ceiling){player.y=Math.max(oldY,ceiling-PLAYER_BODY_HEIGHT);l.vy=0;}
    }
    if(inAirDash){dashTime=Math.max(0,dashTime-dt);if(Math.random()<.5)fragments.add(player.x,player.y+.25,player.z,1,[0x7ac9bd],1,.055);}
    const floor=supportHeight(player.x,player.z,oldY);
    if(l.vy<0&&player.y<=floor){player.y=floor;landLeap();}
  }else{
    let dx,dz;
    if(dashTime>0){dashTime=Math.max(0,dashTime-dt);dx=dashDirection.x*19*dt;dz=dashDirection.z*19*dt;if(Math.random()<.7)fragments.add(player.x,.15,player.z,1,[0x7ac9bd,0xa6ddcd],1,.06);}
    else{const speed=stats.speed*movementStrength()*(kick?.28:guarding?.55:spin?.84:swing?.92:Math.abs(stance-stanceTarget)>.005?.55:landingRecovery>0?.25:1);dx=move.x*speed*dt;dz=move.z*speed*dt;}
    dx+=player.vx*dt;dz+=player.vz*dt;player.vx*=Math.exp(-9*dt);player.vz*=Math.exp(-9*dt);
    const actual=moveActor(player,dx,dz,{allowStep:true});player.walk+=Math.hypot(actual.x,actual.z)*6;
    const floor=supportHeight(player.x,player.z,player.y);
    if(player.y>floor){player.vy=(player.vy||0)-20*dt;player.y=Math.max(floor,player.y+player.vy*dt);}else{player.y=floor;player.vy=0;}
  }
  if(spinRecovery){spinRecovery.time+=dt;if(spinRecovery.time>=.12)spinRecovery=null;}
  if(attackBuffer){attackBuffer.life-=dt;if(attackBuffer.life<=0)attackBuffer=null;}
  if(throwFlight&&!punch&&!kick&&(chargeHeld||attackBuffer)&&attackCooldown<=0&&!guardHeld){
    beginPunch();
  }
  if(chargeHeld){
    holdElapsed+=dt;
    if(!spin&&holdElapsed>=SPIN_HOLD_SECONDS&&!weaponBusy()&&!guardHeld){
      let previousHits=null;
      if(swing&&swing.time/swing.duration>=.86){previousHits=swing.hits;swing=null;attackCooldown=0;}
      if(!swing&&attackCooldown<=0)startSpin(previousHits);
    }
  }
  if(attackBuffer&&!chargeHeld&&!spin&&swing&&swing.time/swing.duration>=.74&&!weaponBusy()&&!guardHeld){swing=null;attackCooldown=0;}
  if(attackBuffer&&!chargeHeld&&!spin&&!swing&&attackCooldown<=0&&!weaponBusy()&&!guardHeld){
    attackBuffer=null;chargeStarted=true;charge=0;beginSwing();
  }
  if(spin){
    const s=spin,oldCycle=s.cycle;s.time+=dt;const turn=dt*Math.PI*2/SPIN_TURN_SECONDS*(.45+.55*smooth(s.time/.12));
    s.rotation+=turn;s.angle-=turn;s.cycle=Math.floor(s.rotation/(Math.PI*2));s.recoil=Math.max(0,s.recoil-dt*12);
    if(s.cycle>oldCycle){
      audio.play('swing',.25,{weapon:characterStats.weaponTier<2?'wood':'metal',exert:false});
      for(const target of s.hitTimes.keys())if(target.dead)s.hitTimes.delete(target);
    }
  }
  if(swing)swing.time+=dt;
  if(touchThrowAim){
    const g=touchThrowAim;g.time+=dt;
    g.channeling=canThrow()&&!guardHeld;
    if(g.channeling){
      if(!g.channelFromRotation){g.channelFromRotation=hero.userData.weaponRig.quaternion.clone();g.channelFromPosition=hero.userData.weaponRig.position.clone();g.channelFromReach=hero.userData.reachScale;}
      g.channelTime+=dt;g.channelAngle=-.7+g.channelTime*10;
    }
  }
  if(throwWindup)throwWindup.time+=dt;
  poseHero(dt,moving);
  if(kick){
    const foot=hero.userData.rightLeg.userData.foot.getWorldPosition(new THREE.Vector3());
    if(!kick.hit&&sampleKickMotion(kick.time/kick.duration).active)kickImpact(kick.previousFoot,foot);
    if(kick){kick.previousFoot.copy(foot);if(kick.time>=kick.duration)kick=null;}
  }
  if(punch){
    const hand=hero.userData[punch.hand+'Grip'].getWorldPosition(new THREE.Vector3());
    if(samplePunchMotion(punch.time/punch.duration,punch.variant).active)punchImpact(punch.previousHand,hand);
    if(punch){punch.previousHand.copy(hand);if(punch.time>=punch.duration)punch=null;}
  }
  if(throwWindup?.time>=.28)releaseHammer();
  hero.updateMatrixWorld(true);hero.userData.hammerHead.getWorldPosition(headNow);
  if(swing){const progress=swing.time/swing.duration;
    if(progress>=SWING_CONTACT_START&&progress<=SWING_CONTACT_END&&!swing.blocked){
      const motion=sampleHammerSwing(progress,{twoHanded:swing.twoHanded,charge:swing.q,variant:swing.variant});
      if(motion.trail>.05)weaponTrail(headPrevious,headNow,(.14+.20*motion.trail)*stats.size,characterStats.weaponTier<2?0xd5c8ae:swing.charged?0xffefae:0xffbe67);
      impact(headPrevious,headNow);
    }
    if(swing&&(swing.time>=swing.duration||(swing.blocked&&swing.time-swing.blockTime>=.12)))swing=null;
  }else if(spin){
    if(spin.time-spin.trailTime>=1/60){weaponTrail(headPrevious,headNow,.27*stats.size,0xffcf79);spin.trailTime=spin.time;}
    spinImpact(headPrevious,headNow);
  }else if(guarding){
    weaponTrail(headPrevious,headNow,.16,0x8ce4d8);
    for(const e of [...enemies])if((guardHits.get(e)||0)<elapsed&&facingCoverage(facing,e,player,Math.PI*.42)&&firstHammerHit(headPrevious,headNow,[e],.45*stats.size)){guardHits.set(e,elapsed+.38);hitEnemy(e,Math.round(stats.power*.3),normalize(e.x-player.x,e.z-player.z),6,1.5);}
  }else if(touchThrowAim?.channeling&&touchThrowAim.channelTime>.10){
    const g=touchThrowAim;
    if(g.channelTime-g.trailTime>=1/45){weaponTrail(g.trailFrom||headPrevious,headNow,.13,0x8aeaff);g.trailTime=g.channelTime;g.trailFrom=headNow.clone();}
  }
  headPrevious.copy(headNow);
  updateThrownHammer(dt);
  if(touchThrowQueued){
    touchThrowQueued.life-=dt;
    if(touchThrowQueued.life<0)touchThrowQueued=null;
    else if(canThrow()){
      const direction=touchThrowQueued.dir;touchThrowQueued=null;startThrow(direction);
    }
  }
  for(const hazard of world.hazards)if(player.y<.4&&Math.hypot(player.x-hazard.x,player.z-hazard.z)<hazard.r)hurtPlayer((hazard.damage||10)*.65,0,0,false);
  updateAim();
  updateHammerAura();
}
function poseHero(dt,moving=false){
  const u=hero.userData,walk=moving&&!leap&&!spin?Math.sin(player.walk):0;
  const targetAngle=Math.atan2(facing.x,facing.z);
  const diff=Math.atan2(Math.sin(targetAngle-hero.rotation.y),Math.cos(targetAngle-hero.rotation.y));
  if(spin)hero.rotation.y=spin.angle+spin.entryYawOffset;
  else if(moving||leap||dashTime>0||guarding||swing||punch)hero.rotation.y=targetAngle;
  else hero.rotation.y+=diff*(1-Math.exp(-dt*24));
  hero.position.set(player.x,player.y+(dashTime>0&&!leap?.15:Math.abs(walk)*(swing?.025:.07)),player.z);
  const p=swing?clamp(swing.time/swing.duration,0,1):0;
  const motion=swing?(swing.blocked?swing.blockPose:sampleHammerSwing(p,{twoHanded:swing.twoHanded,charge:swing.q,variant:swing.variant})):null;
  const settle=swing?.blocked?1-smooth((swing.time-swing.blockTime)/.12):1;
  const impactRecoil=swing?.contactTime!==undefined?Math.sin(clamp((swing.time-swing.contactTime)/.085,0,1)*Math.PI)*.055:0;
  const punchPose=!u.weaponHeld?samplePunchMotion(punch?punch.time/punch.duration:0,punch?.variant||0):null;
  u.setUnarmedPose?.(punchPose);
  const kickPose=kick?sampleKickMotion(kick.time/kick.duration):null;
  const spinPose=spin?sampleSpinMotion(spin.rotation,{twoHanded:stance>.9,recoil:spin.recoil}):null;
  const torque=spinPose?spinPose.bodyYaw:motion?motion.bodyYaw*settle:guarding?-.08:0;
  const spinStep=spin?Math.sin(-spin.rotation*2)*.12:0;
  if(u.leftLeg){u.leftLeg.rotation.x=leap?-.55:spin?-.12+spinStep:motion?motion.leftLegPitch*settle+walk*.38:walk*.58;u.leftLeg.rotation.z=(u.leftLeg.userData.restRoll||0)+(spin?-.18:motion?motion.leftLegRoll*settle:0);}
  if(u.rightLeg){u.rightLeg.rotation.x=leap?.45:spin?.12-spinStep:motion?motion.rightLegPitch*settle-walk*.38:-walk*.58;u.rightLeg.rotation.z=(u.rightLeg.userData.restRoll||0)+(spin?.18:motion?motion.rightLegRoll*settle:0);}
  // Small alternating foot lifts form a pivot step, not legs bicycling in air.
  for(const [leg,side,lift] of [[u.leftLeg,-1,spinPose?.leftStep||0],[u.rightLeg,1,spinPose?.rightStep||0]])if(leg){
    leg.position.set((leg.userData.restX??side*.255)+(spin?side*.03:0),(leg.userData.restY??.62)+lift*.055,(leg.userData.restZ??0)+(spin?side*Math.sin(spin.rotation)*.055:0));
    leg.rotation.y=(leg.userData.restYaw||0)+(spin?side*.12+Math.sin(spin.rotation)*.10:0);
  }
  if(u.body){
    u.body.rotation.x=leap?(dashTime>0?.30:leap.diving?.30:-.12):dashTime>0?.25:spinPose?spinPose.bodyPitch:guarding?.14:motion?motion.bodyPitch*settle-impactRecoil:landingRecovery>0?.32:0;
    u.body.rotation.y=torque;u.body.rotation.z=motion?motion.bodyRoll*settle:spinPose?spinPose.bodyRoll:0;
    u.body.position.y=landingRecovery>0?-.07:spinPose?spinPose.bodyDrop:motion?motion.bodyDrop*settle:Math.sin(visualTime*2)*.015;
  }
  if(u.body&&(swing?.fromBody||spin?.fromBody)){
    const source=swing?.fromBody||spin.fromBody,blend=swing?motion.windup:smooth(spin.time/.12);
    u.body.rotation.x=lerp(source.x,u.body.rotation.x,blend);
    u.body.rotation.y=lerp(source.y,u.body.rotation.y,blend);
    u.body.rotation.z=lerp(source.z,u.body.rotation.z,blend);
    u.body.position.y=lerp(swing?swing.fromBodyY:spin.fromBodyY,u.body.position.y,blend);
  }
  for(const leg of [u.leftLeg,u.rightLeg])if(leg?.userData.shin)leg.userData.shin.rotation.x=0;
  if(kickPose){
    u.rightLeg.rotation.set(kickPose.hip,0,.045);u.rightLeg.position.z=.08*kickPose.extension;
    u.rightLeg.userData.shin.rotation.x=kickPose.knee;
    u.leftLeg.rotation.x=.035*kickPose.extension;u.leftLeg.rotation.z=(u.leftLeg.userData.restRoll||0)-.04;
    u.body.rotation.x=kickPose.bodyPitch;u.body.rotation.y=kickPose.bodyYaw;u.body.rotation.z=-.05*kickPose.extension;
    u.body.position.y=-kickPose.weight;
  }
  if(punch&&punchPose){u.body.rotation.y=punchPose.bodyYaw;u.body.rotation.x=punchPose.bodyPitch;}
  if(u.cape){u.cape.rotation.x=.15+Math.sin(visualTime*6)*.07+(leap?.85:spin?.55:motion?.18+Math.abs(torque)*.3:moving?.25:0);u.cape.rotation.z=spin?.3-Math.sin(spin.rotation)*.1:motion?-torque*.38:Math.sin(visualTime*3)*.045;}
  u.setStance?.(stance);
  const rest=u.weaponRest||{x:.55,y:0,z:-.72},rp=u.weaponRestPosition||{x:0,y:1.04,z:.38};
  const rig=u.weaponRig,restQuaternion=new THREE.Quaternion().setFromEuler(new THREE.Euler(rest.x,rest.y,rest.z));
  rig.position.set(rp.x,rp.y,rp.z);rig.quaternion.copy(restQuaternion);
  u.setReach?.(Math.max(.65,stats.range+(swing?swing.q*1.4:0)-.55-(u.getHeadForwardExtent?.()||.52*stats.size)-.43));
  if(swing){
    if(swing.blocked){
      const blocked=clamp((swing.time-swing.blockTime)/.12,0,1),recover=smooth(blocked),bounce=Math.sin(blocked*Math.PI)*.18;
      rig.quaternion.copy(swing.blockRotation).premultiply(new THREE.Quaternion().setFromAxisAngle(shaftUp,bounce)).slerp(restQuaternion,recover);
      rig.position.lerpVectors(swing.blockPosition,new THREE.Vector3(rp.x,rp.y,rp.z),recover);rig.position.y+=Math.sin(blocked*Math.PI)*.055;
    }else{
      const direction=poseDirection.set(motion.directionX,motion.directionY,motion.directionZ);
      const strikeQuaternion=new THREE.Quaternion().setFromUnitVectors(shaftUp,direction);
      strikeQuaternion.multiply(new THREE.Quaternion().setFromAxisAngle(shaftUp,motion.shaftTwist||0));
      rig.quaternion.copy(swing.fromRotation).slerp(strikeQuaternion,motion.windup).slerp(restQuaternion,motion.recovery);
      rig.position.lerpVectors(swing.fromPosition,new THREE.Vector3(motion.gripX,motion.gripY,motion.gripZ),motion.windup);
      rig.position.lerp(new THREE.Vector3(rp.x,rp.y,rp.z),motion.recovery);
    }
  }else if(kick){
    // Tuck the real held weapon near the chest while the foot, not the club,
    // attacks. Both palms remain on their handle anchors through the kick.
    const blend=smooth(kick.time/.065),settle=smooth((kick.time/kick.duration-.60)/.40);
    const target=new THREE.Quaternion().setFromEuler(new THREE.Euler(.45,0,-.48));
    rig.quaternion.copy(kick.fromRotation).slerp(target,blend).slerp(restQuaternion,settle);
    rig.position.copy(kick.fromPosition).lerp(new THREE.Vector3(-.10,1.05,.27),blend).lerp(new THREE.Vector3(rp.x,rp.y,rp.z),settle);
  }else if(spin){
    const reachOut=smooth(spin.time/.12);
    const target=new THREE.Quaternion().setFromUnitVectors(shaftUp,poseDirection.set(spinPose.directionX,spinPose.directionY,spinPose.directionZ));
    target.multiply(new THREE.Quaternion().setFromAxisAngle(shaftUp,spinPose.shaftTwist));
    rig.position.lerpVectors(spin.fromPosition,new THREE.Vector3(spinPose.gripX,spinPose.gripY,spinPose.gripZ),reachOut);
    rig.quaternion.copy(spin.fromRotation).slerp(target,reachOut);
    // Preserve the head's world azimuth while the hands settle into the carry.
    // Without this root compensation, the slerp unwound the opening strike
    // backwards even though the feet were already turning the other way.
    if(spin.time<=.12+dt){
      hero.updateMatrixWorld(true);
      const localHead=hero.worldToLocal(u.hammerHead.getWorldPosition(new THREE.Vector3()));
      const offset=spin.startLocalAzimuth-Math.atan2(localHead.x,localHead.z);
      spin.entryYawOffset=Math.atan2(Math.sin(offset),Math.cos(offset));
      hero.rotation.y=spin.angle+spin.entryYawOffset;
    }
  }else if(guarding){
    const g=guardDimensions();u.setReach?.(g.reach);rig.rotation.set(0,0,guardAngle);
    const shaftDirection=poseDirection.set(0,1,0).applyQuaternion(rig.quaternion);
    rig.position.set(0,g.height,g.forward).addScaledVector(shaftDirection,-g.gripCenter);
  }
  else if(leap){
    // A readable load and downward blow, with both hands following the same
    // shaft. The old airborne Euler pose pointed the wood skyward on impact.
    const armed=leap.strike,load=armed?smooth(leap.attackTime/.075):0;
    const drop=leap.diving?smooth((leap.attackTime-(leap.slam?.22:.075))/.11):0;
    const pitch=armed?lerp(1.42,-.32,drop):.72;
    const target=new THREE.Quaternion().setFromUnitVectors(shaftUp,poseDirection.set(0,Math.sin(pitch),Math.cos(pitch)));
    const center=stance>.9?.255:.43;
    const at=new THREE.Vector3(stance>.9?0:.28,armed?lerp(1.48,1.02,drop):1.22,armed?lerp(.20,.42,drop):.34)
      .addScaledVector(poseDirection,-center);
    const from=armed?leap.attackFromRotation:restQuaternion,fromPos=armed?leap.attackFromPosition:new THREE.Vector3(rp.x,rp.y,rp.z);
    rig.quaternion.copy(from).slerp(target,armed?load:smooth(leap.time/.12));
    rig.position.copy(fromPos).lerp(at,armed?load:smooth(leap.time/.12));
  }
  else if(throwWindup){
    const t=clamp(throwWindup.time/.28,0,1),relativeYaw=Math.atan2(throwWindup.dir.x,throwWindup.dir.z)-hero.rotation.y;
    // Keep the compact orbit length while the head passes below the wrist;
    // extend for release only on the final upward/forward part of the turn.
    const extend=throwWindup.channelAngle!==null?smooth((t-.7)/.3):smooth(t);
    u.setReach?.(lerp(throwWindup.fromReach,u.reachScale,extend));
    const turn=new THREE.Quaternion().setFromAxisAngle(shaftUp,relativeYaw);
    let angle;
    if(throwWindup.channelAngle!==null){
      const start=throwWindup.channelAngle,end=Math.PI/2+Math.ceil((start-Math.PI/2+.35)/(Math.PI*2))*Math.PI*2;
      angle=lerp(start,end,smooth(t));
    }else angle=t<.35?-1.15:lerp(-1.15,Math.PI/2,smooth((t-.35)/.65));
    const target=new THREE.Quaternion().setFromEuler(new THREE.Euler(angle,0,0)).premultiply(turn);
    rig.quaternion.copy(throwWindup.fromRotation).slerp(target,smooth(t/.35));
    const gripCenter=stance>.9?.255:.43,shaftDirection=new THREE.Vector3(0,1,0).applyQuaternion(rig.quaternion);
    const wrist=new THREE.Vector3(0,gripCenter,0).applyQuaternion(throwWindup.fromRotation).add(throwWindup.fromPosition)
      .lerp(new THREE.Vector3(stance>.9?0:.52,1.3,.40),smooth(t));
    const sideY=new THREE.Vector3(1,0,0).applyQuaternion(rig.quaternion).y;
    const depthY=new THREE.Vector3(0,0,1).applyQuaternion(rig.quaternion).y;
    const headBounds=u.getHeadHalfExtents?.()||{x:.725*stats.size,y:.365*stats.size,z:.365*stats.size};
    const headExtent=headBounds.x*Math.abs(sideY)+headBounds.y*Math.abs(shaftDirection.y)+headBounds.z*Math.abs(depthY);
    const lowestHead=(.43+u.reachScale-gripCenter)*shaftDirection.y-headExtent;
    const lowestHandle=Math.min((-.21-gripCenter)*shaftDirection.y,(.52-gripCenter)*shaftDirection.y)-.10;
    wrist.y=Math.max(wrist.y,.08-Math.min(lowestHead,lowestHandle));
    rig.position.copy(wrist).addScaledVector(shaftDirection,-gripCenter);
  }
  else if(touchThrowAim?.channeling){
    const g=touchThrowAim,relativeYaw=Math.atan2(aim.x,aim.z)-hero.rotation.y;
    const turn=new THREE.Quaternion().setFromAxisAngle(shaftUp,relativeYaw),blend=smooth(g.channelTime/.12);
    // Rotate in the vertical plane along the throw direction. The free arm
    // and feet keep their normal ownership while the wrist winds the weapon.
    const orbitReach=Math.max(.35,.8-(stats.size-1)*.55),twoHanded=stance>.9,gripCenter=twoHanded?.255:.43;
    u.setReach?.(lerp(g.channelFromReach,orbitReach,blend));
    const shaftDirection=new THREE.Vector3(0,Math.cos(g.channelAngle),Math.sin(g.channelAngle)).applyQuaternion(turn);
    const headBounds=u.getHeadHalfExtents?.()||{y:.365*stats.size,z:.365*stats.size};
    const orbitRadius=Math.hypot(.43+orbitReach-gripCenter+headBounds.y,headBounds.z);
    // Turn around the gripping hand(s), not around the torso. This keeps the
    // elbows within reach when the joystick and aiming thumb point apart.
    const targetPosition=new THREE.Vector3(twoHanded?0:.59,Math.max(twoHanded?1.48:1.42,orbitRadius+.08),.22)
      .addScaledVector(shaftDirection,-gripCenter);
    rig.position.lerpVectors(g.channelFromPosition,targetPosition,blend);
    const target=new THREE.Quaternion().setFromEuler(new THREE.Euler(g.channelAngle,0,0)).premultiply(turn);
    rig.quaternion.copy(g.channelFromRotation).slerp(target,blend);
  }
  else if(landingRecovery>0&&landingPose){
    const t=smooth(1-landingRecovery/landingPose.duration);
    rig.quaternion.copy(landingPose.rotation).slerp(restQuaternion,t);
    rig.position.copy(landingPose.position).lerp(new THREE.Vector3(rp.x,rp.y,rp.z),t);
  }
  else if(spinRecovery){const t=smooth(spinRecovery.time/.12);if(spinRecovery.fromReach!==undefined)u.setReach?.(lerp(spinRecovery.fromReach,u.reachScale,t));rig.position.lerpVectors(spinRecovery.fromPosition,new THREE.Vector3(rp.x,rp.y,rp.z),t);rig.quaternion.copy(spinRecovery.fromRotation).slerp(restQuaternion,t);}
  if((swing||spin||leap?.strike||landingRecovery>0)&&u.getHeadFloorY)rig.position.y+=Math.max(0,.04-u.getHeadFloorY());
  u.updateGrip?.();
  flashMaterials(player,player.invincible>0&&player.hurtAgo<1?(Math.sin(visualTime*30)*.5+.5)*.55:0,0xff8b71);
  chargeRing.visible=!!spin;chargeRing.position.set(player.x,player.y+.07,player.z);chargeRing.scale.setScalar(stats.range*.88);chargeRing.material.opacity=spin?.12+Math.sin(spin.rotation*2)*.04:0;chargeRing.material.color.setHex(0xffcb7d);
  const markerDirection=touchThrowAim?.dragged||touchThrowQueued||throwWindup?aim:facing;
  directionMarker.position.set(player.x+markerDirection.x*1.15,player.y+.055,player.z+markerDirection.z*1.15);directionMarker.rotation.y=Math.atan2(markerDirection.x,markerDirection.z);directionMarker.visible=phase==='playing';
  if(guardRing){const g=guardDimensions();guardRing.visible=guarding;guardRing.position.set(player.x+facing.x*g.forward,player.y+g.height,player.z+facing.z*g.forward);guardRing.scale.setScalar(g.radius/1.72);guardRing.rotation.set(0,Math.atan2(facing.x,facing.z),0);guardRing.material.opacity=.12+Math.sin(guardAngle*2)*.035;}
  const visibleFloor=supportHeight(player.x,player.z,player.y),airHeight=Math.max(0,player.y-visibleFloor);
  if(groundShadow){groundShadow.position.set(player.x,visibleFloor+.035,player.z);groundShadow.scale.setScalar(1+airHeight*.035);groundShadow.material.opacity=clamp(.34-airHeight*.018,.15,.34);groundShadow.visible=phase!=='menu';}
  if(landingMarker){landingMarker.visible=!!leap;landingMarker.position.set(player.x,visibleFloor+.09,player.z);landingMarker.scale.setScalar(leap?.slam?5.2+stats.quake*.7:leap?.strike?1.65:.9);landingMarker.material.color.setHex(leap?.slam?0xffbf6d:0x9edac9);}
}
function updateDrops(dt){
  for(let i=drops.length-1;i>=0;i--){
    const d=drops[i];d.age+=dt;d.life-=dt;const distance=Math.hypot(player.x-d.x,player.z-d.z);
    const magnet=d.kind==='relic'?1.7:3.8;
    if(distance<magnet&&d.age>.4){const dir=normalize(player.x-d.x,player.z-d.z);const speed=d.kind==='relic'?4.5:9;d.x+=dir.x*speed*dt;d.z+=dir.z*speed*dt;}
    d.mesh.position.set(d.x,.45+Math.sin(visualTime*3+d.phase)*.13,d.z);d.mesh.rotation.y+=dt*(d.kind==='relic'?.9:2.5);
    if(distance<.8&&d.age>.45){
      scene.remove(d.mesh);disposeModelGeometry(d.mesh);drops.splice(i,1);
      if(d.kind==='relic'){openUpgrade();}
      else if(d.kind==='heart'){const heal=Math.min(28,player.maxHp-player.hp);player.hp+=heal;floatText(player.x,2.2,player.z,'+'+Math.round(heal),'#a3e3af',20);audio.play('pickup',.2);}
      else if(MATERIAL_TYPES.includes(d.kind)){collectCharacterMaterial(character,d.kind,d.amount||1);floatText(player.x,2.15,player.z,'+'+(d.amount||1)+' '+MATERIAL_LABELS[d.kind],d.kind==='wood'?'#edc794':d.kind==='scrap'?'#c9dce6':'#9ceaea',13);audio.play('pickup',.18);renderCharacterProgress();persistCharacter();}
      else{score+=30;gainXP(2);audio.play('pickup',.15);fragments.add(player.x,.8,player.z,5,[0xffc87c,0xffebc4],3,.05);}
    }else if(d.life<=0){scene.remove(d.mesh);disposeModelGeometry(d.mesh);drops.splice(i,1);}
  }
}
function updateObjects(dt){
  for(const o of world.objects){
    if(o.dead)continue;
    o.hurtTimer=Math.max(0,(o.hurtTimer||0)-dt);o.flash=Math.max(0,o.flash-dt);o.shudder=Math.max(0,o.shudder-dt);flashMaterials(o,o.flash/.15);
    if(o.renderActive===false&&o.shudder===0)continue;
    const jitter=o.shudder>0?Math.sin(o.shudder*100)*o.shudder*.3:0;
    o.mesh.position.set(o.x+jitter,o.baseY,o.z+jitter*.7);
    const damage=1-o.hp/o.maxHp;
    o.mesh.rotation.z=o.baseRotation.z+(damage>.65?Math.sin(o.seed||1)*.035:0)+jitter*.08;
  }
}
function updateEffects(dt){
  impactClouds?.update(dt);
  fragments.update(dt);hpEchoes=hpEchoes.filter(e=>{e.life-=dt;return e.life>0;});
  for(let i=rings.length-1;i>=0;i--){const r=rings[i];r.life-=dt;const t=1-r.life/r.max;r.mesh.scale.setScalar(.3+t*r.radius);r.mesh.material.opacity=Math.max(0,(1-t)*.7);if(r.life<=0){removeEffect(r.mesh);rings.splice(i,1);}}
  for(let i=arcs.length-1;i>=0;i--){const a=arcs[i];a.life-=dt;a.mesh.material.opacity=Math.max(0,a.life/a.max*(a.opacity??.75));if(a.life<=0){removeEffect(a.mesh);arcs.splice(i,1);}}
  for(let i=numbers.length-1;i>=0;i--){numbers[i].life-=dt;numbers[i].y+=dt*.75;if(numbers[i].life<=0)numbers.splice(i,1);}
  if(announcementTimer>0){announcementTimer-=dt;if(announcementTimer<=0)$('announcement').hidden=true;}
}
let currentDistrict='';
function updateGame(dt){
  elapsed+=dt;roundTime+=dt;tickHitCombo(combatCombo,dt);if(comicState){comicState.life-=dt;if(comicState.life<=0)comicState=null;}
  updatePlayer(dt);if(phase!=='playing')return;
  updateMovingVehicles(dt);
  updateEnemies(dt);if(phase!=='playing')return;
  updateBoss(dt);if(phase!=='playing')return;
  updateDrops(dt);updateObjects(dt);checkGoal();
  updateWaves(dt);
  checkpointTimer+=dt;if(checkpointTimer>=8){checkpointTimer=0;persistCharacter();}
  const district=world.regionAt?.(player.x,player.z);
  if(district&&currentDistrict!==district.id){currentDistrict=district.id;$('districtName').textContent=district.name;if(roundTime>6)toast(district.name,district.weather==='snow'?'Ο άνεμος φέρνει χιόνι.':district.weather==='ash'?'Πρόσεχε τη λάβα και τις φωτιές.':'Η βροχή δεν σταματά την ορδή.','#82c7bb');}
}
function updateHUD(force=false){
  if(!world)return;
  renderCharacterProgress();
  if($('kickValue'))$('kickValue').textContent=kickCooldown>0?kickCooldown.toFixed(1)+'s':'ΒΑΘΜΙΔΑ '+kickStats(level,levels.kick).rank;
  if($('kickButton')){$('kickButton').classList.toggle('active',!!kick);$('kickButton').classList.toggle('cooldown',kickCooldown>0);}
  $('healthFill').style.width=(player.hp/player.maxHp*100)+'%';$('healthValue').textContent=Math.ceil(player.hp)+' / '+player.maxHp;
  $('healthFill').style.background=player.hp<player.maxHp*.3?'#ef7766':'';
  const percent=destructionPercent(world.objects);$('goalValue').textContent=Math.floor(percent)+'%';$('goalFill').style.width=Math.min(100,percent/GOAL*100)+'%';
  $('objectiveText').textContent=bossSpawned?boss&&!boss.dead?'Ο στόχος πέτυχε. Νίκησε τον Κολοσσό!':'Ο Κολοσσός έπεσε. Συνέχισε την εξέλιξή σου.':'Φτάσε στο 60% για να καλέσεις τον Κολοσσό.';
  $('sectorValue').textContent=String(sector).padStart(2,'0');$('killsValue').textContent=kills;$('relicValue').textContent=relics;$('roundValue').textContent=String(round).padStart(2,'0');
  $('waveEnemiesValue').textContent=boss&&!boss.dead?String(enemies.length):String(Math.max(0,(wave?.total||0)-(wave?.defeated||0)))+' / '+(wave?.total||10);
  $('waveStatus').textContent=boss&&!boss.dead?'ΤΕΛΙΚΟΣ BOSS':wave?.state==='break'?'ΚΥΜΑ ΚΑΘΑΡΟ · ΕΠΟΜΕΝΟ ΣΕ '+Math.ceil(wave.breakTimer)+'s':enemies.filter(e=>e.waveNumber===wave?.number).length+' ΕΝΕΡΓΟΙ · '+Math.max(0,(wave?.total||0)-(wave?.spawned||0))+' ΕΡΧΟΝΤΑΙ';
  $('timeValue').textContent=String(Math.floor(elapsed/60)).padStart(2,'0')+':'+String(Math.floor(elapsed%60)).padStart(2,'0');
  $('chargeFill').style.width=throwFlight?(punch?Math.round(clamp(punch.time/punch.duration,0,1)*100)+'%':'0%'):spin?'100%':chargeHeld?Math.min(100,holdElapsed/SPIN_HOLD_SECONDS*100)+'%':'0%';
  $('chargeWrap').classList.toggle('spinning',!!spin);
  $('chargeText').textContent=throwFlight?'ΚΡΑΤΑ ΕΠΙΘΕΣΗ: ΓΡΟΘΙΕΣ':spin?'ΑΦΗΣΕ ΓΙΑ ΣΤΟΠ':chargeHeld?'ΚΡΑΤΑ: ΠΕΡΙΣΤΡΟΦΗ':touchLayout?'ΚΡΑΤΑ ΠΕΡΙΣΤΡΟΦΗ':'ΚΡΑΤΑ ΑΡ. ΚΛΙΚ: 360°';
  document.querySelector('[data-key="ShiftLeft"]')?.classList.toggle('cooldown',dashCooldown>0);
  if(boss){$('bossFill').style.backgroundColor=enemyHealthColor(boss.level);$('bossFill').style.width=Math.max(0,boss.hp/boss.maxHp*100)+'%';$('bossValue').textContent=(boss.enraged?'ΙΙ · ':'')+Math.max(0,Math.ceil(boss.hp))+' / '+Math.ceil(boss.maxHp)+' HP';}
  const stanceLabel=throwFlight?'ΑΟΠΛΟΣ · ΓΡΟΘΙΕΣ + ΚΛΩΤΣΙΑ':Math.abs(stance-stanceTarget)>.005?'ΑΛΛΑΓΗ ΛΑΒΗΣ…':stance>.95?'ΔΥΟ ΧΕΡΙΑ · +25% ΙΣΧΥΣ':characterStats.hasShield?'ΣΦΥΡΙ + ΑΣΠΙΔΑ':'ΛΑΒΗ ΜΕ ΕΝΑ ΧΕΡΙ';
  for(const id of ['stanceValue','mobileStanceValue'])if($(id))$(id).textContent=stanceLabel;
  for(const id of ['stanceButton','mobileStanceButton'])$(id)?.setAttribute('aria-pressed',String(stanceTarget===1));
  if($('guardValue'))$('guardValue').textContent=guarding?'ΠΡΟΣΤΑΣΙΑ ΜΠΡΟΣΤΑ':throwFlight?'ΧΩΡΙΣ ΣΦΥΡΙ':touchLayout?'ΚΡΑΤΑ ΓΙΑ ΑΜΥΝΑ':'ΚΡΑΤΑ RMB';
  if($('leapValue'))$('leapValue').textContent=leap?(throwFlight?'ΓΡΟΘΙΑ / DASH':leap.slam?'ΣΥΝΤΡΙΒΗ!':touchLayout?'ΧΤΥΠΗΜΑ / DASH':'ΚΛΙΚ: SMASH · SHIFT: DASH'):leapCooldown>0?leapCooldown.toFixed(1)+'s':'ΕΤΟΙΜΟ';
  if($('throwValue'))$('throwValue').textContent=touchThrowQueued?'ΕΤΟΙΜΑΖΕΤΑΙ':touchThrowAim?(settings.throwMode==='hold'?'ΑΦΗΣΕ ΓΙΑ ΡΙΨΗ':'ΞΑΝΑ ΠΑΤΑ ΓΙΑ ΡΙΨΗ'):throwFlight?(throwFlight.grounded?'ΜΑΖΕΨΕ ΤΟ ΟΠΛΟ':throwFlight.returning?'ΕΠΙΣΤΡΟΦΗ':throwFlight.hitCount&&characterStats.canRicochet?'ΑΛΥΣΙΔΑ '+throwFlight.hitCount:'ΣΤΟΝ ΑΕΡΑ'):throwCooldown>0?throwCooldown.toFixed(1)+'s':hammerLightning>0?'ΚΕΡΑΥΝΟΣ!':settings.throwMode==='hold'?'ΚΡΑΤΑ ΓΙΑ ΣΤΟΧΕΥΣΗ':'ΠΑΤΑ ΓΙΑ ΣΤΟΧΕΥΣΗ';
  if($('dashValue'))$('dashValue').textContent=dashTime>0?'ΑΠΟΦΥΓΗ!':dashCooldown>0?dashCooldown.toFixed(1)+'s':'ΕΤΟΙΜΟ';
  updateAttackFeedback();
  $('guardButton')?.classList.toggle('active',guardHeld||guarding);
  $('leapButton')?.classList.toggle('cooldown',!leap&&leapCooldown>0);
  $('leapButton')?.classList.toggle('airborne',!!leap);
  $('throwButton')?.classList.toggle('cooldown',!!(throwFlight||throwWindup)||throwCooldown>0);
  $('throwButton')?.classList.toggle('aiming',!!touchThrowAim);
  $('throwButton')?.setAttribute('aria-pressed',String(!!touchThrowAim));
  $('throwButton')?.classList.toggle('returning',!!throwFlight?.returning);
  $('throwButton')?.classList.toggle('queued',!!touchThrowQueued);
  $('throwButton')?.classList.toggle('channeling',!!touchThrowAim?.channeling);
  $('throwButton')?.classList.toggle('lightning-ready',hammerLightning>0&&!throwFlight);
  for(const [id,remaining] of [['leapButton',leapCooldown],['throwButton',throwCooldown],['dashButton',dashCooldown]]){
    const button=$(id);if(button)button.dataset.cooldown=remaining>0?remaining.toFixed(1):'';
  }
  if(force)drawMinimap();
}
function updateAttackFeedback(){
  const button=$('attackButton');if(!button)return;
  const unarmed=!!throwFlight,holding=!unarmed&&(chargeHeld||!!spin),air=!!leap&&!unarmed;
  button.classList.toggle('active',!!punch||!!swing||holding||!!leap?.slam||!!leap?.strike);
  button.classList.toggle('air-smash-ready',air&&!leap.strike);
  button.classList.toggle('air-smash-armed',!!leap?.slam||!!leap?.strike);
  button.classList.toggle('spin-active',!!spin);button.classList.toggle('spin-pending',!unarmed&&chargeHeld&&!spin);
  button.dataset.action=unarmed?'punch':air?'air':holding?'spin':'attack';
  $('attackIcon')?.setAttribute('href',unarmed?'#a-punch':air?'#a-slam':holding?'#a-spin':'#a-swing');
  $('attackTouchIcon')?.setAttribute('href',unarmed?'#t-punch':air?'#t-slam':holding?'#t-spin':'#t-attack');
  $('attackName').textContent=unarmed?'ΓΡΟΘΙΕΣ':air?(leap.slam||leap.strike?'ΕΤΟΙΜΟ':'ΜΙΚΡΟ SMASH'):holding?'360°':characterStats.weaponTier<2?'ΧΤΥΠΗΜΑ':'ΣΦΥΡΙΑ';
  $('attackValue').textContent=unarmed?'ΚΡΑΤΑ · ΣΥΝΕΧΕΙΣ ΓΡΟΘΙΕΣ':air?(leap.slam?'ΜΕΓΑΛΟ SMASH':leap.strike?'ΣΤΗΝ ΠΡΟΣΓΕΙΩΣΗ':characterStats.canAirSmash?'ΠΑΤΑ · ΚΡΑΤΑ ΓΙΑ ΜΕΓΑΛΟ':'ΠΑΤΑ ΣΤΟΝ ΑΕΡΑ'):spin?'ΑΦΗΣΕ ΓΙΑ ΣΤΟΠ':chargeHeld?'ΚΡΑΤΑ ΓΙΑ ΣΥΝΕΧΕΙΑ':'ΠΑΤΑ · ΚΡΑΤΑ ΓΙΑ 360°';
  const label=unarmed?'Πάτησε για γροθιά. Κράτα για διαδοχικές γροθιές. Η κλωτσιά παραμένει στο E.':air?(leap.slam||leap.strike?'Το χτύπημα είναι έτοιμο για την προσγείωση.':characterStats.canAirSmash?'Πάτησε στον αέρα για μικρό smash. Κράτα για μεγάλη συντριβή.':'Πάτησε στον αέρα για μικρό smash.'):spin?'Συνεχής περιστροφή 360°. Άφησε για να σταματήσεις.':'Χτύπημα με '+characterStats.weaponName.toLowerCase()+'. Κράτα για συνεχή περιστροφή 360°.';
  button.setAttribute('aria-label',label);button.setAttribute('title',label);
}
function drawMinimap(){
  const c=mapContext,w=140,h=140,extent=world.bounds||BOUNDS,scale=47/extent;
  c.clearRect(0,0,w,h);c.fillStyle='#101e21';c.fillRect(0,0,w,h);
  c.save();c.translate(70,70);c.rotate(.625);c.scale(scale,scale);
  c.fillStyle='#253c3b';c.fillRect(-extent,-extent,extent*2,extent*2);c.fillStyle='#162b30';
  for(const road of world.layout?.roads||[0]){c.fillRect(road-3.4,-extent,6.8,extent*2);c.fillRect(-extent,road-3.4,extent*2,6.8);}
  c.strokeStyle='#466061';c.lineWidth=1/scale;c.strokeRect(-extent,-extent,extent*2,extent*2);
  const civic={townhall:'#edc980',police:'#82baff',hospital:'#f6ada2',skyscraper:'#78bbc0',construction:'#d2a05b'};
  for(const o of world.objects){if(!o.isBuilding&&o.w<1.5)continue;c.fillStyle=o.dead?'#30433e':civic[o.type]|| (o.isBuilding?'#9d9480':'#698e9a');c.fillRect(o.x-o.w/2,o.z-o.d/2,Math.max(o.w,2),Math.max(o.d,2));}
  for(const h of world.hazards){c.fillStyle='#c66b42';c.beginPath();c.arc(h.x,h.z,h.r,0,Math.PI*2);c.fill();}
  for(const d of drops)if(d.kind==='relic'){c.fillStyle='#ffd180';c.fillRect(d.x-2,d.z-2,4,4);}
  for(const e of enemies){c.fillStyle=e.miniBoss?'#ff5265':e.palette==='metal'?'#ffab89':'#e37e73';c.beginPath();c.arc(e.x,e.z,e.miniBoss?5:2.7,0,Math.PI*2);c.fill();}
  if(boss&&!boss.dead){c.fillStyle='#ff6558';c.beginPath();c.arc(boss.x,boss.z,6,0,Math.PI*2);c.fill();c.strokeStyle='#ffd080';c.stroke();}
  c.translate(player.x,player.z);c.rotate(-Math.atan2(facing.x,facing.z));c.fillStyle='#fff1b7';c.beginPath();c.moveTo(0,7);c.lineTo(-4.2,-4);c.lineTo(4.2,-4);c.closePath();c.fill();c.restore();
}
function screenPoint(x,y,z){tempV.set(x,y,z).project(camera);return {x:(tempV.x*.5+.5)*screenW,y:(-.5*tempV.y+.5)*screenH,inside:tempV.z<1&&tempV.z>-1};}
function drawHP(x,y,z,hp,maxHp,tint,alpha=1,label=''){
  const p=screenPoint(x,y,z);if(!p.inside||p.x<-80||p.x>screenW+80||p.y<-35||p.y>screenH+35)return;
  const c=fxContext,width=76;c.globalAlpha=clamp(alpha,0,1);c.textAlign='center';c.font='bold 11px "Courier New",monospace';
  c.fillStyle='rgba(11,24,28,.92)';c.fillRect(p.x-width/2-5,p.y-19,width+10,27);
  c.fillStyle='#fff2d4';c.fillText(Math.max(0,Math.ceil(hp))+' / '+Math.ceil(maxHp)+' HP',p.x,p.y-6);
  c.fillStyle='#34464a';c.fillRect(p.x-width/2,p.y,width,4);c.fillStyle=tint;c.fillRect(p.x-width/2,p.y,width*clamp(hp/maxHp,0,1),4);
  if(label){c.font='bold 11px Arial,sans-serif';c.lineWidth=3;c.strokeStyle='#10242b';c.strokeText(label,p.x,p.y-24);c.fillStyle=tint;c.fillText(label,p.x,p.y-24);}
}
function buildingHudAnchor(o){
  // The orthographic view direction is constant across the whole screen.
  const dx=cameraOffset.x,dz=cameraOffset.z,base=o.baseY??0;
  const alongZ=Math.abs(dz)>=Math.abs(dx);
  return {x:o.x+(alongZ?0:Math.sign(dx)*(o.w/2+.04)),
    y:base+Math.min(o.h*.65,4.6),z:o.z+(alongZ?Math.sign(dz)*(o.d/2+.04):0)};
}
function drawBuildingHP(o,label,alpha){
  const a=buildingHudAnchor(o),p=screenPoint(a.x,a.y,a.z);
  if(!p.inside||p.x<-100||p.x>screenW+100||p.y<-60||p.y>screenH+60)return;
  const c=fxContext,w=touchLayout?124:146,h=54;
  const x=clamp(p.x,w/2+10,screenW-w/2-10),y=clamp(p.y-15,h+10,screenH-36);
  c.save();c.globalAlpha=clamp(alpha,0,1);c.textAlign='center';
  c.strokeStyle='#f2c97f';c.lineWidth=1.5;c.beginPath();c.moveTo(p.x,p.y);c.lineTo(x,y);c.stroke();
  c.fillStyle='#f2c97f';c.beginPath();c.arc(p.x,p.y,2.5,0,Math.PI*2);c.fill();
  c.fillStyle='rgba(10,25,30,.96)';c.fillRect(x-w/2,y-h,w,h);c.strokeStyle='#a38c61';c.strokeRect(x-w/2,y-h,w,h);
  c.font='bold 12px Arial,sans-serif';c.fillStyle='#f4d59e';c.fillText(label,x,y-36);
  c.font='bold 14px Arial,sans-serif';c.fillStyle='#fff5e0';c.fillText(Math.max(0,Math.ceil(o.hp))+' / '+Math.ceil(o.maxHp)+' HP',x,y-19);
  c.fillStyle='#34464a';c.fillRect(x-w/2+9,y-11,w-18,5);c.fillStyle='#f5c974';c.fillRect(x-w/2+9,y-11,(w-18)*clamp(o.hp/o.maxHp,0,1),5);
  c.restore();
}
function drawAim(){
  if(phase!=='playing')return;
  const c=fxContext;
  for(const e of touchThrowAim?nearbyTargets:[]){
    if(e.dead)continue;
    const focused=e===focusedTarget,r=e.radius+(focused?.38:.26);
    c.strokeStyle=focused?'#ffd180':'#8ce4d8';c.globalAlpha=focused?.96:.55;c.lineWidth=focused?2.1:1.3;
    // Project four ground-plane brackets; rings stay under the enemy's feet.
    for(let quadrant=0;quadrant<4;quadrant++){
      const base=quadrant*Math.PI/2+Math.PI/12;c.beginPath();
      for(let step=0;step<=10;step++){
        const angle=base+step/10*Math.PI/3,p=screenPoint(e.x+Math.sin(angle)*r,(e.y||0)+.065,e.z+Math.cos(angle)*r);
        if(step===0)c.moveTo(p.x,p.y);else c.lineTo(p.x,p.y);
      }c.stroke();
    }
    if(e===throwLock){const lock=screenPoint(e.x,(e.y||0)+e.height+.95,e.z);c.font='bold 11px Arial';c.textAlign='center';c.fillStyle='#ffe0a0';c.fillText('ΣΤΟΧΟΣ ΡΙΨΗΣ',lock.x,lock.y);}
    if(focused){const p=screenPoint(e.x,(e.y||0)+.07,e.z);c.fillStyle='#ffd180';c.beginPath();c.moveTo(p.x,p.y-5);c.lineTo(p.x-3,p.y);c.lineTo(p.x+3,p.y);c.closePath();c.fill();}
  }
  if(pointer.active){
    c.globalAlpha=.85;c.strokeStyle=focusedTarget?'#ffd180':'#badbd2';c.lineWidth=1.35;
    const x=pointer.x,y=pointer.y;c.beginPath();
    c.moveTo(x-10,y);c.lineTo(x-4,y);c.moveTo(x+4,y);c.lineTo(x+10,y);c.moveTo(x,y-10);c.lineTo(x,y-4);c.moveTo(x,y+4);c.lineTo(x,y+10);c.stroke();
  }
  c.globalAlpha=1;
}
function drawFX(){
  const c=fxContext;c.clearRect(0,0,screenW,screenH);
  if(redFlash>0){const grad=c.createRadialGradient(screenW/2,screenH/2,screenH*.22,screenW/2,screenH/2,screenW*.66);grad.addColorStop(0,'rgba(201,62,42,0)');grad.addColorStop(1,'rgba(201,62,42,'+(redFlash*.5)+')');c.fillStyle=grad;c.fillRect(0,0,screenW,screenH);}
  updateComboDisplay();
  if(phase==='menu')return;
  drawAim();
  if(throwFlight?.grounded){const p=screenPoint(throwFlight.x,throwFlight.groundY+1.2,throwFlight.z);if(p.inside){c.textAlign='center';c.font='bold 12px Arial';c.lineWidth=4;c.strokeStyle='#10201e';c.strokeText('ΜΑΖΕΨΕ ΤΟ ΟΠΛΟ',p.x,p.y);c.fillStyle='#ffe2a3';c.fillText('ΜΑΖΕΨΕ ΤΟ ΟΠΛΟ',p.x,p.y);}}
  for(const e of enemies)if(Math.hypot(e.x-player.x,e.z-player.z)<27){
    const label='LV '+e.level+((e.openUntil||0)>elapsed?' · ΑΝΟΙΓΜΑ':e.stunTime>0?' · ΖΑΛΙΣΜΕΝΟΣ':e.slowTime>0?' · ΑΡΓΟΣ':e.miniBoss?' · '+e.name:'');
    drawHP(e.x,e.y+e.height+.4,e.z,e.hp,e.maxHp,enemyHealthColor(e.level),1,label);
  }
  if(boss&&!boss.dead)drawHP(boss.x,boss.y+boss.height+.4,boss.z,boss.hp,boss.maxHp,enemyHealthColor(boss.level),1,'LV '+boss.level+' · ΚΟΛΟΣΣΟΣ');
  const objectNames={townhouse:'ΚΑΤΟΙΚΙΑ',apartment:'ΠΟΛΥΚΑΤΟΙΚΙΑ',shop:'ΚΑΤΑΣΤΗΜΑ',office:'ΓΡΑΦΕΙΑ',townhall:'ΔΗΜΑΡΧΕΙΟ',police:'ΑΣΤΥΝΟΜΙΚΟ ΤΜΗΜΑ',hospital:'ΝΟΣΟΚΟΜΕΙΟ',skyscraper:'ΟΥΡΑΝΟΞΥΣΤΗΣ',construction:'ΕΡΓΟΤΑΞΙΟ',warehouse:'ΑΠΟΘΗΚΗ',policecar:'ΠΕΡΙΠΟΛΙΚΟ',ambulance:'ΑΣΘΕΝΟΦΟΡΟ',car:'ΑΥΤΟΚΙΝΗΤΟ',wall:'ΤΟΙΧΟΣ',tree:'ΔΕΝΤΡΟ',barrel:'ΒΑΡΕΛΙ',crate:'ΚΙΒΩΤΙΟ',lamp:'ΦΑΝΑΡΙ',bench:'ΠΑΓΚΑΚΙ'};
  for(const o of world.objects)if(!o.dead&&(o.hurtTimer>0||aimPreview?.contact?.target===o)){
    if(o.isBuilding)drawBuildingHP(o,objectNames[o.type]||'ΚΤΙΡΙΟ',Math.min(1,o.hurtTimer||1));
    else drawHP(o.x,Math.min(o.h,player.y+4)+.4,o.z,o.hp,o.maxHp,'#ffd08b',Math.min(1,o.hurtTimer||1),objectNames[o.type]||'ΑΝΤΙΚΕΙΜΕΝΟ');
  }
  for(const e of hpEchoes)drawHP(e.x,e.y,e.z,0,e.maxHp,'#ff9d72',Math.min(1,e.life*2));
  for(const n of numbers){const p=screenPoint(n.x,n.y,n.z);if(!p.inside)continue;c.globalAlpha=Math.min(1,n.life/.3);c.textAlign='center';c.font='900 '+n.size+'px "Courier New",monospace';c.lineWidth=3;c.strokeStyle='rgba(10,24,26,.8)';c.strokeText(n.text,p.x,p.y);c.fillStyle=n.color;c.fillText(n.text,p.x,p.y);}
  c.globalAlpha=1;
  if(boss&&!boss.dead&&phase==='playing'){
    const p=screenPoint(boss.x,3,boss.z);if(p.x<40||p.x>screenW-40||p.y<150||p.y>screenH-100){
      const x=clamp(p.x,40,screenW-180),y=clamp(p.y,165,screenH-135),a=Math.atan2(p.y-y,p.x-x);
      c.save();c.translate(x,y);c.rotate(a);c.fillStyle='#ff8b62';c.beginPath();c.moveTo(11,0);c.lineTo(-7,-7);c.lineTo(-7,7);c.closePath();c.fill();c.restore();c.fillStyle='#ffe5ba';c.font='bold 10px monospace';c.textAlign='center';c.fillText('BOSS',x,y+21);
    }
  }
}

function syncTouchControls(){
  touchLayout=matchMedia('(pointer:coarse)').matches||matchMedia('(any-pointer:coarse)').matches||screenW<=750||(screenW<=1100&&screenH<=500);
  document.body.dataset.touchControls=String(touchLayout);
  $('touchControls').hidden=!touchLayout||phase!=='playing';
  for(const button of document.querySelectorAll('[data-touch-label]')){
    const label=touchLayout?button.dataset.touchLabel:button.dataset.desktopLabel;
    if(label){button.setAttribute('aria-label',label);button.setAttribute('title',label);}
  }
}
function resize(){
  const viewport=window.visualViewport,nextWidth=Math.round(viewport?.width||innerWidth),nextHeight=Math.round(viewport?.height||innerHeight);
  if(screenW!==nextWidth||screenH!==nextHeight)clearInput();
  screenW=nextWidth;screenH=nextHeight;syncTouchControls();
  document.body.style.setProperty('--app-height',screenH+'px');
  const quality=settings.quality;renderer.setPixelRatio(quality==='high'?Math.min(devicePixelRatio,touchLayout?1.25:1.5):quality==='medium'?1:.72);
  renderer.setSize(screenW,screenH,false);renderer.shadowMap.enabled=quality!=='low';
  const aspect=screenW/screenH,half=15;
  camera.left=-half*aspect;camera.right=half*aspect;camera.top=half;camera.bottom=-half;camera.updateProjectionMatrix();
  fxDpr=Math.min(devicePixelRatio,2);fx.width=Math.round(screenW*fxDpr);fx.height=Math.round(screenH*fxDpr);fx.style.width=screenW+'px';fx.style.height=screenH+'px';fxContext.setTransform(fxDpr,0,0,fxDpr,0,0);
  $('gameCanvas').style.height=screenH+'px';
}
function pauseGame(){if(phase==='playing'){setPhase('paused');audio.play('ui');}else if(phase==='paused'){setPhase('playing');audio.play('ui');}}
function pressAttack(){
  if(phase!=='playing')return;audio.unlock();
  if(touchThrowAim||touchThrowQueued)cancelTouchThrow();
  if(throwFlight){
    if(guardHeld||chargeHeld)return;
    chargeHeld=true;holdElapsed=0;
    if(!beginPunch())attackBuffer={life:ATTACK_BUFFER_SECONDS};
    updateAttackFeedback();return;
  }
  if(leap){armAirSmash();updateAttackFeedback();return;}
  if(throwWindup||Math.abs(stance-stanceTarget)>.005||guardHeld||chargeHeld)return;
  chargeHeld=true;holdElapsed=0;charge=0;
  // Start on pointer DOWN, not UP: the physical wind-up and its audio start
  // together. During recovery remember just ONE next strike, not click spam.
  if(!swing&&attackCooldown<=0&&!weaponBusy()){
    chargeStarted=true;beginSwing();
  }else{
    attackBuffer={life:Math.max(ATTACK_BUFFER_SECONDS,attackCooldown+.12)};
    chargeStarted=false;
  }
  updateAttackFeedback();
}
function releaseAttack(){
  if(leap)leap.attackHeld=false;
  chargeHeld=false;chargeStarted=false;charge=0;holdElapsed=0;
  if(spin)stopSpin();
  if(phase!=='playing')cancelAttack();
  // An already started strike finishes naturally. Releasing never creates a
  // second strike; an explicitly tapped buffered strike remains valid.
  updateAttackFeedback();
}
function cancelAttack(){if(leap)leap.attackHeld=false;stopSpin();chargeHeld=false;chargeStarted=false;charge=0;attackBuffer=null;holdElapsed=0;if(touchThrowAim||touchThrowQueued)cancelTouchThrow();updateAttackFeedback();}
function pressGuard(){
  if(phase!=='playing')return;
  if(throwFlight)return;
  guardHeld=true;cancelAttack();spinRecovery=null;
}
function releaseGuard(){guardHeld=false;guarding=false;}
function syncCombatButtons(buttons){
  const previous=mouseButtons;mouseButtons=buttons&3;
  // Pointer Events report mouse-button chords as pointermove. Read the full
  // mask so releasing either button cannot strand a held attack or guard.
  if((mouseButtons&2)&&!(previous&2))pressGuard();
  if((previous&1)&&!(mouseButtons&1))releaseAttack();
  if((previous&2)&&!(mouseButtons&2))releaseGuard();
  if((mouseButtons&1)&&!(previous&1)&&!(mouseButtons&2))pressAttack();
}
function updateSoundButtons(){
  const silent=audio.muted||audio.volume<=0;
  const blocked=!silent&&audio.ready===false;
  const label=silent?'Ήχος κλειστός — πάτησε για ενεργοποίηση':blocked?'Πάτησε για ενεργοποίηση ήχου':'Ήχος ενεργός — πάτησε για σίγαση';
  for(const id of ['soundButton','muteButton','menuAudioButton']){
    const button=$(id);if(!button)continue;
    button.setAttribute('data-audio-control','');
    button.classList.toggle('muted',silent);button.classList.toggle('audio-blocked',blocked);
    button.setAttribute('aria-pressed',String(silent));button.setAttribute('aria-label',label);button.setAttribute('title',label);
  }
  for(const id of ['muteIcon','soundIcon'])$(id)?.setAttribute('href',silent?'#a-sound-off':'#a-sound-on');
  if($('muteValue'))$('muteValue').textContent=silent?'ΚΛΕΙΣΤΟΣ':blocked?'ΠΑΤΑ':'ΣΙΓΑΣΗ';
  const status=silent?'Ο ήχος είναι σε σίγαση.':blocked?'Πάτησε «Δοκιμή ήχου» για ενεργοποίηση.':audio.sampleCount>0?'Ηχογραφημένα εφέ και φωνές έτοιμα.':'Ήχος ενεργός · φόρτωση ηχογραφήσεων…';
  if($('audioStatus'))$('audioStatus').textContent=status;
  if($('menuAudioLabel'))$('menuAudioLabel').textContent=silent?'Άνοιγμα ήχου':blocked?'Ενεργοποίηση ήχου':'Ήχος ενεργός';
  if($('menuAudioStatus'))$('menuAudioStatus').textContent=silent?'Ο ήχος είναι σε σίγαση.':blocked?'Άγγιξε το σφυρί ή ενεργοποίησε τον ήχο.':'Μουσική εργαστηρίου & ήχοι ενεργοί.';
}
function enableGameAudio(){
  if(settings.volume<=0){settings.volume=.75;audio.setVolume(.75);$('volumeRange').value=75;}
  if(audio.muted)audio.toggle();
  settings.muted=false;
  save('ironfall.settings',settings);
}
function toggleSound(){
  if(settings.muted||settings.volume<=0){enableGameAudio();audio.unlock().then(()=>audio.play('ui'));}
  else if(audio.ready===false){audio.unlock().then(()=>{audio.play('ui');updateSoundButtons();});}
  else settings.muted=audio.toggle();
  updateSoundButtons();save('ironfall.settings',settings);
}
async function testGameAudio(){
  enableGameAudio();
  // This call stays inside the user's click; no asynchronous asset fetch first.
  const preview=audio.preview?.()||audio.unlock().then(()=>{audio.play('start');return true;});
  const played=await preview;
  updateSoundButtons();
  if(!played)for(const id of ['audioStatus','menuAudioStatus'])if($(id))$(id).textContent='Η αναπαραγωγή μπλοκαρίστηκε. Πάτησε ξανά για δοκιμή.';
}
const isTouchPointer=e=>e?.pointerType==='touch'||e?.pointerType==='pen';
function aimFromClient(e){
  if(touchThrowAim)touchThrowAim.manualDirection=null;
  const rect=$('gameCanvas').getBoundingClientRect();
  pointer.x=(e.clientX-rect.left)*screenW/Math.max(1,rect.width);
  pointer.y=(e.clientY-rect.top)*screenH/Math.max(1,rect.height);pointer.active=true;
}
function beginTouchThrow(e){
  // One input contract on keyboard, mouse and touch. A first completed tap
  // keeps the aim open; only the next completed tap confirms a tap-mode throw.
  // In hold mode the initiating input owns release, including keyboard R.
  if(phase!=='playing'||leap||Math.abs(stance-stanceTarget)>.005)return;
  const owner=e.source==='keyboard'?'keyboard':e.pointerId;
  const touchInput=isTouchPointer(e),source=e.source==='keyboard'?'keyboard':touchInput?'touch':'mouse';
  if(touchThrowAim){
    if(touchThrowAim.pointerId!==null)return;
    if(touchInput&&touchThrowAim.source!=='touch'&&!touchThrowAim.dragged){touchThrowAim.manualDirection={...aim};pointer.active=false;}
    touchThrowAim.source=source;
    touchThrowAim.pointerId=owner;touchThrowAim.confirmOnRelease=true;
    touchThrowAim.startX=e.clientX;touchThrowAim.startY=e.clientY;
    touchThrowAim.pressDX=touchThrowAim.dx;touchThrowAim.pressDY=touchThrowAim.dy;
    return;
  }
  cancelAttack();guardHeld=false;guarding=false;
  if(touchInput)pointer.active=false;
  touchThrowAim={pointerId:owner,source,
    startX:e.clientX,startY:e.clientY,dx:0,dy:0,pressDX:0,pressDY:0,dragged:false,confirmOnRelease:false,
    time:0,channelTime:0,channelAngle:-.7,channeling:false,trailTime:0};
  updateAim();updateAttackFeedback();
}
function moveTouchThrow(e){
  const g=touchThrowAim;if(!g||g.pointerId!==e.pointerId||phase!=='playing')return;
  if(g.source!=='touch'||!Number.isFinite(e.clientX)||!Number.isFinite(e.clientY))return;
  g.dx=(g.pressDX||0)+e.clientX-g.startX;g.dy=(g.pressDY||0)+e.clientY-g.startY;
  // Crossing the threshold deliberately starts manual aim. Returning the
  // thumb to the origin keeps its last useful direction, without a divide by 0.
  const distance=Math.hypot(g.dx,g.dy);
  if(distance>=10){g.dragged=true;g.lastX=g.dx;g.lastY=g.dy;}
  else if(g.dragged){g.dx=g.lastX;g.dy=g.lastY;}
  if(g.dragged)updateAim();
}
function releaseTouchThrow(e){
  const owner=e?.source==='keyboard'?'keyboard':e?.pointerId;
  if(!touchThrowAim||touchThrowAim.pointerId!==owner)return;
  if(e?.source!=='keyboard')moveTouchThrow(e);
  if(settings.throwMode==='tap'&&!touchThrowAim.confirmOnRelease){
    touchThrowAim.pointerId=null;updateAim();updateHUD();return;
  }
  const dragged=touchThrowAim.dragged;
  if(dragged)updateAim();
  else if(touchThrowAim.source==='touch'&&!pointer.active){
    pointer.active=false;
    const move=movementDirection();
    if(move.x||move.z)facing=move;
    updateAim();
  }else updateAim();
  const direction={...aim};
  const channelAngle=touchThrowAim.channeling?touchThrowAim.channelAngle:null;
  const touchInput=touchThrowAim.source==='touch';
  touchThrowAim=null;throwLock=null;if(touchInput)pointer.active=false;
  if(phase==='playing'&&!leap&&Math.abs(stance-stanceTarget)<=.005&&!startThrow(direction,channelAngle)){
    // Preserve a release made just before recovery ends, with its original
    // direction. Never leave a delayed throw waiting indefinitely.
    touchThrowQueued={dir:direction,life:TOUCH_THROW_BUFFER_SECONDS};
  }
}
function cancelTouchThrow(){
  if(touchThrowAim?.channeling&&!swing&&!leap&&!throwFlight){const rig=hero.userData.weaponRig;spinRecovery={time:0,fromRotation:rig.quaternion.clone(),fromPosition:rig.position.clone(),fromReach:hero.userData.reachScale};}
  touchThrowAim=null;touchThrowQueued=null;throwLock=null;pointer.active=false;$('throwButton')?.classList.remove('aiming','queued','channeling');
  $('throwButton')?.setAttribute('aria-pressed','false');
}
function initInput(){
  $('startButton').onclick=()=>startGame();$('retryButton').onclick=()=>startGame(testRun?Number($('startingLevel').value):1,{test:testRun,resume:!testRun});
  $('restartButton').onclick=()=>{persistCharacter();setPhase('menu');updateSavedCharacter();};
  $('resumeCharacterButton').onclick=()=>startGame(1,{resume:true});
  $('startingLevel').replaceChildren();for(let n=1;n<=MAX_CHARACTER_LEVEL;n++){const option=document.createElement('option');option.value=String(n);option.textContent=String(n);$('startingLevel').appendChild(option);}$('startingLevel').value='10';
  const preview=()=>{const s=getCharacterStats(createCharacterProgression(Number($('startingLevel').value)));$('startingLoadout').textContent=s.weaponName+' · '+(s.canLightning?'Αναπηδήσεις και κεραυνοί':s.canReturn?'Αυτόματη επιστροφή':s.canAirSmash?'Εναέρια συντριβή':'Μικρό άλμα, ρίψη και συλλογή');};
  $('startingLevel').onchange=preview;preview();$('testStartButton').onclick=()=>startGame(Number($('startingLevel').value),{test:true});$('forgeButton').onclick=forgeWeapon;
  window.addEventListener('pagehide',persistCharacter);
  $('resumeButton').onclick=()=>setPhase('playing');$('pauseButton').onclick=pauseGame;
  $('continueButton').onclick=()=>{boss=null;$('bossHud').hidden=true;beginWave(round+1);setPhase('playing');audio.play('start');announce('Η ΠΟΛΗ ΑΝΤΕΧΕΙ ΑΚΟΜΑ','Συνέχισε να εξελίσσεσαι. Η επόμενη ορδή πλησιάζει.',3.2);};
  $('soundButton').onclick=toggleSound;if($('muteButton'))$('muteButton').onclick=toggleSound;
  $('upgradesToggle').onclick=()=>toggleUpgradePanel();$('upgradeCloseButton').onclick=()=>toggleUpgradePanel(false);
  for(const [id,tab] of [['upgradePowerTab','powers'],['upgradeGearTab','gear']])if($(id)){
    $(id).onclick=()=>{upgradeTab=tab;syncUpgradePanel();audio.play('ui');};
    $(id).addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.code))return;e.preventDefault();e.stopPropagation?.();upgradeTab=e.code==='Home'?'powers':e.code==='End'?'gear':upgradeTab==='powers'?'gear':'powers';syncUpgradePanel();$(upgradeTab==='powers'?'upgradePowerTab':'upgradeGearTab').focus();});
  }
  // A completed tap changes grip without pausing the battle.
  if($('mobileStanceButton'))$('mobileStanceButton').onclick=toggleStance;
  $('settingsButton').onclick=()=>{previousPhase=phase;setPhase('settings');};
  forgeMenu=createForgeMenu({document,audio,onSettings:()=>{previousPhase='menu';setPhase('settings');}});
  $('closeSettingsButton').onclick=()=>{setPhase(previousPhase);save('ironfall.settings',settings);};
  $('qualitySelect').value=settings.quality;$('shakeToggle').checked=settings.shake;$('volumeRange').value=Math.round(settings.volume*100);
  $('qualitySelect').onchange=e=>{settings.quality=e.target.value;resize();save('ironfall.settings',settings);};
  $('shakeToggle').onchange=e=>{settings.shake=e.target.checked;save('ironfall.settings',settings);};
  $('throwAutoLockToggle').checked=settings.throwAutoLock;
  $('throwAutoLockToggle').onchange=e=>{settings.throwAutoLock=!!e.target.checked;throwLock=null;if(!settings.throwAutoLock&&throwFlight){throwFlight.chainTarget=null;throwFlight.dir=normalize(throwFlight.dir.x,throwFlight.dir.z);}save('ironfall.settings',settings);};
  if($('throwModeSetting')){
    $('throwModeSetting').value=settings.throwMode;
    $('throwModeSetting').onchange=e=>{settings.throwMode=e.target.value==='hold'?'hold':'tap';cancelTouchThrow();save('ironfall.settings',settings);updateHUD();};
  }
  $('volumeRange').oninput=e=>{settings.volume=Number(e.target.value)/100;audio.setVolume(settings.volume);if(settings.volume>0&&settings.muted){settings.muted=audio.toggle();}audio.unlock();updateSoundButtons();save('ironfall.settings',settings);};
  updateSoundButtons();
  window.addEventListener('keydown',e=>{
    const handled=['Space','KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftLeft','ShiftRight','Escape','KeyR','KeyZ','KeyU','KeyE'];
    if(handled.includes(e.code)&&!['INPUT','SELECT'].includes(document.activeElement?.tagName))e.preventDefault();
    if(e.code==='Escape'&&!e.repeat){if(phase==='menu'&&forgeMenu?.closeDialog?.())return;if(phase==='playing'&&(touchThrowAim||touchThrowQueued))cancelTouchThrow();else if(phase==='playing'&&upgradePanelOpen)toggleUpgradePanel(false);else if(phase==='settings'){setPhase(previousPhase);}else pauseGame();return;}
    if(phase==='menu'&&e.code==='Enter'&&!e.repeat&&!$('startButton').disabled&&
      (document.activeElement===document.body||document.activeElement===$('gameCanvas'))){startGame();return;}
    if(phase==='playing'&&upgradePanelOpen&&upgradeTab==='powers'&&['Digit1','Digit2','Digit3'].includes(e.code)){if(!e.repeat)$('upgradeChoices').children[Number(e.code.slice(-1))-1]?.click();return;}
    if(phase!=='playing'||['INPUT','SELECT','TEXTAREA'].includes(document.activeElement?.tagName)||document.activeElement?.isContentEditable)return;
    if(e.code==='KeyU'&&!e.repeat){toggleUpgradePanel();return;}
    keys.add(e.code);document.querySelector('[data-key="'+e.code+'"]')?.classList.add('active');
    if(e.code==='Space'&&!e.repeat)startLeap();
    if(e.code==='KeyE'&&!e.repeat)startKick();
    if(e.code==='KeyR'&&!e.repeat)beginTouchThrow({source:'keyboard'});
    if(e.code==='KeyZ'&&!e.repeat)toggleStance();
    if((e.code==='ShiftLeft'||e.code==='ShiftRight')&&!e.repeat)dodge();
  });
  window.addEventListener('keyup',e=>{
    keys.delete(e.code);document.querySelector('[data-key="'+e.code+'"]')?.classList.remove('active');
    if(e.code==='KeyR')releaseTouchThrow({source:'keyboard'});
  });
  window.addEventListener('blur',()=>{if(phase==='playing')setPhase('paused');clearInput();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&phase==='playing')setPhase('paused');});
  window.addEventListener('pointermove',e=>{
    if(phase!=='playing')return;
    if(e.pointerId===touchCanvasPointer&&(!touchThrowAim||touchThrowAim.pointerId===null)){if(touchThrowAim)touchThrowAim.dragged=false;aimFromClient(e);return;}
    if(!isTouchPointer(e)&&!e.target?.closest?.('#combatDock,#upgradePanel,#upgradesToggle,.hud-buttons,#touchControls'))aimFromClient(e);
    if(e.pointerId===combatPointer&&typeof e.buttons==='number')syncCombatButtons(e.buttons);
  });
  $('gameCanvas').addEventListener('pointerdown',e=>{
    if(phase!=='playing'||(e.button!==undefined&&e.button!==0&&e.button!==2))return;
    if(isTouchPointer(e)){
      if(touchCanvasPointer!==null||touchThrowAim?.pointerId!=null)return;
      e.preventDefault();touchCanvasPointer=e.pointerId;$('gameCanvas').setPointerCapture(e.pointerId);
      if(touchThrowAim)touchThrowAim.dragged=false;
      aimFromClient(e);updateAim();audio.unlock();return;
    }
    if(combatPointer!==null&&e.pointerId!==combatPointer)return;
    e.preventDefault();$('gameCanvas').focus({preventScroll:true});audio.unlock();
    if(e.clientX!==undefined)aimFromClient(e);
    combatPointer=e.pointerId;$('gameCanvas').setPointerCapture(e.pointerId);updateAim();
    syncCombatButtons(typeof e.buttons==='number'?e.buttons:mouseButtons|(e.button===2?2:1));
  });
  window.addEventListener('pointerup',e=>{
    if(e.pointerId===touchCanvasPointer){
      if(touchThrowAim&&touchThrowAim.pointerId===null){updateAim();touchThrowAim.manualDirection={...aim};pointer.active=false;}
      touchCanvasPointer=null;return;
    }
    if(e.pointerId!==combatPointer)return;
    syncCombatButtons(typeof e.buttons==='number'?e.buttons:0);
    if(!mouseButtons)combatPointer=null;
  });
  const cancelCombatPointer=e=>{
    if(e.pointerId===touchCanvasPointer){touchCanvasPointer=null;pointer.active=false;}
    if(e.pointerId!==combatPointer)return;combatPointer=null;mouseButtons=0;cancelAttack();releaseGuard();
  };
  window.addEventListener('pointercancel',cancelCombatPointer);
  $('gameCanvas').addEventListener('lostpointercapture',cancelCombatPointer);
  $('gameCanvas').addEventListener('contextmenu',e=>e.preventDefault());
  let stickId=null;
  const stick=$('joystick'),knob=$('joystickKnob');
  function moveStick(e){
    const rect=stick.getBoundingClientRect(),r=Math.max(1,Math.min(rect.width,rect.height)*.34);
    const dx=e.clientX-rect.left-rect.width/2,dy=e.clientY-rect.top-rect.height/2,d=Math.hypot(dx,dy);
    const strength=clamp((d/r-.12)/.88,0,1),visual=Math.min(d,r);
    touch.x=d>0?dx/d*strength:0;touch.y=d>0?dy/d*strength:0;
    knob.style.transform='translate('+(d?dx/d*visual:0)+'px,'+(d?dy/d*visual:0)+'px)';
  }
  function resetStick(){stickId=null;touch.x=0;touch.y=0;knob.style.transform='translate(0,0)';stick.classList.remove('active');}
  inputResetters.push(resetStick);
  stick.addEventListener('pointerdown',e=>{
    if(phase!=='playing'||stickId!==null||(e.button!==undefined&&e.button!==0))return;
    e.preventDefault();pointer.active=false;stickId=e.pointerId;stick.setPointerCapture(stickId);stick.classList.add('active');moveStick(e);audio.unlock();
  });
  stick.addEventListener('pointermove',e=>{if(phase==='playing'&&e.pointerId===stickId)moveStick(e);});
  const releaseStick=e=>{if(e.pointerId===stickId)resetStick();};
  stick.addEventListener('pointerup',releaseStick);stick.addEventListener('pointercancel',releaseStick);stick.addEventListener('lostpointercapture',releaseStick);
  window.addEventListener('pointerup',releaseStick);window.addEventListener('pointercancel',releaseStick);
  function bindAction(id,press,release=()=>{},cancel=release,move=()=>{}){
    const button=$(id);if(!button)return;
    let owner=null;
    const reset=()=>{if(owner===null)return;owner=null;button.classList.remove('active');cancel();};
    inputResetters.push(reset);
    button.addEventListener('pointerdown',e=>{
      if(phase!=='playing'||owner!==null||(e.button!==undefined&&e.button!==0))return;
      e.preventDefault();owner=e.pointerId;button.setPointerCapture(owner);button.classList.add('active');
      if(!isTouchPointer(e))$('gameCanvas').focus({preventScroll:true});
      audio.unlock();press(e);
    });
    button.addEventListener('pointermove',e=>{if(phase==='playing'&&e.pointerId===owner)move(e);});
    const released=e=>{if(e.pointerId!==owner)return;owner=null;button.classList.remove('active');release(e);};
    const cancelled=e=>{if(e.pointerId===owner)reset();};
    button.addEventListener('pointerup',released);button.addEventListener('pointercancel',cancelled);button.addEventListener('lostpointercapture',cancelled);
    window.addEventListener('pointerup',released);window.addEventListener('pointercancel',cancelled);
  }
  bindAction('attackButton',pressAttack,releaseAttack,cancelAttack);
  bindAction('guardButton',pressGuard,releaseGuard);
  bindAction('leapButton',startLeap);
  bindAction('kickButton',startKick);
  bindAction('throwButton',beginTouchThrow,releaseTouchThrow,cancelTouchThrow,moveTouchThrow);
  bindAction('stanceButton',toggleStance);
  bindAction('dashButton',dodge);
  for(const [id,code] of [['moveUpButton','KeyW'],['moveLeftButton','KeyA'],['moveDownButton','KeyS'],['moveRightButton','KeyD']]){
    bindAction(id,()=>{pointer.active=false;keys.add(code);},()=>keys.delete(code));
  }
  window.addEventListener('resize',resize);
  window.visualViewport?.addEventListener('resize',resize);
  for(const query of ['(pointer:coarse)','(any-pointer:coarse)'])matchMedia(query).addEventListener?.('change',syncTouchControls);
  for(const element of [stick,$('combatDock')])element?.addEventListener('contextmenu',e=>e.preventDefault());
}

let lastFrame=0;
function frame(now){
  requestAnimationFrame(frame);const realDt=clamp((now-lastFrame)/1000||1/60,0,.25);lastFrame=now;
  if(document.hidden)return;
  visualTime+=realDt;redFlash=Math.max(0,redFlash-realDt*1.4);shake=Math.max(0,shake-realDt*1.7);
  forgeMenu?.update(realDt);
  let simulated=0;
  if(phase==='playing'){
    // Small physics steps retain wall-clock speed and swept hit detection even
    // when rendering is slower. Hit feedback freezes only its exact duration.
    for(let remaining=realDt;remaining>1e-8&&phase==='playing';){
      const slice=Math.min(SIMULATION_STEP,remaining),frozen=Math.min(hitStop,slice);
      hitStop=Math.max(0,hitStop-frozen);const dt=slice-frozen;
      if(dt>0){updateGame(dt);simulated+=dt;}
      remaining-=slice;
    }
  }else if(phase==='menu'){player.walk+=realDt*.25;poseHero(realDt,false);updateObjects(realDt);}
  const weather=world.regionAt?.(player.x,player.z)?.weather||'rain';
  const environmentDt=phase==='playing'?simulated:phase==='menu'?realDt:0;
  world.update(environmentDt,visualTime,player,weather);
  destruction?.update(environmentDt,player,{active:phase==='playing'});
  updateEffects(phase==='paused'||phase==='settings'?0:realDt);
  const desired=phase==='menu'?new THREE.Vector3(-5,.6,3.5):new THREE.Vector3(player.x+facing.x*.8,.6+player.y*.25,player.z+facing.z*.8);
  cameraTarget.lerp(desired,1-Math.exp(-realDt*5.6));camera.position.copy(cameraTarget).add(cameraOffset);
  if(settings.shake&&shake>0){camera.position.x+=(Math.random()-.5)*shake;camera.position.y+=(Math.random()-.5)*shake*.5;camera.position.z+=(Math.random()-.5)*shake;}
  camera.lookAt(cameraTarget);
  camera.updateMatrixWorld(true);world.updateVisibility?.(player,camera);updateBattleVisibility(realDt);
  sun.position.set(player.x-15,28,player.z+8);sun.target.position.set(player.x,0,player.z);sun.target.updateMatrixWorld();
  // Subtle moving storm illumination, kept bright enough for readable combat.
  const lightning=weather==='rain'&&Math.sin(visualTime*.47)> .998?Math.sin(visualTime*70)**8*.35:0;
  sun.intensity=2.25+lightning;fillLight.intensity=1.45+(weather==='snow'?.2:0);
  audio.update(realDt,phase==='playing'?Math.min(1,enemies.length/40+(boss&&!boss.dead?.4:0)):0,weather);
  renderer.render(scene,camera);drawFX();
  hudTimer-=realDt;if(hudTimer<=0){updateHUD();hudTimer=.07;$('touchControls').hidden=!touchLayout||phase!=='playing';}
  minimapTimer-=realDt;if(minimapTimer<=0){drawMinimap();minimapTimer=.18;}
}

async function init(){
  renderer=new THREE.WebGLRenderer({canvas:$('gameCanvas'),antialias:false,alpha:false,powerPreference:'high-performance'});
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.22;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  scene=new THREE.Scene();scene.background=new THREE.Color(0x223c40);scene.fog=new THREE.Fog(0x344c4c,34,88);
  camera=new THREE.OrthographicCamera(-20,20,13,-13,.1,160);cameraTarget.set(-5,.6,3.5);camera.position.copy(cameraTarget).add(cameraOffset);camera.lookAt(cameraTarget);
  fillLight=new THREE.HemisphereLight(0xb9dcd9,0x536650,1.45);scene.add(fillLight);
  sun=new THREE.DirectionalLight(0xffdfb1,2.25);sun.position.set(-15,28,8);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-23;sun.shadow.camera.right=23;sun.shadow.camera.top=23;sun.shadow.camera.bottom=-23;sun.shadow.camera.far=75;sun.shadow.normalBias=.04;sun.shadow.bias=-.0002;scene.add(sun,sun.target);
  const rim=new THREE.DirectionalLight(0x80c7dd,1.15);rim.position.set(8,14,-18);scene.add(rim);
  hero=makeWarrior();scene.add(hero);player.materials=hero.userData.getEquipmentMaterials?.()||prepareMaterials(hero);
  const heldMaterials=new Set();hero.userData.hammerPivot.traverse(n=>{if(n.isMesh)for(const m of Array.isArray(n.material)?n.material:[n.material])heldMaterials.add(m);});hammerMaterials=[...heldMaterials];hammerAura=createHammerAura();
  chargeRing=new THREE.Mesh(new THREE.RingGeometry(.93,1,48),new THREE.MeshBasicMaterial({color:color.gold,side:THREE.DoubleSide,transparent:true,opacity:.5,depthWrite:false}));chargeRing.rotation.x=-Math.PI/2;chargeRing.visible=false;scene.add(chargeRing);
  const arrowGeo=new THREE.BufferGeometry();arrowGeo.setAttribute('position',new THREE.Float32BufferAttribute([-.19,0,-.1,.19,0,-.1,0,0,.25],3));
  directionMarker=new THREE.Mesh(arrowGeo,new THREE.MeshBasicMaterial({color:0xf6cf8a,side:THREE.DoubleSide,transparent:true,opacity:.64,depthWrite:false}));scene.add(directionMarker);
  guardRing=new THREE.Mesh(new THREE.RingGeometry(1.68,1.72,64),new THREE.MeshBasicMaterial({color:0x9ee4db,side:THREE.DoubleSide,transparent:true,opacity:.15,depthWrite:false}));guardRing.visible=false;scene.add(guardRing);
  landingMarker=makeTelegraph(0,0,1,0xffc371);landingMarker.visible=false;
  groundShadow=new THREE.Mesh(new THREE.CircleGeometry(.65,24),new THREE.MeshBasicMaterial({color:0x081719,transparent:true,opacity:.32,depthWrite:false}));groundShadow.rotation.x=-Math.PI/2;scene.add(groundShadow);
  fragments=new Fragments();impactClouds=new ImpactClouds();resetWorld();facing={x:.585491,z:.810679};hero.rotation.y=Math.atan2(facing.x,facing.z);cameraTarget.set(-5,.6,3.5);
  initInput();resize();setPhase('menu');
  $('gameCanvas').setAttribute('tabindex','-1');
  // Shader compilation is local. Optional recorded audio preloads separately.
  if(renderer.compileAsync)await renderer.compileAsync(scene,camera);
  $('startButton').disabled=false;$('testStartButton').disabled=false;updateSavedCharacter();$('loadingStatus').textContent='Από κούτσουρο σε σφυρί καταιγίδας. Η πόλη είναι έτοιμη.';
  if($('bestScore'))$('bestScore').textContent=best.toLocaleString('el-GR');
  requestAnimationFrame(frame);
}
init().catch(error=>{
  console.error('IRONFALL initialization failed:',error);$('loadingStatus').textContent='Δεν ολοκληρώθηκε η εκκίνηση.';$('fatalError').hidden=false;
  $('fatalText').textContent='Το παιχνίδι χρειάζεται WebGL 2. Δοκίμασε πρόσφατο Chrome ή Edge με ενεργή επιτάχυνση γραφικών. Λεπτομέρεια: '+error.message;
});
