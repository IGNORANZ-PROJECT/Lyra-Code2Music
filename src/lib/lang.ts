export const SUPPORTED_LANGS = ["python", "c", "cpp", "java", "csharp", "javascript"] as const;
export type SupportedLang = typeof SUPPORTED_LANGS[number];

const EXT_MAP: Record<string, SupportedLang> = {
  ".py": "python",
  ".c": "c",
  ".cpp": "cpp",
  ".cc": "cpp",
  ".cxx": "cpp",
  ".java": "java",
  ".cs": "csharp",
  ".js": "javascript",
};

export function detectLanguageFromFilename(filename: string): SupportedLang | null {
  const lower = filename.toLowerCase();
  const dot = lower.lastIndexOf(".");
  if (dot < 0) return null;
  const ext = lower.slice(dot);
  return EXT_MAP[ext] ?? null;
}
