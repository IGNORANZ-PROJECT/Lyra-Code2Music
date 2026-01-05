import * as Tone from "tone";
import type { SongEvents, SongParams, NoteEvent } from "./generate";

export class ChiptunePlayer {
  private melody?: Tone.PolySynth;
  private bass?: Tone.PolySynth;
  private noise?: Tone.NoiseSynth;
  private hat?: Tone.MetalSynth;
  private mix?: Tone.Gain;
  private analyser?: Tone.Analyser;

  private part?: Tone.Part;
  private loaded = false;
  private onEvent?: (ev: NoteEvent) => void;
  private lastNoiseTime = -Infinity;
  private lastHatTime = -Infinity;

  setOnEvent(callback?: (ev: NoteEvent) => void) {
    this.onEvent = callback;
  }

  private beatsToSeconds(beats: number, bpm: number) {
    return (60 / bpm) * beats;
  }

  getSpectrum() {
    if (!this.analyser) return null;
    const data = this.analyser.getValue();
    if (data instanceof Float32Array) return data;
    const first = data[0];
    if (first instanceof Float32Array) return first;
    return Float32Array.from(first ?? []);
  }

  load(song: SongEvents, params: SongParams) {
    this.disposeAll();
    this.lastNoiseTime = -Infinity;
    this.lastHatTime = -Infinity;

    Tone.Transport.bpm.value = params.bpm;
    Tone.Transport.loop = true;
    Tone.Transport.loopStart = 0;
    Tone.Transport.loopEnd = `${params.bars}m`;

    this.mix = new Tone.Gain(0.9);
    this.analyser = new Tone.Analyser("fft", 128);
    this.mix.connect(this.analyser);
    this.mix.toDestination();

    this.melody = new Tone.PolySynth({
      maxPolyphony: 8,
      voice: Tone.Synth,
      options: {
        oscillator: { type: "square" },
        envelope: { attack: 0.001, decay: 0.08, sustain: 0.0, release: 0.05 },
      },
    }).connect(this.mix);

    this.bass = new Tone.PolySynth({
      maxPolyphony: 4,
      voice: Tone.Synth,
      options: {
        oscillator: { type: "triangle" },
        envelope: { attack: 0.001, decay: 0.12, sustain: 0.0, release: 0.08 },
      },
    }).connect(this.mix);

    this.noise = new Tone.NoiseSynth({
      noise: { type: "white" },
      envelope: { attack: 0.001, decay: 0.06, sustain: 0.0 },
    }).connect(this.mix);

    this.hat = new Tone.MetalSynth({
      envelope: { attack: 0.001, decay: 0.03, release: 0.01 },
      harmonicity: 5.1,
      resonance: 4000,
      modulationIndex: 32,
    }).connect(this.mix);

    const events = song.events.map((e) => ({
      time: this.beatsToSeconds(e.timeBeats, params.bpm),
      e,
    }));

    this.part = new Tone.Part((time, obj: any) => {
      const ev: NoteEvent = obj.e;
      this.onEvent?.(ev);
      if (ev.track === "melody" && ev.midi != null) {
        this.melody!.triggerAttackRelease(
          Tone.Frequency(ev.midi, "midi").toFrequency(),
          this.beatsToSeconds(ev.durationBeats, params.bpm),
          time,
          ev.velocity
        );
      } else if (ev.track === "bass" && ev.midi != null) {
        this.bass!.triggerAttackRelease(
          Tone.Frequency(ev.midi, "midi").toFrequency(),
          this.beatsToSeconds(ev.durationBeats, params.bpm),
          time,
          ev.velocity
        );
      } else if (ev.track === "drums") {
        if (ev.drum === "kick") {
          // 擬似キック：低い三角波を短く
          this.bass!.triggerAttackRelease(Tone.Frequency(36, "midi").toFrequency(), 0.06, time, ev.velocity);
        } else if (ev.drum === "snare" || ev.drum === "noise") {
          const noiseTime = time <= this.lastNoiseTime ? this.lastNoiseTime + 0.0001 : time;
          this.lastNoiseTime = noiseTime;
          this.noise!.triggerAttackRelease(0.05, noiseTime, ev.velocity);
        } else if (ev.drum === "hat") {
          const hatTime = time <= this.lastHatTime ? this.lastHatTime + 0.0001 : time;
          this.lastHatTime = hatTime;
          this.hat!.triggerAttackRelease("16n", hatTime, ev.velocity);
        }
      }
    }, events).start(0);

    this.loaded = true;
  }

  async play() {
    if (!this.loaded) return;
    Tone.Transport.stop();
    Tone.Transport.position = 0;
    Tone.Transport.start();
  }

  async stop() {
    Tone.Transport.stop();
  }

  private disposePart() {
    if (this.part) {
      this.part.dispose();
      this.part = undefined;
    }
  }

  private disposeAll() {
    this.disposePart();
    if (this.melody) {
      this.melody.dispose();
      this.melody = undefined;
    }
    if (this.bass) {
      this.bass.dispose();
      this.bass = undefined;
    }
    if (this.noise) {
      this.noise.dispose();
      this.noise = undefined;
    }
    if (this.hat) {
      this.hat.dispose();
      this.hat = undefined;
    }
    if (this.mix) {
      this.mix.dispose();
      this.mix = undefined;
    }
    if (this.analyser) {
      this.analyser.dispose();
      this.analyser = undefined;
    }
    this.loaded = false;
  }
}
