import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { openLocalDatabase } from '@ecosystem/storage';
import { BarChart, Button, Card, EmptyState, ErrorBanner, Field, Heatmap, LineChart, PageHeader, ProgressRing, StatusPill } from '@ecosystem/ui';
import { databaseConfig as hubConfig } from '@ecosystem/hub/App';
import { databaseConfig as sportConfig } from '@ecosystem/sportapp/App';
import { databaseConfig as questConfig } from '@ecosystem/sidequest/App';
import type { Shortcut } from '@ecosystem/hub/domain';
import type { Activity } from '@ecosystem/sportapp/domain';
import type { Habit, HabitCheck, Quest } from '@ecosystem/sidequest/domain';
import { databaseConfig as lichaamConfig } from '../modules/lichaam/storage';
import type { BodyDay } from '../modules/lichaam/domain';
import { databaseConfig as dagboekConfig } from '../modules/dagboek/storage';
import type { JournalEntry } from '../modules/dagboek/domain';
import { databaseConfig as voedingConfig } from '../modules/voeding/storage';
import type { FoodEntry } from '../modules/voeding/domain';
import { databaseConfig as krachtConfig } from '../modules/kracht/storage';
import type { Session as StrengthSession } from '../modules/kracht/domain';
import { checkHeatmap, dagboekWrittenToday, daysSince, krachtSessionsThisWeek, greeting, habitsToday, lichaamFilledToday, localDateKey, pointsPerDay, sportWeek, topStreaks, voedingLoggedToday } from './summary';
import { moveWidget, readLayout, toggleWidget, widgetLabels, writeLayout, type WidgetId, type WidgetLayout } from './widgets';
import { describeWeather, forecastUrl, geocodingUrl, parseForecast, parseGeocoding, readLocation, trainingAdvice, writeLocation, type WeatherLocation, type WeatherNow } from './weather';

interface DashboardData {
  activities: Activity[];
  habits: Habit[];
  checks: HabitCheck[];
  quests: Quest[];
  shortcuts: Shortcut[];
  /** Alleen datums van Lichaam-registraties; geen waarden (ADR 0020 § 2). */
  lichaamDates: { date: string }[];
  /** Alleen datums van Dagboek-notities; geen stemming of tekst. */
  dagboekDates: { date: string }[];
  /** Alleen datums van Voeding-registraties; geen producten of hoeveelheden. */
  voedingDates: { date: string }[];
  /** Alleen datums van Kracht-trainingen; geen oefeningen of gewichten. */
  krachtDates: { date: string }[];
}

const emptyData: DashboardData = { activities: [], habits: [], checks: [], quests: [], shortcuts: [], lichaamDates: [], dagboekDates: [], voedingDates: [], krachtDates: [] };
const externalApps = [
  { title: 'Samen Thuis', url: 'https://kesga44-jpg.github.io/Samen-thuis/' },
  { title: 'Coach', url: 'https://kesga44-jpg.github.io/Coach/' }
];

function displayName(): string {
  try {
    const raw = JSON.parse(localStorage.getItem('personal-ecosystem.hub.preferences') ?? '{}') as { displayName?: unknown };
    return typeof raw.displayName === 'string' ? raw.displayName.trim().slice(0, 60) : '';
  } catch {
    return '';
  }
}

function lastBackup(): string {
  try {
    return localStorage.getItem('personal-ecosystem.backup.last-export') ?? '';
  } catch {
    return '';
  }
}

/** Leest alleen samenvattingen uit de modules (ADR 0020 § 2); het dashboard schrijft nooit in andere modules. */
async function loadData(): Promise<DashboardData> {
  const [hub, sport, quest, lichaam, dagboek, voeding, kracht] = await Promise.all([
    openLocalDatabase(hubConfig),
    openLocalDatabase(sportConfig),
    openLocalDatabase(questConfig),
    openLocalDatabase(lichaamConfig),
    openLocalDatabase(dagboekConfig),
    openLocalDatabase(voedingConfig),
    openLocalDatabase(krachtConfig)
  ]);
  try {
    const [shortcuts, activities, habits, checks, quests, bodyDays, journal, food, strength] = await Promise.all([
      hub.list<Shortcut>('shortcuts'),
      sport.list<Activity>('activities'),
      quest.list<Habit>('habits'),
      quest.list<HabitCheck>('habitChecks'),
      quest.list<Quest>('quests'),
      lichaam.list<BodyDay>('days'),
      dagboek.list<JournalEntry>('entries'),
      voeding.list<FoodEntry>('entries'),
      kracht.list<StrengthSession>('sessions')
    ]);
    return { activities, habits, checks, quests, shortcuts, lichaamDates: bodyDays.map((day) => ({ date: day.date })), dagboekDates: journal.map((entry) => ({ date: entry.date })), voedingDates: food.map((entry) => ({ date: entry.date })), krachtDates: strength.map((session) => ({ date: session.date })) };
  } finally {
    hub.close();
    sport.close();
    quest.close();
    lichaam.close();
    dagboek.close();
    voeding.close();
    kracht.close();
  }
}

