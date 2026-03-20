/**
 * ============================================================================
 * WallOverlay — Three.js 3D wall rendering overlaid on pixi map canvas.
 * ============================================================================
 *
 * [현재 비활성화됨] MapViewer.tsx에서 주석 해제하면 사용 가능.
 *
 * ■ 동작 원리
 * ──────────────────────────────────────────────────────────────────
 * 1. pixi 캔버스와 동일한 크기/위치의 <canvas>를 겹침 (zIndex: 2)
 * 2. Three.js OrthographicCamera — top-down (위에서 아래) 고정
 *    - 카메라는 움직이지 않음. 화면 픽셀 = Three.js world 좌표.
 * 3. wallGroup = pixi의 mainContainer와 **동일하게 변환**
 *    - position = (t.x + pad.left, 0, t.y + pad.top)
 *    - scale = t.scale
 *    - rotateY(-t.rotation)  ← pixi CW → Three.js Y축 CCW
 * 4. 틸트(tilt) 처리: 두 레이어로 나뉨
 *    a) CSS: pixi 캔버스와 동일한 `perspective(800px) rotateX(tilt)`
 *       → 두 캔버스의 2D 위치를 정확히 맞춤
 *    b) Three.js: wallGroup을 X축으로 `tilt * 0.5`만큼 기울임
 *       → 벽의 옆면(3D)이 카메라에 보이게 함
 *       → 피봇 = 화면 중심 (group origin이 아님!)
 *
 * ■ 좌표계 매핑
 * ──────────────────────────────────────────────────────────────────
 *   pixi world (x, y)  →  Three.js (x, height, z)
 *   pixi x (→)          =  Three.js x (→)
 *   pixi y (↓)          =  Three.js z (↓, 카메라 up=(0,0,-1) 덕분)
 *   벽 높이              =  Three.js y (↑)
 *
 * ■ 정렬 검증 방법
 * ──────────────────────────────────────────────────────────────────
 * WALL_H = 0.1로 바꾸면 납작한 사각형이 됨 → 부스와 pixel-perfect 정렬 확인 가능
 * 틸트 조건(`if (t.tilt < 3)`)을 주석 처리하면 2D에서도 표시.
 *
 * ■ 사용법 (MapViewer.tsx)
 * ──────────────────────────────────────────────────────────────────
 * 1. import 주석 해제:
 *    const WallOverlay = dynamic(() => import('./WallOverlay'), { ssr: false });
 * 2. JSX 주석 해제:
 *    <WallOverlay
 *      booths={booths}
 *      transformRef={transformRef}
 *      canvasDimsRef={canvasDimsRef}
 *      canvasPadRef={canvasPadRef}
 *      containerRef={containerRef}
 *    />
 *
 * ■ 커스터마이징
 * ──────────────────────────────────────────────────────────────────
 * - WALL_H: 벽 높이 (world 단위, 현재 12)
 * - 색상: MeshLambertMaterial color 값 변경
 *   - 0x5b6b7d: 옆면 (gray-blue)
 *   - 0x8899aa: 윗면 (밝은 회색)
 *   - 0x3a4a5a: 밑면/wireframe (어두운 회색)
 * - 틸트 기울기: `tiltRad * 0.5` → 0.5를 조절 (0=기울기 없음, 1=틸트와 동일)
 * - fade-in 구간: `(t.tilt - 3) / 12` → 3°에서 시작, 15°에서 완전 불투명
 * - 조명: AmbientLight(0.5) + DirectionalLight(0.8)
 *
 * ■ 주의사항
 * ──────────────────────────────────────────────────────────────────
 * - three.js 패키지 필요: `pnpm add three @types/three`
 * - next.config.ts에 outputFileTracingIncludes 필요:
 *   { '/**': ['./node_modules/@swc/helpers/**', './node_modules/@next/env/**'] }
 * - 배포 시 tar --dereference 필수 (pnpm symlink → Windows 호환)
 * - Three.js canvas는 pixi canvas와 동일한 overscan offset 적용 필수
 *   (left: -pad.left, top: -pad.top)
 */

import { useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';

/* ─── 인터페이스 ─── */
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

/* ─── 설정 ─── */
const WALL_H = 12; // 벽 높이 (world 단위). 0.1로 바꾸면 2D 정렬 디버그 가능.

export default function WallOverlay({ booths, transformRef, canvasDimsRef, canvasPadRef }: WallOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const wallGroupRef = useRef<THREE.Group>(new THREE.Group());
  const rafRef = useRef<number>(0);

  /* ─── 벽 메시 생성 ─── */
  const buildWalls = useCallback((scene: THREE.Scene, list: Booth[]) => {
    // 기존 메시 정리
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
      // BoxGeometry(width, height, depth) → (부스 가로, 벽 높이, 부스 세로)
      const geo = new THREE.BoxGeometry(b.width, WALL_H, b.height);
      const mats = [
        new THREE.MeshLambertMaterial({ color: 0x5b6b7d, transparent: true }), // +x (오른쪽)
        new THREE.MeshLambertMaterial({ color: 0x5b6b7d, transparent: true }), // -x (왼쪽)
        new THREE.MeshLambertMaterial({ color: 0x8899aa, transparent: true }), // +y (윗면)
        new THREE.MeshLambertMaterial({ color: 0x3a4a5a, transparent: true }), // -y (밑면)
        new THREE.MeshLambertMaterial({ color: 0x5b6b7d, transparent: true }), // +z (앞면)
        new THREE.MeshLambertMaterial({ color: 0x5b6b7d, transparent: true }), // -z (뒷면)
      ];
      const mesh = new THREE.Mesh(geo, mats);
      // pixi world (x,y) → Three.js (x, y=height, z=pixi-y)
      mesh.position.set(b.x + b.width / 2, WALL_H / 2, b.y + b.height / 2);
      g.add(mesh);

      // 와이어프레임 (입체감 강조)
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

  /* ─── Three.js 초기화 ─── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setClearColor(0x000000, 0); // 투명 배경
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // 카메라: 직교, 위에서 아래로 (-Y 방향)
    // up=(0,0,-1) → screen-x = Three +x, screen-y(↓) = Three +z
    const cam = new THREE.OrthographicCamera(0, 1, 0, -1, -50000, 50000);
    cam.position.set(0, 1000, 0);
    cam.up.set(0, 0, -1);
    cam.lookAt(0, 0, 0);
    cameraRef.current = cam;

    // 조명
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const d = new THREE.DirectionalLight(0xffffff, 0.8);
    d.position.set(-1, 2, -1).normalize();
    scene.add(d);

    buildWalls(scene, booths);

    return () => {
      cancelAnimationFrame(rafRef.current);
      renderer.dispose();
      rendererRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 부스 데이터 변경 시 벽 재생성
  useEffect(() => {
    if (sceneRef.current) buildWalls(sceneRef.current, booths);
  }, [booths, buildWalls]);

  /* ─── 렌더 루프 — pixi transform과 동기화 ─── */
  useEffect(() => {
    const renderer = rendererRef.current, scene = sceneRef.current, cam = cameraRef.current;
    if (!renderer || !scene || !cam) return;

    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);
      const t = transformRef.current;
      const { width: vw, height: vh } = canvasDimsRef.current;
      const pad = canvasPadRef.current;
      if (vw === 0 || vh === 0) return;

      /* ── CSS tilt: pixi 캔버스와 동일하게 적용 ── */
      const el = canvasRef.current;
      if (el) {
        if (t.tilt === 0) {
          el.style.transform = '';
          el.style.transformOrigin = '';
        } else {
          const rad = (t.tilt * Math.PI) / 180;
          const scaleX = 1 / Math.cos(rad);
          el.style.transform = `perspective(800px) rotateX(${t.tilt}deg) scaleX(${scaleX.toFixed(4)})`;
          const totalW = vw + pad.left * 2;
          const totalH = vh + pad.top;
          const originXPct = totalW > 0 ? ((pad.left + vw / 2) / totalW * 100).toFixed(2) : '50';
          const originYPct = totalH > 0 ? ((pad.top + vh * 0.3) / totalH * 100).toFixed(2) : '30';
          el.style.transformOrigin = `${originXPct}% ${originYPct}%`;
        }
      }

      /* ── 틸트 3° 미만이면 벽 숨김 ── */
      if (t.tilt < 3) { renderer.clear(); return; }

      /* ── 캔버스 크기 동기화 (overscan 포함) ── */
      const totalW = vw + pad.left * 2;
      const totalH = vh + pad.top;
      if (el) {
        const dpr = window.devicePixelRatio || 1;
        if (el.width !== Math.round(totalW * dpr) || el.height !== Math.round(totalH * dpr)) {
          renderer.setSize(totalW, totalH);
        }
      }

      /* ── 투명도: 틸트 3°~15° 구간에서 fade-in ── */
      const alpha = Math.min(1, (t.tilt - 3) / 12);
      wallGroupRef.current.traverse(ch => {
        const m = ch as THREE.Mesh;
        if (m.material) {
          if (Array.isArray(m.material)) m.material.forEach(x => { x.opacity = alpha; });
          else (m.material as THREE.Material).opacity = alpha;
        }
      });

      /* ── wallGroup 변환 = pixi mainContainer ── */
      const g = wallGroupRef.current;
      // 1) 위치: pixi의 mc.position.set(t.x + pad.left, t.y + pad.top)
      g.position.set(t.x + pad.left, 0, t.y + pad.top);
      // 2) 스케일: pixi의 mc.scale.set(scale)
      g.scale.set(t.scale, t.scale, t.scale);
      // 3) 회전: pixi CW → Three.js Y축 -rotation (CCW from above = CW on screen)
      g.rotation.set(0, 0, 0);
      g.rotateY(-t.rotation);

      /* ── 3D 틸트: 벽 옆면이 보이도록 group을 X축으로 기울임 ── */
      // CSS tilt는 캔버스 2D 평면을 기울일 뿐, Three.js 카메라 각도는 안 바뀜.
      // 그래서 group을 기울여야 벽의 옆면이 카메라에 노출됨.
      // 피봇 = 화면 중심 (group origin에서 하면 가장자리가 어긋남)
      if (t.tilt > 0) {
        const tiltRad = (t.tilt * Math.PI) / 180 * 0.5; // 0.5 = 기울기 강도 (0~1)
        const cx = totalW / 2;
        const cz = totalH / 2;
        g.position.x -= cx;
        g.position.z -= cz;
        g.applyMatrix4(new THREE.Matrix4().makeRotationX(-tiltRad));
        g.position.x += cx;
        g.position.z += cz;
      }

      /* ── 카메라 frustum = 캔버스 전체 (overscan 포함) ── */
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

  /* ── 캔버스 위치: pixi와 동일한 overscan offset ── */
  const pad = canvasPadRef.current;
  return (
    <canvas
      ref={canvasRef}
      className="absolute pointer-events-none"
      style={{ zIndex: 2, left: `${-pad.left}px`, top: `${-pad.top}px` }}
    />
  );
}
