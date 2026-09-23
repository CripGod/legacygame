/**
 * Cache-busting for the artwork: every file under public/art gets a short content hash, written to
 * src/ui/art-manifest.json, and artUrl() appends it as ?v=… so a replaced picture gets a new address and no
 * browser (or GitHub Pages' cache) keeps showing the old one. Runs before every build (npm's prebuild hook).
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = join(process.cwd(), 'public', 'art');
const out: Record<string, string> = {};
const walk = (dir: string) => {
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.(jpe?g|webp|png|svg|webm|mp4)$/i.test(name)) out[relative(root, full).split('\\').join('/')] = createHash('md5').update(readFileSync(full)).digest('hex').slice(0, 8);
  }
};
walk(root);
const target = join(process.cwd(), 'src', 'ui', 'art-manifest.json');
const next = JSON.stringify(out, null, 0);
let prev = '';
try { prev = readFileSync(target, 'utf8'); } catch { /* first run */ }
if (prev !== next) writeFileSync(target, next);
console.log(`art-manifest: ${Object.keys(out).length} files${prev !== next ? ' (updated)' : ''}`);
