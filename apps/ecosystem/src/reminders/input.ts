import { lastBackup, loadData, type DashboardData } from '../dashboard/data';
import { localDateKey } from '../dashboard/summary';
import { readReminderSettings, visibleReminders, type ReminderInput } from './rules';

/** Zet dashboardgegevens om naar de invoer van de herinneringsregels; alleen tellers en datums. */
export function reminderInput(data: DashboardData, backup = lastBackup()): ReminderInput {
  const hasData = [data.activities, data.habits, data.quests, data.lichaamDates, data.dagboekDates, data.voedingDates, data.krachtDates, data.duurTotals].some((list) => list.length > 0);
  return {
    habits: data.habits,
    checks: data.checks,
    quests: data.quests,
    lichaamDates: data.lichaamDates,
    dagboekDates: data.dagboekDates,
    voedingDates: data.voedingDates,
    lastBackup: backup,
    hasData
  };
}

/** Aantal zichtbare herinneringen, voor de teller in de modulebalk. Fouten tellen als 0. */
export async function countVisibleReminders(now = new Date()): Promise<number> {
  try {
    const data = await loadData();
    return visibleReminders(reminderInput(data), now, localDateKey(now), readReminderSettings()).length;
  } catch {
    return 0;
  }
}
