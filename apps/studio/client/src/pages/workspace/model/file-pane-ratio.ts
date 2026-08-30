import { type MouseEvent as ReactMouseEvent, useEffect, useRef, useState } from 'react';
import {
  FILE_PANE_DEFAULT_RATIO,
  FILE_PANE_MAX_RATIO,
  FILE_PANE_MIN_RATIO,
  FILE_PANE_RATIO_STORAGE_KEY,
} from '@/shared/config/constants';

export function useFilePaneRatio() {
  const [fileRatio, setFileRatio] = useState(readStoredRatio);
  const [dragging, setDragging] = useState(false);
  const shellRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(FILE_PANE_RATIO_STORAGE_KEY, String(fileRatio));
    } catch {
      // ignore quota / private mode
    }
  }, [fileRatio]);

  const onResizeStart = (event: ReactMouseEvent) => {
    event.preventDefault();
    const shell = shellRef.current;
    if (!shell) {
      return;
    }
    setDragging(true);
    const shellBox = shell.getBoundingClientRect();

    const onMove = (move: MouseEvent) => {
      const next = (move.clientX - shellBox.left) / shellBox.width;
      setFileRatio(Math.min(FILE_PANE_MAX_RATIO, Math.max(FILE_PANE_MIN_RATIO, next)));
    };
    const onUp = () => {
      setDragging(false);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return { fileRatio, dragging, shellRef, onResizeStart };
}

function readStoredRatio(): number {
  try {
    const raw = localStorage.getItem(FILE_PANE_RATIO_STORAGE_KEY);
    if (!raw) {
      return FILE_PANE_DEFAULT_RATIO;
    }
    const value = Number(raw);
    if (!Number.isFinite(value)) {
      return FILE_PANE_DEFAULT_RATIO;
    }
    return Math.min(FILE_PANE_MAX_RATIO, Math.max(FILE_PANE_MIN_RATIO, value));
  } catch {
    return FILE_PANE_DEFAULT_RATIO;
  }
}
