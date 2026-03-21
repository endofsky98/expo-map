// useMapPointerEvents.ts — Pointer event handlers extracted from MapViewer
// No logic changes — just moved to separate file

import React from 'react';
import * as PIXI from 'pixi.js';
import { Booth, Facility } from '@/types';
import { CLICK_THRESHOLD, CLICK_TIME_THRESHOLD, ROTATION_THRESHOLD, ZOOM_THRESHOLD } from './mapTypes';

export interface PointerEventDeps {
  canvas: HTMLCanvasElement;
  el: HTMLDivElement;
  mainContainer: PIXI.Container;
  transformRef: React.MutableRefObject<{ x: number; y: number; scale: number; rotation: number; tilt: number }>;
  canvasDimsRef: React.MutableRefObject<{ width: number; height: number }>;
  mainContainerRef: React.MutableRefObject<PIXI.Container | null>;
  velocityRef: React.MutableRefObject<{ vx: number; vy: number }>;
  inertiaRafRef: React.MutableRefObject<number>;
  animZoomRafRef: React.MutableRefObject<number>;
  boothsRef: React.MutableRefObject<Booth[]>;
  visibleFacilitiesRef: React.MutableRefObject<Facility[]>;
  currentFloorIdRef: React.MutableRefObject<number | null>;
  onBoothClickRef: React.MutableRefObject<(booth: Booth) => void>;
  onMapClickRef: React.MutableRefObject<((x: number, y: number, floorId: number) => void) | undefined>;
  onLongPressRef: React.MutableRefObject<((wx: number, wy: number) => void) | undefined>;
  stopInertia: () => void;
  applyTransform: (newScale: number, newRotation: number, pivotX: number, pivotY: number) => void;
  applyZoom: (newScale: number, pivotX: number, pivotY: number) => void;
  animateZoom: (targetScale: number, pivotX: number, pivotY: number, durationMs?: number) => void;
  applyTilt: (tilt: number) => void;
  clampPosition: (t: { x: number; y: number; scale: number; rotation: number }) => void;
  syncContainerPosition: (mc: PIXI.Container, t: { x: number; y: number }) => void;
  scheduleRenderTiles: () => void;
  scheduleMarkerUpdate: () => void;
  startInertia: (vx: number, vy: number) => void;
  setFacilityTooltip: React.Dispatch<React.SetStateAction<{ facility: Facility; screenX: number; screenY: number } | null>>;
}

/**
 * Attach all pointer/touch/wheel event listeners to the canvas.
 * Returns a cleanup function to remove them.
 * Code is identical to the original inline handlers in MapViewer's useEffect.
 */
