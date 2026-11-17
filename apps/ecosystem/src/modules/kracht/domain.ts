/**
 * Kracht (ADR 0020, uitbreiding Sport): oefeningen, schema's, trainingen met sets, records en voortgang.
 * Alles lokaal; alleen een zoekterm voor wger gaat via de eigen Worker-route naar buiten.
 */
import { BASIC_EXERCISES, CATEGORIES, EQUIPMENT, KINDS, type Category, type Equipment, type Exercise, type Kind } from './exercises';
import type { WgerExercise } from './wger';

export interface TemplateItem {
  exerciseId: string;
  sets: number;
  /** Doel per set: herhalingen (gewicht/lichaam) of seconden (tijd). */
  target: number;
  restSeconds: number;
}

export interface Template {
  id: string;
  name: string;
  items: TemplateItem[];
  /** Optionele link, bijvoorbeeld naar een Darebee-workout. Alleen https. Inhoud wordt niet overgenomen. */
  link: string | null;
  notes: string;
  updatedAt: string;
}

export interface SetEntry {
  reps: number | null;
  weightKg: number | null;
  seconds: number | null;
}

export interface SessionExercise {
  exerciseId: string;
  /** Kopie van naam en soort, zodat de geschiedenis blijft kloppen als een oefening later verandert. */
  name: string;
  kind: Kind;
  sets: SetEntry[];
}

export interface Session {
  id: string;
  date: string;
  startedAt: string;
  finishedAt: string;
  templateId: string | null;
  name: string;
  exercises: SessionExercise[];
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ISO = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value));

export function isDateKey(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

const isInt = (value: unknown, min: number, max: number): value is number => Number.isInteger(value) && (value as number) >= min && (value as number) <= max;
const isNum = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const shortText = (value: unknown, max: number) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;

/** Alleen https-links, zonder inloggegevens. Geeft de opgeschoonde link of null. */
export function cleanLink(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new Error('Dit is geen geldige link.');
  }
  if (url.protocol !== 'https:' || url.username || url.password || text.length > 300) throw new Error('Gebruik een https-link (maximaal 300 tekens).');
  return url.toString();
}

export function isDarebee(link: string | null): boolean {
  if (!link) return false;
  const host = new URL(link).hostname;
  return host === 'darebee.com' || host.endsWith('.darebee.com');
}

export function validateExercise(value: unknown): asserts value is Exercise {
  if (!value || typeof value !== 'object') throw new Error('Ongeldige oefening.');
  const exercise = value as Partial<Exercise>;
  if (!shortText(exercise.id, 120)) throw new Error('Oefening heeft een ongeldig ID.');
  if (!shortText(exercise.name, 100)) throw new Error('Geef de oefening een naam (maximaal 100 tekens).');
  if (!(CATEGORIES as readonly string[]).includes(exercise.category as string)) throw new Error('Kies een spiergroep.');
  if (!(EQUIPMENT as readonly string[]).includes(exercise.equipment as string)) throw new Error('Kies materiaal.');
  if (!(KINDS as readonly string[]).includes(exercise.kind as string)) throw new Error('Kies hoe je de oefening meet.');
  if (exercise.source !== 'eigen' && exercise.source !== 'wger') throw new Error('Alleen eigen en wger-oefeningen worden opgeslagen.');
  if (exercise.source === 'wger') {
    const wger = exercise.wger;
    if (!wger || !isInt(wger.id, 1, 10_000_000) || !shortText(wger.license, 40) || !/^https?:\/\//.test(wger.licenseUrl ?? '') || !shortText(wger.author, 120)) {
      throw new Error('Een wger-oefening moet licentie en auteur hebben.');
    }
  } else if (exercise.wger !== null) {
    throw new Error('Een eigen oefening heeft geen wger-gegevens.');
  }
}

