// Test-server-only hooks: these never appear in published game.js.
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
export const throwIndicatorQA=`
Object.assign(window.__ironfallQA,{
  prepareThrowPicture(){
    startGame(13,{test:true});clearInput();
    for(const e of enemies){e.speed=0;e.timer=100000;}
    if(wave)wave.timer=100000;
    settings.throwAutoLock=false;settings.shake=false;player.invincible=100000;
    facing=screenMovement(0,-1);aim.x=facing.x;aim.z=facing.z;pointer.active=false;
    poseHero(1);updateAimPreview();updateThrowIndicator();
    announcementTimer=0;$('announcement').hidden=true;
  },
  throwPictureState(){return {visible:throwIndicator.mesh.visible,textureReady:throwIndicator.mesh.userData.textureReady,
    layout:throwIndicator.mesh.userData.layout,mode:touchThrowAim?.mode,aim:{...aim},
    started:!!throwWindup||!!throwFlight,hasArc:!!meleeHint,held:!!touchThrowAim?.pressed,
    lastStroke:swingSequences[stance>.9?1:0].last,stance,position:{x:player.x,z:player.z},
    markerVisible:directionMarker.visible};},
  pictureStep(seconds){for(let n=0;n<seconds;n+=1/120)updatePlayer(Math.min(1/120,seconds-n));
    updateAimPreview();updateThrowIndicator();},
  pictureMode(mode){settings.throwMode=mode;},
  pictureAimPoint(){const dir=screenMovement(0,-1);return screenPoint(player.x+dir.x*8,player.y+1.2,player.z+dir.z*8);},
});
`;
export async function verifyThrowPicture(page,config,output){
  // Empty street for opener tests: nothing can turn a deliberate tap into spin.
  await page.evaluate(()=>window.__ironfallQA.prepareManualArena());
  const attack=async()=>{
    if(config.mobile)await page.locator('#attackButton').tap();
    else{const p=await page.evaluate(()=>window.__ironfallQA.aimScreenPoint());await page.mouse.click(p.x,p.y);}
  };
  await attack();
  assert.equal((await page.evaluate(()=>window.__ironfallQA.throwPictureState())).lastStroke,'one-forehand');
  await page.evaluate(()=>window.__ironfallQA.pictureStep(1.2));
  await attack();
  assert.equal((await page.evaluate(()=>window.__ironfallQA.throwPictureState())).lastStroke,'one-forehand','An idle pause resets the actual input chain');
  for(const mode of ['confirm','hold']){
    await page.evaluate(mode=>{window.__ironfallQA.prepareThrowPicture();window.__ironfallQA.pictureMode(mode);},mode);
    let cdp,points=[];
    if(config.mobile){
      const b=await page.locator('#throwButton').boundingBox();
      cdp=await page.context().newCDPSession(page);
      points=[{x:b.x+b.width*.5,y:b.y+b.height*.5,id:2}];
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:points});
      if(mode==='confirm')await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    }else{
      const p=await page.evaluate(()=>window.__ironfallQA.pictureAimPoint());await page.mouse.move(p.x,p.y);
      await page.keyboard.down('r');if(mode==='confirm')await page.keyboard.up('r');
    }
    await page.waitForFunction(()=>{const s=window.__ironfallQA.throwPictureState();return s.visible&&s.textureReady&&!s.started;});
    const before=await page.evaluate(()=>window.__ironfallQA.throwPictureState());
    assert.equal(before.hasArc,true);assert.ok(before.layout.width>=1.25);assert.ok(before.layout.start>3.65);
    assert.equal(before.markerVisible,false,'Tiny triangle is replaced, not stacked with the ground picture');
    if(config.mobile&&mode==='hold'){
      // The action thumb moving is NOT a second joystick.
      points[0].x-=30;points[0].y-=40;
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:points});
      await page.evaluate(()=>window.__ironfallQA.pictureStep(.1));
      const after=await page.evaluate(()=>window.__ironfallQA.throwPictureState());
      assert.ok(before.aim.x*after.aim.x+before.aim.z*after.aim.z>.999);
    }
    await page.screenshot({path:resolve(output,config.name+'-throw-'+mode+'.png'),timeout:60000});
    if(config.mobile){
      if(mode==='confirm')await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:points});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
    }else if(mode==='hold')await page.keyboard.up('r');else await page.keyboard.press('r');
    await page.waitForFunction(()=>window.__ironfallQA.throwPictureState().started);
    await page.waitForFunction(()=>!window.__ironfallQA.throwPictureState().visible);
  }
  return {horizontalOpener:true,illustratedGroundArrow:true,arcPreserved:true,confirm:true,hold:true,noReticleDrag:true};
}
