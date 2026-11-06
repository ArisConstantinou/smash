from pathlib import Path
p=Path('tests/game.integration.mjs');s=p.read_text()
s=s.replace("'chargeButton'", "'attackButton'")
s=s.replace("['attackButton', 'attackButton',", "['attackButton',")
s=s.replace('recordCombatContact, updateComboDisplay, updateBattleVisibility, startGame,', 'buildingHudAnchor, recordCombatContact, updateComboDisplay, updateBattleVisibility, startGame,')
def block(name, fn):
 global s
 start=s.index("test('"+name+"'")
 end=s.find("\ntest('",start+6)
 if end<0:end=len(s)
 s=s[:start]+fn(s[start:end])+s[end:]
block('holding the left mouse button during recovery transitions into a continuous spin and stops on release',lambda b:b.replace('playerSteps(.06);','playerSteps(.10);'))
block('the illustrated attack and held spin buttons execute their pictured actions', lambda b:b.replace('the illustrated attack and held spin buttons execute their pictured actions','one attack control starts on press and holding flows into the pictured continuous spin').replace("pointerEvent('attackButton', 'pointerdown');\n  assert.ok(api.spin", "pointerEvent('attackButton', 'pointerdown');\n  assert.ok(api.swing, 'Pointer down commits a visible strike before release');\n  playerSteps(.4);\n  assert.ok(api.spin").replace('The pictured spin button starts its action immediately','Holding the same illustrated attack button continues into a spin'))
block('mobile air smash requires a fresh attack during the jump and its one button follows the landing state',lambda b:b.replace('playerSteps(.25);','playerSteps(.4);').replace("    pointerEvent('attackButton', 'pointerdown', { pointerId: 204 }); playerSteps(.12);\n    pointerEvent('attackButton', 'pointerup', { pointerId: 204 });\n    assert.equal(api.leap.slam, false, 'The spin tile is not an airborne smash shortcut');", "    playerSteps(.12);\n    assert.equal(api.leap.slam, false, 'A held input inherited from before takeoff must not arm the jump');"))
block('joystick movement and held spin or guard have independent owning fingers',lambda b:b.replace("      pointerEvent(id, 'pointerdown', { pointerId: 202 }); playerSteps(.3);\n      assert.ok(api[state]); close(Math.hypot(api.player.x, api.player.z), api.stats.speed * speed * .3, .003);", "      pointerEvent(id, 'pointerdown', { pointerId: 202 }); playerSteps(.4);\n      assert.ok(api[state]);\n      const origin={x:api.player.x,z:api.player.z};playerSteps(.3);\n      close(Math.hypot(api.player.x-origin.x, api.player.z-origin.z), api.stats.speed * speed * .3, .003);"))
for name in ['touch cancellation, lost capture and releases outside the controls stop only their owned input','pause, blur and a changed mobile viewport clear gesture ownership without replay on resume','WASD remains directional and continuous while the warrior spins independently']:
 block(name,lambda b:b.replace("'pointerdown', { pointerId: 202 }); playerSteps(.05)","'pointerdown', { pointerId: 202 }); playerSteps(.4)").replace("'pointerdown', { pointerId: 202 }); playerSteps(.15)","'pointerdown', { pointerId: 202 }); playerSteps(.4)").replace("'pointerdown'); playerSteps(.15)","'pointerdown'); playerSteps(.4)"))
block('mobile throws in vertical and diagonal screen directions hit once, return, and restore a reusable hammer',lambda b:b.replace('playerSteps(.25);','playerSteps(.4);'))
for name in ['holding the left mouse button continuously rotates the whole warrior and extended hammer through more than two full turns','a sustained spin hits real targets on every side no more than once per revolution']:
 block(name,lambda b:b.replace('playerSteps(.24);','playerSteps(.4);'))
