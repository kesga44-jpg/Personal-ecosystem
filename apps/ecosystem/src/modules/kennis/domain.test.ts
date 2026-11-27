import { describe, expect, it } from 'vitest';
import { validateGroeiBackup } from '../groei/domain';
import { databaseConfig } from '../groei/storage';
import {
  STUDY_STEPS,
  filterSources,
  kennisAnalysis,
  kennisLookupItems,
  kennisSummary,
  learningStreak,
  measureState,
  minutesPerWeek,
  newStudyProgram,
  parseLabels,
  programProgress,
  toggleStudyStep,
  validateHighlight,
  validateInsight,
  validateKennisStores,
  validateLearningLog,
  validateSource,
  validateStudyProgram,
  withSourceStatus,
  type Insight,
  type LearningLog,
  type Source
} from './domain';

const T = '2026-11-22T10:00:00.000Z';

function source(partial: Partial<Source> = {}): Source {
  return {
    id: 's1', title: 'Atomic Habits', type: 'boek', category: 'algemeen', creatorIds: [], labels: ['gewoontes'], platform: '', url: '', status: 'wil ik', progress: 0,
    startedAt: null, finishedAt: null, rating: null, favorite: false, summary: '', notes: '', goalIds: [], skillIds: [], createdAt: T, updatedAt: T, ...partial
  };
}
function insight(partial: Partial<Insight> = {}): Insight {
  return { id: 'i1', title: 'Klein beginnen', text: '', category: 'algemeen', sourceId: 's1', highlightIds: [], goalIds: ['g1'], skillIds: [], createdAt: T, updatedAt: T, ...partial };
}

describe('validatie', () => {
  it('bron', () => {
    expect(() => validateSource(source())).not.toThrow();
    expect(() => validateSource(source({ title: '' }))).toThrow();
    expect(() => validateSource(source({ category: 'reizen' as never }))).toThrow();
    expect(() => validateSource(source({ url: 'javascript:alert(1)' }))).toThrow();
    expect(() => validateSource(source({ startedAt: '2026-11-10', finishedAt: '2026-11-01' }))).toThrow();
    expect(() => validateSource(source({ rating: 6 }))).toThrow();
  });
  it('highlight zonder bron is toegestaan, zonder tekst niet', () => {
    expect(() => validateHighlight({ id: 'h', sourceId: null, text: 'x', location: '', note: '', createdAt: T, updatedAt: T })).not.toThrow();
    expect(() => validateHighlight({ id: 'h', sourceId: null, text: ' ', location: '', note: '', createdAt: T, updatedAt: T })).toThrow();
  });
  it('inzicht en logboek', () => {
    expect(() => validateInsight(insight())).not.toThrow();
    expect(() => validateLearningLog({ id: 'l', date: '2026-11-22', kind: 'lezen', minutes: 0, sourceId: null, note: '', createdAt: T })).toThrow();
  });
});

describe('vijfstappenprogramma (ADR 0023 § 4)', () => {
  it('heeft de vijf stappen letterlijk', () => {
    expect([...STUDY_STEPS]).toEqual(['Study the material', 'Extract 3 best ideas', 'Act and implement', 'Measure improvement (30 days)', 'Review and adjust']);
  });
  it('stap 3 afvinken start de 30-dagenmeting', () => {
    let program = newStudyProgram('s1', 'p1', new Date(T));
    expect(() => validateStudyProgram(program)).not.toThrow();
    program = toggleStudyStep(program, 0, '2026-11-01');
    program = toggleStudyStep(program, 2, '2026-11-05');
    expect(program.measureStart).toBe('2026-11-05');
    expect(programProgress(program)).toBe(40);
    expect(measureState(program, '2026-11-25')).toEqual({ state: 'loopt', daysLeft: 10, due: '2026-12-05' });
    expect(measureState(program, '2026-12-05').state).toBe('meten');
    expect(() => validateStudyProgram(program)).not.toThrow();
    program = toggleStudyStep(program, 0, '2026-11-06');
    expect(program.steps[0]).toEqual({ done: false, note: '', doneAt: null });
  });
});

