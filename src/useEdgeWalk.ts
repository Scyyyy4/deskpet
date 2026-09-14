import { useCallback, useEffect, useRef, useState } from "react";
import { PhysicalPosition } from "@tauri-apps/api/dpi";
import {
  currentMonitor,
  getCurrentWindow,
  monitorFromPoint,
} from "@tauri-apps/api/window";
import {
  alongLimits,
  alongOf,
  directionTowardFarEnd,
  dragThresholdPx,
  facingFor,
  nearestEdge,
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

type Screen = {
  work: Rect;
  scale: number;
  winSize: Size;
};

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
    scale: monitor.scaleFactor,
    winSize: { width: size.width, height: size.height },
  };
}

export function useEdgeWalk(opts: { paused: boolean }) {
  const [pose, setPose] = useState<WalkPose>({
    edge: "bottom",
    facing: "right",
    rotation: 0,
    moving: false,
  });

  const pausedPropRef = useRef(opts.paused);
  pausedPropRef.current = opts.paused;

  const pointerDownRef = useRef(false);
  const settlingRef = useRef(false);
  const ignoreClickRef = useRef(false);
  const dragOriginRef = useRef<{ x: number; y: number } | null>(null);

  const stateRef = useRef({
    edge: "bottom" as Edge,
    x: 0,
    y: 0,
    direction: 1 as Direction,
    turnUntil: 0,
    ready: false,
  });

  const syncPose = useCallback((moving: boolean) => {
    const walk = stateRef.current;
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

  useEffect(() => {
    let cancelled = false;
    let raf = 0;
    let lastTs = 0;
    let stepping = false;
    let inFlight = false;
    let lastApply = { x: Number.NaN, y: Number.NaN };
    let lastScreenRead = 0;
    let screen: Screen | null = null;

    const win = getCurrentWindow();

    async function applyPosition(x: number, y: number) {
      const rx = Math.round(x);
      const ry = Math.round(y);
      if (rx === lastApply.x && ry === lastApply.y) return;
      if (inFlight) return;
      inFlight = true;
      try {
        await win.setPosition(new PhysicalPosition(rx, ry));
        lastApply = { x: rx, y: ry };
      } catch {
        // Window APIs can fail if the webview is closing.
      } finally {
        inFlight = false;
      }
    }

    async function placeOnEdge(
      edge: Edge,
      along: number,
      direction?: Direction,
    ) {
      if (!screen) return;
      const limits = alongLimits(edge, screen.work, screen.winSize);
      const dir =
        direction ?? directionTowardFarEnd(along, limits.min, limits.max);
      const point = pointOnEdge(edge, along, screen.work, screen.winSize);
      stateRef.current.edge = edge;
      stateRef.current.x = point.x;
      stateRef.current.y = point.y;
      stateRef.current.direction = dir;
      stateRef.current.ready = true;
      await applyPosition(point.x, point.y);
    }

    async function step(ts: number) {
      if (cancelled || stepping) return;
      stepping = true;
      try {
        if (!screen || ts - lastScreenRead > 1500) {
          lastScreenRead = ts;
          try {
            screen = await readScreen();
          } catch {
            screen = null;
          }
          if (cancelled) return;
        }
        if (!screen) return;

        if (!stateRef.current.ready) {
          const pos = await win.outerPosition();
          if (cancelled) return;
          stateRef.current.x = pos.x;
          stateRef.current.y = pos.y;
          await placeOnEdge(preferredStartEdge(), pos.x);
          lastTs = ts;
          syncPose(true);
          return;
        }

        const paused =
          pausedPropRef.current ||
          pointerDownRef.current ||
          settlingRef.current;
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
  }, [syncPose]);

  const onPointerDown = useCallback(() => {
    pointerDownRef.current = true;
    settlingRef.current = true;
    ignoreClickRef.current = false;
    dragOriginRef.current = { x: stateRef.current.x, y: stateRef.current.y };
  }, []);

  const onPointerUp = useCallback(() => {
    const wasDown = pointerDownRef.current;
    pointerDownRef.current = false;
    if (!wasDown) return;
    void (async () => {
      try {
        const win = getCurrentWindow();
        const pos = await win.outerPosition();
        const size = await win.outerSize();
        const origin = dragOriginRef.current;
        const monitor =
          (await monitorFromPoint(
            pos.x + size.width / 2,
            pos.y + size.height / 2,
          )) ?? (await currentMonitor());
        const scale = monitor?.scaleFactor ?? 1;
        const moved =
          origin !== null &&
          Math.hypot(pos.x - origin.x, pos.y - origin.y) >=
            dragThresholdPx(scale);
        if (!moved || !monitor) return;

        ignoreClickRef.current = true;
        const work = {
          x: monitor.workArea.position.x,
          y: monitor.workArea.position.y,
          width: monitor.workArea.size.width,
          height: monitor.workArea.size.height,
        };
        const winSize = { width: size.width, height: size.height };
        const winRect = { x: pos.x, y: pos.y, ...winSize };
        const edge = nearestEdge(winRect, work);
        const limits = alongLimits(edge, work, winSize);
        const along = alongOf(edge, pos);
        const point = pointOnEdge(edge, along, work, winSize);
        const direction = directionTowardFarEnd(along, limits.min, limits.max);
        stateRef.current.edge = edge;
        stateRef.current.x = point.x;
        stateRef.current.y = point.y;
        stateRef.current.direction = direction;
        stateRef.current.ready = true;
        stateRef.current.turnUntil = 0;
        await win.setPosition(
          new PhysicalPosition(Math.round(point.x), Math.round(point.y)),
        );
        syncPose(false);
      } catch {
        // Ignore pointer-up races while the window is closing.
      } finally {
        dragOriginRef.current = null;
        settlingRef.current = false;
      }
    })();
  }, [syncPose]);

  useEffect(() => {
    const onUp = () => onPointerUp();
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [onPointerUp]);

  const shouldIgnoreClick = useCallback(() => {
    if (!ignoreClickRef.current) return false;
    ignoreClickRef.current = false;
    return true;
  }, []);

  return { pose, onPointerDown, onPointerUp, shouldIgnoreClick };
}
