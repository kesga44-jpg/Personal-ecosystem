import { describe, expect, it } from 'vitest';
import { nutrientsFor, validateFoodEntry, validateProduct } from './domain';
import { validateVoedingBackup } from './backup';
import { validatePlan, validatePlannedMeal, type NutritionPlan, type PlannedMeal } from './planner';
import { convertAmount, filterRecipes, makeRecipeEntry, parseTags, recipeAllergens, recipeNutrition, recipesUsing, validateRecipe, type Ingredient, type Recipe, type RecipeIngredient } from './recipes';
import { databaseConfig } from './storage';

const t = '2026-11-22T10:00:00.000Z';
const oats: Ingredient = { id: 'eigen:oats', name: 'Havermout', brand: '', barcode: null, per100: { kcal: 370, protein: 13, carbs: 60, fat: 7 }, servingGrams: null, source: 'eigen', updatedAt: t, allergens: ['gluten'], fiber: 10 };
const milk: Ingredient = { id: 'eigen:milk', name: 'Melk', brand: '', barcode: null, per100: { kcal: 50, protein: 3.4, carbs: 4.8, fat: 1.5 }, servingGrams: null, source: 'eigen', updatedAt: t, basis: '100ml', fiber: 0 };
const egg: Ingredient = { id: 'eigen:egg', name: 'Ei', brand: '', barcode: null, per100: { kcal: 140, protein: 12, carbs: 1, fat: 10 }, servingGrams: null, source: 'eigen', updatedAt: t, portionGrams: 55 };
const bar: Ingredient = { id: 'eigen:bar', name: 'Reep', brand: '', barcode: null, per100: { kcal: 200, protein: 10, carbs: 20, fat: 8 }, servingGrams: null, source: 'eigen', updatedAt: t, basis: 'portion', portionGrams: 40 };
const recipe: Recipe = { id: 'r1', name: 'Overnight oats', description: '', steps: ['Mengen', 'Nacht laten staan'], prepMinutes: 5, servings: 2, category: 'ontbijt', labels: ['snel'], allergens: ['melk'], notes: '', favorite: false, createdAt: t, updatedAt: t };
const lines: RecipeIngredient[] = [
  { id: 'l1', recipeId: 'r1', productId: 'eigen:oats', amount: 100, unit: 'g', note: '' },
  { id: 'l2', recipeId: 'r1', productId: 'eigen:milk', amount: 300, unit: 'ml', note: '' }
];

describe('omrekenen van hoeveelheden (ADR 0026 § 2)', () => {
  it('rekent gram, milliliter, stuks en porties om', () => {
    expect(convertAmount(oats, 50, 'g')).toEqual({ ok: true, factor: 0.5, grams: 50 });
    expect(convertAmount(milk, 250, 'ml')).toEqual({ ok: true, factor: 2.5, grams: 250 });
    expect(convertAmount(egg, 2, 'stuk')).toEqual({ ok: true, factor: 1.1, grams: 110 });
    expect(convertAmount(bar, 1, 'portie')).toEqual({ ok: true, factor: 1, grams: 40 });
    expect(convertAmount(bar, 20, 'g')).toEqual({ ok: true, factor: 0.5, grams: 20 });
  });

  it('schat niet zonder portiegewicht en weigert de verkeerde eenheid', () => {
    expect(convertAmount(oats, 1, 'stuk')).toMatchObject({ ok: false, reason: expect.stringContaining('ontbreekt') });
    expect(convertAmount(milk, 100, 'g')).toMatchObject({ ok: false, reason: expect.stringContaining('milliliter') });
  });
});

