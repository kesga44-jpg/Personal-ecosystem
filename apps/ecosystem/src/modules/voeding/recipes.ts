/**
 * Voeding schema 2 (ADR 0026): ingrediëntenbibliotheek (de store `products`) en recepten.
 * Voedingswaarden van een recept worden berekend uit de ingrediënten en niet opgeslagen (§ 2).
 * Bij registreren als gegeten worden naam en waarden gekopieerd, zodat de geschiedenis niet verandert.
 */
import { isDateKey, validateNutrients, type FoodEntry, type FoodProduct, type Meal } from './domain';
import type { Nutrients } from './product';

export { BASES, UNITS, PRICE_UNITS, basisLabels, unitLabels, validateIngredientFields, type Basis, type Unit, type PriceUnit, type IngredientFields } from './schema2';
import { UNITS, isTagList, type IngredientFields, type Unit } from './schema2';

export type Ingredient = FoodProduct & IngredientFields;

export interface Recipe {
  id: string;
  name: string;
  description: string;
  steps: string[];
  prepMinutes: number | null;
  servings: number;
  category: string;
  labels: string[];
  allergens: string[];
  notes: string;
  favorite: boolean;
  origin?: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface RecipeIngredient {
  id: string;
  recipeId: string;
  productId: string;
  amount: number;
  unit: Unit;
  note: string;
}

function fail(message: string): never {
  throw new Error(message);
}

function isText(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length <= max;
}

function isTime(value: unknown): boolean {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}


/** Tekst met komma's naar een lijst labels: getrimd, zonder dubbele (hoofdletterongevoelig), kleine letters. */
export function parseTags(raw: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const part of raw.split(',')) {
    const tag = part.trim().toLocaleLowerCase('nl-NL');
    if (tag && !seen.has(tag)) {
      seen.add(tag);
      result.push(tag);
    }
  }
  return result;
}

export function validateRecipe(value: unknown): asserts value is Recipe {
  if (!value || typeof value !== 'object') fail('Ongeldig recept.');
  const r = value as Partial<Recipe>;
  if (typeof r.id !== 'string' || !r.id || r.id.length > 120) fail('Recept heeft een ongeldig ID.');
  if (typeof r.name !== 'string' || !r.name.trim() || r.name.length > 120) fail('Geef het recept een naam (maximaal 120 tekens).');
  if (!isText(r.description, 2000)) fail('Beschrijving is te lang.');
  if (!Array.isArray(r.steps) || r.steps.length > 50 || !r.steps.every((step) => typeof step === 'string' && step.trim() && step.length <= 2000)) fail('Bereiding is ongeldig (maximaal 50 stappen).');
  if (!(r.prepMinutes === null || (Number.isInteger(r.prepMinutes) && (r.prepMinutes as number) > 0 && (r.prepMinutes as number) <= 1440))) fail('Bereidingstijd moet tussen 1 en 1440 minuten liggen.');
  if (!(Number.isInteger(r.servings) && (r.servings as number) >= 1 && (r.servings as number) <= 50)) fail('Aantal porties moet tussen 1 en 50 liggen.');
  if (!isText(r.category, 60)) fail('Categorie is te lang.');
  if (!isTagList(r.labels)) fail('Labels zijn ongeldig.');
  if (!isTagList(r.allergens)) fail('Allergenen zijn ongeldig.');
  if (!isText(r.notes, 5000)) fail('Opmerkingen zijn te lang.');
  if (typeof r.favorite !== 'boolean') fail('Favoriet ontbreekt.');
  if (!isTime(r.createdAt) || !isTime(r.updatedAt)) fail('Recept heeft een ongeldig tijdstip.');
}

