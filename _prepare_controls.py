from pathlib import Path
import re
ROOT=Path.cwd()
def edit(path,old,new):
 p=ROOT/path;s=p.read_text();assert s.count(old)==1,(path,s.count(old),old[:90]);p.write_text(s.replace(old,new))
def between(path,start,end,new):
 p=ROOT/path;s=p.read_text();a=s.index(start);b=s.index(end,a);p.write_text(s[:a]+new+s[b:])
edit('occlusion.js','  const length=Math.hypot(towardsCamera.x,towardsCamera.y,towardsCamera.z);','''  const base=object.baseY??object.y??0;
  if (Math.abs(point.x-object.x)<=object.w/2+.025 && Math.abs(point.z-object.z)<=object.d/2+.025 && point.y>=base-.025 && point.y<=base+object.h+.025) return false;
  const length=Math.hypot(towardsCamera.x,towardsCamera.y,towardsCamera.z);''')
edit('occlusion.js','firstHammerHit(origin,point,[object],.12)','firstHammerHit(origin,point,[object],.025)')
edit('game.js','./occlusion.js?v=20261106-feel1','./occlusion.js?v=20261106-controls3')
between('game.js','    const points=[{x:player.x,y:player.y+.25','    const candidates=world.objects.filter','''    const heroPoints=[{x:player.x,y:player.y+.25,z:player.z},{x:player.x,y:player.y+1.1,z:player.z},{x:player.x,y:player.y+2.05,z:player.z}];
    const points=[...heroPoints];
    // Never cast at an imaginary ring of empty space: only actors and the
    // actual weapon can justify fading a building. Points inside a struck
    // building are rejected by occludesBattlePoint.
    for(const e of enemies)if(!e.dead&&Math.hypot(e.x-player.x,e.z-player.z)<4.5)points.push({x:e.x,y:e.y+Math.min(1.25,e.height*.6),z:e.z});
    if(boss&&!boss.dead&&Math.hypot(boss.x-player.x,boss.z-player.z)<5.5)points.push({x:boss.x,y:boss.y+2,z:boss.z});
    if(hero.userData.weaponHeld){hero.updateMatrixWorld(true);const p=hero.userData.hammerHead.getWorldPosition(new THREE.Vector3());points.push({x:p.x,y:p.y,z:p.z});}
    if(throwFlight?.grounded&&Math.hypot(throwFlight.x-player.x,throwFlight.z-player.z)<4)points.push({x:throwFlight.x,y:throwFlight.groundY+.3,z:throwFlight.z});
''')
edit('game.js','const SPIN_HOLD_SECONDS=.18,SPIN_TURN_SECONDS=.62,ATTACK_BUFFER_SECONDS=.30','const SPIN_HOLD_SECONDS=.22,SPIN_TURN_SECONDS=.62,ATTACK_BUFFER_SECONDS=.45')
between('game.js','function pressAttack(){','function pressGuard(){','''function pressAttack(){
  if(phase!=='playing')return;audio.unlock();
  if(touchThrowAim||touchThrowQueued)cancelTouchThrow();
  if(leap){armAirSmash();updateAttackFeedback();return;}
  if(throwFlight||throwWindup||Math.abs(stance-stanceTarget)>.005||guardHeld||chargeHeld)return;
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
  chargeHeld=false;chargeStarted=false;charge=0;holdElapsed=0;
  if(spin)stopSpin();
  if(phase!=='playing')cancelAttack();
  // An already started strike finishes naturally. Releasing never creates a
  // second strike; an explicitly tapped buffered strike remains valid.
  updateAttackFeedback();
}
function cancelAttack(){stopSpin();chargeHeld=false;chargeStarted=false;charge=0;attackBuffer=null;holdElapsed=0;if(touchThrowAim||touchThrowQueued)cancelTouchThrow();updateAttackFeedback();}
''')
edit('game.js',"  for(const id of ['attackButton','chargeButton','guardButton'])","  for(const id of ['attackButton','guardButton'])")
edit('game.js',"  bindAction('attackButton',quickAttack);\n  bindAction('chargeButton',pressSpin,releaseAttack,cancelAttack);","  bindAction('attackButton',pressAttack,releaseAttack,cancelAttack);")
edit('game.js',"    if(!spin&&holdElapsed>=SPIN_HOLD_SECONDS&&!swing&&attackCooldown<=0&&!weaponBusy()&&!guardHeld)startSpin();",'''    if(!spin&&holdElapsed>=SPIN_HOLD_SECONDS&&!weaponBusy()&&!guardHeld){
      let previousHits=null;
      if(swing&&swing.time/swing.duration>=SWING_CONTACT_END){previousHits=swing.hits;swing=null;attackCooldown=0;}
      if(!swing&&attackCooldown<=0&&startSpin()&&previousHits)for(const target of previousHits)spin.hitTimes.set(target,0);
    }''')
