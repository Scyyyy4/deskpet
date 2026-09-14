/** CSS pixels → physical pixels from the live window, not a possibly stale DPR. */
export function cssPixelScale(
  outerWidth: number,
  innerWidth: number,
  fallback = 1,
): number {
  if (outerWidth > 0 && innerWidth > 0) return outerWidth / innerWidth;
  return fallback > 0 ? fallback : 1;
}