export function validateTemplate(value: unknown): asserts value is Template {
  if (!value || typeof value !== 'object') throw new Error('Ongeldig schema.');
  const template = value as Partial<Template>;
  if (!shortText(template.id, 120)) throw new Error('Schema heeft een ongeldig ID.');
  if (!shortText(template.name, 80)) throw new Error('Geef het schema een naam (maximaal 80 tekens).');
  if (!Array.isArray(template.items) || template.items.length > 30) throw new Error('Een schema heeft maximaal 30 oefeningen.');
  for (const item of template.items) {
    if (!item || !shortText(item.exerciseId, 120) || !isInt(item.sets, 1, 20) || !isInt(item.target, 1, 3600) || !isInt(item.restSeconds, 0, 900)) {
      throw new Error('Per oefening: 1–20 sets, een doel van 1–3600 en 0–900 seconden rust.');
    }
  }
  if (!(template.link === null || (typeof template.link === 'string' && cleanLink(template.link) === template.link))) throw new Error('Link is ongeldig.');
  if (typeof template.notes !== 'string' || template.notes.length > 1000) throw new Error('Notities mogen maximaal 1000 tekens hebben.');
  if (!ISO(template.updatedAt)) throw new Error('Schema heeft een ongeldig tijdstip.');
}

export function validateSet(set: unknown, kind: Kind): asserts set is SetEntry {
  if (!set || typeof set !== 'object') throw new Error('Ongeldige set.');
  const entry = set as Partial<SetEntry>;
  const reps = entry.reps ?? null;
  const weight = entry.weightKg ?? null;
  const seconds = entry.seconds ?? null;
  if (kind === 'tijd') {
    if (!isInt(seconds, 1, 7200) || reps !== null) throw new Error('Vul per set de tijd in seconden in (1–7200).');
    if (!(weight === null || isNum(weight, 0, 500))) throw new Error('Gewicht moet tussen 0 en 500 kg liggen.');
  } else {
    if (!isInt(reps, 1, 500) || seconds !== null) throw new Error('Vul per set het aantal herhalingen in (1–500).');
    if (kind === 'gewicht' && !isNum(weight, 0, 500)) throw new Error('Vul per set het gewicht in (0–500 kg).');
    if (kind === 'lichaam' && !(weight === null || isNum(weight, 0, 500))) throw new Error('Extra gewicht moet tussen 0 en 500 kg liggen.');
  }
}

export function validateSession(value: unknown, today?: string): asserts value is Session {
  if (!value || typeof value !== 'object') throw new Error('Ongeldige training.');
  const session = value as Partial<Session>;
  if (!shortText(session.id, 120)) throw new Error('Training heeft een ongeldig ID.');
  if (!isDateKey(session.date)) throw new Error('Training heeft een ongeldige datum.');
  if (today && session.date > today) throw new Error('Een training kan niet in de toekomst liggen.');
  if (!ISO(session.startedAt) || !ISO(session.finishedAt) || Date.parse(session.finishedAt!) < Date.parse(session.startedAt!)) throw new Error('Training heeft ongeldige tijden.');
  if (!(session.templateId === null || shortText(session.templateId, 120))) throw new Error('Training verwijst naar een ongeldig schema.');
  if (!shortText(session.name, 80)) throw new Error('Training heeft geen naam.');
  if (!Array.isArray(session.exercises) || session.exercises.length === 0 || session.exercises.length > 30) throw new Error('Een training heeft 1 tot 30 oefeningen.');
  for (const exercise of session.exercises) {
    if (!exercise || !shortText(exercise.exerciseId, 120) || !shortText(exercise.name, 100) || !(KINDS as readonly string[]).includes(exercise.kind)) {
      throw new Error('Training bevat een ongeldige oefening.');
    }
    if (!Array.isArray(exercise.sets) || exercise.sets.length === 0 || exercise.sets.length > 30) throw new Error(`${exercise.name}: leg minstens één set vast.`);
    for (const set of exercise.sets) {
      try {
        validateSet(set, exercise.kind);
      } catch (cause) {
        throw new Error(`${exercise.name}: ${cause instanceof Error ? cause.message : 'ongeldige set'}`);
      }
    }
  }
}

