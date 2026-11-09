import {createMountWorkshop} from './mount-workshop.js?v=20261108-workshop1';
import {createSaveStore} from './save-store.js?v=20261108-armory1';
import {applyArmoryCustomization} from './armory-customization.js?v=20261108-armory1';
import {createWeaponModel} from './armory-models.js?v=20261108-armory1';
import {ArmoryEffects} from './armory-effects.js?v=20261108-armory1';
import {armoryHeadVolumes,sweepArmoryHead} from './armory-contacts.js?v=20261108-armory1';
import {resolveArmory,armoryAvailable,armoryStats,blueprint} from './armory-rules.js?v=20261108-armory1';
import {applyPlayerCustomization} from './player-customization.js?v=20261108-workshop1';
import {MountWeapons} from './mount-weapons.js?v=20261108-workshop1';
import {MountRide} from './mount-ride.js?v=20261108-workshop1';
import {restoreGarage,playerCustomStats} from './mount-rules.js?v=20261108-workshop1';
import {VehicleEffects,isExplosiveProp,VEHICLE_BLAST_RADIUS,preloadVehicleExplosion} from './vehicle-effects.js?v=20261108-mount1';
import {HydrantEffects} from './hydrant-effects.js?v=20261108-props1';
import {LevelStorm,stormStats} from './level-storm.js?v=20261108-mount1';
import {GroundScars} from './ground-scars.js?v=20261108-mount1';
import {createGameRenderer} from './renderer-policy.js?v=20261108-contact1';
import {loadCollisionWasm,collisionWasmStatus} from './collision-wasm.js?v=20261107-perf14';
import {FrameTelemetry,MAX_FRAME_SIMULATION,MAX_SIMULATION_CPU_MS} from './performance-hud.js?v=20261107-perf14';
import {constrainLargeWeaponPose} from './weapon-pose.js?v=20261107-perf14';
import {sampleMoveStick,SPIN_TURN_SECONDS,SPIN_DAMAGE_SCALE,advanceSpinMomentum,eligibleSpinContact,renewSpinMomentum,meleeAimSpec,inMeleeEnvelope} from './manual-combat.js?v=20261107-aim11';
import {DestructionSystem} from './destruction.js?v=20261108-startup1';
import {createForgeMenu} from './menu.js?v=20261109-gauntlet1';
import {getLevelCity} from './city-levels.js?v=20261107-cities10';
import {selectThrowLock,previewThrowChain,punchStats,samplePunchMotion,nearestPickupPoint} from './combat-tools.js?v=20261108-mount1';
import {findGeometryRest,geometryRestValid} from './weapon-rest.js?v=20261107-forge9';
import {bodyMass,enemyLevel,enemyHealthColor,isVehicle,kickStats,kickVelocity,transferMomentum,wallSlamResponse,firstVehicleContact,sampleKickMotion} from './kick-physics.js?v=20261108-mount1';
import * as THREE from './vendor/three.module.js';
import {makeWarrior,makeEnemy,makeTreasure} from './models.js?v=20261108-workshop1';
import {makeCityEnemy,installEnemyHead} from './enemy-models.js?v=20261109-gauntlet1';
import {createWorld} from './world.js?v=20261108-workshop1';
import {GameAudio} from './audio.js?v=20261108-storm1';
import {COMBO_WINDOW,createHitCombo,resetHitCombo,tickHitCombo,registerComboHit,comboMultiplier,scaleComboReward,impactMaterial} from './combat-feedback.js?v=20261106-feel1';
import {findBattleOccluders,applyOccluderFade,OcclusionDepth} from './occlusion.js?v=20261108-shell1';
import {GOAL,BOUNDS,clamp,lerp,normalize,screenMovement,nearestPoint,circleOverlaps,moveCircle,attackStats,destructionPercent,battleProgress,UPGRADE_DEFS,calculateStats} from './core.js?v=20261109-gauntlet1';
import {segmentCircleHit,firstHammerHit,facingCoverage} from './combat.js?v=20261107-forge9';
import {wavePlan,waveBatch,enemyTypeForWave,enemyStatsForWave} from './waves.js?v=20261109-gauntlet1';
import {createSwingSequence,resetSwingSequence,tickSwingSequence,selectHammerSwing,sampleSpinMotion,getHammerSwingDuration,sampleHammerSwing,SWING_CONTACT_START,SWING_CONTACT_END} from './hammer-motion.js?v=20261107-aim12';
import {createThrowIndicator} from './throw-indicator.js?v=20261107-perf14-fix3';
import {BARBED_DAMAGE_SCALE,BARBED_PULL_FORCE,sweptBarbedContact,barbedPullDirection,barbedPullLimit} from './barbed-contact.js?v=20261107-aim13';
import {MAX_CHARACTER_LEVEL,CHARACTER_WEAPONS,MATERIAL_TYPES,createCharacterProgression,awardCharacterXp,collectCharacterMaterial,getCharacterStats,getForgeStatus,forgeNextWeapon,xpForNextLevel,restoreCharacterProgression} from './character-progression.js?v=20261108-mount1';
import {initEnemyReaction,updateEnemyThreat,startEnemyFear,interruptEnemyAttack,poseEnemyReaction,applyEnemyFlash} from './enemy-reactions.js?v=20261106-feel1';

import {beastObstacleContacts} from './beast-obstacles.js?v=20261109-beast1';
import {makeBeastMech} from './beast-mech.js?v=20261109-beast1';
import {BeastCombat,distanceToBeam} from './beast-combat.js?v=20261109-beast1';
import {BeastPortal} from './beast-portal.js?v=20261109-beast1';
import {installBeastReveal} from './beast-reveal.js?v=20261109-beast1';
import {BEAST_ENTRY,beastHealth,beastDamageScale,beastPortalLocation,chooseBeastAttack} from './beast-rules.js?v=20261109-beast1';
import {createGeometryCollision} from './geometry-collision.js?v=20261108-startup1';

const $ = id => document.getElementById(id);
const saveStore=createSaveStore(localStorage,{preview:globalThis.location?.pathname?.startsWith('/candidate/')||false});
const save = (key,value) => saveStore.write(key,value);
const read = (key,fallback) => saveStore.read(key,fallback);
const settings = Object.assign({quality:'high',shake:true,volume:0.75,muted:false,throwAutoLock:false,throwMode:'confirm'},read('ironfall.settings',{}));
settings.volume=Number.isFinite(Number(settings.volume))?clamp(Number(settings.volume),0,1):.75;
settings.muted=!!settings.muted;
// Migrate the previous default-on release once; a later explicit opt-in is
// preserved. Updating the game must actually remove existing automatic aim.
if(settings.aimControlVersion!==1){settings.throwAutoLock=false;settings.aimControlVersion=1;save('ironfall.settings',settings);}
settings.throwAutoLock=settings.throwAutoLock===true;
settings.throwMode=settings.throwMode==='hold'?'hold':'confirm';
const rendererMode=typeof location!=='undefined'&&new URLSearchParams(location.search).get('renderer')==='webgl'?'webgl':'webgpu';
const performanceMonitor=new FrameTelemetry();
const keys = new Set();
const touch = {x:0,y:0,aimX:0,aimY:0,turnOnly:false,attack:false};
const inputResetters=[];
let touchLayout=false,touchCanvasPointer=null,touchThrowAim=null,touchThrowQueued=null;
const audio = new GameAudio();
audio.muted=settings.muted;
audio.setVolume(settings.volume);
audio.onStatusChange=updateSoundButtons;
audio.bindUnlock?.(document);
audio.preload?.();
// Sound tests work even while the renderer is still loading.
for(const id of ['testAudioButton','menuAudioButton'])if($(id))$(id).onclick=testGameAudio;
let destruction=null;
let mountedAimYaw=0;
let mountRide=null,mountWeapons=null,mountWorkshop=null,workshopPhase='menu',activeStartingLevel=1;
let garage=restoreGarage(read('ironfall.character',null)?.garage),playerCustomization={hp:0,power:1,speed:1,defence:0};
let armoryWeaponStats=null,armoryShieldStats=null,armoryWarmModel=null,armoryVolumes=null;
let forgeMenu=null,gameReady=false,menuBackdropReady=false;
let pristineMenuWorld=false;
let renderer,scene,camera,world,hero,sun,fillLight,chargeRing,directionMarker,throwIndicator,occlusionDepth;
let phase='menu', previousPhase='menu', elapsed=0, roundTime=0, round=1, sector=1, kills=0, relics=0, level=1, xp=0, xpTarget=12, score=0;
let enemies=[],enemyFalls=[],drops=[],bolts=[],rings=[],arcs=[],numbers=[],telegraphs=[];
const freeWeaponTrails=[],weaponTrailRecords=new WeakMap(),trailSide=new THREE.Vector3(),trailCamera=new THREE.Vector3();
let boss=null,bossSpawned=false,spawnCounter=0,lootCounter=0,announcementTimer=0;
const BOSS_GATES=[
  {threshold:45,type:'siegeTransformer',name:'ΠΟΛΙΟΡΚΗΤΗΣ',cue:'Όταν απομακρύνεσαι, διπλώνει τα πόδια του και σε κυνηγά ως tank.',escort:['robot','mech','robot','crawler']},
  {threshold:70,type:'hollowMarshal',name:'ΝΕΚΡΟΣΤΡΑΤΗΓΟΣ',cue:'Οι στρατιώτες του ενισχύουν την άμυνά του. Σπάσε τη γραμμή τους.',escort:['marshalThrall','marshalThrall','crawler','marshalThrall','marshalThrall','brute','marshalThrall','crawler','robot','marshalThrall','marshalThrall','brute']},
];
const MINI_ENTRY={open:.85,walk:2.9,close:.65};
let bossGate=0,encounter=null,encounterRetry=0;
let battleKills=0,beastRig=null,beastCombat=null,beastPortal=null;
const beastCollision=createGeometryCollision({nearObjects:(x,z)=>boss&&!boss.dead&&(boss.state!=='enter'||boss.entryPlane.distanceToPoint({x,y:0,z})>=0)?[boss]:[]});
let wave=null,upgradeQueue=[],upgradePanelOpen=false,upgradeTab='powers',upgradeFeedback='';
let activeCity=null;
let character=createCharacterProgression(),characterStats=getCharacterStats(character),testRun=false,checkpointTimer=0,forgeReadyAnnounced=false;
const MATERIAL_LABELS={wood:'Ξύλο',scrap:'Μέταλλο',crystal:'Κρύσταλλοι'};
let shake=0,hitStop=0,redFlash=0,best=read('ironfall.best',0),visualTime=0,hudTimer=0,minimapTimer=0;
const combatCombo=createHitCombo();
let comboXpCarry=0,comicState=null,lastComicAt=-10,occlusionTimer=0,heroOccluded=false,heroSilhouette=null;
let battleOccluders=new Set(),silhouetteParts=[];
let chargeHeld=false,chargeStarted=false,charge=0,swing=null,attackCooldown=0,dashTime=0,dashCooldown=0;
const swingSequences=[createSwingSequence(),createSwingSequence()];
function resetAttackChain(){for(const sequence of swingSequences)resetSwingSequence(sequence);}
let attackBuffer=null,spin=null,spinRecovery=null,holdElapsed=0,spinCharge=null;
let aimPreviewTimer=0,meleeHint=null,meleeHintTargets=[];
const aimDiagnostics={previews:0,throwPreviews:0};
const SPIN_HOLD_SECONDS=.22,ATTACK_BUFFER_SECONDS=.45,TOUCH_THROW_BUFFER_SECONDS=.30,SIMULATION_STEP=1/120;
let facing={x:-0.585491,z:-0.810679},dashDirection={x:0,z:-1},levels={power:0,size:0,range:0,speed:0,vitality:0,quake:0,kick:0},stats=calculateStats(levels);
let stance=0,stanceTarget=0,guardHeld=false,guarding=false,guardAngle=0;
let combatPointer=null,mouseButtons=0;
let leap=null,leapCooldown=0,throwWindup=null,throwFlight=null,throwCooldown=0,landingRecovery=0,landingPose=null;
let kick=null,kickCooldown=0,vehicleNavTimer=0,vehicleEffects=null,hydrantEffects=null,levelStorm=null,groundScars=null;
let punch=null,punchSequence=0,throwLock=null,throwPreviewTargets=[],dashFollowup=0;
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
// Orthographic framing is independent of eye distance. The old close eye plane
// sliced foreground towers into diagonal roof fragments. Retreat on the same
// axis; compensate fog and camera-dependent effects to keep the authored view.
const CAMERA_DISTANCE_SCALE=3,CAMERA_FOG_SHIFT=cameraOffset.length()*(CAMERA_DISTANCE_SCALE-1),cameraShakeOffset=new THREE.Vector3();
function updateBattleCamera(dt,desired){
  if(camera.zoom!==1){camera.zoom=1;camera.updateProjectionMatrix();}
  cameraTarget.lerp(desired,1-Math.exp(-dt*5.6));camera.position.copy(cameraTarget).addScaledVector(cameraOffset,CAMERA_DISTANCE_SCALE);
  (camera.userData.effectPosition??=new THREE.Vector3()).copy(cameraTarget).add(cameraOffset);
  camera.userData.shakeScale=CAMERA_DISTANCE_SCALE;
  if(scene.fog){scene.fog.near=34+CAMERA_FOG_SHIFT;scene.fog.far=88+CAMERA_FOG_SHIFT;}
}
function shakeCamera(amount){
  cameraShakeOffset.set((Math.random()-.5)*amount,(Math.random()-.5)*amount*.5,(Math.random()-.5)*amount);
  camera.position.addScaledVector(cameraShakeOffset,camera.userData.shakeScale??1);
  camera.userData.effectPosition?.add(cameraShakeOffset);
}
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
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.mesh.count=0;this.mesh.visible=false;this.mesh.frustumCulled=false;
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
    this.mesh.count=count;this.mesh.visible=count>0;this.mesh.instanceMatrix.needsUpdate=true;if(this.mesh.instanceColor)this.mesh.instanceColor.needsUpdate=true;
  }
  warm(){this.mesh.setColorAt(0,cachedColor(0xffffff));this.mesh.count=this.capacity;this.mesh.visible=true;}
  clear(){this.items.length=0;this.mesh.count=0;this.mesh.visible=false;}
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
  emit(x,y,z,dir,radius=1,stars=true){
    const count=settings.quality==='low'?5:8;
    for(let n=0;n<count;n++){
      const p=this.pool.find(p=>p.life<=0);if(!p)break;
      const star=stars&&n<2,angle=Math.random()*Math.PI*2,speed=star?.15:1.1+Math.random()*1.7;
      Object.assign(p,{star,life:star?.13:.42+Math.random()*.2,x:x+(star?0:Math.cos(angle)*.3),y:y+(star?1.05:.15+Math.random()*.18),z:z+(star?0:Math.sin(angle)*.3),
        vx:star?0:dir.x*.8+Math.cos(angle)*speed,vz:star?0:dir.z*.8+Math.sin(angle)*speed,vy:star?0:.45+Math.random()*.5,size:(star?n===0?1.05:.57:.55)*radius});
      p.max=p.life;p.mesh.material.map=star?this.star:this.dust;p.mesh.material.color.setHex(star?n===0?0xffca67:0xffffff:0xc7b99c);
      p.mesh.material.rotation=Math.random()*Math.PI;p.mesh.material.opacity=star?1:.5;p.mesh.position.set(p.x,p.y,p.z);p.mesh.scale.setScalar(p.size);p.mesh.visible=true;
    }
  }
  update(dt){for(const p of this.pool){if(p.life<=0)continue;p.life-=dt;if(p.life<=0){p.mesh.visible=false;continue;}const t=1-p.life/p.max;p.x+=p.vx*dt;p.z+=p.vz*dt;p.y+=p.vy*dt;p.mesh.position.set(p.x,p.y,p.z);p.mesh.scale.setScalar(p.size*(p.star?1+t*.5:1+t*1.65));p.mesh.material.opacity=(p.star?1:.5)*(1-t);}}
  warm(){for(let i=0;i<this.pool.length;i++){const p=this.pool[i];p.mesh.material.map=i<2?this.star:this.dust;p.mesh.material.opacity=1;p.mesh.visible=true;}}
  clear(){for(const p of this.pool){p.life=0;p.mesh.visible=false;p.mesh.material.opacity=0;}}
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
  // The shaft supplies the wire's silhouette. An instanced coil needs its
  // instance transforms; drawing its unit geometry as one Mesh is a ghost.
  hero.traverse(source=>{if(!source.isMesh||source.isInstancedMesh)return;const proxy=new THREE.Mesh(source.geometry,material);proxy.matrixAutoUpdate=false;proxy.frustumCulled=false;proxy.renderOrder=45;root.add(proxy);silhouetteParts.push({source,proxy});});
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
    const bossOccludes=boss&&!boss.dead&&boss.geometryHit&&heroPoints.some(point=>boss.geometryHit(point,{x:point.x+direction.x,y:point.y+direction.y,z:point.z+direction.z},.02));
    heroOccluded=battleOccluders.size>0||!!bossOccludes;
    if(phase==='playing'&&encounter?.entry){
      const {x,z}=encounter.entry.location,h=encounter.leader.height;
      const projected=screenPoint(x,h*.6,z);
      // Only protect an on-screen entrance. Off-screen portals are located
      // through their map marker, so no unrelated buildings need to fade.
      if(projected.inside&&projected.x>0&&projected.x<screenW&&projected.y>0&&projected.y<screenH){
        const local=candidates.filter(o=>Math.hypot(o.x-x,o.z-z)<33);
        const portalPoints=[{x,y:h*.4,z},{x,y:h*.78,z}];
        for(const o of findBattleOccluders(local,portalPoints,direction))battleOccluders.add(o);
      }
    }
  }
  for(const o of world.objects)if(!o.dead&&(battleOccluders.has(o)||o.occlusionFade>0))applyOccluderFade(o,battleOccluders.has(o),dt);
  occlusionDepth?.sync(world.objects);
  if(!heroSilhouette)rebuildHeroSilhouette();
  heroSilhouette.visible=phase==='playing'&&heroOccluded;
  if(heroSilhouette.visible){
    hero.updateMatrixWorld(true);
    for(const {source,proxy} of silhouetteParts){let visible=true;for(let node=source;node&&node!==scene;node=node.parent)if(!node.visible){visible=false;break;}proxy.visible=visible;proxy.matrix.copy(source.matrixWorld);}
  }
}

