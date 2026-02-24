'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import { getTrack, type TrackObstacle, type TrackPoint } from '@/lib/tracks/track-data';
import { useGameStore } from '@/lib/stores/game-store';

const CENTER_LINE_WIDTH = 0.18;
const DASH_LEN = 1.2;
const GAP_LEN = 0.8;

/**
 * Renders the 3D track surface, boundaries, center line, and ground plane.
 * Styled after AWS DeepRacer tracks — dark asphalt, white curbs, dashed black center line.
 */
export function Track3D({ trackId }: { trackId: string }) {
  const track = getTrack(trackId);
  const visualSeed = useGameStore((s) => s.trackVisualSeed);
  const { surfaceGeo, leftGeo, rightGeo, centerLineGeo } = useMemo(
    () => buildTrackGeometry(track.waypoints, track.width),
    [track],
  );
  const labObstacles = useMemo(
    () => (track.environment === 'lab' ? jitterLabObstacles(track.obstacles ?? [], visualSeed) : (track.obstacles ?? [])),
    [track, visualSeed],
  );

  return (
    <group>
      {/* Ground plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[200, 200]} />
        <meshStandardMaterial color={track.environment === 'lab' ? '#5f5b52' : '#2d5a27'} />
      </mesh>

      {track.environment === 'lab' && <LabEnvironment obstacles={labObstacles} />}

      {/* Track surface */}
      <mesh geometry={surfaceGeo} position={[0, 0.01, 0]} receiveShadow>
        <meshStandardMaterial color="#3a3a3a" side={THREE.DoubleSide} />
      </mesh>

      {/* Center line (dashed black — DeepRacer style) */}
      <mesh geometry={centerLineGeo} position={[0, 0.025, 0]}>
        <meshStandardMaterial color="#111111" side={THREE.DoubleSide} />
      </mesh>

      {/* Left boundary (red/white curb) */}
      <mesh geometry={leftGeo} position={[0, 0.05, 0]}>
        <meshStandardMaterial color="#cc3333" />
      </mesh>

      {/* Right boundary (white curb) */}
      <mesh geometry={rightGeo} position={[0, 0.05, 0]}>
        <meshStandardMaterial color="#eeeeee" />
      </mesh>

      {/* Start/finish line — checkerboard style */}
      <mesh position={[track.spawnPos[0], 0.03, track.spawnPos[2]]} rotation={[-Math.PI / 2, 0, track.spawnRotation]}>
        <planeGeometry args={[track.width * 2, 0.6]} />
        <meshStandardMaterial color="#ffffff" opacity={0.9} transparent />
      </mesh>
      <mesh position={[track.spawnPos[0], 0.031, track.spawnPos[2]]} rotation={[-Math.PI / 2, 0, track.spawnRotation]}>
        <planeGeometry args={[track.width * 2, 0.15]} />
        <meshStandardMaterial color="#111111" />
      </mesh>
    </group>
  );
}

