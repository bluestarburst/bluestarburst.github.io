import { afterEach, expect, it, vi } from 'vitest';
import { createCursorPublisher } from './cursorPublisher';

afterEach(() => vi.useRealTimers());

it('publishes at most twenty latest cursor values during one second of rapid rendering', () => {
  vi.useFakeTimers();
  const publish = vi.fn();
  const publisher = createCursorPublisher(publish);
  for (let frame = 0; frame < 1000; frame++) {
    publisher.update({ x: frame, z: frame, color: 'blue' });
    vi.advanceTimersByTime(1);
  }
  expect(publish).toHaveBeenCalledTimes(20);
  expect(publish.mock.calls.map(([value]) => value.x)).toEqual(Array.from({ length: 20 }, (_, i) => (i+1)*50-1));
  expect(publish).toHaveBeenLastCalledWith({ x: 999, z: 999, color: 'blue' });
  expect(vi.getTimerCount()).toBe(0);
  vi.advanceTimersByTime(60_000);
  expect(publish).toHaveBeenCalledTimes(20);
});

it('retains the last movement in a partial window and stays idle without movement', () => {
  vi.useFakeTimers();
  const publish = vi.fn();
  const publisher = createCursorPublisher(publish);
  expect(vi.getTimerCount()).toBe(0);
  publisher.update('first');
  vi.advanceTimersByTime(49);
  publisher.update('latest');
  expect(publish).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(publish).toHaveBeenCalledExactlyOnceWith('latest');
  expect(vi.getTimerCount()).toBe(0);
});

it('cancels unmount work and refuses callbacks from a closed publisher', () => {
  vi.useFakeTimers();
  const publish = vi.fn();
  const publisher = createCursorPublisher(publish);
  publisher.update('pending');
  publisher.close();
  publisher.close();
  publisher.update('late render');
  vi.runAllTimers();
  expect(publish).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});
