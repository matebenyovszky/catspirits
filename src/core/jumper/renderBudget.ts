export const MAX_RENDER_PIXELS = 1920 * 1080;
export function renderPixelRatio(width: number, height: number, deviceRatio: number): number {
  return Math.min(Math.max(0.1, deviceRatio || 1), 1.5, Math.sqrt(MAX_RENDER_PIXELS / (Math.max(1, width) * Math.max(1, height))));
}
