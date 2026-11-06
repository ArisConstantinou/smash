from pathlib import Path
import hashlib, json, lzma, subprocess

ROOT=Path.cwd()
BASE='e7b64e42854eea335738057d28dbbef6eb8250ee'
EXPECTED='4a11a47a438e580817eeba7da144da6a8da49bc50e1c64f1d9cc962290941f02'
ALLOWED=set('README.md RELEASE-kick6.md audio.js controls.css core.js game.js hammer-motion.js index.html kick-physics.js models.js tests/game.integration.mjs tests/hammer-motion.test.mjs tests/kick-physics.test.mjs tests/models.test.mjs tests/world.test.mjs world.js'.split())
raw=lzma.decompress(b''.join((ROOT/f'.release/kick6/part{i}.xz').read_bytes() for i in range(1,4)))
assert hashlib.sha256(raw).hexdigest()==EXPECTED, 'Payload checksum mismatch'
manifest=json.loads(raw)
assert manifest['base']==BASE
assert {f['path'] for f in manifest['files']}==ALLOWED
assert len(manifest['files'])==len(ALLOWED)
remote=subprocess.check_output(['git','ls-remote','origin','refs/heads/main'],text=True).split()[0]
assert remote==BASE, 'main changed; reconcile before releasing'
subprocess.run(['git','worktree','add','--detach','candidate',BASE],check=True)
target=ROOT/'candidate'
for item in manifest['files']:
    p=target/item['path']
    before=p.read_bytes() if p.exists() else None
    digest=hashlib.sha256(before).hexdigest() if before is not None else None
    assert digest==item['before'], 'Base mismatch: '+item['path']
    lines=(before or b'').decode('utf-8').splitlines(keepends=True)
    previous=0
    for start,end,text in item['edits']:
        assert isinstance(start,int) and isinstance(end,int)
        assert previous<=start<=end<=len(lines)
        previous=end
    for start,end,text in reversed(item['edits']):
        lines[start:end]=text.splitlines(keepends=True)
    result=''.join(lines).encode('utf-8')
    assert hashlib.sha256(result).hexdigest()==item['after'], 'Output mismatch: '+item['path']
    p.parent.mkdir(parents=True,exist_ok=True)
    p.write_bytes(result)
    print(item['path'],item['after'])
subprocess.run(['git','diff','--check'],cwd=target,check=True)
(ROOT/'release-evidence').mkdir(exist_ok=True)
(ROOT/'release-evidence/expected-hashes.json').write_text(json.dumps({f['path']:f['after'] for f in manifest['files']},indent=2))
print('Applied and checksum-verified all 16 release files.')
