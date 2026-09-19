import { useState } from 'react';
import { useAccordionStore } from './accordion.store';

type DropHint = { id: string; before: boolean };

type SectionDragProps = {
  draggable: boolean;
  onDragStart: (event: React.DragEvent<HTMLButtonElement>) => void;
  onDragOver: (event: React.DragEvent<HTMLButtonElement>) => void;
  onDragLeave: (event: React.DragEvent<HTMLButtonElement>) => void;
  onDrop: (event: React.DragEvent<HTMLButtonElement>) => void;
  onDragEnd: (event: React.DragEvent<HTMLButtonElement>) => void;
};

export function useSectionDnd(): {
  draggingId: string | null;
  dropHintFor: (id: string) => 'before' | 'after' | null;
  headerProps: (id: string) => SectionDragProps;
} {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropHint, setDropHint] = useState<DropHint | null>(null);

  const dropHintFor = (id: string): 'before' | 'after' | null => {
    if (dropHint?.id !== id) {
      return null;
    }
    return dropHint.before ? 'before' : 'after';
  };

  const reset = () => {
    setDraggingId(null);
    setDropHint(null);
  };

  const commit = (draggedId: string, targetId: string, before: boolean) => {
    const order = useAccordionStore.getState().order;
    if (!order.includes(draggedId) || !order.includes(targetId) || draggedId === targetId) {
      return;
    }
    const next = order.filter((id) => id !== draggedId);
    let insertAt = next.indexOf(targetId);
    if (!before) {
      insertAt += 1;
    }
    next.splice(insertAt, 0, draggedId);
    useAccordionStore.getState().setOrder(next);
  };

  const headerProps = (id: string): SectionDragProps => ({
    draggable: true,
    onDragStart: (event) => {
      setDraggingId(id);
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', id);
    },
    onDragOver: (event) => {
      if (!draggingId || draggingId === id) {
        return;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      const rect = event.currentTarget.getBoundingClientRect();
      const before = event.clientY < rect.top + rect.height / 2;
      setDropHint((prev) => (prev?.id === id && prev.before === before ? prev : { id, before }));
    },
    onDragLeave: (event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
        setDropHint((prev) => (prev?.id === id ? null : prev));
      }
    },
    onDrop: (event) => {
      event.preventDefault();
      if (draggingId && draggingId !== id && dropHint?.id === id) {
        commit(draggingId, id, dropHint.before);
      }
      reset();
    },
    onDragEnd: reset,
  });

  return { draggingId, dropHintFor, headerProps };
}
