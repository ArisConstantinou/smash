import * as THREE from './vendor/three.module.js';
import {makeWarrior,makeEnemy,makeBoss,makeTreasure} from './models.js';
import {createWorld} from './world.js';
import {GameAudio} from './audio.js';
import {GOAL,BOUNDS,clamp,lerp,normalize,screenMovement,nearestPoint,circleOverlaps,moveCircle,inArc,hitObject,attackStats,destructionPercent,UPGRADE_DEFS,calculateStats} from './core.js';

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
let facing={x:-0.585491,z:-0.810679},dashDirection={x:0,z:-1},levels={power:0,size:0,range:0,speed:0,vitality:0,quake:0},stats=calculateStats(levels);
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
  if(next!=='playing'){clearInput();}
  else $('gameCanvas').focus({preventScroll:true});
}
function clearInput(){keys.clear();touch.x=0;touch.y=0;touch.attack=false;chargeHeld=false;chargeStarted=false;charge=0;document.querySelectorAll('[data-key]').forEach(e=>e.classList.remove('active'));$('attackButton')?.classList.remove('active');if($('joystickKnob'))$('joystickKnob').style.transform='translate(0,0)';}
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
function pulse(x,z,radius=3,tint=color.gold,duration=.45){
  const mesh=new THREE.Mesh(new THREE.RingGeometry(.94,1,48),new THREE.MeshBasicMaterial({color:tint,transparent:true,opacity:.8,side:THREE.DoubleSide,depthWrite:false}));
  mesh.rotation.x=-Math.PI/2;mesh.position.set(x,.08,z);scene.add(mesh);rings.push({mesh,life:duration,max:duration,radius});return mesh;
}
function makeTelegraph(x,z,radius,tint=0xff665b){
  const mesh=new THREE.Mesh(new THREE.RingGeometry(.88,1,48),new THREE.MeshBasicMaterial({color:tint,transparent:true,opacity:.5,side:THREE.DoubleSide,depthWrite:false}));
  mesh.rotation.x=-Math.PI/2;mesh.position.set(x,.09,z);mesh.scale.setScalar(radius);scene.add(mesh);return mesh;
}
function removeEffect(mesh){scene.remove(mesh);mesh.geometry.dispose();mesh.material.dispose();}
function createArc(fx,fz,range,q){
  const yaw=Math.atan2(fx,fz),positions=[],segs=36,angle=1.35+q*.35;
  for(let i=0;i<segs;i++){
    const a=yaw-angle+i/segs*angle*2,b=yaw-angle+(i+1)/segs*angle*2,ri=range*.52,ro=range;
    positions.push(Math.sin(a)*ri,.5,Math.cos(a)*ri,Math.sin(a)*ro,.5,Math.cos(a)*ro,Math.sin(b)*ro,.5,Math.cos(b)*ro,
      Math.sin(a)*ri,.5,Math.cos(a)*ri,Math.sin(b)*ro,.5,Math.cos(b)*ro,Math.sin(b)*ri,.5,Math.cos(b)*ri);
  }
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  const mesh=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({color:q>.92?0xffecb0:0xffb848,side:THREE.DoubleSide,transparent:true,opacity:.75,depthWrite:false,blending:THREE.AdditiveBlending}));
  mesh.position.set(player.x,0,player.z);scene.add(mesh);arcs.push({mesh,life:.22+q*.09,max:.22+q*.09});
}

