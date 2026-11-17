// Centralized writing-quality check for application-authored and AI-generated text.
// It never edits client answers or exact quotes; quotes with problems are flagged, not changed.

const STOCK_PHRASES = [
  'unlock your potential', 'game-changing', 'game changing', 'delve into', 'delves into', 'seamless journey',
  "in today's fast-paced world", 'in today’s fast-paced world', 'take it to the next level', 'transform your business',
  'leverage the power of', 'a testament to', "it's important to note", 'it’s important to note',
  'great insight', 'excellent answer', 'great question', 'unleash', 'supercharge', 'revolutionize', 'cutting-edge',
  'in conclusion', 'at the end of the day', 'synergy',
];
const DASH = /[–—]/;

export type QualityIssue = { path: string; kind: 'em_dash' | 'stock_phrase' | 'repetition'; detail: string };

const QUOTE_KEYS = new Set(['quote', 'quotes', 'exactQuote', 'exactQuotes', 'clientQuote', 'clientWords']);

export function checkText(text: string, path = ''): QualityIssue[] {
  const issues: QualityIssue[] = [];
  if (DASH.test(text)) issues.push({ path, kind: 'em_dash', detail: 'Contains an em or en dash.' });
  const low = text.toLowerCase();
  for (const p of STOCK_PHRASES) if (low.includes(p)) issues.push({ path, kind: 'stock_phrase', detail: `Uses "${p}".` });
  // Same sentence opener three or more times in one passage reads as formulaic.
  const openers = text.split(/(?<=[.!?])\s+/).map((s) => s.trim().split(/\s+/).slice(0, 2).join(' ').toLowerCase()).filter((s) => s.length > 3);
  const counts = new Map<string, number>();
  for (const o of openers) counts.set(o, (counts.get(o) ?? 0) + 1);
  for (const [o, n] of counts) if (n >= 3) issues.push({ path, kind: 'repetition', detail: `Starts ${n} sentences with "${o}".` });
  return issues;
}

// Walks a generated object and checks every string, skipping exact client quotes.
export function checkOutput(value: unknown, path = ''): QualityIssue[] {
  if (typeof value === 'string') return checkText(value, path);
  if (Array.isArray(value)) return value.flatMap((v, i) => checkOutput(v, `${path}[${i}]`));
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => (QUOTE_KEYS.has(k) ? [] : checkOutput(v, path ? `${path}.${k}` : k)));
  }
  return [];
}

// Safe correction used only after the retry budget is spent: dashes become commas or periods.
// Meaning is unchanged; quotes are left alone.
export function fixDashes<T>(value: T, inQuote = false): T {
  if (typeof value === 'string') {
    if (inQuote) return value;
    return value
      .replace(/\s*[–—]\s*$/g, '.')
      .replace(/(\d)\s*[–]\s*(\d)/g, '$1 to $2')
      .replace(/\s*[–—]\s*/g, ', ') as unknown as T;
  }
  if (Array.isArray(value)) return value.map((v) => fixDashes(v, inQuote)) as unknown as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fixDashes(v, inQuote || QUOTE_KEYS.has(k))])) as T;
  }
  return value;
}

// Quotes attributed to the client must appear in the source exactly. Returns the ones that do not.
export function unverifiedQuotes(value: unknown, source: string): string[] {
  const norm = (s: string) => s.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();
  const src = norm(source);
  const found: string[] = [];
  const walk = (v: unknown, inQuote: boolean) => {
    if (typeof v === 'string') { if (inQuote && v.trim() && !src.includes(norm(v).replace(/^"|"$/g, ''))) found.push(v); return; }
    if (Array.isArray(v)) { v.forEach((x) => walk(x, inQuote)); return; }
    if (v && typeof v === 'object') Object.entries(v).forEach(([k, x]) => walk(x, inQuote || QUOTE_KEYS.has(k)));
  };
  walk(value, false);
  return found;
}
