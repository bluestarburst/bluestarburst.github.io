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

    await expect(leftPresence).toContainText('2 ACTIVE CURSORS');
    await expect(rightPresence).toContainText('2 ACTIVE CURSORS');

    await moveCursor(left, 0.3, 0.4);
    await expect(rightPresence).toHaveAttribute('data-remote-cursor-count', '1');

    await moveCursor(right, 0.7, 0.6);
    await expect(leftPresence).toHaveAttribute('data-remote-cursor-count', '1');
  } finally {
    await Promise.all([leftContext.close(), rightContext.close()]);
  }
});
