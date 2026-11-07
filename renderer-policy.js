/** Strict WebGPU by default. No silent WebGL fallback and no browser flags.
 * The explicit ?renderer=webgl diagnostic mode exists for controlled A/B tests.
 */
export async function createGameRenderer({THREE,canvas,mode='webgpu',gpu=globalThis.navigator?.gpu}={}){
  if(mode==='webgl'){
    const renderer=new THREE.WebGLRenderer({canvas,antialias:false,alpha:false,powerPreference:'high-performance'});
    renderer.userData={backend:'WebGL2 · diagnostic'};return renderer;
  }
  if(!gpu)throw new Error('Το WebGPU δεν είναι διαθέσιμο σε αυτόν τον browser. Χρειάζεται συμβατός browser/GPU και ενεργή επιτάχυνση γραφικών. Δεν έγινε αυτόματη μετάβαση σε WebGL.');
  const renderer=new THREE.WebGPURenderer({canvas,antialias:false,alpha:false,powerPreference:'high-performance'});
  // Pinned r170 installs its own fallback; disable it before asynchronous init.
  // A post-init backend check also protects this contract when upgrading Three.
  renderer._getFallback=null;
  // r170 compileAsync still calls this with four arguments, while the render
  // path supplies five (including the double-pass list). Normalize ONLY that
  // compile call; otherwise a lights node is mistaken for the scene.
  const transparentPass=renderer._renderTransparents;
  if(typeof transparentPass==='function')renderer._renderTransparents=function(list,doublePass,camera,scene,lights){
    return arguments.length===4
      ?transparentPass.call(this,list,[],doublePass,camera,scene)
      :transparentPass.call(this,list,doublePass,camera,scene,lights);
  };
  try{
    await renderer.init();
    if(renderer.backend?.isWebGPUBackend!==true)throw new Error('WebGPU initialization did not select a WebGPU backend');
    // r170 RenderObject snapshots object.geometry and does not invalidate that
    // reference when a fracture replaces it or a debris buffer grows. Recreate
    // only stale records, including shadow passes; stable draws keep their cache.
    const objects=renderer._objects;
    if(objects?.get){
      const get=objects.get;
      objects.get=function(object,...args){
        let record=get.call(this,object,...args);
        if(record.geometry!==object.geometry){record.dispose();record=get.call(this,object,...args);}
        return record;
      };
    }
    renderer.userData={backend:'WebGPU'};return renderer;
  }catch(error){
    // r170 dispose() dereferences managers that do not exist when init() fails.
    // Cleanup must never replace the adapter/device error players need to see.
    try{renderer.dispose?.();}catch{}
    throw error;
  }
}
