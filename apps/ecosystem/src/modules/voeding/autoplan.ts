/**
 * Automatische planner (ADR 0026 § 4): regelgebaseerd, geen AI, herhaalbaar.
 * Dezelfde invoer geeft hetzelfde plan. Het resultaat is altijd een concept dat pas na bevestiging
 * door de eigenaar wordt opgeslagen. Lukt een dag niet, dan zegt de planner waarom en vult hij niets op.
 */
import { MEALS, type Meal } from './domain';
import type { Nutrients } from './product';
import { MAX_PLAN_DAYS, type NutritionPlan, type PlanTargets, type PlannedMeal } from './planner';
import { convertAmount, ingredientsOf, recipeAllergens, recipeNutrition, type Ingredient, type Recipe, type RecipeIngredient } from './recipes';

export { defaultPrefs, validatePrefs, type PlannerPrefs } from './schema2';
import type { PlannerPrefs } from './schema2';

/** Prijs per portie in centen, of null als niet van elk ingrediënt de prijs bekend is. */
export function costPerServing(recipe: Recipe, lines: readonly RecipeIngredient[], products: readonly Ingredient[]): number | null {
  const byId = new Map(products.map((product) => [product.id, product]));
  let cents = 0;
  for (const line of ingredientsOf(recipe.id, lines)) {
    const product = byId.get(line.productId);
    if (!product || product.pricePerUnitCents === undefined || product.pricePerUnitCents === null || !product.priceUnit) return null;
    if (product.priceUnit === 'stuk') {
      if (line.unit === 'stuk' || line.unit === 'portie') cents += line.amount * product.pricePerUnitCents;
      else {
        const portion = product.portionGrams ?? product.servingGrams;
        if (!portion) return null;
        cents += (line.amount / portion) * product.pricePerUnitCents;
      }
      continue;
    }
    const conversion = convertAmount(product, line.amount, line.unit);
    if (!conversion.ok) return null;
    cents += (conversion.grams / 1000) * product.pricePerUnitCents;
  }
  return Math.round(cents / recipe.servings);
}

export interface Candidate {
  recipe: Recipe;
  perServing: Nutrients;
  cost: number | null;
  favorite: boolean;
}

export interface Exclusion {
  recipe: Recipe;
  reason: string;
}

/** Stap 1: filteren. Elk recept met een uitgesloten ingrediënt, label of allergeen valt af, net als onberekenbare recepten. */
export function candidates(recipes: readonly Recipe[], lines: readonly RecipeIngredient[], products: readonly Ingredient[], prefs: PlannerPrefs): { ok: Candidate[]; excluded: Exclusion[] } {
  const ok: Candidate[] = [];
  const excluded: Exclusion[] = [];
  const excludedProducts = new Set(prefs.excludedProductIds);
  for (const recipe of [...recipes].sort((a, b) => a.name.localeCompare(b.name, 'nl-NL') || a.id.localeCompare(b.id))) {
    const own = ingredientsOf(recipe.id, lines);
    const bad = own.find((line) => excludedProducts.has(line.productId));
    if (bad) {
      excluded.push({ recipe, reason: 'bevat een uitgesloten ingrediënt' });
      continue;
    }
    const label = recipe.labels.find((item) => prefs.excludedLabels.includes(item));
    if (label) {
      excluded.push({ recipe, reason: `label ${label} is uitgesloten` });
      continue;
    }
    const allergen = recipeAllergens(recipe, own, products).find((item) => prefs.excludedAllergens.includes(item));
    if (allergen) {
      excluded.push({ recipe, reason: `bevat ${allergen}` });
      continue;
    }
    const nutrition = recipeNutrition(recipe, own, products);
    if (!own.length || nutrition.problems.length || nutrition.perServing.kcal <= 0) {
      excluded.push({ recipe, reason: 'voedingswaarden niet volledig te berekenen' });
      continue;
    }
    const cost = costPerServing(recipe, lines, products);
    if (prefs.budgetPerDayCents !== null && cost === null) {
      excluded.push({ recipe, reason: 'prijs onbekend terwijl er een budget is' });
      continue;
    }
    ok.push({ recipe, perServing: nutrition.perServing, cost, favorite: recipe.favorite || recipe.labels.some((item) => prefs.favoriteLabels.includes(item)) });
  }
  return { ok, excluded };
}

