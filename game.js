import * as THREE from './vendor/three.module.js';
import {makeWarrior,makeEnemy,makeBoss,makeTreasure} from './models.js';
import {createWorld} from './world.js';
import {GameAudio} from './audio.js';
import {GOAL,BOUNDS,clamp,lerp,normalize,screenMovement,nearestPoint,circleOverlaps,moveCircle,attackStats,destructionPercent,UPGRADE_DEFS,calculateStats} from './core.js?v=20261105-fast2';
import {segmentCircleHit,firstHammerHit,facingCoverage} from './combat.js';

const $ = id => document.getElementById(id);
const save = (key,value) => {try {localStorage.setItem(key,JSON.stringify(value));} catch {}};
const read = (key,fallback) => {try {return JSON.parse(localStorage.getItem(key)) ?? fallback;} catch {return fallback;}};
const settings = Object.assign({quality:'high',shake:true,volume:0.6,muted:false},read('ironfall.settings',{}));
const keys = new Set();
const touch = {x:0,y:0,attack:false};
const audio = new GameAudio();
audio.setVolume(settings.volume);
let renderer,scene,camera,world,hero,sun,fillLight,chargeRing,directionMarker;
let phase='menu', previousPhase='menu', elapsed=0, roundTime=0, round=1, kills=0, relics=0, level=1, xp=0, xpTarget=12, score=0;
let enemies=[],drops=[],bolts=[],rings=[],arcs=[],numbers=[],telegraphs=[];
let boss=null,bossSpawned=false,spawnTimer=2.3,spawnCounter=0,lootCounter=0,announcementTimer=0;
let shake=0,hitStop=0,redFlash=0,combo=0,comboTimer=0,best=read('ironfall.best',0),visualTime=0,hudTimer=0,minimapTimer=0;
let chargeHeld=false,chargeStarted=false,charge=0,chargeFullPlayed=false,swing=null,attackCooldown=0,dashTime=0,dashCooldown=0;
let attackBuffer=null;
const CHARGE_SECONDS=.68,ATTACK_BUFFER_SECONDS=.30,SIMULATION_STEP=1/120;
let facing={x:-0.585491,z:-0.810679},dashDirection={x:0,z:-1},levels={power:0,size:0,range:0,speed:0,vitality:0,quake:0},stats=calculateStats(levels);
let stance=0,stanceTarget=0,guardHeld=false,guarding=false,guardAngle=0;
let leap=null,leapCooldown=0,throwWindup=null,throwFlight=null,throwCooldown=0,landingRecovery=0;
let hpEchoes=[],aimPreview=null,guardRing,landingMarker,groundShadow;
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

function setPhase(next){
  phase=next;document.body.dataset.state=next;
  $('menu').hidden=next!=='menu';$('hud').hidden=next==='menu';
  $('pauseMenu').hidden=next!=='paused';$('settingsMenu').hidden=next!=='settings';
  $('upgradeMenu').hidden=next!=='upgrade';$('endMenu').hidden=next!=='dead'&&next!=='victory';
  if(next!=='playing'){clearInput();if(guardRing)guardRing.visible=false;}
  else $('gameCanvas').focus({preventScroll:true});
}
function clearInput(){keys.clear();touch.x=0;touch.y=0;touch.attack=false;chargeHeld=false;chargeStarted=false;charge=0;attackBuffer=null;guardHeld=false;guarding=false;document.querySelectorAll('[data-key]').forEach(e=>e.classList.remove('active'));$('attackButton')?.classList.remove('active');$('chargeButton')?.classList.remove('active');$('slamButton')?.classList.remove('active');$('guardButton')?.classList.remove('active');if($('joystickKnob'))$('joystickKnob').style.transform='translate(0,0)';}
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
  const height=entity.height||entity.h||5.1;
  entity.damagePending=(entity.damagePending||0)+damage;
  if(entity.damagePending>=5||entity.hp<=0){floatText(entity.x,(entity.y||0)+height+.95,entity.z,'−'+Math.round(entity.damagePending),damage>=100?'#ffd47d':'#fff4d8',damage>=100?24:17);entity.damagePending=0;}
  if(entity.hp<=0)hpEchoes.push({x:entity.x,z:entity.z,y:(entity.y||0)+height+.35,maxHp:entity.maxHp,life:1.1});
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
function weaponTrail(a,b,width=.3,tint=0xffc473){
  if(a.distanceToSquared(b)<.00001)return;
  const positions=[a.x,a.y-width,a.z,a.x,a.y+width,a.z,b.x,b.y+width,b.z,a.x,a.y-width,a.z,b.x,b.y+width,b.z,b.x,b.y-width,b.z];
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color:tint,transparent:true,opacity:.7,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending}));
  scene.add(mesh);arcs.push({mesh,life:.16,max:.16});
}
function resetWorld(keepUpgrades=false){
  if(!keepUpgrades)round=1;
  for(const e of enemies){if(e.telegraph)removeEffect(e.telegraph);disposeInstance(e);}enemies=[];if(boss){if(boss.telegraph)removeEffect(boss.telegraph);disposeInstance(boss);}boss=null;
  for(const d of drops){scene.remove(d.mesh);disposeModelGeometry(d.mesh);}drops=[];
  for(const b of bolts){scene.remove(b.mesh);b.mesh.geometry.dispose();b.mesh.material.dispose();}bolts=[];
  for(const e of [...rings,...arcs])removeEffect(e.mesh);rings=[];arcs=[];
  if(throwFlight){disposeInstance(throwFlight);throwFlight=null;}
  stance=0;stanceTarget=0;guardHeld=false;guarding=false;guardHits.clear();leap=null;leapCooldown=0;throwWindup=null;throwCooldown=0;landingRecovery=0;hpEchoes=[];aimPreview=null;pointer.active=false;
  hero.userData.setWeaponVisible?.(true);hero.userData.setStance?.(0);if(guardRing)guardRing.visible=false;if(landingMarker)landingMarker.visible=false;
  for(const o of world?.objects||[]){disposeModelGeometry(o.mesh);for(const m of o.materials||[])m.dispose();}
  world?.dispose();
  world=createWorld(scene,{seed:1527+round*173,round});
  for(const o of world.objects){o.materials=prepareMaterials(o.mesh);o.flash=0;o.shudder=0;o.hurtTimer=0;o.baseY=o.mesh.position.y;o.baseRotation=o.mesh.rotation.clone();}
  player.x=0;player.z=0;player.y=0;player.vy=0;player.vx=0;player.vz=0;player.invincible=2;player.hurtAgo=100;
  if(!keepUpgrades){round=1;elapsed=0;kills=0;relics=0;level=1;xp=0;xpTarget=12;score=0;levels={power:0,size:0,range:0,speed:0,vitality:0,quake:0};}
  stats=calculateStats(levels);player.maxHp=stats.maxHp;player.hp=stats.maxHp;
  roundTime=0;currentDistrict='';bossSpawned=false;spawnTimer=2.8;spawnCounter=0;lootCounter=0;combo=0;comboTimer=0;charge=0;swing=null;attackBuffer=null;hitStop=0;attackCooldown=0;dashCooldown=0;dashTime=0;
  $('bossHud').hidden=true;fragments?.clear();numbers=[];cameraTarget.set(0,.6,0);
  hero.position.set(0,0,0);facing={x:-.585491,z:-.810679};hero.rotation.y=Math.atan2(facing.x,facing.z);
  applyStats();updateHUD(true);
}
function startGame(){audio.unlock().then(()=>audio.play('start'));resetWorld();setPhase('playing');announce('ΚΑΛΩΣ ΗΡΘΕΣ ΣΤΗΝ ΟΡΔΗ','Κατάστρεψε το 60% της πόλης για να ξυπνήσεις τον Κολοσσό.',4.3);}
function applyStats(){
  stats=calculateStats(levels);player.maxHp=stats.maxHp;
  if(hero.userData.hammerHead)hero.userData.hammerHead.scale.setScalar(stats.size);
  if($('powerValue'))$('powerValue').textContent=Math.round(stats.power);
  if($('sizeValue'))$('sizeValue').textContent=stats.size.toFixed(2)+'×';
  if($('rangeValue'))$('rangeValue').textContent=stats.range.toFixed(1)+' m';
  if($('speedValue'))$('speedValue').textContent=(stats.speed/5.9).toFixed(2)+'×';
  $('levelValue').textContent=level;
  if($('relicSlots'))$('relicSlots').innerHTML=UPGRADE_DEFS.filter(d=>levels[d.id]).map(d=>'<span title="'+d.name+'" style="--relic-color:'+d.color+'">'+d.icon+' <b>'+levels[d.id]+'</b></span>').join('');
}
function gainXP(value){xp+=value;while(xp>=xpTarget){xp-=xpTarget;level++;xpTarget=Math.ceil(xpTarget*1.34);player.hp=Math.min(player.maxHp,player.hp+18);toast('ΕΠΙΠΕΔΟ '+level,'+18 ζωή · Νέος θησαυρός!', '#83dfdb');spawnDrop(player.x+randomBetween(-1,1),player.z+randomBetween(-1,1),'relic');}applyStats();}

function spawnDrop(x,z,kind='gold'){
  if(drops.length>70){const gone=drops.shift();scene.remove(gone.mesh);disposeModelGeometry(gone.mesh);}
  const mesh=makeTreasure(kind);mesh.position.set(x,.4,z);scene.add(mesh);
  drops.push({mesh,x,z,kind,age:0,life:55,phase:Math.random()*6.28});
}
function openUpgrade(){
  setPhase('upgrade');audio.play('pickup',1);
  const choices=[...UPGRADE_DEFS].sort(()=>Math.random()-.5).slice(0,3);
  const wrap=$('upgradeChoices');wrap.replaceChildren();
  choices.forEach((choice,index)=>{
    const button=document.createElement('button');button.className='upgrade-card';button.style.setProperty('--card-accent',choice.color);
    button.innerHTML='<span class="upgrade-key">0'+(index+1)+'</span><span class="upgrade-icon">'+choice.icon+'</span><small>'+choice.label+'</small><h3>'+choice.name+'</h3><p>'+choice.text+'</p><span class="upgrade-level">ΒΑΘΜΙΔΑ '+((levels[choice.id]||0)+1)+' <span>ΕΠΙΛΟΓΗ ↗</span></span>';
    button.onclick=()=>{levels[choice.id]=(levels[choice.id]||0)+1;relics++;applyStats();if(choice.id==='vitality')player.hp=Math.min(player.maxHp,player.hp+40);audio.play('pickup');setPhase('playing');toast(choice.name,choice.label+' αναβαθμίστηκε.',choice.color);pulse(player.x,player.z,3.4,color.gold,.75);};
    wrap.appendChild(button);
  });
}

