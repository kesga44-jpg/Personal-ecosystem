import { useEffect, useState, type FormEvent } from 'react';
import { Button, Card, ConfirmAction, EmptyState, ErrorBanner, Field, PageHeader, StatusPill } from '@ecosystem/ui';
import {
  ASTHMA_STATUSES,
  CARDIO_FOCUSES,
  DISCIPLINES,
  JUMP_FOCUSES,
  LEVELS,
  PERIODIZATIONS,
  RECOVERY_OPTIONS,
  RUNNING_FOCUSES,
  SESSION_SYMPTOMS,
  STRENGTH_GOALS,
  STRENGTH_SPLITS,
  SYMPTOM_CONTROLS,
  WEEKDAYS,
  asthmaLabels,
  currentProgramWeek,
  disciplineLabels,
  emptyProfile,
  evaluateProgram,
  feedbackLogs,
  generateProgram,
  levelLabels,
  makeId,
  normalizeProfile,
  periodizationLabel,
  plannedSessionsForWeek,
  programStartDate,
  proposeAdjustment,
  symptomControlLabels,
  symptomLabels,
  type Analysis,
  type CoachFeedback,
  type CoachLog,
  type CoachProfile,
  type CoachRecord,
  type CoachRequest,
  type Program,
  type ProgramStatus,
  type Recovery,
  type SessionSymptom
} from './coach';
import type { PlannedSession } from './planning';

const statusLabels: Record<ProgramStatus, string> = { draft: 'Concept', active: 'Actief', completed: 'Afgerond', replaced: 'Vervangen' };
const strengthGoalLabels: Record<(typeof STRENGTH_GOALS)[number], string> = { hypertrophy: 'Spieropbouw', 'max-strength': 'Maximale kracht', endurance: 'Krachtuithoudingsvermogen' };
const strengthSplitLabels: Record<(typeof STRENGTH_SPLITS)[number], string> = { 'full-body': 'Full body', 'upper-lower': 'Boven-/onderlichaam', 'push-pull-legs': 'Push / pull / legs' };
const runningFocusLabels: Record<(typeof RUNNING_FOCUSES)[number], string> = { balanced: 'Gebalanceerd', easy: 'Alleen rustig', interval: 'Intervallen', tempo: 'Tempo', 'heart-rate': 'Op eigen hartslagzones' };
const cardioFocusLabels: Record<(typeof CARDIO_FOCUSES)[number], string> = { aerobic: 'Aerobe basis', interval: 'Gecontroleerde intervallen', hiit: 'HIIT (alleen gevorderd/ervaren)', combined: 'Kracht + conditie' };
const jumpFocusLabels: Record<(typeof JUMP_FOCUSES)[number], string> = { landing: 'Landingstechniek', vertical: 'Verticaal', horizontal: 'Horizontaal', reactive: 'Reactief' };
const recoveryLabels: Record<Recovery, string> = { goed: 'Goed', matig: 'Matig', slecht: 'Slecht' };

