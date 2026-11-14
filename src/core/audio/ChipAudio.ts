export type AudioTheme = 'jumper' | 'pop' | 'blade' | 'robot';
export type AudioCue = 'pop' | 'correct' | 'wrong' | 'pick' | 'undo' | 'miss' | 'grab' | 'release' | 'blocked' | 'finish' | 'jump' | 'duck' | 'land' | 'crystal' | 'shield' | 'hit' | 'clear' | 'level';
const SOUND_KEY = 'catspirits.sound.enabled.v1';
const midi = (note: number) => 440 * 2 ** ((note - 69) / 12);
// Original Catspirits motifs, composed for this synthesizer. No borrowed tunes,
// recordings, samples, external audio URLs or decoding work during a hit.
const THEMES = {
  jumper: { bpm: 124, root: 48, melody: [12, 7, 16, -1, 19, 16, 14, 7, 12, -1, 19, 24, 21, 19, 16, -1] },
  pop: { bpm: 112, root: 53, melody: [12, -1, 19, 16, 14, 7, 12, -1, 21, 19, -1, 16, 14, 19, 12, -1] },
  blade: { bpm: 136, root: 45, melody: [12, 15, 19, -1, 22, 19, 15, 10, 12, -1, 17, 19, 15, 10, 7, -1] },
  robot: { bpm: 100, root: 50, melody: [12, -1, 16, 19, -1, 14, 9, -1, 16, 12, -1, 21, 19, -1, 14, 7] },
} as const;

/** One lazy Web Audio context, short lookahead and bounded voices per game.
 * Muting stops synthesis, not just the output gain. A pending resume cannot
 * restart music after pause, backgrounding, mute or disposal. */
