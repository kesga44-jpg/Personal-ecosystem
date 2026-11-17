/**
 * Dagboek & stemming (ADR 0020): één privé-notitie per dag met stemming, energie en labels.
 * De inhoud verlaat het apparaat nooit; het dashboard ziet alleen óf er vandaag iets is geschreven.
 */

export const TAGS = ['werk', 'sport', 'familie', 'vrienden', 'relatie', 'slaap', 'gezondheid', 'buiten', 'ontspanning', 'studie', 'reizen', 'creatief'] as const;
export type Tag = (typeof TAGS)[number];

export interface JournalEntry {
  /** Gelijk aan `date`: per dag één notitie. */
  id: string;
  date: string;
  /** 1 (zwaar) t/m 5 (top). */
  mood: number;
  /** 1 (leeg) t/m 5 (vol energie), of null. */
  energy: number | null;
  tags: Tag[];
  /** Maximaal drie korte dingen waar je dankbaar voor bent. */
  gratitude: string[];
  text: string;
  updatedAt: string;
}

export const TEXT_MAX = 5000;
export const GRATITUDE_MAX = 3;
export const GRATITUDE_LENGTH = 200;

export const moodScale = [
  { value: 1, label: 'Zwaar', icon: '😞' },
  { value: 2, label: 'Matig', icon: '🙁' },
  { value: 3, label: 'Neutraal', icon: '😐' },
  { value: 4, label: 'Goed', icon: '🙂' },
  { value: 5, label: 'Top', icon: '😄' }
] as const;

export const energyLabels = ['', 'Leeg', 'Laag', 'Gemiddeld', 'Goed', 'Vol energie'];

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isDateKey(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isScore(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5;
}

export function isTag(value: unknown): value is Tag {
  return typeof value === 'string' && (TAGS as readonly string[]).includes(value);
}

/** Controleert een notitie volledig. Wordt gebruikt bij opslaan én bij herstel van een back-up. */
export function validateEntry(value: unknown, today?: string): asserts value is JournalEntry {
  if (!value || typeof value !== 'object') throw new Error('Ongeldige dagboeknotitie.');
  const entry = value as Partial<JournalEntry>;
  if (!isDateKey(entry.date) || entry.id !== entry.date) throw new Error('Dagboeknotitie heeft een ongeldige datum.');
  if (today && entry.date > today) throw new Error('Je kunt niet vooruit schrijven.');
  if (!isScore(entry.mood)) throw new Error('Kies hoe je je voelt.');
  if (!(entry.energy === null || isScore(entry.energy))) throw new Error('Energie heeft een ongeldige waarde.');
  if (!Array.isArray(entry.tags) || !entry.tags.every(isTag) || new Set(entry.tags).size !== entry.tags.length) {
    throw new Error('Dagboeknotitie bevat ongeldige labels.');
  }
  if (
    !Array.isArray(entry.gratitude) ||
    entry.gratitude.length > GRATITUDE_MAX ||
    !entry.gratitude.every((line) => typeof line === 'string' && line.trim().length > 0 && line.length <= GRATITUDE_LENGTH)
  ) {
    throw new Error(`Dankbaarheid: maximaal ${GRATITUDE_MAX} regels van ${GRATITUDE_LENGTH} tekens.`);
  }
  if (typeof entry.text !== 'string' || entry.text.length > TEXT_MAX) throw new Error(`Een notitie mag maximaal ${TEXT_MAX} tekens hebben.`);
  if (typeof entry.updatedAt !== 'string' || !Number.isFinite(Date.parse(entry.updatedAt))) throw new Error('Dagboeknotitie heeft een ongeldig tijdstip.');
}

export function validateDagboekBackup(input: unknown): void {
  if (!input || typeof input !== 'object' || !('stores' in input) || !input.stores || typeof input.stores !== 'object') {
    throw new Error('Back-up van Dagboek heeft geen geldige gegevenssectie.');
  }
  const stores = input.stores as Record<string, unknown>;
  if (!Array.isArray(stores.entries)) throw new Error('Back-up van Dagboek mist notities.');
  for (const entry of stores.entries) validateEntry(entry);
}

/** Maakt een notitie uit formulierinvoer: tekst bijgesneden, lege dankbaarheidsregels weg, labels in vaste volgorde. */
export function buildEntry(input: { date: string; mood: number; energy: number | null; tags: Tag[]; gratitude: string[]; text: string }, now = new Date()): JournalEntry {
  return {
    id: input.date,
    date: input.date,
    mood: input.mood,
    energy: input.energy,
    tags: TAGS.filter((tag) => input.tags.includes(tag)),
    gratitude: input.gratitude.map((line) => line.trim()).filter(Boolean),
    text: input.text.trim(),
    updatedAt: now.toISOString()
  };
}

function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function dateRange(today: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => shiftDate(today, index - (count - 1)));
}

