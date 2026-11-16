import { describe, expect, it } from 'vitest';
import { WIDGET_IDS, defaultLayout, moveWidget, normalizeLayout, readLayout, toggleWidget, writeLayout } from './widgets';

describe('widgetindeling', () => {
  it('herstelt een beschadigde of verouderde indeling veilig', () => {
    expect(normalizeLayout(null).order).toEqual([...WIDGET_IDS]);
    const layout = normalizeLayout({ order: ['weather', 'onbekend', 'weather', 'today'], hidden: ['backup', 'x'] });
    expect(layout.order.slice(0, 2)).toEqual(['weather', 'today']);
    expect(layout.order).toHaveLength(WIDGET_IDS.length);
    expect(layout.hidden).toEqual(['backup']);
  });

  it('verplaatst widgets binnen de grenzen', () => {
    const up = moveWidget(defaultLayout, 'sport-week', -1);
    expect(up.order.slice(0, 2)).toEqual(['sport-week', 'today']);
    expect(moveWidget(defaultLayout, 'today', -1)).toBe(defaultLayout);
  });

  it('verbergt en toont widgets', () => {
    const hidden = toggleWidget(defaultLayout, 'points');
    expect(hidden.hidden).toEqual(['points']);
    expect(toggleWidget(hidden, 'points').hidden).toEqual([]);
  });

  it('bewaart de indeling per apparaat', () => {
    writeLayout(toggleWidget(defaultLayout, 'apps'));
    expect(readLayout().hidden).toEqual(['apps']);
    localStorage.removeItem('personal-ecosystem.dashboard.layout');
  });
});
