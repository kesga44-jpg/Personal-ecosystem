/**
 * Regelgebaseerde sportcoach (roadmap #6, PR 15).
 * Logica overgenomen uit Samen Thuis `sportcoach-core.js` (alleen gelezen; Samen Thuis blijft ongewijzigd)
 * en herschreven in TypeScript. Zelfde regels, drempels en teksten; verschillen staan in docs/COACH.md.
 *
 * - Geen medisch advies en geen diagnose: bij aandachtspunten of ernstige klachten maakt de coach geen voorstel.
 * - Een evaluatie doet alleen een voorstel; een aanpassing is altijd een nieuw concept, nooit een stille wijziging.
 * - Gezondheidsgegevens blijven in de lokale Sport-database; deze module doet geen netwerkverzoeken.
 */

export const DISCIPLINES = ['running', 'strength', 'plyometrics', 'cardio', 'mobility'] as const;
export type Discipline = (typeof DISCIPLINES)[number];
export const LEVELS = ['beginner', 'recreational', 'advanced', 'experienced'] as const;
export type Level = (typeof LEVELS)[number];
export const PERIODIZATIONS = ['linear', 'undulating', 'block'] as const;
export type Periodization = (typeof PERIODIZATIONS)[number];
export const ASTHMA_STATUSES = ['yes', 'no', 'unknown', 'prefer-not'] as const;
export type AsthmaStatus = (typeof ASTHMA_STATUSES)[number];
export const SYMPTOM_CONTROLS = ['none', 'concern', 'unsure', 'prefer-not'] as const;
export type SymptomControl = (typeof SYMPTOM_CONTROLS)[number];
export const SESSION_SYMPTOMS = ['none', 'fatigue', 'airway', 'severe'] as const;
export type SessionSymptom = (typeof SESSION_SYMPTOMS)[number];
export const STRENGTH_GOALS = ['hypertrophy', 'max-strength', 'endurance'] as const;
export const STRENGTH_SPLITS = ['full-body', 'upper-lower', 'push-pull-legs'] as const;
export const RUNNING_FOCUSES = ['balanced', 'easy', 'interval', 'tempo', 'heart-rate'] as const;
export const CARDIO_FOCUSES = ['aerobic', 'interval', 'hiit', 'combined'] as const;
export const JUMP_FOCUSES = ['landing', 'vertical', 'horizontal', 'reactive'] as const;
export const WEEKDAYS = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag'] as const;

export const disciplineLabels: Record<Discipline, string> = {
  running: 'Hardlopen',
  strength: 'Krachttraining',
  plyometrics: 'Sprongkracht (plyometrie)',
  cardio: 'Conditie',
  mobility: 'Mobiliteit en herstel'
};
export const levelLabels: Record<Level, string> = { beginner: 'Beginner', recreational: 'Recreatief', advanced: 'Gevorderd', experienced: 'Ervaren' };
export const asthmaLabels: Record<AsthmaStatus, string> = { yes: 'Ja', no: 'Nee', unknown: 'Weet ik niet', 'prefer-not': 'Zeg ik liever niet' };
export const symptomControlLabels: Record<SymptomControl, string> = {
  none: 'Geen klachten of goed onder controle',
  concern: 'Onvoldoende onder controle',
  unsure: 'Weet ik niet zeker',
  'prefer-not': 'Zeg ik liever niet'
};
export const symptomLabels: Record<SessionSymptom, string> = {
  none: 'Geen klachten',
  fatigue: 'Normale vermoeidheid',
  airway: 'Luchtwegklachten (benauwd, piepen, hoesten)',
  severe: 'Ernstige benauwdheid of alarmsymptoom'
};

export interface CoachHealth {
  asthmaStatus: AsthmaStatus;
  triggers: string;
  environment: string;
  symptomsDuringExercise: string;
  symptomsAfterExercise: string;
  symptomControl: SymptomControl;
  attention: string;
  recoveryExperience: string;
  medicationContext: string;
}

export interface CoachProfile {
  name: string;
  sportBackground: string;
  previousExperience: string;
  trainingYears: number;
  level: Level;
  currentActivity: string;
  currentWeeklyMinutes: number;
  previousPrograms: string;
  strengthExperience: string;
  runningExperience: string;
  groupClassExperience: string;
  personalRecords: string;
  preferences: string;
  availableWeeklyMinutes: number;
  recoveryNeeds: string;
  limitations: string;
  availableEquipment: string;
  runningCurrentKm: number;
  runningPace: string;
  runningLongestRunKm: number;
  runningSessionsPerWeek: number;
  heartRate: string;
  health: CoachHealth;
  age: number;
  goals: string[];
  availableDays: string[];
  minutesPerSession: number;
  preferredExercises: string[];
  avoidedExercises: string[];
  trainingPreferences: string;
}

export interface CoachRequest {
  discipline: string;
  goal: string;
  weeks?: number | string;
  sessionsPerWeek?: number | string;
  periodization?: string;
  strengthGoal?: string;
  strengthSplit?: string;
  runningFocus?: string;
  cardioFocus?: string;
  jumpFocus?: string;
  targetDistanceKm?: number | string;
}

/** Een vastgelegde training of terugkoppeling, zoals de regels die lezen. */
export interface CoachLog {
  date?: string | undefined;
  discipline?: string | undefined;
  completed?: boolean | undefined;
  durationMinutes?: number | undefined;
  symptomType?: string | undefined;
  rpe?: number | undefined;
  recovery?: string | undefined;
  programId?: string | undefined;
}

const number = (value: unknown, fallback = 0): number => {
  const parsed = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : fallback;
};
const bounded = (value: unknown, min: number, max: number): number => Math.min(max, Math.max(min, number(value, min)));
const includes = <T extends string>(list: readonly T[], value: unknown): value is T => typeof value === 'string' && (list as readonly string[]).includes(value);

export function makeId(prefix = 'coach'): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function emptyProfile(name = 'Ik'): CoachProfile {
  return {
    name, sportBackground: '', previousExperience: '', trainingYears: 0, level: 'beginner',
    currentActivity: '', currentWeeklyMinutes: 0, previousPrograms: '',
    strengthExperience: '', runningExperience: '', groupClassExperience: '',
    personalRecords: '', preferences: '', availableWeeklyMinutes: 0, recoveryNeeds: '',
    limitations: '', availableEquipment: '', runningCurrentKm: 0, runningPace: '',
    runningLongestRunKm: 0, runningSessionsPerWeek: 0, heartRate: '',
    health: {
      asthmaStatus: 'prefer-not', triggers: '', environment: '', symptomsDuringExercise: '',
      symptomsAfterExercise: '', symptomControl: 'prefer-not', attention: '',
      recoveryExperience: '', medicationContext: ''
    },
    age: 0, goals: [], availableDays: [], minutesPerSession: 0,
    preferredExercises: [], avoidedExercises: [], trainingPreferences: ''
  };
}

