import { useCallback, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// useAnimatedModal — manages { item, closing, open, close } for a single
// modal. "closing" stays true for CLOSE_MS after close() is called, giving
// the modal component a window to play its exit transition before it's
// actually removed from the DOM (unmounting an item instantly, with no
// transition, is what caused the "sudden open/close" feel).
// ---------------------------------------------------------------------------

const CLOSE_MS = 380;

export function useAnimatedModal() {
  const [item, setItem] = useState(null);
  const [closing, setClosing] = useState(false);
  const timerRef = useRef(null);

  const open = useCallback((newItem) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setClosing(false);
    setItem(newItem);
  }, []);

  const close = useCallback(() => {
    setClosing(true);
    timerRef.current = setTimeout(() => {
      setItem(null);
      setClosing(false);
    }, CLOSE_MS);
  }, []);

  return { item, closing, open, close };
}
