/**
 * Voeding (ADR 0020, ADR 0026): persoonlijke inname, ingrediënten, recepten en een persoonlijke maaltijdplanning.
 * Het gedeelde huishoudweekmenu, opgeslagen boodschappenlijsten en voorraad blijven in Samen Thuis (K-D);
 * een boodschappenlijst wordt hier alleen tijdelijk afgeleid uit de eigen planning en niet opgeslagen.
 * Gegevens blijven op het apparaat; naar Open Food Facts gaat alleen een barcode of zoekterm.
 */
import type { Nutrients, OffProduct } from './product';
import { validateIngredientFields, validatePrefs, type PlannerPrefs } from './schema2';

export const MEALS = ['ontbijt', 'lunch', 'diner', 'tussendoor'] as const;
export type Meal = (typeof MEALS)[number];
export const mealLabels: Record<Meal, string> = { ontbijt: 'Ontbijt', lunch: 'Lunch', diner: 'Diner', tussendoor: 'Tussendoor' };

export interface FoodProduct {
  id: string;
  name: string;
  brand: string;
  barcode: string | null;
  /** Per 100 g of 100 ml. */
  per100: Nutrients;
  servingGrams: number | null;
  source: 'off' | 'eigen';
  updatedAt: string;
}

export interface FoodEntry {
  id: string;
  date: string;
  meal: Meal;
  productId: string;
  /** Kopie van naam en waarden op het moment van eten, zodat de geschiedenis niet verandert. */
  name: string;
  per100: Nutrients;
  grams: number;
  createdAt: string;
}

export interface FoodSettings {
  id: 'settings';
  kcalTarget: number | null;
  proteinTarget: number | null;
  /** Voorkeuren en uitsluitingen voor de automatische planner (schema 2, optioneel). */
  planner?: PlannerPrefs;
}

export const NUTRIENT_KEYS = ['kcal', 'protein', 'carbs', 'fat'] as const;
export const nutrientLabels: Record<keyof Nutrients, string> = { kcal: 'Energie', protein: 'Eiwit', carbs: 'Koolhydraten', fat: 'Vet' };
const MAX_PER_100: Record<keyof Nutrients, number> = { kcal: 900, protein: 100, carbs: 100, fat: 100 };

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export function isDateKey(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function isMeal(value: unknown): value is Meal {
  return typeof value === 'string' && (MEALS as readonly string[]).includes(value);
}

/** Getal uit een invoerveld; komma mag. Leeg = null. */
export function parseNumber(raw: string): number | null {
  const text = raw.trim().replace(',', '.');
  if (!text) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : Number.NaN;
}

export function validateNutrients(value: unknown): asserts value is Nutrients {
  if (!value || typeof value !== 'object') throw new Error('Voedingswaarden ontbreken.');
  const nutrients = value as Record<string, unknown>;
  for (const key of NUTRIENT_KEYS) {
    const amount = nutrients[key];
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0 || amount > MAX_PER_100[key]) {
      throw new Error(`${nutrientLabels[key]} per 100 g moet tussen 0 en ${MAX_PER_100[key]} liggen.`);
    }
  }
  const macros = (nutrients.protein as number) + (nutrients.carbs as number) + (nutrients.fat as number);
  if (macros > 100.5) throw new Error('Eiwit, koolhydraten en vet samen kunnen niet meer dan 100 g per 100 g zijn.');
}

