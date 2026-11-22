import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { BrowserRouter, Link, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { newId } from '@ecosystem/core';
import { openLocalDatabase, runStorageAction as performStorageAction, type LocalDatabase } from '@ecosystem/storage';
import { AppFrame, BarChart, Button, Card, ConfirmAction, EmptyState, ErrorBanner, Field, LineChart, LoadingState, PageHeader, StatusPill, type ModuleLink } from '@ecosystem/ui';
import {
  FREQUENCIES,
  INCOME_TYPES,
  MANUAL_SECTIONS,
  NOTE_KINDS,
  ON_TRACK,
  PLAN_STATUSES,
  RISK_PROFILES,
  allocationTotal,
  budgetReport,
  byCategory,
  centsToInput,
  filterTransactions,
  formatEuros,
  inMonth,
  latestEvaluation,
  monthOf,
  parseEuros,
  plannedYearlyContribution,
  possibleDuplicates,
  potProgress,
  projectScenario,
  scenarioOutcome,
  totals,
  validateBudget,
  validateBudgetScenario,
  validateCategory,
  validateIncomeSource,
  validateInvestmentPlan,
  validateInvestmentScenario,
  validateManualSection,
  validatePlanNote,
  validatePot,
  validateTransaction,
  yearReport,
  yearsToHorizon,
  type AllocationItem,
  type Budget,
  type BudgetScenario,
  type Category,
  type Direction,
  type Frequency,
  type IncomeSource,
  type IncomeType,
  type InvestmentPlan,
  type InvestmentScenario,
  type ManualSection,
  type ManualSectionId,
  type NoteKind,
  type OnTrack,
  type PlanNote,
  type PlanStatus,
  type Pot,
  type RiskProfile,
  type Transaction,
  type TransactionKind,
  type TransactionSort
} from './domain';
import { databaseConfig } from './storage';

const navigation = [
  { to: '/', label: 'Overzicht', icon: '⌂' },
  { to: '/transacties', label: 'Transacties', icon: '⇅' },
  { to: '/budgetten', label: 'Budgetten', icon: '◫' },
  { to: '/spaarpotten', label: 'Spaarpotten', icon: '◎' },
  { to: '/rapportage', label: 'Rapportage', icon: '▤' },
  { to: '/money-manual', label: 'Money Manual', icon: '✎' },
  { to: '/beleggingsplan', label: 'Investment Plan', icon: '↗' },
  { to: '/instellingen', label: 'Categorieën', icon: '⚙' }
];

const UNAVAILABLE = 'Niet meer beschikbaar';
const SECTION_LABEL: Record<ManualSectionId, string> = {
  uitgangspunten: 'Uitgangspunten',
  strategie: 'Financiële strategie',
  spaarstrategie: 'Spaarstrategie',
  notities: 'Financiële kennis en notities'
};
const FREQ_LABEL: Record<Frequency, string> = { maand: 'per maand', kwartaal: 'per kwartaal', jaar: 'per jaar' };

interface Data {
  transactions: Transaction[];
  categories: Category[];
  sources: IncomeSource[];
  budgets: Budget[];
  pots: Pot[];
  manual: ManualSection[];
  budgetScenarios: BudgetScenario[];
  plans: InvestmentPlan[];
  scenarios: InvestmentScenario[];
  notes: PlanNote[];
}

const empty: Data = { transactions: [], categories: [], sources: [], budgets: [], pots: [], manual: [], budgetScenarios: [], plans: [], scenarios: [], notes: [] };

type Run = (action: (db: LocalDatabase) => Promise<void>) => Promise<boolean>;

function todayKey(): string {
  const date = new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function nowIso(): string {
  return new Date().toISOString();
}

function formatDate(date: string | null): string {
  if (!date) return '—';
  return new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${date}T12:00:00`));
}

function formatMonth(month: string): string {
  return new Intl.DateTimeFormat('nl-NL', { month: 'long', year: 'numeric' }).format(new Date(`${month}-15T12:00:00`));
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + delta, 15));
  return d.toISOString().slice(0, 7);
}

export default function FinancienApp({ links }: { links: ModuleLink[] }) {
  return (
    <BrowserRouter basename="/financien">
      <FinancienRoutes links={links} />
    </BrowserRouter>
  );
}

function FinancienRoutes({ links }: { links: ModuleLink[] }) {
  const [database, setDatabase] = useState<LocalDatabase | null>(null);
  const [data, setData] = useState<Data>(empty);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function refresh(db: LocalDatabase) {
    const [transactions, categories, sources, budgets, pots, manual, budgetScenarios, plans, scenarios, notes] = await Promise.all([
      db.list<Transaction>('transactions'),
      db.list<Category>('categories'),
      db.list<IncomeSource>('incomeSources'),
      db.list<Budget>('budgets'),
      db.list<Pot>('pots'),
      db.list<ManualSection>('manual'),
      db.list<BudgetScenario>('budgetScenarios'),
      db.list<InvestmentPlan>('investmentPlans'),
      db.list<InvestmentScenario>('investmentScenarios'),
      db.list<PlanNote>('planNotes')
    ]);
    const byName = <T extends { name: string }>(list: T[]) => list.sort((a, b) => a.name.localeCompare(b.name, 'nl-NL'));
    setData({
      transactions,
      categories: byName(categories),
      sources: byName(sources),
      budgets,
      pots: byName(pots),
      manual,
      budgetScenarios: byName(budgetScenarios),
      plans: byName(plans),
      scenarios: byName(scenarios),
      notes: notes.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
    });
  }

  useEffect(() => {
    let active = true;
    let opened: LocalDatabase | null = null;
    void openLocalDatabase(databaseConfig)
      .then(async (db) => {
        opened = db;
        await refresh(db);
        if (active) setDatabase(db);
      })
      .catch((cause: unknown) => active && setError(cause instanceof Error ? cause.message : 'Lokale gegevens konden niet worden geopend.'))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
      opened?.close();
    };
  }, []);

  const run: Run = async (action) => {
    if (!database) {
      setError('Lokale opslag is niet beschikbaar.');
      return false;
    }
    return performStorageAction(() => action(database), () => refresh(database), setError, 'De wijziging kon niet worden opgeslagen.');
  };

  return (
    <AppFrame appName="Financiën" appMark="€" navigation={navigation} moduleLinks={links}>
      {loading ? (
        <LoadingState />
      ) : (
        <>
          {error && <ErrorBanner message={error} />}
          <Routes>
            <Route path="/" element={<OverviewPage data={data} />} />
            <Route path="/transacties" element={<TransactionsPage data={data} run={run} />} />
            <Route path="/budgetten" element={<BudgetsPage data={data} run={run} />} />
            <Route path="/spaarpotten" element={<PotsPage data={data} run={run} />} />
            <Route path="/rapportage" element={<ReportPage data={data} />} />
            <Route path="/money-manual" element={<ManualPage data={data} run={run} />} />
            <Route path="/beleggingsplan" element={<PlansPage data={data} run={run} />} />
            <Route path="/beleggingsplan/:id" element={<PlanDetailPage data={data} run={run} />} />
            <Route path="/instellingen" element={<SettingsPage data={data} run={run} />} />
            <Route path="*" element={<OverviewPage data={data} />} />
          </Routes>
        </>
      )}
    </AppFrame>
  );
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <Card className="metric">
      <p className="metric-label">{label}</p>
      <p className="metric-value">{value}</p>
      <p className="metric-note">{note}</p>
    </Card>
  );
}

function MonthPicker({ month, onChange }: { month: string; onChange: (month: string) => void }) {
  return (
    <div className="row" style={{ justifyContent: 'flex-start', gap: '0.5rem' }}>
      <Button variant="secondary" type="button" onClick={() => onChange(shiftMonth(month, -1))} aria-label="Vorige maand">‹</Button>
      <Field label="Maand">
        <input type="month" value={month} onChange={(event) => event.target.value && onChange(event.target.value)} />
      </Field>
      <Button variant="secondary" type="button" onClick={() => onChange(shiftMonth(month, 1))} aria-label="Volgende maand">›</Button>
    </div>
  );
}

// ——— Overzicht ———

function OverviewPage({ data }: { data: Data }) {
  const today = todayKey();
  const month = monthOf(today);
  const monthly = inMonth(data.transactions, month);
  const t = totals(monthly);
  const report = budgetReport(data.transactions, data.budgets, data.categories, month);
  const over = report.filter((row) => row.spentCents > row.budgetCents);
  const pots = data.pots.filter((pot) => !pot.archived);
  const activePlans = data.plans.filter((plan) => plan.status === 'actief');

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Financiën"
        title="Jouw geld, jouw strategie"
        description="Persoonlijke inkomsten, uitgaven, budgetten, spaarpotten, het Money Manual en je Investment Plan. Huishoudfinanciën en vermogensbeheer staan in Samen Thuis."
        action={<Link className="button button-primary" to="/transacties?nieuw=1">＋ Transactie</Link>}
      />
      <div className="grid grid-4">
        <Metric label="Inkomsten deze maand" value={formatEuros(t.inCents)} note={formatMonth(month)} />
        <Metric label="Uitgaven deze maand" value={formatEuros(t.outCents)} note={`${monthly.filter((x) => x.kind === 'planned').length} gepland, telt niet mee`} />
        <Metric label="Saldo" value={formatEuros(t.balanceCents)} note={t.balanceCents >= 0 ? 'Je houdt over' : 'Je komt tekort'} />
        <Metric label="Budgetten" value={`${report.length - over.length}/${report.length}`} note={over.length ? `${over.length} overschreden` : 'Binnen budget'} />
      </div>
      <div className="grid grid-2">
        <Card title="Spaarpotten" action={<Link className="text-button" to="/spaarpotten">Alle spaarpotten</Link>}>
          {pots.length ? (
            <div className="list">
              {pots.map((pot) => {
                const progress = potProgress(pot, data.transactions);
                return (
                  <div className="list-item" key={pot.id}>
                    <div>
                      <p className="item-title">{pot.name}</p>
                      <p className="item-subtitle">{formatEuros(progress.balanceCents)} van {formatEuros(pot.targetCents)}</p>
                    </div>
                    <progress max={100} value={progress.pct} aria-label={`Voortgang ${pot.name}`} />
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState title="Nog geen spaarpotten">Maak een spaarpot voor een buffer of een doel.</EmptyState>
          )}
        </Card>
        <Card title="Investment Plan" action={<Link className="text-button" to="/beleggingsplan">Naar het plan</Link>}>
          {activePlans.length ? (
            <div className="list">
              {activePlans.map((plan) => {
                const evaluation = latestEvaluation(data.notes, plan.id);
                return (
                  <div className="list-item" key={plan.id}>
                    <div>
                      <p className="item-title"><Link to={`/beleggingsplan/${plan.id}`}>{plan.name}</Link></p>
                      <p className="item-subtitle">Inleg {formatEuros(plan.contributionCents)} {FREQ_LABEL[plan.frequency]} · horizon {plan.horizonYear}</p>
                    </div>
                    <StatusPill tone={evaluation?.onTrack === 'achter' ? 'warning' : evaluation ? 'good' : 'neutral'}>{evaluation?.onTrack ?? 'nog niet geëvalueerd'}</StatusPill>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState title="Geen actief plan">Leg je beleggingsstrategie vast als plan. Er worden geen voorbeeldgegevens getoond.</EmptyState>
          )}
        </Card>
      </div>
      {over.length > 0 && (
        <Card title="Budget overschreden">
          <div className="list">
            {over.map((row) => (
              <div className="list-item" key={row.categoryId}>
                <p className="item-title">{row.name}</p>
                <StatusPill tone="warning">{formatEuros(row.spentCents)} / {formatEuros(row.budgetCents)}</StatusPill>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ——— Transacties ———

function TransactionEditor({ data, run, transaction, onDone }: { data: Data; run: Run; transaction?: Transaction; onDone: () => void }) {
  const [date, setDate] = useState(transaction?.date ?? todayKey());
  const [amount, setAmount] = useState(transaction ? centsToInput(transaction.amountCents) : '');
  const [direction, setDirection] = useState<Direction>(transaction?.direction ?? 'out');
  const [kind, setKind] = useState<TransactionKind>(transaction?.kind ?? 'actual');
  const [categoryId, setCategoryId] = useState(transaction?.categoryId ?? '');
  const [counterparty, setCounterparty] = useState(transaction?.counterparty ?? '');
  const [description, setDescription] = useState(transaction?.description ?? '');
  const [sourceId, setSourceId] = useState(transaction?.sourceId ?? '');
  const [potId, setPotId] = useState(transaction?.potId ?? '');
  const [formError, setFormError] = useState('');
  const categories = data.categories.filter((c) => c.direction === direction && (!c.archived || c.id === categoryId));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError('');
    try {
      const now = nowIso();
      const chosen = data.categories.find((c) => c.id === categoryId);
      const next: Transaction = {
        ...(transaction ?? {}),
        id: transaction?.id ?? newId(),
        date,
        amountCents: parseEuros(amount),
        direction,
        kind,
        categoryId: chosen ? chosen.id : null,
        // De naam blijft bij een bestaande boeking staan als de categorie ongewijzigd is (historie, ADR 0027 § 2).
        category: chosen ? (transaction && transaction.categoryId === chosen.id ? transaction.category : chosen.name) : '',
        counterparty: counterparty.trim(),
        description: description.trim(),
        sourceId: direction === 'in' && sourceId ? sourceId : null,
        potId: potId || null,
        createdAt: transaction?.createdAt ?? now,
        updatedAt: now
      };
      validateTransaction(next);
      if (await run((db) => db.put('transactions', next))) onDone();
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'De transactie bevat ongeldige gegevens.');
    }
  }

  return (
    <Card title={transaction ? 'Transactie aanpassen' : 'Nieuwe transactie'}>
      <form className="stack" noValidate onSubmit={(event) => void submit(event)}>
        <div className="form-grid">
          <Field label="Soort">
            <select value={direction} onChange={(event) => { setDirection(event.target.value as Direction); setCategoryId(''); }}>
              <option value="out">Uitgave</option>
              <option value="in">Inkomst</option>
            </select>
          </Field>
          <Field label="Bedrag (€)">
            <input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} required />
          </Field>
          <Field label="Datum">
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </Field>
          <Field label="Gepland of werkelijk">
            <select value={kind} onChange={(event) => setKind(event.target.value as TransactionKind)}>
              <option value="actual">Werkelijk</option>
              <option value="planned">Gepland (telt niet mee)</option>
            </select>
          </Field>
          <Field label="Categorie">
            <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
              <option value="">Geen</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          {direction === 'in' && (
            <Field label="Inkomstenbron">
              <select value={sourceId} onChange={(event) => setSourceId(event.target.value)}>
                <option value="">Geen</option>
                {data.sources.filter((s) => !s.archived || s.id === sourceId).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
          )}
          <Field label="Spaarpot" hint="Uitgave = storting in de pot, inkomst = opname">
            <select value={potId} onChange={(event) => setPotId(event.target.value)}>
              <option value="">Geen</option>
              {data.pots.filter((p) => !p.archived || p.id === potId).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="Tegenpartij">
            <input value={counterparty} maxLength={200} onChange={(event) => setCounterparty(event.target.value)} />
          </Field>
        </div>
        <Field label="Omschrijving">
          <input value={description} onChange={(event) => setDescription(event.target.value)} />
        </Field>
        {formError && <ErrorBanner message={formError} />}
        <div className="form-actions">
          <Button type="button" variant="secondary" onClick={onDone}>Annuleren</Button>
          <Button type="submit">Transactie opslaan</Button>
        </div>
      </form>
    </Card>
  );
}

function TransactionsPage({ data, run }: { data: Data; run: Run }) {
  const [params, setParams] = useSearchParams();
  const [month, setMonth] = useState(monthOf(todayKey()));
  const [allMonths, setAllMonths] = useState(false);
  const [direction, setDirection] = useState<Direction | ''>('');
  const [kind, setKind] = useState<TransactionKind | ''>('');
  const [categoryId, setCategoryId] = useState('');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<TransactionSort>('datum');
  const editing = data.transactions.find((t) => t.id === params.get('bewerk'));
  const list = filterTransactions(data.transactions, { ...(allMonths ? {} : { month }), direction, kind, categoryId, query, sort });
  const duplicates = new Set(possibleDuplicates(data.transactions).flat());
  const t = totals(list);

  return (
    <div className="stack">
      <PageHeader eyebrow="Financiën" title="Transacties" description="Inkomsten en uitgaven, werkelijk of gepland." action={!params.get('nieuw') && !editing && <Button onClick={() => setParams({ nieuw: '1' })}>＋ Transactie</Button>} />
      {(params.get('nieuw') === '1' || editing) && <TransactionEditor key={editing?.id ?? 'nieuw'} data={data} run={run} {...(editing ? { transaction: editing } : {})} onDone={() => setParams({})} />}
      <Card>
        <div className="form-grid">
          {!allMonths && <MonthPicker month={month} onChange={setMonth} />}
          <Field label="Periode">
            <select value={allMonths ? 'alle' : 'maand'} onChange={(event) => setAllMonths(event.target.value === 'alle')}>
              <option value="maand">Eén maand</option>
              <option value="alle">Alle maanden</option>
            </select>
          </Field>
          <Field label="Filter op soort">
            <select value={direction} onChange={(event) => setDirection(event.target.value as Direction | '')}>
              <option value="">In en uit</option>
              <option value="in">Inkomsten</option>
              <option value="out">Uitgaven</option>
            </select>
          </Field>
          <Field label="Filter op status">
            <select value={kind} onChange={(event) => setKind(event.target.value as TransactionKind | '')}>
              <option value="">Werkelijk en gepland</option>
              <option value="actual">Werkelijk</option>
              <option value="planned">Gepland</option>
            </select>
          </Field>
          <Field label="Filter op categorie">
            <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
              <option value="">Alle</option>
              {data.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Zoeken">
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Omschrijving, tegenpartij of categorie" />
          </Field>
          <Field label="Sorteren">
            <select value={sort} onChange={(event) => setSort(event.target.value as TransactionSort)}>
              <option value="datum">Datum</option>
              <option value="bedrag">Bedrag</option>
            </select>
          </Field>
        </div>
        <p className="item-subtitle">Werkelijk in deze selectie: in {formatEuros(t.inCents)}, uit {formatEuros(t.outCents)}, saldo {formatEuros(t.balanceCents)}.</p>
      </Card>
      {list.length ? (
        <Card>
          <div className="list">
            {list.map((tr) => (
              <div className="list-item" key={tr.id}>
                <div>
                  <p className="item-title">
                    {tr.direction === 'in' ? '+' : '−'} {formatEuros(tr.amountCents)} · {tr.description || tr.counterparty || tr.category || 'Zonder omschrijving'}
                  </p>
                  <p className="item-subtitle">
                    {formatDate(tr.date)} · {tr.category || 'geen categorie'}
                    {tr.potId && <> · spaarpot {data.pots.find((p) => p.id === tr.potId)?.name ?? UNAVAILABLE}</>}
                    {tr.kind === 'planned' && <> · <strong>gepland</strong></>}
                    {duplicates.has(tr.id) && <> · <strong>mogelijk dubbel</strong></>}
                  </p>
                </div>
                <div className="row">
                  <button type="button" className="text-button" onClick={() => setParams({ bewerk: tr.id })}>Aanpassen</button>
                  <ConfirmAction label={`Transactie van ${formatDate(tr.date)} verwijderen`} confirmMessage="Deze transactie verwijderen? Dit kan niet ongedaan worden gemaakt." onConfirm={() => void run((db) => db.remove('transactions', tr.id))}>
                    Verwijderen
                  </ConfirmAction>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : (
        <Card>
          <EmptyState title={data.transactions.length ? 'Niets gevonden' : 'Nog geen transacties'}>{data.transactions.length ? 'Pas de filters aan.' : 'Voeg je eerste inkomst of uitgave toe.'}</EmptyState>
        </Card>
      )}
    </div>
  );
}

// ——— Budgetten ———

function BudgetsPage({ data, run }: { data: Data; run: Run }) {
  const [month, setMonth] = useState(monthOf(todayKey()));
  const [categoryId, setCategoryId] = useState('');
  const [amount, setAmount] = useState('');
  const [validFrom, setValidFrom] = useState(monthOf(todayKey()));
  const [formError, setFormError] = useState('');
  const report = budgetReport(data.transactions, data.budgets, data.categories, month);
  const outCategories = data.categories.filter((c) => c.direction === 'out' && !c.archived);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError('');
    try {
      const now = nowIso();
      const existing = data.budgets.find((b) => b.categoryId === categoryId && b.validFrom === validFrom);
      const budget: Budget = { id: existing?.id ?? newId(), categoryId, monthlyCents: parseEuros(amount), validFrom, createdAt: existing?.createdAt ?? now, updatedAt: now };
      validateBudget(budget);
      if (await run((db) => db.put('budgets', budget))) setAmount('');
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Ongeldig budget.');
    }
  }

  return (
    <div className="stack">
      <PageHeader eyebrow="Financiën" title="Budgetten" description="Een maandbudget per uitgavencategorie. Een nieuw budget geldt vanaf de gekozen maand; oudere maanden houden hun eigen budget." />
      <Card title="Budget instellen">
        {outCategories.length ? (
          <form className="stack" noValidate onSubmit={(event) => void submit(event)}>
            <div className="form-grid">
              <Field label="Categorie">
                <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
                  <option value="">Kies een categorie</option>
                  {outCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
              <Field label="Per maand (€)">
                <input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} />
              </Field>
              <Field label="Geldig vanaf">
                <input type="month" value={validFrom} onChange={(event) => setValidFrom(event.target.value)} />
              </Field>
            </div>
            {formError && <ErrorBanner message={formError} />}
            <div className="form-actions">
              <Button type="submit">Budget opslaan</Button>
            </div>
          </form>
        ) : (
          <p className="item-subtitle">Maak eerst een uitgavencategorie aan onder <Link to="/instellingen">Categorieën</Link>.</p>
        )}
      </Card>
      <Card title={`Budget tegen werkelijk · ${formatMonth(month)}`}>
        <MonthPicker month={month} onChange={setMonth} />
        {report.length ? (
          <div className="list">
            {report.map((row) => (
              <div className="list-item" key={row.categoryId}>
                <div>
                  <p className="item-title">{row.name}</p>
                  <p className="item-subtitle">{formatEuros(row.spentCents)} van {formatEuros(row.budgetCents)} · {row.remainingCents >= 0 ? `nog ${formatEuros(row.remainingCents)}` : `${formatEuros(-row.remainingCents)} over budget`}</p>
                </div>
                <StatusPill tone={row.spentCents > row.budgetCents ? 'warning' : 'good'}>{row.pct}%</StatusPill>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="Geen budgetten voor deze maand">Stel hierboven een budget in.</EmptyState>
        )}
      </Card>
    </div>
  );
}

// ——— Spaarpotten ———

function PotsPage({ data, run }: { data: Data; run: Run }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = data.pots.find((p) => p.id === editingId);
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [note, setNote] = useState('');
  const [formError, setFormError] = useState('');

  useEffect(() => {
    setName(editing?.name ?? '');
    setTarget(editing ? centsToInput(editing.targetCents) : '');
    setTargetDate(editing?.targetDate ?? '');
    setNote(editing?.note ?? '');
  }, [editing]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError('');
    try {
      const now = nowIso();
      const pot: Pot = { id: editing?.id ?? newId(), name: name.trim(), targetCents: parseEuros(target), targetDate: targetDate || null, note: note.trim(), archived: editing?.archived ?? false, createdAt: editing?.createdAt ?? now, updatedAt: now };
      validatePot(pot);
      if (await run((db) => db.put('pots', pot))) {
        setEditingId(null);
        setName('');
        setTarget('');
        setTargetDate('');
        setNote('');
      }
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Ongeldige spaarpot.');
    }
  }

  return (
    <div className="stack">
      <PageHeader eyebrow="Financiën" title="Spaarpotten" description="Een doelbedrag per pot. Stortingen en opnames boek je als transactie met de pot erbij." />
      <Card title={editing ? 'Spaarpot aanpassen' : 'Nieuwe spaarpot'}>
        <form className="stack" noValidate onSubmit={(event) => void submit(event)}>
          <div className="form-grid">
            <Field label="Naam">
              <input value={name} maxLength={200} onChange={(event) => setName(event.target.value)} />
            </Field>
            <Field label="Doelbedrag (€)">
              <input inputMode="decimal" value={target} onChange={(event) => setTarget(event.target.value)} />
            </Field>
            <Field label="Streefdatum">
              <input type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} />
            </Field>
          </div>
          <Field label="Notitie">
            <input value={note} onChange={(event) => setNote(event.target.value)} />
          </Field>
          {formError && <ErrorBanner message={formError} />}
          <div className="form-actions">
            {editing && <Button type="button" variant="secondary" onClick={() => setEditingId(null)}>Annuleren</Button>}
            <Button type="submit">Spaarpot opslaan</Button>
          </div>
        </form>
      </Card>
      <Card>
        {data.pots.length ? (
          <div className="list">
            {data.pots.map((pot) => {
              const progress = potProgress(pot, data.transactions);
              return (
                <div className="list-item" key={pot.id}>
                  <div>
                    <p className="item-title">{pot.name}{pot.archived && ' (gearchiveerd)'}</p>
                    <p className="item-subtitle">{formatEuros(progress.balanceCents)} van {formatEuros(pot.targetCents)} · {progress.pct}% · streefdatum {formatDate(pot.targetDate)}</p>
                  </div>
                  <div className="row">
                    <progress max={100} value={progress.pct} aria-label={`Voortgang ${pot.name}`} />
                    <button type="button" className="text-button" onClick={() => setEditingId(pot.id)}>Aanpassen</button>
                    <button type="button" className="text-button" onClick={() => void run((db) => db.put('pots', { ...pot, archived: !pot.archived, updatedAt: nowIso() }))}>{pot.archived ? 'Terugzetten' : 'Archiveren'}</button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState title="Nog geen spaarpotten">Maak hierboven je eerste spaarpot.</EmptyState>
        )}
      </Card>
    </div>
  );
}

// ——— Rapportage ———

function ReportPage({ data }: { data: Data }) {
  const [year, setYear] = useState(todayKey().slice(0, 4));
  const rows = yearReport(data.transactions, year);
  const yearTx = data.transactions.filter((t) => t.date.startsWith(`${year}-`));
  const yearTotals = totals(yearTx);
  const outByCategory = byCategory(yearTx, 'out');
  const years = useMemo(() => [...new Set([todayKey().slice(0, 4), ...data.transactions.map((t) => t.date.slice(0, 4))])].sort().reverse(), [data.transactions]);

  return (
    <div className="stack">
      <PageHeader eyebrow="Financiën" title="Rapportage" description="Per maand en per jaar, berekend uit je transacties. Gepland telt niet mee." />
      <Card>
        <Field label="Jaar">
          <select value={year} onChange={(event) => setYear(event.target.value)}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </Field>
      </Card>
      <div className="grid grid-4">
        <Metric label="Inkomsten" value={formatEuros(yearTotals.inCents)} note={year} />
        <Metric label="Uitgaven" value={formatEuros(yearTotals.outCents)} note={year} />
        <Metric label="Saldo" value={formatEuros(yearTotals.balanceCents)} note={year} />
        <Metric label="Spaarquote" value={yearTotals.inCents ? `${Math.round((yearTotals.balanceCents / yearTotals.inCents) * 100)}%` : '—'} note="Saldo gedeeld door inkomsten" />
      </div>
      <div className="grid grid-2">
        <Card title="Uitgaven per maand">
          <BarChart title={`Uitgaven per maand in ${year}`} unit=" €" points={rows.map((r) => ({ label: r.month.slice(5, 7), value: Math.round(r.outCents / 100) }))} />
        </Card>
        <Card title="Uitgaven per categorie">
          {outByCategory.length ? (
            <div className="list">
              {outByCategory.map((row) => (
                <div className="list-item" key={row.category}>
                  <p className="item-title">{row.category}</p>
                  <p className="item-subtitle">{formatEuros(row.cents)}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="item-subtitle">Geen uitgaven in {year}.</p>
          )}
        </Card>
      </div>
      <Card title="Per maand">
        <div style={{ overflowX: 'auto' }}><table className="review-table">
          <caption className="visually-hidden">Inkomsten, uitgaven en saldo per maand in {year}</caption>
          <thead>
            <tr>
              <th scope="col">Maand</th>
              <th scope="col">In</th>
              <th scope="col">Uit</th>
              <th scope="col">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.month}>
                <th scope="row">{formatMonth(r.month)}</th>
                <td>{formatEuros(r.inCents)}</td>
                <td>{formatEuros(r.outCents)}</td>
                <td>{formatEuros(r.balanceCents)}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </Card>
    </div>
  );
}

// ——— Money Manual ———

function ManualSectionCard({ id, section, run }: { id: ManualSectionId; section: ManualSection | undefined; run: Run }) {
  const [value, setValue] = useState(section?.text ?? '');
  const [saved, setSaved] = useState('');
  useEffect(() => setValue(section?.text ?? ''), [section]);
  async function save() {
    const next: ManualSection = { id, text: value, updatedAt: nowIso() };
    validateManualSection(next);
    if (await run((db) => db.put('manual', next))) setSaved('Opgeslagen.');
  }
  return (
    <Card title={SECTION_LABEL[id]}>
      <Field label={SECTION_LABEL[id]} {...(section ? { hint: `Laatst bijgewerkt ${formatDate(section.updatedAt.slice(0, 10))}` } : {})}>
        <textarea value={value} onChange={(event) => { setValue(event.target.value); setSaved(''); }} />
      </Field>
      {saved && <p role="status" className="item-subtitle">{saved}</p>}
      <div className="form-actions">
        <Button type="button" onClick={() => void save()}>Opslaan</Button>
      </div>
    </Card>
  );
}

function ManualPage({ data, run }: { data: Data; run: Run }) {
  const [name, setName] = useState('');
  const [income, setIncome] = useState('');
  const [expense, setExpense] = useState('');
  const [months, setMonths] = useState('12');
  const [formError, setFormError] = useState('');

  async function addScenario(event: FormEvent) {
    event.preventDefault();
    setFormError('');
    try {
      const now = nowIso();
      const scenario: BudgetScenario = { id: newId(), name: name.trim(), monthlyIncomeCents: parseEuros(income), monthlyExpenseCents: parseEuros(expense), months: Number(months), note: '', createdAt: now, updatedAt: now };
      validateBudgetScenario(scenario);
      if (await run((db) => db.put('budgetScenarios', scenario))) {
        setName('');
        setIncome('');
        setExpense('');
      }
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Ongeldig scenario.');
    }
  }

  return (
    <div className="stack">
      <PageHeader eyebrow="Financiën" title="Money Manual" description="Je financiële uitgangspunten, strategie, spaarstrategie en kennis, plus scenario's om keuzes door te rekenen." />
      <div className="grid grid-2">
        {MANUAL_SECTIONS.map((id) => <ManualSectionCard key={id} id={id} section={data.manual.find((s) => s.id === id)} run={run} />)}
      </div>
      <Card title="Financiële scenario's">
        <p className="item-subtitle">Wat houd je over bij een ander inkomen of andere uitgaven? Alleen jouw eigen aannames.</p>
        <form className="stack" noValidate onSubmit={(event) => void addScenario(event)}>
          <div className="form-grid">
            <Field label="Scenario">
              <input value={name} maxLength={200} onChange={(event) => setName(event.target.value)} />
            </Field>
            <Field label="Inkomen per maand (€)">
              <input inputMode="decimal" value={income} onChange={(event) => setIncome(event.target.value)} />
            </Field>
            <Field label="Uitgaven per maand (€)">
              <input inputMode="decimal" value={expense} onChange={(event) => setExpense(event.target.value)} />
            </Field>
            <Field label="Looptijd (maanden)">
              <input type="number" min={1} max={600} value={months} onChange={(event) => setMonths(event.target.value)} />
            </Field>
          </div>
          {formError && <ErrorBanner message={formError} />}
          <div className="form-actions">
            <Button type="submit">Scenario toevoegen</Button>
          </div>
        </form>
        {data.budgetScenarios.length > 0 && (
          <div className="list">
            {data.budgetScenarios.map((s) => {
              const outcome = scenarioOutcome(s);
              return (
                <div className="list-item" key={s.id}>
                  <div>
                    <p className="item-title">{s.name}</p>
                    <p className="item-subtitle">
                      Over per maand {formatEuros(outcome.monthlySavingsCents)} · na {s.months} maanden {formatEuros(outcome.totalCents)}
                      {outcome.savingsRatePct !== null && <> · spaarquote {outcome.savingsRatePct.toLocaleString('nl-NL')}%</>}
                    </p>
                  </div>
                  <ConfirmAction label={`Scenario ${s.name} verwijderen`} confirmMessage="Dit scenario verwijderen?" onConfirm={() => void run((db) => db.remove('budgetScenarios', s.id))}>
                    Verwijderen
                  </ConfirmAction>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

// ——— Investment Plan ———

const PLAN_SCOPE_NOTE =
  'Het Investment Plan is je strategie: doelen, horizon, gewenste allocatie, risicoprofiel en inlegplan. Je werkelijke portefeuille, transacties, waardes en rendementen staan niet hier maar in Samen Thuis.';

interface AllocationRow {
  assetClass: string;
  targetPct: string;
}

function PlanEditor({ plan, run, onDone }: { plan?: InvestmentPlan; run: Run; onDone: (id?: string) => void }) {
  const [name, setName] = useState(plan?.name ?? '');
  const [status, setStatus] = useState<PlanStatus>(plan?.status ?? 'concept');
  const [goal, setGoal] = useState(plan?.goal ?? '');
  const [strategy, setStrategy] = useState(plan?.strategy ?? '');
  const [principles, setPrinciples] = useState(plan?.principles ?? '');
  const [target, setTarget] = useState(plan?.targetCents !== null && plan?.targetCents !== undefined ? centsToInput(plan.targetCents) : '');
  const [horizon, setHorizon] = useState(String(plan?.horizonYear ?? Number(todayKey().slice(0, 4)) + 10));
  const [risk, setRisk] = useState<RiskProfile>(plan?.riskProfile ?? 'neutraal');
  const [rows, setRows] = useState<AllocationRow[]>(plan?.allocation.map((a) => ({ assetClass: a.assetClass, targetPct: String(a.targetPct) })) ?? [{ assetClass: '', targetPct: '' }]);
  const [contribution, setContribution] = useState(plan ? centsToInput(plan.contributionCents) : '');
  const [frequency, setFrequency] = useState<Frequency>(plan?.frequency ?? 'maand');
  const [startDate, setStartDate] = useState(plan?.startDate ?? todayKey());
  const [formError, setFormError] = useState('');
  const allocation: AllocationItem[] = rows.filter((r) => r.assetClass.trim() || r.targetPct).map((r) => ({ assetClass: r.assetClass.trim(), targetPct: Number(r.targetPct) }));
  const sum = allocationTotal(allocation.filter((a) => Number.isFinite(a.targetPct)));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError('');
    try {
      const now = nowIso();
      const next: InvestmentPlan = {
        id: plan?.id ?? newId(),
        name: name.trim(),
        status,
        goal: goal.trim(),
        strategy: strategy.trim(),
        principles: principles.trim(),
        targetCents: target.trim() ? parseEuros(target) : null,
        horizonYear: Number(horizon),
        riskProfile: risk,
        allocation,
        contributionCents: contribution.trim() ? parseEuros(contribution) : 0,
        frequency,
        startDate,
        createdAt: plan?.createdAt ?? now,
        updatedAt: now
      };
      validateInvestmentPlan(next);
      if (await run((db) => db.put('investmentPlans', next))) onDone(next.id);
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Het plan bevat ongeldige gegevens.');
    }
  }

  return (
    <Card title={plan ? 'Plan aanpassen' : 'Nieuw plan'}>
      <form className="stack" noValidate onSubmit={(event) => void submit(event)}>
        <div className="form-grid">
          <Field label="Naam van het plan">
            <input value={name} maxLength={200} onChange={(event) => setName(event.target.value)} />
          </Field>
          <Field label="Status">
            <select value={status} onChange={(event) => setStatus(event.target.value as PlanStatus)}>
              {PLAN_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Risicoprofiel">
            <select value={risk} onChange={(event) => setRisk(event.target.value as RiskProfile)}>
              {RISK_PROFILES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </Field>
          <Field label="Horizon (jaar)">
            <input type="number" min={2000} max={2200} value={horizon} onChange={(event) => setHorizon(event.target.value)} />
          </Field>
          <Field label="Doelbedrag (€)" hint="Optioneel">
            <input inputMode="decimal" value={target} onChange={(event) => setTarget(event.target.value)} />
          </Field>
        </div>
        <Field label="Financieel doel">
          <input value={goal} onChange={(event) => setGoal(event.target.value)} />
        </Field>
        <Field label="Beleggingsstrategie">
          <textarea value={strategy} onChange={(event) => setStrategy(event.target.value)} />
        </Field>
        <Field label="Uitgangspunten">
          <textarea value={principles} onChange={(event) => setPrinciples(event.target.value)} />
        </Field>
        <fieldset className="plain-fieldset">
          <legend>Gewenste assetallocatie (samen 100 %)</legend>
          <div className="stack">
            {rows.map((row, index) => (
              <div className="form-grid" key={index}>
                <Field label={`Categorie ${index + 1}`}>
                  <input value={row.assetClass} onChange={(event) => setRows((current) => current.map((r, i) => (i === index ? { ...r, assetClass: event.target.value } : r)))} placeholder="Bijvoorbeeld Aandelen wereldwijd" />
                </Field>
                <Field label={`Percentage ${index + 1}`}>
                  <input type="number" min={0} max={100} value={row.targetPct} onChange={(event) => setRows((current) => current.map((r, i) => (i === index ? { ...r, targetPct: event.target.value } : r)))} />
                </Field>
              </div>
            ))}
            <div className="row" style={{ justifyContent: 'flex-start' }}>
              <button type="button" className="text-button" onClick={() => setRows((current) => [...current, { assetClass: '', targetPct: '' }])}>＋ Categorie</button>
              {rows.length > 1 && <button type="button" className="text-button" onClick={() => setRows((current) => current.slice(0, -1))}>Laatste weghalen</button>}
              <StatusPill tone={sum === 100 || allocation.length === 0 ? 'good' : 'warning'}>Totaal {sum}%</StatusPill>
            </div>
          </div>
        </fieldset>
        <div className="form-grid">
          <Field label="Gepland inlegbedrag (€)">
            <input inputMode="decimal" value={contribution} onChange={(event) => setContribution(event.target.value)} />
          </Field>
          <Field label="Frequentie">
            <select value={frequency} onChange={(event) => setFrequency(event.target.value as Frequency)}>
              {FREQUENCIES.map((f) => <option key={f} value={f}>{FREQ_LABEL[f]}</option>)}
            </select>
          </Field>
          <Field label="Start inlegplan">
            <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          </Field>
        </div>
        {formError && <ErrorBanner message={formError} />}
        <div className="form-actions">
          <Button type="button" variant="secondary" onClick={() => onDone()}>Annuleren</Button>
          <Button type="submit">Plan opslaan</Button>
        </div>
      </form>
    </Card>
  );
}

function PlansPage({ data, run }: { data: Data; run: Run }) {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  return (
    <div className="stack">
      <PageHeader eyebrow="Financiën" title="Investment Plan" description={PLAN_SCOPE_NOTE} action={params.get('nieuw') !== '1' && <Button onClick={() => setParams({ nieuw: '1' })}>＋ Plan</Button>} />
      {params.get('nieuw') === '1' && <PlanEditor run={run} onDone={(id) => (id ? navigate(`/beleggingsplan/${id}`) : setParams({}))} />}
      {data.plans.length ? (
        <Card>
          <div className="list">
            {data.plans.map((plan) => {
              const evaluation = latestEvaluation(data.notes, plan.id);
              return (
                <div className="list-item" key={plan.id}>
                  <div>
                    <p className="item-title"><Link to={`/beleggingsplan/${plan.id}`}>{plan.name}</Link></p>
                    <p className="item-subtitle">{plan.riskProfile} · horizon {plan.horizonYear} · inleg {formatEuros(plan.contributionCents)} {FREQ_LABEL[plan.frequency]}</p>
                  </div>
                  <div className="row">
                    <StatusPill>{plan.status}</StatusPill>
                    {evaluation?.onTrack && <StatusPill tone={evaluation.onTrack === 'achter' ? 'warning' : 'good'}>{evaluation.onTrack}</StatusPill>}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      ) : (
        <Card>
          <EmptyState title="Nog geen plan">Leg je beleggingsstrategie vast: doel, horizon, risicoprofiel, gewenste allocatie en inlegplan.</EmptyState>
        </Card>
      )}
    </div>
  );
}

function PlanDetailPage({ data, run }: { data: Data; run: Run }) {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const plan = data.plans.find((p) => p.id === id);
  if (!plan) {
    return (
      <Card>
        <EmptyState title={UNAVAILABLE}>Dit plan bestaat niet (meer). <Link to="/beleggingsplan">Terug</Link></EmptyState>
      </Card>
    );
  }
  const today = todayKey();
  const scenarios = data.scenarios.filter((s) => s.planId === plan.id);
  const notes = data.notes.filter((n) => n.planId === plan.id);
  const evaluation = latestEvaluation(data.notes, plan.id);

  return (
    <div className="stack">
      <PageHeader eyebrow="Investment Plan" title={plan.name} description={PLAN_SCOPE_NOTE} action={<Button variant="secondary" onClick={() => setEditing((v) => !v)}>{editing ? 'Sluiten' : 'Aanpassen'}</Button>} />
      {editing && <PlanEditor plan={plan} run={run} onDone={() => setEditing(false)} />}
      <div className="grid grid-4">
        <Metric label="Status" value={plan.status} note={plan.riskProfile} />
        <Metric label="Horizon" value={String(plan.horizonYear)} note={`Nog ${yearsToHorizon(plan, today)} jaar`} />
        <Metric label="Geplande inleg per jaar" value={formatEuros(plannedYearlyContribution(plan))} note={`${formatEuros(plan.contributionCents)} ${FREQ_LABEL[plan.frequency]} vanaf ${formatDate(plan.startDate)}`} />
        <Metric label="Voortgang" value={evaluation?.onTrack ?? '—'} note={evaluation ? `Evaluatie ${formatDate(evaluation.date)}` : 'Nog niet geëvalueerd'} />
      </div>
      <div className="grid grid-2">
        <Card title="Doel en strategie">
          <p><strong>Doel:</strong> {plan.goal || '—'}{plan.targetCents !== null && <> ({formatEuros(plan.targetCents)})</>}</p>
          <p><strong>Strategie:</strong> {plan.strategy || '—'}</p>
          <p><strong>Uitgangspunten:</strong> {plan.principles || '—'}</p>
        </Card>
        <Card title="Gewenste allocatie">
          {plan.allocation.length ? (
            <div className="list">
              {plan.allocation.map((a) => (
                <div className="list-item" key={a.assetClass}>
                  <p className="item-title">{a.assetClass}</p>
                  <div className="row">
                    <progress max={100} value={a.targetPct} aria-label={`${a.assetClass} ${a.targetPct}%`} />
                    <span>{a.targetPct}%</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="item-subtitle">Nog geen allocatie vastgelegd.</p>
          )}
        </Card>
      </div>
      <ScenarioCard plan={plan} scenarios={scenarios} run={run} />
      <NotesCard plan={plan} notes={notes} run={run} />
      <Card>
        <ConfirmAction
          label={`Plan ${plan.name} verwijderen`}
          confirmMessage="Dit plan verwijderen? Scenario's en notities blijven bewaard maar tonen het plan als 'Niet meer beschikbaar'. Dit kan niet ongedaan worden gemaakt."
          onConfirm={() => void run((db) => db.remove('investmentPlans', plan.id)).then((ok) => ok && navigate('/beleggingsplan'))}
        >
          Plan verwijderen
        </ConfirmAction>
      </Card>
    </div>
  );
}

function ScenarioCard({ plan, scenarios, run }: { plan: InvestmentPlan; scenarios: InvestmentScenario[]; run: Run }) {
  const [name, setName] = useState('');
  const [returnPct, setReturnPct] = useState('');
  const [start, setStart] = useState('0');
  const [contribution, setContribution] = useState(centsToInput(plan.contributionCents));
  const [years, setYears] = useState(String(Math.max(1, plan.horizonYear - Number(todayKey().slice(0, 4)))));
  const [selected, setSelected] = useState<string>('');
  const [formError, setFormError] = useState('');
  const shown = scenarios.find((s) => s.id === selected) ?? scenarios[0];
  const projection = shown ? projectScenario(shown) : [];

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError('');
    try {
      const pct = Number(returnPct.replace(',', '.'));
      if (!returnPct.trim() || !Number.isFinite(pct)) throw new Error('Vul een aangenomen rendement in, bijvoorbeeld 4,5.');
      const now = nowIso();
      const scenario: InvestmentScenario = {
        id: newId(),
        planId: plan.id,
        name: name.trim(),
        assumedReturnTenths: Math.round(pct * 10),
        startCents: parseEuros(start),
        contributionCents: parseEuros(contribution),
        frequency: plan.frequency,
        years: Number(years),
        createdAt: now,
        updatedAt: now
      };
      validateInvestmentScenario(scenario);
      if (await run((db) => db.put('investmentScenarios', scenario))) {
        setSelected(scenario.id);
        setName('');
        setReturnPct('');
      }
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Ongeldig scenario.');
    }
  }

  return (
    <Card title="Scenarioanalyse">
      <p className="item-subtitle">Een rekenvoorbeeld met jouw eigen aannames. Geen voorspelling, geen koersen en geen werkelijke waarde.</p>
      <form className="stack" noValidate onSubmit={(event) => void submit(event)}>
        <div className="form-grid">
          <Field label="Naam scenario">
            <input value={name} maxLength={200} onChange={(event) => setName(event.target.value)} placeholder="Bijvoorbeeld Voorzichtig" />
          </Field>
          <Field label="Aangenomen rendement per jaar (%)">
            <input inputMode="decimal" value={returnPct} onChange={(event) => setReturnPct(event.target.value)} />
          </Field>
          <Field label="Aangenomen startbedrag (€)">
            <input inputMode="decimal" value={start} onChange={(event) => setStart(event.target.value)} />
          </Field>
          <Field label={`Inleg ${FREQ_LABEL[plan.frequency]} (€)`}>
            <input inputMode="decimal" value={contribution} onChange={(event) => setContribution(event.target.value)} />
          </Field>
          <Field label="Looptijd (jaar)">
            <input type="number" min={1} max={80} value={years} onChange={(event) => setYears(event.target.value)} />
          </Field>
        </div>
        {formError && <ErrorBanner message={formError} />}
        <div className="form-actions">
          <Button type="submit">Scenario doorrekenen</Button>
        </div>
      </form>
      {scenarios.length > 0 && shown && (
        <div className="stack">
          <Field label="Toon scenario">
            <select value={shown.id} onChange={(event) => setSelected(event.target.value)}>
              {scenarios.map((s) => <option key={s.id} value={s.id}>{s.name} ({(s.assumedReturnTenths / 10).toLocaleString('nl-NL')}% aangenomen)</option>)}
            </select>
          </Field>
          <LineChart title={`Scenario ${shown.name}: rekenwaarde per jaar`} unit=" €" points={projection.map((r) => ({ label: String(r.year), value: Math.round(r.valueCents / 100) }))} />
          <p className="item-subtitle">
            Na {shown.years} jaar: rekenwaarde {formatEuros(projection[projection.length - 1]!.valueCents)} bij een totale inleg van {formatEuros(projection[projection.length - 1]!.contributedCents)}.
            {plan.targetCents !== null && <> Doelbedrag {formatEuros(plan.targetCents)}: {projection[projection.length - 1]!.valueCents >= plan.targetCents ? 'gehaald in dit scenario' : 'niet gehaald in dit scenario'}.</>}
          </p>
          <ConfirmAction label={`Scenario ${shown.name} verwijderen`} confirmMessage="Dit scenario verwijderen?" onConfirm={() => void run((db) => db.remove('investmentScenarios', shown.id))}>
            Scenario verwijderen
          </ConfirmAction>
        </div>
      )}
    </Card>
  );
}

function NotesCard({ plan, notes, run }: { plan: InvestmentPlan; notes: PlanNote[]; run: Run }) {
  const [kind, setKind] = useState<NoteKind>('evaluatie');
  const [date, setDate] = useState(todayKey());
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [onTrack, setOnTrack] = useState<OnTrack | ''>('op koers');
  const [formError, setFormError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError('');
    try {
      const now = nowIso();
      const note: PlanNote = { id: newId(), planId: plan.id, kind, date, title: title.trim(), text: text.trim(), onTrack: kind === 'evaluatie' && onTrack ? onTrack : null, createdAt: now, updatedAt: now };
      validatePlanNote(note);
      if (await run((db) => db.put('planNotes', note))) {
        setTitle('');
        setText('');
      }
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Ongeldige notitie.');
    }
  }

  return (
    <Card title="Beslissingen en evaluaties">
      <form className="stack" noValidate onSubmit={(event) => void submit(event)}>
        <div className="form-grid">
          <Field label="Soort notitie">
            <select value={kind} onChange={(event) => setKind(event.target.value as NoteKind)}>
              {NOTE_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </Field>
          <Field label="Datum">
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </Field>
          <Field label="Onderwerp">
            <input value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} />
          </Field>
          {kind === 'evaluatie' && (
            <Field label="Hoe staat het plan ervoor?">
              <select value={onTrack} onChange={(event) => setOnTrack(event.target.value as OnTrack | '')}>
                <option value="">Geen oordeel</option>
                {ON_TRACK.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </Field>
          )}
        </div>
        <Field label="Toelichting">
          <textarea value={text} onChange={(event) => setText(event.target.value)} />
        </Field>
        {formError && <ErrorBanner message={formError} />}
        <div className="form-actions">
          <Button type="submit">Notitie opslaan</Button>
        </div>
      </form>
      {notes.length > 0 && (
        <div className="list">
          {notes.map((note) => (
            <div className="list-item" key={note.id}>
              <div>
                <p className="item-title">{note.title}</p>
                <p className="item-subtitle">{note.kind} · {formatDate(note.date)}{note.text && <> · {note.text}</>}</p>
              </div>
              <div className="row">
                {note.onTrack && <StatusPill tone={note.onTrack === 'achter' ? 'warning' : 'good'}>{note.onTrack}</StatusPill>}
                <ConfirmAction label={`Notitie ${note.title} verwijderen`} confirmMessage="Deze notitie verwijderen?" onConfirm={() => void run((db) => db.remove('planNotes', note.id))}>
                  Verwijderen
                </ConfirmAction>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ——— Categorieën en inkomstenbronnen ———

function SettingsPage({ data, run }: { data: Data; run: Run }) {
  const [catName, setCatName] = useState('');
  const [catDirection, setCatDirection] = useState<Direction>('out');
  const [srcName, setSrcName] = useState('');
  const [srcType, setSrcType] = useState<IncomeType>('loon');
  const [formError, setFormError] = useState('');

  async function addCategory(event: FormEvent) {
    event.preventDefault();
    setFormError('');
    try {
      const now = nowIso();
      const category: Category = { id: newId(), name: catName.trim(), direction: catDirection, parentId: null, archived: false, createdAt: now, updatedAt: now };
      validateCategory(category);
      if (data.categories.some((c) => c.direction === catDirection && c.name.toLocaleLowerCase('nl-NL') === category.name.toLocaleLowerCase('nl-NL'))) throw new Error('Deze categorie bestaat al.');
      if (await run((db) => db.put('categories', category))) setCatName('');
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Ongeldige categorie.');
    }
  }

  async function addSource(event: FormEvent) {
    event.preventDefault();
    setFormError('');
    try {
      const now = nowIso();
      const source: IncomeSource = { id: newId(), name: srcName.trim(), type: srcType, archived: false, createdAt: now, updatedAt: now };
      validateIncomeSource(source);
      if (await run((db) => db.put('incomeSources', source))) setSrcName('');
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Ongeldige inkomstenbron.');
    }
  }

  return (
    <div className="stack">
      <PageHeader eyebrow="Financiën" title="Categorieën" description="Categorieën en inkomstenbronnen. Archiveren laat oude transacties ongemoeid." />
      {formError && <ErrorBanner message={formError} />}
      <div className="grid grid-2">
        <Card title="Categorieën">
          <form className="stack" noValidate onSubmit={(event) => void addCategory(event)}>
            <div className="form-grid">
              <Field label="Nieuwe categorie">
                <input value={catName} maxLength={200} onChange={(event) => setCatName(event.target.value)} />
              </Field>
              <Field label="Voor">
                <select value={catDirection} onChange={(event) => setCatDirection(event.target.value as Direction)}>
                  <option value="out">Uitgaven</option>
                  <option value="in">Inkomsten</option>
                </select>
              </Field>
            </div>
            <div className="form-actions">
              <Button type="submit">Categorie toevoegen</Button>
            </div>
          </form>
          <div className="list">
            {data.categories.map((c) => (
              <div className="list-item" key={c.id}>
                <p className="item-title">{c.name}{c.archived && ' (gearchiveerd)'}</p>
                <div className="row">
                  <StatusPill>{c.direction === 'in' ? 'inkomsten' : 'uitgaven'}</StatusPill>
                  <button type="button" className="text-button" onClick={() => void run((db) => db.put('categories', { ...c, archived: !c.archived, updatedAt: nowIso() }))}>{c.archived ? 'Terugzetten' : 'Archiveren'}</button>
                </div>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Inkomstenbronnen">
          <form className="stack" noValidate onSubmit={(event) => void addSource(event)}>
            <div className="form-grid">
              <Field label="Nieuwe bron">
                <input value={srcName} maxLength={200} onChange={(event) => setSrcName(event.target.value)} />
              </Field>
              <Field label="Type">
                <select value={srcType} onChange={(event) => setSrcType(event.target.value as IncomeType)}>
                  {INCOME_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
            </div>
            <div className="form-actions">
              <Button type="submit">Bron toevoegen</Button>
            </div>
          </form>
          <div className="list">
            {data.sources.map((s) => (
              <div className="list-item" key={s.id}>
                <p className="item-title">{s.name}{s.archived && ' (gearchiveerd)'}</p>
                <div className="row">
                  <StatusPill>{s.type}</StatusPill>
                  <button type="button" className="text-button" onClick={() => void run((db) => db.put('incomeSources', { ...s, archived: !s.archived, updatedAt: nowIso() }))}>{s.archived ? 'Terugzetten' : 'Archiveren'}</button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