export function averageMood(entries: JournalEntry[], today: string, window = 7): { value: number; count: number } | null {
  const from = shiftDate(today, -(window - 1));
  const moods = entries.filter((entry) => entry.date >= from && entry.date <= today).map((entry) => entry.mood);
  if (!moods.length) return null;
  return { value: Math.round((moods.reduce((sum, mood) => sum + mood, 0) / moods.length) * 10) / 10, count: moods.length };
}

/** Aantal dagen achter elkaar met een notitie, tot en met vandaag (of gisteren als vandaag nog leeg is). */
export function writingStreak(entries: Pick<JournalEntry, 'date'>[], today: string): number {
  const dates = new Set(entries.map((entry) => entry.date));
  let day = dates.has(today) ? today : shiftDate(today, -1);
  let streak = 0;
  while (dates.has(day)) {
    streak += 1;
    day = shiftDate(day, -1);
  }
  return streak;
}

/** Stemming per dag (0 = niets geschreven) voor een lijn- of kalendergrafiek. */
export function moodSeries(entries: JournalEntry[], today: string, count = 30): { date: string; label: string; value: number }[] {
  const byDate = new Map(entries.map((entry) => [entry.date, entry.mood]));
  return dateRange(today, count).map((date) => ({ date, label: date.slice(8, 10), value: byDate.get(date) ?? 0 }));
}

/**
 * Gemiddelde stemming per label, vergeleken met het totale gemiddelde.
 * Alleen labels met minstens `minimum` notities, zodat één dag geen conclusie wordt.
 */
export function moodByTag(entries: JournalEntry[], minimum = 3): { tag: Tag; average: number; count: number; difference: number }[] {
  if (!entries.length) return [];
  const overall = entries.reduce((sum, entry) => sum + entry.mood, 0) / entries.length;
  return TAGS.map((tag) => {
    const tagged = entries.filter((entry) => entry.tags.includes(tag));
    const average = tagged.length ? tagged.reduce((sum, entry) => sum + entry.mood, 0) / tagged.length : 0;
    return { tag, count: tagged.length, average: Math.round(average * 10) / 10, difference: Math.round((average - overall) * 10) / 10 };
  })
    .filter((item) => item.count >= minimum)
    .sort((a, b) => b.difference - a.difference || a.tag.localeCompare(b.tag));
}

/** Zoeken in eigen notities (tekst, dankbaarheid en labels), hoofdletterongevoelig. */
export function searchEntries(entries: JournalEntry[], query: string, tag: Tag | '' = ''): JournalEntry[] {
  const needle = query.trim().toLocaleLowerCase('nl-NL');
  return entries.filter((entry) => {
    if (tag && !entry.tags.includes(tag)) return false;
    if (!needle) return true;
    return [entry.text, ...entry.gratitude, ...entry.tags].some((part) => part.toLocaleLowerCase('nl-NL').includes(needle));
  });
}

/** Leescontract voor het dashboard (DATA_OWNERSHIP.md): alleen óf er vandaag iets is geschreven. */
export function writtenToday(entries: Pick<JournalEntry, 'date'>[], today: string): boolean {
  return entries.some((entry) => entry.date === today);
}

export function moodInfo(mood: number) {
  return moodScale.find((item) => item.value === mood) ?? moodScale[2];
}
