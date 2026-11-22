import { describe, expect, it } from 'vitest';
import { nutrientsFor, validateFoodEntry } from './domain';
import { copyMeal, dayTotals, entryFromPlanned, mealNutrition, mealsOfPlan, moveMeal, planDates, recipeFromMeal, repeatDay, shoppingList, shoppingText, targetCheck, type Library } from './mealplan';
import type { NutritionPlan, PlannedMeal } from './planner';
import type { Ingredient, Recipe, RecipeIngredient } from './recipes';

const t = '2026-11-22T10:00:00.000Z';
const oats: Ingredient = { id: 'oats', name: 'Havermout', brand: '', barcode: null, per100: { kcal: 370, protein: 13, carbs: 60, fat: 7 }, servingGrams: null, source: 'eigen', updatedAt: t, category: 'Ontbijt' };
const milk: Ingredient = { id: 'milk', name: 'Melk', brand: '', barcode: null, per100: { kcal: 50, protein: 3.4, carbs: 4.8, fat: 1.5 }, servingGrams: null, source: 'eigen', updatedAt: t, basis: '100ml', category: 'Zuivel' };
const egg: Ingredient = { id: 'egg', name: 'Ei', brand: '', barcode: null, per100: { kcal: 140, protein: 12, carbs: 1, fat: 10 }, servingGrams: null, source: 'eigen', updatedAt: t, category: 'Zuivel' };
const recipe: Recipe = { id: 'r1', name: 'Overnight oats', description: '', steps: [], prepMinutes: 5, servings: 2, category: '', labels: [], allergens: [], notes: '', favorite: false, createdAt: t, updatedAt: t };
const lines: RecipeIngredient[] = [
  { id: 'l1', recipeId: 'r1', productId: 'oats', amount: 100, unit: 'g', note: '' },
  { id: 'l2', recipeId: 'r1', productId: 'milk', amount: 300, unit: 'ml', note: '' }
];
const library: Library = { products: [oats, milk, egg], recipes: [recipe], lines };
const plan: NutritionPlan = { id: 'p1', name: 'Week', from: '2026-11-23', to: '2026-11-25', targets: { kcal: 2000, protein: 100, carbs: null, fat: null }, mealsPerDay: 3, status: 'concept', generated: false, createdAt: t, updatedAt: t };
const breakfast: PlannedMeal = { id: 'm1', planId: 'p1', date: '2026-11-23', meal: 'ontbijt', servings: 1, recipeId: 'r1', items: [], note: '', createdAt: t, updatedAt: t };
const lunch: PlannedMeal = { id: 'm2', planId: 'p1', date: '2026-11-23', meal: 'lunch', servings: 1, recipeId: null, items: [{ productId: 'egg', amount: 2, unit: 'stuk' }], note: 'Eitjes', createdAt: t, updatedAt: t };
const dinner: PlannedMeal = { ...breakfast, id: 'm3', meal: 'diner', servings: 2, date: '2026-11-24' };