function hashString(value: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function jitterLabObstacles(obstacles: TrackObstacle[], visualSeed: number): TrackObstacle[] {
  if (!visualSeed) return obstacles;
  return obstacles.map((obs) => {
    const rand = mulberry32((visualSeed ^ hashString(obs.id)) >>> 0);
    const jitterPos = obs.kind === 'chair' ? 0.75 : obs.kind === 'cone' ? 1.0 : 0.45;
    const jitterRot = obs.kind === 'cone' ? 0.25 : 0.45;
    const dx = (rand() * 2 - 1) * jitterPos;
    const dz = (rand() * 2 - 1) * jitterPos;
    const drot = (rand() * 2 - 1) * jitterRot;
    return {
      ...obs,
      x: obs.x + dx,
      z: obs.z + dz,
      rotation: (obs.rotation ?? 0) + drot,
    };
  });
}

function LabEnvironment({ obstacles }: { obstacles: TrackObstacle[] }) {
  const roomWidth = 104;
  const roomDepth = 72;
  const wallHeight = 10;
  return (
    <group>
      {/* Room pad / floor tint */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[roomWidth, roomDepth]} />
        <meshStandardMaterial color="#7a7365" roughness={0.95} metalness={0.02} />
      </mesh>

      {/* Floor tile grid helps the car feel small in a full-size room */}
      {Array.from({ length: 9 }).map((_, i) => {
        const z = -32 + i * 8;
        return (
          <mesh key={`tile-z-${i}`} position={[0, 0.005, z]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[roomWidth, 0.06]} />
            <meshStandardMaterial color="#8d8678" opacity={0.35} transparent />
          </mesh>
        );
      })}
      {Array.from({ length: 13 }).map((_, i) => {
        const x = -48 + i * 8;
        return (
          <mesh key={`tile-x-${i}`} position={[x, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[roomDepth, 0.06]} />
            <meshStandardMaterial color="#8d8678" opacity={0.35} transparent />
          </mesh>
        );
      })}

      {/* Full-height room boundary walls */}
      <mesh position={[0, wallHeight / 2, -roomDepth / 2]}>
        <boxGeometry args={[roomWidth, wallHeight, 0.8]} />
        <meshStandardMaterial color="#d9d7cf" />
      </mesh>
      <mesh position={[0, wallHeight / 2, roomDepth / 2]}>
        <boxGeometry args={[roomWidth, wallHeight, 0.8]} />
        <meshStandardMaterial color="#d9d7cf" />
      </mesh>
      <mesh position={[-roomWidth / 2, wallHeight / 2, 0]}>
        <boxGeometry args={[0.8, wallHeight, roomDepth]} />
        <meshStandardMaterial color="#d9d7cf" />
      </mesh>
      <mesh position={[roomWidth / 2, wallHeight / 2, 0]}>
        <boxGeometry args={[0.8, wallHeight, roomDepth]} />
        <meshStandardMaterial color="#d9d7cf" />
      </mesh>

      {/* Classroom features for scale cues */}
      <mesh position={[0, 4.4, -roomDepth / 2 + 0.45]}>
        <boxGeometry args={[18, 3.2, 0.08]} />
        <meshStandardMaterial color="#f4f8fb" />
      </mesh>
      <mesh position={[0, 4.4, -roomDepth / 2 + 0.41]}>
        <boxGeometry args={[19.2, 3.8, 0.05]} />
        <meshStandardMaterial color="#5b4633" />
      </mesh>

      {[-28, -12, 12, 28].map((x) => (
        <group key={`window-${x}`} position={[x, 6.2, roomDepth / 2 - 0.45]}>
          <mesh>
            <boxGeometry args={[10, 3.6, 0.08]} />
            <meshStandardMaterial color="#b9d7ea" opacity={0.8} transparent />
          </mesh>
          <mesh position={[0, 0, -0.02]}>
            <boxGeometry args={[10.8, 4.2, 0.04]} />
            <meshStandardMaterial color="#f5f1e5" />
          </mesh>
          <mesh position={[0, 0, 0.03]}>
            <boxGeometry args={[0.12, 3.6, 0.04]} />
            <meshStandardMaterial color="#f5f1e5" />
          </mesh>
          <mesh position={[0, 0, 0.03]} rotation={[0, 0, Math.PI / 2]}>
            <boxGeometry args={[0.12, 10, 0.04]} />
            <meshStandardMaterial color="#f5f1e5" />
          </mesh>
        </group>
      ))}

      <group position={[roomWidth / 2 - 4.8, 0, -roomDepth / 2 + 6]}>
        <mesh position={[0, 4.2, 0]}>
          <boxGeometry args={[1.8, 8.4, 0.12]} />
          <meshStandardMaterial color="#7b5b40" />
        </mesh>
        <mesh position={[-0.55, 4.2, 0.08]}>
          <boxGeometry args={[0.06, 0.9, 0.05]} />
          <meshStandardMaterial color="#d7d7d7" />
        </mesh>
      </group>

      {/* Ceiling lights as visual references */}
      {[-30, 0, 30].map((x) => (
        <group key={`light-${x}`} position={[x, 8.8, 0]}>
          <mesh>
            <boxGeometry args={[12, 0.2, 2.4]} />
            <meshStandardMaterial color="#f3f1e9" emissive="#fff4bf" emissiveIntensity={0.22} />
          </mesh>
          <mesh position={[0, -0.22, 0]}>
            <boxGeometry args={[11.4, 0.06, 1.8]} />
            <meshStandardMaterial color="#fff6c8" emissive="#fff4bf" emissiveIntensity={0.3} />
          </mesh>
        </group>
      ))}

      {/* Teacher station and storage add more "real room" scale references */}
      <group position={[-36, 0, -28]} rotation={[0, 0.05, 0]}>
        <TableProp />
        <mesh position={[4.8, 1.4, -0.8]} castShadow receiveShadow>
          <boxGeometry args={[1.4, 2.8, 0.8]} />
          <meshStandardMaterial color="#64748b" />
        </mesh>
      </group>
      <mesh position={[40, 1.6, 24]} castShadow receiveShadow>
        <boxGeometry args={[2.6, 3.2, 10]} />
        <meshStandardMaterial color="#b8b1a3" />
      </mesh>

      {obstacles.map((obs) => (
        <group
          key={obs.id}
          position={[obs.x, 0, obs.z]}
          rotation={[0, obs.rotation ?? 0, 0]}
          scale={obs.scale ?? 1}
        >
          {obs.kind === 'table' && <TableProp />}
          {obs.kind === 'chair' && <ChairProp />}
          {obs.kind === 'cone' && <ConeProp />}
        </group>
      ))}
    </group>
  );
}

function TableProp() {
  return (
    <group>
      <mesh position={[0, 1.12, 0]} castShadow receiveShadow>
        <boxGeometry args={[6.4, 0.18, 3.0]} />
        <meshStandardMaterial color="#a0764a" />
      </mesh>
      {[
        [-2.8, 0.55, -1.25],
        [2.8, 0.55, -1.25],
        [-2.8, 0.55, 1.25],
        [2.8, 0.55, 1.25],
      ].map((p, i) => (
        <mesh key={i} position={p as [number, number, number]} castShadow>
          <boxGeometry args={[0.18, 1.1, 0.18]} />
          <meshStandardMaterial color="#6b4f34" />
        </mesh>
      ))}
    </group>
  );
}

function ChairProp() {
  return (
    <group>
      <mesh position={[0, 0.62, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.25, 0.12, 1.25]} />
        <meshStandardMaterial color="#2f4f6f" />
      </mesh>
      <mesh position={[0, 1.38, -0.52]} castShadow>
        <boxGeometry args={[1.25, 1.25, 0.12]} />
        <meshStandardMaterial color="#3a5f84" />
      </mesh>
      {[
        [-0.48, 0.3, -0.48],
        [0.48, 0.3, -0.48],
        [-0.48, 0.3, 0.48],
        [0.48, 0.3, 0.48],
      ].map((p, i) => (
        <mesh key={i} position={p as [number, number, number]} castShadow>
          <boxGeometry args={[0.1, 0.6, 0.1]} />
          <meshStandardMaterial color="#4b5563" />
        </mesh>
      ))}
    </group>
  );
}

function ConeProp() {
  return (
    <group>
      <mesh position={[0, 0.3, 0]} castShadow receiveShadow>
        <coneGeometry args={[0.45, 0.7, 12]} />
        <meshStandardMaterial color="#f97316" />
      </mesh>
      <mesh position={[0, 0.03, 0]} receiveShadow>
        <cylinderGeometry args={[0.55, 0.55, 0.06, 12]} />
        <meshStandardMaterial color="#111827" />
      </mesh>
    </group>
  );
}

function buildTrackGeometry(waypoints: TrackPoint[], halfWidth: number) {
  const n = waypoints.length;
  const surfaceVerts: number[] = [];
  const surfaceIndices: number[] = [];
  const leftVerts: number[] = [];
  const leftIndices: number[] = [];
  const rightVerts: number[] = [];
  const rightIndices: number[] = [];

  const curbWidth = 0.4;

  for (let i = 0; i < n; i++) {
    const curr = waypoints[i];
    const next = waypoints[(i + 1) % n];
    const dx = next.x - curr.x;
    const dz = next.z - curr.z;
    const len = Math.sqrt(dx * dx + dz * dz) || 1;
    // Normal perpendicular to direction
    const nx = -dz / len;
    const nz = dx / len;

    // Surface: left and right edge
    surfaceVerts.push(curr.x + nx * halfWidth, 0, curr.z + nz * halfWidth);
    surfaceVerts.push(curr.x - nx * halfWidth, 0, curr.z - nz * halfWidth);

    // Left curb
    leftVerts.push(curr.x + nx * halfWidth, 0, curr.z + nz * halfWidth);
    leftVerts.push(curr.x + nx * (halfWidth + curbWidth), 0, curr.z + nz * (halfWidth + curbWidth));

    // Right curb
    rightVerts.push(curr.x - nx * halfWidth, 0, curr.z - nz * halfWidth);
    rightVerts.push(curr.x - nx * (halfWidth + curbWidth), 0, curr.z - nz * (halfWidth + curbWidth));

    if (i < n - 1 || true) { // close the loop
      const base = i * 2;
      const nextBase = ((i + 1) % n) * 2;
      // Two triangles per quad
      surfaceIndices.push(base, nextBase, base + 1);
      surfaceIndices.push(base + 1, nextBase, nextBase + 1);
      leftIndices.push(base, nextBase, base + 1);
      leftIndices.push(base + 1, nextBase, nextBase + 1);
      rightIndices.push(base, nextBase, base + 1);
      rightIndices.push(base + 1, nextBase, nextBase + 1);
    }
  }

  // --- Center line (dashed) ---
  const centerVerts: number[] = [];
  const centerIndices: number[] = [];
  let accumulated = 0;
  let drawing = true; // start with a dash
  let cIdx = 0;

  for (let i = 0; i < n; i++) {
    const curr = waypoints[i];
    const next = waypoints[(i + 1) % n];
    const sdx = next.x - curr.x;
    const sdz = next.z - curr.z;
    const segLen = Math.sqrt(sdx * sdx + sdz * sdz) || 0.01;
    const dirX = sdx / segLen;
    const dirZ = sdz / segLen;
    // Perpendicular
    const pnx = -dirZ;
    const pnz = dirX;

    let traveled = 0;
    while (traveled < segLen) {
      const threshold = drawing ? DASH_LEN : GAP_LEN;
      const remaining = threshold - accumulated;
      const step = Math.min(remaining, segLen - traveled);

      if (drawing) {
        // Start point of this dash segment
        const sx = curr.x + dirX * traveled;
        const sz = curr.z + dirZ * traveled;
        // End point
        const ex = curr.x + dirX * (traveled + step);
        const ez = curr.z + dirZ * (traveled + step);

        const hw = CENTER_LINE_WIDTH;
        const base = cIdx;
        centerVerts.push(sx + pnx * hw, 0, sz + pnz * hw);
        centerVerts.push(sx - pnx * hw, 0, sz - pnz * hw);
        centerVerts.push(ex + pnx * hw, 0, ez + pnz * hw);
        centerVerts.push(ex - pnx * hw, 0, ez - pnz * hw);
        centerIndices.push(base, base + 2, base + 1);
        centerIndices.push(base + 1, base + 2, base + 3);
        cIdx += 4;
      }

      traveled += step;
      accumulated += step;
      if (accumulated >= (drawing ? DASH_LEN : GAP_LEN)) {
        accumulated = 0;
        drawing = !drawing;
      }
    }
  }

  function makeGeo(verts: number[], indices: number[]) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }

  return {
    surfaceGeo: makeGeo(surfaceVerts, surfaceIndices),
    leftGeo: makeGeo(leftVerts, leftIndices),
    rightGeo: makeGeo(rightVerts, rightIndices),
    centerLineGeo: makeGeo(centerVerts, centerIndices),
  };
}