export class ChipAudio {
  private context: AudioContext | null = null;
  private music: GainNode | null = null;
  private effects: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private noise: AudioBuffer | null = null;
  private nodes = new Set<AudioScheduledSourceNode>();
  private timer?: ReturnType<typeof setInterval>;
  private wanted = false;
  private active = false;
  private disposed = false;
  private revision = 0;
  private nextBeat = 0;
  private step = 0;
  private level = 0;
  private musicVolume = .45;
  private effectsVolume = .7;
  private scheduledNotes = 0;
  private variations = new Map<AudioCue, number>();
  private lastCue = new Map<AudioCue, number>();
  enabled = true;
  onEnabledChange?: () => void;
  constructor(private theme: AudioTheme = 'pop') {
    try { this.enabled = localStorage.getItem(SOUND_KEY) !== 'off'; } catch { /* Optional preference. */ }
  }
  async unlock(): Promise<void> {
    if (this.disposed || !this.enabled || document.hidden) return;
    const revision = this.revision;
    try {
      if (!this.context) {
        const Context = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Context) return;
        const context = this.context = new Context();
        this.music = context.createGain(); this.effects = context.createGain();
        const compressor = context.createDynamicsCompressor(); compressor.threshold.value = -18; compressor.ratio.value = 6;
        this.analyser = context.createAnalyser(); this.analyser.fftSize = 256;
        this.music.connect(compressor); this.effects.connect(compressor); compressor.connect(this.analyser); this.analyser.connect(context.destination);
        this.noise = context.createBuffer(1, Math.ceil(context.sampleRate * .12), context.sampleRate);
        const data = this.noise.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        this.setVolumes(this.musicVolume, this.effectsVolume);
      }
      await this.context.resume();
      if (this.disposed || !this.enabled || document.hidden || revision !== this.revision) { if (!this.wanted || !this.enabled || document.hidden) void this.context.suspend().catch(() => {}); return; }
      if (this.wanted) this.start();
    } catch { /* Missing/blocked audio must never stop a game or camera start. */ }
  }
  setEnabled(enabled: boolean): void {
    this.revision++; this.enabled = enabled;
    try { localStorage.setItem(SOUND_KEY, enabled ? 'on' : 'off'); } catch { /* Optional preference. */ }
    if (enabled) void this.unlock();
    else { this.halt(); void this.context?.suspend().catch(() => {}); }
    this.onEnabledChange?.();
  }
  setVolumes(music: number, effects: number): void {
    this.musicVolume = Number.isFinite(music) ? Math.max(0, Math.min(1, music)) : 0;
    this.effectsVolume = Number.isFinite(effects) ? Math.max(0, Math.min(1, effects)) : 0;
    if (this.context) {
      this.music?.gain.setTargetAtTime(this.musicVolume * .32, this.context.currentTime, .03);
      this.effects?.gain.setTargetAtTime(this.effectsVolume * .4, this.context.currentTime, .03);
    }
  }
  play(level = 0): void {
    const changed = level !== this.level; this.level = level; this.wanted = true;
    if (changed) this.halt();
    this.start();
  }
  private start(): void {
    if (this.active || !this.wanted || !this.enabled || this.disposed || document.hidden || this.context?.state !== 'running') return;
    this.active = true; this.step = 0; this.nextBeat = this.context.currentTime + .025;
    this.timer = setInterval(() => this.schedule(), 25); this.schedule();
  }
  private halt(): void {
    this.active = false; clearInterval(this.timer); this.timer = undefined;
    for (const node of this.nodes) { try { node.stop(); } catch { /* Already ended. */ } }
    this.nodes.clear();
  }
  stop(): void { this.wanted = false; this.halt(); }
  sleep(): void { this.revision++; this.stop(); void this.context?.suspend().catch(() => {}); }
  private own(node: AudioScheduledSourceNode, cleanup: () => void): void {
    this.nodes.add(node); this.scheduledNotes++;
    node.addEventListener('ended', () => { this.nodes.delete(node); node.disconnect(); cleanup(); }, { once: true });
  }
  private tone(note: number, time: number, duration: number, volume: number, type: OscillatorType, bus: GainNode, endNote = note): void {
    if (this.nodes.size >= 48) return;
    const context = this.context!, oscillator = context.createOscillator(), gain = context.createGain();
    oscillator.type = type; oscillator.frequency.setValueAtTime(midi(note), time);
    oscillator.frequency.exponentialRampToValueAtTime(midi(endNote), time + duration);
    gain.gain.setValueAtTime(.0001, time); gain.gain.exponentialRampToValueAtTime(volume, time + .005);
    gain.gain.exponentialRampToValueAtTime(.0001, time + duration);
    oscillator.connect(gain); gain.connect(bus); this.own(oscillator, () => gain.disconnect());
    oscillator.start(time); oscillator.stop(time + duration + .015);
  }
  private hiss(time: number, duration: number, volume: number, bus: GainNode): void {
    if (this.nodes.size >= 48) return;
    const context = this.context!, source = context.createBufferSource(), filter = context.createBiquadFilter(), gain = context.createGain();
    source.buffer = this.noise; filter.type = 'highpass'; filter.frequency.value = 2200;
    gain.gain.setValueAtTime(volume, time); gain.gain.exponentialRampToValueAtTime(.0001, time + duration);
    source.connect(filter); filter.connect(gain); gain.connect(bus);
    this.own(source, () => { filter.disconnect(); gain.disconnect(); }); source.start(time); source.stop(time + duration);
  }
  private schedule(): void {
    if (!this.active || !this.context) return;
    if (document.hidden) { this.sleep(); return; }
    const theme = THEMES[this.theme], dt = 60 / (this.theme === 'pop' && this.level >= 3 ? 98 : theme.bpm) / 4;
    if (this.nextBeat < this.context.currentTime) this.nextBeat = this.context.currentTime + .01;
    while (this.nextBeat < this.context.currentTime + .10) {
      const step = this.step++ % 128, bar = Math.floor(step / 16), root = theme.root + [0, 5, 7, 0][bar % 4] + (this.theme === 'jumper' ? this.level * 2 : 0), time = this.nextBeat;
      if (this.musicVolume > 0) {
        if (step % 4 === 0) { this.tone(root - 12, time, dt * 2.5, .20, 'triangle', this.music!); this.tone(47, time, .09, .12, 'sine', this.music!, 24); }
        if (step % 8 === 4) this.hiss(time, .08, .08, this.music!);
        if (step % 2 === 0) {
          this.hiss(time, .025, .025, this.music!);
          const note = theme.melody[(Math.floor(step / 2) + (bar >= 4 ? 4 : 0)) % 16];
          if (note >= 0) this.tone(root + note, time, dt * 1.4, .055, 'square', this.music!);
        }
        if (step % 4 === 2) this.tone(root + [0, 7, 12, 7][Math.floor(step / 4) % 4], time, dt * .8, .05, 'triangle', this.music!);
      }
      this.nextBeat += dt;
    }
  }
  cue(cue: AudioCue): void {
    if (!this.enabled || this.disposed || document.hidden || this.context?.state !== 'running' || !this.effects || !this.effectsVolume) return;
    const time = this.context.currentTime;
    if (time - (this.lastCue.get(cue) ?? -Infinity) < .07) return;
    this.lastCue.set(cue, time);
    const variant = (this.variations.get(cue) ?? 0) % 4; this.variations.set(cue, variant + 1);
    const n = [0, 3, 7, 5][variant];
    const play = (notes: number[], type: OscillatorType = 'square', duration = .10) => notes.forEach((note, i) => this.tone(note, time + i * .055, duration, .13, type, this.effects!));
    switch (cue) {
      case 'wrong': case 'hit': case 'blocked':
        play([52 + variant, 46 + variant, 40 + variant], 'sawtooth', .09); break;
      case 'miss': play([58 + n, 46 + n], 'triangle', .07); break;
      case 'correct': case 'clear': play([72 + n, 76 + n, 79 + n, 84 + n]); this.hiss(time, .035, .13, this.effects); break;
      case 'level': case 'finish': play([72, 76, 79, 84, 79, 88], 'square', .16); break;
      case 'jump': this.tone(60 + n, time, .12, .16, 'square', this.effects, 84 + n); break;
      case 'duck': case 'release': case 'undo': this.tone(79 + n, time, .13, .12, 'triangle', this.effects, 48 + n); break;
      case 'land': play([38 + variant], 'triangle', .05); break;
      case 'shield': case 'crystal': play([84 + n, 91 + n], 'square', .12); break;
      case 'pick': case 'grab': play([65 + n, 72 + n], 'square', .07); break;
      case 'pop':
        this.tone(89 + n, time, .10, .17, variant % 2 ? 'square' : 'triangle', this.effects, 43 + n);
        this.tone(72 + n, time + .035, .09, .09, 'square', this.effects, 84 + n);
        this.hiss(time, .045, .11, this.effects); break;
    }
  }
  snapshot() {
    const samples = new Uint8Array(this.analyser?.fftSize ?? 256); this.analyser?.getByteTimeDomainData(samples);
    return { state: this.context?.state ?? 'uninitialized', enabled: this.enabled, active: this.active, voices: this.nodes.size,
      scheduledNotes: this.scheduledNotes, level: this.level, peak: this.analyser && this.context?.state === 'running' ? Math.max(...samples.map(value => Math.abs(value - 128))) / 128 : 0 };
  }
  dispose(): void { this.disposed = true; this.sleep(); this.onEnabledChange = undefined; void this.context?.close().catch(() => {}); }
}