describe('maaltijdplanning (ADR 0026 § 3)', () => {
  it('kent de dagen van een plan en sorteert maaltijden op dag en moment', () => {
    expect(planDates(plan)).toEqual(['2026-11-23', '2026-11-24', '2026-11-25']);
    expect(mealsOfPlan('p1', [dinner, lunch, breakfast]).map((meal) => meal.id)).toEqual(['m1', 'm2', 'm3']);
  });

  it('rekent per maaltijd met de geplande porties', () => {
    expect(mealNutrition(breakfast, library).total.kcal).toBe(260);
    expect(mealNutrition(dinner, library).total.kcal).toBe(520);
    expect(mealNutrition(lunch, library).problems[0]).toContain('Ei');
    expect(mealNutrition({ ...breakfast, recipeId: 'weg' }, library).problems).toEqual(['Het recept is niet meer beschikbaar.']);
  });

  it('geeft totalen per dag en vergelijkt met de doelen', () => {
    const totals = dayTotals(plan, [breakfast, lunch, dinner], library);
    expect(totals.map((day) => [day.date, day.meals, day.total.kcal, day.problems])).toEqual([
      ['2026-11-23', 2, 260, 1],
      ['2026-11-24', 1, 520, 0],
      ['2026-11-25', 0, 0, 0]
    ]);
    expect(targetCheck(totals[1]!.total, plan.targets)).toEqual([{ key: 'kcal', pct: 26 }, { key: 'protein', pct: 23 }]);
  });

  it('verplaatst, kopieert en herhaalt een dag', () => {
    const moved = moveMeal(breakfast, '2026-11-25', 'lunch', new Date(t));
    expect(moved).toMatchObject({ id: 'm1', date: '2026-11-25', meal: 'lunch' });
    const copy = copyMeal(lunch, 'c1', '2026-11-24', 'diner', new Date(t));
    expect(copy).toMatchObject({ id: 'c1', date: '2026-11-24', meal: 'diner', items: lunch.items });
    expect(copy.items).not.toBe(lunch.items);
    let n = 0;
    const repeated = repeatDay([breakfast, lunch, dinner], 'p1', '2026-11-23', '2026-11-25', () => `n${++n}`, new Date(t));
    expect(repeated.map((meal) => [meal.id, meal.date, meal.meal])).toEqual([['n1', '2026-11-25', 'ontbijt'], ['n2', '2026-11-25', 'lunch']]);
    expect(() => repeatDay([breakfast], 'p1', '2026-11-23', '2026-11-23', () => 'x')).toThrow('andere dag');
  });

  it('registreert een geplande maaltijd als gegeten met een kopie van de waarden', () => {
    const entry = entryFromPlanned(dinner, library, { id: 'e1', date: '2026-11-24', servings: 2 }, new Date(t));
    expect(() => validateFoodEntry(entry)).not.toThrow();
    expect(entry).toMatchObject({ name: 'Overnight oats', meal: 'diner', recipeId: 'r1', plannedMealId: 'm3', servings: 2 });
    expect(nutrientsFor(entry).kcal).toBe(520);
    const loose = entryFromPlanned({ ...lunch, items: [{ productId: 'oats', amount: 60, unit: 'g' }] }, library, { id: 'e2', date: '2026-11-23', servings: 1 }, new Date(t));
    expect(loose).toMatchObject({ name: 'Eitjes', productId: 'maaltijd:m2', plannedMealId: 'm2' });
    expect('recipeId' in loose).toBe(false);
    expect(nutrientsFor(loose).kcal).toBe(222);
  });

  it('slaat een maaltijd uit losse ingrediënten op als recept', () => {
    let n = 0;
    const { recipe: created, lines: createdLines } = recipeFromMeal(lunch, 'Gekookte eieren', { recipe: 'r9', line: () => `x${++n}` }, new Date(t));
    expect(created).toMatchObject({ id: 'r9', name: 'Gekookte eieren', servings: 1, notes: 'Eitjes' });
    expect(createdLines).toEqual([{ id: 'x1', recipeId: 'r9', productId: 'egg', amount: 2, unit: 'stuk', note: '' }]);
    expect(() => recipeFromMeal(breakfast, 'x', { recipe: 'r', line: () => 'l' })).toThrow('al een recept');
  });
});

describe('afgeleide boodschappenlijst (K-D: niet opgeslagen)', () => {
  it('telt hoeveelheden per ingrediënt op, geschaald naar de porties, gegroepeerd per categorie', () => {
    const items = shoppingList([breakfast, dinner, lunch], library);
    expect(items).toEqual([
      { productId: 'oats', name: 'Havermout', category: 'Ontbijt', amount: 150, unit: 'g', other: {} },
      { productId: 'egg', name: 'Ei', category: 'Zuivel', amount: null, unit: null, other: { stuk: 2 } },
      { productId: 'milk', name: 'Melk', category: 'Zuivel', amount: 450, unit: 'ml', other: {} }
    ]);
    expect(shoppingText(items)).toBe('Ontbijt\n- Havermout: 150 g\n\nZuivel\n- Ei: 2 stuk\n- Melk: 450 ml');
  });
});
