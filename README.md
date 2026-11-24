# AETHER — Fully Offline Hand Synth

A browser-based laser harp, air keyboard and theremin powered by webcam hand tracking. **All camera processing, sound generation, effects and recording run locally.** No external JavaScript, Google Fonts, analytics, cloud inference or runtime CDNs.

## Run offline

When `vendor/mediapipe-hands/` is present (including `.wasm` and `.data` files), disconnect the internet and run:

```bash
python3 -m http.server 8080 --bind 127.0.0.1
```

Open **http://localhost:8080** in a browser and allow camera access. Localhost is a secure context. Do not use `file://` because the model assets are fetched locally by the WebAssembly loader. Once vendored, neither the browser nor the local HTTP server requires the internet.

For deployment to an HTTPS host (e.g., GitHub Pages), install the app on a first online visit to cache all same-origin files with its service worker. Browsers can evict caches, so **local hosting of the complete directory remains the reliable, guaranteed offline method**.

## Vendoring the models (one-time preparation)

The repository includes an automated GitHub Actions workflow that retrieves the pinned official npm package and commits **all required MediaPipe Hands model, JS, WASM and loader assets** to `vendor/`. You can also prepare a local source checkout manually:

```bash
bash scripts/vendor-mediapipe.sh
node scripts/verify-offline.mjs
```

The one-time packaging step needs internet, npm and Node.js. It installs **`@mediapipe/hands@0.4.1675469240`** from npm using `--ignore-scripts`, copies the installed package into the repository, and produces `vendor/SHA256SUMS.json` and `vendor/offline-assets.json`. After packaging, runtime is self-contained. Check the GitHub Actions workflow result and the generated files; do not assume that merely changing the HTML to local paths guarantees offline support.

## Play

- **Laser Harp:** cross 8 vertical beams with index/middle fingertips to play notes.
- **Air Keys:** tap the virtual keyboard area.
- **Theremin:** pinch to sustain, move horizontally for pitch and vertically for volume.
- **1–8 keyboard keys:** play without camera access.
- Synth presets: Glass, Pluck, Dream, Bass, plus root/scale/octave.
- Reverb, delay, filter, visual particles, trails and color palettes.
- **Smooth** default profile at 640×480; Balanced and Quality are available.
- **RECORD AUDIO** records only synthesized audio for local download, never webcam video.

## Privacy and security

- Camera access is requested only after a user gesture, with `audio: false`.
- JavaScript, WebAssembly binaries and models are loaded **from this application's origin**.
- Content Security Policy allows only same-origin connections (`connect-src 'self'`) and scripts, with limited WebAssembly compilation.
- No external fonts, telemetry or cloud API endpoints are referenced in runtime files.
- A same-origin service worker caches offline resources listed in the build manifest.
- A compromised website origin, browser, extension or packaging dependency can still threaten privacy. Bundling models does not eliminate these threats.
- If hosted publicly, the web host can observe standard HTTP asset requests but the application does **not** transmit camera frames or synthesized audio.

## Verification

```bash
node scripts/verify-offline.mjs
```

Test in a browser with network disabled and all assets present. Check DevTools Network for off-origin requests while enabling the camera, playing and recording. This static verification does not replace a live network audit or a webcam tracking/performance test on a real device.

## License

AETHER project-specific code is available in this repository. Vendored MediaPipe files are published under the upstream Apache-2.0 terms, and their original package documentation/license files are retained in `vendor/mediapipe-hands/`.
