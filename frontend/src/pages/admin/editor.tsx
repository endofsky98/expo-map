/**
 * editor.tsx — 통합 맵 에디터 v2 페이지
 * 데이터 fetch + 상태 관리 + 레이어 조립 + 패널 분기.
 */
import React, { useState, useEffect, useCallback } from 'react';
import AdminLayout from '@/components/AdminLayout';
import EditorCanvas, { LayerContext } from '@/components/editor/EditorCanvas';
import EditorToolbar from '@/components/editor/EditorToolbar';
import { useUndoRedo } from '@/components/editor/useUndoRedo';
import type { ActionKind } from '@/components/editor/useUndoRedo';
import type {
  EditorMode, SelectedObject, ShapeCompleteData,
  EditorBooth, EditorObstacle, EditorHall, PathNode, PathEdge, Amenity,
  PathNodeType, AmenityType,
} from '@/components/editor/editorTypes';

// Layers
import { renderHallLayer } from '@/components/editor/layers/HallLayer';
import { renderBoothLayer } from '@/components/editor/layers/BoothLayer';
import { renderPathLayer } from '@/components/editor/layers/PathLayer';
import { renderObstacleLayer } from '@/components/editor/layers/ObstacleLayer';
import { renderAmenityLayer } from '@/components/editor/layers/AmenityLayer';

// Panels
import { BoothPanel } from '@/components/editor/panels/BoothPanel';
import { PathPanel } from '@/components/editor/panels/PathPanel';
import { ObstaclePanel } from '@/components/editor/panels/ObstaclePanel';
import { AmenityPanel } from '@/components/editor/panels/AmenityPanel';
import { HallPanel } from '@/components/editor/panels/HallPanel';

// API
import { fetchFloors, fetchHalls, fetchBooths, fetchObstacles, fetchImages } from '@/lib/api';
import { createBooth, updateBooth, deleteBooth } from '@/lib/api';
import { createHall, updateHall, deleteHall } from '@/lib/api';
import { createObstacle, updateObstacle, deleteObstacle } from '@/lib/api';
import { fetchCategories, fetchCompanies, createCompany } from '@/lib/api';
import {
  fetchPathNodes, createPathNode, updatePathNode, deletePathNode,
  fetchPathEdges, createPathEdge, deletePathEdge,
  fetchAmenities, createAmenity, updateAmenity, deleteAmenity,
} from '@/lib/editorApi';

