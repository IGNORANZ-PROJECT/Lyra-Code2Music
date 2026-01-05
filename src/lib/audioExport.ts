import * as Tone from "tone";
import * as lamejs from "lamejs";
import MPEGMode from "lamejs/src/js/MPEGMode.js";
import Lame from "lamejs/src/js/Lame.js";
import BitStream from "lamejs/src/js/BitStream.js";
import Encoder from "lamejs/src/js/Encoder.js";
import Version from "lamejs/src/js/Version.js";
import VBRTag from "lamejs/src/js/VBRTag.js";
import Presets from "lamejs/src/js/Presets.js";
import GainAnalysis from "lamejs/src/js/GainAnalysis.js";
import QuantizePVT from "lamejs/src/js/QuantizePVT.js";
import Quantize from "lamejs/src/js/Quantize.js";
import Takehiro from "lamejs/src/js/Takehiro.js";
import Reservoir from "lamejs/src/js/Reservoir.js";
import type { SongEvents, SongParams, NoteEvent } from "./generate";

function beatsToSeconds(beats: number, bpm: number) {
  return (60 / bpm) * beats;
}

function floatTo16BitPCM(input: Float32Array): Int16Array {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i += 1) {
    const s = Math.max(-1, Math.min(1, input[i]));
    output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return output;
}

function ensureLameGlobals() {
  const g = globalThis as Record<string, unknown>;
  if (!g.MPEGMode) g.MPEGMode = MPEGMode;
  if (!g.Lame) g.Lame = Lame;
  if (!g.BitStream) g.BitStream = BitStream;
  if (!g.Encoder) g.Encoder = Encoder;
  if (!g.Version) g.Version = Version;
  if (!g.VBRTag) g.VBRTag = VBRTag;
  if (!g.Presets) g.Presets = Presets;
  if (!g.GainAnalysis) g.GainAnalysis = GainAnalysis;
  if (!g.QuantizePVT) g.QuantizePVT = QuantizePVT;
  if (!g.Quantize) g.Quantize = Quantize;
  if (!g.Takehiro) g.Takehiro = Takehiro;
  if (!g.Reservoir) g.Reservoir = Reservoir;
}

function encodeMp3(buffer: AudioBuffer, kbps = 128): Blob {
  ensureLameGlobals();
  const channels = Math.min(2, buffer.numberOfChannels || 1);
  const sampleRate = buffer.sampleRate;
  const encoder = new lamejs.Mp3Encoder(channels, sampleRate, kbps);
  const blockSize = 1152;
  const mp3Data: Uint8Array[] = [];

  const left = buffer.getChannelData(0);
  const right = channels > 1 ? buffer.getChannelData(1) : undefined;
  for (let i = 0; i < buffer.length; i += blockSize) {
    const leftChunk = floatTo16BitPCM(left.subarray(i, i + blockSize));
    const rightChunk = right ? floatTo16BitPCM(right.subarray(i, i + blockSize)) : undefined;
    const mp3buf = rightChunk ? encoder.encodeBuffer(leftChunk, rightChunk) : encoder.encodeBuffer(leftChunk);
    if (mp3buf.length > 0) {
      mp3Data.push(mp3buf);
    }
  }

  const end = encoder.flush();
  if (end.length > 0) {
    mp3Data.push(end);
  }

  if (mp3Data.length === 0) {
    throw new Error("MP3エンコード結果が空です。");
  }
  const parts = mp3Data.map(
    (chunk) => chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength) as ArrayBuffer
  );
  return new Blob(parts, { type: "audio/mpeg" });
}

