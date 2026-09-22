/**
 * A card's cinematic, from the editor's export to the board.
 *
 *   npm run cine -- ~/Downloads/harriet.mov harriet [--dry]
 *
 * Takes a clip with an alpha channel (Premiere or Media Encoder: QuickTime, Apple ProRes 4444, Depth "8-bpc + alpha"
 * or deeper) and writes the two files the game plays: `public/art/video/<name>.webm` (VP9 with alpha, Opus when the
 * clip has sound) for the web, and `unity/.../Resources/video/<name>.webm` (VP8 with alpha, Vorbis) for Unity. The
 * game's own fades are baked in here (a quarter second in, three quarters out, picture and sound together), the
 * sound is brought to one level, a clip larger than 720 square is brought down to 720, and nothing is scaled up.
 * `docs/cinematics.md` has the direction; `src/ui/cinematics.ts` is where the card gets its entry.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WEB_DIR = join(ROOT, 'public/art/video');
const UNITY_DIR = join(ROOT, 'unity/StandOnBusiness/Assets/StandOnBusiness/Resources/video');
/** The board draws a clip at up to 480px tall; 720 leaves room for a dense screen without a file twice the size. */
const MAX_SIDE = 720;
const FADE_IN = 0.25;
const FADE_OUT = 0.75;
/** The game's own cues sit around -16 LUFS and play at about 0.4 of full scale; the clip plays at 0.6, so -20 here lands beside them. */
const LOUDNESS = -20;
/** Files under public/art/video that are not cinematics: the board's backdrop. Never overwritten by this script. */
const RESERVED = ['board'];
/** The game stops waiting for a clip at this point (CINE_MAX_MS in src/ui/cinematics.ts, 6.5s): a longer clip is paused there. Three seconds is the direction. */
const MAX_PLAY = 6;

class CineError extends Error {}

function run(cmd: string, args: string[]): string {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.error) throw new CineError(`${cmd} could not run (${r.error.message}); ffmpeg and ffprobe must be on the PATH.`);
  if (r.status !== 0) throw new CineError(`${cmd} failed:\n${(r.stderr || r.stdout).trim()}`);
  return r.stdout;
}

interface Probe {
  width: number;
  height: number;
  fps: string;
  frames: number;
  duration: number;
  pixFmt: string;
  alpha: boolean;
  codec: string;
  audio: { codec: string; channels: number; rate: number } | null;
}

function probe(file: string): Probe {
  const out = run('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', file]);
  const j = JSON.parse(out) as { streams: Record<string, string | number>[]; format: { duration?: string } };
  const v = j.streams.find((s) => s.codec_type === 'video');
  if (!v) throw new CineError(`${file} has no video stream.`);
  const a = j.streams.find((s) => s.codec_type === 'audio');
  const pixFmt = String(v.pix_fmt ?? '');
  const duration = Number(v.duration ?? j.format.duration ?? 0);
  const [num, den] = String(v.r_frame_rate ?? '0/1').split('/').map(Number);
  const fps = den ? num / den : 0;
  return {
    width: Number(v.width),
    height: Number(v.height),
    fps: Number.isInteger(fps) ? String(fps) : fps.toFixed(3),
    frames: Number(v.nb_frames ?? Math.round(duration * fps)),
    duration,
    pixFmt,
    // yuva…, rgba, argb, gbrap: the formats that carry an alpha plane.
    alpha: /^(yuva|rgba|argb|abgr|bgra|gbrap|ayuv|vuya|ya|pal)/.test(pixFmt),
    codec: String(v.codec_name ?? '?'),
    audio: a ? { codec: String(a.codec_name), channels: Number(a.channels ?? 0), rate: Number(a.sample_rate ?? 0) } : null,
  };
}

