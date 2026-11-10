import * as THREE from './vendor/three.module.js';
import {MountRide} from './mount-ride.js?v=20261110-tall-rider';
import {makeSiegeEngineChip,makeSiegeRecoveryTank} from './enemy-models.js?v=20261110-tank-drive';
import {LevelStorm} from './level-storm.js?v=20261109-recovery';
import {ScreamWave} from './scream.js?v=20261109-shout-brace';

export const SIEGE_CHARGE_SECONDS=5,SIEGE_FUSE_SECONDS=10,SIEGE_HP=820;
const BOOT_SECONDS=1.4;
export const SIEGE_SONIC_RANGE=20,SIEGE_SONIC_ANGLE=.52;
const SHELL_RANGE=28,SHELL_ANGLE=.20,MISSILE_RANGE=35,MISSILE_RADIUS=4.1;
export const SIEGE_SHOCK_SECONDS=8;
const SHAPES={tank:{radius:2.65,height:3.8,offsets:[-1.2,0,2.0]},walker:{radius:3.9,height:7.1,offsets:[-.7,0,1.35]}};
const angleDelta=(from,to)=>Math.atan2(Math.sin(to-from),Math.cos(to-from));
const approach=(value,target,step)=>value+THREE.MathUtils.clamp(target-value,-step,step);
const clampAxis=(value,extent)=>THREE.MathUtils.clamp(value,-extent,extent);
const crankPulse=(time,at,width)=>Math.max(0,1-Math.abs(time-at)/width)**2;
const disposeModel=root=>{root.removeFromParent();root.traverse(node=>{if(node.isMesh)node.geometry.dispose();});};

function guide(scene,color,radius,angle=Math.PI){
  const vertices=[];
  const point=a=>[Math.sin(a)*radius,.07,Math.cos(a)*radius];
  for(let i=0;i<48;i++)vertices.push(...point(-angle+2*angle*i/48),...point(-angle+2*angle*(i+1)/48));
  if(angle<Math.PI)for(const side of [-1,1])vertices.push(0,.07,0,...point(angle*side));
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  const line=new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color,transparent:true,opacity:.76,depthWrite:false}));
  line.visible=false;scene.add(line);return line;
}

export class SiegeTank extends MountRide {
  constructor(scene,{weapons,notice,change,play,sonic,cannon,shock,slam}){
    super(scene,{notice});
    this.weapons=weapons;this.change=change;this.play=play;this.sonic=sonic;this.cannon=cannon;
    this.shock=shock;this.slam=slam;this.shockTime=this.shockCooldown=this.foldImpact=0;this.foldImpactPending=false;
    this.stats={hover:false};this.collision=SHAPES.tank;
    this.lightning=new LevelStorm(scene);
    this.wave=new ScreamWave(scene);
    this.shellGuide=guide(scene,0xf5bd75,SHELL_RANGE,SHELL_ANGLE);
    this.sonicGuide=guide(scene,0x8edfd5,SIEGE_SONIC_RANGE,SIEGE_SONIC_ANGLE);
    this.missileGuide=guide(scene,0xff9056,MISSILE_RADIUS);
    this.fuseGuide=guide(scene,0xff7b43,8);
    this.guideOrigin=new THREE.Vector3();
    this.state='absent';
  }

  reset(hero){
    if(this.active)hero.visible=true;
    if(this.model)disposeModel(this.model);
    if(this.chip)disposeModel(this.chip);
    this.model=this.chip=null;this.active=false;this.state='absent';this.hasChip=false;
    this.shockTime=this.shockCooldown=this.foldImpact=0;this.foldImpactPending=false;
    this.lightning.reset();this.hideEffects();this.cancelAim();
  }

  hideEffects(){
    this.lightning.hide();this.wave.hide();
    for(const line of [this.shellGuide,this.sonicGuide,this.fuseGuide,this.missileGuide])line.visible=false;
  }

