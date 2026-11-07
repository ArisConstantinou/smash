// Real Chromium/WebGL verification, separate from the fast Node VM suite.
// Run after installing the pinned Playwright test dependency from verify.yml.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {resolve, extname, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {createCharacterProgression,xpForNextLevel} from '../character-progression.js';

const root=fileURLToPath(new URL('../',import.meta.url));
const output=resolve(root,'browser-evidence');await mkdir(output,{recursive:true});
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.wav':'audio/wav','.mp3':'audio/mpeg','.png':'image/png'};
const qa=`\nwindow.__ironfallQA={get phase(){return phase},get settings(){return settings},get audio(){return audio},get player(){return player},get world(){return world},get hero(){return hero},get character(){return character},get testRun(){return testRun},get aiming(){return !!touchThrowAim},get windup(){return !!throwWindup},get flight(){return !!throwFlight},get throwLock(){return throwLock},setPhase,startGame,persistCharacter,updateSavedCharacter,updatePlayer};\n`;
const server=createServer(async(req,res)=>{
  try{
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const filename=resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
    if(!filename.startsWith(root.endsWith(sep)?root:root+sep)){res.writeHead(403);res.end();return;}
    let data=await readFile(filename);
    if(filename===resolve(root,'game.js'))data=Buffer.from(data.toString('utf8')+qa);
    res.writeHead(200,{'Content-Type':types[extname(filename)]||'application/octet-stream','Cache-Control':'no-store'});res.end(data);
  }catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader']});
const results=[];
const character=createCharacterProgression(6);character.xp=Math.floor(xpForNextLevel(6)*.6);
const saved={character,levels:{power:1,size:0,range:0,speed:0,vitality:0,quake:0,kick:0}};

async function insideViewport(page,id){
  const locator=page.locator('#'+id);assert.ok(await locator.isVisible(),id+' must be visible');
  const box=await locator.boundingBox(),size=page.viewportSize();
  assert.ok(box&&box.x>=-1&&box.y>=-1&&box.x+box.width<=size.width+1&&box.y+box.height<=size.height+1,
    id+' must fit viewport: '+JSON.stringify(box)+' in '+JSON.stringify(size));
  assert.ok(box.height>=40,id+' needs a usable touch target');
}

try{
  for(const config of [
    {name:'desktop',width:1440,height:900,mobile:false},
    {name:'phone-portrait',width:390,height:844,mobile:true},
    {name:'phone-landscape',width:844,height:390,mobile:true},
    {name:'small-phone',width:360,height:740,mobile:true},
  ]){
    const context=await browser.newContext({viewport:{width:config.width,height:config.height},hasTouch:config.mobile,isMobile:config.mobile,deviceScaleFactor:1});
    await context.addInitScript(saved=>{localStorage.setItem('ironfall.character',JSON.stringify(saved));},saved);
    const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
    try{
      await page.goto(origin,{waitUntil:'networkidle'});
      await page.waitForFunction(()=>window.__ironfallQA&&!document.querySelector('#startButton').disabled,null,{timeout:45000});
      assert.equal(await page.evaluate(()=>!!document.querySelector('#gameCanvas').getContext('webgl2')),true);
      assert.equal(await page.evaluate(()=>window.__ironfallQA.settings.throwMode),'tap');
      for(const id of ['startButton','resumeCharacterButton','menuSettingsButton','levelSelectButton'])await insideViewport(page,id);
      const newBox=await page.locator('#startButton').boundingBox(),resumeBox=await page.locator('#resumeCharacterButton').boundingBox();
      assert.ok(Math.abs(newBox.y-resumeBox.y)<10,'New / Continue occupy the same row');
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
      assert.equal(overflow,false,'No horizontal overflow');
      assert.equal(await page.evaluate(()=>{const title=document.querySelector('.forge-title h1');return title.scrollWidth<=title.clientWidth+1;}),true,
        'The full IRONFALL title must fit on narrow screens');
      const expectedProgress=Math.floor(character.xp/xpForNextLevel(character.level)*100);
      assert.equal(await page.locator('#menuXpTrack').getAttribute('aria-valuenow'),String(expectedProgress));
      await page.waitForFunction(expected=>parseFloat(document.querySelector('#menuXpFill').style.width)>=expected-.2,expectedProgress,{timeout:10000});
      await page.screenshot({path:resolve(output,config.name+'-menu.png')});

      await page.locator('#forgeHammerButton').click();
      await page.waitForFunction(()=>document.querySelector('#forgeScene').classList.contains('is-striking'));
      await page.waitForFunction(()=>!!document.querySelector('#forgeHitStatus').textContent,null,{timeout:5000});
      assert.equal(await page.evaluate(()=>window.__ironfallQA.audio.state),'ready','A real gesture activates menu audio');
      await page.screenshot({path:resolve(output,config.name+'-forge.png')});

      if(config.mobile)await page.locator('#menuSettingsButton').click();
      else await page.locator('#menuSettingsButton').press('Enter');
      assert.equal(await page.locator('#settingsMenu').isVisible(),true);
      await page.locator('#throwModeSetting').selectOption('hold');
      assert.equal(await page.evaluate(()=>window.__ironfallQA.settings.throwMode),'hold');
      await page.locator('#throwModeSetting').selectOption('tap');
      await page.locator('#closeSettingsButton').click();
      assert.equal(await page.locator('#menu').isVisible(),true);

      if(config.mobile)await page.locator('#levelSelectButton').click();
      else await page.locator('#levelSelectButton').press('Space');
      await insideViewport(page,'testStartButton');
      await page.locator('#startingLevel').selectOption('10');
      await page.locator('#testStartButton').click();
      await page.waitForFunction(()=>window.__ironfallQA.phase==='playing');
      assert.equal(await page.evaluate(()=>window.__ironfallQA.character.level),10);
      assert.equal(await page.evaluate(()=>window.__ironfallQA.testRun),true);
      if(config.mobile){
        await insideViewport(page,'joystick');await insideViewport(page,'throwButton');
        await page.locator('#throwButton').tap();
      }else await page.keyboard.press('r');
      await page.waitForFunction(()=>window.__ironfallQA.aiming);
      assert.equal(await page.evaluate(()=>window.__ironfallQA.windup||window.__ironfallQA.flight),false);
      if(config.mobile)await page.locator('#throwButton').tap();else await page.keyboard.press('r');
      await page.waitForFunction(()=>window.__ironfallQA.windup||window.__ironfallQA.flight);
      // Software WebGL can take longer to read a full desktop framebuffer.
      await page.screenshot({path:resolve(output,config.name+'-game.png'),timeout:60000});
      await page.locator('#pauseButton').click();await page.locator('#restartButton').click();
      assert.equal(await page.locator('#menu').isVisible(),true);
      assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('ironfall.character'))),saved,'Test level never replaces earned save');
      await page.locator('#resumeCharacterButton').click();
      await page.waitForFunction(()=>window.__ironfallQA.phase==='playing');
      assert.equal(await page.evaluate(()=>window.__ironfallQA.character.level),6);
      assert.equal(await page.evaluate(()=>window.__ironfallQA.testRun),false);
      assert.deepEqual(errors,[]);
      results.push({viewport:config.name,passed:true});
    }catch(error){
      await page.screenshot({path:resolve(output,config.name+'-failure.png')}).catch(()=>{});
      results.push({viewport:config.name,passed:false,error:error.stack,consoleErrors:errors});
    }finally{await context.close();}
  }
}finally{
  await browser.close();await new Promise(resolve=>server.close(resolve));
  await writeFile(resolve(output,'results.json'),JSON.stringify(results,null,2));
  console.log(JSON.stringify(results,null,2));
}
assert.ok(results.length===4&&results.every(result=>result.passed),'All desktop and mobile checks must pass');
