import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';

/** Build stamp shown on the landing page: commit count and UTC time of this build. */
function buildStamp(): string {
  let count = '0';
  try {
    count = execSync('git rev-list --count HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    /* no git: keep 0 */
  }
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${Number(count) + 1} · ${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

export default defineConfig({
  plugins: [react()],
  base: './',
  define: { __BUILD__: JSON.stringify(buildStamp()) },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