  startCity(world,saved){
    if(world.river)return;
    this.collision=SHAPES.tank;this.yaw=0;
    const sites=[[-44,22],[-22,44],[-44,0],[44,22],[-66,44],[22,44]];
    const clearSite=([x,z])=>Math.max(Math.abs(x),Math.abs(z))<world.bounds-5&&this.clear(world,x,z,0,0);
    const roads=world.layout?.roads??[];
    const site=sites.find(clearSite)??roads.flatMap(x=>roads.map(z=>[x,z])).find(clearSite);
    if(!site)return;
    this.state='broken';this.hp=0;this.timer=0;this.fold=this.foldTarget=1;
    this.speed=this.vertical=this.walk=this.dashTime=this.dashCooldown=this.jumpCooldown=0;
    this.shellCooldown=this.missileCooldown=this.sonicCooldown=this.boot=0;this.sonicShot=null;
    this.airborne=false;this.turretYaw=0;this.held=false;
    this.yawRate=this.acceleration=this.backOut=0;this.reverseGear=false;
    Object.assign(this.body,{x:site[0],y:0,z:site[1]});
    if(saved){
      this.hasChip=saved.chip===true;
      if(['charging','ready','fuse','destroyed'].includes(saved.state)){
        this.state=saved.state;
        this.hp=Number.isFinite(saved.hp)?THREE.MathUtils.clamp(saved.hp,1,SIEGE_HP):SIEGE_HP;
        if(this.state!=='ready')this.hp=0;
        this.timer=Number.isFinite(saved.timer)?THREE.MathUtils.clamp(saved.timer,0,this.state==='charging'?SIEGE_CHARGE_SECONDS:SIEGE_FUSE_SECONDS):0;
        const {x,z,yaw}=saved;
        if(Number.isFinite(x)&&Number.isFinite(z)&&Number.isFinite(yaw)&&Math.abs(x)<world.bounds-6&&Math.abs(z)<world.bounds-6&&this.clear(world,x,z,0,yaw)){
          Object.assign(this.body,{x,z});this.yaw=yaw;
          this.turretYaw=Number.isFinite(saved.turretYaw)?saved.turretYaw:yaw;
          if(saved.mode==='walker'&&this.state==='ready'){
            this.collision=SHAPES.walker;
            if(this.clear(world,x,z,0,yaw))this.fold=this.foldTarget=0;
            else this.collision=SHAPES.tank;
          }
        }
      }
      if(this.state==='broken'&&!this.hasChip&&saved.drop&&Number.isFinite(saved.drop.x)&&Number.isFinite(saved.drop.z))this.dropChip(world,saved.drop);
    }
    if(this.state==='destroyed')return;
    this.model=makeSiegeRecoveryTank();this.scene.add(this.model);this.poseTank();
    if(this.state==='charging')this.lightning.charge(this.body,this.timer);
  }

  dropChip(world,point){
    if(this.state!=='broken'||this.hasChip||this.chip)return false;
    const inside=(x,z)=>Math.abs(x)<world.bounds-1&&Math.abs(z)<world.bounds-1&&world.clearBody(x,z,0,.42,.9);
    let location=inside(point.x,point.z)?point:null;
    for(let radius=1;radius<=18&&!location;radius++)for(let i=0;i<12;i++){
      const angle=i*Math.PI/6,x=point.x+Math.sin(angle)*radius,z=point.z+Math.cos(angle)*radius;
      if(inside(x,z)){location={x,z};break;}
    }
    if(!location)location={x:this.body.x,z:this.body.z+5};
    this.chip=makeSiegeEngineChip();this.chip.position.set(location.x,.65,location.z);
    this.scene.add(this.chip);return true;
  }

  get discovered(){return !!this.model&&(!!this.chip||this.hasChip||this.state==='charging'||this.state==='ready'||this.state==='fuse');}

  localPoint(x,z){
    const dx=x-this.body.x,dz=z-this.body.z,c=Math.cos(this.yaw),s=Math.sin(this.yaw);
    return {x:dx*c-dz*s,z:dx*s+dz*c};
  }

