import { describe, expect, it } from 'vitest';
import {
  KNOWN_LINK_CATEGORIES,
  LINK_MODULE_IDS,
  UNKNOWN_CATEGORY_LABEL,
  ECOSYSTEM_RECORD_KINDS,
  PHYSICAL_DATABASE,
  RECORD_KIND_MEANING,
  checkNewLink,
  parseRecordKind,
  sharesPhysicalDatabase,
  linkCategoryLabel,
  parseEcosystemModuleLink,
  type LinkCheckInput,
  type LinkModuleId
} from './links';

function input(category: string, from: LinkCheckInput['from'], to: LinkCheckInput['to']): LinkCheckInput {
  return { category, ownModule: from.module, from, to };
}

describe('checkNewLink: toegestane combinaties (ADR 0024 § 2)', () => {
  it('supports-goal: elke module met een andere fysieke database naar een doel in Groei', () => {
    for (const module of LINK_MODULE_IDS) {
      const result = checkNewLink(input('supports-goal', { module, id: 's' }, { module: 'groei', id: 'g', kind: 'doel' }));
      expect(result).toBe(module === 'groei' || module === 'kennis' ? 'same-database' : null);
    }
    expect(checkNewLink(input('supports-goal', { module: 'sport', id: 's' }, { module: 'groei', id: 'g', kind: 'actie' }))).toBe(
      'target-not-allowed'
    );
    expect(checkNewLink(input('supports-goal', { module: 'sport', id: 's' }, { module: 'kennis', id: 'k', kind: 'doel' }))).toBe(
      'target-not-allowed'
    );
  });

  it('develops-skill: alleen Sport, Kracht, Duur en Voetbal naar een vaardigheid (Kennis is een ID-veld)', () => {
    const allowed: LinkModuleId[] = ['sport', 'kracht', 'duur', 'voetbal'];
    for (const module of LINK_MODULE_IDS) {
      const result = checkNewLink(input('develops-skill', { module, id: 's' }, { module: 'groei', id: 'v', kind: 'vaardigheid' }));
      const expected = module === 'groei' || module === 'kennis' ? 'same-database' : allowed.includes(module) ? null : 'source-not-allowed';
      expect(result).toBe(expected);
    }
    expect(
      checkNewLink(input('develops-skill', { module: 'sport', id: 's' }, { module: 'groei', id: 'g', kind: 'doel' }))
    ).toBe('target-not-allowed');
  });

  it('derived-from: alleen een quest naar een inzicht in Kennis (actie in Groei is een ID-veld)', () => {
    const to = { module: 'kennis' as const, id: 'i', kind: 'inzicht' };
    expect(checkNewLink(input('derived-from', { module: 'quest', id: 'q', kind: 'quest' }, to))).toBeNull();
    expect(checkNewLink(input('derived-from', { module: 'groei', id: 'a', kind: 'actie' }, to))).toBe('same-database');
    expect(checkNewLink(input('derived-from', { module: 'sport', id: 's' }, to))).toBe('source-not-allowed');
    expect(checkNewLink(input('derived-from', { module: 'quest', id: 'q', kind: 'quest' }, { ...to, kind: 'doel' }))).toBe(
      'target-not-allowed'
    );
  });

  it('tracks: alleen Sport, Voeding en Financiën naar een doel', () => {
    const allowed: LinkModuleId[] = ['sport', 'voeding', 'financien'];
    for (const module of LINK_MODULE_IDS) {
      const result = checkNewLink(input('tracks', { module, id: 's' }, { module: 'groei', id: 'g', kind: 'doel' }));
      const expected = module === 'groei' || module === 'kennis' ? 'same-database' : allowed.includes(module) ? null : 'source-not-allowed';
      expect(result).toBe(expected);
    }
  });

  it('related: alle modules, behalve naar Lichaam en Dagboek', () => {
    expect(checkNewLink(input('related', { module: 'reizen', id: 'r' }, { module: 'voetbal', id: 'v' }))).toBeNull();
    expect(checkNewLink(input('related', { module: 'sport', id: 's' }, { module: 'lichaam', id: 'l' }))).toBe('target-forbidden');
    expect(checkNewLink(input('related', { module: 'sport', id: 's' }, { module: 'dagboek', id: 'd' }))).toBe('target-forbidden');
  });

  it('Lichaam en Dagboek zijn bij geen enkele categorie een doel (ADR 0024 § 4)', () => {
    for (const category of KNOWN_LINK_CATEGORIES) {
      for (const target of ['lichaam', 'dagboek'] as const) {
        expect(checkNewLink(input(category, { module: 'sport', id: 'a' }, { module: target, id: 'x' }))).toBe(
          'target-forbidden'
        );
      }
    }
  });

  it('een module slaat alleen koppelingen op met zichzelf als bron', () => {
    expect(
      checkNewLink({
        category: 'related',
        ownModule: 'sport',
        from: { module: 'kracht', id: 'k' },
        to: { module: 'groei', id: 'g' }
      })
    ).toBe('not-own-module');
  });

  it('weigert een koppelrecord tussen modules met dezelfde fysieke database (ADR 0024 § 6)', () => {
    for (const category of KNOWN_LINK_CATEGORIES) {
      expect(checkNewLink(input(category, { module: 'kennis', id: 'k' }, { module: 'groei', id: 'g', kind: 'doel' }))).toBe('same-database');
      expect(checkNewLink(input(category, { module: 'groei', id: 'g' }, { module: 'kennis', id: 'k', kind: 'inzicht' }))).toBe('same-database');
    }
    expect(checkNewLink(input('related', { module: 'sport', id: 'a' }, { module: 'sport', id: 'b' }))).toBe('same-database');
    expect(sharesPhysicalDatabase('groei', 'kennis')).toBe(true);
    expect(PHYSICAL_DATABASE.kennis).toBe('personal-ecosystem-groei');
    expect(sharesPhysicalDatabase('groei', 'sport')).toBe(false);
  });

  it('weigert een onbekende soort in plaats van die om te zetten (ADR 0024 § 3a)', () => {
    expect(checkNewLink(input('supports-goal', { module: 'sport', id: 's' }, { module: 'groei', id: 'g', kind: 'Doel' }))).toBe('unknown-kind');
    expect(checkNewLink(input('related', { module: 'sport', id: 's', kind: 'bron' }, { module: 'reizen', id: 'r' }))).toBe('unknown-kind');
  });

  it('een record zonder soort kan alleen doel zijn van een categorie zonder soorteis', () => {
    expect(checkNewLink(input('related', { module: 'sport', id: 's' }, { module: 'groei', id: 'gewoonte-1' }))).toBeNull();
    expect(checkNewLink(input('supports-goal', { module: 'sport', id: 's' }, { module: 'groei', id: 'gewoonte-1' }))).toBe(
      'target-not-allowed'
    );
  });

  it('weigert een koppeling naar zichzelf en een onbekende categorie bij aanmaken', () => {
    expect(checkNewLink(input('related', { module: 'sport', id: 's' }, { module: 'sport', id: 's' }))).toBe('self-link');
    expect(checkNewLink(input('toekomstige-categorie', { module: 'sport', id: 's' }, { module: 'groei', id: 'g' }))).toBe(
      'unknown-category'
    );
  });
});

