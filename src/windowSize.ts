export const BASE_WIDTH = 180;
export const BASE_HEIGHT = 200;
export const MIN_SCALE = 0.5;
export const MAX_SCALE = 3;
export const STORAGE_KEY = "deskpet.window-size";
export const WHEEL_SCALE_STEP = 1.08;

/** Compact in-app menu needs at least the default window; smaller pets grow while it is open. */
export const MENU_FIT_SCALE = 1;

export const RESIZE_DIRS = [
  "n",
  "s",
  "e",
  "w",
  "ne",
  "nw",
  "se",
  "sw",
] as const;

export type ResizeDir = (typeof RESIZE_DIRS)[number];

export type Size = { width: number; height: number };
export type Point = { x: number; y: number };
export type Rect = Point & Size;
export type Edge = "bottom" | "top" | "left" | "right";

export function clamp(n: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(max, Math.max(min, n));
}

export function clampScale(scale: number): number {
  return clamp(scale, MIN_SCALE, MAX_SCALE);
}

export function scaleFromLogicalSize(width: number, height: number): number {
  if (!(width > 0) || !(height > 0)) return 1;
  return clampScale(Math.min(width / BASE_WIDTH, height / BASE_HEIGHT));
}

export function logicalSizeFromScale(scale: number): Size {
  const s = clampScale(scale);
  return {
    width: Math.round(BASE_WIDTH * s),
    height: Math.round(BASE_HEIGHT * s),
  };
}

export function parseSavedSize(raw: string | null | undefined): Size | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { width?: unknown; height?: unknown };
    const width = Number(parsed.width);
    const height = Number(parsed.height);
    if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
    if (width <= 0 || height <= 0) return null;
    return logicalSizeFromScale(scaleFromLogicalSize(width, height));
  } catch {
    return null;
  }
}

export function loadSavedLogicalSize(): Size {
  try {
    return parseSavedSize(localStorage.getItem(STORAGE_KEY)) ?? {
      width: BASE_WIDTH,
      height: BASE_HEIGHT,
    };
  } catch {
    return { width: BASE_WIDTH, height: BASE_HEIGHT };
  }
}

export function saveLogicalSize(size: Size): void {
  const next = logicalSizeFromScale(scaleFromLogicalSize(size.width, size.height));
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Quota / private mode — keep the in-session size anyway.
  }
}

function hasNorth(dir: ResizeDir): boolean {
  return dir === "n" || dir === "ne" || dir === "nw";
}

function hasSouth(dir: ResizeDir): boolean {
  return dir === "s" || dir === "se" || dir === "sw";
}

function hasEast(dir: ResizeDir): boolean {
  return dir === "e" || dir === "ne" || dir === "se";
}

function hasWest(dir: ResizeDir): boolean {
  return dir === "w" || dir === "nw" || dir === "sw";
}

function isCorner(dir: ResizeDir): boolean {
  return dir.length === 2;
}

/**
 * Aspect-locked resize. `dx`/`dy` grow the window toward east/south.
 * Origin shift keeps the opposite edges planted.
 */
export function nextSizeFromHandle(input: {
  dir: ResizeDir;
  startWidth: number;
  startHeight: number;
  dx: number;
  dy: number;
}): Size & { shiftX: number; shiftY: number } {
  const startScale = scaleFromLogicalSize(input.startWidth, input.startHeight);
  const fromX = hasEast(input.dir)
    ? (input.startWidth + input.dx) / BASE_WIDTH
    : hasWest(input.dir)
      ? (input.startWidth - input.dx) / BASE_WIDTH
      : startScale;
  const fromY = hasSouth(input.dir)
    ? (input.startHeight + input.dy) / BASE_HEIGHT
    : hasNorth(input.dir)
      ? (input.startHeight - input.dy) / BASE_HEIGHT
      : startScale;

  let scale = startScale;
  if (isCorner(input.dir)) {
    scale =
      Math.abs(fromX - startScale) >= Math.abs(fromY - startScale) ? fromX : fromY;
  } else if (hasEast(input.dir) || hasWest(input.dir)) {
    scale = fromX;
  } else {
    scale = fromY;
  }

  const size = logicalSizeFromScale(scale);
  return {
    ...size,
    shiftX: hasWest(input.dir) ? input.startWidth - size.width : 0,
    shiftY: hasNorth(input.dir) ? input.startHeight - size.height : 0,
  };
}

export function nextScaleFromWheel(scale: number, deltaY: number): number {
  if (deltaY === 0) return clampScale(scale);
  const factor = deltaY > 0 ? 1 / WHEEL_SCALE_STEP : WHEEL_SCALE_STEP;
  return clampScale(scale * factor);
}

export function nextScaleFromNudge(scale: number, direction: 1 | -1): number {
  return nextScaleFromWheel(scale, direction < 0 ? 1 : -1);
}

export function sizeForMenu(current: Size): Size | null {
  const currentScale = scaleFromLogicalSize(current.width, current.height);
  if (currentScale >= MENU_FIT_SCALE) return null;
  return logicalSizeFromScale(MENU_FIT_SCALE);
}

export function wheelShouldScale(input: {
  deltaY: number;
  ctrlKey: boolean;
  metaKey: boolean;
}): boolean {
  return input.deltaY !== 0 && (input.ctrlKey || input.metaKey);
}

/** Keep the walking attach-edge planted while the window grows or shrinks. */
export function positionAfterScale(input: {
  edge: Edge;
  x: number;
  y: number;
  width: number;
  height: number;
  nextWidth: number;
  nextHeight: number;
}): Point {
  const dx = input.width - input.nextWidth;
  const dy = input.height - input.nextHeight;
  switch (input.edge) {
    case "bottom":
      return { x: input.x + dx / 2, y: input.y + dy };
    case "top":
      return { x: input.x + dx / 2, y: input.y };
    case "left":
      return { x: input.x, y: input.y + dy / 2 };
    case "right":
      return { x: input.x + dx, y: input.y + dy / 2 };
  }
}