describe('bibliotheek', () => {
  it('status houdt datums en voortgang consistent', () => {
    const started = withSourceStatus(source(), 'bezig', '2026-11-01');
    expect(started.startedAt).toBe('2026-11-01');
    const done = withSourceStatus(started, 'afgerond', '2026-11-20');
    expect(done).toMatchObject({ finishedAt: '2026-11-20', progress: 100 });
    expect(withSourceStatus(done, 'bezig', '2026-11-21').finishedAt).toBeNull();
  });
  it('zoeken, filteren (ook categorie Voetbal) en sorteren', () => {
    const list = [source(), source({ id: 's2', title: 'Zonaal verdedigen', category: 'voetbal', labels: ['tactiek'], rating: 5 }), source({ id: 's3', title: 'Deep Work', type: 'podcast', favorite: true, rating: 3 })];
    expect(filterSources(list, { category: 'voetbal' }).map((s) => s.id)).toEqual(['s2']);
    expect(filterSources(list, { query: 'TACTIEK' }).map((s) => s.id)).toEqual(['s2']);
    expect(filterSources(list, { favorite: true }).map((s) => s.id)).toEqual(['s3']);
    expect(filterSources(list, { sort: 'waardering' }).map((s) => s.id)).toEqual(['s2', 's3', 's1']);
    expect(filterSources([source({ creatorIds: ['c1'] })], { query: 'clear' }, () => 'James Clear')).toHaveLength(1);
  });
  it('labels', () => {
    expect(parseLabels(' a, b ,, a ')).toEqual(['a', 'b']);
  });
});

describe('logboek', () => {
  const log: LearningLog[] = ['2026-11-20', '2026-11-21', '2026-11-22'].map((date, index) => ({ id: `l${index}`, date, kind: 'lezen', minutes: 20, sourceId: null, note: '', createdAt: T }));
  it('minuten per week en reeks', () => {
    const weeks = minutesPerWeek(log, '2026-11-22', 2);
    expect(weeks).toEqual([{ week: '2026-11-09', minutes: 0 }, { week: '2026-11-16', minutes: 60 }]);
    expect(learningStreak(log, '2026-11-22')).toBe(3);
  });
});

describe('leescontracten en relaties met Groei (ADR 0024 § 3a en § 6)', () => {
  it('Lookup: inzicht heeft soort inzicht, bron geen soort', () => {
    expect(kennisLookupItems(['i1', 's1'], { insights: [insight({ text: 'privé' })], sources: [source()] })).toEqual([
      { id: 'i1', title: 'Klein beginnen', kind: 'inzicht' },
      { id: 's1', title: 'Atomic Habits' }
    ]);
  });
  it('dashboard ziet alleen tellers', () => {
    expect(kennisSummary({ sources: [source({ status: 'bezig' }), source({ id: 'x', status: 'afgerond', finishedAt: '2026-03-01' })], insights: [insight()], log: [] }, '2026-11-22')).toEqual({ inProgress: 1, finishedThisYear: 1, insights: 1, minutesThisWeek: 0 });
  });
  it('relaties naar Groei zijn ID-velden op het record, geen koppelrecords', () => {
    expect(insight().goalIds).toEqual(['g1']);
    expect(Object.keys(source())).toContain('skillIds');
  });
});

