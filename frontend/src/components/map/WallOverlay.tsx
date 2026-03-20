/**
 * WallOverlay — Three.js 3D wall rendering overlaid on pixi map canvas.
 * Uses OrthographicCamera synced pixel-perfect with pixi transform.
 * Renders booth boundaries as extruded 3D boxes.
 */
import { useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';

interface Booth {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  booth_number?: string;
  company_name?: string;
}

interface Transform {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  tilt: number;
}

interface WallOverlayProps {
  booths: Booth[];
  transformRef: React.MutableRefObject<Transform>;
  canvasDimsRef: React.MutableRefObject<{ width: number; height: number }>;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

const WALL_HEIGHT = 10; // world units height of wall boxes

export default function WallOverlay({ booths, transformRef, canvasDimsRef, containerRef }: WallOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const wallGroupRef = useRef<THREE.Group>(new THREE.Group());
  const rafRef = useRef<number>(0);

  // Build wall meshes from booth data
  const buildWalls = useCallback((scene: THREE.Scene, boothList: Booth[]) => {
    const oldGroup = wallGroupRef.current;
    scene.remove(oldGroup);
    oldGroup.traverse((child) => {
      if ((child as THREE.Mesh).geometry) (child as THREE.Mesh).geometry.dispose();
      if ((child as THREE.Mesh).material) {
        const mat = (child as THREE.Mesh).material;
        if (Array.isArray(mat)) mat.forEach(m => m.dispose());
        else (mat as THREE.Material).dispose();
      }
    });

    const group = new THREE.Group();

    const wallMat = new THREE.MeshLambertMaterial({ color: 0x5b6b7d, transparent: true });
    const topMat = new THREE.MeshLambertMaterial({ color: 0x8899aa, transparent: true });
    const bottomMat = new THREE.MeshLambertMaterial({ color: 0x3a4a5a, transparent: true });

    for (const booth of boothList) {
      const { x, y, width, height } = booth;
      const geo = new THREE.BoxGeometry(width, WALL_HEIGHT, height);
      const materials = [
        wallMat.clone(), // +x right
        wallMat.clone(), // -x left
        topMat.clone(),  // +y top
        bottomMat.clone(), // -y bottom
        wallMat.clone(), // +z front
        wallMat.clone(), // -z back
      ];
      const mesh = new THREE.Mesh(geo, materials);
      // Pixi world: (x, y) where y goes down.
      // Three.js: we keep x as-is, use z for pixi-y (same direction: +z = down on screen at rotation=0).
      // y-axis is "up" (wall height).
      // Box center at (cx, halfH, cy) in Three.js coords.
      mesh.position.set(x + width / 2, WALL_HEIGHT / 2, y + height / 2);
      group.add(mesh);

      // Wireframe edges
      const edges = new THREE.EdgesGeometry(geo);
      const lineMat = new THREE.LineBasicMaterial({ color: 0x3a4a5a, transparent: true, opacity: 0.4 });
      const wireframe = new THREE.LineSegments(edges, lineMat);
      wireframe.position.copy(mesh.position);
      group.add(wireframe);
    }

    scene.add(group);
    wallGroupRef.current = group;
  }, []);

  // Init Three.js
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setClearColor(0x000000, 0);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // OrthographicCamera — frustum set each frame to match pixi viewport
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100000);
    cameraRef.current = camera;

    // Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambient);
    const dir1 = new THREE.DirectionalLight(0xffffff, 0.7);
    dir1.position.set(-200, 500, -300);
    scene.add(dir1);
    const dir2 = new THREE.DirectionalLight(0xffffff, 0.3);
    dir2.position.set(200, 300, 200);
    scene.add(dir2);

    buildWalls(scene, booths);

    return () => {
      cancelAnimationFrame(rafRef.current);
      renderer.dispose();
      rendererRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rebuild walls when booths change
  useEffect(() => {
    const scene = sceneRef.current;
    if (scene) buildWalls(scene, booths);
  }, [booths, buildWalls]);

  // Render loop — sync camera with pixi transform
  useEffect(() => {
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    if (!renderer || !scene || !camera) return;

    let prevTilt = -1;

    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);

      const t = transformRef.current;
      const { width: vw, height: vh } = canvasDimsRef.current;
      if (vw === 0 || vh === 0) return;

      // Resize
      const canvas = canvasRef.current;
      if (canvas) {
        const dpr = window.devicePixelRatio || 1;
        const needW = Math.round(vw * dpr);
        const needH = Math.round(vh * dpr);
        if (canvas.width !== needW || canvas.height !== needH) {
          renderer.setSize(vw, vh);
        }
      }

      // Only render when tilted
      if (t.tilt < 3) {
        if (prevTilt >= 3) { renderer.clear(); }
        prevTilt = t.tilt;
        return;
      }
      prevTilt = t.tilt;

      // Fade in walls
      const alpha = Math.min(1, (t.tilt - 3) / 12);
      wallGroupRef.current.traverse((child) => {
        if ((child as THREE.Mesh).material) {
          const mat = (child as THREE.Mesh).material;
          if (Array.isArray(mat)) mat.forEach(m => { m.opacity = alpha; });
          else { (mat as THREE.Material).opacity = alpha; }
        }
      });

      // === Camera sync with pixi ===
      // Pixi draws world with: position=(t.x, t.y), scale, rotation (CW).
      // A world point (wx, wy) appears on screen at:
      //   sx = t.x + scale * (wx*cos(rot) - wy*sin(rot))
      //   sy = t.y + scale * (wx*sin(rot) + wy*cos(rot))
      //
      // We use OrthographicCamera looking down -Y axis (top-down).
      // Three.js world: x=pixi-x, z=pixi-y, y=height.
      // The camera "viewport" in world units = screen / scale.

      const halfW = (vw / t.scale) / 2;
      const halfH = (vh / t.scale) / 2;

      // Screen center in pixi world coords
      const cosR = Math.cos(-t.rotation);
      const sinR = Math.sin(-t.rotation);
      const scx = vw / 2 - t.x;
      const scy = vh / 2 - t.y;
      const worldCX = (scx * cosR + scy * sinR) / t.scale;
      const worldCY = (-scx * sinR + scy * cosR) / t.scale;

      // Tilt angle
      const tiltRad = (t.tilt * Math.PI) / 180;

      // Camera at world center, high above, tilted
      // For top-down (tilt=0): camera at (cx, far, cz), looking at (cx, 0, cz)
      // For tilt: orbit camera backward
      const camDist = 5000;
      const camY = camDist * Math.cos(tiltRad);
      // "backward" = in the direction of screen-top in world space
      // screen-top at rotation=0 is -z direction (pixi y decreases = upward)
      // Rotated by map rotation:
      const backDir = camDist * Math.sin(tiltRad);
      const camOffX = backDir * Math.sin(t.rotation);
      const camOffZ = -backDir * Math.cos(t.rotation);

      camera.position.set(worldCX + camOffX, camY, worldCY + camOffZ);
      camera.lookAt(worldCX, 0, worldCY);

      // Set orthographic frustum to match pixi scale
      // After lookAt, camera.up is (0,1,0). We need to also apply map rotation.
      // The camera's local "right" should align with pixi's screen-right.
      // We do this by rolling the camera by the rotation angle.
      // lookAt sets the camera matrix, then we rotate around the view axis.
      camera.left = -halfW;
      camera.right = halfW;
      camera.top = halfH;
      camera.bottom = -halfH;

      // Apply rotation as camera roll (rotate around view direction)
      // After lookAt, we modify the up vector and re-lookAt
      const upX = -Math.sin(t.rotation) * Math.cos(tiltRad);
      const upY = Math.cos(tiltRad); // stays mostly up when no tilt... but we need more precision
      const upZ = Math.cos(t.rotation) * Math.cos(tiltRad);
      // Actually, simpler: set up vector, then lookAt recalculates
      // For a tilted orthographic camera:
      // up = direction of "screen up" in world space
      // screen-up (no rotation) = -z (pixi y decreases going up)
      // with rotation: rotate (-z) by rotation around y
      // This is actually the "forward tilt" direction, not "up"...

      // Let's use the matrix approach:
      // 1. Set camera to look straight down
      // 2. Rotate by tilt (pitch forward)
      // 3. Rotate by map rotation (yaw)

      // Reset camera
      camera.position.set(0, camDist, 0);
      camera.up.set(0, 0, -1); // looking down, "up" = toward -z (screen top = pixi y=0)
      camera.lookAt(0, 0, 0);

      // Build rotation: yaw (map rotation) then pitch (tilt)
      const euler = new THREE.Euler(tiltRad, -t.rotation, 0, 'YXZ');
      const quat = new THREE.Quaternion().setFromEuler(euler);

      // Offset: rotate the (0, camDist, 0) position
      const offset = new THREE.Vector3(0, camDist, 0).applyQuaternion(quat);
      camera.position.set(worldCX + offset.x, offset.y, worldCY + offset.z);

      // Up vector: rotate (0, 0, -1) by the same quaternion
      const up = new THREE.Vector3(0, 0, -1).applyQuaternion(quat);
      camera.up.copy(up);
      camera.lookAt(worldCX, 0, worldCY);

      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [transformRef, canvasDimsRef]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 2 }}
    />
  );
}
