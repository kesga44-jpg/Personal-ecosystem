import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { BarChart, Button, Card, EmptyState, ErrorBanner, Field, Heatmap, LineChart, PageHeader, ProgressRing, StatusPill } from '@ecosystem/ui';
import { calculatePoints, sportPointDays } from '@ecosystem/sidequest/domain';
import { trainingDaysFrom } from '../integrations/trainingDays';
import { levelInfo } from '@ecosystem/sidequest/progress';
import type { Activity } from '@ecosystem/sportapp/domain';
import type { Shortcut } from '@ecosystem/hub/domain';
import type { Habit, HabitCheck, Quest } from '@ecosystem/sidequest/domain';
import { emptyData, lastBackup, loadData, type DashboardData } from './data';
import { difference, weekReview } from './review';
import { RemindersCard } from '../reminders/RemindersCard';
import { reminderInput } from '../reminders/input';
import { checkHeatmap, dagboekWrittenToday, daysSince, duurWeekTotals, krachtSessionsThisWeek, greeting, habitsToday, lichaamFilledToday, localDateKey, pointsPerDay, sportWeek, topStreaks, voedingLoggedToday } from './summary';
import { moveWidget, readLayout, toggleWidget, widgetLabels, writeLayout, type WidgetId, type WidgetLayout } from './widgets';
import { describeWeather, forecastUrl, geocodingUrl, parseForecast, parseGeocoding, readLocation, trainingAdvice, writeLocation, type WeatherLocation, type WeatherNow } from './weather';
import { readLocalValue } from '../localValues';

const externalApps = [
  { title: 'Samen Thuis', url: 'https://kesga44-jpg.github.io/Samen-thuis/' },
  { title: 'Coach', url: 'https://kesga44-jpg.github.io/Coach/' }
];

function displayName(): string {
  try {
    const raw = JSON.parse(readLocalValue('personal-ecosystem.hub.preferences') ?? '{}') as { displayName?: unknown };
    return typeof raw.displayName === 'string' ? raw.displayName.trim().slice(0, 60) : '';
  } catch {
    return '';
  }
}


