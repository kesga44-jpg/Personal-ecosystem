import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { BrowserRouter, Link, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { newId } from '@ecosystem/core';
import { openLocalDatabase, runStorageAction as performStorageAction, type LocalDatabase } from '@ecosystem/storage';
import { AppFrame, BarChart, Button, Card, ConfirmAction, EmptyState, ErrorBanner, Field, LoadingState, PageHeader, StatusPill, type ModuleLink } from '@ecosystem/ui';
import { databaseConfig } from '../groei/storage';
import {
  CATEGORIES,
  CREATOR_ROLES,
  LOG_KINDS,
  SOURCE_STATUSES,
  SOURCE_TYPES,
  STUDY_STEPS,
  allLabels,
  filterSources,
  finishedInYear,
  kennisAnalysis,
  learningStreak,
  measureState,
  minutesPerWeek,
  newStudyProgram,
  parseLabels,
  programProgress,
  searchText,
  toggleStudyStep,
  validateCreator,
  validateHighlight,
  validateInsight,
  validateLearningLog,
  validateSource,
  validateStudyProgram,
  withSourceStatus,
  type Category,
  type Creator,
  type CreatorRole,
  type Highlight,
  type Insight,
  type LearningLog,
  type LogKind,
  type Source,
  type SourceSort,
  type SourceStatus,
  type SourceType,
  type StudyProgram
} from './domain';
import { ConceptNotice, useFormConcept } from '../../formConcept';

const navigation = [
  { to: '/', label: 'Overzicht', icon: '⌂' },
  { to: '/bibliotheek', label: 'Bibliotheek', icon: '❒' },
  { to: '/highlights', label: 'Highlights', icon: '❝' },
  { to: '/inzichten', label: 'Inzichten', icon: '✶' },
  { to: '/studie', label: 'Studieprogramma', icon: '⑤' },
  { to: '/logboek', label: 'Logboek', icon: '⏱' },
  { to: '/analyse', label: 'Analyse', icon: '▦' },
  { to: '/makers', label: 'Makers', icon: '☺' }
];

const UNAVAILABLE = 'Niet meer beschikbaar';
const categoryLabel: Record<Category, string> = { algemeen: 'Algemeen', voetbal: 'Voetbal' };

interface Ref {
  id: string;
  title: string;
}
interface Data {
  sources: Source[];
  creators: Creator[];
  highlights: Highlight[];
  insights: Insight[];
  programs: StudyProgram[];
  log: LearningLog[];
  /** Uit Groei (zelfde database): alleen ID en titel. */
  goals: Ref[];
  skills: Ref[];
  actions: (Ref & { insightId: string | null; status: string })[];
}

const empty: Data = { sources: [], creators: [], highlights: [], insights: [], programs: [], log: [], goals: [], skills: [], actions: [] };
type Run = (action: (db: LocalDatabase) => Promise<void>) => Promise<boolean>;

function todayKey(): string {
  const date = new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function formatDate(date: string | null): string {
  if (!date) return '—';
  return new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${date}T12:00:00`));
}

const nowIso = () => new Date().toISOString();

function titleOf(list: readonly Ref[], id: string | null): string {
  if (!id) return '—';
  return list.find((item) => item.id === id)?.title ?? UNAVAILABLE;
}

export default function KennisApp({ links }: { links: ModuleLink[] }) {
  return (
    <BrowserRouter basename="/kennis">
      <KennisRoutes links={links} />
    </BrowserRouter>
  );
}

function KennisRoutes({ links }: { links: ModuleLink[] }) {
  const [database, setDatabase] = useState<LocalDatabase | null>(null);
  const [data, setData] = useState<Data>(empty);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function refresh(db: LocalDatabase) {
    const [sources, creators, highlights, insights, programs, log, goals, skills, actions] = await Promise.all([
      db.list<Source>('sources'),
      db.list<Creator>('creators'),
      db.list<Highlight>('highlights'),
      db.list<Insight>('insights'),
      db.list<StudyProgram>('studyPrograms'),
      db.list<LearningLog>('learningLog'),
      db.list<Ref>('goals'),
      db.list<Ref>('skills'),
      db.list<Ref & { insightId?: string | null; status: string }>('actions')
    ]);
    const byTitle = <T extends Ref>(list: T[]) => list.sort((a, b) => a.title.localeCompare(b.title, 'nl-NL'));
    setData({
      sources,
      creators: creators.sort((a, b) => a.name.localeCompare(b.name, 'nl-NL')),
      highlights: highlights.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      insights: insights.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      programs: programs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      log: log.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
      goals: byTitle(goals.map(({ id, title }) => ({ id, title }))),
      skills: byTitle(skills.map(({ id, title }) => ({ id, title }))),
      actions: actions.map(({ id, title, insightId, status }) => ({ id, title, insightId: insightId ?? null, status }))
    });
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

  const run: Run = async (action) => {
    if (!database) {
      setError('Lokale opslag is niet beschikbaar.');
      return false;
    }
    return performStorageAction(() => action(database), () => refresh(database), setError, 'De wijziging kon niet worden opgeslagen.');
  };

  return (
    <AppFrame appName="Kennis & Ontwikkeling" appMark="❒" navigation={navigation} moduleLinks={links}>
      {loading ? (
        <LoadingState />
      ) : (
        <>
          {error && <ErrorBanner message={error} />}
          <Routes>
            <Route path="/" element={<OverviewPage data={data} run={run} />} />
            <Route path="/bibliotheek" element={<LibraryPage data={data} run={run} />} />
            <Route path="/bibliotheek/:id" element={<SourcePage data={data} run={run} />} />
            <Route path="/highlights" element={<HighlightsPage data={data} run={run} />} />
            <Route path="/inzichten" element={<InsightsPage data={data} run={run} />} />
            <Route path="/studie" element={<StudyPage data={data} run={run} />} />
            <Route path="/logboek" element={<LogPage data={data} run={run} />} />
            <Route path="/analyse" element={<AnalysisPage data={data} />} />
            <Route path="/makers" element={<CreatorsPage data={data} run={run} />} />
            <Route path="*" element={<OverviewPage data={data} run={run} />} />
          </Routes>
        </>
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

function ChipPicker({ legend, options, selected, onChange }: { legend: string; options: Ref[]; selected: string[]; onChange: (next: string[]) => void }) {
  const missing = selected.filter((id) => !options.some((option) => option.id === id));
  if (!options.length && !missing.length) return null;
  return (
    <fieldset className="plain-fieldset">
      <legend>{legend}</legend>
      <div className="chip-row">
        {options.map((option) => (
          <button key={option.id} type="button" className="chip chip-toggle" aria-pressed={selected.includes(option.id)} onClick={() => onChange(selected.includes(option.id) ? selected.filter((id) => id !== option.id) : [...selected, option.id])}>
            {option.title}
          </button>
        ))}
        {missing.map((id) => (
          <button key={id} type="button" className="chip chip-toggle" aria-pressed="true" onClick={() => onChange(selected.filter((item) => item !== id))}>
            {UNAVAILABLE} ✕
          </button>
        ))}
      </div>
    </fieldset>
  );
}

// ——— Logboek (ook op het overzicht) ———

function LogForm({ data, run, sourceId = '' }: { data: Data; run: Run; sourceId?: string }) {
  const [date, setDate] = useState(todayKey());
  const [kind, setKind] = useState<LogKind>('lezen');
  const [minutes, setMinutes] = useState('20');
  const [source, setSource] = useState(sourceId);
  const [formError, setFormError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError('');
    try {
      const entry: LearningLog = { id: newId(), date, kind, minutes: Number(minutes), sourceId: source || null, note: '', createdAt: nowIso() };
      validateLearningLog(entry);
      if (date > todayKey()) throw new Error('Logboek: een datum in de toekomst kan niet.');
      await run((db) => db.put('learningLog', entry));
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Ongeldige invoer.');
    }
  }

  return (
    <form className="stack" noValidate onSubmit={(event) => void submit(event)}>
      <div className="form-grid">
        <Field label="Datum">
          <input type="date" value={date} max={todayKey()} onChange={(event) => setDate(event.target.value)} />
        </Field>
        <Field label="Wat">
          <select value={kind} onChange={(event) => setKind(event.target.value as LogKind)}>
            {LOG_KINDS.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </Field>
        <Field label="Minuten">
          <input type="number" min={1} max={1440} value={minutes} onChange={(event) => setMinutes(event.target.value)} />
        </Field>
        <Field label="Bron">
          <select value={source} onChange={(event) => setSource(event.target.value)}>
            <option value="">Geen</option>
            {data.sources.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
          </select>
        </Field>
      </div>
      {formError && <ErrorBanner message={formError} />}
      <div className="form-actions">
        <Button type="submit">Minuten vastleggen</Button>
      </div>
    </form>
  );
}

function OverviewPage({ data, run }: { data: Data; run: Run }) {
  const today = todayKey();
  const reading = data.sources.filter((source) => source.status === 'bezig');
  const week = minutesPerWeek(data.log, today, 8);
  const streak = learningStreak(data.log, today);

  return (
    <div className="stack">
      <PageHeader eyebrow="Kennis & Ontwikkeling" title="Wat leer je nu?" description="Je bibliotheek, highlights, inzichten en studieprogramma. Alles staat alleen op dit apparaat." action={<Link className="button button-primary" to="/bibliotheek?nieuw=1">＋ Bron</Link>} />
      <div className="grid grid-4">
        <Metric label="Bezig" value={String(reading.length)} note={`${data.sources.length} bronnen in totaal`} />
        <Metric label={`Afgerond in ${today.slice(0, 4)}`} value={String(finishedInYear(data.sources, today.slice(0, 4)))} note="Boeken, cursussen en meer" />
        <Metric label="Deze week" value={`${week[week.length - 1]!.minutes} min`} note={streak ? `Reeks: ${streak} ${streak === 1 ? 'dag' : 'dagen'}` : 'Nog geen reeks'} />
        <Metric label="Inzichten" value={String(data.insights.length)} note={`${data.highlights.length} highlights`} />
      </div>
      <div className="grid grid-2">
        <Card title="Nu bezig">
          {reading.length ? (
            <div className="list">
              {reading.map((source) => (
                <div className="list-item" key={source.id}>
                  <div>
                    <p className="item-title"><Link to={`/bibliotheek/${source.id}`}>{source.title}</Link></p>
                    <p className="item-subtitle">{source.type} · {categoryLabel[source.category]}</p>
                  </div>
                  <progress max={100} value={source.progress} aria-label={`Voortgang ${source.title}`} />
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="Niets in uitvoering">Zet een bron op "bezig" in de bibliotheek. Er worden geen voorbeeldgegevens getoond.</EmptyState>
          )}
        </Card>
        <Card title="Dagelijks lezen en luisteren">
          <LogForm data={data} run={run} />
          {data.log.length > 0 && <BarChart title="Minuten per week, laatste 8 weken" unit=" min" points={week.map((item) => ({ label: `${item.week.slice(8, 10)}-${item.week.slice(5, 7)}`, value: item.minutes }))} />}
        </Card>
      </div>
      <Card title="Recente inzichten" action={<Link className="text-button" to="/inzichten">Alle inzichten</Link>}>
        {data.insights.length ? (
          <div className="list">
            {data.insights.slice(0, 5).map((insight) => (
              <div className="list-item" key={insight.id}>
                <div>
                  <p className="item-title">{insight.title}</p>
                  <p className="item-subtitle">{insight.sourceId ? titleOf(data.sources, insight.sourceId) : 'Geen bron'} · {categoryLabel[insight.category]}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="Nog geen inzichten">Leg vast wat je hebt geleerd.</EmptyState>
        )}
      </Card>
    </div>
  );
}

// ——— Bibliotheek ———

function SourceEditor({ data, run, source, onDone }: { data: Data; run: Run; source?: Source; onDone: (id?: string) => void }) {
  const [title, setTitle] = useState(source?.title ?? '');
  const [type, setType] = useState<SourceType>(source?.type ?? 'boek');
  const [category, setCategory] = useState<Category>(source?.category ?? 'algemeen');
  const [creatorIds, setCreatorIds] = useState<string[]>(source?.creatorIds ?? []);
  const [labels, setLabels] = useState((source?.labels ?? []).join(', '));
  const [platform, setPlatform] = useState(source?.platform ?? '');
  const [url, setUrl] = useState(source?.url ?? '');
  const [status, setStatus] = useState<SourceStatus>(source?.status ?? 'wil ik');
  const [progress, setProgress] = useState(String(source?.progress ?? 0));
  const [rating, setRating] = useState(source?.rating ? String(source.rating) : '');
  const [summary, setSummary] = useState(source?.summary ?? '');
  const [notes, setNotes] = useState(source?.notes ?? '');
  const [goalIds, setGoalIds] = useState<string[]>(source?.goalIds ?? []);
  const [skillIds, setSkillIds] = useState<string[]>(source?.skillIds ?? []);
  const [formError, setFormError] = useState('');
  const concept = useFormConcept(
    'kennis.bron',
    source?.id ?? 'nieuw',
    'Bron',
    { title, type, category, creatorIds, labels, platform, url, status, progress, rating, summary, notes, goalIds, skillIds },
    {
      title: source?.title ?? '',
      type: source?.type ?? ('boek' as SourceType),
      category: source?.category ?? ('algemeen' as Category),
      creatorIds: source?.creatorIds ?? [],
      labels: (source?.labels ?? []).join(', '),
      platform: source?.platform ?? '',
      url: source?.url ?? '',
      status: source?.status ?? ('wil ik' as SourceStatus),
      progress: String(source?.progress ?? 0),
      rating: source?.rating ? String(source.rating) : '',
      summary: source?.summary ?? '',
      notes: source?.notes ?? '',
      goalIds: source?.goalIds ?? [],
      skillIds: source?.skillIds ?? []
    },
    (value) => {
      setTitle(value.title);
      if (SOURCE_TYPES.includes(value.type)) setType(value.type);
      if (CATEGORIES.includes(value.category)) setCategory(value.category);
      setCreatorIds(value.creatorIds);
      setLabels(value.labels);
      setPlatform(value.platform);
      setUrl(value.url);
      if (SOURCE_STATUSES.includes(value.status)) setStatus(value.status);
      setProgress(value.progress);
      setRating(value.rating);
      setSummary(value.summary);
      setNotes(value.notes);
      setGoalIds(value.goalIds);
      setSkillIds(value.skillIds);
    }
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError('');
    try {
      const now = nowIso();
      const base: Source = {
        ...(source ?? {}),
        id: source?.id ?? newId(),
        title: title.trim(),
        type,
        category,
        creatorIds,
        labels: parseLabels(labels),
        platform: platform.trim(),
        url: url.trim(),
        status: source?.status ?? 'wil ik',
        progress: Number(progress),
        startedAt: source?.startedAt ?? null,
        finishedAt: source?.finishedAt ?? null,
        rating: rating ? Number(rating) : null,
        favorite: source?.favorite ?? false,
        summary: summary.trim(),
        notes: notes.trim(),
        goalIds,
        skillIds,
        createdAt: source?.createdAt ?? now,
        updatedAt: now
      };
      const next = status === base.status ? base : withSourceStatus(base, status, todayKey());
      validateSource(next);
      if (await run((db) => db.put('sources', next))) {
        concept.clear();
        onDone(next.id);
      }
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'De bron bevat ongeldige gegevens.');
    }
  }

  return (
    <Card title={source ? 'Bron aanpassen' : 'Nieuwe bron'}>
      <form className="stack" noValidate onSubmit={(event) => void submit(event)}>
        <ConceptNotice concept={concept} />
        <Field label="Titel">
          <input value={title} maxLength={300} onChange={(event) => setTitle(event.target.value)} required />
        </Field>
        <div className="form-grid">
          <Field label="Soort">
            <select value={type} onChange={(event) => setType(event.target.value as SourceType)}>
              {SOURCE_TYPES.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </Field>
          <Field label="Categorie">
            <select value={category} onChange={(event) => setCategory(event.target.value as Category)}>
              {CATEGORIES.map((item) => <option key={item} value={item}>{categoryLabel[item]}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select value={status} onChange={(event) => setStatus(event.target.value as SourceStatus)}>
              {SOURCE_STATUSES.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </Field>
          <Field label="Voortgang (%)">
            <input type="number" min={0} max={100} value={progress} onChange={(event) => setProgress(event.target.value)} />
          </Field>
          <Field label="Waardering (1–5)">
            <input type="number" min={1} max={5} value={rating} onChange={(event) => setRating(event.target.value)} />
          </Field>
          <Field label="Platform">
            <input value={platform} onChange={(event) => setPlatform(event.target.value)} />
          </Field>
        </div>
        <Field label="Labels" hint="Gescheiden door komma's">
          <input value={labels} onChange={(event) => setLabels(event.target.value)} />
        </Field>
        <Field label="Link">
          <input type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://" />
        </Field>
        <Field label="Samenvatting">
          <textarea value={summary} onChange={(event) => setSummary(event.target.value)} />
        </Field>
        <Field label="Eigen notities" hint="Wat je ervan vindt, vragen, verbanden">
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
        </Field>
        <ChipPicker legend="Makers" options={data.creators.map((creator) => ({ id: creator.id, title: creator.name }))} selected={creatorIds} onChange={setCreatorIds} />
        <ChipPicker legend="Draagt bij aan doelen (Groei)" options={data.goals} selected={goalIds} onChange={setGoalIds} />
        <ChipPicker legend="Ontwikkelt vaardigheden (Groei)" options={data.skills} selected={skillIds} onChange={setSkillIds} />
        {formError && <ErrorBanner message={formError} />}
        <div className="form-actions">
          <Button type="button" variant="secondary" onClick={() => onDone()}>Annuleren</Button>
          <Button type="submit">Bron opslaan</Button>
        </div>
      </form>
    </Card>
  );
}

function LibraryPage({ data, run }: { data: Data; run: Run }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [type, setType] = useState<SourceType | ''>('');
  const [status, setStatus] = useState<SourceStatus | ''>('');
  const [category, setCategory] = useState<Category | ''>((params.get('categorie') as Category) ?? '');
  const [label, setLabel] = useState('');
  const [favorite, setFavorite] = useState(false);
  const [sort, setSort] = useState<SourceSort>('gewijzigd');
  const creatorName = (id: string) => data.creators.find((creator) => creator.id === id)?.name ?? '';
  const results = filterSources(data.sources, { query, type, status, category: CATEGORIES.includes(category as Category) ? category : '', label, favorite, sort }, creatorName);
  const labels = useMemo(() => allLabels(data.sources), [data.sources]);

  return (
    <div className="stack">
      <PageHeader eyebrow="Kennis & Ontwikkeling" title="Bibliotheek" description="Boeken, podcasts, cursussen, artikelen en meer." action={params.get('nieuw') !== '1' && <Button onClick={() => setParams({ nieuw: '1' })}>＋ Bron</Button>} />
      {params.get('nieuw') === '1' && <SourceEditor data={data} run={run} onDone={(id) => (id ? navigate(`/bibliotheek/${id}`) : setParams({}))} />}
      <Card>
        <div className="form-grid">
          <Field label="Zoeken">
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Titel, maker, label of samenvatting" />
          </Field>
          <Field label="Filter op soort">
            <select value={type} onChange={(event) => setType(event.target.value as SourceType | '')}>
              <option value="">Alle</option>
              {SOURCE_TYPES.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </Field>
          <Field label="Filter op status">
            <select value={status} onChange={(event) => setStatus(event.target.value as SourceStatus | '')}>
              <option value="">Alle</option>
              {SOURCE_STATUSES.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </Field>
          <Field label="Filter op categorie">
            <select value={category} onChange={(event) => setCategory(event.target.value as Category | '')}>
              <option value="">Alle</option>
              {CATEGORIES.map((item) => <option key={item} value={item}>{categoryLabel[item]}</option>)}
            </select>
          </Field>
          <Field label="Filter op label">
            <select value={label} onChange={(event) => setLabel(event.target.value)}>
              <option value="">Alle</option>
              {labels.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </Field>
          <Field label="Sorteren">
            <select value={sort} onChange={(event) => setSort(event.target.value as SourceSort)}>
              <option value="gewijzigd">Laatst gewijzigd</option>
              <option value="titel">Titel</option>
              <option value="waardering">Waardering</option>
              <option value="afgerond">Laatst afgerond</option>
            </select>
          </Field>
        </div>
        <label className="row" style={{ justifyContent: 'flex-start', gap: '0.5rem' }}>
          <input type="checkbox" checked={favorite} onChange={(event) => setFavorite(event.target.checked)} /> Alleen favorieten
        </label>
      </Card>
      {results.length ? (
        <Card>
          <div className="list">
            {results.map((source) => (
              <div className="list-item" key={source.id}>
                <div>
                  <p className="item-title">
                    {source.favorite && <span aria-label="Favoriet">★ </span>}
                    <Link to={`/bibliotheek/${source.id}`}>{source.title}</Link>
                  </p>
                  <p className="item-subtitle">
                    {source.type} · {categoryLabel[source.category]}
                    {source.creatorIds.length > 0 && <> · {source.creatorIds.map((id) => creatorName(id) || UNAVAILABLE).join(', ')}</>}
                    {source.rating && <> · {'★'.repeat(source.rating)}</>}
                  </p>
                </div>
                <StatusPill tone={source.status === 'afgerond' ? 'good' : source.status === 'gestopt' ? 'warning' : 'neutral'}>{source.status}</StatusPill>
              </div>
            ))}
          </div>
        </Card>
      ) : (
        <Card>
          <EmptyState title={data.sources.length ? 'Niets gevonden' : 'Nog geen bronnen'}>{data.sources.length ? 'Pas je zoekterm of filters aan.' : 'Voeg je eerste boek, podcast of cursus toe.'}</EmptyState>
        </Card>
      )}
    </div>
  );
}

function SourcePage({ data, run }: { data: Data; run: Run }) {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [highlight, setHighlight] = useState('');
  const [location, setLocation] = useState('');
  const [formError, setFormError] = useState('');
  const highlightConcept = useFormConcept('kennis.highlight', id, 'Highlight', { highlight, location }, { highlight: '', location: '' }, (value) => {
    setHighlight(value.highlight);
    setLocation(value.location);
  });
  const source = data.sources.find((item) => item.id === id);
  if (!source) {
    return (
      <Card>
        <EmptyState title={UNAVAILABLE}>Deze bron bestaat niet (meer). <Link to="/bibliotheek">Terug naar de bibliotheek</Link></EmptyState>
      </Card>
    );
  }
  const current = source;
  const highlights = data.highlights.filter((item) => item.sourceId === current.id);
  const insights = data.insights.filter((item) => item.sourceId === current.id);
  const sourceActions = data.actions.filter((action) => action.insightId !== null && insights.some((item) => item.id === action.insightId));
  const programs = data.programs.filter((item) => item.sourceId === current.id);
  const minutes = data.log.filter((entry) => entry.sourceId === current.id).reduce((sum, entry) => sum + entry.minutes, 0);

  async function addHighlight(event: FormEvent) {
    event.preventDefault();
    setFormError('');
    try {
      const now = nowIso();
      const item: Highlight = { id: newId(), sourceId: current.id, text: highlight.trim(), location: location.trim(), note: '', createdAt: now, updatedAt: now };
      validateHighlight(item);
      if (await run((db) => db.put('highlights', item))) {
        setHighlight('');
        setLocation('');
        highlightConcept.clear();
      }
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Ongeldige highlight.');
    }
  }

  async function startProgram() {
    const program = newStudyProgram(current.id, newId());
    validateStudyProgram(program);
    if (await run((db) => db.put('studyPrograms', program))) navigate('/studie');
  }

  return (
    <div className="stack">
      <PageHeader
        eyebrow={`${current.type} · ${categoryLabel[current.category]}`}
        title={current.title}
        description={current.creatorIds.map((cid) => data.creators.find((creator) => creator.id === cid)?.name ?? UNAVAILABLE).join(', ') || 'Geen maker'}
        action={
          <div className="row">
            <Button variant="secondary" onClick={() => void run((db) => db.put('sources', { ...current, favorite: !current.favorite, updatedAt: nowIso() }))} aria-pressed={current.favorite}>
              {current.favorite ? '★ Favoriet' : '☆ Favoriet'}
            </Button>
            <Button variant="secondary" onClick={() => setEditing((value) => !value)}>{editing ? 'Sluiten' : 'Aanpassen'}</Button>
          </div>
        }
      />
      {editing && <SourceEditor key={current.updatedAt} data={data} run={run} source={current} onDone={() => setEditing(false)} />}
      <div className="grid grid-4">
        <Metric label="Status" value={current.status} note={current.finishedAt ? `Afgerond ${formatDate(current.finishedAt)}` : current.startedAt ? `Begonnen ${formatDate(current.startedAt)}` : 'Nog niet begonnen'} />
        <Metric label="Voortgang" value={`${current.progress}%`} note={current.rating ? `${current.rating}/5 sterren` : 'Geen waardering'} />
        <Metric label="Tijd" value={`${minutes} min`} note="Uit je logboek" />
        <Metric label="Highlights" value={String(highlights.length)} note={`${insights.length} inzichten`} />
      </div>
      {current.summary && (
        <Card title="Samenvatting">
          <p className="journal-text">{current.summary}</p>
        </Card>
      )}
      {current.notes && (
        <Card title="Eigen notities">
          <p className="journal-text">{current.notes}</p>
        </Card>
      )}
      <div className="grid grid-2">
        <Card title="Highlights">
          <form className="stack" noValidate onSubmit={(event) => void addHighlight(event)}>
            <ConceptNotice concept={highlightConcept} />
            <Field label="Nieuwe highlight">
              <textarea value={highlight} onChange={(event) => setHighlight(event.target.value)} />
            </Field>
            <Field label="Pagina of tijdstip">
              <input value={location} onChange={(event) => setLocation(event.target.value)} />
            </Field>
            {formError && <ErrorBanner message={formError} />}
            <div className="form-actions">
              <Button type="submit">Highlight toevoegen</Button>
            </div>
          </form>
          <div className="list">
            {highlights.map((item) => <HighlightRow key={`${item.id}:${item.updatedAt}`} item={item} sourceId={current.id} run={run} />)}
          </div>
        </Card>
        <div className="stack">
          <Card title="Inzichten" action={<Link className="text-button" to={`/inzichten?nieuw=1&bron=${current.id}`}>＋ Inzicht</Link>}>
            {insights.length ? <div className="list">{insights.map((item) => <p key={item.id} className="item-title">{item.title}</p>)}</div> : <p className="item-subtitle">Nog geen inzichten uit deze bron.</p>}
            <p className="item-subtitle">
              Acties in Groei uit deze inzichten: {sourceActions.length ? `${sourceActions.filter((action) => action.status === 'klaar').length} van ${sourceActions.length} klaar (${sourceActions.map((action) => action.title).join(', ')})` : 'nog geen'}
            </p>
          </Card>
          <Card title="Studieprogramma">
            {programs.length ? (
              programs.map((program) => <p key={program.id}>{programProgress(program)}% van de vijf stappen · <Link to="/studie">Openen</Link></p>)
            ) : (
              <Button variant="secondary" onClick={() => void startProgram()}>Start vijfstappenprogramma</Button>
            )}
          </Card>
          <Card title="Groei">
            <p className="item-subtitle">Doelen: {current.goalIds.length ? current.goalIds.map((gid) => titleOf(data.goals, gid)).join(', ') : 'geen'}</p>
            <p className="item-subtitle">Vaardigheden: {current.skillIds.length ? current.skillIds.map((sid) => titleOf(data.skills, sid)).join(', ') : 'geen'}</p>
          </Card>
        </div>
      </div>
      <Card>
        <ConfirmAction
          label={`Bron ${current.title} verwijderen`}
          confirmMessage="Deze bron verwijderen? Highlights, inzichten en logregels blijven bestaan en tonen de bron als 'Niet meer beschikbaar'. Dit kan niet ongedaan worden gemaakt."
          onConfirm={() => void run((db) => db.remove('sources', current.id)).then((ok) => ok && navigate('/bibliotheek'))}
        >
          Bron verwijderen
        </ConfirmAction>
      </Card>
    </div>
  );
}

// ——— Highlights ———

function HighlightsPage({ data, run }: { data: Data; run: Run }) {
  const [query, setQuery] = useState('');
  const [source, setSource] = useState('');
  const filtered = searchText(data.highlights, query).filter((item) => (source === '' ? true : source === 'geen' ? item.sourceId === null : item.sourceId === source));
  return (
    <div className="stack">
      <PageHeader eyebrow="Kennis & Ontwikkeling" title="Highlights" description="Alle highlights, met of zonder bron." />
      <Card>
        <div className="form-grid">
          <Field label="Zoeken">
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} />
          </Field>
          <Field label="Filter op bron">
            <select value={source} onChange={(event) => setSource(event.target.value)}>
              <option value="">Alle</option>
              <option value="geen">Zonder bron</option>
              {data.sources.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
            </select>
          </Field>
        </div>
      </Card>
      {filtered.length ? (
        <Card>
          <div className="list">
            {filtered.map((item) => (
              <div className="list-item" key={item.id}>
                <div>
                  <p className="item-title">“{item.text}”</p>
                  <p className="item-subtitle">{item.sourceId ? titleOf(data.sources, item.sourceId) : 'Zonder bron'}{item.location && ` · ${item.location}`}</p>
                </div>
                <ConfirmAction label="Highlight verwijderen" confirmMessage="Deze highlight verwijderen?" onConfirm={() => void run((db) => db.remove('highlights', item.id))}>
                  Verwijderen
                </ConfirmAction>
              </div>
            ))}
          </div>
        </Card>
      ) : (
        <Card>
          <EmptyState title="Geen highlights">Voeg highlights toe vanaf een bron in de bibliotheek.</EmptyState>
        </Card>
      )}
    </div>
  );
}

// ——— Inzichten ———

function InsightEditor({ data, run, insight, sourceId = '', highlightId = '', onDone }: { data: Data; run: Run; insight?: Insight; sourceId?: string; highlightId?: string; onDone: () => void }) {
  const [title, setTitle] = useState(insight?.title ?? '');
  const [text, setText] = useState(insight?.text ?? '');
  const [source, setSource] = useState(insight?.sourceId ?? sourceId);
  const fromSource = data.sources.find((item) => item.id === source);
  const [category, setCategory] = useState<Category>(insight?.category ?? fromSource?.category ?? 'algemeen');
  const [highlightIds, setHighlightIds] = useState<string[]>(insight?.highlightIds ?? (highlightId ? [highlightId] : []));
  const [goalIds, setGoalIds] = useState<string[]>(insight?.goalIds ?? []);
  const [skillIds, setSkillIds] = useState<string[]>(insight?.skillIds ?? []);
  const [formError, setFormError] = useState('');
  const initialSource = insight?.sourceId ?? sourceId;
  const concept = useFormConcept(
    'kennis.inzicht',
    insight?.id ?? `nieuw:${sourceId}:${highlightId}`,
    'Inzicht',
    { title, text, source, category, highlightIds, goalIds, skillIds },
    {
      title: insight?.title ?? '',
      text: insight?.text ?? '',
      source: initialSource,
      category: insight?.category ?? data.sources.find((item) => item.id === initialSource)?.category ?? ('algemeen' as Category),
      highlightIds: insight?.highlightIds ?? (highlightId ? [highlightId] : []),
      goalIds: insight?.goalIds ?? [],
      skillIds: insight?.skillIds ?? []
    },
    (value) => {
      setTitle(value.title);
      setText(value.text);
      setSource(value.source);
      if (CATEGORIES.includes(value.category)) setCategory(value.category);
      setHighlightIds(value.highlightIds);
      setGoalIds(value.goalIds);
      setSkillIds(value.skillIds);
    }
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError('');
    try {
      const now = nowIso();
      const next: Insight = { ...(insight ?? {}), id: insight?.id ?? newId(), title: title.trim(), text: text.trim(), category, sourceId: source || null, highlightIds, goalIds, skillIds, createdAt: insight?.createdAt ?? now, updatedAt: now };
      validateInsight(next);
      if (await run((db) => db.put('insights', next))) {
        concept.clear();
        onDone();
      }
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Ongeldig inzicht.');
    }
  }

  const sourceHighlights = data.highlights.filter((item) => item.sourceId === (source || null)).map((item) => ({ id: item.id, title: item.text.slice(0, 60) }));

  return (
    <Card title={insight ? 'Inzicht aanpassen' : 'Nieuw inzicht'}>
      <form className="stack" noValidate onSubmit={(event) => void submit(event)}>
        <ConceptNotice concept={concept} />
        <Field label="Inzicht">
          <input value={title} maxLength={300} onChange={(event) => setTitle(event.target.value)} required />
        </Field>
        <div className="form-grid">
          <Field label="Bron">
            <select value={source} onChange={(event) => setSource(event.target.value)}>
              <option value="">Geen</option>
              {data.sources.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
            </select>
          </Field>
          <Field label="Categorie">
            <select value={category} onChange={(event) => setCategory(event.target.value as Category)}>
              {CATEGORIES.map((item) => <option key={item} value={item}>{categoryLabel[item]}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Toelichting">
          <textarea value={text} onChange={(event) => setText(event.target.value)} />
        </Field>
        <ChipPicker legend="Highlights" options={sourceHighlights} selected={highlightIds} onChange={setHighlightIds} />
        <ChipPicker legend="Draagt bij aan doelen (Groei)" options={data.goals} selected={goalIds} onChange={setGoalIds} />
        <ChipPicker legend="Vaardigheden (Groei)" options={data.skills} selected={skillIds} onChange={setSkillIds} />
        {formError && <ErrorBanner message={formError} />}
        <div className="form-actions">
          <Button type="button" variant="secondary" onClick={onDone}>Annuleren</Button>
          <Button type="submit">Inzicht opslaan</Button>
        </div>
      </form>
    </Card>
  );
}

function InsightsPage({ data, run }: { data: Data; run: Run }) {
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<Category | ''>('');
  const editing = data.insights.find((item) => item.id === params.get('bewerk'));
  const list = searchText(data.insights, query).filter((item) => !category || item.category === category);

  return (
    <div className="stack">
      <PageHeader eyebrow="Kennis & Ontwikkeling" title="Inzichten" description="Wat je hebt geleerd, met de acties die eruit voortkwamen." action={!params.get('nieuw') && !editing && <Button onClick={() => setParams({ nieuw: '1' })}>＋ Inzicht</Button>} />
      {(params.get('nieuw') === '1' || editing) && (
        <InsightEditor key={editing?.id ?? 'nieuw'} data={data} run={run} {...(editing ? { insight: editing } : {})} sourceId={params.get('bron') ?? ''} highlightId={params.get('highlight') ?? ''} onDone={() => setParams({})} />
      )}
      <Card>
        <div className="form-grid">
          <Field label="Zoeken">
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} />
          </Field>
          <Field label="Filter op categorie">
            <select value={category} onChange={(event) => setCategory(event.target.value as Category | '')}>
              <option value="">Alle</option>
              {CATEGORIES.map((item) => <option key={item} value={item}>{categoryLabel[item]}</option>)}
            </select>
          </Field>
        </div>
      </Card>
      {list.length ? (
        list.map((insight) => {
          const actions = data.actions.filter((action) => action.insightId === insight.id);
          return (
            <Card key={insight.id} title={insight.title} action={<StatusPill>{categoryLabel[insight.category]}</StatusPill>}>
              {insight.text && <p className="journal-text">{insight.text}</p>}
              <p className="item-subtitle">
                Bron: {insight.sourceId ? titleOf(data.sources, insight.sourceId) : 'geen'} · Doelen: {insight.goalIds.length ? insight.goalIds.map((gid) => titleOf(data.goals, gid)).join(', ') : 'geen'}
              </p>
              <p className="item-subtitle">Acties uit dit inzicht: {actions.length ? actions.map((action) => action.title).join(', ') : 'nog geen'}</p>
              <div className="row" style={{ justifyContent: 'flex-start' }}>
                <a className="text-button" href={`/groei/acties?nieuw=1&inzicht=${insight.id}`}>＋ Actie in Groei</a>
                <button type="button" className="text-button" onClick={() => setParams({ bewerk: insight.id })}>Aanpassen</button>
                <ConfirmAction label={`Inzicht ${insight.title} verwijderen`} confirmMessage="Dit inzicht verwijderen? Acties die eruit voortkwamen blijven bestaan." onConfirm={() => void run((db) => db.remove('insights', insight.id))}>
                  Verwijderen
                </ConfirmAction>
              </div>
            </Card>
          );
        })
      ) : (
        <Card>
          <EmptyState title={data.insights.length ? 'Niets gevonden' : 'Nog geen inzichten'}>{data.insights.length ? 'Pas je zoekterm of filter aan.' : 'Leg je eerste inzicht vast.'}</EmptyState>
        </Card>
      )}
    </div>
  );
}

function HighlightRow({ item, sourceId, run }: { item: Highlight; sourceId: string; run: Run }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(item.text);
  const [location, setLocation] = useState(item.location);
  const [note, setNote] = useState(item.note);
  const [formError, setFormError] = useState('');

  async function save(event: FormEvent) {
    event.preventDefault();
    setFormError('');
    try {
      const next: Highlight = { ...item, text: text.trim(), location: location.trim(), note: note.trim(), updatedAt: nowIso() };
      validateHighlight(next);
      if (await run((db) => db.put('highlights', next))) setEditing(false);
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Ongeldige highlight.');
    }
  }

  if (editing) {
    return (
      <form className="stack" noValidate onSubmit={(event) => void save(event)} aria-label="Highlight aanpassen">
        <Field label="Highlight">
          <textarea value={text} onChange={(event) => setText(event.target.value)} />
        </Field>
        <Field label="Pagina of tijdstip">
          <input value={location} onChange={(event) => setLocation(event.target.value)} />
        </Field>
        <Field label="Notitie bij highlight">
          <textarea value={note} onChange={(event) => setNote(event.target.value)} />
        </Field>
        {formError && <ErrorBanner message={formError} />}
        <div className="form-actions">
          <Button type="button" variant="secondary" onClick={() => setEditing(false)}>Annuleren</Button>
          <Button type="submit">Highlight opslaan</Button>
        </div>
      </form>
    );
  }

  return (
    <div className="list-item">
      <div>
        <p className="item-title">“{item.text}”</p>
        {item.location && <p className="item-subtitle">{item.location}</p>}
        {item.note && <p className="item-subtitle">Notitie: {item.note}</p>}
      </div>
      <div className="row">
        <Link className="text-button" to={`/inzichten?nieuw=1&bron=${sourceId}&highlight=${item.id}`}>Inzicht</Link>
        <button type="button" className="text-button" onClick={() => setEditing(true)}>Aanpassen</button>
        <ConfirmAction label="Highlight verwijderen" confirmMessage="Deze highlight verwijderen?" onConfirm={() => void run((db) => db.remove('highlights', item.id))}>
          Verwijderen
        </ConfirmAction>
      </div>
    </div>
  );
}

// ——— Analyse ———

const sourceTypeLabel: Record<SourceType, string> = { boek: 'Boeken', podcast: "Podcasts", cursus: 'Cursussen', artikel: 'Artikelen', video: "Video's", document: 'Documenten', overig: 'Overig' };

function AnalysisPage({ data }: { data: Data }) {
  const [year, setYear] = useState(todayKey().slice(0, 4));
  const result = kennisAnalysis(data, year);
  const percent = (part: number, total: number) => (total ? `${Math.round((part / total) * 100)}%` : '–');

  return (
    <div className="stack">
      <PageHeader eyebrow="Kennis & Ontwikkeling" title="Analyse" description="Wat je leest, luistert en leert, en wat je ermee doet in Groei. Alleen tellingen." />
      <Card>
        <Field label="Jaar">
          <input inputMode="numeric" value={year} maxLength={4} onChange={(event) => setYear(event.target.value.replace(/\D/g, '').slice(0, 4))} />
        </Field>
      </Card>
      <div className="grid grid-4">
        <Metric label="Inzichten met actie" value={percent(result.insights.withAction, result.insights.total)} note={`${result.insights.withAction} van ${result.insights.total} inzichten`} />
        <Metric label="Acties klaar" value={`${result.actions.done} van ${result.actions.total}`} note="Acties in Groei uit inzichten" />
        <Metric label="Gekoppeld aan Groei" value={percent(result.sources.linkedToGrowth, result.sources.total)} note={`${result.sources.linkedToGrowth} van ${result.sources.total} bronnen`} />
        <Metric label={`Minuten in ${year}`} value={String(result.minutesByKind.reduce((sum, item) => sum + item.minutes, 0))} note="Uit je logboek" />
      </div>
      <div className="grid grid-2">
        <Card title="Per soort">
          <table className="review-table">
            <thead><tr><th scope="col">Soort</th><th scope="col">Totaal</th><th scope="col">Bezig</th><th scope="col">Afgerond in {year}</th></tr></thead>
            <tbody>
              {result.byType.map((item) => <tr key={item.type}><th scope="row">{sourceTypeLabel[item.type]}</th><td>{item.total}</td><td>{item.inProgress}</td><td>{item.finishedThisYear}</td></tr>)}
            </tbody>
          </table>
        </Card>
        <Card title="Per categorie">
          <table className="review-table">
            <thead><tr><th scope="col">Categorie</th><th scope="col">Bronnen</th><th scope="col">Inzichten</th><th scope="col">Minuten in {year}</th></tr></thead>
            <tbody>
              {result.byCategory.map((item) => <tr key={item.category}><th scope="row">{categoryLabel[item.category]}</th><td>{item.sources}</td><td>{item.insights}</td><td>{item.minutesThisYear}</td></tr>)}
            </tbody>
          </table>
        </Card>
      </div>
      <Card title={`Minuten per activiteit in ${year}`}>
        <BarChart title={`Minuten per activiteit in ${year}`} unit=" min" points={result.minutesByKind.map((item) => ({ label: item.kind, value: item.minutes }))} />
      </Card>
    </div>
  );
}

// ——— Studieprogramma ———

function StudyPage({ data, run }: { data: Data; run: Run }) {
  const today = todayKey();
  const [sourceId, setSourceId] = useState('');

  async function start() {
    if (!sourceId) return;
    const program = newStudyProgram(sourceId, newId());
    validateStudyProgram(program);
    if (await run((db) => db.put('studyPrograms', program))) setSourceId('');
  }

  return (
    <div className="stack">
      <PageHeader eyebrow="Kennis & Ontwikkeling" title="Studieprogramma" description="Het vijfstappenprogramma uit The Ultimate Growth System, met de meting na 30 dagen." />
      <Card title="Nieuw programma">
        <div className="form-grid">
          <Field label="Bron">
            <select value={sourceId} onChange={(event) => setSourceId(event.target.value)}>
              <option value="">Kies een bron</option>
              {data.sources.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
            </select>
          </Field>
        </div>
        <div className="form-actions">
          <Button onClick={() => void start()} disabled={!sourceId}>Programma starten</Button>
        </div>
      </Card>
      {data.programs.length ? (
        data.programs.map((program) => <ProgramCard key={program.id} program={program} data={data} run={run} today={today} />)
      ) : (
        <Card>
          <EmptyState title="Nog geen studieprogramma">Start een programma voor een boek, cursus of andere bron.</EmptyState>
        </Card>
      )}
    </div>
  );
}

function ProgramCard({ program, data, run, today }: { program: StudyProgram; data: Data; run: Run; today: string }) {
  const [result, setResult] = useState(program.measureResult);
  const measure = measureState(program, today);
  const save = (next: StudyProgram) => {
    validateStudyProgram(next);
    return run((db) => db.put('studyPrograms', next));
  };
  return (
    <Card title={titleOf(data.sources, program.sourceId)} action={<StatusPill tone={programProgress(program) === 100 ? 'good' : 'neutral'}>{programProgress(program)}%</StatusPill>}>
      <ol className="stack">
        {STUDY_STEPS.map((step, index) => (
          <li key={step}>
            <label className="row" style={{ justifyContent: 'flex-start', gap: '0.5rem' }}>
              <input type="checkbox" checked={program.steps[index]!.done} onChange={() => void save(toggleStudyStep(program, index, today))} aria-label={`${step} afgerond`} />
              <span>{step}</span>
              {program.steps[index]!.doneAt && <small className="item-subtitle">{formatDate(program.steps[index]!.doneAt)}</small>}
            </label>
          </li>
        ))}
      </ol>
      <p className="item-subtitle">
        30-dagenmeting:{' '}
        {measure.state === 'niet gestart' ? 'start zodra je stap 3 afvinkt' : measure.state === 'loopt' ? `nog ${measure.daysLeft} dagen (meten op ${formatDate(measure.due)})` : `meet nu je verbetering (sinds ${formatDate(measure.due)})`}
      </p>
      <Field label="Meetresultaat">
        <textarea value={result} onChange={(event) => setResult(event.target.value)} onBlur={() => result !== program.measureResult && void save({ ...program, measureResult: result, updatedAt: nowIso() })} />
      </Field>
      <ConfirmAction label="Studieprogramma verwijderen" confirmMessage="Dit studieprogramma verwijderen?" onConfirm={() => void run((db) => db.remove('studyPrograms', program.id))}>
        Verwijderen
      </ConfirmAction>
    </Card>
  );
}

// ——— Logboek ———

function LogPage({ data, run }: { data: Data; run: Run }) {
  const today = todayKey();
  const week = minutesPerWeek(data.log, today, 12);
  return (
    <div className="stack">
      <PageHeader eyebrow="Kennis & Ontwikkeling" title="Logboek" description="Dagelijks lezen, luisteren en studeren." />
      <Card title="Vastleggen">
        <LogForm data={data} run={run} />
      </Card>
      {data.log.length > 0 && (
        <Card title="Minuten per week">
          <BarChart title="Minuten per week, laatste 12 weken" unit=" min" points={week.map((item) => ({ label: `${item.week.slice(8, 10)}-${item.week.slice(5, 7)}`, value: item.minutes }))} />
        </Card>
      )}
      <Card title="Historie">
        {data.log.length ? (
          <div className="list">
            {data.log.slice(0, 100).map((entry) => (
              <div className="list-item" key={entry.id}>
                <div>
                  <p className="item-title">{formatDate(entry.date)} · {entry.minutes} min {entry.kind}</p>
                  <p className="item-subtitle">{entry.sourceId ? titleOf(data.sources, entry.sourceId) : 'Geen bron'}</p>
                </div>
                <ConfirmAction label="Logregel verwijderen" confirmMessage="Deze logregel verwijderen?" onConfirm={() => void run((db) => db.remove('learningLog', entry.id))}>
                  Verwijderen
                </ConfirmAction>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="Nog niets vastgelegd">Leg vast hoeveel minuten je las of luisterde.</EmptyState>
        )}
      </Card>
    </div>
  );
}

// ——— Makers ———

function CreatorsPage({ data, run }: { data: Data; run: Run }) {
  const [name, setName] = useState('');
  const [role, setRole] = useState<CreatorRole>('auteur');
  const [formError, setFormError] = useState('');

  async function add(event: FormEvent) {
    event.preventDefault();
    setFormError('');
    try {
      const now = nowIso();
      const creator: Creator = { id: newId(), name: name.trim(), role, createdAt: now, updatedAt: now };
      validateCreator(creator);
      if (await run((db) => db.put('creators', creator))) setName('');
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Ongeldige maker.');
    }
  }

  return (
    <div className="stack">
      <PageHeader eyebrow="Kennis & Ontwikkeling" title="Makers" description="Auteurs, sprekers en docenten." />
      <Card title="Nieuwe maker">
        <form className="stack" noValidate onSubmit={(event) => void add(event)}>
          <div className="form-grid">
            <Field label="Naam">
              <input value={name} maxLength={300} onChange={(event) => setName(event.target.value)} required />
            </Field>
            <Field label="Rol">
              <select value={role} onChange={(event) => setRole(event.target.value as CreatorRole)}>
                {CREATOR_ROLES.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </Field>
          </div>
          {formError && <ErrorBanner message={formError} />}
          <div className="form-actions">
            <Button type="submit">Maker toevoegen</Button>
          </div>
        </form>
      </Card>
      <Card>
        {data.creators.length ? (
          <div className="list">
            {data.creators.map((creator) => {
              const count = data.sources.filter((source) => source.creatorIds.includes(creator.id)).length;
              return (
                <div className="list-item" key={creator.id}>
                  <div>
                    <p className="item-title">{creator.name}</p>
                    <p className="item-subtitle">{creator.role} · {count} {count === 1 ? 'bron' : 'bronnen'}</p>
                  </div>
                  <ConfirmAction label={`Maker ${creator.name} verwijderen`} confirmMessage="Deze maker verwijderen? Bronnen tonen de maker daarna als 'Niet meer beschikbaar'." onConfirm={() => void run((db) => db.remove('creators', creator.id))}>
                    Verwijderen
                  </ConfirmAction>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState title="Nog geen makers">Voeg een auteur, spreker of docent toe.</EmptyState>
        )}
      </Card>
    </div>
  );
}
