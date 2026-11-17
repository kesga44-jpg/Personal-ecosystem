import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { BrowserRouter, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom';
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
import { searchWger } from './api';
import {
  allExercises,
  cleanLink,
  exerciseFromWger,
  isDarebee,
  lastWeight,
  newRecords,
  personalRecords,
  plannedSets,
  progression,
  sessionMinutes,
  sessionVolume,
  sessionsThisWeek,
  validateExercise,
  validateSession,
  validateTemplate,
  weeklySummary,
  type Session,
  type SessionExercise,
  type SetEntry,
  type Template,
  type TemplateItem
} from './domain';
import { CATEGORIES, EQUIPMENT, KINDS, kindLabels, type Category, type Equipment, type Exercise, type Kind } from './exercises';
import type { WgerExercise } from './wger';
import { databaseConfig } from './storage';
import { draftExercise, draftToSession, readDraft, writeDraft, type Draft, type DraftExercise, type DraftSet } from './workout';

const navigation = [
  { to: '/', label: 'Overzicht', icon: '⌂' },
  { to: '/training', label: 'Training', icon: '▶' },
  { to: '/schemas', label: 'Schema’s', icon: '☰' },
  { to: '/oefeningen', label: 'Oefeningen', icon: '◇' },
  { to: '/voortgang', label: 'Voortgang', icon: '↗' },
  { to: '/geschiedenis', label: 'Geschiedenis', icon: '◷' }
];

function todayKey(): string {
  const date = new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function formatDay(date: string): string {
  return new Intl.DateTimeFormat('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(`${date}T12:00:00`));
}

const nl = (value: number, digits = 1) => value.toLocaleString('nl-NL', { maximumFractionDigits: digits });

function message(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}

function setSummary(kind: Kind, set: SetEntry): string {
  if (kind === 'tijd') return `${set.seconds ?? 0} s${set.weightKg ? ` · ${nl(set.weightKg)} kg` : ''}`;
  if (kind === 'lichaam') return `${set.reps ?? 0}×${set.weightKg ? ` +${nl(set.weightKg)} kg` : ''}`;
  return `${set.reps ?? 0} × ${nl(set.weightKg ?? 0)} kg`;
}

function recordText(kind: Kind, value: number): string {
  return kind === 'gewicht' ? `${nl(value)} kg` : kind === 'tijd' ? `${value} s` : `${value} herhalingen`;
}

export default function KrachtApp({ links }: { links: ModuleLink[] }) {
  return (
    <BrowserRouter basename="/kracht">
      <KrachtRoutes links={links} />
    </BrowserRouter>
  );
}

function KrachtRoutes({ links }: { links: ModuleLink[] }) {
  const [database, setDatabase] = useState<LocalDatabase | null>(null);
  const [own, setOwn] = useState<Exercise[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function refresh(db: LocalDatabase) {
    const [nextOwn, nextTemplates, nextSessions] = await Promise.all([db.list<Exercise>('exercises'), db.list<Template>('templates'), db.list<Session>('sessions')]);
    setOwn(nextOwn);
    setTemplates(nextTemplates.sort((a, b) => a.name.localeCompare(b.name, 'nl')));
    setSessions(nextSessions.sort((a, b) => b.date.localeCompare(a.date) || b.finishedAt.localeCompare(a.finishedAt)));
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

  const exercises = useMemo(() => allExercises(own), [own]);

  return (
    <AppFrame appName="Kracht" appMark="▲" navigation={navigation} moduleLinks={links}>
      {loading ? (
        <LoadingState />
      ) : (
        <Routes>
          <Route path="/training" element={<WorkoutPage exercises={exercises} templates={templates} sessions={sessions} error={error} onSave={(session) => run((db) => db.put('sessions', session))} />} />
          <Route path="/schemas" element={<TemplatesPage templates={templates} exercises={exercises} error={error} onDelete={(id) => void run((db) => db.remove('templates', id))} />} />
          <Route path="/schemas/nieuw" element={<TemplateEditor templates={templates} exercises={exercises} error={error} onSave={(template) => run((db) => db.put('templates', template))} />} />
          <Route path="/schemas/:id" element={<TemplateEditor templates={templates} exercises={exercises} error={error} onSave={(template) => run((db) => db.put('templates', template))} />} />
          <Route
            path="/oefeningen"
            element={<ExercisesPage exercises={exercises} sessions={sessions} error={error} onSave={(exercise) => run((db) => db.put('exercises', exercise))} onDelete={(id) => void run((db) => db.remove('exercises', id))} />}
          />
          <Route path="/voortgang" element={<ProgressPage sessions={sessions} />} />
          <Route path="/geschiedenis" element={<HistoryPage sessions={sessions} error={error} onDelete={(id) => void run((db) => db.remove('sessions', id))} />} />
          <Route path="*" element={<OverviewPage templates={templates} sessions={sessions} error={error} />} />
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

function DarebeeLink({ link }: { link: string }) {
  return (
    <a className="text-link" href={link} target="_blank" rel="noopener noreferrer">
      {isDarebee(link) ? 'Open workout op Darebee ↗' : 'Open link ↗'}
    </a>
  );
}

function OverviewPage({ templates, sessions, error }: { templates: Template[]; sessions: Session[]; error: string }) {
  const navigate = useNavigate();
  const today = todayKey();
  const weeks = weeklySummary(sessions, today, 8);
  const thisWeek = weeks.at(-1)!;
  const records = personalRecords(sessions);
  const hasDraft = readDraft() !== null;

  return (
    <div className="stack">
      {error && <ErrorBanner message={error} />}
      <PageHeader
        eyebrow="Kracht"
        title="Krachttraining"
        description="Schema’s, sets en records. Alles blijft op dit apparaat."
        action={<Button onClick={() => navigate('/training')}>{hasDraft ? '▶ Verder met training' : '▶ Lege training'}</Button>}
      />
      <div className="grid grid-3">
        <Metric label="Deze week" value={`${sessionsThisWeek(sessions, today)}`} note={sessionsThisWeek(sessions, today) === 1 ? 'training' : 'trainingen'} />
        <Metric label="Volume deze week" value={`${nl(thisWeek.volume, 0)} kg`} note="herhalingen × gewicht" />
        <Metric label="Oefeningen met record" value={`${records.length}`} note="zie Voortgang" />
      </div>
      <div className="grid grid-2">
        <Card title="Start een schema">
          {templates.length ? (
            <div className="list">
              {templates.map((template) => (
                <div className="list-item" key={template.id}>
                  <div>
                    <p className="item-title">{template.name}</p>
                    <p className="item-subtitle">{template.items.length} oefeningen{template.link ? ' · ' : ''}{template.link && <DarebeeLink link={template.link} />}</p>
                  </div>
                  <Button variant="secondary" onClick={() => navigate(`/training?schema=${encodeURIComponent(template.id)}`)} aria-label={`Start ${template.name}`}>Start</Button>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="Nog geen schema’s">Maak een schema bij Schema’s, of begin met een lege training.</EmptyState>
          )}
        </Card>
        <Card title="Trainingen per week">
          <BarChart title="Aantal trainingen per week, laatste 8 weken" points={weeks.map((week) => ({ label: week.label, value: week.sessions }))} />
          <p className="widget-foot">Week begint op maandag.</p>
        </Card>
      </div>
      <Card title="Laatste trainingen">
        {sessions.length ? <SessionList sessions={sessions.slice(0, 5)} /> : <EmptyState title="Nog geen trainingen">Je eerste training verschijnt hier.</EmptyState>}
      </Card>
    </div>
  );
}

function SessionList({ sessions, onDelete }: { sessions: Session[]; onDelete?: (id: string) => void }) {
  return (
    <div className="list">
      {sessions.map((session) => (
        <div className="list-item" key={session.id}>
          <div>
            <p className="item-title">{session.name} · {formatDay(session.date)}</p>
            <p className="item-subtitle">
              {sessionMinutes(session)} min · {session.exercises.length} oefeningen · {nl(sessionVolume(session), 0)} kg volume
            </p>
            <p className="item-subtitle">{session.exercises.map((exercise) => `${exercise.name}: ${exercise.sets.map((set) => setSummary(exercise.kind, set)).join(', ')}`).join(' · ')}</p>
          </div>
          {onDelete && (
            <ConfirmAction label={`Training ${session.name} van ${session.date} verwijderen`} confirmMessage="Deze training verwijderen?" onConfirm={() => onDelete(session.id)}>
              Verwijderen
            </ConfirmAction>
          )}
        </div>
      ))}
    </div>
  );
}

/* ---------- Training ---------- */

function WorkoutPage({ exercises, templates, sessions, error, onSave }: { exercises: Exercise[]; templates: Template[]; sessions: Session[]; error: string; onSave: (session: Session) => Promise<boolean> }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [draft, setDraft] = useState<Draft | null>(() => readDraft());
  const [adding, setAdding] = useState('');
  const [formError, setFormError] = useState('');
  const [rest, setRest] = useState<{ until: number; name: string } | null>(null);
  const [now, setNow] = useState(Date.now());

  // Start vanuit een schema (?schema=…) als er nog geen training loopt.
  useEffect(() => {
    if (draft) return;
    const template = templates.find((item) => item.id === params.get('schema'));
    const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));
    const next: Draft = {
      startedAt: new Date().toISOString(),
      templateId: template?.id ?? null,
      name: template?.name ?? 'Vrije training',
      link: template?.link ?? null,
      exercises: template ? template.items.flatMap((item) => (byId.has(item.exerciseId) ? [draftExercise(byId.get(item.exerciseId)!, item, sessions)] : [])) : []
    };
    setDraft(next);
  }, [draft, params, templates, exercises, sessions]);

  useEffect(() => writeDraft(draft), [draft]);

  useEffect(() => {
    if (!rest) return;
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [rest]);

  if (!draft) return <LoadingState />;
  const current = draft;

  function update(change: (exercises: DraftExercise[]) => DraftExercise[]) {
    setDraft({ ...current, exercises: change(current.exercises) });
  }

  function updateSet(exerciseIndex: number, setIndex: number, patch: Partial<DraftSet>) {
    update((list) => list.map((exercise, i) => (i === exerciseIndex ? { ...exercise, sets: exercise.sets.map((set, j) => (j === setIndex ? { ...set, ...patch } : set)) } : exercise)));
  }

  function toggleDone(exerciseIndex: number, setIndex: number) {
    const exercise = current.exercises[exerciseIndex]!;
    const done = !exercise.sets[setIndex]!.done;
    updateSet(exerciseIndex, setIndex, { done });
    if (done && exercise.restSeconds > 0) {
      setNow(Date.now());
      setRest({ until: Date.now() + exercise.restSeconds * 1000, name: exercise.name });
    }
  }

  function addExercise() {
    const exercise = exercises.find((item) => item.id === adding);
    if (!exercise) return;
    update((list) => [...list, draftExercise(exercise, null, sessions)]);
    setAdding('');
  }

  async function finish() {
    setFormError('');
    try {
      const session = draftToSession(current, newId(), todayKey(), new Date().toISOString());
      validateSession(session, todayKey());
      const records = newRecords(session, sessions);
      if (await onSave(session)) {
        writeDraft(null);
        navigate(records.length ? `/voortgang?records=${encodeURIComponent(records.join(', '))}` : '/geschiedenis');
      }
    } catch (cause) {
      setFormError(message(cause, 'De training bevat ongeldige gegevens.'));
    }
  }

  function discard() {
    writeDraft(null);
    navigate('/');
  }

  const remaining = rest ? Math.max(0, Math.ceil((rest.until - now) / 1000)) : 0;

  return (
    <div className="stack">
      {error && <ErrorBanner message={error} />}
      <PageHeader eyebrow="Training" title={current.name} description={`Gestart om ${new Date(current.startedAt).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}. Vink gedane sets af; alleen die worden opgeslagen.`} />
      {params.get('schema') && params.get('schema') !== current.templateId && (
        <p className="notice" role="status">Je hebt nog een training lopen. Sla die eerst op of gooi hem weg om een ander schema te starten.</p>
      )}
      {current.link && <p><DarebeeLink link={current.link} /></p>}
      {rest && remaining > 0 && (
        <p className="notice rest-timer" role="status">
          Rust na {rest.name}: {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}{' '}
          <button type="button" className="text-button" onClick={() => setRest(null)}>Overslaan</button>
        </p>
      )}
      {current.exercises.length === 0 && <EmptyState title="Nog geen oefeningen">Voeg hieronder een oefening toe.</EmptyState>}
      {current.exercises.map((exercise, exerciseIndex) => (
        <Card key={`${exercise.exerciseId}-${exerciseIndex}`} title={exercise.name}>
          <p className="item-subtitle">{kindLabels[exercise.kind]}{exercise.restSeconds ? ` · ${exercise.restSeconds} s rust` : ''}</p>
          <div className="set-table" role="group" aria-label={`Sets ${exercise.name}`}>
            {exercise.sets.map((set, setIndex) => (
              <div className={`set-row${set.done ? ' is-done' : ''}`} key={setIndex}>
                <span className="set-number">{setIndex + 1}</span>
                {exercise.kind === 'tijd' ? (
                  <label className="set-input">
                    <span>sec</span>
                    <input type="text" inputMode="numeric" aria-label={`${exercise.name} set ${setIndex + 1} seconden`} value={set.seconds} onChange={(event) => updateSet(exerciseIndex, setIndex, { seconds: event.target.value })} />
                  </label>
                ) : (
                  <label className="set-input">
                    <span>herh.</span>
                    <input type="text" inputMode="numeric" aria-label={`${exercise.name} set ${setIndex + 1} herhalingen`} value={set.reps} onChange={(event) => updateSet(exerciseIndex, setIndex, { reps: event.target.value })} />
                  </label>
                )}
                <label className="set-input">
                  <span>{exercise.kind === 'gewicht' ? 'kg' : '+kg'}</span>
                  <input type="text" inputMode="decimal" aria-label={`${exercise.name} set ${setIndex + 1} gewicht`} value={set.weight} onChange={(event) => updateSet(exerciseIndex, setIndex, { weight: event.target.value })} />
                </label>
                <button type="button" className="chip chip-toggle" aria-pressed={set.done} aria-label={`${exercise.name} set ${setIndex + 1} gedaan`} onClick={() => toggleDone(exerciseIndex, setIndex)}>
                  ✓
                </button>
              </div>
            ))}
          </div>
          <div className="row add-row">
            <Button type="button" variant="secondary" onClick={() => update((list) => list.map((item, i) => (i === exerciseIndex ? { ...item, sets: [...item.sets, { ...(item.sets.at(-1) ?? { reps: '10', weight: '', seconds: '30' }), done: false }] } : item)))}>
              ＋ Set
            </Button>
            {exercise.sets.length > 1 && (
              <Button type="button" variant="secondary" onClick={() => update((list) => list.map((item, i) => (i === exerciseIndex ? { ...item, sets: item.sets.slice(0, -1) } : item)))}>
                − Set
              </Button>
            )}
            <button type="button" className="text-button" onClick={() => update((list) => list.filter((_, i) => i !== exerciseIndex))}>Oefening weghalen</button>
          </div>
        </Card>
      ))}
      <Card title="Oefening toevoegen">
        <div className="row add-row">
          <select aria-label="Oefening kiezen" value={adding} onChange={(event) => setAdding(event.target.value)}>
            <option value="">Kies een oefening…</option>
            {exercises.map((exercise) => <option key={exercise.id} value={exercise.id}>{exercise.name}</option>)}
          </select>
          <Button type="button" variant="secondary" disabled={!adding} onClick={addExercise}>Toevoegen</Button>
        </div>
      </Card>
      {formError && <ErrorBanner message={formError} />}
      <div className="form-actions">
        <ConfirmAction label="Training weggooien" confirmMessage="Deze training weggooien zonder op te slaan?" onConfirm={discard}>Weggooien</ConfirmAction>
        <Button type="button" onClick={() => void finish()}>Training opslaan</Button>
      </div>
    </div>
  );
}

/* ---------- Schema's ---------- */

function TemplatesPage({ templates, exercises, error, onDelete }: { templates: Template[]; exercises: Exercise[]; error: string; onDelete: (id: string) => void }) {
  const navigate = useNavigate();
  const names = new Map(exercises.map((exercise) => [exercise.id, exercise.name]));
  return (
    <div className="stack">
      {error && <ErrorBanner message={error} />}
      <PageHeader eyebrow="Kracht" title="Schema’s" description="Vaste trainingen met sets, doelen en rust. Een link naar bijvoorbeeld een Darebee-workout kan erbij." action={<Button onClick={() => navigate('/schemas/nieuw')}>＋ Nieuw schema</Button>} />
      <Card>
        {templates.length ? (
          <div className="list">
            {templates.map((template) => (
              <div className="list-item" key={template.id}>
                <div>
                  <p className="item-title">{template.name}</p>
                  <p className="item-subtitle">{template.items.map((item) => `${names.get(item.exerciseId) ?? 'Onbekende oefening'} ${item.sets}×${item.target}`).join(' · ') || 'Nog geen oefeningen'}</p>
                  {template.link && <p className="item-subtitle"><DarebeeLink link={template.link} /></p>}
                </div>
                <div className="row">
                  <Button variant="secondary" onClick={() => navigate(`/training?schema=${encodeURIComponent(template.id)}`)} aria-label={`Start ${template.name}`}>Start</Button>
                  <Button variant="secondary" onClick={() => navigate(`/schemas/${encodeURIComponent(template.id)}`)} aria-label={`Wijzig ${template.name}`}>Wijzig</Button>
                  <ConfirmAction label={`${template.name} verwijderen`} confirmMessage="Dit schema verwijderen? Eerdere trainingen blijven bewaard." onConfirm={() => onDelete(template.id)}>Verwijderen</ConfirmAction>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="Nog geen schema’s">Maak je eerste schema, bijvoorbeeld een volledige-lichaamstraining.</EmptyState>
        )}
      </Card>
      <p className="item-subtitle">
        Darebee-workouts worden alleen gelinkt, niet overgenomen: je opent ze op <a href="https://darebee.com/" target="_blank" rel="noopener noreferrer">darebee.com</a>.
      </p>
    </div>
  );
}

interface ItemText {
  exerciseId: string;
  sets: string;
  target: string;
  rest: string;
}

function TemplateEditor({ templates, exercises, error, onSave }: { templates: Template[]; exercises: Exercise[]; error: string; onSave: (template: Template) => Promise<boolean> }) {
  const navigate = useNavigate();
  const { id } = useParams();
  const existing = templates.find((template) => template.id === id) ?? null;
  const [name, setName] = useState(existing?.name ?? '');
  const [link, setLink] = useState(existing?.link ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [items, setItems] = useState<ItemText[]>(() => existing?.items.map((item) => ({ exerciseId: item.exerciseId, sets: String(item.sets), target: String(item.target), rest: String(item.restSeconds) })) ?? []);
  const [adding, setAdding] = useState('');
  const [formError, setFormError] = useState('');
  const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));

  if (id && !existing) return <EmptyState title="Schema niet gevonden">Ga terug naar Schema’s.</EmptyState>;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError('');
    try {
      const template: Template = {
        id: existing?.id ?? newId(),
        name: name.trim(),
        items: items.map((item) => ({ exerciseId: item.exerciseId, sets: Number(item.sets), target: Number(item.target), restSeconds: Number(item.rest || 0) })),
        link: cleanLink(link),
        notes: notes.trim(),
        updatedAt: new Date().toISOString()
      };
      validateTemplate(template);
      if (await onSave(template)) navigate('/schemas');
    } catch (cause) {
      setFormError(message(cause, 'Het schema bevat ongeldige gegevens.'));
    }
  }

  return (
    <div className="stack">
      {error && <ErrorBanner message={error} />}
      <PageHeader eyebrow="Schema’s" title={existing ? 'Schema wijzigen' : 'Nieuw schema'} />
      <form className="stack" onSubmit={(event) => void submit(event)} noValidate>
        <Card>
          <div className="form-grid">
            <Field label="Naam"><input type="text" maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder="Bijvoorbeeld: Volledig lichaam A" /></Field>
            <Field label="Link (optioneel)" hint="Bijvoorbeeld een workout op darebee.com. Alleen https.">
              <input type="url" inputMode="url" value={link} onChange={(event) => setLink(event.target.value)} placeholder="https://darebee.com/workouts/…" />
            </Field>
          </div>
          <Field label="Notities (optioneel)"><textarea maxLength={1000} rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} /></Field>
        </Card>
        <Card title="Oefeningen">
          {items.length === 0 && <p className="item-subtitle">Voeg oefeningen toe. Doel = herhalingen per set, of seconden bij tijd-oefeningen.</p>}
          <div className="list">
            {items.map((item, index) => {
              const exercise = byId.get(item.exerciseId);
              const set = (patch: Partial<ItemText>) => setItems((list) => list.map((current, i) => (i === index ? { ...current, ...patch } : current)));
              return (
                <div className="template-item" key={`${item.exerciseId}-${index}`}>
                  <p className="item-title">{exercise?.name ?? 'Onbekende oefening'}</p>
                  <div className="template-fields">
                    <label className="set-input"><span>sets</span><input type="text" inputMode="numeric" aria-label={`${exercise?.name ?? 'Oefening'} sets`} value={item.sets} onChange={(event) => set({ sets: event.target.value })} /></label>
                    <label className="set-input"><span>{exercise?.kind === 'tijd' ? 'sec' : 'herh.'}</span><input type="text" inputMode="numeric" aria-label={`${exercise?.name ?? 'Oefening'} doel`} value={item.target} onChange={(event) => set({ target: event.target.value })} /></label>
                    <label className="set-input"><span>rust (s)</span><input type="text" inputMode="numeric" aria-label={`${exercise?.name ?? 'Oefening'} rust`} value={item.rest} onChange={(event) => set({ rest: event.target.value })} /></label>
                    <button type="button" className="text-button" onClick={() => setItems((list) => list.filter((_, i) => i !== index))}>Weghalen</button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="row add-row" style={{ marginTop: 12 }}>
            <select aria-label="Oefening kiezen" value={adding} onChange={(event) => setAdding(event.target.value)}>
              <option value="">Kies een oefening…</option>
              {exercises.map((exercise) => <option key={exercise.id} value={exercise.id}>{exercise.name}</option>)}
            </select>
            <Button
              type="button"
              variant="secondary"
              disabled={!adding}
              onClick={() => {
                const kind = byId.get(adding)?.kind;
                setItems((list) => [...list, { exerciseId: adding, sets: '3', target: kind === 'tijd' ? '30' : '10', rest: '90' }]);
                setAdding('');
              }}
            >
              Toevoegen
            </Button>
          </div>
        </Card>
        {formError && <ErrorBanner message={formError} />}
        <div className="form-actions">
          <Button type="button" variant="secondary" onClick={() => navigate('/schemas')}>Annuleren</Button>
          <Button type="submit">Schema opslaan</Button>
        </div>
      </form>
    </div>
  );
}

/* ---------- Oefeningen ---------- */

function ExerciseFields({ category, equipment, kind, onChange }: { category: Category; equipment: Equipment; kind: Kind; onChange: (patch: { category?: Category; equipment?: Equipment; kind?: Kind }) => void }) {
  return (
    <>
      <Field label="Spiergroep">
        <select value={category} onChange={(event) => onChange({ category: event.target.value as Category })}>{CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}</select>
      </Field>
      <Field label="Materiaal">
        <select value={equipment} onChange={(event) => onChange({ equipment: event.target.value as Equipment })}>{EQUIPMENT.map((item) => <option key={item} value={item}>{item}</option>)}</select>
      </Field>
      <Field label="Meten in">
        <select value={kind} onChange={(event) => onChange({ kind: event.target.value as Kind })}>{KINDS.map((item) => <option key={item} value={item}>{kindLabels[item]}</option>)}</select>
      </Field>
    </>
  );
}

function ExercisesPage({ exercises, sessions, error, onSave, onDelete }: { exercises: Exercise[]; sessions: Session[]; error: string; onSave: (exercise: Exercise) => Promise<boolean>; onDelete: (id: string) => void }) {
  const [filter, setFilter] = useState<Category | 'alle'>('alle');
  const [mode, setMode] = useState<'wger' | 'eigen'>('wger');
  const used = new Set(sessions.flatMap((session) => session.exercises.map((exercise) => exercise.exerciseId)));
  const shown = exercises.filter((exercise) => filter === 'alle' || exercise.category === filter);

  return (
    <div className="stack">
      {error && <ErrorBanner message={error} />}
      <PageHeader eyebrow="Kracht" title="Oefeningen" description={`${exercises.length} oefeningen: een ingebouwde basislijst, aangevuld met je eigen oefeningen en oefeningen uit wger.`} />
      <Card title="Oefening toevoegen">
        <div className="chip-row" role="group" aria-label="Manier van toevoegen">
          <button type="button" className="chip chip-toggle" aria-pressed={mode === 'wger'} onClick={() => setMode('wger')}>Zoeken in wger</button>
          <button type="button" className="chip chip-toggle" aria-pressed={mode === 'eigen'} onClick={() => setMode('eigen')}>Zelf invoeren</button>
        </div>
        <div style={{ marginTop: 16 }}>{mode === 'wger' ? <WgerPanel known={new Set(exercises.map((exercise) => exercise.id))} onSave={onSave} /> : <OwnExerciseForm onSave={onSave} />}</div>
      </Card>
      <Card title="Alle oefeningen">
        <div className="chip-row" role="group" aria-label="Filter op spiergroep">
          {(['alle', ...CATEGORIES] as const).map((item) => (
            <button key={item} type="button" className="chip chip-toggle" aria-pressed={filter === item} onClick={() => setFilter(item)}>{item}</button>
          ))}
        </div>
        <div className="list" style={{ marginTop: 12 }}>
          {shown.map((exercise) => (
            <div className="list-item" key={exercise.id}>
              <div>
                <p className="item-title">{exercise.name}</p>
                <p className="item-subtitle">{exercise.category} · {exercise.equipment} · {kindLabels[exercise.kind]}</p>
                {exercise.wger && (
                  <p className="item-subtitle">
                    Bron: <a href={`https://wger.de/exercise/${exercise.wger.id}/view/`} target="_blank" rel="noopener noreferrer">wger</a> · {exercise.wger.author} ·{' '}
                    <a href={exercise.wger.licenseUrl} target="_blank" rel="noopener noreferrer">{exercise.wger.license}</a>
                  </p>
                )}
              </div>
              <div className="row">
                <StatusPill>{exercise.source === 'basis' ? 'Basis' : exercise.source === 'wger' ? 'wger' : 'Eigen'}</StatusPill>
                {exercise.source !== 'basis' && !used.has(exercise.id) && (
                  <ConfirmAction label={`${exercise.name} verwijderen`} confirmMessage="Deze oefening verwijderen?" onConfirm={() => onDelete(exercise.id)}>Verwijderen</ConfirmAction>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function WgerPanel({ known, onSave }: { known: Set<string>; onSave: (exercise: Exercise) => Promise<boolean> }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<WgerExercise[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [chosen, setChosen] = useState<WgerExercise | null>(null);
  const [fields, setFields] = useState<{ category: Category; equipment: Equipment; kind: Kind }>({ category: 'overig', equipment: 'overig', kind: 'gewicht' });

  async function search(event: FormEvent) {
    event.preventDefault();
    setNote('');
    setChosen(null);
    setBusy(true);
    try {
      setResults(await searchWger(query));
    } catch (cause) {
      setResults(null);
      setNote(message(cause, 'Zoeken is mislukt.'));
    } finally {
      setBusy(false);
    }
  }

  async function adopt() {
    if (!chosen) return;
    try {
      const exercise = exerciseFromWger(chosen, fields.category, fields.equipment, fields.kind);
      validateExercise(exercise);
      if (await onSave(exercise)) {
        setNote(`${exercise.name} is toegevoegd.`);
        setChosen(null);
      }
    } catch (cause) {
      setNote(message(cause, 'Overnemen is mislukt.'));
    }
  }

  return (
    <div className="stack">
      <form className="stack" onSubmit={(event) => void search(event)}>
        <Field label="Zoek in wger" hint="Meestal Engelse namen, bijvoorbeeld 'row' of 'curl'. Zoeken gebeurt pas als je op Zoeken drukt.">
          <input type="search" value={query} maxLength={60} onChange={(event) => setQuery(event.target.value)} />
        </Field>
        <Button type="submit" disabled={busy}>{busy ? 'Zoeken…' : 'Zoeken'}</Button>
      </form>
      {note && <p className="item-subtitle" role="status">{note}</p>}
      {chosen ? (
        <div className="stack">
          <p className="item-title">{chosen.nameNl ?? chosen.name}</p>
          <p className="item-subtitle">{chosen.author} · <a href={chosen.licenseUrl} target="_blank" rel="noopener noreferrer">{chosen.license}</a></p>
          <div className="form-grid"><ExerciseFields {...fields} onChange={(patch) => setFields((current) => ({ ...current, ...patch }))} /></div>
          <div className="form-actions">
            <Button type="button" variant="secondary" onClick={() => setChosen(null)}>Terug</Button>
            <Button type="button" onClick={() => void adopt()}>Overnemen</Button>
          </div>
        </div>
      ) : (
        results &&
        (results.length ? (
          <div className="list">
            {results.map((item) => (
              <div className="list-item" key={item.id}>
                <div>
                  <p className="item-title">{item.nameNl ?? item.name}</p>
                  <p className="item-subtitle">{item.nameNl ? `${item.name} · ` : ''}{item.author} · {item.license}</p>
                </div>
                {known.has(`wger:${item.id}`) ? <StatusPill tone="good">Al toegevoegd</StatusPill> : <Button variant="secondary" onClick={() => setChosen(item)} aria-label={`Kies ${item.nameNl ?? item.name}`}>Kies</Button>}
              </div>
            ))}
          </div>
        ) : (
          <p className="item-subtitle">Niets gevonden in wger. Probeer een Engelse naam of voer de oefening zelf in.</p>
        ))
      )}
      <p className="item-subtitle">
        Oefeningen uit <a href="https://wger.de/" target="_blank" rel="noopener noreferrer">wger</a> hebben elk een eigen Creative Commons-licentie; naam, auteur en licentie worden bewaard en getoond. Alleen je zoekterm gaat via de eigen server van deze app naar wger.
      </p>
    </div>
  );
}

function OwnExerciseForm({ onSave }: { onSave: (exercise: Exercise) => Promise<boolean> }) {
  const [name, setName] = useState('');
  const [fields, setFields] = useState<{ category: Category; equipment: Equipment; kind: Kind }>({ category: 'overig', equipment: 'lichaamsgewicht', kind: 'gewicht' });
  const [formError, setFormError] = useState('');
  const [saved, setSaved] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError('');
    setSaved('');
    try {
      const exercise: Exercise = { id: `eigen:${newId()}`, name: name.trim(), ...fields, source: 'eigen', wger: null };
      validateExercise(exercise);
      if (await onSave(exercise)) {
        setSaved(`${exercise.name} is toegevoegd.`);
        setName('');
      }
    } catch (cause) {
      setFormError(message(cause, 'De oefening bevat ongeldige gegevens.'));
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} noValidate>
      <div className="form-grid">
        <Field label="Naam"><input type="text" maxLength={100} value={name} onChange={(event) => setName(event.target.value)} /></Field>
        <ExerciseFields {...fields} onChange={(patch) => setFields((current) => ({ ...current, ...patch }))} />
      </div>
      {formError && <ErrorBanner message={formError} />}
      {saved && <p role="status"><StatusPill tone="good">{saved}</StatusPill></p>}
      <div className="form-actions"><Button type="submit">Oefening opslaan</Button></div>
    </form>
  );
}

/* ---------- Voortgang en geschiedenis ---------- */

function ProgressPage({ sessions }: { sessions: Session[] }) {
  const [params] = useSearchParams();
  const records = personalRecords(sessions);
  const [selected, setSelected] = useState(records[0]?.exerciseId ?? '');
  const record = records.find((item) => item.exerciseId === selected) ?? records[0];
  const points = record ? progression(sessions, record.exerciseId) : [];
  const fresh = params.get('records');

  return (
    <div className="stack">
      {fresh && <p className="notice" role="status">Nieuw record: {fresh}. Goed bezig!</p>}
      <PageHeader eyebrow="Kracht" title="Voortgang" description="Bij gewicht-oefeningen is de lijn je geschatte maximum voor één herhaling (Epley, alleen uit sets van 1–12 herhalingen)." />
      {record ? (
        <>
          <Card title="Per oefening">
            <Field label="Oefening">
              <select value={record.exerciseId} onChange={(event) => setSelected(event.target.value)}>
                {records.map((item) => <option key={item.exerciseId} value={item.exerciseId}>{item.name}</option>)}
              </select>
            </Field>
            {points.length > 1 ? (
              <LineChart title={`Voortgang ${record.name}`} points={points.map(({ label, value }) => ({ label, value }))} unit={record.kind === 'tijd' ? 's' : record.kind === 'gewicht' ? 'kg' : ''} />
            ) : (
              <p className="item-subtitle">Na twee trainingen met deze oefening zie je hier een lijn.</p>
            )}
          </Card>
          <Card title="Persoonlijke records">
            <div className="list">
              {records.map((item) => (
                <div className="list-item" key={item.exerciseId}>
                  <div>
                    <p className="item-title">{item.name}</p>
                    <p className="item-subtitle">
                      Beste: {recordText(item.kind, item.best)} op {formatDay(item.bestDate)}
                      {item.oneRepMax !== null ? ` · geschat 1RM ${nl(item.oneRepMax)} kg` : ''}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </>
      ) : (
        <EmptyState title="Nog geen gegevens">Sla een training op om je voortgang te zien.</EmptyState>
      )}
      <p className="item-subtitle">Schattingen, geen medisch of trainingsadvies. Bouw zwaarte geleidelijk op.</p>
    </div>
  );
}

function HistoryPage({ sessions, error, onDelete }: { sessions: Session[]; error: string; onDelete: (id: string) => void }) {
  return (
    <div className="stack">
      {error && <ErrorBanner message={error} />}
      <PageHeader eyebrow="Kracht" title="Geschiedenis" description="Al je opgeslagen trainingen, nieuwste eerst." />
      <Card>{sessions.length ? <SessionList sessions={sessions} onDelete={onDelete} /> : <EmptyState title="Nog geen trainingen">Start een training via Overzicht of Training.</EmptyState>}</Card>
    </div>
  );
}
