/**
 * Financiën (ADR 0027): persoonlijke inkomsten en uitgaven, budgetten, spaarpotten, het Money Manual en het
 * Investment Plan als strategisch planningsinstrument.
 *
 * Afbakening (K-B, opnieuw bevestigd 2026-11-22): Personal Ecosystem bepaalt de financiële strategie; Samen Thuis
 * registreert wat er werkelijk met geld en vermogen gebeurt. Hier staan dus **geen** posities, effectentransacties,
 * werkelijke inleg, actuele portefeuillewaardes of gerealiseerde rendementen. Scenario's rekenen alleen met
 * aannames die de eigenaar zelf invult; er worden nooit koersen of rendementen opgehaald of verzonnen.
 *
 * Bedragen staan in hele centen (geheel getal). Rapportages worden berekend, niet opgeslagen.
 */
import { toLookupItems, type ImportOrigin, type LookupItem } from '@ecosystem/core';

export const DIRECTIONS = ['in', 'out'] as const;
export type Direction = (typeof DIRECTIONS)[number];
export const TRANSACTION_KINDS = ['actual', 'planned'] as const;
export type TransactionKind = (typeof TRANSACTION_KINDS)[number];
export const INCOME_TYPES = ['loon', 'freelance', 'overig'] as const;
export type IncomeType = (typeof INCOME_TYPES)[number];
export const RISK_PROFILES = ['defensief', 'neutraal', 'offensief', 'zeer offensief'] as const;
export type RiskProfile = (typeof RISK_PROFILES)[number];
export const PLAN_STATUSES = ['concept', 'actief', 'gepauzeerd', 'afgerond'] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];
export const FREQUENCIES = ['maand', 'kwartaal', 'jaar'] as const;
export type Frequency = (typeof FREQUENCIES)[number];
export const NOTE_KINDS = ['beslissing', 'evaluatie'] as const;
export type NoteKind = (typeof NOTE_KINDS)[number];
export const ON_TRACK = ['op koers', 'voor', 'achter'] as const;
export type OnTrack = (typeof ON_TRACK)[number];
export const MANUAL_SECTIONS = ['uitgangspunten', 'strategie', 'spaarstrategie', 'notities'] as const;
export type ManualSectionId = (typeof MANUAL_SECTIONS)[number];

interface Base {
  id: string;
  createdAt: string;
  updatedAt: string;
  origin?: ImportOrigin;
}

export interface Transaction extends Base {
  date: string;
  /** Altijd positief; de richting staat in `direction`. */
  amountCents: number;
  direction: Direction;
  kind: TransactionKind;
  categoryId: string | null;
  /** Naam van de categorie op het moment van boeken: blijft staan als de categorie later verandert (ADR 0027 § 2). */
  category: string;
  counterparty: string;
  description: string;
  sourceId: string | null;
  /** Bij een spaarpot: uitgaand = storting in de pot, inkomend = opname uit de pot. */
  potId: string | null;
}

export interface Category extends Base {
  name: string;
  direction: Direction;
  parentId: string | null;
  archived: boolean;
}

export interface IncomeSource extends Base {
  name: string;
  type: IncomeType;
  archived: boolean;
}

export interface Budget extends Base {
  categoryId: string;
  monthlyCents: number;
  /** `YYYY-MM`: geldig vanaf deze maand tot een volgend budget voor dezelfde categorie. */
  validFrom: string;
}

export interface Pot extends Base {
  name: string;
  targetCents: number;
  targetDate: string | null;
  note: string;
  archived: boolean;
}

export interface ManualSection {
  id: ManualSectionId;
  text: string;
  createdAt?: string;
  updatedAt: string;
}

/** Een budgetscenario: wat als je maandelijks zoveel overhoudt? Alleen aannames van de eigenaar. */
export interface BudgetScenario extends Base {
  name: string;
  monthlyIncomeCents: number;
  monthlyExpenseCents: number;
  months: number;
  note: string;
}

export interface AllocationItem {
  assetClass: string;
  /** Gewenst percentage, geheel getal 0–100. Samen 100. */
  targetPct: number;
}

