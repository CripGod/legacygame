/**
 * Import a UI Kit Maker cut into the game.
 *
 *   npm run kit -- <cut.zip | folder> [--only piece,piece] [--skip fileKey,fileKey] [--dry]
 *
 * A cut is what UIKM exports: a manifest.json, a README and pieces/<piece>/<file>.png (2x sprites, numbers at 1x),
 * sometimes with SVGs. This script turns it into what the game reads:
 *
 *   public/art/kit/<prefix>-<name>.webp   the sprites (PNG to WebP; SVGs copied as they are)
 *   src/ui/kit-geometry.json               the numbers the CSS lays the piece out by (canvas, shell, seats)
 *   src/ui/art-manifest.json               refreshed, so every replaced picture gets a new address
 *
 * Each piece id the game knows maps to a prefix (the CSS names) and a table of the files it uses; a file the table
 * does not list is reported and left out (a bare wordmark, a placeholder portrait), and a piece the table does not
 * know is reported and left out. A new piece means a new row here and CSS that reads its numbers; a re-export of a
 * known piece is this one command, then a look, then a commit. kitVars() (src/ui/art.ts) turns every number in
 * kit-geometry.json into a CSS variable, --kit-<prefix>-<path>, so a cut exported with a different shell or seat
 * lays itself out. See docs/kit.md.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';

type Num = number;
type Box = { x: Num; y: Num; w: Num; h: Num };
type Size = { w: Num; h: Num };
type Piece = Record<string, unknown> & { id: string };
type Manifest = { kit?: string; cut?: string; pngScale?: number; pieces: Piece[] };
type Geometry = Record<string, Record<string, unknown>>;

/** Piece id to the game's prefix and the files it draws: manifest path (dots walk into the piece) to the asset name. */
const PIECES: Record<string, { prefix: string; files: Record<string, string>; read: (p: Piece) => Record<string, unknown> }> = {
  'sob-button': {
    prefix: 'sob',
    files: { 'files.default': 'default', 'files.hover': 'hover', 'files.pressed': 'pressed', 'files.disabled': 'disabled', 'files.wordmark': 'wordmark', 'files.shineEdge': 'shine-edge', 'files.shineWipe': 'shine-wipe', 'files.plateStill': 'plate-still' },
    read: (p) => {
      const at = get(p, 'at1x') as { size: Size; shell: Box; lift?: Record<string, unknown> };
      const seat = get(p, 'wordmark.seat') as { centreRelPlateCentre: { x: Num; y: Num }; fileDrawnWidthAtPlate1x: Num; fileDrawnHeightAtPlate1x: Num } | undefined;
      const svg = get(p, 'idle.svgGeometry') as { viewBox: Box; pngTopLeftInViewBox: { x: Num; y: Num } } | undefined;
      return {
        size: at.size,
        shell: at.shell,
        lift: numbersOf(at.lift),
        // The wordmark's seat: its centre from the shell's centre, and the shadow-baked file's drawn size, in the plate's 1x px.
        ...(seat ? { wordmark: { dx: seat.centreRelPlateCentre.x, dy: seat.centreRelPlateCentre.y, w: seat.fileDrawnWidthAtPlate1x, h: seat.fileDrawnHeightAtPlate1x } } : {}),
        // Where the shine SVGs sit on the PNG canvas: the viewBox's origin from the PNG's top-left, and its size.
        ...(svg ? { svg: { x: svg.viewBox.x - svg.pngTopLeftInViewBox.x, y: svg.viewBox.y - svg.pngTopLeftInViewBox.y, w: svg.viewBox.w, h: svg.viewBox.h } } : {}),
      };
    },
  },
  'turn-tracker': {
    prefix: 'tt',
    files: { 'files.plate': 'plate', 'files.plateDisabled': 'plate-disabled', 'files.coinLit': 'coin-lit', 'files.coinUnlit': 'coin-unlit' },
    read: (p) => {
      const at = get(p, 'at1x') as { size: Size; shell: Box; title?: { centreRelShell: { x: Num; y: Num }; fontSize: Num }; coins?: { count: Num; sprite: Size; centresRelShell: { x: Num; y: Num }[] } };
      const c = at.coins;
      return {
        size: at.size,
        shell: at.shell,
        ...(at.title ? { title: { x: at.title.centreRelShell.x, y: at.title.centreRelShell.y, size: at.title.fontSize } } : {}),
        // The coins' row: one sprite size, one y, and the first and last centres (the CSS spaces the turns between them).
        ...(c ? { coins: { count: c.count, sprite: c.sprite.w, y: c.centresRelShell[0].y, firstX: c.centresRelShell[0].x, lastX: c.centresRelShell[c.centresRelShell.length - 1].x } } : {}),
      };
    },
  },
  'nameplate-you': { prefix: 'np-you', files: { 'strip.file': 'strip', 'avatar.files.ring': 'ring', 'avatar.files.levelChip': 'chip' }, read: readNameplate },
  'nameplate-opponent': { prefix: 'np-opp', files: { 'strip.file': 'strip', 'avatar.files.ring': 'ring', 'avatar.files.levelChip': 'chip' }, read: readNameplate },
};

