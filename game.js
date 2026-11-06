import {createKickSystem} from './kick-runtime.js?v=20261106-kick6';
import {enemyCombatLevel,enemyLevelColor} from './kick-physics.js?v=20261106-kick6';
import * as THREE from './vendor/three.module.js';
import {makeWarrior,makeEnemy,makeBoss,makeTreasure} from './models.js?v=20261106-kick6';
import {makeCityEnemy,installEnemyHead} from './enemy-models.js?v=20261106-air5';
import {createWorld} from './world.js?v=20261106-kick6';
import {GameAudio} from './audio.js?v=20261106-audio2';
import {COMBO_WINDOW,createHitCombo,resetHitCombo,tickHitCombo,registerComboHit,comboMultiplier,scaleComboReward,impactMaterial} from './combat-feedback.js?v=20261106-feel1';
import {findBattleOccluders,applyOccluderFade} from './occlusion.js?v=20261106-impact4';
import {GOAL,BOUNDS,clamp,lerp,normalize,screenMovement,nearestPoint,circleOverlaps,moveCircle,attackStats,destructionPercent,UPGRADE_DEFS,calculateStats} from './core.js?v=20261106-kick6';
import {segmentCircleHit,firstHammerHit,facingCoverage} from './combat.js';
import {wavePlan,waveBatch,enemyTypeForWave,enemyStatsForWave} from './waves.js?v=20261106-feel1';
import {HAMMER_COMBOS,createSwingSequence,chooseHammerSwing,sampleHammerSpin,getHammerSwingDuration,sampleHammerSwing,SWING_CONTACT_START,SWING_CONTACT_END} from './hammer-motion.js?v=20261106-kick6';
import {MAX_CHARACTER_LEVEL,CHARACTER_WEAPONS,MATERIAL_TYPES,createCharacterProgression,awardCharacterXp,collectCharacterMaterial,getCharacterStats,getForgeStatus,forgeNextWeapon,xpForNextLevel,restoreCharacterProgression} from './character-progression.js?v=20261106-feel1';
import {initEnemyReaction,updateEnemyThreat,startEnemyFear,interruptEnemyAttack,poseEnemyReaction,applyEnemyFlash} from './enemy-reactions.js?v=20261106-feel1';

const $ = id => document.getElementById(id);
const save = (key,value) => {try {localStorage.setItem(key,JSON.stringify(value));} catch {}};
const read = (key,fallback) => {try {return JSON.parse(localStorage.getItem(key)) ?? fallback;} catch {return fallback;}};
const settings = Object.assign({quality:'high',shake:true,volume:0.75,muted:false},read('ironfall.settings',{}));
settings.volume=Number.isFinite(Number(settings.volume))?clamp(Number(settings.volume),0,1):.75;
settings.muted=!!settings.muted;
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
// Sound tests work even while the renderer is still loading.
for(const id of ['testAudioButton','menuAudioButton'])if($(id))$(id).onclick=testGameAudio;
let renderer,scene,camera,world,hero,sun,fillLight,chargeRing,directionMarker;
let phase='menu', previousPhase='menu', elapsed=0, roundTime=0, round=1, sector=1, kills=0, relics=0, level=1, xp=0, xpTarget=12, score=0;
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
let leap=null,leapCooldown=0,throwWindup=null,throwFlight=null,throwCooldown=0,landingRecovery=0;
const THROW_CHAIN_RADIUS=9,THROW_MAX_HITS=5,HAMMER_LIGHTNING_SECONDS=2.8;
let hammerLightning=0,hammerAura=null,hammerMaterials=[];
let hpEchoes=[],aimPreview=null,nearbyTargets=[],focusedTarget=null,guardRing,landingMarker,groundShadow;
const pointer={active:false,x:0,y:0},aim={x:-.585491,z:-.810679};
const raycaster=new THREE.Raycaster(),aimPlane=new THREE.Plane(new THREE.Vector3(0,1,0),-1.2);
const headPrevious=new THREE.Vector3(),headNow=new THREE.Vector3(),shaftUp=new THREE.Vector3(0,1,0),poseDirection=new THREE.Vector3();
const guardHits=new Map();
let player={x:0,z:0,y:0,vx:0,vz:0,radius:0.44,hp:120,maxHp:120,invincible:0,hurtAgo:100,walk:0};
const kicking=createKickSystem({
  get player(){return player;},get hero(){return hero;},get world(){return world;},get enemies(){return enemies;},get boss(){return boss;},
  get level(){return level;},get power(){return stats.power;},get rank(){return levels.kick||0;},get phase(){return phase;},
  blocked:()=>!!leap||!!throwWindup||dashTime>0||Math.abs(stance-stanceTarget)>.005,
  prepare:()=>{cancelAttack();spinRecovery=null;swing=null;guardHeld=guarding=false;attackCooldown=0;updateAim();
    const move=movementDirection();facing={...(move.x||move.z?move:pointer.active?aim:facing)};hero.rotation.y=Math.atan2(facing.x,facing.z);return facing;},
  hitEnemy:(...args)=>hitEnemy(...args),hitBoss:(...args)=>hitBoss(...args),hurtObject:(...args)=>hurtObject(...args),
  sound:(...args)=>{audio.unlock();audio.play(...args);},text:(...args)=>floatText(...args),
  onContact:()=>{shake=Math.max(shake,.075);hitStop=Math.max(hitStop,.025);}
});
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
  if(next!=='playing'){clearInput();if(guardRing)guardRing.visible=false;if(hammerAura)hammerAura.root.visible=false;}
  else $('gameCanvas').focus({preventScroll:true});
  syncTouchControls();
}
function clearInput(){
  kicking.cancel();
  for(const reset of inputResetters)reset();
  keys.clear();touch.x=0;touch.y=0;touch.attack=false;touchCanvasPointer=null;touchThrowAim=null;touchThrowQueued=null;
  combatPointer=null;mouseButtons=0;cancelAttack();guardHeld=false;guarding=false;
  if(touchLayout)pointer.active=false;
  document.querySelectorAll('[data-key]').forEach(e=>e.classList.remove('active'));
  for(const id of ['attackButton','guardButton'])$(id)?.classList.remove('active');
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
  kicking.reset();
  if(!keepUpgrades){round=1;sector=1;upgradeQueue=[];upgradeFeedback='';}
  swingSequences.splice(0,2,createSwingSequence(),createSwingSequence());
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
  world?.dispose();
  world=createWorld(scene,{seed:1527+sector*173,round:sector});
  for(const o of world.objects){o.materials=prepareMaterials(o.mesh);o.flash=0;o.shudder=0;o.hurtTimer=0;o.baseY=o.mesh.position.y;o.baseRotation=o.mesh.rotation.clone();}
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
  if(button){button.hidden=!stored;button.disabled=$('startButton').disabled;if(stored)button.textContent='ΣΥΝΕΧΕΙΑ ΕΞΕΛΙΞΗΣ · LV '+stored.level;}
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
  const result=awardCharacterXp(character,value);applyStats();
  for(let i=0;i<result.levelsGained;i++){player.hp=Math.min(player.maxHp,player.hp+18);spawnDrop(player.x+randomBetween(-1,1),player.z+randomBetween(-1,1),'relic');}
  if(result.levelsGained){upgradeFeedback='ΕΠΙΠΕΔΟ '+level+' · +18 ΖΩΗ';toast('ΕΠΙΠΕΔΟ '+level,'Η δύναμή σου μεγαλώνει. Έλεγξε την επόμενη κατασκευή.');persistCharacter();}
  renderCharacterProgress();
}
function kickUpgradeCost(){const rank=levels.kick||0;return {wood:18+rank*12,scrap:12+rank*10};}
function improveKick(){
  if(phase!=='playing'||(levels.kick||0)>=30)return false;
  const cost=kickUpgradeCost();if(character.materials.wood<cost.wood||character.materials.scrap<cost.scrap)return false;
  character.materials.wood-=cost.wood;character.materials.scrap-=cost.scrap;levels.kick=(levels.kick||0)+1;
  applyStats();persistCharacter();audio.play('pickup');renderUpgradePanel();return true;
}
function renderCharacterProgress(){
  const progress=level>=MAX_CHARACTER_LEVEL?1:xp/Math.max(1,xpTarget),status=getForgeStatus(character),busy=weaponBusy()||!!swing||!!spin;
  if($('kickUpgradeButton')){const r=levels.kick||0,cost=kickUpgradeCost(),maxed=r>=30;
    $('kickUpgradeButton').disabled=maxed||character.materials.wood<cost.wood||character.materials.scrap<cost.scrap;
    $('kickUpgradeButton').textContent=maxed?'ΚΛΩΤΣΙΑ +30 · ΜΕΓΙΣΤΗ':'ΚΛΩΤΣΙΑ +'+r+' → +'+(r+1)+' · '+cost.wood+' ξύλο / '+cost.scrap+' μέταλλο';
    $('kickUpgradeHelp').textContent=r<2?'Στη βαθμίδα +2 σπρώχνεις και αυτοκίνητα.':'Σπρώχνεις οχήματα · περισσότερη δύναμη με κάθε βαθμίδα.';
  }
  if($('characterHudLevel'))$('characterHudLevel').textContent='LV '+level+(testRun?' · ΔΟΚΙΜΗ':'');
  if($('characterHudWeapon'))$('characterHudWeapon').textContent=characterStats.weaponName;
  for(const id of ['characterXpFill','forgeXpFill'])if($(id))$(id).style.width=Math.min(100,progress*100)+'%';
  if($('characterXpText'))$('characterXpText').textContent=level>=MAX_CHARACTER_LEVEL?'ΜΕΓΙΣΤΟ ΕΠΙΠΕΔΟ':xp+' / '+xpTarget+' XP';
  if($('equippedWeapon'))$('equippedWeapon').textContent=characterStats.weaponName;
  if($('weaponAbilities'))$('weaponAbilities').textContent=characterStats.canLightning?'Ψηλό άλμα · συντριβή · 5 στόχοι · επιστροφή · κεραυνοί':characterStats.canReturn?'Ψηλό άλμα · συντριβή · αυτόματη επιστροφή':characterStats.canAirSmash?'Άλμα + dash · μικρό smash · κράτα για μεγάλη συντριβή':'Άλμα · μικρό smash · dash στον αέρα · μάζεψε το όπλο μετά τη ρίψη';
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
    const compact={power:['ΔΥΝΑΜΗ','+25% ζημιά'],size:['ΜΕΓΕΘΟΣ','+18% κεφαλή · +8% εμβέλεια'],range:['ΕΜΒΕΛΕΙΑ','+22% εμβέλεια'],speed:['ΤΑΧΥΤΗΤΑ','+12% κίνηση'],vitality:['ΑΝΤΟΧΗ','+25 ζωή · +40 αναπλήρωση'],quake:['ΣΥΝΤΡΙΒΗ','Μεγαλύτερη περιοχή'],kick:['ΚΛΩΤΣΙΑ','Ώθηση · οχήματα από +2']}[choice.id];
    button.setAttribute('aria-label',choice.name+' · '+choice.text);button.setAttribute('title',choice.name+' · '+choice.text);
    button.innerHTML='<kbd class="upgrade-key">'+(index+1)+'</kbd><svg class="upgrade-icon" viewBox="0 0 96 80" aria-hidden="true"><use href="#upgrade-'+choice.id+'"/></svg><small>'+choice.label+'</small><h3>'+compact[0]+'</h3><p>'+compact[1]+'</p><span class="upgrade-level">'+((levels[choice.id]||0)+1)+' <b>+</b></span>';
    button.onclick=()=>{
      if(phase!=='playing'||!upgradePanelOpen||upgradeTab!=='powers'||upgradeQueue[0]!==choices)return;
      levels[choice.id]=(levels[choice.id]||0)+1;relics++;upgradeQueue.shift();applyStats();
      if(choice.id==='vitality')player.hp=Math.min(player.maxHp,player.hp+40);
      upgradeFeedback=choice.name+' · ΒΑΘΜΙΔΑ '+levels[choice.id];if(!upgradeQueue.length)upgradePanelOpen=false;audio.play('pickup');persistCharacter();renderUpgradePanel();
      pulse(player.x,player.z,2.5,color.gold,.4);$('gameCanvas').focus({preventScroll:true});
    };
    wrap.appendChild(button);
  });
}