export default function WidgetDashboard() {
  const [data, setData] = useState<DashboardData>(emptyData);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [layout, setLayout] = useState<WidgetLayout>(() => readLayout());
  const [editing, setEditing] = useState(false);
  const now = useMemo(() => new Date(), []);
  const today = localDateKey(now);

  useEffect(() => {
    let active = true;
    loadData()
      .then((next) => {
        if (!active) return;
        setData(next);
        setLoaded(true);
      })
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
    review: <ReviewWidget data={data} today={today} />,
    streaks: <StreaksWidget data={data} today={today} />,
    points: <PointsWidget data={data} today={today} />,
    lichaam: <LichaamWidget filled={lichaamFilledToday(data.lichaamDates, today)} />,
    duur: <DuurWidget totals={duurWeekTotals(data.duurTotals, today)} />,
    kracht: <KrachtWidget count={krachtSessionsThisWeek(data.krachtDates, today)} />,
    voeding: <VoedingWidget logged={voedingLoggedToday(data.voedingDates, today)} />,
    maaltijden: <MaaltijdenWidget summary={data.maaltijden} />,
    groei: <GroeiWidget summary={data.groei} />,
    kennis: <KennisWidget summary={data.kennis} />,
    financien: <FinancienWidget summary={data.financien} />,
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
      <RemindersCard input={reminderInput(data)} now={now} today={today} loaded={loaded} />
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

function dashboardSportDays(data: DashboardData): string[] {
  return sportPointDays(data.sportLink, trainingDaysFrom({ activityStarts: data.activities.map((activity) => activity.startedAt), krachtDates: data.krachtDates.map((item) => item.date), duurDates: data.duurTotals.map((item) => item.date) }));
}

function ReviewWidget({ data, today }: { data: DashboardData; today: string }) {
  const { last, before } = weekReview(data, today, dashboardSportDays(data));
  const day = (value: string) => new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short' }).format(new Date(`${value}T12:00:00`));
  const rows: [string, number, number][] = [
    ['Trainingen', last.workouts, before.workouts],
    ['Beweegminuten', last.activeMinutes, before.activeMinutes],
    ['Gewoontes afgevinkt', last.habitChecks, before.habitChecks],
    ['Quests voltooid', last.questsCompleted, before.questsCompleted],
    ['Punten', last.points, before.points],
    ['Dagen met dagboek', last.journalDays, before.journalDays],
    ['Dagen met Lichaam', last.bodyDays, before.bodyDays],
    ['Dagen met Voeding', last.foodDays, before.foodDays]
  ];
  return (
    <>
      <p className="item-subtitle">{day(last.start)} t/m {day(last.end)}, vergeleken met de week ervoor.</p>
      <table className="review-table">
        <thead>
          <tr><th scope="col">Onderdeel</th><th scope="col">Vorige week</th><th scope="col">Verschil</th></tr>
        </thead>
        <tbody>
          {rows.map(([label, current, previous]) => (
            <tr key={label}><th scope="row">{label}</th><td>{current}</td><td className="muted">{difference(current, previous)}</td></tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function PointsWidget({ data, today }: { data: DashboardData; today: string }) {
  const sportDays = dashboardSportDays(data);
  const points = pointsPerDay(data.checks, data.quests, today, 14, sportDays);
  const total = points.reduce((sum, point) => sum + point.value, 0);
  const level = levelInfo(calculatePoints(data.checks, data.quests, sportDays));
  return (
    <>
      <p className="widget-stat">{total}<small>punten in 14 dagen</small></p>
      <LineChart title="Verdiende punten per dag, laatste 14 dagen" points={points} unit="punten" />
      <p className="item-subtitle">Level {level.level} · nog {level.nextAt - level.points} punten tot level {level.level + 1}</p>
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

function DuurWidget({ totals }: { totals: { sessions: number; km: number; minutes: number } }) {
  return (
    <>
      <StatusPill tone={totals.sessions ? 'good' : 'neutral'}>{totals.sessions ? `${totals.sessions} ${totals.sessions === 1 ? 'training' : 'trainingen'} deze week` : 'Deze week nog geen duurtraining'}</StatusPill>
      {totals.sessions > 0 && <p className="item-title">{totals.km.toLocaleString('nl-NL', { maximumFractionDigits: 1 })} km · {totals.minutes} min</p>}
      <p className="item-subtitle">Routes en hartslag blijven in Duur. Het dashboard ziet alleen de totalen van deze week.</p>
      <div className="chip-row">
        <a className="chip" href="/duur/importeren">⇧ Importeren</a>
        <a className="chip" href="/duur">Overzicht</a>
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

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function MaaltijdenWidget({ summary }: { summary: DashboardData['maaltijden'] }) {
  if (!summary || !summary.activePlans) {
    return (
      <>
        <StatusPill>Geen plan voor vandaag</StatusPill>
        <p className="item-subtitle">Je persoonlijke maaltijdplanning staat in Voeding. Het gedeelde weekmenu blijft in Samen Thuis.</p>
        <div className="chip-row"><a className="chip" href="/voeding/planning">Naar de planning</a></div>
      </>
    );
  }
  return (
    <>
      <StatusPill tone={summary.plannedToday && summary.eatenToday === summary.plannedToday ? 'good' : 'neutral'}>{summary.eatenToday} van {plural(summary.plannedToday, 'geplande maaltijd', 'geplande maaltijden')} gegeten</StatusPill>
      <p className="item-subtitle">Het dashboard ziet alleen aantallen, geen recepten of hoeveelheden.</p>
      <div className="chip-row"><a className="chip" href="/voeding/planning">Planning bekijken</a></div>
    </>
  );
}

function GroeiWidget({ summary }: { summary: DashboardData['groei'] }) {
  if (!summary) return <p className="item-subtitle">Nog geen gegevens.</p>;
  return (
    <>
      <p className="widget-stat">{summary.activeGoals}<small>{summary.activeGoals === 1 ? 'actief doel' : 'actieve doelen'}</small></p>
      <div className="chip-row">
        <StatusPill tone={summary.overdueActions ? 'warning' : 'neutral'}>{plural(summary.openActions, 'open actie', 'open acties')}{summary.overdueActions ? `, ${summary.overdueActions} te laat` : ''}</StatusPill>
        <StatusPill tone={summary.habitsOpenToday ? 'neutral' : 'good'}>{summary.habitsOpenToday ? `${plural(summary.habitsOpenToday, 'gewoonte', 'gewoontes')} nog af te vinken` : 'Gewoontes van vandaag gedaan'}</StatusPill>
      </div>
      <div className="chip-row"><a className="chip" href="/groei/acties">Prioriteiten</a><a className="chip" href="/groei/gewoontes">Gewoontes</a></div>
    </>
  );
}

function KennisWidget({ summary }: { summary: DashboardData['kennis'] }) {
  if (!summary) return <p className="item-subtitle">Nog geen gegevens.</p>;
  return (
    <>
      <p className="widget-stat">{summary.minutesThisWeek}<small>min gelezen of geluisterd deze week</small></p>
      <p className="item-subtitle">{plural(summary.inProgress, 'bron', 'bronnen')} bezig · {summary.finishedThisYear} afgerond dit jaar · {plural(summary.insightsThisWeek, 'nieuw inzicht', 'nieuwe inzichten')} deze week</p>
      <div className="chip-row"><a className="chip" href="/kennis/logboek">＋ Logboek</a><a className="chip" href="/kennis/inzichten">Inzichten</a></div>
    </>
  );
}

function FinancienWidget({ summary }: { summary: DashboardData['financien'] }) {
  if (!summary) return <p className="item-subtitle">Nog geen gegevens.</p>;
  const euros = (cents: number) => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(cents / 100);
  return (
    <>
      <p className="widget-stat">{euros(summary.balanceCents)}<small>saldo deze maand</small></p>
      <p className="item-subtitle">In {euros(summary.inCents)} · uit {euros(summary.outCents)}</p>
      <div className="chip-row">
        <StatusPill tone={summary.budgetsOver ? 'warning' : 'good'}>{summary.budgetsOver ? `${plural(summary.budgetsOver, 'budget', 'budgetten')} overschreden` : 'Binnen budget'}</StatusPill>
        <StatusPill>{plural(summary.activePlans, 'actief beleggingsplan', 'actieve beleggingsplannen')}</StatusPill>
      </div>
      <p className="item-subtitle">Alleen totalen; geen omschrijvingen of tegenpartijen. Verberg dit blok als anderen je scherm zien.</p>
      <div className="chip-row"><a className="chip" href="/financien/transacties?nieuw=1">＋ Transactie</a><a className="chip" href="/financien">Overzicht</a></div>
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
      <a className="chip" href="/duur">〰 Duur</a>
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