export function validateRecipeIngredient(value: unknown): asserts value is RecipeIngredient {
  if (!value || typeof value !== 'object') fail('Ongeldig ingrediënt in een recept.');
  const i = value as Partial<RecipeIngredient>;
  if (typeof i.id !== 'string' || !i.id || i.id.length > 120) fail('Ingrediëntregel heeft een ongeldig ID.');
  if (typeof i.recipeId !== 'string' || !i.recipeId) fail('Ingrediëntregel mist het recept.');
  if (typeof i.productId !== 'string' || !i.productId) fail('Kies een ingrediënt.');
  if (typeof i.amount !== 'number' || !Number.isFinite(i.amount) || i.amount <= 0 || i.amount > 10_000) fail('Hoeveelheid moet tussen 0 en 10.000 liggen.');
  if (!(UNITS as readonly string[]).includes(i.unit as string)) fail('Kies een eenheid.');
  if (!isText(i.note, 200)) fail('Opmerking bij het ingrediënt is te lang.');
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export type Conversion = { ok: true; factor: number; grams: number } | { ok: false; reason: string };

/**
 * Rekent een hoeveelheid om naar de basis van de voedingswaarden (ADR 0026 § 2).
 * `factor` vermenigvuldigt de waarden van het product; `grams` is het gewicht of volume in g of ml.
 * Zonder bekend portiegewicht wordt een stuk of portie niet geschat.
 */
export function convertAmount(product: Ingredient, amount: number, unit: Unit): Conversion {
  const basis = product.basis;
  const portion = product.portionGrams ?? product.servingGrams ?? null;
  if (unit === 'g' || unit === 'ml') {
    if (basis === '100g' && unit === 'ml') return { ok: false, reason: `${product.name} heeft waarden per 100 g; vul gram in.` };
    if (basis === '100ml' && unit === 'g') return { ok: false, reason: `${product.name} heeft waarden per 100 ml; vul milliliter in.` };
    if (basis === 'portion') {
      if (!portion) return { ok: false, reason: `Het portiegewicht van ${product.name} ontbreekt.` };
      return { ok: true, factor: amount / portion, grams: amount };
    }
    return { ok: true, factor: amount / 100, grams: amount };
  }
  if (!portion) return { ok: false, reason: `Het gewicht van één ${unit} ${product.name} ontbreekt; vul het portiegewicht in bij het ingrediënt.` };
  const grams = amount * portion;
  return { ok: true, factor: basis === 'portion' ? amount : grams / 100, grams };
}

export interface RecipeNutrition {
  total: Nutrients;
  perServing: Nutrients;
  totalGrams: number;
  fiber: number | null;
  /** Ingrediënten waarvoor niet kon worden gerekend; de totalen zijn dan onvolledig. */
  problems: string[];
}

const zero: Nutrients = { kcal: 0, protein: 0, carbs: 0, fat: 0 };

export function scaleNutrients(values: Nutrients, factor: number): Nutrients {
  return { kcal: values.kcal * factor, protein: values.protein * factor, carbs: values.carbs * factor, fat: values.fat * factor };
}

export function addNutrients(a: Nutrients, b: Nutrients): Nutrients {
  return { kcal: a.kcal + b.kcal, protein: a.protein + b.protein, carbs: a.carbs + b.carbs, fat: a.fat + b.fat };
}

export function roundNutrients(values: Nutrients): Nutrients {
  return { kcal: Math.round(values.kcal), protein: round1(values.protein), carbs: round1(values.carbs), fat: round1(values.fat) };
}

export function ingredientsOf(recipeId: string, lines: readonly RecipeIngredient[]): RecipeIngredient[] {
  return lines.filter((line) => line.recipeId === recipeId);
}

/** Voedingswaarden van een recept, berekend uit de actuele ingrediënten. */
export function recipeNutrition(recipe: Pick<Recipe, 'servings'>, lines: readonly RecipeIngredient[], products: readonly Ingredient[]): RecipeNutrition {
  const byId = new Map(products.map((product) => [product.id, product]));
  let total = zero;
  let totalGrams = 0;
  let fiber: number | null = 0;
  const problems: string[] = [];
  for (const line of lines) {
    const product = byId.get(line.productId);
    if (!product) {
      problems.push('Een ingrediënt is niet meer beschikbaar.');
      continue;
    }
    const conversion = convertAmount(product, line.amount, line.unit);
    if (!conversion.ok) {
      problems.push(conversion.reason);
      continue;
    }
    total = addNutrients(total, scaleNutrients(product.per100, conversion.factor));
    totalGrams += conversion.grams;
    fiber = fiber === null || product.fiber === undefined || product.fiber === null ? null : fiber + product.fiber * conversion.factor;
  }
  return {
    total: roundNutrients(total),
    perServing: roundNutrients(scaleNutrients(total, 1 / recipe.servings)),
    totalGrams: round1(totalGrams),
    fiber: fiber === null || !lines.length ? null : round1(fiber),
    problems
  };
}

/** Allergenen van een recept: de eigen invoer plus die van de ingrediënten. */
export function recipeAllergens(recipe: Pick<Recipe, 'allergens'>, lines: readonly RecipeIngredient[], products: readonly Ingredient[]): string[] {
  const byId = new Map(products.map((product) => [product.id, product]));
  const all = new Set(recipe.allergens);
  for (const line of lines) for (const allergen of byId.get(line.productId)?.allergens ?? []) all.add(allergen);
  return [...all].sort((a, b) => a.localeCompare(b, 'nl-NL'));
}

/**
 * Registratie van gegeten porties van een recept. Waarden en naam worden gekopieerd (ADR 0026 § 2):
 * `per100` is het gemiddelde per 100 g van het hele recept en `grams` het gegeten deel.
 */
export function makeRecipeEntry(
  recipe: Recipe,
  nutrition: RecipeNutrition,
  input: { id: string; date: string; meal: Meal; servings: number; plannedMealId?: string },
  now = new Date()
): FoodEntry & { recipeId: string; servings: number; plannedMealId?: string } {
  if (nutrition.problems.length) fail(`Niet alle ingrediënten zijn te berekenen: ${nutrition.problems[0]}`);
  if (nutrition.totalGrams <= 0) fail('Het recept heeft nog geen ingrediënten.');
  if (!(input.servings > 0 && input.servings <= 20)) fail('Aantal porties moet tussen 0 en 20 liggen.');
  if (!isDateKey(input.date)) fail('Ongeldige datum.');
  const factor = 100 / nutrition.totalGrams;
  const per100 = roundNutrients(scaleNutrients(nutrition.total, factor));
  const entry = {
    id: input.id,
    date: input.date,
    meal: input.meal,
    productId: `recept:${recipe.id}`,
    name: recipe.name,
    per100,
    grams: round1((nutrition.totalGrams / recipe.servings) * input.servings),
    createdAt: now.toISOString(),
    recipeId: recipe.id,
    servings: input.servings,
    ...(input.plannedMealId ? { plannedMealId: input.plannedMealId } : {})
  };
  validateNutrients(entry.per100);
  return entry;
}

export interface RecipeFilter {
  query?: string;
  label?: string;
  category?: string;
  favoritesOnly?: boolean;
  maxMinutes?: number | null;
}

export function filterRecipes(recipes: readonly Recipe[], filter: RecipeFilter): Recipe[] {
  const query = filter.query?.trim().toLocaleLowerCase('nl-NL') ?? '';
  return recipes
    .filter((recipe) => !filter.favoritesOnly || recipe.favorite)
    .filter((recipe) => !filter.label || recipe.labels.includes(filter.label))
    .filter((recipe) => !filter.category || recipe.category === filter.category)
    .filter((recipe) => !filter.maxMinutes || (recipe.prepMinutes !== null && recipe.prepMinutes <= filter.maxMinutes))
    .filter((recipe) => !query || `${recipe.name} ${recipe.description} ${recipe.labels.join(' ')} ${recipe.category}`.toLocaleLowerCase('nl-NL').includes(query))
    .sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.name.localeCompare(b.name, 'nl-NL'));
}

/** Recepten waarin een ingrediënt voorkomt, om te tonen voordat het wordt verwijderd. */
export function recipesUsing(productId: string, recipes: readonly Recipe[], lines: readonly RecipeIngredient[]): Recipe[] {
  const ids = new Set(lines.filter((line) => line.productId === productId).map((line) => line.recipeId));
  return recipes.filter((recipe) => ids.has(recipe.id));
}
