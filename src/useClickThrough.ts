import { useEffect, useRef } from "react";
import { cursorPosition, getCurrentWindow } from "@tauri-apps/api/window";
import {
  cursorToWindowLocal,
  rectsFromElements,
  shouldIgnoreCursorEvents,
} from "./clickThrough";

const POLL_MS = 16;

export function useClickThrough(opts: {
  hitRefs: Array<{ current: Element | null }>;
  pinnedRef: { current: boolean };
}) {
  const hitRefsRef = useRef(opts.hitRefs);
  hitRefsRef.current = opts.hitRefs;
  const pinnedRef = opts.pinnedRef;

  useEffect(() => {
    const win = getCurrentWindow();
    let cancelled = false;
    let ignoring = false;
    let inFlight = false;

    async function tick() {
      if (cancelled || inFlight) return;
      inFlight = true;
      try {
        const [cursor, origin] = await Promise.all([
          cursorPosition(),
          win.outerPosition(),
        ]);
        if (cancelled) return;

        const local = cursorToWindowLocal(
          { x: cursor.x, y: cursor.y },
          { x: origin.x, y: origin.y },
          window.devicePixelRatio || 1,
        );
        const next = shouldIgnoreCursorEvents({
          pinned: pinnedRef.current,
          local,
          hits: rectsFromElements(hitRefsRef.current.map((ref) => ref.current)),
          currentlyIgnoring: ignoring,
        });
        if (next === ignoring) return;
        await win.setIgnoreCursorEvents(next);
        if (!cancelled) ignoring = next;
      } catch {
        // Window APIs can fail if the webview is closing.
      } finally {
        inFlight = false;
      }
    }

    const timer = window.setInterval(() => {
      void tick();
    }, POLL_MS);
    void tick();

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      void win.setIgnoreCursorEvents(false);
    };
  }, [pinnedRef]);
}
