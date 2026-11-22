/**
 * Koppelingen tussen modules (ADR 0024).
 *
 * Een koppeling (`EcosystemModuleLink`) is een record in de `links`-store van de module van de bron.
 * Ze bestaat alleen tussen records in **verschillende fysieke databases** (ADR 0024 § 6). Binnen één
 * fysieke database (Groei en Kennis delen `personal-ecosystem-groei`) zijn relaties ID-velden.
 *
 * Let op: `ModuleLink` uit `@ecosystem/ui` is iets anders, namelijk een navigatielink. Die naam
 * wordt hier bewust niet gebruikt (ADR 0024 § 1).
 */
import type { ImportOrigin } from './importOrigin';

/** Modules (menu-items) die aan een koppeling kunnen meedoen (ADR 0020 en ADR 0023). */
export const LINK_MODULE_IDS = [
  'groei',
  'kennis',
  'sport',
  'kracht',
  'duur',
  'voeding',
  'financien',
  'quest',
  'lichaam',
  'dagboek'
] as const;

export type LinkModuleId = (typeof LINK_MODULE_IDS)[number];

/**
 * De fysieke IndexedDB-database per module (ADR 0023 § 2, DATA_OWNERSHIP.md). Groei en Kennis delen er één;
 * relaties daartussen zijn ID-velden, geen koppelrecords (ADR 0024 § 6).
 */
export const PHYSICAL_DATABASE: Readonly<Record<LinkModuleId, string>> = {
  groei: 'personal-ecosystem-groei',
  kennis: 'personal-ecosystem-groei',
  sport: 'personal-ecosystem-sport',
  kracht: 'personal-ecosystem-kracht',
  duur: 'personal-ecosystem-duur',
  voeding: 'personal-ecosystem-voeding',
  financien: 'personal-ecosystem-financien',
  quest: 'personal-ecosystem-sidequest',
  lichaam: 'personal-ecosystem-lichaam',
  dagboek: 'personal-ecosystem-dagboek'
};

/** `true` als twee modules dezelfde fysieke database gebruiken. Dan is een relatie een ID-veld. */
export function sharesPhysicalDatabase(a: LinkModuleId, b: LinkModuleId): boolean {
  return PHYSICAL_DATABASE[a] === PHYSICAL_DATABASE[b];
}

/** Lichaam en Dagboek zijn nooit het doel van een koppeling (ADR 0024 § 4). */
export const NEVER_LINK_TARGET: readonly LinkModuleId[] = ['lichaam', 'dagboek'];

/** De gesloten set soorten (ADR 0024 § 3a). Een nieuwe waarde is een besluit van de eigenaar. */
export const ECOSYSTEM_RECORD_KINDS = ['doel', 'vaardigheid', 'actie', 'quest', 'inzicht'] as const;

export type EcosystemRecordKind = (typeof ECOSYSTEM_RECORD_KINDS)[number];

export const RECORD_KIND_MEANING: Readonly<Record<EcosystemRecordKind, string>> = {
  doel: 'Gewenst resultaat of eindpunt',
  vaardigheid: 'Competentie die ontwikkeld of toegepast wordt',
  actie: 'Concrete handeling of activiteit',
  quest: 'Grotere uitdaging of samenhangende opdracht',
  inzicht: 'Kennis, reflectie of verworven begrip'
};

export function isEcosystemRecordKind(value: unknown): value is EcosystemRecordKind {
  return typeof value === 'string' && (ECOSYSTEM_RECORD_KINDS as readonly string[]).includes(value);
}

/**
 * Leest een opgeslagen of geïmporteerde soort. Een bekende waarde komt terug als `kind`; een onbekende
 * waarde wordt **niet** omgezet maar letterlijk teruggegeven als `unknownKind` (ADR 0024 § 3a).
 * Geen waarde betekent: het record valt buiten de vijf soorten.
 */
export function parseRecordKind(value: unknown): { kind?: EcosystemRecordKind; unknownKind?: string } {
  if (value === undefined || value === null || value === '') return {};
  if (isEcosystemRecordKind(value)) return { kind: value };
  return { unknownKind: typeof value === 'string' ? value : JSON.stringify(value) };
}

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

/** Het koppelrecord uit ADR 0024 § 1. */
export interface EcosystemModuleLink {
  id: string;
  category: LinkCategory;
  /** Altijd de eigen module: een module schrijft alleen in de eigen `links`-store. */
  from: LinkEndpoint;
  /** Een module met een andere fysieke database dan de bron. */
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
  kinds?: readonly EcosystemRecordKind[];
}

