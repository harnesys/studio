import { useEffect, useRef, useState } from 'react';
export function useUnseenCount(total: number, atEnd: boolean): number {
  const baseRef = useRef(total);
  const [unseen, setUnseen] = useState(0);
  useEffect(() => {
    if (atEnd) {
      baseRef.current = total;
      setUnseen(0);
      return;
    }
    setUnseen(Math.max(0, total - baseRef.current));
  }, [atEnd, total]);
  return unseen;
}