const TEXT_FIELDS = ['sportBackground', 'previousExperience', 'currentActivity', 'previousPrograms', 'strengthExperience', 'runningExperience', 'groupClassExperience', 'personalRecords', 'preferences', 'recoveryNeeds', 'limitations', 'availableEquipment', 'runningPace', 'heartRate', 'trainingPreferences'] as const;
const LIST_FIELDS = ['goals', 'availableDays', 'preferredExercises', 'avoidedExercises'] as const;
const NUMBER_FIELDS = ['age', 'trainingYears', 'availableWeeklyMinutes', 'currentWeeklyMinutes', 'runningCurrentKm', 'runningLongestRunKm', 'runningSessionsPerWeek', 'minutesPerSession'] as const;
const HEALTH_TEXT_FIELDS = ['triggers', 'environment', 'symptomsDuringExercise', 'symptomsAfterExercise', 'attention', 'recoveryExperience', 'medicationContext'] as const;

/** Maakt een opgeslagen of ingevoerd profiel veilig (zelfde regels als `normalize` in Samen Thuis, voor één persoon). */
export function normalizeProfile(raw: unknown): CoachProfile {
  const saved = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const base = emptyProfile();
  const profile = { ...base } as CoachProfile & Record<string, unknown>;
  for (const key of TEXT_FIELDS) profile[key] = String(saved[key] ?? '').slice(0, 2000);
  for (const key of LIST_FIELDS) {
    const value = saved[key];
    profile[key] = Array.isArray(value) ? [...new Set(value.map((item) => String(item).trim()).filter(Boolean))].slice(0, 50) : [];
  }
  for (const key of NUMBER_FIELDS) profile[key] = Math.max(0, number(saved[key]));
  profile.availableDays = profile.availableDays.filter((day) => includes(WEEKDAYS, day.toLocaleLowerCase('nl-NL'))).map((day) => day.toLocaleLowerCase('nl-NL'));
  profile.level = includes(LEVELS, saved.level) ? saved.level : 'beginner';
  profile.name = String(saved.name || base.name).slice(0, 100);
  const savedHealth = saved.health && typeof saved.health === 'object' ? (saved.health as Record<string, unknown>) : {};
  const health = { ...base.health } as CoachHealth & Record<string, unknown>;
  for (const key of HEALTH_TEXT_FIELDS) health[key] = String(savedHealth[key] ?? '').slice(0, 2000);
  health.asthmaStatus = includes(ASTHMA_STATUSES, savedHealth.asthmaStatus) ? savedHealth.asthmaStatus : 'prefer-not';
  health.symptomControl = includes(SYMPTOM_CONTROLS, savedHealth.symptomControl) ? savedHealth.symptomControl : 'prefer-not';
  profile.health = health;
  return profile;
}

export interface HealthContext {
  asthmaReported: boolean;
  hasTriggers: boolean;
  hasEnvironment: boolean;
  hasSymptoms: boolean;
  hasPersonalAttention: boolean;
  hasRecoveryExperience: boolean;
  controlConcern: boolean;
  healthConcern: boolean;
  recentAirwayReports: number;
  recentSevereReports: number;
}

export interface Analysis {
  person: string;
  level: Level;
  goal: string;
  discipline: Discipline;
  weeks: number;
  requestedFrequency: number;
  frequency: number;
  availableWeeklyMinutes: number;
  minutesPerSession: number;
  startingWeeklyMinutes: number;
  baselineWeeklyMinutes: number;
  currentActivity: string;
  recentSessionCount: number;
  periodization: Periodization;
  strengthGoal: (typeof STRENGTH_GOALS)[number];
  strengthSplit: (typeof STRENGTH_SPLITS)[number];
  runningFocus: (typeof RUNNING_FOCUSES)[number];
  cardioFocus: (typeof CARDIO_FOCUSES)[number];
  jumpFocus: (typeof JUMP_FOCUSES)[number];
  targetDistanceKm: number;
  profileContext: Record<string, unknown>;
  healthContext: HealthContext;
  healthConcern: boolean;
  blockers: string[];
  cautions: string[];
  requiresReview: false;
}

