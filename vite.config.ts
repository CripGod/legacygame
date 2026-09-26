import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Build stamp shown on the landing page: commit count and UTC time of this build. */
function buildStamp(): string {
  let count = '0';
  let shallow = false;
  try {
    count = execSync('git rev-list --count HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    shallow = execSync('git rev-parse --is-shallow-repository', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() === 'true';
  } catch {
    /* no git: keep 0 */
  }
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  // A hosted build (Vercel) clones shallow, so the commit count would be wrong there: the short commit hash stands in.
  const sha = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7);
  const id = shallow && sha ? sha : String(Number(count) + 1);
  return `${id} · ${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

/** Dev server only: the effects editor (?fx=1) saves a preset back into src/ui/fx/presets/<id>.json (POST /__fx/save). */
function fxSave(): Plugin {
  return {
    name: 'fx-save',
    configureServer(server) {
      server.middlewares.use('/__fx/save', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          return res.end();
        }
        let body = '';
        req.on('data', (c: Buffer) => (body += c));
        req.on('end', () => {
          res.setHeader('Content-Type', 'application/json');
          try {
            const p = JSON.parse(body) as { id?: string };
            if (!p.id || !/^[a-z0-9-]+$/.test(p.id)) throw new Error('id must be lowercase letters, digits and dashes');
            writeFileSync(join(__dirname, 'src/ui/fx/presets', `${p.id}.json`), JSON.stringify(p, null, 2) + '\n');
            res.end(JSON.stringify({ ok: true }));
          } catch (e) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: String(e instanceof Error ? e.message : e) }));
          }
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), fxSave()],
  base: './',
  /* CSS is minified by lightningcss. Without a target it keeps a hand-written -webkit-backdrop-filter and drops the
     standard one, which Chromium does not read; with a target it writes the Safari prefix itself from the standard
     property, so the sources carry backdrop-filter alone. */
  build: { cssTarget: ['chrome100', 'safari15', 'firefox103'] },
  define: { __BUILD__: JSON.stringify(buildStamp()) },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
