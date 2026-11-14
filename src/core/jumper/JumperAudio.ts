import { ChipAudio } from '../audio/ChipAudio';
import type { JumperEvent } from './JumperSimulation';
export class JumperAudio extends ChipAudio {
  constructor() { super('jumper'); }
  event(event: JumperEvent): void { this.cue(event.type === 'shield' && event.value === -1 ? 'hit' : event.type); }
}