  worldPoint(x,z){
    const c=Math.cos(this.yaw),s=Math.sin(this.yaw);
    return {x:this.body.x+x*c+z*s,z:this.body.z-x*s+z*c};
  }

  // Chassis contact follows the visible tracks, while the larger clearance
  // envelope still keeps the turret and legs out of city geometry.
  hullContact(actor){
    const local=this.localPoint(actor.x,actor.z);
    const width=3.45-1.25*this.fold,length=2.80-.55*this.fold;
    const x=clampAxis(local.x,width),z=clampAxis(local.z,length);
    let dx=local.x-x,dz=local.z-z,depth=Math.hypot(dx,dz);
    if(depth>.0001){dx/=depth;dz/=depth;}
    else if(width-Math.abs(x)<length-Math.abs(z)){
      dx=x<0?-1:1;dz=0;depth=Math.abs(x)-width;
    }else{
      dx=0;dz=z<0?-1:1;depth=Math.abs(z)-length;
    }
    const c=Math.cos(this.yaw),s=Math.sin(this.yaw);
    return {gap:depth-actor.radius,dx:dx*c+dz*s,dz:-dx*s+dz*c,flank:Math.abs(dx)>.8&&Math.abs(local.z)<length-.2,local};
  }

  discharge(){
    if(!this.active||this.boot>0||this.shockCooldown>0)return false;
    this.shockCooldown=SIEGE_SHOCK_SECONDS;this.shockTime=.55;
    this.shock?.(this);
    return true;
  }

  isNear(player){return this.model&&this.state!=='destroyed'&&Math.hypot(player.x-this.body.x,player.z-this.body.z)<6&&Math.abs(player.y-this.body.y)<2;}

  interact(player,hero,world){
    if(this.active){
      if(this.body.y>.2||this.airborne)return false;
      return this.exit(player,hero,world);
    }
    if(!this.isNear(player))return false;
    if(this.state==='broken'&&this.hasChip){
      this.hasChip=false;this.state='charging';this.timer=SIEGE_CHARGE_SECONDS;
      this.lightning.charge(this.body,this.timer);this.play('levelStorm',1);this.change();return true;
    }
    if(this.state!=='ready'){
      if(this.state==='broken')this.notice('ΠΟΛΙΟΡΚΗΤΗΣ ΕΚΤΟΣ ΛΕΙΤΟΥΡΓΙΑΣ','Βρες το chip του πρώτου mini-boss.');
      return false;
    }
    this.active=true;this.speed=this.yawRate=this.acceleration=this.backOut=0;this.reverseGear=false;this.boot=BOOT_SECONDS;hero.visible=false;
    this.play('tankIgnition',1);
    this.place(player);return true;
  }

  exit(player,hero,world,forced=false){
    let point;
    for(const radius of [5.6,7.1,9,12,16])for(let i=0;i<12&&!point;i++){
      const angle=this.yaw+Math.PI*.5+i*Math.PI/6,x=this.body.x+Math.sin(angle)*radius,z=this.body.z+Math.cos(angle)*radius;
      if(world.clearBody(x,z,0,player.radius,1.9))point={x,z};
    }
    if(!point&&!forced){this.notice('ΕΞΟΔΟΣ ΜΠΛΟΚΑΡΙΣΜΕΝΗ','Μετακίνησε το άρμα σε ανοικτό σημείο.');return false;}
    this.active=false;this.speed=this.dashTime=this.boot=this.acceleration=this.shockTime=0;this.held=false;this.cancelAim();hero.visible=true;
    Object.assign(player,point||{x:this.body.x,z:this.body.z},{y:0,vx:0,vy:0,vz:0,invincible:Math.max(player.invincible||0,1)});
    return true;
  }