edit('game.js',"  if(attackBuffer&&!chargeHeld&&!spin&&!swing&&attackCooldown<=0&&!weaponBusy()&&!guardHeld){",'''  if(attackBuffer&&!chargeHeld&&!spin&&swing&&swing.time/swing.duration>=.82&&!weaponBusy()&&!guardHeld){swing=null;attackCooldown=0;}
  if(attackBuffer&&!chargeHeld&&!spin&&!swing&&attackCooldown<=0&&!weaponBusy()&&!guardHeld){''')
between('game.js',"  const attackButton=$('attackButton');\n  attackButton?.classList.toggle('active'","  $('guardButton')?.classList.toggle","  updateAttackFeedback();\n")
feedback='''function updateAttackFeedback(){
  const button=$('attackButton');if(!button)return;
  const holding=chargeHeld||!!spin,air=!!leap;
  button.classList.toggle('active',!!swing||holding||!!leap?.slam||!!leap?.strike);
  button.classList.toggle('air-smash-ready',air&&!leap.slam&&characterStats.canAirSmash);
  button.classList.toggle('air-smash-armed',!!leap?.slam||!!leap?.strike);
  button.classList.toggle('spin-active',!!spin);button.classList.toggle('spin-pending',chargeHeld&&!spin);
  button.dataset.action=air?'air':holding?'spin':'attack';
  $('attackIcon')?.setAttribute('href',air?'#a-slam':holding?'#a-spin':'#a-swing');
  $('attackTouchIcon')?.setAttribute('href',air?'#t-slam':holding?'#t-spin':'#t-attack');
  $('attackName').textContent=air?(leap.slam||leap.strike?'ΕΤΟΙΜΟ':characterStats.canAirSmash?'ΣΥΝΤΡΙΒΗ':'ΚΑΤΕΒΑΣΜΑ'):holding?'360°':characterStats.weaponTier<2?'ΧΤΥΠΗΜΑ':'ΣΦΥΡΙΑ';
  $('attackValue').textContent=throwFlight?'ΜΑΖΕΨΕ ΤΟ ΟΠΛΟ':air?'ΠΑΤΑ ΣΤΟΝ ΑΕΡΑ':spin?'ΑΦΗΣΕ ΓΙΑ ΣΤΟΠ':chargeHeld?'ΚΡΑΤΑ ΓΙΑ ΣΥΝΕΧΕΙΑ':'ΠΑΤΑ · ΚΡΑΤΑ ΓΙΑ 360°';
  const label=air?(leap.slam||leap.strike?'Το χτύπημα είναι έτοιμο για την προσγείωση.':characterStats.canAirSmash?'Πάτησε τώρα, στον αέρα, για μεγάλη συντριβή.':'Πάτησε στον αέρα για μικρό κατέβασμα του ξύλου.'):spin?'Συνεχής περιστροφή 360°. Άφησε για να σταματήσεις.':'Χτύπημα με '+characterStats.weaponName.toLowerCase()+'. Κράτα για συνεχή περιστροφή 360°.';
  button.setAttribute('aria-label',label);button.setAttribute('title',label);
}
'''
edit('game.js','function drawMinimap(){',feedback+'function drawMinimap(){')
edit('game.js','if(!leap||leap.slam||throwFlight)return;','if(!leap||leap.slam||leap.strike||throwFlight)return;')
edit('game.js','const radius=slam?5.2+stats.quake*.7:characterStats.canAirSmash?2.35:1.2;','const radius=slam?5.2+stats.quake*.7:characterStats.canAirSmash?2.35:strike?1.65:1.2;')
edit('game.js','characterStats.canAirSmash?.9:strike?.9:0','characterStats.canAirSmash?.9:strike?.62:0')
edit('game.js','landingMarker.scale.setScalar(leap?.slam?5.2+stats.quake*.7:2.35)','landingMarker.scale.setScalar(leap?.slam?5.2+stats.quake*.7:characterStats.canAirSmash?2.35:leap?.strike?1.65:.9)')
hud='''function buildingHudAnchor(o){
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
'''
edit('game.js','function drawAim(){',hud+'function drawAim(){')
edit('game.js',"    const anchor=o.h>6?nearestPoint(player.x,player.z,o):o;\n    drawHP(anchor.x,Math.min(o.h,player.y+4)+.4,anchor.z,o.hp,o.maxHp,'#ffd08b',Math.min(1,o.hurtTimer||1),objectNames[o.type]||'ΑΝΤΙΚΕΙΜΕΝΟ');","    if(o.isBuilding)drawBuildingHP(o,objectNames[o.type]||'ΚΤΙΡΙΟ',Math.min(1,o.hurtTimer||1));\n    else drawHP(o.x,Math.min(o.h,player.y+4)+.4,o.z,o.hp,o.maxHp,'#ffd08b',Math.min(1,o.hurtTimer||1),objectNames[o.type]||'ΑΝΤΙΚΕΙΜΕΝΟ');")
p=ROOT/'index.html';s=p.read_text();s,n=re.subn(r'          <button id="chargeButton".*?</button>\n','',s,flags=re.S);assert n==1
symbols='''
      <symbol id="t-attack" viewBox="0 0 24 24"><path d="m4 5 4-3 10 10-3 4L4 5Zm9 8-9 9M3 12a10 10 0 0 0 9 9M16 3h5v5"/></symbol>
      <symbol id="t-spin" viewBox="0 0 24 24"><circle cx="12" cy="7" r="2"/><path d="M12 9v7m-5-4h10m-5 4-3 5m3-5 3 5M3 9a9 9 0 0 1 16-3l2 3m0-5v5h-5M21 15a9 9 0 0 1-16 3l-2-3m0 5v-5h5"/></symbol>
      <symbol id="t-guard" viewBox="0 0 24 24"><path d="m4 4 8-2 8 2v8c0 5-8 10-8 10S4 17 4 12ZM12 6v11"/></symbol>
      <symbol id="t-jump" viewBox="0 0 24 24"><path d="M3 21h18M12 17V3m-6 6 6-6 6 6M6 16l-2 2m14-2 2 2"/></symbol>
      <symbol id="t-slam" viewBox="0 0 24 24"><path d="M12 2v13m-5-5 5 5 5-5M3 21l4-5m14 5-4-5M2 12l3 2m17-2-3 2M8 22h8"/></symbol>
      <symbol id="t-throw" viewBox="0 0 24 24"><path d="M3 6h5m-6 5h4m-3 5h5m3-6 8-8 3 3-8 8Zm2 2-6 8m10-4h5m-3-3 3 3-3 3"/></symbol>
      <symbol id="t-stance" viewBox="0 0 24 24"><path d="m5 8 3-4h8l3 4M4 12l4-3 3 8m9-5-4-3-3 8M3 21h6m6 0h6M10 3h4v5h-4z"/></symbol>
      <symbol id="t-dodge" viewBox="0 0 24 24"><path d="M2 7h7M1 12h6M2 17h7m3-12 8 7-8 7M17 5l6 7-6 7"/></symbol>
'''
s=s.replace('    </defs>',symbols+'    </defs>',1)
for bid,kind in [('attackButton','attack'),('guardButton','guard'),('leapButton','jump'),('throwButton','throw'),('stanceButton','stance'),('dashButton','dodge')]:
 pattern=r'(<button id="'+bid+r'".*?)(</button>)';m=re.search(pattern,s,flags=re.S);assert m
 block=m[1];iconid=' id="attackTouchIcon"' if bid=='attackButton' else ''
 icon='<svg class="action-icon" viewBox="0 0 24 24" aria-hidden="true"><use'+iconid+' href="#t-'+kind+'"/></svg>'
 block=block.replace('<span id="attackName"',icon+'<span id="attackName"',1) if bid=='attackButton' else block.replace('<span class="action-name">',icon+'<span class="action-name">',1)
 s=s[:m.start()]+block+m[2]+s[m.end():]
