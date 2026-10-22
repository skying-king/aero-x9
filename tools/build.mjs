// Builds a fully self-contained, offline-openable HTML from src + vendored three.js.
// Usage: node tools/build.mjs [--out=dist/app.html]
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/s);
  return m ? [m[1], m[2]] : [a, true];
}));
const out = path.resolve(ROOT, args.out || 'dist/app.html');
const order = ['core.js', 'postfx.js', 'scene.js', 'drone.js', 'controls.js', 'ui.js', 'main.js'];

const [template, three] = await Promise.all([
  readFile(path.join(ROOT, 'src', 'index.template.html'), 'utf8'),
  readFile(path.join(ROOT, 'vendor', 'three.min.js'), 'utf8'),
]);
const sources = [];
for (const name of order) {
  const code = await readFile(path.join(ROOT, 'src', name), 'utf8').catch(() => `/* ${name} missing */`);
  sources.push(`/* ================= ${name} ================= */\n;(function(){\n${code}\n})();`);
}
const app = sources.join('\n');
let html = template
  .replace('/*__THREE__*/', () => three)
  .replace('/*__APP__*/', () => app);
await mkdir(path.dirname(out), { recursive: true });
await writeFile(out, html);
const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
console.log(`BUILT ${path.relative(ROOT, out)} (${kb} KB)`);
console.log(`PAGE  ${pathToFileURL(out).href}`);
