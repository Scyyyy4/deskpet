import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { PhysicalPosition } from "@tauri-apps/api/dpi";
import {
  currentMonitor,
  getCurrentWindow,
  monitorFromPoint,
} from "@tauri-apps/api/window";
import { cssPixelScale } from "./dpi";
import {
  alongLimits,
  alongOf,
  almostSamePoint,
  attachAfterDrag,
  directionTowardFarEnd,
  dragThresholdPx,
  facingFor,
  followEdge,
  isMoodTap,
  pointOnEdge,
  preferredStartEdge,
  rotationFor,
  stepAlongEdge,
  TURN_PAUSE_MS,
  WALK_SPEED_LOGICAL_PER_SEC,
  type Direction,
  type Edge,
  type Facing,
  type Rect,
  type Size,
} from "./edgeWalk";

export type WalkPose = {
  edge: Edge;
  facing: Facing;
  rotation: number;
  moving: boolean;
};

export type WalkWindow = {
  x: number;
  y: number;
  ready: boolean;
};

type Screen = {
  work: Rect;
  scale: number;
  winSize: Size;
};

type Point = { x: number; y: number };

async function readScreen(): Promise<Screen | null> {
  const win = getCurrentWindow();
  const size = await win.outerSize();
  const pos = await win.outerPosition();
  const monitor =
    (await monitorFromPoint(
      pos.x + size.width / 2,
      pos.y + size.height / 2,
    )) ?? (await currentMonitor());
  if (!monitor) return null;
  return {
    work: {
      x: monitor.workArea.position.x,
      y: monitor.workArea.position.y,
      width: monitor.workArea.size.width,
      height: monitor.workArea.size.height,
    },
    scale: cssPixelScale(
      size.width,
      typeof window !== "undefined" ? window.innerWidth : 0,
      monitor.scaleFactor,
    ),
    winSize: { width: size.width, height: size.height },
  };
}