/** Beoordeelt profiel en aanvraag. `now` is alleen voor tests. */
export function assess(profile: CoachProfile, request: CoachRequest, sessions: CoachLog[] = [], now: number = Date.now()): Analysis {
  const p = profile || emptyProfile('');
  const r = request || ({} as CoachRequest);
  const blockers: string[] = [];
  if (!p.name || !String(p.currentActivity || '').trim()) blockers.push('Vul de huidige activiteit in het sportprofiel in.');
  if (!number(p.availableWeeklyMinutes)) blockers.push('Vul eerst de beschikbare trainingstijd per week in.');
  if (String(p.limitations || '').trim()) blockers.push('Er zijn fysieke aandachtspunten ingevuld. Laat de belasting eerst beoordelen door een bevoegde professional; het systeem kan deze aandachtspunten niet veilig interpreteren.');
  if (!includes(DISCIPLINES, r.discipline)) blockers.push('Kies een geldige sportdiscipline.');
  if (!String(r.goal || '').trim()) blockers.push('Vul het gewenste resultaat in.');
  if (r.discipline === 'cardio' && r.cardioFocus === 'hiit' && !['advanced', 'experienced'].includes(p.level)) blockers.push('HIIT is hier alleen beschikbaar voor een gevorderd of ervaren profiel; kies aerobe basis of gecontroleerde intervallen.');
  const within28Days = (session: CoachLog) => {
    const date = Date.parse(session.date || '');
    return Number.isFinite(date) && date <= now && now - date <= 28 * 86400000;
  };
  const recent = sessions.filter((x) => x.completed && x.discipline === r.discipline && within28Days(x));
  const recentHealthReports = sessions.filter((x) => x.completed && (x.symptomType === 'airway' || x.symptomType === 'severe') && within28Days(x));
  const recentSevereReports = recentHealthReports.filter((session) => session.symptomType === 'severe');
  if (recentSevereReports.length) blockers.push('Er is recent ernstige benauwdheid of een alarmsymptoom gemeld. Maak geen nieuw trainingsvoorstel voordat je dit met een arts/behandelaar hebt besproken; bij klachten die nu optreden, stop en zoek passende medische hulp.');
  const recentMinutes = recent.reduce((sum, x) => sum + number(x.durationMinutes), 0);
  const baselineWeeklyMinutes = recent.length ? recentMinutes / 4 : number(p.currentWeeklyMinutes);
  const requestedFrequency = Math.round(bounded(r.sessionsPerWeek, 1, 7));
  const levelCaps: Record<Level, number> = { beginner: 3, recreational: 4, advanced: 5, experienced: 6 };
  const startingWeeklyMinutes = Math.min(number(p.availableWeeklyMinutes), baselineWeeklyMinutes > 0 ? baselineWeeklyMinutes : 40);
  const timeCap = Math.floor(startingWeeklyMinutes / 20);
  const runningProgressionCap = r.discipline === 'running' && number(p.runningSessionsPerWeek) > 0
    ? Math.min(4, Math.max(2, number(p.runningSessionsPerWeek) + 1))
    : 4;
  const disciplineCap = r.discipline === 'plyometrics' ? 2 : r.discipline === 'running' ? runningProgressionCap : 7;
  const availableDays = Array.isArray(p.availableDays) && p.availableDays.length ? p.availableDays.length : 7;
  const frequency = Math.max(1, Math.min(requestedFrequency, levelCaps[p.level] || 3, Math.max(1, timeCap), disciplineCap, availableDays));
  const weeks = Math.round(bounded(r.weeks, 4, 24));
  const minutesPerSession = Math.min(
    Math.floor(startingWeeklyMinutes / frequency),
    number(p.minutesPerSession) > 0 ? number(p.minutesPerSession) : Number.POSITIVE_INFINITY
  );
  if (minutesPerSession < 20) blockers.push('Er is onvoldoende wekelijkse tijd voor zelfs korte, bruikbare sessies; pas de beschikbare tijd of frequentie aan.');
  const cautions: string[] = [];
  if (recent.length) cautions.push(`Gebaseerd op ${recent.length} geregistreerde trainingen in de afgelopen 28 dagen (${Math.round(baselineWeeklyMinutes)} min/week).`);
  else cautions.push(`Gebaseerd op de zelf opgegeven huidige belasting (${Math.round(baselineWeeklyMinutes)} min/week); er zijn geen recente trainingslogs.`);
  if (frequency < requestedFrequency) cautions.push(`De gevraagde frequentie is teruggebracht van ${requestedFrequency} naar ${frequency} sessies per week op basis van niveau en beschikbare tijd.`);
  if (frequency < requestedFrequency && availableDays < requestedFrequency) cautions.push(`De frequentie houdt rekening met ${availableDays} beschikbare trainingsdag(en) per week.`);
  if (String(p.recoveryNeeds || '').trim()) cautions.push(`Herstelvoorkeur meegenomen: ${String(p.recoveryNeeds).trim()}.`);
  if (String(p.preferences || '').trim()) cautions.push(`Voorkeuren: ${String(p.preferences).trim()}.`);
  if (p.avoidedExercises?.length) cautions.push(`Oefeningen op de zelf opgegeven vermijdlijst zijn uitgesloten: ${p.avoidedExercises.join(', ')}.`);
  if (p.preferredExercises?.length) cautions.push(`Voorkeuroefeningen zijn meegenomen waar ze in de oefenendatabase beschikbaar zijn: ${p.preferredExercises.join(', ')}.`);
  if (String(p.availableEquipment || '').trim()) cautions.push(`Beschikbaar materiaal: ${String(p.availableEquipment).trim()}.`);
  const health = p.health || emptyProfile('').health;
  const reported = (key: keyof CoachHealth) => String(health[key] || '').trim();
  const controlConcern = health.symptomControl === 'concern' || health.symptomControl === 'unsure';
  const healthConcern = controlConcern || Boolean(reported('symptomsDuringExercise')) || Boolean(reported('symptomsAfterExercise')) || recentHealthReports.length > 0;
  if (health.asthmaStatus === 'yes') cautions.push('Je hebt zelf aangegeven astma te hebben. Dit profiel sluit geen sport of trainingsvorm automatisch uit; houd je eigen belastbaarheid en eventuele behandelaarsafspraken aan.');
  if (reported('symptomsDuringExercise') || reported('symptomsAfterExercise')) cautions.push('Er zijn klachten tijdens/na inspanning ingevuld. De generator stelt geen diagnose en kan klachten niet beoordelen; bespreek terugkerende, toenemende of onvoldoende gecontroleerde klachten met je arts/behandelaar.');
  if (controlConcern) cautions.push('Je hebt aangegeven dat klachten onvoldoende onder controle zijn of dat niet zeker te weten. Bespreek dit met je arts/behandelaar voordat je trainingsbelasting verhoogt.');
  if (recentHealthReports.length) cautions.push('Recente trainingsfeedback bevat zelfgerapporteerde luchtwegklachten. De opbouw blijft rustig; bespreek terugkerende of toenemende klachten met je arts/behandelaar.');
  if (recentSevereReports.length) cautions.push('Recente trainingsfeedback bevat een melding van ernstige benauwdheid of een alarmsymptoom. Bij klachten die nu optreden: stop direct en zoek passende medische hulp.');
  if (health.triggers.trim()) cautions.push('Zelf opgegeven inspanningstriggers zijn meegenomen bij de praktische trainingskeuzes.');
  if (health.environment.trim()) cautions.push('Zelf opgegeven omgevingsfactoren zijn meegenomen als aandachtspunt; omstandigheden zijn niet automatisch gemeten.');
  if (r.discipline === 'running') cautions.push(`Loopcontext: ${number(p.runningCurrentKm)} km/week, langste recente loop ${number(p.runningLongestRunKm)} km, ${number(p.runningSessionsPerWeek)} looptrainingen/week, tempo ${p.runningPace || 'niet opgegeven'}, hartslag ${p.heartRate || 'niet opgegeven'}.`);
  return {
    person: p.name, level: p.level, goal: String(r.goal || '').trim(), discipline: (includes(DISCIPLINES, r.discipline) ? r.discipline : 'running'),
    weeks, requestedFrequency, frequency, availableWeeklyMinutes: number(p.availableWeeklyMinutes),
    minutesPerSession, startingWeeklyMinutes, baselineWeeklyMinutes, currentActivity: p.currentActivity,
    recentSessionCount: recent.length, periodization: includes(PERIODIZATIONS, r.periodization) ? r.periodization : 'linear',
    strengthGoal: includes(STRENGTH_GOALS, r.strengthGoal) ? r.strengthGoal : 'hypertrophy',
    strengthSplit: includes(STRENGTH_SPLITS, r.strengthSplit) ? r.strengthSplit : 'full-body',
    runningFocus: includes(RUNNING_FOCUSES, r.runningFocus) ? r.runningFocus : 'balanced',
    cardioFocus: includes(CARDIO_FOCUSES, r.cardioFocus) ? r.cardioFocus : 'aerobic',
    jumpFocus: includes(JUMP_FOCUSES, r.jumpFocus) ? r.jumpFocus : 'landing',
    targetDistanceKm: bounded(r.targetDistanceKm, 0, 100),
    profileContext: {
      trainingYears: number(p.trainingYears), sportBackground: p.sportBackground,
      previousExperience: p.previousExperience, previousPrograms: p.previousPrograms,
      personalRecords: p.personalRecords, strengthExperience: p.strengthExperience,
      runningExperience: p.runningExperience, groupClassExperience: p.groupClassExperience,
      availableEquipment: p.availableEquipment, runningCurrentKm: number(p.runningCurrentKm),
      runningLongestRunKm: number(p.runningLongestRunKm), runningPace: p.runningPace,
      runningSessionsPerWeek: number(p.runningSessionsPerWeek), heartRate: p.heartRate,
      goals: p.goals, availableDays: p.availableDays, minutesPerSession: number(p.minutesPerSession),
      preferredExercises: p.preferredExercises, avoidedExercises: p.avoidedExercises
    },
    healthContext: {
      asthmaReported: health.asthmaStatus === 'yes',
      hasTriggers: Boolean(reported('triggers')),
      hasEnvironment: Boolean(reported('environment')),
      hasSymptoms: Boolean(reported('symptomsDuringExercise') || reported('symptomsAfterExercise')),
      hasPersonalAttention: Boolean(reported('attention')),
      hasRecoveryExperience: Boolean(reported('recoveryExperience')),
      controlConcern,
      healthConcern,
      recentAirwayReports: recentHealthReports.length,
      recentSevereReports: recentSevereReports.length
    },
    healthConcern,
    blockers, cautions, requiresReview: false
  };
}

