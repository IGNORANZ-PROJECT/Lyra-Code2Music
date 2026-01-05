import type { SupportedLang } from "./lang";
import type { Token } from "./tokenize";
import { makeRng, hashStringToUint32 } from "./rng";

export type ScaleName = "minorPentatonic";

export type SongParams = {
  seed: string;
  bars: number;
  bpm: number;
  keyRootMidi: number;
  scale: ScaleName;
};

export type PlayMode = "sequential" | "random" | "flow";

export type NoteEvent = {
  track: "melody" | "bass" | "drums";
  timeBeats: number;     // 0..(bars*4)
  durationBeats: number; // note length
  midi?: number;         // melody/bass
  velocity: number;      // 0..1
  drum?: "kick" | "snare" | "hat" | "noise";
  tokenIndex?: number;
};

export type TokenWithLang = {
  token: Token;
  lang: SupportedLang;
};

export type SongEvents = {
  events: NoteEvent[];
  meta: {
    lang: string;
    tokenCount: number;
  };
};

export type GenerateOptions = {
  densityScale: number;
  drumLevel: number;
  hatRate: number;
  melodyLevel: number;
  bassLevel: number;
};

const SCALE_MINOR_PENTATONIC = [0, 3, 5, 7, 10]; // semitones
const LOOP_KEYWORDS: Record<SupportedLang, Set<string>> = {
  python: new Set(["for", "while"]),
  c: new Set(["for", "while", "do"]),
  cpp: new Set(["for", "while", "do"]),
  java: new Set(["for", "while", "do"]),
  csharp: new Set(["for", "foreach", "while", "do"]),
  javascript: new Set(["for", "while"]),
};
const WAIT_KEYWORDS: Record<SupportedLang, Set<string>> = {
  python: new Set(["await", "yield"]),
  c: new Set([]),
  cpp: new Set([]),
  java: new Set([]),
  csharp: new Set(["await", "yield"]),
  javascript: new Set(["await", "yield"]),
};
const BRANCH_KEYWORDS: Record<SupportedLang, Set<string>> = {
  python: new Set(["if", "elif", "else", "try", "except", "finally", "with"]),
  c: new Set(["if", "else", "switch", "case", "default"]),
  cpp: new Set(["if", "else", "switch", "case", "default"]),
  java: new Set(["if", "else", "switch", "case", "default", "try", "catch", "finally"]),
  csharp: new Set(["if", "else", "switch", "case", "default", "try", "catch", "finally"]),
  javascript: new Set(["if", "else", "switch", "case", "default", "try", "catch", "finally"]),
};
const TERMINATE_KEYWORDS: Record<SupportedLang, Set<string>> = {
  python: new Set(["return", "break", "continue", "raise"]),
  c: new Set(["return", "break", "continue"]),
  cpp: new Set(["return", "break", "continue", "throw"]),
  java: new Set(["return", "break", "continue", "throw"]),
  csharp: new Set(["return", "break", "continue", "throw"]),
  javascript: new Set(["return", "break", "continue", "throw"]),
};
const WAIT_IDENTIFIERS = new Set([
  "sleep",
  "usleep",
  "nanosleep",
  "delay",
  "wait",
  "timeout",
  "settimeout",
]);

function pickFromScale(rootMidi: number, degree: number, octaveOffset: number): number {
  const scale = SCALE_MINOR_PENTATONIC;
  const d = ((degree % scale.length) + scale.length) % scale.length;
  const oct = Math.floor(degree / scale.length) + octaveOffset;
  return rootMidi + scale[d] + 12 * oct;
}

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

function isLoopKeyword(token: Token, lang: SupportedLang) {
  if (token.type !== "keyword") return false;
  return LOOP_KEYWORDS[lang]?.has(token.text) ?? false;
}

function isWaitToken(token: Token, lang: SupportedLang) {
  if (token.type === "keyword") {
    return WAIT_KEYWORDS[lang]?.has(token.text) ?? false;
  }
  if (token.type === "identifier") {
    return WAIT_IDENTIFIERS.has(token.text.toLowerCase());
  }
  return false;
}