s=s.replace('<small id="attackValue" class="action-status">ΓΡΗΓΟΡΟ ΧΤΥΠΗΜΑ</small>','<small id="attackValue" class="action-status">ΠΑΤΑ · ΚΡΑΤΑ ΓΙΑ 360°</small>')
s=s.replace('data-touch-label="Πάτησε για γρήγορη σφυριά. Στον αέρα, ετοίμασε μεγάλη συντριβή."','data-touch-label="Πάτησε για χτύπημα. Κράτα για συνεχή περιστροφή. Πάτησε στον αέρα για κατέβασμα."')
s=s.replace('</head>','  <link rel="stylesheet" href="./controls.css?v=20261106-controls3">\n</head>',1)
s=re.sub(r'game\.js\?v=[^"\s]+','game.js?v=20261106-controls3',s);p.write_text(s)
(ROOT/'controls.css').write_text('''/* Readable desktop illustrations; dedicated high-contrast touch pictograms. */
#combatDock .action-icon { display:none; fill:none; stroke:currentColor; stroke-width:1.8; stroke-linecap:round; stroke-linejoin:round; pointer-events:none; }
body[data-touch-controls="false"] { --combat-dock-space:200px; }
body[data-touch-controls="false"] #combatDock { width:min(1180px,calc(100vw - 32px)); padding:9px 11px; }
body[data-touch-controls="false"] #combatDock .movement-pad { width:120px; flex-basis:120px; }
body[data-touch-controls="false"] #combatDock .pictured-keys { grid-template-columns:repeat(3,34px); grid-template-rows:repeat(2,35px); gap:3px; }
body[data-touch-controls="false"] #combatDock .move-key { width:34px; height:35px; }
body[data-touch-controls="false"] #combatDock .movement-caption { font:700 12px/1.3 Arial,sans-serif; }
body[data-touch-controls="false"] #combatDock .dock-actions { grid-template-columns:repeat(6,minmax(0,1fr)); gap:7px; }
body[data-touch-controls="false"] #combatDock .action-tile { height:148px; padding:24px 4px 6px; }
body[data-touch-controls="false"] #combatDock .action-picture { display:block; width:96px; height:80px; margin:0 0 3px; }
body[data-touch-controls="false"] #combatDock .action-key { top:5px; right:6px; height:24px; min-width:30px; padding:2px 6px; font:800 13px/1 Arial,sans-serif; }
body[data-touch-controls="false"] #combatDock .action-key svg { width:15px; height:19px; }
body[data-touch-controls="false"] #combatDock .action-name { color:#fff3d4; font:800 13px/17px Arial,sans-serif; letter-spacing:0; }
body[data-touch-controls="false"] #combatDock .action-status { color:#bddbcd; font:500 10px/14px Arial,sans-serif; min-height:14px; }
body[data-touch-controls="false"] #combatDock .dock-status { min-height:25px; font:600 11px/1.3 Arial,sans-serif; }
body[data-touch-controls="false"] #combatDock .dock-stance strong,body[data-touch-controls="false"] #combatDock #chargeText { font:700 11px/1.3 Arial,sans-serif; }
body[data-touch-controls="false"] #combatDock .dock-sound { font:700 10px/1 Arial,sans-serif; }
#combatDock #attackButton.spin-pending { border-color:#f5d58f; }
#combatDock #attackButton.spin-active { border-color:#b8efda; background:linear-gradient(145deg,#38645a,#203b40); box-shadow:inset 0 0 15px #93dfbd22; }
body[data-touch-controls="true"] #combatDock .action-picture { display:none!important; }
body[data-touch-controls="true"] #combatDock .action-icon { display:block; width:30px; height:30px; margin:0 0 5px; color:#ffe4aa; }
body[data-touch-controls="true"] #combatDock .dock-actions { grid-template-columns:repeat(3,minmax(0,1fr)); grid-template-rows:repeat(2,var(--mobile-tile-height)); gap:5px; }
body[data-touch-controls="true"] #combatDock #attackButton { grid-column:3; grid-row:1/3; height:100%; padding:6px 2px; }
body[data-touch-controls="true"] #combatDock #attackButton .action-icon { width:36px; height:36px; margin-bottom:9px; }
body[data-touch-controls="true"] #combatDock #attackButton::after { content:"ΚΡΑΤΑ 360°"; display:block; margin-top:7px; color:#cfe1cc; font:700 8px/1.3 Arial,sans-serif; }
body[data-touch-controls="true"] #combatDock #attackButton.spin-active::after { content:"ΑΦΗΣΕ: ΣΤΟΠ"; }
body[data-touch-controls="true"] #combatDock #attackButton[data-action="air"]::after { content:"ΠΑΤΑ ΤΩΡΑ"; }
body[data-touch-controls="true"] #combatDock #guardButton { grid-column:1; grid-row:1; }
body[data-touch-controls="true"] #combatDock #leapButton { grid-column:2; grid-row:1; }
body[data-touch-controls="true"] #combatDock #throwButton { grid-column:1; grid-row:2; }
body[data-touch-controls="true"] #combatDock #dashButton { grid-column:2; grid-row:2; }
body[data-touch-controls="true"] #combatDock .action-name { font:800 10px/13px Arial,sans-serif; }
@media (max-width:1100px) {
  body[data-touch-controls="false"] #combatDock .movement-pad { width:108px; flex-basis:108px; }
  body[data-touch-controls="false"] #combatDock .action-tile { height:136px; }
  body[data-touch-controls="false"] #combatDock .action-picture { width:80px; height:67px; }
  body[data-touch-controls="false"] #combatDock .action-name { font-size:11px; }
  body[data-touch-controls="false"] #combatDock .action-status { font-size:9px; }
}
@media (min-width:900px) and (min-height:600px) {
  body[data-touch-controls="true"] #combatDock { width:270px; --mobile-tile-height:78px; }
  body[data-touch-controls="true"] #combatDock .action-icon { width:34px; height:34px; }
  body[data-touch-controls="true"] #combatDock .action-name { font-size:12px; }
}
@media (max-width:359px), (max-height:450px) {
  body[data-touch-controls="true"] #combatDock .action-icon { width:25px; height:25px; margin-bottom:3px; }
  body[data-touch-controls="true"] #combatDock .action-name { font-size:9px; }
}
''')