/** Het Investment Plan: strategie en planning, geen administratie (K-B). */
export interface InvestmentPlan extends Base {
  name: string;
  status: PlanStatus;
  strategy: string;
  principles: string;
  goal: string;
  /** Doelbedrag voor de strategie, of null. */
  targetCents: number | null;
  horizonYear: number;
  riskProfile: RiskProfile;
  allocation: AllocationItem[];
  /** Gepland periodiek inlegbedrag (een plan, geen registratie van werkelijke inleg). */
  contributionCents: number;
  frequency: Frequency;
  startDate: string;
}

/** Een scenarioanalyse bij een plan, op basis van aannames die de eigenaar invult. */
export interface InvestmentScenario extends Base {
  planId: string;
  name: string;
  /** Aangenomen gemiddeld jaarrendement in tienden van procenten (bijv. 45 = 4,5 %). Een aanname, geen gegeven. */
  assumedReturnTenths: number;
  /** Aangenomen startbedrag voor de berekening. */
  startCents: number;
  contributionCents: number;
  frequency: Frequency;
  years: number;
}

export interface PlanNote extends Base {
  planId: string;
  kind: NoteKind;
  date: string;
  title: string;
  text: string;
  /** Alleen bij een evaluatie: hoe het plan ervoor staat, volgens de eigenaar. */
  onTrack: OnTrack | null;
}

export const FINANCIEN_STORES = [
  'transactions',
  'categories',
  'incomeSources',
  'budgets',
  'pots',
  'manual',
  'budgetScenarios',
  'investmentPlans',
  'investmentScenarios',
  'planNotes',
  'links'
] as const;

/**
 * Velden die in Financiën nooit mogen voorkomen (K-B, ADR 0027, Wijzigingen na acceptatie). Een test en de
 * back-upcontrole bewaken dit.
 */
export const FORBIDDEN_FIELDS = [
  'position',
  'positions',
  'holding',
  'holdings',
  'shares',
  'quantity',
  'isin',
  'ticker',
  'price',
  'quote',
  'marketValue',
  'portfolioValue',
  'currentValue',
  'realizedReturn',
  'unrealizedReturn',
  'buy',
  'sell',
  'trade',
  'trades'
] as const;

export const TEXT_MAX = 20000;
export const NAME_MAX = 200;
export const MAX_CENTS = 100_000_000_000; // € 1 miljard: ruim, maar vangt typfouten

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isDateKey(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function isMonthKey(value: unknown): value is string {
  return typeof value === 'string' && MONTH.test(value);
}

function fail(message: string): never {
  throw new Error(message);
}

function obj(value: unknown, what: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`Ongeldig ${what}.`);
  return value as Record<string, unknown>;
}

function name(value: unknown, what: string): void {
  if (typeof value !== 'string' || !value.trim() || value.length > NAME_MAX) fail(`${what}: geef een naam van maximaal ${NAME_MAX} tekens.`);
}

function text(value: unknown, what: string): void {
  if (typeof value !== 'string' || value.length > TEXT_MAX) fail(`${what}: tekst is te lang.`);
}

function oneOf<T extends string>(value: unknown, list: readonly T[], what: string): void {
  if (typeof value !== 'string' || !(list as readonly string[]).includes(value)) fail(`${what}: ongeldige waarde.`);
}

function optionalId(value: unknown, what: string): void {
  if (!(value === null || (typeof value === 'string' && value.length > 0))) fail(`${what}: ongeldige verwijzing.`);
}

function cents(value: unknown, what: string, allowZero = true): void {
  if (!(typeof value === 'number' && Number.isSafeInteger(value) && value >= (allowZero ? 0 : 1) && value <= MAX_CENTS)) {
    fail(`${what}: bedrag in hele centen, ${allowZero ? 'niet negatief' : 'groter dan nul'}.`);
  }
}

function intIn(value: unknown, min: number, max: number): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

function base(record: Record<string, unknown>, what: string): void {
  if (typeof record.id !== 'string' || !record.id) fail(`${what}: ontbrekende ID.`);
  for (const key of ['createdAt', 'updatedAt'] as const) {
    if (typeof record[key] !== 'string' || !Number.isFinite(Date.parse(record[key] as string))) fail(`${what}: ongeldig tijdstip.`);
  }
  if (record.origin !== undefined) obj(record.origin, `${what}: herkomst`);
  assertNoForbiddenFields(record, what);
}

