import { describe, expect, it } from 'vitest';
import { validateSettings } from './domain';
import { candidates, conceptToPlan, costPerServing, defaultPrefs, fitsSlot, generatePlan, slotsFor, validatePrefs, type PlannerPrefs } from './autoplan';
import { validatePlan, validatePlannedMeal } from './planner';
import type { Ingredient, Recipe, RecipeIngredient } from './recipes';

const t = '2026-11-22T10:00:00.000Z';
const product = (id: string, kcal: number, protein: number, extra: Partial<Ingredient> = {}): Ingredient => ({ id, name: id, brand: '', barcode: null, per100: { kcal, protein, carbs: 10, fat: 5 }, servingGrams: null, source: 'eigen', updatedAt: t, ...extra });
const products = [
  product('oats', 370, 13, { pricePerUnitCents: 200, priceUnit: 'kg', allergens: ['gluten'] }),
  product('chicken', 165, 31, { pricePerUnitCents: 1000, priceUnit: 'kg' }),
  product('rice', 130, 3, { pricePerUnitCents: 300, priceUnit: 'kg' }),
  product('quark', 60, 10, { pricePerUnitCents: 250, priceUnit: 'kg' }),
  product('peanut', 600, 25)
];
const recipe = (id: string, extra: Partial<Recipe> = {}): Recipe => ({ id, name: id, description: '', steps: [], prepMinutes: 15, servings: 1, category: '', labels: [], allergens: [], notes: '', favorite: false, createdAt: t, updatedAt: t, ...extra });
const recipes = [
  recipe('Havermout', { category: 'ontbijt' }),
  recipe('Kwark', { category: 'ontbijt', labels: ['eiwit'] }),
  recipe('Kip met rijst', { labels: ['diner'], prepMinutes: 30 }),
  recipe('Rijstsalade', { labels: ['lunch'] }),
  recipe('Satésaus', { labels: ['pinda'] })
];
const lines: RecipeIngredient[] = [
  { id: '1', recipeId: 'Havermout', productId: 'oats', amount: 100, unit: 'g', note: '' },
  { id: '2', recipeId: 'Kwark', productId: 'quark', amount: 300, unit: 'g', note: '' },
  { id: '3', recipeId: 'Kip met rijst', productId: 'chicken', amount: 200, unit: 'g', note: '' },
  { id: '4', recipeId: 'Kip met rijst', productId: 'rice', amount: 250, unit: 'g', note: '' },
  { id: '5', recipeId: 'Rijstsalade', productId: 'rice', amount: 300, unit: 'g', note: '' },
  { id: '6', recipeId: 'Rijstsalade', productId: 'chicken', amount: 100, unit: 'g', note: '' },
  { id: '7', recipeId: 'Satésaus', productId: 'peanut', amount: 50, unit: 'g', note: '' }
];
const input = { from: '2026-11-23', to: '2026-11-25', targets: { kcal: 1600, protein: 100, carbs: null, fat: null }, mealsPerDay: 3 };