function setPhase(next){
  phase=next;document.body.dataset.state=next;
  const menuContext=next==='menu'||next==='settings'&&previousPhase==='menu';
  $('menu').hidden=!menuContext;$('menu').inert=next==='settings';$('hud').hidden=menuContext;
  forgeMenu?.setVisible(next==='menu');
  audio.setMenuActive?.(next==='menu');menuBackdropReady=false;
  $('pauseMenu').hidden=next!=='paused';$('settingsMenu').hidden=next!=='settings';
  $('endMenu').hidden=next!=='dead'&&next!=='victory';syncUpgradePanel();
  if($('performanceHud'))$('performanceHud').hidden=next!=='playing';
  performanceMonitor.reset();
  if(next!=='playing'){if(throwIndicator)throwIndicator.mesh.visible=false;audio.stopEnvironment?.();clearInput();if(guardRing)guardRing.visible=false;if(hammerAura)hammerAura.root.visible=false;}
  else $('gameCanvas').focus({preventScroll:true});
  syncTouchControls();syncMountHud();
}
function clearInput(){
  for(const reset of inputResetters)reset();
  cancelTouchThrow();
  keys.clear();touch.x=0;touch.y=0;touch.aimX=0;touch.aimY=0;touch.turnOnly=false;touch.attack=false;touchCanvasPointer=null;touchThrowAim=null;touchThrowQueued=null;
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
function ownedMaterials(group){const materials=new Set();group.traverse(n=>{if(n.isMesh)for(const m of Array.isArray(n.material)?n.material:[n.material]){if(m.emissive&&!m.userData.originalEmissive)m.userData.originalEmissive=m.emissive.clone();materials.add(m);}});return [...materials];}
function equippedWeaponName(){return hero?.userData.armoryWeaponId?blueprint(hero.userData.armoryWeaponId).name:characterStats.weaponName;}
function flashMaterials(entity,amount,tint=0xffdf9f){
  if(entity!==player&&entity.lastFlashMaterials===entity.materials&&entity.lastFlashAmount===amount&&entity.lastFlashTint===tint)return;
  entity.lastFlashMaterials=entity.materials;
  entity.lastFlashAmount=amount;entity.lastFlashTint=tint;
  for(const m of entity.materials||[]){if(!m.emissive)continue;const base=m.userData.originalEmissive||cachedColor(0);m.emissive.copy(base).lerp(cachedColor(tint),amount);}
}
function randomBetween(a,b){return a+Math.random()*(b-a);}
function nearbyObjects(x,z,r,options){return world.nearObjects?.(x,z,r,options)||world.objects.filter(o=>options?.includeDead||!o.dead);}
// Street props include heads, signs and eaves outside their navigation box.
// Use the same conservative margin as surface queries, then cast real pieces.
function segmentObjects(from,to,radius=0){return nearbyObjects((from.x+to.x)/2,(from.z+to.z)/2,Math.hypot(to.x-from.x,to.z-from.z)/2+radius+2);}
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
  const height=entity.beast?2.2:entity.w!==undefined?Math.min(entity.h,player.y+4):entity.height||entity.h||5.1;
  const anchor=entity.beast?entity.mesh.userData.feet().sort((a,b)=>Math.hypot(a.x-player.x,a.z-player.z)-Math.hypot(b.x-player.x,b.z-player.z))[0]:entity.w!==undefined&&entity.h>6?nearestPoint(player.x,player.z,entity):entity;
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
function removeEffect(mesh){
  const trail=weaponTrailRecords.get(mesh);
  if(trail){
    if(trail.active){trail.active=false;mesh.visible=false;freeWeaponTrails.push(trail);}
    return;
  }
  scene.remove(mesh);mesh.geometry.dispose();mesh.material.dispose();
}
function weaponTrail(a,b,width=.3,tint=0xffc473,physical=characterStats.weaponTier<2){
  if(a.distanceToSquared(b)<.00001)return;
  const trailLimit=settings.quality==='low'?24:48;
  while(arcs.length>=trailLimit)removeEffect(arcs.shift().mesh);
  // Reuse the same bounded GPU buffers/materials across hits and world resets.
  // A crowded spin must not allocate and dispose a ribbon on every contact.
  let trail=freeWeaponTrails.pop();
  if(!trail){
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(18),3).setUsage(THREE.DynamicDrawUsage));
    const material=new THREE.MeshBasicMaterial({transparent:true,side:THREE.DoubleSide,depthWrite:false});
    const mesh=new THREE.Mesh(geometry,material);mesh.frustumCulled=false;
    trail={mesh,active:false,life:0,max:0,opacity:0};weaponTrailRecords.set(mesh,trail);scene.add(mesh);
  }
  // A camera-facing ribbon has width even on a vertical overhead stroke.
  // Offsetting only along world Y collapses that stroke into a zero-area line.
  const side=trailSide.subVectors(b,a).cross(trailCamera.subVectors(camera.userData?.effectPosition??camera.position,a));
  if(side.lengthSq()<1e-8)side.set(1,0,0);side.normalize().multiplyScalar(width);
  const {mesh}=trail,positions=mesh.geometry.attributes.position;
  positions.setXYZ(0,a.x-side.x,a.y-side.y,a.z-side.z);
  positions.setXYZ(1,a.x+side.x,a.y+side.y,a.z+side.z);
  positions.setXYZ(2,b.x+side.x,b.y+side.y,b.z+side.z);
  positions.setXYZ(3,a.x-side.x,a.y-side.y,a.z-side.z);
  positions.setXYZ(4,b.x+side.x,b.y+side.y,b.z+side.z);
  positions.setXYZ(5,b.x-side.x,b.y-side.y,b.z-side.z);positions.needsUpdate=true;
  trail.active=true;trail.life=trail.max=physical?.13:.16;trail.opacity=physical?.28:.7;
  mesh.material.color.setHex(tint);mesh.material.opacity=trail.opacity;
  mesh.material.blending=physical?THREE.NormalBlending:THREE.AdditiveBlending;mesh.visible=true;arcs.push(trail);
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
function resetWorld(keepUpgrades=false,startLevel=1,reusePreparedWorld=false){
  armoryEffects.clear();
  mountRide?.reset(hero);mountWeapons?.reset();
  levelStorm?.reset();
  groundScars?.reset();
  if(!keepUpgrades){round=1;sector=1;upgradeQueue=[];upgradeFeedback='';}
  kick=null;kickCooldown=0;movingVehicles.clear();vehicleNavTimer=0;
  punch=null;punchSequence=0;throwLock=null;throwPreviewTargets=[];dashFollowup=0;spinCharge=null;aimPreviewTimer=0;meleeHint=null;meleeHintTargets=[];hero.userData.setUnarmedPose?.(null);
  swingSequences[0]=createSwingSequence();swingSequences[1]=createSwingSequence();landingPose=null;
  upgradePanelOpen=false;upgradeTab='powers';nearbyTargets=[];focusedTarget=null;
  battleOccluders.clear();occlusionTimer=0;heroOccluded=false;comicState=null;lastComicAt=-10;resetHitCombo(combatCombo);if(!keepUpgrades)comboXpCarry=0;
  if(encounter?.entry){finishMiniReveal(encounter);disposeInstance(encounter.leader);beastPortal.reset();}
  for(const e of enemies){clearEncounterShell(e);if(e.telegraph)removeEffect(e.telegraph);disposeInstance(e);}enemies=[];if(boss)releaseBeast();boss=null;
  for(const e of enemyFalls)disposeInstance(e);enemyFalls=[];
  for(const d of drops){scene.remove(d.mesh);disposeModelGeometry(d.mesh);}drops=[];
  for(const b of bolts){scene.remove(b.mesh);b.mesh.geometry.dispose();b.mesh.material.dispose();}bolts=[];
  for(const e of [...rings,...arcs])removeEffect(e.mesh);rings=[];arcs=[];
  if(throwFlight){disposeInstance(throwFlight);throwFlight=null;}
  hammerLightning=0;if(hammerAura){hammerAura.root.visible=false;hammerAura.lastPattern=-1;}
  stance=0;stanceTarget=0;guardHeld=false;guarding=false;guardHits.clear();leap=null;leapCooldown=0;throwWindup=null;throwCooldown=0;landingRecovery=0;hpEchoes=[];aimPreview=null;pointer.active=false;touchThrowAim=null;touchThrowQueued=null;
  hero.userData.setWeaponVisible?.(true);hero.userData.setStance?.(0);if(guardRing)guardRing.visible=false;if(landingMarker)landingMarker.visible=false;
  vehicleEffects?.reset();
  if(!reusePreparedWorld){
    hydrantEffects?.dispose();destruction?.reset();occlusionDepth?.reset();world?.dispose();
    world=createWorld(scene,{seed:activeCity?activeCity.seed+(sector-1)*173:1527+sector*173,round:sector,city:activeCity});
    groundScars?.bind(world);
    for(const o of world.objects){o.materials=prepareMaterials(o.mesh);o.flash=0;o.shudder=0;o.hurtTimer=0;o.baseY=o.mesh.position.y;o.baseRotation=o.mesh.rotation.clone();}
    hydrantEffects=new HydrantEffects(scene);
  }
  const rubbleLimit=settings.quality==='low'?44:settings.quality==='medium'?72:108;
  if(destruction&&destruction.limit!==rubbleLimit){destruction.dispose();destruction=null;}
  destruction??=new DestructionSystem(scene,{audio,quality:settings.quality,nearObjects:(x,z,r)=>world.nearObjects(x,z,r),onDust:(point,size)=>impactClouds?.emit(point.x,point.y??1,point.z,{x:0,z:1},size,false)});
  pristineMenuWorld=!gameReady;
  scene.background.setHex(activeCity?.sky??0x223c40);scene.fog.color.setHex(activeCity?.sky??0x344c4c);
  if(!vehicleEffects||vehicleEffects.disposed)vehicleEffects=new VehicleEffects(scene,document,{onExplode:explodeVehicle,onBlink:(car,amount)=>flashMaterials(car,amount)});
  player.x=0;player.z=0;player.y=0;player.vy=0;player.vx=0;player.vz=0;player.invincible=2;player.hurtAgo=100;
  if(!keepUpgrades){round=1;elapsed=0;kills=0;relics=0;character=createCharacterProgression(startLevel);level=character.level;xp=character.xp;xpTarget=xpForNextLevel(level);score=0;levels={power:0,size:0,range:0,speed:0,vitality:0,quake:0,kick:0};forgeReadyAnnounced=false;checkpointTimer=0;}
  stats=calculateStats(levels);player.maxHp=stats.maxHp;player.hp=stats.maxHp;
  roundTime=0;currentDistrict='';bossSpawned=false;bossGate=0;encounter=null;encounterRetry=0;battleKills=0;beginWave(round);spawnCounter=0;lootCounter=0;chargeHeld=false;chargeStarted=false;charge=0;swing=null;attackBuffer=null;spin=null;spinRecovery=null;holdElapsed=0;hitStop=0;attackCooldown=0;dashCooldown=0;dashTime=0;
  $('bossHud').hidden=true;fragments?.clear();impactClouds?.clear();numbers=[];cameraTarget.set(0,.6,0);
  hero.position.set(0,0,0);facing={x:-.585491,z:-.810679};hero.rotation.y=Math.atan2(facing.x,facing.z);
  applyStats();stance=stanceTarget=characterStats.hasShield?0:1;hero.userData.setStance?.(stance);poseHero(0);player.hp=player.maxHp;renderUpgradePanel();updateHUD(true);
}
function startGame(startLevel=1,options={}){
  garage=restoreGarage(read('ironfall.character',null)?.garage);activeStartingLevel=Number.isFinite(startLevel)?clamp(Math.floor(startLevel),1,MAX_CHARACTER_LEVEL):1;
  const requested=typeof startLevel==='number'?startLevel:1;
  activeCity=options.city??null;testRun=!!options.test||requested>1;audio.unlock().then(()=>audio.play('start'));
  // The menu already rendered this untouched arena and its GPU resources.
  // Rebuilding it on the first click discards that warmup and stalls play.
  const reusePreparedWorld=pristineMenuWorld&&phase==='menu'&&world?.city===activeCity&&sector===1;
  resetWorld(false,requested,reusePreparedWorld);
  if(options.resume){
    const stored=read('ironfall.character',null),restored=restoreCharacterProgression(stored?.character);
    if(restored){character=restored;for(const key of Object.keys(levels))levels[key]=clamp(Math.floor(Number(stored.levels?.[key])||0),0,30);applyStats();stance=stanceTarget=characterStats.hasShield?0:1;hero.userData.setStance?.(stance);poseHero(0);player.hp=player.maxHp;renderUpgradePanel();}
  }
  setPhase('playing');persistCharacter();
  announce(testRun?'ΔΟΚΙΜΗ · ΕΠΙΠΕΔΟ '+level:options.resume?'Η ΕΞΕΛΙΞΗ ΣΟΥ ΣΥΝΕΧΙΖΕΤΑΙ':'ΑΠΟ ΞΥΛΟ ΣΕ ΚΑΤΑΙΓΙΔΑ',
    testRun?characterStats.weaponName+' · Πλήρης εξοπλισμός αυτού του σταδίου.':characterStats.weaponTier===0?'Μάζεψε ξύλο και μέταλλο. Κατασκεύασε καλύτερο όπλο στις Αναβαθμίσεις.':characterStats.weaponName+' · Μάζεψε υλικά για την επόμενη κατασκευή.',4.3);
}
function persistCharacter(){
  if(!gameReady||testRun||phase==='menu'||phase==='settings'&&previousPhase==='menu')return;
  const saved=save('ironfall.character',{character,levels,garage});updateSavedCharacter();return saved;
}
function updateSavedCharacter(){
  const stored=restoreCharacterProgression(read('ironfall.character',null)?.character),button=$('resumeCharacterButton');
  forgeMenu?.updateProgress(stored);
  if(button){button.hidden=false;button.disabled=!stored||!gameReady;}
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
  playerCustomization=playerCustomStats(garage,{hasShield:characterStats.hasShield});stats.power*=playerCustomization.power;stats.speed*=playerCustomization.speed;stats.maxHp+=playerCustomization.hp;
  const selected=resolveArmory(garage.armory,characterStats.weaponTier),weaponActive=garage.armory.weapon!=='auto'&&armoryAvailable(selected.weapon,characterStats.weaponTier),shieldActive=garage.armory.shield!=='auto'&&armoryAvailable(selected.shield,characterStats.weaponTier);
  armoryWeaponStats=weaponActive?armoryStats(garage.armory,selected.weapon):null;armoryShieldStats=shieldActive?armoryStats(garage.armory,selected.shield):null;
  armoryVolumes=weaponActive?armoryHeadVolumes(selected.weapon,Object.fromEntries(Object.entries(garage.armory.items[selected.weapon].parts).map(([k,v])=>[k,v.selected]))):null;
  if(armoryWeaponStats){const family=blueprint(selected.weapon).family,reach=family==='club'?2.65:family==='hammer'?2.15:3.65;stats.power*=armoryWeaponStats.power;stats.range*=reach/characterStats.range*armoryWeaponStats.reach;stats.maxHp+=armoryWeaponStats.hp;}
  if(armoryShieldStats){stats.maxHp+=armoryShieldStats.hp;stats.speed*=armoryShieldStats.speed;}
  player.maxHp=stats.maxHp;player.hp=Math.min(player.hp,player.maxHp);syncCharacterModel();
  mountRide?.sync(garage,level);applyArmoryCustomization(hero,garage);applyPlayerCustomization(hero,garage);player.materials=ownedMaterials(hero);hammerMaterials=ownedMaterials(hero.userData.hammerPivot);if(mountRide?.active){if(world&&!mountRide.clear(world,mountRide.body.x,mountRide.body.z,mountRide.body.y,mountRide.yaw)){mountRide.dismount(player,hero);toast('ΝΕΟΣ ΕΞΟΠΛΙΣΜΟΣ','Μετακινήσου σε ανοικτό χώρο για επιβίβαση.');}else{mountRide.pose(hero);hero.userData.updateGrip();}}
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
    levelStorm?.enqueue(result.fromLevel,result.level);
    const message='ΟΛΕΣ ΟΙ ΕΝΕΡΓΕΙΕΣ ↑ · +'+(result.levelsGained*8)+' ΜΕΓΙΣΤΗ ΖΩΗ';
    upgradeFeedback='LV '+level+' · '+message;toast('ΕΠΙΠΕΔΟ '+level,message,'#9de3cb');persistCharacter();
  }
  renderCharacterProgress();
}
function levelUpStrike(strike){
  audio.play('levelStorm',.8);
  const {x,y,z,level:earnedLevel}=strike,spec=stormStats(earnedLevel,stats.power),radius=spec.radius;
  groundScars.add(strike,radius);
  const falloff=d=>1-.55*clamp(d/radius,0,1),launch=kickStats(earnedLevel,levels.kick);
  for(const e of [...enemies,...(boss&&!boss.dead?[boss]:[])]){
    if(e.dead)continue;const d=Math.hypot(e.x-x,e.z-z,(e.y||0)+Math.min(.8,(e.height||1)/2)-y)-(e.radius||0);
    if(d>=radius)continue;const dir=normalize(e.x-x,e.z-z),damage=Math.round(spec.damage*falloff(d));
    if(e===boss){hitBoss(damage,dir,.6,{weapon:'level-storm',interrupt:false,stagger:0});continue;}
    const speed=kickVelocity(e,launch)*.8;e.vx=dir.x*speed;e.vz=dir.z*speed;e.kickFlight=makeKickFlight({level:earnedLevel,damage});
    hitEnemy(e,damage,dir,8,0,null,{preserveVelocity:true,stagger:.4,weapon:'level-storm',combo:false,fear:false});
  }
  for(const o of nearbyObjects(x,z,radius+2)){
    if(o.dead||o.exploding)continue;const point=nearestPoint(x,z,o),base=o.baseY||0;point.y=clamp(y,base,base+o.h);
    const d=Math.hypot(point.x-x,point.z-z,point.y-y);if(d>=radius)continue;
    hurtObject(o,Math.round(spec.damage*.8*falloff(d)),.25,point,'level-storm');
    if(isVehicle(o)&&!o.dead){const dir=normalize(o.x-x,o.z-z),speed=kickVelocity(o,launch)*.35;o.vx=dir.x*speed;o.vz=dir.z*speed;o.kickFlight=makeKickFlight({level:earnedLevel,damage:spec.damage});o.kickFlight.life=5;movingVehicles.add(o);}
  }
  shake=Math.max(shake,.18);checkGoal();
}
function renderCharacterProgress(){
  const progress=level>=MAX_CHARACTER_LEVEL?1:xp/Math.max(1,xpTarget),status=getForgeStatus(character),busy=weaponBusy()||!!swing||!!spin;
  if($('characterHudLevel'))$('characterHudLevel').textContent='LV '+level+(testRun?' · ΔΟΚΙΜΗ':'');
  if($('characterHudWeapon'))$('characterHudWeapon').textContent=equippedWeaponName();
  for(const id of ['characterXpFill','forgeXpFill'])if($(id))$(id).style.width=Math.min(100,progress*100)+'%';
  if($('characterXpText'))$('characterXpText').textContent=level>=MAX_CHARACTER_LEVEL?'ΜΕΓΙΣΤΟ ΕΠΙΠΕΔΟ':xp+' / '+xpTarget+' XP';
  if($('equippedWeapon'))$('equippedWeapon').textContent=equippedWeaponName();
  if($('permanentStats'))$('permanentStats').textContent='LV '+level+': +'+characterStats.levelDamageBonus+' ζημιά · +'+characterStats.levelHealthBonus+' HP · +'+Math.round((characterStats.forceScale-1)*100)+'% ώθηση · +'+Math.round((characterStats.mobilityScale-1)*100)+'% κίνηση/άλμα · '+Math.round((1-characterStats.cooldownScale)*100)+'% λιγότερη αναμονή';
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
  resetAttackChain();forgeReadyAnnounced=false;applyStats();persistCharacter();renderUpgradePanel();
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
  $('upgradesToggle').setAttribute('aria-label','Αναβαθμίσεις'+(touchLayout?'':' · Q')+' · '+upgradeQueue.length+' διαθέσιμες επιλογές');
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
function manualAttackDirection(){
  if(pointer.active)return {...aim};
  if(touch.aimX||touch.aimY)return screenMovement(touch.aimX,touch.aimY);
  if(mountRide?.active)return {x:Math.sin(mountRide.yaw),z:Math.cos(mountRide.yaw)};
  const move=movementDirection();return move.x||move.z?move:{...facing};
}
function weaponPoseRotation(){const q=hero.userData.weaponRig.quaternion.clone();return mountRide?.active?q.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),-mountedAimYaw)):q;}
function beginSwing(){
  if(phase!=='playing'||!chargeStarted||spin||attackCooldown>0||weaponBusy()||guarding)return;
  updateAim(false);const move=movementDirection();
  facing=manualAttackDirection();spinCharge=null;
  if(!mountRide?.active)hero.rotation.y=Math.atan2(facing.x,facing.z);
  const q=charge,details=attackStats(stats,q);
  const twoHanded=!mountRide?.active&&stance>.9,comboIndex=twoHanded?1:0;
  const variant=selectHammerSwing(swingSequences[comboIndex],{twoHanded,moving:!!(move.x||move.z)});
  swing={time:0,q,...details,twoHanded,variant,duration:(getHammerSwingDuration(variant)+q*.10)/(armoryWeaponStats?.handling||1),damage:Math.round(details.damage*stancePower()),fx:facing.x,fz:facing.z,hit:false,hits:new Set(),blocked:false,fromRotation:weaponPoseRotation(),fromPosition:hero.userData.weaponRig.position.clone()};
  if(dashFollowup>0){swing.damage=Math.round(swing.damage*1.25);swing.dashBoost=true;dashFollowup=0;}
  swing.fromBody=hero.userData.body.rotation.clone();swing.fromBodyY=hero.userData.body.position.y;
  chargeStarted=false;charge=0;spinRecovery=null;attackCooldown=swing.duration+.012;audio.play('swing',q,{variant,duration:swing.duration,weapon:characterStats.weaponTier<2?'wood':'metal',exert:true});
  hero.updateMatrixWorld(true);hero.userData.hammerHead.getWorldPosition(headPrevious);rememberBarbedSegment(swing);
}
function beginPunch(){
  if(phase!=='playing'||!throwFlight||punch||kick||throwWindup||attackCooldown>0||guardHeld||dashTime>0)return false;
  updateAim(false);const dir=manualAttackDirection();
  facing={...dir};if(!mountRide?.active)hero.rotation.y=Math.atan2(dir.x,dir.z);
  const spec=punchStats(level,levels.power,punchSequence++);spec.damage=Math.round(spec.damage*playerCustomization.power);
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
  if(mountRide?.active){spinCharge=null;return false;}
  if(spin)return true;
  if(phase!=='playing'||swing||weaponBusy()||guardHeld||!spinCharge||spinCharge.life<=0)return false;
  const rig=hero.userData.weaponRig;
  hero.updateMatrixWorld(true);const entryHead=hero.worldToLocal(hero.userData.hammerHead.getWorldPosition(new THREE.Vector3()));
  spin={startLocalAzimuth:Math.atan2(entryHead.x,entryHead.z),entryYawOffset:0,time:0,angle:hero.rotation.y,rotation:0,cycle:0,momentum:1,hitTimes:new Map(),hitAngles:new Map(),touching:new Set(),entryHits:new Set(previousHits||spinCharge.hits),attackDir:{...facing},trailTime:0,soundTime:-1,recoil:0,
    damage:Math.round(stats.power*SPIN_DAMAGE_SCALE*stancePower()),knockback:4.6,lift:1.1,
    fromRotation:weaponPoseRotation(),fromPosition:rig.position.clone(),fromBody:hero.userData.body.rotation.clone(),fromBodyY:hero.userData.body.position.y};
  spinCharge=null;spinRecovery=null;chargeStarted=false;charge=0;attackBuffer=null;attackCooldown=0;guarding=false;
  hero.updateMatrixWorld(true);hero.userData.hammerHead.getWorldPosition(headPrevious);rememberBarbedSegment(spin);audio.play('swing',.3,{weapon:characterStats.weaponTier<2?'wood':'metal',exert:false});return true;
}
function stopSpin(exhausted=false){
  if(!spin)return;
  resetAttackChain();
  const rig=hero.userData.weaponRig;
  spinRecovery={time:0,fromRotation:weaponPoseRotation(),fromPosition:rig.position.clone()};
  facing=pointer.active?{...aim}:touch.aimX||touch.aimY?screenMovement(touch.aimX,touch.aimY):{...spin.attackDir};
  spinCharge=null;if(exhausted)attackCooldown=Math.max(attackCooldown,.14);
  hero.rotation.y=Math.atan2(facing.x,facing.z);spin=null;
  if(chargeRing)chargeRing.visible=false;
}
function readBarbedSegment(state){
  const segment=state.barbedCurrent??={start:new THREE.Vector3(),end:new THREE.Vector3(),active:false,radius:0};
  segment.active=!!hero.userData.getBarbedContactSegment?.(segment.start,segment.end);
  segment.radius=segment.active?(hero.userData.getBarbedContactRadius?.()||0):0;
  return segment;
}
function rememberBarbedSegment(state){
  if(!state)return;
  const current=readBarbedSegment(state);
  const previous=state.barbedPrevious??={start:new THREE.Vector3(),end:new THREE.Vector3(),active:false};
  previous.start.copy(current.start);previous.end.copy(current.end);previous.active=current.active;
}
function wireContact(state,current,target){
  if(!current.active||!current.radius)return null;
  return sweptBarbedContact(state.barbedPrevious?.active?state.barbedPrevious:current,current,target,current.radius);
}
function hitBarbedTarget(target,source,contact){
  const dir=barbedPullDirection(player,target,contact.motion);
  const damage=Math.max(1,Math.round(source.damage*BARBED_DAMAGE_SCALE));
  const response={weapon:'barbed',reaction:'slash',grounded:true,stagger:.24,maxImpulse:barbedPullLimit(player,target,dir)};
  if(target===boss)hitBoss(damage,dir,BARBED_PULL_FORCE,response);
  else hitEnemy(target,damage,dir,BARBED_PULL_FORCE,0,contact,response);
  // Two short steel-colored cuts mark the true contact, including a lethal
  // strike. They use the existing bounded trail pool, not an attached tether.
  const motion=contact.motion&&(contact.motion.x||contact.motion.z)?normalize(contact.motion.x,contact.motion.z):dir;
  const y=contact.y??((target.y||0)+Math.min(1.1,target.height||1));
  for(const offset of [-.09,.09]){
    const a=new THREE.Vector3(contact.x-motion.x*.3,y+offset-.08,contact.z-motion.z*.3);
    const b=new THREE.Vector3(contact.x+motion.x*.3,y+offset+.08,contact.z+motion.z*.3);
    weaponTrail(a,b,.045,0xd7eee0,false);
  }
}
// Explicit catalog equipment uses its authored material volumes, never a solid
// bounding ball across the ring hole. Classic saves retain their existing path.
function catalogHeadHits(from,to,targets){return sweepArmoryHead(armoryVolumes,hero.userData.hammerHead.matrixWorld,from,to,targets,firstHammerHit,{maxContacts:armoryWeaponStats.maxContacts,blueprintId:hero.userData.armoryWeaponId});}
function armoryImpact(s,from,to,spinning){
 const objects=nearbyObjects(player.x,player.z,stats.range+stats.size+2).filter(o=>spinning||!s.hits.has(o));
 const walls=catalogHeadHits(from,to,objects),wall=walls[0],grip=hero.userData.hammerPivot.getWorldPosition(new THREE.Vector3());
 const touching=new Set();let hits=0,breaks=0;
 s.materialHits??=new Map();s.coreHits??=new Set();
 for(const target of [...enemies,...(boss&&!boss.dead?[boss]:[]),...(wall?[wall.target]:[])]){
  if(target.dead||target.exploding||!spinning&&s.hits.has(target))continue;
  if(!spinning&&(target.x-player.x)*s.fx+(target.z-player.z)*s.fz<0)continue;
  let contacts=target===wall?.target?walls.filter(c=>c.target===target):catalogHeadHits(from,to,[target]);
  contacts=contacts.filter(c=>(!wall||target===wall.target||c.t<=wall.t)&&!firstHammerHit(grip,c,objects.filter(o=>o!==target),.015));
  if(!contacts.length)continue;touching.add(target);
  if(spinning){if(!eligibleSpinContact(s,target))continue;renewSpinMomentum(s,target);s.materialHits.delete(target);s.coreHits.delete(target);}
  const used=s.materialHits.get(target)||new Set(),dir=normalize(target.x-player.x,target.z-player.z);
  for(const contact of contacts){
   if(target.dead||used.has(contact.armoryPart)||used.size>=armoryWeaponStats.maxContacts||used.has('bridge')||contact.armoryPart==='bridge'&&used.size>0)continue;
   used.add(contact.armoryPart);const damage=Math.max(1,Math.round(s.damage*contact.damageScale)),force=s.knockback*contact.forceScale*armoryWeaponStats.force;
   if(target===boss)hitBoss(damage,dir,force,{weapon:'armory'});
   else if(target.w!==undefined){if(hurtObject(target,damage,s.q||.15,contact,'armory'))breaks++;}
   else hitEnemy(target,damage,dir,force,s.lift,contact,{weapon:'armory'});
   if(!s.coreHits.has(target)){s.coreHits.add(target);armoryEffects.hit(target,armoryWeaponStats,damage,contact);}hits++;
  }
  s.materialHits.set(target,used);
  if(!spinning&&(used.size>=armoryWeaponStats.maxContacts||used.has('bridge')||target.dead))s.hits.add(target);
 }
 if(spinning){for(const target of s.entryHits)if(target.dead||!touching.has(target))s.entryHits.delete(target);for(const target of s.touching)if(target.dead||!touching.has(target))s.touching.delete(target);}
 else if(wall&&!wall.target.dead){s.blocked=true;s.blockTime=s.time;s.blockRotation=weaponPoseRotation();s.blockPosition=hero.userData.weaponRig.position.clone();s.blockPose=sampleHammerSwing(s.time/s.duration,{twoHanded:s.twoHanded,charge:s.q,variant:s.variant});attackCooldown=Math.min(attackCooldown,.125);}
 if(hits){s.hit=true;shake=Math.max(shake,breaks?.10:.065);if(!spinning){if(chargeHeld)spinCharge={life:.45,hits:s.hits};if(!s.feedbackDone){s.feedbackDone=true;s.contactTime=s.time;hitStop=.022+(s.q||0)*.006;}}checkGoal();}
}
const armoryEffects=new ArmoryEffects({
 targets:()=>[...enemies,...(boss&&!boss.dead?[boss]:[])],
 blocked:(from,to,target)=>{const h=firstHammerHit(from,to,segmentObjects(from,to,.02),.02);return !!h&&h.target!==target;},
 damage:(t,n,p,core)=>{const dir=normalize(t.x-player.x,t.z-player.z),response={weapon:'core-'+core,combo:false,interrupt:false,fear:false,grounded:true,preserveVelocity:true,stagger:0};if(t===boss)hitBoss(n,dir,0,response);else if(t.w!==undefined)hurtObject(t,n,0,p,'core-'+core);else hitEnemy(t,n,dir,0,0,p,response);},
 visual:(core,a,b)=>{if(core==='arc'&&a!==b){const mid=new THREE.Vector3((a.x+b.x)/2+.12,(a.y+b.y)/2+.18,(a.z+b.z)/2-.12);weaponTrail(new THREE.Vector3(a.x,a.y,a.z),mid,.045,0x72e5ff,false);weaponTrail(mid,new THREE.Vector3(b.x,b.y,b.z),.045,0x72e5ff,false);}else fragments.add(a.x,a.y,a.z,core==='fire'?3:4,core==='fire'?[0xffae39,0xe76025]:core==='frost'?[0x98dfff,0xd6ffff]:core==='arc'?[0x72e5ff]:[0xffdc83],core==='impact'?4:1.5,.045);}
});
function spinImpact(from,to){
  const s=spin;if(!s)return;
  if(armoryVolumes){armoryImpact(s,from,to,true);return;}
  const radius=hero.userData.getHeadContactRadius?.()||.52*stats.size,shaftRadius=hero.userData.getShaftContactRadius?.()||.15;
  const grip=hero.userData.hammerPivot.getWorldPosition(new THREE.Vector3());
  // A struck wall remains an occluder for the entire turn. Targets are eligible
  // again only after a full revolution, including across the angle wrap.
  const objects=nearbyObjects(player.x,player.z,stats.range+stats.size+2);
  const headWall=firstHammerHit(from,to,objects,radius),shaftWall=firstHammerHit(grip,to,objects,shaftRadius);
  const wall=shaftWall||headWall;
  const barbed=readBarbedSegment(s);
  // Contact exit AND an actual full revolution are required. A large wall
  // containing the shaft cannot generate energy just because time passed.
  const touching=new Set();
  const contactTarget=target=>{touching.add(target);return eligibleSpinContact(s,target);};
  let hits=0,breaks=0;
  for(const e of [...enemies,...(boss&&!boss.dead?[boss]:[])]){
    if(e.dead||Math.hypot(e.x-player.x,e.z-player.z)>stats.range+stats.size+(e.radius||1)+2)continue;
    let headContact=firstHammerHit(from,to,[e],radius);
    const shaftContact=characterStats.weaponTier>=2?wireContact(s,barbed,e):firstHammerHit(grip,to,[e],shaftRadius);
    if(headWall&&headContact&&headContact.t>headWall.t)headContact=null;
    if(!headContact&&!shaftContact)continue;
    const contact=headContact||shaftContact;
    const contactRadius=!headContact&&characterStats.weaponTier>=2?barbed.radius:shaftRadius;
    if(firstHammerHit(grip,contact,objects,contactRadius))continue;
    if(!contactTarget(e))continue;
    renewSpinMomentum(s,e);hits++;
    const dir=normalize(e.x-player.x,e.z-player.z);
    if(!headContact&&characterStats.weaponTier>=2)hitBarbedTarget(e,s,contact);
    else if(e===boss)hitBoss(s.damage,dir,s.knockback);else hitEnemy(e,s.damage,dir,s.knockback,s.lift,contact);
  }
  if(wall&&contactTarget(wall.target)){
    renewSpinMomentum(s,wall.target);hits++;
    if(hurtObject(wall.target,s.damage,.15,wall))breaks++;else s.recoil=1;
  }
  for(const target of s.entryHits)if(target.dead||!touching.has(target))s.entryHits.delete(target);
  for(const target of s.touching)if(target.dead||!touching.has(target))s.touching.delete(target);
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
  if(e.encounterLeader){
    const front=-(dir?.x||0)*Math.sin(e.facingYaw||0)-(dir?.z||0)*Math.cos(e.facingYaw||0);
    if(e.type==='siegeTransformer'&&e.fold>.7&&front>.38)damage=Math.max(1,Math.round(damage*.52));
    if(e.type==='hollowMarshal'&&encounter?.leader===e&&encounter.escorts.size)damage=Math.max(1,Math.round(damage*.68));
    response={...response,interrupt:false,grounded:true,preserveVelocity:false,maxImpulse:.25,stagger:0};
  }
  damage=followupDamage(e,damage,response.weapon);
  if(response.combo!==false)recordCombatContact(e);
  const force=clamp(Number.isFinite(strength)?strength:0,0,18);
  const mass=bodyMass(e);
  let direction=normalize(dir?.x||0,dir?.z||0);
  if(!direction.x&&!direction.z)direction=normalize(e.x-player.x,e.z-player.z);
  if(!direction.x&&!direction.z)direction={x:0,z:1};
  const duration=.40+Math.min(force/18,1)*.08;
  const growth=['explosion','body','masonry'].includes(response.weapon)?1:characterStats.forceScale;
  const impulse=Math.min(Math.min(force*1.05,6.4)*growth/mass**.75,Number.isFinite(response.maxImpulse)?Math.max(0,response.maxImpulse):Infinity);
  e.facingYaw??=e.mesh.rotation.y;
  e.impact={time:0,duration,dirX:direction.x,dirZ:direction.z,mass,reaction:response.reaction||'blunt',
    amplitude:(.38+Math.min(force/18,1)*.13)/mass**.35,bounced:false,
    axis:new THREE.Vector3(direction.z,response.reaction==='slash'?.25:0,-direction.x).normalize(),rotation:new THREE.Quaternion(),fromRotation:e.mesh.quaternion.clone()};
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
    e.vy=force>0&&!response.grounded?clamp((Number.isFinite(lift)?lift:0)*1.12+.15,2.2,4.1)/Math.sqrt(mass):Math.min(e.vy||0,0);
    e.kickFlight=null;
  }
  e.hurtTimer=2.4;
  if(response.interrupt!==false){const interrupted=interruptEnemyAttack(e,(response.stagger??duration)+.18);if(interrupted)removeEffect(interrupted);}
  applyEnemyFlash(e.materials,1);
  impactClouds?.emit(hitPoint.x,hitPoint.y,hitPoint.z,direction,Math.min(1.5,e.radius*1.6),!['explosion','level-storm'].includes(response.weapon));
  if(response.fear!==false)frightenNearby(e.x,e.z,.55+characterStats.weaponTier*.2,3.6+characterStats.weaponTier*.35,e);
  showHitPoints(e,damage);
  audio.play('hit',Math.min(1,damage/100),{material:impactMaterial(e),weapon:response.weapon||(characterStats.weaponTier<2?'wood':'metal')});
  audio.play('enemyHurt',Math.min(1,damage/100),{type:e.type,fatal:e.hp<=0});
  fragments.add(hitPoint.x,hitPoint.y,hitPoint.z,8,e.palette==='organic'?[0x8fbea2,0xb6d5b4,0x83ceaa]:[0xffc271,0xf9e5b1,0x7eacb9],4,.07);
  if(e.hp<=0)killEnemy(e);
}
function killEnemy(e){
  if(e.dead)return;
  e.dead=true;guardHits.delete(e);enemies=enemies.filter(n=>n!==e);kills++;battleKills++;score+=Math.round((e.miniBoss?420:25*(e.xp||1))*comboMultiplier(combatCombo));
  if(e.waveNumber===wave?.number)wave.defeated++;
  if(e.encounterEscort)encounter?.escorts.delete(e);
  clearEncounterShell(e);
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
  if(e.encounterLeader)for(const [x,z,kind] of [[-1,0,'scrap'],[1,0,'scrap'],[0,1,'crystal'],[0,-1,'gold']])spawnDrop(e.x+x,e.z+z,kind);
  if(e.encounterEscort)spawnDrop(e.x+.28,e.z-.22,'gold');
  if(Math.random()<.16)spawnDrop(e.x,e.z,player.hp<player.maxHp*.7&&Math.random()<.65?'heart':'gold');
}
function explodeVehicle(car){
  if(car.dead||car.explosionComplete)return;
  car.exploding=false;car.explosionComplete=true;
  const x=car.x,z=car.z,radius=VEHICLE_BLAST_RADIUS,falloff=d=>1-.65*clamp(d/radius,0,1);
  hurtObject(car,1,0,{x,y:.5,z},'explosion');
  pulse(x,z,radius,0xff783d,.5);shake=Math.max(shake,.25);
  fragments.add(x,.45,z,24,[0xffb34c,0xff682d,0xffe6a2],7,.14);
  for(const o of nearbyObjects(x,z,radius+2)){
    if(o===car||o.dead||o.exploding)continue;
    const p=nearestPoint(x,z,o),d=Math.hypot(p.x-x,p.z-z);
    if(d<radius)hurtObject(o,Math.round(180*falloff(d)),0,{x:p.x,y:.7,z:p.z},'explosion');
  }
  for(const e of [...enemies,...(boss&&!boss.dead?[boss]:[])]){
    if(e.dead)continue;const d=Math.hypot(e.x-x,e.z-z,(e.y||0)+Math.min(.8,(e.height||1)/2)-.5)-(e.radius||0);
    if(d>=radius)continue;const dir=normalize(e.x-x,e.z-z),damage=Math.round(180*falloff(d));
    if(e===boss)hitBoss(damage,dir,7,{weapon:'explosion'});else hitEnemy(e,damage,dir,7,2,null,{weapon:'explosion'});
  }
  const d=Math.hypot(player.x-x,player.z-z,player.y+.8-.5);
  if(d<radius){const dir=normalize(player.x-x,player.z-z);hurtPlayer(Math.round(55*falloff(d)),dir.x,dir.z,false);}
}
function hurtObject(o,damage,q=0,impactPoint=null,weapon=null){
  if(o.dead||o.exploding||!Number.isFinite(damage)||damage<=0)return false;
  if(o.type==='hydrant'&&!o.ruptured){
    o.ruptured=true;o.hp=Math.max(o.maxHp*.5,o.hp-damage);o.flash=.15;o.shudder=.22;
    hydrantEffects.activate(o);flashMaterials(o,.85);audio.play('hit',.65,{material:'metal'});showHitPoints(o,damage);return true;
  }
  o.hp-=damage;o.flash=.15;o.shudder=.22;flashMaterials(o,.85);showHitPoints(o,damage);
  if(isExplosiveProp(o)&&o.hp<=0&&!o.explosionComplete){
    o.exploding=true;vehicleEffects.arm(o);
    floatText(o.x,o.h+1,o.z,'ΕΚΡΗΞΗ — ΦΥΓΕ!','#ff915d',17);audio.play(isVehicle(o)?'carAlarm':'charge',.75);return false;
  }
  const nearest=impactPoint||nearestPoint(player.x,player.z,o),contact={x:nearest.x,y:nearest.y??Math.min(player.y+1,o.h),z:nearest.z};
  const fracture=destruction?.hit(o,contact,player);
  vehicleEffects?.damage(o);
  if(!fracture)audio.play(o.hp<=0?'break':'hit',Math.max(q,Math.min(1,damage/120)),{material:impactMaterial(o),weapon:weapon||(characterStats.weaponTier<2?'wood':'metal')});
  impactClouds?.emit(contact.x,contact.y,contact.z,normalize(contact.x-player.x,contact.z-player.z),o.isBuilding?1:.7,!['explosion','level-storm'].includes(weapon));
  if(o.hp>0){fragments.add(o.x+randomBetween(-o.w/2,o.w/2),.7,o.z+randomBetween(-o.d/2,o.d/2),5,[o.color||0x8c9a91,0xf1c588],3,.1);return false;}
  o.dead=true;o.mesh.visible=false;world.invalidateNavigation?.();score+=Math.round(o.weight*80);lootCounter++;
  const palette=o.mesh.userData.fragments||[o.color||0x879893,0xcab596,0x50666a];
  fragments.add(o.x,o.h*.35,o.z,o.weight>2?30:16,palette,5+q*5,o.weight>2?.5:.25,true);
  pulse(o.x,o.z,Math.max(o.w,o.d)*.65,0xbb9f78,.3);
  const point=nearestPoint(player.x,player.z,o),dx=point.x+(player.x-point.x)*.2,dz=point.z+(player.z-point.z)*.2;
  if(lootCounter%4===0||Math.random()<.1)spawnDrop(dx,dz,'relic');
  else if(player.hp<player.maxHp*.85&&Math.random()<.35)spawnDrop(dx,dz,'heart');
  else spawnDrop(dx,dz,'gold');
  gainXP(o.weight>2?3:1);return true;
}
function hitBoss(damage,dir,strength=5,response={}){
  if(!boss||boss.dead||!Number.isFinite(damage)||damage<=0)return;
  const armor=beastDamageScale(boss.state);if(armor===0)return;
  damage*=armor;
  damage=followupDamage(boss,damage,response.weapon);
  if(response.combo!==false)recordCombatContact(boss);audio.play('hit',Math.min(1,damage/120),{material:'metal',weapon:response.weapon||(characterStats.weaponTier<2?'wood':'metal')});audio.play('enemyHurt',.8,{type:'siegeMech',fatal:boss.hp<=damage});
  boss.hp-=damage;boss.flash=.15;boss.stagger=Math.max(boss.stagger,response.stagger??.12);if(!response.preserveVelocity){const impulse=Math.min(strength*.13,Number.isFinite(response.maxImpulse)?Math.max(0,response.maxImpulse):Infinity);boss.vx=dir.x*impulse;boss.vz=dir.z*impulse;}
  boss.impact={time:0,duration:.32,dirX:dir.x,dirZ:dir.z,reaction:response.reaction||'blunt'};
  if(!boss.beast&&response.interrupt!==false&&boss.state!=='enter'){boss.state='recover';boss.timer=Math.max(.32,boss.timer*.35);if(boss.telegraph){removeEffect(boss.telegraph);boss.telegraph=null;}}
  const foot=boss.mesh.userData.feet().sort((a,b)=>Math.hypot(a.x-player.x,a.z-player.z)-Math.hypot(b.x-player.x,b.z-player.z))[0];
  flashMaterials(boss,1);impactClouds?.emit(foot.x,foot.y+1,foot.z,dir,1.8,response.weapon!=='explosion');showHitPoints(boss,damage);fragments.add(foot.x,foot.y+1,foot.z,12,[0xffbe75,0xff7546,0xb7cdd2],5,.1);
  if(boss.hp<=0)defeatBoss();
}
function checkGoal(){
  if(phase!=='playing'||bossSpawned||encounter||encounterRetry>0)return;
  const gate=BOSS_GATES[bossGate],total=battleProgress(destructionPercent(world.objects),battleKills);
  if(total<(gate?.threshold??GOAL))return;
  if(!gate){spawnBoss();return;}
  const stats=enemyStatsForWave(gate.type,round),location=miniPortalLocation(stats.radius);
  if(!location){encounterRetry=.6;return;}
  const leader=spawnEnemy(gate.type,location,{encounterLeader:true,arriving:true});
  if(!leader){encounterRetry=.6;return;}
  leader.tankDelay=2.1;
  encounter={leader,gate,escorts:new Set(),sent:0,timer:.65};
  openMiniPortal(encounter,location);
  announce('ΡΗΓΜΑ · '+gate.name,gate.cue,2.5);
}
function miniPortalLocation(radius){
  const roads=world.layout?.roads||[0],candidates=[];
  for(const x of roads)for(const z of roads){
    const d=Math.hypot(player.x-x,player.z-z);if(d>=11&&d<=37)candidates.push({x,z,d});
  }
  let best=null,score=Infinity;
  for(const p of candidates){
    const dir=normalize(player.x-p.x,player.z-p.z);
    if(!miniPortalExitFree(p,dir,radius)||enemies.some(e=>Math.hypot(e.x-p.x,e.z-p.z)<radius+e.radius))continue;
    // Prefer a clear view down the road from the existing camera direction.
    // A blocked site remains a fallback in a dense or damaged district.
    const top={x:p.x,y:radius+1,z:p.z},eye={x:p.x+cameraOffset.x,y:top.y+cameraOffset.y,z:p.z+cameraOffset.z};
    const occluded=firstHammerHit(top,eye,segmentObjects(top,eye,.3),.3);
    const cameraFace=(dir.x*cameraOffset.x+dir.z*cameraOffset.z)/Math.hypot(cameraOffset.x,cameraOffset.z);
    const rank=Math.abs(p.d-18)+(occluded?25:0)+(1-cameraFace)*4;
    if(rank<score){score=rank;best={x:p.x,z:p.z,nx:dir.x,nz:dir.z,yaw:Math.atan2(dir.x,dir.z)};}
  }
  return best;
}
function miniPortalExitFree(p,dir,radius){
  for(let i=0;i<=5;i++){
    const x=p.x+dir.x*i,z=p.z+dir.z*i;
    if(Math.max(Math.abs(x),Math.abs(z))>BOUNDS-radius||nearbyObjects(x,z,radius+.1).some(o=>circleOverlaps(x,z,radius,o)))return false;
  }
  return true;
}
function openMiniPortal(fight,location){
  const leader=fight.leader,mesh=leader.mesh,original=new Map(),copies=new Map();
  mesh.traverse(n=>{
    if(!n.isMesh)return;
    const m=n.material;original.set(n,m);
    if(!copies.has(m))copies.set(m,m.clone());
    n.material=copies.get(m);
  });
  const reveal=installBeastReveal(mesh,renderer.userData?.backend==='WebGPU');
  const bounds=new THREE.Box3().setFromObject(mesh,true);
  const leading=Math.max(.9,bounds.max.z-mesh.position.z+.45);
  const trailing=Math.max(.9,mesh.position.z-bounds.min.z+.45);
  fight.entry={location,reveal,original,leading,trailing,time:0,stage:'opening'};
  leader.state='enter';mesh.visible=false;
  beastPortal.open(location,mesh.userData.width*1.55,leader.height*1.55);
}
function finishMiniReveal(fight){
  const {reveal,original}=fight.entry;
  reveal.plane.constant=1e6;reveal.sync();
  for(const [node,mat] of original)node.material=mat;
  for(const m of reveal.materials)m.dispose();
  fight.entry=null;
}
function updateMiniEntry(fight,dt){
  const entry=fight.entry,{leader}=fight,{location}=entry,mesh=leader.mesh;
  entry.time+=dt;
  const elapsed=entry.time,progress=clamp((elapsed-MINI_ENTRY.open)/MINI_ENTRY.walk,0,1);
  if(progress<1){
    beastPortal.facePlayer(player,dt);const yaw=beastPortal.root.rotation.y;
    if(Math.abs(yaw-location.yaw)>1e-4){
      const next={x:Math.sin(yaw),z:Math.cos(yaw)};
      // Turn the portal and the visible actor together, within the clear
      // corridor, so tracking the player never turns the walker into a wall.
      if(miniPortalExitFree(location,next,leader.radius))Object.assign(location,{yaw,nx:next.x,nz:next.z});
      else beastPortal.root.rotation.y=location.yaw;
    }
  }
  const offset=lerp(-entry.leading,entry.trailing,progress);
  leader.x=location.x+location.nx*offset;leader.z=location.z+location.nz*offset;
  leader.facingYaw=location.yaw;mesh.rotation.y=location.yaw;mesh.position.set(leader.x,0,leader.z);
  mesh.visible=progress>0;leader.walk=progress*(entry.leading+entry.trailing)*4;
  if(leader.type==='siegeTransformer')mesh.userData.animate({fold:0,walk:leader.walk,state:'walk',gait:progress<1?1:0});
  else for(const [key,sign] of [['leftLeg',1],['rightLeg',-1],['leftArm',-1],['rightArm',1]]){
    mesh.userData[key].rotation.x=progress<1?Math.sin(leader.walk)*sign*(key.endsWith('Leg')?.43:.27):0;
  }
  const plane=entry.reveal.plane;
  plane.normal.set(location.nx,0,location.nz);
  plane.constant=progress<1?-location.nx*location.x-location.nz*location.z:1e6;entry.reveal.sync();
  const close=elapsed-MINI_ENTRY.open-MINI_ENTRY.walk;
  beastPortal.update(dt,close>0?1-close/MINI_ENTRY.close:elapsed/MINI_ENTRY.open);
  if(progress===1&&entry.stage!=='closing'){pulse(leader.x,leader.z,leader.radius+1,0x97dcff,.56);entry.stage='closing';}
  else if(progress>0&&progress<1)entry.stage='walking';
  if(close<MINI_ENTRY.close)return;
  finishMiniReveal(fight);beastPortal.reset();
  leader.state='walk';leader.timer=1.2;enemies.push(leader);
}
function updateEncounter(dt){
  encounterRetry=Math.max(0,encounterRetry-dt);
  if(!encounter)return;
  const fight=encounter,{leader,gate,escorts}=fight;
  if(fight.entry){updateMiniEntry(fight,dt);return;}
  if(leader.dead&&fight.sent>=gate.escort.length&&!escorts.size){
    encounter=null;bossGate++;encounterRetry=3;
    toast('ΠΕΡΑΣΕΣ ΤΗΝ ΑΝΑΜΕΤΡΗΣΗ','Μάζεψε τα λάφυρα. Το επόμενο ορόσημο εμφανίζεται στον στόχο.');return;
  }
  fight.timer-=dt;
  if(fight.timer>0||fight.sent>=gate.escort.length||escorts.size>=(bossGate===0?4:7))return;
  const type=gate.escort[fight.sent];
  // Rally near their leader on free terrain, with the road network as fallback.
  let point=null;
  for(let i=0;i<12&&!point;i++){
    const a=(i+fight.sent*.618)*Math.PI/6,p={x:leader.x+Math.sin(a)*5.4,z:leader.z+Math.cos(a)*5.4};
    if(Math.abs(p.x)<BOUNDS-2&&Math.abs(p.z)<BOUNDS-2&&Math.hypot(p.x-player.x,p.z-player.z)>2.5
      &&!nearbyObjects(p.x,p.z,1.4).some(o=>circleOverlaps(p.x,p.z,1.05,o))
      &&!enemies.some(e=>Math.hypot(p.x-e.x,p.z-e.z)<e.radius+1.15))point=p;
  }
  const escort=spawnEnemy(type,point,{encounterEscort:true});
  if(escort){
    escorts.add(escort);fight.sent++;fight.timer=fight.sent%4===0?5:.55;
    if(type==='marshalThrall')pulse(escort.x,escort.z,1.25,0xc47af1,.42);
  }
  else fight.timer=.65;
}
function impact(from=headPrevious,to=headNow){
  const s=swing;if(!s||s.blocked)return;
  // The load behind a shoulder/crown is anticipation. Normal cuts deal
  // damage across the forward arc; the separate held spin owns rear hits.
  if(sampleHammerSwing(s.time/s.duration,{variant:s.variant,charge:s.q}).directionZ<.04)return;
  if(armoryVolumes){armoryImpact(s,from,to,false);return;}
  const radius=hero.userData.getHeadContactRadius?.()||.52*stats.size,shaftRadius=hero.userData.getShaftContactRadius?.()||.15;
  const grip=hero.userData.hammerPivot.getWorldPosition(new THREE.Vector3());
  const objects=nearbyObjects(player.x,player.z,stats.range+stats.size+2).filter(o=>!s.hits.has(o));
  const headWall=firstHammerHit(from,to,objects,radius),shaftWall=firstHammerHit(grip,to,objects,shaftRadius);
  const wall=shaftWall||headWall;
  const barbed=readBarbedSegment(s);
  let hits=0,hardHits=0,breaks=0;
  for(const e of [...enemies,...(boss&&!boss.dead?[boss]:[])]){
    if(s.hits.has(e)||e.dead||Math.hypot(e.x-player.x,e.z-player.z)>stats.range+stats.size+(e.radius||1)+2)continue;
    if((e.x-player.x)*s.fx+(e.z-player.z)*s.fz<0)continue;
    // Metal hammers cut with the visible wire beyond the safe grip. Thick
    // early wood weapons retain their blunt whole-shaft collision.
    let headContact=firstHammerHit(from,to,[e],radius);
    const shaftContact=characterStats.weaponTier>=2?wireContact(s,barbed,e):firstHammerHit(grip,to,[e],shaftRadius);
    if(headWall&&headContact&&headContact.t>headWall.t)headContact=null;
    if(!headContact&&!shaftContact)continue;
    const contact=headContact||shaftContact;
    const contactRadius=!headContact&&characterStats.weaponTier>=2?barbed.radius:shaftRadius;
    if(firstHammerHit(grip,contact,objects,contactRadius))continue;
    const dir=normalize(e.x-player.x+s.fx*.3,e.z-player.z+s.fz*.3);s.hits.add(e);hits++;
    if(!headContact&&characterStats.weaponTier>=2)hitBarbedTarget(e,s,contact);
    else{hardHits++;if(e===boss)hitBoss(s.damage,dir,s.knockback);else hitEnemy(e,s.damage,dir,s.knockback,s.lift,contact);}
  }
  if(wall){s.hits.add(wall.target);hits++;hardHits++;if(hurtObject(wall.target,s.damage,s.q,wall))breaks++;else{s.blocked=true;s.blockTime=s.time;s.blockRotation=weaponPoseRotation();s.blockPosition=hero.userData.weaponRig.position.clone();s.blockPose=sampleHammerSwing(s.time/s.duration,{twoHanded:s.twoHanded,charge:s.q,variant:s.variant});attackCooldown=Math.min(attackCooldown,.125);}}
  if(hits){if(chargeHeld)spinCharge={life:.45,hits:s.hits};s.hit=true;shake=Math.max(shake,(.105+s.q*.14)*(breaks?1.2:1));if(!s.feedbackDone){s.feedbackDone=true;s.contactTime=s.time;hitStop=(s.variant==='two-overhead'?.032:s.variant==='two-cross'?.026:.022)+s.q*.006;}}
  if(hardHits&&s.charged&&!s.quakeDone){
    s.quakeDone=true;const radius=2.3+stats.quake*.7;pulse(to.x,to.z,radius,0xffd48b,.35);
    for(const e of [...enemies])if(!s.hits.has(e)&&Math.hypot(e.x-to.x,e.z-to.z)<radius){s.hits.add(e);hitEnemy(e,s.damage*(.25+stats.quake*.12),normalize(e.x-to.x,e.z-to.z),s.knockback*.7,s.lift);}
    fragments.add(to.x,.2,to.z,20,[0xffbd6a,0xffedbf,0x9ba9a0],7,.1);
  }
  checkGoal();
}