function readNameplate(p: Piece): Record<string, unknown> {
  const strip = get(p, 'strip.at1x') as { size: Size; shell: Box };
  const av = get(p, 'avatar.at1x') as { size: Size; shell: Box; portraitWell?: { cx: Num; cy: Num; r: Num }; levelChip?: { cx: Num; cy: Num; r: Num }; levelText?: { cx: Num; cy: Num; fontSize: Num } };
  return {
    strip: { size: strip.size, shell: strip.shell },
    avatar: {
      size: av.size,
      shell: av.shell,
      ...(av.portraitWell ? { portrait: { cx: av.portraitWell.cx, cy: av.portraitWell.cy, r: av.portraitWell.r } } : {}),
      ...(av.levelChip ? { chip: { cx: av.levelChip.cx, cy: av.levelChip.cy, r: av.levelChip.r } } : {}),
      ...(av.levelText ? { level: { cx: av.levelText.cx, cy: av.levelText.cy, size: av.levelText.fontSize } } : {}),
    },
  };
}

function get(obj: unknown, dotted: string): unknown {
  return dotted.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), obj);
}
function numbersOf(o: Record<string, unknown> | undefined): Record<string, number> | undefined {
  if (!o) return undefined;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(o)) if (typeof v === 'number') out[k] = v;
  return Object.keys(out).length ? out : undefined;
}
function round(v: unknown): unknown {
  if (typeof v === 'number') return Math.round(v * 100) / 100;
  if (Array.isArray(v)) return v.map(round);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== undefined).map(([k, x]) => [k, round(x)]));
  return v;
}
/** Every number in a nested object as "path: value" lines, for the change report. */
function leaves(prefix: string, node: unknown, out: Record<string, number>): void {
  if (typeof node === 'number') out[prefix] = node;
  else if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) leaves(`${prefix}.${k}`, v, out);
}

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const dry = args.includes('--dry');
const only = flag('--only')?.split(',').map((s) => s.trim()).filter(Boolean);
const skip = new Set((flag('--skip') ?? '').split(',').map((s) => s.trim()).filter(Boolean));
const input = args.find((a) => !a.startsWith('--') && a !== flag('--only') && a !== flag('--skip'));
if (!input) {
  console.error('usage: npm run kit -- <cut.zip | folder> [--only piece,piece] [--skip fileKey,fileKey] [--dry]');
  process.exit(2);
}

// The cut: a folder, or a zip unpacked to a temporary folder.
let dir = path.resolve(input);
let tmp: string | null = null;
if (fs.statSync(dir).isFile()) {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-'));
  execFileSync('unzip', ['-o', '-q', dir, '-d', tmp]);
  dir = tmp;
}
const manifestPath = (() => {
  const direct = path.join(dir, 'manifest.json');
  if (fs.existsSync(direct)) return direct;
  for (const entry of fs.readdirSync(dir)) {
    const nested = path.join(dir, entry, 'manifest.json');
    if (fs.existsSync(nested)) return nested;
  }
  throw new Error(`no manifest.json under ${dir}`);
})();
const cutDir = path.dirname(manifestPath);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Manifest;
console.log(`kit: ${manifest.kit ?? '?'}: ${manifest.cut ?? path.basename(input)}`);
if (manifest.pngScale !== undefined && manifest.pngScale !== 2) console.log(`  note: pngScale is ${manifest.pngScale}; the game's kit sprites are 2x`);

