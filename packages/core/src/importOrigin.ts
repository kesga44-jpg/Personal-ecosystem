/**
 * Herkomst van geïmporteerde records (ADR 0025 § 3 t/m § 3f).
 *
 * Alleen typen en zuivere functies: geen opslag, geen netwerk, geen import. De echte import (A10)
 * gebeurt pas na P-6 (ADR 0031 § 7).
 */

export interface NotionPageKey {
  kind: 'notion_page_id';
  /** 32 hex, kleine letters, letterlijk uit de bestandsnaam van de pagina in de export. */
  value: string;
}

export const REPLACEMENT_KEY_VERSION = 'rk1';
export const NORMALIZATION_VERSION = 'notion-csv-1';
export const MATCH_RULES_VERSION = 'match-1';

export interface ReplacementKey {
  kind: 'replacement_key';
  /** `'rk1:'` + 64 hex. */
  value: string;
  version: typeof REPLACEMENT_KEY_VERSION;
  normalization: typeof NORMALIZATION_VERSION;
  databaseId: string;
  columns: string[];
  cells: string[];
  occurrence: number;
}

export type ImportKey = NotionPageKey | ReplacementKey;

export type RowMatchMethod = 'unique_title' | 'properties' | 'elimination' | 'manual_verification' | 'none';
export type RowMatchConfidence = 'bevestigd' | 'aannemelijk' | 'onzeker' | 'handmatig_bevestigd' | 'niet_van_toepassing';

export interface OwnerDecision {
  choice: 'replacement_key';
  reason: string;
  decidedAt: string;
  computedMethod: 'properties' | 'elimination';
}

export interface RowMatch {
  method: RowMatchMethod;
  confidence: RowMatchConfidence;
  candidates: number;
  /** Aantal kolommen buiten de titel dat in de CSV-rij gevuld is en volgens § 3f met de pagina is vergeleken. */
  comparedColumns: number;
  verifiedAt?: string;
  matchRules: typeof MATCH_RULES_VERSION;
  ownerDecision?: OwnerDecision;
  note?: string;
}

export interface SourceRow {
  file: string;
  /** 1 = de eerste rij na de kolomkoppen. */
  rowNumber: number;
  columns: string[];
  cells: string[];
}

export interface ImportOrigin {
  source: 'notion';
  key: ImportKey;
  rowMatch: RowMatch;
  sourceRow: SourceRow;
  databaseId: string;
  databaseName: string;
  exportedAt: string;
  importedAt: string;
  mapper: string;
  sourceHash: string;
  importedHash: string;
  previousKeys?: ImportKey[];
}

const HEX32 = /^[0-9a-f]{32}$/;
const RK1 = /^rk1:[0-9a-f]{64}$/;

export function isNotionPageId(value: string): boolean {
  return HEX32.test(value);
}

export function isReplacementKeyValue(value: string): boolean {
  return RK1.test(value);
}

/** Kolomnaam volgens `notion-csv-1`: Unicode NFC, witruimte aan de randen weg, witruimte binnenin één spatie. */
export function normalizeColumnName(name: string): string {
  return name.normalize('NFC').trim().replace(/\s+/gu, ' ');
}

/** Celwaarde volgens `notion-csv-1`: letterlijk, alleen regeleinden gelijkgetrokken. */
export function normalizeCell(value: string): string {
  return value.replace(/\r\n?/gu, '\n');
}

/**
 * Brengt een ruwe CSV-rij op het aantal kolommen: ontbrekende cellen aan het eind worden lege tekst.
 * Een rij met méér cellen dan kolommen is een fout in de export en wordt geweigerd.
 */
export function fitCells(cells: readonly string[], columnCount: number): string[] {
  if (cells.length > columnCount) throw new Error(`Rij heeft ${cells.length} cellen bij ${columnCount} kolommen`);
  const fitted = cells.map(normalizeCell);
  while (fitted.length < columnCount) fitted.push('');
  return fitted;
}

/**
 * Volgnummers per rij (ADR 0025 § 3a): 1 voor elke rij, en 1, 2, … alleen bij volledig identieke rijen,
 * in de volgorde van het bestand.
 */
export function occurrenceNumbers(rows: readonly (readonly string[])[]): number[] {
  const seen = new Map<string, number>();
  return rows.map((row) => {
    const key = JSON.stringify(row);
    const next = (seen.get(key) ?? 0) + 1;
    seen.set(key, next);
    return next;
  });
}

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export interface ReplacementKeyInput {
  databaseId: string;
  /** Ruwe kolomkoppen; worden hier genormaliseerd. */
  columns: readonly string[];
  /** Ruwe cellen; worden hier genormaliseerd en aangevuld. */
  cells: readonly string[];
  occurrence: number;
}

