import { expect, firefox, webkit, test, type BrowserContext, type Page } from '@playwright/test';

interface CursorPosition {
  x: number;
  z: number;
  color: string;
}
const browserErrors = new WeakMap<Page, string[]>();

async function openPortfolioPeer(
  context: BrowserContext,
  label: string,
): Promise<Page> {
  const page = await context.newPage();
  const errors: string[] = [];
  const startupStages: string[] = [];
  browserErrors.set(page, errors);
  const isExpectedRoomControlFlow = (message: string) =>
    message === 'Failed to load resource: the server responded with a status of 404 ()'
    || message === 'Failed to load resource: the server responded with a status of 404 (Not Found)'
    || message === 'Failed to load resource: the server responded with a status of 409 ()'
    || message === 'Failed to load resource: the server responded with a status of 409 (Conflict)'
    || /\[OPENRTC\]\[FIRESTORE\].*status=(404 Not Found|409 Conflict)/s.test(message);

  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    const stage = message.text().match(/\bstage=([a-z0-9_:-]+)/i)?.[1];
    if (stage) startupStages.push(stage);
    const heading = message.text().match(/^(?:\[[A-Za-z][A-Za-z0-9 _-]{0,60}\])+/)?.[0];
    if (heading && !stage && startupStages.length < 100) startupStages.push(heading);
    if (message.type() === 'error' && !isExpectedRoomControlFlow(message.text())) {
      errors.push(message.text());
    }
  });

  const capabilityResponse = page.waitForResponse(response =>
    new URL(response.url()).pathname === '/v2/capabilities'
      && response.request().method() === 'POST');
  await page.goto(`/?peer=${label}`, { waitUntil: 'domcontentloaded' });
  const admission = await capabilityResponse;
  const capability = await admission.json();
  expect(admission.status(), `${label} capability admission`).toBe(200);
  expect(capability.irohRelay, `${label} external Iroh relay access`).toBe(true);
  if (process.env.PORTFOLIO_E2E_RUN_ID) {
    await expect.poll(() => page.evaluate(() => (window as unknown as {
      __portfolioHarnessIdentity?: { runId: string };
    }).__portfolioHarnessIdentity?.runId)).toBe(process.env.PORTFOLIO_E2E_RUN_ID);
  }
  const presence = page.getByTestId('openrtc-presence');
  // Allow the bounded 60-second verification attempt to settle before diagnosing
  // startup. Cursor delivery retains the shorter default assertion deadline.
  try {
    await expect(presence).toHaveAttribute('data-openrtc-status', 'Joined', { timeout: 75_000 });
  } catch (error) {
    // No capability bodies, headers, tokens or session identities in diagnostics.
    console.error(JSON.stringify({ peer: label, startupStages,
      errorKinds: errors.map(text => /certificate/i.test(text) ? 'certificate'
        : /WebAssembly|wasm/i.test(text) ? 'wasm'
        : /WebGL|context lost/i.test(text) ? 'graphics' : 'other') }));
    throw error;
  }
  expect(errors, `${label} browser errors`).toEqual([]);
  return page;
}

async function moveCursor(page: Page, xRatio: number, yRatio: number): Promise<void> {
  const previous = await page.getByTestId('openrtc-presence').getAttribute('data-local-cursor');
  const canvas = page.locator('canvas').first();
  await expect(canvas).toBeVisible();
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  await page.mouse.move(
    bounds!.x + bounds!.width * xRatio,
    bounds!.y + bounds!.height * yRatio,
  );
  await expect(page.getByTestId('openrtc-presence')).not.toHaveAttribute('data-local-cursor', previous!);
}

async function readCursorAttribute<T>(page: Page, name: string): Promise<T> {
  const value = await page.getByTestId('openrtc-presence').getAttribute(name);
  expect(value).not.toBeNull();
  return JSON.parse(value!) as T;
}

async function expectExactCursor(source: Page, target: Page): Promise<CursorPosition> {
  let cursor: CursorPosition | null = null;
  await expect.poll(async () => {
    cursor = await readCursorAttribute<CursorPosition>(source, 'data-local-cursor');
    const remote = await readCursorAttribute<CursorPosition[]>(target, 'data-remote-cursors');
    return remote.some((candidate) => JSON.stringify(candidate) === JSON.stringify(cursor));
  }).toBe(true);
  return cursor!;
}

