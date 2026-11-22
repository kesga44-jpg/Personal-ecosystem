/**
 * Koppelingen tussen modules (ADR 0024).
 *
 * Een koppeling is een record in de `links`-store van de module van de bron. Deze module
 * bevat alleen de gedeelde typen en de regels; opslag en weergave horen bij de modules zelf.
 */
import type { ImportOrigin } from './importOrigin';

/** Modules die aan een koppeling kunnen meedoen (ADR 0020 en ADR 0023). */
export const LINK_MODULE_IDS = [
  'groei',
  'kennis',
  'sport',
  'kracht',
  'duur',
  'voeding',
  'financien',
  'voetbal',
  'reizen',
  'quest',
  'lichaam',
  'dagboek'
] as const;

export type LinkModuleId = (typeof LINK_MODULE_IDS)[number];

/** Lichaam en Dagboek zijn nooit het doel van een koppeling (ADR 0024 § 4). */
export const NEVER_LINK_TARGET: readonly LinkModuleId[] = ['lichaam', 'dagboek'];

/** De bekende categorieën uit ADR 0024 § 2. */
export const KNOWN_LINK_CATEGORIES = ['supports-goal', 'develops-skill', 'derived-from', 'tracks', 'related'] as const;

export type KnownLinkCategory = (typeof KNOWN_LINK_CATEGORIES)[number];

/**
 * Een categorie uit een back-up of import kan onbekend zijn (bijvoorbeeld uit een nieuwere versie).
 * Die blijft bewaard als tekst en wordt getoond als "Overige koppeling" (ADR 0024 § 2).
 */
export type LinkCategory = KnownLinkCategory | (string & { readonly __unknownCategory?: never });

export interface LinkEndpoint {
  module: LinkModuleId;
  id: string;
}

export interface ModuleLink {
  id: string;
  category: LinkCategory;
  /** Altijd de eigen module: een module schrijft alleen in de eigen `links`-store. */
  from: LinkEndpoint;
  to: LinkEndpoint;
  note?: string;
  createdAt: string;
  updatedAt: string;
  /** Alleen bij records uit een import (ADR 0025). */
  origin?: ImportOrigin;
}

/** Een eindpunt in een regel: een module, eventueel beperkt tot bepaalde soorten records. */
interface EndpointRule {
  module: LinkModuleId;
  /** Leeg of afwezig betekent: elke soort record van deze module. */
  kinds?: readonly string[];
}

interface CategoryRule {
  label: string;
  /** `'any'` = elke module. */
  from: 'any' | readonly EndpointRule[];
  /** `'any'` = elke module behalve Lichaam en Dagboek. */
  to: 'any' | readonly EndpointRule[];
}

/** De toegestane combinaties uit ADR 0024 § 2. Een nieuwe categorie is een kleine codewijziging met tests. */
export const LINK_CATEGORY_RULES: Readonly<Record<KnownLinkCategory, CategoryRule>> = {
  'supports-goal': {
    label: 'Draagt bij aan een doel',
    from: 'any',
    to: [{ module: 'groei', kinds: ['doel'] }]
  },
  'develops-skill': {
    label: 'Ontwikkelt een vaardigheid',
    from: [{ module: 'kennis' }, { module: 'sport' }, { module: 'kracht' }, { module: 'duur' }, { module: 'voetbal' }],
    to: [{ module: 'groei', kinds: ['vaardigheid'] }]
  },
  'derived-from': {
    label: 'Is ontstaan uit',
    from: [
      { module: 'groei', kinds: ['actie'] },
      { module: 'quest', kinds: ['quest'] }
    ],
    to: [{ module: 'kennis', kinds: ['inzicht'] }]
  },
  tracks: {
    label: 'Meet de voortgang van',
    from: [{ module: 'sport' }, { module: 'voeding' }, { module: 'financien' }],
    to: [{ module: 'groei', kinds: ['doel'] }]
  },
  related: {
    label: 'Hoort bij',
    from: 'any',
    to: 'any'
  }
};

export const UNKNOWN_CATEGORY_LABEL = 'Overige koppeling';

