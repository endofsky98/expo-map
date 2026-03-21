/**
 * useUndoRedo.ts — 에디터 Undo/Redo 훅
 * 최대 100단계. create/update/delete/move/resize 지원.
 * companies 테이블은 건드리지 않음 — booth의 company_id만 복원.
 */
import { useCallback, useRef, useState } from 'react';
import { createBooth, updateBooth, deleteBooth } from '@/lib/api';
import { createHall, updateHall, deleteHall } from '@/lib/api';
import { createObstacle, updateObstacle, deleteObstacle } from '@/lib/api';
import {
  createPathNode, updatePathNode, deletePathNode,
  createAmenity, updateAmenity, deleteAmenity,
} from '@/lib/editorApi';

const MAX_STACK = 100;

export type ActionKind = 'booth' | 'hall' | 'obstacle' | 'amenity' | 'path_node';
export type ActionType = 'create' | 'update' | 'delete' | 'move' | 'resize';

export interface UndoAction {
  type: ActionType;
  kind: ActionKind;
  id: number;
  before: Record<string, unknown> | null; // create일 때 null
  after: Record<string, unknown> | null;  // delete일 때 null
}

export interface UndoRedoCallbacks {
  /** Undo/Redo 수행 후 로컬 state를 갱신할 콜백 */
  onStateChange: (kind: ActionKind, action: 'upsert' | 'delete', id: number, data: Record<string, unknown> | null) => void;
}

export function useUndoRedo(callbacks: UndoRedoCallbacks) {
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // ref로 관리하여 stale-closure 방지
  const undoStack = useRef<UndoAction[]>([]);
  const redoStack = useRef<UndoAction[]>([]);

  const syncState = useCallback(() => {
    setCanUndo(undoStack.current.length > 0);
    setCanRedo(redoStack.current.length > 0);
  }, []);

  /** 새 액션 push — redoStack 클리어 */
  const pushAction = useCallback((action: UndoAction) => {
    undoStack.current = [...undoStack.current.slice(-MAX_STACK + 1), action];
    redoStack.current = [];
    syncState();
  }, [syncState]);

  /** API 역연산 실행 + 새 ID 반환 (create 시 서버 ID 발급) */
  const applyAction = useCallback(async (
    action: UndoAction,
    direction: 'undo' | 'redo',
  ): Promise<UndoAction> => {
    const { type, kind, id, before, after } = action;

    // undo: create → delete, delete → create, move/resize/update → before로 복원
    // redo: delete → create, create → delete, move/resize/update → after로 적용
    const isUndo = direction === 'undo';
    const { onStateChange } = callbacks;

    if (type === 'create') {
      // undo create = delete
      if (isUndo) {
        await apiDelete(kind, id);
        onStateChange(kind, 'delete', id, null);
        return { ...action }; // redo 시 재생성 → after 데이터 필요
      } else {
        // redo create = 다시 create
        const created = await apiCreate(kind, after!);
        onStateChange(kind, 'upsert', created.id, created as Record<string, unknown>);
        return { ...action, id: created.id };
      }
    }

    if (type === 'delete') {
      // undo delete = 다시 create (before 데이터로)
      if (isUndo) {
        const created = await apiCreate(kind, before!);
        onStateChange(kind, 'upsert', created.id, created as Record<string, unknown>);
        return { ...action, id: created.id }; // 새 ID로 업데이트
      } else {
        // redo delete = 다시 delete
        await apiDelete(kind, id);
        onStateChange(kind, 'delete', id, null);
        return { ...action };
      }
    }

    // move / resize / update: 대상 데이터로 복원
    const restoreData = isUndo ? before! : after!;
    const updated = await apiUpdate(kind, id, restoreData);
    onStateChange(kind, 'upsert', id, updated as Record<string, unknown>);
    return { ...action };
  }, [callbacks]);

  /** Undo 실행 */
  const undo = useCallback(async () => {
    if (undoStack.current.length === 0) return;
    const action = undoStack.current[undoStack.current.length - 1];
    undoStack.current = undoStack.current.slice(0, -1);
    try {
      const applied = await applyAction(action, 'undo');
      redoStack.current = [...redoStack.current, applied];
    } catch (err) {
      console.error('[Undo] 실패:', err);
      // 실패 시 스택 복원
      undoStack.current = [...undoStack.current, action];
    }
    syncState();
  }, [applyAction, syncState]);

  /** Redo 실행 */
  const redo = useCallback(async () => {
    if (redoStack.current.length === 0) return;
    const action = redoStack.current[redoStack.current.length - 1];
    redoStack.current = redoStack.current.slice(0, -1);
    try {
      const applied = await applyAction(action, 'redo');
      undoStack.current = [...undoStack.current, applied];
    } catch (err) {
      console.error('[Redo] 실패:', err);
      redoStack.current = [...redoStack.current, action];
    }
    syncState();
  }, [applyAction, syncState]);

  return { pushAction, undo, redo, canUndo, canRedo };
}

// ===== API 헬퍼 =====

type AnyEntity = { id: number } & Record<string, unknown>;
const toAny = <T,>(p: Promise<T>): Promise<AnyEntity> => p as unknown as Promise<AnyEntity>;

async function apiCreate(kind: ActionKind, data: Record<string, unknown>): Promise<AnyEntity> {
  switch (kind) {
    case 'booth':     return toAny(createBooth(data));
    case 'hall':      return toAny(createHall(data));
    case 'obstacle':  return toAny(createObstacle(data));
    case 'path_node': return toAny(createPathNode(data));
    case 'amenity':   return toAny(createAmenity(data));
  }
}

async function apiUpdate(kind: ActionKind, id: number, data: Record<string, unknown>): Promise<AnyEntity> {
  switch (kind) {
    case 'booth':     return toAny(updateBooth(id, data));
    case 'hall':      return toAny(updateHall(id, data));
    case 'obstacle':  return toAny(updateObstacle(id, data));
    case 'path_node': return toAny(updatePathNode(id, data));
    case 'amenity':   return toAny(updateAmenity(id, data));
  }
}

async function apiDelete(kind: ActionKind, id: number): Promise<void> {
  switch (kind) {
    case 'booth':     return deleteBooth(id);
    case 'hall':      return deleteHall(id);
    case 'obstacle':  return deleteObstacle(id);
    case 'path_node': return deletePathNode(id);
    case 'amenity':   return deleteAmenity(id);
  }
}
