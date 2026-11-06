# Recorded combat audio — 6 November 2026

This update supersedes the procedural-only voice/impact description in the older README.

## What plays

Nineteen bundled mono MP3 clips (92,361 bytes total) provide three variants each for flesh, metal, masonry and wood impacts, three human effort clips and four pain reactions. Existing swing air, debris, robot reactions, ambience and reward stingers remain procedural. Missing or undecodable recordings fall back to the original synthesis without blocking play.

All sound requests during play are same-origin. Loading is limited to four concurrent requests, decoding is cached, adjacent repeats are avoided, and the existing 64-source / two-voice budgets are preserved. See `assets/audio/CREDITS.md` for attribution and licenses, and `manifest.json` for source and output hashes. `python3 tools/build-audio.py` rebuilds the clips using hash-verified downloads and FFmpeg.

## Controls

The main menu and Settings now offer **ΔΟΚΙΜΗ ΗΧΟΥ**. This explicitly enables audio and plays a brief wood/metal/body/effort sequence. A previous mute or zero-volume setting is cleared only when the user requests this test or explicitly enables sound. The speaker button and volume remain available. The default for a fresh installation is 75%; saved settings are retained.

Resume is invoked synchronously inside the input gesture. Dedicated audio buttons are excluded from capture-phase automatic unlock so a tap cannot unlock on pointerdown and accidentally toggle mute on click. Playback session routing is feature-detected. Backgrounding, muting and disposal cancel previews and transient sources; returning to the page allows another gesture to resume interrupted audio.

## Validation

- 271 Node tests passed locally and in the asset-build workflow, including nine added recorded-audio/lifecycle tests.
- The exact nine changed implementation text files were compared against the tested local source after the remote asset build.
- Real Chromium Web Audio decoded all nineteen MP3s. Post-limiter audio measurements confirmed nonzero signal for all six material/voice categories, and zero signal after mute.
- This is not an on-device iPhone listening test or a full GPU gameplay test. Device volume, output routing and browser interruptions still require physical-device confirmation.
