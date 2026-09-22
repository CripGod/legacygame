/**
 * Import a UI Kit Maker cut into the game.
 *
 *   npm run kit -- <cut.zip | folder> [--only piece,piece] [--skip name,name] [--dry]
 *
 * A cut is what UIKM exports: a manifest.json, a README and pieces/<piece>/<file>.png (2x sprites, numbers at 1x),
 * sometimes with SVGs. This script turns it into what the game reads:
 *
 *   public/art/kit/<prefix>-<name>.webp   the sprites (PNG to WebP; SVGs copied as they are)
 *   src/ui/kit-geometry.json               the numbers the CSS lays the piece out by (canvas, shell, seats)
 *   src/ui/art-manifest.json               refreshed, so every replaced picture gets a new address
 *
 * Each piece id the game knows maps to a prefix (the CSS names) and a table of the files it draws; a file the table
 * does not list is reported and left out (a bare wordmark, a placeholder portrait), and a piece the table does not
 * know is reported and left out. The numbers are read and checked before any file is written, so a cut of the wrong
 * shape changes nothing. A new piece means a new row here and CSS that reads its numbers; a re-export of a known
 * piece is this one command, then a look, then a commit. kitVars() (src/ui/art.ts) turns every number in
 * kit-geometry.json into a CSS variable, --kit-<prefix>-<path>, so a cut exported with a different shell or seat
 * lays itself out. See docs/kit.md.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

type Box = { x: number; y: number; w: number; h: number };
type Size = { w: number; h: number };
type Piece = Record<string, unknown> & { id: string };
type Manifest = { kit?: string; cut?: string; pngScale?: number; pieces: Piece[] };
type Geometry = Record<string, Record<string, unknown>>;

/** A path into the piece, dots walking down; `undefined` when any step is missing. */
function get(obj: unknown, dotted: string): unknown {
  return dotted.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), obj);
}
class CutError extends Error {}
/** The number at a path, or a clear complaint naming the piece and the path. */
function num(piece: Piece, dotted: string): number {
  const v = get(piece, dotted);
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new CutError(`${piece.id}: the manifest has no number at ${dotted}`);
  return v;
}
function size(piece: Piece, dotted: string): Size {
  return { w: num(piece, `${dotted}.w`), h: num(piece, `${dotted}.h`) };
}
function box(piece: Piece, dotted: string): Box {
  return { x: num(piece, `${dotted}.x`), y: num(piece, `${dotted}.y`), w: num(piece, `${dotted}.w`), h: num(piece, `${dotted}.h`) };
}
/** The numbers of a plain object (a lift table), or nothing. */
function numbersOf(piece: Piece, dotted: string): Record<string, number> | undefined {
  const o = get(piece, dotted);
  if (!o || typeof o !== 'object') return undefined;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(o as Record<string, unknown>)) if (typeof v === 'number') out[k] = v;
  return Object.keys(out).length ? out : undefined;
}

/** Piece id to the game's prefix, the files it draws (manifest path to asset name) and the numbers it reads. */
const PIECES: Record<string, { prefix: string; files: Record<string, string>; read: (p: Piece) => Record<string, unknown> }> = {
  'sob-button': {
    prefix: 'sob',
    files: { 'files.default': 'default', 'files.hover': 'hover', 'files.pressed': 'pressed', 'files.disabled': 'disabled', 'files.wordmark': 'wordmark', 'files.shineEdge': 'shine-edge', 'files.shineWipe': 'shine-wipe', 'files.plateStill': 'plate-still' },
    read: readStrip,
  },
  // The strip's silver finish: the same piece, the same numbers, the resting state (docs/kit.md).
  'sob-button-silver': {
    prefix: 'sob-silver',
    files: { 'files.default': 'default', 'files.hover': 'hover', 'files.disabled': 'disabled', 'files.wordmark': 'wordmark', 'files.shineEdge': 'shine-edge', 'files.shineWipe': 'shine-wipe', 'files.plateStill': 'plate-still' },
    read: readStrip,
  },
  'turn-tracker': {
    prefix: 'tt',
    files: { 'files.plate': 'plate', 'files.plateDisabled': 'plate-disabled', 'files.coinLit': 'coin-lit', 'files.coinUnlit': 'coin-unlit' },
    read: (p) => {
      const coins = get(p, 'at1x.coins') as { centresRelShell?: { x: number; y: number }[] } | undefined;
      const centres = coins?.centresRelShell;
      const last = centres ? centres.length - 1 : -1;
      return {
        size: size(p, 'at1x.size'),
        shell: box(p, 'at1x.shell'),
        ...(get(p, 'at1x.title') ? { title: { x: num(p, 'at1x.title.centreRelShell.x'), y: num(p, 'at1x.title.centreRelShell.y'), size: num(p, 'at1x.title.fontSize') } } : {}),
        // The coins' row: one sprite size, one y, and the first and last centres (the CSS spaces the turns between them).
        ...(centres && last >= 0 ? { coins: { count: num(p, 'at1x.coins.count'), sprite: num(p, 'at1x.coins.sprite.w'), y: num(p, 'at1x.coins.centresRelShell.0.y'), firstX: num(p, 'at1x.coins.centresRelShell.0.x'), lastX: num(p, `at1x.coins.centresRelShell.${last}.x`) } } : {}),
      };
    },
  },
  'nameplate-you': { prefix: 'np-you', files: { 'strip.file': 'strip', 'avatar.files.ring': 'ring', 'avatar.files.levelChip': 'chip' }, read: readNameplate },
  'nameplate-opponent': { prefix: 'np-opp', files: { 'strip.file': 'strip', 'avatar.files.ring': 'ring', 'avatar.files.levelChip': 'chip' }, read: readNameplate },
};

