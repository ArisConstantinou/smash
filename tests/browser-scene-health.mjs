import assert from 'node:assert/strict';

// A successful GPU init or nonzero draw counter does not prove presentation.
// Read only the scene canvas, excluding DOM HUD text that could hide a blank city.
export async function assertScenePixels(page,probe='__perf14'){
 const colors=await page.evaluate(name=>{
  const q=window[name];q.renderer.render(q.scene,q.camera);
  const c=document.createElement('canvas');c.width=c.height=64;const ctx=c.getContext('2d');
  ctx.drawImage(q.renderer.domElement,0,0,64,64);const a=ctx.getImageData(0,0,64,64).data,colors=new Set();
  for(let i=0;i<a.length;i+=4)colors.add((a[i]>>3)*1024+(a[i+1]>>3)*32+(a[i+2]>>3));
  return colors.size;
 },probe);
 assert.ok(colors>30,'Scene canvas is blank or missing city detail: '+colors+' sampled colors');
 return colors;
}
