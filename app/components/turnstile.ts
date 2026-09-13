import type { OpenRTC } from 'openrtc';

type BotVerificationProvider = NonNullable<NonNullable<Parameters<typeof OpenRTC>[0]['trust']>['botVerification']>;

const SITE_KEY = (import.meta.env.VITE_TURNSTILE_SITE_KEY ?? '').trim();
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
type Api = {
    render(container: HTMLElement, options: Record<string, unknown>): string;
    execute(id: string): void;
    remove(id: string): void;
};
declare global { interface Window { turnstile?: Api } }

const RETRYABLE_ERROR_CODES = new Set(['110600', '110620', '200500']);

function isRetryableErrorCode(code: unknown): boolean {
    if (typeof code !== 'string') return false;
    return RETRYABLE_ERROR_CODES.has(code)
        || code.startsWith('300')
        || code.startsWith('600');
}

let scriptPromise: Promise<Api> | undefined;
function loadTurnstile(): Promise<Api> {
    if (window.turnstile) return Promise.resolve(window.turnstile);
    if (scriptPromise) return scriptPromise;
    scriptPromise = new Promise<Api>((resolve, reject) => {
        const node = document.createElement('script');
        const finish = (error?: Error) => {
            window.clearTimeout(timer);
            node.onload = node.onerror = null;
            if (error) { node.remove(); reject(error); }
            else resolve(window.turnstile!);
        };
        const timer = window.setTimeout(() => finish(new Error('Turnstile script timed out')), 10_000);
        node.src = SCRIPT_SRC;
        node.async = true;
        node.defer = true;
        node.onload = () => finish(window.turnstile ? undefined : new Error('Turnstile unavailable'));
        node.onerror = () => finish(new Error('Turnstile failed to load'));
        document.head.appendChild(node);
    }).catch((error) => {
        scriptPromise = undefined;
        throw error;
    });
    return scriptPromise;
}

type Pending = {
    resolve(token: string): void;
    reject(error: Error): void;
    timer: number;
    container: HTMLElement;
    api?: Api;
    widget?: string;
};

export function createTurnstileProvider(): (BotVerificationProvider & { close(): void }) | undefined {
    if (!SITE_KEY || typeof window === 'undefined') return undefined;
    let closed = false;
    let current: Pending | undefined;
    const removeWidget = (api: Api, widget: string) => {
        // Third-party cleanup must not leave the SDK admission promise pending.
        try { api.remove(widget); } catch { /* The container is also removed. */ }
    };
    const settle = (owner: Pending, error?: Error, token?: string) => {
        if (current !== owner) return;
        current = undefined;
        window.clearTimeout(owner.timer);
        if (error) owner.reject(Object.assign(error, { code: 'turnstile-unavailable' }));
        else if (token) owner.resolve(token);
        else owner.reject(new Error('Turnstile returned no token'));
        if (owner.api && owner.widget !== undefined) removeWidget(owner.api, owner.widget);
        owner.container.remove();
    };
    return {
        getToken: ({ action }) => {
            if (closed) return Promise.reject(new Error('Turnstile provider is closed'));
            if (current) return Promise.reject(new Error('Turnstile request already in progress'));
            const container = document.createElement('div');
            container.setAttribute('aria-label', 'Verify to join shared cursors');
            Object.assign(container.style, { position: 'fixed', right: '1rem', bottom: '1rem', zIndex: '10000' });
            document.body.appendChild(container);
            let owner!: Pending;
            const result = new Promise<string>((resolve, reject) => {
                owner = { resolve, reject, container, timer: 0 };
            });
            current = owner;
            owner.timer = window.setTimeout(() => settle(owner, new Error('Turnstile verification timed out')), 60_000);
            void loadTurnstile().then((api) => {
                if (closed || current !== owner) return;
                owner.api = api;
                const widget = api.render(container, {
                    sitekey: SITE_KEY,
                    action,
                    execution: 'execute',
                    appearance: 'interaction-only',
                    retry: 'auto',
                    'retry-interval': 2_000,
                    'refresh-expired': 'auto',
                    'refresh-timeout': 'auto',
                    'response-field': false,
                    callback: (token: string) => settle(owner, undefined, token),
                    'error-callback': (code: unknown) => {
                        // Cloudflare retries transient iframe, network, and challenge
                        // failures automatically. Keep the OpenRTC request pending so
                        // mobile Safari can recover within the bounded owner timeout.
                        if (!isRetryableErrorCode(code)) {
                            settle(owner, new Error('Turnstile verification failed'));
                        }
                    },
                    'expired-callback': () => settle(owner, new Error('Turnstile token expired')),
                    // Managed widgets refresh interactive timeouts automatically.
                    'timeout-callback': () => {},
                    'unsupported-callback': () => settle(owner, new Error('Turnstile browser unsupported')),
                });
                if (current !== owner) { removeWidget(api, widget); return; }
                owner.widget = widget;
                api.execute(widget);
            }).catch((error) => settle(owner, error instanceof Error ? error : new Error('Turnstile unavailable')));
            return result;
        },
        close: () => {
            closed = true;
            if (current) settle(current, new Error('Turnstile provider closed'));
        },
    };
}
