import { describe, expect, it } from 'vitest';
import {
  CONFIDENCE_LABELS,
  MATCH_RULES_VERSION,
  computeReplacementKey,
  confirmRowMatchByOwner,
  fitCells,
  isNotionPageId,
  needsOwnerReview,
  normalizeCell,
  normalizeColumnName,
  occurrenceNumbers,
  originProblems,
  verifyReplacementKey,
  type ImportOrigin,
  type RowMatch
} from './importOrigin';

const DB = '0123456789abcdef0123456789abcdef';

describe('replacement_key rk1 (ADR 0025 § 3a)', () => {
  // Vaste testvectoren, onafhankelijk berekend (Python: json.dumps(..., ensure_ascii=False, separators=(',', ':')) + SHA-256).
  it('komt overeen met vaste testvectoren', async () => {
    const a1 = await computeReplacementKey({ databaseId: DB, columns: ['Naam', 'Datum'], cells: ['A', '1'], occurrence: 1 });
    const a2 = await computeReplacementKey({ databaseId: DB, columns: ['Naam', 'Datum'], cells: ['A', '1'], occurrence: 2 });
    const b = await computeReplacementKey({
      databaseId: DB,
      columns: ['Naam', 'Notitie'],
      cells: ['café "x"', 'regel1\r\nregel2'],
      occurrence: 1
    });
    expect(a1.value).toBe('rk1:f5986abf59b5f8a10ffdd1b79d2975f2ed60181ff118857e87b2a1542bede7b7');
    expect(a2.value).toBe('rk1:be78027ad4c738082700d420e1725b3f63769b1f39debb73deb79f91e9ecefe5');
    expect(b.value).toBe('rk1:d219456384c77052a1e23495ca3351451d2ae2da55dc85d5f35eab288f2a62a8');
  });

  it('is reproduceerbaar en na te rekenen uit de bewaarde invoer', async () => {
    const one = await computeReplacementKey({ databaseId: DB, columns: [' Naam '], cells: ['x'], occurrence: 1 });
    const two = await computeReplacementKey({ databaseId: DB.toUpperCase(), columns: ['Naam'], cells: ['x'], occurrence: 1 });
    expect(one.value).toBe(two.value);
    expect(await verifyReplacementKey(one)).toBe(true);
    expect(await verifyReplacementKey({ ...one, cells: ['y'] })).toBe(false);
  });

  it('verandert bij een andere cel, kolomnaam of kolomvolgorde', async () => {
    const base = await computeReplacementKey({ databaseId: DB, columns: ['A', 'B'], cells: ['1', '2'], occurrence: 1 });
    const cell = await computeReplacementKey({ databaseId: DB, columns: ['A', 'B'], cells: ['1', '3'], occurrence: 1 });
    const name = await computeReplacementKey({ databaseId: DB, columns: ['A', 'C'], cells: ['1', '2'], occurrence: 1 });
    const order = await computeReplacementKey({ databaseId: DB, columns: ['B', 'A'], cells: ['2', '1'], occurrence: 1 });
    expect(new Set([base.value, cell.value, name.value, order.value]).size).toBe(4);
  });

  it('weigert een ongeldige database-ID of volgnummer', async () => {
    await expect(computeReplacementKey({ databaseId: 'abc', columns: ['A'], cells: ['1'], occurrence: 1 })).rejects.toThrow();
    await expect(computeReplacementKey({ databaseId: DB, columns: ['A'], cells: ['1'], occurrence: 0 })).rejects.toThrow();
  });
});

describe('normalisatie notion-csv-1', () => {
  it('kolomnamen: NFC, randen weg, witruimte één spatie', () => {
    expect(normalizeColumnName('  Prio  rity ')).toBe('Prio rity');
    expect(normalizeColumnName('Café')).toBe('Café');
  });

  it('cellen: alleen regeleinden gelijkgetrokken, verder letterlijk', () => {
    expect(normalizeCell('  a\r\nb\rc  ')).toBe('  a\nb\nc  ');
    expect(fitCells(['a'], 3)).toEqual(['a', '', '']);
    expect(() => fitCells(['a', 'b'], 1)).toThrow();
  });

  it('volgnummer alleen bij volledig identieke rijen', () => {
    expect(occurrenceNumbers([['x', '1'], ['x', '1'], ['x', '2'], ['x', '1']])).toEqual([1, 2, 1, 3]);
    expect(occurrenceNumbers([['x', '1'], ['x', '2']])).toEqual([1, 1]);
  });
});

