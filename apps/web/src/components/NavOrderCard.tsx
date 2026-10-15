import { ArrowDown, ArrowUp, GripVertical } from 'lucide-react';
import { DndContext, KeyboardSensor, MouseSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { Archive, House, Settings, Trash2, type LucideIcon } from 'lucide-react';
import { useStore } from '../lib/store.ts';
import { NAV_IDS, type NavId } from '../lib/settings.ts';
import { Section } from './Section.tsx';

const META: Record<NavId, { label: string; icon: LucideIcon }> = { home: { label: 'Home', icon: House }, archive: { label: 'Archive', icon: Archive }, bin: { label: 'Bin', icon: Trash2 }, settings: { label: 'Settings', icon: Settings } };

function Row({ id, i, n, move }: { id: NavId; i: number; n: number; move: (from: number, to: number) => void }) {
  const s = useSortable({ id });
  const M = META[id];
  return (
    <li ref={s.setNodeRef} style={{ transform: CSS.Transform.toString(s.transform), transition: s.transition, zIndex: s.isDragging ? 5 : undefined, position: 'relative' }} className="card flex items-center gap-2 p-1.5 pr-2">
      <button type="button" ref={s.setActivatorNodeRef} {...s.attributes} {...s.listeners} style={{ touchAction: 'none' }} className="grid h-11 w-9 shrink-0 cursor-grab place-items-center rounded text-muted hover:text-fg" aria-label={`Drag ${M.label}, or press space and use the arrow keys`}><GripVertical size={18} /></button>
      <M.icon size={18} className="shrink-0" /><span className="min-w-0 flex-1 font-medium">{M.label}</span>
      <button type="button" className="btn btn-ghost !h-10 !w-10 !p-0" disabled={i === 0} aria-label={`Move ${M.label} earlier`} onClick={() => move(i, i - 1)}><ArrowUp size={16} /></button>
      <button type="button" className="btn btn-ghost !h-10 !w-10 !p-0" disabled={i === n - 1} aria-label={`Move ${M.label} later`} onClick={() => move(i, i + 1)}><ArrowDown size={16} /></button>
    </li>
  );
}

/** The order of the pages in the side bar, the top bar and the dock: drag a row (or use its arrows). */
export function NavOrderCard() {
  const order = useStore((s) => s.settings.navOrder), update = useStore((s) => s.updateSettings);
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 4 } }), useSensor(TouchSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const move = (from: number, to: number) => update({ navOrder: arrayMove(order, from, to) });
  const end = (e: DragEndEvent) => { if (e.over && e.active.id !== e.over.id) move(order.indexOf(e.active.id as NavId), order.indexOf(e.over.id as NavId)); };
  return (
    <Section title="Page order">
      <p className="text-sm text-muted">The order of the pages in the side bar, the top bar and the dock. Drag a row, or use its arrows. Kept in this browser.</p>
      <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToVerticalAxis]} onDragEnd={end}>
        <SortableContext items={order} strategy={verticalListSortingStrategy}>
          <ul className="max-w-sm space-y-1.5">{order.map((id, i) => <Row key={id} id={id} i={i} n={order.length} move={move} />)}</ul>
        </SortableContext>
      </DndContext>
      {order.join() !== NAV_IDS.join() && <button className="btn" onClick={() => update({ navOrder: NAV_IDS })}>Back to the usual order</button>}
    </Section>
  );
}