function mountProjectileHit(target,damage,dir,point,id){
  if(target===boss)hitBoss(damage,dir,2);
  else if(enemies.includes(target))hitEnemy(target,damage,dir,2,.3,point,{weapon:'mount-'+id});
  else hurtObject(target,damage,0,point,'mount-'+id);
}
function mountProjectileBlast(point,damage,radius,direct){
  const targets=[...world.nearObjects(point.x,point.z,radius+2),...enemies,...(boss&&!boss.dead?[boss]:[])];
  for(const target of targets){
    if(target.dead)continue;
    const near=target.w?nearestPoint(point.x,point.z,target):{x:target.x,z:target.z};
    const bottom=target.y||0,top=bottom+(target.height||target.h||1.6),y=clamp(point.y,bottom,top);
    const distance=Math.hypot(near.x-point.x,near.z-point.z,y-point.y);if(distance>radius+(target.radius||0)&&target!==direct)continue;
    const dir=normalize(target.x-point.x,target.z-point.z),end={x:near.x,y,z:near.z};
    const obstruction=firstHammerHit(point,end,world.nearObjects(point.x,point.z,radius+2),.01);
    if(target!==direct&&obstruction&&obstruction.target!==target)continue;
    mountProjectileHit(target,Math.round(damage*Math.max(.3,1-distance/radius)),dir,point,'rockets');
  }
  if(Math.hypot(player.x-point.x,player.z-point.z,player.y+.8-point.y)<radius){
    const end={x:player.x,y:player.y+.8,z:player.z};
    if(!firstHammerHit(point,end,world.nearObjects(point.x,point.z,radius+2),.01))hurtPlayer(damage*.5,player.x-point.x,player.z-point.z,false);
  }
}
function initMountWorkshop(){
  const commitWorkshop=context=>{garage=context.garage;let saved=false;if(context.menu){const stored=read('ironfall.character',null);saved=save('ironfall.character',{character:context.character,levels:stored?.levels||{},garage});updateSavedCharacter();}else{applyStats();saved=persistCharacter();}return !!saved&&!context.test&&JSON.stringify(read('ironfall.character',null)?.garage)===JSON.stringify(garage);};
  mountWorkshop=createMountWorkshop({document,
    getContext(){
      const menu=phase==='menu';if(!menu)return {preview:saveStore.isPreview,menu:false,garage,character,materials:character.materials,level,test:testRun,weaponTier:characterStats.weaponTier,actualMountKind:mountRide?.kind,actualMount:mountRide?.snapshot()};
      const stored=read('ironfall.character',null),c=restoreCharacterProgression(stored?.character)||createCharacterProgression();
      return {preview:saveStore.isPreview,menu:true,garage:restoreGarage(stored?.garage),character:c,materials:c.materials,level:c.level,test:false,weaponTier:getCharacterStats(c).weaponTier};
    },
    onOpen(){workshopPhase=phase;if(phase==='playing')setPhase('paused');else forgeMenu?.setVisible(false);},
    onClose(){if(workshopPhase==='playing'&&phase==='paused')setPhase('playing');else if(phase==='menu')forgeMenu?.setVisible(true);},
    onChange:commitWorkshop,onSave:commitWorkshop,
    canModify({kind,slot}){if(kind==='player'&&['weapon','shield'].includes(slot)&&(swing||spin||weaponBusy()))return 'Ολοκλήρωσε πρώτα το χτύπημα ή την επιστροφή του όπλου.';if(mountRide?.active&&(slot==='chassis'||slot==='mobility'))return 'Αποβιβάσου πριν αλλάξεις σασί ή σύστημα πτήσης.';return '';},
    onRepair(context){if(context.repairKind!==mountRide.kind)return {ok:false,reason:'Επίλεξε το ενεργό όχημα.'};const result=mountRide.repair(context.materials,{test:context.test});if(result.ok)persistCharacter();return result;},
    onTestStart:n=>startGame(n,{test:true,city:getLevelCity(Math.min(n,15))}),
  });
  $('menuMountWorkshopButton').disabled=!gameReady;$('menuMountWorkshopButton').onclick=() => {if(gameReady)mountWorkshop.open();};
  $('mountWorkshopButton').onclick=()=>mountWorkshop.open();
}
function initMountControls(){
  const panel=$('mountControls');
  $('mountToggle').onclick=toggleMount;
  for(const [id,action] of [['mountUp','up'],['mountDown','down'],['mountBoost','boost']]){const b=$(id);
    b.onpointerdown=e=>{e.preventDefault();b.setPointerCapture(e.pointerId);mountTouch[action]=true;};
    for(const event of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(event,()=>mountTouch[action]=false);
  }
  inputResetters.push(()=>{for(const key in mountTouch)mountTouch[key]=false;});
}
const mountTouch={up:false,down:false,boost:false};
function toggleMount(){
  if(phase!=='playing'||leap||swing||spin||throwWindup||throwFlight||kick)return false;
  mountRide.sync(garage,level);cancelAttack();guardHeld=guarding=false;
  if(!mountRide.active&&boss&&!boss.dead&&!mountRide.clear(beastCollision,player.x,player.z,player.y,hero.rotation.y)){toast('ΔΕΝ ΥΠΑΡΧΕΙ ΧΩΡΟΣ','Απομακρύνσου από τον Κολοσσό.');return false;}
  const result=mountRide.toggle(player,hero,world);
  if(mountRide.active){stance=stanceTarget=0;hero.userData.setStance(0);}
  poseHero(0);syncMountHud();return result;
}
function syncMountHud(){
  const panel=$('mountControls');if(!panel)return;panel.hidden=phase!=='playing';
  const v=mountRide?.snapshot();if(!v)return;
  panel.classList.toggle('hover-flight',v.active&&v.hover);
  $('mountToggleLabel').textContent=v.active?'ΚΑΤΕΒΑ':'ΑΝΕΒΑ';$('mountToggle').setAttribute('aria-pressed',String(v.active));const mountImage=$('mountHudImage');if(mountImage.dataset.kind!==v.kind){mountImage.src='./assets/workshop/chassis-'+v.kind+'.png';mountImage.dataset.kind=v.kind;}
  $('mountReadout').textContent=(v.kind==='bicycle'?'ΠΟΔΗΛΑΤΟ':v.kind==='motorcycle'?'ΜΟΤΟΣΙΚΛΕΤΑ':'SCI-FI')+' · '+v.hp+'/'+v.maxHp+' HP · '+v.energy+'/'+v.maxEnergy+' ⚡'+(v.hover?' · '+v.altitude+' m':'');
  $('mountFlight').hidden=!v.active||!v.hover;
  $('dashName').textContent=v.active?'BOOST':'ΑΠΟΦΥΓΗ';
  $('leapDesktopName').textContent=v.active&&v.hover?'ΠΤΗΣΗ':'ΨΗΛΟ ΑΛΜΑ';$('leapTouchName').textContent=v.active&&v.hover?'ΠΤΗΣΗ':'ΑΛΜΑ';
  for(const id of ['stanceButton','mobileStanceButton'])if($(id))$(id).disabled=v.active;
  if(v.active){$('attackName').textContent='ΜΟΝΟ ΧΕΡΙ';$('attackValue').textContent='ΚΡΑΤΑ · ΣΥΝΕΧΗ ΧΤΥΠΗΜΑΤΑ';$('dashValue').textContent='ΚΡΑΤΑ ΓΙΑ ΩΘΗΣΗ';$('leapValue').textContent=v.hover?'ΚΡΑΤΑ ΓΙΑ ΑΝΟΔΟ':v.kind==='bicycle'?'ΑΛΜΑ ΜΕ ΠΟΔΗΛΑΤΟ':'ΑΠΟΒΙΒΑΣΗ + ΑΛΜΑ';for(const id of ['stanceValue','mobileStanceValue'])if($(id))$(id).textContent='ΜΟΝΟ ΧΕΡΙ · ΤΙΜΟΝΙ';}
  for(const [id,label]of [['dashButton','Κράτα για boost με κατανάλωση ενέργειας.'],['leapButton',v.hover?'Κράτα για άνοδο. X ή το κουμπί καθόδου για κάθοδο.':v.kind==='bicycle'?'Άλμα με το ποδήλατο χωρίς αποβίβαση.':'Αποβίβαση από το όχημα και άλμα.']]){const b=$(id),text=v.active?label:b.dataset[touchLayout?'touchLabel':'desktopLabel'];b.setAttribute('aria-label',text);b.title=text;}

}
function toggleStance(){
  if(mountRide?.active){toast('ΜΟΝΟ ΧΕΡΙ','Το αριστερό χέρι παραμένει στο τιμόνι.');return;}
  if(phase==='playing'&&(touchThrowAim||touchThrowQueued))cancelTouchThrow();
  if(phase!=='playing'||kick||swing||throwFlight||throwWindup||leap||Math.abs(stance-stanceTarget)>.005)return;
  cancelAttack();spinRecovery=null;stanceTarget=stanceTarget===0?1:0;guardHeld=false;guarding=false;
  audio.play('ui');
}
function updateAim(preview=true){
  const committedDirection=touchThrowAim?.confirming?touchThrowAim.confirmedDirection:
    touchThrowQueued?.dir||throwWindup?.dir;
  if(committedDirection){
    // Guidance must show the direction the animation will actually release.
    // A stale screen coordinate drifts as the warrior and camera move.
    aim.x=committedDirection.x;aim.z=committedDirection.z;
  }else if(pointer.active&&!touchThrowAim?.touchInput){
    aimPlane.constant=-(player.y+1.2);camera.updateMatrixWorld(true);raycaster.setFromCamera({x:pointer.x/screenW*2-1,y:1-pointer.y/screenH*2},camera);
    const point=raycaster.ray.intersectPlane(aimPlane,tempV);
    if(point){const d=normalize(point.x-player.x,point.z-player.z);if(d.x||d.z){aim.x=d.x;aim.z=d.z;}}
  }else{
    const d=touch.aimX||touch.aimY?screenMovement(touch.aimX,touch.aimY):facing;
    aim.x=d.x;aim.z=d.z;
  }
  if(preview)updateAimPreview(true);
}
function throwGuidanceDirection(){
  if(throwWindup)return throwWindup.dir;
  if(touchThrowQueued)return touchThrowQueued.dir;
  if(touchThrowAim?.confirming){
    const target=touchThrowAim.confirmedTarget;
    return target&&validThrowLock(target)?normalize(target.x-player.x,target.z-player.z):touchThrowAim.confirmedDirection;
  }
  return throwLock&&settings.throwAutoLock?normalize(throwLock.x-player.x,throwLock.z-player.z):aim;
}
function updateThrowIndicator(){
  if(!throwIndicator)return;
  const active=phase==='playing'&&!throwFlight&&!!(touchThrowAim||touchThrowQueued||throwWindup);
  throwIndicator.update({active,origin:player,direction:throwGuidanceDirection(),
    meleeRange:stats.range,throwRange:characterStats.throwRange,time:visualTime,
    holding:touchThrowAim?.mode==='hold',
    heightAt:(x,z)=>world.supportHeight(x,z,0,player.y+.18)});
}
function updateAimPreview(withThrow=!!(touchThrowAim||throwWindup)){
  aimDiagnostics.previews++;
  const actors=boss&&!boss.dead?[...enemies,boss]:enemies;
  const direction=swing?{x:swing.fx,z:swing.fz}:manualAttackDirection();
  const spec=meleeAimSpec({range:stats.range,unarmed:!!throwFlight,kicking:!!kick,variant:swing?.variant||'',twoHanded:stance>.9});
  meleeHint={...spec,direction};meleeHintTargets=[];
  const origin={x:player.x,y:player.y+1.1,z:player.z};
  if(!spin&&!guarding&&!leap&&!touchThrowAim&&!throwWindup){
    const objects=nearbyObjects(player.x,player.z,spec.range+2);
    for(const e of actors){
      if(meleeHintTargets.length>=8)break;
      if(!inMeleeEnvelope(player,direction,e,spec))continue;
      const endpoint={x:e.x,y:Math.max((e.y||0)+.3,Math.min(player.y+1.1,(e.y||0)+(e.height||2)-.1)),z:e.z};
      if(!firstHammerHit(origin,endpoint,objects,.06))meleeHintTargets.push(e);
    }
  }
  nearbyTargets=[...meleeHintTargets];focusedTarget=null;
  if(!withThrow){aimPreview=null;throwLock=null;throwPreviewTargets=[];return;}
  aimDiagnostics.throwPreviews++;
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
  // Manual preview marks only the actual first intersected enemy, never a
  // nearby target selected by angle. It cannot turn the warrior/projectile.
  focusedTarget=contact&&actors.includes(contact.target)?contact.target:null;
  if(focusedTarget)nearbyTargets.push(focusedTarget);
  const previousLock=touchThrowAim?.lockedTarget;
  throwLock=settings.throwAutoLock&&!throwFlight?(touchThrowAim?.confirming?(validThrowLock(touchThrowAim.confirmedTarget)?touchThrowAim.confirmedTarget:null):previousLock&&validThrowLock(previousLock)?previousLock:chooseThrowLock(aim)):null;
  if(touchThrowAim){
    if(throwLock&&throwLock!==touchThrowAim.lockedTarget){
      audio.play('targetLock',.4);touchThrowAim.lockCursor={x:pointer.x,y:pointer.y};
    }
    touchThrowAim.lockedTarget=throwLock;
  }
  if(throwLock){focusedTarget=throwLock;if(!nearbyTargets.includes(throwLock))nearbyTargets.push(throwLock);}
  throwPreviewTargets=touchThrowAim&&throwLock?previewThrowChain(throwLock,[...enemies,...(boss&&!boss.dead?[boss]:[])],
    nearbyObjects(player.x,player.z,characterStats.throwRange+THROW_CHAIN_RADIUS*4),
    {origin:start,maxHits:characterStats.canRicochet?characterStats.maxChainHits:1,radius:throwRadius,chainRadius:THROW_CHAIN_RADIUS}):[];
}
function startLeap(){
  if(mountRide?.active){
    if(mountRide.stats.hover)return true;
    if(mountRide.kind==='bicycle'){if(phase!=='playing')return false;const jumped=mountRide.jump(world);if(jumped)audio.play('dash',.5);return jumped;}
    mountRide.dismount(player,hero);
  }
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
const SUPPORT_EPSILON=1e-6;
function supportHeight(x,z,ceiling=Infinity){
  return world.supportHeight(x,z,player.radius,ceiling);
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
function startThrow(direction=null,channelAngle=null,confirmedTarget=undefined){
  if(!canThrow())return false;
  if(direction){const d=normalize(direction.x,direction.z);aim.x=d.x;aim.z=d.z;}else updateAim();
  const locked=settings.throwAutoLock?(confirmedTarget===undefined?chooseThrowLock(aim):validThrowLock(confirmedTarget)?confirmedTarget:null):null;
  const launchDirection=locked?normalize(locked.x-player.x,locked.z-player.z):{...aim};
  const rig=hero.userData.weaponRig;
  cancelAttack();spinRecovery=null;throwWindup={time:0,dir:launchDirection,channelAngle,target:locked,
    fromRotation:weaponPoseRotation(),fromPosition:rig.position.clone(),fromReach:hero.userData.reachScale};
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
    breadcrumbs:[{x:player.x,z:player.z}],lastBreadcrumb:0,launchGroundY:player.y,armory:armoryWeaponStats?{id:hero.userData.armoryWeaponId,profile:{...armoryWeaponStats},volumes:armoryVolumes}:null};
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
  hero.userData.setWeaponVisible(false);throwWindup=null;throwCooldown=1.25*characterStats.cooldownScale;audio.play('swing',1,{weapon:characterStats.weaponTier<2?'wood':'metal',exert:false});
}
function chooseThrowLock(direction){
  const origin={x:player.x,y:player.y+1.2,z:player.z};
  const targets=[...enemies,...(boss&&!boss.dead?[boss]:[])];
  return selectThrowLock(origin,direction,targets,nearbyObjects(player.x,player.z,characterStats.throwRange+2),
    {range:characterStats.throwRange,radius:hero.userData.getThrowRadius?.()||.45});
}
function validThrowLock(target){
  if(!target||target.dead||(target!==boss&&!enemies.includes(target)))return false;
  const direction=normalize(target.x-player.x,target.z-player.z);
  return selectThrowLock({x:player.x,y:player.y+1.2,z:player.z},direction,[target],
    nearbyObjects(player.x,player.z,characterStats.throwRange+2),
    {range:characterStats.throwRange,radius:hero.userData.getThrowRadius?.()||.45})===target;
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
  const ceiling=Math.max(0,Math.min(h.y+.05,h.launchGroundY+.35));
  let placement=null;
  // A long log can lie across a lane but not through a parked car. Try its
  // natural pose, a quarter-turn, then upright if the alley is very narrow.
  for(const rotation of [[Math.PI/2,0,heading],[Math.PI/2,0,heading+Math.PI/2],[0,heading,0]]){
    h.mesh.position.set(0,0,0);h.mesh.rotation.set(...rotation);h.mesh.updateMatrixWorld(true);
    const box=new THREE.Box3().setFromObject(h.mesh);
    const footprint={minX:box.min.x,maxX:box.max.x,minZ:box.min.z,maxZ:box.max.z};
    placement=findGeometryRest(original,footprint,box,world,{bounds:BOUNDS,breadcrumbs,ceiling});
    if(placement)break;
  }
  if(!placement){
    // Do not park invalid geometry. Retry after the obstruction moves/breaks;
    // the last non-penetrating airborne pose remains visible and retrievable.
    h.mesh.quaternion.copy(oldRotation);h.mesh.position.set(h.x,h.y,h.z);h.restPending=true;return false;
  }
  h.returning=false;h.chainTarget=null;h.grounded=true;h.groundY=placement.floor;h.vy=0;h.restPending=false;
  h.x=placement.x;h.z=placement.z;h.y=placement.y;h.restFootprint=placement.footprint;h.geometryRest=placement;h.restCheck=0;
  h.mesh.position.set(h.x,h.y,h.z);
  pulse(h.x,h.z,1.1,0xf0d39b,.5).position.y=placement.floor+.06;
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
      if(!geometryRestValid(h.geometryRest,world)){settleThrownWeapon(h);return;}
    }
    h.mesh.position.y=h.y+Math.sin(visualTime*4)*.025;
    const edge=nearestPickupPoint(player,h,h.restFootprint);
    if(Math.hypot(player.x-edge.x,player.z-edge.z)<player.radius+.65&&Math.abs(player.y-h.groundY)<1){
      const from={x:player.x,y:player.y+.65,z:player.z},to={x:edge.x,y:h.groundY+.65,z:edge.z};
      if(!firstHammerHit(from,to,segmentObjects(from,to,.08),.08))catchHammer(h);
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
      let contacts=null,hit;
      if(h.armory){h.mesh.updateMatrixWorld(true);const head=h.mesh.getObjectByName('hammerHead'),headFrom=head.getWorldPosition(new THREE.Vector3()),headTo=headFrom.clone().add(new THREE.Vector3(to.x-from.x,to.y-from.y,to.z-from.z));contacts=sweepArmoryHead(h.armory.volumes,head.matrixWorld,headFrom,headTo,targets,firstHammerHit,{maxContacts:h.armory.profile.maxContacts,blueprintId:h.armory.id});hit=contacts[0];}else hit=firstHammerHit(from,to,targets,h.radius);
      h.x=hit?(h.armory?lerp(from.x,to.x,hit.t):hit.x):to.x;h.y=hit?(h.armory?lerp(from.y,to.y,hit.t):hit.y):to.y;h.z=hit?(h.armory?lerp(from.z,to.z,hit.t):hit.z):to.z;
      const traveled=Math.hypot(h.x-from.x,h.y-from.y,h.z-from.z);h.distance+=traveled;h.legDistance+=traveled;
      if(hit){
        const target=hit.target;h.hits.add(target);
        for(const c of contacts?contacts.filter(c=>c.target===target):[hit]){if(target.dead||target.exploding)break;const damage=h.damage*(c.damageScale||1),force=11*(c.forceScale||1)*(h.armory?.profile.force||1);if(target===boss)hitBoss(damage,h.dir,force,{weapon:'armory-throw'});else if(target.w!==undefined)hurtObject(target,damage,.7,c,'armory-throw');else hitEnemy(target,damage,h.dir,force,3.2,c,{weapon:'armory-throw'});}
        if(h.armory)armoryEffects.hit(target,h.armory.profile,h.damage,hit);
        if(target.w===undefined){
          h.hitCount++;h.chainTarget=nextThrowTarget(h);h.legDistance=0;
          if(h.chainTarget){h.bounces++;h.speed=26;}
          else returnHammer(h);
        }else returnHammer(h);
        fragments.add(h.x,h.y,h.z,14,[0xffd992,0xecffff,0x83dfff],5,.09);
        pulse(h.x,h.z,1.5,h.hitCount>1?0x8ae8ff:color.gold,.23).position.y=Math.max(.08,h.y-.5);
        shake=Math.max(shake,.13);checkGoal();
      }else if((!h.chainTarget&&h.distance>=h.maxRange)||h.legDistance>(h.hitCount===0?h.maxRange:12)&&h.chainTarget||Math.abs(h.x)>BOUNDS||Math.abs(h.z)>BOUNDS||h.retrievable&&h.y<=.24)returnHammer(h);
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
  const cap=Math.min(plan.aliveCap,(settings.quality==='low'?36:48)-(encounter?8:1)),slots=cap-enemies.length;
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
  const free=p=>Math.hypot(p.x-player.x,p.z-player.z)>10&&!nearbyObjects(p.x,p.z,radius+.2).some(o=>circleOverlaps(p.x,p.z,radius,o))&&!enemies.some(e=>Math.hypot(e.x-p.x,e.z-p.z)<e.radius+radius+.4);
  const roads=world.layout?.roads||[];
  for(let i=0;i<48;i++){
    const angle=Math.random()*Math.PI*2,r=distance+Math.random()*5;
    const p={x:clamp(player.x+Math.sin(angle)*r,-BOUNDS+2,BOUNDS-2),z:clamp(player.z+Math.cos(angle)*r,-BOUNDS+2,BOUNDS-2)};
    // Spawn on the connected road network, with arrivals distributed all around.
    if(roads.length){const axis=i%2?'x':'z';p[axis]=roads.reduce((best,v)=>Math.abs(v-p[axis])<Math.abs(best-p[axis])?v:best,roads[0]);}
    if(free(p))return p;
  }
  // Junctions are reserved by the city layout. Search closest valid junctions
  // instead of dropping a wave member into an inaccessible building footprint.
  const fallback=[];for(const x of roads.length?roads:[0])for(const z of roads.length?roads:[-BOUNDS+5,BOUNDS-5]){
    const p={x,z};if(free(p))fallback.push(p);
  }
  fallback.sort((a,b)=>Math.abs(Math.hypot(a.x-player.x,a.z-player.z)-distance)-Math.abs(Math.hypot(b.x-player.x,b.z-player.z)-distance));
  return fallback[0]||null;
}
function spawnEnemy(forcedType=null,position=null,{waveNumber=null,encounterLeader=false,encounterEscort=false,arriving=false}={}){
  const qualityCap=settings.quality==='low'?36:48;if(enemies.length>=qualityCap)return null;
  const type=forcedType||enemyTypeForWave(round),base=enemyStatsForWave(type,round);
  if(encounterLeader){base.hp=Math.round(base.hp*(1+Math.max(0,level-5)*.085));base.damage+=Math.floor(Math.max(0,level-5)*1.2);}
  if(encounterEscort){base.hp=Math.round(base.hp*1.18);base.xp+=1;}
  let pos=position||spawnPosition(encounterLeader?13:17,base.radius);
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
  Object.assign(e,{encounterLeader,encounterEscort,fold:0,tankWanted:false,tankDelay:0,baseHeight:base.height});
  initEnemyReaction(e,spawnCounter);mesh.position.set(e.x,0,e.z);if(!arriving)enemies.push(e);spawnCounter++;
  if(arriving){audio.play('boss');return e;}
  if(roundTime>5)fragments.add(e.x,.1,e.z,e.miniBoss?18:4,e.palette==='metal'?[0x537b77,0xffac69]:[0x537b77,0x81958a],e.miniBoss?5:2,.09);
  if(e.miniBoss){pulse(e.x,e.z,4.4,0xff866b,1);audio.play('boss');}
  return e;
}
const equipmentRay=new THREE.Raycaster(),equipmentRayStart=new THREE.Vector3(),equipmentRayEnd=new THREE.Vector3();
function actualEquipmentRay(root,from,to){
 if(!root)return null;equipmentRayStart.set(from.x,from.y,from.z);equipmentRayEnd.set(to.x,to.y,to.z).sub(equipmentRayStart);const distance=equipmentRayEnd.length();if(distance<1e-8)return null;
 root.updateWorldMatrix(true,true);equipmentRay.set(equipmentRayStart,equipmentRayEnd.multiplyScalar(1/distance));equipmentRay.near=0;equipmentRay.far=distance;
 const hit=equipmentRay.intersectObject(root,true).find(h=>h.object.visible&&h.object.isMesh);return hit?hit.distance/distance:null;
}
function shieldSurface(from,to){
 if(!armoryShieldStats||!characterStats.hasShield||mountRide?.active||stance>.05||throwWindup||throwFlight)return null;
 const f=spin?{x:Math.sin(hero.rotation.y),z:Math.cos(hero.rotation.y)}:facing;
 if(!facingCoverage(f,from,player,armoryShieldStats.coverage))return null;
 return actualEquipmentRay(hero.userData.armoryShieldModel,from,to);
}
function shieldRespond(attacker,amount,point){
 if(!attacker||attacker.dead)return;const dir=normalize(attacker.x-player.x,attacker.z-player.z);
 if(armoryShieldStats.counter>0){const damage=Math.max(1,amount*armoryShieldStats.counter);if(attacker===boss)hitBoss(damage,dir,1,{weapon:'shield',combo:false});else hitEnemy(attacker,damage,dir,1,0,point,{weapon:'shield',combo:false});}
 const core=armoryShieldStats.core,rank=armoryShieldStats.coreRank||1;
 if(core==='arc'||core==='impact'){
  const damage=Math.max(1,amount*(core==='arc'?.12+rank*.03:.08*rank)*(armoryShieldStats.corePower||1)),force=core==='impact'?2+rank:0;
  const response={weapon:'shield-core',combo:false,grounded:true,preserveVelocity:core!=='impact',interrupt:core==='impact',stagger:core==='impact'?.15+rank*.055:0};
  if(attacker===boss)hitBoss(damage,dir,force,response);else hitEnemy(attacker,damage,dir,force,0,point,response);
  if(core==='arc'){const model=hero.userData.armoryShieldModel,origin=model.localToWorld(new THREE.Vector3(0,.025,.30));armoryEffects.visual('arc',origin,{x:attacker.x,y:(attacker.y||0)+.8,z:attacker.z});}
 }
 armoryEffects.hit(attacker,armoryShieldStats,amount,{x:attacker.x,y:(attacker.y||0)+.8,z:attacker.z});
}
function hurtPlayer(damage,dx=0,dz=0,blockable=true,contact={}){
  if(phase!=='playing'||player.invincible>0||dashTime>0||(player.y>1.6&&blockable&&!mountRide?.active))return;
  const directionLength=Math.hypot(dx,dz),source={x:player.x-dx,z:player.z-dz};
  if(blockable&&directionLength>.01&&guarding&&facingCoverage(facing,source,player,Math.PI*.36)&&(!armoryVolumes||actualEquipmentRay(hero.userData.hammerHead,contact.from||{x:source.x,y:player.y+1.3,z:source.z},{x:player.x,y:player.y+1.3,z:player.z})!==null)){
    fragments.add(player.x+facing.x,player.y+1.3,player.z+facing.z,7,[0xa5e5de,0xffd490],4,.07);audio.play('hit',.1,{material:characterStats.weaponTier<2?'wood':'metal'});return;
  }
  const shieldFacing=spin?{x:Math.sin(hero.rotation.y),z:Math.cos(hero.rotation.y)}:facing;
  const shieldFrom=contact.from||{x:source.x,y:player.y+1,z:source.z},shieldTo=contact.to||{x:player.x,y:player.y+1,z:player.z};
  if(blockable&&!mountRide?.active&&characterStats.hasShield&&directionLength>.01&&stance<.05&&!throwWindup&&!throwFlight&&facingCoverage(shieldFacing,source,player,armoryShieldStats?.coverage||Math.PI*.32)&&(!armoryShieldStats||contact.shieldHit||shieldSurface(shieldFrom,shieldTo)!==null)){const absorbed=damage*(armoryShieldStats?.protection??.35);damage-=absorbed;if(armoryShieldStats)shieldRespond(contact.attacker,absorbed,shieldFrom);fragments.add(player.x+shieldFacing.x*.6,player.y+1,player.z+shieldFacing.z*.6,4,[0xffd490,0x8dc9cd],3,.06);}

  damage=mountRide?.absorb(damage,player,hero)??damage;damage*=1-Math.min(.65,playerCustomization.defence+(armoryWeaponStats?.defence||0));
  player.hp=Math.max(0,player.hp-damage);player.invincible=.85;player.hurtAgo=0;player.vx=dx*4;player.vz=dz*4;
  resetAttackChain();redFlash=.55;shake=Math.max(shake,.19);resetHitCombo(combatCombo);comicState=null;audio.play('hurt');floatText(player.x,2.5,player.z,'−'+Math.ceil(damage),'#ff8d80',21);
  if(player.hp<=0)endGame(false);
}
function guardContact(from,to){
  if(!guarding||!facingCoverage(facing,from,player,Math.PI*.42))return null;
  if(armoryVolumes)return actualEquipmentRay(hero.userData.hammerHead,from,to);
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
    mesh.position.set(e.x,1,e.z);scene.add(mesh);bolts.push({mesh,x:e.x,z:e.z,vx:dx*speed,vz:dz*speed,life:3.5,damage:e.damage,owner:e});
  }
}
function clearEncounterShell(e){
  if(!e.shell)return;
  removeEffect(e.shell.mesh);e.shell=null;
}
function launchEncounterShell(e){
  const muzzle=e.mesh.userData.muzzle;
  const from=muzzle?muzzle.getWorldPosition(new THREE.Vector3()):new THREE.Vector3(e.x,3,e.z);
  const to=new THREE.Vector3(e.attackPoint.x,e.attackPoint.y,e.attackPoint.z);
  const mesh=new THREE.Mesh(new THREE.OctahedronGeometry(.24),new THREE.MeshBasicMaterial({color:0xffb357}));
  mesh.scale.set(.83,2.4,.83);mesh.position.copy(from);scene.add(mesh);
  e.shell={mesh,from,to,last:from.clone(),time:0,span:clamp(from.distanceTo(to)/26,.35,1.1)};
  e.cannonRecoil=1;e.state='shellFlight';fragments.add(from.x,from.y,from.z,12,[0xff9c44,0xffdc96],5,.09);audio.play('hit',.72,{material:'metal'});
}
function updateEncounterShell(e,dt){
  const s=e.shell;s.time+=dt;
  const t=Math.min(1,s.time/s.span),p=s.mesh.position;
  p.lerpVectors(s.from,s.to,t);p.y+=Math.sin(t*Math.PI)*2.8;
  s.mesh.quaternion.setFromUnitVectors(shaftUp,poseDirection.subVectors(p,s.last).normalize());
  const hit=firstHammerHit(s.last,p,segmentObjects(s.last,p,.18),.18);
  if(!hit&&t<1){s.last.copy(p);return;}
  const x=hit?.x??p.x,y=hit?.y??p.y,z=hit?.z??p.z,r=e.attackRadius*.63;
  const dir=normalize(player.x-x,player.z-z);
  if(Math.hypot(player.x-x,player.y+.65-y,player.z-z)<r+player.radius)hurtPlayer(e.damage,dir.x,dir.z,false);
  for(const o of nearbyObjects(x,z,r+2)){
    const q=nearestPoint(x,z,o),oy=clamp(y,o.baseY??0,(o.baseY??0)+o.h),dist=Math.hypot(q.x-x,oy-y,q.z-z);
    if(dist<r)hurtObject(o,e.damage*3*(1-.5*dist/r),.55,{x:q.x,y:oy,z:q.z},'explosion');
  }
  pulse(x,z,r,0xff844a,.52);fragments.add(x,y,z,23,[0xff8e3d,0xffcf79,0x6c7a72],7,.14);
  impactClouds?.emit(x,y,z,dir,1.45,true);audio.play('break',.65);shake=Math.max(shake,.12);
  clearEncounterShell(e);if(e.telegraph){removeEffect(e.telegraph);e.telegraph=null;}
  e.state='walk';e.timer=e.attackRecovery;
}
function updateEnemies(dt){
  function advanceBody(e){
    const oldY=e.y;
    const collisionMoved=advanceKickedEnemy(e,dt);
    const speed=Math.hypot(e.vx,e.vz);
    // Use one height threshold for both the wall and roof support, including
    // actors knocked off a roof. Crossing an edge must never eject a body
    // toward the far side of the building beneath it.
    const walls=nearbyObjects(e.x,e.z,e.radius+speed*dt+.1).filter(o=>o.h>oldY+SUPPORT_EPSILON);
    moveCircle(e,collisionMoved?0:e.vx*dt,collisionMoved?0:e.vz*dt,walls,e.radius);
    const damp=Math.exp(-(e.kickFlight?1.8:8)*dt);e.vx*=damp;e.vz*=damp;
    e.vy-=18*dt;e.y+=e.vy*dt;
    let floor=0;
    for(const o of nearbyObjects(e.x,e.z,e.radius))if(o.h<=oldY+SUPPORT_EPSILON&&circleOverlaps(e.x,e.z,e.radius,o))floor=Math.max(floor,o.h);
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
    if(u.leftLeg){u.leftLeg.rotation.x=Math.sin(e.walk)*.5;u.leftLeg.rotation.z=u.leftLeg.userData.restRoll||0;}
    if(u.rightLeg){u.rightLeg.rotation.x=-Math.sin(e.walk)*.5;u.rightLeg.rotation.z=u.rightLeg.userData.restRoll||0;}
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
    const afraid=updateEnemyThreat(e,player,dt,{airborne:!!leap,smashing:!!leap?.slam,canSee:e.seesPlayer,threatPower:.6+characterStats.weaponTier*.22})&&!e.encounterLeader;
    if(e.type==='siegeTransformer'){
      e.tankDelay=Math.max(0,e.tankDelay-dt);
      if(e.state==='walk'&&!e.tankWanted&&dist>13&&!e.tankDelay){e.tankWanted=true;e.timer=Math.max(.9,e.timer);audio.play('break',.32);}
      else if(e.state==='walk'&&e.tankWanted&&dist<7.4){e.tankWanted=false;e.timer=Math.max(.9,e.timer);audio.play('break',.25);}
      e.fold=clamp(e.fold+(e.tankWanted?1:-1)*dt/.94,0,1);
      e.height=e.baseHeight-2.25*e.mesh.scale.y*smooth(e.fold);
      e.cannonRecoil=Math.max(0,(e.cannonRecoil||0)-dt*4);
      if(e.state==='shellFlight'){updateEncounterShell(e,dt);poseBody(e);continue;}
    }
    if(afraid&&e.stagger<=0){
      const telegraph=interruptEnemyAttack(e,.45);if(telegraph)removeEffect(telegraph);
      const speed=e.speed*1.3*movementScale,delta=moveCircle(e,e.fearMoveX*speed*dt,e.fearMoveZ*speed*dt,nearbyObjects(e.x,e.z,e.radius+speed*dt+.2).filter(o=>o.h>e.y+SUPPORT_EPSILON),e.radius);
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
        const tank=e.type==='siegeTransformer'&&e.fold>=1,transforming=e.fold>0&&e.fold<1;
        const targetY=player.y+.35;
        const tankShot=tank&&dist<23&&!firstHammerHit({x:e.x,y:e.y+2.8,z:e.z},{x:player.x,y:targetY,z:player.z},segmentObjects(e,player,.18),.18);
        const stop=transforming?.18:clearShot&&dist<6.5?0:1;
        const speed=e.speed*(tank?2.65:1)*(e.type==='hollowMarshal'&&e.hp<e.maxHp*.45?1.22:1);
        const delta=moveCircle(e,(mx*speed*movementScale*stop+separation.x)*dt,(mz*speed*movementScale*stop+separation.z)*dt,nearbyObjects(e.x,e.z,e.radius+speed*dt+1).filter(o=>o.h>e.y+SUPPORT_EPSILON),e.radius);
        const traveled=Math.hypot(delta.x,delta.z);e.walk+=traveled*6;e.gait=traveled/Math.max(dt,.001);
        const yaw=Math.atan2(tank&&!tankShot?mx:dir.x,tank&&!tankShot?mz:dir.z);
        if(e.type==='siegeTransformer')e.facingYaw+=clamp(Math.atan2(Math.sin(yaw-e.facingYaw),Math.cos(yaw-e.facingYaw)),-dt*3.2,dt*3.2);
        else e.facingYaw=yaw;
        if(e.timer<=0&&!transforming&&(tank?tankShot:((e.attackKind==='ranged'&&clearShot)||(e.attackKind==='lunge'&&dist<3.1+e.radius*.25)||(e.attackKind==='slam'&&dist<(e.attackRadius||2.95)+.5)))){
          e.state='windup';e.timer=e.windup;e.attackDir=dir;
          e.attackPoint=tank?{x:player.x,y:targetY,z:player.z}:null;
          e.telegraph=makeTelegraph(tank?player.x:e.x,tank?player.z:e.z,tank?e.attackRadius*.63:e.attackKind==='slam'?e.attackRadius:e.attackKind==='ranged'?e.radius+.3:1.05,e.type==='hollowMarshal'?0xc775ed:e.attackKind==='ranged'?0xff8d62:0xef6863);
          if(tank){e.telegraph.position.y=targetY;e.facingYaw=Math.atan2(dir.x,dir.z);}
        }
      }else if(e.state==='windup'){
        if(e.telegraph){if(!e.attackPoint)e.telegraph.position.set(e.x,.09,e.z);e.telegraph.material.opacity=.35+Math.sin(visualTime*25)*.2;}
        if(e.timer<=0){
          if(e.attackPoint){launchEncounterShell(e);poseBody(e);continue;}
          if(e.telegraph){removeEffect(e.telegraph);e.telegraph=null;}
          if(e.attackKind==='ranged'){shoot(e);e.state='walk';e.timer=e.attackRecovery+Math.random()*.6;}
          else if(e.attackKind==='slam'){
            pulse(e.x,e.z,e.attackRadius,0xfc7765,.42);fragments.add(e.x,.1,e.z,e.miniBoss?28:12,[0xc4bb97,0x75897d],e.miniBoss?8:5,.12);if(dist<e.attackRadius&&player.y<.8)hurtPlayer(e.damage,dir.x,dir.z,false);e.state='walk';e.timer=e.attackRecovery;
          }else{e.state='lunge';e.timer=.27;e.vy=3.4;}
        }
      }else if(e.state==='lunge'){
        moveCircle(e,e.attackDir.x*e.lungeSpeed*movementScale*dt,e.attackDir.z*e.lungeSpeed*movementScale*dt,nearbyObjects(e.x,e.z,e.radius+e.lungeSpeed*dt+.2).filter(o=>o.h>e.y+SUPPORT_EPSILON),e.radius);
        if(dist<e.radius+player.radius+.2)hurtPlayer(e.damage,e.attackDir.x,e.attackDir.z,true,{attacker:e,from:{x:e.x,y:player.y+1,z:e.z}});
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
    const guardT=b.reflected?null:guardContact(from,to),shieldT=b.reflected?null:shieldSurface(from,to);
    if(guardT!==null&&(!hit||guardT<hit.t)&&(!playerT||guardT<=playerT)){
      b.x=lerp(from.x,to.x,guardT)+facing.x*.12;b.z=lerp(from.z,to.z,guardT)+facing.z*.12;b.vx=facing.x*14;b.vz=facing.z*14;b.damage=Math.round(stats.power*.8);b.reflected=true;b.life=1.5;b.mesh.material.color.setHex(0x8ce4d8);
      fragments.add(b.x,1,b.z,8,[0x8ce4d8,0xffe1a5],4,.06);audio.play('hit',.15,{material:characterStats.weaponTier<2?'wood':'metal'});
    }else if(shieldT!==null&&(!hit||shieldT<hit.t)&& (playerT===null||shieldT<=playerT)){
      hurtPlayer(b.damage,b.vx/10,b.vz/10,true,{attacker:b.owner,from,to,shieldHit:true});b.life=0;
    }else if(!b.reflected&&playerT!==null&&(!hit||playerT<hit.t)){
      hurtPlayer(b.damage,b.vx/10,b.vz/10,true,{attacker:b.owner,from,to});b.life=0;
    }else if(hit){
      b.x=hit.x;b.z=hit.z;b.life=0;
      if(b.reflected){const dir=normalize(b.vx,b.vz);if(hit.target===boss)hitBoss(b.damage,dir,5);else if(hit.target.w!==undefined)hurtObject(hit.target,b.damage,.1,hit);else hitEnemy(hit.target,b.damage,dir,5,1.5);}
    }else{b.x=to.x;b.z=to.z;}
    b.mesh.position.set(b.x,1,b.z);b.mesh.rotation.y+=dt*12;
    if(b.life<=0){scene.remove(b.mesh);b.mesh.geometry.dispose();b.mesh.material.dispose();bolts.splice(i,1);}
  }
}

function releaseBeast(){
  beastCombat?.reset();beastPortal?.reset();if(beastRig)beastRig.visible=false;beastCollision.clear();
  if(boss?.telegraph){removeEffect(boss.telegraph);boss.telegraph=null;}
}
function beastBlast(point,radius,damage,{groundOnly=false}={}){
  const bodyDistance=e=>Math.hypot(e.x-point.x,e.z-point.z,Math.max(0,point.y-(e.y+(e.height||1.88)),e.y-point.y));
  if(bodyDistance(player)<radius+player.radius&&(!groundOnly||player.y<1.1)){
    const dir=normalize(player.x-point.x,player.z-point.z);hurtPlayer(damage,dir.x,dir.z,false);
  }
  for(const e of [...enemies])if(!e.dead&&bodyDistance(e)<radius+e.radius&&(!groundOnly||e.y<1.1))hitEnemy(e,damage*2.5,normalize(e.x-point.x,e.z-point.z),6,1,null,{weapon:'explosion'});
  for(const o of nearbyObjects(point.x,point.z,radius+3))if(!o.dead){
    const near=nearestPoint(point.x,point.z,o),y=clamp(point.y,o.baseY??0,(o.baseY??0)+o.h);
    if(Math.hypot(near.x-point.x,near.z-point.z,y-point.y)<radius)hurtObject(o,damage*4,.5,{x:near.x,y,z:near.z},'explosion');
  }
  pulse(point.x,point.z,radius,0xff7b3c,.4);shake=Math.max(shake,.15);audio.play('break',.8);
}
function beastBeamHit(from,to,dt,hits){
  const hit=firstHammerHit(from,to,segmentObjects(from,to,.3),.3);
  const end=hit?new THREE.Vector3(hit.x,hit.y,hit.z):to;
  const direction=normalize(to.x-from.x,to.z-from.z);
  const test=(target,point,radius,damage)=>{if(!hits.has(target)&&distanceToBeam(point,from,end)<radius){hits.add(target);damage();}};
  test(player,{x:player.x,y:player.y+.9,z:player.z},.85,()=>hurtPlayer(42*(boss?.damageScale||1),direction.x,direction.z,false));
  for(const e of enemies)if(!e.dead)test(e,{x:e.x,y:e.y+1,z:e.z},e.radius+.35,()=>hitEnemy(e,130,direction,4,0,null,{weapon:'explosion'}));
  if(hit&&!hits.has(hit.target)){hits.add(hit.target);hurtObject(hit.target,210,.5,hit,'explosion');}
  return end;
}
const BEAST_CUES={missiles:['ΠΥΡΑΥΛΟΙ ΑΠΟ ΨΗΛΑ','Βγες από τους κόκκινους κύκλους!'],rockets:['ΟΜΟΒΡΟΝΤΙΑ ΡΟΥΚΕΤΩΝ','Κινήσου πλάγια — ο στόχος έχει κλειδώσει.'],laser:['ΦΟΡΤΙΣΗ LASER','Απόφυγε τη γραμμή και τη σάρωση.'],stomp:['ΣΥΝΘΛΙΨΗ','Μακριά από τα πόδια — ή πήδα!'],rearStomp:['ΠΙΣΩ ΣΥΝΘΛΙΨΗ','Τα πίσω πόδια σηκώνονται — βγες από τους κύκλους ή πήδα!']};
function spawnBoss(){
  bossSpawned=true;
  const mesh=beastRig,u=mesh.userData;mesh.rotation.set(0,0,0);u.head.rotation.y=0;mesh.position.set(0,u.groundOffset,0);u.pose();
  const box=new THREE.Box3().setFromObject(mesh,true),size=box.getSize(new THREE.Vector3());
  const location=beastPortalLocation(player,size.z,BOUNDS),half=box.max.z+.8;
  const pos={x:location.x-location.nx*half,z:location.z-location.nz*half};
  const hp=beastHealth(level,sector,round),plane=u.reveal.plane;
  plane.normal.set(location.nx,0,location.nz);plane.constant=-location.nx*location.x-location.nz*location.z;
  u.reveal.sync();
  boss={mesh,beast:true,type:'boss',level:enemyLevel('boss',round),slowTime:0,slowFactor:1,x:pos.x,z:pos.z,y:0,vx:0,vz:0,radius:Math.max(size.x,size.z)*.5,w:size.x,d:size.z,h:size.y,height:size.y,hp,maxHp:hp,damageScale:1+Math.min(2,(level-1)*.025),materials:u.materials,flash:0,stagger:0,state:'enter',timer:0,attack:0,telegraph:null,enraged:false,dead:false,walk:0,crushTimer:0,rearCooldown:0,entryPlane:plane,
    entry:{location,leading:half,stage:'opening',time:0,distance:0,length:size.z+1.6}};initEnemyReaction(boss,spawnCounter+100);
  mesh.position.set(pos.x,u.groundOffset,pos.z);mesh.rotation.y=location.yaw;mesh.visible=true;u.pose();
  boss.geometryHit=(start,end,radius)=>{const hit=beastCollision.geometryHit(boss,start,end,radius);return hit&&(boss.state!=='enter'||plane.distanceToPoint(hit)>=0)?hit:null;};
  // Oversized oval continues below the street surface. Its visible arch is
  // wide at road level, so the feet and both upper corners fit the aperture.
  beastPortal.open(location,size.x*1.5,size.y*1.5);
  $('bossHud').hidden=false;
  announce('ΡΗΓΜΑ ΣΤΟΝ ΔΡΟΜΟ','Ο Κολοσσός πλησιάζει. Κράτα απόσταση από την πύλη!',3);audio.play('boss');
  player.hp=Math.min(player.maxHp,player.hp+30);toast('Ο ΚΟΛΟΣΣΟΣ ΠΛΗΣΙΑΖΕΙ','+30 ζωή · Η πύλη και ο Κολοσσός σημειώνονται στον χάρτη.');
}
function updateBeastEntry(b,dt){
  const e=b.entry,u=b.mesh.userData;
  beastPortal.facePlayer(player,dt);const yaw=beastPortal.root.rotation.y;Object.assign(e.location,{yaw,nx:Math.sin(yaw),nz:Math.cos(yaw)});
  if(e.stage!=='roar'){b.entryPlane.normal.set(e.location.nx,0,e.location.nz);b.entryPlane.constant=-e.location.nx*e.location.x-e.location.nz*e.location.z;u.reveal.sync();}
  if(e.stage==='opening'){
    b.x=e.location.x-e.location.nx*e.leading;b.z=e.location.z-e.location.nz*e.leading;b.mesh.position.set(b.x,u.groundOffset,b.z);b.mesh.rotation.y=yaw;u.pose();
    e.time+=dt;beastPortal.update(dt,Math.min(1,e.time/BEAST_ENTRY.opening));
    if(e.time>=BEAST_ENTRY.opening){e.stage='walking';e.time=0;}return;
  }
  if(e.stage==='walking'){
    beastPortal.update(dt,1);const step=Math.min(e.length-e.distance,e.length/BEAST_ENTRY.walking*dt);
    const remaining=e.leading-e.distance-step,next={x:e.location.x-e.location.nx*remaining,z:e.location.z-e.location.nz*remaining,y:0,yaw,walk:b.walk+dt,moving:1,stomp:0};
    if(moveBeast(b,next,dt))e.distance+=step;
    if(e.distance>=e.length-1e-6){e.stage='roar';e.time=0;b.entryPlane.constant=1e6;u.reveal.sync();audio.play('boss');shake=Math.max(shake,.35);for(const foot of u.feet())pulse(foot.x,foot.z,5.8,0x93dfff,.65);}
    return;
  }
  e.time+=dt;const roar=Math.sin(Math.min(1,e.time/BEAST_ENTRY.roar)*Math.PI);
  moveBeast(b,{x:b.x,z:b.z,y:0,yaw:e.location.yaw,walk:b.walk,moving:0,stomp:0,roar},dt);
  beastPortal.update(dt,Math.max(0,1-e.time/BEAST_ENTRY.closing));
  if(e.time>=BEAST_ENTRY.closing)beastPortal.reset();
  if(e.time>=BEAST_ENTRY.roar){b.state='walk';b.timer=1.2;u.pose();announce('Ο ΚΟΛΟΣΣΟΣ ΠΕΡΑΣΕ','Θωράκιση ενεργή. Χτύπα όταν ανακτά δυνάμεις!',3);}
}
function moveBeast(b,next,dt){
  const u=b.mesh.userData,old={x:b.x,y:b.y,z:b.z,yaw:b.mesh.rotation.y,walk:b.walk};
  const oldPose={...u.poseState},oldBody=u.body.quaternion.clone(),oldHead=u.head.quaternion.clone();
  b.mesh.position.set(next.x,next.y+u.groundOffset,next.z);b.mesh.rotation.y=next.yaw;
  u.pose({time:next.walk,moving:next.moving,stomp:next.stomp,rearStomp:next.rearStomp||0,roar:next.roar||0});
  const headPoint=u.head.getWorldPosition(tempV);
  u.head.rotation.y=Math.atan2(player.x-headPoint.x,player.z-headPoint.z)-next.yaw;
  u.head.rotation.x=clamp(Math.atan2(headPoint.y-player.y-1,Math.max(5,Math.hypot(headPoint.x-player.x,headPoint.z-player.z)))-(next.roar||0)*.45,-.55,.38);
  u.body.rotation.x=b.impact?Math.sin(Math.PI*Math.min(1,b.impact.time/b.impact.duration))*.025:0;
  const contacts=beastObstacleContacts(b.mesh,nearbyObjects(next.x,next.z,Math.hypot(b.w,b.d)*.5+2),{plane:b.state==='enter'?b.entryPlane:null});
  b.crushTimer=Math.max(0,b.crushTimer-dt);
  if(contacts.length){
    if(b.crushTimer===0){b.crushTimer=.18;
      for(const {object,point} of contacts.slice(0,2))hurtObject(object,Math.max(320,(object.maxHp??object.hp)*.48),.6,point,'explosion');
      shake=Math.max(shake,.13);
    }
    b.mesh.position.set(old.x,old.y+u.groundOffset,old.z);b.mesh.rotation.y=old.yaw;u.pose(oldPose);u.body.quaternion.copy(oldBody);u.head.quaternion.copy(oldHead);
    return false;
  }
  b.x=next.x;b.y=next.y;b.z=next.z;b.walk=next.walk;return true;
}
function updateBoss(dt){
  if(!boss||boss.dead)return;const b=boss;
  b.timer-=dt;b.rearCooldown=Math.max(0,(b.rearCooldown||0)-dt);b.flash=Math.max(0,b.flash-dt);flashMaterials(b,b.flash/.15);
  if(b.state==='enter'){updateBeastEntry(b,dt);resolveBeastPlayerCollision();return;}
  b.slowTime=Math.max(0,b.slowTime-dt);b.stagger=Math.max(0,b.stagger-dt);
  if(b.impact){b.impact.time+=dt;if(b.impact.time>=b.impact.duration)b.impact=null;}
  if(!b.enraged&&b.hp<b.maxHp*.45){b.enraged=true;announce('ΥΠΕΡΦΟΡΤΩΣΗ','Οι προειδοποιήσεις παραμένουν — οι ανάσες του μικραίνουν.',3);}
  const next={x:b.x,y:b.y,z:b.z,yaw:b.mesh.rotation.y,walk:b.walk,moving:0,stomp:0};
  // Keep watching the player even during committed attacks. Feet and the
  // chest stay planted for a locked stomp/laser; their world warnings cannot
  // rotate after the player has already committed to a dodge.
  const targetYaw=Math.atan2(player.x-b.x,player.z-b.z),turn=Math.atan2(Math.sin(targetYaw-next.yaw),Math.cos(targetYaw-next.yaw));
  if(!['laser','stomp','rearStomp'].includes(b.state))next.yaw+=clamp(turn,-dt*1.7,dt*1.7);
  if(b.state==='walk'){
    const dir=normalize(player.x-b.x,player.z-b.z),dist=Math.hypot(player.x-b.x,player.z-b.z),speed=(b.enraged?2.7:2)*(b.slowTime>0?b.slowFactor:1);
    if(dist>b.radius*.8+3){next.moving=1;next.x=clamp(b.x+dir.x*speed*dt,-BOUNDS+b.radius,BOUNDS-b.radius);next.z=clamp(b.z+dir.z*speed*dt,-BOUNDS+b.radius,BOUNDS-b.radius);next.walk+=dt;}
    if(b.timer<=0){const kind=chooseBeastAttack(b,player);beastCombat.start(kind,b,player);b.state=kind;b.timer=10;next.x=b.x;next.z=b.z;next.yaw=b.mesh.rotation.y;next.moving=0;next.walk=b.walk;}
  }else if(b.state==='recover'){
    if(b.timer<=0){b.state='walk';b.timer=b.enraged?.8:1.6;}
  }else if(!beastCombat.attack){b.state='recover';b.timer=b.enraged?1.4:2.3;}
  const a=beastCombat.attack,lift=a?Math.sin(Math.min(1,a.time/a.windup)*Math.PI/2)*(a.launched?0:1):0;next.stomp=a?.kind==='stomp'?lift:0;next.rearStomp=a?.kind==='rearStomp'?lift:0;
  moveBeast(b,next,dt);
  resolveBeastPlayerCollision();
  beastCombat.update(dt,b,player,camera);
}
function resolveBeastPlayerCollision(){
  if(mountRide?.active){mountRide.move(beastCollision,0,0,0);mountRide.place(player);poseHero(0);}
  else beastCollision.moveBody(player,0,0,{radius:player.radius,height:1.88,grounded:player.y===0});
}
function defeatBoss(){
  if(!boss||boss.dead)return;boss.dead=true;if(boss.telegraph){removeEffect(boss.telegraph);boss.telegraph=null;}
  const x=boss.x,z=boss.z;fragments.add(x,3,z,100,[0xffc675,0xb8c7c6,0x566e7a,0xff874a],13,.45,true);pulse(x,z,10,0xffd7a0,1.2);
  releaseBeast();score+=Math.round(2500*comboMultiplier(combatCombo));const reward=scaleComboReward(60,comboMultiplier(combatCombo),comboXpCarry);comboXpCarry=reward.carry;gainXP(reward.amount);for(let n=0;n<4;n++)spawnDrop(x+(n-1.5)*.4,z,'crystal');shake=.7;audio.play('victory');endGame(true);
}
function endGame(won){
  levelStorm?.reset();
  setPhase(won?'victory':'dead');if(!testRun){best=Math.max(best,score);save('ironfall.best',best);}persistCharacter();
  $('endTitle').textContent=won?'Ο ΚΟΛΟΣΣΟΣ ΕΠΕΣΕ.':'ΤΟ ΣΦΥΡΙ ΣΙΩΠΗΣΕ.';
  $('endText').textContent=won?'Η ορδή δεν τελειώνει. Συνέχισε στην ίδια πόλη με τον εξοπλισμό και την εξέλιξή σου.':'Η εξέλιξη και ο εξοπλισμός σου σε περιμένουν. Πάρε μια ανάσα και ξαναχτύπα.';
  $('endStats').innerHTML='<div><strong>'+kills+'</strong><span>ΕΧΘΡΟΙ</span></div><div><strong>'+Math.floor(destructionPercent(world.objects))+'%</strong><span>ΚΑΤΑΣΤΡΟΦΗ</span></div><div><strong>'+relics+'</strong><span>ΚΕΙΜΗΛΙΑ</span></div><div><strong>'+score.toLocaleString('el-GR')+'</strong><span>ΣΚΟΡ · ΡΕΚΟΡ '+best.toLocaleString('el-GR')+'</span></div>';
  $('continueButton').hidden=!won;$('retryButton').textContent=won?'ΝΕΑ ΔΙΑΔΡΟΜΗ':'ΞΑΝΑΠΑΙΞΕ';
  if(!won)audio.play('death');
}

function dodge(){
  if(mountRide?.active)return false;
  if(phase!=='playing'||dashCooldown>0||dashTime>0||leap?.airDashed||Math.abs(stance-stanceTarget)>.005)return false;
  if(touchThrowAim||touchThrowQueued)cancelTouchThrow();
  const mx=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0)+touch.x;
  const mz=(keys.has('KeyS')||keys.has('ArrowDown')?1:0)-(keys.has('KeyW')||keys.has('ArrowUp')?1:0)+touch.y;
  resetAttackChain();punch=null;dashFollowup=1.1;kick=null;dashDirection=Math.hypot(mx,mz)>.05?screenMovement(mx,mz):{...facing};dashTime=leap?.18:.23;dashCooldown=1.5*characterStats.cooldownScale;
  if(leap){leap.airDashed=true;leap.dir={...dashDirection};}player.invincible=Math.max(player.invincible,.3);
  audio.play('dash');pulse(player.x,player.z,1.5,0x86d3c2,.25).position.y=player.y+.08;return true;
}
// Physical kick and secondary impacts. Damage is emitted only on contact,
// once per target per launch; a slowed heavy body is not launched like a zombie.
function startKick(){
  if(phase!=='playing'||kick||kickCooldown>0||leap||dashTime>0||throwWindup||Math.abs(stance-stanceTarget)>.005)return false;
  updateAim(false);const dir=manualAttackDirection();
  punch=null;cancelAttack();swing=null;attackCooldown=0;guardHeld=false;guarding=false;spinRecovery=null;
  facing={...dir};if(!mountRide?.active)hero.rotation.y=Math.atan2(dir.x,dir.z);
  const spec=kickStats(level,levels.kick),rig=hero.userData.weaponRig;spec.damage=Math.round(spec.damage*playerCustomization.power);
  kick={time:0,...spec,dir:{...dir},hit:false,step:0,fromRotation:weaponPoseRotation(),fromPosition:rig.position.clone(),
    previousFoot:hero.userData.rightLeg.userData.foot.getWorldPosition(new THREE.Vector3())};
  kickCooldown=spec.cooldown;audio.play('kick',.25,{exert:true});return true;
}
function makeKickFlight(source,hits=null){
  return {life:2.4,level:source?.level??level,damage:source?.damage??kickStats(level,levels.kick).damage,
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
      target.kickFlight=makeKickFlight({level,damage:k.damage});target.kickFlight.life=5;
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
  if(heavy){const speed=Math.hypot(target.vx||0,target.vz||0);if(speed>.9){target.vx*=.9/speed;target.vz*=.9/speed;}target.slowTime=Math.max(target.slowTime||0,.50);target.slowFactor=.55;}
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
    let normal=target.beast?dir:normalize(target.x-hit.x,target.z-hit.z);if(!normal.x&&!normal.z)normal=dir;
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
function vehicleCrash(car,contact,speed){
  const n=contact.normal,point={x:contact.x+n.x*car.w*.35,y:(car.baseY||0)+.65,z:contact.z+n.z*car.d*.35};
  car.crashTime=.34;car.crashNormal={x:n.x,z:n.z};car.crashStrength=Math.min(1,speed/12);
  car.crashCount=(car.crashCount||0)+1;
  impactClouds?.emit(point.x,point.y,point.z,n,Math.min(2,.7+speed*.07));
  fragments.add(point.x,point.y,point.z,Math.min(18,6+Math.round(speed)),[0xffd78b,0xff8c3b,0x9db4be],Math.min(7,2+speed*.3),.07);
  audio.play('hit',Math.min(1,speed/12),{material:'metal',weapon:'metal'});
  shake=Math.max(shake,Math.min(.20,.04+speed*.01));
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
          if(!flight.hits.has(target))vehicleCrash(car,contact,speed);
          applyBodyCollisionHit(target,Math.min(160,impact.energy*.65+speed*2),n,flight,impact,bodyMass(car));
          if(target.kickFlight)target.kickFlight.hits.add(car);
        }
      }else{
        // Buildings never acquire velocity. Vehicles can shunt another car,
        // using the same mass law rather than copying the attacker's speed.
        const obstacle=isVehicle(target)?target:{...target,mass:Infinity,isBuilding:true,vx:0,vz:0};
        const impact=transferMomentum(car,obstacle,n,.03);
        if(!flight.hits.has(target)&&impact.impulse){
          vehicleCrash(car,contact,speed);
          flight.hits.add(target);const damage=Math.min(200,Math.round(impact.energy*.40));
          const p={x:contact.x+n.x*car.w*.35,y:.75,z:contact.z+n.z*car.d*.35};
          hurtObject(target,Math.max(1,damage),.35,p,'metal');hurtObject(car,Math.max(1,Math.round(damage*.45)),.2,p,'metal');
          if(isVehicle(target)&&!target.dead){target.kickFlight=makeKickFlight(flight,new Set([car,...flight.hits]));target.kickFlight.life=4;movingVehicles.add(target);}
          shake=Math.max(shake,.12);
        }
        if(!isVehicle(target)){const into=oldV.x*n.x+oldV.z*n.z;car.vx=(oldV.x-into*n.x)*.45;car.vz=(oldV.z-into*n.z)*.45;}
      }
      // Do not consume the remainder through a collider. The next fixed step
      // sees updated positions and velocities for every affected body.
    }
    const damping=Math.exp(-1.1*dt);car.vx*=damping;car.vz*=damping;
    // A car must not overlap the player's movement collider after being kicked
    // past them. Resolution uses the moved box, never the stale spatial index.
    if(!car.dead&&player.y<car.h&&circleOverlaps(player.x,player.z,player.radius,car))world.moveBody(player,0,0);
  }
  if(vehicleNavTimer<=0){world.invalidateNavigation?.();vehicleNavTimer=.20;}
}

