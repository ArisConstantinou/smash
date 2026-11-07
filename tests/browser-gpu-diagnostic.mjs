// Diagnostic matrix only. Mutations apply to the local HTTP response, NEVER to production files.
import assert from 'node:assert/strict';
import {assertScenePixels} from './browser-scene-health.mjs';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const root=fileURLToPath(new URL('../',import.meta.url)),out=resolve(root,'gpu-diagnostic');await mkdir(out,{recursive:true});
const variants=['normal','no-shadows','no-points','no-menu-preview','no-precompile','no-effects'];let variant='normal';
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.wasm':'application/wasm','.mp3':'audio/mpeg'};
const server=createServer(async(req,res)=>{try{const path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!path.startsWith(root)){res.writeHead(403).end();return;}let data=await readFile(path);if(path===resolve(root,'game.js')){let s=data.toString();
if(variant==='no-shadows')s=s.replace('renderer.shadowMap.enabled=true','renderer.shadowMap.enabled=false').replace('sun.castShadow=true','sun.castShadow=false');
if(variant==='no-precompile')s=s.replace('if(renderer.compileAsync)await renderer.compileAsync(scene,camera);','');
if(variant==='no-points'||variant==='no-effects')s=s.replace('updateThrowIndicator();const renderStart=',`scene.traverse(o=>{if(o.isPoints${variant==='no-effects'?'||o.isInstancedMesh':''})o.visible=false;});updateThrowIndicator();const renderStart=`);
s+='\nwindow.__gpuProbe={get ready(){return gameReady},get phase(){return phase},get renderer(){return renderer},get scene(){return scene},get camera(){return camera},startGame};';data=Buffer.from(s);}
if(path===resolve(root,'menu.js')&&variant==='no-menu-preview')data=Buffer.from(data.toString().replace('if(previewAttempted||disposed)return;','return;\nif(previewAttempted||disposed)return;'));
res.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream','Cache-Control':'no-store'}).end(data);
}catch{res.writeHead(404).end();}});await new Promise(r=>server.listen(8000,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const results=[];
try{for(variant of variants){
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--enable-unsafe-webgpu','--enable-unsafe-swiftshader','--use-angle=swiftshader','--use-vulkan=swiftshader','--use-webgpu-adapter=swiftshader']});
 const context=await browser.newContext({viewport:{width:1000,height:700},deviceScaleFactor:1});
 await context.addInitScript(()=>{
  window.__gpuLog=[];window.__gpuCounts={shaders:0,pipelines:0,buffers:0,bytes:0};
  if(!globalThis.GPUAdapter)return;
  const request=GPUAdapter.prototype.requestDevice;
  GPUAdapter.prototype.requestDevice=async function(...args){const d=await request.apply(this,args);window.__gpuLog.push({event:'device',at:performance.now(),info:this.info});
   d.addEventListener('uncapturederror',e=>window.__gpuLog.push({event:'gpuerror',at:performance.now(),error:e.error.message}));
   d.lost.then(i=>window.__gpuLog.push({event:'lost',at:performance.now(),reason:i.reason,message:i.message}));
   const destroy=d.destroy.bind(d);d.destroy=()=>{window.__gpuLog.push({event:'destroy-call',stack:new Error().stack});return destroy();};
   for(const [method,key]of [['createShaderModule','shaders'],['createRenderPipeline','pipelines'],['createRenderPipelineAsync','pipelines'],['createBuffer','buffers']]){const original=d[method].bind(d);d[method]=(...v)=>{window.__gpuCounts[key]++;if(key==='buffers')window.__gpuCounts.bytes+=v[0].size||0;return original(...v);};}
   return d;
  };
 });
 const page=await context.newPage(),messages=[];page.on('console',m=>{if(m.type()==='error'||m.type()==='warning')messages.push(m.text());});page.on('pageerror',e=>messages.push(e.stack));
 try{
  await page.goto(origin+'/index.html',{waitUntil:'networkidle',timeout:120000});
  await page.waitForFunction(()=>window.__gpuProbe?.ready||!document.querySelector('#fatalError').hidden,null,{timeout:120000});
  await page.evaluate(()=>{if(__gpuProbe.ready)__gpuProbe.startGame();});await page.waitForTimeout(3000);
  const state=await page.evaluate(()=>({ready:__gpuProbe.ready,phase:__gpuProbe.phase,lost:__gpuProbe.renderer?._isDeviceLost,info:__gpuProbe.renderer?.info,events:__gpuLog,counts:__gpuCounts}));
  if(state.ready)state.sampledColors=await assertScenePixels(page,'__gpuProbe');
  results.push({variant,state,messages});await page.screenshot({path:resolve(out,variant+'.png')});
 }catch(e){results.push({variant,error:String(e.stack),messages});}
 finally{await writeFile(resolve(out,'results.json'),JSON.stringify(results,null,2));await context.close();await browser.close();}
}}finally{server.close();}
console.log(JSON.stringify(results,null,2));

assert.ok(results.length===variants.length&&results.every(r=>!r.error&&r.state?.ready&&!r.state.lost&&r.state.sampledColors>30&&!r.state.events.some(e=>e.event==='gpuerror'||e.event==='lost')), 'WebGPU diagnostic failed; see results.json');
