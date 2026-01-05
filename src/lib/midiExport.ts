import { Midi } from "@tonejs/midi";
import type { SongEvents, SongParams } from "./generate";

function beatsToSeconds(beats: number, bpm: number): number {
  return (60 / bpm) * beats;
}

export function downloadMidi(song: SongEvents, params: SongParams, filename: string) {
  const midi = new Midi();
  midi.header.setTempo(params.bpm);

  const tMel = midi.addTrack();
  tMel.name = "Melody";
  tMel.channel = 0;

  const tBass = midi.addTrack();
  tBass.name = "Bass";
  tBass.channel = 1;

  const tDr = midi.addTrack();
  tDr.name = "Drums";
  tDr.channel = 9; // GM drums

  for (const e of song.events) {
    const time = beatsToSeconds(e.timeBeats, params.bpm);
    const duration = beatsToSeconds(e.durationBeats, params.bpm);
    const vel = Math.max(0, Math.min(1, e.velocity));

    if (e.track === "melody" && e.midi != null) {
      tMel.addNote({ midi: e.midi, time, duration, velocity: vel });
    } else if (e.track === "bass" && e.midi != null) {
      tBass.addNote({ midi: e.midi, time, duration, velocity: vel });
    } else if (e.track === "drums") {
      const drumMidi =
        e.drum === "kick" ? 36 :
        e.drum === "snare" ? 38 :
        e.drum === "hat" ? 42 :
        39; // noiseっぽい
      tDr.addNote({ midi: drumMidi, time, duration: Math.min(duration, 0.08), velocity: vel });
    }
  }

  const bytes = midi.toArray();
  const bytesBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const blob = new Blob([bytesBuffer], { type: "audio/midi" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
