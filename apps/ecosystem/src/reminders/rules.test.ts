import { describe, expect, it } from 'vitest';
import type { Habit, HabitCheck, Quest } from '@ecosystem/sidequest/domain';
import {
  allReminders,
  defaultReminderSettings,
  dismissForToday,
  normalizeReminderSettings,
  setReminderEnabled,
  visibleReminders,
  type ReminderInput
} from './rules';

// Woensdag 18 november 2026, lokale tijd.
const today = '2026-11-18';
const at = (hour: number) => new Date(2026, 10, 18, hour, 0, 0);

const daily = (id: string): Habit => ({ id, title: id, frequency: 'daily', weeklyTarget: 1, archived: false, createdAt: '2026-11-01T00:00:00.000Z' });
const weekly = (id: string, target: number): Habit => ({ id, title: id, frequency: 'weekly', weeklyTarget: target, archived: false, createdAt: '2026-11-01T00:00:00.000Z' });
const check = (habitId: string, date: string): HabitCheck => ({ id: `${habitId}:${date}`, habitId, date });
const quest = (id: string, deadline: string | null, status: Quest['status'] = 'active'): Quest => ({
  id, title: id, description: '', target: 2, progress: status === 'completed' ? 2 : 0, rewardPoints: 10, status,
  completedAt: status === 'completed' ? '2026-11-17T10:00:00.000Z' : null, createdAt: '2026-11-01T00:00:00.000Z', deadline
});

function input(overrides: Partial<ReminderInput> = {}): ReminderInput {
  return { habits: [], checks: [], quests: [], lichaamDates: [], dagboekDates: [], voedingDates: [], lastBackup: '2026-11-17T08:00:00.000Z', hasData: true, ...overrides };
}

const kinds = (list: { kind: string }[]) => list.map((item) => item.kind);

describe('herinneringen', () => {
  it('geeft niets als alles gedaan is', () => {
    expect(allReminders(input({ habits: [daily('a')], checks: [check('a', today)] }), at(21), today)).toEqual([]);
  });

  it('telt open dagelijkse gewoontes en kleurt ze pas vanaf 20:00 als waarschuwing', () => {
    const data = input({ habits: [daily('a'), daily('b'), { ...daily('oud'), archived: true }], checks: [check('a', today)] });
    const morning = allReminders(data, at(9), today);
    expect(morning).toEqual([expect.objectContaining({ kind: 'habits', title: '1 gewoonte nog af te vinken', detail: '1 van 2 gedaan vandaag.', tone: 'neutral', href: '/quest/gewoontes' })]);
    expect(allReminders(data, at(20), today)[0]!.tone).toBe('warning');
  });

  it('meldt een weekgewoonte pas als er niet meer dagen over zijn dan nodig', () => {
    // Woensdag: nog 5 dagen (wo t/m zo).
    expect(kinds(allReminders(input({ habits: [weekly('w', 4)] }), at(9), today))).toEqual([]);
    expect(allReminders(input({ habits: [weekly('w', 5)] }), at(9), today)).toEqual([expect.objectContaining({ kind: 'weekly-habits', detail: 'Nog 5 dagen deze week om het weekdoel te halen.' })]);
    // Vandaag al gedaan: vandaag telt niet meer als beschikbare dag.
    expect(kinds(allReminders(input({ habits: [weekly('w', 5)], checks: [check('w', today)] }), at(9), today))).toEqual(['weekly-habits']);
    expect(kinds(allReminders(input({ habits: [weekly('w', 3)], checks: [check('w', '2026-11-16'), check('w', '2026-11-17'), check('w', today)] }), at(9), today))).toEqual([]);
  });

  it('meldt quests die te laat zijn of binnen 2 dagen een deadline hebben', () => {
    const quests = [quest('laat', '2026-11-17'), quest('vandaag', today), quest('overmorgen', '2026-11-20'), quest('later', '2026-11-21'), quest('geen', null), { ...quest('klaar', '2026-11-10', 'completed') }];
    expect(allReminders(input({ quests }), at(9), today)).toEqual([
      expect.objectContaining({ kind: 'quest-deadlines', title: '3 quests met een deadline', detail: '1 te laat, 2 binnen 2 dagen.', tone: 'warning' })
    ]);
    expect(allReminders(input({ quests: [quest('morgen', '2026-11-19')] }), at(9), today)[0]).toMatchObject({ detail: '1 binnen 2 dagen.', tone: 'neutral' });
  });

  it('herinnert alleen aan Dagboek, Lichaam en Voeding als je die module gebruikt en pas vanaf het ingestelde uur', () => {
    const used = [{ date: '2026-11-15' }];
    const data = input({ dagboekDates: used, lichaamDates: used, voedingDates: used });
    expect(kinds(allReminders(data, at(9), today))).toEqual([]);
    expect(kinds(allReminders(data, at(10), today))).toEqual(['lichaam']);
    expect(kinds(allReminders(data, at(13), today))).toEqual(['lichaam', 'voeding']);
    expect(kinds(allReminders(data, at(19), today))).toEqual(['dagboek', 'lichaam', 'voeding']);
    expect(kinds(allReminders(input({ dagboekDates: [{ date: '2026-10-01' }] }), at(21), today))).toEqual([]);
    expect(kinds(allReminders(input({ dagboekDates: [...used, { date: today }] }), at(21), today))).toEqual([]);
  });

  it('herinnert aan een back-up na 14 dagen of als er nog nooit een was, maar niet zonder gegevens', () => {
    expect(kinds(allReminders(input({ lastBackup: '2026-11-04T08:00:00.000Z' }), at(9), today))).toEqual([]);
    expect(allReminders(input({ lastBackup: '2026-11-03T08:00:00.000Z' }), at(9), today)).toEqual([expect.objectContaining({ kind: 'backup', title: 'Laatste back-up 15 dagen geleden' })]);
    expect(allReminders(input({ lastBackup: '' }), at(9), today)[0]).toMatchObject({ title: 'Nog geen back-up gemaakt' });
    expect(allReminders(input({ lastBackup: '', hasData: false }), at(9), today)).toEqual([]);
  });

  it('laat uitgezette soorten en vandaag verborgen herinneringen weg; morgen komen ze terug', () => {
    const data = input({ habits: [daily('a')], quests: [quest('laat', '2026-11-17')] });
    let settings = setReminderEnabled(defaultReminderSettings, 'quest-deadlines', false);
    expect(kinds(visibleReminders(data, at(9), today, settings))).toEqual(['habits']);
    settings = dismissForToday(settings, 'habits', today);
    expect(visibleReminders(data, at(9), today, settings)).toEqual([]);
    expect(kinds(visibleReminders(data, new Date(2026, 10, 19, 9), '2026-11-19', settings))).toEqual(['habits']);
  });

  it('maakt opgeslagen instellingen veilig', () => {
    expect(normalizeReminderSettings(null)).toEqual(defaultReminderSettings);
    expect(normalizeReminderSettings('kapot')).toEqual(defaultReminderSettings);
    const parsed = normalizeReminderSettings({ enabled: { habits: false, onbekend: false, backup: 'ja' }, dismissed: { dagboek: today, voeding: 'gisteren', onbekend: today } });
    expect(parsed.enabled).toMatchObject({ habits: false, backup: true, dagboek: true });
    expect(parsed.enabled).not.toHaveProperty('onbekend');
    expect(parsed.dismissed).toEqual({ dagboek: today });
  });
});