function weaponBusy(){return !!(throwFlight||throwWindup||leap||Math.abs(stance-stanceTarget)>.005||landingRecovery>0);}
function stancePower(){return stance>.95?1.25:1;}
function beginSwing(){
  if(phase!=='playing'||!chargeStarted||attackCooldown>0||weaponBusy()||guarding)return;
  const q=charge,details=attackStats(stats,q);
  swing={time:0,q,...details,duration:details.duration,damage:Math.round(details.damage*stancePower()),fx:facing.x,fz:facing.z,hit:false,hits:new Set(),blocked:false,fromRotation:hero.userData.weaponRig.quaternion.clone(),fromPosition:hero.userData.weaponRig.position.clone()};
  chargeStarted=false;charge=0;chargeFullPlayed=false;attackCooldown=swing.duration+.012;audio.play('swing',q);
  hero.updateMatrixWorld(true);hero.userData.hammerHead.getWorldPosition(headPrevious);
}
function hitEnemy(e,damage,dir,strength,lift){
  if(e.dead)return;
  e.hp-=damage;e.flash=.16;e.stagger=Math.max(e.stagger||0,.23+strength*.013);e.vx=dir.x*strength;e.vz=dir.z*strength;e.vy=lift;e.hurtTimer=2.4;
  if(e.state==='windup'){e.state='walk';e.timer=.6;if(e.telegraph){removeEffect(e.telegraph);e.telegraph=null;}}
  flashMaterials(e,1);
  showHitPoints(e,damage);
  fragments.add(e.x,e.y+1,e.z,8,e.type==='zombie'||e.type==='brute'?[0x8fbea2,0xb6d5b4,0x83ceaa]:[0xffc271,0xf9e5b1,0x7eacb9],4,.07);
  if(e.hp<=0)killEnemy(e);
}
function killEnemy(e){
  e.dead=true;guardHits.delete(e);enemies=enemies.filter(n=>n!==e);kills++;combo++;comboTimer=3.8;score+=e.type==='brute'?70:25;
  fragments.add(e.x,1,e.z,e.type==='brute'?19:12,e.type==='robot'?[0x6c91a0,0xa5bec3,0xff9864]:[0x679378,0x9eaf83,0x4a6265],5,e.type==='brute'?.24:.16,true);
  if(e.telegraph)removeEffect(e.telegraph);disposeInstance(e);gainXP(e.type==='brute'?3:1);
  if(Math.random()<.16)spawnDrop(e.x,e.z,player.hp<player.maxHp*.7&&Math.random()<.65?'heart':'gold');
  if(combo===10||combo===25)toast(combo+' ΣΤΗ ΣΕΙΡΑ','Συνέχισε την κατεδάφιση!');
}
function hurtObject(o,damage,q=0){
  if(o.dead)return false;o.hp-=damage;o.flash=.15;o.shudder=.22;flashMaterials(o,.85);showHitPoints(o,damage);
  if(o.hp>0){fragments.add(o.x+randomBetween(-o.w/2,o.w/2),.7,o.z+randomBetween(-o.d/2,o.d/2),5,[o.color||0x8c9a91,0xf1c588],3,.1);return false;}
  o.dead=true;o.mesh.visible=false;score+=Math.round(o.weight*80);lootCounter++;
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
  if(!boss||boss.dead)return;
  boss.hp-=damage;boss.flash=.15;boss.stagger=.12;boss.vx=dir.x*strength*.13;boss.vz=dir.z*strength*.13;
  flashMaterials(boss,1);showHitPoints(boss,damage);fragments.add(boss.x,2,boss.z,12,[0xffbe75,0xff7546,0xb7cdd2],5,.1);
  if(boss.hp<=0)defeatBoss();
}
function checkGoal(){if(phase==='playing'&&!bossSpawned&&destructionPercent(world.objects)>=GOAL)spawnBoss();}
function impact(from=headPrevious,to=headNow){
  const s=swing;if(!s||s.blocked)return;
  const radius=.52*stats.size,shaftRadius=.30*stats.size;
  const grip=hero.userData.hammerPivot.getWorldPosition(new THREE.Vector3());
  const objects=world.objects.filter(o=>!o.dead&&!s.hits.has(o));
  const headWall=firstHammerHit(from,to,objects,radius),shaftWall=firstHammerHit(grip,to,objects,shaftRadius);
  const wall=shaftWall||headWall;
  let hits=0,breaks=0;
  for(const e of [...enemies,...(boss&&!boss.dead?[boss]:[])]){
    if(s.hits.has(e))continue;
    // The moving head and the physical shaft both make contact. This removes
    // the dead zone that let enemies touching the warrior survive every swing.
    const headContact=firstHammerHit(from,to,[e],radius),shaftContact=firstHammerHit(grip,to,[e],shaftRadius);
    if(!headContact&&!shaftContact)continue;
    if(headWall&&headContact&&headContact.t>headWall.t&&!shaftContact)continue;
    const lineOfContact=firstHammerHit(grip,{x:e.x,y:grip.y,z:e.z},[...objects,e],shaftRadius);
    if(lineOfContact&&lineOfContact.target!==e)continue;
    const dir=normalize(e.x-player.x+s.fx*.3,e.z-player.z+s.fz*.3);s.hits.add(e);hits++;
    if(e===boss)hitBoss(s.damage,dir,s.knockback);else hitEnemy(e,s.damage,dir,s.knockback,s.lift);
  }
  if(wall){s.hits.add(wall.target);hits++;if(hurtObject(wall.target,s.damage,s.q))breaks++;else{s.blocked=true;s.blockTime=s.time;s.blockRotation=hero.userData.weaponRig.quaternion.clone();s.blockPosition=hero.userData.weaponRig.position.clone();attackCooldown=Math.min(attackCooldown,.09);}}
  if(hits){s.hit=true;shake=Math.max(shake,(.07+s.q*.14)*(breaks?1.2:1));audio.play(breaks?'break':'hit',s.q);if(!s.feedbackDone){s.feedbackDone=true;hitStop=.008+s.q*.006;}}
  if(hits&&s.charged&&!s.quakeDone){
    s.quakeDone=true;const radius=2.3+stats.quake*.7;pulse(to.x,to.z,radius,0xffd48b,.35);
    for(const e of [...enemies])if(!s.hits.has(e)&&Math.hypot(e.x-to.x,e.z-to.z)<radius){s.hits.add(e);hitEnemy(e,s.damage*(.25+stats.quake*.12),normalize(e.x-to.x,e.z-to.z),s.knockback*.7,s.lift);}
    fragments.add(to.x,.2,to.z,20,[0xffbd6a,0xffedbf,0x9ba9a0],7,.1);
  }
  checkGoal();
}

