import { validHands, type HandFrame } from '../pop/HandInput';
import { reachable, type Point } from './RobotSimulation';
/** Lock one wrist for a session: losing it must never switch to the other hand. */
export class RobotHandInput {
  private id: 'left' | 'right' | null = null;
  reset(): void { this.id = null; }
  point(frame: HandFrame | null, now: number): Point | null {
    if (!frame || !validHands(frame, now)) return null;
    if (!this.id) this.id = frame.hands.find(h => h.id === 'right')?.id ?? frame.hands[0].id;
    const hand = frame.hands.find(h => h.id === this.id);
    return hand ? reachable({ x: .10 + (1 - hand.x) * .80, y: .17 + hand.y * .61 }) : null;
  }
}
