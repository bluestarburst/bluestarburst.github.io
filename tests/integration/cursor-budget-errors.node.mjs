import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { chromium, expect } from '@playwright/test';
import { createServer } from 'vite';
import { allocatePorts } from '../../scripts/emulator-processes.mjs';

// Real shipping component and installed SDK; only the HTTP service is replaced.
// No dotenv, real credentials, hosted writes, or application lifecycle mocks.
test('cursor admission denials settle the rendered component', { timeout: 120_000 }, async (t) => {
  const root = fileURLToPath(new URL('../..', import.meta.url));
  const sdkRoot = process.env.OPENRTC_SOURCE_ROOT;
  if (sdkRoot) assert.ok(isAbsolute(sdkRoot), 'OPENRTC_SOURCE_ROOT must explicitly select an absolute reviewed worktree');
  const cacheDir = await mkdtemp(join(tmpdir(), 'portfolio-denial-'));
  t.after(() => rm(cacheDir, { recursive: true, force: true }));
  const runId = randomUUID();
  const { browser: port } = await allocatePorts(['browser']);
  const server = await createServer({
    root, configFile: false, envFile: false, cacheDir,
    resolve: sdkRoot ? { alias: [{ find: /^openrtc$/, replacement: join(sdkRoot, 'packages/openrtc/src/index.ts') }] } : undefined,
    define: {
      'import.meta.env.VITE_OPENRTC_API_KEY': JSON.stringify(`pk_live_${'0'.repeat(40)}`),
      'import.meta.env.VITE_TURNSTILE_SITE_KEY': '""',
    },
    server: { host: '127.0.0.1', port, strictPort: true },
    plugins: [{ name: 'denial-fixture', configureServer(vite) {
      vite.middlewares.use('/', async (req, res, next) => {
        if (req.url !== '/') return next();
        const html = await vite.transformIndexHtml('/', `<!doctype html>
          <html><body><div id="root" data-run-id="${runId}"></div>
          <script type="module">
            import React from 'react';
           import { createRoot } from 'react-dom/client';
           import { SharedCursors } from '/app/components/SharedCursors.tsx';
           createRoot(document.getElementById('root')).render(React.createElement(SharedCursors));
          </script></body></html>`);
        res.setHeader('Content-Type', 'text/html');
        res.end(html);
      });
    } }],
  });
  t.after(() => server.close());
  await server.listen();
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const origin = `http://127.0.0.1:${port}`;
  for (const [code, label] of [
    ['app-budget-exhausted', 'Cursor app budget exhausted'],
    ['provider-safety-paused', 'Cursor service temporarily paused'],
    ['app-rate-limited', 'Cursor app temporarily rate limited'],
  ]) await t.test(code, async () => {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    try {
      let attempts = 0;
      await context.route('**/*', async (route) => {
        const url = new URL(route.request().url());
        if (url.pathname === '/v2/capabilities' && route.request().method() === 'POST') {
          attempts++;
          return route.fulfill({ status: 429, contentType: 'application/json',
            headers: { 'Retry-After': '60', 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ code, scope: 'app', operation: 'capability.issue',
              retryable: false, retryAfterMs: 60_000, requestId: runId,
              documentationUrl: 'https://openrtc.app/docs/errors',
              error: 'sensitive-denial-detail-must-not-render' }),
          });
        }
        if (url.origin !== origin) return route.abort('blockedbyclient');
        return route.continue();
      });
      const page = await context.newPage();
      await page.goto(origin);
      await expect(page.locator('#root')).toHaveAttribute('data-run-id', runId);
      const presence = page.getByTestId('openrtc-presence');
      await expect(presence).toHaveAttribute('data-openrtc-status', label, { timeout: 15_000 });
      await expect(presence).toHaveAttribute('data-openrtc-connection-count', '0');
      await expect(presence).toHaveAttribute('data-remote-cursor-count', '0');
      assert.equal(attempts, 1, 'budget denials must not probe another space');
      assert.equal((await page.locator('body').innerText()).includes('sensitive-denial-detail'), false);
    } finally { await context.close(); }
  });
});