export function useEdgeWalk(opts: {
  paused: boolean;
  extraPausedRefs?: Array<{ current: boolean }>;
}) {
  const [pose, setPose] = useState<WalkPose>({
    edge: "bottom",
    facing: "right",
    rotation: 0,
    moving: false,
  });

  const pausedPropRef = useRef(opts.paused);
  pausedPropRef.current = opts.paused;
  const extraPausedRefsRef = useRef(opts.extraPausedRefs);
  extraPausedRefsRef.current = opts.extraPausedRefs;

  const pointerDownRef = useRef(false);
  const draggingRef = useRef(false);
  const interactingRef = useRef(false);
  const ignoreClickRef = useRef(false);
  const downAtRef = useRef(0);
  const scaleRef = useRef(1);
  const movingRef = useRef(false);
  const dragStartRef = useRef<{
    cursor: Point;
    win: Point;
  } | null>(null);

  const stateRef = useRef({
    edge: "bottom" as Edge,
    x: 0,
    y: 0,
    direction: 1 as Direction,
    turnUntil: 0,
    ready: false,
  });
  const positionRef = useRef<WalkWindow>({ x: 0, y: 0, ready: false });

  const lastApplyRef = useRef<Point>({ x: Number.NaN, y: Number.NaN });
  const inFlightRef = useRef(false);
  const pendingRef = useRef<Point | null>(null);
  const screenEpochRef = useRef(0);

  const publishPosition = useCallback(() => {
    const walk = stateRef.current;
    positionRef.current = { x: walk.x, y: walk.y, ready: walk.ready };
  }, []);

  const syncPose = useCallback((moving: boolean) => {
    const walk = stateRef.current;
    movingRef.current = moving;
    const facing = facingFor(walk.edge, walk.direction);
    const rotation = rotationFor(walk.edge);
    setPose((prev) => {
      if (
        prev.edge === walk.edge &&
        prev.facing === facing &&
        prev.rotation === rotation &&
        prev.moving === moving
      ) {
        return prev;
      }
      return { edge: walk.edge, facing, rotation, moving };
    });
  }, []);

  const applyPosition = useCallback(
    async (x: number, y: number) => {
      const rx = Math.round(x);
      const ry = Math.round(y);
      if (rx === lastApplyRef.current.x && ry === lastApplyRef.current.y) return;
      pendingRef.current = { x: rx, y: ry };
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        while (pendingRef.current) {
          const next = pendingRef.current;
          pendingRef.current = null;
          lastApplyRef.current = next;
          await getCurrentWindow().setPosition(
            new PhysicalPosition(next.x, next.y),
          );
        }
      } catch {
        // Window APIs can fail if the webview is closing.
      } finally {
        inFlightRef.current = false;
      }
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    let raf = 0;
    let lastTs = 0;
    let stepping = false;
    let lastScreenRead = 0;
    let lastEpoch = screenEpochRef.current;
    let screen: Screen | null = null;
    let lastWinSize = { width: 0, height: 0 };

    const win = getCurrentWindow();

    async function placeOnEdge(edge: Edge, along: number) {
      if (!screen) return;
      const limits = alongLimits(edge, screen.work, screen.winSize);
      const direction = directionTowardFarEnd(along, limits.min, limits.max);
      const point = pointOnEdge(edge, along, screen.work, screen.winSize);
      stateRef.current.edge = edge;
      stateRef.current.x = point.x;
      stateRef.current.y = point.y;
      stateRef.current.direction = direction;
      stateRef.current.ready = true;
      stateRef.current.turnUntil = 0;
      publishPosition();
      await applyPosition(point.x, point.y);
    }

    async function plantCurrentEdge() {
      if (!screen || !stateRef.current.ready) return;
      const walk = stateRef.current;
      const planted = followEdge(walk.edge, walk, screen.work, screen.winSize);
      if (almostSamePoint(planted, walk)) return;
      walk.x = planted.x;
      walk.y = planted.y;
      publishPosition();
      await applyPosition(planted.x, planted.y);
    }

    async function step(ts: number) {
      if (cancelled || stepping) return;
      stepping = true;
      try {
        const epoch = screenEpochRef.current;
        if (!screen || ts - lastScreenRead > 1500 || epoch !== lastEpoch) {
          lastScreenRead = ts;
          lastEpoch = epoch;
          try {
            screen = await readScreen();
            if (screen) scaleRef.current = screen.scale;
          } catch {
            screen = null;
          }
          if (cancelled) return;
          if (
            screen &&
            (screen.winSize.width !== lastWinSize.width ||
              screen.winSize.height !== lastWinSize.height)
          ) {
            lastWinSize = screen.winSize;
            await plantCurrentEdge();
            if (cancelled) return;
          }
        }
        if (!screen) return;

        if (!stateRef.current.ready) {
          const pos = await win.outerPosition();
          if (cancelled) return;
          await placeOnEdge(preferredStartEdge(), pos.x);
          lastTs = ts;
          syncPose(true);
          return;
        }

        const paused =
          pausedPropRef.current ||
          extraPausedRefsRef.current?.some((ref) => ref.current) ||
          pointerDownRef.current ||
          draggingRef.current;
        if (paused) {
          lastTs = ts;
          syncPose(false);
          return;
        }

        const dt = lastTs ? Math.min(0.05, (ts - lastTs) / 1000) : 0;
        lastTs = ts;

        if (ts < stateRef.current.turnUntil) {
          syncPose(false);
          return;
        }

        const walk = stateRef.current;
        const limits = alongLimits(walk.edge, screen.work, screen.winSize);
        const delta = WALK_SPEED_LOGICAL_PER_SEC * screen.scale * dt;
        const stepped = stepAlongEdge({
          along: alongOf(walk.edge, walk),
          direction: walk.direction,
          min: limits.min,
          max: limits.max,
          delta,
        });
        const point = pointOnEdge(
          walk.edge,
          stepped.along,
          screen.work,
          screen.winSize,
        );
        walk.x = point.x;
        walk.y = point.y;
        walk.direction = stepped.direction;
        if (stepped.turned) {
          walk.turnUntil = ts + TURN_PAUSE_MS;
        }
        publishPosition();
        syncPose(true);
        await applyPosition(walk.x, walk.y);
      } finally {
        stepping = false;
      }
    }

    const loop = (ts: number) => {
      if (cancelled) return;
      raf = requestAnimationFrame(loop);
      void step(ts);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [applyPosition, publishPosition, syncPose]);

  const onPointerDown = useCallback((event: PointerEvent) => {
    if (event.button !== 0) return;
    pointerDownRef.current = true;
    interactingRef.current = true;
    draggingRef.current = false;
    ignoreClickRef.current = false;
    downAtRef.current = performance.now();
    dragStartRef.current = {
      cursor: { x: event.screenX, y: event.screenY },
      win: { x: stateRef.current.x, y: stateRef.current.y },
    };
    try {
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    } catch {
      // Capture is best-effort; window-level move listeners still work.
    }
  }, []);

  const onPointerMove = useCallback(
    (event: PointerEvent) => {
      if (!pointerDownRef.current || !dragStartRef.current) return;
      const start = dragStartRef.current;
      const scale = scaleRef.current || window.devicePixelRatio || 1;
      const dx = (event.screenX - start.cursor.x) * scale;
      const dy = (event.screenY - start.cursor.y) * scale;
      if (!draggingRef.current && Math.hypot(dx, dy) < dragThresholdPx(scale)) {
        return;
      }
      draggingRef.current = true;
      ignoreClickRef.current = true;
      const next = { x: start.win.x + dx, y: start.win.y + dy };
      stateRef.current.x = next.x;
      stateRef.current.y = next.y;
      publishPosition();
      void applyPosition(next.x, next.y);
    },
    [applyPosition, publishPosition],
  );

  const onPointerUp = useCallback(() => {
    const wasDragging = draggingRef.current;
    pointerDownRef.current = false;
    interactingRef.current = false;
    draggingRef.current = false;
    dragStartRef.current = null;
    if (!wasDragging) {
      syncPose(false);
      return;
    }
    void (async () => {
      try {
        const screen = await readScreen();
        if (!screen) return;
        const attached = attachAfterDrag(
          { x: stateRef.current.x, y: stateRef.current.y },
          screen.work,
          screen.winSize,
          stateRef.current.edge,
        );
        stateRef.current.edge = attached.edge;
        stateRef.current.x = attached.point.x;
        stateRef.current.y = attached.point.y;
        stateRef.current.direction = attached.direction;
        stateRef.current.ready = true;
        stateRef.current.turnUntil = 0;
        publishPosition();
        if (
          !almostSamePoint(
            attached.point,
            { x: lastApplyRef.current.x, y: lastApplyRef.current.y },
            1.5,
          )
        ) {
          await applyPosition(attached.point.x, attached.point.y);
        }
        syncPose(false);
      } catch {
        // Ignore pointer-up races while the window is closing.
      }
    })();
  }, [applyPosition, publishPosition, syncPose]);

  const shouldIgnoreClick = useCallback(() => {
    const dragged = ignoreClickRef.current;
    ignoreClickRef.current = false;
    const heldMs = performance.now() - downAtRef.current;
    return !isMoodTap(dragged, heldMs);
  }, []);

  useEffect(() => {
    const onResize = () => {
      screenEpochRef.current += 1;
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const onMove = (event: globalThis.PointerEvent) => {
      if (!pointerDownRef.current || !dragStartRef.current) return;
      const start = dragStartRef.current;
      const scale = scaleRef.current || window.devicePixelRatio || 1;
      const dx = (event.screenX - start.cursor.x) * scale;
      const dy = (event.screenY - start.cursor.y) * scale;
      if (!draggingRef.current && Math.hypot(dx, dy) < dragThresholdPx(scale)) {
        return;
      }
      draggingRef.current = true;
      ignoreClickRef.current = true;
      const next = { x: start.win.x + dx, y: start.win.y + dy };
      stateRef.current.x = next.x;
      stateRef.current.y = next.y;
      publishPosition();
      void applyPosition(next.x, next.y);
    };
    const onUp = () => onPointerUp();
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [applyPosition, onPointerUp, publishPosition]);

  return {
    pose,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    shouldIgnoreClick,
    interactingRef,
    movingRef,
    positionRef,
  };
}
