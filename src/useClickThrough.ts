import { useEffect, useRef } from "react";
import { cursorPosition, getCurrentWindow } from "@tauri-apps/api/window";
import {
  cursorToWindowLocal,
  rectsFromElements,
  releaseIgnoreCursorEvents,
  shouldIgnoreCursorEvents,
} from "./clickThrough";
import { cssPixelScale } from "./dpi";
import type { WalkWindow } from "./useEdgeWalk";

const POLL_MS = 32;
const SCALE_REFRESH_MS = 500;

export function useClickThrough(opts: {
  hitRefs: Array<{ current: Element | null }>;
  pinnedRefs: Array<{ current: boolean }>;
  movingRef?: { current: boolean };
  positionRef?: { current: WalkWindow };
}) {
  const hitRefsRef = useRef(opts.hitRefs);
  hitRefsRef.current = opts.hitRefs;
  const pinnedRefsRef = useRef(opts.pinnedRefs);
  pinnedRefsRef.current = opts.pinnedRefs;
  const movingRef = useRef(opts.movingRef);
  movingRef.current = opts.movingRef;
  const positionRef = useRef(opts.positionRef);
  positionRef.current = opts.positionRef;

  useEffect(() => {
    const win = getCurrentWindow();
    let cancelled = false;
    let ignoring = false;
    let inFlight = false;
    let outsideSince: number | null = null;
    let scale = window.devicePixelRatio || 1;
    let lastScaleRead = 0;

    async function refreshScale(now: number) {
      if (now - lastScaleRead < SCALE_REFRESH_MS) return;
      lastScaleRead = now;
      try {
        const outer = await win.outerSize();
        if (cancelled) return;
        scale = cssPixelScale(
          outer.width,
          window.innerWidth,
          window.devicePixelRatio || 1,
        );
      } catch {
        // Window APIs can fail if the webview is closing.
      }
    }

    async function tick() {
      if (cancelled || inFlight) return;
      inFlight = true;
      try {
        const now = performance.now();
        await refreshScale(now);
        if (cancelled) return;

        const cursor = await cursorPosition();
        if (cancelled) return;

        const cached = positionRef.current?.current;
        const origin =
          cached?.ready
            ? { x: cached.x, y: cached.y }
            : await win.outerPosition();
        if (cancelled) return;

        const local = cursorToWindowLocal(
          { x: cursor.x, y: cursor.y },
          { x: origin.x, y: origin.y },
          scale,
        );
        const wantIgnore = shouldIgnoreCursorEvents({
          pinned: pinnedRefsRef.current.some((ref) => ref.current),
          local,
          hits: rectsFromElements(
            hitRefsRef.current.map((ref) => ref.current),
          ),
          currentlyIgnoring: ignoring,
          moving: movingRef.current?.current ?? false,
        });
        if (wantIgnore) {
          if (outsideSince === null) outsideSince = now;
        } else {
          outsideSince = null;
        }
        const next = releaseIgnoreCursorEvents({
          wantIgnore,
          currentlyIgnoring: ignoring,
          outsideMs: outsideSince === null ? 0 : now - outsideSince,
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
  }, []);
}