/** Weigert records met velden die bij Samen Thuis horen (posities, koersen, gerealiseerd rendement …). */
export function assertNoForbiddenFields(record: Record<string, unknown>, what: string): void {
  for (const key of Object.keys(record)) {
    if ((FORBIDDEN_FIELDS as readonly string[]).includes(key)) fail(`${what}: het veld "${key}" hoort niet in Personal Ecosystem (K-B).`);
  }
}

export function validateTransaction(value: unknown): asserts value is Transaction {
  const r = obj(value, 'transactie');
  base(r, 'Transactie');
  if (!isDateKey(r.date)) fail('Transactie: ongeldige datum.');
  cents(r.amountCents, 'Transactie', false);
  oneOf(r.direction, DIRECTIONS, 'Transactie');
  oneOf(r.kind, TRANSACTION_KINDS, 'Transactie');
  optionalId(r.categoryId, 'Transactie');
  if (typeof r.category !== 'string' || r.category.length > NAME_MAX) fail('Transactie: ongeldige categorie.');
  if (typeof r.counterparty !== 'string' || r.counterparty.length > NAME_MAX) fail('Transactie: ongeldige tegenpartij.');
  text(r.description, 'Transactie');
  optionalId(r.sourceId, 'Transactie');
  optionalId(r.potId, 'Transactie');
  if (r.sourceId && r.direction !== 'in') fail('Transactie: een inkomstenbron hoort alleen bij inkomsten.');
}

export function validateCategory(value: unknown): asserts value is Category {
  const r = obj(value, 'categorie');
  base(r, 'Categorie');
  name(r.name, 'Categorie');
  oneOf(r.direction, DIRECTIONS, 'Categorie');
  optionalId(r.parentId, 'Categorie');
  if (r.parentId === r.id) fail('Categorie: een categorie kan niet onder zichzelf staan.');
  if (typeof r.archived !== 'boolean') fail('Categorie: ongeldige archiefstatus.');
}

export function validateIncomeSource(value: unknown): asserts value is IncomeSource {
  const r = obj(value, 'inkomstenbron');
  base(r, 'Inkomstenbron');
  name(r.name, 'Inkomstenbron');
  oneOf(r.type, INCOME_TYPES, 'Inkomstenbron');
  if (typeof r.archived !== 'boolean') fail('Inkomstenbron: ongeldige archiefstatus.');
}

export function validateBudget(value: unknown): asserts value is Budget {
  const r = obj(value, 'budget');
  base(r, 'Budget');
  if (typeof r.categoryId !== 'string' || !r.categoryId) fail('Budget: kies een categorie.');
  cents(r.monthlyCents, 'Budget');
  if (!isMonthKey(r.validFrom)) fail('Budget: ongeldige startmaand.');
}

export function validatePot(value: unknown): asserts value is Pot {
  const r = obj(value, 'spaarpot');
  base(r, 'Spaarpot');
  name(r.name, 'Spaarpot');
  cents(r.targetCents, 'Spaarpot');
  if (!(r.targetDate === null || isDateKey(r.targetDate))) fail('Spaarpot: ongeldige streefdatum.');
  text(r.note, 'Spaarpot');
  if (typeof r.archived !== 'boolean') fail('Spaarpot: ongeldige archiefstatus.');
}

export function validateManualSection(value: unknown): asserts value is ManualSection {
  const r = obj(value, 'Money Manual-sectie');
  oneOf(r.id, MANUAL_SECTIONS, 'Money Manual');
  text(r.text, 'Money Manual');
  if (r.createdAt !== undefined && (typeof r.createdAt !== 'string' || !Number.isFinite(Date.parse(r.createdAt)))) fail('Money Manual: ongeldig aanmaaktijdstip.');
  if (typeof r.updatedAt !== 'string' || !Number.isFinite(Date.parse(r.updatedAt))) fail('Money Manual: ongeldig tijdstip.');
  assertNoForbiddenFields(r, 'Money Manual');
}

