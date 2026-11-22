import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LocalDatabase } from '@ecosystem/storage';
import { loadData } from './data';
import { reminderInput } from '../reminders/input';
import { allReminders } from '../reminders/rules';

const mocks = vi.hoisted(() => ({ open: vi.fn() }));
vi.mock('@ecosystem/storage', () => ({ openLocalDatabase: mocks.open }));

describe('dashboard and reminders use Groei for habits', () => {
  beforeEach(() => {
    mocks.open.mockReset();
  });

  it('reads habits and checks from Groei and never reads the legacy SIDEQUEST stores', async () => {
    const calls: { appId: string; store: string }[] = [];
    const growthHabit = {
      id: 'h1', title: 'Lezen', frequency: 'dagelijks', weeklyTarget: 7, goalId: null,
      archived: false, createdAt: '2026-11-01T10:00:00.000Z', updatedAt: '2026-11-01T10:00:00.000Z'
    };
    const growthCheck = { id: 'h1:2026-11-21', habitId: 'h1', date: '2026-11-21' };
    mocks.open.mockImplementation(async (config: { appId: string }) => {
      const database: Pick<LocalDatabase, 'list' | 'get' | 'close'> = {
        async list<T extends { id: string }>(store: string): Promise<T[]> {
          calls.push({ appId: config.appId, store });
          if (config.appId === 'sidequest' && ['goals', 'habits', 'habitChecks'].includes(store)) {
            throw new Error(`legacy SIDEQUEST read: ${store}`);
          }
          let records: unknown[] = [];
          if (config.appId === 'groei') {
            if (store === 'habits') records = [growthHabit];
            if (store === 'habitChecks') records = [growthCheck];
          }
          return records as T[];
        },
        async get() {
          return undefined;
        },
        close() {}
      };
      return database;
    });

    const data = await loadData();
    expect(data.habits).toEqual([{
      id: 'h1', title: 'Lezen', frequency: 'daily', weeklyTarget: 1, archived: false,
      createdAt: '2026-11-01T10:00:00.000Z'
    }]);
    expect(data.checks).toEqual([growthCheck]);
    expect(data.groei?.habitsOpenToday).toBe(1);
    expect(calls.filter((call) => call.appId === 'sidequest')).toEqual([{ appId: 'sidequest', store: 'quests' }]);
    expect(calls).toContainEqual({ appId: 'groei', store: 'habits' });
    expect(calls).toContainEqual({ appId: 'groei', store: 'habitChecks' });

    const reminders = allReminders(
      reminderInput(data),
      new Date('2026-11-22T21:00:00.000Z'),
      '2026-11-22'
    );
    expect(reminders).toContainEqual(expect.objectContaining({ kind: 'habits', href: '/quest/gewoontes' }));
  });
});
