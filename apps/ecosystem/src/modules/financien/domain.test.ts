import { describe, expect, it } from 'vitest';
import {
  FINANCIEN_STORES,
  FORBIDDEN_FIELDS,
  allocationTotal,
  budgetFor,
  budgetReport,
  byCategory,
  filterTransactions,
  financienLookupItems,
  financienSummary,
  latestEvaluation,
  monthlyIncome,
  parseEuros,
  plannedYearlyContribution,
  possibleDuplicates,
  potProgress,
  projectScenario,
  scenarioOutcome,
  totals,
  transactionsCsv,
  validateFinancienBackup,
  validateInvestmentPlan,
  validateManualSection,
  validatePlanNote,
  validateTransaction,
  yearReport,
  type Budget,
  type Category,
  type InvestmentPlan,
  type PlanNote,
  type Transaction
} from './domain';
import { databaseConfig } from './storage';

const T = '2026-11-22T10:00:00.000Z';

function tx(partial: Partial<Transaction> = {}): Transaction {
  return {
    id: 't1',
    date: '2026-11-05',
    amountCents: 1000,
    direction: 'out',
    kind: 'actual',
    categoryId: 'c1',
    category: 'Boodschappen',
    counterparty: '',
    description: '',
    sourceId: null,
    potId: null,
    createdAt: T,
    updatedAt: T,
    ...partial
  };
}

function category(partial: Partial<Category> = {}): Category {
  return { id: 'c1', name: 'Boodschappen', direction: 'out', parentId: null, archived: false, createdAt: T, updatedAt: T, ...partial };
}

function plan(partial: Partial<InvestmentPlan> = {}): InvestmentPlan {
  return {
    id: 'p1',
    name: 'Lange termijn',
    status: 'actief',
    strategy: 'Breed gespreid, passief',
    principles: '',
    goal: 'Financiële vrijheid',
    targetCents: 50_000_000,
    horizonYear: 2050,
    riskProfile: 'offensief',
    allocation: [
      { assetClass: 'Aandelen wereldwijd', targetPct: 80 },
      { assetClass: 'Obligaties', targetPct: 20 }
    ],
    contributionCents: 50_000,
    frequency: 'maand',
    startDate: '2026-01-01',
    createdAt: T,
    updatedAt: T,
    ...partial
  };
}

describe('K-B: geen portefeuilleadministratie in Personal Ecosystem', () => {
  it('de verboden velden komen in geen enkel type of geen enkele store voor', () => {
    const records = [tx(), category(), plan()];
    for (const record of records) for (const field of FORBIDDEN_FIELDS) expect(Object.keys(record)).not.toContain(field);
    for (const store of FINANCIEN_STORES) expect(['positions', 'holdings', 'trades', 'quotes']).not.toContain(store);
  });

  it('een record met een positie of koers wordt geweigerd, ook bij herstel', () => {
    expect(() => validateInvestmentPlan({ ...plan(), positions: [] })).toThrow('K-B');
    expect(() => validateInvestmentPlan({ ...plan(), allocation: [{ assetClass: 'Aandelen', targetPct: 100, marketValue: 1 }] })).toThrow('K-B');
    expect(() => validateTransaction({ ...tx(), isin: 'NL0000000000' })).toThrow('K-B');
  });
});

