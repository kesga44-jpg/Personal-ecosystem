/** Widgetindeling van het dashboard: volgorde en zichtbaarheid, per apparaat bewaard. */

export const WIDGET_IDS = ['today', 'sport-week', 'streaks', 'points', 'lichaam', 'dagboek', 'weather', 'habits-heatmap', 'backup', 'apps'] as const;
export type WidgetId = (typeof WIDGET_IDS)[number];

export const widgetLabels: Record<WidgetId, string> = {
  today: 'Vandaag',
  'sport-week': 'Beweging deze week',
  streaks: 'Streaks',
  points: 'Punten',
  lichaam: 'Lichaam',
  dagboek: 'Dagboek',
  weather: 'Weer',
  'habits-heatmap': 'Gewoontes (4 weken)',
  backup: 'Back-up',
  apps: 'Apps en snelkoppelingen'
};

export interface WidgetLayout {
  order: WidgetId[];
  hidden: WidgetId[];
}

export const defaultLayout: WidgetLayout = { order: [...WIDGET_IDS], hidden: [] };

const storageKey = 'personal-ecosystem.dashboard.layout';

function isWidgetId(value: unknown): value is WidgetId {
  return typeof value === 'string' && (WIDGET_IDS as readonly string[]).includes(value);
}

/** Maakt een opgeslagen indeling veilig: onbekende ID's eruit, nieuwe widgets achteraan erbij. */
export function normalizeLayout(input: unknown): WidgetLayout {
  if (!input || typeof input !== 'object') return { ...defaultLayout, order: [...defaultLayout.order] };
  const candidate = input as Partial<Record<keyof WidgetLayout, unknown>>;
  const order = Array.isArray(candidate.order) ? [...new Set(candidate.order.filter(isWidgetId))] : [];
  for (const id of WIDGET_IDS) if (!order.includes(id)) order.push(id);
  const hidden = Array.isArray(candidate.hidden) ? [...new Set(candidate.hidden.filter(isWidgetId))] : [];
  return { order, hidden };
}

export function moveWidget(layout: WidgetLayout, id: WidgetId, direction: -1 | 1): WidgetLayout {
  const order = [...layout.order];
  const index = order.indexOf(id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= order.length) return layout;
  [order[index], order[target]] = [order[target]!, order[index]!];
  return { ...layout, order };
}

export function toggleWidget(layout: WidgetLayout, id: WidgetId): WidgetLayout {
  const hidden = layout.hidden.includes(id) ? layout.hidden.filter((item) => item !== id) : [...layout.hidden, id];
  return { ...layout, hidden };
}

export function readLayout(): WidgetLayout {
  try {
    return normalizeLayout(JSON.parse(localStorage.getItem(storageKey) ?? 'null'));
  } catch {
    return normalizeLayout(null);
  }
}

export function writeLayout(layout: WidgetLayout): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(layout));
  } catch {
    // Alleen een voorkeur; zonder opslag blijft de standaardindeling werken.
  }
}
