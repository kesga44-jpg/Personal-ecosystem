import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { newId, type EcosystemModuleLink } from '@ecosystem/core';
import { Button, Card, ConfirmAction, EmptyState, ErrorBanner, Field, PageHeader, StatusPill } from '@ecosystem/ui';
import { MEALS, isMeal, mealLabels, parseNumber, validateFoodEntry, type FoodEntry, type Meal } from './domain';
import { copyMeal, dayTotals, entryFromPlanned, mealName, mealNutrition, mealsOfPlan, moveMeal, planDates, recipeFromMeal, repeatDay, shoppingList, shoppingText, targetCheck, type Library } from './mealplan';
import { validatePlan, validatePlannedMeal, type NutritionPlan, type PlanTargets, type PlannedMeal } from './planner';
import { UNITS, unitLabels, validateRecipe, validateRecipeIngredient, type Unit } from './recipes';
import type { Run } from './RecipePages';
import type { LocalDatabase } from '@ecosystem/storage';
import { GoalLinks } from '../GoalLinks';

export interface PlannerData extends Library {
  plans: NutritionPlan[];
  meals: PlannedMeal[];
  entries: FoodEntry[];
}

const UNAVAILABLE = 'Niet meer beschikbaar';
const TARGET_LABELS: Record<keyof PlanTargets, string> = { kcal: 'Energie', protein: 'Eiwit', carbs: 'Koolhydraten', fat: 'Vet' };

