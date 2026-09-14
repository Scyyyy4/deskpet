/** Linux WMs drop always-on-top after focus changes; Windows/macOS do not. */
export function needsAlwaysOnTopWatch(ua: string): boolean {
  return /Linux/i.test(ua) && !/Android/i.test(ua);
}
