"""Run bounded local checks using the one StorageGuard output layout."""
import os
import pathlib
import subprocess
import sys
import time
import json

root = pathlib.Path(__file__).resolve().parents[1]
output = pathlib.Path(os.environ['CODEX_GENERATED_OUTPUT'])
for name in ('tests', 'logs', 'work/temp'):
    (output / name).mkdir(parents=True, exist_ok=True)
os.environ['TEMP'] = os.environ['TMP'] = str(output / 'work/temp')
skill = pathlib.Path(os.environ.get('USERPROFILE', '')) / '.codex/skills/develop-web-game'
if (skill / 'node_modules/playwright/index.mjs').exists():
    os.environ.setdefault('SMASH_PLAYWRIGHT', (skill / 'node_modules/playwright/index.mjs').as_uri())
    os.environ.setdefault('SMASH_BROWSER_LIFECYCLE', (skill / 'scripts/browser_lifecycle.mjs').as_uri())
    os.environ.setdefault('SMASH_GAME_CLIENT', str(skill / 'scripts/web_game_playwright_client.js'))
mode = sys.argv[1] if len(sys.argv) > 1 else 'browser'
if mode in ('unit', 'renderer', 'world'):
    files = sorted(str(p) for p in (root / 'tests').glob('*.test.mjs'))
    files.append(str(root / 'tests/game.integration.mjs'))
    if mode == 'renderer':
        files = [str(root / 'tests/performance14.test.mjs')]
    if mode == 'world':
        files = [str(root / 'tests/world.test.mjs')]
    command = ['node', '--import', (root / 'tools/node-environment.mjs').as_uri(), '--experimental-vm-modules', '--test', *files]
else:
    if mode in ('transforms', 'collision'):
        script = 'transform-benchmark.mjs' if mode == 'transforms' else 'collision-benchmark.mjs'
        command = ['node', '--import', (root / 'tools/node-environment.mjs').as_uri(), str(root / 'tools' / script)]
    else:
        script = 'browser-smoke.mjs' if mode == 'smoke' else 'browser-local-performance.mjs'
        command = ['node', str(root / 'tests' / script), *sys.argv[2:]]
with (output / 'logs' / (mode + '.log')).open('w', encoding='utf-8') as log:
    def size():
        total = 0
        for folder, _, names in os.walk(output):
            for name in names:
                try:
                    total += pathlib.Path(folder, name).stat().st_size
                except FileNotFoundError:
                    pass
        return total
    before = peak = size()
    process = subprocess.Popen(command, cwd=root, stdout=log, stderr=subprocess.STDOUT)
    while process.poll() is None:
        peak = max(peak, size())
        time.sleep(.25)
    code = process.wait()
space = {'before_bytes': before, 'peak_bytes': peak, 'peak_additional_bytes': peak - before, 'after_bytes': size(), 'exit_code': code}
(output / 'logs' / (mode + '-space.json')).write_text(json.dumps(space, indent=2), encoding='utf-8')
print(f'{mode}: exit {code}; log: {output / "logs" / (mode + ".log")}; peak additional {space["peak_additional_bytes"]} bytes')
sys.exit(code)
