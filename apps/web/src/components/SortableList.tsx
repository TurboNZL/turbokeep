import { useMemo, type ReactNode } from 'react';
import { DndContext, KeyboardSensor, MouseSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { restrictToWindowEdges } from '@dnd-kit/modifiers';
import type { DragBits } from './ItemRow.tsx';

/**
 * Drag and drop for a list of ids. With a mouse the whole row is the handle (it starts after 6 px of movement, so a click still clicks). With a finger
 * only the grip starts a drag, so scrolling the list with a finger never moves anything and holding the row still opens its menu. The keyboard picks
 * a row up with Space on the grip and moves it with the arrow keys. `onMove(id, above, below)` says where it landed.
 */
export function SortableList({ ids, grid, onMove, children }: { ids: string[]; grid?: boolean; onMove: (id: string, above: string | null, below: string | null) => void; children: ReactNode }) {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const end = (e: DragEndEvent) => {
    const from = ids.indexOf(String(e.active.id)), to = e.over ? ids.indexOf(String(e.over.id)) : -1;
    if (from < 0 || to < 0 || from === to) return;
    const next = arrayMove(ids, from, to);
    onMove(String(e.active.id), next[to - 1] ?? null, next[to + 1] ?? null);
  };
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={end} modifiers={grid ? undefined : [restrictToWindowEdges]}>
      <SortableContext items={ids} strategy={grid ? rectSortingStrategy : verticalListSortingStrategy}>{children}</SortableContext>
    </DndContext>
  );
}

/** Gives the render function what a row needs to be draggable (call it inside a SortableList). */
export function Sortable({ id, disabled, children }: { id: string; disabled?: boolean; children: (d: DragBits | undefined) => ReactNode }) {
  const s = useSortable({ id, disabled });
  const bits = useMemo<DragBits | undefined>(() => {
    if (disabled) return undefined;
    const l = (s.listeners ?? {}) as Record<string, unknown>;
    return {
      setNodeRef: s.setNodeRef,
      style: { transform: CSS.Transform.toString(s.transform), transition: s.transition, zIndex: s.isDragging ? 30 : undefined, position: s.isDragging ? 'relative' : undefined, opacity: s.isDragging ? 0.95 : 1 },
      dragging: s.isDragging,
      // mouse: anywhere on the row; finger and keyboard: the grip
      rowProps: { onMouseDown: l.onMouseDown as never },
      handleProps: { ...s.attributes, onTouchStart: l.onTouchStart as never, onKeyDown: l.onKeyDown as never, style: { touchAction: 'none' }, ref: s.setActivatorNodeRef } as never,
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled, s.transform, s.transition, s.isDragging, s.listeners, s.attributes]);
  return <>{children(bits)}</>;
}