function toggleStance(){
  if(phase!=='playing'||swing||throwFlight||throwWindup||leap||Math.abs(stance-stanceTarget)>.005)return;
  stanceTarget=stanceTarget===0?1:0;guardHeld=false;guarding=false;chargeStarted=false;chargeHeld=false;charge=0;attackBuffer=null;
  audio.play('ui');
}
function updateAim(){
  if(pointer.active){
    aimPlane.constant=-(player.y+1.2);camera.updateMatrixWorld(true);raycaster.setFromCamera({x:pointer.x/screenW*2-1,y:1-pointer.y/screenH*2},camera);
    const point=raycaster.ray.intersectPlane(aimPlane,tempV);
    if(point){const d=normalize(point.x-player.x,point.z-player.z);if(d.x||d.z){aim.x=d.x;aim.z=d.z;}}
  }else{aim.x=facing.x;aim.z=facing.z;}
  const releaseOffset=.55+(stats.range-.55-.52*stats.size+.365*stats.size-.21)/2;
  const start={x:player.x+aim.x*releaseOffset,y:player.y+1.2,z:player.z+aim.z*releaseOffset};
  const end={x:start.x+aim.x*17,y:start.y,z:start.z+aim.z*17};
  const contact=firstHammerHit(start,end,[...world.objects,...enemies,...(boss&&!boss.dead?[boss]:[])],hero.userData.getThrowRadius?.()||1.4);
  aimPreview={start,end:contact?{x:contact.x,y:start.y,z:contact.z}:end,contact};
}
function startLeap(){
  if(phase!=='playing'||leap||leapCooldown>0||throwFlight||throwWindup||Math.abs(stance-stanceTarget)>.005)return false;
  const attackWasHeld=chargeHeld||chargeStarted||keys.has('Space');
  chargeHeld=false;chargeStarted=false;charge=0;attackBuffer=null;guarding=false;guardHeld=false;dashTime=0;swing=null;attackCooldown=0;landingRecovery=0;
  const mx=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0)+touch.x;
  const mz=(keys.has('KeyS')||keys.has('ArrowDown')?1:0)-(keys.has('KeyW')||keys.has('ArrowUp')?1:0)+touch.y;
  const direction=Math.hypot(mx,mz)>.05?screenMovement(mx,mz):{...facing};facing={...direction};
  leap={time:0,dir:direction,vy:22.5,slam:attackWasHeld,diving:false,startY:player.y};leapCooldown=2.2;
  fragments.add(player.x,.1,player.z,15,[0xc7b78e,0x7d9690],5,.12);pulse(player.x,player.z,2.2,0xb9dac4,.25);audio.play('dash');return true;
}
function armAirSmash(){
  if(!leap||leap.slam)return;leap.slam=true;chargeHeld=false;chargeStarted=false;charge=0;audio.play('charge',.8);
}
function supportHeight(x,z,ceiling=Infinity){
  let height=0;
  for(const o of world.objects)if(!o.dead&&o.h<=ceiling+.08&&circleOverlaps(x,z,player.radius*.65,o))height=Math.max(height,o.h);
  return height;
}
function landLeap(){
  if(!leap)return;
  const slam=leap.slam;leap=null;player.vy=0;landingRecovery=slam?.14:.07;
  const radius=slam?5.2+stats.quake*.7:2.35;
  const damage=Math.round(stats.power*(slam?3.8:.9)*stancePower());
  for(const e of [...enemies]){const d=Math.hypot(e.x-player.x,e.z-player.z);if(d<=radius+e.radius)hitEnemy(e,Math.round(damage*lerp(1,.58,clamp(d/radius,0,1))),normalize(e.x-player.x,e.z-player.z),slam?13:5,slam?6:2.2);}
  for(const o of world.objects){if(o.dead)continue;const point=nearestPoint(player.x,player.z,o),d=Math.hypot(point.x-player.x,point.z-player.z);if(d<=radius)hurtObject(o,Math.round(damage*lerp(1,.65,d/radius)),slam?1:.2);}
  if(boss&&!boss.dead&&Math.hypot(boss.x-player.x,boss.z-player.z)<=radius+boss.radius)hitBoss(damage,normalize(boss.x-player.x,boss.z-player.z),slam?15:5);
  for(const r of slam?[radius,radius*.68,radius*.38]:[radius])pulse(player.x,player.z,r,slam?0xffd28b:0xb9d9cb,slam?.55:.3).position.y=player.y+.09;
  fragments.add(player.x,player.y+.15,player.z,slam?65:16,slam?[0xffcb80,0xfff0be,0x9a9d8b,0x5e7370]:[0xbeb594,0x738680],slam?11:4,slam?.22:.11,slam);
  if(slam)for(let i=0;i<10;i++){const angle=i*Math.PI/5+Math.random()*.2,points=[];for(let j=0;j<4;j++){const r=j/3*radius;points.push(new THREE.Vector3(player.x+Math.sin(angle+j*.08)*r,player.y+.1,player.z+Math.cos(angle+j*.08)*r));}const mesh=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:0xffd38f,transparent:true,opacity:1}));scene.add(mesh);arcs.push({mesh,life:.6,max:.6});}
  shake=slam?.38:.1;hitStop=slam?.022:.005;audio.play(slam?'break':'hit',slam?1:.2);checkGoal();
}
function startThrow(){
  if(phase!=='playing'||throwFlight||throwWindup||throwCooldown>0||swing||leap||Math.abs(stance-stanceTarget)>.005)return;
  updateAim();throwWindup={time:0,dir:{...aim},fromRotation:hero.userData.weaponRig.quaternion.clone()};
  facing={...aim};chargeStarted=false;chargeHeld=false;charge=0;attackBuffer=null;guardHeld=false;guarding=false;
}
function releaseHammer(){
  const dir=throwWindup.dir,mesh=hero.userData.createThrownHammer();
  hero.updateMatrixWorld(true);
  const balance=mesh.userData.balance||{x:0,y:mesh.userData.balanceY,z:0};
  const origin=hero.userData.hammerPivot.localToWorld(new THREE.Vector3(balance.x,balance.y,balance.z));
  const {x,y,z}=origin,quaternion=hero.userData.hammerPivot.getWorldQuaternion(new THREE.Quaternion());
  mesh.position.copy(origin);mesh.quaternion.copy(quaternion);scene.add(mesh);
  const materials=new Set();mesh.traverse(n=>{if(n.material)for(const m of Array.isArray(n.material)?n.material:[n.material])materials.add(m);});
  throwFlight={mesh,materials:[...materials],x,y,z,dir,quaternion,spinAxis:new THREE.Vector3(dir.z,0,-dir.x),radius:mesh.userData.radius,speed:23,distance:0,returning:false,life:0};
  hero.userData.setWeaponVisible(false);throwWindup=null;throwCooldown=1.25;audio.play('swing',1);
}
function updateThrownHammer(dt){
  if(!throwFlight)return;const h=throwFlight;h.life+=dt;
  const from=new THREE.Vector3(h.x,h.y,h.z);
  if(h.returning){
    const target=new THREE.Vector3(player.x,player.y+1.25,player.z),delta=target.sub(from),distance=delta.length();
    if(distance<.75||distance<29*dt){disposeInstance(h);throwFlight=null;hero.userData.setWeaponVisible(true);audio.play('pickup',.2);pulse(player.x,player.z,.9,color.teal,.2);return;}
    delta.multiplyScalar(29*dt/distance);h.x+=delta.x;h.y+=delta.y;h.z+=delta.z;
  }else{
    const to={x:h.x+h.dir.x*h.speed*dt,y:h.y,z:h.z+h.dir.z*h.speed*dt};
    const hit=firstHammerHit(from,to,[...world.objects,...enemies,...(boss&&!boss.dead?[boss]:[])],h.radius);
    h.x=hit?hit.x:to.x;h.z=hit?hit.z:to.z;h.distance+=h.speed*dt;
    if(hit){const target=hit.target,damage=Math.round(stats.power*2.2*stancePower());
      if(target===boss)hitBoss(damage,h.dir,11);else if(target.w!==undefined)hurtObject(target,damage,.7);else hitEnemy(target,damage,h.dir,11,3.2);
      h.returning=true;fragments.add(h.x,h.y,h.z,16,[0xffd992,0xbbe0dc],6,.1);pulse(h.x,h.z,1.7,color.gold,.25);shake=Math.max(shake,.18);audio.play('hit',.7);checkGoal();
    }else if(h.distance>17||Math.abs(h.x)>BOUNDS||Math.abs(h.z)>BOUNDS)h.returning=true;
  }
  h.mesh.position.set(h.x,h.y,h.z);h.mesh.quaternion.copy(h.quaternion).premultiply(new THREE.Quaternion().setFromAxisAngle(h.spinAxis,h.life*20));
  weaponTrail(from,new THREE.Vector3(h.x,h.y,h.z),.24,h.returning?0x8ce4d8:0xffc473);
}

