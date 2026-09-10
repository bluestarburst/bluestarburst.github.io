import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { allocatePorts, assertPortsFree, spawnOwned, stopOwned, waitForIdentity } from './emulator-processes.mjs';

test('port collision fails without stopping the foreign listener', async () => {
  const ports = await allocatePorts(['first', 'second']);
  assert.notEqual(ports.first, ports.second);
  const server = createServer((req, res) => res.end('foreign'));
  server.listen(ports.first, '127.0.0.1');
  await once(server, 'listening');
  try {
    await assert.rejects(assertPortsFree(Object.values(ports)), /Refusing occupied/);
    assert.equal(await (await fetch(`http://127.0.0.1:${ports.first}`)).text(), 'foreign');
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('readiness rejects wrong identity and accepts exact response', async () => {
  const owner = spawnOwned(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'pipe' });
  const server = createServer((req, res) => res.end(JSON.stringify({ runId: 'ours', project: 'demo-local' })));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    await assert.rejects(waitForIdentity(owner, url, { runId: 'foreign' }, 1000), /identity mismatch/);
    await waitForIdentity(owner, url, { runId: 'ours', project: 'demo-local' }, 1000);
  } finally {
    await stopOwned(owner);
    await new Promise(resolve => server.close(resolve));
  }
});

test('readiness fails immediately for an exited child', async () => {
  const owner = spawnOwned(process.execPath, ['-e', 'process.exit(7)'], { stdio: 'pipe' });
  await owner.close;
  await assert.rejects(waitForIdentity(owner, 'http://127.0.0.1:1', { runId: 'ours' }, 10000), /Owned child exited/);
});

test('cleanup waits for descendant pipe closure after parent exit', async () => {
  const owner = spawnOwned(process.execPath, ['-e', `
    require('node:child_process').spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], {stdio:'inherit'});
    setTimeout(()=>process.exit(0),100);
  `], { stdio: 'pipe' });
  await once(owner.child, 'exit');
  assert.equal(owner.closed, false);
  await stopOwned(owner, 1000);
  assert.equal(owner.closed, true);
});
