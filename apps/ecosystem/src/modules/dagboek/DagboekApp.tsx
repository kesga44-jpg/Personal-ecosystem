import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { BrowserRouter, Link, Route, Routes, useNavigate, useSearchParams } from 'react-router-dom';
import { openLocalDatabase, runStorageAction as performStorageAction, type LocalDatabase } from '@ecosystem/storage';
import {
  AppFrame,
  Button,
  Card,
  ConfirmAction,
  EmptyState,
  ErrorBanner,
  Field,
  Heatmap,
  LineChart,
  LoadingState,
  PageHeader,
  StatusPill,
  type ModuleLink
} from '@ecosystem/ui';
import {
  GRATITUDE_LENGTH,
  GRATITUDE_MAX,
  TAGS,
  TEXT_MAX,
  averageMood,
  buildEntry,
  energyLabels,
  isDateKey,
  isTag,
  moodByTag,
  moodInfo,
  moodScale,
  moodSeries,
  searchEntries,
  validateEntry,
  writingStreak,
  type JournalEntry,
  type Tag
} from './domain';
import { databaseConfig } from './storage';
import { readLocalValue, writeLocalValue } from '../../localValues';
import { usePendingInput } from '../../pendingInput';

/** Niet-opgeslagen invoer bij vergrendelen (ADR 0031 § 3); in de kluisbuild versleuteld bewaard. */
const CONCEPT_KEY = 'personal-ecosystem.dagboek.concept';
interface Concept { date: string; mood: number; energy: string; tags: Tag[]; gratitude: string[]; text: string }

function readConcept(): Concept | null {
  try {
    const value = JSON.parse(readLocalValue(CONCEPT_KEY) ?? 'null') as Concept | null;
    return value && typeof value.date === 'string' && typeof value.text === 'string' && Array.isArray(value.gratitude) && Array.isArray(value.tags) ? value : null;
  } catch {
    return null;
  }
}

const navigation = [
  { to: '/', label: 'Overzicht', icon: '⌂' },
  { to: '/schrijven', label: 'Schrijven', icon: '✎' },
  { to: '/archief', label: 'Archief', icon: '☰' }
];

