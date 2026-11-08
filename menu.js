import {createLevelPicker} from './level-picker.js?v=20261107-cities10';

// Date-based release identifier; increment the final component for each release.
export const GAME_VERSION = '2026.11.08.2';

// This controller owns only the title screen. Its preview has a small, isolated
// renderer so it never moves the battle hero, changes a save, or renders while
// the menu is hidden. The caller supplies the same model/progression functions
// as gameplay and advances update(dt) from its existing animation loop.
const limit = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const ease = t => t * t * (3 - 2 * t);

export function menuProgressSnapshot(character, {xpForNextLevel, getCharacterStats, maxLevel = 15}) {
  const hasSave = !!character;
  const level = limit(Math.floor(Number(character?.level) || 1), 1, maxLevel);
  const target = Math.max(0, Number(xpForNextLevel(level)) || 0);
  const isMax = level >= maxLevel;
  const xp = isMax ? 0 : limit(Math.floor(Number(character?.xp) || 0), 0, target);
  const ratio = isMax ? 1 : target > 0 ? xp / target : 0;
  const stats = hasSave ? getCharacterStats(character) : {weaponTier:0,weaponName:'ΚΟΥΤΣΟΥΡΟ'};
  return {hasSave,level,xp,target,ratio,percent:Math.round(ratio*100),isMax,
    weaponTier:stats.weaponTier,weaponName:stats.weaponName};
}

