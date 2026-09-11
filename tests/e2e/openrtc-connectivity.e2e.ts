import { expect, firefox, test, type BrowserContext, type Page } from '@playwright/test';

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
  browserErrors.set(page, errors);
  const isExpectedRoomControlFlow = (message: string) =>
    message === 'Failed to load resource: the server responded with a status of 404 ()'
    || message === 'Failed to load resource: the server responded with a status of 404 (Not Found)'
    || message === 'Failed to load resource: the server responded with a status of 409 ()'
    || message === 'Failed to load resource: the server responded with a status of 409 (Conflict)'
    || /\[OPENRTC\]\[FIRESTORE\].*status=(404 Not Found|409 Conflict)/s.test(message);

  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !isExpectedRoomControlFlow(message.text())) {
      errors.push(message.text());
    }
  });

  await page.goto(`/?peer=${label}`, { waitUntil: 'domcontentloaded' });
  if (process.env.PORTFOLIO_E2E_RUN_ID) {
    await expect.poll(() => page.evaluate(() => (window as unknown as {
      __portfolioHarnessIdentity?: { runId: string };
    }).__portfolioHarnessIdentity?.runId)).toBe(process.env.PORTFOLIO_E2E_RUN_ID);
  }
  const presence = page.getByTestId('openrtc-presence');
  // Allow the bounded 60-second verification attempt to settle before diagnosing
  // startup. Cursor delivery retains the shorter default assertion deadline.
  await expect(presence).toHaveAttribute('data-openrtc-status', 'Joined', { timeout: 75_000 });
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

test('Chromium and Firefox exchange exact cursors without BroadcastChannel', async ({ browser, baseURL, ignoreHTTPSErrors }) => {
  const otherBrowser = await firefox.launch();
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
      openPortfolioPeer(contexts[1], 'firefox-network'),
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