export function periodizationLabel(value: string): string {
  return ({ linear: 'Lineair', undulating: 'Undulating', block: 'Blokperiodisering' } as Record<string, string>)[value] || 'Lineair';
}

function strengthPrescription(week: number, deload: boolean, periodization: Periodization, index: number, strengthGoal: string) {
  const mainSets = deload ? 2 : (periodization === 'linear' && week > 1 ? 4 : 3);
  const ranges: Record<string, string> = { hypertrophy: '6–12', 'max-strength': '3–6', endurance: '12–20' };
  const reps = periodization === 'undulating' && index % 2 ? '6–8' : ranges[strengthGoal] || '6–12';
  const intensity = deload ? 'RPE 5–6, ruim van falen' : week <= 2 ? 'RPE 6–7, techniek voorop' : 'RPE 7–8, houd 2–3 herhalingen over';
  return { sets: mainSets, reps, restSeconds: 90, intensity };
}

export interface ProgramSession {
  title: string;
  durationMinutes: number;
  volume: string;
  intensity: string;
  details: string;
  rest: string;
  exercises: string[];
  targetDistanceKm: number;
  sets?: number;
  reps?: string;
  restSeconds?: number;
  /** Weekdag uit het profiel (`maandag` …) of het volgnummer van de sessie in de week. */
  day: string | number;
}

type SessionPlan = Omit<ProgramSession, 'day' | 'targetDistanceKm'> & { targetDistanceKm?: number };

