import { expect, test, type BrowserContext, type Page } from '@playwright/test';

async function openPortfolioPeer(
  context: BrowserContext,
  label: string,
): Promise<Page> {
  const page = await context.newPage();
  const browserErrors: string[] = [];
  const isExpectedRoomControlFlow = (message: string) =>
    message === 'Failed to load resource: the server responded with a status of 404 ()'
    || message === 'Failed to load resource: the server responded with a status of 409 ()'
    || /\[OPENRTC\]\[FIRESTORE\].*status=(404 Not Found|409 Conflict)/s.test(message);

  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !isExpectedRoomControlFlow(message.text())) {
      browserErrors.push(message.text());
    }
  });

  await page.goto(`/?peer=${label}`, { waitUntil: 'domcontentloaded' });
  const presence = page.getByTestId('openrtc-presence');
  await expect(presence).toHaveAttribute('data-openrtc-status', 'Joined');
  expect(browserErrors, `${label} browser errors`).toEqual([]);
  return page;
}

async function moveCursor(page: Page, xRatio: number, yRatio: number): Promise<void> {
  const canvas = page.locator('canvas').first();
  await expect(canvas).toBeVisible();
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  await page.mouse.move(
    bounds!.x + bounds!.width * xRatio,
    bounds!.y + bounds!.height * yRatio,
  );
}

test('two independent portfolio devices connect and exchange cursor payloads', async ({ browser }) => {
  const leftContext = await browser.newContext();
  const rightContext = await browser.newContext();

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
    await expect.poll(async () => Number(await rightPresence.getAttribute('data-remote-cursor-count')))
      .toBeGreaterThanOrEqual(1);

    await moveCursor(right, 0.7, 0.6);
    await expect.poll(async () => Number(await leftPresence.getAttribute('data-remote-cursor-count')))
      .toBeGreaterThanOrEqual(1);
  } finally {
    await Promise.all([leftContext.close(), rightContext.close()]);
  }
});

test('two pages sharing one browser device exchange cursors locally', async ({ browser }) => {
  const context = await browser.newContext();

  try {
    const left = await openPortfolioPeer(context, 'same-device-left');
    const right = await openPortfolioPeer(context, 'same-device-right');
    const leftPresence = left.getByTestId('openrtc-presence');
    const rightPresence = right.getByTestId('openrtc-presence');

    await expect.poll(async () => Number(await leftPresence.getAttribute('data-local-tab-peer-count')))
      .toBeGreaterThanOrEqual(1);
    await expect.poll(async () => Number(await rightPresence.getAttribute('data-local-tab-peer-count')))
      .toBeGreaterThanOrEqual(1);

    await moveCursor(left, 0.25, 0.35);
    await expect.poll(async () => Number(await rightPresence.getAttribute('data-remote-cursor-count')))
      .toBeGreaterThanOrEqual(1);

    await moveCursor(right, 0.75, 0.65);
    await expect.poll(async () => Number(await leftPresence.getAttribute('data-remote-cursor-count')))
      .toBeGreaterThanOrEqual(1);
  } finally {
    await context.close();
  }
});
