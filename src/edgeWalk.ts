export type Edge = "bottom" | "top" | "left" | "right";
export type Direction = 1 | -1;
export type Facing = "left" | "right";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

/** Logical pixels per second; multiplied by the monitor scale factor at runtime. */
export const WALK_SPEED_LOGICAL_PER_SEC = 76;

/** Pause at a corner so the sprite can turn around instead of bouncing. */
export const TURN_PAUSE_MS = 220;

export function clamp(n: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(max, Math.max(min, n));
}

export function isHorizontal(edge: Edge): boolean {
  return edge === "top" || edge === "bottom";
}

export function travelBounds(
  work: Rect,
  size: Size,
): { minX: number; maxX: number; minY: number; maxY: number } {
  const minX = work.x;
  const minY = work.y;
  const maxX = work.x + work.width - size.width;
  const maxY = work.y + work.height - size.height;
  return {
    minX,
    minY,
    maxX: Math.max(minX, maxX),
    maxY: Math.max(minY, maxY),
  };
}

export function alongLimits(
  edge: Edge,
  work: Rect,
  size: Size,
): { min: number; max: number } {
  const bounds = travelBounds(work, size);
  return isHorizontal(edge)
    ? { min: bounds.minX, max: bounds.maxX }
    : { min: bounds.minY, max: bounds.maxY };
}

export function alongOf(edge: Edge, point: Point): number {
  return isHorizontal(edge) ? point.x : point.y;
}

export function pointOnEdge(
  edge: Edge,
  along: number,
  work: Rect,
  size: Size,
): Point {
  const bounds = travelBounds(work, size);
  const { min, max } = alongLimits(edge, work, size);
  const clampedAlong = clamp(along, min, max);
  switch (edge) {
    case "bottom":
      return { x: clampedAlong, y: bounds.maxY };
    case "top":
      return { x: clampedAlong, y: bounds.minY };
    case "left":
      return { x: bounds.minX, y: clampedAlong };
    case "right":
      return { x: bounds.maxX, y: clampedAlong };
  }
}

function edgeTieBreak(edge: Edge): number {
  switch (edge) {
    case "bottom":
      return 0;
    case "top":
      return 1;
    case "left":
      return 2;
    case "right":
      return 3;
  }
}

export function distanceToEdge(edge: Edge, win: Rect, work: Rect): number {
  switch (edge) {
    case "top":
      return Math.abs(win.y - work.y);
    case "bottom":
      return Math.abs(win.y + win.height - (work.y + work.height));
    case "left":
      return Math.abs(win.x - work.x);
    case "right":
      return Math.abs(win.x + win.width - (work.x + work.width));
  }
}

/** Closest work-area edge to the window; bottom wins ties (typical desk-pet rest). */
export function nearestEdge(win: Rect, work: Rect): Edge {
  const distances: [Edge, number][] = [
    ["top", distanceToEdge("top", win, work)],
    ["bottom", distanceToEdge("bottom", win, work)],
    ["left", distanceToEdge("left", win, work)],
    ["right", distanceToEdge("right", win, work)],
  ];
  distances.sort(
    (a, b) => a[1] - b[1] || edgeTieBreak(a[0]) - edgeTieBreak(b[0]),
  );
  return distances[0][0];
}

/** Stay on the current edge unless another is clearly closer (avoids resize/drag flip-flops). */
export const EDGE_STICK_PX = 48;

export function nearestEdgeSticky(
  win: Rect,
  work: Rect,
  current: Edge,
  stickPx = EDGE_STICK_PX,
): Edge {
  const next = nearestEdge(win, work);
  if (next === current) return current;
  const nextDist = distanceToEdge(next, win, work);
  const currentDist = distanceToEdge(current, win, work);
  if (nextDist + stickPx < currentDist) return next;
  return current;
}

/** Keep the current edge and along-position; only plant the perpendicular axis. */
export function followEdge(
  edge: Edge,
  pos: Point,
  work: Rect,
  size: Size,
): Point {
  return pointOnEdge(edge, alongOf(edge, pos), work, size);
}

export function attachAfterDrag(
  pos: Point,
  work: Rect,
  winSize: Size,
  currentEdge: Edge,
): { edge: Edge; point: Point; direction: Direction } {
  const winRect = {
    x: pos.x,
    y: pos.y,
    width: winSize.width,
    height: winSize.height,
  };
  const edge = nearestEdgeSticky(winRect, work, currentEdge);
  const limits = alongLimits(edge, work, winSize);
  const along = alongOf(edge, pos);
  return {
    edge,
    point: pointOnEdge(edge, along, work, winSize),
    direction: directionTowardFarEnd(along, limits.min, limits.max),
  };
}

export function almostSamePoint(a: Point, b: Point, eps = 1.5): boolean {
  return Math.abs(a.x - b.x) <= eps && Math.abs(a.y - b.y) <= eps;
}

export function preferredStartEdge(): Edge {
  return "bottom";
}

export function directionTowardFarEnd(
  along: number,
  min: number,
  max: number,
): Direction {
  if (max <= min) return 1;
  return along <= (min + max) / 2 ? 1 : -1;
}

export function stepAlongEdge(input: {
  along: number;
  direction: Direction;
  min: number;
  max: number;
  delta: number;
}): { along: number; direction: Direction; turned: boolean } {
  const { min, max, delta } = input;
  let { along, direction } = input;
  if (max <= min) {
    return { along: min, direction, turned: false };
  }
  along += direction * Math.max(0, delta);
  if (along >= max) {
    return { along: max, direction: -1, turned: true };
  }
  if (along <= min) {
    return { along: min, direction: 1, turned: true };
  }
  return { along, direction, turned: false };
}

export function rotationFor(edge: Edge): number {
  switch (edge) {
    case "bottom":
      return 0;
    case "top":
      return 180;
    case "left":
      return 90;
    case "right":
      return -90;
  }
}

export function facingFor(_edge: Edge, direction: Direction): Facing {
  return direction === 1 ? "right" : "left";
}

/** Physical-pixel drag slop; `scale` is CSS→physical (devicePixelRatio / outer÷inner). */
export function dragThresholdPx(scale: number): number {
  return Math.max(24, 16 * scale);
}

/** Presses longer than this are treated as grabs, not mood-cycle taps. */
export const TAP_MAX_MS = 280;

export function isMoodTap(
  dragged: boolean,
  heldMs: number,
  tapMaxMs = TAP_MAX_MS,
): boolean {
  return !dragged && heldMs >= 0 && heldMs <= tapMaxMs;
}