function sessionTemplate(discipline: Discipline, index: number, frequency: number, week: number, analysis: Analysis, profile: CoachProfile): SessionPlan {
  const deload = week % 4 === 0;
  const duration = Math.max(20, Math.min(analysis.minutesPerSession, discipline === 'running' && index === frequency - 1 ? Math.round(analysis.minutesPerSession * 1.15) : analysis.minutesPerSession));
  const avoided = new Set((profile.avoidedExercises || []).map((value) => String(value).toLocaleLowerCase('nl-NL')));
  // Samen Thuis kiest hier uit een eigen oefenendatabase; die bestaat in Sport niet, dus de lijst is leeg (docs/COACH.md).
  const library: string[] = [];
  if (discipline === 'running') {
    const quality = frequency >= 3 && index === 1 && week >= 5 && !deload && !analysis.healthConcern && analysis.runningFocus !== 'easy' && analysis.runningFocus !== 'heart-rate';
    const qualityType = analysis.runningFocus === 'tempo' ? 'Tempotraining' : analysis.runningFocus === 'interval' ? 'Gecontroleerd interval' : week % 2 ? 'Gecontroleerd interval' : 'Tempotraining';
    const type = quality ? qualityType : index === frequency - 1 ? 'Rustige duurloop' : 'Rustige duurloop / run-walk';
    const heartRateGuide = String(profile.heartRate || '').trim() ? ' Gebruik uitsluitend je eigen betrouwbaar vastgestelde hartslagzones; er zijn geen zones berekend.' : '';
    const qualityDetails = type === 'Tempotraining'
      ? 'Warming-up 10 min rustig, 10–15 min gelijkmatig stevig maar beheerst, cooling-down 5–10 min.'
      : 'Warming-up 10 min rustig, 4–6 × 2 min vlot met 2 min rustig herstel, cooling-down 5–10 min.';
    const currentWeeklyKm = number(profile.runningCurrentKm);
    const longestRun = number(profile.runningLongestRunKm) || currentWeeklyKm / Math.max(1, number(profile.runningSessionsPerWeek) || frequency);
    const boundedLongestRun = currentWeeklyKm > 0 ? Math.min(longestRun, currentWeeklyKm) : longestRun;
    const easyRun = Math.max(0, currentWeeklyKm - boundedLongestRun) / Math.max(1, frequency - 1);
    const estimatedDistance = index === frequency - 1 ? boundedLongestRun : easyRun;
    return { title: type, durationMinutes: duration, volume: `${duration} min`, intensity: quality ? 'RPE 6–7; beheerst, geen maximale inspanning' : 'RPE 3–4; praten moet mogelijk blijven', details: (quality ? qualityDetails : 'Rustig tempo. Begin zo nodig met afwisselend wandelen en joggen; verhoog niet tegelijk afstand én snelheid.') + heartRateGuide, rest: 'Plan minimaal één rustdag tussen intensieve looptrainingen.', targetDistanceKm: estimatedDistance ? Math.round(estimatedDistance * 10) / 10 : 0, exercises: library };
  }
  if (discipline === 'strength') {
    const prescription = strengthPrescription(week, deload, analysis.periodization, index, analysis.strengthGoal);
    const split = analysis.strengthSplit === 'push-pull-legs'
      ? ['Push', 'Pull', 'Legs'][index % 3]!
      : analysis.strengthSplit === 'upper-lower'
        ? index % 2 ? 'Upper body' : 'Lower body'
        : 'Full body';
    const defaultExercises = split === 'Full body' ? ['Squatvariant', 'Duwbeweging', 'Trekbeweging', 'Heupstrekking'] : split === 'Upper body' || split === 'Push' || split === 'Pull' ? ['Duwbeweging', 'Trekbeweging', 'Schouderbeweging'] : ['Squatvariant', 'Heupstrekking', 'Unilaterale beenoefening'];
    const availableDefaults = defaultExercises.filter((name) => !avoided.has(name.toLocaleLowerCase('nl-NL')));
    const chosenExercises = library.length ? library : availableDefaults;
    return { title: `${split} · sessie ${index + 1}`, durationMinutes: duration, volume: `${prescription.sets} sets per hoofdbeweging`, intensity: prescription.intensity, details: `Kies 3–4 passende bewegingen (${chosenExercises.length ? chosenExercises.join(', ') : 'een zelfgekozen, niet-vermijden beweging'}). ${prescription.sets} sets × ${prescription.reps} herhalingen; ${prescription.restSeconds}–180 sec rust. Houd minimaal 48 uur tussen zware sessies voor dezelfde spiergroepen.`, rest: deload ? 'Herstelweek: ongeveer 30% minder sets, geen maximale pogingen.' : 'Stop bij klachten of verlies van techniek; verhoog pas gewicht wanneer alle herhalingen beheerst lukken.', sets: prescription.sets, reps: prescription.reps, restSeconds: prescription.restSeconds, exercises: chosenExercises };
  }
  if (discipline === 'plyometrics') {
    const focus = ({ landing: 'landingstechniek', vertical: 'verticale sprongkracht', horizontal: 'horizontale sprongkracht', reactive: 'reactieve kracht' } as const)[analysis.jumpFocus];
    return { title: `${focus[0]!.toUpperCase()}${focus.slice(1)} · ${index + 1}`, durationMinutes: Math.min(duration, 35), volume: deload ? '2 × 3 rustige sprongen' : '2–3 × 3–5 kwalitatieve contacten', intensity: 'Submaximaal; volledige rust tussen herhalingen', details: `Dynamische warming-up en lage, gecontroleerde sprongen gericht op ${focus}. Oefen zachte, stabiele landingen; stop zodra spronghoogte, controle of landing verslechtert. Gebruik alleen oefeningen uit de bronnenbibliotheek of een deskundig aangeleverd programma.`, rest: 'Maximaal 2 sessies per week, met minimaal 48–72 uur ertussen.', exercises: library };
  }
  if (discipline === 'cardio') {
    const quality = frequency >= 2 && index === 1 && week >= 3 && !deload && !analysis.healthConcern && analysis.cardioFocus !== 'aerobic';
    const hiit = quality && analysis.cardioFocus === 'hiit';
    const title = analysis.cardioFocus === 'combined' ? 'Kracht + conditie' : hiit ? 'HIIT · gecontroleerde intervallen' : quality ? 'Aerobe intervallen' : 'Aerobe basis';
    const details = analysis.cardioFocus === 'combined'
      ? 'Kies 2–3 beheersbare krachtbewegingen, gevolgd door 8–12 min matige cardio. Houd de techniek goed en verlaag de totale belasting als herstel achterblijft.'
      : hiit
        ? 'Warming-up 10 min, 4 × 1 min stevig (RPE 7–8) met 2 min rustig herstel, cooling-down 8–10 min. Stop bij klachten; geen maximale sprintinspanningen.'
        : quality
          ? 'Warming-up 8–10 min, 4 × 3 min stevig met 2 min rustig herstel, cooling-down.'
          : 'Aaneengesloten rustig bewegen of opsplitsen in blokken; kies een low-impact optie die past bij voorkeur en materiaal.';
    return { title, durationMinutes: duration, volume: `${duration} min`, intensity: hiit ? 'RPE 7–8; korte hoge inspanning, niet maximaal' : quality ? 'RPE 6–7; gecontroleerde intervallen' : 'RPE 3–4; rustig gesprek mogelijk', details, rest: deload ? 'Herstelweek: verkort de totale duur met ongeveer 25%.' : 'Wissel intensieve dagen af met rust of lichte beweging.', exercises: library };
  }
  return { title: index === 0 ? 'Mobiliteit & bewegingsvoorbereiding' : 'Herstelroutine', durationMinutes: Math.min(duration, 30), volume: '2–3 rustige rondes', intensity: 'Comfortabel bereik; geen pijn forceren', details: '5 min rustig opwarmen, daarna dynamische bewegingen en gecontroleerde mobiliteit. Statische stretches alleen comfortabel en zonder te veren; focus op de eigen voorkeur en bewegingsvoorbereiding.', rest: 'Hersteltraining blijft licht en vervangt geen medische behandeling.', exercises: library };
}

export interface ProgramWeek {
  week: number;
  phase: string;
  goal: string;
  frequency: number;
  volume: number;
  intensity: string;
  recovery: string;
  progress: string;
  evaluation: string;
  sessions: ProgramSession[];
}

export type ProgramStatus = 'draft' | 'active' | 'completed' | 'replaced';

export interface Program {
  id: string;
  discipline: Discipline;
  goal: string;
  weeksCount: number;
  periodization: Periodization;
  periodizationLabel: string;
  createdAt: string;
  status: ProgramStatus;
  version: number;
  analysis: Analysis;
  weeks: ProgramWeek[];
  evidence: { type: string; label: string; text: string }[];
  previousProgramId?: string;
  adjustmentNote?: string;
  /** Maandag van week 1; gezet bij bevestigen. */
  startDate?: string;
}

export type GenerateResult = { ok: true; analysis: Analysis; program: Program } | { ok: false; analysis: Analysis };