function spawnPosition(distance=20){
  for(let i=0;i<30;i++){
    const angle=Math.random()*Math.PI*2,r=distance+Math.random()*5;
    const x=clamp(player.x+Math.sin(angle)*r,-39,39),z=clamp(player.z+Math.cos(angle)*r,-39,39);
    if(Math.hypot(x-player.x,z-player.z)>12&&!world.objects.some(o=>circleOverlaps(x,z,.8,o)))return {x,z};
  }
  return {x:0,z:player.z>0?-36:36};
}
function spawnEnemy(forcedType=null,position=null){
  const cap=settings.quality==='low'?40:58;if(enemies.length>=cap)return;
  const roll=Math.random();const type=forcedType||(roundTime>35&&roll<.13?'brute':roll<.43?'robot':'zombie');
  const mesh=makeEnemy(type);let pos=position||spawnPosition(19);const factor=1+(round-1)*.28;
  if(world.objects.some(o=>circleOverlaps(pos.x,pos.z,.8,o))){
    const origin={...pos};let found=false;
    for(let ring=1;ring<5&&!found;ring++)for(let i=0;i<12;i++){const a=i*Math.PI/6,p={x:clamp(origin.x+Math.sin(a)*ring,-39,39),z:clamp(origin.z+Math.cos(a)*ring,-39,39)};if(!world.objects.some(o=>circleOverlaps(p.x,p.z,.8,o))){pos=p;found=true;break;}}
    if(!found)pos=spawnPosition(19);
  }
  scene.add(mesh);const base=type==='brute'?{hp:185,speed:1.55,radius:.71,height:2.55,damage:22}:type==='robot'?{hp:92,speed:2.45,radius:.47,height:1.8,damage:12}:{hp:57,speed:2.0,radius:.45,height:1.75,damage:11};
  const e={mesh,type,x:pos.x,z:pos.z,y:0,vx:0,vz:0,vy:0,...base,hp:base.hp*factor,maxHp:base.hp*factor,materials:prepareMaterials(mesh),flash:0,stagger:0,hurtTimer:0,walk:Math.random()*5,timer:randomBetween(.7,2.2),state:'walk',dead:false,telegraph:null,attackDir:{x:0,z:1},avoid:Math.random()<.5?-1:1};
  mesh.position.set(e.x,0,e.z);enemies.push(e);spawnCounter++;
  if(roundTime>5)fragments.add(e.x,.1,e.z,4,[0x537b77,0x81958a],2,.09);
}
function hurtPlayer(damage,dx=0,dz=0,blockable=true){
  if(phase!=='playing'||player.invincible>0||dashTime>0||(player.y>1.6&&blockable))return;
  const directionLength=Math.hypot(dx,dz),source={x:player.x-dx,z:player.z-dz};
  if(blockable&&directionLength>.01&&guarding&&facingCoverage(aim,source,player,Math.PI*.36)){
    fragments.add(player.x+aim.x,player.y+1.3,player.z+aim.z,7,[0xa5e5de,0xffd490],4,.07);audio.play('hit',.1);return;
  }
  if(blockable&&directionLength>.01&&stance<.05&&!throwWindup&&facingCoverage(facing,source,player,Math.PI*.32)){damage*=.65;fragments.add(player.x+facing.x*.6,player.y+1,player.z+facing.z*.6,4,[0xffd490,0x8dc9cd],3,.06);}

  player.hp=Math.max(0,player.hp-damage);player.invincible=.85;player.hurtAgo=0;player.vx=dx*4;player.vz=dz*4;
  redFlash=.55;shake=Math.max(shake,.19);combo=0;audio.play('hurt');floatText(player.x,2.5,player.z,'−'+Math.ceil(damage),'#ff8d80',21);
  if(player.hp<=0)endGame(false);
}
function guardContact(from,to){
  if(!guarding||!facingCoverage(aim,from,player,Math.PI*.42))return null;
  const before=(from.x-player.x)*aim.x+(from.z-player.z)*aim.z-.95;
  const after=(to.x-player.x)*aim.x+(to.z-player.z)*aim.z-.95;
  if(before<0||after>0||before===after)return null;
  const t=before/(before-after),x=lerp(from.x,to.x,t)-player.x,z=lerp(from.z,to.z,t)-player.z;
  const lateral=x*aim.z-z*aim.x,g=guardDimensions(),vertical=lerp(from.y,to.y,t)-player.y-g.height;
  return lateral*lateral+vertical*vertical<=(g.radius+.13)**2?t:null;
}
function shoot(e){
  const dir=normalize(player.x-e.x,player.z-e.z);
  const mesh=new THREE.Mesh(new THREE.OctahedronGeometry(.13),new THREE.MeshBasicMaterial({color:0xff7963}));
  mesh.position.set(e.x,1,e.z);scene.add(mesh);bolts.push({mesh,x:e.x,z:e.z,vx:dir.x*10.5,vz:dir.z*10.5,life:2.8,damage:e.damage});
}
function updateEnemies(dt){
  for(const e of [...enemies]){
    e.flash=Math.max(0,e.flash-dt);e.stagger=Math.max(0,e.stagger-dt);e.hurtTimer=Math.max(0,e.hurtTimer-dt);
    flashMaterials(e,e.flash/.16);
    const dx=player.x-e.x,dz=player.z-e.z,dist=Math.hypot(dx,dz),dir=normalize(dx,dz);
    if(dist>39&&!bossSpawned){const p=spawnPosition();e.x=p.x;e.z=p.z;}
    moveCircle(e,e.vx*dt,e.vz*dt,world.objects,e.radius);const damp=Math.exp(-7*dt);e.vx*=damp;e.vz*=damp;
    e.vy-=16*dt;e.y+=e.vy*dt;if(e.y<0){e.y=0;if(e.vy<-4)e.vy=-e.vy*.19;else e.vy=0;}
    e.timer-=dt;
    if(e.stagger<=0&&(e.y<.2||e.state==='lunge')){
      if(e.state==='walk'){
        let mx=dir.x,mz=dir.z;
        // Steer along obstacle faces rather than gathering behind a wall.
        const blocked=world.objects.some(o=>circleOverlaps(e.x+dir.x*1.05,e.z+dir.z*1.05,e.radius,o));
        if(blocked){mx=dir.x*.2-dir.z*e.avoid*.95;mz=dir.z*.2+dir.x*e.avoid*.95;}
        const separation={x:0,z:0};
        for(const other of enemies){if(other===e)continue;const ox=e.x-other.x,oz=e.z-other.z,dd=ox*ox+oz*oz;if(dd>.01&&dd<1.65){const repel=(1.3-Math.sqrt(dd))*.55;separation.x+=ox/Math.sqrt(dd)*repel;separation.z+=oz/Math.sqrt(dd)*repel;}}
        const stop=e.type==='robot'&&dist<6.5?0:1;
        const delta=moveCircle(e,(mx*e.speed*stop+separation.x)*dt,(mz*e.speed*stop+separation.z)*dt,world.objects,e.radius);
        e.walk+=Math.hypot(delta.x,delta.z)*6;
        e.mesh.rotation.y=Math.atan2(dir.x,dir.z);
        if(e.timer<=0&&((e.type==='robot'&&dist<12)||(e.type==='zombie'&&dist<3.1)||(e.type==='brute'&&dist<3.4))){
          e.state='windup';e.timer=e.type==='brute'?.82:e.type==='robot'?.8:.52;e.attackDir=dir;
          e.telegraph=makeTelegraph(e.x,e.z,e.type==='brute'?2.9:e.type==='robot'?.75:1.05,e.type==='robot'?0xff8d62:0xef6863);
        }
      }else if(e.state==='windup'){
        if(e.telegraph){e.telegraph.position.set(e.x,.09,e.z);e.telegraph.material.opacity=.35+Math.sin(visualTime*25)*.2;}
        if(e.timer<=0){
          if(e.telegraph){removeEffect(e.telegraph);e.telegraph=null;}
          if(e.type==='robot'){shoot(e);e.state='walk';e.timer=2.8+Math.random();}
          else if(e.type==='brute'){
            pulse(e.x,e.z,3,0xfc7765,.42);fragments.add(e.x,.1,e.z,12,[0xc4bb97,0x75897d],5,.12);if(dist<2.95&&player.y<.8)hurtPlayer(e.damage,dir.x,dir.z,false);e.state='walk';e.timer=2.2;
          }else{e.state='lunge';e.timer=.27;e.vy=3.4;}
        }
      }else if(e.state==='lunge'){
        moveCircle(e,e.attackDir.x*11*dt,e.attackDir.z*11*dt,world.objects,e.radius);
        if(dist<1.1)hurtPlayer(e.damage,e.attackDir.x,e.attackDir.z);
        if(e.timer<=0){e.state='walk';e.timer=2.0;}
      }
    }
    if(dist<e.radius+player.radius+.1&&e.stagger<=0&&e.state!=='windup')hurtPlayer(e.damage,dir.x,dir.z);
    e.mesh.position.set(e.x,e.y,e.z);const u=e.mesh.userData;
    if(u.leftLeg)u.leftLeg.rotation.x=Math.sin(e.walk)*.5;
    if(u.rightLeg)u.rightLeg.rotation.x=-Math.sin(e.walk)*.5;
    if(u.body){u.body.rotation.x=e.state==='windup'?-.22:e.stagger>0?-.32:Math.sin(e.walk*2)*.03;u.body.rotation.z=e.stagger>0?Math.sin(e.stagger*45)*.13:0;}
    if(u.leftArm)u.leftArm.rotation.x=e.state==='windup'?-1.3:.1+Math.sin(e.walk)*.23;
    if(u.rightArm)u.rightArm.rotation.x=e.state==='windup'?-1.3:.1-Math.sin(e.walk)*.23;
  }
  for(let i=bolts.length-1;i>=0;i--){
    const b=bolts[i],from={x:b.x,y:1,z:b.z},to={x:b.x+b.vx*dt,y:1,z:b.z+b.vz*dt};b.life-=dt;
    const targets=b.reflected?[...world.objects,...enemies,...(boss&&!boss.dead?[boss]:[])]:world.objects;
    const hit=firstHammerHit(from,to,targets,.13);
    const playerT=player.y<1.6?segmentCircleHit(from.x,from.z,to.x,to.z,player.x,player.z,.65):null;
    const guardT=b.reflected?null:guardContact(from,to);
    if(guardT!==null&&(!hit||guardT<hit.t)&&(!playerT||guardT<=playerT)){
      b.x=lerp(from.x,to.x,guardT)+aim.x*.12;b.z=lerp(from.z,to.z,guardT)+aim.z*.12;b.vx=aim.x*14;b.vz=aim.z*14;b.damage=Math.round(stats.power*.8);b.reflected=true;b.life=1.5;b.mesh.material.color.setHex(0x8ce4d8);
      fragments.add(b.x,1,b.z,8,[0x8ce4d8,0xffe1a5],4,.06);audio.play('hit',.15);
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
  let pos=spawnPosition(13);
  // A wide, announced arrival gives the player space to react.
  const mesh=makeBoss();scene.add(mesh);const hp=1650*(1+(round-1)*.5);
  boss={mesh,x:pos.x,z:pos.z,y:-5,vx:0,vz:0,radius:1.65,height:5.7,hp,maxHp:hp,materials:prepareMaterials(mesh),flash:0,stagger:0,state:'enter',timer:2.6,attack:0,telegraph:null,enraged:false,dead:false,walk:0};
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
  if(!boss||boss.dead)return;const b=boss;b.timer-=dt;b.stagger=Math.max(0,b.stagger-dt);b.flash=Math.max(0,b.flash-dt);flashMaterials(b,b.flash/.15);
  moveCircle(b,b.vx*dt,b.vz*dt,world.objects,b.radius);b.vx*=Math.exp(-7*dt);b.vz*=Math.exp(-7*dt);
  const dir=normalize(player.x-b.x,player.z-b.z),dist=Math.hypot(player.x-b.x,player.z-b.z);
  if(!b.enraged&&b.hp<b.maxHp*.45){b.enraged=true;announce('ΥΠΕΡΦΟΡΤΩΣΗ','Ο Κολοσσός εξαγριώθηκε. Πρόσεχε τις κόκκινες ζώνες!',3);audio.play('boss');}
  if(b.state==='enter'){
    b.y=lerp(-5,0,clamp(1-b.timer/2.6,0,1));if(b.timer<=0){b.y=0;b.state='walk';b.timer=1.6;if(b.telegraph){removeEffect(b.telegraph);b.telegraph=null;}shake=.5;fragments.add(b.x,.2,b.z,30,[0x657779,0xffac69],9,.3,true);}
  }else if(b.state==='walk'){
    if(b.stagger<=0){const speed=b.enraged?2.5:1.85;moveCircle(b,dir.x*speed*dt,dir.z*speed*dt,world.objects,b.radius);b.walk+=dt*speed*2.8;}
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
        pulse(b.x,b.z,5,0xff735c,.6);for(let i=0;i<7;i++){const a=i/7*Math.PI*2;spawnEnemy(i%3===0?'robot':'zombie',{x:clamp(b.x+Math.sin(a)*4,-38,38),z:clamp(b.z+Math.cos(a)*4,-38,38)});}b.state='recover';b.timer=1.3;
      }else{b.state='charge';b.timer=.8;audio.play('boss');}
    }
  }else if(b.state==='charge'){
    for(const o of world.objects)if(!o.dead&&circleOverlaps(b.x+b.target.x*.8,b.z+b.target.z*.8,b.radius+.5,o))hurtObject(o,999,1);
    moveCircle(b,b.target.x*17*dt,b.target.z*17*dt,world.objects,b.radius);
    if(dist<2.3)hurtPlayer(34,b.target.x,b.target.z);
    if(Math.random()<.35)fragments.add(b.x,.1,b.z,2,[0xffb66c,0x657578],4,.2);
    shake=Math.max(shake,.05);if(b.timer<=0){b.state='recover';b.timer=1.6;}
  }else if(b.state==='recover'&&b.timer<=0){b.state='walk';b.timer=b.enraged?1.8:2.5;}
  b.mesh.position.set(b.x,b.y,b.z);const u=b.mesh.userData;
  if(u.leftLeg)u.leftLeg.rotation.x=b.state==='walk'?Math.sin(b.walk)*.25:0;
  if(u.rightLeg)u.rightLeg.rotation.x=b.state==='walk'?-Math.sin(b.walk)*.25:0;
  if(u.leftArm)u.leftArm.rotation.x=b.state==='slamWindup'?-2.4:b.state==='recover'?.65:Math.sin(b.walk)*.15;
  if(u.rightArm)u.rightArm.rotation.x=b.state==='slamWindup'?-2.4:b.state==='recover'?.65:-Math.sin(b.walk)*.15;
  if(u.body)u.body.rotation.x=b.state==='charge'?.25:b.stagger>0?-.1:0;
}
function defeatBoss(){
  if(!boss||boss.dead)return;boss.dead=true;if(boss.telegraph){removeEffect(boss.telegraph);boss.telegraph=null;}
  const x=boss.x,z=boss.z;fragments.add(x,3,z,100,[0xffc675,0xb8c7c6,0x566e7a,0xff874a],13,.45,true);pulse(x,z,10,0xffd7a0,1.2);
  disposeInstance(boss);score+=2500;shake=.7;audio.play('victory');endGame(true);
}
function endGame(won){
  setPhase(won?'victory':'dead');best=Math.max(best,score);save('ironfall.best',best);
  $('endTitle').textContent=won?'Ο ΚΟΛΟΣΣΟΣ ΕΠΕΣΕ.':'ΤΟ ΣΦΥΡΙ ΣΙΩΠΗΣΕ.';
  $('endText').textContent=won?'Η ορδή δεν τελειώνει. Πάρε τις αναβαθμίσεις σου στον επόμενο, δυσκολότερο τομέα.':'Η πόλη παραμένει όρθια. Πάρε μια ανάσα και ξαναχτύπα.';
  $('endStats').innerHTML='<div><strong>'+kills+'</strong><span>ΕΧΘΡΟΙ</span></div><div><strong>'+Math.floor(destructionPercent(world.objects))+'%</strong><span>ΚΑΤΑΣΤΡΟΦΗ</span></div><div><strong>'+relics+'</strong><span>ΚΕΙΜΗΛΙΑ</span></div><div><strong>'+score.toLocaleString('el-GR')+'</strong><span>ΣΚΟΡ · ΡΕΚΟΡ '+best.toLocaleString('el-GR')+'</span></div>';
  $('continueButton').hidden=!won;$('retryButton').textContent=won?'ΝΕΑ ΔΙΑΔΡΟΜΗ':'ΞΑΝΑΠΑΙΞΕ';
  if(!won)audio.play('death');
}