export function validateKrachtBackup(input: unknown): void {
  if (!input || typeof input !== 'object' || !('stores' in input) || !input.stores || typeof input.stores !== 'object') {
    throw new Error('Back-up van Kracht heeft geen geldige gegevenssectie.');
  }
  const stores = input.stores as Record<string, unknown>;
  if (!Array.isArray(stores.exercises) || !Array.isArray(stores.templates) || !Array.isArray(stores.sessions)) {
    throw new Error('Back-up van Kracht mist oefeningen, schema’s of trainingen.');
  }
  for (const exercise of stores.exercises) validateExercise(exercise);
  for (const template of stores.templates) validateTemplate(template);
  for (const session of stores.sessions) validateSession(session);
}

export function exerciseFromWger(item: WgerExercise, category: Category, equipment: Equipment, kind: Kind): Exercise {
  return {
    id: `wger:${item.id}`,
    name: item.nameNl ?? item.name,
    category,
    equipment,
    kind,
    source: 'wger',
    wger: { id: item.id, license: item.license, licenseUrl: item.licenseUrl, author: item.author }
  };
}

/** Alle beschikbare oefeningen: ingebouwd plus eigen en overgenomen, op naam gesorteerd. */
export function allExercises(own: Exercise[]): Exercise[] {
  return [...BASIC_EXERCISES, ...own].sort((a, b) => a.name.localeCompare(b.name, 'nl'));
}

/** Geschatte maximale kracht voor één herhaling (Epley). Alleen voor 1–12 herhalingen; daarboven te onbetrouwbaar. */
export function estimatedOneRepMax(weightKg: number, reps: number): number | null {
  if (weightKg <= 0 || reps < 1 || reps > 12) return null;
  return Math.round(weightKg * (1 + (reps === 1 ? 0 : reps / 30)) * 10) / 10;
}

/** Volume van een oefening: som van herhalingen × kg (alleen sets met gewicht). */
export function exerciseVolume(exercise: SessionExercise): number {
  return Math.round(exercise.sets.reduce((sum, set) => sum + (set.reps ?? 0) * (set.weightKg ?? 0), 0));
}

export function sessionVolume(session: Session): number {
  return session.exercises.reduce((sum, exercise) => sum + exerciseVolume(exercise), 0);
}

export function sessionMinutes(session: Session): number {
  return Math.max(1, Math.round((Date.parse(session.finishedAt) - Date.parse(session.startedAt)) / 60_000));
}

export interface ExerciseRecord {
  exerciseId: string;
  name: string;
  kind: Kind;
  /** Zwaarste set (kg) bij gewicht, meeste herhalingen bij lichaamsgewicht, langste tijd bij tijd. */
  best: number;
  bestDate: string;
  /** Hoogste geschatte 1RM (alleen bij gewicht). */
  oneRepMax: number | null;
}

function bestOf(exercise: SessionExercise): { best: number; oneRepMax: number | null } {
  let best = 0;
  let oneRepMax: number | null = null;
  for (const set of exercise.sets) {
    const value = exercise.kind === 'gewicht' ? set.weightKg ?? 0 : exercise.kind === 'lichaam' ? set.reps ?? 0 : set.seconds ?? 0;
    best = Math.max(best, value);
    if (exercise.kind === 'gewicht' && set.weightKg && set.reps) {
      const estimate = estimatedOneRepMax(set.weightKg, set.reps);
      if (estimate !== null) oneRepMax = Math.max(oneRepMax ?? 0, estimate);
    }
  }
  return { best, oneRepMax };
}

/** Persoonlijke records per oefening over alle trainingen. */
export function personalRecords(sessions: Session[]): ExerciseRecord[] {
  const records = new Map<string, ExerciseRecord>();
  for (const session of [...sessions].sort((a, b) => a.date.localeCompare(b.date) || a.finishedAt.localeCompare(b.finishedAt))) {
    for (const exercise of session.exercises) {
      const { best, oneRepMax } = bestOf(exercise);
      const current = records.get(exercise.exerciseId);
      if (!current) {
        records.set(exercise.exerciseId, { exerciseId: exercise.exerciseId, name: exercise.name, kind: exercise.kind, best, bestDate: session.date, oneRepMax });
        continue;
      }
      if (best > current.best) Object.assign(current, { best, bestDate: session.date });
      if (oneRepMax !== null && (current.oneRepMax === null || oneRepMax > current.oneRepMax)) current.oneRepMax = oneRepMax;
      current.name = exercise.name;
    }
  }
  return [...records.values()].sort((a, b) => a.name.localeCompare(b.name, 'nl'));
}