function readStrip(p: Piece): Record<string, unknown> {
  return {
    size: size(p, 'at1x.size'),
    shell: box(p, 'at1x.shell'),
    lift: numbersOf(p, 'at1x.lift'),
    // The wordmark's seat: its centre from the shell's centre, and the shadow-baked file's drawn size, in the plate's 1x px.
    ...(get(p, 'wordmark.seat') ? { wordmark: { dx: num(p, 'wordmark.seat.centreRelPlateCentre.x'), dy: num(p, 'wordmark.seat.centreRelPlateCentre.y'), w: num(p, 'wordmark.seat.fileDrawnWidthAtPlate1x'), h: num(p, 'wordmark.seat.fileDrawnHeightAtPlate1x') } } : {}),
    // Where the shine SVGs sit on the PNG canvas: the viewBox's origin from the PNG's top-left, and its size.
    ...(get(p, 'idle.svgGeometry') ? { svg: { x: num(p, 'idle.svgGeometry.viewBox.x') - num(p, 'idle.svgGeometry.pngTopLeftInViewBox.x'), y: num(p, 'idle.svgGeometry.viewBox.y') - num(p, 'idle.svgGeometry.pngTopLeftInViewBox.y'), w: num(p, 'idle.svgGeometry.viewBox.w'), h: num(p, 'idle.svgGeometry.viewBox.h') } } : {}),
  };
}
function readNameplate(p: Piece): Record<string, unknown> {
  return {
    strip: { size: size(p, 'strip.at1x.size'), shell: box(p, 'strip.at1x.shell') },
    avatar: {
      size: size(p, 'avatar.at1x.size'),
      shell: box(p, 'avatar.at1x.shell'),
      ...(get(p, 'avatar.at1x.portraitWell') ? { portrait: { cx: num(p, 'avatar.at1x.portraitWell.cx'), cy: num(p, 'avatar.at1x.portraitWell.cy'), r: num(p, 'avatar.at1x.portraitWell.r') } } : {}),
      ...(get(p, 'avatar.at1x.levelChip') ? { chip: { cx: num(p, 'avatar.at1x.levelChip.cx'), cy: num(p, 'avatar.at1x.levelChip.cy'), r: num(p, 'avatar.at1x.levelChip.r') } } : {}),
      ...(get(p, 'avatar.at1x.levelText') ? { level: { cx: num(p, 'avatar.at1x.levelText.cx'), cy: num(p, 'avatar.at1x.levelText.cy'), size: num(p, 'avatar.at1x.levelText.fontSize') } } : {}),
    },
  };
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

// The arguments: a flag takes the next word or an =value; the one bare word is the cut. A bad one is a plain line, not a stack.
const argv = process.argv.slice(2);
const opts: { only?: string; skip?: string; dry: boolean; input?: string } = { dry: false };
try {
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  const take = (name: 'only' | 'skip') => {
    const eq = a.indexOf('=');
    const v = eq >= 0 ? a.slice(eq + 1) : argv[++i];
    if (!v || v.startsWith('--')) throw new CutError(`--${name} needs a value (piece ids or file names, comma-separated)`);
    opts[name] = v;
  };
  if (a === '--dry') opts.dry = true;
  else if (a === '--only' || a.startsWith('--only=')) take('only');
  else if (a === '--skip' || a.startsWith('--skip=')) take('skip');
  else if (a.startsWith('--')) throw new CutError(`unknown option ${a}`);
  else if (opts.input) throw new CutError(`one cut at a time (got ${opts.input} and ${a})`);
  else opts.input = a;
}
} catch (e) {
  if (e instanceof CutError) {
    console.error(`kit: ${e.message}`);
    process.exit(2);
  }
  throw e;
}
if (!opts.input) {
  console.error('usage: npm run kit -- <cut.zip | folder> [--only piece,piece] [--skip name,name] [--dry]');
  process.exit(2);
}
const only = opts.only?.split(',').map((s) => s.trim()).filter(Boolean);
const skip = new Set((opts.skip ?? '').split(',').map((s) => s.trim()).filter(Boolean));
const dry = opts.dry;

// Paths are the repository's, wherever the script is run from.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'public', 'art', 'kit');
const geometryPath = path.join(root, 'src', 'ui', 'kit-geometry.json');

