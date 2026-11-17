import { describe, expect, it } from 'vitest';
import { buildCatalog, isWgerExercise, isWgerSearchItem, parseExerciseInfo, searchCatalog, translationsFromText } from './wger';

// Vorm zoals wger die op 17-11-2026 teruggaf: vertalingen hebben géén licentieveld.
const english = {
  results: [
    { id: 345, exercise: 2, name: '  Squats ', language: 2, license_author: 'a' },
    { id: 346, exercise: 1, name: 'Barbell Curl', language: 2, license_author: 'Anna' },
    { id: 347, exercise: 2, name: 'Squats (duplicate)', language: 2 },
    { id: 348, exercise: 'x', name: 'Bad id', language: 2 },
    { id: 349, exercise: 4, name: '', language: 2 },
    { id: 350, exercise: 5, name: 'Lunges', language: 2 }
  ]
};
const dutch = { results: [{ id: 900, exercise: 2, name: 'Kniebuigingen', language: 6 }] };

const info = {
  id: 9,
  license: { id: 2, full_name: 'Creative Commons Attribution Share Alike 4', short_name: 'CC-BY-SA 4', url: 'https://creativecommons.org/licenses/by-sa/4.0/deed.en' },
  license_author: 'deusinvictus',
  translations: [
    { id: 345, exercise: 9, name: '2 Handed Kettlebell Swing', language: 2, license: 2, license_author: 'deusinvictus' },
    { id: 901, exercise: 9, name: 'Kettlebell swing met twee handen', language: 6, license: 2, license_author: 'Piet' },
    { id: 902, exercise: 9, name: 'Kettlebell-Schwung', language: 1, license: 2, license_author: 'Hans' }
  ]
};

describe('wger-catalogus', () => {
  it('houdt alleen geldige namen over, zonder dubbelen, met Nederlandse naam waar die bestaat', () => {
    const catalog = buildCatalog(english, dutch);
    expect(catalog).toEqual([
      { id: 2, name: 'Squats', nameNl: 'Kniebuigingen' },
      { id: 1, name: 'Barbell Curl', nameNl: null },
      { id: 5, name: 'Lunges', nameNl: null }
    ]);
    expect(catalog.every(isWgerSearchItem)).toBe(true);
    expect(buildCatalog(null, undefined)).toEqual([]);
  });

  it('zoekt zonder hoofdletters en accenten; namen die met de term beginnen eerst', () => {
    const catalog = buildCatalog(english, dutch);
    expect(searchCatalog(catalog, 'KNIE').map((item) => item.id)).toEqual([2]);
    expect(searchCatalog(catalog, 'un').map((item) => item.id)).toEqual([5]);
    expect(searchCatalog(catalog, 'l').length).toBe(0);
    expect(searchCatalog(catalog, 'es', 1)).toHaveLength(1);
    // Begint-met eerst, daarna alfabetisch.
    expect(searchCatalog([{ id: 1, name: 'Zercher squat', nameNl: null }, { id: 2, name: 'Squat', nameNl: null }, { id: 3, name: 'Box squat', nameNl: null }], 'squat').map((item) => item.id)).toEqual([2, 3, 1]);
    expect(searchCatalog([{ id: 7, name: 'Crème press', nameNl: null }], 'creme').map((item) => item.id)).toEqual([7]);
  });
});

describe('namen uit de ruwe JSON', () => {
  it('leest naam en ID zonder het hele antwoord te parsen, ook met lastige tekens', () => {
    const raw = JSON.stringify({ count: 2, results: [
      { id: 1, uuid: 'u', name: 'Farmer\'s "Walk" \\ ü', exercise: 12, description: '<p>"name":"nep","exercise":99</p>', language: 2 },
      { id: 2, uuid: 'v', name: 'Plank', exercise: 3, description: '', language: 2 }
    ] });
    expect(translationsFromText(raw).results).toEqual([
      { exercise: 12, name: 'Farmer\'s "Walk" \\ ü' },
      { exercise: 3, name: 'Plank' }
    ]);
  });

  it('valt terug op gewoon parsen als de veldvolgorde anders is', () => {
    const raw = JSON.stringify({ results: [{ exercise: 4, name: 'Row' }] });
    expect(translationsFromText(raw).results).toEqual([{ exercise: 4, name: 'Row' }]);
    expect(translationsFromText('kapot').results).toEqual([]);
    expect(buildCatalog(translationsFromText(raw), null)).toEqual([{ id: 4, name: 'Row', nameNl: null }]);
  });
});

describe('licentie per oefening (exerciseinfo)', () => {
  it('neemt licentie, Engelse en Nederlandse naam en alle auteurs over', () => {
    const exercise = parseExerciseInfo(info);
    expect(exercise).toEqual({
      id: 9,
      name: '2 Handed Kettlebell Swing',
      nameNl: 'Kettlebell swing met twee handen',
      license: 'CC-BY-SA 4',
      licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/deed.en',
      author: 'deusinvictus, Piet'
    });
    expect(isWgerExercise(exercise)).toBe(true);
  });

  it('weigert onbekende licenties en oefeningen zonder Engelse naam', () => {
    expect(parseExerciseInfo({ ...info, license: { id: 99 } })).toBeNull();
    expect(parseExerciseInfo({ ...info, license: 3 })).toMatchObject({ license: 'CC0' });
    expect(parseExerciseInfo({ ...info, translations: [info.translations[1]] })).toBeNull();
    expect(parseExerciseInfo({ ...info, license_author: '', translations: [{ ...info.translations[0], license_author: '' }] })).toMatchObject({ author: 'wger.de', nameNl: null });
    expect(parseExerciseInfo(null)).toBeNull();
  });

  it('herkent ongeldige antwoorden', () => {
    expect(isWgerExercise({ id: 1, name: 'x', nameNl: null, license: 'CC0', licenseUrl: 'javascript:alert(1)', author: 'a' })).toBe(false);
    expect(isWgerExercise({ id: 0, name: 'x', nameNl: null, license: 'CC0', licenseUrl: 'https://a', author: 'a' })).toBe(false);
    expect(isWgerSearchItem({ id: 3, name: '', nameNl: null })).toBe(false);
  });
});
