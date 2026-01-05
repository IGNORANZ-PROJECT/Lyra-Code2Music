import React, { useEffect, useMemo, useRef, useState } from "react";
import * as Tone from "tone";
import { detectLanguageFromFilename, type SupportedLang, SUPPORTED_LANGS } from "./lib/lang";
import { tokenize, type Token } from "./lib/tokenize";
import { generateSongEvents, type SongEvents, type SongParams, type PlayMode } from "./lib/generate";
import { ChiptunePlayer } from "./lib/chiptunePlayer";
import { downloadMidi } from "./lib/midiExport";
import { downloadChiptuneMp3 } from "./lib/audioExport";

const DEFAULT_PARAMS: SongParams = {
  seed: "lyra",
  bars: 8,
  bpm: 140,
  keyRootMidi: 60, // C4
  scale: "minorPentatonic",
};

const STORAGE_LAST_LANG = "lyra:lastLang";
const STORAGE_APP_STATE = "lyra:appState";
const DEFAULT_LANG: SupportedLang = "python";

const EXT_BY_LANG: Record<SupportedLang, string> = {
  python: "py",
  c: "c",
  cpp: "cpp",
  java: "java",
  csharp: "cs",
  javascript: "js",
};

const SAMPLE_CODE_BY_LANG: Record<SupportedLang, string> = {
  python: `from math import sin

class Worker:
    def __init__(self, count=3):
        self.count = count

    async def run(self):
        phrase = []
        for i in range(self.count):
            if i % 2 == 0:
                await sleep(1)
            else:
                await sleep(2)
            phrase.append(i * 2)
        return phrase

async def melody(seed=2):
    w = Worker(count=6)
    notes = await w.run()
    for n in notes:
        if n % seed == 0:
            await sleep(1)
        else:
            await sleep(2)
    return [int(8 + sin(x) * 4) for x in notes]
`,
  c: `#include <stdio.h>

int main(void) {
    int motif[8] = {0, 2, 4, 7, 9, 7, 4, 2};
    int bass[4] = {0, -5, -7, -12};
    int total = 0;
    for (int i = 0; i < 16; i++) {
        int step = motif[i % 8] + bass[(i / 4) % 4];
        if (i % 2 == 0) {
            sleep(1);
        } else {
            sleep(2);
        }
        total += step;
    }
    switch (total % 4) {
        case 0: total += 2; break;
        case 1: total -= 1; break;
        default: break;
    }
    for (int j = 0; j < 6; j++) {
        total += (j % 2 == 0) ? 1 : -1;
    }
    return 0;
}
`,
  cpp: `#include <iostream>

int main() {
    int total = 0;
    int motif[] = {0, 3, 5, 7, 10, 7, 5, 3};
    int bass[] = {0, -5, -7, -12};
    for (int i = 0; i < 12; i++) {
        if (i == 6) continue;
        total += motif[i % 8] + bass[(i / 3) % 4];
    }
    while (total < 8) {
        total++;
    }
    for (int k = 0; k < 8; k++) {
        if (k % 3 == 0) total += 2;
    }
    return total;
}
`,
  java: `class Main {
    public static void main(String[] args) {
        int sum = 0;
        int[] scale = {0, 2, 4, 7, 9, 7, 4, 2};
        int[] bass = {0, -5, -7, -12};
        for (int i = 0; i < 12; i++) {
            if (i % 2 == 0) {
                sleep(1);
            } else {
                sleep(2);
            }
            sum += scale[i % scale.length] + bass[(i / 3) % bass.length];
        }
        switch (sum % 5) {
            case 2: sum += 2; break;
            default: break;
        }
        for (int j = 0; j < 6; j++) {
            sum += (j % 2 == 0) ? 1 : -1;
        }
    }
}
`,
  csharp: `using System.Threading.Tasks;

class Runner {
    public async Task RunAsync() {
        int[] motif = { 0, 2, 4, 7, 9, 7, 4, 2 };
        int[] bass = { 0, -5, -7, -12 };
        for (int i = 0; i < 12; i++) {
            int step = motif[i % motif.Length] + bass[(i / 3) % bass.Length];
            if (step % 2 == 0) await Task.Delay(80);
            await Task.Delay(100);
        }
        for (int j = 0; j < 6; j++) {
            if (j % 3 == 0) await Task.Delay(60);
        }
    }
}
`,
  javascript: `function arpeggio(seed) {
  const base = [0, 3, 5, 7, 10, 7, 5, 3];
  return base.map((n, i) => n + ((i + seed) % 4));
}

async function run() {
  const notes = arpeggio(2);
  const bass = [0, -5, -7, -12];
  for (let i = 0; i < 12; i++) {
    if (i % 2 === 0) {
      await sleep(1);
    } else {
      await sleep(2);
    }
  }
  for (let i = 0; i < notes.length; i++) {
    const n = notes[i] + bass[Math.floor(i / 2) % bass.length];
    if (n % 3 === 0) setTimeout(() => {}, 140);
    else setTimeout(() => {}, 90);
  }
}
`,
};

