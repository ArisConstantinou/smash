from pathlib import Path
import hashlib
p=Path('tests/browser-smoke.mjs')
s=p.read_text()
s=s.replace("const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));", "const page=await context.newPage(),errors=[];let combat=null;page.on('pageerror',error=>errors.push(error.message));")
s=s.replace('      const combat=await page.evaluate(()=>{','      combat=await page.evaluate(()=>{')
s=s.replace('        const u=q.hero.userData;\n','')
old='''        q.renderCombat();const warm={...q.renderer.info.memory},created=q.trailPool.created;
        for(let n=0;n<6;n++){step(1);q.renderCombat();}
        const after={...q.renderer.info.memory},sustained=!!q.spin;'''
new='''        // WebGL uploads a pooled buffer only on its first visible draw. Prime
        // every existing ribbon once, preserving visibility. Otherwise comparing
        // the first 8 used slots with a later 10-slot stroke mistakes legitimate
        // lazy uploads for leaking resources. This is test-only; it allocates no
        // new geometry and does not change the production rendering lifecycle.
        const pool=[...q.trailPool.free,...q.trailPool.active];
        const visibility=pool.map(mesh=>mesh.visible);
        for(const mesh of pool)mesh.visible=true;
        q.renderCombat();pool.forEach((mesh,i)=>{mesh.visible=visibility[i];});
        const warm={...q.renderer.info.memory},created=q.trailPool.created,samples=[];
        // Advance thirty seconds of 120 Hz combat, sampling actual WebGL memory
        // at one-second intervals; this is a resource test, not an FPS benchmark.
        for(let n=0;n<30;n++){step(1);q.renderCombat();samples.push({...q.renderer.info.memory});}
        const after={...q.renderer.info.memory},sustained=!!q.spin;'''
assert old in s
s=s.replace(old,new)
s=s.replace('activeTrails:q.trailPool.active.size,warm,after};', 'activeTrails:q.trailPool.active.size,poolCapacity:q.trailPool.capacity,warm,after,samples,settled:{...q.renderer.info.memory}};')
s=s.replace("      assert.ok(combat.after.geometries<=combat.warm.geometries+4,'Prolonged held attacks must not accumulate GPU geometries');", """      assert.equal(combat.created,combat.poolCapacity,'All preallocated ribbons are accounted for');
      assert.ok(combat.samples.every(sample=>sample.geometries<=combat.warm.geometries),
        'Held attacks must not allocate GPU geometries beyond the fully warmed resources: '+JSON.stringify(combat));
      assert.ok(combat.samples.every(sample=>sample.textures<=combat.warm.textures),
        'Held attacks must not accumulate textures');
      assert.ok(combat.settled.geometries<=combat.warm.geometries,'Releasing the attack leaves no extra GPU resources');""")
s=s.replace('error:error.stack,consoleErrors:errors}', 'error:error.stack,consoleErrors:errors,combat}')
result=s.encode('utf-8')
assert hashlib.sha256(result).hexdigest()=='1a6f1c2efd5d85f99fa99568cd6a2a379a75aba6fb230c52dd0a9cd9370f9588'
p.write_bytes(result)
print('Verified browser resource warm-up and 30-second stress test')
