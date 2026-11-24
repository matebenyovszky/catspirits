export type FestivalId = 'jungle' | 'ferry' | 'herd' | 'build' | 'paint' | 'rover';
export type FestivalInput = { x: number; y: number; angle: number; action: boolean; beatPhase?: number };
export type FestivalCue = 'correct' | 'wrong' | 'grab' | null;
export interface FestivalGame {
  score: number;
  won: boolean;
  lost: boolean;
  update(dt: number, input: FestivalInput): FestivalCue;
  draw(ctx: CanvasRenderingContext2D, width: number, height: number): void;
}
