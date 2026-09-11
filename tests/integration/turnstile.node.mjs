import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { once } from 'node:events';
import test from 'node:test';
import { chromium, firefox } from '@playwright/test';
import { transformWithEsbuild } from 'vite';

// Official public test keys only. No OpenRTC identity, backend, secret store,
// production widget, or application build configuration is used by this test.
// https://developers.cloudflare.com/turnstile/troubleshooting/testing/
const cases = [
  { name: 'pass', key: '1x00000000000000000000AA' },
  { name: 'fail', key: '2x00000000000000000000AB' },
];
const source = await readFile(new URL('../../app/components/turnstile.ts', import.meta.url), 'utf8');
const modules = new Map(await Promise.all(cases.map(async ({ name, key }) => {
  const result = await transformWithEsbuild(source, 'turnstile.ts', {
    define: { 'import.meta.env.VITE_TURNSTILE_SITE_KEY': JSON.stringify(key) },
  });
  return [`/${name}.js`, result.code];
})));

for (const browserType of [chromium, firefox]) {
  test(`${browserType.name()}: real test widget settles success and rejection`, { timeout: 150_000 }, async () => {
    const server = createServer((request, response) => {
      const module = modules.get(request.url);
      if (module) {
        response.writeHead(200, { 'content-type': 'text/javascript' });
        response.end(module);
      } else if (request.url === '/') {
        response.writeHead(200, { 'content-type': 'text/html' });
        response.end('<!doctype html><title>Isolated Turnstile test</title>');
      } else {
        response.writeHead(404).end();
      }
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    let browser;
    try {
      browser = await browserType.launch();
      for (const { name } of cases) {
        const page = await browser.newPage();
        await page.goto(`http://127.0.0.1:${server.address().port}/`);
        const outcome = await page.evaluate(async name => {
          const { createTurnstileProvider } = await import(`/${name}.js`);
          const provider = createTurnstileProvider();
          let result;
          try {
            const token = await provider.getToken({ action: 'openrtc_capability', apiKey: 'unused-test-only' });
            result = { accepted: true, dummy: token === 'XXXX.DUMMY.TOKEN.XXXX' };
          } catch (error) {
            result = { accepted: false, code: error.code };
          } finally {
            provider.close();
          }
          return { ...result, remainingWidgets: document.querySelectorAll('[aria-label="Verify to join shared cursors"]').length };
        }, name);
        assert.deepEqual(outcome, name === 'pass'
          ? { accepted: true, dummy: true, remainingWidgets: 0 }
          : { accepted: false, code: 'turnstile-unavailable', remainingWidgets: 0 });
        await page.close();
      }
    } finally {
      await browser?.close();
      server.closeAllConnections();
      await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  });
}