function dodge(){
  if(phase!=='playing'||dashCooldown>0||dashTime>0||leap||Math.abs(stance-stanceTarget)>.005)return;
  dashDirection={...facing};dashTime=.23;dashCooldown=1.5;player.invincible=Math.max(player.invincible,.3);
  audio.play('dash');pulse(player.x,player.z,1.5,0x86d3c2,.25);
}
function guardDimensions(){const reach=Math.max(.35,1.05-(stats.size-1)*.42),radius=Math.hypot(.43+reach+.365*stats.size,.725*stats.size);return {reach,radius,height:radius+.08};}
const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
function updatePlayer(dt){
  player.invincible=Math.max(0,player.invincible-dt);player.hurtAgo+=dt;
  dashCooldown=Math.max(0,dashCooldown-dt);attackCooldown=Math.max(0,attackCooldown-dt);leapCooldown=Math.max(0,leapCooldown-dt);throwCooldown=Math.max(0,throwCooldown-dt);landingRecovery=Math.max(0,landingRecovery-dt);
  if(player.hurtAgo>8&&player.hp<player.maxHp)player.hp=Math.min(player.maxHp,player.hp+1.25*dt);
  if(stance!==stanceTarget){const step=dt/1.05;stance=Math.abs(stance-stanceTarget)<=step?stanceTarget:stance+Math.sign(stanceTarget-stance)*step;}
  const horizontal=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0)+touch.x;
  const vertical=(keys.has('KeyS')||keys.has('ArrowDown')?1:0)-(keys.has('KeyW')||keys.has('ArrowUp')?1:0)+touch.y;
  const move=screenMovement(horizontal,vertical),moving=Math.hypot(move.x,move.z)>.01;
  updateAim();guarding=guardHeld&&!swing&&!weaponBusy()&&!chargeStarted;
  if(guarding){facing={...aim};guardAngle+=dt*19;}
  else if(moving&&!swing&&!leap&&!throwWindup)facing=move;
  if(leap){
    const l=leap;l.time+=dt;const oldY=player.y;
    if(l.slam&&l.time>=.45&&!l.diving){l.diving=true;l.vy=-22;audio.play('swing',1);}
    l.vy-=(l.diving?38:30)*dt;player.y+=l.vy*dt;
    const obstacles=world.objects.filter(o=>!o.dead&&o.h>oldY+.12);
    moveCircle(player,l.dir.x*(l.diving?9:8.2)*dt,l.dir.z*(l.diving?9:8.2)*dt,obstacles,player.radius);
    const floor=supportHeight(player.x,player.z,oldY);
    if(l.vy<0&&player.y<=floor){player.y=floor;landLeap();}
  }else{
    let dx,dz;
    if(dashTime>0){dashTime=Math.max(0,dashTime-dt);dx=dashDirection.x*19*dt;dz=dashDirection.z*19*dt;if(Math.random()<.7)fragments.add(player.x,.15,player.z,1,[0x7ac9bd,0xa6ddcd],1,.06);}
    else{const speed=stats.speed*(guarding?.55:chargeStarted?.82:swing?.92:Math.abs(stance-stanceTarget)>.005?.55:landingRecovery>0?.25:1);dx=move.x*speed*dt;dz=move.z*speed*dt;}
    dx+=player.vx*dt;dz+=player.vz*dt;player.vx*=Math.exp(-9*dt);player.vz*=Math.exp(-9*dt);
    const actual=moveCircle(player,dx,dz,world.objects.filter(o=>o.h>player.y+.1),player.radius);player.walk+=Math.hypot(actual.x,actual.z)*6;
    const floor=supportHeight(player.x,player.z,player.y);
    if(player.y>floor){player.vy=(player.vy||0)-20*dt;player.y=Math.max(floor,player.y+player.vy*dt);}else{player.y=floor;player.vy=0;}
  }
  if(attackBuffer){
    if(attackBuffer.held)attackBuffer.q=clamp(attackBuffer.q+dt/CHARGE_SECONDS,0,1);
    else{attackBuffer.life-=dt;if(attackBuffer.life<=0)attackBuffer=null;}
  }
  if(!chargeStarted&&!swing&&attackCooldown<=0&&!weaponBusy()&&!guarding){
    if(attackBuffer){const queued=attackBuffer;attackBuffer=null;chargeStarted=true;charge=queued.q;chargeFullPlayed=false;if(!queued.held)beginSwing();}
    else if(chargeHeld){chargeStarted=true;charge=0;chargeFullPlayed=false;}
  }
  if(chargeStarted){charge=clamp(charge+dt/CHARGE_SECONDS,0,1);if(charge>=1&&!chargeFullPlayed){chargeFullPlayed=true;audio.play('charge',1);pulse(player.x,player.z,2.3,color.gold,.3);}}
  if(swing)swing.time+=dt;
  if(throwWindup){throwWindup.time+=dt;if(throwWindup.time>=.28)releaseHammer();}
  poseHero(dt,moving);
  hero.updateMatrixWorld(true);hero.userData.hammerHead.getWorldPosition(headNow);
  if(swing){const progress=swing.time/swing.duration;
    if(progress>=.10&&progress<=.72&&!swing.blocked){weaponTrail(headPrevious,headNow,.29*stats.size,swing.charged?0xffefae:0xffbe67);impact(headPrevious,headNow);}
    if(swing&&(swing.time>=swing.duration||(swing.blocked&&swing.time-swing.blockTime>=.085)))swing=null;
  }else if(guarding){
    weaponTrail(headPrevious,headNow,.16,0x8ce4d8);
    for(const e of [...enemies])if((guardHits.get(e)||0)<elapsed&&facingCoverage(aim,e,player,Math.PI*.42)&&firstHammerHit(headPrevious,headNow,[e],.45*stats.size)){guardHits.set(e,elapsed+.38);hitEnemy(e,Math.round(stats.power*.3),normalize(e.x-player.x,e.z-player.z),6,1.5);}
  }
  headPrevious.copy(headNow);
  updateThrownHammer(dt);
  for(const hazard of world.hazards)if(player.y<.4&&Math.hypot(player.x-hazard.x,player.z-hazard.z)<hazard.r)hurtPlayer((hazard.damage||10)*.65,0,0,false);
  updateAim();
}
function poseHero(dt,moving=false){
  const u=hero.userData,walk=moving&&!leap&&!swing?Math.sin(player.walk):0;
  const targetAngle=Math.atan2(swing?swing.fx:facing.x,swing?swing.fz:facing.z);
  const diff=Math.atan2(Math.sin(targetAngle-hero.rotation.y),Math.cos(targetAngle-hero.rotation.y));hero.rotation.y+=diff*Math.min(1,dt*22);
  hero.position.set(player.x,player.y+(dashTime>0?.15:Math.abs(walk)*.07),player.z);
  const p=swing?clamp(swing.time/swing.duration,0,1):0;
  const torque=swing?Math.sin((p-.10)*Math.PI*1.3)*.52:guarding?-.08:0;
  if(u.leftLeg){u.leftLeg.rotation.x=leap?-.55:swing?-.16+Math.sin(p*Math.PI)*.2:walk*.58;u.leftLeg.rotation.z=swing?-.12:0;}
  if(u.rightLeg){u.rightLeg.rotation.x=leap?.45:swing?.22-Math.sin(p*Math.PI)*.16:-walk*.58;u.rightLeg.rotation.z=swing?.12:0;}
  if(u.body){u.body.rotation.x=leap?(leap.diving?.5:-.18):dashTime>0?.25:chargeStarted?-.14:swing?Math.sin(p*Math.PI)*.14:landingRecovery>0?.32:0;u.body.rotation.y=torque;u.body.position.y=landingRecovery>0?-.12:Math.sin(visualTime*2)*.015;}
  if(u.cape){u.cape.rotation.x=.15+Math.sin(visualTime*6)*.07+(leap?.85:moving?.25:0);u.cape.rotation.z=Math.sin(visualTime*3)*.045;}
  u.setStance?.(stance);
  const rest=u.weaponRest||{x:.55,y:0,z:-.72},rp=u.weaponRestPosition||{x:0,y:1.04,z:.38};
  const rig=u.weaponRig,restQuaternion=new THREE.Quaternion().setFromEuler(new THREE.Euler(rest.x,rest.y,rest.z));
  rig.position.set(rp.x,rp.y,rp.z);rig.quaternion.copy(restQuaternion);
  u.setReach?.(Math.max(.65,stats.range+(swing?swing.q*1.4:charge*1.4)-.55-.52*stats.size-.43));
  if(chargeStarted){rig.rotation.set(lerp(rest.x,-.85,smooth(charge)),lerp(0,-.45,smooth(charge)),lerp(rest.z,-.5,smooth(charge)));rig.position.y+=charge*.18;}
  if(swing){
    const setShaft=(angle,y)=>{poseDirection.set(Math.sin(angle),y,Math.cos(angle)).normalize();return new THREE.Quaternion().setFromUnitVectors(shaftUp,poseDirection);};
    rig.position.lerpVectors(swing.fromPosition,new THREE.Vector3(stance>.9?0:.18,1.22,.55),smooth(p/.10));
    if(swing.blocked){const recover=smooth((swing.time-swing.blockTime)/.085);rig.quaternion.copy(swing.blockRotation).slerp(restQuaternion,recover);rig.position.lerpVectors(swing.blockPosition,new THREE.Vector3(rp.x,rp.y,rp.z),recover);}
    else if(p<.10)rig.quaternion.copy(swing.fromRotation).slerp(setShaft(1.72,.18),smooth(p/.10));
    else if(p<=.72){const t=smooth((p-.10)/.62);rig.quaternion.copy(setShaft(lerp(1.72,-1.72,t),lerp(.18,-.15,t)));}
    else{rig.quaternion.copy(setShaft(-1.72,-.15)).slerp(restQuaternion,smooth((p-.72)/.28));rig.position.lerp(new THREE.Vector3(rp.x,rp.y,rp.z),smooth((p-.72)/.28));}
  }else if(guarding){const g=guardDimensions();u.setReach?.(g.reach);rig.position.set(0,g.height,.95);rig.rotation.set(0,0,guardAngle);}
  else if(leap){rig.position.set(stance>.9?0:.22,leap.diving?1.1:1.65,.55);rig.rotation.set(leap.diving?2.12:-.55,0,leap.diving?0:-.25);}
  else if(throwWindup){const t=throwWindup.time/.28;rig.position.set(lerp(.4,0,smooth(t)),lerp(1.4,1.2,smooth(t)),.55);const target=new THREE.Quaternion().setFromEuler(new THREE.Euler(t<.35?-1.15:lerp(-1.15,Math.PI/2,smooth((t-.35)/.65)),0,0));rig.quaternion.copy(throwWindup.fromRotation).slerp(target,smooth(t/.35));}
  else if(landingRecovery>0){rig.rotation.set(2.0,0,-.05);rig.position.set(0,.9,.7);}
  u.updateGrip?.();
  flashMaterials(player,player.invincible>0&&player.hurtAgo<1?(Math.sin(visualTime*30)*.5+.5)*.55:0,0xff8b71);
  chargeRing.visible=chargeStarted;chargeRing.position.set(player.x,player.y+.07,player.z);chargeRing.scale.setScalar(1.1+charge*.6);chargeRing.material.opacity=.25+charge*.55;chargeRing.material.color.setHex(charge>.95?0xffeac4:0xffae57);
  directionMarker.position.set(player.x+facing.x*1.15,player.y+.055,player.z+facing.z*1.15);directionMarker.rotation.y=Math.atan2(facing.x,facing.z);directionMarker.visible=phase==='playing';
  if(guardRing){const g=guardDimensions();guardRing.visible=guarding;guardRing.position.set(player.x+aim.x*.95,player.y+g.height,player.z+aim.z*.95);guardRing.scale.setScalar(g.radius/1.72);guardRing.rotation.set(0,Math.atan2(aim.x,aim.z),0);guardRing.material.opacity=.12+Math.sin(guardAngle*2)*.035;}
  if(groundShadow){groundShadow.position.set(player.x,.035,player.z);groundShadow.scale.setScalar(1+player.y*.035);groundShadow.material.opacity=clamp(.34-player.y*.018,.15,.34);groundShadow.visible=phase!=='menu';}
  if(landingMarker){landingMarker.visible=!!leap;landingMarker.position.set(player.x,.09,player.z);landingMarker.scale.setScalar(leap?.slam?5.2+stats.quake*.7:2.35);landingMarker.material.color.setHex(leap?.slam?0xffbf6d:0x9edac9);}
}
function updateDrops(dt){
  for(let i=drops.length-1;i>=0;i--){
    const d=drops[i];d.age+=dt;d.life-=dt;const distance=Math.hypot(player.x-d.x,player.z-d.z);
    const magnet=d.kind==='relic'?1.7:3.8;
    if(distance<magnet&&d.age>.4){const dir=normalize(player.x-d.x,player.z-d.z);const speed=d.kind==='relic'?4.5:9;d.x+=dir.x*speed*dt;d.z+=dir.z*speed*dt;}
    d.mesh.position.set(d.x,.45+Math.sin(visualTime*3+d.phase)*.13,d.z);d.mesh.rotation.y+=dt*(d.kind==='relic'?.9:2.5);
    if(distance<.8&&d.age>.45){
      scene.remove(d.mesh);disposeModelGeometry(d.mesh);drops.splice(i,1);
      if(d.kind==='relic'){openUpgrade();break;}
      if(d.kind==='heart'){const heal=Math.min(28,player.maxHp-player.hp);player.hp+=heal;floatText(player.x,2.2,player.z,'+'+Math.round(heal),'#a3e3af',20);audio.play('pickup',.2);}
      else{score+=30;gainXP(2);audio.play('pickup',.15);fragments.add(player.x,.8,player.z,5,[0xffc87c,0xffebc4],3,.05);}
    }else if(d.life<=0){scene.remove(d.mesh);disposeModelGeometry(d.mesh);drops.splice(i,1);}
  }
}
function updateObjects(dt){
  const camDir={x:.585491,z:.810679};
  for(const o of world.objects){
    if(o.dead)continue;
    o.hurtTimer=Math.max(0,(o.hurtTimer||0)-dt);o.flash=Math.max(0,o.flash-dt);o.shudder=Math.max(0,o.shudder-dt);flashMaterials(o,o.flash/.15);
    const jitter=o.shudder>0?Math.sin(o.shudder*100)*o.shudder*.3:0;
    o.mesh.position.set(o.x+jitter,o.baseY,o.z+jitter*.7);
    const damage=1-o.hp/o.maxHp;
    o.mesh.rotation.z=o.baseRotation.z+(damage>.65?Math.sin(o.seed||1)*.035:0)+jitter*.08;
    if(o.h>3){
      const dx=o.x-player.x,dz=o.z-player.z,along=dx*camDir.x+dz*camDir.z,lateral=Math.abs(dx*camDir.z-dz*camDir.x);
      const obstructs=along>0&&along<o.h*.95+o.d*.65&&lateral<o.w*.62+.4;
      for(const m of o.materials){const target=obstructs?.22:1;m.transparent=m.opacity<.99||obstructs;m.opacity=lerp(m.opacity,target,Math.min(1,dt*9));m.depthWrite=!obstructs;}
    }
  }
}
function updateEffects(dt){
  fragments.update(dt);hpEchoes=hpEchoes.filter(e=>{e.life-=dt;return e.life>0;});
  for(let i=rings.length-1;i>=0;i--){const r=rings[i];r.life-=dt;const t=1-r.life/r.max;r.mesh.scale.setScalar(.3+t*r.radius);r.mesh.material.opacity=Math.max(0,(1-t)*.7);if(r.life<=0){removeEffect(r.mesh);rings.splice(i,1);}}
  for(let i=arcs.length-1;i>=0;i--){const a=arcs[i];a.life-=dt;a.mesh.material.opacity=Math.max(0,a.life/a.max*.75);if(a.life<=0){removeEffect(a.mesh);arcs.splice(i,1);}}
  for(let i=numbers.length-1;i>=0;i--){numbers[i].life-=dt;numbers[i].y+=dt*.75;if(numbers[i].life<=0)numbers.splice(i,1);}
  if(announcementTimer>0){announcementTimer-=dt;if(announcementTimer<=0)$('announcement').hidden=true;}
}
let currentDistrict='';
function updateGame(dt){
  elapsed+=dt;roundTime+=dt;comboTimer-=dt;if(comboTimer<=0)combo=0;
  updatePlayer(dt);if(phase!=='playing')return;
  updateEnemies(dt);if(phase!=='playing')return;
  updateBoss(dt);if(phase!=='playing')return;
  updateDrops(dt);updateObjects(dt);checkGoal();
  spawnTimer-=dt;
  if(spawnTimer<=0){const count=bossSpawned?1:roundTime>90?3:roundTime>35?2:1;for(let i=0;i<count;i++)spawnEnemy();spawnTimer=Math.max(.6,1.75-roundTime*.006-(round-1)*.12)*(bossSpawned?1.5:1);}
  const district=world.regionAt?.(player.x,player.z);
  if(district&&currentDistrict!==district.id){currentDistrict=district.id;$('districtName').textContent=district.name;if(roundTime>6)toast(district.name,district.weather==='snow'?'Ο άνεμος φέρνει χιόνι.':district.weather==='ash'?'Πρόσεχε τη λάβα και τις φωτιές.':'Η βροχή δεν σταματά την ορδή.','#82c7bb');}
}
function updateHUD(force=false){
  if(!world)return;
  $('healthFill').style.width=(player.hp/player.maxHp*100)+'%';$('healthValue').textContent=Math.ceil(player.hp)+' / '+player.maxHp;
  $('healthFill').style.background=player.hp<player.maxHp*.3?'#ef7766':'';
  const percent=destructionPercent(world.objects);$('goalValue').textContent=Math.floor(percent)+'%';$('goalFill').style.width=Math.min(100,percent/GOAL*100)+'%';
  $('objectiveText').textContent=bossSpawned?'Ο στόχος πέτυχε. Νίκησε τον Κολοσσό!':'Φτάσε στο 60% για να καλέσεις τον Κολοσσό.';
  $('killsValue').textContent=kills;$('relicValue').textContent=relics;$('roundValue').textContent=String(round).padStart(2,'0');
  $('timeValue').textContent=String(Math.floor(elapsed/60)).padStart(2,'0')+':'+String(Math.floor(elapsed%60)).padStart(2,'0');
  const shownCharge=chargeStarted?charge:attackBuffer?.held?attackBuffer.q:0;
  $('chargeFill').style.width=(shownCharge*100)+'%';$('chargeWrap').classList.toggle('charged',shownCharge>=.95);
  $('chargeText').textContent=shownCharge>=.95?'ΑΦΗΣΕ ΓΙΑ ΣΥΝΘΛΙΨΗ':chargeStarted||attackBuffer?.held?'ΦΟΡΤΙΣΗ '+Math.floor(shownCharge*100)+'%':'ΚΡΑΤΑ ΓΙΑ ΙΣΧΥ';
  document.querySelector('[data-key="ShiftLeft"]')?.classList.toggle('cooldown',dashCooldown>0);
  if(boss){$('bossFill').style.width=Math.max(0,boss.hp/boss.maxHp*100)+'%';$('bossValue').textContent=(boss.enraged?'ΙΙ · ':'')+Math.max(0,Math.ceil(boss.hp))+' / '+Math.ceil(boss.maxHp)+' HP';}
  if($('stanceValue'))$('stanceValue').textContent=Math.abs(stance-stanceTarget)>.005?'ΑΛΛΑΓΗ ΛΑΒΗΣ…':stance>.95?'ΔΥΟ ΧΕΡΙΑ · +25% ΙΣΧΥΣ':'ΣΦΥΡΙ + ΑΣΠΙΔΑ';
  if($('guardValue'))$('guardValue').textContent=guarding?'ΠΡΟΣΤΑΣΙΑ ΜΠΡΟΣΤΑ':throwFlight?'ΧΩΡΙΣ ΣΦΥΡΙ':'ΚΡΑΤΑ Q';
  if($('leapValue'))$('leapValue').textContent=leap?(leap.slam?'ΣΥΝΤΡΙΒΗ!':'SPACE: ΣΥΝΤΡΙΒΗ'):leapCooldown>0?leapCooldown.toFixed(1)+'s':'ΕΤΟΙΜΟ';
  if($('slamValue'))$('slamValue').textContent=leap?(leap.slam?'ΟΠΛΙΣΜΕΝΗ!':'ΠΑΤΑ ΓΙΑ ΣΥΝΤΡΙΒΗ'):leapCooldown>0?leapCooldown.toFixed(1)+'s':'ΖΗΜΙΑ ΠΕΡΙΟΧΗΣ';
  if($('throwValue'))$('throwValue').textContent=throwFlight?(throwFlight.returning?'ΕΠΙΣΤΡΟΦΗ':'ΣΤΟΝ ΑΕΡΑ'):throwCooldown>0?throwCooldown.toFixed(1)+'s':'ΣΤΟΧΕΥΣΕ';
  if($('dashValue'))$('dashValue').textContent=dashTime>0?'ΑΠΟΦΥΓΗ!':dashCooldown>0?dashCooldown.toFixed(1)+'s':'ΕΤΟΙΜΟ';
  $('attackButton')?.classList.toggle('active',!!swing);
  $('chargeButton')?.classList.toggle('active',chargeHeld||chargeStarted);
  $('guardButton')?.classList.toggle('active',guardHeld||guarding);
  $('leapButton')?.classList.toggle('cooldown',!leap&&leapCooldown>0);
  $('slamButton')?.classList.toggle('cooldown',!leap&&leapCooldown>0);
  $('slamButton')?.classList.toggle('active',!!leap?.slam);
  $('throwButton')?.classList.toggle('cooldown',!!(throwFlight||throwWindup)||throwCooldown>0);
  if(force)drawMinimap();
}
function drawMinimap(){
  const c=mapContext,w=140,h=140;c.clearRect(0,0,w,h);c.fillStyle='#101e21';c.fillRect(0,0,w,h);
  c.save();c.translate(70,70);c.rotate(.625);c.scale(1.03,1.03);
  c.fillStyle='#253c3b';c.fillRect(-42,-42,84,84);c.fillStyle='#162b30';c.fillRect(-4,-42,8,84);c.fillRect(-42,-4,84,8);c.strokeStyle='#466061';c.lineWidth=1;c.strokeRect(-42,-42,84,84);
  for(const o of world.objects){c.fillStyle=o.dead?'#30433e':o.type==='house'||o.type==='shop'?'#9d9480':o.type==='car'?'#698e9a':'#65847c';c.fillRect(o.x-o.w/2,o.z-o.d/2,Math.max(o.w,1),Math.max(o.d,1));}
  for(const h of world.hazards){c.fillStyle='#c66b42';c.beginPath();c.arc(h.x,h.z,h.r,0,Math.PI*2);c.fill();}
  for(const d of drops)if(d.kind==='relic'){c.fillStyle='#ffd180';c.fillRect(d.x-1.2,d.z-1.2,2.4,2.4);}
  for(const e of enemies){c.fillStyle=e.type==='robot'?'#ffab89':'#e37e73';c.beginPath();c.arc(e.x,e.z,1.15,0,Math.PI*2);c.fill();}
  if(boss&&!boss.dead){c.fillStyle='#ff6558';c.beginPath();c.arc(boss.x,boss.z,3.1,0,Math.PI*2);c.fill();c.strokeStyle='#ffd080';c.stroke();}
  c.translate(player.x,player.z);c.rotate(-Math.atan2(facing.x,facing.z));c.fillStyle='#fff1b7';c.beginPath();c.moveTo(0,3.5);c.lineTo(-2.1,-2);c.lineTo(2.1,-2);c.closePath();c.fill();c.restore();
}
function screenPoint(x,y,z){tempV.set(x,y,z).project(camera);return {x:(tempV.x*.5+.5)*screenW,y:(-.5*tempV.y+.5)*screenH,inside:tempV.z<1&&tempV.z>-1};}
function drawHP(x,y,z,hp,maxHp,tint,alpha=1,label=''){
  const p=screenPoint(x,y,z);if(!p.inside||p.x<-80||p.x>screenW+80||p.y<-35||p.y>screenH+35)return;
  const c=fxContext,width=76;c.globalAlpha=clamp(alpha,0,1);c.textAlign='center';c.font='bold 11px "Courier New",monospace';
  c.fillStyle='rgba(11,24,28,.92)';c.fillRect(p.x-width/2-5,p.y-19,width+10,27);
  c.fillStyle='#fff2d4';c.fillText(Math.max(0,Math.ceil(hp))+' / '+Math.ceil(maxHp)+' HP',p.x,p.y-6);
  c.fillStyle='#34464a';c.fillRect(p.x-width/2,p.y,width,4);c.fillStyle=tint;c.fillRect(p.x-width/2,p.y,width*clamp(hp/maxHp,0,1),4);
  if(label){c.font='bold 9px monospace';c.fillStyle=tint;c.fillText(label,p.x,p.y-23);}
}
function drawAim(){
  if(!pointer.active||phase!=='playing'||!aimPreview||leap)return;
  const c=fxContext,preview=aimPreview,a=screenPoint(preview.start.x,preview.start.y,preview.start.z),b=screenPoint(preview.end.x,preview.end.y,preview.end.z);
  const blocked=preview.contact?.target.w!==undefined,tint=throwFlight?'#8ce4d8':blocked?'#ff9d72':'#ffcf88';
  c.globalAlpha=guarding?.26:.58;c.strokeStyle=tint;c.lineWidth=1.5;c.setLineDash([5,7]);c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.stroke();c.setLineDash([]);
  c.globalAlpha=.9;c.lineWidth=1.5;
  const x=pointer.x,y=pointer.y;c.beginPath();c.arc(x,y,9,0,Math.PI*2);c.moveTo(x-15,y);c.lineTo(x-5,y);c.moveTo(x+5,y);c.lineTo(x+15,y);c.moveTo(x,y-15);c.lineTo(x,y-5);c.moveTo(x,y+5);c.lineTo(x,y+15);c.stroke();
  if(preview.contact){c.beginPath();c.arc(b.x,b.y,5,0,Math.PI*2);c.stroke();if(blocked){c.beginPath();c.moveTo(b.x-5,b.y-5);c.lineTo(b.x+5,b.y+5);c.moveTo(b.x+5,b.y-5);c.lineTo(b.x-5,b.y+5);c.stroke();}}
  c.globalAlpha=1;
}
function drawFX(){
  const c=fxContext;c.clearRect(0,0,screenW,screenH);
  if(redFlash>0){const grad=c.createRadialGradient(screenW/2,screenH/2,screenH*.22,screenW/2,screenH/2,screenW*.66);grad.addColorStop(0,'rgba(201,62,42,0)');grad.addColorStop(1,'rgba(201,62,42,'+(redFlash*.5)+')');c.fillStyle=grad;c.fillRect(0,0,screenW,screenH);}
  if(phase==='menu')return;
  drawAim();
  for(const e of enemies)if(e.hurtTimer>0||aimPreview?.contact?.target===e)drawHP(e.x,e.y+e.height+.4,e.z,e.hp,e.maxHp,e.type==='robot'?'#ffc18a':'#a6d6ae',Math.min(1,e.hurtTimer||1));
  const objectNames={house:'ΣΠΙΤΙ',shop:'ΚΤΙΡΙΟ',car:'ΑΥΤΟΚΙΝΗΤΟ',wall:'ΤΟΙΧΟΣ',tree:'ΔΕΝΤΡΟ',barrel:'ΒΑΡΕΛΙ',crate:'ΚΙΒΩΤΙΟ',lamp:'ΦΑΝΑΡΙ',bench:'ΠΑΓΚΑΚΙ'};
  for(const o of world.objects)if(!o.dead&&(o.hurtTimer>0||aimPreview?.contact?.target===o))drawHP(o.x,o.h+.4,o.z,o.hp,o.maxHp,'#ffd08b',Math.min(1,o.hurtTimer||1),objectNames[o.type]||'ΑΝΤΙΚΕΙΜΕΝΟ');
  for(const e of hpEchoes)drawHP(e.x,e.y,e.z,0,e.maxHp,'#ff9d72',Math.min(1,e.life*2));
  for(const n of numbers){const p=screenPoint(n.x,n.y,n.z);if(!p.inside)continue;c.globalAlpha=Math.min(1,n.life/.3);c.textAlign='center';c.font='900 '+n.size+'px "Courier New",monospace';c.lineWidth=3;c.strokeStyle='rgba(10,24,26,.8)';c.strokeText(n.text,p.x,p.y);c.fillStyle=n.color;c.fillText(n.text,p.x,p.y);}
  c.globalAlpha=1;
  if(chargeStarted){const p=screenPoint(player.x,player.y+3.1,player.z);const width=52;c.fillStyle='#162728';c.fillRect(p.x-width/2-2,p.y-2,width+4,8);c.fillStyle=charge>.95?'#ffebac':'#ffb85f';c.fillRect(p.x-width/2,p.y,width*charge,4);}
  if(boss&&!boss.dead&&phase==='playing'){
    const p=screenPoint(boss.x,3,boss.z);if(p.x<40||p.x>screenW-40||p.y<150||p.y>screenH-100){
      const x=clamp(p.x,40,screenW-180),y=clamp(p.y,165,screenH-135),a=Math.atan2(p.y-y,p.x-x);
      c.save();c.translate(x,y);c.rotate(a);c.fillStyle='#ff8b62';c.beginPath();c.moveTo(11,0);c.lineTo(-7,-7);c.lineTo(-7,7);c.closePath();c.fill();c.restore();c.fillStyle='#ffe5ba';c.font='bold 10px monospace';c.textAlign='center';c.fillText('BOSS',x,y+21);
    }
  }
}

