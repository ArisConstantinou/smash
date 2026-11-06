import {chromium} from 'playwright';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const out='release-evidence';
await mkdir(out,{recursive:true});
const report={base:'e7b64e42854eea335738057d28dbbef6eb8250ee',errors:[],consoleErrors:[],views:[]};
const game=await readFile('candidate/game.js','utf8');
const probe='\nwindow.__releaseProbe={state:()=>({phase,kick:!!kick,spin:!!spin,leap:!!leap,dash:dashTime>0,weapon:characterStats.weaponName}),zoom:v=>{camera.zoom=v;camera.updateProjectionMatrix();}};\n';
const server=spawn('python3',['-m','http.server','8765','--bind','127.0.0.1','--directory','candidate'],{stdio:'ignore'});
let browser,failed=false;
try {
  for(let i=0;i<40;i++){try{const r=await fetch('http://127.0.0.1:8765/');if(r.ok)break;}catch{}await new Promise(r=>setTimeout(r,150));}
  browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage','--no-sandbox']});
  for(const view of [{name:'desktop',width:1440,height:900,touch:false},{name:'phone',width:390,height:844,touch:true},{name:'tablet',width:1024,height:768,touch:true}]) {
    const page=await browser.newPage({viewport:{width:view.width,height:view.height},deviceScaleFactor:1,isMobile:view.touch,hasTouch:view.touch});
    page.on('pageerror',e=>report.errors.push(view.name+': '+String(e)));
    page.on('console',m=>{if(m.type()==='error')report.consoleErrors.push(view.name+': '+m.text());});
    await page.addInitScript(()=>localStorage.setItem('ironfall.settings',JSON.stringify({quality:'low',shake:false,muted:true,volume:0})));
    await page.route('**/game.js*',route=>route.fulfill({status:200,contentType:'application/javascript',body:game+probe}));
    const webgl=await page.evaluate(()=>!!document.createElement('canvas').getContext('webgl2'));
    assert.equal(webgl,true,'Software WebGL2 unavailable');
    await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded',timeout:60000});
    await page.waitForFunction(()=>document.querySelector('#startButton')?.disabled===false,null,{timeout:120000});
    await page.locator('#startButton')[view.touch?'tap':'click']();
    await page.waitForFunction(()=>window.__releaseProbe?.state().phase==='playing',null,{timeout:20000});
    await page.waitForTimeout(1200);
    assert.equal(await page.locator('#kickButton').isVisible(),true,'Missing kick control');
    const layout=await page.evaluate(()=>({touch:document.body.dataset.touchControls,picture:getComputedStyle(document.querySelector('#kickButton .action-picture')).display,icon:getComputedStyle(document.querySelector('#kickButton .action-icon')).display,width:document.documentElement.scrollWidth,viewport:innerWidth}));
    assert.equal(layout.touch,String(view.touch));
    assert.equal(layout.picture==='none',view.touch);
    assert.equal(layout.icon==='none',!view.touch);
    assert.ok(layout.width<=layout.viewport+1,'Horizontal overflow');
    await page.screenshot({path:out+'/'+view.name+'-start.png'});
    if(!view.touch) {
      await page.evaluate(()=>window.__releaseProbe.zoom(2.8));
      await page.waitForTimeout(150);
      await page.screenshot({path:out+'/desktop-grip-close.png'});
      await page.mouse.move(850,280);
      await page.keyboard.down('e');
      const kickState=await page.evaluate(()=>window.__releaseProbe.state());
      await page.waitForTimeout(100);
      await page.screenshot({path:out+'/desktop-kick.png'});
      await page.keyboard.up('e');
      await page.waitForTimeout(800);
      await page.mouse.down();
      await page.waitForFunction(()=>window.__releaseProbe.state().spin,null,{timeout:15000});
      await page.screenshot({path:out+'/desktop-spin.png'});
      await page.mouse.up();
      await page.waitForTimeout(500);
      await page.keyboard.press('Space');
      await page.keyboard.press('Shift');
      await page.mouse.click(850,280);
      await page.waitForTimeout(200);
      await page.screenshot({path:out+'/desktop-air-action.png'});
      report.desktopKickState=kickState;
    } else {
      await page.locator('#kickButton').tap();
      await page.waitForTimeout(120);
      await page.screenshot({path:out+'/'+view.name+'-kick.png'});
    }
    report.views.push({...view,webgl,layout,state:await page.evaluate(()=>window.__releaseProbe.state())});
    await page.close();
  }
  assert.equal(report.errors.length,0,'JavaScript runtime errors');
  report.completed=true;
} catch(error) {
  failed=true;report.failure=String(error);console.error(error);
} finally {
  if(browser)await browser.close();server.kill();
  await writeFile(out+'/browser-report.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
}
if(failed)process.exitCode=1;
