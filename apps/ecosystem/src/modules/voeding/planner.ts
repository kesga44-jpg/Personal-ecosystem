/**
 * Persoonlijke voedingsplannen en geplande maaltijden (ADR 0026 § 1, § 3). Alleen de eigen planning:
 * het gedeelde huishoudweekmenu blijft in Samen Thuis (K-D).
 */
import { isDateKey, isMeal, type Meal } from './domain';
import { UNITS, type Unit } from './schema2';

export const PLAN_STATUSES = ['concept', 'bevestigd'] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];
export const MAX_PLAN_DAYS = 62;

export interface PlanTargets {
  kcal: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
}

export interface NutritionPlan {
  id: string;
  name: string;
  from: string;
  to: string;
  targets: PlanTargets;
  mealsPerDay: number;
  status: PlanStatus;
  generated: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PlannedItem {
  productId: string;
  amount: number;
  unit: Unit;
}

export interface PlannedMeal {
  id: string;
  planId: string;
  date: string;
  meal: Meal;
  /** Porties van het recept; bij losse ingrediënten 1. */
  servings: number;
  recipeId: string | null;
  items: PlannedItem[];
  note: string;
  createdAt: string;
  updatedAt: string;
}

function fail(message: string): never {
  throw new Error(message);
}

function isTime(value: unknown): boolean {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000) + 1;
}

const TARGET_LIMITS: Record<keyof PlanTargets, [number, number, string]> = {
  kcal: [800, 6000, 'Energie'],
  protein: [10, 400, 'Eiwit'],
  carbs: [0, 1000, 'Koolhydraten'],
  fat: [0, 400, 'Vet']
};

export function validatePlanTargets(value: unknown): asserts value is PlanTargets {
  if (!value || typeof value !== 'object') fail('Doelen van het plan ontbreken.');
  for (const [key, [min, max, label]] of Object.entries(TARGET_LIMITS) as [keyof PlanTargets, [number, number, string]][]) {
    const target = (value as Record<string, unknown>)[key];
    if (!(target === null || (Number.isInteger(target) && (target as number) >= min && (target as number) <= max))) fail(`Doel voor ${label.toLowerCase()} moet tussen ${min} en ${max} liggen.`);
  }
}

export function validatePlan(value: unknown): asserts value is NutritionPlan {
  if (!value || typeof value !== 'object') fail('Ongeldig voedingsplan.');
  const p = value as Partial<NutritionPlan>;
  if (typeof p.id !== 'string' || !p.id || p.id.length > 120) fail('Plan heeft een ongeldig ID.');
  if (typeof p.name !== 'string' || !p.name.trim() || p.name.length > 120) fail('Geef het plan een naam (maximaal 120 tekens).');
  if (!isDateKey(p.from) || !isDateKey(p.to)) fail('Kies een begin- en einddatum.');
  if (p.to < p.from) fail('De einddatum ligt voor de begindatum.');
  if (daysBetween(p.from, p.to) > MAX_PLAN_DAYS) fail(`Een plan duurt maximaal ${MAX_PLAN_DAYS} dagen.`);
  validatePlanTargets(p.targets);
  if (!(Number.isInteger(p.mealsPerDay) && (p.mealsPerDay as number) >= 1 && (p.mealsPerDay as number) <= 8)) fail('Maaltijden per dag moet tussen 1 en 8 liggen.');
  if (!(PLAN_STATUSES as readonly string[]).includes(p.status as string)) fail('Plan heeft een onbekende status.');
  if (typeof p.generated !== 'boolean') fail('Plan mist of het gegenereerd is.');
  if (!isTime(p.createdAt) || !isTime(p.updatedAt)) fail('Plan heeft een ongeldig tijdstip.');
}

export function validatePlannedItem(value: unknown): asserts value is PlannedItem {
  if (!value || typeof value !== 'object') fail('Ongeldige regel in een geplande maaltijd.');
  const item = value as Partial<PlannedItem>;
  if (typeof item.productId !== 'string' || !item.productId) fail('Kies een ingrediënt.');
  if (typeof item.amount !== 'number' || !Number.isFinite(item.amount) || item.amount <= 0 || item.amount > 10_000) fail('Hoeveelheid moet tussen 0 en 10.000 liggen.');
  if (!(UNITS as readonly string[]).includes(item.unit as string)) fail('Kies een eenheid.');
}

export function validatePlannedMeal(value: unknown): asserts value is PlannedMeal {
  if (!value || typeof value !== 'object') fail('Ongeldige geplande maaltijd.');
  const m = value as Partial<PlannedMeal>;
  if (typeof m.id !== 'string' || !m.id || m.id.length > 120) fail('Geplande maaltijd heeft een ongeldig ID.');
  if (typeof m.planId !== 'string' || !m.planId) fail('Geplande maaltijd hoort niet bij een plan.');
  if (!isDateKey(m.date)) fail('Geplande maaltijd heeft een ongeldige datum.');
  if (!isMeal(m.meal)) fail('Kies een maaltijdmoment.');
  if (typeof m.servings !== 'number' || !Number.isFinite(m.servings) || m.servings <= 0 || m.servings > 20) fail('Porties moeten tussen 0 en 20 liggen.');
  if (!(m.recipeId === null || (typeof m.recipeId === 'string' && m.recipeId))) fail('Geplande maaltijd heeft een ongeldig recept.');
  if (!Array.isArray(m.items) || m.items.length > 30) fail('Geplande maaltijd heeft ongeldige ingrediënten.');
  for (const item of m.items) validatePlannedItem(item);
  if ((m.recipeId === null) === (m.items.length === 0)) fail('Kies een recept of losse ingrediënten, niet allebei en niet geen van beide.');
  if (typeof m.note !== 'string' || m.note.length > 500) fail('Notitie is te lang.');
  if (!isTime(m.createdAt) || !isTime(m.updatedAt)) fail('Geplande maaltijd heeft een ongeldig tijdstip.');
}

