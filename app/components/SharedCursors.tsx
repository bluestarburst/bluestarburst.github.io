import React, { useEffect, useRef, useState } from 'react';
import { OpenRTC, type OpenRTCClient } from 'openrtc';
import { AsciiBackground } from './AsciiBackground';
import { StarField, SpaceDebris } from './ThreeElements';
import { useTheme } from './ThemeContext';

const ROOM_PREFIX = 'PORTFOLIO-CURSORS';
const ROOM_SHARDS = 12;
const API_KEY = 'pk_live_eefe17dd222ab2f010c6f41d37397f35985cf2e3';

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

const getRoomId = (shard: number) => `${ROOM_PREFIX}-${shard}`;

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
    const [myMousePosition, setMyMousePosition] = useState({ x: 0, z: 0 });
    const { theme } = useTheme();

    const updateMemberCount = () => {
        const peers = new Set(
            connectionsRef.current.map((conn) => conn.remoteNodeId?.trim() || conn.id),
        );
        setActiveMemberCount(peers.size + 1);
    };

    const joinOrCreateRoomOnce = async (client: OpenRTCClient, roomId: string) => {
        try {
            return await client.joinRoom(roomId, { bootstrapPeers: false });
        } catch (joinError) {
            const message = joinError instanceof Error ? joinError.message : String(joinError);
            if (!/room not found|not found|404/i.test(message)) {
                throw joinError;
            }

            try {
                await client.createRoom(roomId);
            } catch (createError) {
                const createMessage = createError instanceof Error ? createError.message : String(createError);
                if (!/already exists|409/i.test(createMessage)) {
                    throw createError;
                }
            }

            return client.joinRoom(roomId, { bootstrapPeers: false });
        }
    };

    const joinAvailableRoom = async (client: OpenRTCClient) => {
        let lastError: unknown = null;

        for (let attempt = 0; attempt < ROOM_SHARDS; attempt += 1) {
            const roomId = getRoomId(attempt);

            try {
                const connections = await joinOrCreateRoomOnce(client, roomId);
                return { roomId, connections };
            } catch (error) {
                lastError = error;
                const message = error instanceof Error ? error.message : String(error);
                const roomIsFull =
                    /room is full|resource-exhausted|429/i.test(message) ||
                    /full \(\d+\/\d+ members\)/i.test(message);
                if (!roomIsFull) {
                    throw error;
                }
            }
        }

        throw lastError ?? new Error('All shared cursor rooms are full.');
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
                    discoveryMode: 'personal',
                    spaceKey: 'portfolio-cursors',
                    storagePrefix: 'portfolio-cursors',
                    nodeIdPersistence: 'ephemeral',
                    transports: {
                        webrtc: true,
                        iroh: { persistenceMode: 'ephemeral' },
                    },
                });
                await client.connect();

                if (!mountedRef.current) return;
                clientRef.current = client;

                client.onConnection((conn) => {
                    if (mountedRef.current) setupConnection(conn);
                });

                const { roomId, connections } = await joinAvailableRoom(client);

                if (!mountedRef.current) return;
                activeRoomIdRef.current = roomId;
                setStatus('Joined');

                connections.forEach(conn => setupConnection(conn));
                updateMemberCount();

                const localNodeId = await client.getNodeId().catch(() => null);
                stopRoomWatchRef.current = client.watchRoom(roomId, (members) => {
                    const now = Date.now();
                    members.forEach((member) => {
                        const nodeId = member.nodeId?.trim();
                        const ticket = member.ticket?.trim();
                        if (!nodeId || !ticket || nodeId === localNodeId) return;
                        if (connectionsRef.current.some((conn) => conn.remoteNodeId === nodeId)) return;
                        if (pendingRoomDialsRef.current.has(nodeId)) return;
                        if ((failedRoomDialsRef.current.get(nodeId) ?? 0) > now) return;

                        pendingRoomDialsRef.current.add(nodeId);
                        client.connectPeer({ ticket })
                            .then((conn) => {
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

        connectionsRef.current.forEach(conn => {
            conn.send({ type: 'cursor', payload }).catch(() => { });
        });
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
