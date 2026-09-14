import { useCallback, useEffect, useRef, useState, type WheelEvent } from "react";
import { LogicalSize, PhysicalPosition } from "@tauri-apps/api/dpi";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { cssPixelScale } from "./dpi";
import {
  BASE_HEIGHT,
  BASE_WIDTH,
  loadSavedLogicalSize,
  logicalSizeFromScale,
  nextScaleFromNudge,
  nextScaleFromWheel,
  positionAfterScale,
  saveLogicalSize,
  scaleFromLogicalSize,
  sizeForMenu,
  wheelShouldScale,
  type Edge,
  type Size,
} from "./windowSize";

function cssScale(): number {
  return scaleFromLogicalSize(window.innerWidth, window.innerHeight);
}

export function useWindowResize(opts: {
  edge: Edge;
  resizingRef: { current: boolean };
}) {
  const edgeRef = useRef(opts.edge);
  edgeRef.current = opts.edge;
  const resizingRef = opts.resizingRef;

  const [scale, setScale] = useState(cssScale);

  const applyInFlight = useRef(false);
  const lastSizeRef = useRef<Size>(loadSavedLogicalSize());
  const pending = useRef<{
    size: Size;
    origin?: { x: number; y: number };
    persist: boolean;
  } | null>(null);
  const preMenuSizeRef = useRef<Size | null>(null);

  const applyWindow = useCallback(
    async (
      size: Size,
      origin?: { x: number; y: number },
      persist = true,
    ) => {
      lastSizeRef.current = size;
      pending.current = { size, origin, persist };
      if (applyInFlight.current) return;
      applyInFlight.current = true;
      const win = getCurrentWindow();
      try {
        while (pending.current) {
          const next = pending.current;
          pending.current = null;
          await win.setSize(new LogicalSize(next.size.width, next.size.height));
          if (next.origin) {
            await win.setPosition(
              new PhysicalPosition(
                Math.round(next.origin.x),
                Math.round(next.origin.y),
              ),
            );
          }
          lastSizeRef.current = next.size;
          if (next.persist) saveLogicalSize(next.size);
        }
      } catch {
        // Window APIs can fail if the webview is closing.
      } finally {
        applyInFlight.current = false;
      }
    },
    [],
  );

  const scaleTo = useCallback(
    async (nextScale: number, persist = true) => {
      const size = logicalSizeFromScale(nextScale);
      if (
        size.width === lastSizeRef.current.width &&
        size.height === lastSizeRef.current.height
      ) {
        return;
      }
      resizingRef.current = true;
      try {
        const win = getCurrentWindow();
        const [origin, outer] = await Promise.all([
          win.outerPosition(),
          win.outerSize(),
        ]);
        const dpr = cssPixelScale(
          outer.width,
          window.innerWidth,
          window.devicePixelRatio || 1,
        );
        const planted = positionAfterScale({
          edge: edgeRef.current,
          x: origin.x,
          y: origin.y,
          width: outer.width,
          height: outer.height,
          nextWidth: size.width * dpr,
          nextHeight: size.height * dpr,
        });
        await applyWindow(size, planted, persist);
      } catch {
        await applyWindow(size, undefined, persist);
      } finally {
        resizingRef.current = false;
      }
    },
    [applyWindow, resizingRef],
  );

  useEffect(() => {
    const saved = loadSavedLogicalSize();
    void (async () => {
      if (saved.width !== BASE_WIDTH || saved.height !== BASE_HEIGHT) {
        await applyWindow(saved);
      }
    })();
    const sync = () => setScale(cssScale());
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, [applyWindow]);

  const onWheel = useCallback(
    (event: WheelEvent<HTMLElement>) => {
      if (
        !wheelShouldScale({
          deltaY: event.deltaY,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
        })
      ) {
        return;
      }
      event.preventDefault();
      if (preMenuSizeRef.current) preMenuSizeRef.current = null;
      void scaleTo(nextScaleFromWheel(cssScale(), event.deltaY));
    },
    [scaleTo],
  );

  const nudge = useCallback(
    (direction: 1 | -1) => {
      if (preMenuSizeRef.current) preMenuSizeRef.current = null;
      void scaleTo(nextScaleFromNudge(cssScale(), direction));
    },
    [scaleTo],
  );

  const ensureMenuRoom = useCallback(
    async (open: boolean) => {
      if (open) {
        const grown = sizeForMenu(lastSizeRef.current);
        if (!grown) return;
        preMenuSizeRef.current = lastSizeRef.current;
        await scaleTo(
          scaleFromLogicalSize(grown.width, grown.height),
          false,
        );
        return;
      }
      const restore = preMenuSizeRef.current;
      preMenuSizeRef.current = null;
      if (!restore) return;
      await scaleTo(
        scaleFromLogicalSize(restore.width, restore.height),
        false,
      );
    },
    [scaleTo],
  );

  return {
    scale,
    resizingRef,
    onWheel,
    nudge,
    ensureMenuRoom,
  };
}
