import React, { useEffect, useRef, useState } from 'react';
import { OpenRTC, type OpenRTCClient, type OpenRTCState, type OpenRTCSpaceHandle } from 'openrtc';
import { AsciiBackground } from './AsciiBackground';
import { StarField, SpaceDebris } from './ThreeElements';
import { useTheme } from './ThemeContext';
import { joinAvailableSpace } from './sharedCursorsRooms';

const API_KEY = (import.meta.env.VITE_OPENRTC_API_KEY ?? '').trim();

interface CursorPosition {
    x: number;
    z: number;
    color: string;
}
interface CursorMessage {
    sender?: string;
    type: 'cursor' | 'cursor_leave' | 'hello' | 'hello_ack';
    payload?: CursorPosition;
}

const COLORS = [
    '#FF5733', '#33FF57', '#3357FF', '#FF33A1', '#33FFF5',
    '#F5FF33', '#FF8C33', '#8C33FF', '#33FF8C', '#FF3333'
];

const getRandomColor = () => COLORS[Math.floor(Math.random() * COLORS.length)];
const getInstanceId = () => crypto.randomUUID();

function isCursorMessage(
    value: unknown,
): value is CursorMessage & { type: 'cursor'; payload: CursorPosition } {
    if (!value || typeof value !== 'object') return false;
    const message = value as { sender?: unknown; type?: unknown; payload?: Record<string, unknown> };
    return message.type === 'cursor'
        && (message.sender === undefined || typeof message.sender === 'string')
        && isCursorPosition(message.payload);
}

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
    const clientRef = useRef<OpenRTCClient | null>(null);
    const spaceRef = useRef<OpenRTCSpaceHandle | null>(null);
    const cursorStateRef = useRef<OpenRTCState<CursorPosition> | null>(null);
    const myColor = useRef(getRandomColor());
    const mountedRef = useRef(true);
    const capabilityStopsRef = useRef<Array<() => void>>([]);
    const latestCursorPayloadRef = useRef<CursorPosition | null>(null);
    const broadcastRef = useRef<BroadcastChannel | null>(null);
    const instanceIdRef = useRef(getInstanceId());
    const localPeerIdsRef = useRef(new Set<string>());
    const openRtcPeerCountRef = useRef(0);
    const { theme } = useTheme();

    useEffect(() => {
        mountedRef.current = true;

        const updateActiveMemberCount = () => {
            setActiveMemberCount(openRtcPeerCountRef.current + localPeerIdsRef.current.size + 1);
        };

        const removeCursor = (peerKey: string) => {
            setCursors((previous) => {
                const next = { ...previous };
                delete next[peerKey];
                return next;
            });
        };

        const init = async () => {
            try {
                if (!API_KEY) {
                    setStatus('Missing API key');
                    return;
                }

                const client = OpenRTC({
                    apiKey: API_KEY,
                    transports: {
                        iroh: true,
                        webrtc: true,
                        relay: true,
                        privacy: 'relay-only',
                        priority: ['webrtc', 'iroh'],
                    },
                });
                const { space } = await joinAvailableSpace(client);

                if (!mountedRef.current) {
                    await space.leave();
                    await client.close();
                    return;
                }

                clientRef.current = client;
                spaceRef.current = space;
                const cursorState = space.state<CursorPosition>('cursor');
                cursorStateRef.current = cursorState;
                setStatus('Joined');
                capabilityStopsRef.current = [
                    cursorState.watch(({ peerId, value }) => {
                        if (!mountedRef.current) return;
                        if (value === null) removeCursor(peerId);
                        else if (isCursorPosition(value)) {
                            setCursors((previous) => ({ ...previous, [peerId]: value }));
                        }
                    }),
                    space.peers.watch((peers) => {
                        if (!mountedRef.current) return;
                        openRtcPeerCountRef.current = peers.filter(
                            (peer) => peer.status === 'connected',
                        ).length;
                        updateActiveMemberCount();
                    }),
                ];

                if (typeof BroadcastChannel !== 'undefined') {
                    const channel = new BroadcastChannel(`portfolio-cursors:${space.id}`);
                    broadcastRef.current = channel;
                    channel.onmessage = (event: MessageEvent<CursorMessage>) => {
                        const message = event.data;
                        const sender = message?.sender?.trim();
                        if (!mountedRef.current || !sender || sender === instanceIdRef.current) return;

                        if (message.type === 'hello' || message.type === 'hello_ack' || isCursorMessage(message)) {
                            localPeerIdsRef.current.add(sender);
                            updateActiveMemberCount();
                        }
                        if (isCursorMessage(message)) {
                            setCursors((previous) => ({ ...previous, [sender]: message.payload! }));
                        } else if (message.type === 'cursor_leave') {
                            localPeerIdsRef.current.delete(sender);
                            removeCursor(sender);
                            updateActiveMemberCount();
                        }
                        if (message.type === 'hello') {
                            channel.postMessage({
                                sender: instanceIdRef.current,
                                type: 'hello_ack',
                            } satisfies CursorMessage);
                            const latestPayload = latestCursorPayloadRef.current;
                            if (latestPayload) {
                                channel.postMessage({
                                    sender: instanceIdRef.current,
                                    type: 'cursor',
                                    payload: latestPayload,
                                } satisfies CursorMessage);
                            }
                        }
                    };
                    channel.postMessage({
                        sender: instanceIdRef.current,
                        type: 'hello',
                    } satisfies CursorMessage);
                }
            } catch (error) {
                console.error('Failed to init SharedCursors:', error);
                if (mountedRef.current) setStatus('Error');
            }
        };

        void init();

        return () => {
            mountedRef.current = false;
            broadcastRef.current?.postMessage({
                sender: instanceIdRef.current,
                type: 'cursor_leave',
            } satisfies CursorMessage);
            broadcastRef.current?.close();
            broadcastRef.current = null;
            localPeerIdsRef.current.clear();
            openRtcPeerCountRef.current = 0;
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
        cursorStateRef.current?.set(payload);
        broadcastRef.current?.postMessage({
            sender: instanceIdRef.current,
            type: 'cursor',
            payload,
        } satisfies CursorMessage);
    };

    return (
        <>
            <div className="fixed bottom-4 right-4 z-9999 pointer-events-none">
                <div
                    aria-label={`OpenRTC ${status}: ${activeMemberCount} active cursors`}
                    className="px-3 py-1.5 bg-black/80 backdrop-blur rounded-full text-[10px] font-bold text-white border border-white/10 shadow-lg flex items-center gap-2"
                    data-openrtc-status={status}
                    data-active-member-count={activeMemberCount}
                    data-local-tab-peer-count={localPeerIdsRef.current.size}
                    data-remote-cursor-count={Object.keys(cursors).length}
                    data-local-cursor={JSON.stringify({ ...myMousePosition, color: myColor.current })}
                    data-remote-cursors={JSON.stringify(Object.values(cursors))}
                    data-testid="openrtc-presence"
                >
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                    <span>{activeMemberCount} ACTIVE CURSOR{activeMemberCount !== 1 ? 'S' : ''}</span>
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