  absorb(damage,player,hero,world){
    this.hp=Math.max(0,this.hp-damage);
    if(this.hp<=0){
      this.state='fuse';this.timer=SIEGE_FUSE_SECONDS;this.vertical=0;
      this.exit(player,hero,world,true);
      this.notice('ΑΥΤΟΚΑΤΑΣΤΡΟΦΗ · 10s','Απομακρύνσου από το άρμα!');this.play('charge',1);this.change();
    }
  }

  transform(world){
    if(!this.active||this.boot>0||this.airborne||this.fold!==this.foldTarget)return false;
    const target=this.fold===1?0:1,old=this.collision;
    this.collision=target===1?SHAPES.tank:SHAPES.walker;
    if(!this.clear(world,this.body.x,this.body.z,this.body.y,this.yaw)){
      this.collision=old;this.notice('ΧΡΕΙΑΖΕΤΑΙ ΧΩΡΟΣ','Μεταμορφώσου σε ανοικτό δρόμο.');return false;
    }
    if(target===1)this.collision=old;
    this.foldTarget=target;this.foldImpactPending=target===1;this.play('carTear',.5);return true;
  }
  jump(){
    if(!this.active||this.boot>0||this.fold!==0||this.airborne||this.jumpCooldown>0)return false;
    this.vertical=11;this.airborne=true;this.jumpCooldown=1.2;this.play('dash',.65);return true;
  }
  dash(direction){
    if(!this.active||this.boot>0||this.fold!==0||this.dashCooldown>0)return false;
    this.dashDirection=direction;this.dashTime=.28;this.dashCooldown=1.25;this.play('dash',.8);return true;
  }

  place(player){
    Object.assign(player,{x:this.body.x,y:this.body.y+.3,z:this.body.z});
  }