describe('validatie', () => {
  it('Money Manual behoudt oude secties en controleert nieuwe aanmaaktijden', () => {
    const section = { id: 'strategie', text: 'plan', updatedAt: T };
    expect(() => validateManualSection(section)).not.toThrow();
    expect(() => validateManualSection({ ...section, createdAt: T })).not.toThrow();
    expect(() => validateManualSection({ ...section, createdAt: 'ongeldig' })).toThrow('aanmaaktijdstip');
  });

  it('transacties: positieve centen, geldige datum, inkomstenbron alleen bij inkomsten', () => {
    expect(() => validateTransaction(tx())).not.toThrow();
    expect(() => validateTransaction(tx({ amountCents: 0 }))).toThrow();
    expect(() => validateTransaction(tx({ amountCents: 12.5 }))).toThrow();
    expect(() => validateTransaction(tx({ date: '2026-02-30' }))).toThrow();
    expect(() => validateTransaction(tx({ sourceId: 's1' }))).toThrow('inkomsten');
    expect(() => validateTransaction(tx({ direction: 'in', sourceId: 's1' }))).not.toThrow();
  });

  describe('CSV-export', () => {
    it('encodeert UTF-8-tekst en escapet komma, aanhalingstekens en nieuwe regels zonder afronden', () => {
      const csv = transactionsCsv([tx({ amountCents: 12345, category: 'Café, thee', description: 'Zij zei "ja"\nvolgende regel' })]);
      expect(csv).toBe('\uFEFF"Datum","Richting","Status","Bedrag (cent)","Categorie","Tegenpartij","Omschrijving"\r\n"2026-11-05","out","actual","12345","Café, thee","","Zij zei ""ja""\nvolgende regel"\r\n');
    });
  });

  it('allocatie telt op tot 100 en heeft unieke categorieën', () => {
    expect(() => validateInvestmentPlan(plan())).not.toThrow();
    expect(() => validateInvestmentPlan(plan({ allocation: [{ assetClass: 'Aandelen', targetPct: 70 }] }))).toThrow('100');
    expect(() =>
      validateInvestmentPlan(plan({ allocation: [{ assetClass: 'Aandelen', targetPct: 50 }, { assetClass: 'aandelen', targetPct: 50 }] }))
    ).toThrow('één keer');
    expect(() => validateInvestmentPlan(plan({ allocation: [] }))).not.toThrow();
  });

  it('een beslissing heeft geen beoordeling, een evaluatie wel of niet', () => {
    const note: PlanNote = { id: 'n1', planId: 'p1', kind: 'beslissing', date: '2026-11-22', title: 'Start', text: '', onTrack: null, createdAt: T, updatedAt: T };
    expect(() => validatePlanNote(note)).not.toThrow();
    expect(() => validatePlanNote({ ...note, onTrack: 'op koers' })).toThrow();
    expect(() => validatePlanNote({ ...note, kind: 'evaluatie', onTrack: 'achter' })).not.toThrow();
  });

  it('back-up: alle stores verplicht en volledig gecontroleerd', () => {
    const stores = Object.fromEntries(FINANCIEN_STORES.map((s) => [s, [] as unknown[]]));
    expect(() => validateFinancienBackup({ stores: { ...stores, transactions: [tx()], investmentPlans: [plan()] } })).not.toThrow();
    const { links: _links, ...missing } = stores;
    expect(() => validateFinancienBackup({ stores: missing })).toThrow('links');
    expect(() => validateFinancienBackup({ stores: { ...stores, investmentPlans: [{ ...plan(), holdings: [] }] } })).toThrow('K-B');
  });

  it('eigen database', () => {
    expect(databaseConfig.databaseName).toBe('personal-ecosystem-financien');
    expect([...databaseConfig.stores]).toEqual([...FINANCIEN_STORES]);
  });
});

describe('bedragen', () => {
  it('leest euro’s naar hele centen', () => {
    expect(parseEuros('1.250,50')).toBe(125050);
    expect(parseEuros('12,5')).toBe(1250);
    expect(parseEuros('12.34')).toBe(1234);
    expect(() => parseEuros('')).toThrow();
    expect(() => parseEuros('-5')).toThrow();
    expect(() => parseEuros('1,234')).toThrow();
  });
});