/** Maaltijdmomenten voor het aantal maaltijden per dag; vanaf vijf maaltijden komen er extra tussendoortjes bij. */
export function slotsFor(mealsPerDay: number): Meal[] {
  const base: Meal[] = mealsPerDay === 1 ? ['diner'] : mealsPerDay === 2 ? ['lunch', 'diner'] : mealsPerDay === 3 ? ['ontbijt', 'lunch', 'diner'] : ['ontbijt', 'lunch', 'diner', 'tussendoor'];
  while (base.length < mealsPerDay) base.push('tussendoor');
  return base;
}

/** Past een recept bij een moment? Een recept met categorie of label "ontbijt", "lunch", "diner" of "tussendoor" alleen daar; anders overal. */
export function fitsSlot(recipe: Recipe, slot: Meal, prefs: PlannerPrefs): boolean {
  const marks = [recipe.category.toLocaleLowerCase('nl-NL'), ...recipe.labels].filter((item) => (MEALS as readonly string[]).includes(item));
  if (marks.length && !marks.includes(slot)) return false;
  const max = prefs.maxMinutes[slot];
  if (max !== undefined && (recipe.prepMinutes === null || recipe.prepMinutes > max)) return false;
  return true;
}

function weekKey(date: string): string {
  const day = new Date(`${date}T12:00:00Z`);
  const weekday = (day.getUTCDay() + 6) % 7;
  day.setUTCDate(day.getUTCDate() - weekday);
  return day.toISOString().slice(0, 10);
}

const SERVING_STEP = 0.25;
const MIN_SERVINGS = 0.5;
const MAX_SERVINGS = 3;
const MAX_COMBINATIONS = 4000;

export interface DayResult {
  date: string;
  meals: { slot: Meal; recipe: Recipe; servings: number }[];
  total: Nutrients;
  cost: number | null;
  reason: string | null;
}

interface Choice {
  picks: Candidate[];
  factor: number;
  total: Nutrients;
  cost: number | null;
  score: number;
  ok: boolean;
  reason: string | null;
}

function evaluate(picks: Candidate[], targets: PlanTargets, budget: number | null): Choice {
  const one = picks.reduce<Nutrients>((sum, c) => ({ kcal: sum.kcal + c.perServing.kcal, protein: sum.protein + c.perServing.protein, carbs: sum.carbs + c.perServing.carbs, fat: sum.fat + c.perServing.fat }), { kcal: 0, protein: 0, carbs: 0, fat: 0 });
  let factor = targets.kcal ? targets.kcal / one.kcal : 1;
  factor = Math.min(MAX_SERVINGS, Math.max(MIN_SERVINGS, Math.round(factor / SERVING_STEP) * SERVING_STEP));
  const total = { kcal: Math.round(one.kcal * factor), protein: Math.round(one.protein * factor * 10) / 10, carbs: Math.round(one.carbs * factor * 10) / 10, fat: Math.round(one.fat * factor * 10) / 10 };
  const cost = picks.every((c) => c.cost !== null) ? Math.round(picks.reduce((sum, c) => sum + (c.cost as number), 0) * factor) : null;
  let score = 0;
  let reason: string | null = null;
  if (targets.kcal) {
    const deviation = Math.abs(total.kcal / targets.kcal - 1);
    score += deviation;
    if (deviation > 0.1) reason = 'energie komt niet binnen 10 % van het doel';
  }
  if (targets.protein) {
    const ratio = total.protein / targets.protein;
    score += Math.max(0, 0.9 - ratio) * 2;
    if (ratio < 0.9 && !reason) reason = 'te weinig recepten met genoeg eiwit';
  }
  for (const key of ['carbs', 'fat'] as const) if (targets[key]) score += Math.abs(total[key] / (targets[key] as number) - 1) * 0.25;
  if (budget !== null && cost !== null && cost > budget) {
    score += 1;
    if (!reason) reason = 'boven het budget per dag';
  }
  score -= picks.filter((c) => c.favorite).length * 0.01;
  return { picks, factor, total, cost, score, ok: reason === null, reason };
}

/**
 * Stap 2 en 3: per dag de combinatie kiezen die de doelen het best benadert, in een vaste volgorde.
 * Elk gekozen recept krijgt dezelfde portiefactor (stappen van 0,25; tussen 0,5 en 3 porties).
 */
