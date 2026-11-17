import { describe, expect, it } from 'vitest';
import { BASIC_EXERCISES } from './exercises';
import {
  allExercises,
  cleanLink,
  estimatedOneRepMax,
  exerciseFromWger,
  isDarebee,
  lastWeight,
  newRecords,
  personalRecords,
  plannedSets,
  progression,
  sessionMinutes,
  sessionVolume,
  sessionsThisWeek,
  validateExercise,
  validateKrachtBackup,
  validateSession,
  validateTemplate,
  weeklySummary,
  type Session,
  type Template
} from './domain';

function session(id: string, date: string, sets: { reps: number; weightKg: number }[], extra: Partial<Session> = {}): Session {
  return {
    id,
    date,
    startedAt: `${date}T18:00:00.000Z`,
    finishedAt: `${date}T18:45:00.000Z`,
    templateId: null,
    name: 'Volledig lichaam',
    exercises: [{ exerciseId: 'basis:squat', name: 'Squat', kind: 'gewicht', sets: sets.map((set) => ({ ...set, seconds: null })) }],
    ...extra
  };
}

const template: Template = {
  id: 't1',
  name: 'Volledig lichaam A',
  items: [{ exerciseId: 'basis:squat', sets: 3, target: 8, restSeconds: 120 }],
  link: 'https://darebee.com/workouts/example.html',
  notes: '',
  updatedAt: '2026-11-17T10:00:00.000Z'
};

describe('basislijst', () => {
  it('heeft 40 unieke, geldige oefeningen', () => {
    expect(BASIC_EXERCISES).toHaveLength(40);
    expect(new Set(BASIC_EXERCISES.map((item) => item.id)).size).toBe(40);
    // Basisoefeningen worden niet opgeslagen; als eigen oefening zouden ze wel geldig zijn.
    for (const exercise of BASIC_EXERCISES) expect(() => validateExercise({ ...exercise, source: 'eigen' })).not.toThrow();
  });

  it('voegt eigen oefeningen toe en sorteert op naam', () => {
    const own = { id: 'eigen:1', name: 'Aap-oefening', category: 'overig', equipment: 'overig', kind: 'lichaam', source: 'eigen', wger: null } as const;
    const list = allExercises([own]);
    expect(list).toHaveLength(41);
    expect(list[0]!.id).toBe('eigen:1');
  });
});

