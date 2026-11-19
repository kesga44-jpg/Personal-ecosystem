import { describe, expect, it } from 'vitest';
import {
  DISCIPLINES,
  assess,
  currentProgramWeek,
  emptyProfile,
  evaluateProgram,
  feedbackLogs,
  generateProgram,
  normalizeProfile,
  plannedSessionsForWeek,
  programStartDate,
  proposeAdjustment,
  sessionDayOffset,
  validateCoachStore,
  validateProgram,
  type CoachFeedback,
  type CoachProfile,
  type Program
} from './coach';
import { isPlannedSession } from './planning';
import { validateSportBackup } from './domain';

// Referentietests nagebouwd uit Samen Thuis `sportcoach-core.test.js` (ADR 0002, G-SPORT).
// Verschillen: één persoon in plaats van Kees/Daphne, geen bronnen- en oefenendatabase (docs/COACH.md).

const NOW = Date.parse('2026-11-18T12:00:00.000Z');

function readyProfile(overrides: Partial<CoachProfile> = {}): CoachProfile {
  return {
    ...emptyProfile('Kees'),
    currentActivity: 'Wandelt regelmatig, loopt 2 km',
    availableWeeklyMinutes: 150,
    currentWeeklyMinutes: 60,
    ...overrides
  };
}

function ok(result: ReturnType<typeof generateProgram>): Program {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.analysis.blockers.join(' '));
  return result.program;
}