describe('recepten', () => {
  it('berekent de voedingswaarden per recept en per portie uit de ingrediënten', () => {
    const nutrition = recipeNutrition(recipe, lines, [oats, milk]);
    expect(nutrition.total).toEqual({ kcal: 520, protein: 23.2, carbs: 74.4, fat: 11.5 });
    expect(nutrition.perServing).toEqual({ kcal: 260, protein: 11.6, carbs: 37.2, fat: 5.8 });
    expect(nutrition.totalGrams).toBe(400);
    expect(nutrition.fiber).toBe(10);
    expect(nutrition.problems).toEqual([]);
  });

  it('meldt een ingrediënt dat niet te berekenen of verdwenen is', () => {
    const nutrition = recipeNutrition(recipe, [...lines, { id: 'l3', recipeId: 'r1', productId: 'weg', amount: 1, unit: 'g', note: '' }], [oats, milk]);
    expect(nutrition.problems).toEqual(['Een ingrediënt is niet meer beschikbaar.']);
    expect(nutrition.total.kcal).toBe(520);
  });

  it('een aangepast ingrediënt verandert het recept, maar niet een eerdere registratie', () => {
    const entry = makeRecipeEntry(recipe, recipeNutrition(recipe, lines, [oats, milk]), { id: 'e1', date: '2026-11-22', meal: 'ontbijt', servings: 1 }, new Date(t));
    expect(() => validateFoodEntry(entry)).not.toThrow();
    expect(nutrientsFor(entry).kcal).toBe(260);
    expect(entry).toMatchObject({ name: 'Overnight oats', recipeId: 'r1', servings: 1, productId: 'recept:r1' });
    const richerOats = { ...oats, per100: { ...oats.per100, kcal: 400 } };
    expect(recipeNutrition(recipe, lines, [richerOats, milk]).perServing.kcal).toBe(275);
    expect(nutrientsFor(entry).kcal).toBe(260);
  });

  it('registreert niet als iets niet te berekenen is', () => {
    expect(() => makeRecipeEntry(recipe, recipeNutrition(recipe, [], [oats]), { id: 'e', date: '2026-11-22', meal: 'lunch', servings: 1 })).toThrow('nog geen ingrediënten');
    const broken = recipeNutrition(recipe, [{ ...lines[1]!, unit: 'g' }], [milk]);
    expect(() => makeRecipeEntry(recipe, broken, { id: 'e', date: '2026-11-22', meal: 'lunch', servings: 1 })).toThrow('Niet alle ingrediënten');
  });

  it('allergenen, filters, labels en gebruik', () => {
    expect(recipeAllergens(recipe, lines, [oats, milk])).toEqual(['gluten', 'melk']);
    expect(parseTags(' Snel, ontbijt ,snel,, ')).toEqual(['snel', 'ontbijt']);
    const quick = { ...recipe, id: 'r2', name: 'Shake', labels: [], prepMinutes: 30, favorite: true };
    expect(filterRecipes([recipe, quick], {}).map((r) => r.id)).toEqual(['r2', 'r1']);
    expect(filterRecipes([recipe, quick], { label: 'snel' }).map((r) => r.id)).toEqual(['r1']);
    expect(filterRecipes([recipe, quick], { maxMinutes: 10 }).map((r) => r.id)).toEqual(['r1']);
    expect(filterRecipes([recipe, quick], { query: 'SHAKE' }).map((r) => r.id)).toEqual(['r2']);
    expect(recipesUsing('eigen:milk', [recipe, quick], lines).map((r) => r.id)).toEqual(['r1']);
  });

  it('valideert recepten', () => {
    expect(() => validateRecipe(recipe)).not.toThrow();
    expect(() => validateRecipe({ ...recipe, name: ' ' })).toThrow('naam');
    expect(() => validateRecipe({ ...recipe, servings: 0 })).toThrow('porties');
  });
});

describe('schema 2', () => {
  it('voegt alleen stores toe en houdt producten van schema 1 geldig', () => {
    expect(databaseConfig.version).toBe(2);
    expect(databaseConfig.stores).toEqual(['entries', 'products', 'settings', 'recipes', 'recipeIngredients', 'nutritionPlans', 'plannedMeals']);
    const { allergens: _a, fiber: _f, ...v1 } = oats;
    expect(() => validateProduct(v1)).not.toThrow();
    expect(() => validateProduct({ ...v1, basis: 'portion' })).toThrow('portie');
    expect(() => validateProduct({ ...v1, pricePerUnitCents: 199 })).toThrow('prijs');
  });

  it('een back-up van schema 1 krijgt lege nieuwe stores', () => {
    const upgraded = databaseConfig.exportUpgrades[2]({ entries: [], products: [], settings: [] });
    expect(upgraded).toEqual({ entries: [], products: [], settings: [], recipes: [], recipeIngredients: [], nutritionPlans: [], plannedMeals: [] });
    expect(() => validateVoedingBackup({ stores: { entries: [], products: [], settings: [] } })).not.toThrow();
    expect(() => validateVoedingBackup({ stores: { ...upgraded, recipes: [recipe], recipeIngredients: lines, products: [oats, milk] } })).not.toThrow();
    expect(() => validateVoedingBackup({ stores: { ...upgraded, recipes: [{ ...recipe, servings: 99 }] } })).toThrow();
  });

  it('valideert plannen en geplande maaltijden', () => {
    const plan: NutritionPlan = { id: 'p1', name: 'Week', from: '2026-11-23', to: '2026-11-29', targets: { kcal: 2200, protein: 140, carbs: null, fat: null }, mealsPerDay: 3, status: 'concept', generated: false, createdAt: t, updatedAt: t };
    expect(() => validatePlan(plan)).not.toThrow();
    expect(() => validatePlan({ ...plan, to: '2026-11-01' })).toThrow('einddatum');
    const meal: PlannedMeal = { id: 'm1', planId: 'p1', date: '2026-11-23', meal: 'ontbijt', servings: 1, recipeId: 'r1', items: [], note: '', createdAt: t, updatedAt: t };
    expect(() => validatePlannedMeal(meal)).not.toThrow();
    expect(() => validatePlannedMeal({ ...meal, items: [{ productId: 'eigen:oats', amount: 50, unit: 'g' }] })).toThrow('niet allebei');
    expect(() => validatePlannedMeal({ ...meal, recipeId: null })).toThrow('geen van beide');
  });
});