export function validateBudgetScenario(value: unknown): asserts value is BudgetScenario {
  const r = obj(value, 'budgetscenario');
  base(r, 'Scenario');
  name(r.name, 'Scenario');
  cents(r.monthlyIncomeCents, 'Scenario');
  cents(r.monthlyExpenseCents, 'Scenario');
  if (!intIn(r.months, 1, 600)) fail('Scenario: looptijd is 1 tot 600 maanden.');
  text(r.note, 'Scenario');
}

export function validateInvestmentPlan(value: unknown): asserts value is InvestmentPlan {
  const r = obj(value, 'Investment Plan');
  base(r, 'Investment Plan');
  name(r.name, 'Investment Plan');
  oneOf(r.status, PLAN_STATUSES, 'Investment Plan');
  for (const key of ['strategy', 'principles', 'goal'] as const) text(r[key], 'Investment Plan');
  if (r.targetCents !== null) cents(r.targetCents, 'Investment Plan: doelbedrag');
  if (!intIn(r.horizonYear, 2000, 2200)) fail('Investment Plan: ongeldige horizon.');
  oneOf(r.riskProfile, RISK_PROFILES, 'Investment Plan');
  if (!Array.isArray(r.allocation)) fail('Investment Plan: ongeldige allocatie.');
  for (const item of r.allocation as unknown[]) {
    const a = obj(item, 'allocatieregel');
    assertNoForbiddenFields(a, 'Allocatie');
    name(a.assetClass, 'Allocatie');
    if (!intIn(a.targetPct, 0, 100)) fail('Allocatie: percentage is een geheel getal van 0 tot 100.');
  }
  if (r.allocation.length && allocationTotal(r.allocation as AllocationItem[]) !== 100) fail('Allocatie: de percentages moeten samen 100 zijn.');
  const classes = (r.allocation as AllocationItem[]).map((a) => a.assetClass.trim().toLocaleLowerCase('nl-NL'));
  if (new Set(classes).size !== classes.length) fail('Allocatie: elke beleggingscategorie één keer.');
  cents(r.contributionCents, 'Investment Plan: inlegplan');
  oneOf(r.frequency, FREQUENCIES, 'Investment Plan');
  if (!isDateKey(r.startDate)) fail('Investment Plan: ongeldige startdatum.');
}

export function validateInvestmentScenario(value: unknown): asserts value is InvestmentScenario {
  const r = obj(value, 'scenario');
  base(r, 'Scenario');
  if (typeof r.planId !== 'string' || !r.planId) fail('Scenario: hoort bij een plan.');
  name(r.name, 'Scenario');
  if (!intIn(r.assumedReturnTenths, -500, 500)) fail('Scenario: aangenomen rendement tussen -50 % en 50 %.');
  cents(r.startCents, 'Scenario');
  cents(r.contributionCents, 'Scenario');
  oneOf(r.frequency, FREQUENCIES, 'Scenario');
  if (!intIn(r.years, 1, 80)) fail('Scenario: looptijd is 1 tot 80 jaar.');
}

export function validatePlanNote(value: unknown): asserts value is PlanNote {
  const r = obj(value, 'notitie');
  base(r, 'Notitie');
  if (typeof r.planId !== 'string' || !r.planId) fail('Notitie: hoort bij een plan.');
  oneOf(r.kind, NOTE_KINDS, 'Notitie');
  if (!isDateKey(r.date)) fail('Notitie: ongeldige datum.');
  name(r.title, 'Notitie');
  text(r.text, 'Notitie');
  if (r.kind === 'evaluatie') {
    if (!(r.onTrack === null || ON_TRACK.includes(r.onTrack as OnTrack))) fail('Evaluatie: ongeldige beoordeling.');
  } else if (r.onTrack !== null) fail('Beslissing: heeft geen beoordeling.');
}

