/**
 * Confirms every reference link answers: a HEAD (then GET) request per URL, in series, with a short timeout.
 * Run on a connected machine: `npm run refs:check`. Exits non-zero if any link fails.
 */
import { REFERENCES, MORE_REFERENCES } from '../src/engine/content/references';

const urls = [...new Set([...Object.values(REFERENCES).flat(), ...Object.values(MORE_REFERENCES).flat()].map((r) => r.url))];
let bad = 0;
for (const url of urls) {
  let status = 0;
  for (const method of ['HEAD', 'GET']) {
    try {
      const res = await fetch(url, { method, redirect: 'follow', signal: AbortSignal.timeout(15000), headers: { 'user-agent': 'stand-on-business refs-check' } });
      status = res.status;
      if (res.ok) break;
    } catch {
      status = 0;
    }
  }
  const ok = status >= 200 && status < 400;
  if (!ok) bad++;
  console.log(`${ok ? 'ok ' : 'BAD'} ${status || '---'} ${url}`);
}
console.log(`${urls.length} links, ${bad} failing`);
process.exit(bad ? 1 : 0);
