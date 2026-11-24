# AETHER — Offline-capable Hand Synth

## Live demo

**[Launch AETHER — Interactive Hand Synth](https://y0d4a.github.io/aether-hand-synth/)**

Play directly in your browser using your webcam. Allow camera access when prompted. AETHER performs hand tracking and audio synthesis locally, with no cloud inference or analytics. GitHub Pages serves the static site; the application itself does not upload webcam frames or recorded audio.

## Run offline

When `vendor/mediapipe-hands/` is present (including `.wasm` and `.data` files), disconnect the internet and run:

```bash
python3 -m http.server 8080 --bind 127.0.0.1
```

Open **http://localhost:8080** in a browser and allow camera access. Localhost is a secure context. Do not use `file://` because the model assets are fetched locally by the WebAssembly loader. Once vendored, neither the browser nor the local HTTP server requires the internet.

For GitHub Pages, the first visit requires internet access. A service worker caches the application assets for subsequent offline visits when the browser allows it. Browser caches can be evicted; for dependable offline use, run the complete downloaded directory on localhost.

## Vendoring the models (one-time preparation)

The repository includes an automated GitHub Actions workflow that retrieves the pinned official npm package and commits **all required MediaPipe Hands model, JS, WASM and loader assets** to `vendor/`. You can also prepare a local source checkout manually:

```bash
bash scripts/vendor-mediapipe.sh
node scripts/verify-offline.mjs
```

The one-time packaging step requires internet, npm and Node.js. It installs the pinned package **`@mediapipe/hands@0.4.1675469240`** using `--ignore-scripts`, copies its assets into `vendor/`, and generates `vendor/SHA256SUMS.json` and `vendor/offline-assets.json`. No npm installation or external CDN is required when running the packaged application.

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

- Camera access requires a click and requests **video only** (`audio: false`). Microphone access is not requested.
- The camera stream stops when you select **Stop Camera**, switch to another browser tab, or leave the page. Returning to the tab requires manually starting the camera again.
- Hand tracking uses local MediaPipe JavaScript/WASM/models. Web Audio generates sound in the browser; **Record Audio** saves the synthesized signal locally, not webcam video.
- The application does not contain telemetry, analytics, cloud inference or media-upload code. Static runtime dependencies are served from the application's origin.
- CSP restricts script and connection destinations to the same origin. It is defense-in-depth, not a guarantee against a compromised origin or browser extension.
- When hosted on GitHub Pages, GitHub receives ordinary web requests to deliver app files (including standard network metadata such as IP addresses). Media is not submitted by AETHER's application code.
- **Camera permissions are scoped to the browser origin.** Other GitHub Pages projects under the same `y0d4a.github.io` origin can share permission scope. For stronger isolation, use a dedicated domain for this application.
- The service worker caches local assets for offline use. Browser cache removal may require re-downloading them.

## Verification

```bash
node scripts/verify-offline.mjs
```

Test with the network disconnected after preparing all assets. Check DevTools Network while enabling the camera, playing, and recording to detect unexpected requests. Static checks cannot establish real-world camera performance or independently audit browser and third-party library behavior.

## License

The vendored `@mediapipe/hands` package declares **Apache-2.0** in its `package.json`; upstream copyright and package metadata are preserved. The AETHER-specific source files do not currently declare a separate open-source license.