describe('gedeelde database en back-up', () => {
  const groeiStores = { goals: [], skills: [], habits: [], habitChecks: [], actions: [], evaluations: [], tenTen: [], settings: [], links: [] };
  const kennisStores = { sources: [source()], creators: [], highlights: [], insights: [insight()], studyPrograms: [], learningLog: [] };
  it('schema 2 van personal-ecosystem-groei bevat Groei en Kennis', () => {
    expect(databaseConfig.version).toBe(2);
    expect([...databaseConfig.stores]).toEqual([...Object.keys(groeiStores), ...Object.keys(kennisStores)]);
  });
  it('back-up schema 2 wordt volledig gecontroleerd, ook Kennis', () => {
    expect(() => validateGroeiBackup({ schemaVersion: 2, stores: { ...groeiStores, ...kennisStores } }, validateKennisStores)).not.toThrow();
    expect(() => validateGroeiBackup({ schemaVersion: 2, stores: { ...groeiStores, ...kennisStores, sources: [source({ title: '' })] } }, validateKennisStores)).toThrow();
    expect(() => validateGroeiBackup({ schemaVersion: 2, stores: { ...groeiStores, ...kennisStores } })).toThrow();
    expect(() => validateGroeiBackup({ schemaVersion: 3, stores: groeiStores }, validateKennisStores)).toThrow('schemaversie');
  });
  it('back-up schema 1 (alleen Groei) blijft geldig en krijgt lege Kennis-stores', () => {
    expect(() => validateGroeiBackup({ schemaVersion: 1, stores: groeiStores }, validateKennisStores)).not.toThrow();
    expect(databaseConfig.exportUpgrades[2](groeiStores)).toMatchObject({ sources: [], learningLog: [] });
    expect(() => validateKennisStores({ ...kennisStores, learningLog: undefined })).toThrow('learningLog');
  });
});

describe('analyse (Plan → Execute → Record → Analyze)', () => {
  it('telt per soort, categorie en activiteit en hoeveel inzichten tot een actie leidden', () => {
    const result = kennisAnalysis({
      sources: [
        source({ id: 'b1', type: 'boek', status: 'afgerond', finishedAt: '2026-03-01', goalIds: ['g1'] }),
        source({ id: 'b2', type: 'boek', status: 'afgerond', finishedAt: '2025-12-01' }),
        source({ id: 'p1', type: 'podcast', status: 'bezig', category: 'voetbal' }),
        source({ id: 'c1', type: 'cursus', status: 'wil ik', skillIds: ['s1'] })
      ],
      insights: [insight({ id: 'i1' }), insight({ id: 'i2', goalIds: [], category: 'voetbal' }), insight({ id: 'i3', goalIds: [] })],
      log: [
        { date: '2026-02-01', kind: 'lezen', minutes: 30, sourceId: 'b1' },
        { date: '2026-02-02', kind: 'luisteren', minutes: 45, sourceId: 'p1' },
        { date: '2025-12-31', kind: 'lezen', minutes: 99, sourceId: 'b1' },
        { date: '2026-02-03', kind: 'studeren', minutes: 20, sourceId: null }
      ],
      actions: [
        { insightId: 'i1', status: 'klaar' },
        { insightId: 'i1', status: 'open' },
        { insightId: 'i2', status: 'bezig' },
        { insightId: null, status: 'klaar' },
        { insightId: 'verwijderd', status: 'klaar' }
      ]
    }, '2026');
    expect(result.byType.find((item) => item.type === 'boek')).toEqual({ type: 'boek', total: 2, inProgress: 0, finishedThisYear: 1 });
    expect(result.byType.find((item) => item.type === 'podcast')).toEqual({ type: 'podcast', total: 1, inProgress: 1, finishedThisYear: 0 });
    expect(result.byCategory).toEqual([
      { category: 'algemeen', sources: 3, insights: 2, minutesThisYear: 30 },
      { category: 'voetbal', sources: 1, insights: 1, minutesThisYear: 45 }
    ]);
    expect(result.minutesByKind).toEqual([
      { kind: 'lezen', minutes: 30 },
      { kind: 'luisteren', minutes: 45 },
      { kind: 'kijken', minutes: 0 },
      { kind: 'studeren', minutes: 20 }
    ]);
    expect(result.insights).toEqual({ total: 3, withAction: 2, linkedToGrowth: 1 });
    expect(result.actions).toEqual({ total: 3, done: 1 });
    expect(result.sources).toEqual({ total: 4, linkedToGrowth: 2 });
  });

  it('is leeg zonder gegevens, zonder voorbeeldwaarden', () => {
    const result = kennisAnalysis({ sources: [], insights: [], log: [], actions: [] }, '2026');
    expect(result.byType.every((item) => item.total === 0)).toBe(true);
    expect(result.insights).toEqual({ total: 0, withAction: 0, linkedToGrowth: 0 });
  });
});