export function validateProduct(value: unknown): asserts value is FoodProduct {
  if (!value || typeof value !== 'object') throw new Error('Ongeldig product.');
  const product = value as Partial<FoodProduct>;
  if (typeof product.id !== 'string' || !product.id || product.id.length > 120) throw new Error('Product heeft een ongeldig ID.');
  if (typeof product.name !== 'string' || !product.name.trim() || product.name.length > 120) throw new Error('Geef het product een naam (maximaal 120 tekens).');
  if (typeof product.brand !== 'string' || product.brand.length > 80) throw new Error('Merk is te lang.');
  if (!(product.barcode === null || (typeof product.barcode === 'string' && /^\d{8,14}$/.test(product.barcode)))) throw new Error('Barcode moet 8 tot 14 cijfers zijn.');
  if (product.source !== 'off' && product.source !== 'eigen') throw new Error('Product heeft een onbekende bron.');
  if (!(product.servingGrams === null || (typeof product.servingGrams === 'number' && product.servingGrams > 0 && product.servingGrams <= 2000))) {
    throw new Error('Portie moet tussen 0 en 2000 g liggen.');
  }
  validateNutrients(product.per100);
  validateIngredientFields(product);
  if (typeof product.updatedAt !== 'string' || !Number.isFinite(Date.parse(product.updatedAt))) throw new Error('Product heeft een ongeldig tijdstip.');
}

export function validateFoodEntry(value: unknown, today?: string): asserts value is FoodEntry {
  if (!value || typeof value !== 'object') throw new Error('Ongeldige registratie.');
  const entry = value as Partial<FoodEntry>;
  if (typeof entry.id !== 'string' || !entry.id || entry.id.length > 120) throw new Error('Registratie heeft een ongeldig ID.');
  if (!isDateKey(entry.date)) throw new Error('Registratie heeft een ongeldige datum.');
  if (today && entry.date > today) throw new Error('Je kunt niet vooruit registreren.');
  if (!isMeal(entry.meal)) throw new Error('Kies een maaltijd.');
  if (typeof entry.productId !== 'string' || !entry.productId) throw new Error('Registratie mist een product.');
  if (typeof entry.name !== 'string' || !entry.name.trim() || entry.name.length > 120) throw new Error('Registratie mist een naam.');
  if (typeof entry.grams !== 'number' || !Number.isFinite(entry.grams) || entry.grams <= 0 || entry.grams > 5000) throw new Error('Hoeveelheid moet tussen 0 en 5000 g liggen.');
  validateNutrients(entry.per100);
  if (typeof entry.createdAt !== 'string' || !Number.isFinite(Date.parse(entry.createdAt))) throw new Error('Registratie heeft een ongeldig tijdstip.');
  const links = value as { recipeId?: unknown; plannedMealId?: unknown; servings?: unknown };
  if (links.recipeId !== undefined && (typeof links.recipeId !== 'string' || !links.recipeId)) throw new Error('Registratie heeft een ongeldig recept.');
  if (links.plannedMealId !== undefined && (typeof links.plannedMealId !== 'string' || !links.plannedMealId)) throw new Error('Registratie heeft een ongeldige geplande maaltijd.');
  if (links.servings !== undefined && !(typeof links.servings === 'number' && links.servings > 0 && links.servings <= 20)) throw new Error('Registratie heeft een ongeldig aantal porties.');
}

export function validateSettings(value: unknown): asserts value is FoodSettings {
  if (!value || typeof value !== 'object' || (value as FoodSettings).id !== 'settings') throw new Error('Ongeldige instellingen.');
  const settings = value as FoodSettings;
  if (!(settings.kcalTarget === null || (Number.isInteger(settings.kcalTarget) && settings.kcalTarget >= 800 && settings.kcalTarget <= 6000))) {
    throw new Error('Doel voor energie moet tussen 800 en 6000 kcal liggen.');
  }
  if (!(settings.proteinTarget === null || (Number.isInteger(settings.proteinTarget) && settings.proteinTarget >= 10 && settings.proteinTarget <= 400))) {
    throw new Error('Doel voor eiwit moet tussen 10 en 400 g liggen.');
  }
  if (settings.planner !== undefined) validatePrefs(settings.planner);
}

export function productFromOff(product: OffProduct, now = new Date()): FoodProduct {
  return {
    id: `off:${product.code}`,
    name: product.name,
    brand: product.brand,
    barcode: product.code,
    per100: product.per100,
    servingGrams: product.servingGrams,
    source: 'off',
    updatedAt: now.toISOString()
  };
}

