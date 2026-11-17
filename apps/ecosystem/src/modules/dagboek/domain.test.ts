import { describe, expect, it } from 'vitest';
import {
  averageMood,
  buildEntry,
  moodByTag,
  moodInfo,
  moodSeries,
  searchEntries,
  validateDagboekBackup,
  validateEntry,
  writingStreak,
  writtenToday,
  type JournalEntry,
  type Tag
} from './domain';

const entry = (date: string, mood: number, tags: Tag[] = [], text = ''): JournalEntry =>
  buildEntry({ date, mood, energy: null, tags, gratitude: [], text }, new Date('2026-11-17T08:00:00Z'));

describe('buildEntry en validatie', () => {
  it('snijdt tekst bij, laat lege dankbaarheid weg en zet labels in vaste volgorde', () => {
    const built = buildEntry({ date: '2026-11-17', mood: 4, energy: 3, tags: ['sport', 'werk'], gratitude: [' Koffie ', '', '  '], text: '  Goede dag.  ' });
    expect(built.tags).toEqual(['werk', 'sport']);
    expect(built.gratitude).toEqual(['Koffie']);
    expect(built.text).toBe('Goede dag.');
    expect(() => validateEntry(built, '2026-11-17')).not.toThrow();
  });

  it('weigert ontbrekende stemming, toekomst, onbekende labels en te lange tekst', () => {
    expect(() => validateEntry({ ...entry('2026-11-17', 4), mood: 0 })).toThrow('Kies hoe je je voelt.');
    expect(() => validateEntry(entry('2026-11-18', 3), '2026-11-17')).toThrow('vooruit');
    expect(() => validateEntry({ ...entry('2026-11-17', 3), tags: ['geheim'] })).toThrow('labels');
    expect(() => validateEntry({ ...entry('2026-11-17', 3), tags: ['werk', 'werk'] })).toThrow('labels');
    expect(() => validateEntry({ ...entry('2026-11-17', 3), text: 'x'.repeat(5001) })).toThrow('5000');
    expect(() => validateEntry({ ...entry('2026-11-17', 3), gratitude: ['a', 'b', 'c', 'd'] })).toThrow('Dankbaarheid');
    expect(() => validateEntry({ ...entry('2026-11-17', 3), id: 'x' })).toThrow('datum');
  });

  it('controleert een back-up', () => {
    expect(() => validateDagboekBackup({ stores: { entries: [entry('2026-11-17', 5)] } })).not.toThrow();
    expect(() => validateDagboekBackup({ stores: {} })).toThrow('notities');
    expect(() => validateDagboekBackup({ stores: { entries: [{ id: '2026-11-17' }] } })).toThrow();
  });
});

describe('inzichten', () => {
  const entries = [
    entry('2026-11-10', 2, ['werk']),
    entry('2026-11-12', 3, ['werk']),
    entry('2026-11-14', 4, ['sport', 'buiten']),
    entry('2026-11-15', 5, ['sport', 'vrienden'], 'Lange fietstocht met Sam.'),
    entry('2026-11-16', 4, ['sport', 'werk']),
    entry('2026-11-17', 3, ['werk'])
  ];

  it('rekent het gemiddelde over de laatste dagen', () => {
    expect(averageMood(entries, '2026-11-17', 3)).toEqual({ value: 4, count: 3 });
    expect(averageMood(entries, '2026-11-01', 7)).toBeNull();
  });

  it('telt een schrijfreeks, ook als vandaag nog leeg is', () => {
    expect(writingStreak(entries, '2026-11-17')).toBe(4);
    expect(writingStreak(entries, '2026-11-18')).toBe(4);
    expect(writingStreak(entries, '2026-11-20')).toBe(0);
  });

  it('maakt een reeks met 0 voor lege dagen', () => {
    const series = moodSeries(entries, '2026-11-17', 3);
    expect(series.map((point) => point.value)).toEqual([5, 4, 3]);
    expect(moodSeries(entries, '2026-11-14', 2).map((point) => point.value)).toEqual([0, 4]);
  });

  it('vergelijkt de stemming per label alleen bij genoeg notities', () => {
    const result = moodByTag(entries, 3);
    expect(result.map((item) => item.tag)).toEqual(['sport', 'werk']);
    expect(result[0]).toMatchObject({ tag: 'sport', count: 3, average: 4.3 });
    expect(result[0]!.difference).toBeGreaterThan(0);
    expect(result[1]!.difference).toBeLessThan(0);
  });

  it('zoekt in tekst en filtert op label', () => {
    expect(searchEntries(entries, 'FIETS').map((item) => item.date)).toEqual(['2026-11-15']);
    expect(searchEntries(entries, '', 'buiten').map((item) => item.date)).toEqual(['2026-11-14']);
    expect(searchEntries(entries, 'fiets', 'werk')).toEqual([]);
  });

  it('geeft het dashboard alleen óf er vandaag geschreven is', () => {
    expect(writtenToday(entries, '2026-11-17')).toBe(true);
    expect(writtenToday(entries, '2026-11-13')).toBe(false);
    expect(moodInfo(5).label).toBe('Top');
  });
});