describe('parseEcosystemModuleLink: onbekende categorie blijft bewaard (ADR 0024 § 2)', () => {
  const raw = {
    id: 'l1',
    category: 'toekomstige-categorie',
    from: { module: 'sport', id: 's1' },
    to: { module: 'groei', id: 'g1' },
    note: 'eigen notitie',
    createdAt: '2026-11-22T10:00:00.000Z',
    updatedAt: '2026-11-22T10:00:00.000Z'
  };

  it('houdt de onbekende categorie letterlijk vast en toont "Overige koppeling"', () => {
    const parsed = parseEcosystemModuleLink(raw);
    expect(parsed).not.toBeNull();
    expect(parsed?.knownCategory).toBe(false);
    expect(parsed?.link.category).toBe('toekomstige-categorie');
    expect(linkCategoryLabel(parsed!.link.category)).toBe(UNKNOWN_CATEGORY_LABEL);
  });

  it('overleeft een back-up en herstel (JSON heen en terug) zonder verlies', () => {
    const first = parseEcosystemModuleLink(raw)!;
    const restored = parseEcosystemModuleLink(JSON.parse(JSON.stringify(first.link)))!;
    expect(restored.link).toEqual(first.link);
    expect(restored.link).toEqual(raw);
  });

  it('weigert alleen records zonder geldige basisvelden', () => {
    expect(parseEcosystemModuleLink({ ...raw, id: '' })).toBeNull();
    expect(parseEcosystemModuleLink({ ...raw, from: { module: 'onbekend', id: 's1' } })).toBeNull();
    expect(parseEcosystemModuleLink({ ...raw, to: undefined })).toBeNull();
    expect(parseEcosystemModuleLink('geen object')).toBeNull();
  });

  it('kent de labels van bekende categorieën', () => {
    expect(linkCategoryLabel('supports-goal')).toBe('Draagt bij aan een doel');
    expect(linkCategoryLabel('related')).toBe('Hoort bij');
  });
});

describe('soorten: gesloten set (ADR 0024 § 3a)', () => {
  it('kent precies vijf soorten, lowercase, elk met betekenis', () => {
    expect([...ECOSYSTEM_RECORD_KINDS]).toEqual(['doel', 'vaardigheid', 'actie', 'quest', 'inzicht']);
    for (const kind of ECOSYSTEM_RECORD_KINDS) {
      expect(kind).toBe(kind.toLowerCase());
      expect(RECORD_KIND_MEANING[kind].length).toBeGreaterThan(0);
    }
  });

  it('zet een onbekende waarde nooit om naar een bekende', () => {
    expect(parseRecordKind('doel')).toEqual({ kind: 'doel' });
    expect(parseRecordKind('Doel')).toEqual({ unknownKind: 'Doel' });
    expect(parseRecordKind('goal')).toEqual({ unknownKind: 'goal' });
    expect(parseRecordKind(undefined)).toEqual({});
    expect(parseRecordKind('')).toEqual({});
  });
});

describe('parseEcosystemModuleLink: koppelrecord binnen één database wordt gemeld, niet weggegooid', () => {
  it('markeert Groei ↔ Kennis als sameDatabase en bewaart het record', () => {
    const parsed = parseEcosystemModuleLink({
      id: 'l9',
      category: 'derived-from',
      from: { module: 'groei', id: 'a' },
      to: { module: 'kennis', id: 'i' },
      createdAt: '2026-11-22',
      updatedAt: '2026-11-22'
    });
    expect(parsed?.sameDatabase).toBe(true);
    expect(parsed?.link.from.module).toBe('groei');
  });
});
