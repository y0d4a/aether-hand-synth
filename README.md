# AETHER — Webcam Hand Synth

An optimized, self-contained static web application inspired by the provided hand-music video. Tracks up to two hands using MediaPipe Hands in the browser and synthesizes sounds locally with the Web Audio API.

## Run

Serve this folder using an HTTP server:

```sh
cd aether-hand-synth
python3 -m http.server 8080
```

Visit **http://localhost:8080** in Chrome, Edge, Firefox or Safari, and press **START CAMERA**. Your browser must allow camera access.

For access from another device, deploy to an **HTTPS** host. Browser camera access is blocked on ordinary HTTP addresses other than localhost. An internet connection is needed initially to load MediaPipe's model/scripts and the optional web fonts from public CDNs.

## Controls

- **Laser Harp:** Move your index or middle fingertip sideways through any of eight vertical beams to play its note.
- **Air Keys:** Move a fingertip into the lower on-screen key pads to play. Lift away and tap again to retrigger.
- **Theremin:** Pinch the index fingertip to your thumb to activate a sustained note. Horizontal hand movement sets pitch, vertical movement controls amplitude; a second hand changes the filter cutoff.
- **1–8:** Keyboard number keys trigger notes without the camera. The on-screen keys are clickable.
- Sound presets: Glass, Pluck, Dream, Bass. Select root, scale and octave.
- Audio effects: digital delay, procedural convolver reverb, adjustable low-pass filtering, master volume and mute.
- Visual effects: four color palettes, tracked hand skeleton, cross-hand light connections, motion trails, sparks and pulses.
- **RECORD AUDIO:** Downloads the synthesized audio (WebM/Opus or M4A, depending on browser). It never records webcam video.

## Privacy

Camera frames are processed locally by MediaPipe Hands and are not uploaded to a server by this app. Audio is synthesized locally. The initial JavaScript/model assets are loaded from jsDelivr, and fonts from Google Fonts. For strict offline operation, vendor those assets locally and remove the external stylesheet import.

## Architecture

`index.html` — semantic markup and controls.
`styles.css` — responsive futuristic UI.
`app.js` — MediaPipe tracking, Canvas2D visualization, Web Audio synthesis, recording and interaction modes.

## Limitations

Gesture tracking and camera permissions must be checked on a real browser/device; synthetic/headless browser tests do not demonstrate actual camera recognition. Performance and tracking accuracy depend on lighting, webcam placement, and device processing power. The app does not send video over a network and does not require a backend.

## Performance tuning (v1.1)

The default **Smooth** profile requests 640×480 camera frames, uses the faster MediaPipe model (complexity 0), and draws the overlay at a maximum device pixel ratio of 1. Background instrument graphics are cached rather than recomputed every frame. Hand render coordinates are smoothed separately from the audio trigger coordinates.

- **Smooth:** 640×480, model complexity 0, minimal glow. Lowest latency and CPU usage.
- **Balanced:** 960×540, complexity 0, modest glow and sharper output.
- **Quality:** 1280×720, complexity 1, enhanced visuals. Slower on many laptops.

The stage now shows **TRACK** (actual MediaPipe result rate) and **FPS** (canvas render rate) separately. Neither is a guaranteed target. Audio timing and detection responsiveness depend on local hardware, camera driver, lighting and CPU/GPU availability. Close other camera consumers and select Smooth first if the experience stutters.

Changing the profile while the camera is running updates the drawing and tracker complexity; stop and start the camera to apply the new capture resolution. If tracking stalls while a browser tab is hidden, stop and restart the camera.

## Publishing to GitHub

Create a new empty repository (for example, `aether-hand-synth`) on GitHub. Then, inside this project folder:

```sh
git init -b main
git add .
git commit -m "Initial release: AETHER optimized hand-tracking synthesizer"
git remote add origin https://github.com/YOUR_USERNAME/aether-hand-synth.git
git push -u origin main
```

Keep the repository private if you do not want the source code to be public. The project does not need a server or build process; GitHub Pages or another HTTPS static host can serve the files directly. GitHub Pages publishing must be enabled separately in repository settings.