export function generateProgram(profile: CoachProfile, request: CoachRequest, sessions: CoachLog[] = [], now: number = Date.now()): GenerateResult {
  const analysis = assess(profile, request, sessions, now);
  if (analysis.blockers.length) return { ok: false, analysis };
  const p = profile;
  const availableDays = Array.isArray(p.availableDays) && p.availableDays.length ? p.availableDays : [];
  const trainingDays = Array.from({ length: analysis.frequency }, (_, index) => ({ day: availableDays[index] ?? index + 1 }));
  const weeks: ProgramWeek[] = Array.from({ length: analysis.weeks }, (_, index) => {
    const week = index + 1;
    const recovery = week % 4 === 0;
    const currentDays: ProgramSession[] = trainingDays.map((template, sessionIndex) => {
      const plan = sessionTemplate(analysis.discipline, sessionIndex, analysis.frequency, week, analysis, p);
      const growth = (analysis.discipline === 'running' || analysis.discipline === 'cardio') && !analysis.healthConcern
        ? Math.min(Math.floor((week - 1) / 4) * 0.05 + ((week - 1) % 4) * 0.02, 0.15)
        : 0;
      const progression = recovery ? (1 + Math.min(Math.floor((week - 1) / 4) * 0.05 + 0.06, 0.15)) * 0.75 : 1 + growth;
      let targetDistanceKm = plan.targetDistanceKm ? Math.round(plan.targetDistanceKm * progression * 10) / 10 : 0;
      if (analysis.discipline === 'running' && sessionIndex === analysis.frequency - 1) {
        const currentWeeklyKm = number(p.runningCurrentKm);
        const longestRun = number(p.runningLongestRunKm) || (currentWeeklyKm / Math.max(1, number(p.runningSessionsPerWeek) || analysis.frequency));
        const startingLongRun = currentWeeklyKm > 0 ? Math.min(longestRun, currentWeeklyKm) : longestRun;
        if (startingLongRun > 0) {
          const buildWeeks = week - 1 - Math.floor((week - 1) / 4);
          const step = Math.max(0.2, startingLongRun * 0.05);
          targetDistanceKm = Math.round(Math.min(analysis.targetDistanceKm || Infinity, startingLongRun + buildWeeks * step) * (recovery ? 0.75 : 1) * 10) / 10;
        }
      }
      const warmup = analysis.healthContext.asthmaReported || analysis.healthContext.hasTriggers || analysis.healthContext.hasEnvironment || analysis.healthConcern
        ? 'Geleidelijke warming-up: begin 10–15 min zeer rustig en verhoog stap voor stap. '
        : 'Warming-up: begin 5–10 min rustig en bereid de beweging geleidelijk voor. ';
      const cooldown = 'Cooling-down: verlaag de inspanning geleidelijk gedurende 5–10 min.';
      const environmentNote = analysis.healthContext.hasEnvironment || analysis.healthContext.hasTriggers
        ? ' Beoordeel zelf je opgegeven triggers en de actuele omstandigheden; die worden niet live gemeten.'
        : '';
      const symptomNote = analysis.healthConcern
        ? ' Je hebt inspanningsklachten of onzekerheid over de controle gemeld; houd dit voorstel rustig, verhoog de belasting niet en bespreek aanhoudende of onvoldoende gecontroleerde klachten met je arts/behandelaar.'
        : '';
      return {
        ...plan,
        day: template.day,
        details: `${warmup}${plan.details} ${cooldown}${environmentNote}${symptomNote}`,
        durationMinutes: Math.max(15, Math.round(plan.durationMinutes * progression)),
        targetDistanceKm
      };
    });
    const phase = recovery ? 'Herstel en evaluatie' : analysis.periodization === 'block' ? ['Basis', 'Opbouw', 'Specificiteit'][Math.min(2, Math.floor((week - 1) / Math.max(1, Math.ceil(analysis.weeks / 3))))]! : analysis.periodization === 'undulating' ? 'Afwisselende trainingsprikkel' : 'Geleidelijke opbouw';
    return {
      week, phase,
      goal: recovery ? 'Herstel, techniek en evaluatie; verlaag de totale belasting.' : `Werk aan ${analysis.goal.toLowerCase()} met beheersbare belasting.${analysis.discipline === 'running' && analysis.targetDistanceKm ? ` Doelafstand ${analysis.targetDistanceKm} km; als veilig opbouwen meer tijd vraagt, schuift het doel voorbij deze programmaperiode.` : ''}`,
      frequency: currentDays.length,
      volume: currentDays.reduce((sum, day) => sum + day.durationMinutes, 0),
      intensity: recovery ? 'Laag tot matig; RPE 3–5' : 'Afgestemd per sessie; geen maximale inspanning nodig',
      recovery: recovery ? 'Herstelweek; extra rust en feedback registreren.' : 'Plan minimaal één rustdag per week; houd zware sessies gescheiden.',
      progress: analysis.discipline === 'strength' ? recovery ? 'Herstelweek: ongeveer 30% minder sets; techniek en herstel centraal.' : 'Voeg alleen een herhaling of klein beetje gewicht toe als de vorige sessies beheerst waren.' : recovery ? 'Herstelweek: totale duur ongeveer 25% lager dan de voorafgaande opbouw.' : 'Progressieve duur-/afstandsstap van circa 2% per opbouwweek, met een voorzichtige bovengrens; dit is een praktische keuze, geen universele regel.',
      evaluation: week % 2 === 0 || recovery ? 'Evalueer RPE, herstel, gemiste sessies en eventuele klachten vóór verdere opbouw.' : '',
      sessions: currentDays
    };
  });
  return {
    ok: true,
    analysis,
    program: {
      id: makeId('program'), discipline: analysis.discipline,
      goal: analysis.goal, weeksCount: analysis.weeks, periodization: analysis.periodization,
      periodizationLabel: periodizationLabel(analysis.periodization), createdAt: new Date(now).toISOString(),
      status: 'draft', version: 1,
      analysis, weeks,
      evidence: [
        { type: 'well-supported', label: 'Sterk onderbouwd algemeen principe', text: 'Geleidelijke trainingsopbouw, voldoende herstel en het afstemmen van belasting op de persoon zijn breed gedragen principes; er is geen universeel optimale dosis.' },
        { type: 'reasonable', label: 'Redelijk onderbouwd trainingsprincipe', text: 'Periodisering, progressieve overload en het afwisselen van trainingsprikkels kunnen structuur geven; de beste methode hangt af van doel en sporter.' },
        { type: 'practical', label: 'Praktische keuze / onzekerheid', text: 'De exacte sessies, frequentie en progressie zijn keuzes op basis van ingevoerde gegevens, geen persoonlijk gevalideerd effect. Toets ze aan herstel en feedback.' }
      ]
    }
  };
}

