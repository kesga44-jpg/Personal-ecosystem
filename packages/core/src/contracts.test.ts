import { describe, expect, it } from 'vitest';
import { UNAVAILABLE_TARGET_LABEL, resolveTargets, summarizeLinksTo, toLookupItems, type Lookup } from './contracts';
import type { EcosystemModuleLink } from './links';

describe('Lookup geeft alleen { id, title, kind } (ADR 0024 § 3)', () => {
  it('laat geen andere velden door', () => {
    const records = [{ id: 'g1', title: 'Marathon lopen', kind: 'doel', notitie: 'privé', waarde: 42, gewicht: 80 }];
    const items = toLookupItems(records);
    expect(items).toEqual([{ id: 'g1', title: 'Marathon lopen', kind: 'doel' }]);
    expect(Object.keys(items[0]!).sort()).toEqual(['id', 'kind', 'title']);
  });
});

describe('Lookup en soorten (ADR 0024 § 3a)', () => {
  it('laat kind weg bij records buiten de vijf soorten', () => {
    expect(toLookupItems([{ id: 'h1', title: 'Gewoonte' }])).toEqual([{ id: 'h1', title: 'Gewoonte' }]);
  });

  it('markeert een onbekende soort zonder de waarde door te geven of om te zetten', () => {
    const items = toLookupItems([{ id: 'x', title: 'X', kind: 'Doel' }]);
    expect(items).toEqual([{ id: 'x', title: 'X', unknownKind: true }]);
    expect(JSON.stringify(items)).not.toContain('Doel');
  });
});

describe('verwijderd doel breekt de bron niet (ADR 0024 § 5)', () => {
  it('toont "Niet meer beschikbaar" en gooit niets weg', async () => {
    const lookup: Lookup = async (ids) => toLookupItems(ids.filter((id) => id === 'g1').map((id) => ({ id, title: 'Doel', kind: 'doel' })));
    const result = await resolveTargets(['g1', 'weg', 'g1'], lookup);
    expect(result.size).toBe(2);
    expect(result.get('g1')).toEqual({ status: 'available', item: { id: 'g1', title: 'Doel', kind: 'doel' } });
    expect(result.get('weg')).toEqual({ status: 'unavailable', id: 'weg', label: UNAVAILABLE_TARGET_LABEL });
  });

  it('een falende Lookup maakt alles "Niet meer beschikbaar" in plaats van te crashen', async () => {
    const failing: Lookup = async () => {
      throw new Error('database dicht');
    };
    const result = await resolveTargets(['a'], failing);
    expect(result.get('a')?.status).toBe('unavailable');
  });

  it('een Lookup die extra velden teruggeeft, wordt toch ingeperkt', async () => {
    const leaky = (async () => [{ id: 'a', title: 'T', kind: 'doel', geheim: 'x' }]) as unknown as Lookup;
    const result = await resolveTargets(['a'], leaky);
    const item = result.get('a');
    expect(item?.status === 'available' && Object.keys(item.item).sort()).toEqual(['id', 'kind', 'title']);
  });
});

describe('linksTo geeft alleen ID\'s, categorie en titel', () => {
  const links: EcosystemModuleLink[] = [
    {
      id: 'l1',
      category: 'tracks',
      from: { module: 'sport', id: 's1' },
      to: { module: 'groei', id: 'g1' },
      note: 'privé notitie',
      createdAt: '2026-11-22',
      updatedAt: '2026-11-22'
    },
    {
      id: 'l2',
      category: 'onbekend-later',
      from: { module: 'sport', id: 's2' },
      to: { module: 'groei', id: 'g1' },
      createdAt: '2026-11-22',
      updatedAt: '2026-11-22'
    },
    {
      id: 'l3',
      category: 'related',
      from: { module: 'sport', id: 's3' },
      to: { module: 'groei', id: 'g2' },
      createdAt: '2026-11-22',
      updatedAt: '2026-11-22'
    }
  ];

  it('filtert op het doel en laat de notitie weg', () => {
    const result = summarizeLinksTo(links, { module: 'groei', id: 'g1' }, (id) => `Training ${id}`);
    expect(result).toEqual([
      { linkId: 'l1', from: { module: 'sport', id: 's1' }, category: 'tracks', categoryLabel: 'Meet de voortgang van', title: 'Training s1' },
      { linkId: 'l2', from: { module: 'sport', id: 's2' }, category: 'onbekend-later', categoryLabel: 'Overige koppeling', title: 'Training s2' }
    ]);
    expect(JSON.stringify(result)).not.toContain('privé notitie');
  });
});
