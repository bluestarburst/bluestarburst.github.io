import React, { useEffect, useRef, useState } from 'react';
import { OpenRTC, type Client, type State, type Space } from 'openrtc';
import { AsciiBackground } from './AsciiBackground';
import { StarField, SpaceDebris } from './ThreeElements';
import { useTheme } from './ThemeContext';
import { cursorErrorStatus, joinAvailableSpace } from './sharedCursorsRooms';
import { createCursorPublisher } from './cursorPublisher';
import { createTurnstileProvider } from './turnstile';

const API_KEY = (import.meta.env.VITE_OPENRTC_API_KEY ?? '').trim();

interface CursorPosition {
    x: number;
    z: number;
    color: string;
}

const COLORS = [
    '#FF5733', '#33FF57', '#3357FF', '#FF33A1', '#33FFF5',
    '#F5FF33', '#FF8C33', '#8C33FF', '#33FF8C', '#FF3333'
];

const getRandomColor = () => COLORS[Math.floor(Math.random() * COLORS.length)];

function isCursorPosition(value: unknown): value is CursorPosition {
    if (!value || typeof value !== 'object') return false;
    const cursor = value as Record<string, unknown>;
    return typeof cursor.x === 'number'
        && Number.isFinite(cursor.x)
        && typeof cursor.z === 'number'
        && Number.isFinite(cursor.z)
        && typeof cursor.color === 'string'
        && COLORS.includes(cursor.color);
}

export function SharedCursors() {
    const [cursors, setCursors] = useState<Record<string, CursorPosition>>({});
    const [status, setStatus] = useState('Initializing...');
    const [activeMemberCount, setActiveMemberCount] = useState(0);
    const [myMousePosition, setMyMousePosition] = useState({ x: 0, z: 0 });
    const clientRef = useRef<Client | null>(null);
    const spaceRef = useRef<Space | null>(null);
    const cursorStateRef = useRef<State<CursorPosition> | null>(null);
    const cursorPublisherRef = useRef<ReturnType<typeof createCursorPublisher<CursorPosition>> | null>(null);
    const myColor = useRef(getRandomColor());
    const mountedRef = useRef(true);
    const capabilityStopsRef = useRef<Array<() => void>>([]);
    const latestCursorPayloadRef = useRef<CursorPosition | null>(null);
    const openRtcConnectionCountRef = useRef(0);
    const { theme } = useTheme();

    useEffect(() => {
        let disposed = false;
        let turnstile: ReturnType<typeof createTurnstileProvider>;
        mountedRef.current = true;
        cursorPublisherRef.current = createCursorPublisher<CursorPosition>((payload) => {
            if (!mountedRef.current || !cursorStateRef.current) return;
            cursorStateRef.current.set(payload);
        });

        const updateActiveMemberCount = () => {
            if (disposed) return;
            setActiveMemberCount(openRtcConnectionCountRef.current + 1);
        };

        const removeCursor = (peerKey: string) => {
            setCursors((previous) => {
                const next = { ...previous };
                delete next[peerKey];
                return next;
            });
        };

        const init = async () => {
            let client: Client | null = null;
            try {
                if (!API_KEY) {
                    setStatus('Missing API key');
                    return;
                }

                turnstile = createTurnstileProvider();
                client = OpenRTC({
                    apiKey: API_KEY,
                    trust: turnstile ? { botVerification: turnstile } : undefined,
                    transports: {
                        iroh: true,
                        privacy: 'relay-only',
                        relay: true,
                        webrtc: true,
                    },
                });
                const { space } = await joinAvailableSpace(client);

                if (disposed) {
                    await space.leave();
                    await client.close();
                    return;
                }

                clientRef.current = client;
                spaceRef.current = space;
                const cursorState = space.state<CursorPosition>('cursor');
                cursorStateRef.current = cursorState;
                setStatus('Joined');
                const connectionIds = new Set<string>();
                capabilityStopsRef.current = [
                    cursorState.watch(({ peerId, value }) => {
                        if (disposed) return;
                        if (value === null) removeCursor(peerId);
                        else if (isCursorPosition(value)) {
                            setCursors((previous) => ({ ...previous, [peerId]: value }));
                        }
                    }),
                    space.onConnection((connection) => {
                        if (disposed) return;
                        connectionIds.add(connection.id);
                        openRtcConnectionCountRef.current = connectionIds.size;
                        updateActiveMemberCount();
                        connection.onClose(() => {
                            if (disposed) return;
                            connectionIds.delete(connection.id);
                            openRtcConnectionCountRef.current = connectionIds.size;
                            updateActiveMemberCount();
                        });
                    }),
                ];

                if (latestCursorPayloadRef.current) {
                    cursorPublisherRef.current?.update(latestCursorPayloadRef.current);
                }
            } catch (error) {
                // Do not log raw service errors: they may contain request credentials.
                if (!disposed) setStatus(cursorErrorStatus(error));
                turnstile?.close();
                await client?.close().catch(() => {});
            }
        };

        void init();

        return () => {
            disposed = true;
            mountedRef.current = false;
            cursorPublisherRef.current?.close();
            cursorPublisherRef.current = null;
            turnstile?.close();
            openRtcConnectionCountRef.current = 0;
            capabilityStopsRef.current.splice(0).forEach((stop) => stop());
            latestCursorPayloadRef.current = null;
            cursorStateRef.current = null;
            void spaceRef.current?.leave().catch(() => {});
            spaceRef.current = null;
            void clientRef.current?.close().catch(() => {});
            clientRef.current = null;
        };
    }, []);

    const handleProjectedCursorMove = (position: { x: number; z: number }) => {
        const payload = {
            x: position.x,
            z: position.z,
            color: myColor.current,
        };

        setMyMousePosition(payload);
        latestCursorPayloadRef.current = payload;
        cursorPublisherRef.current?.update(payload);
    };

    return (
        <>
            <div className="fixed bottom-4 right-4 z-9999 pointer-events-none">
                <div
                    aria-label={`OpenRTC ${status}: ${activeMemberCount} active cursors`}
                    className="px-3 py-1.5 bg-black/80 backdrop-blur rounded-full text-[10px] font-bold text-white border border-white/10 shadow-lg flex items-center gap-2"
                    data-openrtc-status={status}
                    data-active-member-count={activeMemberCount}
                    data-openrtc-connection-count={openRtcConnectionCountRef.current}
                    data-local-tab-peer-count={0}
                    data-remote-cursor-count={Object.keys(cursors).length}
                    data-local-cursor={JSON.stringify({ ...myMousePosition, color: myColor.current })}
                    data-remote-cursors={JSON.stringify(Object.values(cursors))}
                    data-testid="openrtc-presence"
                >
                    <div className={`w-1.5 h-1.5 rounded-full ${status === 'Joined' ? 'bg-green-500' : 'bg-amber-500'}`} />
                    <span>{status === 'Joined' ? `${activeMemberCount} ACTIVE CURSOR${activeMemberCount !== 1 ? 'S' : ''}` : status}</span>
                </div>
            </div>

            <AsciiBackground positions={[
                ...Object.entries(cursors).map(([peerId, { x, z, color }]) => ({
                    x,
                    z,
                    color,
                    name: peerId.slice(0, 4),
                })),
                { x: myMousePosition.x, z: myMousePosition.z, color: myColor.current, name: 'You' },
            ]} onCursorMove={handleProjectedCursorMove}>
                <ambientLight intensity={0.5} />
                <pointLight position={[10, 10, 10]} intensity={1} color="#d2b48c" />
                <StarField theme={theme} />
                <SpaceDebris theme={theme} />
            </AsciiBackground>
        </>
    );
}
