import type { AmbientSoundMode } from '../types';

/**
 * 100% Free, Zero-Asset Browser Web Audio API Focus Soundscape & Bell Chime Engine.
 * Synthesizes warm, soothing looping noise textures in memory with zero external MP3 URLs.
 */
class FocusSoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private activeNodes: AudioNode[] = [];
  private activeSources: AudioBufferSourceNode[] = [];
  private currentMode: AmbientSoundMode = 'off';
  private volume = 0.35;

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;

    if (!this.ctx || this.ctx.state === 'closed') {
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.0001, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);
    }

    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => undefined);
    }
    return this.ctx;
  }

  private stopCurrentSources(): void {
    for (const src of this.activeSources) {
      try {
        src.stop();
        src.disconnect();
      } catch {
        // Ignore already stopped source
      }
    }
    for (const node of this.activeNodes) {
      try {
        node.disconnect();
      } catch {
        // Ignore
      }
    }
    this.activeSources = [];
    this.activeNodes = [];
  }

  private createNoiseBuffer(ctx: AudioContext, kind: 'brown' | 'pink', durationSeconds = 6): AudioBuffer {
    const sampleRate = ctx.sampleRate;
    const length = sampleRate * durationSeconds;
    const buffer = ctx.createBuffer(2, length, sampleRate);

    for (let ch = 0; ch < 2; ch++) {
      const output = buffer.getChannelData(ch);
      if (kind === 'brown') {
        let lastOut = 0;
        for (let i = 0; i < length; i++) {
          const white = Math.random() * 2 - 1;
          lastOut = (lastOut + 0.02 * white) / 1.02;
          output[i] = Math.max(-1, Math.min(1, lastOut * 3.2));
        }
      } else {
        // Paul Kellet's warm 7-pole pink noise filter
        let b0 = 0;
        let b1 = 0;
        let b2 = 0;
        let b3 = 0;
        let b4 = 0;
        let b5 = 0;
        let b6 = 0;
        for (let i = 0; i < length; i++) {
          const white = Math.random() * 2 - 1;
          b0 = 0.99886 * b0 + white * 0.0555179;
          b1 = 0.99332 * b1 + white * 0.0750759;
          b2 = 0.96900 * b2 + white * 0.1538520;
          b3 = 0.86650 * b3 + white * 0.3104856;
          b4 = 0.55000 * b4 + white * 0.5329522;
          b5 = -0.7616 * b5 - white * 0.0168980;
          const pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
          b6 = white * 0.115926;
          output[i] = Math.max(-1, Math.min(1, pink * 0.11));
        }
      }

      // Smooth crossfade loop seam over the last 4096 samples so looping is completely click-free
      const fadeSamples = Math.min(4096, Math.floor(length / 10));
      for (let i = 0; i < fadeSamples; i++) {
        const t = i / fadeSamples;
        output[length - fadeSamples + i] =
          output[length - fadeSamples + i] * (1 - t) + output[i] * t;
      }
    }

    return buffer;
  }

  public setMode(mode: AmbientSoundMode, volume?: number): void {
    if (typeof volume === 'number') {
      this.volume = Math.max(0, Math.min(1, volume));
    }

    if (mode === 'off') {
      this.currentMode = 'off';
      if (this.ctx && this.masterGain) {
        const now = this.ctx.currentTime;
        this.masterGain.gain.cancelScheduledValues(now);
        this.masterGain.gain.setTargetAtTime(0.0001, now, 0.08);
      }
      window.setTimeout(() => {
        if (this.currentMode === 'off') {
          this.stopCurrentSources();
        }
      }, 280);
      return;
    }

    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    if (this.currentMode === mode && this.activeSources.length > 0) {
      this.setVolume(this.volume);
      return;
    }

    this.stopCurrentSources();
    this.currentMode = mode;

    if (mode === 'brown') {
      const src = ctx.createBufferSource();
      src.buffer = this.createNoiseBuffer(ctx, 'brown', 6);
      src.loop = true;

      const lowpass = ctx.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.setValueAtTime(340, ctx.currentTime);
      lowpass.Q.setValueAtTime(0.6, ctx.currentTime);

      src.connect(lowpass);
      lowpass.connect(this.masterGain);
      src.start();
      this.activeSources.push(src);
      this.activeNodes.push(lowpass);
    } else if (mode === 'pink') {
      const src = ctx.createBufferSource();
      src.buffer = this.createNoiseBuffer(ctx, 'pink', 6);
      src.loop = true;

      const lowpass = ctx.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.setValueAtTime(1650, ctx.currentTime);
      lowpass.Q.setValueAtTime(0.5, ctx.currentTime);

      const highpass = ctx.createBiquadFilter();
      highpass.type = 'highpass';
      highpass.frequency.setValueAtTime(90, ctx.currentTime);

      src.connect(highpass);
      highpass.connect(lowpass);
      lowpass.connect(this.masterGain);
      src.start();
      this.activeSources.push(src);
      this.activeNodes.push(highpass, lowpass);
    } else if (mode === 'rain') {
      // Layer 1: warm steady rainfall bed (bandpass pink noise)
      const rainBed = ctx.createBufferSource();
      rainBed.buffer = this.createNoiseBuffer(ctx, 'pink', 6);
      rainBed.loop = true;

      const bedFilter = ctx.createBiquadFilter();
      bedFilter.type = 'bandpass';
      bedFilter.frequency.setValueAtTime(950, ctx.currentTime);
      bedFilter.Q.setValueAtTime(0.55, ctx.currentTime);

      const bedGain = ctx.createGain();
      bedGain.gain.setValueAtTime(0.72, ctx.currentTime);

      // Layer 2: distant soft thunder/porch warmth (deep brown bed)
      const warmBed = ctx.createBufferSource();
      warmBed.buffer = this.createNoiseBuffer(ctx, 'brown', 6);
      warmBed.loop = true;

      const warmFilter = ctx.createBiquadFilter();
      warmFilter.type = 'lowpass';
      warmFilter.frequency.setValueAtTime(260, ctx.currentTime);

      const warmGain = ctx.createGain();
      warmGain.gain.setValueAtTime(0.45, ctx.currentTime);

      rainBed.connect(bedFilter);
      bedFilter.connect(bedGain);
      bedGain.connect(this.masterGain);

      warmBed.connect(warmFilter);
      warmFilter.connect(warmGain);
      warmGain.connect(this.masterGain);

      rainBed.start();
      warmBed.start();
      this.activeSources.push(rainBed, warmBed);
      this.activeNodes.push(bedFilter, bedGain, warmFilter, warmGain);
    }

    this.setVolume(this.volume);
  }

  public setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol));
    if (!this.ctx || !this.masterGain || this.currentMode === 'off') return;
    const now = this.ctx.currentTime;
    // Perceptual quadratic curve capped for gentle academic listening
    const targetGain = Math.max(0.0001, this.volume * this.volume * 0.42);
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setTargetAtTime(targetGain, now, 0.06);
  }

  public playWarmBellChime(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      // Warm academic bronze bell triad with soft harmonic overtone decay
      const partials = [
        { freq: 440, start: 0, dur: 0.9, peak: 0.13 }, // A4 fundamental
        { freq: 659.25, start: 0.14, dur: 1.0, peak: 0.11 }, // E5 fifth
        { freq: 880, start: 0.3, dur: 1.35, peak: 0.1 }, // A5 octave resonance
      ];

      for (const p of partials) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(p.freq, now + p.start);
        gain.gain.setValueAtTime(0.0001, now + p.start);
        gain.gain.exponentialRampToValueAtTime(p.peak, now + p.start + 0.025);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + p.start + p.dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + p.start);
        osc.stop(now + p.start + p.dur + 0.05);
      }
    } catch {
      // Ignore autoplay restriction gracefully
    }
  }
}

export const focusSoundEngine = new FocusSoundEngine();