function localDay(value: Date = new Date()): string {
  return new Date(value.getTime() - value.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function shortDay(day: string): string {
  return new Intl.DateTimeFormat('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(`${day}T12:00:00`));
}

const list = (value: string) => value.split(',').map((item) => item.trim()).filter(Boolean);

export interface CoachPageProps {
  records: CoachRecord[];
  /** Vastgelegde trainingen uit Sport, Kracht en Duur, als basis voor de belasting. */
  logs: CoachLog[];
  onSave: (record: CoachRecord) => Promise<boolean>;
  onSaveMany: (records: CoachRecord[]) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
  onPlan: (plans: PlannedSession[]) => Promise<boolean>;
  error: string;
}

export function CoachPage({ records, logs, onSave, onSaveMany, onDelete, onPlan, error }: CoachPageProps) {
  const today = localDay();
  const savedProfile = records.find((record) => record.kind === 'profile');
  const profile = savedProfile?.kind === 'profile' ? normalizeProfile(savedProfile.profile) : null;
  const programs = records.flatMap((record) => (record.kind === 'program' ? [record.program] : [])).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const feedback = records.flatMap((record) => (record.kind === 'feedback' ? [record] : []));
  const allLogs = [...logs, ...feedbackLogs(feedback)];
  const [blocked, setBlocked] = useState<Analysis | null>(null);
  const [message, setMessage] = useState('');

  async function createProgram(request: CoachRequest) {
    setMessage('');
    if (!profile) return;
    const result = generateProgram(profile, request, allLogs);
    if (!result.ok) {
      setBlocked(result.analysis);
      return;
    }
    setBlocked(null);
    if (await onSave({ id: result.program.id, kind: 'program', program: result.program })) setMessage('Concept opgeslagen. Bekijk het hieronder en bevestig het als het past.');
  }

  async function confirm(program: Program) {
    const updates: CoachRecord[] = [{ id: program.id, kind: 'program', program: { ...program, status: 'active', startDate: programStartDate(today) } }];
    const previous = programs.find((item) => item.id === program.previousProgramId && item.status === 'active');
    if (previous) updates.push({ id: previous.id, kind: 'program', program: { ...previous, status: 'replaced' } });
    if (await onSaveMany(updates)) setMessage(previous ? 'Programma bevestigd; het vorige programma is vervangen.' : 'Programma bevestigd.');
  }

  async function plan(program: Program, week: number) {
    const plans = plannedSessionsForWeek(program, week, today);
    if (!plans.length) {
      setMessage(`Week ${week} heeft geen sessies meer vanaf vandaag om in te plannen.`);
      return;
    }
    if (await onPlan(plans)) setMessage(`${plans.length} ${plans.length === 1 ? 'sessie' : 'sessies'} van week ${week} staan in Planning.`);
  }

  return (
    <div className="stack">
      {error && <ErrorBanner message={error} />}
      <PageHeader eyebrow="Regelgebaseerd" title="Coach" description="Een trainingsvoorstel op basis van je profiel en je vastgelegde trainingen. Geen medisch advies: de coach stelt geen diagnose en maakt geen voorstel als er aandachtspunten of ernstige klachten zijn." />
      {message && <p role="status"><StatusPill tone="good">{message}</StatusPill></p>}
      <ProfileCard profile={profile} onSave={(next) => onSave({ id: 'coach-profile', kind: 'profile', profile: next })} />
      {profile ? (
        <RequestCard onCreate={createProgram} blocked={blocked} />
      ) : (
        <Card title="Nieuw programma">
          <EmptyState title="Eerst je sportprofiel">Vul hierboven je sportprofiel in; daarna kun je een programma laten voorstellen.</EmptyState>
        </Card>
      )}
      <Card title="Programma's">
        {programs.length === 0 ? (
          <EmptyState title="Nog geen programma's">Een voorstel verschijnt hier als concept. Pas na bevestigen wordt het actief.</EmptyState>
        ) : (
          <div className="stack">
            {programs.map((program) => (
              <ProgramCard
                key={program.id}
                program={program}
                today={today}
                feedback={feedback.filter((item) => item.programId === program.id)}
                onConfirm={() => void confirm(program)}
                onComplete={() => void onSave({ id: program.id, kind: 'program', program: { ...program, status: 'completed' } })}
                onDelete={() => void onDelete(program.id)}
                onPlan={(week) => void plan(program, week)}
                onFeedback={(item) => onSave(item)}
                onAdjust={async () => {
                  const evaluation = evaluateProgram(program, feedbackLogs(feedback));
                  const draft = proposeAdjustment(program, evaluation);
                  if (await onSave({ id: draft.id, kind: 'program', program: draft })) setMessage('Voorstel voor aanpassing opgeslagen als nieuw concept. Het huidige programma is niet gewijzigd.');
                }}
              />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function ProfileCard({ profile, onSave }: { profile: CoachProfile | null; onSave: (profile: CoachProfile) => Promise<boolean> }) {
  const [draft, setDraft] = useState<CoachProfile>(profile ?? emptyProfile());
  const [open, setOpen] = useState(!profile);
  const [saved, setSaved] = useState(false);
  // Alleen opnieuw vullen als het opgeslagen profiel zelf verandert (niet bij elke render).
  const profileKey = profile ? JSON.stringify(profile) : '';
  useEffect(() => {
    if (profileKey) setDraft(JSON.parse(profileKey) as CoachProfile);
  }, [profileKey]);

  const text = (key: keyof CoachProfile) => ({ value: String(draft[key] ?? ''), onChange: (event: { target: { value: string } }) => setDraft({ ...draft, [key]: event.target.value }) });
  const num = (key: keyof CoachProfile) => ({ type: 'number', min: 0, value: String(draft[key] || ''), onChange: (event: { target: { value: string } }) => setDraft({ ...draft, [key]: Number(event.target.value) || 0 }) });
  const health = (key: keyof CoachProfile['health']) => ({ value: String(draft.health[key] ?? ''), onChange: (event: { target: { value: string } }) => setDraft({ ...draft, health: { ...draft.health, [key]: event.target.value } }) });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaved(false);
    if (await onSave(normalizeProfile(draft))) {
      setSaved(true);
      setOpen(false);
    }
  }

  return (
    <Card title="Sportprofiel" action={profile ? <Button variant="secondary" type="button" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? 'Sluiten' : 'Bewerken'}</Button> : undefined}>
      {saved && !open && <p role="status"><StatusPill tone="good">Profiel opgeslagen</StatusPill></p>}
      {profile && !open && (
        <p className="item-subtitle">
          {levelLabels[profile.level]} · {profile.availableWeeklyMinutes} min per week beschikbaar{profile.availableDays.length ? ` · ${profile.availableDays.join(', ')}` : ''}
        </p>
      )}
      {open && (
        <form onSubmit={(event) => void submit(event)} noValidate>
          <div className="form-grid">
            <Field label="Niveau">
              <select value={draft.level} onChange={(event) => setDraft({ ...draft, level: event.target.value as CoachProfile['level'] })}>
                {LEVELS.map((level) => <option key={level} value={level}>{levelLabels[level]}</option>)}
              </select>
            </Field>
            <Field label="Huidige activiteit" hint="Bijv. wandelt dagelijks, loopt 2× per week 5 km"><input maxLength={300} {...text('currentActivity')} /></Field>
            <Field label="Beschikbare minuten per week"><input {...num('availableWeeklyMinutes')} /></Field>
            <Field label="Huidige trainingsminuten per week" hint="Wordt gebruikt als er geen recente trainingen zijn vastgelegd"><input {...num('currentWeeklyMinutes')} /></Field>
            <Field label="Maximaal minuten per sessie" hint="Leeg = geen maximum"><input {...num('minutesPerSession')} /></Field>
            <Field label="Jaren trainingservaring"><input {...num('trainingYears')} /></Field>
          </div>
          <fieldset className="day-picker">
            <legend>Trainingsdagen (optioneel)</legend>
            {WEEKDAYS.map((day) => (
              <label key={day} className="check-row">
                <input
                  type="checkbox"
                  checked={draft.availableDays.includes(day)}
                  onChange={(event) => setDraft({ ...draft, availableDays: event.target.checked ? WEEKDAYS.filter((item) => item === day || draft.availableDays.includes(item)) : draft.availableDays.filter((item) => item !== day) })}
                />
                {day}
              </label>
            ))}
          </fieldset>
          <div className="form-grid">
            <Field label="Voorkeuren"><input maxLength={300} {...text('preferences')} /></Field>
            <Field label="Herstelbehoefte"><input maxLength={300} {...text('recoveryNeeds')} /></Field>
            <Field label="Beschikbaar materiaal"><input maxLength={300} {...text('availableEquipment')} /></Field>
            <Field label="Oefeningen vermijden" hint="Komma-gescheiden"><input value={draft.avoidedExercises.join(', ')} onChange={(event) => setDraft({ ...draft, avoidedExercises: list(event.target.value) })} /></Field>
            <Field label="Fysieke aandachtspunten" hint="Als je hier iets invult, maakt de coach geen voorstel: laat de belasting dan eerst beoordelen door een professional."><textarea maxLength={1000} {...text('limitations')} /></Field>
          </div>
          <h3 className="form-section-title">Hardlopen (optioneel)</h3>
          <div className="form-grid">
            <Field label="Kilometers per week"><input step="0.1" {...num('runningCurrentKm')} /></Field>
            <Field label="Langste recente loop (km)"><input step="0.1" {...num('runningLongestRunKm')} /></Field>
            <Field label="Looptrainingen per week"><input {...num('runningSessionsPerWeek')} /></Field>
            <Field label="Tempo" hint="Bijv. 6:30 min/km"><input maxLength={50} {...text('runningPace')} /></Field>
            <Field label="Eigen hartslagzones" hint="Alleen als ze betrouwbaar zijn vastgesteld; de coach berekent geen zones"><input maxLength={200} {...text('heartRate')} /></Field>
          </div>
          <h3 className="form-section-title">Gezondheid (optioneel, blijft op dit apparaat)</h3>
          <p className="item-subtitle">De coach gebruikt dit alleen om voorstellen rustiger te maken of om te verwijzen naar je arts/behandelaar. Er wordt niets gedeeld of verstuurd.</p>
          <div className="form-grid">
            <Field label="Astma">
              <select {...health('asthmaStatus')}>
                {ASTHMA_STATUSES.map((status) => <option key={status} value={status}>{asthmaLabels[status]}</option>)}
              </select>
            </Field>
            <Field label="Klachten onder controle?">
              <select {...health('symptomControl')}>
                {SYMPTOM_CONTROLS.map((status) => <option key={status} value={status}>{symptomControlLabels[status]}</option>)}
              </select>
            </Field>
            <Field label="Klachten tijdens inspanning"><input maxLength={500} {...health('symptomsDuringExercise')} /></Field>
            <Field label="Klachten na inspanning"><input maxLength={500} {...health('symptomsAfterExercise')} /></Field>
            <Field label="Inspanningstriggers"><input maxLength={500} {...health('triggers')} /></Field>
            <Field label="Omgevingsfactoren" hint="Bijv. koude lucht, pollen"><input maxLength={500} {...health('environment')} /></Field>
          </div>
          <div className="form-actions"><Button type="submit">Profiel opslaan</Button></div>
        </form>
      )}
    </Card>
  );
}

function RequestCard({ onCreate, blocked }: { onCreate: (request: CoachRequest) => Promise<void>; blocked: Analysis | null }) {
  const [request, setRequest] = useState({ discipline: 'running', goal: '', weeks: '8', sessionsPerWeek: '3', periodization: 'linear', strengthGoal: 'hypertrophy', strengthSplit: 'full-body', runningFocus: 'balanced', cardioFocus: 'aerobic', jumpFocus: 'landing', targetDistanceKm: '' });
  const set = (key: keyof typeof request) => ({ value: request[key], onChange: (event: { target: { value: string } }) => setRequest({ ...request, [key]: event.target.value }) });

  return (
    <Card title="Nieuw programma">
      <form onSubmit={(event) => { event.preventDefault(); void onCreate(request); }} noValidate>
        <div className="form-grid">
          <Field label="Discipline">
            <select {...set('discipline')}>
              {DISCIPLINES.map((discipline) => <option key={discipline} value={discipline}>{disciplineLabels[discipline]}</option>)}
            </select>
          </Field>
          <Field label="Doel" hint="Bijv. 5 km rustig kunnen lopen"><input maxLength={200} {...set('goal')} /></Field>
          <Field label="Aantal weken" hint="4 tot 24"><input type="number" min="4" max="24" {...set('weeks')} /></Field>
          <Field label="Sessies per week" hint="Kan lager uitvallen op basis van niveau en tijd"><input type="number" min="1" max="7" {...set('sessionsPerWeek')} /></Field>
          <Field label="Periodisering">
            <select {...set('periodization')}>
              {PERIODIZATIONS.map((value) => <option key={value} value={value}>{periodizationLabel(value)}</option>)}
            </select>
          </Field>
          {request.discipline === 'strength' && (
            <>
              <Field label="Krachtdoel"><select {...set('strengthGoal')}>{STRENGTH_GOALS.map((value) => <option key={value} value={value}>{strengthGoalLabels[value]}</option>)}</select></Field>
              <Field label="Indeling"><select {...set('strengthSplit')}>{STRENGTH_SPLITS.map((value) => <option key={value} value={value}>{strengthSplitLabels[value]}</option>)}</select></Field>
            </>
          )}
          {request.discipline === 'running' && (
            <>
              <Field label="Loopfocus"><select {...set('runningFocus')}>{RUNNING_FOCUSES.map((value) => <option key={value} value={value}>{runningFocusLabels[value]}</option>)}</select></Field>
              <Field label="Doelafstand (km, optioneel)"><input type="number" min="0" max="100" step="0.1" {...set('targetDistanceKm')} /></Field>
            </>
          )}
          {request.discipline === 'cardio' && (
            <Field label="Conditiefocus"><select {...set('cardioFocus')}>{CARDIO_FOCUSES.map((value) => <option key={value} value={value}>{cardioFocusLabels[value]}</option>)}</select></Field>
          )}
          {request.discipline === 'plyometrics' && (
            <Field label="Sprongfocus"><select {...set('jumpFocus')}>{JUMP_FOCUSES.map((value) => <option key={value} value={value}>{jumpFocusLabels[value]}</option>)}</select></Field>
          )}
        </div>
        <div className="form-actions"><Button type="submit">Voorstel maken</Button></div>
      </form>
      {blocked && (
        <div className="coach-blocked" role="alert">
          <strong>Geen voorstel gemaakt</strong>
          <ul>{blocked.blockers.map((item) => <li key={item}>{item}</li>)}</ul>
        </div>
      )}
    </Card>
  );
}

function ProgramCard({
  program,
  today,
  feedback,
  onConfirm,
  onComplete,
  onDelete,
  onPlan,
  onFeedback,
  onAdjust
}: {
  program: Program;
  today: string;
  feedback: CoachFeedback[];
  onConfirm: () => void;
  onComplete: () => void;
  onDelete: () => void;
  onPlan: (week: number) => void;
  onFeedback: (item: CoachFeedback) => Promise<boolean>;
  onAdjust: () => Promise<void>;
}) {
  const evaluation = evaluateProgram(program, feedbackLogs(feedback));
  const week = program.status === 'active' ? currentProgramWeek(program, today) ?? (program.startDate && today < program.startDate ? 1 : null) : null;
  const title = `${disciplineLabels[program.discipline]} · ${program.goal}`;
  const tone = program.status === 'active' ? 'good' : program.status === 'draft' ? 'warning' : 'neutral';

  return (
    <article className="coach-program" aria-label={title}>
      <div className="coach-program-head">
        <div>
          <h3 className="item-title">{title}</h3>
          <p className="item-subtitle">
            {program.weeksCount} weken · {program.analysis.frequency}× per week · {program.periodizationLabel} · versie {program.version}
            {program.startDate ? ` · start ${shortDay(program.startDate)}` : ''}
          </p>
        </div>
        <StatusPill tone={tone}>{statusLabels[program.status]}</StatusPill>
      </div>
      {program.adjustmentNote && <p className="item-subtitle">Aanleiding: {program.adjustmentNote}</p>}
      <div className="form-actions">
        {program.status === 'draft' && <Button type="button" onClick={onConfirm}>Bevestigen</Button>}
        {program.status === 'draft' && (
          <ConfirmAction label={`Concept ${title} verwijderen`} confirmMessage="Dit concept verwijderen?" onConfirm={onDelete}>Verwijderen</ConfirmAction>
        )}
        {week !== null && <Button type="button" onClick={() => onPlan(week)}>Week {week} inplannen</Button>}
        {week !== null && week < program.weeks.length && <Button type="button" variant="secondary" onClick={() => onPlan(week + 1)}>Week {week + 1} inplannen</Button>}
        {program.status === 'active' && <Button type="button" variant="secondary" onClick={onComplete}>Afronden</Button>}
      </div>
      <details>
        <summary>Onderbouwing en aandachtspunten</summary>
        <ul className="coach-list">{program.analysis.cautions.map((item) => <li key={item}>{item}</li>)}</ul>
        <ul className="coach-list">{program.evidence.map((item) => <li key={item.type}><strong>{item.label}:</strong> {item.text}</li>)}</ul>
      </details>
      <details>
        <summary>Weekschema</summary>
        <ol className="coach-weeks">
          {program.weeks.map((item) => (
            <li key={item.week}>
              <p className="item-title">Week {item.week} · {item.phase} · {item.volume} min</p>
              <p className="item-subtitle">{item.goal} {item.progress}</p>
              <ul className="coach-list">
                {item.sessions.map((session, index) => (
                  <li key={index}>
                    <strong>{session.title}</strong> · {session.durationMinutes} min · {session.intensity}
                    {session.targetDistanceKm ? ` · ± ${session.targetDistanceKm} km` : ''}
                    <br />
                    <span className="item-subtitle">{session.details} {session.rest}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </details>
      {program.status === 'active' && (
        <>
          <FeedbackForm programId={program.id} today={today} onSave={onFeedback} />
          <div className="coach-evaluation">
            <p className="item-title">Evaluatie</p>
            <p className="item-subtitle">
              {evaluation.logged} terugkoppelingen · {evaluation.completed} afgerond{evaluation.averageRpe ? ` · gemiddelde RPE ${evaluation.averageRpe}` : ''}
            </p>
            <ul className="coach-list">{evaluation.suggestions.map((item) => <li key={item}>{item}</li>)}</ul>
            {evaluation.logged > 0 && <Button type="button" variant="secondary" onClick={() => void onAdjust()}>Aanpassing voorstellen</Button>}
          </div>
        </>
      )}
    </article>
  );
}

function FeedbackForm({ programId, today, onSave }: { programId: string; today: string; onSave: (item: CoachFeedback) => Promise<boolean> }) {
  const [date, setDate] = useState(today);
  const [completed, setCompleted] = useState(true);
  const [minutes, setMinutes] = useState('');
  const [rpe, setRpe] = useState('0');
  const [recovery, setRecovery] = useState<Recovery>('goed');
  const [symptom, setSymptom] = useState<SessionSymptom>('none');
  const [note, setNote] = useState('');
  const [saved, setSaved] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaved(false);
    const item: CoachFeedback = {
      id: makeId('feedback'), kind: 'feedback', programId, date: date > today ? today : date, completed,
      durationMinutes: Math.min(600, Math.max(0, Math.round(Number(minutes) || 0))), rpe: Number(rpe), recovery, symptomType: symptom, note: note.trim().slice(0, 1000)
    };
    if (await onSave(item)) {
      setSaved(true);
      setMinutes('');
      setNote('');
      setSymptom('none');
    }
  }

  return (
    <form className="coach-feedback" onSubmit={(event) => void submit(event)} noValidate>
      <p className="item-title">Training terugkoppelen</p>
      <div className="form-grid">
        <Field label="Datum"><input type="date" max={today} value={date} onChange={(event) => setDate(event.target.value)} /></Field>
        <Field label="Minuten"><input type="number" min="0" max="600" value={minutes} onChange={(event) => setMinutes(event.target.value)} /></Field>
        <Field label="Ervaren inspanning (RPE)">
          <select value={rpe} onChange={(event) => setRpe(event.target.value)}>
            <option value="0">Niet ingevuld</option>
            {Array.from({ length: 10 }, (_, index) => <option key={index + 1} value={String(index + 1)}>{index + 1}</option>)}
          </select>
        </Field>
        <Field label="Herstel">
          <select value={recovery} onChange={(event) => setRecovery(event.target.value as Recovery)}>
            {RECOVERY_OPTIONS.map((value) => <option key={value} value={value}>{recoveryLabels[value]}</option>)}
          </select>
        </Field>
        <Field label="Klachten">
          <select value={symptom} onChange={(event) => setSymptom(event.target.value as SessionSymptom)}>
            {SESSION_SYMPTOMS.map((value) => <option key={value} value={value}>{symptomLabels[value]}</option>)}
          </select>
        </Field>
        <Field label="Notitie (optioneel)"><input maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} /></Field>
      </div>
      <label className="check-row">
        <input type="checkbox" checked={completed} onChange={(event) => setCompleted(event.target.checked)} />
        Training afgerond
      </label>
      {symptom === 'severe' && <p className="coach-alert" role="alert">Bij klachten die nu optreden: stop direct en zoek passende medische hulp.</p>}
      {saved && <p role="status"><StatusPill tone="good">Terugkoppeling opgeslagen</StatusPill></p>}
      <div className="form-actions"><Button type="submit" variant="secondary">Terugkoppeling opslaan</Button></div>
    </form>
  );
}
