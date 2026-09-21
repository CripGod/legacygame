import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';

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

export default defineConfig({
  plugins: [react()],
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
