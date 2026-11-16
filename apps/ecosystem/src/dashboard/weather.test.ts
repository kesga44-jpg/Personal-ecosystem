import { describe, expect, it } from 'vitest';
import { describeWeather, forecastUrl, geocodingUrl, parseForecast, parseGeocoding, roundCoordinate, trainingAdvice } from './weather';

describe('Open-Meteo', () => {
  it('stuurt alleen een afgeronde locatie mee', () => {
    const url = new URL(forecastUrl({ latitude: 52.090737, longitude: 5.12142 }));
    expect(url.origin).toBe('https://api.open-meteo.com');
    expect(url.searchParams.get('latitude')).toBe('52.09');
    expect(url.searchParams.get('longitude')).toBe('5.12');
    expect([...url.searchParams.keys()].sort()).toEqual(['current', 'daily', 'forecast_days', 'latitude', 'longitude', 'timezone']);
    expect(roundCoordinate(-0.125)).toBe(-0.12);
  });

  it('begrenst zoektermen', () => {
    const url = new URL(geocodingUrl(`  ${'a'.repeat(200)}  `));
    expect(url.searchParams.get('name')).toHaveLength(80);
    expect(url.searchParams.get('language')).toBe('nl');
  });

  it('leest een volledig weerbericht', () => {
    const weather = parseForecast({
      current: { temperature_2m: 7.4, weather_code: 61, wind_speed_10m: 18 },
      daily: { temperature_2m_max: [9.1], temperature_2m_min: [3.2], precipitation_probability_max: [80] }
    });
    expect(weather).toEqual({ temperature: 7.4, code: 61, windKmh: 18, min: 3.2, max: 9.1, rainChance: 80 });
    expect(describeWeather(weather.code).label).toBe('Regen');
    expect(trainingAdvice(weather)).toContain('regen');
  });

  it('verzint niets bij een onvolledig antwoord', () => {
    expect(() => parseForecast({ current: { temperature_2m: 7 } })).toThrow('onvolledig');
    expect(() => parseForecast(null)).toThrow();
  });

  it('leest zoekresultaten en slaat ongeldige over', () => {
    expect(parseGeocoding({ results: [{ name: 'Utrecht', latitude: 52.0907, longitude: 5.1214, admin1: 'Utrecht', country: 'Nederland' }, { name: 'Fout' }] }))
      .toEqual([{ name: 'Utrecht, Utrecht, Nederland', latitude: 52.09, longitude: 5.12 }]);
    expect(parseGeocoding({})).toEqual([]);
  });
});