  drive(dt,world,player,move,strength,boost,aim){
    if(this.boot>0){this.place(player);return;}
    const targetYaw=Math.atan2(aim.x,aim.z);
    this.turretYaw=approach(this.turretYaw,this.turretYaw+angleDelta(this.turretYaw,targetYaw),2.7*dt);
    const tracked=this.fold===1,{x,y,z}=this.body,oldSpeed=this.speed;
    const top=tracked?(boost?12.6:8.5):6.2,reverseTop=tracked?4.5:4;
    let reverse=false,turn=0,blockedTurn=false;
    if(strength>.001){
      const desiredYaw=Math.atan2(move.x,move.z),delta=angleDelta(this.yaw,desiredYaw);
      reverse=Math.abs(delta)>Math.PI*(this.reverseGear?.48:.56);
      this.reverseGear=reverse;
      turn=angleDelta(this.yaw,desiredYaw+(reverse?Math.PI:0));
    }else {this.backOut=0;if(Math.abs(oldSpeed)<.05)this.reverseGear=false;}
    // At low speed the tracks can turn in opposite directions. At speed,
    // limit the steering difference and slow down for tight turns.
    const moving=THREE.MathUtils.clamp(Math.abs(oldSpeed)/8.5,0,1);
    const yawLimit=tracked?THREE.MathUtils.lerp(1.40,.59,moving):1.9;
    const yawGoal=this.backOut>0?0:THREE.MathUtils.clamp(turn*3.2,-yawLimit,yawLimit);
    this.yawRate=approach(this.yawRate,yawGoal,(tracked?2.7:5.4)*dt);
    const nextYaw=this.yaw+this.yawRate*dt;
    if(Math.abs(nextYaw-this.yaw)>1e-7){
      if(this.clear(world,x,z,y,nextYaw))this.yaw=nextYaw;
      else {this.yawRate=0;blockedTurn=true;}
    }
    if(blockedTurn&&strength>.001&&Math.abs(turn)>.42){
      // Back out along the tracks if the desired turn cannot fit at a curb.
      const dx=Math.sin(this.yaw)*.45,dz=Math.cos(this.yaw)*.45,sign=reverse?-1:1;
      if(!this.clear(world,x+dx*sign,z+dz*sign,y,this.yaw)&&
          this.clear(world,x-dx*sign,z-dz*sign,y,this.yaw)){
        if(!reverse)this.backOut=1.15;
        reverse=!reverse;
      }
    }
    if(this.backOut>0)reverse=true;
    const alignment=tracked&&!blockedTurn&&this.backOut<=0?1-THREE.MathUtils.smoothstep(Math.abs(turn),.27,.95):1;
    const desired=(reverse?-reverseTop:top)*strength*alignment;
    // Brake to a stop before applying torque in the opposite direction.
    const changingGear=desired*oldSpeed<0;
    const braking=changingGear||Math.abs(desired)<Math.abs(oldSpeed);
    const rate=tracked?(braking?(strength>.001?6.2:4.4):boost&&!reverse?4.6:reverse?2.7:3.35):(braking?8:6.2);
    this.speed=approach(oldSpeed,changingGear?0:desired,rate*dt);
    const direction=this.dashTime>0?this.dashDirection:{x:Math.sin(this.yaw),z:Math.cos(this.yaw)};
    const speed=this.dashTime>0?21:this.speed;
    this.vertical-=23*dt;
    const result=this.move(world,direction.x*speed*dt,direction.z*speed*dt,this.vertical*dt);
    this.airborne=!result.grounded;
    if(result.grounded||result.ceilingHit)this.vertical=0;
    const travel=Math.hypot(this.body.x-x,this.body.z-z);
    if(this.backOut>0){
      this.backOut=Math.max(0,this.backOut-(this.speed<0?travel:0));
      if(this.speed<0&&travel<dt*.01)this.backOut=0;
    }
    if(this.dashTime<=0)this.speed=Math.sign(this.speed)*Math.min(Math.abs(this.speed),travel/dt);
    this.acceleration=THREE.MathUtils.damp(this.acceleration,(this.speed-oldSpeed)/dt,6,dt);
    this.walk+=travel*2.6;
    this.fold=THREE.MathUtils.damp(this.fold,this.foldTarget,7,dt);
    if(Math.abs(this.fold-this.foldTarget)<.012)this.fold=this.foldTarget;
    if(this.fold===1)this.collision=SHAPES.tank;
    if(this.foldImpactPending&&this.fold===1&&result.grounded){
      this.foldImpactPending=false;this.foldImpact=.22;
      this.slam?.(this);
    }
    this.place(player);this.poseTank();
  }

  poseTank(){
    const model=this.model,u=model.userData,r=u.recovery,live=this.state==='ready';
    const crank=BOOT_SECONDS-this.boot;
    const shudder=this.boot>0?Math.min(1,crank*9)*Math.min(1,this.boot*4)*
      (.15+crankPulse(crank,.31,.17)*.75+crankPulse(crank,.63,.17)+crankPulse(crank,.99,.29)*1.15):0;
    model.position.set(this.body.x,this.body.y+Math.sin(crank*43)**2*.035*shudder,this.body.z);
    model.rotation.set(Math.cos(crank*36)*.032*shudder,this.yaw,Math.sin(crank*46)*.044*shudder,'YXZ');
    u.animate({fold:this.fold,walk:this.walk,state:'walk',gait:this.active?Math.abs(this.speed):0,cannonRecoil:0});
    const kick=Math.max(0,(this.shellCooldown-1)/.2);
    const compression=Math.sin(Math.PI*this.foldImpact/.22)*.14;
    u.body.position.y-=compression;
    u.body.rotation.x=-.075*kick*kick+THREE.MathUtils.clamp(-this.acceleration*.004,-.028,.028)*this.fold;
    r.turret.rotation.y=angleDelta(this.yaw,this.turretYaw);
    r.live.visible=live||this.state==='charging'&&Math.sin(this.timer*25)>.45;r.wreck.visible=!live;
    r.muzzles.forEach((point,i)=>{
      const barrel=point.parent;barrel.rotation.x=live?0:i===0?-.27:i===3?.29:0;
      barrel.position.z=2.05-(live?.40*kick*kick:0);
    });
    if(!live){r.tracks[2].rotation.z=.47;r.tracks[2].position.x+=.54;r.tracks[2].position.y*=.72;}
    else r.tracks[2].rotation.z=0;
    model.updateMatrixWorld(true);
  }