export interface Evaluation {
  logged: number;
  completed: number;
  averageRpe: number;
  averageMinutes: number;
  recoveryConcern: boolean;
  healthConcern: boolean;
  airwayReports: number;
  severeReports: number;
  suggestions: string[];
}

export function evaluateProgram(program: Pick<Program, 'id'>, sessions: CoachLog[] = []): Evaluation {
  const logs = sessions.filter((session) => session.programId === program.id);
  const completed = logs.filter((session) => session.completed);
  const rpeLogs = completed.filter((session) => number(session.rpe) > 0);
  const averageRpe = rpeLogs.length ? rpeLogs.reduce((sum, session) => sum + number(session.rpe), 0) / rpeLogs.length : 0;
  const averageMinutes = completed.length ? completed.reduce((sum, session) => sum + number(session.durationMinutes), 0) / completed.length : 0;
  const recoveryConcern = completed.some((session) => /slecht|onvoldoende|pijn/i.test(session.recovery || ''));
  const airwayReports = completed.filter((session) => session.symptomType === 'airway' || session.symptomType === 'severe');
  const severeReports = completed.filter((session) => session.symptomType === 'severe');
  const suggestions: string[] = [];
  if (!logs.length) suggestions.push('Registreer eerst enkele trainingen en herstelervaringen; er is nog onvoldoende informatie om belasting bij te sturen.');
  else if (severeReports.length) suggestions.push('Er is ernstige benauwdheid of een alarmsymptoom geregistreerd. Stop bij klachten direct; als dit nu gebeurt of aanhoudt, zoek passende medische hulp. Bespreek de ervaring met je arts/behandelaar voordat je trainingsbelasting verhoogt.');
  else if (airwayReports.length) suggestions.push('Er zijn luchtwegklachten geregistreerd; luchtwegklachten zijn niet hetzelfde als normale inspanningsvermoeidheid. Pas niet automatisch een diagnose toe; bespreek terugkerende klachten met je arts/behandelaar en verhoog de trainingsbelasting niet totdat je dit hebt besproken.');
  else if (averageRpe >= 8 || recoveryConcern) suggestions.push('De ervaren inspanning of het herstel vraagt aandacht. Overweeg minder volume/intensiteit en extra rust; laat aanhoudende klachten beoordelen door een professional.');
  else if (logs.length >= 4 && completed.length / logs.length < 0.7) suggestions.push('Minder dan 70% van de gelogde sessies is afgerond. Overweeg een lagere frequentie of kortere sessies voordat je opbouwt.');
  else if (logs.length >= 4 && averageRpe > 0 && averageRpe <= 5 && completed.length === logs.length) suggestions.push('Alle geregistreerde sessies zijn afgerond met lage ervaren inspanning. Een kleine progressie kan worden overwogen als herstel goed blijft.');
  else suggestions.push('De beschikbare gegevens geven geen duidelijke reden om het programma aan te passen. Blijf herstel en feedback volgen.');
  return { logged: logs.length, completed: completed.length, averageRpe: Number(averageRpe.toFixed(1)), averageMinutes: Math.round(averageMinutes), recoveryConcern, healthConcern: airwayReports.length > 0, airwayReports: airwayReports.length, severeReports: severeReports.length, suggestions };
}

/** Nieuw concept op basis van een evaluatie. Het bestaande programma verandert niet. */
export function proposeAdjustment(program: Program, evaluation: Evaluation, now: number = Date.now()): Program {
  const copy = JSON.parse(JSON.stringify(program)) as Program;
  copy.id = makeId('program');
  copy.createdAt = new Date(now).toISOString();
  copy.status = 'draft';
  copy.version = number(program.version, 1) + 1;
  copy.previousProgramId = program.id;
  copy.adjustmentNote = evaluation.suggestions.join(' ');
  delete copy.startDate;
  if (evaluation.averageRpe >= 8 || evaluation.recoveryConcern || evaluation.healthConcern || (evaluation.logged >= 4 && evaluation.completed / evaluation.logged < 0.7)) {
    copy.weeks = copy.weeks.map((week) => ({
      ...week,
      volume: Math.round(week.volume * 0.8),
      sessions: week.sessions.map((session) => ({ ...session, durationMinutes: Math.round(session.durationMinutes * 0.8), intensity: 'Licht tot matig; herstel eerst beoordelen' }))
    }));
    copy.analysis = { ...copy.analysis, cautions: [...(copy.analysis.cautions || []), 'Voorstel: circa 20% minder sessieduur. Dit concept wijzigt het bestaande programma niet.'] };
  }
  return copy;
}

export function validateProgram(program: unknown): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!program || typeof program !== 'object' || Array.isArray(program)) return { ok: false, errors: ['Programma moet een object zijn.'] };
  const value = program as Partial<Program>;
  if (typeof value.id !== 'string' || !value.id.trim()) errors.push('Programma-id ontbreekt.');
  if (!includes(DISCIPLINES, value.discipline)) errors.push('Discipline is ongeldig.');
  if (typeof value.goal !== 'string' || !value.goal.trim()) errors.push('Doel ontbreekt.');
  if (!Array.isArray(value.weeks) || value.weeks.length < 1 || value.weeks.length > 52) errors.push('Programma moet 1–52 weken bevatten.');
  (Array.isArray(value.weeks) ? value.weeks : []).forEach((week, weekIndex) => {
    if (!week || !Array.isArray(week.sessions) || week.sessions.length > 14) errors.push(`Week ${weekIndex + 1} heeft geen geldige sessielijst.`);
    (week && Array.isArray(week.sessions) ? week.sessions : []).forEach((session, sessionIndex) => {
      if (!session || typeof session.title !== 'string' || !session.title.trim()) errors.push(`Sessie ${sessionIndex + 1} in week ${weekIndex + 1} mist een titel.`);
      if (!Number.isFinite(Number(session?.durationMinutes)) || Number(session.durationMinutes) < 1 || Number(session.durationMinutes) > 600) errors.push(`Sessie ${sessionIndex + 1} in week ${weekIndex + 1} heeft een ongeldige duur.`);
      if (!Array.isArray(session?.exercises)) errors.push(`Sessie ${sessionIndex + 1} in week ${weekIndex + 1} mist de oefeningenlijst.`);
    });
  });
  return { ok: errors.length === 0, errors };
}