function weaponBusy(){return !!(kicking.active||throwFlight||throwWindup||leap||Math.abs(stance-stanceTarget)>.005||landingRecovery>0);}
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
  const variant=chooseHammerSwing(swingSequences[comboIndex],twoHanded,Math.random,!!(move.x||move.z));
  swing={time:0,q,...details,twoHanded,variant,duration:getHammerSwingDuration(variant)+q*.10,damage:Math.round(details.damage*stancePower()),fx:facing.x,fz:facing.z,hit:false,hits:new Set(),blocked:false,fromRotation:hero.userData.weaponRig.quaternion.clone(),fromPosition:hero.userData.weaponRig.position.clone()};
  chargeStarted=false;charge=0;spinRecovery=null;attackCooldown=swing.duration+.012;audio.play('swing',q,{variant,duration:swing.duration,weapon:characterStats.weaponTier<2?'wood':'metal',exert:true});
  hero.updateMatrixWorld(true);hero.userData.hammerHead.getWorldPosition(headPrevious);
}
function startSpin(previousHits=null){
  if(spin)return true;
  if(phase!=='playing'||swing||weaponBusy()||guardHeld)return false;
  const rig=hero.userData.weaponRig;
  const localHead=hero.worldToLocal(hero.userData.hammerHead.getWorldPosition(new THREE.Vector3()));
  spin={time:0,angle:hero.rotation.y,baseAngle:hero.rotation.y,fromHeadYaw:Math.atan2(localHead.x,localHead.z),rotation:0,cycle:0,hitTimes:new Map(),entryHits:new Set(previousHits||[]),trailTime:0,soundTime:-1,recoil:0,
    damage:Math.round(stats.power*.9*stancePower()),knockback:4.6,lift:1.1,
    fromRotation:rig.quaternion.clone(),fromPosition:rig.position.clone(),fromBody:hero.userData.body.rotation.clone(),fromDrop:hero.userData.body.position.y};
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
    if(hurtObject(wall.target,s.damage,.15))breaks++;else s.recoil=1;
  }
  if(hits){
    shake=Math.max(shake,breaks?.10:.065);
    if(s.time-s.soundTime>.09)s.soundTime=s.time;
    // No hit-stop on a sustained spin: contact sparks and recoil carry the hit.
    checkGoal();
  }
}
function hitEnemy(e,damage,dir,strength,lift,contact=null){
  if(e.dead||!Number.isFinite(damage)||damage<=0)return;
  recordCombatContact(e);
  const force=clamp(Number.isFinite(strength)?strength:0,0,18);
  const mass=e.type==='siegeMech'?10:e.miniBoss?8:e.type==='mech'?4:e.type==='brute'?3:e.type==='mutant'?2.6:e.type==='robot'?1.5:e.type==='crawler'?.9:1;
  let direction=normalize(dir?.x||0,dir?.z||0);
  if(!direction.x&&!direction.z)direction=normalize(e.x-player.x,e.z-player.z);
  if(!direction.x&&!direction.z)direction={x:0,z:1};
  const duration=.40+Math.min(force/18,1)*.08,impulse=Math.min(force*1.05,6.4)/mass**.75;
  e.facingYaw??=e.mesh.rotation.y;
  e.impact={time:0,duration,dirX:direction.x,dirZ:direction.z,mass,
    amplitude:(.38+Math.min(force/18,1)*.13)/mass**.35,bounced:false,
    axis:new THREE.Vector3(direction.z,0,-direction.x),rotation:new THREE.Quaternion(),fromRotation:e.mesh.quaternion.clone()};
  e.hp-=damage;e.flash=.16;e.stagger=Math.max(e.stagger||0,duration);
  // Put a visible recoil on the mesh in the SAME contact step, including the
  // frozen impact frame. Do not wait for a 45 ms animation blend after damage.
  e.mesh.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(e.impact.axis,e.impact.amplitude*.30));
  e.mesh.updateMatrixWorld(true);
  const hitPoint=contact||{x:e.x,y:e.y+Math.min(1.1,e.height*.6),z:e.z};
  // A normal hit moves a light enemy about .7m, not an unlimited launch.
  // Heavy bodies keep a clear flinch while resisting most of the displacement.
  e.vx=direction.x*impulse;e.vz=direction.z*impulse;
  e.vy=force>0?clamp((Number.isFinite(lift)?lift:0)*1.12+.15,2.2,4.1)/Math.sqrt(mass):Math.min(e.vy||0,0);
  e.hurtTimer=2.4;
  const interrupted=interruptEnemyAttack(e,duration+.18);if(interrupted)removeEffect(interrupted);
  applyEnemyFlash(e.materials,1);
  impactClouds?.emit(hitPoint.x,hitPoint.y,hitPoint.z,direction,Math.min(1.5,e.radius*1.6));
  frightenNearby(e.x,e.z,.55+characterStats.weaponTier*.2,3.6+characterStats.weaponTier*.35,e);
  showHitPoints(e,damage);
  audio.play('hit',Math.min(1,damage/100),{material:impactMaterial(e),weapon:characterStats.weaponTier<2?'wood':'metal'});
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
function hurtObject(o,damage,q=0,contactOverride=null){
  if(o.dead||!Number.isFinite(damage)||damage<=0)return false;o.hp-=damage;o.flash=.15;o.shudder=.22;flashMaterials(o,.85);showHitPoints(o,damage);
  audio.play(o.hp<=0?'break':'hit',Math.max(q,Math.min(1,damage/120)),{material:impactMaterial(o),weapon:characterStats.weaponTier<2?'wood':'metal'});
  const contact=contactOverride||nearestPoint(player.x,player.z,o);impactClouds?.emit(contact.x,contactOverride?.y??Math.min(player.y,o.h),contact.z,normalize(contact.x-player.x,contact.z-player.z),o.isBuilding?1:.7);
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
function hitBoss(damage,dir,strength=5){
  if(!boss||boss.dead||!Number.isFinite(damage)||damage<=0)return;
  recordCombatContact(boss);audio.play('hit',Math.min(1,damage/120),{material:'metal',weapon:characterStats.weaponTier<2?'wood':'metal'});audio.play('enemyHurt',.8,{type:'siegeMech',fatal:boss.hp<=damage});
  boss.hp-=damage;boss.flash=.15;boss.stagger=.12;boss.vx=dir.x*strength*.13;boss.vz=dir.z*strength*.13;
  boss.impact={time:0,duration:.32,dirX:dir.x,dirZ:dir.z};
  if(boss.state!=='enter'){boss.state='recover';boss.timer=Math.max(.32,boss.timer*.35);if(boss.telegraph){removeEffect(boss.telegraph);boss.telegraph=null;}}
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
  if(wall){s.hits.add(wall.target);hits++;if(hurtObject(wall.target,s.damage,s.q))breaks++;else{s.blocked=true;s.blockTime=s.time;s.blockRotation=hero.userData.weaponRig.quaternion.clone();s.blockPosition=hero.userData.weaponRig.position.clone();s.blockPose=sampleHammerSwing(s.time/s.duration,{twoHanded:s.twoHanded,charge:s.q,variant:s.variant});attackCooldown=Math.min(attackCooldown,.125);}}
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
  if(phase!=='playing'||swing||throwFlight||throwWindup||leap||Math.abs(stance-stanceTarget)>.005)return;
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
  const committedDirection=!touchThrowAim?.dragged&&(touchThrowQueued?.dir||throwWindup?.dir);
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
  const origin={x:player.x,y:1.1,z:player.z};
  for(const e of [...enemies,...(boss&&!boss.dead?[boss]:[])]){
    const dx=e.x-player.x,dz=e.z-player.z,distance=Math.hypot(dx,dz);
    if(e.dead||distance>12||distance<.001)continue;
    const endpoint={x:e.x,y:1.1,z:e.z};
    if(firstHammerHit(origin,endpoint,segmentObjects(origin,endpoint,.06),.06))continue;
    nearbyTargets.push(e);const alignment=(dx*aim.x+dz*aim.z)/distance;
    if(alignment>bestAlignment){bestAlignment=alignment;focusedTarget=e;}
  }
  if(contact&&nearbyTargets.includes(contact.target))focusedTarget=contact.target;
}
function startLeap(){
  if(phase==='playing'&&(touchThrowAim||touchThrowQueued))cancelTouchThrow();
  if(phase!=='playing'||leap||leapCooldown>0||throwFlight&&!throwFlight.grounded||throwWindup||Math.abs(stance-stanceTarget)>.005)return false;
  kicking.cancel();cancelAttack();spinRecovery=null;guarding=false;guardHeld=false;swing=null;attackCooldown=0;landingRecovery=0;
  const mx=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0)+touch.x;
  const mz=(keys.has('KeyS')||keys.has('ArrowDown')?1:0)-(keys.has('KeyW')||keys.has('ArrowUp')?1:0)+touch.y;
  updateAim();const direction=dashTime>0?{...dashDirection}:Math.hypot(mx,mz)>.05?screenMovement(mx,mz):{...(pointer.active?aim:facing)};facing={...direction};
  // A smash is a deliberate second input during this jump, never inherited
  // from a mouse button or spin finger already held before take-off.
  leap={time:0,dir:direction,vy:characterStats.jumpVelocity,slam:false,strike:false,attackHeld:false,attackTime:0,diving:false,startY:player.y};leapCooldown=characterStats.jumpCooldown;
  fragments.add(player.x,.1,player.z,15,[0xc7b78e,0x7d9690],5,.12);pulse(player.x,player.z,2.2,0xb9dac4,.25);audio.play('dash');return true;
}
function armAirSmash(){
  if(!leap||leap.strike||throwFlight)return;
  // Tap is always the modest landing attack. Advanced gear can promote the
  // same press to the heavy attack by holding; no basic ability is level-gated.
  leap.strike=true;leap.attackHeld=true;leap.attackTime=0;
  chargeHeld=false;chargeStarted=false;charge=0;attackBuffer=null;
}
const SUPPORT_EPSILON=1e-6;
function supportHeight(x,z,ceiling=Infinity){
  let height=0;
  // The same footprint supports the feet and collides with the facade. A
  // smaller support circle started a fall while still embedded in the wall.
  for(const o of nearbyObjects(x,z,player.radius))if(o.h<=ceiling+SUPPORT_EPSILON&&circleOverlaps(x,z,player.radius,o))height=Math.max(height,o.h);
  return height;
}
function landLeap(){
  if(!leap)return;
  const slam=leap.slam,strike=leap.strike;leap=null;player.vy=0;landingRecovery=slam?.14:.07;
  const radius=slam?5.2+stats.quake*.7:strike?1.65:1.2;
  const damage=throwFlight?0:Math.round(stats.power*(slam?3.8:strike?.62:0)*stancePower());
  if(!damage){pulse(player.x,player.z,.9,0xb9d9cb,.2).position.y=player.y+.08;return;}
  impactClouds?.emit(player.x,player.y,player.z,{x:0,z:0},slam?2.2:1);
  frightenNearby(player.x,player.z,slam?1.5:.65,radius+2);
  for(const e of [...enemies]){if(e.dead||e.y>player.y+1.2||e.y+e.height<player.y-.2)continue;const d=Math.hypot(e.x-player.x,e.z-player.z);if(d<=radius+e.radius)hitEnemy(e,Math.round(damage*lerp(1,.58,clamp(d/radius,0,1))),normalize(e.x-player.x,e.z-player.z),slam?13:5,slam?6:2.2);}
  for(const o of nearbyObjects(player.x,player.z,radius)){if((o.baseY||0)+o.h<player.y-.2)continue;const point=nearestPoint(player.x,player.z,o),d=Math.hypot(point.x-player.x,point.z-player.z);if(d<=radius)hurtObject(o,Math.round(damage*lerp(1,.65,d/radius)),slam?1:.2);}
  if(boss&&!boss.dead&&boss.y<=player.y+1.2&&boss.y+(boss.height||3)>player.y-.2&&Math.hypot(boss.x-player.x,boss.z-player.z)<=radius+boss.radius)hitBoss(damage,normalize(boss.x-player.x,boss.z-player.z),slam?15:5);
  for(const r of slam?[radius,radius*.68,radius*.38]:[radius])pulse(player.x,player.z,r,slam?0xffd28b:0xb9d9cb,slam?.55:.3).position.y=player.y+.09;
  fragments.add(player.x,player.y+.15,player.z,slam?65:16,slam?[0xffcb80,0xfff0be,0x9a9d8b,0x5e7370]:[0xbeb594,0x738680],slam?11:4,slam?.22:.11,slam);
  if(slam)for(let i=0;i<10;i++){const angle=i*Math.PI/5+Math.random()*.2,points=[];for(let j=0;j<4;j++){const r=j/3*radius;points.push(new THREE.Vector3(player.x+Math.sin(angle+j*.08)*r,player.y+.1,player.z+Math.cos(angle+j*.08)*r));}const mesh=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:0xffd38f,transparent:true,opacity:1}));scene.add(mesh);arcs.push({mesh,life:.6,max:.6});}
  shake=slam?.38:.1;hitStop=slam?.022:.005;audio.play(slam?'slam':'hit',slam?1:.2,{material:'masonry',weapon:characterStats.weaponTier<2?'wood':'metal'});checkGoal();
}
function canThrow(){return phase==='playing'&&!throwFlight&&!throwWindup&&throwCooldown<=0&&!swing&&!leap&&Math.abs(stance-stanceTarget)<=.005;}
function startThrow(direction=null,channelAngle=null){
  if(!canThrow())return false;
  if(direction){const d=normalize(direction.x,direction.z);aim.x=d.x;aim.z=d.z;}else updateAim();
  const launchDirection={...aim};
  const rig=hero.userData.weaponRig;
  cancelAttack();spinRecovery=null;throwWindup={time:0,dir:launchDirection,channelAngle,
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
    damage:Math.round(stats.power*characterStats.throwDamageMultiplier*stancePower()),trailTime:0};
  hammerLightning=0;if(hammerAura)hammerAura.root.visible=false;
  hero.userData.setWeaponVisible(false);throwWindup=null;throwCooldown=1.25;audio.play('swing',1,{weapon:characterStats.weaponTier<2?'wood':'metal',exert:false});
}
function throwTargetPoint(target){
  return {x:target.x,y:(target.y||0)+Math.min(1.35,(target.height||target.h||2)*.6),z:target.z};
}
function validChainTarget(h,target){
  return target&&!target.dead&&!h.hits.has(target)&&(target===boss||enemies.includes(target));
}
function nextThrowTarget(h){
  if(!characterStats.canRicochet||h.hitCount>=Math.min(THROW_MAX_HITS,characterStats.maxChainHits))return null;
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
  h.returning=false;h.chainTarget=null;h.grounded=true;h.groundY=0;h.vy=0;
  // Keep the pickup on a reachable surface, just outside any struck wall.
  h.x=clamp(h.x,-BOUNDS+1,BOUNDS-1);h.z=clamp(h.z,-BOUNDS+1,BOUNDS-1);
  for(const o of nearbyObjects(h.x,h.z,.2))if(o.h<=h.y&&circleOverlaps(h.x,h.z,.2,o))h.groundY=Math.max(h.groundY,o.h);
  h.mesh.position.set(h.x,0,h.z);h.mesh.rotation.set(Math.PI/2,0,Math.atan2(h.dir.x,h.dir.z));
  // A thick trunk and a flat hammer have different resting depths. Place the
  // actual lying geometry above its support, leaving room for the pickup bob.
  const lowest=new THREE.Box3().setFromObject(h.mesh).min.y;
  h.y=h.groundY+.05-lowest;h.mesh.position.y=h.y;
  pulse(h.x,h.z,1.1,0xf0d39b,.5).position.y=h.groundY+.06;
}
function returnHammer(h){if(h.retrievable){settleThrownWeapon(h);return;}h.returning=true;h.chainTarget=null;h.returnTime=0;}
function catchHammer(h){
  if(throwFlight!==h)return;
  disposeInstance(h);throwFlight=null;hero.userData.setWeaponVisible(true);
  hammerLightning=characterStats.canLightning?HAMMER_LIGHTNING_SECONDS:0;
  if(hammerAura)hammerAura.lastPattern=-1;
  audio.play('pickup',.7);pulse(player.x,player.z,1.15,characterStats.canLightning?0x9cecff:0xd3bd91,.27).position.y=player.y+.06;
  const head=hero.userData.hammerHead.getWorldPosition(new THREE.Vector3());
  if(characterStats.canLightning)fragments.add(head.x,head.y,head.z,12,[0xecffff,0x82e8ff,0x5ab9ff],3.2,.055);
}
function updateThrownHammer(dt){
  if(!throwFlight)return;const h=throwFlight;h.life+=dt;
  if(h.grounded){
    h.mesh.position.y=h.y+Math.sin(visualTime*4)*.035;
    if(Math.hypot(player.x-h.x,player.z-h.z)<1.3&&Math.abs(player.y-h.groundY)<1){
      const from={x:player.x,y:player.y+.65,z:player.z},to={x:h.x,y:h.groundY+.65,z:h.z};
      const walls=segmentObjects(from,to,.08).filter(o=>o.h>Math.min(player.y,h.groundY)+.65);
      if(!firstHammerHit(from,to,walls,.08))catchHammer(h);
    }
    return;
  }
  const from=new THREE.Vector3(h.x,h.y,h.z);
  if(!h.returning&&(h.life>3.2||h.distance>52)){returnHammer(h);if(h.grounded)return;}
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
        else if(target.w!==undefined)hurtObject(target,h.damage,.7);
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
      if(!h.grounded)h.mesh.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(h.spinAxis,dt*22));
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
  const e={mesh,type,level:enemyCombatLevel(type,waveNumber||round),x:pos.x,z:pos.z,y:0,vx:0,vz:0,vy:0,...base,maxHp:base.hp,materials:prepareMaterials(mesh),flash:0,stagger:0,hurtTimer:0,walk:Math.random()*5,timer:randomBetween(1.1,2.6),state:'walk',dead:false,telegraph:null,attackDir:{x:0,z:1},waveNumber,navTimer:0,navDirection:{x:0,z:1}};
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
  if(blockable&&characterStats.hasShield&&directionLength>.01&&stance<.05&&!throwWindup&&facingCoverage(shieldFacing,source,player,Math.PI*.32)){damage*=.65;fragments.add(player.x+shieldFacing.x*.6,player.y+1,player.z+shieldFacing.z*.6,4,[0xffd490,0x8dc9cd],3,.06);}

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
    const oldY=e.y,speed=Math.hypot(e.vx,e.vz);
    // Use one height threshold for both the wall and roof support, including
    // actors knocked off a roof. Crossing an edge must never eject a body
    // toward the far side of the building beneath it.
    const walls=nearbyObjects(e.x,e.z,e.radius+speed*dt+.1).filter(o=>o.h>oldY+SUPPORT_EPSILON);
    const before={x:e.x,y:e.y+Math.min(.9,e.height*.5),z:e.z};
    const wall=e.kickFlight?firstHammerHit(before,{x:e.x+e.vx*dt,y:before.y,z:e.z+e.vz*dt},walls,e.radius):null;
    const direction=normalize(e.vx,e.vz);
    moveCircle(e,e.vx*dt,e.vz*dt,walls,e.radius);
    if(wall)kicking.wallContact(e,wall.target,speed,direction);
    const damp=Math.exp(-(e.kickFlight?2.6:8)*dt);e.vx*=damp;e.vz*=damp;
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
    if(u.leftLeg){u.leftLeg.rotation.x=Math.sin(e.walk)*.5;u.leftLeg.rotation.z=0;}
    if(u.rightLeg){u.rightLeg.rotation.x=-Math.sin(e.walk)*.5;u.rightLeg.rotation.z=0;}
    if(u.body){u.body.rotation.x=e.state==='windup'?-.22:Math.sin(e.walk*2)*.03;u.body.rotation.z=0;}
    if(u.leftArm){u.leftArm.rotation.x=e.state==='windup'?-1.3:.1+Math.sin(e.walk)*.23;u.leftArm.rotation.z=0;}
    if(u.rightArm){u.rightArm.rotation.x=e.state==='windup'?-1.3:.1-Math.sin(e.walk)*.23;u.rightArm.rotation.z=0;}
    u.animate?.(e,dt,visualTime);
    if(!falling)poseEnemyReaction(e,visualTime);
    if(!i)return;
    const kick=.30+.70*smooth(i.time/.035),recover=1-smooth((i.time-.08)/(i.duration-.08));
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
    kicking.tickActor(e,dt);advanceBody(e);if(e.dead)continue;
    const speedFactor=e.slowTime>0?.5:1;
    e.stagger=Math.max(e.stagger,e.stun||0);
    e.timer-=dt;
    e.sightTimer=(e.sightTimer||0)-dt;
    if(e.sightTimer<=0){e.sightTimer=.13;e.seesPlayer=dist<13&&(world.hasLineOfSight?.(e.x,e.z,player.x,player.z,.16)??true);}
    const afraid=updateEnemyThreat(e,player,dt,{airborne:!!leap,smashing:!!leap?.slam,canSee:e.seesPlayer,threatPower:.6+characterStats.weaponTier*.22});
    if(afraid&&e.stagger<=0){
      const telegraph=interruptEnemyAttack(e,.45);if(telegraph)removeEffect(telegraph);
      const speed=e.speed*1.3*speedFactor,delta=moveCircle(e,e.fearMoveX*speed*dt,e.fearMoveZ*speed*dt,nearbyObjects(e.x,e.z,e.radius+speed*dt+.2).filter(o=>o.h>e.y+SUPPORT_EPSILON),e.radius);
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
        const delta=moveCircle(e,(mx*e.speed*speedFactor*stop+separation.x)*dt,(mz*e.speed*speedFactor*stop+separation.z)*dt,nearbyObjects(e.x,e.z,e.radius+e.speed*dt+1).filter(o=>o.h>e.y+SUPPORT_EPSILON),e.radius);
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
        moveCircle(e,e.attackDir.x*e.lungeSpeed*speedFactor*dt,e.attackDir.z*e.lungeSpeed*speedFactor*dt,nearbyObjects(e.x,e.z,e.radius+e.lungeSpeed*dt+.2).filter(o=>o.h>e.y+SUPPORT_EPSILON),e.radius);
        if(dist<e.radius+player.radius+.2)hurtPlayer(e.damage,e.attackDir.x,e.attackDir.z);
        if(e.timer<=0){e.state='walk';e.timer=e.attackRecovery;}
      }
    }
    // Damage belongs to the telegraphed lunge, slam or projectile; merely
    // touching a walking enemy must not drain health between its attacks.
    poseBody(e);
  }
  kicking.collideActors();
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
      if(b.reflected){const dir=normalize(b.vx,b.vz);if(hit.target===boss)hitBoss(b.damage,dir,5);else if(hit.target.w!==undefined)hurtObject(hit.target,b.damage,.1);else hitEnemy(hit.target,b.damage,dir,5,1.5);}
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
  boss={mesh,type:'boss',level:enemyCombatLevel('boss',round),x:pos.x,z:pos.z,y:-5,vx:0,vz:0,radius:1.65,height:5.7,hp,maxHp:hp,materials:prepareMaterials(mesh),flash:0,stagger:0,state:'enter',timer:2.6,attack:0,telegraph:null,enraged:false,dead:false,walk:0};initEnemyReaction(boss,spawnCounter+100);
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
  if(!boss||boss.dead)return;const b=boss;kicking.tickActor(b,dt);b.timer-=dt;b.stagger=Math.max(0,b.stagger-dt);b.flash=Math.max(0,b.flash-dt);applyEnemyFlash(b.materials,b.flash/.15);
  updateEnemyThreat(b,player,dt,{airborne:!!leap,smashing:!!leap?.slam,canSee:world.hasLineOfSight?.(b.x,b.z,player.x,player.z,.16)??true,threatPower:1});
  moveCircle(b,b.vx*dt,b.vz*dt,nearbyObjects(b.x,b.z,b.radius+1),b.radius);b.vx*=Math.exp(-7*dt);b.vz*=Math.exp(-7*dt);
  const dir=normalize(player.x-b.x,player.z-b.z),dist=Math.hypot(player.x-b.x,player.z-b.z);
  if(!b.enraged&&b.hp<b.maxHp*.45){b.enraged=true;announce('ΥΠΕΡΦΟΡΤΩΣΗ','Ο Κολοσσός εξαγριώθηκε. Πρόσεχε τις κόκκινες ζώνες!',3);audio.play('boss');}
  if(b.state==='enter'){
    b.y=lerp(-5,0,clamp(1-b.timer/2.6,0,1));if(b.timer<=0){b.y=0;b.state='walk';b.timer=1.6;if(b.telegraph){removeEffect(b.telegraph);b.telegraph=null;}shake=.5;fragments.add(b.x,.2,b.z,30,[0x657779,0xffac69],9,.3,true);}
  }else if(b.state==='walk'){
    if(b.stagger<=0){const speed=(b.enraged?2.5:1.85)*(b.slowTime>0?.5:1);moveCircle(b,dir.x*speed*dt,dir.z*speed*dt,nearbyObjects(b.x,b.z,b.radius+1),b.radius);b.walk+=dt*speed*2.8;}
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
  if(u.leftLeg)u.leftLeg.rotation.x=b.state==='walk'?Math.sin(b.walk)*.25:0;
  if(u.rightLeg)u.rightLeg.rotation.x=b.state==='walk'?-Math.sin(b.walk)*.25:0;
  if(u.leftArm){u.leftArm.rotation.x=b.state==='slamWindup'?-2.4:b.state==='recover'?.65:Math.sin(b.walk)*.15;u.leftArm.rotation.z=0;}
  if(u.rightArm){u.rightArm.rotation.x=b.state==='slamWindup'?-2.4:b.state==='recover'?.65:-Math.sin(b.walk)*.15;u.rightArm.rotation.z=0;}
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
  if(phase!=='playing'||dashCooldown>0||dashTime>0||Math.abs(stance-stanceTarget)>.005)return;
  kicking.cancel();
  const mx=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0)+touch.x;
  const mz=(keys.has('KeyS')||keys.has('ArrowDown')?1:0)-(keys.has('KeyW')||keys.has('ArrowUp')?1:0)+touch.y;
  dashDirection=Math.hypot(mx,mz)>.05?screenMovement(mx,mz):{...facing};dashTime=leap?.18:.23;if(leap)leap.dir={...dashDirection};dashCooldown=1.5;player.invincible=Math.max(player.invincible,.3);
  audio.play('dash');pulse(player.x,player.z,1.5,0x86d3c2,.25);
}
function guardDimensions(){
  const h=hero.userData.getHeadHalfExtents?.()||{x:.725*stats.size,y:.365*stats.size},gripCenter=stance>.9?.255:.43;
  // Wind around the held grip, with enough room for the complete equipped
  // head. Stock equipment fits a 1.30 m disk within the articulated arm span;
  // very large head upgrades retain their actual larger physical clearance.
  const reach=Math.max(.35,Math.min(1.05,Math.sqrt(Math.max(0,1.3**2-h.x**2))-h.y-.43+gripCenter));
  const radius=Math.hypot(.43+reach-gripCenter+h.y,h.x);
  return {reach,radius,height:radius+.08,forward:.73,gripCenter};
}
const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
function updatePlayer(dt){
  kicking.tick(dt);
  player.invincible=Math.max(0,player.invincible-dt);player.hurtAgo+=dt;
  hammerLightning=Math.max(0,hammerLightning-dt);
  dashCooldown=Math.max(0,dashCooldown-dt);attackCooldown=Math.max(0,attackCooldown-dt);leapCooldown=Math.max(0,leapCooldown-dt);throwCooldown=Math.max(0,throwCooldown-dt);landingRecovery=Math.max(0,landingRecovery-dt);
  if(player.hurtAgo>8&&player.hp<player.maxHp)player.hp=Math.min(player.maxHp,player.hp+1.25*dt);
  if(stance!==stanceTarget){const step=dt/1.05;stance=Math.abs(stance-stanceTarget)<=step?stanceTarget:stance+Math.sign(stanceTarget-stance)*step;}
  const move=movementDirection(),moving=Math.hypot(move.x,move.z)>.01;
  updateAim();guarding=guardHeld&&!kicking.active&&!swing&&!spin&&!weaponBusy()&&!chargeStarted;
  // Locomotion owns facing. Cursor aim is independent only for the thrown
  // hammer, or while standing still; attacks never turn a running hero sideways.
  if(!spin){
    if(kicking.active)facing={...kicking.active.dir};
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
      if(characterStats.canAirSmash&&l.attackHeld&&!l.slam&&l.attackTime>=SPIN_HOLD_SECONDS){l.slam=true;audio.play('charge',.55);}
      const wait=characterStats.canAirSmash&&l.attackHeld?SPIN_HOLD_SECONDS:.12;
      if(l.attackTime>=wait&&l.time>=.20&&!l.diving){
        l.diving=true;l.diveTime=0;l.vy=Math.min(l.vy,l.slam?-22:-13);
        audio.play('swing',l.slam?1:.35,{variant:'two-overhead',weapon:characterStats.weaponTier<2?'wood':'metal',exert:true});
      }
    }
    if(l.diving)l.diveTime+=dt;
    l.vy-=(l.diving?38:30)*dt;player.y+=l.vy*dt;
    // Roofs below the previous feet position are landing surfaces; taller
    // objects are side walls. One shared threshold leaves no gap between them.
    const airDash=dashTime>0;
    const leapSpeed=airDash?19:characterStats.canAirSmash?(l.diving?9:8.2):5.8;
    const direction=airDash?dashDirection:l.dir;
    const obstacles=nearbyObjects(player.x,player.z,player.radius+leapSpeed*dt+.15).filter(o=>o.h>oldY+SUPPORT_EPSILON);
    moveCircle(player,direction.x*leapSpeed*dt,direction.z*leapSpeed*dt,obstacles,player.radius);
    if(airDash)dashTime=Math.max(0,dashTime-dt);
    const floor=supportHeight(player.x,player.z,oldY);
    if(l.vy<0&&player.y<=floor){player.y=floor;landLeap();}
  }else{
    let dx,dz;
    if(dashTime>0){dashTime=Math.max(0,dashTime-dt);dx=dashDirection.x*19*dt;dz=dashDirection.z*19*dt;if(Math.random()<.7)fragments.add(player.x,.15,player.z,1,[0x7ac9bd,0xa6ddcd],1,.06);}
    else{const speed=stats.speed*movementStrength()*(kicking.active?.28:guarding?.55:spin?.84:swing?.92:Math.abs(stance-stanceTarget)>.005?.55:landingRecovery>0?.25:1);dx=move.x*speed*dt;dz=move.z*speed*dt;}
    dx+=player.vx*dt;dz+=player.vz*dt;player.vx*=Math.exp(-9*dt);player.vz*=Math.exp(-9*dt);
    const actual=moveCircle(player,dx,dz,nearbyObjects(player.x,player.z,player.radius+Math.hypot(dx,dz)+.1).filter(o=>o.h>player.y+SUPPORT_EPSILON),player.radius);player.walk+=Math.hypot(actual.x,actual.z)*6;
    const floor=supportHeight(player.x,player.z,player.y);
    if(player.y>floor){player.vy=(player.vy||0)-20*dt;player.y=Math.max(floor,player.y+player.vy*dt);}else{player.y=floor;player.vy=0;}
  }
  if(spinRecovery){spinRecovery.time+=dt;if(spinRecovery.time>=.12)spinRecovery=null;}
  if(attackBuffer){attackBuffer.life-=dt;if(attackBuffer.life<=0)attackBuffer=null;}
  if(chargeHeld){
    holdElapsed+=dt;
    if(!spin&&holdElapsed>=SPIN_HOLD_SECONDS&&!weaponBusy()&&!guardHeld){
      let previousHits=null;
      if(swing&&swing.time/swing.duration>=SWING_CONTACT_END){previousHits=swing.hits;swing=null;attackCooldown=0;}
      if(!swing&&attackCooldown<=0)startSpin(previousHits);
    }
  }
  if(attackBuffer&&!chargeHeld&&!spin&&swing&&swing.time/swing.duration>=.74&&!weaponBusy()&&!guardHeld){swing=null;attackCooldown=0;}
  if(attackBuffer&&!chargeHeld&&!spin&&!swing&&attackCooldown<=0&&!weaponBusy()&&!guardHeld){
    attackBuffer=null;chargeStarted=true;charge=0;beginSwing();
  }
  if(spin){
    const s=spin,oldCycle=s.cycle;s.time+=dt;const turn=dt*Math.PI*2/SPIN_TURN_SECONDS;
    s.rotation+=turn;s.cycle=Math.floor(s.rotation/(Math.PI*2));s.recoil=Math.max(0,s.recoil-dt*12);
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
  kicking.contact();
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
  if(spin)hero.rotation.y=spin.angle;
  else if(moving||leap||dashTime>0||guarding||swing)hero.rotation.y=targetAngle;
  else hero.rotation.y+=diff*(1-Math.exp(-dt*24));
  hero.position.set(player.x,player.y+(dashTime>0?.15:Math.abs(walk)*(swing?.025:.07)),player.z);
  const p=swing?clamp(swing.time/swing.duration,0,1):0;
  const motion=swing?(swing.blocked?swing.blockPose:sampleHammerSwing(p,{twoHanded:swing.twoHanded,charge:swing.q,variant:swing.variant})):null;
  const settle=swing?.blocked?1-smooth((swing.time-swing.blockTime)/.12):1;
  const impactRecoil=swing?.contactTime!==undefined?Math.sin(clamp((swing.time-swing.contactTime)/.085,0,1)*Math.PI)*.055:0;
  const spinPose=spin?sampleHammerSpin(spin.rotation,stance>.9):null,spinBlend=spin?smooth(spin.time/.18):0;
  const torque=spin?lerp(spin.fromBody.y,spinPose.bodyYaw,spinBlend):motion?motion.bodyYaw*settle:guarding?-.08:0;
  const spinStep=spin?Math.sin(spin.rotation*2)*.20:0;
  if(u.leftLeg){u.leftLeg.rotation.x=leap?-.55:spin?spinPose.leftLegPitch:motion?motion.leftLegPitch*settle+walk*.38:walk*.58;u.leftLeg.rotation.z=spin?spinPose.leftLegRoll:motion?motion.leftLegRoll*settle:0;}
  if(u.rightLeg){u.rightLeg.rotation.x=leap?.45:spin?spinPose.rightLegPitch:motion?motion.rightLegPitch*settle-walk*.38:-walk*.58;u.rightLeg.rotation.z=spin?spinPose.rightLegRoll:motion?motion.rightLegRoll*settle:0;}
  if(u.body){
    u.body.rotation.x=leap?(leap.diving?.5:-.18):dashTime>0?.25:spin?lerp(spin.fromBody.x,spinPose.bodyPitch,spinBlend):guarding?.14:motion?motion.bodyPitch*settle-impactRecoil:landingRecovery>0?.32:0;
    u.body.rotation.y=torque;u.body.rotation.z=motion?motion.bodyRoll*settle:spin?lerp(spin.fromBody.z,spinPose.bodyRoll,spinBlend):0;
    u.body.position.y=landingRecovery>0?-.12:spin?lerp(spin.fromDrop,spinPose.bodyDrop,spinBlend):motion?motion.bodyDrop*settle:Math.sin(visualTime*2)*.015;
  }
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
  }else if(spin){
    const direction=poseDirection.set(spinPose.directionX,spinPose.directionY,spinPose.directionZ);
    const target=new THREE.Quaternion().setFromUnitVectors(shaftUp,direction)
      .multiply(new THREE.Quaternion().setFromAxisAngle(shaftUp,spinPose.shaftTwist));
    rig.position.lerpVectors(spin.fromPosition,new THREE.Vector3(spinPose.gripX,spinPose.gripY,spinPose.gripZ),spinBlend);
    rig.quaternion.copy(spin.fromRotation).slerp(target,spinBlend);
    // Counter the local regrip with the root turn. The head keeps moving in
    // its existing world direction instead of reversing or teleporting as
    // the hands bring the club from the follow-through to the braced grip.
    hero.updateMatrixWorld(true);
    const localHead=hero.worldToLocal(u.hammerHead.getWorldPosition(new THREE.Vector3()));
    const localYaw=Math.atan2(localHead.x,localHead.z);
    const compensation=Math.atan2(Math.sin(spin.fromHeadYaw-localYaw),Math.cos(spin.fromHeadYaw-localYaw));
    spin.angle=spin.baseAngle-spin.rotation+compensation;hero.rotation.y=spin.angle;
  }else if(guarding){
    const g=guardDimensions();u.setReach?.(g.reach);rig.rotation.set(0,0,guardAngle);
    const shaftDirection=poseDirection.set(0,1,0).applyQuaternion(rig.quaternion);
    rig.position.set(0,g.height,g.forward).addScaledVector(shaftDirection,-g.gripCenter);
  }
  else if(leap){
    const descend=leap.diving?smooth((leap.diveTime||0)/.11):0;
    const lift=leap.strike?smooth(leap.attackTime/.10):.4;
    rig.position.set(stance>.9?.02:.27,lerp(1.25+lift*.27,.98,descend),lerp(.26,.47,descend));
    const pitch=lerp(.7+lift*.95,-.34,descend);
    rig.quaternion.setFromUnitVectors(shaftUp,poseDirection.set(.04,Math.sin(pitch),Math.cos(pitch)).normalize());
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
  else if(landingRecovery>0){rig.rotation.set(2.0,0,-.05);rig.position.set(0,.9,.7);}
  else if(spinRecovery){const t=smooth(spinRecovery.time/.12);if(spinRecovery.fromReach!==undefined)u.setReach?.(lerp(spinRecovery.fromReach,u.reachScale,t));rig.position.lerpVectors(spinRecovery.fromPosition,new THREE.Vector3(rp.x,rp.y,rp.z),t);rig.quaternion.copy(spinRecovery.fromRotation).slerp(restQuaternion,t);}
  if(swing&&u.getHeadFloorY)rig.position.y+=Math.max(0,.04-u.getHeadFloorY());
  kicking.pose();
  u.updateGrip?.();
  flashMaterials(player,player.invincible>0&&player.hurtAgo<1?(Math.sin(visualTime*30)*.5+.5)*.55:0,0xff8b71);
  chargeRing.visible=!!spin;chargeRing.position.set(player.x,player.y+.07,player.z);chargeRing.scale.setScalar(stats.range*.88);chargeRing.material.opacity=spin?.12+Math.sin(spin.rotation*2)*.04:0;chargeRing.material.color.setHex(0xffcb7d);
  const markerDirection=touchThrowAim?.dragged||touchThrowQueued||throwWindup?aim:facing;
  directionMarker.position.set(player.x+markerDirection.x*1.15,player.y+.055,player.z+markerDirection.z*1.15);directionMarker.rotation.y=Math.atan2(markerDirection.x,markerDirection.z);directionMarker.visible=phase==='playing';
  if(guardRing){const g=guardDimensions();guardRing.visible=guarding;guardRing.position.set(player.x+facing.x*g.forward,player.y+g.height,player.z+facing.z*g.forward);guardRing.scale.setScalar(g.radius/1.72);guardRing.rotation.set(0,Math.atan2(facing.x,facing.z),0);guardRing.material.opacity=.12+Math.sin(guardAngle*2)*.035;}
  if(groundShadow){groundShadow.position.set(player.x,.035,player.z);groundShadow.scale.setScalar(1+player.y*.035);groundShadow.material.opacity=clamp(.34-player.y*.018,.15,.34);groundShadow.visible=phase!=='menu';}
  if(landingMarker){landingMarker.visible=!!leap;landingMarker.position.set(player.x,.09,player.z);landingMarker.scale.setScalar(leap?.slam?5.2+stats.quake*.7:leap?.strike?1.65:.9);landingMarker.material.color.setHex(leap?.slam?0xffbf6d:0x9edac9);}
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
  kicking.updateProps(dt);
  updateEnemies(dt);if(phase!=='playing')return;
  updateBoss(dt);if(phase!=='playing')return;
  updateDrops(dt);updateObjects(dt);checkGoal();
  updateWaves(dt);
  checkpointTimer+=dt;if(checkpointTimer>=8){checkpointTimer=0;persistCharacter();}
  const district=world.regionAt?.(player.x,player.z);
  if(district&&currentDistrict!==district.id){currentDistrict=district.id;$('districtName').textContent=district.name;if(roundTime>6)toast(district.name,district.weather==='snow'?'Ο άνεμος φέρνει χιόνι.':district.weather==='ash'?'Πρόσεχε τη λάβα και τις φωτιές.':'Η βροχή δεν σταματά την ορδή.','#82c7bb');}
}
function updateHUD(force=false){
  if($('kickButton')){
    $('kickButton').disabled=phase!=='playing'||!!leap||!!throwWindup||kicking.cooldown>0;
    $('kickButton').classList.toggle('active',!!kicking.active);
    $('kickValue').textContent=kicking.cooldown>0?kicking.cooldown.toFixed(1)+'s':'ΚΛΩΤΣΙΑ +'+(levels.kick||0);
  }
  if(!world)return;
  renderCharacterProgress();
  $('healthFill').style.width=(player.hp/player.maxHp*100)+'%';$('healthValue').textContent=Math.ceil(player.hp)+' / '+player.maxHp;
  $('healthFill').style.background=player.hp<player.maxHp*.3?'#ef7766':'';
  const percent=destructionPercent(world.objects);$('goalValue').textContent=Math.floor(percent)+'%';$('goalFill').style.width=Math.min(100,percent/GOAL*100)+'%';
  $('objectiveText').textContent=bossSpawned?boss&&!boss.dead?'Ο στόχος πέτυχε. Νίκησε τον Κολοσσό!':'Ο Κολοσσός έπεσε. Συνέχισε την εξέλιξή σου.':'Φτάσε στο 60% για να καλέσεις τον Κολοσσό.';
  $('sectorValue').textContent=String(sector).padStart(2,'0');$('killsValue').textContent=kills;$('relicValue').textContent=relics;$('roundValue').textContent=String(round).padStart(2,'0');
  $('waveEnemiesValue').textContent=boss&&!boss.dead?String(enemies.length):String(Math.max(0,(wave?.total||0)-(wave?.defeated||0)))+' / '+(wave?.total||10);
  $('waveStatus').textContent=boss&&!boss.dead?'ΤΕΛΙΚΟΣ BOSS':wave?.state==='break'?'ΚΥΜΑ ΚΑΘΑΡΟ · ΕΠΟΜΕΝΟ ΣΕ '+Math.ceil(wave.breakTimer)+'s':enemies.filter(e=>e.waveNumber===wave?.number).length+' ΕΝΕΡΓΟΙ · '+Math.max(0,(wave?.total||0)-(wave?.spawned||0))+' ΕΡΧΟΝΤΑΙ';
  $('timeValue').textContent=String(Math.floor(elapsed/60)).padStart(2,'0')+':'+String(Math.floor(elapsed%60)).padStart(2,'0');
  $('chargeFill').style.width=spin?'100%':chargeHeld?Math.min(100,holdElapsed/SPIN_HOLD_SECONDS*100)+'%':'0%';
  $('chargeWrap').classList.toggle('spinning',!!spin);
  $('chargeText').textContent=spin?'ΑΦΗΣΕ ΓΙΑ ΣΤΟΠ':chargeHeld?'ΚΡΑΤΑ: ΠΕΡΙΣΤΡΟΦΗ':touchLayout?'ΚΡΑΤΑ ΠΕΡΙΣΤΡΟΦΗ':'ΚΡΑΤΑ ΑΡ. ΚΛΙΚ: 360°';
  document.querySelector('[data-key="ShiftLeft"]')?.classList.toggle('cooldown',dashCooldown>0);
  if(boss){$('bossFill').style.width=Math.max(0,boss.hp/boss.maxHp*100)+'%';$('bossValue').textContent=(boss.enraged?'ΙΙ · ':'')+Math.max(0,Math.ceil(boss.hp))+' / '+Math.ceil(boss.maxHp)+' HP';}
  const stanceLabel=Math.abs(stance-stanceTarget)>.005?'ΑΛΛΑΓΗ ΛΑΒΗΣ…':stance>.95?'ΔΥΟ ΧΕΡΙΑ · +25% ΙΣΧΥΣ':characterStats.hasShield?'ΣΦΥΡΙ + ΑΣΠΙΔΑ':'ΛΑΒΗ ΜΕ ΕΝΑ ΧΕΡΙ';
  for(const id of ['stanceValue','mobileStanceValue'])if($(id))$(id).textContent=stanceLabel;
  for(const id of ['stanceButton','mobileStanceButton'])$(id)?.setAttribute('aria-pressed',String(stanceTarget===1));
  if($('guardValue'))$('guardValue').textContent=guarding?'ΠΡΟΣΤΑΣΙΑ ΜΠΡΟΣΤΑ':throwFlight?'ΧΩΡΙΣ ΣΦΥΡΙ':touchLayout?'ΚΡΑΤΑ ΓΙΑ ΑΜΥΝΑ':'ΚΡΑΤΑ RMB';
  if($('leapValue'))$('leapValue').textContent=leap?(leap.slam?'ΣΥΝΤΡΙΒΗ!':leap.strike?'SMASH ΕΤΟΙΜΟ':touchLayout?'ΠΑΤΑ ΧΤΥΠΗΜΑ':'LMB: ΜΙΚΡΟ SMASH'):leapCooldown>0?leapCooldown.toFixed(1)+'s':'ΕΤΟΙΜΟ';
  if($('throwValue'))$('throwValue').textContent=touchThrowQueued?'ΕΤΟΙΜΑΖΕΤΑΙ':touchThrowAim?.channeling?'ΑΦΗΣΕ ΓΙΑ ΡΙΨΗ':throwFlight?(throwFlight.grounded?'ΜΑΖΕΨΕ ΤΟ ΟΠΛΟ':throwFlight.returning?'ΕΠΙΣΤΡΟΦΗ':throwFlight.hitCount&&characterStats.canRicochet?'ΑΛΥΣΙΔΑ '+throwFlight.hitCount:'ΣΤΟΝ ΑΕΡΑ'):throwCooldown>0?throwCooldown.toFixed(1)+'s':hammerLightning>0?'ΚΕΡΑΥΝΟΣ!':touchLayout?'ΣΥΡΕ ΓΙΑ ΣΤΟΧΕΥΣΗ':'ΣΤΟΧΕΥΣΕ';
  if($('dashValue'))$('dashValue').textContent=dashTime>0?(leap?'AIR DASH!':'ΑΠΟΦΥΓΗ!'):dashCooldown>0?dashCooldown.toFixed(1)+'s':leap?'ΣΤΟΝ ΑΕΡΑ':'ΕΤΟΙΜΟ';
  updateAttackFeedback();
  $('guardButton')?.classList.toggle('active',guardHeld||guarding);
  $('leapButton')?.classList.toggle('cooldown',!leap&&leapCooldown>0);
  $('leapButton')?.classList.toggle('airborne',!!leap);
  $('throwButton')?.classList.toggle('cooldown',!!(throwFlight||throwWindup)||throwCooldown>0);
  $('throwButton')?.classList.toggle('aiming',!!touchThrowAim?.dragged);
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
  const holding=chargeHeld||!!spin,air=!!leap;
  button.classList.toggle('active',!!swing||holding||!!leap?.slam||!!leap?.strike);
  button.classList.toggle('air-smash-ready',air&&!leap.strike);
  button.classList.toggle('air-smash-armed',!!leap?.slam||!!leap?.strike);
  button.classList.toggle('spin-active',!!spin);button.classList.toggle('spin-pending',chargeHeld&&!spin);
  button.dataset.action=air?'air':holding?'spin':'attack';
  $('attackIcon')?.setAttribute('href',air?'#a-slam':holding?'#a-spin':'#a-swing');
  $('attackTouchIcon')?.setAttribute('href',air?'#t-slam':holding?'#t-spin':'#t-attack');
  $('attackName').textContent=air?(leap.slam||leap.strike?'ΕΤΟΙΜΟ':'ΜΙΚΡΟ SMASH'):holding?'360°':characterStats.weaponTier<2?'ΧΤΥΠΗΜΑ':'ΣΦΥΡΙΑ';
  $('attackValue').textContent=throwFlight?'ΜΑΖΕΨΕ ΤΟ ΟΠΛΟ':air?'ΠΑΤΑ ΣΤΟΝ ΑΕΡΑ':spin?'ΑΦΗΣΕ ΓΙΑ ΣΤΟΠ':chargeHeld?'ΚΡΑΤΑ ΓΙΑ ΣΥΝΕΧΕΙΑ':'ΠΑΤΑ · ΚΡΑΤΑ ΓΙΑ 360°';
  const label=air?(leap.slam||leap.strike?'Το χτύπημα είναι έτοιμο για την προσγείωση.':characterStats.canAirSmash?'Πάτησε στον αέρα για μικρό smash. Κράτα για μεγάλη συντριβή.':'Πάτησε στον αέρα για μικρό smash.'):spin?'Συνεχής περιστροφή 360°. Άφησε για να σταματήσεις.':'Χτύπημα με '+characterStats.weaponName.toLowerCase()+'. Κράτα για συνεχή περιστροφή 360°.';
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
function drawHP(x,y,z,hp,maxHp,tint,alpha=1,label='',width=76){
  const p=screenPoint(x,y,z);if(!p.inside||p.x<-80||p.x>screenW+80||p.y<-35||p.y>screenH+35)return;
  const c=fxContext;c.globalAlpha=clamp(alpha,0,1);c.textAlign='center';c.font='bold 11px "Courier New",monospace';
  c.fillStyle='rgba(11,24,28,.92)';c.fillRect(p.x-width/2-5,p.y-19,width+10,27);
  c.fillStyle='#fff2d4';c.fillText(Math.max(0,Math.ceil(hp))+' / '+Math.ceil(maxHp)+' HP',p.x,p.y-6);
  c.fillStyle='#34464a';c.fillRect(p.x-width/2,p.y,width,4);c.fillStyle=tint;c.fillRect(p.x-width/2,p.y,width*clamp(hp/maxHp,0,1),4);
  if(label){c.font='bold 9px monospace';c.fillStyle=tint;c.fillText(label,p.x,p.y-23);}
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
  for(const e of nearbyTargets){
    if(e.dead)continue;
    const focused=e===focusedTarget,r=e.radius+(focused?.38:.26);
    c.strokeStyle=focused?'#ffd180':'#8ce4d8';c.globalAlpha=focused?.96:.55;c.lineWidth=focused?2.1:1.3;
    // Project four ground-plane brackets; rings stay under the enemy's feet.
    for(let quadrant=0;quadrant<4;quadrant++){
      const base=quadrant*Math.PI/2+Math.PI/12;c.beginPath();
      for(let step=0;step<=10;step++){
        const angle=base+step/10*Math.PI/3,p=screenPoint(e.x+Math.sin(angle)*r,.065,e.z+Math.cos(angle)*r);
        if(step===0)c.moveTo(p.x,p.y);else c.lineTo(p.x,p.y);
      }c.stroke();
    }
    if(focused){const p=screenPoint(e.x,.07,e.z);c.fillStyle='#ffd180';c.beginPath();c.moveTo(p.x,p.y-5);c.lineTo(p.x-3,p.y);c.lineTo(p.x+3,p.y);c.closePath();c.fill();}
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
  for(const e of enemies){
    const near=Math.hypot(e.x-player.x,e.z-player.z)<20;
    if(!near&&e.hurtTimer<=0&&focusedTarget!==e)continue;
    if(near&&e.hurtTimer<=0&&!(world.hasLineOfSight?.(player.x,player.z,e.x,e.z,.12)??true))continue;
    drawHP(e.x,e.y+e.height+.45,e.z,e.hp,e.maxHp,enemyLevelColor(e.level),1,'LV '+e.level+(e.stun>0?' · ΖΑΛΗ':e.miniBoss?' · '+e.name:''),e.miniBoss?104:82);
  }
  if(boss&&!boss.dead&&boss.y>=0)drawHP(boss.x,boss.y+boss.height+.4,boss.z,boss.hp,boss.maxHp,enemyLevelColor(boss.level),1,'LV '+boss.level+' · ΚΟΛΟΣΣΟΣ',112);
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
  if(leap){armAirSmash();updateAttackFeedback();return;}
  if(kicking.active||throwFlight||throwWindup||Math.abs(stance-stanceTarget)>.005||guardHeld||chargeHeld)return;
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
  for(const id of ['soundButton','muteButton']){
    const button=$(id);if(!button)continue;
    button.setAttribute('data-audio-control','');
    button.classList.toggle('muted',silent);button.classList.toggle('audio-blocked',blocked);
    button.setAttribute('aria-pressed',String(silent));button.setAttribute('aria-label',label);button.setAttribute('title',label);
  }
  for(const id of ['muteIcon','soundIcon'])$(id)?.setAttribute('href',silent?'#a-sound-off':'#a-sound-on');
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
  const rect=$('gameCanvas').getBoundingClientRect();
  pointer.x=(e.clientX-rect.left)*screenW/Math.max(1,rect.width);
  pointer.y=(e.clientY-rect.top)*screenH/Math.max(1,rect.height);pointer.active=true;
}
function beginTouchThrow(e){
  if(!isTouchPointer(e)){startThrow();return;}
  // A returning hammer or a short recovery must not discard the entire
  // gesture. Aim can start now; only release commits an available throw.
  if(phase!=='playing'||leap||Math.abs(stance-stanceTarget)>.005)return;
  cancelAttack();guardHeld=false;guarding=false;pointer.active=false;
  touchThrowAim={pointerId:e.pointerId,startX:e.clientX,startY:e.clientY,dx:0,dy:0,dragged:false,
    time:0,channelTime:0,channelAngle:-.7,channeling:false,trailTime:0};
}
function moveTouchThrow(e){
  const g=touchThrowAim;if(!g||g.pointerId!==e.pointerId||phase!=='playing')return;
  g.dx=e.clientX-g.startX;g.dy=e.clientY-g.startY;
  // Crossing the threshold deliberately starts manual aim. Returning the
  // thumb to the origin keeps its last useful direction, without a divide by 0.
  const distance=Math.hypot(g.dx,g.dy);
  if(distance>=10){g.dragged=true;g.lastX=g.dx;g.lastY=g.dy;}
  else if(g.dragged){g.dx=g.lastX;g.dy=g.lastY;}
  if(g.dragged)updateAim();
}
function releaseTouchThrow(e){
  if(!touchThrowAim||touchThrowAim.pointerId!==e?.pointerId)return;
  moveTouchThrow(e);
  const dragged=touchThrowAim.dragged;
  if(dragged)updateAim();
  else{
    pointer.active=false;
    const move=movementDirection();
    if(move.x||move.z)facing=move;
    updateAim();
  }
  const direction={...aim};
  const channelAngle=touchThrowAim.channeling?touchThrowAim.channelAngle:null;
  touchThrowAim=null;pointer.active=false;
  if(phase==='playing'&&!leap&&Math.abs(stance-stanceTarget)<=.005&&!startThrow(direction,channelAngle)){
    // Preserve a release made just before recovery ends, with its original
    // direction. Never leave a delayed throw waiting indefinitely.
    touchThrowQueued={dir:direction,life:TOUCH_THROW_BUFFER_SECONDS};
  }
}
function cancelTouchThrow(){
  if(touchThrowAim?.channeling&&!swing&&!leap&&!throwFlight){const rig=hero.userData.weaponRig;spinRecovery={time:0,fromRotation:rig.quaternion.clone(),fromPosition:rig.position.clone(),fromReach:hero.userData.reachScale};}
  touchThrowAim=null;touchThrowQueued=null;pointer.active=false;$('throwButton')?.classList.remove('aiming','queued','channeling');
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
  $('closeSettingsButton').onclick=()=>{setPhase(previousPhase);save('ironfall.settings',settings);};
  $('qualitySelect').value=settings.quality;$('shakeToggle').checked=settings.shake;$('volumeRange').value=Math.round(settings.volume*100);
  $('qualitySelect').onchange=e=>{settings.quality=e.target.value;resize();save('ironfall.settings',settings);};
  $('shakeToggle').onchange=e=>{settings.shake=e.target.checked;save('ironfall.settings',settings);};
  $('volumeRange').oninput=e=>{settings.volume=Number(e.target.value)/100;audio.setVolume(settings.volume);if(settings.volume>0&&settings.muted){settings.muted=audio.toggle();}audio.unlock();updateSoundButtons();save('ironfall.settings',settings);};
  updateSoundButtons();
  window.addEventListener('keydown',e=>{
    const handled=['Space','KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftLeft','ShiftRight','Escape','KeyR','KeyZ','KeyU','KeyE'];
    if(handled.includes(e.code)&&!['INPUT','SELECT'].includes(document.activeElement?.tagName))e.preventDefault();
    if(e.code==='Escape'&&!e.repeat){if(phase==='playing'&&upgradePanelOpen)toggleUpgradePanel(false);else if(phase==='settings'){setPhase(previousPhase);}else pauseGame();return;}
    if(phase==='menu'&&e.code==='Enter'&&!$('startButton').disabled){startGame();return;}
    if(phase==='playing'&&upgradePanelOpen&&upgradeTab==='powers'&&['Digit1','Digit2','Digit3'].includes(e.code)){if(!e.repeat)$('upgradeChoices').children[Number(e.code.slice(-1))-1]?.click();return;}
    if(phase!=='playing')return;
    if(e.code==='KeyU'&&!e.repeat){toggleUpgradePanel();return;}
    keys.add(e.code);document.querySelector('[data-key="'+e.code+'"]')?.classList.add('active');
    if(e.code==='Space'&&!e.repeat)startLeap();
    if(e.code==='KeyR'&&!e.repeat)startThrow();
    if(e.code==='KeyE'&&!e.repeat)kicking.start();
    if(e.code==='KeyZ'&&!e.repeat)toggleStance();
    if((e.code==='ShiftLeft'||e.code==='ShiftRight')&&!e.repeat)dodge();
  });
  window.addEventListener('keyup',e=>{
    keys.delete(e.code);document.querySelector('[data-key="'+e.code+'"]')?.classList.remove('active');
  });
  window.addEventListener('blur',()=>{if(phase==='playing')setPhase('paused');clearInput();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&phase==='playing')setPhase('paused');});
  window.addEventListener('pointermove',e=>{
    if(phase!=='playing')return;
    if(e.pointerId===touchCanvasPointer&&!touchThrowAim){aimFromClient(e);return;}
    if(!isTouchPointer(e)&&!e.target?.closest?.('#combatDock,#upgradePanel,#upgradesToggle,.hud-buttons,#touchControls'))aimFromClient(e);
    if(e.pointerId===combatPointer&&typeof e.buttons==='number')syncCombatButtons(e.buttons);
  });
  $('gameCanvas').addEventListener('pointerdown',e=>{
    if(phase!=='playing'||(e.button!==undefined&&e.button!==0&&e.button!==2))return;
    if(isTouchPointer(e)){
      if(touchCanvasPointer!==null||touchThrowAim)return;
      e.preventDefault();touchCanvasPointer=e.pointerId;$('gameCanvas').setPointerCapture(e.pointerId);
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
  bindAction('kickButton',()=>kicking.start());
  if($('kickUpgradeButton'))$('kickUpgradeButton').onclick=improveKick;
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
  world.update(environmentDt,visualTime,player,weather);updateEffects(phase==='paused'||phase==='settings'?0:realDt);
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
