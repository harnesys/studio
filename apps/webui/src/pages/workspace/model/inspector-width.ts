import { type MouseEvent as ReactMouseEvent, useEffect, useRef, useState } from 'react';
import {
  INSPECTOR_DEFAULT_WIDTH,
  INSPECTOR_MAX_WIDTH,
  INSPECTOR_MIN_WIDTH,
  INSPECTOR_WIDTH_STORAGE_KEY,
} from '@/shared/config/constants';

export function useInspectorWidth() {
  const [width, setWidth] = useState(readStoredWidth);
  const [dragging, setDragging] = useState(false);
  const shellRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(INSPECTOR_WIDTH_STORAGE_KEY, String(width));
    } catch {
      // ignore quota / private mode
    }
  }, [width]);

  const onResizeStart = (event: ReactMouseEvent) => {
    event.preventDefault();
    const shell = shellRef.current;
    if (!shell) {
      return;
    }
    setDragging(true);
    const shellBox = shell.getBoundingClientRect();

    const onMove = (move: MouseEvent) => {
      const raw = shellBox.right - move.clientX;
      const max = Math.min(
        INSPECTOR_MAX_WIDTH,
        Math.max(INSPECTOR_MIN_WIDTH, shellBox.width * 0.5),
      );
      setWidth(Math.min(max, Math.max(INSPECTOR_MIN_WIDTH, raw)));
    };
    const onUp = () => {
      setDragging(false);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return { width, dragging, shellRef, onResizeStart };
}

function readStoredWidth(): number {
  try {
    const raw = localStorage.getItem(INSPECTOR_WIDTH_STORAGE_KEY);
    if (!raw) {
      return INSPECTOR_DEFAULT_WIDTH;
    }
    const value = Number(raw);
    if (!Number.isFinite(value)) {
      return INSPECTOR_DEFAULT_WIDTH;
    }
    return Math.min(INSPECTOR_MAX_WIDTH, Math.max(INSPECTOR_MIN_WIDTH, value));
  } catch {
    return INSPECTOR_DEFAULT_WIDTH;
  }
}