/** Volledige controle van een back-up van Financiën vóór herstel (ADR 0020 § 3). */
export function validateFinancienBackup(input: unknown): void {
  const backup = obj(input, 'back-up van Financiën');
  const stores = obj(backup.stores, 'gegevenssectie van Financiën') as Record<string, unknown>;
  for (const store of FINANCIEN_STORES) if (!Array.isArray(stores[store])) fail(`Back-up van Financiën mist "${store}".`);
  const list = (store: string) => stores[store] as unknown[];
  list('transactions').forEach(validateTransaction);
  list('categories').forEach(validateCategory);
  list('incomeSources').forEach(validateIncomeSource);
  list('budgets').forEach(validateBudget);
  list('pots').forEach(validatePot);
  list('manual').forEach(validateManualSection);
  list('budgetScenarios').forEach(validateBudgetScenario);
  list('investmentPlans').forEach(validateInvestmentPlan);
  list('investmentScenarios').forEach(validateInvestmentScenario);
  list('planNotes').forEach(validatePlanNote);
  for (const link of list('links')) assertNoForbiddenFields(obj(link, 'koppeling'), 'Koppeling');
}

// ——— Bedragen ———

/** "1.250,50", "1250,5", "12.5" of "12" naar centen. Gooit bij ongeldige invoer. */
export function parseEuros(input: string): number {
  const cleaned = input.replace(/[€\s]/g, '');
  if (!cleaned) fail('Vul een bedrag in.');
  const normalized = cleaned.includes(',') ? cleaned.replace(/\./g, '').replace(',', '.') : cleaned;
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) fail('Vul een bedrag in, bijvoorbeeld 1250,00.');
  const value = Math.round(Number(normalized) * 100);
  if (value > MAX_CENTS) fail('Dit bedrag is te groot.');
  return value;
}

export function formatEuros(cents: number): string {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}

// ——— Rapportages (berekend, niet opgeslagen) ———

export function monthOf(date: string): string {
  return date.slice(0, 7);
}

export function signedCents(transaction: Pick<Transaction, 'amountCents' | 'direction'>): number {
  return transaction.direction === 'in' ? transaction.amountCents : -transaction.amountCents;
}

/** Werkelijke totalen; geplande transacties tellen niet mee (ADR 0027 § 2). */
export function totals(transactions: readonly Transaction[]): { inCents: number; outCents: number; balanceCents: number } {
  let inCents = 0;
  let outCents = 0;
  for (const t of transactions) {
    if (t.kind !== 'actual') continue;
    if (t.direction === 'in') inCents += t.amountCents;
    else outCents += t.amountCents;
  }
  return { inCents, outCents, balanceCents: inCents - outCents };
}

export function inMonth(transactions: readonly Transaction[], month: string): Transaction[] {
  return transactions.filter((t) => monthOf(t.date) === month);
}

/** Uitgaven per categorienaam in een maand, aflopend. Werkelijk alleen. */
export function byCategory(transactions: readonly Transaction[], direction: Direction): { category: string; cents: number }[] {
  const map = new Map<string, number>();
  for (const t of transactions) {
    if (t.kind !== 'actual' || t.direction !== direction) continue;
    const key = t.category || 'Zonder categorie';
    map.set(key, (map.get(key) ?? 0) + t.amountCents);
  }
  return [...map.entries()].map(([category, cents]) => ({ category, cents })).sort((a, b) => b.cents - a.cents || a.category.localeCompare(b.category, 'nl-NL'));
}

/** Het budget dat in een maand geldt voor een categorie: het laatste met `validFrom` ≤ maand. */
export function budgetFor(budgets: readonly Budget[], categoryId: string, month: string): Budget | null {
  return (
    budgets
      .filter((b) => b.categoryId === categoryId && b.validFrom <= month)
      .sort((a, b) => b.validFrom.localeCompare(a.validFrom))[0] ?? null
  );
}

