/**
 * Mapbox-style pointer/wheel/gesture event handler.
 * Attach to canvas, returns cleanup function.
 */
import { MutableRefObject } from 'react';
import * as PIXI from 'pixi.js';
import {
  MapTransform, ROTATION_THRESHOLD, ZOOM_THRESHOLD,
  CLICK_THRESHOLD, CLICK_TIME_THRESHOLD,
  INERTIA_FRICTION, INERTIA_MIN_VELOCITY, INERTIA_INITIAL_FACTOR, MAX_ZOOM,
} from './mapTypes';
import { clampPosition } from './mapUtils';
import { Booth, Facility } from '@/types';

export interface PointerRefs {
  transformRef: MutableRefObject<MapTransform>;
  canvasDimsRef: MutableRefObject<{ width: number; height: number }>;
  mainContainerRef: MutableRefObject<PIXI.Container | null>;
  velocityRef: MutableRefObject<{ vx: number; vy: number }>;
  inertiaRafRef: MutableRefObject<number>;
  animZoomRafRef: MutableRefObject<number>;
  tileDirtyRef: MutableRefObject<boolean>;
  renderTilesFnRef: MutableRefObject<() => void>;
  boothsRef: MutableRefObject<Booth[]>;
  visibleFacilitiesRef: MutableRefObject<Facility[]>;
  currentFloorIdRef: MutableRefObject<number | null>;
  onBoothClickRef: MutableRefObject<(booth: Booth) => void>;
  onMapClickRef: MutableRefObject<((x: number, y: number, floorId: number) => void) | undefined>;
  onZoomChangeRef: MutableRefObject<((zoom: number) => void) | undefined>;
}

export interface PointerCallbacks {
  syncContainerPosition: (mc: PIXI.Container, t: { x: number; y: number }) => void;
  scheduleRenderTiles: () => void;
  scheduleMarkerUpdate: () => void;
  applyTilt: (tilt: number) => void;
  setFacilityTooltip: (v: { facility: Facility; screenX: number; screenY: number } | null) => void;
}

