// Original 16-bar festival arrangements. Pitches are semitones above the
// current chord root. A -1 is a rest. A drum pattern runs for one 4/4 bar.
interface FestivalScore {
  bpm: number;
  root: number;
  chords: readonly number[];
  third: number;
  lead: OscillatorType;
  bass: readonly number[];
  melody: readonly number[];
  kick: string;
  snare: string;
  hats: string;
  swing: number;
  bassLength: number;
  cutoff: number;
  answer: readonly number[];
}

export const FESTIVAL_SCORES = {
  // Breakbeat: a syncopated log-drum bass and clipped call-and-response.
  jungle: {
    bpm: 154, root: 40, chords: [0,0,5,7], third: 3, lead: 'square',
    bass: [0,-1,-1,7,0,-1,12,-1,-1,0,3,-1,7,-1,0,-1],
    melody: [12,-1,15,19,-1,14,12,-1,19,22,-1,19,15,-1,14,10],
    kick: 'x.....x...x..x..', snare: '....x.......x...', hats: 'x.xx..x.x.x..xxx',
    swing: .08, bassLength: 1.2, cutoff: 1750, answer: [0,7,12],
  },
  // Half-time liquid bass: long rounded notes leave space to balance the cargo.
  ferry: {
    bpm: 136, root: 38, chords: [0,5,3,7], third: 3, lead: 'sine',
    bass: [0,-1,-1,-1,-1,-1,7,-1,12,-1,-1,-1,7,-1,-1,-1],
    melody: [19,-1,24,-1,22,19,-1,15,17,-1,-1,14,12,-1,19,-1],
    kick: 'x.....x....x....', snare: '........x.......', hats: '..x...x...x..xx.',
    swing: .17, bassLength: 2.7, cutoff: 2800, answer: [7,12,19],
  },
  // Elastic shuffle: walking bass and a two-note, whistled pickup.
  herd: {
    bpm: 126, root: 43, chords: [0,5,0,7], third: 4, lead: 'triangle',
    bass: [0,-1,7,-1,-1,12,-1,7,0,-1,4,-1,7,-1,9,-1],
    melody: [-1,16,19,-1,21,-1,19,16,12,14,-1,16,19,-1,14,12],
    kick: 'x.......x..x....', snare: '....x.......x...', hats: 'x..xx..xx..xx..x',
    swing: .24, bassLength: 1.45, cutoff: 3100, answer: [4,7,16],
  },
  // Mechanical electro: alternating bass octaves and metallic offbeat stabs.
  build: {
    bpm: 132, root: 41, chords: [0,3,5,7], third: 3, lead: 'square',
    bass: [0,-1,12,-1,0,-1,7,12,0,-1,-1,12,7,-1,3,-1],
    melody: [12,19,-1,24,15,19,-1,22,12,17,19,-1,15,14,12,-1],
    kick: 'x...x...x...x...', snare: '....x.......x..x', hats: '..x...x...x...xx',
    swing: 0, bassLength: .9, cutoff: 1300, answer: [0,3,7,12],
  },
  // Bright disco: skipping bass under a spacious rising hook.
  paint: {
    bpm: 128, root: 45, chords: [0,5,2,7], third: 4, lead: 'sawtooth',
    bass: [0,-1,-1,12,-1,-1,7,-1,0,-1,12,-1,-1,4,-1,7],
    melody: [16,-1,19,21,24,-1,19,16,14,-1,16,19,21,19,-1,12],
    kick: 'x...x...x...x...', snare: '....x.......x...', hats: '..x..xx...x..xx.',
    swing: .06, bassLength: 1.45, cutoff: 2600, answer: [0,4,9,16],
  },
  // Fast chase: shifting downbeats and a long ascending lead phrase.
  rover: {
    bpm: 146, root: 39, chords: [0,0,8,7], third: 3, lead: 'sawtooth',
    bass: [0,-1,0,12,-1,0,7,-1,0,12,-1,0,7,-1,12,7],
    melody: [7,12,14,15,-1,19,22,24,19,-1,15,14,12,-1,10,7],
    kick: 'x...x..xx...x...', snare: '....x.......x...', hats: 'x.x.x.x.x.x.x.xx',
    swing: 0, bassLength: .95, cutoff: 2100, answer: [0,7,10,19],
  },
} as const satisfies Record<string, FestivalScore>;

// Beethoven, Symphony No. 5, Op. 67, I, opening. See THIRD-PARTY-NOTICES.
// Absolute MIDI pitch, onset and gate length in eighth notes. Both calls
// start after a rest; the second fermata gets a longer, sub-supported tail.
export const HERD_ENCORE = [
  { pitch: 67, onset: 1, length: .73 },
  { pitch: 67, onset: 2, length: .73 },
  { pitch: 67, onset: 3, length: .73 },
  { pitch: 63, onset: 4, length: 4.5 },
  { pitch: 65, onset: 10, length: .73 },
  { pitch: 65, onset: 11, length: .73 },
  { pitch: 65, onset: 12, length: .73 },
  { pitch: 62, onset: 13, length: 7.25 },
] as const;

export type FestivalTheme = keyof typeof FESTIVAL_SCORES;
export function isFestivalTheme(theme: string): theme is FestivalTheme {
  return Object.prototype.hasOwnProperty.call(FESTIVAL_SCORES, theme);
}