export default function EditorPage() {
  // ===== Floor/Hall selection =====
  const [floors, setFloors] = useState<{ id: number; name: string }[]>([]);
  const [selectedFloorId, setSelectedFloorId] = useState<number | null>(null);
  const [categories, setCategories] = useState<{ id: number; name: string | Record<string, string> }[]>([]);
  const [companies, setCompanies] = useState<{ id: number; name: string | Record<string, string>; category_id?: number | null }[]>([]);

  // ===== Data =====
  const [halls, setHalls] = useState<EditorHall[]>([]);
  const [booths, setBooths] = useState<EditorBooth[]>([]);
  const [pathNodes, setPathNodes] = useState<PathNode[]>([]);
  const [pathEdges, setPathEdges] = useState<PathEdge[]>([]);
  const [obstacles, setObstacles] = useState<EditorObstacle[]>([]);
  const [amenities, setAmenities] = useState<Amenity[]>([]);

  // ===== Image =====
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageWidth, setImageWidth] = useState(0);
  const [imageHeight, setImageHeight] = useState(0);

  // ===== Editor state =====
  const [mode, setMode] = useState<EditorMode>('select');
  const [selectedObject, setSelectedObject] = useState<SelectedObject>(null);
  const [connectFromId, setConnectFromId] = useState<number | null>(null);
  const [pathNodeType, setPathNodeType] = useState<PathNodeType>('waypoint');
  const [amenityType, setAmenityType] = useState<AmenityType>('restroom');

  // ===== Undo/Redo =====
  const upsert = <T extends { id: number }>(prev: T[], id: number, d: any): T[] => { const i = prev.findIndex(x => x.id === id); return i >= 0 ? prev.map(x => x.id === id ? { ...x, ...d } : x) : [...prev, d]; };
  const { pushAction, undo, redo, canUndo, canRedo } = useUndoRedo({
    onStateChange: useCallback((kind: ActionKind, action: 'upsert' | 'delete', id: number, data: Record<string, unknown> | null) => {
      if (action === 'delete') {
        if (kind === 'booth') setBooths(p => p.filter(b => b.id !== id));
        else if (kind === 'hall') setHalls(p => p.filter(h => h.id !== id));
        else if (kind === 'obstacle') setObstacles(p => p.filter(o => o.id !== id));
        else if (kind === 'amenity') setAmenities(p => p.filter(a => a.id !== id));
        else if (kind === 'path_node') setPathNodes(p => p.filter(n => n.id !== id));
      } else {
        if (kind === 'booth') setBooths(p => upsert(p, id, data));
        else if (kind === 'hall') setHalls(p => upsert(p, id, data));
        else if (kind === 'obstacle') setObstacles(p => upsert(p, id, data));
        else if (kind === 'amenity') setAmenities(p => upsert(p, id, data));
        else if (kind === 'path_node') setPathNodes(p => upsert(p, id, data));
      }
    }, []),
  });

  // ===== Init: fetch floors =====
  useEffect(() => {
    fetchFloors().then(f => {
      const mapped = f.map(fl => ({ id: fl.id, name: typeof fl.name === 'string' ? fl.name : (fl.name as any)?.ko || `Floor ${fl.id}` }));
      setFloors(mapped);
      if (mapped.length > 0 && !selectedFloorId) setSelectedFloorId(mapped[0].id);
    }).catch(() => {});
    fetchCategories().then(c => setCategories(c.map(cc => ({ id: cc.id, name: cc.name })))).catch(() => {});
    fetchCompanies().then(c => setCompanies(c.map(cc => ({ id: cc.id, name: cc.name, category_id: cc.category_id })))).catch(() => {});
  }, []);

  // ===== Fetch data when floor changes =====
  const loadFloorData = useCallback(async (floorId: number) => {
    const [h, b, pn, pe, o, a, imgs] = await Promise.all([
      fetchHalls(floorId).catch(() => []),
      fetchBooths(floorId).catch(() => []),
      fetchPathNodes(floorId).catch(() => []),
      fetchPathEdges(floorId).catch(() => []),
      fetchObstacles(floorId).catch(() => []),
      fetchAmenities(floorId).catch(() => []),
      fetchImages(floorId).catch(() => []),
    ]);
    setHalls(h as any[]); setBooths(b as any[]); setPathNodes(pn); setPathEdges(pe); setObstacles(o as any[]); setAmenities(a);
    const currentImg = (imgs as any[]).find((i: any) => i.is_current);
    if (currentImg) {
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8008';
      const path = currentImg.medium_path || currentImg.high_path || currentImg.file_path;
      setImageUrl(`${baseUrl}${path}`);
      setImageWidth(currentImg.width || 7481); setImageHeight(currentImg.height || 9843);
    } else { setImageUrl(null); }
  }, []);

  useEffect(() => {
    if (selectedFloorId) loadFloorData(selectedFloorId);
  }, [selectedFloorId, loadFloorData]);

  // ===== Render layers callback =====
  const renderLayers = useCallback((ctx: LayerContext) => {
    renderHallLayer({ graphics: ctx.hallGfx, halls, scale: ctx.scale, selectedObject: ctx.selectedObject });
    renderBoothLayer({ graphics: ctx.boothGfx, labelContainer: ctx.boothLabelContainer, booths, scale: ctx.scale, selectedObject: ctx.selectedObject });
    renderPathLayer({ graphics: ctx.pathGfx, pathNodes, pathEdges, scale: ctx.scale, selectedObject: ctx.selectedObject, connectFromId });
    renderObstacleLayer({ graphics: ctx.obstacleGfx, obstacles, scale: ctx.scale, selectedObject: ctx.selectedObject });
    renderAmenityLayer({ graphics: ctx.amenityGfx, amenities, scale: ctx.scale, selectedObject: ctx.selectedObject });
  }, [halls, booths, pathNodes, pathEdges, obstacles, amenities, connectFromId]);

  // ===== Shape complete handler =====
  const handleShapeComplete = useCallback(async (m: EditorMode, data: ShapeCompleteData) => {
    if (!selectedFloorId) return;
    try {
      if (m === 'booth_rect' || m === 'booth_polygon' || m === 'booth_circle' || m === 'booth_ellipse') {
        const body: any = { floor_id: selectedFloorId, booth_number: `B-${Date.now() % 10000}`, is_active: true };
        if (data.shape === 'rectangle') Object.assign(body, { shape: 'rectangle', x: data.x, y: data.y, width: data.width, height: data.height });
        else if (data.shape === 'polygon') Object.assign(body, { shape: 'polygon', x: data.points[0].x, y: data.points[0].y, width: 0, height: 0, points: JSON.stringify(data.points) });
        else if (data.shape === 'circle') Object.assign(body, { shape: 'circle', x: data.x, y: data.y, width: data.radius * 2, height: data.radius * 2, radius: data.radius });
        else if (data.shape === 'ellipse') Object.assign(body, { shape: 'ellipse', x: data.x, y: data.y, width: data.radiusX * 2, height: data.radiusY * 2, radius_x: data.radiusX, radius_y: data.radiusY });
        const nb = await createBooth(body);
        setBooths(prev => [...prev, nb as any]);
        setSelectedObject({ kind: 'booth', id: nb.id });
        pushAction({ type: 'create', kind: 'booth', id: nb.id, before: null, after: nb as unknown as Record<string, unknown> });
      }
      else if (m === 'hall_rect' || m === 'hall_polygon') {
        const body: any = { floor_id: selectedFloorId, name: { ko: `홀 ${Date.now() % 1000}`, en: `Hall ${Date.now() % 1000}` }, order: halls.length + 1, type: 'hall' };
        if (data.shape === 'rectangle') Object.assign(body, { shape: 'rectangle', area_x: data.x, area_y: data.y, area_width: data.width, area_height: data.height });
        else if (data.shape === 'polygon') Object.assign(body, { shape: 'polygon', points: JSON.stringify(data.points) });
        const nh = await createHall(body);
        setHalls(prev => [...prev, nh as any]);
        setSelectedObject({ kind: 'hall', id: nh.id });
        pushAction({ type: 'create', kind: 'hall', id: nh.id, before: null, after: nh as unknown as Record<string, unknown> });
      }
      else if (m === 'zone_rect' || m === 'zone_polygon') {
        const body: any = { floor_id: selectedFloorId, name: { ko: `구역 ${Date.now() % 1000}`, en: `Zone ${Date.now() % 1000}` }, order: halls.length + 1, type: 'zone' };
        if (data.shape === 'rectangle') Object.assign(body, { shape: 'rectangle', area_x: data.x, area_y: data.y, area_width: data.width, area_height: data.height });
        else if (data.shape === 'polygon') Object.assign(body, { shape: 'polygon', points: JSON.stringify(data.points) });
        const nz = await createHall(body);
        setHalls(prev => [...prev, nz as any]);
        setSelectedObject({ kind: 'hall', id: nz.id });
        pushAction({ type: 'create', kind: 'hall', id: nz.id, before: null, after: nz as unknown as Record<string, unknown> });
      }
      else if (m === 'obstacle_rect' || m === 'obstacle_polygon' || m === 'obstacle_circle') {
        const body: any = { floor_id: selectedFloorId };
        if (data.shape === 'rectangle') Object.assign(body, { x: data.x, y: data.y, width: data.width, height: data.height });
        else if (data.shape === 'polygon') Object.assign(body, { x: data.points[0].x, y: data.points[0].y, width: 0, height: 0, points: JSON.stringify(data.points) });
        else if (data.shape === 'circle') Object.assign(body, { x: data.x, y: data.y, width: data.radius * 2, height: data.radius * 2 });
        const no = await createObstacle(body);
        setObstacles(prev => [...prev, no as any]);
        setSelectedObject({ kind: 'obstacle', id: no.id });
        pushAction({ type: 'create', kind: 'obstacle', id: no.id, before: null, after: no as unknown as Record<string, unknown> });
      }
      else if (m === 'path_node' && data.shape === 'point') {
        const nn = await createPathNode({ type: pathNodeType, x: data.x, y: data.y, floor_id: selectedFloorId });
        setPathNodes(prev => [...prev, nn]);
        setSelectedObject({ kind: 'path_node', id: nn.id });
        pushAction({ type: 'create', kind: 'path_node', id: nn.id, before: null, after: nn as unknown as Record<string, unknown> });
      }
      else if (m === 'amenity' && data.shape === 'point') {
        const na = await createAmenity({ type: amenityType, x: data.x, y: data.y, floor_id: selectedFloorId, is_active: true });
        setAmenities(prev => [...prev, na]);
        setSelectedObject({ kind: 'amenity', id: na.id });
        pushAction({ type: 'create', kind: 'amenity', id: na.id, before: null, after: na as unknown as Record<string, unknown> });
      }
    } catch (err) {
      console.error('Shape create error:', err);
    }
  }, [selectedFloorId, pathNodeType, amenityType, halls.length]);

  // ===== Node connect handler =====
  const handleNodeConnect = useCallback(async (fromId: number, toId: number) => {
    try {
      const ne = await createPathEdge({ from_node_id: fromId, to_node_id: toId });
      setPathEdges(prev => [...prev, ne]);
    } catch (err) {
      console.error('Edge create error:', err);
    }
  }, []);

  // move 시작 시점의 좌표 캡처용 ref
  const moveStartPos = React.useRef<{ kind: string; id: number; x: number; y: number } | null>(null);

  // ===== Object move handler (로컬 state만 갱신, API 미호출) =====
  const captureMoveStart = <T extends { id: number; x: number; y: number }>(prev: T[], kind: string, id: number) => {
    if (!moveStartPos.current) { const o = prev.find(x => x.id === id); if (o) moveStartPos.current = { kind, id, x: o.x, y: o.y }; }
  };
  const handleObjectMove = useCallback((kind: string, id: number, x: number, y: number) => {
    if (kind === 'booth') setBooths(prev => { captureMoveStart(prev, kind, id); return prev.map(b => b.id === id ? { ...b, x, y } : b); });
    else if (kind === 'path_node') setPathNodes(prev => { captureMoveStart(prev, kind, id); return prev.map(n => n.id === id ? { ...n, x, y } : n); });
    else if (kind === 'obstacle') setObstacles(prev => { captureMoveStart(prev, kind, id); return prev.map(o => o.id === id ? { ...o, x, y } : o); });
    else if (kind === 'amenity') setAmenities(prev => { captureMoveStart(prev, kind, id); return prev.map(a => a.id === id ? { ...a, x, y } : a); });
  }, []);

  // ===== Object move end handler (API 저장) =====
  const handleObjectMoveEnd = useCallback(async (kind: string, id: number, x: number, y: number) => {
    const before = moveStartPos.current && moveStartPos.current.kind === kind && moveStartPos.current.id === id
      ? { x: moveStartPos.current.x, y: moveStartPos.current.y }
      : null;
    moveStartPos.current = null;
    try {
      if (kind === 'booth') {
        await updateBooth(id, { x, y } as any);
        setBooths(prev => prev.map(b => b.id === id ? { ...b, x, y } : b));
      } else if (kind === 'path_node') {
        await updatePathNode(id, { x, y });
        setPathNodes(prev => prev.map(n => n.id === id ? { ...n, x, y } : n));
      } else if (kind === 'obstacle') {
        await updateObstacle(id, { x, y } as any);
        setObstacles(prev => prev.map(o => o.id === id ? { ...o, x, y } : o));
      } else if (kind === 'amenity') {
        await updateAmenity(id, { x, y });
        setAmenities(prev => prev.map(a => a.id === id ? { ...a, x, y } : a));
      }
      if (before) pushAction({ type: 'move', kind: kind as ActionKind, id, before: before as Record<string, unknown>, after: { x, y } });
    } catch (err) { console.error('Move end error:', err); }
  }, [pushAction]);

  // resize 시작 시점 캡처용 ref
  const resizeStartRect = React.useRef<{ kind: string; id: number; x: number; y: number; w: number; h: number } | null>(null);

  // ===== Object resize handler (로컬 state만 갱신) =====
  const handleObjectResize = useCallback((kind: string, id: number, x: number, y: number, w: number, h: number) => {
    if (kind === 'booth') {
      setBooths(prev => {
        const obj = prev.find(b => b.id === id);
        if (obj && !resizeStartRect.current) resizeStartRect.current = { kind, id, x: obj.x, y: obj.y, w: obj.width, h: obj.height };
        return prev.map(b => b.id === id ? { ...b, x, y, width: w, height: h } : b);
      });
    } else if (kind === 'obstacle') {
      setObstacles(prev => {
        const obj = prev.find(o => o.id === id);
        if (obj && !resizeStartRect.current) resizeStartRect.current = { kind, id, x: obj.x, y: obj.y, w: obj.width ?? 0, h: obj.height ?? 0 };
        return prev.map(o => o.id === id ? { ...o, x, y, width: w, height: h } : o);
      });
    } else if (kind === 'hall') {
      setHalls(prev => {
        const obj = prev.find(hl => hl.id === id);
        if (obj && !resizeStartRect.current) resizeStartRect.current = { kind, id, x: obj.area_x ?? 0, y: obj.area_y ?? 0, w: obj.area_width ?? 0, h: obj.area_height ?? 0 };
        return prev.map(hl => hl.id === id ? { ...hl, area_x: x, area_y: y, area_width: w, area_height: h } : hl);
      });
    }
  }, []);

  // ===== Object resize end handler (API 저장) =====
  const handleObjectResizeEnd = useCallback(async (kind: string, id: number, x: number, y: number, w: number, h: number) => {
    const before = resizeStartRect.current && resizeStartRect.current.kind === kind && resizeStartRect.current.id === id
      ? { x: resizeStartRect.current.x, y: resizeStartRect.current.y, width: resizeStartRect.current.w, height: resizeStartRect.current.h }
      : null;
    resizeStartRect.current = null;
    try {
      if (kind === 'booth') {
        await updateBooth(id, { x, y, width: w, height: h } as any);
        setBooths(prev => prev.map(b => b.id === id ? { ...b, x, y, width: w, height: h } : b));
      } else if (kind === 'obstacle') {
        await updateObstacle(id, { x, y, width: w, height: h } as any);
        setObstacles(prev => prev.map(o => o.id === id ? { ...o, x, y, width: w, height: h } : o));
      } else if (kind === 'hall') {
        await updateHall(id, { area_x: x, area_y: y, area_width: w, area_height: h } as any);
        setHalls(prev => prev.map(hl => hl.id === id ? { ...hl, area_x: x, area_y: y, area_width: w, area_height: h } : hl));
      }
      if (before) {
        const isHall = kind === 'hall';
        const bRect = isHall ? { area_x: before.x, area_y: before.y, area_width: before.width, area_height: before.height } : before;
        const aRect = isHall ? { area_x: x, area_y: y, area_width: w, area_height: h } : { x, y, width: w, height: h };
        pushAction({ type: 'resize', kind: kind as ActionKind, id, before: bRect as Record<string, unknown>, after: aRect as Record<string, unknown> });
      }
    } catch (err) { console.error('Resize end error:', err); }
  }, [pushAction]);

  // ===== Object delete handler =====
  const handleObjectDelete = useCallback(async (kind: string, id: number) => {
    // 삭제 전 state 스냅샷 (undo 복원용)
    let beforeData: Record<string, unknown> | null = null;
    if (kind === 'booth')      beforeData = booths.find(b => b.id === id) as unknown as Record<string, unknown> ?? null;
    else if (kind === 'path_node') beforeData = pathNodes.find(n => n.id === id) as unknown as Record<string, unknown> ?? null;
    else if (kind === 'obstacle')  beforeData = obstacles.find(o => o.id === id) as unknown as Record<string, unknown> ?? null;
    else if (kind === 'amenity')   beforeData = amenities.find(a => a.id === id) as unknown as Record<string, unknown> ?? null;
    else if (kind === 'hall')      beforeData = halls.find(h => h.id === id) as unknown as Record<string, unknown> ?? null;

    // booth undo 시 company_id만 복원 (companies 테이블은 건드리지 않음)
    if (kind === 'booth' && beforeData) {
      const { company_name: _cn, ...safeData } = beforeData as any;
      beforeData = safeData;
    }

    try {
      if (kind === 'booth') { await deleteBooth(id); setBooths(prev => prev.filter(b => b.id !== id)); }
      else if (kind === 'path_node') { await deletePathNode(id); setPathNodes(prev => prev.filter(n => n.id !== id)); }
      else if (kind === 'path_edge') { await deletePathEdge(id); setPathEdges(prev => prev.filter(e => e.id !== id)); }
      else if (kind === 'obstacle') { await deleteObstacle(id); setObstacles(prev => prev.filter(o => o.id !== id)); }
      else if (kind === 'amenity') { await deleteAmenity(id); setAmenities(prev => prev.filter(a => a.id !== id)); }
      else if (kind === 'hall') { await deleteHall(id); setHalls(prev => prev.filter(h => h.id !== id)); }
      setSelectedObject(null);
      // path_edge는 undo 미지원 (before 데이터에 from/to 노드 정보만 있으면 재생성 가능하지만 단순화)
      if (kind !== 'path_edge' && beforeData) {
        pushAction({ type: 'delete', kind: kind as ActionKind, id, before: beforeData, after: null });
      }
    } catch (err) {
      console.error('Delete error:', err);
    }
  }, [booths, pathNodes, obstacles, amenities, halls, pushAction]);

  // ===== Panel save/delete handlers =====
  const handleBoothSave = useCallback(async (id: number, data: any) => {
    try {
      const beforeBooth = booths.find(b => b.id === id);
      const beforeData = beforeBooth ? { ...beforeBooth } as unknown as Record<string, unknown> : null;
      let saveData = { ...data };
      if (saveData.company_name && !saveData.company_id) {
        const nc = await createCompany({ name: { ko: saveData.company_name, en: saveData.company_name }, category_id: saveData.category_id || undefined });
        saveData.company_id = nc.id; delete saveData.company_name;
        fetchCompanies().then(c => setCompanies(c.map(cc => ({ id: cc.id, name: cc.name, category_id: cc.category_id })))).catch(() => {});
      }
      await updateBooth(id, saveData);
      const updated = await fetchBooths(selectedFloorId!); setBooths(updated as any[]);
      if (beforeData) {
        const afterData = updated.find((b: any) => b.id === id) as unknown as Record<string, unknown> | undefined;
        if (afterData) pushAction({ type: 'update', kind: 'booth', id, before: beforeData, after: afterData });
      }
    } catch(e) { console.error('부스 저장 실패:', e); }
  }, [booths, selectedFloorId, pushAction]);

  const handleNodeSave = useCallback(async (id: number, data: any) => {
    const beforeNode = pathNodes.find(n => n.id === id);
    const beforeData = beforeNode ? { ...beforeNode } as unknown as Record<string, unknown> : null;
    await updatePathNode(id, data);
    setPathNodes(prev => prev.map(n => n.id === id ? { ...n, ...data } : n));
    if (beforeData) pushAction({ type: 'update', kind: 'path_node', id, before: beforeData, after: { ...beforeNode, ...data } as unknown as Record<string, unknown> });
  }, [pathNodes, pushAction]);

  const handleObstacleSave = useCallback(async (id: number, data: any) => {
    const obs = obstacles.find(o => o.id === id);
    const beforeData = obs ? { ...obs } as unknown as Record<string, unknown> : null;
    await updateObstacle(id, data);
    setObstacles(prev => prev.map(o => o.id === id ? { ...o, ...data } : o));
    if (beforeData && obs) pushAction({ type: 'update', kind: 'obstacle', id, before: beforeData, after: { ...obs, ...data } as unknown as Record<string, unknown> });
  }, [obstacles, pushAction]);

  const handleAmenitySave = useCallback(async (id: number, data: any) => {
    const am = amenities.find(a => a.id === id);
    const beforeData = am ? { ...am } as unknown as Record<string, unknown> : null;
    await updateAmenity(id, data);
    setAmenities(prev => prev.map(a => a.id === id ? { ...a, ...data } : a));
    if (beforeData && am) pushAction({ type: 'update', kind: 'amenity', id, before: beforeData, after: { ...am, ...data } as unknown as Record<string, unknown> });
  }, [amenities, pushAction]);

  const handleHallSave = useCallback(async (id: number, data: any) => {
    const hall = halls.find(h => h.id === id);
    const beforeData = hall ? { ...hall } as unknown as Record<string, unknown> : null;
    await updateHall(id, data);
    setHalls(prev => prev.map(h => h.id === id ? { ...h, ...data } : h));
    if (beforeData && hall) pushAction({ type: 'update', kind: 'hall', id, before: beforeData, after: { ...hall, ...data } as unknown as Record<string, unknown> });
  }, [halls, pushAction]);

  // ===== Panel rendering =====
  function renderPanel() {
    if (!selectedObject) return <div className="p-4 text-gray-400 text-sm">오브젝트를 선택하세요</div>;

    if (selectedObject.kind === 'booth') {
      const booth = booths.find(b => b.id === selectedObject.id);
      if (!booth) return null;
      const boothWithCompany = { ...booth, company_id: booth.company_id ?? (booth as any).company?.id ?? null, category_id: booth.category_id ?? (booth as any).category?.id ?? null };
      return <BoothPanel booth={boothWithCompany} categories={categories} companies={companies}
        onSave={handleBoothSave}
        onDelete={async (id) => { try { await deleteBooth(id); setBooths(prev => prev.filter(b => b.id !== id)); setSelectedObject(null); } catch(e) { console.error('부스 삭제 실패:', e); alert('삭제 실패: ' + (e as any)?.message); } }} />;
    }
    if (selectedObject.kind === 'path_node' || selectedObject.kind === 'path_edge') {
      return <PathPanel selectedObject={selectedObject} pathNodes={pathNodes} pathEdges={pathEdges} floors={floors}
        onSaveNode={handleNodeSave}
        onDeleteNode={async (id) => { await deletePathNode(id); setPathNodes(prev => prev.filter(n => n.id !== id)); setSelectedObject(null); }}
        onDeleteEdge={async (id) => { await deletePathEdge(id); setPathEdges(prev => prev.filter(e => e.id !== id)); setSelectedObject(null); }}
        onToggleEdge={async (_id, _isOpen) => { /* TODO */ }} />;
    }
    if (selectedObject.kind === 'obstacle') {
      const obs = obstacles.find(o => o.id === selectedObject.id);
      if (!obs) return null;
      return <ObstaclePanel obstacle={obs} onSave={handleObstacleSave}
        onDelete={async (id) => { await deleteObstacle(id); setObstacles(prev => prev.filter(o => o.id !== id)); setSelectedObject(null); }} />;
    }
    if (selectedObject.kind === 'amenity') {
      const am = amenities.find(a => a.id === selectedObject.id);
      if (!am) return null;
      return <AmenityPanel amenity={am} onSave={handleAmenitySave}
        onDelete={async (id) => { await deleteAmenity(id); setAmenities(prev => prev.filter(a => a.id !== id)); setSelectedObject(null); }} />;
    }
    if (selectedObject.kind === 'hall') {
      const hall = halls.find(h => h.id === selectedObject.id);
      if (!hall) return null;
      return <HallPanel hall={hall} onSave={handleHallSave}
        onDelete={async (id) => { await deleteHall(id); setHalls(prev => prev.filter(h => h.id !== id)); setSelectedObject(null); }} />;
    }
    return null;
  }

  // ===== 키보드 단축키 =====
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // input/textarea에서는 단축키 무시
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedObject) {
        e.preventDefault();
        handleObjectDelete(selectedObject.kind, selectedObject.id);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undo, redo, selectedObject, handleObjectDelete]);

  return (
    <AdminLayout title="에디터">
      <div className="h-[calc(100vh-64px)] flex flex-col">
        {/* Top bar: floor selector + mobile toolbar */}
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <select
            value={selectedFloorId ?? ''}
            onChange={e => setSelectedFloorId(Number(e.target.value))}
            className="px-2 py-1 text-xs rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#2a2a2a] dark:text-gray-200 outline-none"
          >
            {floors.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          <span className="text-[10px] text-gray-400">
            <span className="text-indigo-600 dark:text-indigo-400 font-medium">{mode}</span>
          </span>
          {connectFromId && <span className="text-[10px] text-yellow-600 dark:text-yellow-400">연결: #{connectFromId}</span>}
        </div>

        {/* Toolbar — 상단 수평 (PC+모바일 공통) */}
        <EditorToolbar
          mode={mode} onModeChange={setMode}
          pathNodeType={pathNodeType} onPathNodeTypeChange={setPathNodeType}
          amenityType={amenityType} onAmenityTypeChange={setAmenityType}
          onUndo={undo} onRedo={redo} canUndo={canUndo} canRedo={canRedo}
        />

        <div className="flex flex-1 min-h-0">
          {/* Canvas */}
          <div className="flex-1 min-w-0">
            <EditorCanvas
              imageUrl={imageUrl} imageWidth={imageWidth} imageHeight={imageHeight}
              mode={mode} pathNodeType={pathNodeType} amenityType={amenityType}
              halls={halls} booths={booths} pathNodes={pathNodes} pathEdges={pathEdges}
              obstacles={obstacles} amenities={amenities}
              selectedObject={selectedObject} connectFromId={connectFromId}
              onObjectSelect={setSelectedObject}
              onShapeComplete={handleShapeComplete}
              onNodeConnect={handleNodeConnect}
              onObjectMove={handleObjectMove}
              onObjectMoveEnd={handleObjectMoveEnd}
              onObjectResize={handleObjectResize}
              onObjectResizeEnd={handleObjectResizeEnd}
              onObjectDelete={handleObjectDelete}
              setConnectFromId={setConnectFromId}
              renderLayers={renderLayers}
            />
          </div>

          {/* Right panel — PC only */}
          <div className="hidden md:block w-64 border-l border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1a1a1a] overflow-y-auto">
            {renderPanel()}
          </div>
        </div>

        {/* Mobile: bottom panel when object selected */}
        {selectedObject && (
          <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 max-h-[40vh] overflow-y-auto bg-white dark:bg-[#1a1a1a] border-t border-gray-200 dark:border-gray-700 shadow-lg rounded-t-xl px-3 py-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-gray-600 dark:text-gray-300">속성 편집</span>
              <button onClick={() => setSelectedObject(null)} className="text-gray-400 text-xs px-2 py-1">✕</button>
            </div>
            {renderPanel()}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