function isBranchKeyword(token: Token, lang: SupportedLang) {
  if (token.type !== "keyword") return false;
  return BRANCH_KEYWORDS[lang]?.has(token.text) ?? false;
}

function isTerminateKeyword(token: Token, lang: SupportedLang) {
  if (token.type !== "keyword") return false;
  return TERMINATE_KEYWORDS[lang]?.has(token.text) ?? false;
}

function restCountForToken(token: Token, density: number) {
  const lower = token.text.toLowerCase();
  if (lower.includes("sleep") || lower.includes("timeout")) {
    return density > 0.6 ? 2 : 3;
  }
  return density > 0.6 ? 1 : (density > 0.3 ? 2 : 3);
}

function numberToDegree(n: number) {
  const safe = Number.isFinite(n) ? Math.round(Math.abs(n)) : 0;
  return (safe % 20) - 5;
}

type ExprResult = {
  value: number;
  endIndex: number;
  usedOperators: boolean;
};

function parseNumericExpression(tokens: TokenWithLang[], startIndex: number): ExprResult | null {
  const maxTokens = 24;
  const output: (number | string)[] = [];
  const ops: string[] = [];
  let usedOperators = false;
  let expectValue = true;
  const startLine = tokens[startIndex]?.token.line;
  if (!startLine) return null;

  const precedence = (op: string) => {
    if (op === "u-") return 3;
    if (op === "*" || op === "/" || op === "%") return 2;
    if (op === "+" || op === "-") return 1;
    return 0;
  };

  const isLeftAssoc = (op: string) => op !== "u-";
  const flushOp = (op: string) => {
    output.push(op);
  };

  let count = 0;
  let i = startIndex;
  for (; i < tokens.length && count < maxTokens; i += 1) {
    const tok = tokens[i].token;
    if (tok.line !== startLine) break;
    if (tok.type === "whitespace" || tok.type === "comment" || tok.type === "string") {
      continue;
    }
    const text = tok.text;
    if (tok.type === "number") {
      output.push(parseFloat(text));
      expectValue = false;
      count += 1;
      continue;
    }
    if (text === "(") {
      ops.push(text);
      expectValue = true;
      count += 1;
      continue;
    }
    if (text === ")") {
      while (ops.length > 0 && ops[ops.length - 1] !== "(") {
        flushOp(ops.pop() as string);
      }
      if (ops[ops.length - 1] === "(") {
        ops.pop();
      }
      expectValue = false;
      count += 1;
      continue;
    }
    if (tok.type === "operator") {
      let op = text;
      if (!["+","-","*","/","%"].includes(op)) {
        break;
      }
      if (op === "-" && expectValue) {
        op = "u-";
      } else {
        usedOperators = true;
      }
      while (ops.length > 0) {
        const top = ops[ops.length - 1];
        if (top === "(") break;
        if (
          (isLeftAssoc(op) && precedence(op) <= precedence(top)) ||
          (!isLeftAssoc(op) && precedence(op) < precedence(top))
        ) {
          flushOp(ops.pop() as string);
        } else {
          break;
        }
      }
      ops.push(op);
      expectValue = true;
      count += 1;
      continue;
    }
    break;
  }

  while (ops.length > 0) {
    const op = ops.pop() as string;
    if (op !== "(") flushOp(op);
  }

  if (output.length === 0) return null;
  const stack: number[] = [];
  for (const item of output) {
    if (typeof item === "number") {
      stack.push(item);
      continue;
    }
    if (item === "u-") {
      const v = stack.pop();
      if (v == null) return null;
      stack.push(-v);
      continue;
    }
    const b = stack.pop();
    const a = stack.pop();
    if (a == null || b == null) return null;
    switch (item) {
      case "+":
        stack.push(a + b);
        break;
      case "-":
        stack.push(a - b);
        break;
      case "*":
        stack.push(a * b);
        break;
      case "/":
        stack.push(b === 0 ? 0 : a / b);
        break;
      case "%":
        stack.push(b === 0 ? 0 : a % b);
        break;
      default:
        return null;
    }
  }
  if (stack.length !== 1) return null;
  const value = stack[0];
  if (!Number.isFinite(value)) return null;
  return { value, endIndex: Math.max(startIndex, i - 1), usedOperators };
}