export function attachPointerEvents(deps: PointerEventDeps): () => void {
  const {
    canvas, el, mainContainer, transformRef, canvasDimsRef, mainContainerRef,
    velocityRef, inertiaRafRef, animZoomRafRef,
    boothsRef, visibleFacilitiesRef, currentFloorIdRef,
    onBoothClickRef, onMapClickRef, onLongPressRef,
    stopInertia, applyTransform, applyZoom, animateZoom, applyTilt,
    clampPosition, syncContainerPosition, scheduleRenderTiles, scheduleMarkerUpdate,
    startInertia, setFacilityTooltip,
  } = deps;

  const pointers = new Map<number, { x: number; y: number }>();
  let pointerDownInfo = { x: 0, y: 0, time: 0 };
  let firstTwoIds: [number, number] | null = null;
  let isDragging = false;
  let dragStart = { x: 0, y: 0 };
  let lastDragX = 0, lastDragY = 0, lastDragTime = 0;
  let moveRafPending = false;
  // Two-touch state
  let lastDist = 0, lastAngle = 0, startDist = 0;
  let lastPoints: [[number,number],[number,number]] | null = null;
  let startVector: [number,number] | null = null;
  let minDiameter = 0;
  // Pitch state
  let pitchActive = false;
  let zoomActive = false;
  let rotateActive = false;
  // Long press
  let longPressTimer: ReturnType<typeof setTimeout> | null = null;
  let longPressFired = false;
  // Mouse button tracking
  let mouseButton: number | null = null;
  // Double-tap
  let lastTapTime = 0, lastTapX = 0, lastTapY = 0;
  // Two-finger tap (for zoom out)
  let twoFingerTapStart = 0;
  let twoFingerTapMoved = false;

  const onPointerDown = (e: PointerEvent) => {
    e.preventDefault();
    stopInertia();
    if (animZoomRafRef.current) { cancelAnimationFrame(animZoomRafRef.current); animZoomRafRef.current = 0; }
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    mouseButton = (e.pointerType === 'mouse') ? e.button : null;

    const allPtrs = Array.from(pointers.values());

    if (allPtrs.length === 1) {
      isDragging = true;
      const t = transformRef.current;
      dragStart = { x: e.clientX - t.x, y: e.clientY - t.y };
      pointerDownInfo = { x: e.clientX, y: e.clientY, time: Date.now() };
      lastDragX = e.clientX; lastDragY = e.clientY; lastDragTime = Date.now();
      // 롱프레스 시작
      longPressFired = false;
      if (longPressTimer) clearTimeout(longPressTimer);
      const downX = e.clientX, downY = e.clientY;
      longPressTimer = setTimeout(() => {
        longPressFired = true;
        const sc = transformRef.current.scale;
        const cosR = Math.cos(transformRef.current.rotation);
        const sinR = Math.sin(transformRef.current.rotation);
        const rect = canvas.getBoundingClientRect();
        const sx = downX - rect.left, sy = downY - rect.top;
        const dx0 = sx - transformRef.current.x, dy0 = sy - transformRef.current.y;
        const wx = (dx0 * cosR + dy0 * sinR) / sc;
        const wy = (-dx0 * sinR + dy0 * cosR) / sc;
        onLongPressRef.current?.(wx, wy);
      }, 500);
    }

    if (allPtrs.length === 2 && !firstTwoIds) {
      const ids = Array.from(pointers.keys());
      firstTwoIds = [ids[0], ids[1]];
      const pa = pointers.get(ids[0])!;
      const pb = pointers.get(ids[1])!;
      lastDist = startDist = Math.hypot(pb.x - pa.x, pb.y - pa.y);
      lastAngle = Math.atan2(pb.y - pa.y, pb.x - pa.x);
      startVector = [pb.x - pa.x, pb.y - pa.y];
      minDiameter = lastDist;
      lastPoints = [[pa.x, pa.y], [pb.x, pb.y]];
      pitchActive = false;
      zoomActive = false;
      rotateActive = false;
      twoFingerTapStart = Date.now();
      twoFingerTapMoved = false;
    }
  };

  const onPointerMove = (e: PointerEvent) => {
    const prev = pointers.get(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    // 롱프레스 취소 (이동 10px 이상)
    if (longPressTimer && Math.hypot(e.clientX - pointerDownInfo.x, e.clientY - pointerDownInfo.y) > 10) {
      clearTimeout(longPressTimer); longPressTimer = null;
    }

    // --- Two-finger gestures (all simultaneous) ---
    if (firstTwoIds) {
      if (moveRafPending) return;
      moveRafPending = true;
      twoFingerTapMoved = true;
      requestAnimationFrame(() => {
        moveRafPending = false;
        if (!firstTwoIds) return;
        const pa = pointers.get(firstTwoIds[0]);
        const pb = pointers.get(firstTwoIds[1]);
        if (!pa || !pb) return;

        // --- Pan: average movement of all touches (Mapbox style) ---
        let sumDx = 0, sumDy = 0, count = 0;
        if (lastPoints) {
          const prevA = lastPoints[0];
          const prevB = lastPoints[1];
          sumDx += (pa.x - prevA[0]) + (pb.x - prevB[0]);
          sumDy += (pa.y - prevA[1]) + (pb.y - prevB[1]);
          count = 2;
        }
        if (count > 0) {
          const t = transformRef.current;
          t.x += sumDx / count;
          t.y += sumDy / count;
          clampPosition(t);
          const mc = mainContainerRef.current;
          if (mc) syncContainerPosition(mc, t);
        }

        const dist = Math.hypot(pb.x - pa.x, pb.y - pa.y);
        const angle = Math.atan2(pb.y - pa.y, pb.x - pa.x);
        const vec: [number,number] = [pb.x - pa.x, pb.y - pa.y];

        // --- Zoom (Mapbox: threshold log2 0.1) ---
        if (!zoomActive && Math.abs(Math.log2(dist / startDist)) >= ZOOM_THRESHOLD) {
          zoomActive = true;
        }
        if (zoomActive && lastDist > 0) {
          const rect = el.getBoundingClientRect();
          const cx = (pa.x + pb.x) / 2 - rect.left;
          const cy = (pa.y + pb.y) / 2 - rect.top;
          const newScale = transformRef.current.scale * (dist / lastDist);
          applyTransform(newScale, transformRef.current.rotation, cx, cy);
        }

        // --- Rotate (Mapbox: 25px along circumference threshold, variable) ---
        minDiameter = Math.min(minDiameter, dist);
        const circumference = Math.PI * minDiameter;
        const rotThresholdDeg = circumference > 0 ? (ROTATION_THRESHOLD / circumference * 360) : 999;
        if (!rotateActive && startVector) {
          const startMag = Math.hypot(startVector[0], startVector[1]);
          const vecMag = Math.hypot(vec[0], vec[1]);
          if (startMag > 0 && vecMag > 0) {
            const cross = startVector[0] * vec[1] - startVector[1] * vec[0];
            const dot = startVector[0] * vec[0] + startVector[1] * vec[1];
            const angleSinceStart = Math.abs(Math.atan2(cross, dot) * 180 / Math.PI);
            if (angleSinceStart >= rotThresholdDeg) rotateActive = true;
          }
        }
        if (rotateActive) {
          const dAngle = angle - lastAngle;
          if (Math.abs(dAngle) > 0.001) {
            const { width: cw, height: ch } = canvasDimsRef.current;
            const rect = el.getBoundingClientRect();
            const cx = (pa.x + pb.x) / 2 - rect.left;
            const cy = (pa.y + pb.y) / 2 - rect.top;
            applyTransform(transformRef.current.scale, transformRef.current.rotation + dAngle, cx, cy);
          }
        }

        // --- Pitch: both fingers move same vertical direction (Mapbox style) ---
        if (lastPoints) {
          const vecA = { x: pa.x - lastPoints[0][0], y: pa.y - lastPoints[0][1] };
          const vecB = { x: pb.x - lastPoints[1][0], y: pb.y - lastPoints[1][1] };
          const sameDir = vecA.y * vecB.y > 0;
          const bothVertical = Math.abs(vecA.y) > Math.abs(vecA.x) && Math.abs(vecB.y) > Math.abs(vecB.x);
          if (sameDir && bothVertical) {
            if (!pitchActive) pitchActive = true;
          }
          if (pitchActive) {
            const avgDy = (vecA.y + vecB.y) / 2;
            applyTilt(transformRef.current.tilt + avgDy * -0.5);
          }
        }

        lastDist = dist;
        lastAngle = angle;
        lastPoints = [[pa.x, pa.y], [pb.x, pb.y]];
        scheduleRenderTiles();
        scheduleMarkerUpdate();
      });
      return;
    }

    // --- Single pointer ---
    if (!isDragging || !prev) return;

    const isRotatePitch = (e.pointerType === 'mouse')
      ? (mouseButton === 2 || (mouseButton === 0 && (e.ctrlKey || e.metaKey)))
      : false;

    if (isRotatePitch) {
      const dx = e.clientX - lastDragX;
      const dy = e.clientY - lastDragY;
      if (Math.abs(dx) > 0) {
        const bearingDelta = dx * -0.8 * (Math.PI / 180);
        const { width: cw, height: ch } = canvasDimsRef.current;
        applyTransform(transformRef.current.scale, transformRef.current.rotation + bearingDelta, cw / 2, ch / 2);
      }
      if (Math.abs(dy) > 0) {
        applyTilt(transformRef.current.tilt + dy * -0.5);
      }
      lastDragX = e.clientX; lastDragY = e.clientY; lastDragTime = Date.now();
    } else {
      const t = transformRef.current;
      t.x = e.clientX - dragStart.x;
      t.y = e.clientY - dragStart.y;
      clampPosition(t);
      syncContainerPosition(mainContainer, t);
      scheduleRenderTiles();
      scheduleMarkerUpdate();
      const now = Date.now();
      const dt = now - lastDragTime;
      if (dt > 0) {
        velocityRef.current.vx = (e.clientX - lastDragX) / dt * 16;
        velocityRef.current.vy = (e.clientY - lastDragY) / dt * 16;
      }
      lastDragX = e.clientX; lastDragY = e.clientY; lastDragTime = now;
    }
  };

  const onPointerUp = (e: PointerEvent) => {
    canvas.releasePointerCapture(e.pointerId);
    pointers.delete(e.pointerId);
    // 롱프레스 타이머 취소
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
    // 롱프레스 발생 시 클릭 무시
    if (longPressFired) { longPressFired = false; isDragging = false; return; }

    // Two-finger tap → zoom out (Mapbox style)
    if (firstTwoIds && !twoFingerTapMoved && (Date.now() - twoFingerTapStart < 300)) {
      const { width: cw, height: ch } = canvasDimsRef.current;
      animateZoom(transformRef.current.scale / 2, cw / 2, ch / 2, 300);
      firstTwoIds = null;
      lastDist = 0; lastAngle = 0; startDist = 0;
      lastPoints = null; startVector = null;
      pitchActive = false; zoomActive = false; rotateActive = false;
      isDragging = false;
      return;
    }

    if (firstTwoIds && (e.pointerId === firstTwoIds[0] || e.pointerId === firstTwoIds[1])) {
      firstTwoIds = null;
      lastDist = 0; lastAngle = 0; startDist = 0;
      lastPoints = null; startVector = null;
      pitchActive = false; zoomActive = false; rotateActive = false;
      if (pointers.size > 0) {
        const [remainId, remainPos] = Array.from(pointers.entries())[0];
        const t = transformRef.current;
        dragStart = { x: remainPos.x - t.x, y: remainPos.y - t.y };
        isDragging = true;
        lastDragX = remainPos.x; lastDragY = remainPos.y; lastDragTime = Date.now();
      }
      return;
    }

    if (isDragging) {
      isDragging = false;
      mouseButton = null;
      const dx = e.clientX - pointerDownInfo.x;
      const dy = e.clientY - pointerDownInfo.y;
      const dt = Date.now() - pointerDownInfo.time;
      if (Math.abs(dx) < CLICK_THRESHOLD && Math.abs(dy) < CLICK_THRESHOLD && dt < CLICK_TIME_THRESHOLD) {
        const now = Date.now();
        const tapDx = Math.abs(e.clientX - lastTapX);
        const tapDy = Math.abs(e.clientY - lastTapY);
        if (now - lastTapTime < 350 && tapDx < 30 && tapDy < 30) {
          const rect = el.getBoundingClientRect();
          animateZoom(transformRef.current.scale * 2, e.clientX - rect.left, e.clientY - rect.top, 300);
          lastTapTime = 0;
        } else {
          lastTapTime = now;
          lastTapX = e.clientX;
          lastTapY = e.clientY;
          handleClick(e);
        }
      } else {
        const v = velocityRef.current;
        if (Math.abs(v.vx) > 0.5 || Math.abs(v.vy) > 0.5) {
          startInertia(v.vx * 0.5, v.vy * 0.5);
        }
      }
    }
  };

  const onPointerCancel = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    if (firstTwoIds && (e.pointerId === firstTwoIds[0] || e.pointerId === firstTwoIds[1])) {
      firstTwoIds = null;
      lastDist = 0; lastAngle = 0; startDist = 0;
      lastPoints = null; startVector = null;
      pitchActive = false; zoomActive = false; rotateActive = false;
    }
    if (pointers.size === 0) isDragging = false;
  };

  const onContextMenu = (e: Event) => { e.preventDefault(); };

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const isTrackpad = Math.abs(e.deltaY) < 50;
    const rate = isTrackpad ? (1 / 100) : (1 / 450);
    const zoomDelta = -e.deltaY * rate;
    const newScale = transformRef.current.scale * Math.pow(2, zoomDelta);
    const rect = el.getBoundingClientRect();
    applyZoom(newScale, e.clientX - rect.left, e.clientY - rect.top);
  };

  function handleClick(e: PointerEvent) {
    const rect = el.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const t = transformRef.current;
    const sc = t.scale;
    const cosR = Math.cos(t.rotation);
    const sinR = Math.sin(t.rotation);
    const dx0 = sx - t.x;
    const dy0 = sy - t.y;
    const wx = (dx0 * cosR + dy0 * sinR) / sc;
    const wy = (-dx0 * sinR + dy0 * cosR) / sc;

    // (long press handled via timer, not click)

    // Check facilities first
    for (const fac of visibleFacilitiesRef.current) {
      const r = Math.max(10, 14 / sc);
      const fdx = wx - fac.x;
      const fdy = wy - fac.y;
      if (fdx * fdx + fdy * fdy <= r * r) {
        const fsx = t.x + sc * (fac.x * cosR - fac.y * sinR);
        const fsy = t.y + sc * (fac.x * sinR + fac.y * cosR);
        setFacilityTooltip((prev) =>
          prev?.facility.id === fac.id ? null : { facility: fac, screenX: fsx, screenY: fsy }
        );
        return;
      }
    }

    // Check booths
    for (const booth of boothsRef.current) {
      if (
        wx >= booth.x &&
        wx <= booth.x + booth.width &&
        wy >= booth.y &&
        wy <= booth.y + booth.height
      ) {
        onBoothClickRef.current(booth);
        if (typeof window !== 'undefined' && typeof (window as any).onBoothClick === 'function') {
          (window as any).onBoothClick(booth.id, booth);
        }
        return;
      }
    }

    // No booth/facility hit — fire onMapClick
    setFacilityTooltip(null);
    const floorId = currentFloorIdRef.current || 0;
    onMapClickRef.current?.(Math.round(wx), Math.round(wy), floorId);
    if (typeof window !== 'undefined' && typeof (window as any).onMapClick === 'function') {
      (window as any).onMapClick(Math.round(wx), Math.round(wy), floorId);
    }
  }

  // Attach
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerCancel);
  canvas.addEventListener('contextmenu', onContextMenu);
  canvas.addEventListener('wheel', onWheel, { passive: false });

  // Return cleanup
  return () => {
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerup', onPointerUp);
    canvas.removeEventListener('pointercancel', onPointerCancel);
    canvas.removeEventListener('contextmenu', onContextMenu);
    canvas.removeEventListener('wheel', onWheel);
  };
}
