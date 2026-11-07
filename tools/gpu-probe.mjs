import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
const server=createServer(async(req,res)=>{try{const name=req.url.split('?')[0];if(name==='/'){res.setHeader('Content-Type','text/html');res.end('<canvas id="c" width="640" height="480"></canvas>');return;}res.setHeader('Content-Type','text/javascript');res.end(await readFile('node_modules/three/build/'+name.slice(1)));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(8831,'127.0.0.1',r));
const results=[];
for(const args of [ ['--enable-unsafe-webgpu','--use-angle=swiftshader','--enable-unsafe-swiftshader'], ['--enable-unsafe-webgpu','--use-angle=vulkan','--enable-features=Vulkan','--disable-vulkan-surface','--use-vulkan=swiftshader'] ]){
 const browser=await chromium.launch({headless:true,args});const page=await browser.newPage();page.on('console',m=>console.log(m.type(),m.text()));page.on('pageerror',e=>console.log(e.message));
 await page.goto('http://127.0.0.1:8831');
 const result=await page.evaluate(async()=>{try{const T=await import('/three.webgpu.js');const backend=new T.WebGPUBackend({canvas:document.querySelector('canvas')});const renderer=new T.Renderer(backend,{canvas:document.querySelector('canvas'),getFallback:null});renderer.library=new T.StandardNodeLibrary();await renderer.init();const scene=new T.Scene(),camera=new T.PerspectiveCamera(50,4/3,.1,100);camera.position.z=4;scene.add(new T.HemisphereLight(0xffffff,0x222222,2),new T.Mesh(new T.BoxGeometry(),new T.MeshLambertMaterial({color:0x33ee99})));renderer.setSize(640,480);await renderer.compileAsync(scene,camera);renderer.render(scene,camera);await new Promise(r=>setTimeout(r,300));return {success:true,isWebGPU:renderer.backend.isWebGPUBackend,info:renderer.info.render,adapter:renderer.backend.adapter?.info};}catch(error){return {success:false,message:error.message,stack:error.stack};}});
 results.push({args,...result});await page.screenshot({path:'gpu-probe-'+results.length+'.png'});await browser.close();if(result.success)break;
}
await writeFile('gpu-probe.json',JSON.stringify(results,null,2));server.close();if(!results.some(r=>r.success&&r.isWebGPU))process.exitCode=1;
