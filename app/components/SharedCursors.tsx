import React, { useEffect, useRef, useState } from 'react';
import { OpenRTC, spaceToken, type OpenRTCClient } from 'openrtc';
import { AsciiBackground } from './AsciiBackground';
import { StarField, SpaceDebris } from './ThreeElements';
import { useTheme } from './ThemeContext';
import { joinAvailableRoom } from './sharedCursorsRooms';

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

export function SharedCursors() {
    const [cursors, setCursors] = useState<Record<string, CursorPosition>>({});
    const [status, setStatus] = useState('Initializing...');
    const [activeMemberCount, setActiveMemberCount] = useState(0);

    type RoomConnection = Awaited<ReturnType<OpenRTCClient['joinRoom']>>[number];

    const clientRef = useRef<OpenRTCClient | null>(null);
    const myColor = useRef(getRandomColor());
    const connectionsRef = useRef<RoomConnection[]>([]);
    const mountedRef = useRef(true);
    const activeRoomIdRef = useRef<string | null>(null);
    const stopRoomWatchRef = useRef<(() => void) | null>(null);
    const pendingRoomDialsRef = useRef<Set<string>>(new Set());
    const failedRoomDialsRef = useRef<Map<string, number>>(new Map());
    const cursorSendTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const latestCursorPayloadRef = useRef<CursorPosition | null>(null);
    const [myMousePosition, setMyMousePosition] = useState({ x: 0, z: 0 });
    const { theme } = useTheme();

    const updateMemberCount = () => {
        const peers = new Set(
            connectionsRef.current.map((conn) => conn.remoteNodeId?.trim() || conn.id),
        );
        setActiveMemberCount(peers.size + 1);
    };

    useEffect(() => {
        mountedRef.current = true;

        const init = async () => {
            try {
                if (!API_KEY) {
                    setStatus('Missing API key');
                    return;
                }

                const client = OpenRTC({
                    apiKey: API_KEY,
                    discoveryMode: 'space',
                    space: 'portfolio-cursors',
                    storagePrefix: 'portfolio-cursors',
                    nodeIdPersistence: 'ephemeral',
                    strictMode: true,
                    spaceTokenProvider: spaceToken({
                        apiKey: API_KEY,
                        space: 'portfolio-cursors',
                        memberIdStorageKey: 'portfolio-cursors:member-id',
                    }),
                    transports: {
                        webrtc: { privacyMode: true },
                        iroh: {
                            persistenceMode: 'ephemeral',
                            relayOnly: true,
                        },
                    },
                });
                await client.connect();

                if (!mountedRef.current) return;
                clientRef.current = client;

                client.onConnection((conn: RoomConnection) => {
                    if (mountedRef.current) setupConnection(conn);
                });

                const { roomId, connections } = await joinAvailableRoom(client);

                if (!mountedRef.current) return;
                activeRoomIdRef.current = roomId;
                setStatus('Joined');

                connections.forEach((conn: RoomConnection) => setupConnection(conn));
                updateMemberCount();

                const localNodeId = await client.advanced.nodeId().catch(() => null);
                stopRoomWatchRef.current = client.watchRoom(roomId, (members: Array<{ nodeId?: string; ticket?: string }>) => {
                    const now = Date.now();
                    members.forEach((member: { nodeId?: string; ticket?: string }) => {
                        const nodeId = member.nodeId?.trim();
                        const ticket = member.ticket?.trim();
                        if (!nodeId || !ticket || nodeId === localNodeId) return;
                        if (connectionsRef.current.some((conn) => conn.remoteNodeId === nodeId)) return;
                        if (pendingRoomDialsRef.current.has(nodeId)) return;
                        if ((failedRoomDialsRef.current.get(nodeId) ?? 0) > now) return;

                        pendingRoomDialsRef.current.add(nodeId);
                        client.peers.connect({ deviceId: nodeId, ticket })
                            .then((conn: RoomConnection) => {
                                failedRoomDialsRef.current.delete(nodeId);
                                if (mountedRef.current) setupConnection(conn);
                            })
                            .catch(() => {
                                failedRoomDialsRef.current.set(nodeId, Date.now() + 60_000);
                            })
                            .finally(() => pendingRoomDialsRef.current.delete(nodeId));
                    });
                });

            } catch (err: any) {
                console.error("Failed to init SharedCursors:", err);
                if (mountedRef.current) setStatus(`Error`);
            }
        };

        init();

        return () => {
            mountedRef.current = false;
            stopRoomWatchRef.current?.();
            stopRoomWatchRef.current = null;
            const activeRoomId = activeRoomIdRef.current;
            if (activeRoomId) clientRef.current?.leaveRoom(activeRoomId).catch(() => {});
            activeRoomIdRef.current = null;
            clientRef.current?.disconnect();
            connectionsRef.current.forEach(c => c.disconnect());
            connectionsRef.current = [];
            pendingRoomDialsRef.current.clear();
            failedRoomDialsRef.current.clear();
            if (cursorSendTimerRef.current) {
                clearTimeout(cursorSendTimerRef.current);
                cursorSendTimerRef.current = null;
            }
            latestCursorPayloadRef.current = null;
        };
    }, []);

    const setupConnection = (conn: RoomConnection) => {
        if (connectionsRef.current.find(c => c.id === conn.id)) return;

        connectionsRef.current.push(conn);
        updateMemberCount();

        conn.onMessage((msg: any) => {
            if (!mountedRef.current) return;
            if (msg && typeof msg === 'object' && msg.type === 'cursor') {
                setCursors(prev => ({
                    ...prev,
                    [conn.id]: msg.payload
                }));
            }
        });

        conn.onDisconnect(() => {
            connectionsRef.current = connectionsRef.current.filter(c => c.id !== conn.id);
            if (mountedRef.current) {
                updateMemberCount();
                setCursors(prev => {
                    const newCursors = { ...prev };
                    delete newCursors[conn.id];
                    return newCursors;
                });
            }
        });
    };

    const handleProjectedCursorMove = (position: { x: number; z: number }) => {
        const payload = {
            x: position.x,
            z: position.z,
            color: myColor.current
        };

        setMyMousePosition(payload);
        latestCursorPayloadRef.current = payload;

        if (cursorSendTimerRef.current) return;
        cursorSendTimerRef.current = setTimeout(() => {
            cursorSendTimerRef.current = null;
            const latestPayload = latestCursorPayloadRef.current;
            if (!mountedRef.current || !latestPayload) return;
            connectionsRef.current.forEach(conn => {
                conn.send({ type: 'cursor', payload: latestPayload }).catch(() => { });
            });
        }, 50);
    };

    return (
        <>
            {/* Active Cursors Count UI */}
            <div className="fixed bottom-4 right-4 z-9999 pointer-events-none">
                <div className="px-3 py-1.5 bg-black/80 backdrop-blur rounded-full text-[10px] font-bold text-white border border-white/10 shadow-lg flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                    <span>{activeMemberCount} ACTIVE CURSOR{activeMemberCount !== 1 ? 'S' : ''}</span>
                </div>
            </div>

            {/* Remote Cursors are now rendered in the 3D scene via AsciiBackground */}

            <AsciiBackground positions={[
                ...Object.entries(cursors).map(([peerId, { x, z, color }]) => ({
                    x,
                    z,
                    color,
                    name: peerId.slice(0, 4)
                })),
                { x: myMousePosition.x, z: myMousePosition.z, color: myColor.current, name: 'You' }
            ]} onCursorMove={handleProjectedCursorMove}>
                <ambientLight intensity={0.5} />
                <pointLight position={[10, 10, 10]} intensity={1} color="#d2b48c" />

                <StarField theme={theme} />

                {/* Dynamically generated space debris along camera path */}
                <SpaceDebris theme={theme} />

                {/* Keep a few manual ones for specific foreground framing if desired */}
                {/* <FloatingGeometry position={[-4, 2, -5]} color="#d2b48c" geometryType="icosahedron" />
                <FloatingGeometry position={[4, -2, -3]} color="#a0a0a0" geometryType="octahedron" /> */}
            </AsciiBackground>
        </>
    );
}