function resize(){
  screenW=innerWidth;screenH=innerHeight;
  const quality=settings.quality;renderer.setPixelRatio(quality==='high'?Math.min(devicePixelRatio,1.5):quality==='medium'?1:.72);
  renderer.setSize(screenW,screenH,false);renderer.shadowMap.enabled=quality!=='low';
  const aspect=screenW/screenH,half=aspect<.8?16:12.8;
  camera.left=-half*aspect;camera.right=half*aspect;camera.top=half;camera.bottom=-half;camera.updateProjectionMatrix();
  fxDpr=Math.min(devicePixelRatio,2);fx.width=Math.round(screenW*fxDpr);fx.height=Math.round(screenH*fxDpr);fx.style.width=screenW+'px';fx.style.height=screenH+'px';fxContext.setTransform(fxDpr,0,0,fxDpr,0,0);
  $('touchControls').hidden=!(matchMedia('(pointer:coarse)').matches||screenW<750)||phase!=='playing';
}
function pauseGame(){if(phase==='playing'){setPhase('paused');audio.play('ui');}else if(phase==='paused'){setPhase('playing');audio.play('ui');}}
function pressAttack(){
  if(phase!=='playing')return;audio.unlock();
  if(leap){armAirSmash();return;}
  if(throwFlight||throwWindup||Math.abs(stance-stanceTarget)>.005||guardHeld||chargeHeld)return;
  chargeHeld=true;
  if(!swing&&attackCooldown<=0&&!weaponBusy()){
    attackBuffer=null;chargeStarted=true;charge=0;chargeFullPlayed=false;
  }else attackBuffer={held:true,q:0,life:ATTACK_BUFFER_SECONDS};
}
function releaseAttack(){
  chargeHeld=false;
  if(phase!=='playing'){chargeStarted=false;charge=0;attackBuffer=null;return;}
  if(chargeStarted){
    if(!swing&&attackCooldown<=0&&!weaponBusy()&&!guardHeld)beginSwing();
    else{attackBuffer={held:false,q:charge,life:Math.max(ATTACK_BUFFER_SECONDS,attackCooldown+.025)};chargeStarted=false;charge=0;}
  }else if(attackBuffer){attackBuffer.held=false;attackBuffer.life=Math.max(ATTACK_BUFFER_SECONDS,attackCooldown+.025);}
}
function quickAttack(){pressAttack();releaseAttack();}
function cancelAttack(){chargeHeld=false;chargeStarted=false;charge=0;attackBuffer=null;}
function pressGuard(){
  if(phase!=='playing')return;
  guardHeld=true;cancelAttack();
}
function initInput(){
  $('startButton').onclick=startGame;$('retryButton').onclick=startGame;$('restartButton').onclick=startGame;
  $('resumeButton').onclick=()=>setPhase('playing');$('pauseButton').onclick=pauseGame;
  $('continueButton').onclick=()=>{round++;resetWorld(true);setPhase('playing');audio.play('start');announce('ΤΟΜΕΑΣ '+String(round).padStart(2,'0'),'Η ορδή δυναμώνει. Οι αναβαθμίσεις σου παραμένουν.',3.2);};
  $('soundButton').onclick=()=>{audio.unlock();settings.muted=audio.toggle();$('soundButton').classList.toggle('muted',settings.muted);$('soundButton').setAttribute('aria-label',settings.muted?'Ήχος κλειστός — πάτησε για ενεργοποίηση':'Ήχος ενεργός — πάτησε για σίγαση');save('ironfall.settings',settings);};
  $('settingsButton').onclick=()=>{if(phase==='upgrade')return;previousPhase=phase;setPhase('settings');};
  $('closeSettingsButton').onclick=()=>{setPhase(previousPhase);save('ironfall.settings',settings);};
  $('qualitySelect').value=settings.quality;$('shakeToggle').checked=settings.shake;$('volumeRange').value=Math.round(settings.volume*100);
  $('qualitySelect').onchange=e=>{settings.quality=e.target.value;resize();save('ironfall.settings',settings);};
  $('shakeToggle').onchange=e=>{settings.shake=e.target.checked;save('ironfall.settings',settings);};
  $('volumeRange').oninput=e=>{settings.volume=Number(e.target.value)/100;audio.setVolume(settings.volume);save('ironfall.settings',settings);};
  if(settings.muted){audio.toggle();$('soundButton').classList.add('muted');$('soundButton').setAttribute('aria-label','Ήχος κλειστός — πάτησε για ενεργοποίηση');}
  window.addEventListener('keydown',e=>{
    const handled=['Space','KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftLeft','ShiftRight','Escape','KeyQ','KeyE','KeyR','KeyZ'];
    if(handled.includes(e.code)&&!['INPUT','SELECT'].includes(document.activeElement?.tagName))e.preventDefault();
    if(e.code==='Escape'&&!e.repeat){if(phase==='settings'){setPhase(previousPhase);}else pauseGame();return;}
    if(phase==='menu'&&e.code==='Enter'&&!$('startButton').disabled){startGame();return;}
    if(phase==='upgrade'&&['Digit1','Digit2','Digit3'].includes(e.code)){const b=$('upgradeChoices').children[Number(e.code.slice(-1))-1];b?.click();return;}
    if(phase!=='playing')return;
    keys.add(e.code);document.querySelector('[data-key="'+e.code+'"]')?.classList.add('active');
    if(e.code==='Space'&&!e.repeat)pressAttack();
    if(e.code==='KeyQ'&&!e.repeat)pressGuard();
    if(e.code==='KeyE'&&!e.repeat)startLeap();
    if(e.code==='KeyR'&&!e.repeat)startThrow();
    if(e.code==='KeyZ'&&!e.repeat)toggleStance();
    if((e.code==='ShiftLeft'||e.code==='ShiftRight')&&!e.repeat)dodge();
  });
  window.addEventListener('keyup',e=>{
    keys.delete(e.code);document.querySelector('[data-key="'+e.code+'"]')?.classList.remove('active');
    if(e.code==='KeyQ'){guardHeld=false;guarding=false;}
    if(e.code==='Space')releaseAttack();
  });
  window.addEventListener('blur',()=>{if(phase==='playing')setPhase('paused');clearInput();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&phase==='playing')setPhase('paused');});
  window.addEventListener('pointermove',e=>{if(phase==='playing'&&e.pointerType!=='touch'&&!e.target?.closest?.('#combatDock')){pointer.x=e.clientX;pointer.y=e.clientY;pointer.active=true;}});
  $('gameCanvas').addEventListener('pointerdown',e=>{$('gameCanvas').focus();audio.unlock();if(e.clientX!==undefined){pointer.x=e.clientX;pointer.y=e.clientY;pointer.active=true;}});
  $('gameCanvas').addEventListener('contextmenu',e=>e.preventDefault());
  let stickId=null;
  const stick=$('joystick'),knob=$('joystickKnob');
  function moveStick(e){const rect=stick.getBoundingClientRect(),r=rect.width*.34,dx=e.clientX-rect.left-rect.width/2,dy=e.clientY-rect.top-rect.height/2,d=Math.hypot(dx,dy),m=Math.min(d,r);touch.x=d>.1?dx/d*m/r:0;touch.y=d>.1?dy/d*m/r:0;knob.style.transform='translate('+(touch.x*r)+'px,'+(touch.y*r)+'px)';}
  stick.addEventListener('pointerdown',e=>{if(phase!=='playing')return;e.preventDefault();pointer.active=false;stickId=e.pointerId;stick.setPointerCapture(stickId);moveStick(e);audio.unlock();});
  stick.addEventListener('pointermove',e=>{if(e.pointerId===stickId)moveStick(e);});
  const releaseStick=e=>{if(e.pointerId===stickId){stickId=null;touch.x=0;touch.y=0;knob.style.transform='translate(0,0)';}};
  stick.addEventListener('pointerup',releaseStick);stick.addEventListener('pointercancel',releaseStick);
  function bindAction(id,press,release=()=>{},cancel=release){
    const button=$(id);if(!button)return;
    button.addEventListener('pointerdown',e=>{
      if(phase!=='playing')return;
      e.preventDefault();button.setPointerCapture(e.pointerId);button.classList.add('active');
      $('gameCanvas').focus({preventScroll:true});audio.unlock();press();
    });
    button.addEventListener('pointerup',()=>{button.classList.remove('active');release();});
    button.addEventListener('pointercancel',()=>{button.classList.remove('active');cancel();});
  }
  bindAction('attackButton',quickAttack);
  bindAction('chargeButton',pressAttack,releaseAttack,cancelAttack);
  bindAction('guardButton',pressGuard,()=>{guardHeld=false;guarding=false;});
  bindAction('leapButton',startLeap);
  bindAction('slamButton',()=>{if(leap||startLeap())armAirSmash();});
  bindAction('throwButton',startThrow);
  bindAction('stanceButton',toggleStance);
  bindAction('dashButton',dodge);
  for(const [id,code] of [['moveUpButton','KeyW'],['moveLeftButton','KeyA'],['moveDownButton','KeyS'],['moveRightButton','KeyD']]){
    bindAction(id,()=>{pointer.active=false;keys.add(code);},()=>keys.delete(code));
  }
  window.addEventListener('resize',resize);
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
  world.update(environmentDt,visualTime,player,weather);updateEffects(phase==='paused'||phase==='upgrade'||phase==='settings'?0:realDt);
  const desired=phase==='menu'?new THREE.Vector3(-5,.6,3.5):new THREE.Vector3(player.x+facing.x*.8,.6+player.y*.25,player.z+facing.z*.8);
  cameraTarget.lerp(desired,1-Math.exp(-realDt*5.6));camera.position.copy(cameraTarget).add(cameraOffset);
  if(settings.shake&&shake>0){camera.position.x+=(Math.random()-.5)*shake;camera.position.y+=(Math.random()-.5)*shake*.5;camera.position.z+=(Math.random()-.5)*shake;}
  camera.lookAt(cameraTarget);
  sun.position.set(player.x-15,28,player.z+8);sun.target.position.set(player.x,0,player.z);sun.target.updateMatrixWorld();
  // Subtle moving storm illumination, kept bright enough for readable combat.
  const lightning=weather==='rain'&&Math.sin(visualTime*.47)> .998?Math.sin(visualTime*70)**8*.35:0;
  sun.intensity=2.25+lightning;fillLight.intensity=1.45+(weather==='snow'?.2:0);
  audio.update(realDt,phase==='playing'?Math.min(1,enemies.length/40+(boss&&!boss.dead?.4:0)):0,weather);
  renderer.render(scene,camera);drawFX();
  hudTimer-=realDt;if(hudTimer<=0){updateHUD();hudTimer=.07;$('touchControls').hidden=!(matchMedia('(pointer:coarse)').matches||screenW<750)||phase!=='playing';}
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
  hero=makeWarrior();scene.add(hero);player.materials=prepareMaterials(hero);
  chargeRing=new THREE.Mesh(new THREE.RingGeometry(.93,1,48),new THREE.MeshBasicMaterial({color:color.gold,side:THREE.DoubleSide,transparent:true,opacity:.5,depthWrite:false}));chargeRing.rotation.x=-Math.PI/2;chargeRing.visible=false;scene.add(chargeRing);
  const arrowGeo=new THREE.BufferGeometry();arrowGeo.setAttribute('position',new THREE.Float32BufferAttribute([-.19,0,-.1,.19,0,-.1,0,0,.25],3));
  directionMarker=new THREE.Mesh(arrowGeo,new THREE.MeshBasicMaterial({color:0xf6cf8a,side:THREE.DoubleSide,transparent:true,opacity:.64,depthWrite:false}));scene.add(directionMarker);
  guardRing=new THREE.Mesh(new THREE.RingGeometry(1.68,1.72,64),new THREE.MeshBasicMaterial({color:0x9ee4db,side:THREE.DoubleSide,transparent:true,opacity:.15,depthWrite:false}));guardRing.visible=false;scene.add(guardRing);
  landingMarker=makeTelegraph(0,0,1,0xffc371);landingMarker.visible=false;
  groundShadow=new THREE.Mesh(new THREE.CircleGeometry(.65,24),new THREE.MeshBasicMaterial({color:0x081719,transparent:true,opacity:.32,depthWrite:false}));groundShadow.rotation.x=-Math.PI/2;scene.add(groundShadow);
  fragments=new Fragments();resetWorld();facing={x:.585491,z:.810679};hero.rotation.y=Math.atan2(facing.x,facing.z);cameraTarget.set(-5,.6,3.5);
  initInput();resize();setPhase('menu');
  $('gameCanvas').setAttribute('tabindex','-1');
  // Shader compilation is local; no network assets are loaded during play.
  if(renderer.compileAsync)await renderer.compileAsync(scene,camera);
  $('startButton').disabled=false;$('loadingStatus').textContent='Ο κόσμος είναι έτοιμος. Το σφυρί είναι δικό σου.';
  if($('bestScore'))$('bestScore').textContent=best.toLocaleString('el-GR');
  requestAnimationFrame(frame);
}
init().catch(error=>{
  console.error('IRONFALL initialization failed:',error);$('loadingStatus').textContent='Δεν ολοκληρώθηκε η εκκίνηση.';$('fatalError').hidden=false;
  $('fatalText').textContent='Το παιχνίδι χρειάζεται WebGL 2. Δοκίμασε πρόσφατο Chrome ή Edge με ενεργή επιτάχυνση γραφικών. Λεπτομέρεια: '+error.message;
});