function triggerEvent(
  ev: NoteEvent,
  time: number,
  params: SongParams,
  synths: {
    melody: Tone.PolySynth;
    bass: Tone.PolySynth;
    noise: Tone.NoiseSynth;
  },
  getNoiseTime: (time: number) => number,
  getHatTime: (time: number) => number,
  createHat: () => Tone.MetalSynth
) {
  if (ev.track === "melody" && ev.midi != null) {
    synths.melody.triggerAttackRelease(
      Tone.Frequency(ev.midi, "midi").toFrequency(),
      beatsToSeconds(ev.durationBeats, params.bpm),
      time,
      ev.velocity
    );
  } else if (ev.track === "bass" && ev.midi != null) {
    synths.bass.triggerAttackRelease(
      Tone.Frequency(ev.midi, "midi").toFrequency(),
      beatsToSeconds(ev.durationBeats, params.bpm),
      time,
      ev.velocity
    );
  } else if (ev.track === "drums") {
    if (ev.drum === "kick") {
      synths.bass.triggerAttackRelease(Tone.Frequency(36, "midi").toFrequency(), 0.06, time, ev.velocity);
    } else if (ev.drum === "snare" || ev.drum === "noise") {
      const noiseTime = getNoiseTime(time);
      synths.noise.triggerAttackRelease(0.05, noiseTime, ev.velocity);
    } else if (ev.drum === "hat") {
      const hatTime = getHatTime(time);
      const hat = createHat();
      hat.triggerAttackRelease("16n", hatTime, ev.velocity);
    }
  }
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function downloadChiptuneMp3(song: SongEvents, params: SongParams, filename: string) {
  if (typeof lamejs?.Mp3Encoder !== "function") {
    throw new Error("MP3エンコーダが読み込めませんでした。");
  }
  const durationSeconds = beatsToSeconds(params.bars * 4, params.bpm) + 0.8;
  const buffer = await Tone.Offline(() => {
    let lastNoiseTime = -Infinity;
    const getNoiseTime = (time: number) => {
      const next = time <= lastNoiseTime ? lastNoiseTime + 0.0001 : time;
      lastNoiseTime = next;
      return next;
    };
    let lastHatTime = -Infinity;
    const getHatTime = (time: number) => {
      const next = time <= lastHatTime ? lastHatTime + 0.0001 : time;
      lastHatTime = next;
      return next;
    };
    const melody = new Tone.PolySynth({
      maxPolyphony: 8,
      voice: Tone.Synth,
      options: {
        oscillator: { type: "square" },
        envelope: { attack: 0.001, decay: 0.08, sustain: 0.0, release: 0.05 },
      },
    }).toDestination();

    const bass = new Tone.PolySynth({
      maxPolyphony: 4,
      voice: Tone.Synth,
      options: {
        oscillator: { type: "triangle" },
        envelope: { attack: 0.001, decay: 0.12, sustain: 0.0, release: 0.08 },
      },
    }).toDestination();

    const noise = new Tone.NoiseSynth({
      noise: { type: "white" },
      envelope: { attack: 0.001, decay: 0.06, sustain: 0.0 },
    }).toDestination();

    const createHat = () =>
      new Tone.MetalSynth({
        envelope: { attack: 0.001, decay: 0.03, release: 0.01 },
        harmonicity: 5.1,
        resonance: 4000,
        modulationIndex: 32,
      }).toDestination();

    const events = song.events
      .map((e, index) => ({
        index,
        time: beatsToSeconds(e.timeBeats, params.bpm),
        e,
      }))
      .sort((a, b) => (a.time === b.time ? a.index - b.index : a.time - b.time));

    events.forEach(({ time, e }) => {
      triggerEvent(e, time, params, { melody, bass, noise }, getNoiseTime, getHatTime, createHat);
    });
  }, durationSeconds);

  if (!buffer || buffer.length === 0) {
    throw new Error("オフラインレンダリングに失敗しました。");
  }
  let mp3: Blob;
  try {
    const audioBuffer = buffer.get();
    if (!audioBuffer || audioBuffer.length === 0) {
      throw new Error("オフラインレンダリングに失敗しました。");
    }
    mp3 = encodeMp3(audioBuffer);
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    throw new Error(`MP3エンコードに失敗しました。${detail ? ` (${detail})` : ""}`);
  }
  if (mp3.size === 0) {
    throw new Error("MP3データが空でした。");
  }
  downloadBlob(mp3, filename);
}