let tmp: string | null = null;
try {
  // The cut: a folder, or a zip unpacked to a temporary folder.
  let dir = path.resolve(opts.input);
  if (!fs.existsSync(dir)) throw new CutError(`no such file or folder: ${dir}`);
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
    throw new CutError(`no manifest.json under ${dir}`);
  })();
  const cutDir = path.dirname(manifestPath);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Manifest;
  if (!Array.isArray(manifest.pieces)) throw new CutError(`${manifestPath}: no pieces array`);
  console.log(`kit: ${manifest.kit ?? '?'}: ${manifest.cut ?? path.basename(opts.input)}`);
  if (manifest.pngScale !== undefined && manifest.pngScale !== 2) console.log(`  note: pngScale is ${manifest.pngScale}; the game's kit sprites are 2x`);

  // --only and --skip must name things the cut has, or a typo would quietly import nothing.
  const ids = manifest.pieces.map((p) => p.id);
  for (const id of only ?? []) if (!ids.includes(id)) throw new CutError(`--only ${id}: the cut has no such piece (it has ${ids.join(', ')})`);
  const names = new Set(manifest.pieces.flatMap((p) => Object.values(PIECES[p.id]?.files ?? {})));
  for (const s of skip) if (!names.has(s)) throw new CutError(`--skip ${s}: no such file in the cut's known pieces (they have ${[...names].join(', ')})`);

  // First the numbers, every piece, so a cut of the wrong shape changes nothing.
  const geometry: Geometry = fs.existsSync(geometryPath) ? (JSON.parse(fs.readFileSync(geometryPath, 'utf8')) as Geometry) : {};
  const before: Record<string, number> = {};
  leaves('', geometry, before);
  const plan: { piece: Piece; spec: (typeof PIECES)[string]; numbers: Record<string, unknown> }[] = [];
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
    plan.push({ piece, spec, numbers: round(spec.read(piece)) as Record<string, unknown> });
  }
  for (const { spec, numbers } of plan) geometry[spec.prefix] = numbers;
  const after: Record<string, number> = {};
  leaves('', geometry, after);
  const changed = Object.keys(after).filter((k) => before[k] !== after[k]);

  // Then the files.
  let wrote = 0;
  for (const { piece, spec } of plan) {
    console.log(`  ${piece.id} -> ${spec.prefix}-*`);
    const drawn = new Set<string>();
    for (const [dotted, name] of Object.entries(spec.files)) {
      const rel = get(piece, dotted);
      const target = path.join(outDir, `${spec.prefix}-${name}${typeof rel === 'string' && path.extname(rel).toLowerCase() === '.svg' ? '.svg' : '.webp'}`);
      if (typeof rel !== 'string') {
        console.log(`    ${name}: the cut carries no ${dotted}; ${path.relative(root, target)} stays as it is`);
        continue;
      }
      drawn.add(rel);
      if (skip.has(name)) {
        console.log(`    ${name}: skipped (--skip)`);
        continue;
      }
      const src = path.join(cutDir, rel);
      if (!fs.existsSync(src)) {
        console.log(`    ${name}: ${rel} is missing from the cut; ${path.relative(root, target)} stays as it is`);
        continue;
      }
      if (dry) {
        console.log(`    ${name}: ${rel} -> ${path.relative(root, target)} (dry)`);
        wrote++;
        continue;
      }
      if (path.extname(src).toLowerCase() === '.svg') fs.copyFileSync(src, target);
      else {
        const image = sharp(src);
        const meta = await image.metadata();
        await image.webp({ quality: 92, effort: 6 }).toFile(target);
        console.log(`    ${name}: ${meta.width}x${meta.height} -> ${path.relative(root, target)}`);
      }
      wrote++;
    }
    // Files the cut carries that the game does not draw (a path listed twice, a state's file again under idle, is drawn).
    const carried = new Map<string, string>();
    const walk = (node: unknown, trail: string) => {
      if (!node || typeof node !== 'object') return;
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        if ((k === 'files' || k === 'file') && v) {
          const entries: [string, string][] = typeof v === 'string' ? [[trail || 'file', v]] : Object.entries(v as Record<string, string>);
          for (const [fk, rel] of entries) if (typeof rel === 'string' && !drawn.has(rel) && !carried.has(rel)) carried.set(rel, fk);
        } else if (typeof v === 'object') walk(v, k);
      }
    };
    walk(piece, '');
    if (carried.size) console.log(`    not drawn by the game, left out: ${[...carried.values()].join(', ')}`);
  }

  console.log(changed.length ? `  geometry${dry ? ' would change' : ' changed'}:\n${changed.map((k) => `    ${k.slice(1)}: ${before[k] ?? 'new'} -> ${after[k]}`).join('\n')}` : '  geometry unchanged');
  if (!dry) {
    fs.writeFileSync(geometryPath, `${JSON.stringify(geometry, null, 1)}\n`);
    execFileSync('npx', ['tsx', 'scripts/art-manifest.ts'], { stdio: 'inherit', cwd: root });
  }
  console.log(`${dry ? 'would write' : 'wrote'} ${wrote} file${wrote === 1 ? '' : 's'}`);
} catch (e) {
  if (e instanceof CutError) {
    console.error(`kit: ${e.message}`);
    process.exit(1);
  }
  throw e;
} finally {
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
}
