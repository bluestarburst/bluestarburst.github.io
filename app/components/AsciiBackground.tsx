import { useRef, useMemo, useState, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { useTheme } from "./ThemeContext";

type CursorData = {
    x: number;
    z: number;
    color?: string;
    name?: string;
};

type CursorUv = {
    x: number;
    y: number;
};

const TERRAIN_SIZE = 25;

const snoise = `
    vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec4 permute(vec4 x) { return mod289(((x*34.0)+10.0)*x); }
    vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

    float snoise(vec3 v) { 
        const vec2  C = vec2(1.0/6.0, 1.0/3.0);
        const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);

        vec3 i  = floor(v + dot(v, C.yyy));
        vec3 x0 = v - i + dot(i, C.xxx);

        vec3 g = step(x0.yzx, x0.xyz);
        vec3 l = 1.0 - g;
        vec3 i1 = min(g.xyz, l.zxy);
        vec3 i2 = max(g.xyz, l.zxy);

        vec3 x1 = x0 - i1 + C.xxx;
        vec3 x2 = x0 - i2 + C.yyy;
        vec3 x3 = x0 - D.yyy;

        i = mod289(i); 
        vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));

        float n_ = 0.142857142857; 
        vec3  ns = n_ * D.wyz - D.xzx;

        vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

        vec4 x_ = floor(j * ns.z);
        vec4 y_ = floor(j - 7.0 * x_);

        vec4 x = x_ * ns.x + ns.yyyy;
        vec4 y = y_ * ns.x + ns.yyyy;
        vec4 h = 1.0 - abs(x) - abs(y);

        vec4 b0 = vec4(x.xy, y.xy);
        vec4 b1 = vec4(x.zw, y.zw);

        vec4 s0 = floor(b0) * 2.0 + 1.0;
        vec4 s1 = floor(b1) * 2.0 + 1.0;
        vec4 sh = -step(h, vec4(0.0));

        vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
        vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

        vec3 p0 = vec3(a0.xy, h.x);
        vec3 p1 = vec3(a0.zw, h.y);
        vec3 p2 = vec3(a1.xy, h.z);
        vec3 p3 = vec3(a1.zw, h.w);

        vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
        p0 *= norm.x;
        p1 *= norm.y;
        p2 *= norm.z;
        p3 *= norm.w;

        vec4 m = max(0.5 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
        m = m * m;
        return 105.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
    }
`;


function TopographicMaterial({ positions, theme }: { positions: CursorUv[], theme: string }) {
    const materialRef = useRef<THREE.ShaderMaterial>(null);

    const uniforms = useMemo(() => ({
        color: { value: new THREE.Color(0xffffff) },
        // backgroundColor: { value: new THREE.Color(0x000000) }, // No longer needed for filling
        time: { value: 0 },
        cursorPositions: { value: Array.from({ length: 10 }, () => new THREE.Vector2(0, 0)) },
        cursorCount: { value: 0 }
    }), []);

    const vertexShader = snoise + `
        uniform float time;
        uniform vec2 cursorPositions[10];
        uniform int cursorCount;
        
        varying vec2 vUv;
        varying float vNoise;
        
        void main() {
            vUv = uv;
            
            // Calculate noise for this vertex
            float noise = snoise(vec3(uv * 8.0, time * 0.012));
            
            // Add influence from cursor positions
            for (int i = 0; i < 10; i++) {
                if (i >= cursorCount) break;
                vec2 cursorPos = cursorPositions[i];
                float dist = distance(uv, cursorPos);
                float influence = max(0.0, (0.2 - dist) / 0.2);
                noise += influence * 0.5;
            }
            
            vNoise = noise;
            
            // Displace vertex position along normal (z-axis for a plane)
            vec3 newPosition = position;
            newPosition.z = noise * 1.5; // Adjust 1.5 for height intensity
            
            gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
        }
    `;

    const fragmentShader = `
        uniform vec3 color;
        // uniform vec3 backgroundColor;
        
        varying vec2 vUv;
        varying float vNoise;

        void main() {
            float levels = 8.0;

            float noise = (vNoise + 1.0) / 3.0;

            float lower = floor(noise * levels) / levels;
            float lowerDiff = noise - lower;

            // Calculate fade at edges for each side
            float fadeDistance = 0.15; // Distance from edge to start fading
            float fadeFactor = 1.0;
            
            // Fade from each edge (not circular, rectangular)
            fadeFactor *= smoothstep(0.0, fadeDistance, vUv.x); // Left edge
            fadeFactor *= smoothstep(1.0, 1.0 - fadeDistance, vUv.x); // Right edge
            fadeFactor *= smoothstep(0.0, fadeDistance, vUv.y); // Bottom edge
            fadeFactor *= smoothstep(1.0, 1.0 - fadeDistance, vUv.y); // Top edge
            
            // Draw contour lines
            if (lowerDiff < 0.01) {
                // Higher elevations (higher lower value) = more opaque lines
                float lineOpacity = (0.1 + (lower * 0.3)) * fadeFactor;
                gl_FragColor = vec4(color, lineOpacity);
            } else {
                // Fill with transparent background
                gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
            }
        }
    `;

    useFrame(({ clock }) => {
        if (materialRef.current) {
            materialRef.current.uniforms.time.value = clock.getElapsedTime();

            // Update cursor positions in place
            const uniformArray = materialRef.current.uniforms.cursorPositions.value;
            const posCount = Math.min(positions.length, 10);

            for (let i = 0; i < posCount; i++) {
                uniformArray[i].set(positions[i].x, positions[i].y);
            }

            // Clear unused positions
            for (let i = posCount; i < 10; i++) {
                uniformArray[i].set(0, 0);
            }

            materialRef.current.uniforms.cursorCount.value = posCount;
        }
    });

    useEffect(() => {
        if (materialRef.current) {
            if (theme === 'dark') {
                materialRef.current.uniforms.color.value.set(0xffffff);
            } else {
                materialRef.current.uniforms.color.value.set(0x171717); // neutral-900
            }
        }
    }, [theme]);

    return (
        <shaderMaterial
            ref={materialRef}
            uniforms={uniforms}
            vertexShader={vertexShader}
            fragmentShader={fragmentShader}
            side={THREE.DoubleSide}
            transparent={true}
        />
    );
}


function CameraController({ scrollProgress }: { scrollProgress: number }) {
    useFrame(({ camera }) => {
        // Birds-eye view at top: camera at [0, 0, 8] looking down
        // Isometric view when scrolled: camera at [0, 6, 6] looking at mesh

        const startPos = new THREE.Vector3(0.5, 10, 0.5);
        const endPos = new THREE.Vector3(-0.1, 15, 25);

        const targetPosition = new THREE.Vector3().lerpVectors(startPos, endPos, scrollProgress);

        // Smooth interpolation
        camera.position.lerp(targetPosition, 0.1);

        // Always look at the center of the mesh
        camera.lookAt(0, 0, 0);
    });

    return null;
}

function SmoothCursor({ targetPos, color, name, terrainRef }: { targetPos: CursorData; color?: string; name?: string; terrainRef: React.RefObject<THREE.Mesh | null> }) {
    const groupRef = useRef<THREE.Group>(null);
    const htmlRef = useRef<HTMLDivElement>(null);
    const smoothPos = useRef({ x: targetPos.x, z: targetPos.z });
    const opacityRef = useRef(1);
    const localPosRef = useRef(new THREE.Vector3());
    const worldPosRef = useRef(new THREE.Vector3());

    useFrame(() => {
        // Smooth interpolation using refs (no React re-renders)
        const lerpFactor = 0.1;
        smoothPos.current.x += (targetPos.x - smoothPos.current.x) * lerpFactor;
        smoothPos.current.z += (targetPos.z - smoothPos.current.z) * lerpFactor;

        // Update 3D position
        if (groupRef.current) {
            groupRef.current.position.set(
                smoothPos.current.x,
                0.15,
                smoothPos.current.z
            );
        }

        if (terrainRef.current && htmlRef.current) {
            worldPosRef.current.set(smoothPos.current.x, 0, smoothPos.current.z);
            localPosRef.current.copy(worldPosRef.current);
            terrainRef.current.worldToLocal(localPosRef.current);

            const uvX = (localPosRef.current.x + TERRAIN_SIZE / 2) / TERRAIN_SIZE;
            const uvY = (localPosRef.current.y + TERRAIN_SIZE / 2) / TERRAIN_SIZE;
            const fadeDistance = 0.15;

            const leftFade = THREE.MathUtils.smoothstep(uvX, 0, fadeDistance);
            const rightFade = 1 - THREE.MathUtils.smoothstep(uvX, 1 - fadeDistance, 1);
            const bottomFade = THREE.MathUtils.smoothstep(uvY, 0, fadeDistance);
            const topFade = 1 - THREE.MathUtils.smoothstep(uvY, 1 - fadeDistance, 1);

            const targetOpacity = THREE.MathUtils.clamp(leftFade * rightFade * bottomFade * topFade, 0, 1);
            opacityRef.current += (targetOpacity - opacityRef.current) * 0.12;
            htmlRef.current.style.opacity = `${opacityRef.current}`;
        }
    });

    return (
        <group ref={groupRef}>
            {/* Html cursor visual */}
            <Html
                position={[0, 0, 0]}
                scale={1}
            // occlude={"blending"}
            >
                <div ref={htmlRef} className="flex flex-col items-center gap-1 pointer-events-none text-gray-600 dark:text-gray-300">
                    {/* SVG cursor icon */}
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        opacity={0.8}
                        fill={color || "#000000"}
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="drop-shadow-md"
                    >
                        <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
                    </svg>
                    {/* Cursor label */}
                    <span
                        className="text-[10px] font-bold px-1.5 py-0.5 rounded text-white text-nowrap shadow-sm"
                        style={{ backgroundColor: color || "#ffffff" }}
                    >
                        {name || "User"}
                    </span>
                </div>
            </Html>
        </group>
    );
}

function Scene({ scrollProgress, positions, children, theme, onCursorMove, showCursorMarker = false, showCursorRay = false }: { scrollProgress: number; positions: { x: number; z: number, color?: string, name?: string }[], children?: React.ReactNode, theme: string, onCursorMove?: (position: { x: number; z: number }) => void, showCursorMarker?: boolean, showCursorRay?: boolean }) {
    const smoothPositionsRef = useRef(positions.map(p => ({ ...p })));
    const cursorUvsRef = useRef<CursorUv[]>([]);
    const terrainRef = useRef<THREE.Mesh>(null);
    const worldPosRef = useRef(new THREE.Vector3());

    useFrame(() => {
        // Smooth interpolation of cursor positions for shader
        const lerpFactor = 0.2;
        positions.forEach((newPos, idx) => {
            if (!smoothPositionsRef.current[idx]) {
                smoothPositionsRef.current[idx] = { ...newPos };
            }
            const smooth = smoothPositionsRef.current[idx];
            smooth.x += (newPos.x - smooth.x) * lerpFactor;
            smooth.z += (newPos.z - smooth.z) * lerpFactor;
            smooth.color = newPos.color;
            smooth.name = newPos.name;
        });

        // Remove extra positions if position count decreased
        if (smoothPositionsRef.current.length > positions.length) {
            smoothPositionsRef.current.length = positions.length;
        }

        if (terrainRef.current) {
            const uvPositions = cursorUvsRef.current;
            for (let i = 0; i < smoothPositionsRef.current.length; i++) {
                const pos = smoothPositionsRef.current[i];
                worldPosRef.current.set(pos.x, 0, pos.z);
                const localPos = terrainRef.current.worldToLocal(worldPosRef.current.clone());

                if (!uvPositions[i]) uvPositions[i] = { x: 0.5, y: 0.5 };

                uvPositions[i].x = THREE.MathUtils.clamp((localPos.x + TERRAIN_SIZE / 2) / TERRAIN_SIZE, 0, 1);
                uvPositions[i].y = THREE.MathUtils.clamp((localPos.y + TERRAIN_SIZE / 2) / TERRAIN_SIZE, 0, 1);
            }

            if (uvPositions.length > smoothPositionsRef.current.length) {
                uvPositions.length = smoothPositionsRef.current.length;
            }
        }
    });

    return (
        <>
            <CameraController scrollProgress={scrollProgress} />
            <CursorProjector onCursorMove={onCursorMove} showMarker={showCursorMarker} showRay={showCursorRay} />
            {children}
            <mesh ref={terrainRef} position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 4]}>
                <planeGeometry args={[25, 25, 256, 256]} />
                <TopographicMaterial positions={cursorUvsRef.current} theme={theme} />
            </mesh>

            <group>
                {/* Cursor visuals with smooth interpolation */}
                {positions.map((pos, idx) => (
                    <SmoothCursor
                        key={`${pos.name}-${idx}`}
                        targetPos={pos}
                        color={pos.color}
                        name={pos.name}
                        terrainRef={terrainRef}
                    />
                ))}
            </group>
        </>
    );
}

