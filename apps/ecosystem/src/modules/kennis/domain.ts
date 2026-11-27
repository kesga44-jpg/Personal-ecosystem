/**
 * Kennis & Ontwikkeling (ADR 0023 § 2–4, A6): bronnen (boeken, podcasts, cursussen, artikelen), makers,
 * highlights, inzichten, het vijfstappen-studieprogramma met 30-dagenmeting en het logboek voor dagelijks
 * lezen en luisteren. Persoonlijke voetbalkennis is de categorie Voetbal (besluit 2026-11-22).
 *
 * Kennis deelt de database `personal-ecosystem-groei` met Groei. Relaties met doelen, vaardigheden en acties
 * zijn ID-velden in het bronrecord (ADR 0024 § 6). Een verwijzing naar een record dat niet meer bestaat,
 * wordt getoond als "Niet meer beschikbaar" en nooit automatisch gewist.
 */
import { toLookupItems, type ImportOrigin, type LookupItem } from '@ecosystem/core';

export const SOURCE_TYPES = ['boek', 'podcast', 'cursus', 'artikel', 'video', 'document', 'overig'] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];
export const SOURCE_STATUSES = ['wil ik', 'bezig', 'afgerond', 'gestopt'] as const;
export type SourceStatus = (typeof SOURCE_STATUSES)[number];
/** Categorieën. `voetbal` = persoonlijke trainerskennis; geen spelersgegevens (ADR 0028 § 2). */
export const CATEGORIES = ['algemeen', 'voetbal'] as const;
export type Category = (typeof CATEGORIES)[number];
export const CREATOR_ROLES = ['auteur', 'spreker', 'docent', 'overig'] as const;
export type CreatorRole = (typeof CREATOR_ROLES)[number];
export const LOG_KINDS = ['lezen', 'luisteren', 'kijken', 'studeren'] as const;
export type LogKind = (typeof LOG_KINDS)[number];

/** De vijf stappen, letterlijk (ADR 0023 § 4). Gelijk aan Groei. */
export const STUDY_STEPS = ['Study the material', 'Extract 3 best ideas', 'Act and implement', 'Measure improvement (30 days)', 'Review and adjust'] as const;
export const MEASURE_DAYS = 30;

interface Base {
  id: string;
  createdAt: string;
  updatedAt: string;
  origin?: ImportOrigin;
}

export interface Source extends Base {
  title: string;
  type: SourceType;
  category: Category;
  creatorIds: string[];
  labels: string[];
  platform: string;
  url: string;
  status: SourceStatus;
  /** 0–100 %. */
  progress: number;
  startedAt: string | null;
  finishedAt: string | null;
  /** 1–5 of null. */
  rating: number | null;
  favorite: boolean;
  summary: string;
  notes: string;
  /** ID-velden naar Groei (zelfde database, ADR 0024 § 6). */
  goalIds: string[];
  skillIds: string[];
}

export interface Creator extends Base {
  name: string;
  role: CreatorRole;
}

export interface Highlight extends Base {
  /** Null = ongekoppelde highlight (bijv. uit een import zonder bron). */
  sourceId: string | null;
  text: string;
  /** Pagina, hoofdstuk of tijdstip. */
  location: string;
  note: string;
}

export interface Insight extends Base {
  title: string;
  text: string;
  category: Category;
  sourceId: string | null;
  highlightIds: string[];
  goalIds: string[];
  skillIds: string[];
}

export interface StudyStep {
  done: boolean;
  note: string;
  doneAt: string | null;
}

export interface StudyProgram extends Base {
  sourceId: string;
  /** Vijf stappen in vaste volgorde. */
  steps: StudyStep[];
  /** Begin van de 30-dagenmeting (stap 4), of null. */
  measureStart: string | null;
  measureResult: string;
}

export interface LearningLog {
  id: string;
  date: string;
  kind: LogKind;
  minutes: number;
  sourceId: string | null;
  note: string;
  createdAt: string;
}

export const KENNIS_STORES = ['sources', 'creators', 'highlights', 'insights', 'studyPrograms', 'learningLog'] as const;

export const TITLE_MAX = 300;
export const TEXT_MAX = 20000;
export const LABEL_MAX = 40;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isDateKey(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function fail(message: string): never {
  throw new Error(message);
}

function obj(value: unknown, what: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`Ongeldig(e) ${what}.`);
  return value as Record<string, unknown>;
}

