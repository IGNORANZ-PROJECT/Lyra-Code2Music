import type { SupportedLang } from "./lang";

export type TokenType =
  | "keyword"
  | "identifier"
  | "number"
  | "string"
  | "comment"
  | "operator"
  | "punct"
  | "whitespace"
  | "unknown";

export type Token = {
  type: TokenType;
  text: string;
  start: number;
  end: number;
  line: number;
  col: number;
};

const KEYWORDS: Record<SupportedLang, Set<string>> = {
  python: new Set([
    "def","class","return","if","elif","else","for","while","try","except","finally","with",
    "import","from","as","lambda","yield","break","continue","pass","True","False","None"
  ]),
  c: new Set([
    "int","float","double","char","void","struct","typedef","return","if","else","for","while","do",
    "switch","case","break","continue","#include","#define","static","const","unsigned","signed","sizeof"
  ]),
  cpp: new Set([
    "namespace","template","typename","class","struct","auto","constexpr","nullptr","new","delete",
    "public","private","protected","virtual","override","return","if","else","for","while","switch",
    "case","break","continue","#include","#define","using","std"
  ]),
  java: new Set([
    "class","interface","enum","public","private","protected","static","final","void","int","long","float",
    "double","boolean","char","new","return","if","else","for","while","switch","case","break","continue",
    "try","catch","finally","import","package","this","super"
  ]),
  csharp: new Set([
    "class","interface","struct","enum","public","private","protected","internal","static","readonly","const",
    "void","int","long","float","double","bool","char","string","new","return","if","else","for","foreach",
    "while","switch","case","break","continue","try","catch","finally","using","namespace","this","base",
    "async","await"
  ]),
  javascript: new Set([
    "function","class","return","if","else","for","while","switch","case","break","continue","try","catch",
    "finally","import","export","from","const","let","var","new","this","super","async","await","yield"
  ]),
};

export function tokenize(code: string, lang: SupportedLang): Token[] {
  // MVP用の軽量 lexer：コメント/文字列/数値/識別子/演算子を拾う（実行はしない）
  const tokens: Token[] = [];
  const kw = KEYWORDS[lang];

  const re =
    /\/\/.*?$|\/\*[\s\S]*?\*\/|#.*?$|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b\d+(?:\.\d+)?\b|[A-Za-z_]\w*|==|!=|<=|>=|=>|\+\+|--|\|\||&&|[+\-*/%=&|^!<>?:]+|[()[\]{}.,;]|[\s]+|./gm;

  let line = 1;
  let col = 1;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) {
    const text = m[0];
    const start = m.index;
    const end = start + text.length;
    const tokenBase = { text, start, end, line, col };
    if (/^\s+$/.test(text)) {
      tokens.push({ type: "whitespace", ...tokenBase });
    } else if (/^(\/\/|\/\*|#)/.test(text)) {
      tokens.push({ type: "comment", ...tokenBase });
    } else if (/^["'`]/.test(text)) {
      tokens.push({ type: "string", ...tokenBase });
    } else if (/^\d/.test(text)) {
      tokens.push({ type: "number", ...tokenBase });
    } else if (/^[A-Za-z_]\w*$/.test(text)) {
      tokens.push({ type: kw.has(text) ? "keyword" : "identifier", ...tokenBase });
    } else if (/^[()[\]{}.,;]$/.test(text)) {
      tokens.push({ type: "punct", ...tokenBase });
    } else if (/^[+\-*/%=&|^!<>?:]+$/.test(text)) {
      tokens.push({ type: "operator", ...tokenBase });
    } else {
      tokens.push({ type: "unknown", ...tokenBase });
    }
    for (let i = 0; i < text.length; i += 1) {
      if (text[i] === "\n") {
        line += 1;
        col = 1;
      } else {
        col += 1;
      }
    }
  }
  return tokens;
}