function todayKey(): string {
  const date = new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function formatDay(date: string): string {
  return new Intl.DateTimeFormat('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${date}T12:00:00`));
}

export default function DagboekApp({ links }: { links: ModuleLink[] }) {
  return (
    <BrowserRouter basename="/dagboek">
      <DagboekRoutes links={links} />
    </BrowserRouter>
  );
}

function DagboekRoutes({ links }: { links: ModuleLink[] }) {
  const [database, setDatabase] = useState<LocalDatabase | null>(null);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function refresh(db: LocalDatabase) {
    const next = await db.list<JournalEntry>('entries');
    setEntries(next.sort((a, b) => b.date.localeCompare(a.date)));
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
    <AppFrame appName="Dagboek" appMark="✎" navigation={navigation} moduleLinks={links}>
      {loading ? (
        <LoadingState />
      ) : (
        <Routes>
          <Route path="/" element={<OverviewPage entries={entries} error={error} />} />
          <Route path="/schrijven" element={<WritePage entries={entries} error={error} onSave={(entry) => run((db) => db.put('entries', entry))} />} />
          <Route path="/archief" element={<ArchivePage entries={entries} error={error} onDelete={(id) => void run((db) => db.remove('entries', id))} />} />
          <Route path="*" element={<OverviewPage entries={entries} error={error} />} />
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

function OverviewPage({ entries, error }: { entries: JournalEntry[]; error: string }) {
  const navigate = useNavigate();
  const today = todayKey();
  const todays = entries.find((entry) => entry.date === today);
  const week = averageMood(entries, today, 7);
  const month = averageMood(entries, today, 30);
  const streak = writingStreak(entries, today);
  const series = moodSeries(entries, today, 28);
  const written = entries.filter((entry) => entry.date >= series[0]!.date && entry.date <= today).sort((a, b) => a.date.localeCompare(b.date));
  const byTag = moodByTag(entries.filter((entry) => entry.date >= moodSeries(entries, today, 90)[0]!.date));

  return (
    <div className="stack">
      {error && <ErrorBanner message={error} />}
      <PageHeader
        eyebrow="Dagboek & stemming"
        title={todays ? `Vandaag: ${moodInfo(todays.mood).icon} ${moodInfo(todays.mood).label}` : 'Hoe was je dag?'}
        description="Privé. Je notities staan alleen op dit apparaat."
        action={<Button onClick={() => navigate('/schrijven')}>{todays ? 'Vandaag aanpassen' : '✎ Schrijf over vandaag'}</Button>}
      />
      {entries.length === 0 ? (
        <Card>
          <EmptyState title="Nog niets geschreven">Kies hoe je je voelt en schrijf een paar zinnen. Er worden geen voorbeeldgegevens getoond.</EmptyState>
        </Card>
      ) : (
        <>
          <div className="grid grid-4">
            <Metric label="Stemming (7 dagen)" value={week ? `${moodInfo(Math.round(week.value)).icon} ${week.value.toLocaleString('nl-NL')}` : '—'} note={week ? `Gemiddeld over ${week.count} ${week.count === 1 ? 'dag' : 'dagen'}` : 'Geen notities deze week'} />
            <Metric label="Stemming (30 dagen)" value={month ? month.value.toLocaleString('nl-NL') : '—'} note="Op een schaal van 1 tot 5" />
            <Metric label="Schrijfreeks" value={`${streak} ${streak === 1 ? 'dag' : 'dagen'}`} note={streak ? 'Achter elkaar geschreven' : 'Schrijf vandaag om te beginnen'} />
            <Metric label="Notities" value={entries.length.toString()} note="In totaal" />
          </div>
          <div className="grid grid-2">
            <Card title="Stemming (4 weken)">
              {written.length > 1 ? (
                <LineChart title="Stemming per geschreven dag, laatste 4 weken (1 tot 5)" points={written.map((entry) => ({ label: `${entry.date.slice(8, 10)}-${entry.date.slice(5, 7)}`, value: entry.mood }))} />
              ) : (
                <p className="item-subtitle">Na twee notities zie je hier je stemming door de tijd.</p>
              )}
              <Heatmap title="Stemmingskalender, laatste 4 weken" days={series.map((point) => ({ date: point.date, value: point.value }))} />
            </Card>
            <Card title="Wat helpt?">
              {byTag.length ? (
                <div className="list">
                  {byTag.map((item) => (
                    <div className="list-item" key={item.tag}>
                      <div>
                        <p className="item-title">{item.tag}</p>
                        <p className="item-subtitle">{item.count} notities · gemiddeld {item.average.toLocaleString('nl-NL')}</p>
                      </div>
                      <StatusPill tone={item.difference > 0 ? 'good' : item.difference < 0 ? 'warning' : 'neutral'}>
                        {item.difference > 0 ? '+' : ''}{item.difference.toLocaleString('nl-NL')}
                      </StatusPill>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="Nog te weinig gegevens">Gebruik labels bij je notities. Vanaf drie notities per label zie je hier of je stemming dan hoger of lager is dan gemiddeld.</EmptyState>
              )}
              <p className="widget-foot">Verschil met je gemiddelde stemming (90 dagen). Een samenhang, geen oorzaak.</p>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function WritePage({ entries, error, onSave }: { entries: JournalEntry[]; error: string; onSave: (entry: JournalEntry) => Promise<boolean> }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const today = todayKey();
  const requested = params.get('datum');
  const [date, setDate] = useState(isDateKey(requested) && requested <= today ? requested : today);
  const existing = useMemo(() => entries.find((entry) => entry.date === date) ?? null, [entries, date]);
  const [mood, setMood] = useState(0);
  const [energy, setEnergy] = useState('');
  const [tags, setTags] = useState<Tag[]>([]);
  const [gratitude, setGratitude] = useState<string[]>(['', '', '']);
  const [text, setText] = useState('');
  const [formError, setFormError] = useState('');
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    const concept = readConcept();
    const source = concept && concept.date === date ? concept : null;
    setMood(source?.mood ?? existing?.mood ?? 0);
    setEnergy(source ? source.energy : existing?.energy ? String(existing.energy) : '');
    setTags(source?.tags.filter(isTag) ?? existing?.tags ?? []);
    setGratitude([0, 1, 2].map((index) => (source ? source.gratitude[index] : existing?.gratitude[index]) ?? ''));
    setText(source?.text ?? existing?.text ?? '');
    setRestored(source !== null);
    setFormError('');
  }, [existing, date]);

  const baseline = JSON.stringify([existing?.mood ?? 0, existing?.energy ? String(existing.energy) : '', existing?.tags ?? [], [0, 1, 2].map((index) => existing?.gratitude[index] ?? ''), existing?.text ?? '']);
  const dirty = JSON.stringify([mood, energy, tags, gratitude, text]) !== baseline;
  usePendingInput(
    'Dagboeknotitie',
    dirty,
    async () => writeLocalValue(CONCEPT_KEY, JSON.stringify({ date, mood, energy, tags, gratitude, text } satisfies Concept)),
    () => writeLocalValue(CONCEPT_KEY, null)
  );

  function toggle(tag: Tag) {
    setTags((current) => (current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError('');
    try {
      if (!isDateKey(date)) throw new Error('Kies een geldige datum.');
      const entry = buildEntry({ date, mood, energy: energy ? Number(energy) : null, tags: tags.filter(isTag), gratitude, text });
      validateEntry(entry, today);
      if (await onSave(entry)) {
        writeLocalValue(CONCEPT_KEY, null);
        navigate('/');
      }
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'De notitie bevat ongeldige gegevens.');
    }
  }

  return (
    <div className="stack">
      {error && <ErrorBanner message={error} />}
      <PageHeader eyebrow="Dagboek" title={existing ? 'Notitie aanpassen' : 'Schrijven'} description="Alleen je stemming is verplicht. De rest is voor jezelf." />
      {restored && <p role="status">Niet-opgeslagen invoer van de vorige keer is teruggezet. Sla op om hem te bewaren.</p>}
      <Card>
        <form onSubmit={(event) => void submit(event)} noValidate className="stack">
          <Field label="Datum" {...(existing ? { hint: 'Er is al een notitie voor deze dag; je past die aan.' } : {})}>
            <input type="date" value={date} max={today} onChange={(event) => setDate(event.target.value)} required />
          </Field>
          <fieldset className="plain-fieldset">
            <legend>Hoe voel je je?</legend>
            <div className="mood-picker">
              {moodScale.map((option) => (
                <button key={option.value} type="button" className="mood-option" aria-pressed={mood === option.value} onClick={() => setMood(option.value)}>
                  <span aria-hidden="true">{option.icon}</span>
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>
          <Field label="Energie">
            <select value={energy} onChange={(event) => setEnergy(event.target.value)}>
              <option value="">Niet ingevuld</option>
              {[1, 2, 3, 4, 5].map((score) => <option key={score} value={score}>{score} · {energyLabels[score]}</option>)}
            </select>
          </Field>
          <fieldset className="plain-fieldset">
            <legend>Labels</legend>
            <div className="chip-row">
              {TAGS.map((tag) => (
                <button key={tag} type="button" className="chip chip-toggle" aria-pressed={tags.includes(tag)} onClick={() => toggle(tag)}>{tag}</button>
              ))}
            </div>
          </fieldset>
          <fieldset className="plain-fieldset">
            <legend>Waar ben je dankbaar voor?</legend>
            <div className="field gratitude-fields">
              {gratitude.map((line, index) => (
                <input
                  key={index}
                  type="text"
                  maxLength={GRATITUDE_LENGTH}
                  value={line}
                  aria-label={`Dankbaar ${index + 1} van ${GRATITUDE_MAX}`}
                  placeholder={index === 0 ? 'Bijvoorbeeld: een goed gesprek' : 'Optioneel'}
                  onChange={(event) => setGratitude((current) => current.map((item, position) => (position === index ? event.target.value : item)))}
                />
              ))}
            </div>
          </fieldset>
          <Field label="Notitie" hint={`${text.length} / ${TEXT_MAX} tekens`}>
            <textarea className="journal-input" maxLength={TEXT_MAX} value={text} onChange={(event) => setText(event.target.value)} />
          </Field>
          {formError && <ErrorBanner message={formError} />}
          <div className="form-actions">
            <Button type="button" variant="secondary" onClick={() => navigate(-1)}>Annuleren</Button>
            <Button type="submit">Notitie opslaan</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

function ArchivePage({ entries, error, onDelete }: { entries: JournalEntry[]; error: string; onDelete: (id: string) => void }) {
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState<Tag | ''>('');
  const results = searchEntries(entries, query, tag);

  return (
    <div className="stack">
      {error && <ErrorBanner message={error} />}
      <PageHeader eyebrow="Dagboek" title="Archief" description="Zoek in je eigen notities. Zoeken gebeurt alleen op dit apparaat." />
      <Card>
        <div className="form-grid">
          <Field label="Zoeken">
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Woord in je notities" />
          </Field>
          <Field label="Label">
            <select value={tag} onChange={(event) => setTag(isTag(event.target.value) ? event.target.value : '')}>
              <option value="">Alle labels</option>
              {TAGS.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </Field>
        </div>
      </Card>
      {results.length ? (
        results.map((entry) => {
          const info = moodInfo(entry.mood);
          return (
            <Card key={entry.id} title={formatDay(entry.date)} action={<StatusPill>{info.icon} {info.label}</StatusPill>}>
              {entry.energy !== null && <p className="item-subtitle">Energie: {energyLabels[entry.energy]}</p>}
              {entry.tags.length > 0 && <div className="chip-row">{entry.tags.map((item) => <span key={item} className="chip">{item}</span>)}</div>}
              {entry.gratitude.length > 0 && (
                <ul className="gratitude-list">
                  {entry.gratitude.map((line) => <li key={line}>{line}</li>)}
                </ul>
              )}
              {entry.text && <p className="journal-text">{entry.text}</p>}
              <div className="row" style={{ justifyContent: 'flex-start' }}>
                <Link className="text-button" to={`/schrijven?datum=${entry.date}`}>Aanpassen</Link>
                <ConfirmAction label={`Notitie van ${formatDay(entry.date)} verwijderen`} confirmMessage="Deze notitie verwijderen? Dit kan niet ongedaan worden gemaakt." onConfirm={() => onDelete(entry.id)}>
                  Verwijderen
                </ConfirmAction>
              </div>
            </Card>
          );
        })
      ) : (
        <Card>
          <EmptyState title={entries.length ? 'Niets gevonden' : 'Nog geen notities'}>{entries.length ? 'Probeer een ander woord of label.' : 'Je eerste notitie verschijnt hier.'}</EmptyState>
        </Card>
      )}
    </div>
  );
}
