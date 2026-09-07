/**
 * Generates docs/copy.md (every player-facing string, for editing) and docs/art-spec.md
 * (image specs plus the list of art the game does not have yet). Run: npm run docs
 */
import fs from 'node:fs';
import path from 'node:path';
import { CHARACTERS, EVENTS, THREATS, LOCATIONS } from '../src/engine/content';

const root = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');
const unesc = (s: string) => s.replace(/\\'/g, "'").replace(/\\`/g, '`');
const lit = (s: string) => unesc(s.slice(1, -1));

/** String and template literals in a file, at least `min` characters, containing a space. */
function literals(file: string, min = 30): string[] {
  const src = read(file);
  const out = new Set<string>();
  for (const m of src.matchAll(/`(?:[^`\\]|\\.)*`|'(?:[^'\\\n]|\\.)*'/g)) {
    const v = lit(m[0]);
    if (v.length >= min && /\s/.test(v) && !/^import|^\.\//.test(v)) out.add(v);
  }
  return [...out];
}

/** Rough JSX to text: headings, bullets and paragraphs only. */
function jsxText(file: string): string {
  const src = read(file);
  const body = src.slice(src.indexOf('return ('));
  const lines: string[] = [];
  for (let raw of body.split('\n')) {
    let l = raw.trim();
    if (!l) continue;
    if (/^(import|export|const|let|function|return|\}|\)|\{|if\b|\/\/|\/\*)/.test(l) && !/<(h[1-3]|li|p|div|span|small|b)\b/.test(l)) continue;
    l = l.replace(/<h2[^>]*>/g, '\n### ').replace(/<h3[^>]*>/g, '\n#### ').replace(/<li[^>]*>/g, '- ');
    l = l.replace(/\{' '\}/g, ' ').replace(/&nbsp;/g, ' ').replace(/\{`([^`]*)`\}/g, '$1');
    l = l.replace(/<[^>]+>/g, '');
    l = l.replace(/\{[^{}]*\}/g, '…');
    l = l.trim();
    if (!/[A-Za-z]{3}/.test(l)) continue;
    if (/^[a-zA-Z_]+=|=>|\bclassName\b|\bonClick\b/.test(l)) continue;
    lines.push(l);
  }
  return lines.join('\n');
}

const md: string[] = [];
md.push('# Black History Card Battler: all copy', '', 'Everything a player reads, grouped by where it lives. Keep the `id` lines as they are; edit the text after the colons. Card `text` fields are rules text: keep numbers, keywords in CAPS, and the names of Locations, zones (Gates, Inside), and states (Ready, Fresh, Established, Suppressed, Setback, Legacy) unchanged.', '');

md.push('## Characters', '');
for (const c of CHARACTERS) {
  md.push(`### ${c.name} (\`${c.id}\`)`, `- cost ${c.cost} · Influence ${c.influence} · Force ${c.force} · ${c.category} · era: ${c.era}`);
  if (c.keywords.length) md.push(`- keywords: ${c.keywords.join(', ')}`);
  if (c.reveal) md.push(`- reveal: ${c.reveal.text}`);
  if (c.established) md.push(`- established: ${c.established.text}`);
  if (c.passive) md.push(`- passive: ${c.passive.text}`);
  if (c.spawn) md.push(`- arrives: ${(c.spawn as { headline: string }).headline} / button: ${(c.spawn as { cta: string }).cta}`);
  md.push(`- blurb: ${c.blurb}`);
  if (c.history) md.push(`- history: ${c.history}`);
  md.push('');
}
md.push('## Events', '');
for (const e of EVENTS) {
  md.push(`### ${e.name} (\`${e.id}\`)`, `- cost ${e.cost}`, `- text: ${e.text}`, `- blurb: ${e.blurb}`);
  if (e.spawn) md.push(`- arrives: ${(e.spawn as { headline: string }).headline} / button: ${(e.spawn as { cta: string }).cta}`);
  if (e.history) md.push(`- history: ${e.history}`);
  md.push('');
}
md.push('## Threats', '');
for (const t of THREATS) md.push(`### ${t.name} (\`${t.id}\`)`, `- family: ${t.family}`, `- text: ${t.text}`, `- blurb: ${t.blurb}`, '');
md.push('## Locations', '');
for (const l of LOCATIONS) md.push(`### ${l.name} (\`${l.id}\`)`, `- era: ${l.era}`, `- rule: ${l.rule}`, `- blurb: ${l.blurb}`, '');