describe('rapportages (ADR 0027 § 2)', () => {
  const list = [
    tx({ id: 'a', direction: 'in', amountCents: 300000, category: 'Salaris', categoryId: 'ci', date: '2026-11-25' }),
    tx({ id: 'b', amountCents: 12345 }),
    tx({ id: 'c', amountCents: 5000, kind: 'planned' }),
    tx({ id: 'd', amountCents: 2500, date: '2026-10-03' })
  ];

  it('totalen in centen; gepland telt niet mee', () => {
    expect(totals(list.filter((t) => t.date.startsWith('2026-11')))).toEqual({ inCents: 300000, outCents: 12345, balanceCents: 287655 });
    expect(monthlyIncome(list, '2026-11')).toBe(300000);
  });

  it('jaaroverzicht per maand', () => {
    const year = yearReport(list, '2026');
    expect(year).toHaveLength(12);
    expect(year[9]).toEqual({ month: '2026-10', inCents: 0, outCents: 2500, balanceCents: -2500 });
    expect(year[10]!.balanceCents).toBe(287655);
  });

  it('per categorie, aflopend', () => {
    expect(byCategory(list, 'out')).toEqual([{ category: 'Boodschappen', cents: 14845 }]);
  });

  it('een gewijzigde categorienaam verandert oude transacties niet', () => {
    const renamed = category({ name: 'Eten' });
    expect(list.find((t) => t.id === 'b')!.category).toBe('Boodschappen');
    expect(renamed.name).toBe('Eten');
  });

  it('budget: laatste geldige budget, besteed tegen budget', () => {
    const budgets: Budget[] = [
      { id: 'b1', categoryId: 'c1', monthlyCents: 40000, validFrom: '2026-01', createdAt: T, updatedAt: T },
      { id: 'b2', categoryId: 'c1', monthlyCents: 10000, validFrom: '2026-11', createdAt: T, updatedAt: T }
    ];
    expect(budgetFor(budgets, 'c1', '2026-10')!.monthlyCents).toBe(40000);
    expect(budgetReport(list, budgets, [category()], '2026-11')).toEqual([
      { categoryId: 'c1', name: 'Boodschappen', budgetCents: 10000, spentCents: 12345, remainingCents: -2345, pct: 123 }
    ]);
  });

  it('spaarpot: stortingen min opnames', () => {
    const pot = { id: 'pot', name: 'Buffer', targetCents: 100000, targetDate: null, note: '', archived: false, createdAt: T, updatedAt: T };
    const moves = [tx({ id: 'x', potId: 'pot', amountCents: 30000 }), tx({ id: 'y', potId: 'pot', direction: 'in', amountCents: 5000 }), tx({ id: 'z', potId: 'pot', amountCents: 9999, kind: 'planned' })];
    expect(potProgress(pot, moves)).toEqual({ balanceCents: 25000, pct: 25 });
  });

  it('zoeken, filteren, sorteren en dubbelen melden zonder samen te voegen', () => {
    expect(filterTransactions(list, { month: '2026-11', direction: 'out', kind: 'actual' }).map((t) => t.id)).toEqual(['b']);
    expect(filterTransactions(list, { query: 'salaris' }).map((t) => t.id)).toEqual(['a']);
    expect(filterTransactions(list, { sort: 'bedrag' })[0]!.id).toBe('a');
    expect(possibleDuplicates([tx({ id: 'p' }), tx({ id: 'q' }), tx({ id: 'r', amountCents: 1 })])).toEqual([['p', 'q']]);
  });
});

describe('scenario’s en Investment Plan', () => {
  it('budgetscenario', () => {
    expect(scenarioOutcome({ monthlyIncomeCents: 300000, monthlyExpenseCents: 240000, months: 12 })).toEqual({ monthlySavingsCents: 60000, totalCents: 720000, savingsRatePct: 20 });
  });

  it('inlegplan en allocatie', () => {
    expect(plannedYearlyContribution(plan())).toBe(600000);
    expect(plannedYearlyContribution(plan({ frequency: 'kwartaal' }))).toBe(200000);
    expect(allocationTotal(plan().allocation)).toBe(100);
  });

  it('scenarioberekening op basis van aannames', () => {
    const zero = projectScenario({ assumedReturnTenths: 0, startCents: 100000, contributionCents: 10000, frequency: 'maand', years: 2 });
    expect(zero).toEqual([
      { year: 1, valueCents: 220000, contributedCents: 220000 },
      { year: 2, valueCents: 340000, contributedCents: 340000 }
    ]);
    const yearly = projectScenario({ assumedReturnTenths: 100, startCents: 100000, contributionCents: 0, frequency: 'jaar', years: 2 });
    expect(yearly.map((r) => r.valueCents)).toEqual([110000, 121000]);
  });

  it('voortgang volgens de laatste evaluatie', () => {
    const notes: PlanNote[] = [
      { id: 'a', planId: 'p1', kind: 'evaluatie', date: '2026-06-01', title: 'Halfjaar', text: '', onTrack: 'achter', createdAt: T, updatedAt: T },
      { id: 'b', planId: 'p1', kind: 'evaluatie', date: '2026-11-01', title: 'Najaar', text: '', onTrack: 'op koers', createdAt: T, updatedAt: T },
      { id: 'c', planId: 'p1', kind: 'beslissing', date: '2026-12-01', title: 'Meer obligaties', text: '', onTrack: null, createdAt: T, updatedAt: T }
    ];
    expect(latestEvaluation(notes, 'p1')!.onTrack).toBe('op koers');
  });
});

describe('leescontracten', () => {
  it('Lookup zonder soort; dashboard alleen totalen en tellers', () => {
    expect(financienLookupItems(['p1'], { pots: [], plans: [plan()] })).toEqual([{ id: 'p1', title: 'Lange termijn' }]);
    const summary = financienSummary({ transactions: [tx({ description: 'geheim' })], budgets: [], categories: [category()], plans: [plan()] }, '2026-11-22');
    expect(summary).toEqual({ month: '2026-11', inCents: 0, outCents: 1000, balanceCents: -1000, budgetsOver: 0, activePlans: 1 });
    expect(JSON.stringify(summary)).not.toContain('geheim');
  });
});
