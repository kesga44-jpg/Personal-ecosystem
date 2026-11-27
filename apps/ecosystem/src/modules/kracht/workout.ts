/** Een lopende training (concept): invoer als tekst, pas bij opslaan omgezet en gecontroleerd. */
import { lastWeight, plannedSets, type Session, type SessionExercise, type SetEntry, type TemplateItem } from './domain';
import type { Exercise, Kind } from './exercises';
import { readLocalValue, writeLocalValue } from '../../localValues';

/** Een lopende training staat tijdelijk in de browser, zodat hij een herlaadactie overleeft. Niet in de back-up. */
export const DRAFT_KEY = 'personal-ecosystem.kracht.concept';

export function parseNumber(raw: string): number | null {
  const text = raw.trim().replace(',', '.');
  if (!text) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : Number.NaN;
}

export interface DraftSet {
  reps: string;
  weight: string;
  seconds: string;
  done: boolean;
}

export interface DraftExercise {
  exerciseId: string;
  name: string;
  kind: Kind;
  restSeconds: number;
  sets: DraftSet[];
}

export interface Draft {
  startedAt: string;
  templateId: string | null;
  name: string;
  link: string | null;
  exercises: DraftExercise[];
}

export function readDraft(): Draft | null {
  try {
    const raw = JSON.parse(readLocalValue(DRAFT_KEY) ?? 'null') as Draft | null;
    return raw && typeof raw.startedAt === 'string' && Array.isArray(raw.exercises) ? raw : null;
  } catch {
    return null;
  }
}

export function writeDraft(draft: Draft | null) {
  try {
    writeLocalValue(DRAFT_KEY, draft ? JSON.stringify(draft) : null);
  } catch {
    // Opslag niet beschikbaar (privévenster): de training blijft alleen in het geheugen.
  }
}

const toText = (value: number | null) => (value === null ? '' : String(value).replace('.', ','));

export function draftExercise(exercise: Exercise, item: TemplateItem | null, sessions: Session[]): DraftExercise {
  return {
    exerciseId: exercise.id,
    name: exercise.name,
    kind: exercise.kind,
    restSeconds: item?.restSeconds ?? 90,
    sets: plannedSets(exercise.kind, item, lastWeight(sessions, exercise.id)).map((set) => ({ reps: toText(set.reps), weight: toText(set.weightKg), seconds: toText(set.seconds), done: false }))
  };
}

/** Zet een concept om naar een opgeslagen training: alleen afgevinkte sets tellen mee. */
export function draftToSession(draft: Draft, id: string, date: string, finishedAt: string): Session {
  const exercises: SessionExercise[] = [];
  for (const exercise of draft.exercises) {
    const sets: SetEntry[] = [];
    for (const set of exercise.sets.filter((item) => item.done)) {
      const reps = parseNumber(set.reps);
      const weight = parseNumber(set.weight);
      const seconds = parseNumber(set.seconds);
      if ([reps, weight, seconds].some((value) => Number.isNaN(value))) throw new Error(`${exercise.name}: vul alleen getallen in.`);
      sets.push(
        exercise.kind === 'tijd'
          ? { reps: null, weightKg: weight || null, seconds }
          : { reps, weightKg: exercise.kind === 'gewicht' ? weight ?? 0 : weight || null, seconds: null }
      );
    }
    if (sets.length) exercises.push({ exerciseId: exercise.exerciseId, name: exercise.name, kind: exercise.kind, sets });
  }
  if (!exercises.length) throw new Error('Vink minstens één gedane set af voordat je de training opslaat.');
  return { id, date, startedAt: draft.startedAt, finishedAt, templateId: draft.templateId, name: draft.name, exercises };
}