function todayKey(): string {
  const date = new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function formatDay(date: string): string {
  return new Intl.DateTimeFormat('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(`${date}T12:00:00`));
}

function fmt(value: number, unit: string): string {
  return `${value.toLocaleString('nl-NL', { maximumFractionDigits: 1 })} ${unit}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function parseTarget(raw: string): number | null {
  const value = parseNumber(raw);
  if (Number.isNaN(value)) throw new Error('Doelen moeten hele getallen zijn.');
  return value === null ? null : Math.round(value);
}

// ——— Overzicht en nieuw plan ———

function PlanForm({ plan, run, onDone }: { plan?: NutritionPlan; run: Run; onDone: (id?: string) => void }) {
  const today = todayKey();
  const [name, setName] = useState(plan?.name ?? '');
  const [from, setFrom] = useState(plan?.from ?? today);
  const [to, setTo] = useState(plan?.to ?? addDays(today, 6));
  const [kcal, setKcal] = useState(plan?.targets.kcal ? String(plan.targets.kcal) : '');
  const [protein, setProtein] = useState(plan?.targets.protein ? String(plan.targets.protein) : '');
  const [carbs, setCarbs] = useState(plan?.targets.carbs ? String(plan.targets.carbs) : '');
  const [fat, setFat] = useState(plan?.targets.fat ? String(plan.targets.fat) : '');
  const [mealsPerDay, setMealsPerDay] = useState(String(plan?.mealsPerDay ?? 3));
  const [formError, setFormError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError('');
    try {
      const now = nowIso();
      const next: NutritionPlan = {
        id: plan?.id ?? newId(),
        name: name.trim(),
        from,
        to,
        targets: { kcal: parseTarget(kcal), protein: parseTarget(protein), carbs: parseTarget(carbs), fat: parseTarget(fat) },
        mealsPerDay: Number(mealsPerDay),
        status: plan?.status ?? 'concept',
        generated: plan?.generated ?? false,
        createdAt: plan?.createdAt ?? now,
        updatedAt: now
      };
      validatePlan(next);
      if (await run((db) => db.put('nutritionPlans', next))) onDone(next.id);
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Het plan bevat ongeldige gegevens.');
    }
  }

  return (
    <Card title={plan ? 'Plan aanpassen' : 'Nieuw voedingsplan'}>
      <form className="stack" noValidate onSubmit={(event) => void submit(event)}>
        <div className="form-grid">
          <Field label="Naam van het plan"><input maxLength={120} value={name} onChange={(event) => setName(event.target.value)} /></Field>
          <Field label="Van"><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></Field>
          <Field label="Tot en met"><input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></Field>
          <Field label="Maaltijden per dag"><input type="number" min={1} max={8} value={mealsPerDay} onChange={(event) => setMealsPerDay(event.target.value)} /></Field>
          <Field label="Doel energie (kcal per dag)" hint="Optioneel"><input inputMode="numeric" value={kcal} onChange={(event) => setKcal(event.target.value)} /></Field>
          <Field label="Doel eiwit (g per dag)" hint="Optioneel"><input inputMode="numeric" value={protein} onChange={(event) => setProtein(event.target.value)} /></Field>
          <Field label="Doel koolhydraten (g per dag)" hint="Optioneel"><input inputMode="numeric" value={carbs} onChange={(event) => setCarbs(event.target.value)} /></Field>
          <Field label="Doel vet (g per dag)" hint="Optioneel"><input inputMode="numeric" value={fat} onChange={(event) => setFat(event.target.value)} /></Field>
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

export function PlansPage({ data, run }: { data: PlannerData; run: Run }) {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const plans = [...data.plans].sort((a, b) => b.from.localeCompare(a.from));
  return (
    <div className="stack">
      <PageHeader
        eyebrow="Voeding"
        title="Planning"
        description="Je persoonlijke maaltijdplanning met eigen doelen en porties. Het gedeelde weekmenu en opgeslagen boodschappenlijsten staan in Samen Thuis."
        action={params.get('nieuw') !== '1' && <div className="row"><Link className="button button-secondary" to="/planning/automatisch">Automatisch plannen</Link><Button onClick={() => setParams({ nieuw: '1' })}>＋ Plan</Button></div>}
      />
      {params.get('nieuw') === '1' && <PlanForm run={run} onDone={(id) => (id ? navigate(`/planning/${id}`) : setParams({}))} />}
      <Card>
        {plans.length ? (
          <div className="list">
            {plans.map((plan) => (
              <div className="list-item" key={plan.id}>
                <div>
                  <p className="item-title"><Link to={`/planning/${plan.id}`}>{plan.name}</Link></p>
                  <p className="item-subtitle">{formatDay(plan.from)} t/m {formatDay(plan.to)} · {mealsOfPlan(plan.id, data.meals).length} maaltijden</p>
                </div>
                <StatusPill tone={plan.status === 'bevestigd' ? 'good' : 'neutral'}>{plan.status}</StatusPill>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="Nog geen plan">Maak een plan voor een week of een andere periode en vul de dagen met recepten of losse ingrediënten.</EmptyState>
        )}
      </Card>
    </div>
  );
}

// ——— Plan met dagen ———

function AddMealForm({ plan, date, data, run }: { plan: NutritionPlan; date: string; data: PlannerData; run: Run }) {
  const [slot, setSlot] = useState<Meal>('ontbijt');
  const [source, setSource] = useState<'recept' | 'los'>(data.recipes.length ? 'recept' : 'los');
  const [recipeId, setRecipeId] = useState('');
  const [servings, setServings] = useState('1');
  const [productId, setProductId] = useState('');
  const [amount, setAmount] = useState('');
  const [unit, setUnit] = useState<Unit>('g');
  const [note, setNote] = useState('');
  const [formError, setFormError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError('');
    try {
      const count = parseNumber(servings);
      const value = parseNumber(amount);
      if (count === null || Number.isNaN(count)) throw new Error('Vul het aantal porties in.');
      if (source === 'los' && (value === null || Number.isNaN(value))) throw new Error('Vul een hoeveelheid in.');
      const now = nowIso();
      const meal: PlannedMeal = {
        id: newId(),
        planId: plan.id,
        date,
        meal: slot,
        servings: count,
        recipeId: source === 'recept' ? recipeId || null : null,
        items: source === 'los' ? [{ productId, amount: value as number, unit }] : [],
        note: note.trim(),
        createdAt: now,
        updatedAt: now
      };
      if (source === 'recept' && !recipeId) throw new Error('Kies een recept.');
      if (source === 'los' && !productId) throw new Error('Kies een ingrediënt.');
      validatePlannedMeal(meal);
      if (await run((db) => db.put('plannedMeals', meal))) {
        setAmount('');
        setNote('');
      }
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Ongeldige maaltijd.');
    }
  }

  return (
    <form className="stack" noValidate onSubmit={(event) => void submit(event)}>
      <div className="form-grid">
        <Field label="Maaltijdmoment">
          <select value={slot} onChange={(event) => isMeal(event.target.value) && setSlot(event.target.value)}>
            {MEALS.map((item) => <option key={item} value={item}>{mealLabels[item]}</option>)}
          </select>
        </Field>
        <Field label="Uit">
          <select value={source} onChange={(event) => setSource(event.target.value as 'recept' | 'los')}>
            <option value="recept">Recept</option>
            <option value="los">Losse ingrediënten</option>
          </select>
        </Field>
        {source === 'recept' ? (
          <Field label="Recept">
            <select value={recipeId} onChange={(event) => setRecipeId(event.target.value)}>
              <option value="">Kies een recept</option>
              {data.recipes.map((recipe) => <option key={recipe.id} value={recipe.id}>{recipe.name}</option>)}
            </select>
          </Field>
        ) : (
          <>
            <Field label="Ingrediënt">
              <select value={productId} onChange={(event) => setProductId(event.target.value)}>
                <option value="">Kies uit je bibliotheek</option>
                {data.products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
              </select>
            </Field>
            <Field label="Hoeveelheid"><input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} /></Field>
            <Field label="Eenheid">
              <select value={unit} onChange={(event) => setUnit(event.target.value as Unit)}>
                {UNITS.map((item) => <option key={item} value={item}>{unitLabels[item]}</option>)}
              </select>
            </Field>
          </>
        )}
        <Field label="Porties"><input inputMode="decimal" value={servings} onChange={(event) => setServings(event.target.value)} /></Field>
        <Field label="Notitie" hint="Optioneel"><input maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} /></Field>
      </div>
      {formError && <ErrorBanner message={formError} />}
      <div className="form-actions"><Button type="submit">Maaltijd plannen</Button></div>
    </form>
  );
}

function MealRow({ meal, plan, data, run }: { meal: PlannedMeal; plan: NutritionPlan; data: PlannerData; run: Run }) {
  const [mode, setMode] = useState<'' | 'verplaatsen' | 'kopieren' | 'gegeten' | 'recept'>('');
  const [date, setDate] = useState(meal.date);
  const [slot, setSlot] = useState<Meal>(meal.meal);
  const [servings, setServings] = useState(String(meal.servings).replace('.', ','));
  const [recipeName, setRecipeName] = useState('');
  const [formError, setFormError] = useState('');
  const nutrition = mealNutrition(meal, data);
  const eaten = data.entries.some((entry) => (entry as FoodEntry & { plannedMealId?: string }).plannedMealId === meal.id);
  const name = mealName(meal, data);

  async function act(event: FormEvent) {
    event.preventDefault();
    setFormError('');
    try {
      if (mode === 'verplaatsen') {
        const next = moveMeal(meal, date, slot);
        if (await run((db) => db.put('plannedMeals', next))) setMode('');
      } else if (mode === 'kopieren') {
        const next = copyMeal(meal, newId(), date, slot);
        if (await run((db) => db.put('plannedMeals', next))) setMode('');
      } else if (mode === 'gegeten') {
        const count = parseNumber(servings);
        if (count === null || Number.isNaN(count)) throw new Error('Vul het aantal porties in.');
        const entry = entryFromPlanned(meal, data, { id: newId(), date: meal.date, servings: count });
        validateFoodEntry(entry, todayKey());
        if (await run((db) => db.put('entries', entry))) setMode('');
      } else if (mode === 'recept') {
        const { recipe, lines } = recipeFromMeal(meal, recipeName, { recipe: newId(), line: newId });
        validateRecipe(recipe);
        for (const line of lines) validateRecipeIngredient(line);
        const updated: PlannedMeal = { ...meal, recipeId: recipe.id, items: [], updatedAt: nowIso() };
        validatePlannedMeal(updated);
        if (
          await run(async (db) => {
            await db.put('recipes', recipe);
            for (const line of lines) await db.put('recipeIngredients', line);
            await db.put('plannedMeals', updated);
          })
        )
          setMode('');
      }
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Dat is niet gelukt.');
    }
  }

  async function changeServings(raw: string) {
    const count = parseNumber(raw);
    if (count === null || Number.isNaN(count) || count <= 0) return;
    const next = { ...meal, servings: count, updatedAt: nowIso() };
    validatePlannedMeal(next);
    await run((db) => db.put('plannedMeals', next));
  }

  return (
    <div className="list-item" style={{ flexWrap: 'wrap' }}>
      <div>
        <p className="item-title">
          {mealLabels[meal.meal]}: {meal.recipeId ? <Link to={`/recepten/${meal.recipeId}`}>{name}</Link> : name}
        </p>
        <p className="item-subtitle">
          {meal.servings.toLocaleString('nl-NL')} {meal.servings === 1 ? 'portie' : 'porties'} · {fmt(nutrition.total.kcal, 'kcal')} · eiwit {fmt(nutrition.total.protein, 'g')}
          {nutrition.problems.length > 0 && <> · <strong>{nutrition.problems[0]}</strong></>}
          {eaten && <> · <strong>gegeten</strong></>}
        </p>
      </div>
      <div className="row">
        <label className="visually-hidden" htmlFor={`porties-${meal.id}`}>Porties van {name} op {meal.date}</label>
        <input id={`porties-${meal.id}`} style={{ width: '4.5rem' }} inputMode="decimal" defaultValue={String(meal.servings).replace('.', ',')} onBlur={(event) => void changeServings(event.target.value)} />
        <select aria-label={`Actie voor ${name}`} value={mode} onChange={(event) => setMode(event.target.value as typeof mode)}>
          <option value="">Meer…</option>
          <option value="verplaatsen">Verplaatsen</option>
          <option value="kopieren">Kopiëren</option>
          <option value="gegeten">Als gegeten registreren</option>
          {!meal.recipeId && <option value="recept">Opslaan als recept</option>}
        </select>
        <ConfirmAction label={`${name} uit de planning halen`} confirmMessage="Deze maaltijd uit de planning halen?" onConfirm={() => void run((db) => db.remove('plannedMeals', meal.id))}>Weghalen</ConfirmAction>
      </div>
      {mode && (
        <form className="stack" style={{ width: '100%' }} noValidate onSubmit={(event) => void act(event)}>
          <div className="form-grid">
            {(mode === 'verplaatsen' || mode === 'kopieren') && (
              <>
                <Field label="Naar dag">
                  <select value={date} onChange={(event) => setDate(event.target.value)}>
                    {planDates(plan).map((day) => <option key={day} value={day}>{formatDay(day)}</option>)}
                  </select>
                </Field>
                <Field label="Naar moment">
                  <select value={slot} onChange={(event) => isMeal(event.target.value) && setSlot(event.target.value)}>
                    {MEALS.map((item) => <option key={item} value={item}>{mealLabels[item]}</option>)}
                  </select>
                </Field>
              </>
            )}
            {mode === 'gegeten' && <Field label="Gegeten porties" hint="Standaard de geplande hoeveelheid"><input inputMode="decimal" value={servings} onChange={(event) => setServings(event.target.value)} /></Field>}
            {mode === 'recept' && <Field label="Naam van het nieuwe recept"><input maxLength={120} value={recipeName} onChange={(event) => setRecipeName(event.target.value)} /></Field>}
          </div>
          {formError && <ErrorBanner message={formError} />}
          <div className="form-actions">
            <Button type="button" variant="secondary" onClick={() => setMode('')}>Annuleren</Button>
            <Button type="submit">{{ verplaatsen: 'Verplaatsen', kopieren: 'Kopiëren', gegeten: 'Registreren', recept: 'Recept opslaan' }[mode]}</Button>
          </div>
        </form>
      )}
    </div>
  );
}

export function PlanPage({ data, run, database }: { data: PlannerData; run: Run; database: LocalDatabase | null }) {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [editing, setEditing] = useState(false);
  const [repeatTo, setRepeatTo] = useState('');
  const [repeatError, setRepeatError] = useState('');
  const plan = data.plans.find((item) => item.id === id);
  if (!plan) return <Card><EmptyState title={UNAVAILABLE}>Dit plan bestaat niet (meer). <Link to="/planning">Naar de planning</Link></EmptyState></Card>;
  const dates = planDates(plan);
  const selected = dates.includes(params.get('dag') ?? '') ? (params.get('dag') as string) : dates.includes(todayKey()) ? todayKey() : dates[0]!;
  const meals = mealsOfPlan(plan.id, data.meals);
  const totals = dayTotals(plan, data.meals, data);
  const dayMeals = meals.filter((meal) => meal.date === selected);
  const day = totals.find((item) => item.date === selected)!;
  const planDays = totals.filter((item) => item.meals > 0);
  const average = planDays.length ? { kcal: Math.round(planDays.reduce((sum, item) => sum + item.total.kcal, 0) / planDays.length), protein: Math.round(planDays.reduce((sum, item) => sum + item.total.protein, 0) / planDays.length) } : null;

  async function repeat() {
    setRepeatError('');
    try {
      if (!repeatTo) throw new Error('Kies de dag waar de maaltijden naartoe gaan.');
      const copies = repeatDay(data.meals, plan!.id, selected, repeatTo, newId);
      if (!copies.length) throw new Error('Deze dag heeft nog geen maaltijden.');
      if (await run(async (db) => { for (const copy of copies) await db.put('plannedMeals', copy); })) setParams({ dag: repeatTo });
    } catch (cause) {
      setRepeatError(cause instanceof Error ? cause.message : 'Herhalen is niet gelukt.');
    }
  }

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Planning"
        title={plan.name}
        description={`${formatDay(plan.from)} t/m ${formatDay(plan.to)} · ${plan.mealsPerDay} maaltijden per dag · ${plan.status}`}
        action={
          <div className="row">
            <Link className="button button-secondary" to={`/planning/${plan.id}/boodschappen`}>Boodschappenlijst</Link>
            {plan.status === 'concept' && <Button onClick={() => void run((db) => db.put('nutritionPlans', { ...plan, status: 'bevestigd', updatedAt: nowIso() }))}>Plan bevestigen</Button>}
            <Button variant="secondary" onClick={() => setEditing((value) => !value)}>{editing ? 'Sluiten' : 'Aanpassen'}</Button>
          </div>
        }
      />
      {editing && <PlanForm plan={plan} run={run} onDone={() => setEditing(false)} />}
      {database && <Card title="Koppelingen"><GoalLinks database={database} module="voeding" sourceId={plan.id} /></Card>}
      <Card title="Dagen">
        <div style={{ overflowX: 'auto' }}>
          <table className="review-table">
            <caption className="visually-hidden">Totalen per dag tegen de doelen</caption>
            <thead>
              <tr><th scope="col">Dag</th><th scope="col">Maaltijden</th><th scope="col">kcal</th><th scope="col">Eiwit</th></tr>
            </thead>
            <tbody>
              {totals.map((item) => (
                <tr key={item.date} aria-current={item.date === selected ? 'date' : undefined}>
                  <th scope="row"><Link to={`?dag=${item.date}`}>{item.date === selected ? <strong>{formatDay(item.date)}</strong> : formatDay(item.date)}</Link></th>
                  <td>{item.meals}/{plan.mealsPerDay}</td>
                  <td>{item.total.kcal}{plan.targets.kcal ? ` / ${plan.targets.kcal}` : ''}</td>
                  <td>{item.total.protein}{plan.targets.protein ? ` / ${plan.targets.protein}` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {average && <p className="item-subtitle">Gemiddeld over geplande dagen: {average.kcal} kcal en {average.protein} g eiwit.</p>}
      </Card>
      <Card title={`Planning voor ${formatDay(selected)}`}>
        <div className="row" style={{ justifyContent: 'flex-start', flexWrap: 'wrap' }}>
          <StatusPill>{fmt(day.total.kcal, 'kcal')}</StatusPill>
          {targetCheck(day.total, plan.targets).map((check) => (
            <StatusPill key={check.key} tone={check.key === 'protein' ? (check.pct >= 90 ? 'good' : 'warning') : check.pct >= 90 && check.pct <= 110 ? 'good' : 'warning'}>
              {TARGET_LABELS[check.key]} {check.pct}% van doel
            </StatusPill>
          ))}
        </div>
        {dayMeals.length ? (
          <div className="list">{dayMeals.map((meal) => <MealRow key={meal.id} meal={meal} plan={plan} data={data} run={run} />)}</div>
        ) : (
          <p className="item-subtitle">Nog niets gepland op deze dag.</p>
        )}
        <AddMealForm plan={plan} date={selected} data={data} run={run} />
        <div className="form-grid">
          <Field label="Deze dag herhalen op">
            <select value={repeatTo} onChange={(event) => setRepeatTo(event.target.value)}>
              <option value="">Kies een dag</option>
              {dates.filter((date) => date !== selected).map((date) => <option key={date} value={date}>{formatDay(date)}</option>)}
            </select>
          </Field>
        </div>
        {repeatError && <ErrorBanner message={repeatError} />}
        <div className="form-actions"><Button type="button" variant="secondary" onClick={() => void repeat()}>Dag herhalen</Button></div>
      </Card>
      <Card>
        <ConfirmAction
          label={`Plan ${plan.name} verwijderen`}
          confirmMessage="Dit plan, de geplande maaltijden en de koppelingen verwijderen? Wat je al als gegeten hebt geregistreerd, blijft bewaard."
          onConfirm={() =>
            void run(async (db) => {
              for (const meal of meals) await db.remove('plannedMeals', meal.id);
              for (const link of await db.list<EcosystemModuleLink>('links')) {
                if (link.from.module === 'voeding' && link.from.id === plan.id) await db.remove('links', link.id);
              }
              await db.remove('nutritionPlans', plan.id);
            }).then((ok) => ok && navigate('/planning'))
          }
        >
          Plan verwijderen
        </ConfirmAction>
      </Card>
    </div>
  );
}

// ——— Afgeleide boodschappenlijst ———

export function ShoppingPage({ data }: { data: PlannerData }) {
  const { id = '' } = useParams();
  const plan = data.plans.find((item) => item.id === id);
  const [from, setFrom] = useState(plan?.from ?? '');
  const [to, setTo] = useState(plan?.to ?? '');
  const [copied, setCopied] = useState('');
  if (!plan) return <Card><EmptyState title={UNAVAILABLE}>Dit plan bestaat niet (meer). <Link to="/planning">Naar de planning</Link></EmptyState></Card>;
  const meals = mealsOfPlan(plan.id, data.meals).filter((meal) => meal.date >= from && meal.date <= to);
  const items = shoppingList(meals, data);
  const text = shoppingText(items);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied('Gekopieerd.');
    } catch {
      setCopied('Kopiëren is hier niet toegestaan; selecteer de tekst hieronder.');
    }
  }

  return (
    <div className="stack">
      <PageHeader eyebrow={plan.name} title="Boodschappenlijst" description="Afgeleid uit je eigen planning en elke keer opnieuw berekend. Deze lijst wordt niet opgeslagen en heeft geen historie; opgeslagen boodschappenlijsten horen in Samen Thuis." />
      <Card>
        <div className="form-grid">
          <Field label="Van"><input type="date" value={from} min={plan.from} max={plan.to} onChange={(event) => setFrom(event.target.value)} /></Field>
          <Field label="Tot en met"><input type="date" value={to} min={plan.from} max={plan.to} onChange={(event) => setTo(event.target.value)} /></Field>
        </div>
        <p className="item-subtitle">{meals.length} geplande maaltijden.</p>
      </Card>
      <Card title="Nodig">
        {items.length ? (
          <>
            <div className="list">
              {items.map((item) => (
                <div className="list-item" key={item.productId}>
                  <div>
                    <p className="item-title">{item.name}</p>
                    <p className="item-subtitle">{item.category}</p>
                  </div>
                  <p>
                    {[item.amount !== null ? `${item.amount.toLocaleString('nl-NL')} ${item.unit}` : '', ...Object.entries(item.other).map(([unit, amount]) => `${(amount as number).toLocaleString('nl-NL', { maximumFractionDigits: 2 })} ${unit}`)].filter(Boolean).join(' + ')}
                  </p>
                </div>
              ))}
            </div>
            <Field label="Als tekst"><textarea readOnly value={text} rows={Math.min(14, text.split('\n').length + 1)} /></Field>
            {copied && <p role="status" className="item-subtitle">{copied}</p>}
            <div className="form-actions">
              <Button type="button" variant="secondary" onClick={() => window.print()}>Afdrukken</Button>
              <Button type="button" onClick={() => void copy()}>Kopiëren</Button>
            </div>
          </>
        ) : (
          <EmptyState title="Niets nodig">Er zijn geen maaltijden gepland in deze periode.</EmptyState>
        )}
      </Card>
    </div>
  );
}