export function generateSongEvents(
  tokens: TokenWithLang[],
  params: SongParams,
  mode: PlayMode,
  options: GenerateOptions = {
    densityScale: 1,
    drumLevel: 1,
    hatRate: 1,
    melodyLevel: 1,
    bassLevel: 1,
  }
): SongEvents {
  const langKey = Array.from(new Set(tokens.map((t) => t.lang))).sort().join(",") || "unknown";
  const seed = `${params.seed}|${langKey}|${tokens.length}|${hashStringToUint32(
    tokens.slice(0, 500).map(t => t.token.text).join("")
  )}`;
  const rng = makeRng(seed);

  const bars = Math.max(2, Math.min(64, params.bars));
  const totalBeats = bars * 4;

  // 密度目標（トークン数でスケーリング）
  const tokenCount = tokens.length;
  const density = clamp01(Math.min(1, tokenCount / 1800) * options.densityScale);
  const eventChance = clamp01(options.densityScale);
  const drumLevel = clamp01(options.drumLevel);
  const hatRate = Math.max(0, options.hatRate);
  const melodyLevel = clamp01(options.melodyLevel);
  const bassLevel = clamp01(options.bassLevel);

  const events: NoteEvent[] = [];

  // 時間グリッド：16分（1beat=4分）
  const step = 0.25; // 16th in beats
  let t = 0;

  function grooveShiftFor(lang: SupportedLang) {
    return lang === "javascript" ? 0.125 : 0;
  }

  function baseOctFor(lang: SupportedLang) {
    return lang === "python" ? 1 : 0;
  }

  // ドラム基本パターン（控えめ）
  for (let beat = 0; beat < totalBeats; beat += 1) {
    events.push({
      track: "drums",
      timeBeats: beat + 0,
      durationBeats: 0.05,
      velocity: 0.7 * drumLevel,
      drum: "kick",
    });
    if (beat % 2 === 1) {
      events.push({
        track: "drums",
        timeBeats: beat + 0,
        durationBeats: 0.05,
        velocity: 0.45 * drumLevel,
        drum: "snare",
      });
    }
    // ハット（密度で増減）
    const hatsBase = density > 0.5 ? 4 : 2; // 8th or half-rate
    const hats = Math.max(0, Math.round(hatsBase * hatRate));
    for (let i = 0; i < hats; i++) {
      const tb = beat + (i * (1 / hats));
      events.push({
        track: "drums",
        timeBeats: tb,
        durationBeats: 0.03,
        velocity: (0.18 + 0.15 * density) * drumLevel,
        drum: "hat",
      });
    }
  }

  if (mode === "sequential") {
    // 4小節のコード進行を基準に、全体を「曲」として安定させる
    const progressionDegrees = [0, 2, 4, 1]; // pentatonic degrees
    for (let bar = 0; bar < bars; bar += 1) {
      const rootDegree = progressionDegrees[bar % progressionDegrees.length];
      const rootMidi = pickFromScale(params.keyRootMidi - 24, rootDegree, 0);
      const baseTime = bar * 4;
      events.push(
        { track: "bass", timeBeats: baseTime + 0, durationBeats: 1.2, midi: rootMidi, velocity: 0.7 * bassLevel },
        { track: "bass", timeBeats: baseTime + 2, durationBeats: 1.0, midi: rootMidi, velocity: 0.65 * bassLevel }
      );
    }

    const spread = tokens.length > 1 ? totalBeats - step : 0;
    const hop = Math.max(step, totalBeats / Math.max(1, tokens.length));
    for (let i = 0; i < tokens.length; i += 1) {
      const idx = i;
      const tok = tokens[idx].token;
      const tokLang = tokens[idx].lang;
      t = tokens.length > 1 ? (i / (tokens.length - 1)) * spread : 0;
      const tq = Math.round(t / step) * step;

      if (tok.type === "identifier") {
        if (eventChance < 1 && rng() > eventChance) {
          continue;
        }
        const h = hashStringToUint32(tok.text);
        const degree = (h % 20) - 5;
        const oct = baseOctFor(tokLang) + (tokLang === "python" ? (h % 2) : 0);
        const midi = pickFromScale(params.keyRootMidi, degree, oct);
        events.push({
          track: "melody",
          timeBeats: tq + grooveShiftFor(tokLang),
          durationBeats: Math.min(step * 2, hop),
          midi,
          velocity: clamp01((0.5 + 0.3 * rng()) * melodyLevel),
          tokenIndex: idx,
        });
      } else if (tok.type === "number") {
        if (eventChance < 1 && rng() > eventChance) {
          continue;
        }
        const n = parseFloat(tok.text);
        const degree = (Math.floor(n) % 10) - 6;
        const midi = pickFromScale(params.keyRootMidi - 24, degree, 0);
        events.push({
          track: "bass",
          timeBeats: tq,
          durationBeats: Math.max(step * 2, 0.5),
          midi,
          velocity: 0.55 * bassLevel,
          tokenIndex: idx,
        });
      } else if (tok.type === "keyword") {
        const k = tok.text;

        if (tokLang === "python" && (k === "def" || k === "class")) {
          const motif = [0, 2, 4, 2].map((d, j) => ({
            track: "melody" as const,
            timeBeats: tq + j * step,
            durationBeats: step,
            midi: pickFromScale(params.keyRootMidi, d, 1),
            velocity: 0.75 * melodyLevel,
            tokenIndex: idx,
          }));
          events.push(...motif);
        }

        if ((tokLang === "c" || tokLang === "cpp") && (k === "#include" || k === "#define")) {
          events.push({
            track: "drums",
            timeBeats: tq,
            durationBeats: 0.08,
            velocity: 0.9 * drumLevel,
            drum: "noise",
            tokenIndex: idx,
          });
        }

        if (tokLang === "javascript" && (k === "async" || k === "await")) {
          events.push({
            track: "melody",
            timeBeats: tq,
            durationBeats: step,
            midi: pickFromScale(params.keyRootMidi, Math.floor(rng() * 12), 1),
            velocity: 0.85 * melodyLevel,
            tokenIndex: idx,
          });
        }
      } else if (tok.type === "operator") {
        if (eventChance < 1 && rng() > eventChance) {
          continue;
        }
        const hard = tok.text.includes("==") || tok.text.includes("!=") || tok.text.includes("=>");
        events.push({
          track: "drums",
          timeBeats: tq,
          durationBeats: 0.04,
          velocity: (hard ? 0.6 : 0.4) * drumLevel,
          drum: hard ? "snare" : "hat",
          tokenIndex: idx,
        });
      }
    }
  } else {
    // 変換：トークン列を走査してメロ/ベースを生成
    if (mode === "flow") {
      const lineFirst = new Map<number, { index: number; col: number }>();
      const lineLast = new Map<number, number>();
      tokens.forEach((entry, index) => {
        const tok = entry.token;
        if (tok.type === "whitespace") return;
        if (!lineFirst.has(tok.line)) {
          lineFirst.set(tok.line, { index, col: tok.col });
        }
        lineLast.set(tok.line, index);
      });

      const lineNumbers = Array.from(lineFirst.keys()).sort((a, b) => a - b);
      const linePos = new Map<number, number>();
      lineNumbers.forEach((line, idx) => linePos.set(line, idx));

      const findPythonBlock = (startIdx: number) => {
        const tok = tokens[startIdx].token;
        const loopLine = tok.line;
        const loopIndent = lineFirst.get(loopLine)?.col ?? tok.col;
        const startLinePos = linePos.get(loopLine);
        if (startLinePos == null) return null;
        let blockStartLine: number | null = null;
        for (let i = startLinePos + 1; i < lineNumbers.length; i += 1) {
          const line = lineNumbers[i];
          const indent = lineFirst.get(line)?.col ?? 1;
          if (indent > loopIndent) {
            blockStartLine = line;
            break;
          }
        }
        if (blockStartLine == null) return null;
        let blockEndLine = lineNumbers[lineNumbers.length - 1];
        for (let i = linePos.get(blockStartLine)! + 1; i < lineNumbers.length; i += 1) {
          const line = lineNumbers[i];
          const indent = lineFirst.get(line)?.col ?? 1;
          if (indent <= loopIndent) {
            blockEndLine = lineNumbers[i - 1];
            break;
          }
        }
        const start = lineFirst.get(blockStartLine)?.index ?? null;
        const end = lineLast.get(blockEndLine) ?? null;
        if (start == null || end == null || end < start) return null;
        return { start, end };
      };

      const findBraceBlock = (startIdx: number) => {
        let openIdx = -1;
        for (let i = startIdx + 1; i < tokens.length; i += 1) {
          const tok = tokens[i].token;
          if (tok.text === "{") {
            openIdx = i;
            break;
          }
          if (tok.text === ";" && tok.line === tokens[startIdx].token.line) {
            break;
          }
        }
        if (openIdx >= 0) {
          let depth = 0;
          for (let i = openIdx; i < tokens.length; i += 1) {
            const text = tokens[i].token.text;
            if (text === "{") depth += 1;
            if (text === "}") depth -= 1;
            if (depth === 0 && i > openIdx) {
              const start = openIdx + 1;
              const end = i - 1;
              if (end < start) return null;
              return { start, end };
            }
          }
          return null;
        }
        let start = -1;
        for (let i = startIdx + 1; i < tokens.length; i += 1) {
          if (tokens[i].token.type !== "whitespace") {
            start = i;
            break;
          }
        }
        if (start < 0) return null;
        for (let i = start; i < tokens.length; i += 1) {
          if (tokens[i].token.text === ";") {
            const end = i - 1;
            if (end < start) return null;
            return { start, end };
          }
        }
        return null;
      };

      const insertsByEnd = new Map<number, number[]>();
      const maxExtra = tokens.length * 3;
      let extraCount = 0;
      for (let i = 0; i < tokens.length; i += 1) {
        const entry = tokens[i];
        if (!isLoopKeyword(entry.token, entry.lang)) continue;
        const block =
          entry.lang === "python" ? findPythonBlock(i) : findBraceBlock(i);
        if (!block) continue;
        const blockIndices: number[] = [];
        for (let j = block.start; j <= block.end; j += 1) {
          blockIndices.push(j);
        }
        if (blockIndices.length === 0) continue;
        const extraRepeats = rng() > 0.7 ? 2 : 1;
        const repeated: number[] = [];
        for (let r = 0; r < extraRepeats; r += 1) {
          repeated.push(...blockIndices);
        }
        if (extraCount + repeated.length > maxExtra) continue;
        extraCount += repeated.length;
        const existing = insertsByEnd.get(block.end);
        if (existing) {
          existing.push(...repeated);
        } else {
          insertsByEnd.set(block.end, repeated);
        }
      }

      const flowIndices: number[] = [];
      for (let i = 0; i < tokens.length; i += 1) {
        flowIndices.push(i);
        const entry = tokens[i];
        if (isWaitToken(entry.token, entry.lang)) {
          const rests = restCountForToken(entry.token, density);
          for (let r = 0; r < rests; r += 1) {
            flowIndices.push(-1);
          }
        }
        if (isBranchKeyword(entry.token, entry.lang)) {
          flowIndices.push(-1);
        }
        if (isTerminateKeyword(entry.token, entry.lang)) {
          const rests = density > 0.6 ? 2 : 3;
          for (let r = 0; r < rests; r += 1) {
            flowIndices.push(-1);
          }
        }
        const extra = insertsByEnd.get(i);
        if (extra) {
          flowIndices.push(...extra);
        }
      }

      const spread = flowIndices.length > 1 ? totalBeats - step : 0;
      const hop = Math.max(step, totalBeats / Math.max(1, flowIndices.length));
      for (let i = 0; i < flowIndices.length; i += 1) {
        const idx = flowIndices[i];
        if (idx < 0) continue;
        const tok = tokens[idx].token;
        const tokLang = tokens[idx].lang;
        const tRaw = flowIndices.length > 1 ? (i / (flowIndices.length - 1)) * spread : 0;
        const tq = Math.round(tRaw / step) * step;

        if (tok.type === "keyword" && (isBranchKeyword(tok, tokLang) || isTerminateKeyword(tok, tokLang))) {
          events.push({
            track: "drums",
            timeBeats: tq,
            durationBeats: 0.05,
            velocity: 0.7 * drumLevel,
            drum: isTerminateKeyword(tok, tokLang) ? "noise" : "snare",
            tokenIndex: idx,
          });
        }

        if (tok.type === "identifier") {
          if (eventChance < 1 && rng() > eventChance) {
            continue;
          }
          const h = hashStringToUint32(tok.text);
          const degree = (h % 20) - 5;
          const oct = baseOctFor(tokLang) + (tokLang === "python" ? (h % 2) : 0);
          const midi = pickFromScale(params.keyRootMidi, degree, oct);
          events.push({
            track: "melody",
            timeBeats: tq + grooveShiftFor(tokLang),
            durationBeats: Math.min(step * 2, hop),
            midi,
            velocity: clamp01((0.45 + 0.35 * rng()) * melodyLevel),
            tokenIndex: idx,
          });
        } else if (tok.type === "number") {
          if (eventChance < 1 && rng() > eventChance) {
            continue;
          }
          const n = parseFloat(tok.text);
          const degree = numberToDegree(n);
          const midi = pickFromScale(params.keyRootMidi + 12, degree, 0);
          events.push({
            track: "melody",
            timeBeats: tq,
            durationBeats: Math.max(step * 2, 0.5),
            midi,
            velocity: 0.7 * melodyLevel,
            tokenIndex: idx,
          });
          const expr = parseNumericExpression(tokens, idx);
          if (expr && expr.usedOperators) {
            const exprDegree = numberToDegree(expr.value);
            const exprMidi = pickFromScale(params.keyRootMidi - 12, exprDegree, 0);
            events.push({
              track: "bass",
              timeBeats: tq + step * 0.5,
              durationBeats: Math.max(step * 2, 0.5),
              midi: exprMidi,
              velocity: 0.65 * bassLevel,
              tokenIndex: idx,
            });
          }
        } else if (tok.type === "keyword") {
          const k = tok.text;

          // Python: def/class で短いモチーフ
          if (tokLang === "python" && (k === "def" || k === "class")) {
            const motif = [0, 2, 4, 2].map((d, j) => ({
              track: "melody" as const,
              timeBeats: tq + j * step,
              durationBeats: step,
              midi: pickFromScale(params.keyRootMidi, d, 1),
              velocity: 0.75 * melodyLevel,
              tokenIndex: idx,
            }));
            events.push(...motif);
          }

          // C/C++: #include/#define は“ノイズ”で区切る
          if ((tokLang === "c" || tokLang === "cpp") && (k === "#include" || k === "#define")) {
            events.push({
              track: "drums",
              timeBeats: tq,
              durationBeats: 0.08,
              velocity: 0.9 * drumLevel,
              drum: "noise",
              tokenIndex: idx,
            });
          }

          // JS: async/await はリズムを詰める
          if (tokLang === "javascript" && (k === "async" || k === "await")) {
            events.push({
              track: "melody",
              timeBeats: tq,
              durationBeats: step,
              midi: pickFromScale(params.keyRootMidi, Math.floor(rng() * 12), 1),
              velocity: 0.85 * melodyLevel,
              tokenIndex: idx,
            });
          }
        } else if (tok.type === "operator") {
          if (eventChance < 1 && rng() > eventChance) {
            continue;
          }
          const hard = tok.text.includes("==") || tok.text.includes("!=") || tok.text.includes("=>");
          events.push({
            track: "drums",
            timeBeats: tq,
            durationBeats: 0.04,
            velocity: (hard ? 0.6 : 0.4) * drumLevel,
            drum: hard ? "snare" : "hat",
            tokenIndex: idx,
          });
        }
      }
    } else {
      let seqIdx = 0;
      while (t < totalBeats && tokens.length > 0) {
        const idx = Math.floor(rng() * tokens.length);
        const tok = tokens[idx].token;
        const tokLang = tokens[idx].lang;
        seqIdx += 1;

        // 16分単位で少しずつ進む（密度で歩幅が変わる）
        const hop = density > 0.6 ? step : (density > 0.25 ? step * 2 : step * 4);

        if (tok.type === "identifier") {
          if (eventChance < 1 && rng() > eventChance) {
            t += hop;
            continue;
          }
          const h = hashStringToUint32(tok.text);
          const degree = (h % 20) - 5;
          const oct = baseOctFor(tokLang) + (tokLang === "python" ? (h % 2) : 0);
          const midi = pickFromScale(params.keyRootMidi, degree, oct);
          events.push({
            track: "melody",
            timeBeats: t + grooveShiftFor(tokLang),
            durationBeats: hop,
            midi,
            velocity: clamp01((0.45 + 0.35 * rng()) * melodyLevel),
            tokenIndex: idx,
          });
        } else if (tok.type === "number") {
          if (eventChance < 1 && rng() > eventChance) {
            t += hop;
            continue;
          }
          const n = parseFloat(tok.text);
          const degree = (Math.floor(n) % 10) - 6;
          const midi = pickFromScale(params.keyRootMidi - 24, degree, 0);
          events.push({
            track: "bass",
            timeBeats: t,
            durationBeats: Math.max(hop, 0.5),
            midi,
            velocity: 0.6 * bassLevel,
            tokenIndex: idx,
          });
        } else if (tok.type === "keyword") {
          const k = tok.text;

          // Python: def/class で短いモチーフ
          if (tokLang === "python" && (k === "def" || k === "class")) {
            const motif = [0, 2, 4, 2].map((d, i) => ({
              track: "melody" as const,
              timeBeats: t + i * step,
              durationBeats: step,
              midi: pickFromScale(params.keyRootMidi, d, 1),
              velocity: 0.75 * melodyLevel,
              tokenIndex: idx,
            }));
            events.push(...motif);
          }

          // C/C++: #include/#define は“ノイズ”で区切る
          if ((tokLang === "c" || tokLang === "cpp") && (k === "#include" || k === "#define")) {
            events.push({
              track: "drums",
              timeBeats: t,
              durationBeats: 0.08,
              velocity: 0.9 * drumLevel,
              drum: "noise",
              tokenIndex: idx,
            });
          }

          // JS: async/await はリズムを詰める
          if (tokLang === "javascript" && (k === "async" || k === "await")) {
            events.push({
              track: "melody",
              timeBeats: t,
              durationBeats: step,
              midi: pickFromScale(params.keyRootMidi, Math.floor(rng() * 12), 1),
              velocity: 0.85 * melodyLevel,
              tokenIndex: idx,
            });
          }
        } else if (tok.type === "operator") {
          if (eventChance < 1 && rng() > eventChance) {
            t += hop;
            continue;
          }
          const hard = tok.text.includes("==") || tok.text.includes("!=") || tok.text.includes("=>");
          events.push({
            track: "drums",
            timeBeats: t,
            durationBeats: 0.04,
            velocity: (hard ? 0.6 : 0.4) * drumLevel,
            drum: hard ? "snare" : "hat",
            tokenIndex: idx,
          });
        }

        t += hop;
      }
    }
  }

  const clipped = events.filter(e => e.timeBeats >= 0 && e.timeBeats < totalBeats);

  return {
    events: clipped.sort((a, b) => a.timeBeats - b.timeBeats),
    meta: { lang: langKey, tokenCount },
  };
}