describe('coach: referentietests uit Samen Thuis', () => {
  it('normaliseert profielen en bewaart de aanvullende sportgegevens', () => {
    const normalized = normalizeProfile({ level: 'advanced', runningCurrentKm: 5, limitations: 'vrijwillig ingevuld', goals: ['kracht', 'kracht', ' conditie '], availableDays: ['Maandag', 'vrijdag', 'nooit'], minutesPerSession: '35' });
    expect(normalized.level).toBe('advanced');
    expect(normalized.runningCurrentKm).toBe(5);
    expect(normalized.limitations).toBe('vrijwillig ingevuld');
    expect(normalized.goals).toEqual(['kracht', 'conditie']);
    expect(normalized.availableDays).toEqual(['maandag', 'vrijdag']);
    expect(normalized.minutesPerSession).toBe(35);
    expect(normalizeProfile({ level: 'pro', health: { asthmaStatus: 'misschien' } })).toMatchObject({ level: 'beginner', health: { asthmaStatus: 'prefer-not', symptomControl: 'prefer-not' } });
  });

  it('vereist personaliseerbare context en stopt bij ingevulde fysieke aandachtspunten', () => {
    const missing = assess(emptyProfile('Kees'), { discipline: 'running', goal: '5 km', weeks: 8, sessionsPerWeek: 3 }, [], NOW);
    expect(missing.blockers.some((message) => message.includes('huidige activiteit'))).toBe(true);
    const restricted = assess(readyProfile({ limitations: 'Knieklachten' }), { discipline: 'running', goal: '5 km', weeks: 8, sessionsPerWeek: 3 }, [], NOW);
    expect(restricted.blockers.some((message) => message.includes('bevoegde professional'))).toBe(true);
  });

  it('beperkt frequentie op niveau en beschikbare tijd en bouwt herstelweken in', () => {
    const result = generateProgram(readyProfile({ availableWeeklyMinutes: 90, level: 'beginner' }), {
      discipline: 'running', goal: 'Opbouwen naar 5 km', weeks: 8, sessionsPerWeek: 5, periodization: 'linear'
    }, [], NOW);
    const program = ok(result);
    expect(program.analysis.frequency).toBe(3);
    expect(program.analysis.startingWeeklyMinutes).toBe(60);
    expect(program.analysis.minutesPerSession).toBe(20);
    expect(result.analysis.cautions.some((message) => message.includes('teruggebracht'))).toBe(true);
    expect(program.weeks[3]!.phase).toBe('Herstel en evaluatie');
    expect(program.weeks[0]!.sessions.every((session) => session.intensity.includes('RPE'))).toBe(true);
    expect(program.evidence.some((item) => item.type === 'practical')).toBe(true);
  });

  it('krachttraining bevat sets, herhalingen, rust, overload en deload', () => {
    const program = ok(generateProgram(readyProfile(), { discipline: 'strength', goal: 'Spieropbouw', weeks: 4, sessionsPerWeek: 3, periodization: 'linear' }, [], NOW));
    const first = program.weeks[0]!.sessions[0]!;
    expect(first.sets).toBeGreaterThan(0);
    expect(first.reps).toBeTruthy();
    expect(first.restSeconds).toBeGreaterThanOrEqual(60);
    expect(program.weeks[3]!.progress).toMatch(/Herstelweek/);
  });

  it('evaluatie doet voorstellen en aanpassing verandert het bestaande programma niet', () => {
    const program = ok(generateProgram(readyProfile(), { discipline: 'cardio', goal: 'Aerobe basis', weeks: 4, sessionsPerWeek: 3 }, [], NOW));
    const sessions = Array.from({ length: 4 }, () => ({ programId: program.id, completed: true, rpe: 9, durationMinutes: 40, recovery: 'slecht' }));
    const evaluation = evaluateProgram(program, sessions);
    const adjusted = proposeAdjustment(program, evaluation, NOW);
    expect(evaluation.suggestions[0]).toContain('herstel');
    expect(adjusted.status).toBe('draft');
    expect(adjusted.previousProgramId).toBe(program.id);
    expect(adjusted.id).not.toBe(program.id);
    expect(program.weeks[0]!.sessions[0]!.durationMinutes).toBe(60 / 3);
    expect(adjusted.weeks[0]!.sessions[0]!.durationMinutes).toBe(Math.round(program.weeks[0]!.sessions[0]!.durationMinutes * 0.8));
  });

  it('plyometrie is gemaximeerd op twee sessies en loopdoelen krijgen geen onveilige deadlinebelofte', () => {
    const plyo = ok(generateProgram(readyProfile({ level: 'experienced', currentWeeklyMinutes: 120 }), { discipline: 'plyometrics', goal: 'Sprongkracht', weeks: 8, sessionsPerWeek: 5 }, [], NOW));
    expect(plyo.analysis.frequency).toBe(2);
    const running = ok(generateProgram(readyProfile(), { discipline: 'running', goal: 'Marathon', targetDistanceKm: 42.2, weeks: 8, sessionsPerWeek: 3 }, [], NOW));
    expect(running.weeks[0]!.goal).toMatch(/schuift het doel voorbij deze programmaperiode/);
  });

  it('hardloopopbouw gebruikt actuele loopafstand, tempo en frequentie en bouwt de langste sessie geleidelijk op', () => {
    const result = generateProgram(readyProfile({ runningCurrentKm: 4, runningLongestRunKm: 2, runningPace: '6:30 min/km', runningSessionsPerWeek: 2, heartRate: 'eigen zones' }), {
      discipline: 'running', goal: '5 km', targetDistanceKm: 5, weeks: 8, sessionsPerWeek: 4
    }, [], NOW);
    const program = ok(result);
    expect(program.analysis.frequency).toBe(3);
    expect(result.analysis.cautions.some((message) => message.includes('6:30 min/km'))).toBe(true);
    const longRunWeekOne = program.weeks[0]!.sessions.at(-1)!;
    const longRunWeekThree = program.weeks[2]!.sessions.at(-1)!;
    expect(longRunWeekOne.targetDistanceKm).toBe(2);
    expect(longRunWeekThree.targetDistanceKm).toBeGreaterThan(longRunWeekOne.targetDistanceKm);
    expect(longRunWeekThree.details).toContain('betrouwbaar vastgestelde hartslagzones');
  });

  it('HIIT en gecombineerde cardio zijn herkenbare keuzes en HIIT wordt voor beginners geblokkeerd', () => {
    const request = { discipline: 'cardio', goal: 'Conditie', weeks: 4, sessionsPerWeek: 3, cardioFocus: 'hiit' };
    const beginner = generateProgram(readyProfile({ level: 'beginner' }), request, [], NOW);
    expect(beginner.analysis.blockers.some((message) => message.includes('HIIT'))).toBe(true);
    const experienced = ok(generateProgram(readyProfile({ level: 'experienced' }), request, [], NOW));
    expect(experienced.weeks[2]!.sessions.some((session) => session.title.includes('HIIT'))).toBe(true);
    const combined = ok(generateProgram(readyProfile(), { ...request, cardioFocus: 'combined' }, [], NOW));
    expect(combined.weeks[2]!.sessions.some((session) => session.title === 'Kracht + conditie')).toBe(true);
  });

  it('astma-profiel blijft optioneel en sluit zonder symptomen geen enkele discipline uit', () => {
    for (const discipline of DISCIPLINES) {
      expect(generateProgram(readyProfile(), { discipline, goal: 'Persoonlijk doel', weeks: 4, sessionsPerWeek: 2 }, [], NOW).ok, discipline).toBe(true);
    }
    const asthmaProfile = readyProfile({ health: { ...emptyProfile().health, asthmaStatus: 'yes', triggers: 'intensieve inspanning', environment: 'koude lucht, pollen, stof', medicationContext: 'privé context die niet naar een trainingsprompt mag' } });
    const result = generateProgram(asthmaProfile, { discipline: 'running', goal: 'Rustig trainen', weeks: 4, sessionsPerWeek: 3 }, [], NOW);
    const program = ok(result);
    expect(result.analysis.frequency).toBe(3);
    expect(result.analysis.cautions.some((message) => message.includes('sluit geen sport'))).toBe(true);
    expect(program.weeks[0]!.sessions.every((session) => session.details.includes('Geleidelijke warming-up'))).toBe(true);
    expect(program.weeks[0]!.sessions.every((session) => session.details.includes('Cooling-down'))).toBe(true);
    expect(program.weeks[0]!.sessions.every((session) => session.details.includes('actuele omstandigheden'))).toBe(true);
    expect(JSON.stringify(program).includes('privé context')).toBe(false);
    expect(JSON.stringify(program.analysis).includes('koude lucht')).toBe(false);
  });

  it('zelfgemelde klachten leiden tot rustige opbouw en behandelaaradvies, niet tot diagnose of sportuitsluiting', () => {
    const profile = readyProfile({ health: { ...emptyProfile().health, asthmaStatus: 'unknown', symptomsDuringExercise: 'Benauwdheid bij zware intervallen', symptomControl: 'unsure' } });
    const result = generateProgram(profile, { discipline: 'cardio', goal: 'Conditie', cardioFocus: 'interval', weeks: 8, sessionsPerWeek: 3 }, [], NOW);
    const program = ok(result);
    expect(result.analysis.cautions.some((message) => message.includes('arts/behandelaar'))).toBe(true);
    expect(result.analysis.healthConcern).toBe(true);
    expect(program.weeks[2]!.sessions.every((session) => session.title !== 'Aerobe intervallen')).toBe(true);
    expect(program.weeks[4]!.sessions[1]!.intensity).toBe('RPE 3–4; rustig gesprek mogelijk');
    expect(program.weeks[0]!.sessions[0]!.details).toContain('houd dit voorstel rustig');
  });

  it('sessie-evaluatie onderscheidt gewone vermoeidheid van gemelde luchtwegklachten en markeert alarmsymptomen', () => {
    const program = ok(generateProgram(readyProfile(), { discipline: 'running', goal: 'Rustig lopen', weeks: 4, sessionsPerWeek: 2 }, [], NOW));
    const fatigue = evaluateProgram(program, [{ programId: program.id, completed: true, symptomType: 'fatigue' }]);
    expect(fatigue.airwayReports).toBe(0);
    expect(fatigue.severeReports).toBe(0);
    const airway = evaluateProgram(program, [{ programId: program.id, completed: true, symptomType: 'airway' }]);
    expect(airway.healthConcern).toBe(true);
    expect(airway.suggestions[0]).toContain('niet hetzelfde als normale inspanningsvermoeidheid');
    const severe = evaluateProgram(program, [{ programId: program.id, completed: true, symptomType: 'severe' }]);
    expect(severe.severeReports).toBe(1);
    expect(severe.suggestions[0]).toContain('Stop bij klachten direct');
    expect(proposeAdjustment(program, airway, NOW).weeks[0]!.volume).toBe(Math.round(program.weeks[0]!.volume * 0.8));
  });

  it('programma-validatie weigert onvolledige output', () => {
    const program = ok(generateProgram(readyProfile(), { discipline: 'strength', goal: 'Kracht', weeks: 4, sessionsPerWeek: 2 }, [], NOW));
    expect(validateProgram(program).ok).toBe(true);
    expect(validateProgram({ ...program, weeks: [{ week: 1, sessions: [{ title: '', durationMinutes: 0 }] }] }).ok).toBe(false);
  });
});

