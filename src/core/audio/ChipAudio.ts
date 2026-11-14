export type AudioTheme = 'jumper' | 'pop' | 'blade' | 'robot';
export type AudioCue = 'pop' | 'correct' | 'wrong' | 'pick' | 'undo' | 'miss' | 'grab' | 'release' | 'blocked' | 'finish' | 'jump' | 'duck' | 'land' | 'crystal' | 'shield' | 'hit' | 'clear' | 'level';
const SOUND_KEY = 'catspirits.sound.enabled.v1';
const midi = (note: number) => 440 * 2 ** ((note - 69) / 12);
// Original Catspirits motifs, composed for this synthesizer. No borrowed tunes,
// recordings, samples, external audio URLs or decoding work during a hit.
export const AUDIO_THEMES = {
  // Bright, driving synthwave; elastic electro-pop; darker blade techno;
  // optimistic robotic arpeggios. All motifs and arrangements are original.
  jumper: { bpm: 138, root: 45, chords: [0, 5, 8, 7], third: 3, lead: 'sawtooth', bass: [0,-1,0,12,-1,0,7,-1], melody: [12, 7, 15, -1, 19, 15, 14, 7, 12, -1, 19, 24, 20, 19, 15, 14] },
  pop: { bpm: 132, root: 53, chords: [0, 7, 9, 5], third: 4, lead: 'square', bass: [0,-1,12,-1,7,0,-1,12], melody: [12, 16, 19, -1, 21, 19, 14, 7, 12, -1, 16, 24, 21, 19, 16, -1] },
  blade: { bpm: 148, root: 42, chords: [0, 0, 3, 7], third: 3, lead: 'sawtooth', bass: [0,0,12,-1,0,7,0,12], melody: [12, 15, 19, 22, -1, 19, 15, 10, 12, -1, 17, 19, 22, 19, 15, 7] },
  robot: { bpm: 128, root: 50, chords: [0, 5, 9, 7], third: 4, lead: 'triangle', bass: [0,-1,7,12,0,-1,12,7], melody: [12, 19, 16, 24, -1, 21, 19, 14, 16, 12, 19, -1, 24, 21, 19, 16] },
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
  private tone(note: number, time: number, duration: number, volume: number, type: OscillatorType, bus: GainNode, endNote = note, cutoff?: number): void {
    if (this.nodes.size >= 48) return;
    const context = this.context!, oscillator = context.createOscillator(), gain = context.createGain();
    oscillator.type = type; oscillator.frequency.setValueAtTime(midi(note), time);
    oscillator.frequency.exponentialRampToValueAtTime(midi(endNote), time + duration);
    gain.gain.setValueAtTime(.0001, time); gain.gain.exponentialRampToValueAtTime(volume, time + .005);
    gain.gain.exponentialRampToValueAtTime(.0001, time + duration);
    let filter: BiquadFilterNode | undefined;
    if (cutoff) {
      filter=context.createBiquadFilter();filter.type='lowpass';
      filter.frequency.setValueAtTime(cutoff,time);filter.frequency.exponentialRampToValueAtTime(Math.max(180,cutoff*.22),time+duration);
      oscillator.connect(filter);filter.connect(gain);
    } else oscillator.connect(gain);
    gain.connect(bus);this.own(oscillator,()=>{gain.disconnect();filter?.disconnect();});
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
    const theme = AUDIO_THEMES[this.theme], dt = 60 / theme.bpm / 4;
    if (this.nextBeat < this.context.currentTime) this.nextBeat = this.context.currentTime + .01;
    while (this.nextBeat < this.context.currentTime + .10) {
      const step=this.step++%256, beat=step%16, bar=Math.floor(step/16);
      const root=theme.root+theme.chords[bar%4]+(this.theme==='jumper'?Math.min(4,this.level)*2:0), time=this.nextBeat;
      const lift=bar%8>=4, breakdown=bar%16===7, bus=this.music!;
      if(this.musicVolume>0){
        // Four-on-the-floor kick, snare/clap and syncopated hats; a lighter
        // one-bar break gives the next phrase a lift without louder output.
        if(beat%4===0 && (!breakdown || beat===0))this.tone(51,time,.15,.38,'sine',bus,22);
        if(beat%8===4){this.hiss(time,.09,.12,bus);this.tone(46,time,.065,.08,'triangle',bus,32);this.hiss(time+.018,.045,.055,bus);}
        if(beat%2===0 || (lift && beat%4===3))this.hiss(time,beat%4===2?.065:.022,beat%4===2?.052:.025,bus);
        const bass=theme.bass[beat%8];
        if(bass>=0 && !breakdown)this.tone(root-12+bass,time+dt*.10,dt*.78,beat%4===0?.075:.16,'sawtooth',bus,root-12+bass,650+(beat%4)*220);
        if(beat%2===0){
          const note=theme.melody[(Math.floor(step/2)+(bar>=8?4:0))%16];
          if(note>=0){
            const pitch=root+note+(lift && this.theme==='robot'?12:0);
            this.tone(pitch,time,dt*1.35,.075,theme.lead,bus,pitch,2600+(beat%4)*500);
            // Quiet authored echo, not a long-running delay or extra audio file.
            if(lift)this.tone(pitch,time+dt*1.5,dt*.7,.021,'triangle',bus);
          }
        }
        if(beat%4===2 || (lift && beat%2===1))this.tone(root+[12,19,24,12+theme.third][Math.floor(step/2)%4],time,dt*.65,.045,'square',bus,root+[12,19,24,12+theme.third][Math.floor(step/2)%4],1800);
        // Short chord stabs leave space for score/pop feedback and avoid pads
        // or effects accumulating through a long session.
        if(lift && beat%8===2)for(const interval of [0,theme.third,7])this.tone(root+interval,time,dt*2,.028,'sawtooth',bus,root+interval,1400);
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
