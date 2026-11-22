import { describe, expect, it } from 'vitest';
import {
  averageKcal,
  byMeal,
  entriesOn,
  kcalSeries,
  loggedToday,
  macroSplit,
  makeEntry,
  nutrientsFor,
  parseNumber,
  productFromOff,
  recentProducts,
  sumNutrients,
  validateFoodEntry,
  validateProduct,
  validateSettings,
  type FoodProduct
} from './domain';
import { validateVoedingBackup } from './backup';

const now = new Date('2026-11-17T08:00:00Z');
const yoghurt = productFromOff({ code: '8710400000000', name: 'Volle yoghurt', brand: 'Merk', per100: { kcal: 63, protein: 3.6, carbs: 4.4, fat: 3.3 }, servingGrams: 150 }, now);
const bread: FoodProduct = { id: 'eigen-1', name: 'Volkorenbrood', brand: '', barcode: null, per100: { kcal: 230, protein: 10, carbs: 40, fat: 3 }, servingGrams: 35, source: 'eigen', updatedAt: now.toISOString() };

const at = (date: string, minute: number) => new Date(`${date}T08:${String(minute).padStart(2, '0')}:00Z`);

describe('registreren', () => {
  it('maakt een registratie met een vaste kopie van de waarden', () => {
    const entry = makeEntry(yoghurt, { id: 'e1', date: '2026-11-17', meal: 'ontbijt', grams: 150 }, now);
    expect(entry.name).toBe('Volle yoghurt (Merk)');
    expect(entry.per100).not.toBe(yoghurt.per100);
    expect(nutrientsFor(entry)).toEqual({ kcal: 95, protein: 5.4, carbs: 6.6, fat: 4.9 });
    expect(() => validateFoodEntry(entry, '2026-11-17')).not.toThrow();
  });

  it('weigert onrealistische invoer', () => {
    const entry = makeEntry(bread, { id: 'e2', date: '2026-11-17', meal: 'lunch', grams: 70 }, now);
    expect(() => validateFoodEntry({ ...entry, grams: 0 })).toThrow('Hoeveelheid');
    expect(() => validateFoodEntry({ ...entry, meal: 'nacht' })).toThrow('maaltijd');
    expect(() => validateFoodEntry(entry, '2026-11-16')).toThrow('vooruit');
    expect(() => validateProduct({ ...bread, per100: { kcal: 950, protein: 0, carbs: 0, fat: 0 } })).toThrow('Energie');
    expect(() => validateProduct({ ...bread, per100: { kcal: 400, protein: 50, carbs: 40, fat: 20 } })).toThrow('samen');
    expect(() => validateProduct({ ...bread, name: ' ' })).toThrow('naam');
    expect(() => validateSettings({ id: 'settings', kcalTarget: 100, proteinTarget: null })).toThrow('800');
    expect(parseNumber('12,5')).toBe(12.5);
    expect(parseNumber('')).toBeNull();
    expect(parseNumber('abc')).toBeNaN();
  });

  it('controleert een back-up volledig', () => {
    const entry = makeEntry(bread, { id: 'e2', date: '2026-11-17', meal: 'lunch', grams: 70 }, now);
    expect(() => validateVoedingBackup({ stores: { entries: [entry], products: [bread, yoghurt], settings: [{ id: 'settings', kcalTarget: 2200, proteinTarget: 120 }] } })).not.toThrow();
    expect(() => validateVoedingBackup({ stores: { entries: [], products: [] } })).toThrow('instellingen');
    expect(() => validateVoedingBackup({ stores: { entries: [{ id: 'x' }], products: [], settings: [] } })).toThrow();
  });
});

describe('overzicht', () => {
  const entries = [
    makeEntry(yoghurt, { id: 'a', date: '2026-11-17', meal: 'ontbijt', grams: 200 }, at('2026-11-17', 1)),
    makeEntry(bread, { id: 'b', date: '2026-11-17', meal: 'lunch', grams: 70 }, at('2026-11-17', 2)),
    makeEntry(bread, { id: 'c', date: '2026-11-15', meal: 'lunch', grams: 100 }, at('2026-11-15', 3))
  ];

  it('telt per dag en per maaltijd', () => {
    const today = entriesOn(entries, '2026-11-17');
    expect(sumNutrients(today)).toEqual({ kcal: 287, protein: 14.2, carbs: 36.8, fat: 8.7 });
    expect(byMeal(today).ontbijt).toHaveLength(1);
    expect(byMeal(today).diner).toEqual([]);
  });

  it('berekent de verdeling van energie over eiwit, koolhydraten en vet', () => {
    expect(macroSplit({ kcal: 0, protein: 25, carbs: 50, fat: 11.1 })).toEqual({ protein: 25, carbs: 50, fat: 25 });
    expect(macroSplit({ kcal: 0, protein: 0, carbs: 0, fat: 0 })).toBeNull();
  });

  it('maakt een reeks en een gemiddelde zonder lege dagen mee te tellen', () => {
    expect(kcalSeries(entries, '2026-11-17', 3).map((day) => day.value)).toEqual([230, 0, 287]);
    expect(averageKcal(entries, '2026-11-17', 7)).toEqual({ value: 259, days: 2 });
    expect(averageKcal(entries, '2026-12-30', 7)).toBeNull();
  });

  it('toont recent gebruikte producten zonder dubbelen', () => {
    expect(recentProducts(entries, [bread, yoghurt]).map((product) => product.id)).toEqual(['eigen-1', 'off:8710400000000']);
  });

  it('geeft het dashboard alleen óf er vandaag iets is geregistreerd', () => {
    expect(loggedToday(entries, '2026-11-17')).toBe(true);
    expect(loggedToday(entries, '2026-11-16')).toBe(false);
  });
});