/** Welke oefeningen in deze training een nieuw record halen ten opzichte van eerdere trainingen. */
export function newRecords(session: Session, earlier: Session[]): string[] {
  const before = new Map(personalRecords(earlier.filter((item) => item.id !== session.id)).map((record) => [record.exerciseId, record]));
  return session.exercises
    .filter((exercise) => {
      const previous = before.get(exercise.exerciseId);
      const { best } = bestOf(exercise);
      return previous ? best > previous.best : false;
    })
    .map((exercise) => exercise.name);
}

/** Voortgang van één oefening: per training het beste resultaat (of de geschatte 1RM bij gewicht). */
export function progression(sessions: Session[], exerciseId: string): { date: string; label: string; value: number }[] {
  return sessions
    .filter((session) => session.exercises.some((exercise) => exercise.exerciseId === exerciseId))
    .sort((a, b) => a.date.localeCompare(b.date) || a.finishedAt.localeCompare(b.finishedAt))
    .map((session) => {
      const exercise = session.exercises.find((item) => item.exerciseId === exerciseId)!;
      const { best, oneRepMax } = bestOf(exercise);
      return { date: session.date, label: `${session.date.slice(8, 10)}-${session.date.slice(5, 7)}`, value: oneRepMax ?? best };
    });
}

function mondayOf(date: string): string {
  const value = new Date(`${date}T12:00:00Z`);
  const day = (value.getUTCDay() + 6) % 7;
  value.setUTCDate(value.getUTCDate() - day);
  return value.toISOString().slice(0, 10);
}

function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** Aantal trainingen en volume per week (maandag t/m zondag), laatste `count` weken. */
export function weeklySummary(sessions: Session[], today: string, count = 8): { week: string; label: string; sessions: number; volume: number }[] {
  const thisWeek = mondayOf(today);
  return Array.from({ length: count }, (_, index) => {
    const week = shiftDate(thisWeek, -7 * (count - 1 - index));
    const end = shiftDate(week, 6);
    const inWeek = sessions.filter((session) => session.date >= week && session.date <= end);
    return { week, label: `${week.slice(8, 10)}-${week.slice(5, 7)}`, sessions: inWeek.length, volume: inWeek.reduce((sum, session) => sum + sessionVolume(session), 0) };
  });
}

/** Leescontract voor het dashboard (DATA_OWNERSHIP.md): alleen het aantal trainingen deze week. */
export function sessionsThisWeek(sessions: Pick<Session, 'date'>[], today: string): number {
  const start = mondayOf(today);
  return sessions.filter((session) => session.date >= start && session.date <= today).length;
}

/** Lege sets voor een oefening uit een schema, met het doel alvast ingevuld. */
export function plannedSets(kind: Kind, item: Pick<TemplateItem, 'sets' | 'target'> | null, lastWeight: number | null): SetEntry[] {
  const count = item?.sets ?? 3;
  return Array.from({ length: count }, () =>
    kind === 'tijd'
      ? { reps: null, weightKg: null, seconds: item?.target ?? 30 }
      : { reps: item?.target ?? 10, weightKg: kind === 'gewicht' ? lastWeight ?? 0 : null, seconds: null }
  );
}

/** Laatst gebruikte gewicht voor een oefening (zwaarste set van de meest recente training). */
export function lastWeight(sessions: Session[], exerciseId: string): number | null {
  const latest = [...sessions].sort((a, b) => b.date.localeCompare(a.date) || b.finishedAt.localeCompare(a.finishedAt)).find((session) => session.exercises.some((exercise) => exercise.exerciseId === exerciseId));
  if (!latest) return null;
  const weights = latest.exercises.find((exercise) => exercise.exerciseId === exerciseId)!.sets.map((set) => set.weightKg ?? 0);
  return Math.max(0, ...weights) || null;
}
