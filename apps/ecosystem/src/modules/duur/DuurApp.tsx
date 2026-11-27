import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { BrowserRouter, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { newId } from '@ecosystem/core';
import { openLocalDatabase, runStorageAction as performStorageAction, type LocalDatabase } from '@ecosystem/storage';
import {
  AppFrame,
  BarChart,
  Button,
  Card,
  ConfirmAction,
  EmptyState,
  ErrorBanner,
  Field,
  LineChart,
  LoadingState,
  PageHeader,
  StatusPill,
  type ModuleLink
} from '@ecosystem/ui';
import {
  SPORTS,
  expandTrack,
  formatDistance,
  formatDuration,
  formatPace,
  hasRoute,
  heartRateZones,
  isSport,
  kmSplits,
  localDateKey,
  speedSeries,
  sportLabels,
  summarize,
  validateSettings,
  validateWorkout,
  weekTotals,
  weeklyVolume,
  workoutFromParsed,
  zoneLabels,
  type DuurSettings,
  type ParsedActivity,
  type Source,
  type Sport,
  type Track,
  type TrackPoint,
  type Workout
} from './domain';
import { ACCEPT, readActivityFile } from './parsers';
import { RouteMap } from './RouteMap';
import { databaseConfig } from './storage';
import { ConceptNotice, useFormConcept } from '../../formConcept';

const navigation = [
  { to: '/', label: 'Overzicht', icon: '⌂' },
  { to: '/importeren', label: 'Importeren', icon: '⇧' },
  { to: '/toevoegen', label: 'Toevoegen', icon: '＋' },
  { to: '/geschiedenis', label: 'Geschiedenis', icon: '◷' },
  { to: '/instellingen', label: 'Instellingen', icon: '⚙' }
];

const emptySettings: DuurSettings = { id: 'settings', maxHr: null };

function todayKey(): string {
  return localDateKey(new Date().toISOString());
}

function formatDay(date: string): string {
  return new Intl.DateTimeFormat('nl-NL', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${date}T12:00:00`));
}

const nl = (value: number, digits = 1) => value.toLocaleString('nl-NL', { maximumFractionDigits: digits });

function message(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}

function parseNumber(raw: string): number | null {
  const text = raw.trim().replace(',', '.');
  if (!text) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : Number.NaN;
}

export default function DuurApp({ links }: { links: ModuleLink[] }) {
  return (
    <BrowserRouter basename="/duur">
      <DuurRoutes links={links} />
    </BrowserRouter>
  );
}

function DuurRoutes({ links }: { links: ModuleLink[] }) {
  const [database, setDatabase] = useState<LocalDatabase | null>(null);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [settings, setSettings] = useState<DuurSettings>(emptySettings);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function refresh(db: LocalDatabase) {
    const [nextWorkouts, nextSettings] = await Promise.all([db.list<Workout>('workouts'), db.list<DuurSettings>('settings')]);
    setWorkouts(nextWorkouts.sort((a, b) => b.startedAt.localeCompare(a.startedAt)));
    setSettings(nextSettings[0] ?? emptySettings);
  }

  useEffect(() => {
    let active = true;
    let opened: LocalDatabase | null = null;
    void openLocalDatabase(databaseConfig)
      .then(async (db) => {
        opened = db;
        await refresh(db);
        if (active) setDatabase(db);
      })
      .catch((cause: unknown) => active && setError(message(cause, 'Lokale gegevens konden niet worden geopend.')))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
      opened?.close();
    };
  }, []);

  async function run(action: (db: LocalDatabase) => Promise<void>): Promise<boolean> {
    if (!database) {
      setError('Lokale opslag is niet beschikbaar.');
      return false;
    }
    return performStorageAction(() => action(database), () => refresh(database), setError, 'De wijziging kon niet worden opgeslagen.');
  }

  async function loadTrack(id: string): Promise<Track | null> {
    if (!database) return null;
    return (await database.get<Track>('tracks', id)) ?? null;
  }

  return (
    <AppFrame appName="Duur" appMark="〰" navigation={navigation} moduleLinks={links}>
      {loading ? (
        <LoadingState />
      ) : (
        <Routes>
          <Route
            path="/importeren"
            element={
              <ImportPage
                workouts={workouts}
                error={error}
                onSave={(items) =>
                  run(async (db) => {
                    for (const item of items) {
                      await db.put('workouts', item.workout);
                      if (item.track) await db.put('tracks', item.track);
                    }
                  })
                }
              />
            }
          />
          <Route path="/toevoegen" element={<ManualPage error={error} onSave={(workout) => run((db) => db.put('workouts', workout))} />} />
          <Route path="/geschiedenis" element={<HistoryPage workouts={workouts} />} />
          <Route
            path="/activiteit/:id"
            element={
              <DetailPage
                workouts={workouts}
                settings={settings}
                error={error}
                loadTrack={loadTrack}
                onUpdate={(workout) => run((db) => db.put('workouts', workout))}
                onDelete={(id) =>
                  run(async (db) => {
                    await db.remove('workouts', id);
                    await db.remove('tracks', id);
                  })
                }
              />
            }
          />
          <Route path="/instellingen" element={<SettingsPage settings={settings} error={error} onSave={(next) => run((db) => db.put('settings', next))} />} />
          <Route path="*" element={<OverviewPage workouts={workouts} error={error} />} />
        </Routes>
      )}
    </AppFrame>
  );
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <Card className="metric">
      <p className="metric-label">{label}</p>
      <p className="metric-value">{value}</p>
      <p className="metric-note">{note}</p>
    </Card>
  );
}

function WorkoutList({ workouts }: { workouts: Workout[] }) {
  const navigate = useNavigate();
  return (
    <div className="list">
      {workouts.map((workout) => (
        <div className="list-item" key={workout.id}>
          <div>
            <p className="item-title">{workout.title}</p>
            <p className="item-subtitle">
              {formatDay(workout.date)} · {sportLabels[workout.sport]} · {formatDistance(workout.distanceM)} · {formatDuration(workout.durationSec)}
              {workout.avgHr ? ` · ♥ ${workout.avgHr}` : ''}
            </p>
          </div>
          <Button variant="secondary" onClick={() => navigate(`/activiteit/${encodeURIComponent(workout.id)}`)} aria-label={`Bekijk ${workout.title}`}>Bekijk</Button>
        </div>
      ))}
    </div>
  );
}

function OverviewPage({ workouts, error }: { workouts: Workout[]; error: string }) {
  const navigate = useNavigate();
  const today = todayKey();
  const week = weekTotals(workouts, today);
  const weeks = weeklyVolume(workouts, today, 8);
  return (
    <div className="stack">
      {error && <ErrorBanner message={error} />}
      <PageHeader
        eyebrow="Duur"
        title="Duursport"
        description="Hardlopen, fietsen, wandelen, zwemmen en roeien. Je routes blijven op dit apparaat."
        action={<Button onClick={() => navigate('/importeren')}>⇧ Importeren</Button>}
      />
      <div className="grid grid-3">
        <Metric label="Deze week" value={`${week.sessions}`} note={week.sessions === 1 ? 'training' : 'trainingen'} />
        <Metric label="Afstand deze week" value={`${nl(week.km)} km`} note="alle sporten samen" />
        <Metric label="Tijd deze week" value={formatDuration(week.minutes * 60)} note="uur:min:sec" />
      </div>
      <Card title="Kilometers per week">
        <BarChart title="Kilometers per week, laatste 8 weken" points={weeks.map((item) => ({ label: item.label, value: item.km }))} unit="km" />
        <p className="widget-foot">Week begint op maandag.</p>
      </Card>
      <Card title="Laatste trainingen">
        {workouts.length ? (
          <WorkoutList workouts={workouts.slice(0, 5)} />
        ) : (
          <EmptyState title="Nog geen trainingen">Importeer een FIT-, TCX- of GPX-bestand van je horloge of fietscomputer, of voer een training zelf in.</EmptyState>
        )}
      </Card>
    </div>
  );
}

/* ---------- Importeren ---------- */

interface Pending {
  key: string;
  fileName: string;
  source: Exclude<Source, 'handmatig'>;
  fingerprint: string;
  parsed: ParsedActivity;
  sport: Sport;
  duplicate: boolean;
}

function ImportPage({ workouts, error, onSave }: { workouts: Workout[]; error: string; onSave: (items: { workout: Workout; track: Track | null }[]) => Promise<boolean> }) {
  const navigate = useNavigate();
  const [pending, setPending] = useState<Pending[]>([]);
  const [problems, setProblems] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const known = useMemo(() => new Set(workouts.map((workout) => workout.fingerprint).filter(Boolean)), [workouts]);

  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []).slice(0, 20);
    event.target.value = '';
    if (!files.length) return;
    setBusy(true);
    const next: Pending[] = [];
    const errors: string[] = [];
    for (const file of files) {
      try {
        const { parsed, source, fingerprint } = await readActivityFile(file);
        const duplicate = known.has(fingerprint) || next.some((item) => item.fingerprint === fingerprint);
        next.push({ key: newId(), fileName: file.name, source, fingerprint, parsed, sport: parsed.sport, duplicate });
      } catch (cause) {
        errors.push(`${file.name}: ${message(cause, 'kon niet worden gelezen.')}`);
      }
    }
    setPending(next);
    setProblems(errors);
    setBusy(false);
  }

  async function save() {
    const items = pending
      .filter((item) => !item.duplicate)
      .map((item) => workoutFromParsed({ ...item.parsed, sport: item.sport }, { id: newId(), fileName: item.fileName, fingerprint: item.fingerprint, source: item.source }));
    try {
      for (const item of items) validateWorkout(item.workout, todayKey());
    } catch (cause) {
      setProblems([message(cause, 'Een training bevat ongeldige gegevens.')]);
      return;
    }
    if (await onSave(items)) navigate(items.length === 1 ? `/activiteit/${encodeURIComponent(items[0]!.workout.id)}` : '/geschiedenis');
  }

  const saveable = pending.filter((item) => !item.duplicate).length;

  return (
    <div className="stack">
      {error && <ErrorBanner message={error} />}
      <PageHeader eyebrow="Duur" title="Importeren" description="FIT, TCX of GPX (maximaal 20 bestanden, elk tot 25 MB). Bestanden worden in je browser gelezen en niet geüpload." />
      <Card>
        <Field label="Bestanden kiezen" hint="Bijvoorbeeld een export uit Garmin Connect, Strava, Wahoo, Polar of Suunto.">
          <input type="file" accept={ACCEPT} multiple onChange={(event) => void choose(event)} disabled={busy} />
        </Field>
        {busy && <p className="item-subtitle" role="status">Bestanden lezen…</p>}
        {problems.map((problem) => <p key={problem} className="item-subtitle" role="alert">{problem}</p>)}
      </Card>
      {pending.length > 0 && (
        <Card title="Controleren">
          <div className="list">
            {pending.map((item) => {
              const summary = summarize(item.parsed);
              return (
                <div className="list-item import-item" key={item.key}>
                  <div>
                    <p className="item-title">{item.fileName}</p>
                    <p className="item-subtitle">
                      {formatDay(localDateKey(item.parsed.startedAt))} · {formatDistance(summary.distanceM)} · {formatDuration(summary.durationSec)} · {formatPace(item.sport, summary.distanceM, summary.movingSec ?? summary.durationSec)}
                      {summary.avgHr ? ` · ♥ ${summary.avgHr}` : ''}
                      {hasRoute(item.parsed.points) ? ' · met route' : ' · zonder GPS'}
                    </p>
                    {item.duplicate && <StatusPill tone="warning">Al geïmporteerd</StatusPill>}
                  </div>
                  <select aria-label={`Sport voor ${item.fileName}`} value={item.sport} disabled={item.duplicate} onChange={(event) => isSport(event.target.value) && setPending((list) => list.map((entry) => (entry.key === item.key ? { ...entry, sport: event.target.value as Sport } : entry)))}>
                    {SPORTS.map((sport) => <option key={sport} value={sport}>{sportLabels[sport]}</option>)}
                  </select>
                </div>
              );
            })}
          </div>
          <div className="form-actions">
            <Button type="button" variant="secondary" onClick={() => setPending([])}>Annuleren</Button>
            <Button type="button" disabled={!saveable} onClick={() => void save()}>{saveable === 1 ? 'Training opslaan' : `${saveable} trainingen opslaan`}</Button>
          </div>
        </Card>
      )}
    </div>
  );
}

/* ---------- Handmatig ---------- */

function ManualPage({ error, onSave }: { error: string; onSave: (workout: Workout) => Promise<boolean> }) {
  const navigate = useNavigate();
  const [sport, setSport] = useState<Sport>('hardlopen');
  const [date, setDate] = useState(todayKey());
  const [time, setTime] = useState('07:00');
  const [duration, setDuration] = useState('');
  const [distance, setDistance] = useState('');
  const [avgHr, setAvgHr] = useState('');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState('');
  const concept = useFormConcept(
    'duur.training',
    'nieuw',
    'Duurtraining',
    { sport, date, time, duration, distance, avgHr, notes },
    { sport: 'hardlopen' as Sport, date: todayKey(), time: '07:00', duration: '', distance: '', avgHr: '', notes: '' },
    (value) => {
      if (value.sport in sportLabels) setSport(value.sport);
      setDate(value.date);
      setTime(value.time);
      setDuration(value.duration);
      setDistance(value.distance);
      setAvgHr(value.avgHr);
      setNotes(value.notes);
    }
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError('');
    try {
      const parts = duration.trim().split(':').map((part) => Number(part));
      if (!duration.trim() || parts.some((part) => !Number.isFinite(part) || part < 0) || parts.length > 3) throw new Error('Vul de duur in als minuten, mm:ss of uu:mm:ss.');
      const durationSec = parts.length === 1 ? parts[0]! * 60 : parts.reduce((total, part) => total * 60 + part, 0);
      const km = parseNumber(distance);
      const hr = parseNumber(avgHr);
      if (Number.isNaN(km) || Number.isNaN(hr)) throw new Error('Vul afstand en hartslag als getal in.');
      const startedAt = new Date(`${date}T${time || '00:00'}`);
      if (!Number.isFinite(startedAt.getTime())) throw new Error('Kies een geldige datum en tijd.');
      const workout: Workout = {
        id: newId(),
        title: `${sportLabels[sport]} ${new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short' }).format(startedAt)}`,
        sport,
        startedAt: startedAt.toISOString(),
        date,
        durationSec: Math.round(durationSec),
        movingSec: null,
        distanceM: km === null ? null : Math.round(km * 1000),
        ascentM: null,
        avgHr: hr === null ? null : Math.round(hr),
        maxHr: null,
        calories: null,
        source: 'handmatig',
        fileName: null,
        fingerprint: null,
        hasTrack: false,
        notes: notes.trim()
      };
      validateWorkout(workout, todayKey());
      if (await onSave(workout)) {
        concept.clear();
        navigate(`/activiteit/${encodeURIComponent(workout.id)}`);
      }
    } catch (cause) {
      setFormError(message(cause, 'De training bevat ongeldige gegevens.'));
    }
  }

  return (
    <div className="stack">
      {error && <ErrorBanner message={error} />}
      <PageHeader eyebrow="Duur" title="Training toevoegen" description="Zonder bestand, bijvoorbeeld een loopje zonder horloge." />
      <Card>
        <form onSubmit={(event) => void submit(event)} noValidate>
          <ConceptNotice concept={concept} />
          <div className="form-grid">
            <Field label="Sport">
              <select value={sport} onChange={(event) => isSport(event.target.value) && setSport(event.target.value)}>
                {SPORTS.map((item) => <option key={item} value={item}>{sportLabels[item]}</option>)}
              </select>
            </Field>
            <Field label="Datum"><input type="date" value={date} max={todayKey()} onChange={(event) => setDate(event.target.value)} /></Field>
            <Field label="Starttijd"><input type="time" value={time} onChange={(event) => setTime(event.target.value)} /></Field>
            <Field label="Duur" hint="Minuten, mm:ss of uu:mm:ss"><input type="text" inputMode="numeric" value={duration} onChange={(event) => setDuration(event.target.value)} placeholder="45:00" /></Field>
            <Field label="Afstand (km)" hint="Optioneel"><input type="text" inputMode="decimal" value={distance} onChange={(event) => setDistance(event.target.value)} /></Field>
            <Field label="Gemiddelde hartslag" hint="Optioneel"><input type="text" inputMode="numeric" value={avgHr} onChange={(event) => setAvgHr(event.target.value)} /></Field>
          </div>
          <Field label="Notities (optioneel)"><textarea rows={2} maxLength={2000} value={notes} onChange={(event) => setNotes(event.target.value)} /></Field>
          {formError && <ErrorBanner message={formError} />}
          <div className="form-actions"><Button type="submit">Opslaan</Button></div>
        </form>
      </Card>
    </div>
  );
}

