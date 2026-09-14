import { useCallback, useEffect, useRef, useState, type PointerEvent, type WheelEvent } from "react";
import { LogicalSize, PhysicalPosition } from "@tauri-apps/api/dpi";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  BASE_HEIGHT,
  BASE_WIDTH,
  RESIZE_DIRS,
  loadSavedLogicalSize,
  logicalSizeFromScale,
  nextScaleFromWheel,
  nextSizeFromHandle,
  positionAfterScale,
  saveLogicalSize,
  scaleFromLogicalSize,
  type Edge,
  type ResizeDir,
  type Size,
} from "./windowSize";

function cssScale(): number {
  return scaleFromLogicalSize(window.innerWidth, window.innerHeight);
}

function isResizeDir(value: string | undefined): value is ResizeDir {
  return (RESIZE_DIRS as readonly string[]).includes(value ?? "");
}

export function useWindowResize(opts: {
  edge: Edge;
  reanchor: () => Promise<void> | void;
  resizingRef: { current: boolean };
}) {
  const edgeRef = useRef(opts.edge);
  edgeRef.current = opts.edge;
  const reanchorRef = useRef(opts.reanchor);
  reanchorRef.current = opts.reanchor;
  const resizingRef = opts.resizingRef;

  const [scale, setScale] = useState(cssScale);
  const handlesRef = useRef<HTMLDivElement>(null);

  const dragRef = useRef<{
    dir: ResizeDir;
    cursor: { x: number; y: number };
    logical: Size;
    origin: { x: number; y: number };
    dpr: number;
  } | null>(null);

  const applyInFlight = useRef(false);
  const pending = useRef<{
    size: Size;
    origin?: { x: number; y: number };
  } | null>(null);

  const applyWindow = useCallback(async (size: Size, origin?: { x: number; y: number }) => {
    pending.current = { size, origin };
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
            new PhysicalPosition(Math.round(next.origin.x), Math.round(next.origin.y)),
          );
        }
        saveLogicalSize(next.size);
      }
    } catch {
      // Window APIs can fail if the webview is closing.
    } finally {
      applyInFlight.current = false;
    }
  }, []);

  useEffect(() => {
    const saved = loadSavedLogicalSize();
    void (async () => {
      if (saved.width !== BASE_WIDTH || saved.height !== BASE_HEIGHT) {
        await applyWindow(saved);
        await reanchorRef.current();
      }
    })();
    const sync = () => setScale(cssScale());
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, [applyWindow]);

  const persistAndReanchor = useCallback(() => {
    saveLogicalSize({
      width: window.innerWidth,
      height: window.innerHeight,
    });
    void reanchorRef.current();
  }, []);

  const onHandlePointerDown = useCallback((event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    const dir = event.currentTarget.dataset.dir;
    if (!isResizeDir(dir)) return;
    event.preventDefault();
    event.stopPropagation();
    resizingRef.current = true;
    dragRef.current = {
      dir,
      cursor: { x: event.screenX, y: event.screenY },
      logical: { width: window.innerWidth, height: window.innerHeight },
      origin: { x: Number.NaN, y: Number.NaN },
      dpr: window.devicePixelRatio || 1,
    };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Capture is best-effort.
    }
    void (async () => {
      try {
        const origin = await getCurrentWindow().outerPosition();
        if (dragRef.current) {
          dragRef.current.origin = { x: origin.x, y: origin.y };
        }
      } catch {
        // Ignore races while the window is closing.
      }
    })();
  }, [resizingRef]);

  const onHandlePointerMove = useCallback(
    (event: PointerEvent<HTMLElement> | globalThis.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || Number.isNaN(drag.origin.x)) return;
      const dx = event.screenX - drag.cursor.x;
      const dy = event.screenY - drag.cursor.y;
      const next = nextSizeFromHandle({
        dir: drag.dir,
        startWidth: drag.logical.width,
        startHeight: drag.logical.height,
        dx,
        dy,
      });
      void applyWindow(
        { width: next.width, height: next.height },
        {
          x: drag.origin.x + next.shiftX * drag.dpr,
          y: drag.origin.y + next.shiftY * drag.dpr,
        },
      );
    },
    [applyWindow],
  );

  const onHandlePointerUp = useCallback(() => {
    if (!dragRef.current) return;
    dragRef.current = null;
    resizingRef.current = false;
    persistAndReanchor();
  }, [persistAndReanchor, resizingRef]);

  const onWheel = useCallback(
    (event: WheelEvent<HTMLElement>) => {
      if (event.deltaY === 0) return;
      event.preventDefault();
      const nextScale = nextScaleFromWheel(cssScale(), event.deltaY);
      const size = logicalSizeFromScale(nextScale);
      if (size.width === window.innerWidth && size.height === window.innerHeight) {
        return;
      }
      resizingRef.current = true;
      void (async () => {
        try {
          const win = getCurrentWindow();
          const [origin, outer] = await Promise.all([
            win.outerPosition(),
            win.outerSize(),
          ]);
          const dpr =
            window.innerWidth > 0
              ? outer.width / window.innerWidth
              : window.devicePixelRatio || 1;
          const planted = positionAfterScale({
            edge: edgeRef.current,
            x: origin.x,
            y: origin.y,
            width: outer.width,
            height: outer.height,
            nextWidth: size.width * dpr,
            nextHeight: size.height * dpr,
          });
          await applyWindow(size, planted);
        } catch {
          await applyWindow(size);
        } finally {
          resizingRef.current = false;
          persistAndReanchor();
        }
      })();
    },
    [applyWindow, persistAndReanchor, resizingRef],
  );

  useEffect(() => {
    const onMove = (event: globalThis.PointerEvent) => onHandlePointerMove(event);
    const onUp = () => onHandlePointerUp();
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [onHandlePointerMove, onHandlePointerUp]);

  return {
    scale,
    resizingRef,
    handlesRef,
    onHandlePointerDown,
    onHandlePointerMove,
    onHandlePointerUp,
    onWheel,
  };
}
