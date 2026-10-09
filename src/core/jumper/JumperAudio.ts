import { WORLDS, type JumperEvent } from './JumperSimulation';

const midi = (note: number) => 440 * 2 ** ((note - 69) / 12);

/** Original, synthesized soundtrack: no downloads or third-party audio assets. */
export class JumperAudio {
  private context: AudioContext | null = null;
  private music: GainNode | null = null;
  private effects: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private timer?: ReturnType<typeof setInterval>;
  private nextBeat = 0;
  private step = 0;
  private level = 0;
  private active = false;
  private noise: AudioBuffer | null = null;
  private musicVolume = .55;
  private effectsVolume = .75;
  private scheduledNotes = 0;
  private nodes = new Set<AudioScheduledSourceNode>();

  async unlock(): Promise<void> {
    if (!this.context) {
      const Context = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Context) return;
      this.context = new Context();
      this.music = this.context.createGain(); this.effects = this.context.createGain();
      const compressor = this.context.createDynamicsCompressor();
      compressor.threshold.value = -18; compressor.ratio.value = 5;
      this.analyser = this.context.createAnalyser(); this.analyser.fftSize = 256;
      this.music.connect(compressor); this.effects.connect(compressor);
      compressor.connect(this.analyser); this.analyser.connect(this.context.destination);
      this.noise = this.context.createBuffer(1, this.context.sampleRate * .2, this.context.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.setVolumes(this.musicVolume, this.effectsVolume);
    }
    try { await this.context.resume(); } catch { /* Game remains playable with blocked audio. */ }
  }

  setVolumes(music: number, effects: number): void {
    this.musicVolume = music; this.effectsVolume = effects;
    if (this.context) {
      this.music?.gain.setTargetAtTime(music * .42, this.context.currentTime, .04);
      this.effects?.gain.setTargetAtTime(effects * .5, this.context.currentTime, .04);
    }
  }

  play(level: number): void {
    if (!this.context) return;
    if (this.active && level === this.level) return;
    this.stop(); this.level = level; this.active = true; this.step = 0;
    this.nextBeat = this.context.currentTime + .04;
    this.timer = setInterval(() => this.schedule(), 25); this.schedule();
  }

  stop(): void {
    this.active = false; clearInterval(this.timer); this.timer = undefined;
    // Stop both sounding and look-ahead-scheduled notes on pause or a world change.
    for (const node of this.nodes) { try { node.stop(); } catch { /* already ended */ } }
    this.nodes.clear();
  }

  /** Release the browser audio thread while the page is in the background. */
  sleep(): void {
    this.stop();
    void this.context?.suspend().catch(() => { /* Audio may already be closed. */ });
  }

  private own(node: AudioScheduledSourceNode): void {
    this.nodes.add(node); this.scheduledNotes++;
    node.addEventListener('ended', () => { this.nodes.delete(node); node.disconnect(); }, { once: true });
  }

  private tone(note: number, time: number, duration: number, volume: number, type: OscillatorType, bus: GainNode): void {
    const context = this.context!;
    const oscillator = context.createOscillator(), gain = context.createGain();
    oscillator.type = type; oscillator.frequency.setValueAtTime(midi(note), time);
    gain.gain.setValueAtTime(.0001, time); gain.gain.exponentialRampToValueAtTime(volume, time + .012);
    gain.gain.exponentialRampToValueAtTime(.0001, time + duration);
    oscillator.connect(gain); gain.connect(bus); this.own(oscillator);
    oscillator.addEventListener('ended', () => gain.disconnect(), { once: true });
    oscillator.start(time); oscillator.stop(time + duration + .02);
  }

  private percussion(time: number, kick: boolean, snare = false): void {
    const context = this.context!, gain = context.createGain();
    gain.connect(this.music!);
    const duration = kick ? .18 : snare ? .13 : .035;
    gain.gain.setValueAtTime(kick ? .65 : snare ? .16 : .06, time);
    gain.gain.exponentialRampToValueAtTime(.0001, time + duration);
    if (kick) {
      const oscillator = context.createOscillator(); oscillator.frequency.setValueAtTime(130, time);
      oscillator.frequency.exponentialRampToValueAtTime(42, time + .13);
      oscillator.connect(gain); this.own(oscillator); oscillator.start(time); oscillator.stop(time + duration);
      oscillator.addEventListener('ended', () => gain.disconnect(), { once: true });
    } else {
      const source = context.createBufferSource(), filter = context.createBiquadFilter();
      source.buffer = this.noise; filter.type = 'highpass'; filter.frequency.value = snare ? 1200 : 7000;
      source.connect(filter); filter.connect(gain); this.own(source); source.start(time); source.stop(time + duration);
      source.addEventListener('ended', () => { filter.disconnect(); gain.disconnect(); }, { once: true });
    }
  }

  private schedule(): void {
    if (!this.active || !this.context) return;
    const world = WORLDS[this.level], stepTime = 60 / world.tempo / 4;
    if (this.nextBeat < this.context.currentTime) this.nextBeat = this.context.currentTime + .01;
    while (this.nextBeat < this.context.currentTime + .12) {
      const step = this.step % 64, chord = [0, 5, 7, 3][Math.floor(step / 16)], root = world.root + chord;
      if (step % 4 === 0) this.percussion(this.nextBeat, true);
      if (step % 8 === 4) this.percussion(this.nextBeat, false, true);
      if (step % 2 === 0) this.percussion(this.nextBeat, false);
      if (step % 4 === 0) this.tone(root - 12, this.nextBeat, stepTime * 2.5, .18, 'triangle', this.music!);
      const arpeggio = [0, 7, 12, 16, 19, 16, 12, 7];
      if (step % 2 === 0) this.tone(root + arpeggio[(step / 2 + this.level) % 8], this.nextBeat, stepTime * 1.7, .08, 'sine', this.music!);
      if (step % 16 === 0) [0, 4, 7].forEach(note => this.tone(root + note, this.nextBeat, stepTime * 15, .026, 'triangle', this.music!));
      this.step++; this.nextBeat += stepTime;
    }
  }

  event(event: JumperEvent): void {
    if (!this.context || !this.effects) return;
    const time = this.context.currentTime;
    const notes: Record<JumperEvent['type'], number[]> = {
      jump: [67, 79], duck: [67, 55], land: [43], crystal: [84, 91], shield: event.value === -1 ? [72, 60] : [72, 79, 84],
      hit: [48, 43], clear: [76, 79, 84], level: [72, 76, 79, 84, 88], finish: [72, 76, 79, 84, 88, 91, 96],
    };
    notes[event.type].forEach((note, index) => this.tone(note, time + index * .065, event.type === 'land' ? .08 : .19,
      event.type === 'land' ? .07 : .16, event.type === 'hit' ? 'triangle' : 'sine', this.effects!));
  }

  snapshot() {
    const samples = new Uint8Array(this.analyser?.fftSize ?? 256);
    this.analyser?.getByteTimeDomainData(samples);
    return { state: this.context?.state ?? 'uninitialized', active: this.active, scheduledNotes: this.scheduledNotes,
      level: this.level, peak: this.analyser ? Math.max(...samples.map(value => Math.abs(value - 128))) / 128 : 0 };
  }
  dispose(): void { this.stop(); void this.context?.close(); }
}
