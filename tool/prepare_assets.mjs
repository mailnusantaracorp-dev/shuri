// Offline, repeatable extraction from the JavaScript reference.
import { readFile, writeFile, mkdir, readdir, copyFile } from 'node:fs/promises';
import { resolve, join, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const source = join(root, 'game js');
const out = join(root, 'assets');
await mkdir(join(out, 'images'), { recursive: true });
await mkdir(join(out, 'json'), { recursive: true });
const manifest = JSON.parse(await readFile(join(source, 'assets.json'), 'utf8'));
async function walk(dir) {
  const files = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    files.push(...(e.isDirectory() ? await walk(p) : [p]));
  }
  return files;
}
const available = await walk(join(root, 'dummy'));
const mapping = {};
for (const [key, asset] of Object.entries(manifest)) {
  const name = basename(asset.src);
  const candidates = available.filter(p => basename(p) === name);
  const existing = join(out, 'images', name);
  const bytes = await readFile(candidates[0] ?? existing);
  if (bytes.toString('ascii', 0, 4) !== 'RIFF' ||
      bytes.toString('ascii', 8, 12) !== 'WEBP') throw Error(`Invalid WebP: ${name}`);
  if (candidates.length) await copyFile(candidates[0], existing);
  mapping[key] = name;
}
await writeFile(join(out, 'json', 'asset_paths.json'), JSON.stringify(mapping, null, 2) + '\n');
for (const name of ['assets.json', 'tweaks.json', 'data.json']) {
  const bytes = await readFile(join(source, name), 'utf8');
  JSON.parse(bytes);
  await writeFile(join(out, 'json', name), bytes);
}
const mod = name => import(pathToFileURL(join(source, 'game', name)).href);
const [{ AREAS }, { SKINS }, { ENEMIES, BOSSES, ENEMY_GLYPHS }, config] =
  await Promise.all([mod('areas.js'), mod('skins.js'), mod('bestiary.js'), mod('config.js')]);
const data = { areas: AREAS, skins: SKINS, enemies: ENEMIES, bosses: BOSSES,
  enemyGlyphs: ENEMY_GLYPHS, physics: config.PHYS, kuro: config.KURO,
  playerBox: config.PLAYER_BOX, cols: config.COLS, rows: config.ROWS };
if (AREAS.length !== 20 || AREAS.some(a => a.grid.length !== 40 ||
    a.grid.some(row => row.length !== 180))) throw Error('Invalid level grids');
await writeFile(join(out, 'json', 'game_data.json'), JSON.stringify(data, null, 2) + '\n');
console.log(`Prepared ${Object.keys(mapping).length} images, ${AREAS.length} areas, ${SKINS.length} skins.`);