function match(partial: Partial<RowMatch> = {}): RowMatch {
  return { method: 'properties', confidence: 'aannemelijk', candidates: 2, comparedColumns: 1, matchRules: MATCH_RULES_VERSION, ...partial };
}

describe('status en bevestiging (ADR 0025 § 3b)', () => {
  it('toont de afgesproken statussen', () => {
    expect(CONFIDENCE_LABELS.aannemelijk).toBe('Aannemelijk — gebruikerscontrole vereist');
    expect(CONFIDENCE_LABELS.onzeker).toBe('Onzeker — gebruikerscontrole vereist');
  });

  it('alleen de eigenaar bevestigt; de eerdere methode blijft zichtbaar in note', () => {
    expect(needsOwnerReview(match())).toBe(true);
    const confirmed = confirmRowMatchByOwner(match({ method: 'elimination', confidence: 'onzeker' }), '2026-12-01T10:00:00.000Z');
    expect(confirmed).toMatchObject({ method: 'manual_verification', confidence: 'handmatig_bevestigd', verifiedAt: '2026-12-01T10:00:00.000Z' });
    expect(confirmed.note).toContain('elimination (onzeker)');
    expect(needsOwnerReview(confirmed)).toBe(false);
  });

  it('bevestigt niets wat al bevestigd is of geen koppeling heeft, en eist een datum', () => {
    expect(() => confirmRowMatchByOwner(match({ method: 'unique_title', confidence: 'bevestigd' }), '2026-12-01')).toThrow();
    expect(() => confirmRowMatchByOwner(match({ method: 'none', confidence: 'niet_van_toepassing' }), '2026-12-01')).toThrow();
    expect(() => confirmRowMatchByOwner(match(), 'geen datum')).toThrow();
  });
});

function origin(partial: Partial<ImportOrigin> = {}): ImportOrigin {
  return {
    source: 'notion',
    key: { kind: 'notion_page_id', value: 'fedcba9876543210fedcba9876543210' },
    rowMatch: match({ method: 'unique_title', confidence: 'bevestigd', candidates: 1 }),
    sourceRow: { file: 'export/db.csv', rowNumber: 1, columns: ['Naam'], cells: ['x'] },
    databaseId: DB,
    databaseName: 'Voorbeeld',
    exportedAt: '2026-11-21',
    importedAt: '2026-12-01',
    mapper: 'notion-voorbeeld@1',
    sourceHash: 'a',
    importedHash: 'b',
    ...partial
  };
}

describe('originProblems: controle "Sleutels en herkomst" (ADR 0025 § 11)', () => {
  it('een correct record heeft geen problemen', () => {
    expect(originProblems(origin())).toEqual([]);
    expect(isNotionPageId('fedcba9876543210fedcba9876543210')).toBe(true);
  });

  it('meldt een afwijkende matchRules-versie', () => {
    expect(originProblems(origin({ rowMatch: { ...match({ method: 'unique_title', confidence: 'bevestigd' }), matchRules: 'match-0' as never } }))).toContain(
      'matchRules wijkt af van de goedgekeurde versie'
    );
  });

  it('ownerDecision vereist een replacement_key', async () => {
    const rk = await computeReplacementKey({ databaseId: DB, columns: ['Naam'], cells: ['x'], occurrence: 1 });
    const decision = { choice: 'replacement_key' as const, reason: 'besluit eigenaar', decidedAt: '2026-11-22', computedMethod: 'properties' as const };
    expect(
      originProblems(origin({ key: rk, rowMatch: match({ method: 'none', confidence: 'niet_van_toepassing', ownerDecision: decision }) }))
    ).toEqual([]);
    expect(originProblems(origin({ rowMatch: match({ ownerDecision: decision }) }))).toContain('ownerDecision zonder replacement_key');
  });

  it('meldt een status die niet bij de methode past (dus geen stille opwaardering)', () => {
    expect(originProblems(origin({ rowMatch: match({ method: 'properties', confidence: 'bevestigd' }) }))).toContain(
      'methode properties hoort bij aannemelijk'
    );
    expect(originProblems(origin({ rowMatch: match({ method: 'manual_verification', confidence: 'handmatig_bevestigd' }) }))).toContain(
      'handmatige bevestiging zonder status of datum'
    );
  });
});