describe('automatische planner (ADR 0026 § 4)', () => {
  it('kent momenten en past recepten bij het juiste moment en de maximale tijd', () => {
    expect(slotsFor(3)).toEqual(['ontbijt', 'lunch', 'diner']);
    expect(slotsFor(5)).toEqual(['ontbijt', 'lunch', 'diner', 'tussendoor', 'tussendoor']);
    expect(fitsSlot(recipes[0]!, 'ontbijt', defaultPrefs)).toBe(true);
    expect(fitsSlot(recipes[0]!, 'diner', defaultPrefs)).toBe(false);
    expect(fitsSlot(recipes[4]!, 'lunch', defaultPrefs)).toBe(true);
    expect(fitsSlot(recipes[2]!, 'diner', { ...defaultPrefs, maxMinutes: { diner: 20 } })).toBe(false);
  });

  it('rekent de prijs per portie alleen als alle prijzen bekend zijn', () => {
    expect(costPerServing(recipes[2]!, lines, products)).toBe(275);
    expect(costPerServing(recipes[4]!, lines, products)).toBeNull();
  });

  it('respecteert elke uitsluiting: ingrediënt, label en allergeen', () => {
    const prefs: PlannerPrefs = { ...defaultPrefs, excludedProductIds: ['chicken'], excludedLabels: ['pinda'], excludedAllergens: ['gluten'] };
    const { ok, excluded } = candidates(recipes, lines, products, prefs);
    expect(ok.map((c) => c.recipe.id)).toEqual(['Kwark']);
    expect(Object.fromEntries(excluded.map((e) => [e.recipe.id, e.reason]))).toEqual({
      Havermout: 'bevat gluten',
      'Kip met rijst': 'bevat een uitgesloten ingrediënt',
      Rijstsalade: 'bevat een uitgesloten ingrediënt',
      Satésaus: 'label pinda is uitgesloten'
    });
    const { days } = generatePlan(input, recipes, lines, products, prefs);
    for (const day of days) for (const meal of day.meals) expect(['Kwark']).toContain(meal.recipe.id);
  });

  it('vult dagen binnen de marge en geeft bij dezelfde invoer hetzelfde plan', () => {
    const first = generatePlan(input, recipes, lines, products, defaultPrefs);
    const second = generatePlan(input, [...recipes].reverse(), [...lines].reverse(), [...products].reverse(), defaultPrefs);
    expect(second).toEqual(first);
    for (const day of first.days.filter((d) => d.meals.length)) {
      expect(Math.abs(day.total.kcal / 1600 - 1)).toBeLessThanOrEqual(0.1);
      expect(day.total.protein / 100).toBeGreaterThanOrEqual(0.9);
      expect(day.meals.map((m) => m.slot)).toEqual(['ontbijt', 'lunch', 'diner']);
    }
    expect(first.days.some((d) => d.meals.length)).toBe(true);
  });

  it('zegt per dag waarom het niet lukt en vult dan niets op', () => {
    const { days } = generatePlan({ ...input, targets: { kcal: 1600, protein: 400, carbs: null, fat: null } }, recipes, lines, products, defaultPrefs);
    expect(days.every((d) => d.meals.length === 0 && d.reason === 'te weinig recepten met genoeg eiwit')).toBe(true);
    const none = generatePlan(input, recipes, lines, products, { ...defaultPrefs, excludedLabels: ['diner', 'pinda'] });
    expect(none.days[0]!.reason).toContain('geen passend recept voor diner');
  });

  it('houdt zich aan het maximaal aantal herhalingen per week', () => {
    const { days } = generatePlan({ ...input, to: '2026-11-29' }, recipes, lines, products, { ...defaultPrefs, maxRepeatsPerWeek: 2 });
    const counts = new Map<string, number>();
    for (const day of days) for (const meal of day.meals) counts.set(meal.recipe.id, (counts.get(meal.recipe.id) ?? 0) + 1);
    for (const count of counts.values()) expect(count).toBeLessThanOrEqual(2);
  });

  it('respecteert het budget en weert recepten zonder prijs', () => {
    const { days, excluded } = generatePlan(input, recipes, lines, products, { ...defaultPrefs, budgetPerDayCents: 100 });
    expect(excluded.find((e) => e.recipe.id === 'Satésaus')?.reason).toBe('prijs onbekend terwijl er een budget is');
    expect(days.every((d) => d.reason === 'boven het budget per dag')).toBe(true);
  });

  it('maakt pas na bevestiging een bevestigd plan met geldige maaltijden', () => {
    const { days } = generatePlan(input, recipes, lines, products, defaultPrefs);
    let n = 0;
    const { plan, meals } = conceptToPlan({ id: 'p', name: 'Auto', ...input }, days, () => `m${++n}`, new Date(t));
    expect(plan).toMatchObject({ status: 'bevestigd', generated: true });
    expect(() => validatePlan(plan)).not.toThrow();
    for (const meal of meals) expect(() => validatePlannedMeal(meal)).not.toThrow();
    expect(meals.length).toBe(days.reduce((sum, d) => sum + d.meals.length, 0));
  });

  it('valideert voorkeuren, ook als onderdeel van de instellingen', () => {
    expect(() => validatePrefs(defaultPrefs)).not.toThrow();
    expect(() => validatePrefs({ ...defaultPrefs, maxRepeatsPerWeek: 0 })).toThrow('Herhalingen');
    expect(() => validateSettings({ id: 'settings', kcalTarget: null, proteinTarget: null, planner: { ...defaultPrefs, maxMinutes: { brunch: 10 } } })).toThrow('bereidingstijd');
    expect(() => validateSettings({ id: 'settings', kcalTarget: null, proteinTarget: null })).not.toThrow();
  });
});