function guardDimensions(){
  const h=hero.userData.getHeadHalfExtents?.()||{x:.725*stats.size,y:.365*stats.size},gripCenter=stance>.9?.255:.43;
  const fullReach=Math.max(.65,stats.range-.55-(hero.userData.getHeadForwardExtent?.()||.52*stats.size)-.43);
  if((levels.range>0||levels.size>0)&&(fullReach>2.2||h.x>1.4))return {brace:true,reach:fullReach,radius:1.2,height:1.32,forward:.70,gripCenter};
  // Wind around the held grip, with enough room for the complete equipped
  // head. Stock equipment fits a 1.30 m disk within the articulated arm span;
  // very large head upgrades retain their actual larger physical clearance.
  const reach=Math.max(.35,Math.min(1.05,Math.sqrt(Math.max(0,1.3**2-h.x**2))-h.y-.43+gripCenter));
  const radius=Math.hypot(.43+reach-gripCenter+h.y,h.x);
  return {reach,radius,height:radius+.08,forward:.70,gripCenter};
}
const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
function updatePlayer(dt){
  for(const sequence of swingSequences)tickSwingSequence(sequence,dt,!!(swing||spin));
  player.invincible=Math.max(0,player.invincible-dt);player.hurtAgo+=dt;
  hammerLightning=Math.max(0,hammerLightning-dt);
  kickCooldown=Math.max(0,kickCooldown-dt);if(kick)kick.time+=dt;
  dashFollowup=Math.max(0,dashFollowup-dt);if(punch)punch.time+=dt;
  dashCooldown=Math.max(0,dashCooldown-dt);attackCooldown=Math.max(0,attackCooldown-dt);leapCooldown=Math.max(0,leapCooldown-dt);throwCooldown=Math.max(0,throwCooldown-dt);landingRecovery=Math.max(0,landingRecovery-dt);
  if(player.hurtAgo>8&&player.hp<player.maxHp)player.hp=Math.min(player.maxHp,player.hp+1.25*dt);
  if(stance!==stanceTarget){const step=dt/1.05;stance=Math.abs(stance-stanceTarget)<=step?stanceTarget:stance+Math.sign(stanceTarget-stance)*step;}
  const move=movementDirection(),moving=Math.hypot(move.x,move.z)>.01&&movementStrength()>.001;
  if(leap&&moving&&dashTime<=0){
    // Steer through continuous angles while retaining jump momentum. Turning
    // on the unit circle handles an exact reversal without a zero-vector snap.
    const from=Math.atan2(leap.dir.x,leap.dir.z),to=Math.atan2(move.x,move.z);
    const delta=Math.atan2(Math.sin(to-from),Math.cos(to-from));
    const angle=from+delta*(1-Math.exp(-18*dt*movementStrength()));
    leap.dir={x:Math.sin(angle),z:Math.cos(angle)};
  }
  updateAim(false);guarding=guardHeld&&!swing&&!spin&&!weaponBusy()&&!chargeStarted;
  // Walking follows travel; attacking follows deliberate manual direction.
  // Once contact starts, the stroke keeps its heading so a 180-degree mouse
  // flick cannot teleport a damaging swept segment through the crowd.
  if(!spin){
    if(punch)facing={...punch.dir};
    else if(kick)facing={...kick.dir};
    else if(leap)facing={...leap.dir};
    else if(dashTime>0)facing={...dashDirection};
    else if(swing){
      if(!swing.blocked&&swing.time/swing.duration<SWING_CONTACT_START){const d=manualAttackDirection();swing.fx=d.x;swing.fz=d.z;}
      facing={x:swing.fx,z:swing.fz};
    }else if(moving)facing=move;
    else if(throwWindup)facing={...throwWindup.dir};
    else if(touch.aimX||touch.aimY)facing=screenMovement(touch.aimX,touch.aimY);
    else if(pointer.active)facing={...aim};
  }
  if(guarding)guardAngle+=dt*19;
  if(mountRide?.active){
    mountRide.update(dt,{player,hero,world,move,strength:movementStrength(),up:keys.has('Space')||mountTouch.up,down:keys.has('KeyX')||keys.has('ControlLeft')||mountTouch.down,boost:keys.has('ShiftLeft')||keys.has('ShiftRight')||mountTouch.boost});
    if(!swing&&!punch&&!kick&&!throwWindup&&!touchThrowAim)facing=manualAttackDirection();
    mountRide.contacts(enemies,(target,damage,dir,force)=>hitEnemy(target,damage,dir,force,1),world);
  }else if(leap){
    const l=leap;l.time+=dt;
    if(l.strike){
      l.attackTime+=dt;
      if(l.attackHeld&&characterStats.canAirSmash&&!l.slam&&l.attackTime>=.22){l.slam=true;audio.play('charge',.65);}
      const ready=l.attackTime>=(l.attackHeld&&characterStats.canAirSmash?.22:.075);
      if(ready&&l.time>=.12&&!l.diving){
        l.diving=true;l.vy=Math.min(l.vy,l.slam?-22:-8.5);
        audio.play('swing',l.slam?1:.35,{variant:'two-overhead',weapon:characterStats.weaponTier<2?'wood':'metal',exert:true});
      }
    }
    l.vy-=(l.diving?38:30)*dt;
    // Sweep the player's body against the surviving model faces: roof tiers,
    // signs and ledges can support the feet without making a giant solid box.
    const inAirDash=dashTime>0;
    const leapSpeed=(inAirDash?19:characterStats.canAirSmash?(l.diving?7.2:8.2):5.8)*characterStats.mobilityScale;
    const travel=inAirDash?dashDirection:l.dir;
    const motion=world.moveBody(player,travel.x*leapSpeed*dt,travel.z*leapSpeed*dt,{dy:l.vy*dt,grounded:false});
    if(motion.ceilingHit)l.vy=0;
    if(inAirDash){dashTime=Math.max(0,dashTime-dt);if(Math.random()<.5)fragments.add(player.x,player.y+.25,player.z,1,[0x7ac9bd],1,.055);}
    if(motion.landed&&l.vy<=0)landLeap();
  }else{
    let dx,dz;
    if(dashTime>0){dashTime=Math.max(0,dashTime-dt);dx=dashDirection.x*19*characterStats.mobilityScale*dt;dz=dashDirection.z*19*characterStats.mobilityScale*dt;if(Math.random()<.7)fragments.add(player.x,.15,player.z,1,[0x7ac9bd,0xa6ddcd],1,.06);}
    else{const speed=stats.speed*movementStrength()*(kick?.28:guarding?.55:spin?.84:swing?.92:Math.abs(stance-stanceTarget)>.005?.55:landingRecovery>0?.25:1);dx=move.x*speed*dt;dz=move.z*speed*dt;}
    if(kick){
      // The added reach is a real, collision-checked step and hip sweep.
      const step=Math.max(0,kick.range-1.30)*sampleKickMotion(kick.time/kick.duration).extension;
      const advance=Math.max(0,step-kick.step);kick.step=Math.max(kick.step,step);
      dx+=kick.dir.x*advance;dz+=kick.dir.z*advance;
    }
    dx+=player.vx*dt;dz+=player.vz*dt;player.vx*=Math.exp(-9*dt);player.vz*=Math.exp(-9*dt);
    player.vy=(player.vy||0)-20*dt;
    const actual=world.moveBody(player,dx,dz,{dy:player.vy*dt});player.walk+=Math.hypot(actual.x,actual.z)*6;
  }
  if(spinRecovery){spinRecovery.time+=dt;if(spinRecovery.time>=.12)spinRecovery=null;}
  if(attackBuffer){attackBuffer.life-=dt;if(attackBuffer.life<=0)attackBuffer=null;}
  if(throwFlight&&!punch&&!kick&&(chargeHeld||attackBuffer)&&attackCooldown<=0&&!guardHeld){
    beginPunch();
  }
  if(spinCharge){spinCharge.life-=dt;if(spinCharge.life<=0)spinCharge=null;}
  if(chargeHeld){
    holdElapsed+=dt;
    if(!spin&&holdElapsed>=SPIN_HOLD_SECONDS&&!weaponBusy()&&!guardHeld){
      let previousHits=null;
      if(spinCharge&&swing&&swing.time/swing.duration>=.86){previousHits=swing.hits;swing=null;attackCooldown=0;}
      if(!swing&&attackCooldown<=0){
        if(spinCharge&&!mountRide?.active)startSpin(previousHits);
        else{attackBuffer=null;chargeStarted=true;charge=0;beginSwing();}
      }
    }
  }
  if(attackBuffer&&!chargeHeld&&!spin&&swing&&swing.time/swing.duration>=.74&&!weaponBusy()&&!guardHeld){swing=null;attackCooldown=0;}
  if(attackBuffer&&!chargeHeld&&!spin&&!swing&&attackCooldown<=0&&!weaponBusy()&&!guardHeld){
    attackBuffer=null;chargeStarted=true;charge=0;beginSwing();
  }
  if(spin){
    const s=spin,oldCycle=s.cycle;s.time+=dt;const turn=advanceSpinMomentum(s,dt)*(.45+.55*smooth(s.time/.12));
    s.rotation+=turn;s.angle-=turn;s.cycle=Math.floor(s.rotation/(Math.PI*2));s.recoil=Math.max(0,s.recoil-dt*12);
    if(s.cycle>oldCycle){
      audio.play('swing',.25,{weapon:characterStats.weaponTier<2?'wood':'metal',exert:false});
      for(const target of s.hitTimes.keys())if(target.dead){s.hitTimes.delete(target);s.hitAngles.delete(target);s.touching.delete(target);s.entryHits.delete(target);}
    }
  }
  if(swing)swing.time+=dt;
  if(touchThrowAim){
    const g=touchThrowAim;g.time+=dt;
    g.channeling=g.mode==='hold'&&g.pressed&&canThrow()&&!guardHeld;
    if(g.channeling){
      if(!g.channelFromRotation){g.channelFromRotation=weaponPoseRotation();g.channelFromPosition=hero.userData.weaponRig.position.clone();g.channelFromReach=hero.userData.reachScale;}
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
    if(spin&&spin.momentum<=0)stopSpin(true);
  }else if(guarding){
    weaponTrail(headPrevious,headNow,.16,0x8ce4d8);
    for(const e of [...enemies]){if((guardHits.get(e)||0)>=elapsed||!facingCoverage(facing,e,player,Math.PI*.42))continue;const contacts=armoryVolumes?catalogHeadHits(headPrevious,headNow,[e]):[firstHammerHit(headPrevious,headNow,[e],.45*stats.size)].filter(Boolean);if(!contacts.length)continue;guardHits.set(e,elapsed+.38*characterStats.cooldownScale);for(const c of contacts)hitEnemy(e,Math.round(stats.power*.3*(c.damageScale||1)),normalize(e.x-player.x,e.z-player.z),6*(c.forceScale||1)*(armoryWeaponStats?.force||1),1.5,c,{weapon:'guard'});if(armoryWeaponStats)armoryEffects.hit(e,armoryWeaponStats,stats.power*.3,contacts[0]);}
  }else if(touchThrowAim?.channeling&&touchThrowAim.channelTime>.10){
    const g=touchThrowAim;
    if(g.channelTime-g.trailTime>=1/45){weaponTrail(g.trailFrom||headPrevious,headNow,.13,0x8aeaff);g.trailTime=g.channelTime;g.trailFrom=headNow.clone();}
  }
  headPrevious.copy(headNow);
  rememberBarbedSegment(swing||spin);
  updateThrownHammer(dt);
  if(touchThrowQueued){
    touchThrowQueued.life-=dt;
    if(touchThrowQueued.life<0)touchThrowQueued=null;
    else if(canThrow()){
      const queued=touchThrowQueued;touchThrowQueued=null;startThrow(queued.dir,queued.channelAngle,queued.target);
    }
  }
  for(const hazard of world.hazards)if((mountRide?.active?mountRide.body.y:player.y)<.4&&Math.hypot(player.x-hazard.x,player.z-hazard.z)<hazard.r)hurtPlayer((hazard.damage||10)*.65,0,0,false);
  updateAim(false);
  updateHammerAura();
}
function poseHero(dt,moving=false){
  const u=hero.userData;u.body.position.x=u.body.position.z=0;
  if(!mountRide?.active){u.setRidingAnchor?.(null);mountedAimYaw=0;}
  const walk=moving&&!leap&&!spin?Math.sin(player.walk):0;
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
    leg.position.set(side*((u.legRest?.spread??.205)+(spin?.03:0)),(u.legRest?.height??.62)+lift*.055,spin?side*Math.sin(spin.rotation)*.055:0);
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
    u.rightLeg.rotation.set(kickPose.hip,u.rightLeg.userData.restYaw||0,(u.rightLeg.userData.restRoll||0)+.045);u.rightLeg.position.z=.08*kickPose.extension;
    u.rightLeg.rotation.y-=.42*kickPose.extension;
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
    const g=guardDimensions();u.setReach?.(g.reach);rig.rotation.set(0,0,g.brace?-.99:guardAngle);
    const shaftDirection=poseDirection.set(0,1,0).applyQuaternion(rig.quaternion);
    rig.position.set(g.brace?.22:0,g.height,g.forward).addScaledVector(shaftDirection,-g.gripCenter);
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
  if(mountRide?.active){
    mountRide.pose(hero,{kick:!!kick});
    const localYaw=Math.atan2(Math.sin(targetAngle-mountRide.yaw),Math.cos(targetAngle-mountRide.yaw));
    if(kick)u.rightLeg.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),localYaw));
    mountedAimYaw=localYaw;
    u.weaponRig.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),localYaw));
  }
  // Keep both wrists within the anatomical span when head/range upgrades
  // make the old ground-clearance lift physically unreachable.
  if((!guarding||guardDimensions().brace)&&!touchThrowAim?.channeling&&!throwWindup)constrainLargeWeaponPose(u,stance>.9);
  u.updateGrip?.();
  flashMaterials(player,player.invincible>0&&player.hurtAgo<1?(Math.sin(visualTime*30)*.5+.5)*.55:0,0xff8b71);
  chargeRing.visible=!!spin;chargeRing.position.set(player.x,player.y+.07,player.z);chargeRing.scale.setScalar(stats.range*.88);chargeRing.material.opacity=spin?.12+Math.sin(spin.rotation*2)*.04:0;chargeRing.material.color.setHex(0xffcb7d);
  const markerDirection=touchThrowQueued||throwWindup?aim:facing;
  directionMarker.position.set(player.x+markerDirection.x*1.15,player.y+.055,player.z+markerDirection.z*1.15);directionMarker.rotation.y=Math.atan2(markerDirection.x,markerDirection.z);directionMarker.visible=phase==='playing'&&!touchThrowAim&&!touchThrowQueued&&!throwWindup;
  if(guardRing){const g=guardDimensions();guardRing.visible=guarding;guardRing.position.set(player.x+facing.x*g.forward,player.y+g.height,player.z+facing.z*g.forward);guardRing.scale.setScalar(g.radius/1.72);guardRing.rotation.set(0,Math.atan2(facing.x,facing.z),0);guardRing.material.opacity=.12+Math.sin(guardAngle*2)*.035;}
  if(groundShadow){groundShadow.position.set(player.x,.035,player.z);groundShadow.scale.setScalar(1+player.y*.035);groundShadow.material.opacity=clamp(.34-player.y*.018,.15,.34);groundShadow.visible=phase!=='menu';}
  if(landingMarker){landingMarker.visible=!!leap;landingMarker.position.set(player.x,.09,player.z);landingMarker.scale.setScalar(leap?.slam?5.2+stats.quake*.7:leap?.strike?1.65:.9);landingMarker.material.color.setHex(leap?.slam?0xffbf6d:0x9edac9);}
}
function updateDrops(dt){
  for(let i=drops.length-1;i>=0;i--){
    const d=drops[i];d.age+=dt;d.life-=dt;const distance=Math.hypot(player.x-d.x,player.z-d.z);
    const material=MATERIAL_TYPES.includes(d.kind),magnet=material?6:d.kind==='relic'?1.7:3.8;
    if(distance<magnet&&d.age>.4){const dir=normalize(player.x-d.x,player.z-d.z);const speed=d.kind==='relic'?4.5:9,travel=Math.min(distance,speed*dt);d.x+=dir.x*travel;d.z+=dir.z*travel;}
    d.mesh.position.set(d.x,.45+Math.sin(visualTime*3+d.phase)*.13,d.z);d.mesh.rotation.y+=dt*(d.kind==='relic'?.9:2.5);
    if(Math.hypot(player.x-d.x,player.z-d.z)<(material?1.3:.8)&&d.age>.45){
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
    if(isVehicle(o)){
      o.crashTime=Math.max(0,(o.crashTime||0)-dt);
      const recoil=o.crashTime>0?Math.sin((.34-o.crashTime)*27)*o.crashTime*(o.crashStrength||0):0;
      o.mesh.rotation.x=o.baseRotation.x+recoil*(o.crashNormal?.z||0)*.7;
      o.mesh.rotation.z+=recoil*(o.crashNormal?.x||0)*.7;
      o.mesh.position.y=o.baseY+Math.abs(recoil)*.2;
    }
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
  updatePlayer(dt);hero.userData.armoryShieldModel?.userData.setGuard?.(guarding?1:0);if(phase!=='playing')return;
  armoryEffects.update(dt);
  updateMovingVehicles(dt);
  updateEnemies(dt);if(phase!=='playing')return;
  updateBoss(dt);if(phase!=='playing')return;
  mountWeapons?.update(dt,mountRide,{enemies:boss&&!boss.dead?[...enemies,boss]:enemies,world,camera,hero});if(phase!=='playing')return;
  updateDrops(dt);updateEncounter(dt);checkGoal();
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
  const destructionValue=destructionPercent(world.objects),percent=battleProgress(destructionValue,battleKills);
  const nextGate=BOSS_GATES[bossGate],target=nextGate?.threshold??GOAL;
  $('goalValue').textContent=Math.floor(percent)+'%';$('goalTarget').textContent=' / '+target+'%';$('goalFill').style.width=Math.min(100,percent/target*100)+'%';
  $('goalDestruction').textContent=Math.floor(destructionValue)+'%';$('goalEnemies').textContent=battleKills+'%';
  const outstanding=encounter?encounter.escorts.size+encounter.gate.escort.length-encounter.sent:0;
  $('objectiveText').textContent=bossSpawned?boss&&!boss.dead?'ΝΙΚΗΣΕ ΤΟΝ ΚΟΛΟΣΣΟ':'Ο ΚΟΛΟΣΣΟΣ ΕΠΕΣΕ'
    :encounter?encounter.entry?'ΑΝΟΙΓΕΙ ΠΥΛΗ':encounter.leader.dead?'ΣΥΝΟΔΕΙΑ: '+outstanding:encounter.gate.name+' · ΣΥΝΟΔΕΙΑ: '+outstanding
    :target+'% · '+(nextGate?.name||'ΚΟΛΟΣΣΟΣ');
  $('sectorValue').textContent=String(sector).padStart(2,'0');$('killsValue').textContent=kills;$('relicValue').textContent=relics;$('roundValue').textContent=String(round).padStart(2,'0');
  $('waveEnemiesValue').textContent=boss&&!boss.dead?String(enemies.length):String(Math.max(0,(wave?.total||0)-(wave?.defeated||0)))+' / '+(wave?.total||10);
  $('waveStatus').textContent=boss&&!boss.dead?'ΤΕΛΙΚΟΣ BOSS':wave?.state==='break'?'ΚΥΜΑ ΚΑΘΑΡΟ · ΕΠΟΜΕΝΟ ΣΕ '+Math.ceil(wave.breakTimer)+'s':enemies.filter(e=>e.waveNumber===wave?.number).length+' ΕΝΕΡΓΟΙ · '+Math.max(0,(wave?.total||0)-(wave?.spawned||0))+' ΕΡΧΟΝΤΑΙ';
  $('timeValue').textContent=String(Math.floor(elapsed/60)).padStart(2,'0')+':'+String(Math.floor(elapsed%60)).padStart(2,'0');
  $('chargeFill').style.width=throwFlight?(punch?Math.round(clamp(punch.time/punch.duration,0,1)*100)+'%':'0%'):spin?Math.round(spin.momentum*100)+'%':spinCharge?'100%':'0%';
  $('chargeWrap').classList.toggle('spinning',!!spin);
  $('chargeText').textContent=throwFlight?'ΚΡΑΤΑ ΕΠΙΘΕΣΗ: ΓΡΟΘΙΕΣ':spin?'ΧΤΥΠΑ ΓΙΑ ΝΑ ΚΡΑΤΗΣΕΙΣ ΤΗΝ ΟΡΜΗ':chargeHeld?'ΧΤΥΠΑ ΓΙΑ ΟΡΜΗ':'ΚΡΑΤΑ ΕΠΙΘΕΣΗ · ΟΡΜΗ ΑΠΟ ΧΤΥΠΗΜΑΤΑ';
  document.querySelector('[data-key="ShiftLeft"]')?.classList.toggle('cooldown',dashCooldown>0);
  const activeBoss=boss??(encounter&&!encounter.leader.dead?encounter.leader:null);
  $('bossHud').hidden=!activeBoss;
  if(activeBoss){
    $('bossStatus').textContent=boss?(boss.state==='enter'?'ΕΞΟΔΟΣ ΑΠΟ ΤΗΝ ΠΥΛΗ':boss.state==='recover'?'ΑΝΟΙΓΜΑ · ΧΤΥΠΑ ΤΩΡΑ':boss.enraged?'ΚΟΛΟΣΣΟΣ · ΥΠΕΡΦΟΡΤΩΣΗ':'ΚΟΛΟΣΣΟΣ · ΘΩΡΑΚΙΣΗ'):encounter.gate.name;
    $('bossSubtitle').textContent=boss?'Ο ΦΥΛΑΚΑΣ ΤΟΥ ΧΥΤΗΡΙΟΥ':encounter.entry?'ΕΞΟΔΟΣ ΑΠΟ ΤΗΝ ΠΥΛΗ':activeBoss.type==='siegeTransformer'
      ?(activeBoss.attackPoint&&['windup','shellFlight'].includes(activeBoss.state)?'ΒΓΕ ΑΠΟ ΤΟΝ ΚΥΚΛΟ ΒΟΛΗΣ':activeBoss.fold>=1?'TANK · ΕΥΑΛΩΤΟΣ ΠΙΣΩ':activeBoss.fold>0?'ΜΕΤΑΜΟΡΦΩΣΗ':'ΠΕΡΠΑΤΗΤΗΣ')
      :(encounter.escorts.size?'ΘΩΡΑΚΙΣΗ ΑΠΟ ΣΤΡΑΤΙΩΤΕΣ':'ΕΚΤΕΘΕΙΜΕΝΟΣ');
    $('bossFill').style.backgroundColor=boss?enemyHealthColor(boss.level):activeBoss.type==='hollowMarshal'?'#ce8bf3':'#ffb668';
    $('bossFill').style.width=Math.max(0,activeBoss.hp/activeBoss.maxHp*100)+'%';
    $('bossValue').textContent=(boss?.enraged?'ΙΙ · ':'')+Math.max(0,Math.ceil(activeBoss.hp))+' / '+Math.ceil(activeBoss.maxHp)+' HP';
  }
  const stanceLabel=throwFlight?'ΑΟΠΛΟΣ · ΓΡΟΘΙΕΣ + ΚΛΩΤΣΙΑ':Math.abs(stance-stanceTarget)>.005?'ΑΛΛΑΓΗ ΛΑΒΗΣ…':stance>.95?'ΔΥΟ ΧΕΡΙΑ · +25% ΙΣΧΥΣ':characterStats.hasShield?'ΣΦΥΡΙ + ΑΣΠΙΔΑ':'ΛΑΒΗ ΜΕ ΕΝΑ ΧΕΡΙ';
  for(const id of ['stanceValue','mobileStanceValue'])if($(id))$(id).textContent=stanceLabel;
  for(const id of ['stanceButton','mobileStanceButton'])$(id)?.setAttribute('aria-pressed',String(stanceTarget===1));
  if($('guardValue'))$('guardValue').textContent=guarding?'ΠΡΟΣΤΑΣΙΑ ΜΠΡΟΣΤΑ':throwFlight?'ΧΩΡΙΣ ΣΦΥΡΙ':touchLayout?'ΚΡΑΤΑ ΓΙΑ ΑΜΥΝΑ':'ΚΡΑΤΑ RMB';
  if($('leapValue'))$('leapValue').textContent=leap?(throwFlight?'ΓΡΟΘΙΑ / DASH':leap.slam?'ΣΥΝΤΡΙΒΗ!':touchLayout?'ΧΤΥΠΗΜΑ / DASH':'ΚΛΙΚ: SMASH · SHIFT: DASH'):leapCooldown>0?leapCooldown.toFixed(1)+'s':'ΕΤΟΙΜΟ';
  if($('throwValue'))$('throwValue').textContent=touchThrowQueued?'ΕΤΟΙΜΑΖΕΤΑΙ':touchThrowAim?(touchThrowAim.mode==='confirm'?'ΠΑΤΑ ΞΑΝΑ · ΡΙΨΗ':'ΑΦΗΣΕ · ΡΙΨΗ'):throwFlight?(throwFlight.grounded?'ΜΑΖΕΨΕ ΤΟ ΟΠΛΟ':throwFlight.returning?'ΕΠΙΣΤΡΟΦΗ':throwFlight.hitCount&&characterStats.canRicochet?'ΑΛΥΣΙΔΑ '+throwFlight.hitCount:'ΣΤΟΝ ΑΕΡΑ'):throwCooldown>0?throwCooldown.toFixed(1)+'s':hammerLightning>0?'ΚΕΡΑΥΝΟΣ!':settings.throwMode==='confirm'?'ΠΑΤΑ · ΣΤΟΧΕΥΣΗ':'ΚΡΑΤΑ · ΣΤΟΧΕΥΣΗ';
  const aimStatus=$('throwAimStatus');
  if(aimStatus){
    aimStatus.hidden=phase!=='playing'||!touchThrowAim;
    if(touchThrowAim){
      const target=throwLock?'ΣΤΟΧΟΣ ΚΛΕΙΔΩΜΕΝΟΣ':settings.throwAutoLock?'ΧΩΡΙΣ ΣΤΟΧΟ · ΕΛΕΥΘΕΡΗ ΡΙΨΗ':'ΧΕΙΡΟΚΙΝΗΤΗ ΣΤΟΧΕΥΣΗ';
      const action=touchThrowAim.mode==='confirm'?(touchLayout?'ΠΑΤΑ ΡΙΨΗ ΞΑΝΑ':'R ΞΑΝΑ ΓΙΑ ΡΙΨΗ'):'ΑΦΗΣΕ ΓΙΑ ΡΙΨΗ';
      const text=target+' · '+action+(touchLayout?'':' · ESC ΑΚΥΡΩΣΗ');
      if(aimStatus.textContent!==text)aimStatus.textContent=text;
    }
  }
  if($('dashValue'))$('dashValue').textContent=dashTime>0?'ΑΠΟΦΥΓΗ!':dashCooldown>0?dashCooldown.toFixed(1)+'s':'ΕΤΟΙΜΟ';
  updateAttackFeedback();
  $('guardButton')?.classList.toggle('active',guardHeld||guarding);
  $('leapButton')?.classList.toggle('cooldown',!leap&&leapCooldown>0);
  $('leapButton')?.classList.toggle('airborne',!!leap);
  $('throwButton')?.classList.toggle('cooldown',!!(throwFlight||throwWindup)||throwCooldown>0);
  $('throwButton')?.classList.toggle('aiming',!!touchThrowAim);
  $('throwButton')?.setAttribute('aria-pressed',String(!!touchThrowAim));
  const throwLabel=touchThrowAim?(touchThrowAim.mode==='confirm'?'Πάτησε ξανά για ρίψη προς το βέλος στο έδαφος.':'Άφησε για ρίψη προς το βέλος στο έδαφος.'):(settings.throwMode==='confirm'?'Πρώτο πάτημα για στόχευση, δεύτερο για ρίψη.':'Κράτα για στόχευση και άφησε για ρίψη.');
  $('throwButton')?.setAttribute('aria-label',throwLabel);$('throwButton')?.setAttribute('title',throwLabel);
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
  button.classList.toggle('spin-active',!!spin);button.classList.toggle('spin-pending',!unarmed&&chargeHeld&&!spin&&!mountRide?.active);
  button.dataset.action=unarmed?'punch':air?'air':holding?'spin':'attack';
  $('attackIcon')?.setAttribute('href',unarmed?'#a-punch':air?'#a-slam':holding?'#a-spin':'#a-swing');
  $('attackTouchIcon')?.setAttribute('href',unarmed?'#t-punch':air?'#t-slam':holding?'#t-spin':'#t-attack');
  $('attackName').textContent=unarmed?'ΓΡΟΘΙΕΣ':air?(leap.slam||leap.strike?'ΕΤΟΙΜΟ':'ΜΙΚΡΟ SMASH'):holding?'360°':characterStats.weaponTier<2?'ΧΤΥΠΗΜΑ':'ΣΦΥΡΙΑ';
  $('attackValue').textContent=unarmed?'ΚΡΑΤΑ · ΣΥΝΕΧΕΙΣ ΓΡΟΘΙΕΣ':air?(leap.slam?'ΜΕΓΑΛΟ SMASH':leap.strike?'ΣΤΗΝ ΠΡΟΣΓΕΙΩΣΗ':characterStats.canAirSmash?'ΠΑΤΑ · ΚΡΑΤΑ ΓΙΑ ΜΕΓΑΛΟ':'ΠΑΤΑ ΣΤΟΝ ΑΕΡΑ'):spin?'ΟΡΜΗ '+Math.round(spin.momentum*100)+'%':chargeHeld?'ΧΤΥΠΑ ΓΙΑ ΟΡΜΗ':'ΠΑΤΑ · ΚΡΑΤΑ ΓΙΑ ΣΥΝΕΧΕΙΑ';
  const label=unarmed?'Πάτησε για γροθιά. Κράτα για διαδοχικές γροθιές. Η κλωτσιά παραμένει στο E.':air?(leap.slam||leap.strike?'Το χτύπημα είναι έτοιμο για την προσγείωση.':characterStats.canAirSmash?'Πάτησε στον αέρα για μικρό smash. Κράτα για μεγάλη συντριβή.':'Πάτησε στον αέρα για μικρό smash.'):spin?'Κάθε πραγματικό χτύπημα ανανεώνει την ορμή. Στον αέρα η περιστροφή σταματά. Άφησε για άμεσο στοπ.':'Χτύπημα με '+characterStats.weaponName.toLowerCase()+'. Κράτα για επαναλαμβανόμενα χτυπήματα. Μόνο μια επιτυχής επαφή ξεκινά την περιστροφή.';
  button.setAttribute('aria-label',label);button.setAttribute('title',label);
}
function drawMinimap(){
  const c=mapContext,w=map.width,h=map.height,extent=world.bounds||BOUNDS,scale=44/extent;
  const angle=Math.atan2(cameraOffset.x,cameraOffset.z),cos=Math.cos(angle),sin=Math.sin(angle);
  c.fillStyle='#0c181c';c.fillRect(0,0,w,h);
  c.save();c.translate(w/2,h/2);c.rotate(angle);c.scale(scale,scale);
  c.fillStyle='#24393d';c.fillRect(-extent,-extent,extent*2,extent*2);c.fillStyle='#14262c';
  for(const road of world.layout?.roads||[0]){c.fillRect(road-3.4,-extent,6.8,extent*2);c.fillRect(-extent,road-3.4,extent*2,6.8);}
  c.strokeStyle='#53696c';c.lineWidth=1/scale;c.strokeRect(-extent,-extent,extent*2,extent*2);
  c.fillStyle='#34484b';
  for(const o of world.objects)if(o.isBuilding&&!o.dead)c.fillRect(o.x-o.w/2,o.z-o.d/2,o.w,o.d);
  c.restore();
  const px=e=>w/2+(cos*e.x-sin*e.z)*scale,pz=e=>h/2+(sin*e.x+cos*e.z)*scale;
  const playerX=px(player),playerY=pz(player);
  const marker=(entity,kind)=>{
    const realX=clamp(px(entity),9,w-9),realY=clamp(pz(entity),9,h-9);
    let x=realX,y=realY;
    const dx=x-playerX,dy=y-playerY,d=Math.hypot(dx,dy);
    if(kind!=='enemy'&&d<14){
      const ox=d>.01?dx/d:0,oy=d>.01?dy/d:-1;
      x=clamp(playerX+ox*14,9,w-9);y=clamp(playerY+oy*14,9,h-9);
      if(Math.hypot(x-playerX,y-playerY)<11){x=clamp(playerX-ox*14,9,w-9);y=clamp(playerY-oy*14,9,h-9);}
      c.beginPath();c.lineWidth=1;c.strokeStyle=kind==='mini'?'#f4abff':'#ffc568';c.moveTo(realX,realY);c.lineTo(x,y);c.stroke();
    }
    c.beginPath();c.lineJoin='round';c.lineWidth=kind==='enemy'?1.5:2.2;c.strokeStyle='#071418';
    if(kind==='enemy'){c.arc(x,y,3.3,0,Math.PI*2);c.fillStyle='#ff8d83';}
    else if(kind==='mini'){c.moveTo(x,y-6);c.lineTo(x+6,y);c.lineTo(x,y+6);c.lineTo(x-6,y);c.closePath();c.fillStyle='#f4abff';}
    else{c.arc(x,y,7,0,Math.PI*2);c.fillStyle='#ffc568';}
    c.fill();c.stroke();
    if(kind==='boss'){c.strokeStyle='#452919';c.lineWidth=1.6;c.beginPath();c.moveTo(x-3,y);c.lineTo(x+3,y);c.moveTo(x,y-3);c.lineTo(x,y+3);c.stroke();}
  };
  let ordinary=0,minis=0;
  for(const e of enemies)if(!e.dead&&!e.miniBoss){marker(e,'enemy');ordinary++;}
  for(const e of enemies)if(!e.dead&&e.miniBoss){marker(e,'mini');minis++;}
  if(encounter?.entry){marker(encounter.entry.location,'mini');minis++;}
  const hasBoss=!!boss&&!boss.dead;
  if(hasBoss)marker(boss.state==='enter'&&boss.entry?.stage!=='roar'?boss.entry.location:boss,'boss');
  c.save();c.translate(playerX,playerY);c.rotate(angle-Math.atan2(facing.x,facing.z));
  c.fillStyle='#83f4e7';c.strokeStyle='#071418';c.lineWidth=2;c.beginPath();c.moveTo(0,7);c.lineTo(-5,-4.5);c.lineTo(0,-2);c.lineTo(5,-4.5);c.closePath();c.fill();c.stroke();c.restore();
  const label='Χάρτης: '+ordinary+' εχθροί, '+minis+' mini-boss, '+(hasBoss?'ο Κολοσσός είναι ενεργός':'ο Κολοσσός δεν έχει εμφανιστεί');
  if(map.getAttribute('aria-label')!==label)map.setAttribute('aria-label',label);
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
  const marked=touchThrowAim?(settings.throwAutoLock?throwPreviewTargets:focusedTarget?[focusedTarget]:[]):throwWindup?.target&&!throwWindup.target.dead?[throwWindup.target]:throwFlight?.chainTarget&&!throwFlight.chainTarget.dead?[throwFlight.chainTarget]:[];
  if(!spin&&!guarding&&!leap&&meleeHint){
    const throwing=!!(touchThrowAim||touchThrowQueued||throwWindup);
    const direction=throwing?throwGuidanceDirection():swing?{x:swing.fx,z:swing.fz}:manualAttackDirection();
    const yaw=Math.atan2(direction.x,direction.z),spec=throwing?meleeAimSpec({range:stats.range,twoHanded:stance>.9}):meleeHint;
    c.save();c.strokeStyle=throwing||meleeHintTargets.length?'#f8d48b':'#9dbeb4';c.lineWidth=touchLayout?2:1.5;c.globalAlpha=throwing?.70:.46;c.beginPath();
    for(let i=0;i<=22;i++){
      const a=yaw-spec.halfAngle+i/22*spec.halfAngle*2;
      const p=screenPoint(player.x+Math.sin(a)*spec.range,player.y+.07,player.z+Math.cos(a)*spec.range);
      if(!i)c.moveTo(p.x,p.y);else c.lineTo(p.x,p.y);
    }c.stroke();
    for(const e of meleeHintTargets){
      // Recheck the cheap envelope every frame, so steering away removes the
      // hint immediately even while the throttled obstacle query is cached.
      if(!inMeleeEnvelope(player,direction,e,spec))continue;
      c.globalAlpha=.70;c.strokeStyle='#f7d38b';c.beginPath();
      for(let i=0;i<=24;i++){const a=i/24*Math.PI*2,r=e.radius+.17,p=screenPoint(e.x+Math.sin(a)*r,(e.y||0)+.065,e.z+Math.cos(a)*r);if(!i)c.moveTo(p.x,p.y);else c.lineTo(p.x,p.y);}c.stroke();
    }c.restore();
  }
  for(let index=0;index<marked.length;index++){
    const e=marked[index];
    if(e.dead)continue;
    const focused=index===0,r=e.radius+(focused?.45:.32)+(Math.sin(visualTime*7)*.035);
    c.strokeStyle=focused?'#ffd180':'#8ce4d8';c.globalAlpha=focused?1:.8;c.lineWidth=focused?2.8:1.7;
    // Project four ground-plane brackets; rings stay under the enemy's feet.
    for(let quadrant=0;quadrant<4;quadrant++){
      const base=quadrant*Math.PI/2+Math.PI/12;c.beginPath();
      for(let step=0;step<=10;step++){
        const angle=base+step/10*Math.PI/3,p=screenPoint(e.x+Math.sin(angle)*r,(e.y||0)+.065,e.z+Math.cos(angle)*r);
        if(step===0)c.moveTo(p.x,p.y);else c.lineTo(p.x,p.y);
      }c.stroke();
    }
    const p=screenPoint(e.x,(e.y||0)+.07,e.z);c.font='bold 12px Arial';c.textAlign='center';c.lineWidth=3;c.strokeStyle='#11272c';
    if(settings.throwAutoLock){c.strokeText(String(index+1),p.x,p.y+4);c.fillStyle=focused?'#ffe0a0':'#a4f1e1';c.fillText(String(index+1),p.x,p.y+4);}
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

  const objectNames={townhouse:'ΚΑΤΟΙΚΙΑ',apartment:'ΠΟΛΥΚΑΤΟΙΚΙΑ',shop:'ΚΑΤΑΣΤΗΜΑ',office:'ΓΡΑΦΕΙΑ',townhall:'ΔΗΜΑΡΧΕΙΟ',police:'ΑΣΤΥΝΟΜΙΚΟ ΤΜΗΜΑ',hospital:'ΝΟΣΟΚΟΜΕΙΟ',skyscraper:'ΟΥΡΑΝΟΞΥΣΤΗΣ',construction:'ΕΡΓΟΤΑΞΙΟ',warehouse:'ΑΠΟΘΗΚΗ',policecar:'ΠΕΡΙΠΟΛΙΚΟ',ambulance:'ΑΣΘΕΝΟΦΟΡΟ',car:'ΑΥΤΟΚΙΝΗΤΟ',wall:'ΤΟΙΧΟΣ',tree:'ΔΕΝΤΡΟ',barrel:'ΒΑΡΕΛΙ',hydrant:'ΚΡΟΥΝΟΣ',crate:'ΚΙΒΩΤΙΟ',lamp:'ΦΑΝΑΡΙ',bench:'ΠΑΓΚΑΚΙ'};
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
  menuBackdropReady=false;
  const viewport=window.visualViewport,nextWidth=Math.round(viewport?.width||innerWidth),nextHeight=Math.round(viewport?.height||innerHeight);
  if(screenW!==nextWidth||screenH!==nextHeight)clearInput();
  screenW=nextWidth;screenH=nextHeight;syncTouchControls();
  document.body.style.setProperty('--app-height',screenH+'px');
  if(!renderer||!camera)return;
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
  chargeHeld=false;chargeStarted=false;charge=0;holdElapsed=0;spinCharge=null;
  if(spin)stopSpin();
  if(phase!=='playing')cancelAttack();
  // An already started strike finishes naturally. Releasing never creates a
  // second strike; an explicitly tapped buffered strike remains valid.
  updateAttackFeedback();
}
function cancelAttack(){resetAttackChain();spinCharge=null;if(leap)leap.attackHeld=false;stopSpin();chargeHeld=false;chargeStarted=false;charge=0;attackBuffer=null;holdElapsed=0;if(touchThrowAim||touchThrowQueued)cancelTouchThrow();updateAttackFeedback();}
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
  for(const id of ['soundButton','muteButton','menuSoundButton']){
    const button=$(id);if(!button)continue;
    button.setAttribute('data-audio-control','');
    button.classList.toggle('muted',silent);button.classList.toggle('audio-blocked',blocked);
    button.setAttribute('aria-pressed',String(silent));button.setAttribute('aria-label',label);button.setAttribute('title',label);
  }
  for(const id of ['muteIcon','soundIcon','menuSoundIcon'])$(id)?.setAttribute('href',silent?'#a-sound-off':'#a-sound-on');
  if($('muteValue'))$('muteValue').textContent=silent?'ΚΛΕΙΣΤΟΣ':blocked?'ΠΑΤΑ':'ΣΙΓΑΣΗ';
  const status=silent?'Ο ήχος είναι σε σίγαση.':blocked?'Πάτησε «Δοκιμή ήχου» για ενεργοποίηση.':audio.sampleCount>0?'Ηχογραφημένα εφέ και φωνές έτοιμα.':'Ήχος ενεργός · φόρτωση ηχογραφήσεων…';
  for(const id of ['audioStatus','menuAudioStatus'])if($(id))$(id).textContent=status;
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
  const gesture=touchThrowAim;
  if(gesture&&isTouchPointer(e))return;
  const rect=$('gameCanvas').getBoundingClientRect();
  pointer.x=(e.clientX-rect.left)*screenW/Math.max(1,rect.width);
  pointer.y=(e.clientY-rect.top)*screenH/Math.max(1,rect.height);pointer.active=true;
}
function beginTouchThrow(e){
  if(phase!=='playing'||leap||Math.abs(stance-stanceTarget)>.005)return;
  const pointerId=e?.pointerId??'keyboard',touchInput=isTouchPointer(e);
  // A confirmation is a second complete press, with no double-click timer.
  // Repeated keydown and another finger never consume the current gesture.
  if(touchThrowAim){
    if(touchThrowAim.mode==='confirm'&&!touchThrowAim.pressed){
      Object.assign(touchThrowAim,{pointerId,pressed:true,confirming:true,dragged:false,confirmedTarget:touchThrowAim.lockedTarget,confirmedDirection:{...aim},startX:e?.clientX||0,startY:e?.clientY||0});
    }
    return;
  }
  cancelAttack();guardHeld=false;guarding=false;
  if(touchInput){pointer.active=false;const move=movementDirection();if(move.x||move.z)facing=move;}
  touchThrowAim={pointerId,startX:e?.clientX||0,startY:e?.clientY||0,dx:0,dy:0,dragged:false,
    touchInput,mode:settings.throwMode,pressed:true,confirming:false,lockedTarget:null,
    time:0,channelTime:0,channelAngle:-.7,channeling:false,trailTime:0};
  updateAim();updateHUD();
}
// The throw tile is a button, never a second directional stick. Finger
// wobble/drag cannot redirect a throw; turn with the existing left stick.
function releaseTouchThrow(e){
  if(!touchThrowAim||touchThrowAim.pointerId!==(e?.pointerId??'keyboard'))return;
  const g=touchThrowAim;
  if(g.touchInput&&!g.dragged&&!g.lockedTarget){
    pointer.active=false;
    const move=movementDirection();
    if(move.x||move.z)facing=move;
  }
  updateAim();
  if(g.mode==='confirm'&&!g.confirming){
    g.pressed=false;g.pointerId=null;updateHUD();return;
  }
  // Confirmation never silently swaps the shown target for a newly chosen
  // one between pointerdown and release (or after that target is destroyed).
  if(g.mode==='confirm'&&g.confirmedTarget&&!validThrowLock(g.confirmedTarget)){
    cancelTouchThrow();audio.play('targetCancel');toast('Ο ΣΤΟΧΟΣ ΧΑΘΗΚΕ','Πάτησε ρίψη για νέα στόχευση.');updateHUD();return;
  }
  const direction=g.mode==='confirm'?g.confirmedDirection:{...aim};
  const channelAngle=g.channeling?g.channelAngle:null,target=g.mode==='confirm'?g.confirmedTarget:throwLock;
  touchThrowAim=null;throwPreviewTargets=[];
  if(g.touchInput)pointer.active=false;
  if(phase==='playing'&&!leap&&Math.abs(stance-stanceTarget)<=.005&&!startThrow(direction,channelAngle,target)){
    // Preserve a release made just before recovery ends, with its original
    // direction. Never leave a delayed throw waiting indefinitely.
    touchThrowQueued={dir:direction,target,channelAngle,life:TOUCH_THROW_BUFFER_SECONDS};
  }
  updateHUD();
}
function cancelTouchThrow(){
  if(touchThrowAim?.channeling&&!swing&&!leap&&!throwFlight){const rig=hero.userData.weaponRig;spinRecovery={time:0,fromRotation:weaponPoseRotation(),fromPosition:rig.position.clone(),fromReach:hero.userData.reachScale};}
  if(touchThrowAim?.touchInput)pointer.active=false;
  touchThrowAim=null;touchThrowQueued=null;throwLock=null;throwPreviewTargets=[];
  $('throwButton')?.classList.remove('aiming','queued','channeling');
  if($('throwAimStatus'))$('throwAimStatus').hidden=true;
}
function initInput(){
  $('startButton').onclick=()=>startGame();$('retryButton').onclick=()=>startGame(testRun?activeStartingLevel:1,{test:testRun,resume:!testRun,city:activeCity});
  $('restartButton').onclick=()=>{persistCharacter();setPhase('menu');updateSavedCharacter();};
  $('resumeCharacterButton').onclick=()=>startGame(1,{resume:true});
  $('startingLevel').value='1';
  const preview=()=>{const s=getCharacterStats(createCharacterProgression(Number($('startingLevel').value)));$('startingLoadout').textContent=s.weaponName+' · '+(s.canLightning?'Αναπηδήσεις και κεραυνοί':s.canReturn?'Αυτόματη επιστροφή':s.canAirSmash?'Εναέρια συντριβή':'Μικρό άλμα, ρίψη και συλλογή');};
  $('startingLevel').onchange=preview;preview();$('testStartButton').onclick=()=>startGame(Number($('startingLevel').value),{test:true,city:getLevelCity($('startingLevel').value)});$('forgeButton').onclick=forgeWeapon;
  window.addEventListener('pagehide',persistCharacter);
  $('resumeButton').onclick=()=>setPhase('playing');$('pauseButton').onclick=pauseGame;
  $('continueButton').onclick=()=>{boss=null;$('bossHud').hidden=true;beginWave(round+1);setPhase('playing');audio.play('start');announce('Η ΠΟΛΗ ΑΝΤΕΧΕΙ ΑΚΟΜΑ','Συνέχισε να εξελίσσεσαι. Η επόμενη ορδή πλησιάζει.',3.2);};
  $('soundButton').onclick=toggleSound;if($('muteButton'))$('muteButton').onclick=toggleSound;if($('menuSoundButton'))$('menuSoundButton').onclick=toggleSound;
  if($('closeFatalButton'))$('closeFatalButton').onclick=()=>{$('fatalError').hidden=true;setPhase('menu');};
  $('upgradesToggle').onclick=()=>toggleUpgradePanel();$('upgradeCloseButton').onclick=()=>toggleUpgradePanel(false);
  for(const [id,tab] of [['upgradePowerTab','powers'],['upgradeGearTab','gear']])if($(id)){
    $(id).onclick=()=>{upgradeTab=tab;syncUpgradePanel();audio.play('ui');};
    $(id).addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.code))return;e.preventDefault();e.stopPropagation?.();upgradeTab=e.code==='Home'?'powers':e.code==='End'?'gear':upgradeTab==='powers'?'gear':'powers';syncUpgradePanel();$(upgradeTab==='powers'?'upgradePowerTab':'upgradeGearTab').focus();});
  }
  // A completed tap changes grip without pausing the battle.
  if($('mobileStanceButton'))$('mobileStanceButton').onclick=toggleStance;
  $('settingsButton').onclick=()=>{previousPhase=phase;setPhase('settings');};
  $('closeSettingsButton').onclick=()=>{setPhase(previousPhase);save('ironfall.settings',settings);};
  $('qualitySelect').value=settings.quality;$('shakeToggle').checked=settings.shake;$('volumeRange').value=Math.round(settings.volume*100);
  $('qualitySelect').onchange=e=>{settings.quality=e.target.value;resize();save('ironfall.settings',settings);};
  $('shakeToggle').onchange=e=>{settings.shake=e.target.checked;save('ironfall.settings',settings);};
  $('throwAutoLockToggle').checked=settings.throwAutoLock;
  $('throwAutoLockToggle').onchange=e=>{settings.throwAutoLock=!!e.target.checked;cancelTouchThrow();if(!settings.throwAutoLock&&throwFlight){throwFlight.chainTarget=null;throwFlight.dir=normalize(throwFlight.dir.x,throwFlight.dir.z);}save('ironfall.settings',settings);};
  if($('throwModeSelect')){
    $('throwModeSelect').value=settings.throwMode;
    $('throwModeSelect').onchange=e=>{settings.throwMode=e.target.value==='hold'?'hold':'confirm';cancelTouchThrow();save('ironfall.settings',settings);if(gameReady)updateHUD();};
  }
  $('volumeRange').oninput=e=>{settings.volume=Number(e.target.value)/100;audio.setVolume(settings.volume);if(settings.volume>0&&settings.muted){settings.muted=audio.toggle();}audio.unlock();updateSoundButtons();save('ironfall.settings',settings);};
  updateSoundButtons();
  window.addEventListener('keydown',e=>{
    const handled=['Space','KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftLeft','ShiftRight','Escape','KeyR','KeyZ','KeyQ','KeyU','KeyE','KeyC','KeyI','KeyX','ControlLeft'];
    const focused=document.activeElement,editable=['INPUT','SELECT','TEXTAREA'].includes(focused?.tagName)||focused?.isContentEditable;
    const nativeActivation=['BUTTON','A'].includes(focused?.tagName)&&['Space','Enter'].includes(e.code);
    if(phase==='playing'&&handled.includes(e.code)&&!editable&&!nativeActivation)e.preventDefault();
    if(e.code==='Escape'&&!e.repeat){if(phase==='menu'&&forgeMenu?.closePanels())return;if(phase==='playing'&&(touchThrowAim||touchThrowQueued)){cancelTouchThrow();audio.play('targetCancel');updateHUD();}else if(phase==='playing'&&upgradePanelOpen)toggleUpgradePanel(false);else if(phase==='settings'){setPhase(previousPhase);}else pauseGame();return;}
    if(e.code==='KeyI'&&!e.repeat&&!editable&&gameReady&&['menu','playing','paused'].includes(phase)){e.preventDefault();mountWorkshop.open();return;}
    if(phase==='menu'&&e.code==='Enter'&&!e.repeat&&!$('startButton').disabled&&!forgeMenu?.panelOpen&&!editable&&!nativeActivation){startGame();return;}
    if(phase==='playing'&&upgradePanelOpen&&upgradeTab==='powers'&&['Digit1','Digit2','Digit3'].includes(e.code)){if(!e.repeat)$('upgradeChoices').children[Number(e.code.slice(-1))-1]?.click();return;}
    if(phase!=='playing'||editable||nativeActivation)return;
    if(e.code==='KeyQ'||e.code==='KeyU'){if(!e.repeat)toggleUpgradePanel();return;}
    keys.add(e.code);document.querySelector('[data-key="'+e.code+'"]')?.classList.add('active');
    if(e.code==='Space'&&!e.repeat)startLeap();
    if(e.code==='KeyC'&&!e.repeat)toggleMount();
    if(e.code==='KeyE'&&!e.repeat)startKick();
    if(e.code==='KeyR'&&!e.repeat)beginTouchThrow({pointerId:'keyboard',pointerType:'keyboard'});
    if(e.code==='KeyZ'&&!e.repeat)toggleStance();
    if((e.code==='ShiftLeft'||e.code==='ShiftRight')&&!e.repeat)dodge();
  });
  window.addEventListener('keyup',e=>{
    keys.delete(e.code);document.querySelector('[data-key="'+e.code+'"]')?.classList.remove('active');
    if(e.code==='KeyR')releaseTouchThrow({pointerId:'keyboard',pointerType:'keyboard'});
  });
  window.addEventListener('blur',()=>{if(phase==='playing')setPhase('paused');clearInput();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&phase==='playing')setPhase('paused');});
  window.addEventListener('pointermove',e=>{
    if(phase!=='playing')return;
    if(e.pointerId===touchCanvasPointer&&!touchThrowAim?.pressed){if(touchThrowAim){touchThrowAim.dragged=false;touchThrowAim.lockedTarget=null;}aimFromClient(e);return;}
    if(!isTouchPointer(e)&&!e.target?.closest?.('#combatDock,#upgradePanel,#upgradesToggle,.hud-buttons,#touchControls,#mountControls')){
      aimFromClient(e);
      const anchor=touchThrowAim?.lockCursor;
      if(anchor&&Math.hypot(pointer.x-anchor.x,pointer.y-anchor.y)>6)touchThrowAim.lockedTarget=null;
    }
    if(e.pointerId===combatPointer&&typeof e.buttons==='number')syncCombatButtons(e.buttons);
  });
  $('gameCanvas').addEventListener('pointerdown',e=>{
    if(phase!=='playing'||(e.button!==undefined&&e.button!==0&&e.button!==2))return;
    if(isTouchPointer(e)){
      if(touchCanvasPointer!==null||touchThrowAim?.pressed)return;
      e.preventDefault();touchCanvasPointer=e.pointerId;$('gameCanvas').setPointerCapture(e.pointerId);
      if(touchThrowAim){touchThrowAim.dragged=false;touchThrowAim.lockedTarget=null;}
      aimFromClient(e);updateAim();audio.unlock();return;
    }
    if(combatPointer!==null&&e.pointerId!==combatPointer)return;
    e.preventDefault();$('gameCanvas').focus({preventScroll:true});audio.unlock();
    if(e.clientX!==undefined)aimFromClient(e);
    combatPointer=e.pointerId;$('gameCanvas').setPointerCapture(e.pointerId);updateAim();
    syncCombatButtons(typeof e.buttons==='number'?e.buttons:mouseButtons|(e.button===2?2:1));
  });
  window.addEventListener('pointerup',e=>{
    if(e.pointerId===touchCanvasPointer){touchCanvasPointer=null;return;}
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
    const visual=Math.min(d,r),sample=sampleMoveStick(dx,dy,r);
    Object.assign(touch,sample);stick.classList.toggle('turn-only',sample.turnOnly);
    stick.dataset.intent=sample.turnOnly?'turn':sample.x||sample.y?'walk':'idle';
    if((sample.aimX||sample.aimY)&&!swing&&!spin&&!punch&&!kick&&!leap&&!throwWindup){facing=screenMovement(sample.aimX,sample.aimY);updateAim(false);}
    knob.style.transform='translate('+(d?dx/d*visual:0)+'px,'+(d?dy/d*visual:0)+'px)';
  }
  function resetStick(){stickId=null;touch.x=0;touch.y=0;touch.aimX=0;touch.aimY=0;touch.turnOnly=false;knob.style.transform='translate(0,0)';stick.classList.remove('active','turn-only');stick.dataset.intent='idle';}
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
  bindAction('leapButton',()=>{if(mountRide?.active&&mountRide.stats.hover)mountTouch.up=true;else startLeap();},()=>mountTouch.up=false);
  bindAction('kickButton',startKick);
  bindAction('throwButton',beginTouchThrow,releaseTouchThrow,cancelTouchThrow);
  bindAction('stanceButton',toggleStance);
  bindAction('dashButton',()=>{if(mountRide?.active)mountTouch.boost=true;else dodge();},()=>mountTouch.boost=false);
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
  requestAnimationFrame(frame);const rawFrameDt=Math.max(0,(now-lastFrame)/1000||1/60),realDt=Math.min(.25,rawFrameDt);lastFrame=now;
  if(document.hidden){performanceMonitor.reset();return;}
  const frameStart=performance.now();let simulationMs=0;
  forgeMenu?.update(realDt);mountWorkshop?.update(realDt);
  if(mountWorkshop?.isOpen){audio.update(realDt,0,'wind');return;}
  // Keep the workshop's own 3D hero animated while reusing the city backdrop.
  // Drawing the hidden battlefield every frame needlessly taxes mobile GPUs.
  const menuBackground=phase==='menu'||phase==='settings'&&previousPhase==='menu';
  if(!gameReady||(menuBackground&&menuBackdropReady)){audio.update(realDt,0,'wind');return;}
  visualTime+=realDt;redFlash=Math.max(0,redFlash-realDt*1.4);shake=Math.max(0,shake-realDt*1.7);
  let simulated=0;
  if(phase==='playing'){
    // Small physics steps retain wall-clock speed and swept hit detection even
    // when rendering is slower. Hit feedback freezes only its exact duration.
    const simulationStart=performance.now(),span=Math.min(realDt,MAX_FRAME_SIMULATION);
    performanceMonitor.droppedMs+=Math.max(0,rawFrameDt-span)*1000;
    for(let remaining=span;remaining>1e-8&&phase==='playing';){
      const slice=Math.min(SIMULATION_STEP,remaining),frozen=Math.min(hitStop,slice);
      hitStop=Math.max(0,hitStop-frozen);const dt=slice-frozen;
      if(dt>0){updateGame(dt);simulated+=dt;}
      remaining-=slice;
      // Stop the catch-up spiral. Normal 10–120 Hz play retains exact swept
      // steps; overload drops simulation time, never teleports through walls.
      if(performance.now()-simulationStart>=MAX_SIMULATION_CPU_MS){performanceMonitor.droppedMs+=remaining*1000;break;}
    }
    simulationMs=performance.now()-simulationStart;
  }else if(phase==='menu'){player.walk+=realDt*.25;poseHero(realDt,false);updateObjects(realDt);}
  const weather=world.regionAt?.(player.x,player.z)?.weather||'rain';
  const environmentDt=phase==='playing'?simulated:phase==='menu'?realDt:0;
  if(phase==='playing')updateObjects(simulated);
  world.update(environmentDt,visualTime,player,weather);
  destruction?.update(environmentDt,player,{active:phase==='playing'});
  if(phase==='playing'){vehicleEffects?.update(environmentDt,player,camera);hydrantEffects?.update(environmentDt,player,camera);levelStorm?.update(environmentDt,player,camera);}
  updateEffects(phase==='paused'||phase==='settings'?0:realDt);
  const desired=phase==='menu'?new THREE.Vector3(-5,.6,3.5):new THREE.Vector3(player.x+facing.x*.8,.6+player.y,player.z+facing.z*.8);
  updateBattleCamera(realDt,desired);
  if(settings.shake&&shake>0)shakeCamera(shake);
  camera.lookAt(cameraTarget);
  camera.updateMatrixWorld(true);world.updateVisibility?.(player,camera);updateBattleVisibility(realDt);
  sun.position.set(player.x-15,28,player.z+8);sun.target.position.set(player.x,0,player.z);sun.target.updateMatrixWorld();
  // Subtle moving storm illumination, kept bright enough for readable combat.
  const lightning=weather==='rain'&&Math.sin(visualTime*.47)> .998?Math.sin(visualTime*70)**8*.35:0;
  sun.intensity=2.25+lightning+(levelStorm?.flash||0);fillLight.intensity=1.45+(weather==='snow'?.2:0)+(levelStorm?.flash||0)*.45;
  audio.update(realDt,phase==='playing'?Math.min(1,enemies.length/40+(boss&&!boss.dead?.4:0)):0,weather);
  if(phase==='playing'){
    updateAim(false);aimPreviewTimer-=realDt;
    if(aimPreviewTimer<=0){updateAimPreview();aimPreviewTimer=settings.quality==='low'?1/20:1/30;}
  }
  updateThrowIndicator();const renderStart=performance.now();renderer.render(scene,camera);
  const renderCpuMs=performance.now()-renderStart;drawFX();
  const measured=performanceMonitor.sample(now,{backend:renderer.userData?.backend||'WebGL test',wasm:collisionWasmStatus().active,
    simulationMs,renderCpuMs,cpuMs:performance.now()-frameStart,
    calls:renderer.info?.render?.drawCalls??renderer.info?.render?.calls??0,
    triangles:renderer.info?.render?.triangles??0,geometries:renderer.info?.memory?.geometries??0,
    debris:destruction?.debris.length||0,destruction:destructionPercent(world.objects)});
  if(measured){
    const badge=$('performanceHud');if(badge){badge.hidden=phase!=='playing';
      badge.textContent=Math.round(measured.fps)+' FPS';
      badge.dataset.backend=measured.backend;badge.dataset.wasm=String(measured.wasm);
      badge.dataset.slow=String(measured.fps<25);
      badge.title='CPU '+measured.cpuMs.toFixed(1)+' ms · physics '+measured.simulationMs.toFixed(1)+' ms · render submission '+measured.renderCpuMs.toFixed(1)+' ms · draws '+measured.calls+' · debris '+measured.debris;
    }
  }
  if(menuBackground)menuBackdropReady=true;
  hudTimer-=realDt;if(hudTimer<=0){updateHUD();syncMountHud();hudTimer=.07;$('touchControls').hidden=!touchLayout||phase!=='playing';}
  minimapTimer-=realDt;if(minimapTimer<=0){if(phase==='playing')drawMinimap();minimapTimer=.12;}
}

