import { describe, expect, it } from 'vitest';
import { moduleForPath, moduleLinksFor, moduleUrl } from './modules';

describe('moduleForPath', () => {
  it('koppelt paden aan de juiste module', () => {
    expect(moduleForPath('/')).toBe('dashboard');
    expect(moduleForPath('/instellingen')).toBe('dashboard');
    expect(moduleForPath('/apps/sportapp')).toBe('dashboard');
    expect(moduleForPath('/sport')).toBe('sport');
    expect(moduleForPath('/sport/activiteiten')).toBe('sport');
    expect(moduleForPath('/quest')).toBe('quest');
    expect(moduleForPath('/quest/gewoontes')).toBe('quest');
    expect(moduleForPath('/back-up')).toBe('backup');
  });

  it('verwart geen paden die alleen met dezelfde letters beginnen', () => {
    expect(moduleForPath('/sporten')).toBe('dashboard');
    expect(moduleForPath('/questions')).toBe('dashboard');
  });
});

describe('moduleLinksFor', () => {
  it('markeert alleen de actieve module', () => {
    const links = moduleLinksFor('sport');
    expect(links.map((link) => link.href)).toEqual(['/', '/sport', '/quest', '/back-up']);
    expect(links.filter((link) => link.active).map((link) => link.href)).toEqual(['/sport']);
  });

  it('bouwt module-adressen op dezelfde origin', () => {
    expect(moduleUrl('sport', 'https://pe-hub.kesga44.workers.dev')).toBe('https://pe-hub.kesga44.workers.dev/sport');
    expect(moduleUrl('quest', 'https://pe-hub.kesga44.workers.dev')).toBe('https://pe-hub.kesga44.workers.dev/quest');
  });
});
