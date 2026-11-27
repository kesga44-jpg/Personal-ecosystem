/**
 * Herinneringen binnen de app (ADR 0022).
 * Afgeleid uit gegevens die het dashboard al leest; er worden geen herinneringen opgeslagen.
 * Alleen eigen module-items; niets uit Samen Thuis of Coach; geen meldingen buiten de app.
 * Bewaard per apparaat: alleen welke soorten aan staan en wat je vandaag hebt verborgen.
 */
import { currentPeriodChecks, type Habit, type HabitCheck, type Quest } from '@ecosystem/sidequest/domain';
import { readLocalValue, writeLocalValue } from '../localValues';

export const REMINDER_KINDS = ['habits', 'weekly-habits', 'quest-deadlines', 'dagboek', 'lichaam', 'voeding', 'backup'] as const;
export type ReminderKind = (typeof REMINDER_KINDS)[number];

export const reminderLabels: Record<ReminderKind, string> = {
  habits: 'Dagelijkse gewoontes nog open',
  'weekly-habits': 'Weekgewoontes die achterlopen',
  'quest-deadlines': 'Quest-deadlines (vandaag, morgen, overmorgen of te laat)',
  dagboek: 'Dagboek vandaag nog niet geschreven (vanaf 19:00)',
  lichaam: 'Lichaam vandaag nog niet ingevuld (vanaf 10:00)',
  voeding: 'Voeding vandaag nog niets geregistreerd (vanaf 13:00)',
  backup: 'Back-up ouder dan 14 dagen'
};

export interface Reminder {
  kind: ReminderKind;
  title: string;
  detail: string;
  href: string;
  tone: 'neutral' | 'warning';
}

/** Alleen wat de regels nodig hebben; Lichaam, Dagboek en Voeding leveren uitsluitend datums. */
export interface ReminderInput {
  habits: Habit[];
  checks: HabitCheck[];
  quests: Quest[];
  lichaamDates: { date: string }[];
  dagboekDates: { date: string }[];
  voedingDates: { date: string }[];
  /** ISO-tijdstip van de laatste centrale back-up, of leeg. */
  lastBackup: string;
  /** Of er in de modules überhaupt gegevens zijn (voor de back-upherinnering). */
  hasData: boolean;
}

export interface ReminderSettings {
  enabled: Record<ReminderKind, boolean>;
  /** Per soort de datum (JJJJ-MM-DD) waarop je hem voor die dag hebt verborgen. */
  dismissed: Partial<Record<ReminderKind, string>>;
}

export const defaultReminderSettings: ReminderSettings = {
  enabled: Object.fromEntries(REMINDER_KINDS.map((kind) => [kind, true])) as Record<ReminderKind, boolean>,
  dismissed: {}
};

function isDay(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** Maakt opgeslagen instellingen veilig: onbekende soorten eruit, nieuwe soorten standaard aan. */
export function normalizeReminderSettings(input: unknown): ReminderSettings {
  const result: ReminderSettings = { enabled: { ...defaultReminderSettings.enabled }, dismissed: {} };
  if (!input || typeof input !== 'object') return result;
  const candidate = input as { enabled?: unknown; dismissed?: unknown };
  if (candidate.enabled && typeof candidate.enabled === 'object') {
    for (const kind of REMINDER_KINDS) {
      const value = (candidate.enabled as Record<string, unknown>)[kind];
      if (typeof value === 'boolean') result.enabled[kind] = value;
    }
  }
  if (candidate.dismissed && typeof candidate.dismissed === 'object') {
    for (const kind of REMINDER_KINDS) {
      const value = (candidate.dismissed as Record<string, unknown>)[kind];
      if (isDay(value)) result.dismissed[kind] = value;
    }
  }
  return result;
}

function shiftDay(day: string, offset: number): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / 86_400_000);
}

