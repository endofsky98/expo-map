/**
 * WallOverlay — Three.js 3D wall rendering overlaid on pixi map canvas.
 * Renders booth boundaries as extruded 3D boxes.
 * Transparent background, positioned exactly over the pixi canvas.
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

const WALL_HEIGHT = 12; // world units
const WALL_COLOR = 0x5b6b7d;
const WALL_TOP_COLOR = 0x8899aa;
const WALL_EDGE_COLOR = 0x3a4a5a;

export default function WallOverlay({ booths, transformRef, canvasDimsRef, containerRef }: WallOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const wallMeshesRef = useRef<THREE.Group>(new THREE.Group());
  const rafRef = useRef<number>(0);

  // Build wall meshes from booth data
  const buildWalls = useCallback((scene: THREE.Scene, boothList: Booth[]) => {
    // Remove old walls
    const oldGroup = wallMeshesRef.current;
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

    for (const booth of boothList) {
      const { x, y, width, height } = booth;
      // THREE.js: x = right, y = up, z = toward camera
      // Map coords: x = right, y = down → we flip y
      const geo = new THREE.BoxGeometry(width, WALL_HEIGHT, height);
      const materials = [
        new THREE.MeshLambertMaterial({ color: WALL_COLOR }), // right
        new THREE.MeshLambertMaterial({ color: WALL_COLOR }), // left
        new THREE.MeshLambertMaterial({ color: WALL_TOP_COLOR }), // top
        new THREE.MeshLambertMaterial({ color: WALL_EDGE_COLOR }), // bottom
        new THREE.MeshLambertMaterial({ color: WALL_COLOR }), // front
        new THREE.MeshLambertMaterial({ color: WALL_COLOR }), // back
      ];
      const mesh = new THREE.Mesh(geo, materials);
      // Position: center of booth, y inverted, box centered at half height
      // Map coords (x-right, y-down) → Three.js (x-right, y-up, z = map-y)
      mesh.position.set(x + width / 2, WALL_HEIGHT / 2, y + height / 2);
      group.add(mesh);

      // Edge wireframe for definition
      const edges = new THREE.EdgesGeometry(geo);
      const lineMat = new THREE.LineBasicMaterial({ color: WALL_EDGE_COLOR, transparent: true, opacity: 0.4 });
      const wireframe = new THREE.LineSegments(edges, lineMat);
      wireframe.position.copy(mesh.position);
      group.add(wireframe);
    }

    scene.add(group);
    wallMeshesRef.current = group;
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

    // Camera — will be synced each frame
    const camera = new THREE.PerspectiveCamera(60, 1, 1, 100000);
    cameraRef.current = camera;

    // Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambient);

    const directional = new THREE.DirectionalLight(0xffffff, 0.8);
    directional.position.set(-500, 1000, 500);
    scene.add(directional);

    // Build initial walls
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

      // Resize renderer if needed
      const canvas = canvasRef.current;
      if (canvas && (canvas.width !== Math.round(vw * (window.devicePixelRatio || 1)) || canvas.height !== Math.round(vh * (window.devicePixelRatio || 1)))) {
        renderer.setSize(vw, vh);
      }

      // Only render walls when tilted
      if (t.tilt < 3) {
        if (prevTilt >= 3) renderer.clear();
        prevTilt = t.tilt;
        return;
      }
      prevTilt = t.tilt;

      // Wall group visibility: fade in
      const alpha = Math.min(1, (t.tilt - 3) / 12);
      wallMeshesRef.current.traverse((child) => {
        if ((child as THREE.Mesh).material) {
          const mat = (child as THREE.Mesh).material;
          if (Array.isArray(mat)) {
            mat.forEach(m => { m.transparent = true; m.opacity = alpha; });
          } else {
            (mat as THREE.Material).transparent = true;
            (mat as THREE.Material).opacity = alpha;
          }
        }
      });

      // === Sync Three.js camera with pixi transform ===
      // Pixi: y-down, rotation CW. Three.js: y-up, z-out-of-screen.
      // Map world: x-right, y-down → Three.js: x-right, z-down (y=up for height)

      // Screen center → pixi world coords (inverse transform)
      const screenCX = vw / 2;
      const screenCY = vh / 2;
      const dx = screenCX - t.x;
      const dy = screenCY - t.y;
      const cosR = Math.cos(-t.rotation);
      const sinR = Math.sin(-t.rotation);
      const worldX = (dx * cosR + dy * sinR) / t.scale;
      const worldY = (-dx * sinR + dy * cosR) / t.scale;
      // Three.js target: map(x,y) → three(x, 0, y)
      // y is flipped: map y-down → three z-positive-down
      const lookX = worldX;
      const lookZ = worldY;

      // Camera distance: match pixi scale to Three.js FOV
      const fovRad = (camera.fov * Math.PI) / 180;
      const dist = (vh / t.scale) / (2 * Math.tan(fovRad / 2));

      // Tilt: camera orbits around look target
      // tilt=0 → camera directly above (top-down), tilt=60 → angled
      const tiltRad = (t.tilt * Math.PI) / 180;

      // Camera offset from look target (in un-rotated space)
      // tilt rotates camera "backward" (toward -z in un-rotated view = toward top of screen)
      const camOffsetUp = dist * Math.cos(tiltRad);     // y (height)
      const camOffsetBack = dist * Math.sin(tiltRad);   // distance "behind"

      // Apply map rotation to the "back" offset direction
      // In pixi, rotation=0 means no rotation, positive = CW
      // Camera should move in the opposite direction of where map top is pointing
      const backX = -camOffsetBack * Math.sin(t.rotation);
      const backZ = -camOffsetBack * Math.cos(t.rotation);

      camera.position.set(lookX + backX, camOffsetUp, lookZ + backZ);
      camera.lookAt(lookX, 0, lookZ);

      // Match map rotation: pixi rotation CW → Three.js camera roll
      camera.rotation.z = t.rotation;

      camera.aspect = vw / vh;
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
