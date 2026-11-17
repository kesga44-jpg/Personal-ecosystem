import { afterEach, describe, expect, it } from 'vitest';
import { validateSession } from './domain';
import { BASIC_EXERCISES } from './exercises';
import { DRAFT_KEY, draftExercise, draftToSession, readDraft, writeDraft, type Draft } from './workout';

const squat = BASIC_EXERCISES.find((item) => item.id === 'basis:squat')!;
const plank = BASIC_EXERCISES.find((item) => item.id === 'basis:plank')!;

function draft(): Draft {
  return { startedAt: '2026-11-17T18:00:00.000Z', templateId: null, name: 'Vrije training', link: null, exercises: [draftExercise(squat, { exerciseId: squat.id, sets: 2, target: 5, restSeconds: 90 }, []), draftExercise(plank, null, [])] };
}

afterEach(() => localStorage.removeItem(DRAFT_KEY));

describe('lopende training', () => {
  it('slaat alleen afgevinkte sets op, met komma als decimaalteken', () => {
    const value = draft();
    value.exercises[0]!.sets[0] = { reps: '5', weight: '82,5', seconds: '', done: true };
    value.exercises[1]!.sets[0] = { reps: '', weight: '', seconds: '45', done: true };
    const session = draftToSession(value, 's1', '2026-11-17', '2026-11-17T18:40:00.000Z');
    expect(session.exercises).toEqual([
      { exerciseId: 'basis:squat', name: 'Squat', kind: 'gewicht', sets: [{ reps: 5, weightKg: 82.5, seconds: null }] },
      { exerciseId: 'basis:plank', name: 'Plank', kind: 'tijd', sets: [{ reps: null, weightKg: null, seconds: 45 }] }
    ]);
    expect(() => validateSession(session, '2026-11-17')).not.toThrow();
  });

  it('weigert een training zonder afgevinkte sets of met tekst in plaats van getallen', () => {
    expect(() => draftToSession(draft(), 's1', '2026-11-17', '2026-11-17T18:40:00.000Z')).toThrow('Vink minstens één');
    const value = draft();
    value.exercises[0]!.sets[0] = { reps: 'vijf', weight: '80', seconds: '', done: true };
    expect(() => draftToSession(value, 's1', '2026-11-17', '2026-11-17T18:40:00.000Z')).toThrow('alleen getallen');
  });

  it('bewaart het concept in de browser en herstelt het na herladen', () => {
    expect(readDraft()).toBeNull();
    writeDraft(draft());
    expect(readDraft()?.exercises).toHaveLength(2);
    writeDraft(null);
    expect(readDraft()).toBeNull();
    localStorage.setItem(DRAFT_KEY, '{kapot');
    expect(readDraft()).toBeNull();
  });
});