block('two-handed spin keeps both hands attached and carries the stance damage bonus',lambda b:b.replace("  const enemy = stationaryEnemy('brute', 0, 2.1); enemy.hp = enemy.maxHp = 1000;\n  pointerEvent('attackButton', 'pointerdown');", "  pointerEvent('attackButton', 'pointerdown');playerSteps(.45);assert.ok(api.spin);\n  const enemy = stationaryEnemy('brute', 0, 2.1); enemy.hp = enemy.maxHp = 1000;"))
s+='''

test('LMB starts its stroke and swing audio on DOWN; release never duplicates the strike',()=>{
  arena(1,{test:false});api.poseHero(1);
  const enemy=stationaryEnemy('brute',0,2.2),hp=enemy.hp;
  const before=audioEvents.filter(e=>e.name==='swing').length;
  mouseAttack(true);
  const strike=api.swing;assert.ok(strike);assert.equal(strike.time,0);
  assert.equal(audioEvents.filter(e=>e.name==='swing').length,before+1);
  assert.equal(enemy.hp,hp,'Damage still waits for real physical contact');
  assert.equal(elements.get('attackIcon').getAttribute('href'),'#a-spin');
  assert.equal(elements.get('attackTouchIcon').getAttribute('href'),'#t-spin');
  playerSteps(.05);mouseAttack(false);
  assert.equal(api.swing,strike);assert.equal(elements.get('attackIcon').getAttribute('href'),'#a-swing');
  playerSteps(.6);assert.equal(enemy.hp,hp-strike.damage);
  assert.equal(audioEvents.filter(e=>e.name==='swing').length,before+1);
});

test('one held LMB keeps attacking without repeated clicks, and release stops the sustained damage',()=>{
  arena(1,{test:false});mouseAttack(true);playerSteps(.5);assert.ok(api.spin);
  const enemy=stationaryEnemy('brute',0,2.1);enemy.hp=enemy.maxHp=1000;
  playerSteps(2.7);assert.ok(enemy.hp<=1000-api.spin.damage*3);
  mouseAttack(false);const hp=enemy.hp;playerSteps(.8);assert.equal(enemy.hp,hp);assert.equal(api.swing,null);
});

test('click spam stores only one follow-up and never creates a delayed attack backlog',()=>{
  arena();const before=audioEvents.filter(e=>e.name==='swing').length;
  mouseAttack(true);mouseAttack(false);playerSteps(.06);
  for(let n=0;n<40;n++){mouseAttack(true);mouseAttack(false);}
  playerSteps(1.2);assert.equal(audioEvents.filter(e=>e.name==='swing').length-before,2);
  playerSteps(2);assert.equal(api.swing,null);assert.equal(api.spin,null);
});

test('the separate spin button is removed and desktop images have dedicated touch-icon alternatives',()=>{
  assert.equal(elements.has('chargeButton'),false);
  assert.equal((html.match(/class="action-icon"/g)||[]).length,6);
  assert.match(html,/id="attackTouchIcon" href="#t-attack"/);
  assert.match(html,/id="attackIcon" href="#a-swing"/);
});

test('wooden jump strikes cause modest damage only after a fresh airborne input',()=>{
  for(const armed of [false,true]){
    arena(1,{test:false});api.startLeap();playerSteps(.12);
    if(armed){mouseAttack(true);mouseAttack(false);assert.equal(api.leap.strike,true);}
    assert.equal(api.leap.slam,false);
    const enemy=stationaryEnemy('brute',api.player.x+api.leap.dir.x*2.6,api.player.z+api.leap.dir.z*2.6),hp=enemy.hp;
    playerSteps(.8);assert.equal(api.leap,null);
    if(armed){assert.ok(enemy.hp<hp);assert.ok(hp-enemy.hp<api.stats.power);}
    else assert.equal(enemy.hp,hp);
  }
});

test('building HP anchors remain on their facade instead of following the player around the building',()=>{
  arena();const building=placeObject('warehouse',0,8,{w:8,d:6,h:9,isBuilding:true});
  const first=api.buildingHudAnchor(building);
  api.player.x=-12;api.player.z=20;const moved=api.buildingHudAnchor(building);
  assert.deepEqual(first,moved);close(first.z,11.04,.001);close(first.x,0);
  assert.ok(first.y>1&&first.y<building.h);
  building.hurtTimer=2;building.hp=500;building.maxHp=700;api.drawFX();
  assert.ok(elements.get('fxCanvas').context.textCalls.some(call=>call.text==='500 / 700 HP'));
});
'''
p.write_text(s)
p=Path('tests/occlusion.test.mjs');s=p.read_text();s+='''

test('a weapon inside the struck building cannot hide that building',()=>{
  for(const point of [{x:5,y:1,z:7},{x:5,y:2,z:4.01},{x:5,y:2,z:4}]){
    assert.equal(occludesBattlePoint(tower,point,view),false);
  }
  assert.equal(occludesBattlePoint(tower,{x:0,y:1,z:0},view),true);
});

test('nearby buildings outside actual actor rays stay fully opaque',()=>{
  const player={x:0,y:1,z:0};const rear={x:0,z:-4,w:6,d:6,h:8};
  const blocked=findBattleOccluders([rear,tower],[player],view);
  assert.equal(blocked.has(rear),false);assert.equal(blocked.has(tower),true);
});
''';p.write_text(s)