interface CategoryRule {
  label: string;
  /** `'any'` = elke module (met een andere fysieke database dan het doel). */
  from: 'any' | readonly EndpointRule[];
  /** `'any'` = elke module behalve Lichaam en Dagboek. */
  to: 'any' | readonly EndpointRule[];
}

/**
 * De toegestane combinaties uit ADR 0024 § 2. Alle combinaties liggen tussen verschillende fysieke databases;
 * Groei ↔ Kennis is een ID-veld en staat hier dus niet (§ 6). Een nieuwe categorie is een kleine codewijziging met tests.
 */
export const LINK_CATEGORY_RULES: Readonly<Record<KnownLinkCategory, CategoryRule>> = {
  'supports-goal': {
    label: 'Draagt bij aan een doel',
    from: 'any',
    to: [{ module: 'groei', kinds: ['doel'] }]
  },
  'develops-skill': {
    label: 'Ontwikkelt een vaardigheid',
    from: [{ module: 'sport' }, { module: 'kracht' }, { module: 'duur' }],
    to: [{ module: 'groei', kinds: ['vaardigheid'] }]
  },
  'derived-from': {
    label: 'Is ontstaan uit',
    from: [{ module: 'quest', kinds: ['quest'] }],
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

function matches(rule: EndpointRule, endpoint: { module: LinkModuleId; kind?: EcosystemRecordKind | undefined }): boolean {
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
  | 'self-link'
  | 'same-database'
  | 'unknown-kind';

export interface LinkCheckInput {
  category: string;
  /** De module die de koppeling wil opslaan. */
  ownModule: LinkModuleId;
  /** `kind` mag ontbreken: dan valt het record buiten de vijf soorten (ADR 0024 § 3a). */
  from: { module: LinkModuleId; id: string; kind?: string };
  /** `kind` komt uit de `Lookup` van de doelmodule (ADR 0024 § 3). Een onbekende waarde wordt geweigerd, nooit omgezet. */
  to: { module: LinkModuleId; id: string; kind?: string };
}

/**
 * Controleert of een **nieuwe** koppeling mag worden aangemaakt. Geeft `null` als het mag,
 * anders de reden. Bestaande koppelingen (bijvoorbeeld met een onbekende categorie uit een back-up)
 * worden hiermee niet afgekeurd of verwijderd; daarvoor dient {@link parseEcosystemModuleLink}.
 */
export function checkNewLink(input: LinkCheckInput): LinkRejection | null {
  if (!isKnownLinkCategory(input.category)) return 'unknown-category';
  if (NEVER_LINK_TARGET.includes(input.to.module)) return 'target-forbidden';
  if (input.from.module !== input.ownModule) return 'not-own-module';
  if (input.from.module === input.to.module && input.from.id === input.to.id) return 'self-link';
  if (sharesPhysicalDatabase(input.from.module, input.to.module)) return 'same-database';
  const from = parseRecordKind(input.from.kind);
  const to = parseRecordKind(input.to.kind);
  if (from.unknownKind !== undefined || to.unknownKind !== undefined) return 'unknown-kind';
  const rule = LINK_CATEGORY_RULES[input.category];
  if (rule.from !== 'any' && !rule.from.some((r) => matches(r, { module: input.from.module, kind: from.kind }))) return 'source-not-allowed';
  if (rule.to !== 'any' && !rule.to.some((r) => matches(r, { module: input.to.module, kind: to.kind }))) return 'target-not-allowed';
  return null;
}

export interface ParsedEcosystemModuleLink {
  link: EcosystemModuleLink;
  /** `false` bij een categorie die deze versie niet kent: bewaren en tonen als "Overige koppeling". */
  knownCategory: boolean;
  /**
   * `true` als bron en doel dezelfde fysieke database hebben. Zo'n record hoort niet te bestaan (§ 6).
   * Het wordt bij herstel niet stil weggegooid of omgezet, maar gemeld; de module beslist met de eigenaar.
   */
  sameDatabase: boolean;
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
export function parseEcosystemModuleLink(value: unknown): ParsedEcosystemModuleLink | null {
  if (!isRecord(value)) return null;
  const { id, category, createdAt, updatedAt, note, origin } = value;
  const from = parseEndpoint(value.from);
  const to = parseEndpoint(value.to);
  if (typeof id !== 'string' || id === '' || typeof category !== 'string' || category === '') return null;
  if (!from || !to || typeof createdAt !== 'string' || typeof updatedAt !== 'string') return null;
  const link: EcosystemModuleLink = { id, category, from, to, createdAt, updatedAt };
  if (typeof note === 'string') link.note = note;
  if (isRecord(origin)) link.origin = origin as unknown as ImportOrigin;
  return { link, knownCategory: isKnownLinkCategory(category), sameDatabase: sharesPhysicalDatabase(from.module, to.module) };
}