md.push('## Hints (tap or hover explanations)', '');
for (const m of read('src/ui/tip.ts').matchAll(/^\s+(\w+): ('(?:[^'\\]|\\.)*'),?$/gm)) md.push(`- \`${m[1]}\`: ${lit(m[2])}`);
md.push('', '## Coach tips (first match)', '');
for (const m of read('src/ui/components/Coach.tsx').matchAll(/key: '(\w+)', text: ('(?:[^'\\]|\\.)*')/g)) md.push(`- \`${m[1]}\`: ${lit(m[2])}`);
md.push('', '## First-turn guide', '');
for (const s of literals('src/ui/guide.ts', 20)) md.push(`- ${s}`);
md.push('', '## Start screen', '', jsxText('src/ui/screens/StartScreen.tsx'));
md.push('', '## How to play (rules screen)', '', jsxText('src/ui/screens/RulesScreen.tsx'));
md.push('', '## Result screen', '', jsxText('src/ui/screens/ResultScreen.tsx'));
md.push('', '## In-match feedback, toasts and sheets', '');
for (const f of ['src/ui/screens/MatchScreen.tsx', 'src/ui/components/Sheets.tsx', 'src/ui/components/Battlefield.tsx', 'src/ui/components/Hand.tsx', 'src/ui/components/Hud.tsx', 'src/ui/display.ts']) {
  const ls = literals(f, 28);
  if (!ls.length) continue;
  md.push(`### ${f}`, '');
  for (const s of ls) md.push(`- ${s}`);
  md.push('');
}
md.push('## Turn log lines (engine)', '', 'Template fields in `${...}` are filled in by the game. Keep them.', '');
for (const f of ['src/engine/resolve.ts', 'src/engine/setup.ts', 'src/engine/query.ts']) {
  md.push(`### ${f}`, '');
  const src = read(f);
  const seen = new Set<string>();
  for (const m of src.matchAll(/(?:text:|say\(|errors\.push\()\s*(`(?:[^`\\]|\\.)*`|'(?:[^'\\\n]|\\.)*')/g)) {
    const v = lit(m[1]);
    if (v.length < 12 || seen.has(v)) continue;
    seen.add(v);
    md.push(`- ${v}`);
  }
  md.push('');
}
fs.writeFileSync(path.join(root, 'docs/copy.md'), md.join('\n'));

// ---------- art spec ----------
const has = (kind: string, id: string) => fs.existsSync(path.join(root, 'public/art', kind, `${id}.jpg`));
const missing = {
  characters: CHARACTERS.filter((c) => !has('characters', c.id)),
  events: EVENTS.filter((e) => !has('events', e.id)),
  threats: THREATS.filter((t) => !has('threats', t.id)),
  locations: LOCATIONS.filter((l) => !has('locations', l.id)),
  'locations (night)': LOCATIONS.filter((l) => l.curfew && !has('locations', `${l.id}_night`)).map((l) => ({ ...l, id: `${l.id}_night`, blurb: `Night version of ${l.name}: same framing, after dark. Shown on even turns, when its curfew is on: the town shut, lamps lit, nobody out.` })),
};
const spec: string[] = [];
spec.push('# Art spec', '', 'How every image is used, what to deliver, and what is still missing. File names are the ids in backticks; drop finished files in `public/art/<kind>/<id>.jpg` (the build inlines them).', '');
spec.push('## Sizes and framing', '');
spec.push('| Kind | Deliver | Stored as | Where it shows | Framing |', '|---|---|---|---|---|');
spec.push('| Character | 1024×1024 or larger, square | 512×512 JPG | Hand card (the top 5:5 of the card), Gate tile (square), Inside tile (small square, about 40 px on phones), avatar (circle crop of the center) | Head and shoulders, face in the upper-middle third, eyes about 40% down. Plain or softly lit background. No text, no frame. Must read at 40 px. |');
spec.push('| Threat | 1024×1024 square | 512×512 JPG | Threat chip (18 px round thumb), Threat sheet (220 px), confront animation | One clear silhouette, high contrast, a single strong color per Threat so the thumb is recognizable. Menace without gore. |');
spec.push('| Event | 1024×1024 square | 512×512 JPG | Hand card, card sheet | Same crop as Characters; scene rather than portrait. |');
spec.push('| Location (night) | Same as Location, file name `<id>_night` | 1024×1024 JPG | Only for Locations with a curfew (Sundown Town). Replaces the background on even turns, when the curfew is on. | Same composition as the day image so the swap reads as time passing, not a new place: moon or lamplight, windows lit, streets empty, the town shut. |');
spec.push('| Location | 1536×1536 square (1024 minimum) | 1024×1024 JPG | Full background of the Location panel under a dark gradient. Desktop crops to about 3:2 landscape, phones crop to a tall portrait. | Keep the subject inside the central 50% both ways so both crops keep it. Wide establishing shot, no people in the foreground, no text or signage that must be legible. Mid-tone, not dark: we darken it. Low fine detail, because a rule box and character tiles sit on top of it. |');
spec.push('', 'Format: PNG or JPG, sRGB, no transparency, no borders, no watermark, no typography. Consistent painterly style across a kind so the board reads as one set.', '');
spec.push('## Confrontation art (the Mob and the other bad guys)', '', 'Confronting a Threat should feel like a showdown. To stage it we want, per Threat:', '', '- The portrait above (square) for the chip and the sheet.', '- A second **wide** image, 1536×768, of the same Threat as a scene: the Mob filling a street, the Paddy Roller on horseback at a tree line, the Patrol at a checkpoint, the Complicit neighbor behind a curtain, the Restriction as a covenant document and a locked gate. This becomes the backdrop of the confront animation and of the Threat sheet.', '- Same palette per Threat as its portrait (one signature color each) so the two images pair.', '');
spec.push('## Missing', '');
for (const [kind, list] of Object.entries(missing)) {
  spec.push(`### ${kind} (${list.length})`, '');
  if (!list.length) spec.push('- none', '');
  for (const d of list as { id: string; name: string; blurb?: string; era?: string }[]) spec.push(`- \`${d.id}\` **${d.name}**${d.era ? ` (${d.era})` : ''}: ${d.blurb ?? ''}`);
  spec.push('');
}
spec.push('## Have', '');
for (const kind of ['characters', 'events', 'threats', 'locations']) {
  const dir = path.join(root, 'public/art', kind);
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.jpg')).map((f) => f.replace(/\.jpg$/, '')) : [];
  spec.push(`- ${kind}: ${files.join(', ')}`);
}
spec.push('');
fs.writeFileSync(path.join(root, 'docs/art-spec.md'), spec.join('\n'));
console.log('docs/copy.md', md.join('\n').length, 'chars ·', 'missing:', Object.entries(missing).map(([k, v]) => `${k} ${v.length}`).join(', '));