const root = process.cwd();
const outDir = path.join(root, 'public', 'art', 'kit');
const geometryPath = path.join(root, 'src', 'ui', 'kit-geometry.json');
const geometry: Geometry = fs.existsSync(geometryPath) ? (JSON.parse(fs.readFileSync(geometryPath, 'utf8')) as Geometry) : {};
const before: Record<string, number> = {};
leaves('', geometry, before);

let wrote = 0;
for (const piece of manifest.pieces) {
  const spec = PIECES[piece.id];
  if (!spec) {
    console.log(`  ${piece.id}: not a piece the game knows (add it to scripts/kit.ts PIECES); left out`);
    continue;
  }
  if (only && !only.includes(piece.id)) {
    console.log(`  ${piece.id}: not in --only; left out`);
    continue;
  }
  console.log(`  ${piece.id} -> ${spec.prefix}-*`);
  // The files the game draws.
  for (const [dotted, name] of Object.entries(spec.files)) {
    const key = dotted.split('.').pop()!;
    const rel = get(piece, dotted);
    if (typeof rel !== 'string') continue;
    if (skip.has(key) || skip.has(`${piece.id}.${key}`)) {
      console.log(`    ${key}: skipped (--skip)`);
      continue;
    }
    const src = path.join(cutDir, rel);
    if (!fs.existsSync(src)) {
      console.log(`    ${key}: ${rel} is missing from the cut`);
      continue;
    }
    const ext = path.extname(src).toLowerCase();
    const target = path.join(outDir, `${spec.prefix}-${name}${ext === '.svg' ? '.svg' : '.webp'}`);
    if (dry) {
      console.log(`    ${key}: ${rel} -> ${path.relative(root, target)} (dry)`);
      wrote++;
      continue;
    }
    if (ext === '.svg') fs.copyFileSync(src, target);
    else {
      const image = sharp(src);
      const meta = await image.metadata();
      await image.webp({ quality: 92, effort: 6 }).toFile(target);
      console.log(`    ${key}: ${meta.width}x${meta.height} -> ${path.relative(root, target)}`);
    }
    wrote++;
  }
  // Files the cut carries that the game does not draw (a path listed twice, a state's file again under idle, is drawn).
  const drawn = new Set(Object.keys(spec.files).map((d) => get(piece, d)).filter((v): v is string => typeof v === 'string'));
  const carried: string[] = [];
  const walk = (node: unknown, trail: string) => {
    if (!node || typeof node !== 'object') return;
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if ((k === 'files' || k === 'file') && v) {
        const entries = typeof v === 'string' ? [[trail || 'file', v]] : Object.entries(v as Record<string, string>);
        for (const [fk, rel] of entries) if (!drawn.has(rel) && !carried.includes(fk)) carried.push(fk);
      } else if (typeof v === 'object') walk(v, k);
    }
  };
  walk(piece, '');
  if (carried.length) console.log(`    not drawn by the game, left out: ${carried.join(', ')}`);
  // The numbers.
  geometry[spec.prefix] = round(spec.read(piece)) as Record<string, unknown>;
}

if (!dry) {
  fs.writeFileSync(geometryPath, `${JSON.stringify(geometry, null, 1)}\n`);
  const after: Record<string, number> = {};
  leaves('', geometry, after);
  const changed = Object.keys(after).filter((k) => before[k] !== after[k]);
  console.log(changed.length ? `  geometry changed:\n${changed.map((k) => `    ${k.slice(1)}: ${before[k] ?? 'new'} -> ${after[k]}`).join('\n')}` : '  geometry unchanged');
  execFileSync('npx', ['tsx', 'scripts/art-manifest.ts'], { stdio: 'inherit' });
}
console.log(`${dry ? 'would write' : 'wrote'} ${wrote} file${wrote === 1 ? '' : 's'}`);
if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