test('two independent portfolio devices exchange exact space.state cursor payloads', async ({ browser, baseURL, ignoreHTTPSErrors }) => {
  const leftContext = await browser.newContext({ baseURL, ignoreHTTPSErrors });
  const rightContext = await browser.newContext({ baseURL, ignoreHTTPSErrors });

  try {
    const left = await openPortfolioPeer(leftContext, 'left');
    const right = await openPortfolioPeer(rightContext, 'right');
    const leftPresence = left.getByTestId('openrtc-presence');
    const rightPresence = right.getByTestId('openrtc-presence');

    await expect.poll(async () => Number(await leftPresence.getAttribute('data-active-member-count')))
      .toBeGreaterThanOrEqual(2);
    await expect.poll(async () => Number(await rightPresence.getAttribute('data-active-member-count')))
      .toBeGreaterThanOrEqual(2);

    await moveCursor(left, 0.3, 0.4);
    await expectExactCursor(left, right);

    await moveCursor(right, 0.7, 0.6);
    await expectExactCursor(right, left);

    expect(browserErrors.get(left), 'left browser errors').toEqual([]);
    expect(browserErrors.get(right), 'right browser errors').toEqual([]);
  } finally {
    await Promise.all([leftContext.close(), rightContext.close()]);
  }
});

for (const browserType of [firefox, webkit]) {
test(`Chromium and ${browserType.name()} exchange exact cursors without BroadcastChannel`, async ({ browser, baseURL, ignoreHTTPSErrors }) => {
  const endpoint = browserType === webkit ? process.env.PORTFOLIO_WEBKIT_WS_ENDPOINT : undefined;
  const otherBrowser = endpoint
    ? await browserType.connect(endpoint, { exposeNetwork: '<loopback>' })
    : await browserType.launch();
  const contexts = await Promise.all([
    browser.newContext({ baseURL, ignoreHTTPSErrors }),
    otherBrowser.newContext({ baseURL, ignoreHTTPSErrors }),
  ]);
  try {
    for (const context of contexts) {
      await context.addInitScript(() => {
        Object.defineProperty(globalThis, 'BroadcastChannel', { value: undefined, configurable: false });
      });
    }
    const [left, right] = await Promise.all([
      openPortfolioPeer(contexts[0], 'chromium-network'),
      openPortfolioPeer(contexts[1], `${browserType.name()}-network`),
    ]);
    for (const page of [left, right]) {
      expect(await page.evaluate(() => typeof BroadcastChannel)).toBe('undefined');
      await expect(page.getByTestId('openrtc-presence')).toHaveAttribute('data-local-tab-peer-count', '0');
      await expect.poll(async () => Number(await page.getByTestId('openrtc-presence')
        .getAttribute('data-openrtc-connection-count'))).toBeGreaterThanOrEqual(1);
    }
    await moveCursor(left, 0.28, 0.38);
    await expectExactCursor(left, right);
    await moveCursor(right, 0.72, 0.62);
    await expectExactCursor(right, left);
    for (const page of [left, right]) {
      await expect(page.getByTestId('openrtc-presence')).toHaveAttribute('data-local-tab-peer-count', '0');
      expect(browserErrors.get(page), 'cross-browser errors').toEqual([]);
    }
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
    await otherBrowser.close();
  }
});
}

test('same-browser tabs exchange exact cursors through OpenRTC', async ({ browser, baseURL, ignoreHTTPSErrors }) => {
  const context = await browser.newContext({ baseURL, ignoreHTTPSErrors });

  try {
    const left = await openPortfolioPeer(context, 'same-device-left');
    const right = await openPortfolioPeer(context, 'same-device-right');
    const leftPresence = left.getByTestId('openrtc-presence');
    const rightPresence = right.getByTestId('openrtc-presence');

    for (const presence of [leftPresence, rightPresence]) {
      await expect(presence).toHaveAttribute('data-local-tab-peer-count', '0');
      await expect.poll(async () => Number(await presence.getAttribute('data-openrtc-connection-count')))
        .toBeGreaterThanOrEqual(1);
    }

    await moveCursor(left, 0.25, 0.35);
    await expectExactCursor(left, right);

    await moveCursor(right, 0.75, 0.65);
    await expectExactCursor(right, left);
  } finally {
    await context.close();
  }
});
