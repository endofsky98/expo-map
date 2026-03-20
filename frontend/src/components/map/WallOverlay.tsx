/**
 * WallOverlay — Three.js 3D wall rendering overlaid on pixi map canvas.
 *
 * Strategy:
 * - Fixed orthographic camera looking straight down (top-down, pixel-space).
 * - wallGroup transformed identically to pixi mainContainer (position, scale, rotation).
 * - Tilt is NOT done in Three.js — instead, the same CSS perspective+rotateX
 *   that pixi canvas uses is applied to our canvas element too.
 *   This guarantees pixel-perfect alignment at all tilt angles.
 */
import { useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';

interface Booth {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Transform {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  tilt: number;
}

interface CanvasPad {
  left: number;
  top: number;
}

interface WallOverlayProps {
  booths: Booth[];
  transformRef: React.MutableRefObject<Transform>;
  canvasDimsRef: React.MutableRefObject<{ width: number; height: number }>;
  canvasPadRef: React.MutableRefObject<CanvasPad>;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

const WALL_H = 12;

export default function WallOverlay({ booths, transformRef, canvasDimsRef, canvasPadRef }: WallOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const wallGroupRef = useRef<THREE.Group>(new THREE.Group());
  const rafRef = useRef<number>(0);

  const buildWalls = useCallback((scene: THREE.Scene, list: Booth[]) => {
    const old = wallGroupRef.current;
    scene.remove(old);
    old.traverse(c => {
      const m = c as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      if (m.material) {
        if (Array.isArray(m.material)) m.material.forEach(x => x.dispose());
        else (m.material as THREE.Material).dispose();
      }
    });

    const g = new THREE.Group();
    for (const b of list) {
      const geo = new THREE.BoxGeometry(b.width, WALL_H, b.height);
      const mats = [
        new THREE.MeshLambertMaterial({ color: 0x5b6b7d, transparent: true }),
        new THREE.MeshLambertMaterial({ color: 0x5b6b7d, transparent: true }),
        new THREE.MeshLambertMaterial({ color: 0x8899aa, transparent: true }),
        new THREE.MeshLambertMaterial({ color: 0x3a4a5a, transparent: true }),
        new THREE.MeshLambertMaterial({ color: 0x5b6b7d, transparent: true }),
        new THREE.MeshLambertMaterial({ color: 0x5b6b7d, transparent: true }),
      ];
      const mesh = new THREE.Mesh(geo, mats);
      // World coords: Three x = pixi x, Three z = pixi y, Three y = height
      mesh.position.set(b.x + b.width / 2, WALL_H / 2, b.y + b.height / 2);
      g.add(mesh);
      const edge = new THREE.LineSegments(
        new THREE.EdgesGeometry(geo),
        new THREE.LineBasicMaterial({ color: 0x3a4a5a, transparent: true, opacity: 0.5 })
      );
      edge.position.copy(mesh.position);
      g.add(edge);
    }
    scene.add(g);
    wallGroupRef.current = g;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setClearColor(0x000000, 0);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Camera: ortho, looking down -Y, screen-pixel space
    // up = (0,0,-1) so: screen-x = Three +x, screen-y(down) = Three +z
    const cam = new THREE.OrthographicCamera(0, 1, 0, -1, -50000, 50000);
    cam.position.set(0, 1000, 0);
    cam.up.set(0, 0, -1);
    cam.lookAt(0, 0, 0);
    cameraRef.current = cam;

    // Lights — in scene (move with world rotation)
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const d = new THREE.DirectionalLight(0xffffff, 0.8);
    d.position.set(-1, 2, -1).normalize();
    scene.add(d);

    buildWalls(scene, booths);
    return () => { cancelAnimationFrame(rafRef.current); renderer.dispose(); rendererRef.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { if (sceneRef.current) buildWalls(sceneRef.current, booths); }, [booths, buildWalls]);

  useEffect(() => {
    const renderer = rendererRef.current, scene = sceneRef.current, cam = cameraRef.current;
    if (!renderer || !scene || !cam) return;

    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);
      const t = transformRef.current;
      const { width: vw, height: vh } = canvasDimsRef.current;
      const pad = canvasPadRef.current;
      if (vw === 0 || vh === 0) return;

      // ---- Sync CSS tilt with pixi canvas ----
      const el = canvasRef.current;
      if (el) {
        if (t.tilt === 0) {
          el.style.transform = '';
          el.style.transformOrigin = '';
        } else {
          const rad = (t.tilt * Math.PI) / 180;
          const scaleX = 1 / Math.cos(rad);
          const tf = `perspective(800px) rotateX(${t.tilt}deg) scaleX(${scaleX.toFixed(4)})`;
          const totalW = vw + pad.left * 2;
          const totalH = vh + pad.top;
          const originXPct = totalW > 0 ? ((pad.left + vw / 2) / totalW * 100).toFixed(2) : '50';
          const originYPct = totalH > 0 ? ((pad.top + vh * 0.3) / totalH * 100).toFixed(2) : '30';
          el.style.transform = tf;
          el.style.transformOrigin = `${originXPct}% ${originYPct}%`;
        }
      }

      // hide when no tilt (walls only visible tilted)
      if (t.tilt < 3) {
        renderer.clear();
        return;
      }

      // Resize renderer to match pixi canvas (including overscan)
      const totalW = vw + pad.left * 2;
      const totalH = vh + pad.top;
      if (el) {
        const dpr = window.devicePixelRatio || 1;
        if (el.width !== Math.round(totalW * dpr) || el.height !== Math.round(totalH * dpr)) {
          renderer.setSize(totalW, totalH);
        }
      }

      // Opacity
      const alpha = Math.min(1, (t.tilt - 3) / 12);
      wallGroupRef.current.traverse(ch => {
        const m = ch as THREE.Mesh;
        if (m.material) {
          if (Array.isArray(m.material)) m.material.forEach(x => { x.opacity = alpha; });
          else (m.material as THREE.Material).opacity = alpha;
        }
      });

      // ---- Transform wallGroup = pixi mainContainer ----
      // pixi: mc.position.set(t.x + pad.left, t.y + pad.top)
      //        mc.scale.set(scale), mc.rotation = rotation (CW rad)
      // Our camera: x=screen-x, z=screen-y(down). So:
      const g = wallGroupRef.current;
      g.position.set(t.x + pad.left, 0, t.y + pad.top);
      g.scale.set(t.scale, t.scale, t.scale);
      g.rotation.set(0, 0, 0);
      // pixi rotation CW in screen plane. Camera looks down -Y with up=(0,0,-1).
      // Y-rotation in Three.js: positive = CCW from above → use -rotation for CW.
      g.rotateY(-t.rotation);

      // Camera frustum = full canvas size (with overscan)
      cam.left = 0;
      cam.right = totalW;
      cam.top = 0;
      cam.bottom = -totalH;
      cam.updateProjectionMatrix();

      renderer.render(scene, cam);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [transformRef, canvasDimsRef, canvasPadRef]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute pointer-events-none"
      style={{ zIndex: 2, top: 0, left: 0 }}
    />
  );
}
