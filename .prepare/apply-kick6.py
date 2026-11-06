import base64, hashlib, json, pathlib, subprocess
BASE='e7b64e42854eea335738057d28dbbef6eb8250ee'
paths=['controls.css','core.js','game.js','hammer-motion.js','index.html','kick-physics.js','kick-runtime.js','models.js','package.json','tests/air-combat.test.mjs','tests/core.test.mjs','tests/game.integration.mjs','tests/kick-physics.test.mjs','tests/models.test.mjs','tools/verify-kick6.mjs','world.js']
def verify(data, expected):
    actual=hashlib.sha256(data).hexdigest()
    if actual!=expected: raise RuntimeError(f'Source checksum mismatch: {actual} != {expected}')
base={}
for path in paths:
    result=subprocess.run(['git','show',f'{BASE}:{path}'],capture_output=True)
    base[path]=result.stdout.decode('utf-8') if result.returncode==0 else ''
base_bytes=json.dumps(base,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()
verify(base_bytes,'1b27cd92ee4410417d8bf705711922711654938a5679a612739316391efa0eaf')
pathlib.Path('/tmp/kick6-base.json').write_bytes(base_bytes)
encoded=''.join(pathlib.Path(f'.prepare/kick6-part{i}').read_text() for i in range(3))
delta=base64.b64decode(encoded,validate=True)
verify(delta,'d7eccef80fb102601ecb55dca97fc1fff2b87b6fadb0bcb26f4ae49efea1f07f')
pathlib.Path('/tmp/kick6-delta.zst').write_bytes(delta)
subprocess.run(['zstd','-d','-f','--patch-from=/tmp/kick6-base.json','/tmp/kick6-delta.zst','-o','/tmp/kick6-new.json'],check=True)
new_bytes=pathlib.Path('/tmp/kick6-new.json').read_bytes()
verify(new_bytes,'faac91eb98069da783efd9abeb83f06cc58828b405ab297688f77188637763a9')
files=json.loads(new_bytes)
if set(files)!=set(paths): raise RuntimeError('Unexpected changed-file set')
for path in paths:
    target=pathlib.Path(path);target.parent.mkdir(parents=True,exist_ok=True)
    target.write_text(files[path],encoding='utf-8')
pathlib.Path('/tmp/kick6-paths.json').write_text(json.dumps(paths))
print('All 16 source files reconstructed and checksum-verified.')