function str(value: unknown, max: number, what: string, required = false): void {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) fail(required ? `${what}: verplicht, maximaal ${max} tekens.` : `${what}: te lang of ongeldig.`);
}

function oneOf(value: unknown, list: readonly string[], what: string): void {
  if (typeof value !== 'string' || !list.includes(value)) fail(`${what}: ongeldige waarde.`);
}

function ids(value: unknown, what: string): void {
  if (!Array.isArray(value) || !value.every((id) => typeof id === 'string' && id.length > 0) || new Set(value).size !== value.length) fail(`${what}: ongeldige verwijzingen.`);
}

function optId(value: unknown, what: string): void {
  if (!(value === null || (typeof value === 'string' && value.length > 0))) fail(`${what}: ongeldige verwijzing.`);
}

function optDate(value: unknown, what: string): void {
  if (!(value === null || isDateKey(value))) fail(`${what}: ongeldige datum.`);
}

function intIn(value: unknown, min: number, max: number): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

function base(r: Record<string, unknown>, what: string): void {
  if (typeof r.id !== 'string' || !r.id) fail(`${what}: ontbrekende ID.`);
  for (const key of ['createdAt', 'updatedAt']) {
    if (typeof r[key] !== 'string' || !Number.isFinite(Date.parse(r[key] as string))) fail(`${what}: ongeldig tijdstip.`);
  }
  if (r.origin !== undefined) obj(r.origin, `${what}: herkomst`);
}