export function makeEntry(product: FoodProduct, input: { id: string; date: string; meal: Meal; grams: number }, now = new Date()): FoodEntry {
  return {
    id: input.id,
    date: input.date,
    meal: input.meal,
    productId: product.id,
    name: product.brand ? `${product.name} (${product.brand})` : product.name,
    per100: { ...product.per100 },
    grams: Math.round(input.grams * 10) / 10,
    createdAt: now.toISOString()
  };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Voedingswaarden voor de gegeten hoeveelheid. */
export function nutrientsFor(entry: Pick<FoodEntry, 'per100' | 'grams'>): Nutrients {
  const factor = entry.grams / 100;
  return {
    kcal: Math.round(entry.per100.kcal * factor),
    protein: round1(entry.per100.protein * factor),
    carbs: round1(entry.per100.carbs * factor),
    fat: round1(entry.per100.fat * factor)
  };
}

export function sumNutrients(entries: Pick<FoodEntry, 'per100' | 'grams'>[]): Nutrients {
  const total = entries.reduce<Nutrients>(
    (sum, entry) => {
      const part = nutrientsFor(entry);
      return { kcal: sum.kcal + part.kcal, protein: sum.protein + part.protein, carbs: sum.carbs + part.carbs, fat: sum.fat + part.fat };
    },
    { kcal: 0, protein: 0, carbs: 0, fat: 0 }
  );
  return { kcal: total.kcal, protein: round1(total.protein), carbs: round1(total.carbs), fat: round1(total.fat) };
}

export function entriesOn(entries: FoodEntry[], date: string): FoodEntry[] {
  return entries.filter((entry) => entry.date === date).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function byMeal(entries: FoodEntry[]): Record<Meal, FoodEntry[]> {
  return Object.fromEntries(MEALS.map((meal) => [meal, entries.filter((entry) => entry.meal === meal)])) as Record<Meal, FoodEntry[]>;
}

/** Aandeel van eiwit, koolhydraten en vet in de energie (4/4/9 kcal per gram), in procenten. */
export function macroSplit(total: Nutrients): { protein: number; carbs: number; fat: number } | null {
  const energy = total.protein * 4 + total.carbs * 4 + total.fat * 9;
  if (energy <= 0) return null;
  const protein = Math.round(((total.protein * 4) / energy) * 100);
  const fat = Math.round(((total.fat * 9) / energy) * 100);
  return { protein, carbs: 100 - protein - fat, fat };
}

function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function dateRange(today: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => shiftDate(today, index - (count - 1)));
}

/** Energie per dag voor een staafgrafiek. */
export function kcalSeries(entries: FoodEntry[], today: string, count = 14): { date: string; label: string; value: number }[] {
  return dateRange(today, count).map((date) => ({ date, label: date.slice(8, 10), value: sumNutrients(entries.filter((entry) => entry.date === date)).kcal }));
}

/** Gemiddelde energie over dagen waarop iets is geregistreerd (lege dagen tellen niet mee). */
export function averageKcal(entries: FoodEntry[], today: string, count = 7): { value: number; days: number } | null {
  const days = kcalSeries(entries, today, count).filter((day) => entries.some((entry) => entry.date === day.date));
  if (!days.length) return null;
  return { value: Math.round(days.reduce((sum, day) => sum + day.value, 0) / days.length), days: days.length };
}

/** Recent gebruikte producten, nieuwste eerst, voor snel opnieuw toevoegen. */
export function recentProducts(entries: FoodEntry[], products: FoodProduct[], limit = 8): FoodProduct[] {
  const byId = new Map(products.map((product) => [product.id, product]));
  const seen = new Set<string>();
  const result: FoodProduct[] = [];
  for (const entry of [...entries].sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
    const product = byId.get(entry.productId);
    if (product && !seen.has(product.id)) {
      seen.add(product.id);
      result.push(product);
      if (result.length === limit) break;
    }
  }
  return result;
}

/** Leescontract voor het dashboard (DATA_OWNERSHIP.md): alleen óf er vandaag iets is geregistreerd. */
export function loggedToday(entries: Pick<FoodEntry, 'date'>[], today: string): boolean {
  return entries.some((entry) => entry.date === today);
}