  shellPress(){if(this.boot<=0){this.held=true;this.fireShells();}}
  fireShells(){
    if(!this.active||this.boot>0||this.shellCooldown>0||this.aiming)return;
    const muzzles=this.model.userData.recovery.muzzles;
    for(const [i,barrel] of muzzles.entries()){
      const yaw=this.turretYaw+(i-1.5)*.105,origin=barrel.getWorldPosition(new THREE.Vector3());
      const lift=(this.body.y+1.35-origin.y)*2.55;
      this.weapons.fire(origin,new THREE.Vector3(Math.sin(yaw)*44,lift,Math.cos(yaw)*44),{damage:64,range:SHELL_RANGE,gravity:7,owner:'siege'});
    }
    this.shellCooldown=1.2;
    const muzzle=muzzles[1].getWorldPosition(new THREE.Vector3());
    this.cannon?.(muzzle,{x:Math.sin(this.turretYaw),z:Math.cos(this.turretYaw)},true);
  }

  startAim(){if(this.active&&this.boot<=0&&this.missileCooldown<=0){this.aiming=true;this.target=null;}}
  aimAt(point,world){
    if(!this.aiming)return;
    const dx=point.x-this.body.x,dz=point.z-this.body.z,distance=Math.hypot(dx,dz);
    const direction=distance>.05?{x:dx/distance,z:dz/distance}:{x:Math.sin(this.turretYaw),z:Math.cos(this.turretYaw)};
    const range=THREE.MathUtils.clamp(distance,5,MISSILE_RANGE);
    const x=THREE.MathUtils.clamp(this.body.x+direction.x*range,-world.bounds+.5,world.bounds-.5);
    const z=THREE.MathUtils.clamp(this.body.z+direction.z*range,-world.bounds+.5,world.bounds-.5);
    this.target={x,y:world.supportHeight(x,z,.1,60)+.15,z};
    this.missileGuide.position.set(x,this.target.y,z);this.missileGuide.visible=true;
  }
  cancelAim(){this.aiming=false;this.target=null;this.missileGuide.visible=false;}
  fireMissiles(){
    const target=this.aiming?this.target:null;this.cancelAim();
    if(!this.active||!target||this.missileCooldown>0)return;
    for(const [i,pod] of this.model.userData.recovery.pods.entries())for(let j=0;j<3;j++){
      const origin=pod.getWorldPosition(new THREE.Vector3()),yaw=this.turretYaw,across=(i-.5)*2.4+(j-1)*.85;
      origin.x+=Math.cos(yaw)*(j-1)*.38;origin.z-=Math.sin(yaw)*(j-1)*.38;
      const end=new THREE.Vector3(target.x+Math.cos(yaw)*across,target.y,target.z-Math.sin(yaw)*across);
      const flight=.92+j*.12,gravity=24,velocity=end.sub(origin).divideScalar(flight);
      velocity.y+=gravity*flight*.5;
      this.weapons.fire(origin,velocity,{id:'rockets',damage:50,range:100,flight,gravity,radius:MISSILE_RADIUS,owner:'siege'});
    }
    this.missileCooldown=4;this.play('missileLaunch',.85);
  }

  fireSonic(){
    if(!this.active||this.boot>0||this.sonicCooldown>0)return;
    const origin=this.model.userData.recovery.sonic.getWorldPosition(new THREE.Vector3()),direction={x:Math.sin(this.turretYaw),z:Math.cos(this.turretYaw)};
    this.sonicShot={origin,direction,age:0};this.sonicCooldown=6;
    this.sonic(origin,direction);this.play('levelStorm',.6);
  }

