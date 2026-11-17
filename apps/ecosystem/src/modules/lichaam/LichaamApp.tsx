import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { BrowserRouter, Link, Route, Routes, useNavigate, useSearchParams } from 'react-router-dom';
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
  MEASURE_FIELDS,
  NOTE_MAX,
  average,
  bmi,
  bmiCategory,
  change,
  emptyDay,
  fieldRules,
  formatMeasure,
  formatSigned,
  isDateKey,
  latest,
  measuredSeries,
  parseMeasure,
  scaleLabels,
  sleepSeries,
  validateBodyDay,
  validateBodyProfile,
  type BodyDay,
  type BodyProfile,
  type MeasureField
} from './domain';
import { databaseConfig } from './storage';

const navigation = [
  { to: '/', label: 'Overzicht', icon: '⌂' },
  { to: '/invoeren', label: 'Invoeren', icon: '＋' },
  { to: '/geschiedenis', label: 'Geschiedenis', icon: '☰' },
  { to: '/instellingen', label: 'Instellingen', icon: '⚙' }
];

const emptyProfile: BodyProfile = { id: 'profile', heightCm: null, goalWeightKg: null };

function todayKey(): string {
  const date = new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function formatDay(date: string): string {
  return new Intl.DateTimeFormat('nl-NL', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${date}T12:00:00`));
}

export default function LichaamApp({ links }: { links: ModuleLink[] }) {
  return (
    <BrowserRouter basename="/lichaam">
      <LichaamRoutes links={links} />
    </BrowserRouter>
  );
}

function LichaamRoutes({ links }: { links: ModuleLink[] }) {
  const [database, setDatabase] = useState<LocalDatabase | null>(null);
  const [days, setDays] = useState<BodyDay[]>([]);
  const [profile, setProfile] = useState<BodyProfile>(emptyProfile);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function refresh(db: LocalDatabase) {
    const [nextDays, profiles] = await Promise.all([db.list<BodyDay>('days'), db.list<BodyProfile>('profile')]);
    setDays(nextDays.sort((a, b) => b.date.localeCompare(a.date)));
    setProfile(profiles[0] ?? emptyProfile);
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
      .catch((cause: unknown) => active && setError(cause instanceof Error ? cause.message : 'Lokale gegevens konden niet worden geopend.'))
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

  return (
    <AppFrame appName="Lichaam" appMark="♥" navigation={navigation} moduleLinks={links}>
      {loading ? (
        <LoadingState />
      ) : (
        <Routes>
          <Route path="/" element={<OverviewPage days={days} profile={profile} error={error} />} />
          <Route path="/invoeren" element={<EntryPage days={days} error={error} onSave={(day) => run((db) => db.put('days', day))} />} />
          <Route path="/geschiedenis" element={<HistoryPage days={days} error={error} onDelete={(id) => void run((db) => db.remove('days', id))} />} />
          <Route path="/instellingen" element={<SettingsPage profile={profile} error={error} onSave={(next) => run((db) => db.put('profile', next))} />} />
          <Route path="*" element={<OverviewPage days={days} profile={profile} error={error} />} />
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

function OverviewPage({ days, profile, error }: { days: BodyDay[]; profile: BodyProfile; error: string }) {
  const navigate = useNavigate();
  const today = todayKey();
  const weight = latest(days, 'weightKg');
  const weightChange = change(days, 'weightKg', today, 30);
  const sleep = average(days, 'sleepHours', today, 7);
  const heartRate = latest(days, 'restingHr');
  const pressure = days.find((day) => day.systolic !== null && day.diastolic !== null);
  const recovery = average(days, 'recovery', today, 7);
  const weightPoints = measuredSeries(days, 'weightKg', today, 90);
  const sleepPoints = sleepSeries(days, today, 14);
  const bmiValue = weight && profile.heightCm ? bmi(weight.value, profile.heightCm) : null;
  const toGoal = weight && profile.goalWeightKg ? Math.round((weight.value - profile.goalWeightKg) * 10) / 10 : null;
  const filledToday = days.some((day) => day.date === today);

  return (
    <div className="stack">
      {error && <ErrorBanner message={error} />}
      <PageHeader
        eyebrow="Lichaam & gezondheid"
        title="Hoe gaat het met je lijf?"
        description="Gewicht, slaap, hartslag en herstel. Alles blijft op dit apparaat."
        action={<Button onClick={() => navigate('/invoeren')}>{filledToday ? 'Vandaag aanvullen' : '＋ Meting van vandaag'}</Button>}
      />
      {days.length === 0 ? (
        <Card>
          <EmptyState title="Nog niets ingevuld">Begin met je gewicht of hoe je hebt geslapen. Er worden geen voorbeeldgegevens getoond.</EmptyState>
        </Card>
      ) : (
        <>
          <div className="grid grid-4">
            <Metric
              label="Gewicht"
              value={weight ? formatMeasure('weightKg', weight.value) : '—'}
              note={weightChange !== null ? `${formatSigned(weightChange, 'kg')} in 30 dagen` : weight ? `Gemeten ${formatDay(weight.date)}` : 'Nog niet gemeten'}
            />
            <Metric label="Slaap (7 dagen)" value={sleep ? formatMeasure('sleepHours', sleep.value) : '—'} note={sleep ? `Gemiddeld over ${sleep.count} ${sleep.count === 1 ? 'nacht' : 'nachten'}` : 'Nog niet ingevuld'} />
            <Metric label="Rusthartslag" value={heartRate ? formatMeasure('restingHr', heartRate.value) : '—'} note={heartRate ? `Gemeten ${formatDay(heartRate.date)}` : 'Nog niet gemeten'} />
            <Metric
              label="Bloeddruk"
              value={pressure ? `${pressure.systolic}/${pressure.diastolic}` : '—'}
              note={pressure ? `mmHg · ${formatDay(pressure.date)}` : 'Nog niet gemeten'}
            />
          </div>
          <div className="grid grid-2">
            <Card title="Gewicht (90 dagen)">
              {weightPoints.length ? (
                <LineChart title="Gewicht per meting, laatste 90 dagen" points={weightPoints} unit="kg" zeroBased={false} />
              ) : (
                <EmptyState title="Nog geen gewicht">Vul je gewicht in om een trend te zien.</EmptyState>
              )}
              {(bmiValue !== null || toGoal !== null) && (
                <p className="widget-foot">
                  {bmiValue !== null && <>BMI {bmiValue.toLocaleString('nl-NL')} ({bmiCategory(bmiValue)}) · </>}
                  {toGoal !== null && (toGoal === 0 ? 'Streefgewicht bereikt' : `${formatSigned(toGoal, 'kg')} t.o.v. streefgewicht`)}
                </p>
              )}
            </Card>
            <Card title="Slaap (14 dagen)">
              <BarChart title="Uren slaap per nacht, laatste 14 dagen" points={sleepPoints} unit="uur" />
              <p className="widget-foot">{recovery ? `Herstel gemiddeld ${recovery.value.toLocaleString('nl-NL')} van 5 (7 dagen)` : 'Vul ook je herstel in voor een volledig beeld.'}</p>
            </Card>
          </div>
          <p className="item-subtitle">BMI en trends zijn een grove indicatie, geen medisch advies. Twijfel je over je gezondheid, neem contact op met je huisarts.</p>
        </>
      )}
    </div>
  );
}

// Tekstvelden in plaats van type=number: een komma (81,5) gaat anders in sommige browsers stil verloren.
const inputFields: { field: MeasureField; inputMode: 'decimal' | 'numeric' }[] = [
  { field: 'weightKg', inputMode: 'decimal' },
  { field: 'waistCm', inputMode: 'decimal' },
  { field: 'restingHr', inputMode: 'numeric' },
  { field: 'sleepHours', inputMode: 'decimal' },
  { field: 'systolic', inputMode: 'numeric' },
  { field: 'diastolic', inputMode: 'numeric' }
];

/** Toont een opgeslagen getal met Nederlandse komma in een invoerveld. */
function toText(value: number | null): string {
  return value === null ? '' : String(value).replace('.', ',');
}

function EntryPage({ days, error, onSave }: { days: BodyDay[]; error: string; onSave: (day: BodyDay) => Promise<boolean> }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const today = todayKey();
  const requested = params.get('datum');
  const [date, setDate] = useState(isDateKey(requested) && requested <= today ? requested : today);
  const existing = useMemo(() => days.find((day) => day.date === date) ?? null, [days, date]);
  const [values, setValues] = useState<Record<MeasureField, string>>(() => blankValues());
  const [note, setNote] = useState('');
  const [formError, setFormError] = useState('');

  useEffect(() => {
    const source = existing ?? emptyDay(date);
    setValues(Object.fromEntries(MEASURE_FIELDS.map((field) => [field, toText(source[field])])) as Record<MeasureField, string>);
    setNote(source.note);
    setFormError('');
  }, [existing, date]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError('');
    try {
      if (!isDateKey(date)) throw new Error('Kies een geldige datum.');
      const parsed = Object.fromEntries(MEASURE_FIELDS.map((field) => [field, parseMeasure(field, values[field])])) as Record<MeasureField, number | null>;
      const day: BodyDay = { ...emptyDay(date), ...parsed, note: note.trim(), updatedAt: new Date().toISOString() };
      validateBodyDay(day, today);
      if (await onSave(day)) navigate('/');
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'De meting bevat ongeldige gegevens.');
    }
  }

  const set = (field: MeasureField, value: string) => setValues((current) => ({ ...current, [field]: value }));

  return (
    <div className="stack">
      {error && <ErrorBanner message={error} />}
      <PageHeader eyebrow="Lichaam" title={existing ? 'Meting aanpassen' : 'Meting invoeren'} description="Vul alleen in wat je weet. Lege velden worden niet opgeslagen." />
      <Card>
        <form onSubmit={(event) => void submit(event)} noValidate>
          <div className="form-grid">
            <div style={{ gridColumn: '1 / -1' }}>
              <Field label="Datum" {...(existing ? { hint: 'Er is al een registratie voor deze dag; je past die aan.' } : {})}>
                <input type="date" value={date} max={today} onChange={(event) => setDate(event.target.value)} required />
              </Field>
            </div>
            {inputFields.map(({ field, inputMode }) => {
              const rule = fieldRules[field];
              return (
                <Field key={field} label={`${rule.label} (${rule.unit})`}>
                  <input type="text" inputMode={inputMode} autoComplete="off" value={values[field]} onChange={(event) => set(field, event.target.value)} />
                </Field>
              );
            })}
            {(['sleepQuality', 'recovery'] as const).map((field) => (
              <Field key={field} label={fieldRules[field].label}>
                <select value={values[field]} onChange={(event) => set(field, event.target.value)}>
                  <option value="">Niet ingevuld</option>
                  {[1, 2, 3, 4, 5].map((score) => <option key={score} value={score}>{score} · {scaleLabels[field][score]}</option>)}
                </select>
              </Field>
            ))}
            <div style={{ gridColumn: '1 / -1' }}>
              <Field label="Notitie" hint={`Optioneel, maximaal ${NOTE_MAX} tekens. Bijvoorbeeld een blessure of hoe je je voelt.`}>
                <textarea maxLength={NOTE_MAX} value={note} onChange={(event) => setNote(event.target.value)} />
              </Field>
            </div>
          </div>
          {formError && <ErrorBanner message={formError} />}
          <div className="form-actions">
            <Button type="button" variant="secondary" onClick={() => navigate(-1)}>Annuleren</Button>
            <Button type="submit">Meting opslaan</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

function blankValues(): Record<MeasureField, string> {
  return Object.fromEntries(MEASURE_FIELDS.map((field) => [field, ''])) as Record<MeasureField, string>;
}

function summarize(day: BodyDay): string {
  const parts: string[] = [];
  if (day.weightKg !== null) parts.push(formatMeasure('weightKg', day.weightKg));
  if (day.waistCm !== null) parts.push(`buik ${formatMeasure('waistCm', day.waistCm)}`);
  if (day.sleepHours !== null) parts.push(`${formatMeasure('sleepHours', day.sleepHours)} slaap`);
  if (day.restingHr !== null) parts.push(formatMeasure('restingHr', day.restingHr));
  if (day.systolic !== null && day.diastolic !== null) parts.push(`${day.systolic}/${day.diastolic} mmHg`);
  if (day.recovery !== null) parts.push(`herstel ${day.recovery}/5`);
  return parts.join(' · ') || 'Alleen een notitie';
}

function HistoryPage({ days, error, onDelete }: { days: BodyDay[]; error: string; onDelete: (id: string) => void }) {
  return (
    <div className="stack">
      {error && <ErrorBanner message={error} />}
      <PageHeader eyebrow="Lichaam" title="Geschiedenis" description="Al je registraties, nieuwste eerst." />
      <Card>
        {days.length ? (
          <div className="list">
            {days.map((day) => (
              <div className="list-item" key={day.id}>
                <div>
                  <p className="item-title">{formatDay(day.date)}</p>
                  <p className="item-subtitle">{summarize(day)}</p>
                  {day.note && <p className="item-subtitle">“{day.note}”</p>}
                </div>
                <div className="row">
                  <Link className="text-button" to={`/invoeren?datum=${day.date}`}>Aanpassen</Link>
                  <ConfirmAction label={`Registratie van ${formatDay(day.date)} verwijderen`} confirmMessage="Deze registratie verwijderen? Dit kan niet ongedaan worden gemaakt." onConfirm={() => onDelete(day.id)}>
                    Verwijderen
                  </ConfirmAction>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="Nog geen registraties">Je eerste meting verschijnt hier.</EmptyState>
        )}
      </Card>
    </div>
  );
}

function SettingsPage({ profile, error, onSave }: { profile: BodyProfile; error: string; onSave: (profile: BodyProfile) => Promise<boolean> }) {
  const [height, setHeight] = useState(toText(profile.heightCm));
  const [goal, setGoal] = useState(toText(profile.goalWeightKg));
  const [formError, setFormError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setHeight(toText(profile.heightCm));
    setGoal(toText(profile.goalWeightKg));
  }, [profile]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError('');
    setSaved(false);
    try {
      const parse = (text: string) => {
        const clean = text.trim().replace(',', '.');
        if (!clean) return null;
        const value = Number(clean);
        if (!Number.isFinite(value)) throw new Error('Vul een getal in.');
        return Math.round(value * 10) / 10;
      };
      const next: BodyProfile = { id: 'profile', heightCm: parse(height), goalWeightKg: parse(goal) };
      validateBodyProfile(next);
      setSaved(await onSave(next));
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Het profiel bevat ongeldige gegevens.');
    }
  }

  return (
    <div className="stack">
      {error && <ErrorBanner message={error} />}
      <PageHeader eyebrow="Lichaam" title="Instellingen" description="Gebruikt voor BMI en je voortgang naar een streefgewicht." />
      <Card title="Profiel">
        <form onSubmit={(event) => void submit(event)} noValidate>
          <div className="form-grid">
            <Field label="Lengte (cm)" hint="Optioneel">
              <input type="text" inputMode="decimal" autoComplete="off" value={height} onChange={(event) => setHeight(event.target.value)} />
            </Field>
            <Field label="Streefgewicht (kg)" hint="Optioneel">
              <input type="text" inputMode="decimal" autoComplete="off" value={goal} onChange={(event) => setGoal(event.target.value)} />
            </Field>
          </div>
          {formError && <ErrorBanner message={formError} />}
          {saved && <p role="status"><StatusPill tone="good">Opgeslagen</StatusPill></p>}
          <div className="form-actions">
            <Button type="submit">Profiel opslaan</Button>
          </div>
        </form>
      </Card>
      <Card title="Privacy">
        <p className="item-subtitle">
          Gezondheidsgegevens zijn bijzondere persoonsgegevens. Ze staan alleen in deze browser op dit apparaat en gaan nooit naar een externe dienst. Het dashboard ziet alleen óf je vandaag iets hebt ingevuld, niet wat.
          Een back-up via <a href="/back-up">Back-up</a> bevat deze gegevens wel; bewaar dat bestand veilig.
        </p>
      </Card>
    </div>
  );
}