export function createForgeMenu({THREE, makeWarrior, xpForNextLevel, getCharacterStats,
  maxLevel = 15, onSound = () => {}, onSettings = () => {},
  document: doc = globalThis.document, window: win = globalThis.window || globalThis} = {}) {
  const $ = id => doc?.getElementById(id);
  const menu = $('menu');
  if (!menu) return {updateProgress(){},setReady(){},setVisible(){},update(){},closePanels(){return false;},dispose(){}};
  const version = $('gameVersion');
  if (version) version.textContent = `v${GAME_VERSION}`;
  const el = Object.fromEntries([
    'forgeLayout','menuProgress','menuLevelLabel','menuLevelValue','menuXpLabel','menuProgressPercent',
    'menuProgressTrack','menuProgressFill','menuProgressHero','menuHeroCanvas',
    'menuHeroFallback','menuProgressOrigin','menuNextLevel','menuResumeDetail',
    'startButton','resumeCharacterButton','testStartButton','chooseRoundButton',
    'menuSettingsButton','roundPicker','closeRoundPickerButton','startingLevel',
    'menuWorkshop','menuWoodProp','menuMetalProp','menuForgeSparks','menuWorkshopHint',
  ].map(id => [id,$(id)]));
  const cleanup = [];
  const listen = (target, type, fn, options) => {
    target?.addEventListener?.(type,fn,options);
    cleanup.push(() => target?.removeEventListener?.(type,fn,options));
  };
  const media = win.matchMedia?.('(prefers-reduced-motion: reduce)');
  let reduced = !!media?.matches, visible = !menu.hidden, ready = false, interacted = false;
  let snapshot = null, signature = '', visualRatio = 0, fromRatio = 0, progressTime = 0, progressDuration = 1;
  let time = 0, walkTime = 0, movement = 0, lastEquipment = -1, preview = null, previewAttempted = false, renderElapsed = 0;
  let strikeTime = 0, strikeCount = 0, strikePending = false, lastStrikeAt = -Infinity, lastFocusAt = -Infinity, disposed = false;
  const fire = (name, details) => {
    if (disposed) return;
    try { const result=onSound(name,details); result?.catch?.(() => {}); } catch { /* Audio failure must not disable navigation. */ }
  };
  const text = (node,value) => {if(node && node.textContent !== value) node.textContent = value;};
  const header = menu.querySelector?.('.forge-header');
  const footer = menu.querySelector?.('.forge-footer');
  const consolePanel = menu.querySelector?.('.forge-console');
  const energy = [...(menu.querySelectorAll?.('.forge-energy>i') || [])];
  const particles = [];
  if(el.menuForgeSparks) for(let i=0;i<17;i++){
    const p=doc.createElement('i');p.setAttribute('aria-hidden','true');el.menuForgeSparks.appendChild(p);particles.push(p);
  }

  const cityPicker=createLevelPicker({document:doc,window:win,onSound:fire,onSelect:()=>el.startingLevel?.onchange?.()});

  function refreshReady() {
    menu.dataset.ready = String(ready);
    if(el.startButton)el.startButton.disabled=!ready;
    if(el.testStartButton)el.testStartButton.disabled=!ready;
    if(el.resumeCharacterButton){el.resumeCharacterButton.hidden=false;el.resumeCharacterButton.disabled=!ready||!snapshot?.hasSave;}
  }
  function paintRatio() {
    const percent=(limit(visualRatio,0,1)*100).toFixed(4)+'%';
    if(el.menuProgressHero)el.menuProgressHero.style.left=percent;
    if(el.menuProgressFill)el.menuProgressFill.style.width=percent;
    if(el.menuProgressTrack)el.menuProgressTrack.dataset.visualProgress=String(visualRatio);
  }
  function updateProgress(character) {
    const next=menuProgressSnapshot(character,{xpForNextLevel,getCharacterStats,maxLevel});
    const key=[next.hasSave,next.level,next.xp,next.target,next.weaponTier].join(':');
    if(key===signature){refreshReady();return;}
    const changedLevel=snapshot&&snapshot.level!==next.level;
    signature=key;snapshot=next;
    // Changing XP never rebuilds the model or restarts a completed walk. A new
    // level starts a new interval; reopening the menu replays the saved journey.
    fromRatio=changedLevel?0:visualRatio;progressTime=0;progressDuration=.75+Math.abs(next.ratio-fromRatio)*1.4;
    if(reduced||!visible||!ready){visualRatio=next.ratio;fromRatio=visualRatio;progressTime=progressDuration;}
    text(el.menuLevelValue,String(next.level).padStart(2,'0'));
    text(el.menuXpLabel,next.isMax?'ΜΕΓΙΣΤΟ ΕΠΙΠΕΔΟ':next.xp+' / '+next.target+' XP');
    text(el.menuProgressPercent,next.percent+'%');
    text(el.menuProgressOrigin,next.hasSave?'Η ΔΙΑΔΡΟΜΗ ΣΟΥ':'Η ΔΙΑΔΡΟΜΗ ΞΕΚΙΝΑ ΕΔΩ');
    text(el.menuNextLevel,next.isMax?'LV '+String(maxLevel).padStart(2,'0')+' · ΚΟΡΥΦΗ':'ΕΠΟΜΕΝΟ · LV '+String(next.level+1).padStart(2,'0')+' →');
    text(el.menuResumeDetail,next.hasSave?'LEVEL '+String(next.level).padStart(2,'0')+' · '+next.percent+'%':'ΧΩΡΙΣ ΑΠΟΘΗΚΕΥΣΗ');
    el.menuProgressTrack?.setAttribute('aria-valuenow',String(next.percent));
    el.menuProgressTrack?.setAttribute('aria-valuetext',next.isMax?'Μέγιστο επίπεδο '+next.level:'Επίπεδο '+next.level+', '+next.xp+' από '+next.target+' εμπειρία, '+next.percent+' τοις εκατό προς το επόμενο επίπεδο');
    el.resumeCharacterButton?.setAttribute('aria-label',next.hasSave?'Συνέχεια με τον αποθηκευμένο χαρακτήρα, επίπεδο '+next.level:'Συνέχεια — δεν υπάρχει αποθηκευμένος χαρακτήρας');
    refreshReady();paintRatio();
    if(preview)applyEquipment();
  }

  function initPreview() {
    if(previewAttempted||disposed)return;previewAttempted=true;
    if(!THREE||!makeWarrior||!el.menuHeroCanvas)return;
    let renderer;
    try {
      renderer=new THREE.WebGLRenderer({canvas:el.menuHeroCanvas,alpha:true,antialias:true,powerPreference:'low-power',premultipliedAlpha:true});
      renderer.setPixelRatio(Math.min(1.75,win.devicePixelRatio||1));renderer.setSize(132,126,false);
      renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.2;
      renderer.setClearColor(0x000000,0);
      const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-1.77,1.77,1.69,-1.69,.1,30);
      camera.position.set(0,1.49,8);camera.lookAt(0,1.49,0);
      scene.add(new THREE.HemisphereLight(0xd8efe1,0x4a5a57,2.3));
      const key=new THREE.DirectionalLight(0xffdfad,3);key.position.set(-3,5,6);scene.add(key);
      const rim=new THREE.DirectionalLight(0x86dbd7,1.8);rim.position.set(3,2,-3);scene.add(rim);
      const hero=makeWarrior();scene.add(hero);hero.rotation.y=.35;
      preview={renderer,scene,camera,hero};
      applyEquipment();el.menuHeroCanvas.hidden=false;el.menuHeroFallback?.setAttribute('hidden','');
      el.menuProgressHero.dataset.renderer='webgl';
    } catch {
      renderer?.dispose?.();
      // Navigation and progress remain usable on a browser with no GPU. The
      // game reports its own renderer problem, independently of this preview.
      // SVGElement does not reflect the HTMLElement.hidden property. Remove
      // the actual attribute so the shared [hidden] CSS rule stops hiding it.
      preview=null;el.menuHeroCanvas.hidden=true;el.menuHeroFallback?.removeAttribute('hidden');
      el.menuProgressHero.dataset.renderer='fallback';
    }
  }
  function applyEquipment() {
    if(!preview||!snapshot||snapshot.weaponTier===lastEquipment)return;
    lastEquipment=snapshot.weaponTier;
    const u=preview.hero.userData;u.setEquipment?.(lastEquipment);u.setStance?.(lastEquipment<2?1:0);
    u.setReach?.(.68);u.setWeaponVisible?.(true);
    if(u.weaponRig&&u.weaponRest){u.weaponRig.rotation.set(u.weaponRest.x,u.weaponRest.y,u.weaponRest.z);u.weaponRig.position.copy(u.weaponRestPosition);}
    preview.legRests=[u.leftLeg,u.rightLeg].map(leg=>leg?{
      leg,position:leg.position.clone().copy(leg.userData.restPosition||leg.position),roll:leg.userData.restRoll??leg.rotation.z,yaw:leg.userData.restYaw??leg.rotation.y,
    }:null);
    u.updateGrip?.();
  }
  function updatePreview(dt,walking) {
    if(!preview)return;
    const {hero,renderer,scene,camera}=preview,u=hero.userData;
    movement+=((walking?1:0)-movement)*(1-Math.exp(-dt*15));
    if(reduced)movement=0;
    walkTime+=dt*(walking?10:2);const stride=Math.sin(walkTime)*movement;
    // Use anatomical resting positions from the gameplay model. Neither the
    // wider stance nor outward foot angles are lost in this miniature pose.
    for(const [index,item] of (preview.legRests||[]).entries())if(item){
      const sign=index? -1:1;item.leg.position.copy(item.position);item.leg.rotation.set(stride*.48*sign,item.yaw,item.roll);
      if(item.leg.userData.shin)item.leg.userData.shin.rotation.x=Math.max(0,-stride*sign)*.24;
    }
    hero.position.y=Math.abs(stride)*.045;
    const direction=walking?Math.PI*.5:(snapshot?.ratio>.84?-.65:.35),diff=Math.atan2(Math.sin(direction-hero.rotation.y),Math.cos(direction-hero.rotation.y));
    hero.rotation.y+=diff*(1-Math.exp(-dt*8));
    if(u.body){u.body.rotation.x=movement*.045;u.body.rotation.z=stride*.018;u.body.position.y=reduced?0:Math.sin(time*2.3)*.011;}
    if(u.cape){u.cape.rotation.x=.12+movement*.2+(reduced?0:Math.sin(time*3)*.025);}
    if(u.weaponRig&&u.weaponRest){
      const rest=u.weaponRest;u.weaponRig.rotation.set(rest.x+stride*.028,rest.y,rest.z-stride*.02);
      u.weaponRig.position.copy(u.weaponRestPosition);u.weaponRig.position.y+=Math.abs(stride)*.015;
    }
    u.updateGrip?.();renderElapsed+=dt;
    if(renderElapsed>=1/30){renderer.render(scene,camera);renderElapsed=0;}
  }

  function setReady(value) {
    const changed=ready!==!!value;ready=!!value;refreshReady();
    if(changed&&ready&&visible){fromRatio=0;visualRatio=reduced?(snapshot?.ratio||0):0;progressTime=0;progressDuration=.85+(snapshot?.ratio||0)*1.4;paintRatio();initPreview();}
    if(!ready){visualRatio=snapshot?.ratio||0;fromRatio=visualRatio;progressTime=progressDuration;paintRatio();}
    if(changed&&ready&&interacted)fire('menuReady');
  }
  function setVisible(value) {
    const changed=visible!==!!value;visible=!!value;
    if(!visible){closePanels(true);stopStrike();return;}
    if(changed){
      fromRatio=0;visualRatio=reduced?(snapshot?.ratio||0):0;progressTime=0;progressDuration=.85+(snapshot?.ratio||0)*1.4;paintRatio();
      menu.classList.remove('arriving');void menu.offsetWidth;menu.classList.add('arriving');
    }
    if(ready)initPreview();
  }
  function closePanels(silent=false) {
    if(!el.roundPicker||el.roundPicker.hidden)return false;
    el.roundPicker.hidden=true;el.chooseRoundButton?.setAttribute('aria-expanded','false');
    menu.dataset.dialog='';
    for(const node of [el.forgeLayout,header,footer])if(node)node.inert=false;
    if(!silent){fire('menuClose');el.chooseRoundButton?.focus?.();}
    return true;
  }
  function openRoundPicker() {
    if(!visible||!el.roundPicker)return;
    interacted=true;el.roundPicker.hidden=false;menu.dataset.dialog='round';el.chooseRoundButton?.setAttribute('aria-expanded','true');
    for(const node of [el.forgeLayout,header,footer])if(node)node.inert=true;
    fire('menuOpen');cityPicker.open();
  }
  function stopStrike() {
    strikeTime=0;strikePending=false;
    el.menuWorkshop?.classList.remove('strike-metal','strike-wood','strike-contact','strike-align');
    consolePanel?.classList.remove('workbench-hit');
  }
  function alignContact() {
    const ws=el.menuWorkshop;
    // Keep the existing SVG art/layout. Map its cut face and hammer corner to
    // one contact point, including the different portrait/landscape SVG sizes.
    const point=(node,x,y)=>{
      const m=node?.querySelector?.('.forge-weapon-art')?.getScreenCTM?.();
      return m?{x:m.a*x+m.c*y+m.e,y:m.b*x+m.d*y+m.f}:null;
    };
    ws.classList.add('strike-align');
    const wood=point(el.menuWoodProp,99,76),hammer=point(el.menuMetalProp,84,155);
    if(wood&&hammer){
      const r=ws.getBoundingClientRect();
      ws.style.setProperty('--hit-x',(wood.x-hammer.x).toFixed(2)+'px');
      ws.style.setProperty('--hit-y',(wood.y-hammer.y).toFixed(2)+'px');
      ws.style.setProperty('--impact-x',(wood.x-r.left).toFixed(2)+'px');
      ws.style.setProperty('--impact-y',(wood.y-r.top).toFixed(2)+'px');
    }
    ws.classList.remove('strike-align');
  }
  function strike() {
    const now=win.performance?.now?.()??Date.now();
    if(!visible||disposed||now-lastStrikeAt<250)return;
    stopStrike();lastStrikeAt=now;interacted=true;strikeTime=.85;strikePending=true;strikeCount++;
    const ws=el.menuWorkshop;if(!ws)return;
    ws.dataset.material='wood';ws.dataset.hits=String(strikeCount);
    const count=1+(strikeCount-1)%5;
    energy.forEach((e,i)=>e.classList.toggle('lit',i<count));
    for(let i=0;i<particles.length;i++){
      const p=particles[i],angle=(-Math.PI*.94)+(i/(particles.length-1))*Math.PI*.9;
      const reach=30+(i*19+strikeCount*23)%110;
      p.style.setProperty('--dx',(Math.cos(angle)*reach).toFixed(1)+'px');
      p.style.setProperty('--dy',(Math.sin(angle)*reach+15).toFixed(1)+'px');
      p.style.setProperty('--rotate',(i*61+strikeCount*29)%360+'deg');
      p.style.setProperty('--size',(2.5+i%3)+'px');
      p.style.setProperty('--life',(.4+(i%5)*.055)+'s');
    }
    alignContact();void ws.offsetWidth;ws.classList.add('strike-wood');
  }
  function update(dt) {
    if(disposed||!visible||doc.hidden)return;
    dt=limit(Number(dt)||0,0,.1);time+=dt;
    if(strikeTime>0){
      const elapsed=((win.performance?.now?.()??Date.now())-lastStrikeAt)/1000;
      if(strikePending&&elapsed>=.2){
        strikePending=false;el.menuWorkshop?.classList.add('strike-contact');consolePanel?.classList.add('workbench-hit');
        fire('menuWood',{variant:strikeCount%3,strength:strikeCount%5===0?1:.75});
      }
      strikeTime=Math.max(0,.85-elapsed);if(!strikeTime)stopStrike();
    }
    const previous=visualRatio;
    progressTime=Math.min(progressDuration,progressTime+dt);
    visualRatio=reduced?(snapshot?.ratio||0):fromRatio+((snapshot?.ratio||0)-fromRatio)*ease(progressTime/progressDuration);
    if(Math.abs(previous-visualRatio)>1e-6)paintRatio();
    if(ready&&!previewAttempted)initPreview();
    updatePreview(dt,Math.abs(visualRatio-previous)>1e-5);
  }

  listen(el.chooseRoundButton,'click',openRoundPicker);
  listen(el.closeRoundPickerButton,'click',()=>closePanels());
  listen(el.roundPicker,'click',e=>{if(e.target===el.roundPicker)closePanels();});
  listen(el.menuSettingsButton,'click',()=>{interacted=true;fire('menuOpen');onSettings();});
  listen(el.menuWoodProp,'click',strike);
  listen(el.menuMetalProp,'click',strike);
  listen(doc,'visibilitychange',()=>{if(doc.hidden)stopStrike();});
  listen(el.menuWorkshop,'pointermove',e=>{
    if(reduced||!visible||e.pointerType==='touch')return;
    const r=el.menuWorkshop.getBoundingClientRect();
    el.menuWorkshop.style.setProperty('--tilt-x',(-(e.clientY-r.top-r.height/2)/Math.max(1,r.height)*4).toFixed(2)+'deg');
    el.menuWorkshop.style.setProperty('--tilt-y',((e.clientX-r.left-r.width/2)/Math.max(1,r.width)*5).toFixed(2)+'deg');
  });
  listen(el.menuWorkshop,'pointerleave',()=>{el.menuWorkshop.style.setProperty('--tilt-x','0deg');el.menuWorkshop.style.setProperty('--tilt-y','0deg');});
  for(const button of [el.startButton,el.resumeCharacterButton,el.testStartButton]){
    listen(button,'click',()=>{if(!button.disabled){interacted=true;fire('menuPress');}});
  }
  for(const button of [...(menu.querySelectorAll?.('button')||[])]){
    const focus=()=>{const now=win.performance?.now?.()??Date.now();if(visible&&!button.disabled&&interacted&&now-lastFocusAt>70){lastFocusAt=now;fire('menuFocus');}};
    listen(button,'pointerenter',e=>{if(e.pointerType!=='touch')focus();});listen(button,'focus',focus);
    listen(button,'pointerdown',()=>{interacted=true;});
  }
  listen(menu,'keydown',e=>{
    if(!visible)return;
    if(e.code==='Escape'&&closePanels()){e.preventDefault();e.stopPropagation();return;}
    if(!el.roundPicker?.hidden&&e.code==='Tab'){
      const focusable=[...(el.roundPicker.querySelectorAll?.('button:not([disabled]):not([hidden]),[tabindex="0"]:not([hidden])')||[])];
      const first=focusable[0],last=focusable.at(-1);
      if(e.shiftKey&&doc.activeElement===first){e.preventDefault();last?.focus();}
      else if(!e.shiftKey&&doc.activeElement===last){e.preventDefault();first?.focus();}
    }
    // Let native buttons/selects own Enter and Space; the global quick-start
    // shortcut must not turn a settings or level-picker activation into a run.
    if(['BUTTON','SELECT','INPUT'].includes(e.target?.tagName))e.stopPropagation();
  });
  listen(media,'change',e=>{reduced=!!e.matches;if(reduced){visualRatio=snapshot?.ratio||0;fromRatio=visualRatio;progressTime=progressDuration;paintRatio();}});
  updateProgress(null);initPreview();menu.classList.add('arriving');
  return {
    updateProgress,setReady,setVisible,update,closePanels,
    get progress(){return snapshot?{...snapshot,visualRatio}:null;},
    get panelOpen(){return !!el.roundPicker&&!el.roundPicker.hidden;},
    dispose(){
      if(disposed)return;disposed=true;for(const remove of cleanup)remove();closePanels(true);
      cityPicker.dispose();preview?.renderer.dispose?.();preview?.renderer.forceContextLoss?.();preview=null;
      for(const particle of particles)particle.remove?.();
    },
  };
}