/* ---------- Opslag in de Sport-store `coach` (schema 3) ---------- */

export interface CoachProfileRecord {
  id: 'coach-profile';
  kind: 'profile';
  profile: CoachProfile;
}

export interface CoachProgramRecord {
  id: string;
  kind: 'program';
  program: Program;
}

export type Recovery = 'goed' | 'matig' | 'slecht';
export const RECOVERY_OPTIONS: Recovery[] = ['goed', 'matig', 'slecht'];

/** Terugkoppeling op één training binnen een programma. */
export interface CoachFeedback {
  id: string;
  kind: 'feedback';
  programId: string;
  date: string;
  completed: boolean;
  durationMinutes: number;
  /** 1–10, of 0 als niet ingevuld. */
  rpe: number;
  recovery: Recovery;
  symptomType: SessionSymptom;
  note: string;
}

export type CoachRecord = CoachProfileRecord | CoachProgramRecord | CoachFeedback;

const isDay = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;

export function isCoachFeedback(value: unknown): value is CoachFeedback {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<CoachFeedback>;
  return (
    item.kind === 'feedback' && typeof item.id === 'string' && !!item.id && item.id.length <= 80 &&
    typeof item.programId === 'string' && !!item.programId && item.programId.length <= 80 && isDay(item.date) &&
    typeof item.completed === 'boolean' && Number.isInteger(item.durationMinutes) && item.durationMinutes! >= 0 && item.durationMinutes! <= 600 &&
    Number.isInteger(item.rpe) && item.rpe! >= 0 && item.rpe! <= 10 && includes(RECOVERY_OPTIONS, item.recovery) &&
    includes(SESSION_SYMPTOMS, item.symptomType) && typeof item.note === 'string' && item.note.length <= 1000
  );
}

export function isCoachProgramRecord(value: unknown): value is CoachProgramRecord {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<CoachProgramRecord>;
  return item.kind === 'program' && typeof item.id === 'string' && item.program?.id === item.id && validateProgram(item.program).ok &&
    includes(['draft', 'active', 'completed', 'replaced'] as const, item.program.status) && (item.program.startDate === undefined || isDay(item.program.startDate));
}

export function isCoachProfileRecord(value: unknown): value is CoachProfileRecord {
  return !!value && typeof value === 'object' && (value as CoachProfileRecord).id === 'coach-profile' && (value as CoachProfileRecord).kind === 'profile' && typeof (value as CoachProfileRecord).profile === 'object' && (value as CoachProfileRecord).profile !== null;
}

/** Controle van de store `coach` bij herstel. Ontbreekt in back-ups van schema 1 en 2. */
export function validateCoachStore(records: unknown): void {
  if (records === undefined) return;
  if (!Array.isArray(records) || records.length > 5000) throw new Error('Sport-back-up bevat ongeldige coachgegevens.');
  let profiles = 0;
  for (const record of records) {
    if (isCoachProfileRecord(record)) profiles += 1;
    else if (!isCoachProgramRecord(record) && !isCoachFeedback(record)) throw new Error('Sport-back-up bevat ongeldige coachgegevens.');
  }
  if (profiles > 1) throw new Error('Sport-back-up bevat ongeldige coachgegevens.');
}

/** Terugkoppeling zoals `assess` en `evaluateProgram` die lezen. */
export function feedbackLogs(feedback: CoachFeedback[]): CoachLog[] {
  return feedback.map((item) => ({
    // Geen discipline: telt niet dubbel mee als belasting (die komt uit vastgelegde trainingen), wel voor klachten.
    date: item.date,
    completed: item.completed,
    durationMinutes: item.durationMinutes,
    rpe: item.rpe,
    recovery: item.recovery,
    symptomType: item.symptomType,
    programId: item.programId
  }));
}

/* ---------- Inplannen ---------- */

function shiftDay(day: string, offset: number): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

/** Maandag van de week waarin het programma start: deze week op maandag, anders volgende week. */
export function programStartDate(today: string): string {
  const weekday = (new Date(`${today}T00:00:00.000Z`).getUTCDay() + 6) % 7;
  return weekday === 0 ? today : shiftDay(today, 7 - weekday);
}

/** Dag in de week (0 = maandag) voor sessie `index` van `count`: weekdag uit het profiel, anders verspreid over de week. */
export function sessionDayOffset(day: string | number, index: number, count: number): number {
  const named = typeof day === 'string' ? WEEKDAYS.indexOf(day.toLocaleLowerCase('nl-NL') as (typeof WEEKDAYS)[number]) : -1;
  if (named >= 0) return named;
  return Math.min(6, Math.floor((index * 7) / Math.max(1, count)));
}

export interface PlannedFromProgram {
  id: string;
  kind: 'plan';
  date: string;
  title: string;
  minutes: number;
  trainingId: null;
}

/**
 * Sessies van week `week` als geplande trainingen. Vaste id per sessie, dus opnieuw inplannen maakt geen dubbelen.
 * Dagen vóór `today` worden overgeslagen.
 */
export function plannedSessionsForWeek(program: Program, week: number, today: string): PlannedFromProgram[] {
  if (!program.startDate) return [];
  const programWeek = program.weeks.find((item) => item.week === week);
  if (!programWeek) return [];
  const weekStart = shiftDay(program.startDate, 7 * (week - 1));
  return programWeek.sessions
    .map((session, index) => ({
      id: `coach-${program.id}-${week}-${index + 1}`.slice(0, 64),
      kind: 'plan' as const,
      date: shiftDay(weekStart, sessionDayOffset(session.day, index, programWeek.sessions.length)),
      title: `Coach: ${session.title}`.slice(0, 100),
      minutes: Math.min(600, Math.max(1, Math.round(session.durationMinutes))),
      trainingId: null
    }))
    .filter((plan) => plan.date >= today);
}

/** Huidige programmaweek (1-gebaseerd) voor `today`, of null vóór de start of na het einde. */
export function currentProgramWeek(program: Program, today: string): number | null {
  if (!program.startDate || today < program.startDate) return null;
  const days = Math.round((Date.parse(`${today}T00:00:00.000Z`) - Date.parse(`${program.startDate}T00:00:00.000Z`)) / 86_400_000);
  const week = Math.floor(days / 7) + 1;
  return week <= program.weeks.length ? week : null;
}