/** Budget tegen werkelijk per uitgavencategorie in een maand. */
export function budgetReport(
  transactions: readonly Transaction[],
  budgets: readonly Budget[],
  categories: readonly Category[],
  month: string
): { categoryId: string; name: string; budgetCents: number; spentCents: number; remainingCents: number; pct: number }[] {
  const monthly = inMonth(transactions, month);
  return categories
    .filter((c) => c.direction === 'out')
    .map((c) => {
      const budget = budgetFor(budgets, c.id, month);
      if (!budget) return null;
      const spentCents = monthly.filter((t) => t.kind === 'actual' && t.direction === 'out' && t.categoryId === c.id).reduce((sum, t) => sum + t.amountCents, 0);
      return {
        categoryId: c.id,
        name: c.name,
        budgetCents: budget.monthlyCents,
        spentCents,
        remainingCents: budget.monthlyCents - spentCents,
        pct: budget.monthlyCents > 0 ? Math.round((spentCents / budget.monthlyCents) * 100) : spentCents > 0 ? 100 : 0
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)
    .sort((a, b) => a.name.localeCompare(b.name, 'nl-NL'));
}

/** Jaaroverzicht per maand. */
export function yearReport(transactions: readonly Transaction[], year: string): { month: string; inCents: number; outCents: number; balanceCents: number }[] {
  return Array.from({ length: 12 }, (_, index) => {
    const month = `${year}-${String(index + 1).padStart(2, '0')}`;
    return { month, ...totals(inMonth(transactions, month)) };
  });
}

/** Saldo van een spaarpot: stortingen (uitgaand naar de pot) min opnames (inkomend uit de pot). Werkelijk alleen. */
export function potBalance(potId: string, transactions: readonly Transaction[]): number {
  return transactions.filter((t) => t.potId === potId && t.kind === 'actual').reduce((sum, t) => sum + (t.direction === 'out' ? t.amountCents : -t.amountCents), 0);
}

export function potProgress(pot: Pot, transactions: readonly Transaction[]): { balanceCents: number; pct: number } {
  const balanceCents = potBalance(pot.id, transactions);
  return { balanceCents, pct: pot.targetCents > 0 ? Math.max(0, Math.min(100, Math.round((balanceCents / pot.targetCents) * 100))) : 0 };
}

/** Werkelijk inkomen in een maand: leescontract voor de 10/10-regel in Groei (ADR 0027 § 4). */
export function monthlyIncome(transactions: readonly Transaction[], month: string): number {
  return totals(inMonth(transactions, month)).inCents;
}

export type TransactionSort = 'datum' | 'bedrag';

export function filterTransactions(
  transactions: readonly Transaction[],
  options: { month?: string; direction?: Direction | ''; kind?: TransactionKind | ''; categoryId?: string; query?: string; sort?: TransactionSort }
): Transaction[] {
  const needle = (options.query ?? '').trim().toLocaleLowerCase('nl-NL');
  const result = transactions.filter((t) => {
    if (options.month && monthOf(t.date) !== options.month) return false;
    if (options.direction && t.direction !== options.direction) return false;
    if (options.kind && t.kind !== options.kind) return false;
    if (options.categoryId && t.categoryId !== options.categoryId) return false;
    if (!needle) return true;
    return [t.description, t.counterparty, t.category].some((part) => part.toLocaleLowerCase('nl-NL').includes(needle));
  });
  return result.sort((a, b) => (options.sort === 'bedrag' ? b.amountCents - a.amountCents : 0) || b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}

/** UTF-8 CSV met een BOM en CRLF; de bedragen blijven exact in centen. */
export function transactionsCsv(transactions: readonly Transaction[]): string {
  const cell = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const rows = [
    ['Datum', 'Richting', 'Status', 'Bedrag (cent)', 'Categorie', 'Tegenpartij', 'Omschrijving'],
    ...transactions.map((t) => [t.date, t.direction, t.kind, String(t.amountCents), t.category, t.counterparty, t.description])
  ];
  return `\uFEFF${rows.map((row) => row.map(cell).join(',')).join('\r\n')}\r\n`;
}

/** Twee werkelijke transacties met dezelfde datum, richting en bedrag: melden, nooit samenvoegen (ADR 0027 § 3). */
export function possibleDuplicates(transactions: readonly Transaction[]): string[][] {
  const groups = new Map<string, string[]>();
  for (const t of transactions) {
    if (t.kind !== 'actual') continue;
    const key = `${t.date}|${t.direction}|${t.amountCents}`;
    groups.set(key, [...(groups.get(key) ?? []), t.id]);
  }
  return [...groups.values()].filter((ids) => ids.length > 1);
}

// ——— Budgetscenario's en Investment Plan ———

export function scenarioOutcome(s: Pick<BudgetScenario, 'monthlyIncomeCents' | 'monthlyExpenseCents' | 'months'>): { monthlySavingsCents: number; totalCents: number; savingsRatePct: number | null } {
  const monthlySavingsCents = s.monthlyIncomeCents - s.monthlyExpenseCents;
  return {
    monthlySavingsCents,
    totalCents: monthlySavingsCents * s.months,
    savingsRatePct: s.monthlyIncomeCents > 0 ? Math.round((monthlySavingsCents / s.monthlyIncomeCents) * 1000) / 10 : null
  };
}

export function periodsPerYear(frequency: Frequency): number {
  return frequency === 'maand' ? 12 : frequency === 'kwartaal' ? 4 : 1;
}

export function allocationTotal(allocation: readonly AllocationItem[]): number {
  return allocation.reduce((sum, item) => sum + item.targetPct, 0);
}

/** Geplande inleg per jaar volgens het inlegplan. */
export function plannedYearlyContribution(plan: Pick<InvestmentPlan, 'contributionCents' | 'frequency'>): number {
  return plan.contributionCents * periodsPerYear(plan.frequency);
}

/**
 * Scenarioberekening: waarde per jaar bij een aangenomen rendement, met inleg aan het eind van elke periode.
 * Uitsluitend een rekenvoorbeeld op basis van aannames; geen voorspelling en geen werkelijke waarde.
 */
export function projectScenario(s: Pick<InvestmentScenario, 'assumedReturnTenths' | 'startCents' | 'contributionCents' | 'frequency' | 'years'>): {
  year: number;
  valueCents: number;
  contributedCents: number;
}[] {
  const n = periodsPerYear(s.frequency);
  const annual = s.assumedReturnTenths / 1000;
  const rate = Math.pow(1 + annual, 1 / n) - 1;
  let value = s.startCents;
  let contributed = s.startCents;
  const rows: { year: number; valueCents: number; contributedCents: number }[] = [];
  for (let year = 1; year <= s.years; year += 1) {
    for (let p = 0; p < n; p += 1) {
      value = value * (1 + rate) + s.contributionCents;
      contributed += s.contributionCents;
    }
    rows.push({ year, valueCents: Math.round(value), contributedCents: contributed });
  }
  return rows;
}

/** Laatste evaluatie van een plan: de voortgang volgens de eigenaar. */
export function latestEvaluation(notes: readonly PlanNote[], planId: string): PlanNote | null {
  return notes.filter((n) => n.planId === planId && n.kind === 'evaluatie').sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))[0] ?? null;
}

/** Jaren tot de horizon vanaf `today`. */
export function yearsToHorizon(plan: Pick<InvestmentPlan, 'horizonYear'>, today: string): number {
  return Math.max(0, plan.horizonYear - Number(today.slice(0, 4)));
}

// ——— Leescontracten (ADR 0023 § 6, ADR 0024 § 3) ———

/** Lookup: spaarpotten en plannen hebben geen soort uit de vijf (ADR 0024 § 3a). */
export function financienLookupItems(ids: readonly string[], data: { pots: readonly Pot[]; plans: readonly InvestmentPlan[] }): LookupItem[] {
  const wanted = new Set(ids);
  return toLookupItems([...data.pots, ...data.plans].filter((r) => wanted.has(r.id)).map((r) => ({ id: r.id, title: r.name })));
}

/** Dashboard: alleen totalen van de lopende maand en tellers, geen omschrijvingen of tegenpartijen. */
export function financienSummary(data: { transactions: readonly Transaction[]; budgets: readonly Budget[]; categories: readonly Category[]; plans: readonly InvestmentPlan[] }, today: string) {
  const month = monthOf(today);
  const t = totals(inMonth(data.transactions, month));
  const report = budgetReport(data.transactions, data.budgets, data.categories, month);
  return {
    month,
    inCents: t.inCents,
    outCents: t.outCents,
    balanceCents: t.balanceCents,
    budgetsOver: report.filter((row) => row.spentCents > row.budgetCents).length,
    activePlans: data.plans.filter((p) => p.status === 'actief').length
  };
}