export default function WidgetDashboard() {
  const [data, setData] = useState<DashboardData>(emptyData);
  const [error, setError] = useState('');
  const [layout, setLayout] = useState<WidgetLayout>(() => readLayout());
  const [editing, setEditing] = useState(false);
  const now = useMemo(() => new Date(), []);
  const today = localDateKey(now);

  useEffect(() => {
    let active = true;
    loadData()
      .then((next) => active && setData(next))
      .catch((cause: unknown) => active && setError(cause instanceof Error ? cause.message : 'Gegevens konden niet worden geladen.'));
    return () => {
      active = false;
    };
  }, []);

  function update(next: WidgetLayout) {
    setLayout(next);
    writeLayout(next);
  }

  const name = displayName();
  const widgets: Record<WidgetId, ReactNode> = {
    today: <TodayWidget data={data} today={today} />,
    'sport-week': <SportWeekWidget activities={data.activities} today={today} />,
    streaks: <StreaksWidget data={data} today={today} />,
    points: <PointsWidget data={data} today={today} />,
    lichaam: <LichaamWidget filled={lichaamFilledToday(data.lichaamDates, today)} />,
    kracht: <KrachtWidget count={krachtSessionsThisWeek(data.krachtDates, today)} />,
    voeding: <VoedingWidget logged={voedingLoggedToday(data.voedingDates, today)} />,
    dagboek: <DagboekWidget written={dagboekWrittenToday(data.dagboekDates, today)} />,
    weather: <WeatherWidget />,
    'habits-heatmap': <HeatmapWidget checks={data.checks} today={today} />,
    backup: <BackupWidget now={now} />,
    apps: <AppsWidget shortcuts={data.shortcuts} />
  };
  const visible = editing ? layout.order : layout.order.filter((id) => !layout.hidden.includes(id));

  return (
    <div className="stack">
      <PageHeader
        eyebrow={new Intl.DateTimeFormat('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' }).format(now)}
        title={`${greeting(now)}${name ? `, ${name}` : ''}.`}
        description="Je dag in één oogopslag. Alles staat alleen op dit apparaat."
        action={<Button variant="secondary" onClick={() => setEditing((value) => !value)} aria-pressed={editing}>{editing ? 'Klaar' : 'Widgets aanpassen'}</Button>}
      />
      {error && <ErrorBanner message={error} />}
      <div className="widget-grid">
        {visible.map((id, index) => {
          const hidden = layout.hidden.includes(id);
          return (
            <Card
              key={id}
              title={widgetLabels[id]}
              className={`widget${hidden ? ' widget-hidden' : ''}`}
              action={
                editing ? (
                  <div className="widget-edit">
                    <Button variant="secondary" onClick={() => update(moveWidget(layout, id, -1))} disabled={index === 0} aria-label={`${widgetLabels[id]} omhoog`}>↑</Button>
                    <Button variant="secondary" onClick={() => update(moveWidget(layout, id, 1))} disabled={index === visible.length - 1} aria-label={`${widgetLabels[id]} omlaag`}>↓</Button>
                    <Button variant="secondary" onClick={() => update(toggleWidget(layout, id))} aria-pressed={!hidden}>{hidden ? 'Tonen' : 'Verbergen'}</Button>
                  </div>
                ) : undefined
              }
            >
              {widgets[id]}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function TodayWidget({ data, today }: { data: DashboardData; today: string }) {
  const habits = habitsToday(data.habits, data.checks, today);
  const activitiesToday = data.activities.filter((activity) => localDateKey(new Date(activity.startedAt)) === today);
  const minutes = activitiesToday.reduce((sum, activity) => sum + activity.durationMinutes, 0);
  return (
    <>
      <div className="widget-row">
        {habits.total > 0 ? <ProgressRing label="Gewoontes vandaag" value={habits.done} max={habits.total} /> : <span className="tile-icon" aria-hidden="true">✦</span>}
        <div>
          <p className="item-title">{habits.total ? `${habits.done} van ${habits.total} gewoontes gedaan` : 'Nog geen dagelijkse gewoontes'}</p>
          <p className="item-subtitle">{minutes ? `${minutes} min bewogen vandaag` : 'Vandaag nog geen activiteit vastgelegd'}</p>
        </div>
      </div>
      {habits.open.length > 0 && <p className="item-subtitle">Nog open: {habits.open.slice(0, 3).join(', ')}{habits.open.length > 3 ? ` en ${habits.open.length - 3} meer` : ''}</p>}
      <div className="chip-row">
        <a className="chip" href="/quest/gewoontes">✓ Gewoonte afvinken</a>
        <a className="chip" href="/sport/activiteiten">＋ Activiteit</a>
      </div>
    </>
  );
}

function SportWeekWidget({ activities, today }: { activities: Activity[]; today: string }) {
  const week = sportWeek(activities, today);
  return (
    <>
      <p className="widget-stat">{week.totalMinutes}<small>min · {week.count} activiteiten · {week.totalKm.toLocaleString('nl-NL')} km</small></p>
      <BarChart title="Beweegminuten per dag, laatste 7 dagen" points={week.points} unit="min" />
      <p className="widget-foot"><a href="/sport">Naar Sport →</a></p>
    </>
  );
}

function StreaksWidget({ data, today }: { data: DashboardData; today: string }) {
  const streaks = topStreaks(data.habits, data.checks, today);
  if (!streaks.length) return <EmptyState title="Nog geen streak">Vink een gewoonte twee dagen achter elkaar af om een reeks te starten.</EmptyState>;
  return (
    <div className="list">
      {streaks.map((item) => (
        <div className="list-item" key={item.title}>
          <span className="item-title">{item.title}</span>
          <StatusPill tone="good">🔥 {item.streak}</StatusPill>
        </div>
      ))}
    </div>
  );
}

function PointsWidget({ data, today }: { data: DashboardData; today: string }) {
  const points = pointsPerDay(data.checks, data.quests, today);
  const total = points.reduce((sum, point) => sum + point.value, 0);
  return (
    <>
      <p className="widget-stat">{total}<small>punten in 14 dagen</small></p>
      <LineChart title="Verdiende punten per dag, laatste 14 dagen" points={points} unit="punten" />
    </>
  );
}

function LichaamWidget({ filled }: { filled: boolean }) {
  return (
    <>
      <StatusPill tone={filled ? 'good' : 'neutral'}>{filled ? '✓ Vandaag ingevuld' : 'Vandaag nog niet ingevuld'}</StatusPill>
      <p className="item-subtitle">Gewicht, slaap, hartslag en herstel. Het dashboard toont alleen óf je iets hebt ingevuld, niet wat.</p>
      <div className="chip-row">
        <a className="chip" href="/lichaam/invoeren">{filled ? '✎ Aanvullen' : '＋ Meting invoeren'}</a>
        <a className="chip" href="/lichaam">Trends bekijken</a>
      </div>
    </>
  );
}

function KrachtWidget({ count }: { count: number }) {
  return (
    <>
      <StatusPill tone={count ? 'good' : 'neutral'}>{count ? `${count} ${count === 1 ? 'training' : 'trainingen'} deze week` : 'Deze week nog niet getraind'}</StatusPill>
      <p className="item-subtitle">Schema’s, sets en records blijven in Kracht. Het dashboard ziet alleen hoeveel trainingen je deze week deed.</p>
      <div className="chip-row">
        <a className="chip" href="/kracht/training">▶ Training starten</a>
        <a className="chip" href="/kracht/voortgang">Voortgang</a>
      </div>
    </>
  );
}

function VoedingWidget({ logged }: { logged: boolean }) {
  return (
    <>
      <StatusPill tone={logged ? 'good' : 'neutral'}>{logged ? '✓ Vandaag geregistreerd' : 'Vandaag nog niets geregistreerd'}</StatusPill>
      <p className="item-subtitle">Wat je eet blijft in Voeding. Het dashboard ziet alleen óf je vandaag iets hebt geregistreerd.</p>
      <div className="chip-row">
        <a className="chip" href="/voeding/toevoegen">＋ Toevoegen</a>
        <a className="chip" href="/voeding">Vandaag bekijken</a>
      </div>
    </>
  );
}

function DagboekWidget({ written }: { written: boolean }) {
  return (
    <>
      <StatusPill tone={written ? 'good' : 'neutral'}>{written ? '✓ Vandaag geschreven' : 'Vandaag nog niet geschreven'}</StatusPill>
      <p className="item-subtitle">Je dagboek is privé. Het dashboard ziet alleen óf je vandaag iets hebt geschreven, niet wat of hoe je je voelt.</p>
      <div className="chip-row">
        <a className="chip" href="/dagboek/schrijven">{written ? '✎ Aanpassen' : '✎ Schrijven'}</a>
        <a className="chip" href="/dagboek">Stemming bekijken</a>
      </div>
    </>
  );
}

function HeatmapWidget({ checks, today }: { checks: HabitCheck[]; today: string }) {
  const days = checkHeatmap(checks, today);
  return (
    <>
      <Heatmap title="Afgevinkte gewoontes per dag, laatste 4 weken" days={days} />
      <p className="widget-foot">{days.filter((day) => day.value > 0).length} van de 28 dagen actief</p>
    </>
  );
}

function BackupWidget({ now }: { now: Date }) {
  const last = lastBackup();
  const days = last ? daysSince(last, now) : null;
  const stale = days === null || days > 14;
  return (
    <>
      <StatusPill tone={stale ? 'warning' : 'good'}>{days === null ? 'Nog geen back-up' : days === 0 ? 'Vandaag gemaakt' : `${days} dagen geleden`}</StatusPill>
      <p className="item-subtitle">{stale ? 'Je gegevens staan alleen op dit apparaat. Maak een back-up zodat je niets kwijtraakt.' : 'Goed bezig. Bewaar het bestand op een veilige plek.'}</p>
      <a className="button button-primary" href="/back-up">Back-up maken</a>
    </>
  );
}

function AppsWidget({ shortcuts }: { shortcuts: Shortcut[] }) {
  return (
    <div className="chip-row">
      <a className="chip" href="/sport">↗ Sport</a>
      <a className="chip" href="/kracht">▲ Kracht</a>
      <a className="chip" href="/quest">✦ SIDEQUEST</a>
      <a className="chip" href="/lichaam">♥ Lichaam</a>
      <a className="chip" href="/voeding">◔ Voeding</a>
      <a className="chip" href="/dagboek">✎ Dagboek</a>
      {externalApps.map((app) => <a key={app.url} className="chip" href={app.url} target="_blank" rel="noopener noreferrer">{app.title} ↗</a>)}
      {shortcuts.slice(0, 6).map((shortcut) => <a key={shortcut.id} className="chip" href={shortcut.url} target="_blank" rel="noopener noreferrer">{shortcut.title} ↗</a>)}
    </div>
  );
}

function WeatherWidget() {
  const [location, setLocation] = useState<WeatherLocation | null>(() => readLocation());
  const [weather, setWeather] = useState<WeatherNow | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<WeatherLocation[]>([]);

  useEffect(() => {
    if (!location) return;
    let active = true;
    setError('');
    fetch(forecastUrl(location))
      .then((response) => {
        if (!response.ok) throw new Error(`Weerdienst gaf status ${response.status}.`);
        return response.json() as Promise<unknown>;
      })
      .then((json) => active && setWeather(parseForecast(json)))
      .catch((cause: unknown) => active && setError(cause instanceof Error ? cause.message : 'Weer niet beschikbaar.'));
    return () => {
      active = false;
    };
  }, [location]);

  async function search(event: FormEvent) {
    event.preventDefault();
    if (query.trim().length < 2) return;
    setError('');
    try {
      const response = await fetch(geocodingUrl(query));
      if (!response.ok) throw new Error(`Zoeken gaf status ${response.status}.`);
      const found = parseGeocoding(await response.json());
      setResults(found);
      if (!found.length) setError('Geen plaats gevonden.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Zoeken mislukt.');
    }
  }

  function choose(next: WeatherLocation | null) {
    writeLocation(next);
    setLocation(next);
    setWeather(null);
    setResults([]);
  }

  if (!location) {
    return (
      <form className="stack" onSubmit={(event) => void search(event)}>
        <Field label="Plaats voor het weer" hint="Alleen een afgeronde locatie (ca. 1 km) gaat naar Open-Meteo.">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Bijv. Utrecht" />
        </Field>
        <Button type="submit">Zoeken</Button>
        {error && <p className="item-subtitle">{error}</p>}
        {results.length > 0 && (
          <div className="chip-row">
            {results.map((place) => <button key={`${place.latitude},${place.longitude}`} type="button" className="chip" onClick={() => choose(place)}>{place.name}</button>)}
          </div>
        )}
      </form>
    );
  }

  const description = weather ? describeWeather(weather.code) : null;
  return (
    <>
      {error && <p className="item-subtitle">{error}</p>}
      {weather && description ? (
        <>
          <div className="weather-now">
            <span className="weather-icon" aria-hidden="true">{description.icon}</span>
            <div>
              <p className="widget-stat">{Math.round(weather.temperature)}°<small>{description.label}</small></p>
              <p className="item-subtitle">{Math.round(weather.min)}° / {Math.round(weather.max)}° · wind {Math.round(weather.windKmh)} km/u{weather.rainChance !== null ? ` · ${weather.rainChance}% regen` : ''}</p>
            </div>
          </div>
          <p className="notice">{trainingAdvice(weather)}</p>
        </>
      ) : !error ? <p className="loading-state">Weer laden…</p> : null}
      <p className="widget-foot">
        {location.name} · <button type="button" className="text-button" onClick={() => choose(null)}>Wijzig plaats</button> · Weergegevens: <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo.com</a> (CC BY 4.0)
      </p>
    </>
  );
}
