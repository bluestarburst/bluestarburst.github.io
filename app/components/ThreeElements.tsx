import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// --- 3D Background Components ---

export function StarField({ theme }: { theme?: string }) {
    const count = 750;
    const positions = useMemo(() => {
        const pos = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            pos[i * 3] = (Math.random() - 0.5) * 50; // x
            pos[i * 3 + 1] = (Math.random() - 0.5) * 50; // y
            pos[i * 3 + 2] = (Math.random() - 0.5) * 50; // z
        }
        return pos;
    }, []);

    const starMaterial = useMemo(() => {
        return new THREE.ShaderMaterial({
            uniforms: {
                color: { value: new THREE.Color(theme === 'dark' ? "#ffffff" : "#4b5563") },
                time: { value: 0 }
            },
            vertexShader: `
              varying vec3 vColor;
              void main() {
                  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                  gl_PointSize = 150.0 * (1.0 / -mvPosition.z); // Size attenuation
                  gl_Position = projectionMatrix * mvPosition;
              }
          `,
            fragmentShader: `
              uniform vec3 color;
              void main() {
                  // Transform gl_PointCoord (0..1) to (-1..1) centered
                  vec2 uv = gl_PointCoord * 2.0 - 1.0;
                  
                  // Astroid equation: x^(2/3) + y^(2/3) = 1
                  // Distance field: d = |x|^(2/3) + |y|^(2/3)
                  float d = pow(abs(uv.x), 0.66) + pow(abs(uv.y), 0.66);
                  
                  // Smooth edges
                  float alpha = 0.1 - smoothstep(0.8, 1.0, d);
                  
                  // Add a soft glow center
                  float glow = 1.0 - length(uv);
                  alpha += glow * 0.2;
                  
                  // Discard fragments outside the star shape
                  if (alpha < 0.01) discard;
                  
                  gl_FragColor = vec4(color, alpha);
              }
          `,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });
    }, [theme]);

    return (
        <points material={starMaterial}>
            <bufferGeometry>
                <bufferAttribute
                    attach="attributes-position"
                    count={count}
                    array={positions}
                    itemSize={3}
                    args={[positions, 3]}
                />
            </bufferGeometry>
        </points>
    );
}

export function FloatingGeometry({ position, color, geometryType = 'box', theme }: { position: [number, number, number], color: string, geometryType?: 'box' | 'icosahedron' | 'octahedron', theme?: string }) {
    const meshRef = useRef<THREE.Mesh>(null!);
    const [hovered, setHovered] = React.useState(false);

    // Use useMemo to prevent recreating geometry on every frame
    const geometry = useMemo(() => {
        if (geometryType === 'icosahedron') return <icosahedronGeometry args={[0.8, 0]} />;
        if (geometryType === 'octahedron') return <octahedronGeometry args={[0.8, 0]} />;
        return <boxGeometry args={[1, 1, 1]} />;
    }, [geometryType]);

    useFrame((state, delta) => {
        const t = state.clock.getElapsedTime();
        if (meshRef.current) {
            // Rotation
            meshRef.current.rotation.x = Math.sin(t * 0.3) * 0.2;
            meshRef.current.rotation.y = Math.sin(t * 0.2) * 0.2 + (position[0] * 0.1);
            meshRef.current.rotation.z += 0.005;

            // Floating (Bobbing) effect manually implemented since we removed Drei
            meshRef.current.position.y = position[1] + Math.sin(t * 0.5 + position[0]) * 0.2;

            // Interactive effects
            const targetScale = hovered ? 1.5 : 1.0;

            // Light mode: Hover makes it solid and dark (opacity 1, emissive 0)
            // Dark mode: Hover makes it glow bright (opacity 0.15, emissive 2.0)
            let targetEmissive = 0.5;
            let targetOpacity = 0.15;

            if (theme === 'dark') {
                targetEmissive = hovered ? 2.0 : 0.5;
                targetOpacity = 0.15;
            } else {
                // Light mode
                targetEmissive = hovered ? 0.0 : 0.5; // Turn off glow on hover to make it dark
                targetOpacity = hovered ? 1.0 : 0.15; // Make it solid on hover
            }

            // Smoothly interpolate scale
            meshRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), delta * 10);

            // Smoothly interpolate emissive intensity
            const material = meshRef.current.material as THREE.MeshStandardMaterial;
            material.emissiveIntensity = THREE.MathUtils.lerp(material.emissiveIntensity, targetEmissive, delta * 10);
            material.opacity = THREE.MathUtils.lerp(material.opacity, targetOpacity, delta * 10);
        }
    });

    return (
        <mesh
            ref={meshRef}
            position={position}
            onPointerOver={() => { document.body.style.cursor = 'pointer'; setHovered(true); }}
            onPointerOut={() => { document.body.style.cursor = 'auto'; setHovered(false); }}
        >
            {geometry}
            <meshStandardMaterial
                color={color}
                wireframe
                transparent
                opacity={0.15}
                emissive={color}
                emissiveIntensity={0.5}
            />
        </mesh>
    );
}

export function SpaceDebris({ theme }: { theme?: string }) {
    const debris = useMemo(() => {
        const items: { position: [number, number, number], color: string, geometryType: 'box' | 'icosahedron' | 'octahedron' }[] = [];

        const startPos = new THREE.Vector3(0, 0, 0);
        const endPos = new THREE.Vector3(-0.1, 15, 25);
        const direction = new THREE.Vector3().subVectors(endPos, startPos);

        // Colors from the palette
        const colors = ['#d2b48c', '#a0a0a0', '#ffffff', '#8c9eff'];
        const shapes: ('box' | 'icosahedron' | 'octahedron')[] = ['box', 'icosahedron', 'octahedron'];

        // 1. Along the path
        for (let i = 0; i < 15; i++) {
            const t = Math.random();
            // Interpolate along the line
            const pos = new THREE.Vector3().copy(startPos).add(direction.clone().multiplyScalar(t));

            // Add randomness perpendicular to the path

            const randomX = Math.random() - 0.5 + Math.sin(t * 10) * 0.5;
            const randomZ = Math.random() - 0.5 + Math.cos(t * 10) * 0.5;
            const randomAmt = 20;
            const minSpread = 5;

            pos.x += randomX * randomAmt + Math.sign(randomX) * minSpread; // Spread width
            // pos.y += (Math.random() - 0.5) * 40; // Spread height
            pos.z += randomZ * randomAmt + Math.sign(randomZ) * minSpread;

            items.push({
                position: [pos.x, pos.y, pos.z],
                color: colors[Math.floor(Math.random() * colors.length)],
                geometryType: shapes[Math.floor(Math.random() * shapes.length)]
            });
        }

        // 2. Cluster around the end position (Zoomed out view)
        for (let i = 0; i < 5; i++) {
            // Random sphere distribution around endPos
            const r = 5 + Math.random() * 10; // Radius 5 to 15
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);

            const x = endPos.x + r * Math.sin(phi) * Math.cos(theta);
            const y = endPos.y + r * Math.sin(phi) * Math.sin(theta);
            const z = endPos.z + r * Math.cos(phi);

            items.push({
                position: [x, y, z],
                color: colors[Math.floor(Math.random() * colors.length)],
                geometryType: shapes[Math.floor(Math.random() * shapes.length)]
            });
        }

        return items;
    }, []);

    return (
        <>
            {debris.map((item, i) => (
                <FloatingGeometry
                    key={i}
                    position={item.position}
                    color={item.color}
                    geometryType={item.geometryType}
                    theme={theme}
                />
            ))}
        </>
    );
}
