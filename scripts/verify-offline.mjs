import {readFile,stat} from 'node:fs/promises';
const [html, js, css, sw, manifest] = await Promise.all([
  readFile('index.html','utf8'), readFile('app.js','utf8'), readFile('styles.css','utf8'),
  readFile('sw.js','utf8'),readFile('vendor/offline-assets.json','utf8')]);
if (/https?:\/\//.test([html,js,css,sw].join('\n'))) throw Error('Absolute remote URL detected in runtime');
if (/\@import\s+url/.test(css)) throw Error('Remote CSS import detected');
if (!html.includes('vendor/mediapipe-hands/hands.js') || !js.includes('./vendor/mediapipe-hands/${file}')) throw Error('MediaPipe is not locally referenced');
const {files}=JSON.parse(manifest);
if (!files.length) throw Error('No model files');
for (const f of files) {
  if (!f.startsWith('vendor/mediapipe-hands/') || f.includes('..')) throw Error('Unsafe manifest path '+f);
  if (!(await stat(f)).isFile()) throw Error('Missing asset '+f);
}
console.log(`Offline preparation verified: ${files.length} vendored assets; all runtime refs local.`);