export function isKnownLinkCategory(category: string): category is KnownLinkCategory {
  return (KNOWN_LINK_CATEGORIES as readonly string[]).includes(category);
}

export function isLinkModuleId(value: string): value is LinkModuleId {
  return (LINK_MODULE_IDS as readonly string[]).includes(value);
}

/** De naam van een categorie voor weergave; onbekende categorieën heten "Overige koppeling". */
export function linkCategoryLabel(category: string): string {
  return isKnownLinkCategory(category) ? LINK_CATEGORY_RULES[category].label : UNKNOWN_CATEGORY_LABEL;
}

function matches(rule: EndpointRule, endpoint: { module: LinkModuleId; kind?: string | undefined }): boolean {
  if (rule.module !== endpoint.module) return false;
  if (!rule.kinds || rule.kinds.length === 0) return true;
  return endpoint.kind !== undefined && rule.kinds.includes(endpoint.kind);
}

export type LinkRejection =
  | 'unknown-category'
  | 'target-forbidden'
  | 'not-own-module'
  | 'source-not-allowed'
  | 'target-not-allowed'
  | 'self-link';

export interface LinkCheckInput {
  category: string;
  /** De module die de koppeling wil opslaan. */
  ownModule: LinkModuleId;
  from: { module: LinkModuleId; id: string; kind?: string };
  /** `kind` komt uit de `Lookup` van de doelmodule (ADR 0024 § 3). */
  to: { module: LinkModuleId; id: string; kind?: string };
}

/**
 * Controleert of een **nieuwe** koppeling mag worden aangemaakt. Geeft `null` als het mag,
 * anders de reden. Bestaande koppelingen (bijvoorbeeld met een onbekende categorie uit een back-up)
 * worden hiermee niet afgekeurd of verwijderd; daarvoor dient {@link parseModuleLink}.
 */
export function checkNewLink(input: LinkCheckInput): LinkRejection | null {
  if (!isKnownLinkCategory(input.category)) return 'unknown-category';
  if (NEVER_LINK_TARGET.includes(input.to.module)) return 'target-forbidden';
  if (input.from.module !== input.ownModule) return 'not-own-module';
  if (input.from.module === input.to.module && input.from.id === input.to.id) return 'self-link';
  const rule = LINK_CATEGORY_RULES[input.category];
  if (rule.from !== 'any' && !rule.from.some((r) => matches(r, input.from))) return 'source-not-allowed';
  if (rule.to !== 'any' && !rule.to.some((r) => matches(r, input.to))) return 'target-not-allowed';
  return null;
}

export interface ParsedModuleLink {
  link: ModuleLink;
  /** `false` bij een categorie die deze versie niet kent: bewaren en tonen als "Overige koppeling". */
  knownCategory: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseEndpoint(value: unknown): LinkEndpoint | null {
  if (!isRecord(value)) return null;
  const { module, id } = value;
  if (typeof module !== 'string' || !isLinkModuleId(module) || typeof id !== 'string' || id === '') return null;
  return { module, id };
}

/**
 * Leest een koppelrecord uit een back-up of import. Een onbekende categorie blijft letterlijk bewaard
 * (ADR 0024 § 2); alleen een record zonder geldige basisvelden wordt geweigerd (`null`).
 */
export function parseModuleLink(value: unknown): ParsedModuleLink | null {
  if (!isRecord(value)) return null;
  const { id, category, createdAt, updatedAt, note, origin } = value;
  const from = parseEndpoint(value.from);
  const to = parseEndpoint(value.to);
  if (typeof id !== 'string' || id === '' || typeof category !== 'string' || category === '') return null;
  if (!from || !to || typeof createdAt !== 'string' || typeof updatedAt !== 'string') return null;
  const link: ModuleLink = { id, category, from, to, createdAt, updatedAt };
  if (typeof note === 'string') link.note = note;
  if (isRecord(origin)) link.origin = origin as unknown as ImportOrigin;
  return { link, knownCategory: isKnownLinkCategory(category) };
}
