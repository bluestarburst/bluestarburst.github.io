import { expect, test, type BrowserContext, type Page } from '@playwright/test';

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
    || message === 'Failed to load resource: the server responded with a status of 409 ()'
    || /\[OPENRTC\]\[FIRESTORE\].*status=(404 Not Found|409 Conflict)/s.test(message);

  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !isExpectedRoomControlFlow(message.text())) {
      errors.push(message.text());
    }
  });

  await page.goto(`/?peer=${label}`, { waitUntil: 'domcontentloaded' });
  const presence = page.getByTestId('openrtc-presence');
  await expect(presence).toHaveAttribute('data-openrtc-status', 'Joined');
  expect(errors, `${label} browser errors`).toEqual([]);
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

test('two independent portfolio devices exchange exact space.state cursor payloads', async ({ browser }) => {
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
    await expectExactCursor(left, right);

    await moveCursor(right, 0.7, 0.6);
    await expectExactCursor(right, left);

    expect(browserErrors.get(left), 'left browser errors').toEqual([]);
    expect(browserErrors.get(right), 'right browser errors').toEqual([]);
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
    await expectExactCursor(left, right);

    await moveCursor(right, 0.75, 0.65);
    await expectExactCursor(right, left);
  } finally {
    await context.close();
  }
});