/** Of een module de afgelopen 14 dagen gebruikt is; zo krijg je geen herinneringen voor modules die je niet gebruikt. */
function usedRecently(dates: { date: string }[], today: string): boolean {
  const from = shiftDay(today, -14);
  return dates.some((item) => item.date >= from && item.date < today);
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** Alle herinneringen voor dit moment, zonder rekening te houden met instellingen. */
export function allReminders(input: ReminderInput, now: Date, today: string): Reminder[] {
  const hour = now.getHours();
  const reminders: Reminder[] = [];

  const daily = input.habits.filter((habit) => !habit.archived && habit.frequency === 'daily');
  const openDaily = daily.filter((habit) => currentPeriodChecks(habit, input.checks, today) === 0);
  if (openDaily.length) {
    reminders.push({
      kind: 'habits',
      title: `${plural(openDaily.length, 'gewoonte', 'gewoontes')} nog af te vinken`,
      detail: `${daily.length - openDaily.length} van ${daily.length} gedaan vandaag.`,
      href: '/quest/gewoontes',
      tone: hour >= 20 ? 'warning' : 'neutral'
    });
  }

  // Weekgewoontes: achter als er minder dagen over zijn (vandaag meegeteld) dan checks nodig.
  const weekday = (new Date(`${today}T00:00:00.000Z`).getUTCDay() + 6) % 7;
  const daysLeft = 7 - weekday;
  const behind = input.habits.filter((habit) => {
    if (habit.archived || habit.frequency !== 'weekly') return false;
    const done = currentPeriodChecks(habit, input.checks, today);
    const doneToday = input.checks.some((check) => check.habitId === habit.id && check.date === today);
    const needed = habit.weeklyTarget - done;
    return needed > 0 && needed >= daysLeft - (doneToday ? 1 : 0);
  });
  if (behind.length) {
    reminders.push({
      kind: 'weekly-habits',
      title: `${plural(behind.length, 'weekgewoonte loopt', 'weekgewoontes lopen')} achter`,
      detail: `Nog ${plural(daysLeft, 'dag', 'dagen')} deze week om het weekdoel te halen.`,
      href: '/quest/gewoontes',
      tone: 'warning'
    });
  }

  const active = input.quests.filter((quest) => quest.status === 'active' && quest.deadline);
  const overdue = active.filter((quest) => quest.deadline! < today).length;
  const soon = active.filter((quest) => quest.deadline! >= today && daysBetween(today, quest.deadline!) <= 2).length;
  if (overdue || soon) {
    const parts = [overdue ? `${overdue} te laat` : '', soon ? `${soon} binnen 2 dagen` : ''].filter(Boolean);
    reminders.push({
      kind: 'quest-deadlines',
      title: `${plural(overdue + soon, 'quest', 'quests')} met een deadline`,
      detail: `${parts.join(', ')}.`,
      href: '/quest/quests',
      tone: overdue ? 'warning' : 'neutral'
    });
  }

  if (hour >= 19 && usedRecently(input.dagboekDates, today) && !input.dagboekDates.some((item) => item.date === today)) {
    reminders.push({ kind: 'dagboek', title: 'Dagboek: vandaag nog niet geschreven', detail: 'Een paar regels is genoeg.', href: '/dagboek/schrijven', tone: 'neutral' });
  }
  if (hour >= 10 && usedRecently(input.lichaamDates, today) && !input.lichaamDates.some((item) => item.date === today)) {
    reminders.push({ kind: 'lichaam', title: 'Lichaam: vandaag nog niets ingevuld', detail: 'Bijvoorbeeld gewicht of slaap.', href: '/lichaam/invoeren', tone: 'neutral' });
  }
  if (hour >= 13 && usedRecently(input.voedingDates, today) && !input.voedingDates.some((item) => item.date === today)) {
    reminders.push({ kind: 'voeding', title: 'Voeding: vandaag nog niets geregistreerd', detail: 'Je ontbijt of lunch toevoegen?', href: '/voeding/toevoegen', tone: 'neutral' });
  }

  if (input.hasData) {
    const last = Date.parse(input.lastBackup);
    const age = Number.isFinite(last) ? Math.floor((now.getTime() - last) / 86_400_000) : null;
    if (age === null || age > 14) {
      reminders.push({
        kind: 'backup',
        title: age === null ? 'Nog geen back-up gemaakt' : `Laatste back-up ${age} dagen geleden`,
        detail: 'Je gegevens staan alleen op dit apparaat.',
        href: '/back-up',
        tone: 'warning'
      });
    }
  }

  return reminders;
}

/** Herinneringen die je te zien krijgt: soort staat aan en is vandaag niet verborgen. */
export function visibleReminders(input: ReminderInput, now: Date, today: string, settings: ReminderSettings): Reminder[] {
  return allReminders(input, now, today).filter((reminder) => settings.enabled[reminder.kind] && settings.dismissed[reminder.kind] !== today);
}

export function dismissForToday(settings: ReminderSettings, kind: ReminderKind, today: string): ReminderSettings {
  return { ...settings, dismissed: { ...settings.dismissed, [kind]: today } };
}

export function setReminderEnabled(settings: ReminderSettings, kind: ReminderKind, enabled: boolean): ReminderSettings {
  return { ...settings, enabled: { ...settings.enabled, [kind]: enabled } };
}

const storageKey = 'personal-ecosystem.reminders.settings';

export function readReminderSettings(): ReminderSettings {
  try {
    return normalizeReminderSettings(JSON.parse(readLocalValue(storageKey) ?? 'null'));
  } catch {
    return normalizeReminderSettings(null);
  }
}

export function writeReminderSettings(settings: ReminderSettings): void {
  try {
    // Bewaart welke soorten aan staan en per soort de datum van "Vandaag verborgen".
    // Een oudere datum heeft geen effect meer (alleen de datum van vandaag telt) en wordt bij de volgende keer verbergen overschreven.
    writeLocalValue(storageKey, JSON.stringify(settings));
  } catch {
    // Alleen een voorkeur; zonder opslag staan alle herinneringen aan.
  }
}
