import { spawn } from 'node:child_process';
import net from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

// Reserve the whole set together; never discover or stop somebody else's PID.
export async function allocatePorts(names) {
  const reservations = [];
  try {
    const ports = {};
    for (const name of names) {
      const server = net.createServer();
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
      });
      reservations.push(server);
      ports[name] = server.address().port;
    }
    return ports;
  } finally {
    await Promise.all(reservations.map(server => new Promise(resolve => server.close(resolve))));
  }
}

export async function assertPortsFree(ports) {
  const reservations = [];
  try {
    for (const port of ports) {
      if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error('Invalid local port');
      const server = net.createServer();
      await new Promise((resolve, reject) => {
        server.once('error', () => reject(new Error(`Refusing occupied local port ${port}; no process was stopped.`)));
        server.listen(port, '127.0.0.1', resolve);
      });
      reservations.push(server);
    }
  } finally {
    await Promise.all(reservations.map(server => new Promise(resolve => server.close(resolve))));
  }
}

export function spawnOwned(command, args, options) {
  if (process.platform === 'win32') throw new Error('Local emulator runner requires POSIX process groups.');
  const forward = options.stdio === 'inherit';
  const child = spawn(command, args, { ...options, detached: true, ...(forward ? { stdio: ['ignore', 'pipe', 'pipe'] } : {}) });
  if (forward) {
    child.stdout.pipe(process.stdout, { end: false });
    child.stderr.pipe(process.stderr, { end: false });
  }
  const owner = { child, closed: false, error: null };
  owner.close = new Promise(resolve => child.once('close', () => { owner.closed = true; resolve(); }));
  child.once('error', error => { owner.error = error; });
  return owner;
}

export function assertAlive(owner) {
  if (owner.error) throw owner.error;
  if (owner.closed || owner.child.exitCode !== null || owner.child.signalCode !== null) {
    throw new Error(`Owned child exited: ${owner.child.spawnfile} code=${owner.child.exitCode} signal=${owner.child.signalCode}`);
  }
}

export async function stopOwned(owner, timeoutMs = 5000) {
  for (const signal of ['SIGTERM', 'SIGKILL']) {
    if (owner.closed) return;
    if (owner.child.pid) {
      try { process.kill(-owner.child.pid, signal); }
      catch (error) { if (error.code !== 'ESRCH') throw error; }
    }
    // Parent exit is NOT stdio close: descendants may still own pipes.
    const timeout = new AbortController();
    try {
      await Promise.race([owner.close, delay(timeoutMs, undefined, { signal: timeout.signal })]);
    } finally { timeout.abort(); }
  }
  if (!owner.closed) throw new Error(`Owned process group ${owner.child.pid} did not close; retaining temporary files.`);
}

export async function waitForIdentity(owner, url, expected, timeoutMs = 120000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    assertAlive(owner);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000), redirect: 'error' });
      if (response.ok) {
        const value = await response.json();
        if (Object.entries(expected).every(([key, wanted]) => value[key] === wanted)) {
          assertAlive(owner);
          return;
        }
        throw new Error('Readiness identity mismatch');
      }
    } catch (error) {
      if (error.message === 'Readiness identity mismatch') throw error;
    }
    await delay(100);
  }
  throw new Error(`Owned process readiness timed out: ${url}`);
}