export function validateSource(value: unknown): asserts value is Source {
  const r = obj(value, 'bron');
  base(r, 'Bron');
  str(r.title, TITLE_MAX, 'Titel', true);
  oneOf(r.type, SOURCE_TYPES, 'Soort bron');
  oneOf(r.category, CATEGORIES, 'Categorie');
  ids(r.creatorIds, 'Makers');
  if (!Array.isArray(r.labels) || !r.labels.every((label) => typeof label === 'string' && label.trim() && label.length <= LABEL_MAX)) fail('Labels: ongeldig.');
  str(r.platform, TITLE_MAX, 'Platform');
  str(r.url, 2000, 'Link');
  if (typeof r.url === 'string' && r.url && !/^https?:\/\//i.test(r.url)) fail('Link: begin met http:// of https://.');
  oneOf(r.status, SOURCE_STATUSES, 'Status');
  if (!intIn(r.progress, 0, 100)) fail('Voortgang: geheel getal van 0 tot 100.');
  optDate(r.startedAt, 'Begonnen');
  optDate(r.finishedAt, 'Afgerond');
  if (typeof r.startedAt === 'string' && typeof r.finishedAt === 'string' && r.finishedAt < r.startedAt) fail('Afgerond ligt vóór begonnen.');
  if (!(r.rating === null || intIn(r.rating, 1, 5))) fail('Waardering: 1 tot 5.');
  if (typeof r.favorite !== 'boolean') fail('Favoriet: ongeldig.');
  str(r.summary, TEXT_MAX, 'Samenvatting');
  str(r.notes, TEXT_MAX, 'Notities');
  ids(r.goalIds, 'Doelen');
  ids(r.skillIds, 'Vaardigheden');
}

export function validateCreator(value: unknown): asserts value is Creator {
  const r = obj(value, 'maker');
  base(r, 'Maker');
  str(r.name, TITLE_MAX, 'Naam', true);
  oneOf(r.role, CREATOR_ROLES, 'Rol');
}

export function validateHighlight(value: unknown): asserts value is Highlight {
  const r = obj(value, 'highlight');
  base(r, 'Highlight');
  optId(r.sourceId, 'Highlight');
  str(r.text, TEXT_MAX, 'Highlight', true);
  str(r.location, TITLE_MAX, 'Plaats');
  str(r.note, TEXT_MAX, 'Notitie');
}

export function validateInsight(value: unknown): asserts value is Insight {
  const r = obj(value, 'inzicht');
  base(r, 'Inzicht');
  str(r.title, TITLE_MAX, 'Inzicht', true);
  str(r.text, TEXT_MAX, 'Toelichting');
  oneOf(r.category, CATEGORIES, 'Categorie');
  optId(r.sourceId, 'Inzicht');
  ids(r.highlightIds, 'Highlights');
  ids(r.goalIds, 'Doelen');
  ids(r.skillIds, 'Vaardigheden');
}

export function validateStudyProgram(value: unknown): asserts value is StudyProgram {
  const r = obj(value, 'studieprogramma');
  base(r, 'Studieprogramma');
  if (typeof r.sourceId !== 'string' || !r.sourceId) fail('Studieprogramma: kies een bron.');
  if (!Array.isArray(r.steps) || r.steps.length !== STUDY_STEPS.length) fail('Studieprogramma: precies vijf stappen.');
  for (const step of r.steps as unknown[]) {
    const s = obj(step, 'stap');
    if (typeof s.done !== 'boolean') fail('Stap: ongeldige status.');
    str(s.note, TEXT_MAX, 'Stap');
    optDate(s.doneAt, 'Stap');
    if (s.done !== (s.doneAt !== null)) fail('Stap: een afgevinkte stap heeft een datum, een open stap niet.');
  }
  optDate(r.measureStart, 'Meting');
  str(r.measureResult, TEXT_MAX, 'Meetresultaat');
}

export function validateLearningLog(value: unknown): asserts value is LearningLog {
  const r = obj(value, 'logregel');
  if (typeof r.id !== 'string' || !r.id) fail('Logboek: ontbrekende ID.');
  if (!isDateKey(r.date)) fail('Logboek: ongeldige datum.');
  oneOf(r.kind, LOG_KINDS, 'Logboek');
  if (!intIn(r.minutes, 1, 1440)) fail('Logboek: minuten tussen 1 en 1440.');
  optId(r.sourceId, 'Logboek');
  str(r.note, TEXT_MAX, 'Logboek');
  if (typeof r.createdAt !== 'string' || !Number.isFinite(Date.parse(r.createdAt))) fail('Logboek: ongeldig tijdstip.');
}

/** Controle van de Kennis-stores in een back-up (schemaversie 2 van `personal-ecosystem-groei`). */
export function validateKennisStores(stores: Record<string, unknown>): void {
  for (const store of KENNIS_STORES) if (!Array.isArray(stores[store])) fail(`Back-up van Kennis mist "${store}".`);
  (stores.sources as unknown[]).forEach(validateSource);
  (stores.creators as unknown[]).forEach(validateCreator);
  (stores.highlights as unknown[]).forEach(validateHighlight);
  (stores.insights as unknown[]).forEach(validateInsight);
  (stores.studyPrograms as unknown[]).forEach(validateStudyProgram);
  (stores.learningLog as unknown[]).forEach(validateLearningLog);
}

// ——— Bouwen en berekenen ———

export function newStudyProgram(sourceId: string, id: string, now = new Date()): StudyProgram {
  const iso = now.toISOString();
  return { id, sourceId, steps: STUDY_STEPS.map(() => ({ done: false, note: '', doneAt: null })), measureStart: null, measureResult: '', createdAt: iso, updatedAt: iso };
}

/** Vinkt een stap aan of uit. Stap 3 (Act and implement) afvinken start de 30-dagenmeting van stap 4, als die nog niet liep. */
export function toggleStudyStep(program: StudyProgram, index: number, today: string, now = new Date()): StudyProgram {
  const steps = program.steps.map((step, position) => (position === index ? { ...step, done: !step.done, doneAt: step.done ? null : today } : step));
  const measureStart = index === 2 && !program.steps[2]!.done && !program.measureStart ? today : program.measureStart;
  return { ...program, steps, measureStart, updatedAt: now.toISOString() };
}

export function addDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** Stand van de 30-dagenmeting: nog niet gestart, loopt (dagen over) of klaar om te meten. */
export function measureState(program: StudyProgram, today: string): { state: 'niet gestart' } | { state: 'loopt'; daysLeft: number; due: string } | { state: 'meten'; due: string } {
  if (!program.measureStart) return { state: 'niet gestart' };
  const due = addDays(program.measureStart, MEASURE_DAYS);
  if (today >= due) return { state: 'meten', due };
  const left = Math.round((Date.parse(`${due}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
  return { state: 'loopt', daysLeft: left, due };
}

export function programProgress(program: StudyProgram): number {
  return Math.round((program.steps.filter((step) => step.done).length / STUDY_STEPS.length) * 100);
}

/** Zet de status van een bron en houdt data en voortgang consistent. */
export function withSourceStatus(source: Source, status: SourceStatus, today: string, now = new Date()): Source {
  return {
    ...source,
    status,
    startedAt: status === 'wil ik' ? source.startedAt : source.startedAt ?? today,
    finishedAt: status === 'afgerond' ? source.finishedAt ?? today : status === 'gestopt' ? source.finishedAt : null,
    progress: status === 'afgerond' ? 100 : source.progress,
    updatedAt: now.toISOString()
  };
}

export type SourceSort = 'titel' | 'gewijzigd' | 'waardering' | 'afgerond';

export function filterSources(
  sources: readonly Source[],
  options: { query?: string; type?: SourceType | ''; status?: SourceStatus | ''; category?: Category | ''; label?: string; favorite?: boolean; sort?: SourceSort },
  creatorName: (id: string) => string = () => ''
): Source[] {
  const needle = (options.query ?? '').trim().toLocaleLowerCase('nl-NL');
  const list = sources.filter((source) => {
    if (options.type && source.type !== options.type) return false;
    if (options.status && source.status !== options.status) return false;
    if (options.category && source.category !== options.category) return false;
    if (options.label && !source.labels.includes(options.label)) return false;
    if (options.favorite && !source.favorite) return false;
    if (!needle) return true;
    return [source.title, source.summary, source.notes, source.platform, ...source.labels, ...source.creatorIds.map(creatorName)].some((part) => part.toLocaleLowerCase('nl-NL').includes(needle));
  });
  const sort = options.sort ?? 'gewijzigd';
  return list.sort((a, b) => {
    if (sort === 'titel') return a.title.localeCompare(b.title, 'nl-NL');
    if (sort === 'waardering') return (b.rating ?? 0) - (a.rating ?? 0) || a.title.localeCompare(b.title, 'nl-NL');
    if (sort === 'afgerond') return (b.finishedAt ?? '').localeCompare(a.finishedAt ?? '') || a.title.localeCompare(b.title, 'nl-NL');
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}

export function allLabels(sources: readonly Source[]): string[] {
  return [...new Set(sources.flatMap((source) => source.labels))].sort((a, b) => a.localeCompare(b, 'nl-NL'));
}

/** "a, b,  c" → ["a","b","c"], uniek, zonder lege labels. */
export function parseLabels(input: string): string[] {
  return [...new Set(input.split(',').map((label) => label.trim()).filter(Boolean))];
}

export function searchText<T extends { text: string; note?: string; title?: string }>(items: readonly T[], query: string): T[] {
  const needle = query.trim().toLocaleLowerCase('nl-NL');
  if (!needle) return [...items];
  return items.filter((item) => [item.title ?? '', item.text, item.note ?? ''].some((part) => part.toLocaleLowerCase('nl-NL').includes(needle)));
}

export function weekStart(date: string): string {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return addDays(date, -((day + 6) % 7));
}

/** Minuten per week (laatste `weeks` weken, oudste eerst). */
export function minutesPerWeek(log: readonly LearningLog[], today: string, weeks = 8): { week: string; minutes: number }[] {
  const current = weekStart(today);
  return Array.from({ length: weeks }, (_, index) => {
    const start = addDays(current, -7 * (weeks - 1 - index));
    const end = addDays(start, 6);
    return { week: start, minutes: log.filter((entry) => entry.date >= start && entry.date <= end).reduce((sum, entry) => sum + entry.minutes, 0) };
  });
}

/** Dagen achter elkaar met een logregel, tot en met vandaag of gisteren. */
export function learningStreak(log: readonly Pick<LearningLog, 'date'>[], today: string): number {
  const dates = new Set(log.map((entry) => entry.date));
  let day = dates.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (dates.has(day)) {
    streak += 1;
    day = addDays(day, -1);
  }
  return streak;
}

export function finishedInYear(sources: readonly Source[], year: string): number {
  return sources.filter((source) => source.status === 'afgerond' && source.finishedAt?.startsWith(year)).length;
}

// ——— Leescontracten ———

/** Lookup van Kennis: inzichten hebben soort `inzicht`; bronnen en highlights vallen buiten de vijf soorten. */
export function kennisLookupItems(ids: readonly string[], data: { insights: readonly Insight[]; sources: readonly Source[] }): LookupItem[] {
  const wanted = new Set(ids);
  return toLookupItems([
    ...data.insights.filter((item) => wanted.has(item.id)).map((item) => ({ id: item.id, title: item.title, kind: 'inzicht' as const })),
    ...data.sources.filter((item) => wanted.has(item.id)).map((item) => ({ id: item.id, title: item.title }))
  ]);
}

/** Dashboard: alleen tellers. */
export function kennisSummary(data: { sources: readonly Source[]; insights: readonly Insight[]; log: readonly LearningLog[] }, today: string) {
  const week = weekStart(today);
  return {
    inProgress: data.sources.filter((source) => source.status === 'bezig').length,
    finishedThisYear: finishedInYear(data.sources, today.slice(0, 4)),
    insights: data.insights.length,
    minutesThisWeek: data.log.filter((entry) => entry.date >= week && entry.date <= today).reduce((sum, entry) => sum + entry.minutes, 0)
  };
}

/** Dashboard: alleen het aantal inzichten dat sinds het begin van deze week is vastgelegd, geen inhoud. */
export function insightsThisWeek(insights: readonly Pick<Insight, 'createdAt'>[], today: string): number {
  const week = weekStart(today);
  return insights.filter((insight) => insight.createdAt.slice(0, 10) >= week && insight.createdAt.slice(0, 10) <= today).length;
}

export interface KennisAnalysis {
  byType: { type: SourceType; total: number; inProgress: number; finishedThisYear: number }[];
  byCategory: { category: Category; sources: number; insights: number; minutesThisYear: number }[];
  minutesByKind: { kind: LogKind; minutes: number }[];
  insights: { total: number; withAction: number; linkedToGrowth: number };
  actions: { total: number; done: number };
  sources: { total: number; linkedToGrowth: number };
}

/**
 * Analyse (Plan → Execute → Record → Analyze): aantallen per soort en categorie, minuten per activiteit in
 * het gekozen jaar, en hoeveel inzichten tot een actie in Groei leidden. Alleen tellingen, geen inhoud.
 */
export function kennisAnalysis(
  data: {
    sources: readonly Pick<Source, 'id' | 'type' | 'category' | 'status' | 'finishedAt' | 'goalIds' | 'skillIds'>[];
    insights: readonly Pick<Insight, 'id' | 'category' | 'goalIds' | 'skillIds'>[];
    log: readonly Pick<LearningLog, 'date' | 'kind' | 'minutes' | 'sourceId'>[];
    actions: readonly { insightId: string | null; status: string }[];
  },
  year: string
): KennisAnalysis {
  const inYear = data.log.filter((entry) => entry.date.startsWith(`${year}-`));
  const categoryOf = new Map(data.sources.map((source) => [source.id, source.category]));
  const insightIds = new Set(data.insights.map((insight) => insight.id));
  const fromInsights = data.actions.filter((action) => action.insightId !== null && insightIds.has(action.insightId));
  const withAction = new Set(fromInsights.map((action) => action.insightId));
  return {
    byType: SOURCE_TYPES.map((type) => {
      const sources = data.sources.filter((source) => source.type === type);
      return {
        type,
        total: sources.length,
        inProgress: sources.filter((source) => source.status === 'bezig').length,
        finishedThisYear: sources.filter((source) => source.status === 'afgerond' && source.finishedAt?.startsWith(`${year}-`)).length
      };
    }),
    byCategory: CATEGORIES.map((category) => ({
      category,
      sources: data.sources.filter((source) => source.category === category).length,
      insights: data.insights.filter((insight) => insight.category === category).length,
      minutesThisYear: inYear.filter((entry) => entry.sourceId !== null && categoryOf.get(entry.sourceId) === category).reduce((sum, entry) => sum + entry.minutes, 0)
    })),
    minutesByKind: LOG_KINDS.map((kind) => ({ kind, minutes: inYear.filter((entry) => entry.kind === kind).reduce((sum, entry) => sum + entry.minutes, 0) })),
    insights: {
      total: data.insights.length,
      withAction: withAction.size,
      linkedToGrowth: data.insights.filter((insight) => insight.goalIds.length > 0 || insight.skillIds.length > 0).length
    },
    actions: { total: fromInsights.length, done: fromInsights.filter((action) => action.status === 'klaar').length },
    sources: { total: data.sources.length, linkedToGrowth: data.sources.filter((source) => source.goalIds.length > 0 || source.skillIds.length > 0).length }
  };
}
