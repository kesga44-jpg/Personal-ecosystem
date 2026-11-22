import { describe, expect, it } from 'vitest';
import { insightsThisWeek } from '../modules/kennis/domain';
import { plannedTodaySummary } from '../modules/voeding/mealplan';
import { defaultLayout, normalizeLayout, toggleWidget } from './widgets';

describe('dashboardblokken A16 (alleen tellers)', () => {
  it('telt de geplande en gegeten maaltijden van vandaag in actieve plannen', () => {
    const plans = [{ id: 'p1', from: '2026-11-20', to: '2026-11-26' }, { id: 'oud', from: '2026-10-01', to: '2026-10-07' }];
    const meals = [
      { id: 'm1', planId: 'p1', date: '2026-11-22' },
      { id: 'm2', planId: 'p1', date: '2026-11-22' },
      { id: 'm3', planId: 'p1', date: '2026-11-23' },
      { id: 'm4', planId: 'oud', date: '2026-11-22' }
    ];
    expect(plannedTodaySummary(plans, meals, [{ plannedMealId: 'm1' }, {}], '2026-11-22')).toEqual({ activePlans: 1, plannedToday: 2, eatenToday: 1 });
    expect(plannedTodaySummary([], [], [], '2026-11-22')).toEqual({ activePlans: 0, plannedToday: 0, eatenToday: 0 });
  });

  it('telt inzichten van deze week (maandag tot en met vandaag)', () => {
    const insights = [{ createdAt: '2026-11-16T08:00:00.000Z' }, { createdAt: '2026-11-22T08:00:00.000Z' }, { createdAt: '2026-11-15T23:00:00.000Z' }];
    expect(insightsThisWeek(insights, '2026-11-22')).toBe(2);
  });

  it('de nieuwe blokken staan in de standaardindeling, komen achteraan bij een oude indeling en zijn per blok uit te zetten', () => {
    for (const id of ['groei', 'kennis', 'financien', 'maaltijden'] as const) expect(defaultLayout.order).toContain(id);
    const old = normalizeLayout({ order: ['today', 'backup'], hidden: [] });
    expect(old.order.slice(0, 2)).toEqual(['today', 'backup']);
    expect(old.order).toContain('financien');
    expect(toggleWidget(old, 'financien').hidden).toEqual(['financien']);
  });
});
