import { describe, expect, it } from 'vitest';
import {
  KNOWN_LINK_CATEGORIES,
  LINK_MODULE_IDS,
  UNKNOWN_CATEGORY_LABEL,
  checkNewLink,
  linkCategoryLabel,
  parseModuleLink,
  type LinkCheckInput,
  type LinkModuleId
} from './links';

function input(category: string, from: LinkCheckInput['from'], to: LinkCheckInput['to']): LinkCheckInput {
  return { category, ownModule: from.module, from, to };
}

describe('checkNewLink: toegestane combinaties (ADR 0024 § 2)', () => {
  it('supports-goal: elke module naar een doel in Groei', () => {
    for (const module of LINK_MODULE_IDS) {
      expect(checkNewLink(input('supports-goal', { module, id: 's' }, { module: 'groei', id: 'g', kind: 'doel' }))).toBeNull();
    }
    expect(checkNewLink(input('supports-goal', { module: 'sport', id: 's' }, { module: 'groei', id: 'g', kind: 'actie' }))).toBe(
      'target-not-allowed'
    );
    expect(checkNewLink(input('supports-goal', { module: 'sport', id: 's' }, { module: 'kennis', id: 'k', kind: 'doel' }))).toBe(
      'target-not-allowed'
    );
  });

  it('develops-skill: alleen Kennis, Sport, Kracht, Duur en Voetbal naar een vaardigheid', () => {
    const allowed: LinkModuleId[] = ['kennis', 'sport', 'kracht', 'duur', 'voetbal'];
    for (const module of LINK_MODULE_IDS) {
      const result = checkNewLink(input('develops-skill', { module, id: 's' }, { module: 'groei', id: 'v', kind: 'vaardigheid' }));
      expect(result).toBe(allowed.includes(module) ? null : 'source-not-allowed');
    }
    expect(
      checkNewLink(input('develops-skill', { module: 'sport', id: 's' }, { module: 'groei', id: 'g', kind: 'doel' }))
    ).toBe('target-not-allowed');
  });

  it('derived-from: alleen een actie in Groei of een quest naar een inzicht in Kennis', () => {
    const to = { module: 'kennis' as const, id: 'i', kind: 'inzicht' };
    expect(checkNewLink(input('derived-from', { module: 'groei', id: 'a', kind: 'actie' }, to))).toBeNull();
    expect(checkNewLink(input('derived-from', { module: 'quest', id: 'q', kind: 'quest' }, to))).toBeNull();
    expect(checkNewLink(input('derived-from', { module: 'groei', id: 'd', kind: 'doel' }, to))).toBe('source-not-allowed');
    expect(checkNewLink(input('derived-from', { module: 'sport', id: 's' }, to))).toBe('source-not-allowed');
    expect(checkNewLink(input('derived-from', { module: 'quest', id: 'q', kind: 'quest' }, { ...to, kind: 'bron' }))).toBe(
      'target-not-allowed'
    );
  });

  it('tracks: alleen Sport, Voeding en Financiën naar een doel', () => {
    const allowed: LinkModuleId[] = ['sport', 'voeding', 'financien'];
    for (const module of LINK_MODULE_IDS) {
      const result = checkNewLink(input('tracks', { module, id: 's' }, { module: 'groei', id: 'g', kind: 'doel' }));
      expect(result).toBe(allowed.includes(module) ? null : 'source-not-allowed');
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
        expect(checkNewLink(input(category, { module: 'groei', id: 'a', kind: 'actie' }, { module: target, id: 'x' }))).toBe(
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

  it('weigert een koppeling naar zichzelf en een onbekende categorie bij aanmaken', () => {
    expect(checkNewLink(input('related', { module: 'sport', id: 's' }, { module: 'sport', id: 's' }))).toBe('self-link');
    expect(checkNewLink(input('toekomstige-categorie', { module: 'sport', id: 's' }, { module: 'groei', id: 'g' }))).toBe(
      'unknown-category'
    );
  });
});

describe('parseModuleLink: onbekende categorie blijft bewaard (ADR 0024 § 2)', () => {
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
    const parsed = parseModuleLink(raw);
    expect(parsed).not.toBeNull();
    expect(parsed?.knownCategory).toBe(false);
    expect(parsed?.link.category).toBe('toekomstige-categorie');
    expect(linkCategoryLabel(parsed!.link.category)).toBe(UNKNOWN_CATEGORY_LABEL);
  });

  it('overleeft een back-up en herstel (JSON heen en terug) zonder verlies', () => {
    const first = parseModuleLink(raw)!;
    const restored = parseModuleLink(JSON.parse(JSON.stringify(first.link)))!;
    expect(restored.link).toEqual(first.link);
    expect(restored.link).toEqual(raw);
  });

  it('weigert alleen records zonder geldige basisvelden', () => {
    expect(parseModuleLink({ ...raw, id: '' })).toBeNull();
    expect(parseModuleLink({ ...raw, from: { module: 'onbekend', id: 's1' } })).toBeNull();
    expect(parseModuleLink({ ...raw, to: undefined })).toBeNull();
    expect(parseModuleLink('geen object')).toBeNull();
  });

  it('kent de labels van bekende categorieën', () => {
    expect(linkCategoryLabel('supports-goal')).toBe('Draagt bij aan een doel');
    expect(linkCategoryLabel('related')).toBe('Hoort bij');
  });
});
