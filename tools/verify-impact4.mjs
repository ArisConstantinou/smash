import {chromium} from 'playwright';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
await mkdir('browser-evidence',{recursive:true});
const report={commit:'e7b64e42854eea335738057d28dbbef6eb8250ee',live:[],browser:{errors:[]}};
const sha=b=>createHash('sha256').update(b).digest('hex');
for(const name of ['index.html','game.js','occlusion.js','hammer-motion.js']){
  try{
    const response=await fetch('https://arisconstantinou.github.io/smash/'+name+'?verify=impact4-'+Date.now(),{signal:AbortSignal.timeout(15000),headers:{'Cache-Control':'no-cache'}});
    const actual=Buffer.from(await response.arrayBuffer()),expected=await readFile(name);
    report.live.push({file:name,status:response.status,matches:sha(actual)===sha(expected),actual:sha(actual),expected:sha(expected)});
  }catch(error){report.live.push({file:name,error:String(error)});}
}
const server=spawn('python3',['-m','http.server','8765'],{stdio:'ignore'});
let browser;
try{
  await new Promise(resolve=>setTimeout(resolve,1500));
  browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage','--no-sandbox']});
  const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
  page.on('pageerror',error=>report.browser.errors.push(String(error)));
  page.on('console',message=>{if(message.type()==='error')report.browser.errors.push(message.text());});
  await page.addInitScript(()=>localStorage.setItem('ironfall.settings',JSON.stringify({quality:'low',shake:false,muted:true,volume:0})));
  report.browser.webgl2=await page.evaluate(()=>!!document.createElement('canvas').getContext('webgl2'));
  await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>document.querySelector('#startButton')?.disabled===false,null,{timeout:120000});
  await page.locator('#startButton').click();
  await page.waitForTimeout(5000);
  await page.screenshot({path:'browser-evidence/desktop-start.png'});
  await page.mouse.move(760,300);await page.mouse.down();
  await page.waitForTimeout(300);
  await page.screenshot({path:'browser-evidence/desktop-held-attack.png'});
  await page.waitForTimeout(350);
  await page.screenshot({path:'browser-evidence/desktop-spin.png'});
  await page.mouse.up();
  report.browser.completed=true;
  const touch=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
  touch.on('pageerror',error=>report.browser.errors.push('touch: '+error));
  await touch.addInitScript(()=>localStorage.setItem('ironfall.settings',JSON.stringify({quality:'low',shake:false,muted:true,volume:0})));
  await touch.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded',timeout:60000});
  await touch.waitForFunction(()=>document.querySelector('#startButton')?.disabled===false,null,{timeout:90000});
  await touch.locator('#startButton').tap();await touch.waitForTimeout(5000);
  await touch.screenshot({path:'browser-evidence/phone-start.png'});
  report.browser.touchCompleted=true;
}catch(error){report.browser.failure=String(error);}
finally{
  if(browser)await browser.close();server.kill();
  await writeFile('browser-evidence/report.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
}
