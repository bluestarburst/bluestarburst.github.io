import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { cursorErrorStatus } from './sharedCursorsRooms';

class Node {
    style = {};
    src = '';
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    removed = false;
    setAttribute() {}
    remove() { this.removed = true; }
}

let nodes: Node[];
let callbacks: Array<Record<string, any>>;
let api: { render: Mock<(node: HTMLElement, options: Record<string, unknown>) => string>; execute: Mock<(id: string) => void>; remove: Mock<(id: string) => void> };
const input = { action: 'openrtc_capability' as const, apiKey: 'public-test' };
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
async function provider() { return (await import('./turnstile')).createTurnstileProvider()!; }

beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'public-test-sitekey');
    nodes = [];
    callbacks = [];
    api = {
        render: vi.fn((_node, options) => { callbacks.push(options); return String(callbacks.length); }),
        execute: vi.fn(), remove: vi.fn(),
    };
    vi.stubGlobal('window', { turnstile: api, setTimeout, clearTimeout });
    vi.stubGlobal('document', {
        createElement: () => { const node = new Node(); nodes.push(node); return node; },
        head: { appendChild: vi.fn() }, body: { appendChild: vi.fn() },
    });
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('Portfolio Turnstile admission', () => {
    it('does not load a widget when no site key is configured', async () => {
        vi.stubEnv('VITE_TURNSTILE_SITE_KEY', '');
        expect(await provider()).toBeUndefined();
        expect(nodes).toHaveLength(0);
    });

    it('settles a script error with a safe cursor status', async () => {
        delete window.turnstile;
        const p = await provider();
        const pending = p.getToken(input).catch(error => error);
        nodes.find(node => node.src)!.onerror!();
        expect(cursorErrorStatus(await pending)).toBe('Cursor verification unavailable');
        expect(vi.getTimerCount()).toBe(0);
    });

    it('closes an active challenge without leaving its timer or accepting late tokens', async () => {
        const p = await provider();
        const pending = expect(p.getToken(input)).rejects.toThrow('closed');
        await flush();
        p.close();
        callbacks[0].callback('late');
        await pending;
        await expect(p.getToken(input)).rejects.toThrow('closed');
        expect(api.remove).toHaveBeenCalledTimes(1);
        expect(vi.getTimerCount()).toBe(0);
    });

    it('uses fresh widgets and fences stale callbacks between requests', async () => {
        const p = await provider();
        const first = p.getToken(input);
        await flush();
        expect(callbacks[0]).toMatchObject({ action: 'portfolio_join', retry: 'never', execution: 'execute' });
        callbacks[0].callback('first');
        await expect(first).resolves.toBe('first');
        const second = p.getToken(input);
        await flush();
        callbacks[0].callback('stale');
        callbacks[1].callback('second');
        await expect(second).resolves.toBe('second');
        expect(api.remove.mock.calls).toEqual([['1'], ['2']]);
        expect(vi.getTimerCount()).toBe(0);
        expect(nodes.every(node => node.removed)).toBe(true);
    });

    it('owns the request before script loading and closes it immediately', async () => {
        delete window.turnstile;
        const p = await provider();
        const pending = p.getToken(input);
        const rejected = expect(pending).rejects.toThrow('closed');
        await expect(p.getToken(input)).rejects.toThrow('already in progress');
        p.close();
        await rejected;
        window.turnstile = api;
        nodes.find(node => node.src)?.onload?.();
        await flush();
        expect(api.render).not.toHaveBeenCalled();
        expect(vi.getTimerCount()).toBe(0);
    });

    it('bounds a stalled script load and permits a later fresh load', async () => {
        delete window.turnstile;
        const p = await provider();
        const pending = expect(p.getToken(input)).rejects.toThrow('script timed out');
        await vi.advanceTimersByTimeAsync(10_000);
        await pending;
        expect(vi.getTimerCount()).toBe(0);
        const retry = p.getToken(input);
        window.turnstile = api;
        nodes.filter(node => node.src).at(-1)!.onload!();
        await flush();
        callbacks[0].callback('fresh');
        await expect(retry).resolves.toBe('fresh');
    });

    it.each(['error-callback', 'expired-callback', 'timeout-callback', 'unsupported-callback'])('settles %s', async (callback) => {
        const p = await provider();
        const pending = p.getToken(input);
        const rejected = expect(pending).rejects.toThrow('Turnstile');
        await flush();
        callbacks[0][callback]();
        await rejected;
        expect(vi.getTimerCount()).toBe(0);
        expect(api.remove).toHaveBeenCalledWith('1');
    });

    it.each(['render', 'execute'] as const)('settles a thrown %s without leaving a pending request', async method => {
        api[method].mockImplementationOnce(() => { throw new Error('provider failure'); });
        const p = await provider();
        await expect(p.getToken(input)).rejects.toThrow('provider failure');
        expect(vi.getTimerCount()).toBe(0);
        expect(nodes.every(node => node.removed)).toBe(true);
    });

    it('settles success even when third-party cleanup throws', async () => {
        api.remove.mockImplementation(() => { throw new Error('cleanup failure'); });
        const p = await provider();
        const pending = p.getToken(input);
        await flush();
        callbacks[0].callback('valid');
        await expect(pending).resolves.toBe('valid');
        expect(vi.getTimerCount()).toBe(0);
        expect(nodes.every(node => node.removed)).toBe(true);
    });

    it('gives a challenge a bounded minute then releases its request', async () => {
        const p = await provider();
        const pending = expect(p.getToken(input)).rejects.toThrow('timed out');
        await vi.advanceTimersByTimeAsync(60_000);
        await pending;
        expect(vi.getTimerCount()).toBe(0);
    });
});
