import { describe, expect, it } from 'vitest';
import { buildCatalog, isWgerExercise, searchCatalog } from './wger';

const english = {
  results: [
    { exercise: 2, name: '  Squats ', license: 4, license_author: '' },
    { exercise: 1, name: 'Barbell Curl', license: 3, license_author: 'Anna' },
    { exercise: 2, name: 'Squats (duplicate)', license: 4 },
    { exercise: 3, name: 'Unknown licence', license: 42 },
    { exercise: 'x', name: 'Bad id', license: 1 },
    { exercise: 4, name: '', license: 1 },
    { exercise: 5, name: 'Lunges', license: 1, license_author: 'Piet' }
  ]
};

describe('wger-catalogus', () => {
  it('houdt alleen geldige oefeningen met bekende licentie over, met Nederlandse naam waar die bestaat', () => {
    const catalog = buildCatalog(english, { results: [{ exercise: 2, name: 'Kniebuigingen' }] });
    expect(catalog.map((item) => item.id)).toEqual([1, 5, 2]);
    expect(catalog.find((item) => item.id === 2)).toEqual({ id: 2, name: 'Squats', nameNl: 'Kniebuigingen', license: 'CC-BY 4', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/', author: 'wger.de' });
    expect(catalog.every(isWgerExercise)).toBe(true);
    expect(buildCatalog(null, undefined)).toEqual([]);
  });

  it('zoekt zonder hoofdletters en accenten; namen die met de term beginnen eerst', () => {
    const catalog = buildCatalog(english, { results: [{ exercise: 2, name: 'Kniebuigingen' }] });
    expect(searchCatalog(catalog, 'KNIE').map((item) => item.id)).toEqual([2]);
    expect(searchCatalog(catalog, 'un').map((item) => item.id)).toEqual([5]);
    expect(searchCatalog(catalog, 'l').length).toBe(0);
    expect(searchCatalog(catalog, 'es', 1)).toHaveLength(1);
  });

  it('herkent ongeldige antwoorden', () => {
    expect(isWgerExercise({ id: 1, name: 'x', nameNl: null, license: 'CC0', licenseUrl: 'javascript:alert(1)', author: 'a' })).toBe(false);
    expect(isWgerExercise({ id: 0, name: 'x', nameNl: null, license: 'CC0', licenseUrl: 'https://a', author: 'a' })).toBe(false);
  });
});
