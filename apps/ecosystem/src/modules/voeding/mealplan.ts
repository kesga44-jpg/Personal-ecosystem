/**
 * Rekenen met de persoonlijke maaltijdplanning (ADR 0026 § 3): totalen per dag en per plan,
 * verplaatsen, kopiëren, een dag herhalen, registreren als gegeten en een **afgeleide** boodschappenlijst.
 * De boodschappenlijst wordt telkens opnieuw berekend en nooit opgeslagen (K-D).
 */
import { MEALS, type FoodEntry, type Meal } from './domain';
import type { Nutrients } from './product';
import { MAX_PLAN_DAYS, validatePlannedMeal, type NutritionPlan, type PlanTargets, type PlannedMeal } from './planner';
import { convertAmount, ingredientsOf, makeRecipeEntry, recipeNutrition, roundNutrients, type Ingredient, type Recipe, type RecipeIngredient, type RecipeNutrition, type Unit } from './recipes';

export interface Library {
  products: readonly Ingredient[];
  recipes: readonly Recipe[];
  lines: readonly RecipeIngredient[];
}

const UNAVAILABLE = 'Niet meer beschikbaar';

export function planDates(plan: Pick<NutritionPlan, 'from' | 'to'>): string[] {
  const dates: string[] = [];
  const day = new Date(`${plan.from}T12:00:00Z`);
  while (day.toISOString().slice(0, 10) <= plan.to && dates.length < MAX_PLAN_DAYS) {
    dates.push(day.toISOString().slice(0, 10));
    day.setUTCDate(day.getUTCDate() + 1);
  }
  return dates;
}

export function mealsOfPlan(planId: string, meals: readonly PlannedMeal[]): PlannedMeal[] {
  return meals
    .filter((meal) => meal.planId === planId)
    .sort((a, b) => a.date.localeCompare(b.date) || MEALS.indexOf(a.meal) - MEALS.indexOf(b.meal) || a.createdAt.localeCompare(b.createdAt));
}

/** Ingrediëntregels van een geplande maaltijd, voor de gekozen porties. */
export function mealLines(meal: PlannedMeal, library: Library): { lines: RecipeIngredient[]; servings: number } {
  if (meal.recipeId) {
    const recipe = library.recipes.find((item) => item.id === meal.recipeId);
    if (!recipe) return { lines: [], servings: 1 };
    const factor = meal.servings / recipe.servings;
    return { lines: ingredientsOf(recipe.id, library.lines).map((line) => ({ ...line, amount: line.amount * factor })), servings: meal.servings };
  }
  return { lines: meal.items.map((item, index) => ({ id: `${meal.id}:${index}`, recipeId: meal.id, productId: item.productId, amount: item.amount * meal.servings, unit: item.unit, note: '' })), servings: meal.servings };
}

export function mealName(meal: PlannedMeal, library: Library): string {
  if (meal.recipeId) return library.recipes.find((item) => item.id === meal.recipeId)?.name ?? UNAVAILABLE;
  if (meal.note.trim()) return meal.note.trim();
  const names = meal.items.map((item) => library.products.find((product) => product.id === item.productId)?.name ?? UNAVAILABLE);
  return names.join(', ');
}

/** Voedingswaarden van een geplande maaltijd, voor alle geplande porties samen. */
export function mealNutrition(meal: PlannedMeal, library: Library): RecipeNutrition {
  const recipe = meal.recipeId ? library.recipes.find((item) => item.id === meal.recipeId) : undefined;
  if (meal.recipeId && !recipe) return { total: { kcal: 0, protein: 0, carbs: 0, fat: 0 }, perServing: { kcal: 0, protein: 0, carbs: 0, fat: 0 }, totalGrams: 0, fiber: null, problems: ['Het recept is niet meer beschikbaar.'] };
  const { lines } = mealLines(meal, library);
  return recipeNutrition({ servings: meal.servings }, lines, library.products);
}

export function sumMeals(meals: readonly PlannedMeal[], library: Library): { total: Nutrients; problems: string[] } {
  let total: Nutrients = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  const problems: string[] = [];
  for (const meal of meals) {
    const nutrition = mealNutrition(meal, library);
    total = { kcal: total.kcal + nutrition.total.kcal, protein: total.protein + nutrition.total.protein, carbs: total.carbs + nutrition.total.carbs, fat: total.fat + nutrition.total.fat };
    problems.push(...nutrition.problems);
  }
  return { total: roundNutrients(total), problems };
}

export interface DayTotal {
  date: string;
  meals: number;
  total: Nutrients;
  problems: number;
}

export function dayTotals(plan: NutritionPlan, meals: readonly PlannedMeal[], library: Library): DayTotal[] {
  const ofPlan = mealsOfPlan(plan.id, meals);
  return planDates(plan).map((date) => {
    const day = ofPlan.filter((meal) => meal.date === date);
    const { total, problems } = sumMeals(day, library);
    return { date, meals: day.length, total, problems: problems.length };
  });
}

/** Verhouding tot het doel in procenten, of null zonder doel. */
export function targetPct(value: number, target: number | null): number | null {
  return target ? Math.round((value / target) * 100) : null;
}

export function targetCheck(total: Nutrients, targets: PlanTargets): { key: keyof PlanTargets; pct: number }[] {
  return (['kcal', 'protein', 'carbs', 'fat'] as const).flatMap((key) => {
    const pct = targetPct(total[key], targets[key]);
    return pct === null ? [] : [{ key, pct }];
  });
}

export function moveMeal(meal: PlannedMeal, date: string, slot: Meal, now = new Date()): PlannedMeal {
  const next = { ...meal, date, meal: slot, updatedAt: now.toISOString() };
  validatePlannedMeal(next);
  return next;
}

