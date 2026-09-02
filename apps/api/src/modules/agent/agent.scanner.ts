export interface ScanMatch {
  severity: "warning" | "high";
  keyword: string;
  excerpt: string;
}

function normalizeKeywords(value: string[]) {
  return [...new Set(value.map((item) => item.trim()).filter(Boolean).map((item) => item.toLocaleLowerCase()))];
}

export function scanText(text: string, warningKeywords: string[], blockedKeywords: string[]): ScanMatch[] {
  const normalized = text.toLocaleLowerCase();
  const matches: ScanMatch[] = [];
  for (const keyword of normalizeKeywords(blockedKeywords)) {
    const position = normalized.indexOf(keyword);
    if (position >= 0) matches.push({ severity: "high", keyword, excerpt: redact(text, position, keyword.length) });
  }
  for (const keyword of normalizeKeywords(warningKeywords)) {
    const position = normalized.indexOf(keyword);
    if (position >= 0 && !matches.some((match) => match.keyword === keyword)) {
      matches.push({ severity: "warning", keyword, excerpt: redact(text, position, keyword.length) });
    }
  }
  return matches;
}

function redact(text: string, position: number, length: number) {
  const start = Math.max(0, position - 12);
  const end = Math.min(text.length, position + length + 12);
  return `${start > 0 ? "…" : ""}${text.slice(start, position)}${"*".repeat(Math.min(length, 8))}${text.slice(position + length, end)}${end < text.length ? "…" : ""}`;
}