export function generatePlan(input: { from: string; to: string; targets: PlanTargets; mealsPerDay: number }, recipes: readonly Recipe[], lines: readonly RecipeIngredient[], products: readonly Ingredient[], prefs: PlannerPrefs): { days: DayResult[]; excluded: Exclusion[] } {
  const { ok, excluded } = candidates(recipes, lines, products, prefs);
  const slots = slotsFor(input.mealsPerDay);
  const used = new Map<string, number>();
  const days: DayResult[] = [];
  const day = new Date(`${input.from}T12:00:00Z`);
  while (day.toISOString().slice(0, 10) <= input.to && days.length < MAX_PLAN_DAYS) {
    const date = day.toISOString().slice(0, 10);
    const week = weekKey(date);
    const left = (candidate: Candidate) => prefs.maxRepeatsPerWeek - (used.get(`${week}:${candidate.recipe.id}`) ?? 0);
    const perSlot = slots.map((slot) => ok.filter((candidate) => fitsSlot(candidate.recipe, slot, prefs) && left(candidate) > 0).sort((a, b) => Number(b.favorite) - Number(a.favorite) || (used.get(`${week}:${a.recipe.id}`) ?? 0) - (used.get(`${week}:${b.recipe.id}`) ?? 0)));
    const emptySlot = perSlot.findIndex((list) => list.length === 0);
    if (emptySlot >= 0) {
      days.push({ date, meals: [], total: { kcal: 0, protein: 0, carbs: 0, fat: 0 }, cost: null, reason: `geen passend recept voor ${slots[emptySlot]} (na uitsluitingen, tijd en herhalingen)` });
      day.setUTCDate(day.getUTCDate() + 1);
      continue;
    }
    let best: Choice | null = null;
    let tried = 0;
    const walk = (index: number, picks: Candidate[]) => {
      if (tried >= MAX_COMBINATIONS) return;
      if (index === slots.length) {
        tried += 1;
        const counts = new Map<string, number>();
        for (const pick of picks) counts.set(pick.recipe.id, (counts.get(pick.recipe.id) ?? 0) + 1);
        for (const [id, count] of counts) if (count > (prefs.maxRepeatsPerWeek - (used.get(`${week}:${id}`) ?? 0))) return;
        const choice = evaluate(picks, input.targets, prefs.budgetPerDayCents);
        if (!best || (choice.ok && !best.ok) || (choice.ok === best.ok && choice.score < best.score - 1e-9)) best = choice;
        return;
      }
      for (const candidate of perSlot[index]!) walk(index + 1, [...picks, candidate]);
    };
    walk(0, []);
    const chosen = best as Choice | null;
    if (!chosen || !chosen.ok) {
      days.push({ date, meals: [], total: { kcal: 0, protein: 0, carbs: 0, fat: 0 }, cost: null, reason: chosen?.reason ?? 'geen combinatie gevonden' });
    } else {
      for (const pick of chosen.picks) used.set(`${week}:${pick.recipe.id}`, (used.get(`${week}:${pick.recipe.id}`) ?? 0) + 1);
      days.push({ date, meals: chosen.picks.map((pick, index) => ({ slot: slots[index]!, recipe: pick.recipe, servings: chosen.factor })), total: chosen.total, cost: chosen.cost, reason: null });
    }
    day.setUTCDate(day.getUTCDate() + 1);
  }
  return { days, excluded };
}

/** Het concept omzetten in een plan en geplande maaltijden. Alleen aanroepen na bevestiging door de eigenaar. */
export function conceptToPlan(input: { id: string; name: string; from: string; to: string; targets: PlanTargets; mealsPerDay: number }, days: readonly DayResult[], newId: () => string, now = new Date()): { plan: NutritionPlan; meals: PlannedMeal[] } {
  const stamp = now.toISOString();
  const plan: NutritionPlan = { id: input.id, name: input.name, from: input.from, to: input.to, targets: input.targets, mealsPerDay: input.mealsPerDay, status: 'bevestigd', generated: true, createdAt: stamp, updatedAt: stamp };
  const meals = days.flatMap((day) => day.meals.map((meal) => ({ id: newId(), planId: plan.id, date: day.date, meal: meal.slot, servings: meal.servings, recipeId: meal.recipe.id, items: [], note: '', createdAt: stamp, updatedAt: stamp })));
  return { plan, meals };
}
