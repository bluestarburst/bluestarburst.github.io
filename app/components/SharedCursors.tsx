import React, { useEffect, useRef, useState } from 'react';
import { Client, Connection } from 'pluto-rtc';
import { AsciiBackground } from './AsciiBackground';
import { StarField, FloatingGeometry, SpaceDebris } from './ThreeElements';
import { useTheme } from './ThemeContext';

const ROOM_ID = 'demo';

interface CursorPosition {
    x: number;
    y: number;
    clientY: number;
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

    const clientRef = useRef<Client | null>(null);
    const myColor = useRef(getRandomColor());
    const connectionsRef = useRef<Connection[]>([]);
    const mountedRef = useRef(true);
    const [myMousePosition, setMyMousePosition] = useState({ x: 0, y: 0, clientY: 0 });
    const { theme } = useTheme();

    useEffect(() => {
        mountedRef.current = true;

        const init = async () => {
            try {
                const client = new Client({
                    tag: 'portfolio-cursors',
                    nodeIdPersistence: 'ephemeral'
                });
                await client.init();

                if (!mountedRef.current) return;
                clientRef.current = client;

                await client.startListening();

                client.onConnection((conn) => {
                    if (mountedRef.current) setupConnection(conn);
                });

                const connections = await client.rooms.joinRoom(ROOM_ID);

                if (!mountedRef.current) return;
                setStatus('Joined');

                // Set initial member count
                // Use active connections + 1 (for self)
                setActiveMemberCount(connections.length + 1);

                connections.forEach(conn => setupConnection(conn));

            } catch (err: any) {
                console.error("Failed to init SharedCursors:", err);
                if (mountedRef.current) setStatus(`Error`);
            }
        };

        init();

        return () => {
            mountedRef.current = false;
            clientRef.current?.stopListening();
            connectionsRef.current.forEach(c => c.disconnect());
            connectionsRef.current = [];
        };
    }, []);

    const setupConnection = (conn: Connection) => {
        if (connectionsRef.current.find(c => c.id === conn.id)) return;

        connectionsRef.current.push(conn);
        setActiveMemberCount(connectionsRef.current.length + 1);

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
                setActiveMemberCount(connectionsRef.current.length + 1);
                setCursors(prev => {
                    const newCursors = { ...prev };
                    delete newCursors[conn.id];
                    return newCursors;
                });
            }
        });
    };

    const myLastClientX = useRef(0);
    const myLastClientY = useRef(0);

    const handleMouseMove = (e: MouseEvent) => {
        const payload = {
            x: (e.clientX + document.documentElement.scrollLeft) / document.body.clientWidth,
            y: (e.clientY + document.documentElement.scrollTop) / document.body.clientHeight,
            clientY: e.clientY / window.innerHeight,
            color: myColor.current
        };

        myLastClientX.current = e.clientX;
        myLastClientY.current = e.clientY;

        setMyMousePosition(payload);

        connectionsRef.current.forEach(conn => {
            conn.send({ type: 'cursor', payload }).catch(() => { });
        });
    };

    const handleScroll = (e: Event) => {

        const payload = {
            x: myLastClientX.current + (window.scrollX / document.body.clientWidth),
            y: myLastClientY.current + (window.scrollY / document.body.clientHeight),
            clientY: myLastClientY.current / window.innerHeight,
            color: myColor.current
        };

        // connectionsRef.current.forEach(conn => {
        //     conn.send({ type: 'cursor', payload }).catch(() => { });
        // });
    }

    useEffect(() => {
        window.addEventListener('mousemove', handleMouseMove);
        document.getRootNode().addEventListener('scroll', handleScroll);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            document.getRootNode().removeEventListener('scroll', handleScroll);
        };
    }, []);

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
                ...Object.entries(cursors).map(([peerId, { x, y, clientY, color }]) => ({
                    x,
                    y: clientY,
                    color,
                    name: peerId.slice(0, 4)
                })),
                { x: myMousePosition.x, y: myMousePosition.clientY, color: myColor.current, name: 'You' }
            ]}>
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
