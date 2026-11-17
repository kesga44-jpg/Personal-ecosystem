/**
 * Lichaam & gezondheid (ADR 0020): één dagregistratie per datum en een klein profiel.
 * Bijzondere persoonsgegevens: alles blijft op het apparaat. Geen externe diensten, geen logs.
 */

export interface BodyDay {
  /** Gelijk aan `date`: per dag één registratie. */
  id: string;
  date: string;
  weightKg: number | null;
  waistCm: number | null;
  restingHr: number | null;
  systolic: number | null;
  diastolic: number | null;
  sleepHours: number | null;
  /** 1 (slecht) t/m 5 (uitstekend). */
  sleepQuality: number | null;
  /** 1 (uitgeput) t/m 5 (volledig hersteld). */
  recovery: number | null;
  note: string;
  updatedAt: string;
}

export interface BodyProfile {
  id: 'profile';
  heightCm: number | null;
  goalWeightKg: number | null;
}

export type MeasureField = 'weightKg' | 'waistCm' | 'restingHr' | 'systolic' | 'diastolic' | 'sleepHours' | 'sleepQuality' | 'recovery';

interface FieldRule {
  label: string;
  unit: string;
  min: number;
  max: number;
  /** Aantal decimalen dat wordt bewaard. */
  decimals: number;
}

export const fieldRules: Record<MeasureField, FieldRule> = {
  weightKg: { label: 'Gewicht', unit: 'kg', min: 20, max: 400, decimals: 1 },
  waistCm: { label: 'Buikomvang', unit: 'cm', min: 30, max: 250, decimals: 1 },
  restingHr: { label: 'Rusthartslag', unit: 'bpm', min: 25, max: 220, decimals: 0 },
  systolic: { label: 'Bovendruk', unit: 'mmHg', min: 60, max: 260, decimals: 0 },
  diastolic: { label: 'Onderdruk', unit: 'mmHg', min: 30, max: 160, decimals: 0 },
  sleepHours: { label: 'Slaap', unit: 'uur', min: 0, max: 24, decimals: 2 },
  sleepQuality: { label: 'Slaapkwaliteit', unit: '', min: 1, max: 5, decimals: 0 },
  recovery: { label: 'Herstel', unit: '', min: 1, max: 5, decimals: 0 }
};

export const MEASURE_FIELDS = Object.keys(fieldRules) as MeasureField[];
export const NOTE_MAX = 500;

