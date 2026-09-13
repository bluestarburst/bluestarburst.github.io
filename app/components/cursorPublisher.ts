/** Application payload pacing, not connection recovery. Idle publishers do no work. */
export function createCursorPublisher<T>(publish: (value: T) => void) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let latest: T;
  let closed = false;
  return {
    update(value: T) {
      if (closed) return;
      latest = value;
      if (timer !== undefined) return;
      timer = setTimeout(() => {
        timer = undefined;
        if (!closed) publish(latest);
      }, 50);
    },
    close() {
      closed = true;
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
    },
  };
}