async function init(){
  audio.setMenuActive?.(true);
  forgeMenu=createForgeMenu({THREE,makeWarrior,xpForNextLevel,getCharacterStats,maxLevel:MAX_CHARACTER_LEVEL,document,window,
    onSound:(name,details)=>{if(!settings.muted&&settings.volume>0)audio.unlock().then(()=>audio.play(name,.5,details));},
    onSettings:()=>{previousPhase='menu';setPhase('settings');}});
  initInput();initMountControls();initMountWorkshop();updateSavedCharacter();
  renderer=await createGameRenderer({THREE,canvas:$('gameCanvas'),mode:rendererMode});
  await loadCollisionWasm();
  await preloadVehicleExplosion();
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.22;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=renderer.backend?.isWebGPUBackend?THREE.PCFShadowMap:THREE.PCFSoftShadowMap;
  scene=new THREE.Scene();scene.background=new THREE.Color(0x223c40);scene.fog=new THREE.Fog(0x344c4c,34+CAMERA_FOG_SHIFT,88+CAMERA_FOG_SHIFT);
  camera=new THREE.OrthographicCamera(-20,20,13,-13,.1,300);cameraTarget.set(-5,.6,3.5);camera.position.copy(cameraTarget).addScaledVector(cameraOffset,CAMERA_DISTANCE_SCALE);camera.lookAt(cameraTarget);
  fillLight=new THREE.HemisphereLight(0xb9dcd9,0x536650,1.45);scene.add(fillLight);
  sun=new THREE.DirectionalLight(0xffdfb1,2.25);sun.position.set(-15,28,8);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-23;sun.shadow.camera.right=23;sun.shadow.camera.top=23;sun.shadow.camera.bottom=-23;sun.shadow.camera.far=75;sun.shadow.normalBias=.04;sun.shadow.bias=-.0002;scene.add(sun,sun.target);
  const rim=new THREE.DirectionalLight(0x80c7dd,1.15);rim.position.set(8,14,-18);scene.add(rim);
  hero=makeWarrior();scene.add(hero);
  // One actual complete asset keeps the Standard/wood/metal/core pipelines
  // warm. It is hidden after compilation and never enters collision or play.
  const warmGarage=restoreGarage(null);armoryWarmModel=createWeaponModel('w08',warmGarage.armory);scene.add(armoryWarmModel);
  mountRide=new MountRide(scene,{notice:toast,onBreak:()=>toast('ΟΧΗΜΑ ΕΚΤΟΣ','Επισκεύασέ το στο εργαστήριο.')});
  mountWeapons=new MountWeapons(scene,{hit:mountProjectileHit,blast:mountProjectileBlast});player.materials=hero.userData.getEquipmentMaterials?.()||prepareMaterials(hero);
  beastRig=makeBeastMech();beastRig.userData.materials=prepareMaterials(beastRig);beastRig.visible=false;scene.add(beastRig);
  beastPortal=new BeastPortal(scene);renderer.localClippingEnabled=true;
  beastRig.userData.reveal=installBeastReveal(beastRig,renderer.userData?.backend==='WebGPU');beastRig.userData.materials=beastRig.userData.reveal.materials;
  beastCombat=new BeastCombat(scene,{surface:(x,z)=>world?.supportHeight(x,z,.05,Infinity)||0,blast:beastBlast,beamHit:beastBeamHit,cast:(from,to,radius)=>firstHammerHit(from,to,segmentObjects(from,to,radius),radius),cue:kind=>{const cue=BEAST_CUES[kind];announce(cue[0],cue[1],2);audio.play('boss');}});
  const heldMaterials=new Set();hero.userData.hammerPivot.traverse(n=>{if(n.isMesh)for(const m of Array.isArray(n.material)?n.material:[n.material])heldMaterials.add(m);});hammerMaterials=[...heldMaterials];hammerAura=createHammerAura();
  chargeRing=new THREE.Mesh(new THREE.RingGeometry(.93,1,48),new THREE.MeshBasicMaterial({color:color.gold,side:THREE.DoubleSide,transparent:true,opacity:.5,depthWrite:false}));chargeRing.rotation.x=-Math.PI/2;chargeRing.visible=false;scene.add(chargeRing);
  const arrowGeo=new THREE.BufferGeometry();arrowGeo.setAttribute('position',new THREE.Float32BufferAttribute([-.19,0,-.1,.19,0,-.1,0,0,.25],3));
  directionMarker=new THREE.Mesh(arrowGeo,new THREE.MeshBasicMaterial({color:0xf6cf8a,side:THREE.DoubleSide,transparent:true,opacity:.64,depthWrite:false}));scene.add(directionMarker);
  throwIndicator=createThrowIndicator(THREE,$('throwArrowImage'));scene.add(throwIndicator.mesh);
  guardRing=new THREE.Mesh(new THREE.RingGeometry(1.68,1.72,64),new THREE.MeshBasicMaterial({color:0x9ee4db,side:THREE.DoubleSide,transparent:true,opacity:.15,depthWrite:false}));guardRing.visible=false;scene.add(guardRing);
  landingMarker=makeTelegraph(0,0,1,0xffc371);landingMarker.visible=false;
  groundShadow=new THREE.Mesh(new THREE.CircleGeometry(.65,24),new THREE.MeshBasicMaterial({color:0x081719,transparent:true,opacity:.32,depthWrite:false}));groundShadow.rotation.x=-Math.PI/2;scene.add(groundShadow);
  occlusionDepth=new OcclusionDepth(scene);groundScars=new GroundScars(scene);levelStorm=new LevelStorm(scene,{onStrike:levelUpStrike});
  fragments=new Fragments();impactClouds=new ImpactClouds();resetWorld();facing={x:.585491,z:.810679};hero.rotation.y=Math.atan2(facing.x,facing.z);cameraTarget.set(-5,.6,3.5);
  resize();setPhase('menu');
  world.warmCollision(player.x,player.z);
  $('gameCanvas').setAttribute('tabindex','-1');
  // Shader compilation is local. Optional recorded audio preloads separately.
  if(renderer.compileAsync){
    const blast=vehicleEffects.explosion;blast.mesh.visible=true;blast.geometry.setDrawRange(0,6);
    beastRig.visible=true;beastPortal.warm();beastCombat.warm();mountWeapons.warm();vehicleEffects.warm();destruction.warm();fragments.warm();impactClouds.warm();hydrantEffects.warm();levelStorm.warm();groundScars.warm();occlusionDepth.warm(world.objects);
    try{await renderer.compileAsync(scene,camera);}finally{armoryWarmModel.visible=false;beastRig.visible=false;beastPortal.reset();beastCombat.reset();mountWeapons.reset();vehicleEffects.reset();destruction.reset();fragments.clear();impactClouds.clear();hydrantEffects.hide();levelStorm.hide();groundScars.reset();occlusionDepth.sync([]);blast.mesh.visible=false;blast.geometry.setDrawRange(0,0);}
  }
  armoryWarmModel.visible=false;
  gameReady=true;forgeMenu.setReady(true);$('menuMountWorkshopButton').disabled=false;updateSavedCharacter();$('loadingStatus').textContent='Η πόλη είναι έτοιμη για μάχη.';
  if($('bestScore'))$('bestScore').textContent=best.toLocaleString('el-GR');
  requestAnimationFrame(frame);
}
init().catch(error=>{
  console.error('IRONFALL initialization failed:',error);$('loadingStatus').textContent='Δεν ολοκληρώθηκε η εκκίνηση.';$('fatalError').hidden=false;
  $('fatalText').textContent='Η εκκίνηση WebGPU απέτυχε. Δεν έγινε αυτόματη μετάβαση σε WebGL. Λεπτομέρεια: '+error.message;
  forgeMenu?.setReady(false);resize();requestAnimationFrame(frame);
});