function main(argv: string[]): number {
  let dry = false;
  const words: string[] = [];
  for (const a of argv) {
    if (a === '--dry') dry = true;
    else if (a.startsWith('-')) throw new CineError(`Unknown flag ${a}. The flags are: --dry.`);
    else words.push(a);
  }
  if (words.length !== 2) throw new CineError('Usage: npm run cine -- <clip.mov> <name> [--dry]   (the name is the file the game plays, e.g. harriet)');
  const [src, name] = words;
  if (!/^[a-z0-9-]+$/.test(name)) throw new CineError(`The name "${name}" must be lower-case letters, digits and dashes (it becomes ${name}.webm).`);
  if (RESERVED.includes(name)) throw new CineError(`"${name}" is the board's own video, not a card's clip; pick another name.`);
  if (!existsSync(src)) throw new CineError(`${src} does not exist.`);

  const p = probe(src);
  const lines = [
    `${src}: ${p.codec} ${p.width}x${p.height} ${p.pixFmt}, ${p.fps} fps, ${p.frames} frames (${p.duration.toFixed(2)}s), ${(statSync(src).size / 1048576).toFixed(1)} MB`,
    p.audio ? `sound: ${p.audio.codec}, ${p.audio.channels} ch at ${p.audio.rate} Hz (brought to ${LOUDNESS} LUFS, faded with the picture)` : 'sound: none (the clip plays silent)',
  ];
  if (!p.alpha) throw new CineError(`${src} carries no alpha channel (${p.pixFmt}). Export QuickTime, Apple ProRes 4444, Depth "8-bpc + alpha" (Premiere or Media Encoder), or render Channels: RGB + Alpha from After Effects.`);
  if (p.width !== p.height) lines.push(`note: the frame is not square (${p.width}x${p.height}); the board draws it at its own aspect, centred.`);
  if (p.duration > MAX_PLAY) lines.push(`note: ${p.duration.toFixed(1)}s is long for a board moment; the game stops waiting at 6.5s and pauses the clip there, before the fade-out. Three seconds is the direction.`);
  if (p.duration < 1) throw new CineError(`${src} is ${p.duration.toFixed(2)}s long; a cinematic is one to four seconds.`);
  const side = Math.max(p.width, p.height);
  const scale = side > MAX_SIDE ? `,scale=${p.width >= p.height ? `${MAX_SIDE}:-2` : `-2:${MAX_SIDE}`}:flags=lanczos` : '';
  if (side < 480) lines.push(`note: at ${p.width}x${p.height} the picture is scaled up on a big screen (the board draws it up to 480px tall). 720 square is the direction.`);
  const outStart = Math.max(0, p.duration - FADE_OUT);
  const vf = `format=yuva420p,fade=t=in:st=0:d=${FADE_IN}:alpha=1,fade=t=out:st=${outStart.toFixed(3)}:d=${FADE_OUT}:alpha=1${scale}`;
  // loudnorm works (and outputs) at 192 kHz; aresample brings the sound back to 48 kHz, the rate both codecs and Unity want.
  const af = `loudnorm=I=${LOUDNESS}:TP=-1.5:LRA=11,aresample=48000,afade=t=in:st=0:d=${FADE_IN},afade=t=out:st=${outStart.toFixed(3)}:d=${FADE_OUT}`;
  const web = join(WEB_DIR, `${name}.webm`);
  const unity = join(UNITY_DIR, `${name}.webm`);
  // -shortest: a sound track that runs past the last frame is cut with the picture, so the moment never holds on an empty clip.
  const common = ['-v', 'error', '-y', '-i', src, '-vf', vf, '-r', p.fps, '-map', '0:v:0', '-shortest'];
  const audioWeb = p.audio ? ['-map', '0:a:0', '-af', af, '-c:a', 'libopus', '-b:a', '64k', '-ac', '2'] : ['-an'];
  const audioUnity = p.audio ? ['-map', '0:a:0', '-af', af, '-c:a', 'libvorbis', '-q:a', '4', '-ac', '2'] : ['-an'];
  const webTmp = join(WEB_DIR, `.${name}.part.webm`);
  const unityTmp = join(UNITY_DIR, `.${name}.part.webm`);
  const webArgs = [...common, ...audioWeb, '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-crf', '30', '-b:v', '0', '-deadline', 'good', '-cpu-used', '2', '-row-mt', '1', '-auto-alt-ref', '0', webTmp];
  const unityArgs = [...common, ...audioUnity, '-c:v', 'libvpx', '-pix_fmt', 'yuva420p', '-crf', '12', '-b:v', '6M', '-deadline', 'good', '-cpu-used', '2', '-auto-alt-ref', '0', unityTmp];
  lines.push(`fades: ${FADE_IN}s in, ${FADE_OUT}s out from ${outStart.toFixed(2)}s${scale ? `; scaled to ${MAX_SIDE}` : ''}`);
  lines.push(`writes: ${web} (VP9 alpha${p.audio ? ' + Opus' : ''}) and ${unity} (VP8 alpha${p.audio ? ' + Vorbis' : ''})${existsSync(web) || existsSync(unity) ? `, replacing the ${name}.webm there now` : ''}`);
  console.log(lines.join('\n'));
  if (dry) {
    console.log('dry run: nothing written.');
    return 0;
  }
  mkdirSync(WEB_DIR, { recursive: true });
  mkdirSync(UNITY_DIR, { recursive: true });
  // Both encodes go to temporary files and take their places together at the end, so a failure part-way leaves the
  // files the game has as they were, and never a half-written one.
  try {
    run('ffmpeg', webArgs);
    run('ffmpeg', unityArgs);
  } catch (e) {
    for (const t of [webTmp, unityTmp]) if (existsSync(t)) rmSync(t);
    throw e;
  }
  renameSync(webTmp, web);
  renameSync(unityTmp, unity);
  const w = probe(web);
  console.log(`done: ${name}.webm ${(statSync(web).size / 1048576).toFixed(2)} MB (web, ${w.frames} frames${w.audio ? ', with sound' : ''}), ${(statSync(unity).size / 1048576).toFixed(2)} MB (Unity)`);
  console.log(`next: give the card its entry in src/ui/cinematics.ts (clip: '${name}.webm'${p.audio ? ', sound: true' : ''}), then look (npm run dev).`);
  return 0;
}

try {
  process.exit(main(process.argv.slice(2)));
} catch (e) {
  if (e instanceof CineError) {
    console.error(e.message);
    process.exit(2);
  }
  throw e;
}
