# IRONFALL / Smash

- Keep this project's source and future game files in `E:\Smash`. Preserve the existing project structure.
- Repository: `https://github.com/ArisConstantinou/smash`; public game: `https://arisconstantinou.github.io/smash/`.
- Use port **8000** only. `npm run preview` serves this checkout at `http://127.0.0.1:8000/`; fail if occupied, never silently select another port.
- Read `E:\CodexStorageGuard\README.md`. The registered project identity is `smash`; generated outputs reuse `E:\CodexGenerated\smash\staging` and its stable build/tests/work/logs folders. Serve static source directly; do not create another full build copy.
- Read `progress.md` for current provenance, pending acceptance and verification. `PROJECT-SNAPSHOT.json` describes the original ZIP, not hashes of subsequent changes.
- Keep authored appearance, destructible geometry, physical contacts, saves and original assets. WebGPU is the requested default, with no silent WebGL fallback; `?renderer=webgl` is explicit diagnosis only.
- Native desktop and throttled CPU evidence do not certify physical iPhone/Android performance. Do not call the FPS collapse fixed on every device without corresponding evidence.
- Use existing tests and `develop-web-game` validation. Keep test evidence bounded in the registered output folders, refresh stale results, and preserve small before/after comparisons.