export const scaleLabels: Record<'sleepQuality' | 'recovery', string[]> = {
  sleepQuality: ['', 'Slecht', 'Matig', 'Redelijk', 'Goed', 'Uitstekend'],
  recovery: ['', 'Uitgeput', 'Moe', 'Gemiddeld', 'Fit', 'Volledig hersteld']
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isDateKey(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** Leest een invoerveld. Leeg = null. Komma als decimaalteken is toegestaan. Buiten bereik = fout. */
export function parseMeasure(field: MeasureField, raw: string): number | null {
  const text = raw.trim().replace(',', '.');
  if (!text) return null;
  const rule = fieldRules[field];
  const value = Number(text);
  if (!Number.isFinite(value) || value < rule.min || value > rule.max) {
    throw new Error(`${rule.label} moet tussen ${rule.min} en ${rule.max}${rule.unit ? ` ${rule.unit}` : ''} liggen.`);
  }
  if (rule.decimals === 0 && !Number.isInteger(value)) throw new Error(`${rule.label} moet een heel getal zijn.`);
  return round(value, rule.decimals);
}

/** Controleert een dagregistratie volledig. Wordt gebruikt bij opslaan én bij herstel van een back-up. */
export function validateBodyDay(value: unknown, today?: string): asserts value is BodyDay {
  if (!value || typeof value !== 'object') throw new Error('Ongeldige dagregistratie.');
  const day = value as Partial<BodyDay>;
  if (!isDateKey(day.date) || day.id !== day.date) throw new Error('Dagregistratie heeft een ongeldige datum.');
  if (today && day.date > today) throw new Error('Een registratie kan niet in de toekomst liggen.');
  let filled = 0;
  for (const field of MEASURE_FIELDS) {
    const measure = day[field];
    if (measure === null) continue;
    const rule = fieldRules[field];
    if (typeof measure !== 'number' || !Number.isFinite(measure) || measure < rule.min || measure > rule.max) {
      throw new Error(`${rule.label} heeft een ongeldige waarde.`);
    }
    if (rule.decimals === 0 && !Number.isInteger(measure)) throw new Error(`${rule.label} moet een heel getal zijn.`);
    filled += 1;
  }
  if ((day.systolic === null) !== (day.diastolic === null)) throw new Error('Vul bij bloeddruk zowel de boven- als de onderdruk in.');
  if (day.systolic !== null && day.diastolic !== null && day.diastolic! >= day.systolic!) {
    throw new Error('De onderdruk moet lager zijn dan de bovendruk.');
  }
  if (typeof day.note !== 'string' || day.note.length > NOTE_MAX) throw new Error(`Een notitie mag maximaal ${NOTE_MAX} tekens hebben.`);
  if (filled === 0 && !day.note.trim()) throw new Error('Vul minstens één meting of een notitie in.');
  if (typeof day.updatedAt !== 'string' || !Number.isFinite(Date.parse(day.updatedAt))) throw new Error('Dagregistratie heeft een ongeldig tijdstip.');
}

export function validateBodyProfile(value: unknown): asserts value is BodyProfile {
  if (!value || typeof value !== 'object') throw new Error('Ongeldig profiel.');
  const profile = value as Partial<BodyProfile>;
  if (profile.id !== 'profile') throw new Error('Ongeldig profiel.');
  const height = profile.heightCm;
  if (!(height === null || (typeof height === 'number' && Number.isFinite(height) && height >= 50 && height <= 250))) {
    throw new Error('Lengte moet tussen 50 en 250 cm liggen.');
  }
  const goal = profile.goalWeightKg;
  if (!(goal === null || (typeof goal === 'number' && Number.isFinite(goal) && goal >= 20 && goal <= 400))) {
    throw new Error('Streefgewicht moet tussen 20 en 400 kg liggen.');
  }
}

export function validateLichaamBackup(input: unknown): void {
  if (!input || typeof input !== 'object' || !('stores' in input) || !input.stores || typeof input.stores !== 'object') {
    throw new Error('Back-up van Lichaam heeft geen geldige gegevenssectie.');
  }
  const stores = input.stores as Record<string, unknown>;
  if (!Array.isArray(stores.days) || !Array.isArray(stores.profile)) throw new Error('Back-up van Lichaam mist dagen of profiel.');
  for (const day of stores.days) validateBodyDay(day);
  if (stores.profile.length > 1) throw new Error('Back-up van Lichaam bevat meer dan één profiel.');
  for (const profile of stores.profile) validateBodyProfile(profile);
}

export function emptyDay(date: string): BodyDay {
  return {
    id: date,
    date,
    weightKg: null,
    waistCm: null,
    restingHr: null,
    systolic: null,
    diastolic: null,
    sleepHours: null,
    sleepQuality: null,
    recovery: null,
    note: '',
    updatedAt: new Date(0).toISOString()
  };
}

function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** Datums van oud naar nieuw, eindigend op `today`. */
export function dateRange(today: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => shiftDate(today, index - (count - 1)));
}

function sortedWith(days: BodyDay[], field: MeasureField): BodyDay[] {
  return days.filter((day) => day[field] !== null).sort((a, b) => a.date.localeCompare(b.date));
}

export function latest(days: BodyDay[], field: MeasureField): { date: string; value: number } | null {
  const list = sortedWith(days, field);
  const last = list.at(-1);
  return last ? { date: last.date, value: last[field]! } : null;
}

/** Gemiddelde van de ingevulde waarden in de laatste `window` dagen t/m `today`. */
export function average(days: BodyDay[], field: MeasureField, today: string, window = 7): { value: number; count: number } | null {
  const from = shiftDate(today, -(window - 1));
  const values = days.filter((day) => day.date >= from && day.date <= today && day[field] !== null).map((day) => day[field]!);
  if (!values.length) return null;
  return { value: round(values.reduce((sum, value) => sum + value, 0) / values.length, 1), count: values.length };
}

/**
 * Verandering van een meting over een periode: laatste waarde min de eerste waarde binnen de periode.
 * Geeft null als er minder dan twee metingen zijn.
 */
export function change(days: BodyDay[], field: MeasureField, today: string, period = 30): number | null {
  const from = shiftDate(today, -(period - 1));
  const list = sortedWith(days, field).filter((day) => day.date >= from && day.date <= today);
  if (list.length < 2) return null;
  return round(list.at(-1)![field]! - list[0]![field]!, fieldRules[field].decimals || 1);
}

/** Alle ingevulde waarden in de periode, voor een lijngrafiek (alleen echte metingen, geen nullen). */
export function measuredSeries(days: BodyDay[], field: MeasureField, today: string, period = 90): { label: string; value: number }[] {
  const from = shiftDate(today, -(period - 1));
  return sortedWith(days, field)
    .filter((day) => day.date >= from && day.date <= today)
    .map((day) => ({ label: `${day.date.slice(8, 10)}-${day.date.slice(5, 7)}`, value: day[field]! }));
}

/** Slaap per dag (0 als niets is ingevuld) voor een staafgrafiek. */
export function sleepSeries(days: BodyDay[], today: string, count = 14): { label: string; value: number }[] {
  const byDate = new Map(days.map((day) => [day.date, day.sleepHours]));
  return dateRange(today, count).map((date) => ({ label: date.slice(8, 10), value: byDate.get(date) ?? 0 }));
}

export function bmi(weightKg: number, heightCm: number): number {
  const meters = heightCm / 100;
  return round(weightKg / (meters * meters), 1);
}

/** WHO-indeling voor volwassenen. Alleen een grove indicatie. */
export function bmiCategory(value: number): string {
  if (value < 18.5) return 'ondergewicht';
  if (value < 25) return 'gezond gewicht';
  if (value < 30) return 'overgewicht';
  return 'obesitas';
}

/** Leescontract voor het dashboard (DATA_OWNERSHIP.md): alleen óf er vandaag iets is ingevuld. */
export function filledToday(days: Pick<BodyDay, 'date'>[], today: string): boolean {
  return days.some((day) => day.date === today);
}

export function formatMeasure(field: MeasureField, value: number): string {
  const rule = fieldRules[field];
  const text = new Intl.NumberFormat('nl-NL', { maximumFractionDigits: rule.decimals }).format(value);
  return rule.unit ? `${text} ${rule.unit}` : text;
}

export function formatSigned(value: number, unit: string): string {
  const text = new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 1, signDisplay: 'exceptZero' }).format(value);
  return `${text} ${unit}`;
}
