import { describe, expect, it } from 'vitest';
import { cleanQuery, isBarcode, parseOffProduct, parseOffSearch } from './product';

describe('Open Food Facts omzetten', () => {
  it('rekent kJ om als kcal ontbreekt en begrenst macro\'s', () => {
    const product = parseOffProduct({ code: '12345678', product_name: 'Brood', nutriments: { 'energy-kj_100g': 1046, proteins_100g: '9', carbohydrates_100g: 140, fat_100g: -2 } });
    expect(product).toEqual({ code: '12345678', name: 'Brood', brand: '', per100: { kcal: 250, protein: 9, carbs: 100, fat: 0 }, servingGrams: null });
  });

  it('weigert producten zonder naam, energie of geldige barcode', () => {
    expect(parseOffProduct({ code: '12345678', nutriments: { 'energy-kcal_100g': 100 } })).toBeNull();
    expect(parseOffProduct({ code: '12345678', product_name: 'X', nutriments: {} })).toBeNull();
    expect(parseOffProduct({ code: 'abc', product_name: 'X', nutriments: { 'energy-kcal_100g': 100 } })).toBeNull();
    expect(parseOffProduct(null)).toBeNull();
  });

  it('ontdubbelt zoekresultaten', () => {
    const item = { code: '12345678', product_name: 'X', nutriments: { 'energy-kcal_100g': 10 } };
    expect(parseOffSearch({ products: [item, item] })).toHaveLength(1);
    expect(parseOffSearch({})).toEqual([]);
  });

  it('controleert barcode en zoekterm', () => {
    expect(isBarcode('8710400000000')).toBe(true);
    expect(isBarcode('1234567')).toBe(false);
    expect(cleanQuery('  a  ')).toBeNull();
    expect(cleanQuery(`  pinda   kaas ${'x'.repeat(100)}`)?.length).toBe(60);
  });
});
