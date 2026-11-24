import {readdir, readFile, writeFile} from 'node:fs/promises';
import {join, relative} from 'node:path';
import {createHash} from 'node:crypto';
const directory = 'vendor/mediapipe-hands';
const files = [];
async function scan(dir) {
  for (const d of await readdir(dir, {withFileTypes: true})) {
    const full = join(dir, d.name);
    if (d.isDirectory()) await scan(full);
    else if (d.isFile()) {
      const bytes = await readFile(full);
      files.push({file: relative('.', full).replaceAll('\\', '/'), bytes: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex')});
    }
  }
}
await scan(directory);
files.sort((a,b)=>a.file.localeCompare(b.file));
if (!files.some(x=>x.file.endsWith('/hands.js')) || !files.some(x=>x.file.endsWith('.wasm')) || !files.some(x=>x.file.endsWith('.data'))) {
  throw new Error('Incomplete MediaPipe vendor installation (missing JS/WASM/data)');
}
await writeFile('vendor/offline-assets.json', JSON.stringify({version:'0.4.1675469240', files:files.map(x=>x.file)},null,2)+'\n');
await writeFile('vendor/SHA256SUMS.json', JSON.stringify({source:'@mediapipe/hands@0.4.1675469240 (npm)', files},null,2)+'\n');
console.log(`Bundled ${files.length} assets (${Math.round(files.reduce((n,x)=>n+x.bytes,0)/1024/1024)} MiB).`);