function resetWorld(keepUpgrades=false){
  if(!keepUpgrades)round=1;
  for(const e of enemies){if(e.telegraph)removeEffect(e.telegraph);disposeInstance(e);}enemies=[];if(boss){if(boss.telegraph)removeEffect(boss.telegraph);disposeInstance(boss);}boss=null;
  for(const d of drops){scene.remove(d.mesh);disposeModelGeometry(d.mesh);}drops=[];
  for(const b of bolts){scene.remove(b.mesh);b.mesh.geometry.dispose();b.mesh.material.dispose();}bolts=[];
  for(const e of [...rings,...arcs])removeEffect(e.mesh);rings=[];arcs=[];
  for(const o of world?.objects||[]){disposeModelGeometry(o.mesh);for(const m of o.materials||[])m.dispose();}
  world?.dispose();
  world=createWorld(scene,{seed:1527+round*173,round});
  for(const o of world.objects){o.materials=prepareMaterials(o.mesh);o.flash=0;o.shudder=0;o.baseY=o.mesh.position.y;o.baseRotation=o.mesh.rotation.clone();}
  player.x=0;player.z=0;player.y=0;player.vx=0;player.vz=0;player.invincible=2;player.hurtAgo=100;
  if(!keepUpgrades){round=1;elapsed=0;kills=0;relics=0;level=1;xp=0;xpTarget=12;score=0;levels={power:0,size:0,range:0,speed:0,vitality:0,quake:0};}
  stats=calculateStats(levels);player.maxHp=stats.maxHp;player.hp=stats.maxHp;
  roundTime=0;currentDistrict='';bossSpawned=false;spawnTimer=2.8;spawnCounter=0;lootCounter=0;combo=0;comboTimer=0;charge=0;swing=null;attackCooldown=0;dashCooldown=0;dashTime=0;
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

function beginSwing(){
  if(phase!=='playing'||!chargeStarted||attackCooldown>0)return;
  const q=charge,details=attackStats(stats,q);
  swing={time:0,q,...details,fx:facing.x,fz:facing.z,hit:false};chargeStarted=false;charge=0;chargeFullPlayed=false;
  attackCooldown=details.duration+.055;audio.play('swing',q);
}
function hitEnemy(e,damage,dir,strength,lift){
  if(e.dead)return;
  e.hp-=damage;e.flash=.16;e.stagger=Math.max(e.stagger||0,.23+strength*.013);e.vx=dir.x*strength;e.vz=dir.z*strength;e.vy=lift;e.hurtTimer=2.4;
  if(e.state==='windup'){e.state='walk';e.timer=.6;if(e.telegraph){removeEffect(e.telegraph);e.telegraph=null;}}
  flashMaterials(e,1);
  floatText(e.x,e.y+e.height+.3,e.z,Math.round(damage).toString(),damage>100?'#ffd47d':'#fff4d8',damage>100?24:17);
  fragments.add(e.x,e.y+1,e.z,8,e.type==='zombie'||e.type==='brute'?[0x8fbea2,0xb6d5b4,0x83ceaa]:[0xffc271,0xf9e5b1,0x7eacb9],4,.07);
  if(e.hp<=0)killEnemy(e);
}
function killEnemy(e){
  e.dead=true;enemies=enemies.filter(n=>n!==e);kills++;combo++;comboTimer=3.8;score+=e.type==='brute'?70:25;
  fragments.add(e.x,1,e.z,e.type==='brute'?19:12,e.type==='robot'?[0x6c91a0,0xa5bec3,0xff9864]:[0x679378,0x9eaf83,0x4a6265],5,e.type==='brute'?.24:.16,true);
  if(e.telegraph)removeEffect(e.telegraph);disposeInstance(e);gainXP(e.type==='brute'?3:1);
  if(Math.random()<.16)spawnDrop(e.x,e.z,player.hp<player.maxHp*.7&&Math.random()<.65?'heart':'gold');
  if(combo===10||combo===25)toast(combo+' ΣΤΗ ΣΕΙΡΑ','Συνέχισε την κατεδάφιση!');
}
function hurtObject(o,damage,q=0){
  if(o.dead)return false;o.hp-=damage;o.flash=.15;o.shudder=.22;flashMaterials(o,.85);
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
function impact(){
  const s=swing;if(!s)return;s.hit=true;createArc(s.fx,s.fz,s.range,s.q);
  const origin={x:player.x,z:player.z,fx:s.fx,fz:s.fz};let hits=0,breaks=0;
  for(const e of [...enemies])if(inArc(player.x,player.z,s.fx,s.fz,e.x,e.z,s.range,s.halfAngle,e.radius)){
    const dir=normalize(e.x-player.x+s.fx*.4,e.z-player.z+s.fz*.4);hitEnemy(e,s.damage,dir,s.knockback,s.lift);hits++;
  }
  for(const o of world.objects)if(!o.dead&&hitObject(origin,o,s.range,s.halfAngle)){if(hurtObject(o,s.damage,s.q))breaks++;hits++;}
  if(boss&&!boss.dead&&inArc(player.x,player.z,s.fx,s.fz,boss.x,boss.z,s.range,s.halfAngle,boss.radius)){
    boss.hp-=s.damage;boss.flash=.15;boss.stagger=s.charged?.22:.06;boss.vx=s.fx*s.knockback*.13;boss.vz=s.fz*s.knockback*.13;
    flashMaterials(boss,1);floatText(boss.x,4.9,boss.z,Math.round(s.damage).toString(),'#ffd47d',26);hits++;
    fragments.add(boss.x,2,boss.z,14,[0xffbe75,0xff7546,0xb7cdd2],6,.11);
    if(boss.hp<=0)defeatBoss();
  }
  if(s.charged){
    const radius=2.7+stats.quake*.8;pulse(player.x,player.z,radius,0xffd48b,.48);
    for(const e of [...enemies])if(Math.hypot(e.x-player.x,e.z-player.z)<radius&&!inArc(player.x,player.z,s.fx,s.fz,e.x,e.z,s.range,s.halfAngle,e.radius))hitEnemy(e,s.damage*(.25+stats.quake*.16),normalize(e.x-player.x,e.z-player.z),s.knockback*.7,s.lift);
    fragments.add(player.x+s.fx*1.8,.15,player.z+s.fz*1.8,24,[0xffbd6a,0xffedbf,0x9ba9a0],8,.11);
  }
  if(hits){shake=Math.max(shake,(.12+s.q*.26)*(breaks?1.35:1));hitStop=.035+s.q*.04;audio.play(breaks?'break':'hit',s.q);}
  if(!bossSpawned&&destructionPercent(world.objects)>=GOAL)spawnBoss();
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
function hurtPlayer(damage,dx=0,dz=0){
  if(phase!=='playing'||player.invincible>0||dashTime>0)return;
  player.hp=Math.max(0,player.hp-damage);player.invincible=.85;player.hurtAgo=0;player.vx=dx*4;player.vz=dz*4;
  redFlash=.55;shake=Math.max(shake,.19);combo=0;audio.play('hurt');floatText(player.x,2.5,player.z,'−'+Math.ceil(damage),'#ff8d80',21);
  if(player.hp<=0)endGame(false);
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
            pulse(e.x,e.z,3,0xfc7765,.42);fragments.add(e.x,.1,e.z,12,[0xc4bb97,0x75897d],5,.12);if(dist<2.95)hurtPlayer(e.damage,dir.x,dir.z);e.state='walk';e.timer=2.2;
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
    const b=bolts[i];b.x+=b.vx*dt;b.z+=b.vz*dt;b.life-=dt;b.mesh.position.set(b.x,1,b.z);b.mesh.rotation.y+=dt*12;
    if(Math.hypot(b.x-player.x,b.z-player.z)<.65){hurtPlayer(b.damage,b.vx/10,b.vz/10);b.life=0;}
    if(world.objects.some(o=>circleOverlaps(b.x,b.z,.12,o)))b.life=0;
    if(b.life<=0){scene.remove(b.mesh);b.mesh.geometry.dispose();b.mesh.material.dispose();bolts.splice(i,1);}
  }
}

function spawnBoss(){
  bossSpawned=true;
  let pos=spawnPosition(13);
  // A wide, announced arrival gives the player space to react.
  const mesh=makeBoss();scene.add(mesh);const hp=1650*(1+(round-1)*.5);
  boss={mesh,x:pos.x,z:pos.z,y:-5,vx:0,vz:0,radius:1.65,hp,maxHp:hp,materials:prepareMaterials(mesh),flash:0,stagger:0,state:'enter',timer:2.6,attack:0,telegraph:null,enraged:false,dead:false,walk:0};
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
  const dir=normalize(player.x-b.x,player.z-b.z);if(Math.hypot(player.x-b.x,player.z-b.z)<radius)hurtPlayer(b.enraged?32:25,dir.x,dir.z);
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
  if(phase!=='playing'||dashCooldown>0||dashTime>0)return;
  dashDirection={...facing};dashTime=.23;dashCooldown=1.5;player.invincible=Math.max(player.invincible,.3);
  audio.play('dash');pulse(player.x,player.z,1.5,0x86d3c2,.25);
}
function updatePlayer(dt){
  player.invincible=Math.max(0,player.invincible-dt);player.hurtAgo+=dt;dashCooldown=Math.max(0,dashCooldown-dt);attackCooldown=Math.max(0,attackCooldown-dt);
  if(player.hurtAgo>8&&player.hp<player.maxHp)player.hp=Math.min(player.maxHp,player.hp+1.25*dt);
  const horizontal=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0)+touch.x;
  const vertical=(keys.has('KeyS')||keys.has('ArrowDown')?1:0)-(keys.has('KeyW')||keys.has('ArrowUp')?1:0)+touch.y;
  const move=screenMovement(horizontal,vertical);const moving=Math.hypot(move.x,move.z)>.01;
  if(moving&&!swing){facing=move;}
  let dx,dz;
  if(dashTime>0){dashTime=Math.max(0,dashTime-dt);dx=dashDirection.x*19*dt;dz=dashDirection.z*19*dt;if(Math.random()<.7)fragments.add(player.x,.15,player.z,1,[0x7ac9bd,0xa6ddcd],1,.06);}
  else{const speed=stats.speed*(chargeStarted?.64:swing?.75:1);dx=move.x*speed*dt;dz=move.z*speed*dt;}
  dx+=player.vx*dt;dz+=player.vz*dt;player.vx*=Math.exp(-9*dt);player.vz*=Math.exp(-9*dt);
  const actual=moveCircle(player,dx,dz,world.objects,player.radius);player.walk+=Math.hypot(actual.x,actual.z)*6;
  if(chargeHeld&&!chargeStarted&&!swing&&attackCooldown<=0){chargeStarted=true;charge=0;chargeFullPlayed=false;}
  if(chargeStarted){charge=clamp(charge+dt/1.25,0,1);if(charge>=1&&!chargeFullPlayed){chargeFullPlayed=true;audio.play('charge',1);pulse(player.x,player.z,2.3,color.gold,.3);}}
  if(swing){swing.time+=dt;if(!swing.hit&&swing.time>=swing.impactAt){moveCircle(player,swing.fx*(.15+swing.q*.35),swing.fz*(.15+swing.q*.35),world.objects,player.radius);impact();}if(swing&&swing.time>=swing.duration)swing=null;}
  for(const hazard of world.hazards){if(Math.hypot(player.x-hazard.x,player.z-hazard.z)<hazard.r)hurtPlayer((hazard.damage||10)*.65,0,0);}
  poseHero(dt,moving);
}
function poseHero(dt,moving=false){
  const u=hero.userData,walk=moving?Math.sin(player.walk):0;
  const targetAngle=Math.atan2(swing?swing.fx:facing.x,swing?swing.fz:facing.z);
  const diff=Math.atan2(Math.sin(targetAngle-hero.rotation.y),Math.cos(targetAngle-hero.rotation.y));hero.rotation.y+=diff*Math.min(1,dt*20);
  hero.position.set(player.x,dashTime>0?.15:Math.abs(walk)*.07,player.z);
  if(u.leftLeg)u.leftLeg.rotation.x=walk*.58;if(u.rightLeg)u.rightLeg.rotation.x=-walk*.58;
  if(u.body){u.body.rotation.x=dashTime>0?.25:chargeStarted?-.12:swing?.15:0;u.body.rotation.y=swing?Math.sin(swing.time/swing.duration*Math.PI)*.22:0;u.body.position.y=Math.sin(visualTime*2)*.015;}
  if(u.cape){u.cape.rotation.x=.15+Math.sin(visualTime*6)*.07+(moving?.25:0);u.cape.rotation.z=Math.sin(visualTime*3)*.045;}
  if(u.weaponRig){
    const rest=u.weaponRest||{x:.55,y:0,z:-.72};let rx=rest.x,ry=rest.y,rz=rest.z;
    if(chargeStarted){rx=lerp(rest.x,-1.0,charge);ry=-.5*charge;rz=lerp(rest.z,-.18,charge);if(charge>.95){rx+=Math.sin(visualTime*45)*.018;rz+=Math.cos(visualTime*42)*.018;}}
    if(swing){
      const p=swing.time/swing.duration,impact=swing.impactAt/swing.duration;
      if(p<impact){const t=p/impact;rx=lerp(swing.q>.2?-1.0:rest.x,1.58,t*t);ry=lerp(-1.1,.2,t);rz=lerp(-.7,.05,t);}
      else{const t=(p-impact)/(1-impact),ease=1-(1-t)**3;rx=lerp(1.58,rest.x,ease);ry=lerp(.2+Math.sin(t*Math.PI)*.8,rest.y,ease);rz=lerp(.05,rest.z,ease);}
    }
    u.weaponRig.rotation.set(rx,ry,rz);u.updateGrip?.();
  }
  flashMaterials(player,player.invincible>0&&player.hurtAgo<1?(Math.sin(visualTime*30)*.5+.5)*.55:0,0xff8b71);
  chargeRing.visible=chargeStarted;chargeRing.position.set(player.x,.07,player.z);chargeRing.scale.setScalar(1.1+charge*.6);chargeRing.material.opacity=.25+charge*.55;
  chargeRing.material.color.setHex(charge>.95?0xffeac4:0xffae57);
  directionMarker.position.set(player.x+facing.x*1.15,.055,player.z+facing.z*1.15);directionMarker.rotation.y=Math.atan2(facing.x,facing.z);directionMarker.visible=phase==='playing';
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
    o.flash=Math.max(0,o.flash-dt);o.shudder=Math.max(0,o.shudder-dt);flashMaterials(o,o.flash/.15);
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
  fragments.update(dt);
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
  updateDrops(dt);updateObjects(dt);
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
  $('chargeFill').style.width=(charge*100)+'%';$('chargeWrap').classList.toggle('charged',charge>=.95);
  $('chargeText').textContent=charge>=.95?'ΑΦΗΣΕ ΓΙΑ ΣΥΝΘΛΙΨΗ':chargeStarted?'ΦΟΡΤΙΣΗ '+Math.floor(charge*100)+'%':'ΚΡΑΤΑ ΓΙΑ ΙΣΧΥ';
  document.querySelector('[data-key="ShiftLeft"]')?.classList.toggle('cooldown',dashCooldown>0);
  if(boss){$('bossFill').style.width=Math.max(0,boss.hp/boss.maxHp*100)+'%';$('bossValue').textContent=(boss.enraged?'ΦΑΣΗ ΙΙ · ':'')+Math.max(0,Math.ceil(boss.hp/boss.maxHp*100))+'%';}
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
function drawFX(){
  const c=fxContext;c.clearRect(0,0,screenW,screenH);
  if(redFlash>0){const grad=c.createRadialGradient(screenW/2,screenH/2,screenH*.22,screenW/2,screenH/2,screenW*.66);grad.addColorStop(0,'rgba(201,62,42,0)');grad.addColorStop(1,'rgba(201,62,42,'+(redFlash*.5)+')');c.fillStyle=grad;c.fillRect(0,0,screenW,screenH);}
  if(phase==='menu')return;
  for(const e of enemies){if(e.hurtTimer<=0)continue;const p=screenPoint(e.x,e.y+e.height+.35,e.z);if(!p.inside)continue;const width=e.type==='brute'?42:29;c.globalAlpha=Math.min(1,e.hurtTimer);c.fillStyle='#152020';c.fillRect(p.x-width/2-1,p.y-1,width+2,5);c.fillStyle=e.type==='robot'?'#e9a27c':'#91c5a2';c.fillRect(p.x-width/2,p.y,width*clamp(e.hp/e.maxHp,0,1),3);}
  for(const n of numbers){const p=screenPoint(n.x,n.y,n.z);if(!p.inside)continue;c.globalAlpha=Math.min(1,n.life/.3);c.textAlign='center';c.font='900 '+n.size+'px "Courier New",monospace';c.lineWidth=3;c.strokeStyle='rgba(10,24,26,.8)';c.strokeText(n.text,p.x,p.y);c.fillStyle=n.color;c.fillText(n.text,p.x,p.y);}
  c.globalAlpha=1;
  if(chargeStarted){const p=screenPoint(player.x,2.8,player.z);const width=52;c.fillStyle='#162728';c.fillRect(p.x-width/2-2,p.y-2,width+4,8);c.fillStyle=charge>.95?'#ffebac':'#ffb85f';c.fillRect(p.x-width/2,p.y,width*charge,4);}
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
    const handled=['Space','KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftLeft','ShiftRight','Escape'];
    if(handled.includes(e.code)&&!['INPUT','SELECT'].includes(document.activeElement?.tagName))e.preventDefault();
    if(e.code==='Escape'&&!e.repeat){if(phase==='settings'){setPhase(previousPhase);}else pauseGame();return;}
    if(phase==='menu'&&e.code==='Enter'&&!$('startButton').disabled){startGame();return;}
    if(phase==='upgrade'&&['Digit1','Digit2','Digit3'].includes(e.code)){const b=$('upgradeChoices').children[Number(e.code.slice(-1))-1];b?.click();return;}
    if(phase!=='playing')return;
    keys.add(e.code);document.querySelector('[data-key="'+e.code+'"]')?.classList.add('active');
    if(e.code==='Space'&&!e.repeat){audio.unlock();chargeHeld=true;if(!swing&&attackCooldown<=0){chargeStarted=true;charge=0;chargeFullPlayed=false;}}
    if((e.code==='ShiftLeft'||e.code==='ShiftRight')&&!e.repeat)dodge();
  });
  window.addEventListener('keyup',e=>{
    keys.delete(e.code);document.querySelector('[data-key="'+e.code+'"]')?.classList.remove('active');
    if(e.code==='Space'){chargeHeld=false;if(phase==='playing')beginSwing();else{chargeStarted=false;charge=0;}}
  });
  window.addEventListener('blur',()=>{if(phase==='playing')setPhase('paused');clearInput();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&phase==='playing')setPhase('paused');});
  $('gameCanvas').addEventListener('pointerdown',()=>{$('gameCanvas').focus();audio.unlock();});
  $('gameCanvas').addEventListener('contextmenu',e=>e.preventDefault());
  let stickId=null;
  const stick=$('joystick'),knob=$('joystickKnob');
  function moveStick(e){const rect=stick.getBoundingClientRect(),r=rect.width*.34,dx=e.clientX-rect.left-rect.width/2,dy=e.clientY-rect.top-rect.height/2,d=Math.hypot(dx,dy),m=Math.min(d,r);touch.x=d>.1?dx/d*m/r:0;touch.y=d>.1?dy/d*m/r:0;knob.style.transform='translate('+(touch.x*r)+'px,'+(touch.y*r)+'px)';}
  stick.addEventListener('pointerdown',e=>{if(phase!=='playing')return;e.preventDefault();stickId=e.pointerId;stick.setPointerCapture(stickId);moveStick(e);audio.unlock();});
  stick.addEventListener('pointermove',e=>{if(e.pointerId===stickId)moveStick(e);});
  const releaseStick=e=>{if(e.pointerId===stickId){stickId=null;touch.x=0;touch.y=0;knob.style.transform='translate(0,0)';}};
  stick.addEventListener('pointerup',releaseStick);stick.addEventListener('pointercancel',releaseStick);
  const attack=$('attackButton');
  attack.addEventListener('pointerdown',e=>{if(phase!=='playing')return;e.preventDefault();attack.setPointerCapture(e.pointerId);chargeHeld=true;attack.classList.add('active');if(!swing&&attackCooldown<=0){chargeStarted=true;charge=0;chargeFullPlayed=false;}audio.unlock();});
  attack.addEventListener('pointerup',()=>{chargeHeld=false;attack.classList.remove('active');beginSwing();});
  attack.addEventListener('pointercancel',()=>{chargeHeld=false;chargeStarted=false;charge=0;attack.classList.remove('active');});
  $('dashButton').addEventListener('pointerdown',e=>{e.preventDefault();dodge();});
  window.addEventListener('resize',resize);
}

let lastFrame=0;
function frame(now){
  requestAnimationFrame(frame);const realDt=Math.min(.045,(now-lastFrame)/1000||.016);lastFrame=now;
  if(document.hidden)return;
  visualTime+=realDt;redFlash=Math.max(0,redFlash-realDt*1.4);shake=Math.max(0,shake-realDt*1.7);
  let dt=realDt;
  if(hitStop>0){hitStop-=realDt;dt=0;}
  if(phase==='playing')updateGame(dt);
  else if(phase==='menu'){player.walk+=dt*.25;poseHero(dt,false);updateObjects(dt);}
  const weather=world.regionAt?.(player.x,player.z)?.weather||'rain';
  const environmentDt=phase==='playing'||phase==='menu'?dt:0;
  world.update(environmentDt,visualTime,player,weather);updateEffects(phase==='paused'||phase==='upgrade'||phase==='settings'?0:realDt);
  const desired=phase==='menu'?new THREE.Vector3(-5,.6,3.5):new THREE.Vector3(player.x+facing.x*.8,.6,player.z+facing.z*.8);
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
