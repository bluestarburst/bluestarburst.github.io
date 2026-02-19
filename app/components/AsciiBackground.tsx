import { useRef, useMemo, useState, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

type CursorData = {
    x: number;
    y: number;
    color?: string;
    name?: string;
};

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

function TopographicMaterial({ positions }: { positions: CursorData[] }) {
    const materialRef = useRef<THREE.ShaderMaterial>(null);
    
    const uniforms = useMemo(() => ({
        color: { value: new THREE.Color(0xffffff) },
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
        
        varying vec2 vUv;
        varying float vNoise;

        void main() {
            float levels = 8.0;

            float noise = (vNoise + 1.0) / 3.0;

            float lower = floor(noise * levels) / levels;
            float lowerDiff = noise - lower;

            // Background color (black)
            vec3 backgroundColor = vec3(0.0, 0.0, 0.0);
            
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
                gl_FragColor = vec4(color * lineOpacity, 1.0);
            } else {
                // Fill with background color
                gl_FragColor = vec4(backgroundColor, 1.0);
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
                uniformArray[i].set(positions[i].x, 1.0 - positions[i].y); // Convert to UV space
            }
            
            // Clear unused positions
            for (let i = posCount; i < 10; i++) {
                uniformArray[i].set(0, 0);
            }
            
            materialRef.current.uniforms.cursorCount.value = posCount;
        }
    });

    return (
        <shaderMaterial
            ref={materialRef}
            uniforms={uniforms}
            vertexShader={vertexShader}
            fragmentShader={fragmentShader}
            side={THREE.DoubleSide}
            transparent={false}
        />
    );
}

function CursorOverlay({ positions }: { positions: CursorData[] }) {
    const containerRef = useRef<HTMLDivElement>(null);
    const { camera, size } = useThree();
    
    useFrame(() => {
        if (!containerRef.current) return;
        
        // Update positions of each cursor overlay
        const children = containerRef.current.querySelectorAll('[data-cursor-index]');
        positions.forEach((pos, idx) => {
            const child = children[idx] as HTMLElement;
            if (!child) return;
            
            // Convert 3D position to screen coordinates
            const worldPos = new THREE.Vector3(
                (pos.x - 0.5) * 20,
                2,
                (pos.y - 0.5) * 20
            );
            
            // Apply rotation to world position
            const rotatedPos = worldPos.clone();
            rotatedPos.applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 4);
            
            const screenPos = worldPos.project(camera);
            
            const x = (screenPos.x * 0.5 + 0.5) * size.width;
            const y = -(screenPos.y * 0.5 - 0.5) * size.height;
            
            child.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
            child.style.opacity = screenPos.z > 1 ? "0" : "1"; // Hide if behind camera
        });
    });
    
    return (
        <div
            ref={containerRef}
            className="absolute inset-0 pointer-events-none"
            style={{ width: "100%", height: "100%" }}
        >
            {positions.map((cursor, idx) => (
                <div
                    key={idx}
                    data-cursor-index={idx}
                    className="absolute flex flex-col items-center gap-1"
                    style={{
                        pointerEvents: "auto"
                    }}
                >
                    {/* Cursor circle */}
                    <div
                        className="w-6 h-6 rounded-full border-2 flex items-center justify-center"
                        style={{
                            borderColor: cursor.color || "#ffffff",
                            backgroundColor: cursor.color ? `${cursor.color}20` : "rgba(255,255,255,0.1)"
                        }}
                    >
                        <div
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: cursor.color || "#ffffff" }}
                        />
                    </div>
                    {/* Cursor name */}
                    <div
                        className="text-xs font-semibold whitespace-nowrap px-2 py-1 rounded-full"
                        style={{
                            backgroundColor: "rgba(0, 0, 0, 0.6)",
                            color: cursor.color || "#ffffff"
                        }}
                    >
                        {cursor.name || "You"}
                    </div>
                </div>
            ))}
        </div>
    );
}

function CameraController({ scrollProgress }: { scrollProgress: number }) {
    useFrame(({ camera }) => {
        // Birds-eye view at top: camera at [0, 0, 8] looking down
        // Isometric view when scrolled: camera at [0, 6, 6] looking at mesh

        const startDistance = 7;
        const endDistance = 25;

        const startPos = new THREE.Vector3(0.5, startDistance, 0.5);
        const endPos = new THREE.Vector3(-0.1, endDistance, endDistance);
        
        const targetPosition = new THREE.Vector3().lerpVectors(startPos, endPos, scrollProgress);
        
        // Smooth interpolation
        camera.position.lerp(targetPosition, 0.1);
        
        // Always look at the center of the mesh
        camera.lookAt(0, 0, 0);
    });
    
    return null;
}

function Scene({ scrollProgress, positions }: { scrollProgress: number; positions: { x: number; y: number }[] }) {
    return (
        <>
            <CameraController scrollProgress={scrollProgress} />
            <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 4]}>
                <planeGeometry args={[25, 25, 256, 256]} />
                <TopographicMaterial positions={positions} />
            </mesh>
            
            <group rotation={[0, Math.PI / 4, 0]}>
            {/* Cursor position spheres */}
            {positions.map((pos, idx) => (
                <mesh 
                    key={idx} 
                    position={[
                        (pos.x - 0.5) * 20,
                        2,
                        (pos.y - 0.5) * 20
                    ]}
                >
                    <sphereGeometry args={[0.5, 32, 32]} />
                    <meshBasicMaterial color={0xffffff} />
                </mesh>
            ))}
            </group>
        </>
    );
}

export function AsciiBackground({ positions }: { positions: { x: number; y: number }[] }) {
    const [scrollProgress, setScrollProgress] = useState(0);
    
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
            className="fixed top-0 inset-0 pointer-events-none w-full h-screen overflow-hidden"
        >
            <Canvas
                camera={{ position: [0, 8, 0], fov: 85 }}
                gl={{ alpha: false, antialias: true }}
            >
                <Scene scrollProgress={scrollProgress} positions={positions} />
            </Canvas>
        </div>
    );
}