function readStoredLang(): SupportedLang {
  if (typeof window === "undefined") return DEFAULT_LANG;
  try {
    const stored = window.localStorage.getItem(STORAGE_LAST_LANG);
    if (stored && SUPPORTED_LANGS.includes(stored as SupportedLang)) {
      return stored as SupportedLang;
    }
  } catch {
    // ignore storage errors
  }
  return DEFAULT_LANG;
}

type Program = {
  id: string;
  filename: string;
  code: string;
  lang: SupportedLang;
  densityScale: number | null;
  drumLevel: number | null;
  hatRate: number | null;
  melodyLevel: number | null;
  bassLevel: number | null;
  volume: number | null;
};

type StoredAppState = {
  programs?: Program[];
  seed?: string;
  bars?: number;
  bpm?: number;
  playMode?: PlayMode;
  densityScale?: number;
  drumLevel?: number;
  hatRate?: number;
  melodyLevel?: number;
  bassLevel?: number;
};

function readStoredAppState(): StoredAppState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_APP_STATE);
    if (!raw) return null;
    return JSON.parse(raw) as StoredAppState;
  } catch {
    return null;
  }
}

export default function App() {
  const storedState = readStoredAppState();
  const fallbackLang = readStoredLang();
  const storedLang = storedState?.programs?.[0]?.lang;
  const initialLang = storedLang && SUPPORTED_LANGS.includes(storedLang) ? storedLang : fallbackLang;
  const defaultProgram: Program = {
    id: "program-1",
    filename: `example.${EXT_BY_LANG[initialLang]}`,
    code: SAMPLE_CODE_BY_LANG[initialLang],
    lang: initialLang,
    densityScale: null,
    drumLevel: null,
    hatRate: null,
    melodyLevel: null,
    bassLevel: null,
    volume: null,
  };
  const [programs, setPrograms] = useState<Program[]>(
    () => (storedState?.programs && storedState.programs.length > 0 ? storedState.programs : [defaultProgram])
  );
  const [lastLang, setLastLang] = useState<SupportedLang>(initialLang);
  const [densityScale, setDensityScale] = useState<number>(storedState?.densityScale ?? 0.6);
  const [drumLevel, setDrumLevel] = useState<number>(storedState?.drumLevel ?? 0.6);
  const [hatRate, setHatRate] = useState<number>(storedState?.hatRate ?? 0.6);
  const [melodyLevel, setMelodyLevel] = useState<number>(storedState?.melodyLevel ?? 0.8);
  const [bassLevel, setBassLevel] = useState<number>(storedState?.bassLevel ?? 0.7);
  const [error, setError] = useState<string | null>(null);
  const [sessionPrograms, setSessionPrograms] = useState<Program[] | null>(null);

  const [seed, setSeed] = useState<string>(storedState?.seed ?? DEFAULT_PARAMS.seed);
  const [bars, setBars] = useState<number>(storedState?.bars ?? DEFAULT_PARAMS.bars);
  const [bpm, setBpm] = useState<number>(storedState?.bpm ?? DEFAULT_PARAMS.bpm);
  const [playMode, setPlayMode] = useState<PlayMode>(storedState?.playMode ?? "flow");
  const [showDevNote, setShowDevNote] = useState(false);

  const params: SongParams = useMemo(() => ({ ...DEFAULT_PARAMS, seed, bars, bpm }), [seed, bars, bpm]);

  const [song, setSong] = useState<SongEvents | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isExportingMp3, setIsExportingMp3] = useState(false);
  const [nowPlayingByProgram, setNowPlayingByProgram] = useState<
    Record<string, { line: number; col: number; text: string }>
  >({});
  const [nowPlayingRangeByProgram, setNowPlayingRangeByProgram] = useState<
    Record<string, { start: number; end: number }>
  >({});

  const LINE_HEIGHT_PX = 18;
  const EDITOR_PADDING_PX = 12;
  const EDITOR_HEIGHT_PX = 360;
  const DEV_NOTE =
    "IGNORANZとはドイツ語で無知の意を表します。その言葉通り、知識ゼロから始まったゲーム制作プロジェクトチームであるIGNORANZ PROJECTは、”愛を形に”をモットーに日々、ゲーム,ツール,アプリ開発を行っています。";
  const player = useMemo(() => new ChiptunePlayer(), []);
  const tokensRef = useRef<{ token: Token; programId: string }[]>([]);
  const textareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const overlayRefs = useRef<Record<string, HTMLPreElement | null>>({});
  const spectrumRef = useRef<HTMLCanvasElement | null>(null);
  const programIdCounter = useRef(2);
  const suppressAutoScrollUntilRef = useRef<Record<string, number>>({});
  const scrollTargetsRef = useRef<Record<string, number>>({});
  const scrollRafRef = useRef<number | null>(null);
  const displayPrograms = isPlaying && sessionPrograms ? sessionPrograms : programs;

  function persistLastLang(nextLang: SupportedLang) {
    setLastLang(nextLang);
    try {
      window.localStorage.setItem(STORAGE_LAST_LANG, nextLang);
    } catch {
      // ignore storage errors
    }
  }

  useEffect(() => {
    const maxId = programs.reduce((max, program) => {
      const num = Number(program.id.replace("program-", ""));
      return Number.isFinite(num) ? Math.max(max, num) : max;
    }, 1);
    programIdCounter.current = Math.max(programIdCounter.current, maxId + 1);
  }, [programs]);

  useEffect(() => {
    try {
      const payload: StoredAppState = {
        programs,
        seed,
        bars,
        bpm,
        playMode,
        densityScale,
        drumLevel,
        hatRate,
        melodyLevel,
        bassLevel,
      };
      window.localStorage.setItem(STORAGE_APP_STATE, JSON.stringify(payload));
    } catch {
      // ignore storage errors
    }
  }, [programs, seed, bars, bpm, playMode, densityScale, drumLevel, hatRate, melodyLevel, bassLevel]);

  function lineDensityFactor(codeText: string) {
    const lines = Math.max(1, codeText.split("\n").length);
    if (lines <= 1000) return 1;
    const factor = Math.sqrt(1000 / lines);
    return Math.max(0.25, Math.min(1, factor));
  }

  useEffect(() => {
    player.setOnEvent((ev) => {
      if (ev.tokenIndex == null) return;
      const item = tokensRef.current[ev.tokenIndex];
      if (!item) return;
      const tok = item.token;
      const programId = item.programId;
      setNowPlayingByProgram((prev) => ({
        ...prev,
        [programId]: { line: tok.line, col: tok.col, text: tok.text },
      }));
      setNowPlayingRangeByProgram((prev) => ({
        ...prev,
        [programId]: { start: tok.start, end: tok.end },
      }));
      const ta = textareaRefs.current[programId];
      if (ta) {
        const suppressUntil = suppressAutoScrollUntilRef.current[programId] ?? 0;
        if (Date.now() >= suppressUntil) {
          const max = ta.value.length;
          if (tok.start <= max && tok.end <= max) {
            ta.setSelectionRange(tok.start, tok.end);
          }
          const targetTop = Math.max(0, (tok.line - 1) * LINE_HEIGHT_PX - ta.clientHeight * 0.05);
          scrollTargetsRef.current[programId] = targetTop;
          ta.scrollTop = targetTop;
          const overlay = overlayRefs.current[programId];
          if (overlay) {
            overlay.scrollTop = targetTop;
            overlay.scrollLeft = ta.scrollLeft;
          }
        }
      }
    });
    return () => {
      player.setOnEvent(undefined);
    };
  }, [player]);

  useEffect(() => {
    const canvas = spectrumRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let lastFrame = 0;
    const dpr = window.devicePixelRatio || 1;
    const resize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const render = (time: number) => {
      raf = window.requestAnimationFrame(render);
      if (time - lastFrame < 50) return; // ~20fps
      lastFrame = time;
      const width = canvas.width / dpr;
      const height = canvas.height / dpr;
      ctx.clearRect(0, 0, width, height);
      if (!isPlaying) {
        return;
      }
      const data = player.getSpectrum();
      if (!data) return;
      const barCount = Math.min(32, data.length);
      const stride = Math.max(1, Math.floor(data.length / barCount));
      const bandWidth = width / barCount;
      const baseY = height * 0.8;
      const maxDb = -35;
      const minDb = -110;
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      for (let i = 0; i < barCount; i += 1) {
        const v = data[i * stride];
        const normalized = Math.max(0, Math.min(1, (v - minDb) / (maxDb - minDb)));
        const barHeight = normalized * height * 0.35;
        const x = i * bandWidth;
        ctx.fillStyle = `rgba(255, 179, 71, ${0.12 + normalized * 0.25})`;
        ctx.fillRect(x, baseY - barHeight, Math.max(2, bandWidth * 0.6), barHeight);
      }
      ctx.restore();
    };
    resize();
    render(0);
    window.addEventListener("resize", resize);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [player, isPlaying]);

  useEffect(() => {
    if (!isPlaying) {
      if (scrollRafRef.current != null) {
        cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = null;
      }
      scrollTargetsRef.current = {};
      return;
    }

    const tick = () => {
      const targets = scrollTargetsRef.current;
      Object.entries(targets).forEach(([programId, targetTop]) => {
        const ta = textareaRefs.current[programId];
        if (!ta) return;
        ta.scrollTop = targetTop;
        const overlay = overlayRefs.current[programId];
        if (overlay) {
          overlay.scrollTop = ta.scrollTop;
          overlay.scrollLeft = ta.scrollLeft;
        }
      });
      scrollRafRef.current = requestAnimationFrame(tick);
    };

    scrollRafRef.current = requestAnimationFrame(tick);

    return () => {
      if (scrollRafRef.current != null) {
        cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = null;
      }
    };
  }, [isPlaying]);

  async function onPlay() {
    setError(null);

    const hasCode = programs.some((program) => program.code.trim().length > 0);
    if (!hasCode) {
      setError("コードが空です。");
      return;
    }

    for (const program of programs) {
      if (!SUPPORTED_LANGS.includes(program.lang)) {
        setError("未対応の言語です。");
        return;
      }
      if (program.code.length > 250_000) {
        setError("コードが大きすぎます（上限 250KB）。");
        return;
      }
    }

    try {
      // ブラウザのオーディオはユーザー操作後に start が必要
      await Tone.start();
      if (Tone.getContext().state !== "running") {
        await Tone.getContext().resume();
      }
      Tone.Destination.mute = false;
      if (Tone.getContext().state !== "running") {
        setError("オーディオが開始できませんでした（ブラウザ設定を確認してください）。");
        return;
      }
    } catch (e) {
      setError("オーディオの開始でエラーが発生しました。");
      return;
    }

    const snapshot = programs.map((program) => ({ ...program }));
    setSessionPrograms(snapshot);

    let tokenOffset = 0;
    const tokenMap: { token: Token; programId: string }[] = [];
    const allEvents: SongEvents["events"] = [];
    const totalBeats = params.bars * 4;
    snapshot.forEach((program, programIndex) => {
      const tokens = tokenize(program.code, program.lang);
      const lineFactor = lineDensityFactor(program.code);
      tokens.forEach((token) => {
        tokenMap.push({ token, programId: program.id });
      });
      const song = generateSongEvents(
        tokens.map((token) => ({ token, lang: program.lang })),
        params,
        playMode,
        {
          densityScale: (program.densityScale ?? densityScale) * lineFactor,
          drumLevel: (program.drumLevel ?? drumLevel) * lineFactor,
          hatRate: (program.hatRate ?? hatRate) * lineFactor,
          melodyLevel: program.melodyLevel ?? melodyLevel,
          bassLevel: program.bassLevel ?? bassLevel,
        }
      );
      const offset = totalBeats > 0 ? (programIndex * totalBeats) / snapshot.length : 0;
      const level = (program.volume ?? 1) * (programIndex === 0 ? 1 : 0.7);
      song.events.forEach((event) => {
        if (programIndex > 0 && event.track === "drums") {
          return;
        }
        const shifted = offset > 0
          ? ((event.timeBeats + offset) % totalBeats)
          : event.timeBeats;
        if (event.tokenIndex != null) {
          allEvents.push({
            ...event,
            timeBeats: shifted,
            velocity: Math.max(0, Math.min(1, event.velocity * level)),
            tokenIndex: event.tokenIndex + tokenOffset,
          });
        } else {
          allEvents.push({
            ...event,
            timeBeats: shifted,
            velocity: Math.max(0, Math.min(1, event.velocity * level)),
          });
        }
      });
      tokenOffset += tokens.length;
    });

    tokensRef.current = tokenMap;
    setNowPlayingByProgram({});
    setNowPlayingRangeByProgram({});
    const nextSong: SongEvents = {
      events: allEvents.sort((a, b) => a.timeBeats - b.timeBeats),
      meta: { lang: "mixed", tokenCount: tokenMap.length },
    };
    setSong(nextSong);

    player.load(nextSong, params);
    await player.play();
    setIsPlaying(true);
  }

  async function onStop() {
    await player.stop();
    setIsPlaying(false);
    setSessionPrograms(null);
    setNowPlayingByProgram({});
    setNowPlayingRangeByProgram({});
    suppressAutoScrollUntilRef.current = {};
    scrollTargetsRef.current = {};
  }

  function onDownloadMidi() {
    if (!song) {
      setError("先に生成してください。");
      return;
    }
    const activePrograms = sessionPrograms ?? programs;
    const langTag =
      Array.from(new Set(activePrograms.map((program) => program.lang))).length === 1
        ? activePrograms[0].lang
        : "mixed";
    downloadMidi(song, params, `lyra_${langTag}_${bars}bars_${bpm}bpm.mid`);
  }

  async function onDownloadMp3() {
    if (!song) {
      setError("先に生成してください。");
      return;
    }
    if (isExportingMp3) return;
    setError(null);
    const activePrograms = sessionPrograms ?? programs;
    const langTag =
      Array.from(new Set(activePrograms.map((program) => program.lang))).length === 1
        ? activePrograms[0].lang
        : "mixed";
    setIsExportingMp3(true);
    try {
      await downloadChiptuneMp3(song, params, `lyra_${langTag}_${bars}bars_${bpm}bpm.mp3`);
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      console.error("MP3 export failed:", e);
      setError(`MP3書き出しに失敗しました。${detail ? ` (${detail})` : ""}`);
    } finally {
      setIsExportingMp3(false);
    }
  }

  function onFiles(files: FileList) {
    const list = Array.from(files);
    if (list.length === 0) return;
    const detectedLangs = list.map((file) => detectLanguageFromFilename(file.name));
    if (detectedLangs.some((detected) => !detected)) {
      setError("対応拡張子ではありません（.py .c .cpp .java .cs .js のみ）。");
      return;
    }

    Promise.all(list.map((file) => file.text().then((text) => ({ file, text })))).then((entries) => {
      setPrograms((prev) => [
        ...prev,
        ...entries.map(({ file, text }) => ({
          id: `program-${programIdCounter.current++}`,
          filename: file.name,
          code: text,
          lang: detectLanguageFromFilename(file.name) as SupportedLang,
          densityScale: null,
          drumLevel: null,
          hatRate: null,
          melodyLevel: null,
          bassLevel: null,
          volume: null,
        })),
      ]);
      const lastDetected = detectedLangs[detectedLangs.length - 1] as SupportedLang;
      persistLastLang(lastDetected);
      setError(null);
    });
  }

  function onAddProgram() {
    const ext = EXT_BY_LANG[lastLang];
    const id = `program-${programIdCounter.current++}`;
    const index = programs.length + 1;
    setPrograms((prev) => [
      ...prev,
      {
        id,
        filename: `untitled-${index}.${ext}`,
        code: "",
        lang: lastLang,
        densityScale: null,
        drumLevel: null,
        hatRate: null,
        melodyLevel: null,
        bassLevel: null,
        volume: null,
      },
    ]);
  }

  function onRemoveProgram(id: string) {
    setPrograms((prev) => (prev.length > 1 ? prev.filter((program) => program.id !== id) : prev));
  }

  return (
    <div className="app-shell">
      <canvas ref={spectrumRef} className="spectrum-bg" aria-hidden />
      <div className="app">
      <header className="hero">
        <div>
          <div className="eyebrow">Code-to-Chiptune v1.17.1</div>
          <h1>Lyra-Code2Music</h1>
          <p className="disclaimer">※使用は自己責任でお願いします。動作しない場合はブラウザを変えてみてください。</p>
          <p className="lead">
            コードがサーバーに送られることはありません。美しいプログラムは美しい音色を奏でる(願望)
          </p>
        </div>
        <div className="hero-card">
          <div className="hero-label">対応言語</div>
          <div className="hero-list">Python / C / C++ / Java / C# / JavaScript</div>
          <div className="hero-label">再生モード</div>
          <div className="hero-list">順番 / ランダム / フロー</div>
        </div>
      </header>

      <section className="panel">
        <div className="control-grid">
          <label className="control">
            <span>Seed</span>
            <input value={seed} onChange={(e) => setSeed(e.target.value)} />
          </label>

          <label className="control">
            <span>Bars</span>
            <input
              type="number"
              min={2}
              max={64}
              value={bars}
              onChange={(e) => setBars(parseInt(e.target.value || "8", 10))}
            />
          </label>

          <label className="control">
            <span>BPM</span>
            <input
              type="number"
              min={60}
              max={220}
              value={bpm}
              onChange={(e) => setBpm(parseInt(e.target.value || "140", 10))}
            />
          </label>

          <label className="control">
            <span>密度</span>
            <input
              type="number"
              min={0.1}
              max={2}
              step={0.05}
              value={densityScale}
              onChange={(e) => setDensityScale(parseFloat(e.target.value || String(densityScale)))}
            />
          </label>

          <label className="control">
            <span>ドラム</span>
            <input
              type="number"
              min={0}
              max={1.5}
              step={0.05}
              value={drumLevel}
              onChange={(e) => setDrumLevel(parseFloat(e.target.value || String(drumLevel)))}
            />
          </label>

          <label className="control">
            <span>ハット</span>
            <input
              type="number"
              min={0}
              max={2}
              step={0.05}
              value={hatRate}
              onChange={(e) => setHatRate(parseFloat(e.target.value || String(hatRate)))}
            />
          </label>

          <label className="control">
            <span>メロディ</span>
            <input
              type="number"
              min={0}
              max={1.5}
              step={0.05}
              value={melodyLevel}
              onChange={(e) => setMelodyLevel(parseFloat(e.target.value || String(melodyLevel)))}
            />
          </label>

          <label className="control">
            <span>ベース</span>
            <input
              type="number"
              min={0}
              max={1.5}
              step={0.05}
              value={bassLevel}
              onChange={(e) => setBassLevel(parseFloat(e.target.value || String(bassLevel)))}
            />
          </label>

          <label className="control">
            <span>生成方法</span>
            <select value={playMode} onChange={(e) => setPlayMode(e.target.value as PlayMode)}>
              <option value="sequential">順番</option>
              <option value="random">ランダム</option>
              <option value="flow">フロー</option>
            </select>
          </label>

          <label className="control file">
            <span>ファイル</span>
            <input
              type="file"
              accept=".py,.c,.cpp,.cc,.cxx,.java,.cs,.js"
              onChange={(e) => {
                if (e.target.files) onFiles(e.target.files);
                e.currentTarget.value = "";
              }}
              multiple
              disabled={isPlaying}
            />
          </label>
        </div>

        <div className="actions">
          <button className="primary" onClick={onPlay} disabled={isPlaying}>生成して再生</button>
          <button onClick={onStop} disabled={!isPlaying}>停止</button>
          <button onClick={onDownloadMidi} disabled={!song}>MIDIダウンロード</button>
          <div className="download-group">
            <button onClick={onDownloadMp3} disabled={!song || isExportingMp3}>
              {isExportingMp3 ? "MP3書き出し中..." : "MP3ダウンロード"}
            </button>
            <a
              className="share-x"
              href="https://x.com/intent/post?text=%E6%98%AF%E9%9D%9E%E3%80%81%E5%8B%95%E7%94%BB%E3%82%84%E9%9F%B3%E6%BA%90%E3%81%AA%E3%81%A9%E3%82%92%E6%B7%BB%E4%BB%98%E3%81%97%E3%81%A6%E7%9A%86%E3%81%95%E3%82%93%E3%81%AE%E3%83%97%E3%83%AD%E3%82%B0%E3%83%A9%E3%83%A0%E3%81%AE%E9%9F%B3%E8%89%B2%E3%82%92%E8%81%9E%E3%81%8B%E3%81%9B%E3%81%A6%E3%81%8F%E3%81%A0%E3%81%95%E3%81%84%E3%80%82(%E3%83%97%E3%83%AD%E3%82%B0%E3%83%A9%E3%83%A0%E3%81%AE%E6%B5%81%E5%87%BA%E7%AD%89%E3%81%AB%E3%81%AF%E3%81%8A%E6%B0%97%E3%82%92%E3%81%A4%E3%81%91%E3%81%8F%E3%81%A0%E3%81%95%E3%81%84%E3%80%82)%0A%20%23LyraCode2Music%20%23%E7%BE%8E%E3%81%97%E3%81%84%E3%83%97%E3%83%AD%E3%82%B0%E3%83%A9%E3%83%A0%E3%81%AF%E7%BE%8E%E3%81%97%E3%81%84%E9%9F%B3%E8%89%B2%E3%82%92%E5%A5%8F%E3%81%A7%E3%82%8B%E3%81%AF%E3%81%9A%20https%3A%2F%2Flyra-code2music.web.app%2F"
              target="_blank"
              rel="noopener noreferrer"
            >
              Xでシェア
            </a>
          </div>
          <button onClick={onAddProgram} disabled={isPlaying}>空のエディタ追加</button>
        </div>
      </section>

      {error && <div className="error">{error}</div>}

      <div className="editor-grid">
        {displayPrograms.map((program) => (
          <section key={program.id} className="editor-card">
            <div className="editor-header">
              <div className="filename">File: {program.filename}</div>
              <div className="editor-tools">
                <select
                  className="editor-lang"
                  value={program.lang}
                  onChange={(e) => {
                    const nextLang = e.target.value as SupportedLang;
                    setPrograms((prev) =>
                      prev.map((item) => (item.id === program.id ? { ...item, lang: nextLang } : item))
                    );
                    persistLastLang(nextLang);
                  }}
                  disabled={isPlaying}
                >
                  {SUPPORTED_LANGS.map((l) => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
                <div className="cursor">
                  {nowPlayingByProgram[program.id]
                    ? `L${nowPlayingByProgram[program.id].line}:C${nowPlayingByProgram[program.id].col}`
                    : "L-:C-"}
                </div>
                {displayPrograms.length > 1 && (
                  <button
                    className="editor-remove"
                    type="button"
                    onClick={() => onRemoveProgram(program.id)}
                    aria-label={`${program.filename} を閉じる`}
                    disabled={isPlaying}
                  >
                    ×
                  </button>
                )}
              </div>
            </div>
            <div className="editor-settings">
              <div className="editor-setting">
                <span>密度</span>
                <input
                  type="number"
                  min={0.1}
                  max={2}
                  step={0.05}
                  value={program.densityScale ?? ""}
                  placeholder={String(densityScale)}
                  onChange={(e) => {
                    const raw = e.target.value;
                    setPrograms((prev) =>
                      prev.map((item) =>
                        item.id === program.id
                          ? { ...item, densityScale: raw === "" ? null : parseFloat(raw) }
                          : item
                      )
                    );
                  }}
                  disabled={isPlaying}
                />
              </div>
              <div className="editor-setting">
                <span>ドラム</span>
                <input
                  type="number"
                  min={0}
                  max={1.5}
                  step={0.05}
                  value={program.drumLevel ?? ""}
                  placeholder={String(drumLevel)}
                  onChange={(e) => {
                    const raw = e.target.value;
                    setPrograms((prev) =>
                      prev.map((item) =>
                        item.id === program.id
                          ? { ...item, drumLevel: raw === "" ? null : parseFloat(raw) }
                          : item
                      )
                    );
                  }}
                  disabled={isPlaying}
                />
              </div>
              <div className="editor-setting">
                <span>ハット</span>
                <input
                  type="number"
                  min={0}
                  max={2}
                  step={0.05}
                  value={program.hatRate ?? ""}
                  placeholder={String(hatRate)}
                  onChange={(e) => {
                    const raw = e.target.value;
                    setPrograms((prev) =>
                      prev.map((item) =>
                        item.id === program.id
                          ? { ...item, hatRate: raw === "" ? null : parseFloat(raw) }
                          : item
                      )
                    );
                  }}
                  disabled={isPlaying}
                />
              </div>
              <div className="editor-setting">
                <span>メロ</span>
                <input
                  type="number"
                  min={0}
                  max={1.5}
                  step={0.05}
                  value={program.melodyLevel ?? ""}
                  placeholder={String(melodyLevel)}
                  onChange={(e) => {
                    const raw = e.target.value;
                    setPrograms((prev) =>
                      prev.map((item) =>
                        item.id === program.id
                          ? { ...item, melodyLevel: raw === "" ? null : parseFloat(raw) }
                          : item
                      )
                    );
                  }}
                  disabled={isPlaying}
                />
              </div>
              <div className="editor-setting">
                <span>ベース</span>
                <input
                  type="number"
                  min={0}
                  max={1.5}
                  step={0.05}
                  value={program.bassLevel ?? ""}
                  placeholder={String(bassLevel)}
                  onChange={(e) => {
                    const raw = e.target.value;
                    setPrograms((prev) =>
                      prev.map((item) =>
                        item.id === program.id
                          ? { ...item, bassLevel: raw === "" ? null : parseFloat(raw) }
                          : item
                      )
                    );
                  }}
                  disabled={isPlaying}
                />
              </div>
              <div className="editor-setting">
                <span>音量</span>
                <input
                  type="number"
                  min={0}
                  max={2}
                  step={0.05}
                  value={program.volume ?? ""}
                  placeholder="1"
                  onChange={(e) => {
                    const raw = e.target.value;
                    setPrograms((prev) =>
                      prev.map((item) =>
                        item.id === program.id
                          ? { ...item, volume: raw === "" ? null : parseFloat(raw) }
                          : item
                      )
                    );
                  }}
                  disabled={isPlaying}
                />
              </div>
            </div>
            <div className="editor-surface" style={{ height: "var(--editor-height)" }}>
              <textarea
                ref={(node) => {
                  textareaRefs.current[program.id] = node;
                }}
                value={program.code}
                onChange={(e) => {
                  const next = e.target.value;
                  setPrograms((prev) =>
                    prev.map((item) => (item.id === program.id ? { ...item, code: next } : item))
                  );
                }}
                onScroll={(e) => {
                  const ta = e.currentTarget;
                  const overlay = overlayRefs.current[program.id];
                  if (overlay) {
                    overlay.scrollTop = ta.scrollTop;
                    overlay.scrollLeft = ta.scrollLeft;
                  }
                  if (isPlaying) {
                    suppressAutoScrollUntilRef.current[program.id] = Date.now() + 1200;
                  }
                }}
                readOnly={isPlaying}
                style={{
                  lineHeight: `${LINE_HEIGHT_PX}px`,
                  padding: EDITOR_PADDING_PX,
                }}
                className={`editor-textarea${isPlaying ? " editor-textarea-locked" : ""}`}
              />
              <pre
                ref={(node) => {
                  overlayRefs.current[program.id] = node;
                }}
                aria-hidden
                style={{
                  lineHeight: `${LINE_HEIGHT_PX}px`,
                  padding: EDITOR_PADDING_PX,
                }}
                className="editor-overlay"
              >
                {(() => {
                  const range = nowPlayingRangeByProgram[program.id];
                  if (!range) return program.code;
                  const start = Math.max(0, Math.min(program.code.length, range.start));
                  const end = Math.max(start, Math.min(program.code.length, range.end));
                  return (
                    <>
                      {program.code.slice(0, start)}
                      <mark className="mark">{program.code.slice(start, end)}</mark>
                      {program.code.slice(end)}
                    </>
                  );
                })()}
              </pre>
            </div>
          </section>
        ))}
      </div>

      <section className="tips-card">
        <details>
          <summary>使い方のコツ</summary>
          <div className="tips-grid">
            <div className="tip">
              <div className="tip-title">Seed</div>
              <div className="tip-body">同じSeedなら同じ雰囲気になりやすいです。</div>
            </div>
            <div className="tip">
              <div className="tip-title">Bars / BPM</div>
              <div className="tip-body">Barsは曲の長さ、BPMはテンポ。短く速くするとタイトに。</div>
            </div>
            <div className="tip">
              <div className="tip-title">密度</div>
              <div className="tip-body">イベント量の目安。騒がしい時は下げると落ち着きます。</div>
            </div>
            <div className="tip">
              <div className="tip-title">ドラム / ハット</div>
              <div className="tip-body">ドラムは強さ、ハットは刻み量。高いほど派手になります。</div>
            </div>
            <div className="tip">
              <div className="tip-title">メロ / ベース</div>
              <div className="tip-body">各トラックの出力感。メロを上げると主旋律が前に出ます。</div>
            </div>
            <div className="tip">
              <div className="tip-title">音量</div>
              <div className="tip-body">ファイルごとの最終ボリューム。重ねる時は少し下げると良いです。</div>
            </div>
            <div className="tip">
              <div className="tip-title">MIDI活用</div>
              <div className="tip-body">MIDIをダウンロードして、Chiptune以外の音源でも楽しめます。</div>
            </div>
            <div className="tip">
              <div className="tip-title">生成方法</div>
              <div className="tip-body">
                順番はコード順、ランダムは抽選、フローは分岐/待機/ループを反映して間や反復を作ります。
              </div>
            </div>
          </div>
          <div className="tips-footer">
            曲が騒がしい時は「密度」「ハット」「ドラム」を下げるのが効果的です。
          </div>
        </details>
      </section>

      <section className="rules-card">
        <details>
          <summary>いまの変換ルール（ざっくり）</summary>
          <ul>
            <li>識別子（変数/関数名）→ メロディの音高（ハッシュで安定）</li>
            <li>数値リテラル → ベースの音程</li>
            <li>演算子・記号 → ドラム（比較演算はスネア寄り）</li>
            <li>トークン密度 → ハット密度とイベント間隔</li>
            <li>ドラムはキック/スネアの基本パターンを常に配置</li>
            <li>順番モードは4小節コード進行のベースを追加</li>
            <li>ランダムモードはトークンを抽選して刻みを生成</li>
            <li>フローモードはトークン順に歩幅を進めて再生</li>
            <li>フローモードはループや待機で繰り返し/間を追加</li>
            <li>分岐/終了系キーワードは区切りのアクセントに変換</li>
            <li>数値はスケールに沿って音程化、式は結果を追加音に</li>
            <li>言語固有トークンでフレーズ追加（Python def/class、JS async/await、C系 #include/#define）</li>
          </ul>
          <a className="rules-link" href="https://github.com/IGNORANZ-PROJECT/Lyra-Code2Music" target="_blank" rel="noreferrer">
            このサイトのGitHubはこちらから。
          </a>
        </details>
      </section>

      <button className="dev-trigger" onClick={() => setShowDevNote((prev) => !prev)}>
        ©IGNORANZ PROJECT
      </button>
      {showDevNote && (
        <div className="dev-pop" role="dialog" aria-label="開発者説明">
          <div className="dev-title">開発者説明</div>
          <div className="dev-body">{DEV_NOTE}</div>
          <button className="dev-close" onClick={() => setShowDevNote(false)}>閉じる</button>
        </div>
      )}
      </div>
    </div>
  );
}