/* ---------- Geschiedenis ---------- */

function HistoryPage({ workouts }: { workouts: Workout[] }) {
  const [filter, setFilter] = useState<Sport | 'alle'>('alle');
  const shown = workouts.filter((workout) => filter === 'alle' || workout.sport === filter);
  return (
    <div className="stack">
      <PageHeader eyebrow="Duur" title="Geschiedenis" description={`${workouts.length} trainingen, nieuwste eerst.`} />
      <Card>
        <div className="chip-row" role="group" aria-label="Filter op sport">
          {(['alle', ...SPORTS] as const).map((item) => (
            <button key={item} type="button" className="chip chip-toggle" aria-pressed={filter === item} onClick={() => setFilter(item)}>{item === 'alle' ? 'Alle' : sportLabels[item]}</button>
          ))}
        </div>
        <div style={{ marginTop: 12 }}>{shown.length ? <WorkoutList workouts={shown} /> : <EmptyState title="Geen trainingen">Nog niets voor deze sport.</EmptyState>}</div>
      </Card>
    </div>
  );
}

/* ---------- Detail ---------- */

function DetailPage({ workouts, settings, error, loadTrack, onUpdate, onDelete }: { workouts: Workout[]; settings: DuurSettings; error: string; loadTrack: (id: string) => Promise<Track | null>; onUpdate: (workout: Workout) => Promise<boolean>; onDelete: (id: string) => Promise<boolean> }) {
  const navigate = useNavigate();
  const { id } = useParams();
  const workout = workouts.find((item) => item.id === id) ?? null;
  const [points, setPoints] = useState<TrackPoint[] | null>(null);
  const [title, setTitle] = useState(workout?.title ?? '');
  const [notes, setNotes] = useState(workout?.notes ?? '');
  const [sport, setSport] = useState<Sport>(workout?.sport ?? 'overig');
  const [saved, setSaved] = useState(false);
  const [formError, setFormError] = useState('');
  const concept = useFormConcept(
    'duur.activiteit',
    id ?? '',
    'Training',
    { title, notes, sport },
    { title: workout?.title ?? '', notes: workout?.notes ?? '', sport: workout?.sport ?? ('overig' as Sport) },
    (value) => {
      setTitle(value.title);
      setNotes(value.notes);
      if (value.sport in sportLabels) setSport(value.sport);
    }
  );

  useEffect(() => {
    if (!workout?.hasTrack) {
      setPoints([]);
      return;
    }
    let active = true;
    void loadTrack(workout.id).then((track) => active && setPoints(track ? expandTrack(track) : []));
    return () => {
      active = false;
    };
  }, [workout?.id, workout?.hasTrack]);

  if (!workout) return <EmptyState title="Training niet gevonden">Ga terug naar de geschiedenis.</EmptyState>;
  const current = workout;

  const splits = points ? kmSplits(points) : [];
  const speeds = points ? speedSeries(points) : [];
  const hrPoints = points ? points.filter((point) => point.hr) : [];
  const zones = settings.maxHr && points && hrPoints.length ? heartRateZones(points, settings.maxHr) : null;
  const zoneTotal = zones ? zones.reduce((a, b) => a + b, 0) : 0;
  const paceBased = current.sport === 'hardlopen' || current.sport === 'wandelen';

  async function save(event: FormEvent) {
    event.preventDefault();
    setFormError('');
    setSaved(false);
    try {
      const next = { ...current, title: title.trim(), notes: notes.trim(), sport };
      validateWorkout(next);
      const ok = await onUpdate(next);
      if (ok) concept.clear();
      setSaved(ok);
    } catch (cause) {
      setFormError(message(cause, 'De wijziging is ongeldig.'));
    }
  }

  return (
    <div className="stack">
      {error && <ErrorBanner message={error} />}
      <PageHeader eyebrow={`${sportLabels[current.sport]} · ${formatDay(current.date)}`} title={current.title} description={current.source === 'handmatig' ? 'Zelf ingevoerd.' : `Geïmporteerd uit ${current.fileName ?? current.source.toUpperCase()}.`} />
      <div className="grid grid-4">
        <Metric label="Afstand" value={formatDistance(current.distanceM)} note={current.ascentM ? `${current.ascentM} hoogtemeters` : ' '} />
        <Metric label="Tijd" value={formatDuration(current.durationSec)} note={current.movingSec ? `in beweging ${formatDuration(current.movingSec)}` : 'totale tijd'} />
        <Metric label={current.sport === 'fietsen' || current.sport === 'roeien' || current.sport === 'overig' ? 'Snelheid' : 'Tempo'} value={formatPace(current.sport, current.distanceM, current.movingSec ?? current.durationSec)} note="gemiddeld" />
        <Metric label="Hartslag" value={current.avgHr ? `${current.avgHr}` : '—'} note={current.maxHr ? `max ${current.maxHr}` : 'gemiddeld'} />
      </div>
      {points === null ? (
        <LoadingState label="Route laden…" />
      ) : (
        <>
          {hasRoute(points) && (
            <Card title="Route">
              <RouteMap points={points} label={`Route van ${current.title}`} />
            </Card>
          )}
          {speeds.length > 1 && (
            <Card title={paceBased ? 'Tempo (min/km)' : 'Snelheid (km/u)'}>
              <LineChart
                title={paceBased ? 'Tempo in minuten per kilometer over de training' : 'Snelheid in kilometer per uur over de training'}
                points={speeds.map((item) => ({ label: formatDuration(item.t), value: paceBased ? (item.mps > 0.5 ? Math.round((1000 / item.mps / 60) * 100) / 100 : 0) : Math.round(item.mps * 36) / 10 }))}
                unit={paceBased ? 'min/km' : 'km/u'}
              />
            </Card>
          )}
          {hrPoints.length > 1 && (
            <Card title="Hartslag">
              <LineChart title="Hartslag over de training" points={(hrPoints.length > 120 ? hrPoints.filter((_, index) => index % Math.ceil(hrPoints.length / 120) === 0) : hrPoints).map((point) => ({ label: formatDuration(point.t), value: point.hr! }))} unit="bpm" />
              {zones ? (
                <div className="zone-bars" aria-label="Tijd per hartslagzone">
                  {zones.map((seconds, index) => (
                    <div className="zone-row" key={zoneLabels[index]}>
                      <span className="zone-label">{zoneLabels[index]}</span>
                      <span className="zone-track"><span className={`zone-fill zone-${index + 1}`} style={{ width: `${zoneTotal ? (seconds / zoneTotal) * 100 : 0}%` }} /></span>
                      <span className="zone-value">{formatDuration(seconds)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="item-subtitle">Stel je maximale hartslag in bij Instellingen om de tijd per hartslagzone te zien.</p>
              )}
            </Card>
          )}
          {splits.length > 0 && (
            <Card title="Tussentijden per kilometer">
              <table className="split-table">
                <thead>
                  <tr><th scope="col">Km</th><th scope="col">Tijd</th><th scope="col">{current.sport === 'fietsen' ? 'Snelheid' : 'Tempo'}</th><th scope="col">♥</th></tr>
                </thead>
                <tbody>
                  {splits.map((split) => (
                    <tr key={split.km}>
                      <td>{split.meters === 1000 ? split.km : `${split.km} (${split.meters} m)`}</td>
                      <td>{formatDuration(split.seconds)}</td>
                      <td>{formatPace(current.sport === 'zwemmen' ? 'hardlopen' : current.sport, split.meters, split.seconds)}</td>
                      <td>{split.avgHr ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </>
      )}
      <Card title="Gegevens">
        <form onSubmit={(event) => void save(event)} noValidate>
          <ConceptNotice concept={concept} />
          <div className="form-grid">
            <Field label="Naam"><input type="text" maxLength={100} value={title} onChange={(event) => setTitle(event.target.value)} /></Field>
            <Field label="Sport">
              <select value={sport} onChange={(event) => isSport(event.target.value) && setSport(event.target.value)}>
                {SPORTS.map((item) => <option key={item} value={item}>{sportLabels[item]}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Notities"><textarea rows={3} maxLength={2000} value={notes} onChange={(event) => setNotes(event.target.value)} /></Field>
          {formError && <ErrorBanner message={formError} />}
          {saved && <p role="status"><StatusPill tone="good">Opgeslagen</StatusPill></p>}
          <div className="form-actions">
            <ConfirmAction label={`${current.title} verwijderen`} confirmMessage="Deze training en de route verwijderen?" onConfirm={() => void onDelete(current.id).then((ok) => ok && navigate('/geschiedenis'))}>Verwijderen</ConfirmAction>
            <Button type="submit">Wijzigingen opslaan</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

/* ---------- Instellingen ---------- */

function SettingsPage({ settings, error, onSave }: { settings: DuurSettings; error: string; onSave: (settings: DuurSettings) => Promise<boolean> }) {
  const [maxHr, setMaxHr] = useState(settings.maxHr ? String(settings.maxHr) : '');
  const [formError, setFormError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => setMaxHr(settings.maxHr ? String(settings.maxHr) : ''), [settings]);
  const concept = useFormConcept('duur.instellingen', 'instellingen', 'Duurinstellingen', { maxHr }, { maxHr: settings.maxHr ? String(settings.maxHr) : '' }, (value) => setMaxHr(value.maxHr));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError('');
    setSaved(false);
    try {
      const value = parseNumber(maxHr);
      if (Number.isNaN(value)) throw new Error('Vul een getal in.');
      const next: DuurSettings = { id: 'settings', maxHr: value === null ? null : Math.round(value) };
      validateSettings(next);
      const ok = await onSave(next);
      if (ok) concept.clear();
      setSaved(ok);
    } catch (cause) {
      setFormError(message(cause, 'De instelling is ongeldig.'));
    }
  }

  return (
    <div className="stack">
      {error && <ErrorBanner message={error} />}
      <PageHeader eyebrow="Duur" title="Instellingen" />
      <Card title="Hartslagzones">
        <form onSubmit={(event) => void submit(event)} noValidate>
          <ConceptNotice concept={concept} />
          <Field label="Maximale hartslag (bpm)" hint="Optioneel, 120–230. Gebruik bij voorkeur een gemeten waarde; formules zoals 220 min leeftijd zijn grof.">
            <input type="text" inputMode="numeric" value={maxHr} onChange={(event) => setMaxHr(event.target.value)} />
          </Field>
          <p className="item-subtitle">Zones: 1 = 50–60%, 2 = 60–70%, 3 = 70–80%, 4 = 80–90%, 5 = 90–100% van je maximale hartslag.</p>
          {formError && <ErrorBanner message={formError} />}
          {saved && <p role="status"><StatusPill tone="good">Opgeslagen</StatusPill></p>}
          <div className="form-actions"><Button type="submit">Opslaan</Button></div>
        </form>
      </Card>
      <Card title="Privacy en bronnen">
        <p className="item-subtitle">
          Geïmporteerde bestanden worden in je browser gelezen en niet geüpload. Routes, hartslag en tijden blijven op dit apparaat (en in je eigen back-up). Het dashboard ziet alleen het aantal trainingen, kilometers en minuten van deze week.
        </p>
        <p className="item-subtitle">
          Bij een route laadt je browser kaarttegels van <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> (© OpenStreetMap-bijdragers, ODbL). OpenStreetMap ziet daarbij je IP-adres en het kaartgebied. Tegels worden niet vooraf of offline opgeslagen. FIT-bestanden worden gelezen met fit-file-parser (MIT), kaarten getekend met Leaflet (BSD-2).
        </p>
        <p className="item-subtitle">Schattingen, geen medisch of trainingsadvies.</p>
      </Card>
    </div>
  );
}
