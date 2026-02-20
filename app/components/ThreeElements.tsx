import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// --- 3D Background Components ---

type DebrisItem = {
    position: [number, number, number],
    color: string,
    geometryType: 'box' | 'icosahedron' | 'octahedron'
};

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

export function ShootingStars({ spawnPoints, theme }: { spawnPoints: [number, number, number][], theme?: string }) {
    const starCount = Math.max(1, Math.min(10, spawnPoints.length || 1));
    const headRefs = useRef<(THREE.Mesh | null)[]>([]);
    const headMaterialRefs = useRef<(THREE.MeshBasicMaterial | null)[]>([]);
    const trailRefs = useRef<(THREE.Mesh | null)[]>([]);
    const trailMaterialRefs = useRef<(THREE.MeshBasicMaterial | null)[]>([]);

    const direction = useMemo(() => new THREE.Vector3(-0.1, 0.25, 1).normalize(), []);
    const backwardDirection = useMemo(() => direction.clone().multiplyScalar(-1), [direction]);
    const trailQuaternion = useMemo(
        () => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), backwardDirection),
        [backwardDirection]
    );

    const stars = useRef(Array.from({ length: starCount }, (_, index) => {
        const safeSpawnIndex = spawnPoints.length > 0 ? index % spawnPoints.length : 0;
        const spawn = spawnPoints[safeSpawnIndex] ?? [0, 0, 0];
        const speed = 4 + Math.random() * 2;
        return {
            spawnIndex: safeSpawnIndex,
            position: new THREE.Vector3(spawn[0], spawn[1], spawn[2]),
            velocity: direction.clone().multiplyScalar(speed),
            age: Math.random() * 1.5,
            lifetime: 2.8 + Math.random() * 1.8,
            cooldown: 0,
            trailLength: 1.8 + Math.random() * 2.2,
            fadeInDuration: 0.45,
            fadeOutDuration: 0.75,
        };
    }));

    const respawnStar = (index: number) => {
        const star = stars.current[index];
        const spawnIndex = spawnPoints.length > 0 ? Math.floor(Math.random() * spawnPoints.length) : 0;
        const spawn = spawnPoints[spawnIndex] ?? [0, 0, 0];
        const speed = 4 + Math.random() * 2;

        star.spawnIndex = spawnIndex;
        star.position.set(spawn[0], spawn[1], spawn[2]);
        star.velocity.copy(direction).multiplyScalar(speed);
        star.age = 0;
        star.lifetime = 2.8 + Math.random() * 1.8;
        star.cooldown = 0;
        star.trailLength = 1.8 + Math.random() * 2.2;
    };

    useFrame((_, delta) => {
        const clampedDelta = Math.min(delta, 0.1);

        for (let i = 0; i < stars.current.length; i++) {
            const star = stars.current[i];
            const head = headRefs.current[i];
            const headMaterial = headMaterialRefs.current[i];
            const trail = trailRefs.current[i];
            const trailMaterial = trailMaterialRefs.current[i];

            if (!head || !headMaterial || !trail || !trailMaterial) continue;

            if (star.cooldown > 0) {
                star.cooldown -= clampedDelta;
                head.visible = false;
                trail.visible = false;
                headMaterial.opacity = 0;
                trailMaterial.opacity = 0;
                if (star.cooldown <= 0) {
                    respawnStar(i);
                    head.visible = true;
                    trail.visible = true;
                }
                continue;
            }

            star.age += clampedDelta;
            star.position.addScaledVector(star.velocity, clampedDelta);

            if (star.age >= star.lifetime) {
                star.cooldown = 0.2 + Math.random() * 0.6;
                continue;
            }

            const fadeIn = Math.min(0.75, star.age / star.fadeInDuration);
            const fadeOut = Math.min(0.75, (star.lifetime - star.age) / star.fadeOutDuration);
            const opacity = Math.max(0, Math.min(fadeIn, fadeOut));

            head.position.copy(star.position);
            head.visible = true;
            headMaterial.opacity = opacity;

            trail.visible = true;
            trail.position
                .copy(star.position)
                .addScaledVector(backwardDirection, star.trailLength * 0.5);
            trail.quaternion.copy(trailQuaternion);
            trail.scale.set(1, star.trailLength, 1);

            trailMaterial.opacity = opacity * (theme === 'dark' ? 0.8 : 0.95);
        }
    });

    return (
        <group>
            {stars.current.map((_, index) => (
                <group key={index}>
                    <mesh ref={(mesh) => { headRefs.current[index] = mesh; }}>
                        <sphereGeometry args={[0.055, 8, 8]} />
                        <meshBasicMaterial
                            ref={(material) => { headMaterialRefs.current[index] = material; }}
                            color={theme === 'dark' ? '#ffffff' : '#9ca3af'}
                            transparent
                            opacity={0}
                            blending={theme === 'dark' ? THREE.AdditiveBlending : THREE.NormalBlending}
                            depthWrite={false}
                            toneMapped={false}
                        />
                    </mesh>
                    <mesh ref={(mesh) => { trailRefs.current[index] = mesh; }}>
                        <cylinderGeometry args={[0.004, 0.09, 1, 8, 1, true]} />
                        <meshBasicMaterial
                            ref={(material) => { trailMaterialRefs.current[index] = material; }}
                            color={theme === 'dark' ? '#fffffff' : '#9ca3af'}
                            transparent
                            opacity={0}
                            blending={theme === 'dark' ? THREE.AdditiveBlending : THREE.NormalBlending}
                            depthWrite={false}
                            side={THREE.DoubleSide}
                            toneMapped={false}
                        />
                    </mesh>
                </group>
            ))}
        </group>
    );
}

export function SpaceDebris({ theme }: { theme?: string }) {
    const debris = useMemo(() => {
        const items: DebrisItem[] = [];

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
            <ShootingStars
                spawnPoints={debris.map(item => item.position)}
                theme={theme}
            />
        </>
    );
}