function CursorProjector({ onCursorMove, showMarker = false, showRay = false }: { onCursorMove?: (position: { x: number; z: number }) => void; showMarker?: boolean; showRay?: boolean }) {
    const { camera, gl } = useThree();
    const raycasterRef = useRef(new THREE.Raycaster());
    const pointerNdcRef = useRef(new THREE.Vector2(0, 0));
    const hasPointerRef = useRef(false);
    const planeRef = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));
    const hitPointRef = useRef(new THREE.Vector3());
    const lastSentRef = useRef<{ x: number; z: number } | null>(null);
    const markerRef = useRef<THREE.Mesh>(null);
    const rayLinePositionsRef = useRef(new Float32Array(6));
    const rayLine = useMemo(() => {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(rayLinePositionsRef.current, 3));
        const material = new THREE.LineBasicMaterial({
            color: '#d2b48c',
            transparent: true,
            opacity: 0.9,
            depthTest: false,
            toneMapped: false,
        });
        const line = new THREE.Line(geometry, material);
        line.frustumCulled = false;
        line.visible = false;
        return line;
    }, []);

    useEffect(() => {
        return () => {
            rayLine.geometry.dispose();
            (rayLine.material as THREE.Material).dispose();
        };
    }, [rayLine]);

    useEffect(() => {
        const handleMouseMove = (event: MouseEvent) => {
            const rect = gl.domElement.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return;

            pointerNdcRef.current.set(
                ((event.clientX - rect.left) / rect.width) * 2 - 1,
                -((event.clientY - rect.top) / rect.height) * 2 + 1
            );
            hasPointerRef.current = true;
        };

        window.addEventListener('mousemove', handleMouseMove, { passive: true });

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
        };
    }, [gl]);

    useFrame(() => {
        if (!hasPointerRef.current) {
            if (markerRef.current) markerRef.current.visible = false;
            rayLine.visible = false;
            return;
        }

        raycasterRef.current.setFromCamera(pointerNdcRef.current, camera);
        if (!raycasterRef.current.ray.intersectPlane(planeRef.current, hitPointRef.current)) {
            if (markerRef.current) markerRef.current.visible = false;
            rayLine.visible = false;
            return;
        }

        if (markerRef.current) {
            markerRef.current.visible = showMarker;
            markerRef.current.position.copy(hitPointRef.current);
        }

        if (rayLine.geometry instanceof THREE.BufferGeometry) {
            rayLine.visible = showRay;
            const positions = rayLinePositionsRef.current;
            const origin = raycasterRef.current.ray.origin;

            positions[0] = origin.x;
            positions[1] = origin.y;
            positions[2] = origin.z;
            positions[3] = hitPointRef.current.x;
            positions[4] = hitPointRef.current.y;
            positions[5] = hitPointRef.current.z;

            const attribute = rayLine.geometry.getAttribute('position');
            attribute.needsUpdate = true;
            rayLine.geometry.computeBoundingSphere();
        }

        const next = { x: hitPointRef.current.x, z: hitPointRef.current.z };
        const prev = lastSentRef.current;
        if (onCursorMove && (!prev || Math.hypot(next.x - prev.x, next.z - prev.z) > 0.02)) {
            lastSentRef.current = next;
            onCursorMove(next);
        }
    });

    return (
        <group>
            <primitive object={rayLine} />
            <mesh ref={markerRef}>
                <sphereGeometry args={[0.12, 16, 16]} />
                <meshBasicMaterial color="#d2b48c" depthTest={false} toneMapped={false} />
            </mesh>
        </group>
    );
}