/** Berekent een `replacement_key` (versie `rk1`, normalisatie `notion-csv-1`) volgens ADR 0025 § 3a. */
export async function computeReplacementKey(input: ReplacementKeyInput): Promise<ReplacementKey> {
  const databaseId = input.databaseId.toLowerCase();
  if (!isNotionPageId(databaseId)) throw new Error('databaseId moet 32 hex zijn');
  if (!Number.isInteger(input.occurrence) || input.occurrence < 1) throw new Error('occurrence moet een geheel getal ≥ 1 zijn');
  const columns = input.columns.map(normalizeColumnName);
  const cells = fitCells(input.cells, columns.length);
  const payload = JSON.stringify([REPLACEMENT_KEY_VERSION, databaseId, columns, cells, input.occurrence]);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
  return {
    kind: 'replacement_key',
    value: `${REPLACEMENT_KEY_VERSION}:${toHex(digest)}`,
    version: REPLACEMENT_KEY_VERSION,
    normalization: NORMALIZATION_VERSION,
    databaseId,
    columns,
    cells,
    occurrence: input.occurrence
  };
}

/** Rekent een bewaarde vervangende sleutel opnieuw uit en vergelijkt (ADR 0025 § 11). */
export async function verifyReplacementKey(key: ReplacementKey): Promise<boolean> {
  const again = await computeReplacementKey({
    databaseId: key.databaseId,
    columns: key.columns,
    cells: key.cells,
    occurrence: key.occurrence
  });
  return again.value === key.value;
}

/** Getoonde status per zekerheid (ADR 0025 § 3b). */
export const CONFIDENCE_LABELS: Readonly<Record<RowMatchConfidence, string>> = {
  bevestigd: 'Bevestigd (unieke titel)',
  aannemelijk: 'Aannemelijk — gebruikerscontrole vereist',
  onzeker: 'Onzeker — gebruikerscontrole vereist',
  handmatig_bevestigd: 'Bevestigd door de eigenaar',
  niet_van_toepassing: 'Niet van toepassing'
};

/** Moet de eigenaar deze koppeling nog controleren? */
export function needsOwnerReview(match: RowMatch): boolean {
  return match.confidence === 'aannemelijk' || match.confidence === 'onzeker';
}

/**
 * Bevestiging door de eigenaar (ADR 0025 § 3b). Dit is de **enige** manier waarop een aannemelijke of
 * onzekere koppeling bevestigd wordt; er is bewust geen automatische variant. Alleen `method`,
 * `confidence` en `verifiedAt` veranderen; de eerdere methode komt in `note`.
 */
export function confirmRowMatchByOwner(match: RowMatch, verifiedAt: string): RowMatch {
  if (!needsOwnerReview(match)) throw new Error('Alleen aannemelijke of onzekere koppelingen kunnen worden bevestigd');
  if (Number.isNaN(Date.parse(verifiedAt))) throw new Error('verifiedAt moet een datum zijn');
  const earlier = `eerdere methode: ${match.method} (${match.confidence})`;
  return {
    ...match,
    method: 'manual_verification',
    confidence: 'handmatig_bevestigd',
    verifiedAt,
    note: match.note ? `${match.note}; ${earlier}` : earlier
  };
}

/** Problemen die de controle "Sleutels en herkomst" (ADR 0025 § 11) per record zonder opslag kan vaststellen. */
export function originProblems(origin: ImportOrigin, approvedMatchRules: string = MATCH_RULES_VERSION): string[] {
  const problems: string[] = [];
  const { key, rowMatch } = origin;
  if (key.kind === 'notion_page_id') {
    if (!isNotionPageId(key.value)) problems.push('notion_page_id is geen 32 hex');
    if (rowMatch.method === 'none') problems.push('notion_page_id zonder rijkoppeling');
  } else {
    if (!isReplacementKeyValue(key.value)) problems.push('replacement_key heeft geen geldige vorm');
    if (rowMatch.method !== 'none' && rowMatch.method !== 'manual_verification') {
      problems.push('replacement_key met een automatische rijkoppeling');
    }
  }
  if (rowMatch.ownerDecision && key.kind !== 'replacement_key') problems.push('ownerDecision zonder replacement_key');
  if (rowMatch.matchRules !== approvedMatchRules) problems.push('matchRules wijkt af van de goedgekeurde versie');
  if (rowMatch.method === 'manual_verification' && (rowMatch.confidence !== 'handmatig_bevestigd' || !rowMatch.verifiedAt)) {
    problems.push('handmatige bevestiging zonder status of datum');
  }
  const expected: Partial<Record<RowMatchMethod, RowMatchConfidence>> = {
    unique_title: 'bevestigd',
    properties: 'aannemelijk',
    elimination: 'onzeker',
    none: 'niet_van_toepassing'
  };
  const want = expected[rowMatch.method];
  if (want && rowMatch.confidence !== want) problems.push(`methode ${rowMatch.method} hoort bij ${want}`);
  if (!origin.databaseId || !origin.mapper) problems.push('databaseId of mapper ontbreekt');
  if (origin.sourceRow.columns.length !== origin.sourceRow.cells.length) problems.push('sourceRow: aantal cellen ≠ aantal kolommen');
  return problems;
}
