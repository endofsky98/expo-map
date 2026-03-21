/**
 * editor.tsx — 통합 맵 에디터 v2 페이지
 * 데이터 fetch + 상태 관리 + 레이어 조립 + 패널 분기.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import AdminLayout from '@/components/AdminLayout';
import EditorCanvas, { LayerContext } from '@/components/editor/EditorCanvas';
import EditorToolbar from '@/components/editor/EditorToolbar';
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
import { fetchCategories } from '@/lib/api';
import {
  fetchPathNodes, createPathNode, updatePathNode, deletePathNode,
  fetchPathEdges, createPathEdge, deletePathEdge,
  fetchAmenities, createAmenity, updateAmenity, deleteAmenity,
} from '@/lib/editorApi';

export default function EditorPage() {
  // ===== Floor/Hall selection =====
  const [floors, setFloors] = useState<{ id: number; name: string }[]>([]);
  const [selectedFloorId, setSelectedFloorId] = useState<number | null>(null);
  const [categories, setCategories] = useState<{ id: number; name: string }[]>([]);

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

  // ===== Init: fetch floors =====
  useEffect(() => {
    fetchFloors().then(f => {
      const mapped = f.map(fl => ({ id: fl.id, name: typeof fl.name === 'string' ? fl.name : (fl.name as any)?.ko || `Floor ${fl.id}` }));
      setFloors(mapped);
      if (mapped.length > 0 && !selectedFloorId) setSelectedFloorId(mapped[0].id);
    }).catch(() => {});
    fetchCategories().then(c => setCategories(c.map(cc => ({ id: cc.id, name: typeof cc.name === 'string' ? cc.name : String(cc.name) })))).catch(() => {});
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
    setHalls(h as any[]);
    setBooths(b as any[]);
    setPathNodes(pn);
    setPathEdges(pe);
    setObstacles(o as any[]);
    setAmenities(a);

    // Find current image
    const currentImg = (imgs as any[]).find((i: any) => i.is_current);
    if (currentImg) {
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8008';
      // Use high_path or original for editor (full resolution)
      const path = currentImg.high_path || currentImg.file_path;
      setImageUrl(`${baseUrl}${path}`);
      setImageWidth(currentImg.width || 2000);
      setImageHeight(currentImg.height || 1500);
    } else {
      setImageUrl(null);
    }
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
      }
      else if (m === 'hall_rect' || m === 'hall_polygon') {
        const body: any = { floor_id: selectedFloorId, name: `Hall ${Date.now() % 1000}`, order: halls.length + 1 };
        if (data.shape === 'rectangle') Object.assign(body, { shape: 'rectangle', area_x: data.x, area_y: data.y, area_width: data.width, area_height: data.height });
        else if (data.shape === 'polygon') Object.assign(body, { shape: 'polygon', points: JSON.stringify(data.points) });
        const nh = await createHall(body);
        setHalls(prev => [...prev, nh as any]);
      }
      else if (m === 'obstacle_rect' || m === 'obstacle_polygon' || m === 'obstacle_circle') {
        const body: any = { floor_id: selectedFloorId };
        if (data.shape === 'rectangle') Object.assign(body, { x: data.x, y: data.y, width: data.width, height: data.height });
        else if (data.shape === 'polygon') Object.assign(body, { x: data.points[0].x, y: data.points[0].y, width: 0, height: 0, points: JSON.stringify(data.points) });
        else if (data.shape === 'circle') Object.assign(body, { x: data.x, y: data.y, width: data.radius * 2, height: data.radius * 2 });
        const no = await createObstacle(body);
        setObstacles(prev => [...prev, no as any]);
      }
      else if (m === 'path_node' && data.shape === 'point') {
        const nn = await createPathNode({ type: pathNodeType, x: data.x, y: data.y, floor_id: selectedFloorId });
        setPathNodes(prev => [...prev, nn]);
      }
      else if (m === 'amenity' && data.shape === 'point') {
        const na = await createAmenity({ type: amenityType, x: data.x, y: data.y, floor_id: selectedFloorId, is_active: true });
        setAmenities(prev => [...prev, na]);
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

  // ===== Object move handler =====
  const handleObjectMove = useCallback(async (kind: string, id: number, x: number, y: number) => {
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
    } catch (err) {
      console.error('Move error:', err);
    }
  }, []);

  // ===== Object delete handler =====
  const handleObjectDelete = useCallback(async (kind: string, id: number) => {
    try {
      if (kind === 'booth') { await deleteBooth(id); setBooths(prev => prev.filter(b => b.id !== id)); }
      else if (kind === 'path_node') { await deletePathNode(id); setPathNodes(prev => prev.filter(n => n.id !== id)); }
      else if (kind === 'path_edge') { await deletePathEdge(id); setPathEdges(prev => prev.filter(e => e.id !== id)); }
      else if (kind === 'obstacle') { await deleteObstacle(id); setObstacles(prev => prev.filter(o => o.id !== id)); }
      else if (kind === 'amenity') { await deleteAmenity(id); setAmenities(prev => prev.filter(a => a.id !== id)); }
      else if (kind === 'hall') { await deleteHall(id); setHalls(prev => prev.filter(h => h.id !== id)); }
      setSelectedObject(null);
    } catch (err) {
      console.error('Delete error:', err);
    }
  }, []);

  // ===== Panel rendering =====
  function renderPanel() {
    if (!selectedObject) return (
      <div className="p-4 text-gray-400 text-sm">오브젝트를 선택하세요</div>
    );

    if (selectedObject.kind === 'booth') {
      const booth = booths.find(b => b.id === selectedObject.id);
      if (!booth) return null;
      return <BoothPanel booth={booth} categories={categories}
        onSave={async (id, data) => { await updateBooth(id, data as any); setBooths(prev => prev.map(b => b.id === id ? { ...b, ...data } : b)); }}
        onDelete={async (id) => { await deleteBooth(id); setBooths(prev => prev.filter(b => b.id !== id)); setSelectedObject(null); }} />;
    }

    if (selectedObject.kind === 'path_node' || selectedObject.kind === 'path_edge') {
      return <PathPanel selectedObject={selectedObject} pathNodes={pathNodes} pathEdges={pathEdges} floors={floors}
        onSaveNode={async (id, data) => { await updatePathNode(id, data); setPathNodes(prev => prev.map(n => n.id === id ? { ...n, ...data } : n)); }}
        onDeleteNode={async (id) => { await deletePathNode(id); setPathNodes(prev => prev.filter(n => n.id !== id)); setSelectedObject(null); }}
        onDeleteEdge={async (id) => { await deletePathEdge(id); setPathEdges(prev => prev.filter(e => e.id !== id)); setSelectedObject(null); }}
        onToggleEdge={async (_id, _isOpen) => { /* TODO: update edge */ }} />;
    }

    if (selectedObject.kind === 'obstacle') {
      const obs = obstacles.find(o => o.id === selectedObject.id);
      if (!obs) return null;
      return <ObstaclePanel obstacle={obs}
        onSave={async (id, data) => { await updateObstacle(id, data as any); setObstacles(prev => prev.map(o => o.id === id ? { ...o, ...data } : o)); }}
        onDelete={async (id) => { await deleteObstacle(id); setObstacles(prev => prev.filter(o => o.id !== id)); setSelectedObject(null); }} />;
    }

    if (selectedObject.kind === 'amenity') {
      const am = amenities.find(a => a.id === selectedObject.id);
      if (!am) return null;
      return <AmenityPanel amenity={am}
        onSave={async (id, data) => { await updateAmenity(id, data); setAmenities(prev => prev.map(a => a.id === id ? { ...a, ...data } : a)); }}
        onDelete={async (id) => { await deleteAmenity(id); setAmenities(prev => prev.filter(a => a.id !== id)); setSelectedObject(null); }} />;
    }

    if (selectedObject.kind === 'hall') {
      const hall = halls.find(h => h.id === selectedObject.id);
      if (!hall) return null;
      return <HallPanel hall={hall}
        onSave={async (id, data) => { await updateHall(id, data as any); setHalls(prev => prev.map(h => h.id === id ? { ...h, ...data } : h)); }}
        onDelete={async (id) => { await deleteHall(id); setHalls(prev => prev.filter(h => h.id !== id)); setSelectedObject(null); }} />;
    }

    return null;
  }

  return (
    <AdminLayout title="에디터">
      {/* Top bar: floor selector */}
      <div className="flex items-center gap-4 px-4 py-2 bg-gray-800 border-b border-gray-700">
        <span className="text-white text-sm font-medium">📋 에디터</span>
        <select
          value={selectedFloorId ?? ''}
          onChange={e => setSelectedFloorId(Number(e.target.value))}
          className="bg-gray-700 text-white text-sm rounded px-3 py-1 border border-gray-600"
        >
          {floors.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        <div className="text-gray-400 text-xs">
          모드: <span className="text-indigo-400 font-medium">{mode}</span>
          {connectFromId && <span className="ml-2 text-yellow-400">연결 중: 노드 #{connectFromId}</span>}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left toolbar */}
        <EditorToolbar
          mode={mode} onModeChange={setMode}
          pathNodeType={pathNodeType} onPathNodeTypeChange={setPathNodeType}
          amenityType={amenityType} onAmenityTypeChange={setAmenityType}
        />

        {/* Canvas */}
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
          onObjectDelete={handleObjectDelete}
          setConnectFromId={setConnectFromId}
          renderLayers={renderLayers}
        />

        {/* Right panel */}
        <div className="w-72 bg-gray-800 border-l border-gray-700 overflow-y-auto">
          {renderPanel()}
        </div>
      </div>
    </AdminLayout>
  );
}