describe('coach in Sport', () => {
  const feedback = (overrides: Partial<CoachFeedback> = {}): CoachFeedback => ({
    id: 'f1', kind: 'feedback', programId: 'program-1', date: '2026-11-17', completed: true, durationMinutes: 30, rpe: 6, recovery: 'goed', symptomType: 'none', note: '', ...overrides
  });

  it('gebruikt vastgelegde trainingen van dezelfde discipline als basis en telt terugkoppeling niet dubbel', () => {
    const logs = [
      { date: '2026-11-10', discipline: 'running', completed: true, durationMinutes: 60 },
      { date: '2026-11-12', discipline: 'running', completed: true, durationMinutes: 60 },
      { date: '2026-11-13', discipline: 'strength', completed: true, durationMinutes: 45 },
      { date: '2026-10-01', discipline: 'running', completed: true, durationMinutes: 60 },
      ...feedbackLogs([feedback({ durationMinutes: 500 })])
    ];
    const analysis = assess(readyProfile(), { discipline: 'running', goal: '5 km', weeks: 8, sessionsPerWeek: 3 }, logs, NOW);
    expect(analysis.recentSessionCount).toBe(2);
    expect(analysis.baselineWeeklyMinutes).toBe(30);
  });

  it('blokkeert een nieuw voorstel na recent gemelde ernstige klachten in de terugkoppeling', () => {
    const analysis = assess(readyProfile(), { discipline: 'cardio', goal: 'Conditie', weeks: 4, sessionsPerWeek: 2 }, feedbackLogs([feedback({ symptomType: 'severe' })]), NOW);
    expect(analysis.blockers.some((message) => message.includes('arts/behandelaar'))).toBe(true);
    const old = assess(readyProfile(), { discipline: 'cardio', goal: 'Conditie', weeks: 4, sessionsPerWeek: 2 }, feedbackLogs([feedback({ symptomType: 'severe', date: '2026-10-01' })]), NOW);
    expect(old.blockers).toEqual([]);
  });

  it('start op maandag en plant sessies op de profieldagen of verspreid over de week, zonder dubbelen of dagen in het verleden', () => {
    expect(programStartDate('2026-11-16')).toBe('2026-11-16');
    expect(programStartDate('2026-11-18')).toBe('2026-11-23');
    expect(programStartDate('2026-11-22')).toBe('2026-11-23');
    expect([0, 1, 2].map((index) => sessionDayOffset(index + 1, index, 3))).toEqual([0, 2, 4]);
    expect(sessionDayOffset('Zaterdag', 0, 2)).toBe(5);

    const program = { ...ok(generateProgram(readyProfile({ availableDays: ['dinsdag', 'donderdag', 'zondag'] }), { discipline: 'running', goal: '5 km', weeks: 4, sessionsPerWeek: 3 }, [], NOW)), startDate: '2026-11-16' };
    const week1 = plannedSessionsForWeek(program, 1, '2026-11-16');
    expect(week1.map((plan) => plan.date)).toEqual(['2026-11-17', '2026-11-19', '2026-11-22']);
    expect(week1.every(isPlannedSession)).toBe(true);
    expect(plannedSessionsForWeek(program, 1, '2026-11-18').map((plan) => plan.date)).toEqual(['2026-11-19', '2026-11-22']);
    expect(plannedSessionsForWeek(program, 1, '2026-11-18')[0]!.id).toBe(week1[1]!.id);
    expect(plannedSessionsForWeek(program, 2, '2026-11-18')[0]!.date).toBe('2026-11-24');
    const { startDate: _unused, ...unstarted } = program;
    expect(plannedSessionsForWeek(unstarted, 1, '2026-11-16')).toEqual([]);
    expect(currentProgramWeek(program, '2026-11-15')).toBeNull();
    expect(currentProgramWeek(program, '2026-11-23')).toBe(2);
    expect(currentProgramWeek(program, '2026-12-14')).toBeNull();
  });

  it('controleert coachgegevens bij herstel, met en zonder store', () => {
    const program = ok(generateProgram(readyProfile(), { discipline: 'strength', goal: 'Kracht', weeks: 4, sessionsPerWeek: 2 }, [], NOW));
    const records = [{ id: 'coach-profile', kind: 'profile', profile: readyProfile() }, { id: program.id, kind: 'program', program }, feedback({ programId: program.id })];
    expect(() => validateCoachStore(undefined)).not.toThrow();
    expect(() => validateCoachStore(records)).not.toThrow();
    expect(() => validateCoachStore([...records, records[0]])).toThrow('ongeldige coachgegevens');
    expect(() => validateCoachStore([feedback({ rpe: 11 })])).toThrow('ongeldige coachgegevens');
    expect(() => validateCoachStore([{ id: 'x', kind: 'program', program: { ...program, id: 'x', weeks: [] } }])).toThrow('ongeldige coachgegevens');
    const base = { activities: [], trainings: [] };
    expect(() => validateSportBackup({ stores: { ...base, planning: [], coach: records } })).not.toThrow();
    expect(() => validateSportBackup({ stores: { ...base, coach: [{ id: 'x' }] } })).toThrow('ongeldige coachgegevens');
  });
});