window.render_game_to_text=()=>JSON.stringify({
  coordinates:'Metres; X/Z ground plane, Y height',phase,
  player:{x:player.x,y:player.y,z:player.z,hp:player.hp},mount:mountRide?.snapshot(),
  armory:{weapon:hero?.userData.armoryWeaponId||'classic',shield:hero?.userData.armoryShieldId||'classic',weaponCore:armoryWeaponStats?.core||'none',shieldCore:armoryShieldStats?.core||'none',burning:armoryEffects.burning.size},
  progress:{destruction:world?destructionPercent(world.objects):0,enemies:battleKills,total:world?battleProgress(destructionPercent(world.objects),battleKills):0,goal:GOAL,next:BOSS_GATES[bossGate]?.threshold??GOAL},
  encounter:encounter?{type:encounter.leader.type,state:encounter.entry?.stage||encounter.leader.state,
    x:encounter.entry?.location.x??encounter.leader.x,z:encounter.entry?.location.z??encounter.leader.z,
    hp:encounter.leader.hp,escorts:encounter.escorts.size,pending:encounter.gate.escort.length-encounter.sent}:null,
  boss:boss&&!boss.dead?{x:boss.x,y:boss.y,z:boss.z,hp:boss.hp,maxHp:boss.maxHp,height:boss.h,armor:beastDamageScale(boss.state),entrance:boss.state==='enter'?boss.entry?.stage:null,state:boss.state,warning:beastCombat?.attack?{kind:beastCombat.attack.kind,remaining:Math.max(0,beastCombat.attack.windup-beastCombat.attack.time)}:null}:null,
  enemies:enemies.filter(e=>!e.dead&&Math.hypot(e.x-player.x,e.z-player.z)<30).slice(0,30).map(e=>({type:e.type,x:e.x,y:e.y,z:e.z,hp:e.hp})),
  projectiles:beastCombat?.projectiles.map(p=>({kind:p.kind,x:p.position.x,y:p.position.y,z:p.position.z,target:{x:p.to.x,z:p.to.z}}))||[],
});
