# AETHER — Offline-capable Hand Synth

## Live demo

**[Launch AETHER — Interactive Hand Synth](https://y0d4a.github.io/aether-hand-synth/)**

Play directly in your browser using your webcam. Allow camera access when prompted. AETHER performs hand tracking and audio synthesis locally, with no cloud inference or analytics. GitHub Pages serves the static site; the application itself does not upload webcam frames or recorded audio.

## Mobile, tablet and desktop

AETHER automatically adapts to phones, tablets and computers using viewport size and available touch/pointer capabilities (not invasive device fingerprinting). The default **Auto** performance profile uses a lightweight model and lower camera/render resolution on phones; other performance profiles can be selected manually.

- **Phones:** Portrait-optimized camera stage, swipeable playing-mode cards, large touch controls, and a compact keyboard. Rotate to landscape for a wider stage.
- **Tablets:** Touch targets and a larger responsive layout.
- **Desktop/laptop:** Full-width stage, multi-column settings and keyboard shortcuts `1`–`8`.
- **All devices:** Camera permission is required and front-facing video is requested. HTTPS or localhost is required for webcam access. Real-world tracking FPS varies by device, browser and lighting.

All detection and camera inference happen in your browser. The selected device mode is not transmitted to a server.

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
node scripts/test-audio.mjs
```

The one-time packaging step requires internet, npm and Node.js. It installs the pinned package **`@mediapipe/hands@0.4.1675469240`** using `--ignore-scripts`, copies its assets into `vendor/`, and generates `vendor/SHA256SUMS.json` and `vendor/offline-assets.json`. No npm installation or external CDN is required when running the packaged application.

## Play

- **Laser Harp:** cross 8 vertical beams with index/middle fingertips to play notes.
- **Air Keys:** tap the virtual keyboard area.
- **Theremin:** pinch to sustain, move horizontally for pitch and vertically for volume.
- **1–8 keyboard keys:** play without camera access.
- **14 sound presets:** four classic synths plus ten new electronic sounds (synth-guitar, synthwave, psytrance, techno and hip-hop), with key, scale, octave, filter, reverb, delay and drive controls.
- Reverb, delay, filter, visual particles, trails and color palettes.
- **Auto** performance profile adapts to mobile, tablet and desktop. Smooth, Balanced and Quality can be selected manually.
- **RECORD AUDIO** captures synthesized notes and any running drum groove locally, never webcam video.

## Sound design and groove machine

The sound palette is separate from the three hand-control modes: any instrument can be played with Laser Harp, Air Keys or Theremin. The quick genre buttons preview a sound immediately without activating the camera.

| Sound family | Presets | Character |
| --- | --- | --- |
| Classic | Crystal, Pluck, Dream, Sub | Light, ambient and simple tones |
| Electric guitar (synthetic) | Clean Electric, Overdrive | Plucked timbres and waveshaper distortion |
| Synthwave | Neon Lead, Retro Pad | Detuned oscillators, wide pads |
| Psytrance | Hypnotic Pluck, Acid 303 | Resonant filter sweeps, short staccato notes |
| Techno | Rave Stab, Techno Bass | Filtered stabs and punchy bass |
| Hip-hop | 808 Sub Drop, Lo-Fi Keys | Pitch-bent sub bass and warm dusty keys |

The **Groove Machine** offers Synthwave, Psytrance, Techno, Hip-Hop and Lo-Fi patterns. You can set the BPM (65–175), adjust drum volume and change synth drive. Press **Start Groove** to enable a locally synthesized kick/snare/hi-hat backing; no audio files or licensed samples are downloaded. The rhythm is audible and captured when you record a performance. Background-tab playback automatically stops.

The electric-guitar sounds are deliberately labeled *synth-guitar*: they approximate plucked/overdriven electric tones using synthesis rather than genuine guitar samples or physical instrument modeling. The groove patterns are original elementary rhythm sequences, not reconstructions of copyrighted songs.

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
