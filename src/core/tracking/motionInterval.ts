/** Camera cadence for derivatives, wall time for age. Never invent freshness or
 * mix the unrelated clocks of a fused Vision result and a camera observation. */
export function motionInterval(current: {timestampMs:number;mediaTimeMs?:number}, previous?: {timestampMs:number;mediaTimeMs?:number} | null): number {
  if (!previous) return 0;
  const media = current.mediaTimeMs !== undefined && previous.mediaTimeMs !== undefined
    ? current.mediaTimeMs - previous.mediaTimeMs : NaN;
  return Number.isFinite(media) && media > 0 && media <= 150 ? media : current.timestampMs - previous.timestampMs;
}
