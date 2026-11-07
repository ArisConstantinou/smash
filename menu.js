import * as T from './vendor/three.module.js';
import {makeWarrior} from './models.js?v=20261107-menu9';
import {restoreCharacterProgression,createCharacterProgression,getCharacterStats,xpForNextLevel,MAX_CHARACTER_LEVEL} from './character-progression.js?v=20261107-combat7';

export function journeyInfo(saved){
  const earned=restoreCharacterProgression(saved?.character),character=earned||createCharacterProgression();
  const target=xpForNextLevel(character.level),maxed=character.level>=MAX_CHARACTER_LEVEL;
  return {character,stats:getCharacterStats(character),hasSave:!!earned,level:character.level,xp:character.xp,target,
    fraction:maxed?1:Math.max(0,Math.min(1,character.xp/Math.max(1,target))),maxed,
    round:Math.max(1,Math.min(9999,Math.floor(Number(saved?.run?.round)||1)))};
}

export class MenuPresentation{
  constructor({document:doc=globalThis.document,audio,rendererFactory,reduceMotion=false}={}){
    this.doc=doc;this.audio=audio;this.rendererFactory=rendererFactory;this.reduceMotion=reduceMotion;
    this.active=false;this.time=0;this.position=0;this.target=0;this.drawClock=0;this.charge=0;this.owner=null;this.strike=0;this.dents=0;this.info=journeyInfo(null);this.get=id=>doc.getElementById(id);
    const toy=this.get('forgeToy');
    const cancel=()=>{this.owner=null;this.charge=0;toy?.classList.remove('is-charging');};
    toy?.addEventListener('pointerdown',event=>{
      if(!this.active||this.owner!==null||event.button!==0||this.strike>0)return;
      event.preventDefault();this.audio?.unlock();this.owner=event.pointerId;this.charge=0;
      toy.setPointerCapture?.(event.pointerId);toy.classList.add('is-charging');
    });
    toy?.addEventListener('pointerup',event=>{if(event.pointerId!==this.owner)return;const force=this.charge;cancel();this.hit(force);});
    for(const event of ['pointercancel','lostpointercapture'])toy?.addEventListener(event,cancel);
    if(toy)toy.onclick=event=>{if(!event?.detail&&this.owner===null&&this.strike<=0)this.hit(.2);};
    for(const button of doc.querySelectorAll('.forge-button'))button.addEventListener('pointerenter',()=>{
      if(this.active&&!button.disabled)this.audio?.play('menuHover');
    });
  }
  setActive(active){
    if(active&&!this.active){this.position=0;this.drawClock=1;}
    this.active=active;
    if(!active){this.owner=null;this.strike=0;this.charge=0;this.get('forgeToy')?.classList.remove('is-charging','is-striking');}
  }
  refresh(saved,ready=true,highest=1){
    const info=this.info=journeyInfo(saved);this.target=info.fraction;
    const text=(id,value)=>{if(this.get(id))this.get(id).textContent=value;};
    text('menuLevel','ΕΠΙΠΕΔΟ '+info.level);text('menuProgressText',info.maxed?'ΜΕΓΙΣΤΟ ΕΠΙΠΕΔΟ':info.xp+' / '+info.target+' XP · '+Math.floor(info.fraction*100)+'%');
    text('menuFromLevel','LV '+info.level);text('menuToLevel',info.maxed?'MAX':'LV '+(info.level+1));
    const progress=this.get('journeyViewport');progress?.setAttribute('aria-valuenow',String(Math.round(info.fraction*100)));progress?.setAttribute('aria-valuetext',info.maxed?'Μέγιστο επίπεδο':'Επίπεδο '+info.level+', '+info.xp+' από '+info.target+' εμπειρία');
    this.get('menuProgressFill')?.style.setProperty('width',info.fraction*100+'%');
    text('resumeCaption',info.hasSave?'Γύρος '+info.round+' · LV '+info.level:'Δεν υπάρχει αποθήκευση');
    text('roundCaption',highest+' '+(highest===1?'γύρος διαθέσιμος':'γύροι διαθέσιμοι'));
    text('menuSaveStatus',info.hasSave?'Η εξέλιξή σου είναι αποθηκευμένη στη συσκευή':'Η πρόοδος αποθηκεύεται σε αυτή τη συσκευή');
    const resume=this.get('resumeCharacterButton');if(resume){resume.hidden=false;resume.disabled=!ready||!info.hasSave;}
    if(this.hero)this.configureHero();
  }
  configureHero(){
    const u=this.hero.userData;u.setEquipment(this.info.stats.weaponTier);u.setWeaponVisible(true);u.setStance(this.info.stats.hasShield?0:1);
    u.hammerHead.scale.setScalar(this.info.stats.size);
    u.weaponRig.position.copy(u.weaponRestPosition);u.weaponRig.rotation.set(u.weaponRest.x,u.weaponRest.y,u.weaponRest.z);u.updateGrip();
  }
  ensureRenderer(){
    if(this.renderer||this.failed)return;
    try{
      this.renderer=this.rendererFactory({canvas:this.get('journeyCanvas'),alpha:true,antialias:true,powerPreference:'low-power'});
      this.renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio||1,1.5));this.renderer.outputColorSpace=T.SRGBColorSpace;
      this.scene=new T.Scene();this.camera=new T.OrthographicCamera(-6,6,1.8,-1.5,.1,40);this.camera.position.set(0,1.5,12);this.camera.lookAt(0,1.5,0);
      this.scene.add(new T.HemisphereLight(0xd8e9df,0x444238,2.5));
      const sun=new T.DirectionalLight(0xffd397,3.4);sun.position.set(-3,5,7);this.scene.add(sun);
      const rim=new T.DirectionalLight(0x90cfdf,2);rim.position.set(4,3,-5);this.scene.add(rim);
      this.hero=makeWarrior();this.hero.rotation.y=Math.PI*.40;this.scene.add(this.hero);this.configureHero();
    }catch(error){this.failed=true;console.warn('Menu character preview unavailable',error);}
  }
  hit(strength=0){
    if(!this.active||this.strike>0)return;
    this.audio?.unlock();this.strike=.6;this.strikePower=Math.min(1,strength/.8);this.impactPlayed=false;
    const toy=this.get('forgeToy');toy?.classList.add('is-striking');
    this.dents=this.dents%3+1;if(toy)toy.dataset.dents=String(this.dents);
    this.get('forgeToyStatus').textContent=this.strikePower>.6?'ΑΥΤΟ ΕΙΝΑΙ ΧΤΥΠΗΜΑ!':'ΞΥΛΟ ΚΑΙ ΣΙΔΕΡΟ';
    this.audio?.play('menuSwing',this.strikePower);
  }
  update(dt){
    if(!this.active)return;
    this.time+=dt;
    if(this.owner!==null)this.charge=Math.min(.8,this.charge+dt);
    this.get('forgeChargeFill')?.style.setProperty('width',this.charge/.8*100+'%');
    if(this.strike>0){
      this.strike=Math.max(0,this.strike-dt);
      if(this.strike<=.46&&!this.impactPlayed){this.impactPlayed=true;this.audio?.play('menuForge',this.strikePower);}
      if(this.strike===0)this.get('forgeToy')?.classList.remove('is-striking');
    }
    this.ensureRenderer();if(!this.renderer||!this.hero)return;
    const rect=this.get('journeyCanvas').getBoundingClientRect();if(rect.width<2||rect.height<2)return;
    if(this.width!==rect.width||this.height!==rect.height){this.width=rect.width;this.height=rect.height;this.renderer.setSize(rect.width,rect.height,false);const half=1.65*rect.width/rect.height;this.camera.left=-half;this.camera.right=half;this.camera.updateProjectionMatrix();}
    const before=this.position,delta=this.target-this.position;
    this.position=this.reduceMotion?this.target:this.position+Math.sign(delta)*Math.min(Math.abs(delta),dt*.38);
    const walking=Math.abs(this.position-before)>.00001,walk=walking?Math.sin(this.time*9):0,u=this.hero.userData;
    this.hero.position.x=this.camera.left+.85+(this.camera.right-this.camera.left-1.7)*this.position;
    this.hero.position.y=this.reduceMotion?0:Math.abs(walk)*.055;
    this.hero.rotation.y=walking?Math.PI*.40:Math.PI*.18;
    u.body.rotation.x=walking?.06:0;u.body.position.y=this.reduceMotion?0:Math.sin(this.time*2)*.012;
    u.leftLeg.rotation.set(walk*.55,0,-.045);u.rightLeg.rotation.set(-walk*.55,0,.045);
    u.weaponRig.rotation.x=u.weaponRest.x+(this.reduceMotion?0:Math.sin(this.time*3)*.015);u.updateGrip();
    this.drawClock+=dt;if(this.drawClock>=1/30){this.drawClock=0;this.renderer.render(this.scene,this.camera);}
  }
}