export function AsciiBackground({ positions, children, onCursorMove, showCursorMarker = false, showCursorRay = false }: { positions: { x: number; z: number; color?: string; name?: string }[], children?: React.ReactNode, onCursorMove?: (position: { x: number; z: number }) => void, showCursorMarker?: boolean, showCursorRay?: boolean }) {
    const [scrollProgress, setScrollProgress] = useState(0);
    const { theme } = useTheme();

    useEffect(() => {
        const handleScroll = () => {
            const scrollTop = window.scrollY;
            const docHeight = document.documentElement.scrollHeight - window.innerHeight;
            const progress = Math.min(scrollTop / Math.max(docHeight * 0.3, 1), 1); // Use first 30% of page
            setScrollProgress(progress);
        };

        window.addEventListener('scroll', handleScroll);
        handleScroll(); // Initial call

        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    return (
        <div
            className="fixed top-0 inset-0 pointer-events-none w-full h-screen overflow-hidden -z-10"
        >
            <Canvas
                camera={{ position: [0, 8, 0], fov: 85, near: 0.01, far: 100 }}
                gl={{ alpha: true, antialias: true }}
            >
                <Scene scrollProgress={scrollProgress} positions={positions} theme={theme} onCursorMove={onCursorMove} showCursorMarker={showCursorMarker} showCursorRay={showCursorRay}>
                    {children}
                </Scene>
            </Canvas>
        </div>
    );
}