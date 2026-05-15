export interface HistoryItem {
  id: string;
  platform: string;
  title: string;
  thumbnail: string;
  channel: string;
  duration?: number;
  views?: number;
  watchedAt: number;
}

const KEY = 'wr_watch_history';
const MAX = 60;

export function saveToHistory(item: Omit<HistoryItem, 'watchedAt'>) {
  if (typeof window === 'undefined') return;
  const prev = getHistory().filter(h => !(h.id === item.id && h.platform === item.platform));
  localStorage.setItem(KEY, JSON.stringify([{ ...item, watchedAt: Date.now() }, ...prev].slice(0, MAX)));
}

export function getHistory(): HistoryItem[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}

export function clearHistory() {
  if (typeof window !== 'undefined') localStorage.removeItem(KEY);
}

// ── Recommendation engine ──────────────────────────────────────────────────
const STOP = new Set([
  'video','oficial','official','lyrics','audio','feat','live','music','the','and','for',
  'you','with','this','that','from','pero','para','con','que','una','los','las','del',
  'por','ver','este','esta','como','cuando','donde','todo','solo','aqui','tiene',
  'feat.','mix','remix','full','cover','letra','clip','2023','2024','2025',
]);

export interface TasteProfile {
  topChannels: string[];
  topWords: string[];
  queries: string[];
}

export function buildTasteProfile(history: HistoryItem[]): TasteProfile {
  const channels: Record<string, number> = {};
  const words: Record<string, number> = {};

  history.slice(0, 30).forEach((item, i) => {
    const w = 30 - i; // recency weight
    if (item.channel) channels[item.channel] = (channels[item.channel] || 0) + w * 2;

    item.title
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 3 && !STOP.has(t))
      .forEach(t => { words[t] = (words[t] || 0) + w; });
  });

  const topChannels = Object.entries(channels)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([c]) => c);

  const topWords = Object.entries(words)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([w]) => w);

  // Build diverse queries
  const queries: string[] = [
    ...topChannels.slice(0, 3),
    topWords.slice(0, 2).join(' '),
    topWords.slice(2, 4).join(' '),
    topWords.slice(4, 6).join(' '),
  ].filter(q => q.trim().length > 1);

  return { topChannels, topWords, queries: [...new Set(queries)].slice(0, 5) };
}