  updateRecovery(dt,{world,player,camera}){
    if(this.state==='absent'||this.state==='destroyed')return;
    if(this.chip){
      this.chip.position.y=.65+Math.sin(this.clock*4)*.12;this.chip.rotation.y+=dt*1.8;
      if(player.y<1.2&&Math.hypot(player.x-this.chip.position.x,player.z-this.chip.position.z)<1.4){
        disposeModel(this.chip);this.chip=null;this.hasChip=true;this.play('pickup',1);
        this.notice('CHIP ΚΙΝΗΤΗΡΑ','Πήγαινε στο άρμα και πάτησε C.');this.change();
      }
    }
    this.clock+=dt;
    if(this.boot>0){
      this.boot=Math.max(0,this.boot-dt);
      if(this.boot<1e-7){this.boot=0;this.play('tankReady',1);}
      this.poseTank();
    }
    for(const key of ['shellCooldown','missileCooldown','sonicCooldown','dashTime','dashCooldown','jumpCooldown','shockTime','shockCooldown','foldImpact'])this[key]=Math.max(0,this[key]-dt);
    if(this.active&&this.held)this.fireShells();
    const {body}=this;
    if(this.state==='charging'||this.state==='fuse'){
      this.timer=Math.max(0,this.timer-dt);
      if(this.state==='charging')this.lightning.update(dt,body,camera);
      else if(this.airborne){
        this.vertical-=23*dt;
        const result=this.move(world,0,0,this.vertical*dt);
        if(result.grounded){this.airborne=false;this.vertical=0;}
      }
      this.poseTank();
      if(this.timer<=1e-7){
        this.timer=0;
        if(this.state==='charging'){
          this.state='ready';this.hp=SIEGE_HP;this.lightning.hide();this.poseTank();
          this.notice('ΠΟΛΙΟΡΚΗΤΗΣ ΕΤΟΙΜΟΣ','Πάτησε C για επιβίβαση.');this.play('start',1);
        }else{
          this.state='destroyed';this.model.visible=false;
          this.weapons.detonate(new THREE.Vector3(body.x,body.y+.9,body.z),145,8,null,'siege-wreck');
        }
        this.change();
      }
    }
    this.fuseGuide.visible=this.state==='fuse';
    if(this.fuseGuide.visible){this.fuseGuide.position.set(body.x,body.y,body.z);this.fuseGuide.material.opacity=.45+Math.sin(this.timer*10)*.23;}
    for(const line of [this.shellGuide,this.sonicGuide]){
      line.visible=this.active&&this.boot<=0&&!this.aiming;
      if(line.visible){
        this.model.userData.recovery.sonic.getWorldPosition(this.guideOrigin);
        line.position.set(this.guideOrigin.x,body.y,this.guideOrigin.z);line.rotation.y=this.turretYaw;
      }
    }
    this.sonicGuide.material.opacity=this.sonicCooldown>0?.20:.48;
    if(this.sonicShot){
      const shot=this.sonicShot;
      this.wave.update(shot.origin,shot.direction,shot.age,{range:SIEGE_SONIC_RANGE,power:1});
      shot.age+=dt;if(shot.age>=.64){this.sonicShot=null;this.wave.hide();}
    }
  }

  snapshot(){
    if(this.state==='absent')return null;
    return {state:this.state,chip:this.hasChip,drop:this.chip?{x:this.chip.position.x,z:this.chip.position.z}:null,
      x:this.body.x,z:this.body.z,y:this.body.y,yaw:this.yaw,turretYaw:this.turretYaw,mode:this.foldTarget===1?'tank':'walker',
      hp:this.hp,maxHp:SIEGE_HP,active:this.active,timer:this.timer,boot:this.boot,aim:this.target,
      airborne:this.airborne,speed:this.speed,yawRate:this.yawRate,sonicCooldown:this.sonicCooldown,missileCooldown:this.missileCooldown,shockCooldown:this.shockCooldown};
  }
}