export function copyMeal(meal: PlannedMeal, id: string, date: string, slot: Meal, now = new Date()): PlannedMeal {
  const next = { ...meal, items: meal.items.map((item) => ({ ...item })), id, date, meal: slot, createdAt: now.toISOString(), updatedAt: now.toISOString() };
  validatePlannedMeal(next);
  return next;
}

/** Alle maaltijden van een dag naar een andere dag kopiëren. */
export function repeatDay(meals: readonly PlannedMeal[], planId: string, from: string, to: string, newId: () => string, now = new Date()): PlannedMeal[] {
  if (from === to) throw new Error('Kies een andere dag om naartoe te kopiëren.');
  return mealsOfPlan(planId, meals)
    .filter((meal) => meal.date === from)
    .map((meal) => copyMeal(meal, newId(), to, meal.meal, now));
}

/**
 * Registratie van een geplande maaltijd als gegeten, met de geplande hoeveelheid tenzij anders opgegeven.
 * Naam en waarden worden gekopieerd (ADR 0026 § 2).
 */
export function entryFromPlanned(meal: PlannedMeal, library: Library, input: { id: string; date: string; servings: number }, now = new Date()): FoodEntry {
  const recipe = meal.recipeId ? library.recipes.find((item) => item.id === meal.recipeId) : undefined;
  if (meal.recipeId) {
    if (!recipe) throw new Error('Het recept van deze maaltijd is niet meer beschikbaar.');
    const nutrition = recipeNutrition(recipe, ingredientsOf(recipe.id, library.lines), library.products);
    return makeRecipeEntry(recipe, nutrition, { id: input.id, date: input.date, meal: meal.meal, servings: input.servings, plannedMealId: meal.id }, now);
  }
  const pseudo: Recipe = { id: meal.id, name: mealName(meal, library).slice(0, 120), description: '', steps: [], prepMinutes: null, servings: 1, category: '', labels: [], allergens: [], notes: '', favorite: false, createdAt: meal.createdAt, updatedAt: meal.updatedAt };
  const single = { ...meal, servings: 1 };
  const nutrition = recipeNutrition(pseudo, mealLines(single, library).lines, library.products);
  const entry = makeRecipeEntry(pseudo, nutrition, { id: input.id, date: input.date, meal: meal.meal, servings: input.servings, plannedMealId: meal.id }, now);
  const { recipeId: _recipeId, ...withoutRecipe } = entry;
  return { ...withoutRecipe, productId: `maaltijd:${meal.id}` };
}

/** Een maaltijd uit losse ingrediënten opslaan als recept met ingrediëntregels. */
export function recipeFromMeal(meal: PlannedMeal, name: string, ids: { recipe: string; line: () => string }, now = new Date()): { recipe: Recipe; lines: RecipeIngredient[] } {
  if (meal.recipeId) throw new Error('Deze maaltijd is al een recept.');
  const recipe: Recipe = { id: ids.recipe, name: name.trim(), description: '', steps: [], prepMinutes: null, servings: 1, category: '', labels: [], allergens: [], notes: meal.note, favorite: false, createdAt: now.toISOString(), updatedAt: now.toISOString() };
  return { recipe, lines: meal.items.map((item) => ({ id: ids.line(), recipeId: recipe.id, productId: item.productId, amount: item.amount, unit: item.unit, note: '' })) };
}

// ——— Afgeleide boodschappenlijst (K-D: niet opgeslagen, geen historie) ———

export interface ShoppingItem {
  productId: string;
  name: string;
  category: string;
  /** Totaal in g of ml als dat te berekenen is. */
  amount: number | null;
  unit: 'g' | 'ml' | null;
  /** Hoeveelheden die niet naar g of ml om te rekenen zijn, per eenheid. */
  other: Partial<Record<Unit, number>>;
}

export function shoppingList(meals: readonly PlannedMeal[], library: Library): ShoppingItem[] {
  const byId = new Map(library.products.map((product) => [product.id, product]));
  const result = new Map<string, ShoppingItem>();
  for (const meal of meals) {
    for (const line of mealLines(meal, library).lines) {
      const product = byId.get(line.productId);
      const key = line.productId;
      const item = result.get(key) ?? { productId: key, name: product?.name ?? UNAVAILABLE, category: product?.category?.trim() || 'Overig', amount: null, unit: null, other: {} };
      const volume = product?.basis === '100ml' || line.unit === 'ml';
      const conversion = product ? convertAmount(product, line.amount, line.unit) : null;
      if (conversion?.ok) {
        item.amount = (item.amount ?? 0) + conversion.grams;
        item.unit = item.unit ?? (volume ? 'ml' : 'g');
      } else {
        item.other[line.unit] = (item.other[line.unit] ?? 0) + line.amount;
      }
      result.set(key, item);
    }
  }
  return [...result.values()]
    .map((item) => ({ ...item, amount: item.amount === null ? null : Math.round(item.amount) }))
    .sort((a, b) => a.category.localeCompare(b.category, 'nl-NL') || a.name.localeCompare(b.name, 'nl-NL'));
}

/** Tekst om te kopiëren of af te drukken. */
export function shoppingText(items: readonly ShoppingItem[]): string {
  const lines: string[] = [];
  let category = '';
  for (const item of items) {
    if (item.category !== category) {
      category = item.category;
      lines.push(`${lines.length ? '\n' : ''}${category}`);
    }
    const parts = [item.amount !== null ? `${item.amount.toLocaleString('nl-NL')} ${item.unit}` : '', ...Object.entries(item.other).map(([unit, amount]) => `${(amount as number).toLocaleString('nl-NL', { maximumFractionDigits: 2 })} ${unit}`)].filter(Boolean);
    lines.push(`- ${item.name}: ${parts.join(' + ')}`);
  }
  return lines.join('\n');
}