export function attachPointerEvents(
  canvas: HTMLCanvasElement,
  el: HTMLElement,
  refs: PointerRefs,
  cbs: PointerCallbacks,
  imgW: number,
  imgH: number,
) {
  const { transformRef, canvasDimsRef, velocityRef, inertiaRafRef, animZoomRafRef, onZoomChangeRef } = refs;
  const { syncContainerPosition, scheduleRenderTiles, scheduleMarkerUpdate, applyTilt, setFacilityTooltip } = cbs;

  function applyTransform(newScale: number, newRot: number, px: number, py: number) {
    const t = transformRef.current;
    const { width: cw, height: ch } = canvasDimsRef.current;
    const minFit = Math.max(cw / imgW, ch / imgH) * 0.6;
    const sc = Math.max(minFit, Math.min(MAX_ZOOM, newScale));
    const cos0 = Math.cos(t.rotation), sin0 = Math.sin(t.rotation);
    const dx0 = px - t.x, dy0 = py - t.y;
    const wx = (dx0 * cos0 + dy0 * sin0) / t.scale;
    const wy = (-dx0 * sin0 + dy0 * cos0) / t.scale;
    const cos1 = Math.cos(newRot), sin1 = Math.sin(newRot);
    t.x = px - sc * (wx * cos1 - wy * sin1);
    t.y = py - sc * (wx * sin1 + wy * cos1);
    t.scale = sc; t.rotation = newRot;
    clampPosition(t, imgW, imgH, cw, ch);
    const mc = refs.mainContainerRef.current;
    if (mc) { syncContainerPosition(mc, t); mc.scale.set(sc); mc.rotation = newRot; }
    onZoomChangeRef.current?.(sc);
    scheduleRenderTiles(); scheduleMarkerUpdate();
  }

  function applyZoom(ns: number, px: number, py: number) {
    applyTransform(ns, transformRef.current.rotation, px, py);
  }

  function animateZoom(target: number, px: number, py: number, dur = 300) {
    if (animZoomRafRef.current) cancelAnimationFrame(animZoomRafRef.current);
    const start = transformRef.current.scale, t0 = performance.now();
    function step(now: number) {
      const p = Math.min(1, (now - t0) / dur);
      const ease = 1 - Math.pow(1 - p, 3);
      applyZoom(start + (target - start) * ease, px, py);
      if (p < 1) animZoomRafRef.current = requestAnimationFrame(step);
      else { animZoomRafRef.current = 0; refs.tileDirtyRef.current = true; }
    }
    animZoomRafRef.current = requestAnimationFrame(step);
  }

  function stopInertia() {
    if (inertiaRafRef.current) { cancelAnimationFrame(inertiaRafRef.current); inertiaRafRef.current = 0; }
  }
  function startInertia(vx: number, vy: number) {
    stopInertia();
    velocityRef.current = { vx, vy };
    function step() {
      const v = velocityRef.current;
      if (Math.abs(v.vx) < INERTIA_MIN_VELOCITY && Math.abs(v.vy) < INERTIA_MIN_VELOCITY) { inertiaRafRef.current = 0; return; }
      const t = transformRef.current;
      t.x += v.vx; t.y += v.vy;
      clampPosition(t, imgW, imgH, canvasDimsRef.current.width, canvasDimsRef.current.height);
      const mc = refs.mainContainerRef.current;
      if (mc) syncContainerPosition(mc, t);
      refs.renderTilesFnRef.current();
      scheduleMarkerUpdate();
      v.vx *= INERTIA_FRICTION; v.vy *= INERTIA_FRICTION;
      inertiaRafRef.current = requestAnimationFrame(step);
    }
    inertiaRafRef.current = requestAnimationFrame(step);
  }

  // ===== Pointer state =====
  const pointers = new Map<number, { x: number; y: number }>();
  let downInfo = { x: 0, y: 0, time: 0 };
  let twoIds: [number, number] | null = null;
  let dragging = false, dragStart = { x: 0, y: 0 };
  let lastDragX = 0, lastDragY = 0, lastDragTime = 0;
  let moveRafPending = false;
  let lastDist = 0, lastAngle = 0, startDist = 0;
  let lastPts: [[number, number], [number, number]] | null = null;
  let startVec: [number, number] | null = null;
  let minDiam = 0;
  let pitchOn = false, zoomOn = false, rotOn = false;
  let mBtn: number | null = null;
  let lastTapT = 0, lastTapX = 0, lastTapY = 0;
  let twoTapT = 0, twoTapMoved = false;

  function onDown(e: PointerEvent) {
    e.preventDefault(); stopInertia();
    if (animZoomRafRef.current) { cancelAnimationFrame(animZoomRafRef.current); animZoomRafRef.current = 0; }
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    mBtn = e.pointerType === 'mouse' ? e.button : null;
    if (pointers.size === 1) {
      dragging = true;
      const t = transformRef.current;
      dragStart = { x: e.clientX - t.x, y: e.clientY - t.y };
      downInfo = { x: e.clientX, y: e.clientY, time: Date.now() };
      lastDragX = e.clientX; lastDragY = e.clientY; lastDragTime = Date.now();
    }
    if (pointers.size === 2 && !twoIds) {
      const ids = Array.from(pointers.keys());
      twoIds = [ids[0], ids[1]];
      const pa = pointers.get(ids[0])!, pb = pointers.get(ids[1])!;
      lastDist = startDist = Math.hypot(pb.x - pa.x, pb.y - pa.y);
      lastAngle = Math.atan2(pb.y - pa.y, pb.x - pa.x);
      startVec = [pb.x - pa.x, pb.y - pa.y]; minDiam = lastDist;
      lastPts = [[pa.x, pa.y], [pb.x, pb.y]];
      pitchOn = zoomOn = rotOn = false;
      twoTapT = Date.now(); twoTapMoved = false;
    }
  }

  function onMove(e: PointerEvent) {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // Two-finger
    if (twoIds) {
      if (moveRafPending) return;
      moveRafPending = true; twoTapMoved = true;
      requestAnimationFrame(() => {
        moveRafPending = false;
        if (!twoIds) return;
        const pa = pointers.get(twoIds[0]), pb = pointers.get(twoIds[1]);
        if (!pa || !pb) return;

        // Pan (avg)
        if (lastPts) {
          const t = transformRef.current;
          t.x += ((pa.x - lastPts[0][0]) + (pb.x - lastPts[1][0])) / 2;
          t.y += ((pa.y - lastPts[0][1]) + (pb.y - lastPts[1][1])) / 2;
          clampPosition(t, imgW, imgH, canvasDimsRef.current.width, canvasDimsRef.current.height);
          const mc = refs.mainContainerRef.current;
          if (mc) syncContainerPosition(mc, t);
        }

        const dist = Math.hypot(pb.x - pa.x, pb.y - pa.y);
        const angle = Math.atan2(pb.y - pa.y, pb.x - pa.x);
        const vec: [number, number] = [pb.x - pa.x, pb.y - pa.y];

        // Zoom
        if (!zoomOn && Math.abs(Math.log2(dist / startDist)) >= ZOOM_THRESHOLD) zoomOn = true;
        if (zoomOn && lastDist > 0) {
          const r = el.getBoundingClientRect();
          applyTransform(transformRef.current.scale * (dist / lastDist), transformRef.current.rotation,
            (pa.x + pb.x) / 2 - r.left, (pa.y + pb.y) / 2 - r.top);
        }

        // Rotate
        minDiam = Math.min(minDiam, dist);
        const circ = Math.PI * minDiam;
        const rotTh = circ > 0 ? (ROTATION_THRESHOLD / circ * 360) : 999;
        if (!rotOn && startVec) {
          const sm = Math.hypot(startVec[0], startVec[1]), vm = Math.hypot(vec[0], vec[1]);
          if (sm > 0 && vm > 0) {
            const cross = startVec[0] * vec[1] - startVec[1] * vec[0];
            const dot = startVec[0] * vec[0] + startVec[1] * vec[1];
            if (Math.abs(Math.atan2(cross, dot) * 180 / Math.PI) >= rotTh) rotOn = true;
          }
        }
        if (rotOn) {
          const da = angle - lastAngle;
          if (Math.abs(da) > 0.001) {
            const r = el.getBoundingClientRect();
            applyTransform(transformRef.current.scale, transformRef.current.rotation + da,
              (pa.x + pb.x) / 2 - r.left, (pa.y + pb.y) / 2 - r.top);
          }
        }

        // Pitch
        if (lastPts) {
          const va = { x: pa.x - lastPts[0][0], y: pa.y - lastPts[0][1] };
          const vb = { x: pb.x - lastPts[1][0], y: pb.y - lastPts[1][1] };
          if (va.y * vb.y > 0 && Math.abs(va.y) > Math.abs(va.x) && Math.abs(vb.y) > Math.abs(vb.x))
            pitchOn = true;
          if (pitchOn) applyTilt(transformRef.current.tilt + (va.y + vb.y) / 2 * -0.5);
        }

        lastDist = dist; lastAngle = angle; lastPts = [[pa.x, pa.y], [pb.x, pb.y]];
        scheduleRenderTiles(); scheduleMarkerUpdate();
      });
      return;
    }

    // Single
    if (!dragging) return;
    const isRP = e.pointerType === 'mouse' && (mBtn === 2 || (mBtn === 0 && (e.ctrlKey || e.metaKey)));
    if (isRP) {
      const dx = e.clientX - lastDragX, dy = e.clientY - lastDragY;
      if (Math.abs(dx) > 0) {
        const bd = dx * 0.8 * (Math.PI / 180);
        const { width: cw, height: ch } = canvasDimsRef.current;
        applyTransform(transformRef.current.scale, transformRef.current.rotation + bd, cw / 2, ch / 2);
      }
      if (Math.abs(dy) > 0) applyTilt(transformRef.current.tilt + dy * -0.5);
      lastDragX = e.clientX; lastDragY = e.clientY; lastDragTime = Date.now();
    } else {
      const t = transformRef.current;
      t.x = e.clientX - dragStart.x; t.y = e.clientY - dragStart.y;
      clampPosition(t, imgW, imgH, canvasDimsRef.current.width, canvasDimsRef.current.height);
      const mc = refs.mainContainerRef.current;
      if (mc) syncContainerPosition(mc, t);
      scheduleRenderTiles(); scheduleMarkerUpdate();
      const now = Date.now(), dt = now - lastDragTime;
      if (dt > 0) {
        velocityRef.current.vx = (e.clientX - lastDragX) / dt * 16;
        velocityRef.current.vy = (e.clientY - lastDragY) / dt * 16;
      }
      lastDragX = e.clientX; lastDragY = e.clientY; lastDragTime = now;
    }
  }

  function resetTwo() {
    twoIds = null; lastDist = 0; lastAngle = 0; startDist = 0;
    lastPts = null; startVec = null; pitchOn = zoomOn = rotOn = false;
  }

  function onUp(e: PointerEvent) {
    canvas.releasePointerCapture(e.pointerId); pointers.delete(e.pointerId);

    // Two-finger tap → zoom out
    if (twoIds && !twoTapMoved && Date.now() - twoTapT < 300) {
      const { width: cw, height: ch } = canvasDimsRef.current;
      animateZoom(transformRef.current.scale / 2, cw / 2, ch / 2, 300);
      resetTwo(); dragging = false; return;
    }
    if (twoIds && (e.pointerId === twoIds[0] || e.pointerId === twoIds[1])) {
      resetTwo();
      if (pointers.size > 0) {
        const [, rp] = Array.from(pointers.entries())[0];
        dragStart = { x: rp.x - transformRef.current.x, y: rp.y - transformRef.current.y };
        dragging = true; lastDragX = rp.x; lastDragY = rp.y; lastDragTime = Date.now();
      }
      return;
    }
    if (dragging) {
      dragging = false; mBtn = null;
      const dx = e.clientX - downInfo.x, dy = e.clientY - downInfo.y;
      const dt = Date.now() - downInfo.time;
      if (Math.abs(dx) < CLICK_THRESHOLD && Math.abs(dy) < CLICK_THRESHOLD && dt < CLICK_TIME_THRESHOLD) {
        const now = Date.now();
        if (now - lastTapT < 350 && Math.abs(e.clientX - lastTapX) < 30 && Math.abs(e.clientY - lastTapY) < 30) {
          const r = el.getBoundingClientRect();
          animateZoom(transformRef.current.scale * 2, e.clientX - r.left, e.clientY - r.top, 300);
          lastTapT = 0;
        } else {
          lastTapT = now; lastTapX = e.clientX; lastTapY = e.clientY;
          handleClick(e);
        }
      } else {
        const v = velocityRef.current;
        if (Math.abs(v.vx) > INERTIA_MIN_VELOCITY || Math.abs(v.vy) > INERTIA_MIN_VELOCITY)
          startInertia(v.vx * INERTIA_INITIAL_FACTOR, v.vy * INERTIA_INITIAL_FACTOR);
      }
    }
  }

  function onCancel(e: PointerEvent) {
    pointers.delete(e.pointerId);
    if (twoIds && (e.pointerId === twoIds[0] || e.pointerId === twoIds[1])) resetTwo();
    if (pointers.size === 0) dragging = false;
  }
  function onCtx(e: Event) { e.preventDefault(); }
  function onWheel(e: WheelEvent) {
    e.preventDefault();
    const rate = Math.abs(e.deltaY) < 50 ? (1 / 100) : (1 / 450);
    const ns = transformRef.current.scale * Math.pow(2, -e.deltaY * rate);
    const r = el.getBoundingClientRect();
    applyZoom(ns, e.clientX - r.left, e.clientY - r.top);
  }

  function handleClick(e: PointerEvent) {
    const r = el.getBoundingClientRect();
    const sx = e.clientX - r.left, sy = e.clientY - r.top;
    const t = transformRef.current, sc = t.scale;
    const cosR = Math.cos(t.rotation), sinR = Math.sin(t.rotation);
    const wx = ((sx - t.x) * cosR + (sy - t.y) * sinR) / sc;
    const wy = (-(sx - t.x) * sinR + (sy - t.y) * cosR) / sc;
    for (const fac of refs.visibleFacilitiesRef.current) {
      const fr = Math.max(10, 14 / sc);
      if ((wx - fac.x) ** 2 + (wy - fac.y) ** 2 <= fr * fr) {
        setFacilityTooltip({ facility: fac, screenX: t.x + sc * (fac.x * cosR - fac.y * sinR), screenY: t.y + sc * (fac.x * sinR + fac.y * cosR) });
        return;
      }
    }
    for (const b of refs.boothsRef.current) {
      if (wx >= b.x && wx <= b.x + b.width && wy >= b.y && wy <= b.y + b.height) {
        refs.onBoothClickRef.current(b);
        if (typeof window !== 'undefined' && (window as any).onBoothClick) (window as any).onBoothClick(b.id, b);
        return;
      }
    }
    setFacilityTooltip(null);
    const fid = refs.currentFloorIdRef.current || 0;
    refs.onMapClickRef.current?.(Math.round(wx), Math.round(wy), fid);
    if (typeof window !== 'undefined' && (window as any).onMapClick) (window as any).onMapClick(Math.round(wx), Math.round(wy), fid);
  }

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onCancel);
  canvas.addEventListener('contextmenu', onCtx);
  canvas.addEventListener('wheel', onWheel, { passive: false });

  // Expose for external zoom controls
  (canvas as any).__mapAnimateZoom = animateZoom;
  (canvas as any).__mapApplyZoom = applyZoom;
  (canvas as any).__mapStopInertia = stopInertia;

  return () => {
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerup', onUp);
    canvas.removeEventListener('pointercancel', onCancel);
    canvas.removeEventListener('contextmenu', onCtx);
    canvas.removeEventListener('wheel', onWheel);
    stopInertia();
  };
}