describe('validatie', () => {
  it('accepteert alleen https-links zonder inloggegevens', () => {
    expect(cleanLink('  https://darebee.com/workouts/x.html ')).toBe('https://darebee.com/workouts/x.html');
    expect(cleanLink('')).toBeNull();
    expect(() => cleanLink('http://darebee.com')).toThrow('https');
    expect(() => cleanLink('javascript:alert(1)')).toThrow();
    expect(() => cleanLink('https://user:pw@example.com')).toThrow();
    expect(() => cleanLink('geen link')).toThrow('geen geldige link');
    expect(isDarebee('https://darebee.com/x')).toBe(true);
    expect(isDarebee('https://www.darebee.com/x')).toBe(true);
    expect(isDarebee('https://notdarebee.com/x')).toBe(false);
    expect(isDarebee(null)).toBe(false);
  });

  it('controleert schema’s', () => {
    expect(() => validateTemplate(template)).not.toThrow();
    expect(() => validateTemplate({ ...template, name: ' ' })).toThrow('naam');
    expect(() => validateTemplate({ ...template, items: [{ ...template.items[0]!, sets: 0 }] })).toThrow('1–20 sets');
    expect(() => validateTemplate({ ...template, link: 'http://darebee.com' })).toThrow();
    expect(() => validateTemplate({ ...template, link: null })).not.toThrow();
  });

  it('controleert trainingen per soort oefening', () => {
    expect(() => validateSession(session('s1', '2026-11-16', [{ reps: 5, weightKg: 100 }]), '2026-11-17')).not.toThrow();
    expect(() => validateSession(session('s1', '2026-11-18', [{ reps: 5, weightKg: 100 }]), '2026-11-17')).toThrow('toekomst');
    expect(() => validateSession(session('s1', '2026-11-16', [{ reps: 0, weightKg: 100 }]))).toThrow('Squat: Vul per set het aantal herhalingen');
    expect(() => validateSession(session('s1', '2026-11-16', []))).toThrow('minstens één set');
    expect(() => validateSession({ ...session('s1', '2026-11-16', [{ reps: 5, weightKg: 1 }]), finishedAt: '2026-11-16T17:00:00.000Z' })).toThrow('tijden');
    const plank: Session = { ...session('s2', '2026-11-16', []), exercises: [{ exerciseId: 'basis:plank', name: 'Plank', kind: 'tijd', sets: [{ reps: null, weightKg: null, seconds: 60 }] }] };
    expect(() => validateSession(plank)).not.toThrow();
    expect(() => validateSession({ ...plank, exercises: [{ ...plank.exercises[0]!, sets: [{ reps: 10, weightKg: null, seconds: null }] }] })).toThrow('seconden');
  });

  it('eist licentie en auteur bij wger-oefeningen', () => {
    const exercise = exerciseFromWger({ id: 73, name: 'Bench Press', nameNl: 'Bankdrukken', license: 'CC-BY-SA 4', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/', author: 'wger.de' }, 'borst', 'halter', 'gewicht');
    expect(exercise).toMatchObject({ id: 'wger:73', name: 'Bankdrukken', source: 'wger' });
    expect(() => validateExercise(exercise)).not.toThrow();
    expect(() => validateExercise({ ...exercise, wger: { ...exercise.wger!, author: '' } })).toThrow('licentie en auteur');
    expect(() => validateExercise({ ...exercise, source: 'basis' })).toThrow('Alleen eigen en wger');
  });

  it('controleert een back-up van Kracht', () => {
    expect(() => validateKrachtBackup({ stores: { exercises: [], templates: [template], sessions: [session('s1', '2026-11-16', [{ reps: 5, weightKg: 100 }])] } })).not.toThrow();
    expect(() => validateKrachtBackup({ stores: { exercises: [], templates: [] } })).toThrow('mist');
    expect(() => validateKrachtBackup({ stores: { exercises: [], templates: [{ ...template, link: 'ftp://x' }], sessions: [] } })).toThrow();
  });
});

describe('berekeningen', () => {
  it('schat 1RM met Epley alleen voor 1–12 herhalingen', () => {
    expect(estimatedOneRepMax(100, 1)).toBe(100);
    expect(estimatedOneRepMax(100, 5)).toBe(116.7);
    expect(estimatedOneRepMax(100, 13)).toBeNull();
    expect(estimatedOneRepMax(0, 5)).toBeNull();
  });

  it('berekent volume en duur', () => {
    const item = session('s1', '2026-11-16', [{ reps: 5, weightKg: 100 }, { reps: 5, weightKg: 102.5 }]);
    expect(sessionVolume(item)).toBe(1013);
    expect(sessionMinutes(item)).toBe(45);
  });

  it('vindt records en nieuwe records', () => {
    const first = session('s1', '2026-11-10', [{ reps: 5, weightKg: 100 }]);
    const second = session('s2', '2026-11-12', [{ reps: 3, weightKg: 105 }]);
    const third = session('s3', '2026-11-14', [{ reps: 8, weightKg: 100 }]);
    const records = personalRecords([third, first, second]);
    expect(records).toEqual([{ exerciseId: 'basis:squat', name: 'Squat', kind: 'gewicht', best: 105, bestDate: '2026-11-12', oneRepMax: 126.7 }]);
    expect(newRecords(second, [first])).toEqual(['Squat']);
    expect(newRecords(third, [first, second])).toEqual([]);
    expect(newRecords(first, [])).toEqual([]);
    expect(progression([third, first, second], 'basis:squat').map((point) => point.value)).toEqual([116.7, 115.5, 126.7]);
  });

  it('telt trainingen per week vanaf maandag', () => {
    const list = [session('a', '2026-11-16', [{ reps: 5, weightKg: 10 }]), session('b', '2026-11-15', [{ reps: 5, weightKg: 10 }])];
    // 17-11-2026 is een dinsdag; de week begon op maandag 16-11.
    expect(sessionsThisWeek(list, '2026-11-17')).toBe(1);
    const weeks = weeklySummary(list, '2026-11-17', 2);
    expect(weeks.map((week) => [week.week, week.sessions, week.volume])).toEqual([['2026-11-09', 1, 50], ['2026-11-16', 1, 50]]);
  });

  it('vult sets voor met het doel en het laatst gebruikte gewicht', () => {
    const list = [session('a', '2026-11-10', [{ reps: 5, weightKg: 80 }]), session('b', '2026-11-12', [{ reps: 5, weightKg: 85 }, { reps: 5, weightKg: 90 }])];
    expect(lastWeight(list, 'basis:squat')).toBe(90);
    expect(lastWeight(list, 'basis:plank')).toBeNull();
    expect(plannedSets('gewicht', { sets: 2, target: 8 }, 90)).toEqual([{ reps: 8, weightKg: 90, seconds: null }, { reps: 8, weightKg: 90, seconds: null }]);
    expect(plannedSets('tijd', null, null)).toHaveLength(3);
    expect(plannedSets('lichaam', { sets: 1, target: 12 }, null)).toEqual([{ reps: 12, weightKg: null, seconds: null }]);
  });
});
