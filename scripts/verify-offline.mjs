import {readFile,stat} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
const [html, js, sounds, css, sw, offline, manifest] = await Promise.all([
  readFile('index.html','utf8'), readFile('app.js','utf8'), readFile('sound-bank.js','utf8'), readFile('styles.css','utf8'),
  readFile('sw.js','utf8'),readFile('offline.js','utf8'),readFile('vendor/offline-assets.json','utf8')]);
if (/https?:\/\//.test([html,js,sounds,css,sw,offline].join('\n'))) throw Error('Absolute remote URL detected in runtime');
if (/\@import\s+url/.test(css)) throw Error('Remote CSS import detected');
if (!html.includes('vendor/mediapipe-hands/hands.js') || !js.includes('./vendor/mediapipe-hands/${file}')) throw Error('MediaPipe is not locally referenced');
if (!html.includes("connect-src 'self'")) throw Error('Missing same-origin connection policy');
if (!js.includes('audio:false')) throw Error('Camera must not request microphone access');
if (!js.includes("window.addEventListener('pagehide',stopCamera)")) throw Error('Missing camera cleanup on navigation');
if (!html.includes('id="deviceHint"') || !html.includes('value="auto" selected')) throw Error('Missing adaptive device UI');
if (!js.includes("window.matchMedia('(any-pointer: coarse)')") || !js.includes("const profile = () => PROFILES[CONFIG.performance === 'auto' ? device.kind : CONFIG.performance]")) throw Error('Missing auto device detection and performance profile');
if (!css.includes('@media (max-width:700px)') || !css.includes('orientation:landscape') || !css.includes('touch-action:manipulation')) throw Error('Missing mobile-responsive layout or touch controls');
for (const file of ['app.js', 'sound-bank.js', 'offline.js', 'sw.js']) {
  const check = spawnSync(process.execPath, ['--check', file], {encoding:'utf8'});
  if (check.status !== 0) throw Error(`Invalid JavaScript in ${file}: ${check.stderr}`);
}
if (!html.includes('src="sound-bank.js"') || !js.includes('new window.AetherGroove.Bank')) throw Error('Missing local sound bank integration');
if (!sw.includes("'./sound-bank.js'")) throw Error('Sound bank missing from offline service worker cache');
for (const id of ['presetPreview','beatToggle','beatStyle','bpm','drive','beatVolume']) {
  if (!html.includes('id="'+id+'"')) throw Error('Missing sound control: '+id);
}
const {files}=JSON.parse(manifest);
if (!files.length) throw Error('No model files');
for (const f of files) {
  if (!f.startsWith('vendor/mediapipe-hands/') || f.includes('..')) throw Error('Unsafe manifest path '+f);
  if (!(await stat(f)).isFile()) throw Error('Missing asset '+f);
}
console.log(`Offline preparation verified: ${files.length} vendored assets; all runtime refs local.`);
