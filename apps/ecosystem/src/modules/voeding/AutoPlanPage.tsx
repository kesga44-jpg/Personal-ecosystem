import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { newId } from '@ecosystem/core';
import { Button, Card, EmptyState, ErrorBanner, Field, PageHeader, StatusPill } from '@ecosystem/ui';
import { MEALS, mealLabels, parseNumber, validateSettings, type FoodSettings, type Meal } from './domain';
import { conceptToPlan, defaultPrefs, generatePlan, type DayResult, type Exclusion, type PlannerPrefs } from './autoplan';
import { validatePlan, validatePlannedMeal, type PlanTargets } from './planner';
import { parseTags } from './recipes';
import type { PlannerData } from './PlannerPages';
import type { Run } from './RecipePages';

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

function euros(cents: number): string {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

function intOrNull(raw: string, label: string): number | null {
  const value = parseNumber(raw);
  if (Number.isNaN(value)) throw new Error(`${label} moet een getal zijn.`);
  return value === null ? null : Math.round(value);
}

function PrefsCard({ settings, data, run }: { settings: FoodSettings; data: PlannerData; run: Run }) {
  const prefs = settings.planner ?? defaultPrefs;
  const [favoriteLabels, setFavoriteLabels] = useState(prefs.favoriteLabels.join(', '));
  const [excludedLabels, setExcludedLabels] = useState(prefs.excludedLabels.join(', '));
  const [excludedAllergens, setExcludedAllergens] = useState(prefs.excludedAllergens.join(', '));
  const [excludedProducts, setExcludedProducts] = useState<string[]>(prefs.excludedProductIds);
  const [repeats, setRepeats] = useState(String(prefs.maxRepeatsPerWeek));
  const [minutes, setMinutes] = useState<Record<Meal, string>>(Object.fromEntries(MEALS.map((meal) => [meal, prefs.maxMinutes[meal] ? String(prefs.maxMinutes[meal]) : ''])) as Record<Meal, string>);
  const [budget, setBudget] = useState(prefs.budgetPerDayCents === null ? '' : (prefs.budgetPerDayCents / 100).toFixed(2).replace('.', ','));
  const [formError, setFormError] = useState('');
  const [saved, setSaved] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError('');
    setSaved('');
    try {
      const maxMinutes: PlannerPrefs['maxMinutes'] = {};
      for (const meal of MEALS) {
        const value = intOrNull(minutes[meal], `Tijd voor ${mealLabels[meal].toLowerCase()}`);
        if (value !== null) maxMinutes[meal] = value;
      }
      const budgetValue = parseNumber(budget);
      if (Number.isNaN(budgetValue)) throw new Error('Budget moet een bedrag zijn.');
      const next: FoodSettings = {
        ...settings,
        planner: {
          favoriteLabels: parseTags(favoriteLabels),
          excludedLabels: parseTags(excludedLabels),
          excludedAllergens: parseTags(excludedAllergens),
          excludedProductIds: excludedProducts,
          maxRepeatsPerWeek: Number(repeats),
          maxMinutes,
          budgetPerDayCents: budgetValue === null ? null : Math.round(budgetValue * 100)
        }
      };
      validateSettings(next);
      if (await run((db) => db.put('settings', next))) setSaved('Voorkeuren opgeslagen.');
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Ongeldige voorkeuren.');
    }
  }

  return (
    <Card title="Voorkeuren en uitsluitingen">
      <form className="stack" noValidate onSubmit={(event) => void submit(event)}>
        <div className="form-grid">
          <Field label="Labels die vaker mogen" hint="Gescheiden door komma's"><input value={favoriteLabels} onChange={(event) => setFavoriteLabels(event.target.value)} /></Field>
          <Field label="Labels die nooit mogen"><input value={excludedLabels} onChange={(event) => setExcludedLabels(event.target.value)} /></Field>
          <Field label="Allergenen die nooit mogen"><input value={excludedAllergens} onChange={(event) => setExcludedAllergens(event.target.value)} /></Field>
          <Field label="Zelfde recept per week maximaal"><input type="number" min={1} max={7} value={repeats} onChange={(event) => setRepeats(event.target.value)} /></Field>
          <Field label="Budget per dag (€)" hint="Optioneel; recepten zonder bekende prijs vallen dan af"><input inputMode="decimal" value={budget} onChange={(event) => setBudget(event.target.value)} /></Field>
          {MEALS.map((meal) => (
            <Field key={meal} label={`Maximale tijd ${mealLabels[meal].toLowerCase()} (min)`} hint="Optioneel">
              <input inputMode="numeric" value={minutes[meal]} onChange={(event) => setMinutes((current) => ({ ...current, [meal]: event.target.value }))} />
            </Field>
          ))}
        </div>
        {data.products.length > 0 && (
          <fieldset className="plain-fieldset">
            <legend>Ingrediënten die nooit mogen</legend>
            <div className="row" style={{ justifyContent: 'flex-start', flexWrap: 'wrap' }}>
              {data.products.map((product) => (
                <label className="checkbox-row" key={product.id}>
                  <input type="checkbox" checked={excludedProducts.includes(product.id)} onChange={(event) => setExcludedProducts((current) => (event.target.checked ? [...current, product.id] : current.filter((id) => id !== product.id)))} />
                  {product.name}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        {formError && <ErrorBanner message={formError} />}
        {saved && <p role="status" className="item-subtitle">{saved}</p>}
        <div className="form-actions"><Button type="submit">Voorkeuren opslaan</Button></div>
      </form>
    </Card>
  );
}

interface Concept {
  name: string;
  from: string;
  to: string;
  targets: PlanTargets;
  mealsPerDay: number;
  days: DayResult[];
  excluded: Exclusion[];
}

export function AutoPlanPage({ data, settings, run }: { data: PlannerData; settings: FoodSettings; run: Run }) {
  const navigate = useNavigate();
  const today = todayKey();
  const [name, setName] = useState('Automatisch plan');
  const [from, setFrom] = useState(addDays(today, 1));
  const [to, setTo] = useState(addDays(today, 7));
  const [kcal, setKcal] = useState(settings.kcalTarget ? String(settings.kcalTarget) : '');
  const [protein, setProtein] = useState(settings.proteinTarget ? String(settings.proteinTarget) : '');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [mealsPerDay, setMealsPerDay] = useState('3');
  const [concept, setConcept] = useState<Concept | null>(null);
  const [formError, setFormError] = useState('');

  function makeConcept(event: FormEvent) {
    event.preventDefault();
    setFormError('');
    try {
      const targets: PlanTargets = { kcal: intOrNull(kcal, 'Energie'), protein: intOrNull(protein, 'Eiwit'), carbs: intOrNull(carbs, 'Koolhydraten'), fat: intOrNull(fat, 'Vet') };
      if (!targets.kcal) throw new Error('Vul een doel voor energie in; daarop rekent de planner.');
      const check = { id: 'check', name: name.trim(), from, to, targets, mealsPerDay: Number(mealsPerDay), status: 'concept' as const, generated: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      validatePlan(check);
      const result = generatePlan({ from, to, targets, mealsPerDay: check.mealsPerDay }, data.recipes, data.lines, data.products, settings.planner ?? defaultPrefs);
      setConcept({ name: check.name, from, to, targets, mealsPerDay: check.mealsPerDay, ...result });
    } catch (cause) {
      setConcept(null);
      setFormError(cause instanceof Error ? cause.message : 'Het concept kon niet worden gemaakt.');
    }
  }

  async function confirm() {
    if (!concept) return;
    setFormError('');
    try {
      const { plan, meals } = conceptToPlan({ id: newId(), name: concept.name, from: concept.from, to: concept.to, targets: concept.targets, mealsPerDay: concept.mealsPerDay }, concept.days, newId);
      validatePlan(plan);
      for (const meal of meals) validatePlannedMeal(meal);
      if (
        await run(async (db) => {
          await db.put('nutritionPlans', plan);
          for (const meal of meals) await db.put('plannedMeals', meal);
        })
      )
        navigate(`/planning/${plan.id}`);
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Opslaan is niet gelukt.');
    }
  }

  function removeMeal(date: string, index: number) {
    setConcept((current) => current && { ...current, days: current.days.map((day) => (day.date === date ? { ...day, meals: day.meals.filter((_, i) => i !== index) } : day)) });
  }

  const filled = concept?.days.filter((day) => day.meals.length).length ?? 0;

  return (
    <div className="stack">
      <PageHeader eyebrow="Planning" title="Automatisch plannen" description="Regelgebaseerd: dezelfde invoer geeft hetzelfde plan. Het resultaat is een concept; pas als jij het bevestigt, wordt het opgeslagen." action={<Link className="button button-secondary" to="/planning">Terug naar de planning</Link>} />
      <PrefsCard settings={settings} data={data} run={run} />
      <Card title="Concept maken">
        <form className="stack" noValidate onSubmit={makeConcept}>
          <div className="form-grid">
            <Field label="Naam van het plan"><input maxLength={120} value={name} onChange={(event) => setName(event.target.value)} /></Field>
            <Field label="Van"><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></Field>
            <Field label="Tot en met"><input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></Field>
            <Field label="Maaltijden per dag"><input type="number" min={1} max={8} value={mealsPerDay} onChange={(event) => setMealsPerDay(event.target.value)} /></Field>
            <Field label="Doel energie (kcal per dag)"><input inputMode="numeric" value={kcal} onChange={(event) => setKcal(event.target.value)} /></Field>
            <Field label="Doel eiwit (g per dag)" hint="Optioneel"><input inputMode="numeric" value={protein} onChange={(event) => setProtein(event.target.value)} /></Field>
            <Field label="Doel koolhydraten (g per dag)" hint="Optioneel"><input inputMode="numeric" value={carbs} onChange={(event) => setCarbs(event.target.value)} /></Field>
            <Field label="Doel vet (g per dag)" hint="Optioneel"><input inputMode="numeric" value={fat} onChange={(event) => setFat(event.target.value)} /></Field>
          </div>
          {formError && <ErrorBanner message={formError} />}
          <div className="form-actions"><Button type="submit">Concept maken</Button></div>
        </form>
      </Card>
      {concept && (
        <>
          <Card title={`Concept: ${filled} van ${concept.days.length} dagen gevuld`}>
            <p className="item-subtitle">Nog niet opgeslagen. Haal maaltijden weg die je niet wilt en bevestig daarna; daarna kun je alles nog aanpassen in de planning.</p>
            <div className="list">
              {concept.days.map((day) => (
                <div className="list-item" key={day.date} style={{ flexWrap: 'wrap' }}>
                  <div>
                    <p className="item-title">{formatDay(day.date)}</p>
                    {day.reason ? (
                      <p className="item-subtitle"><strong>Niet gevuld:</strong> {day.reason}</p>
                    ) : (
                      <p className="item-subtitle">{day.total.kcal} kcal · eiwit {day.total.protein.toLocaleString('nl-NL')} g{day.cost !== null && <> · {euros(day.cost)}</>}</p>
                    )}
                  </div>
                  <div className="stack" style={{ width: '100%' }}>
                    {day.meals.map((meal, index) => (
                      <div className="row" key={`${meal.slot}-${index}`} style={{ justifyContent: 'space-between' }}>
                        <span>{mealLabels[meal.slot]}: {meal.recipe.name} · {meal.servings.toLocaleString('nl-NL')} {meal.servings === 1 ? 'portie' : 'porties'}</span>
                        <button type="button" className="text-button" onClick={() => removeMeal(day.date, index)} aria-label={`${meal.recipe.name} op ${formatDay(day.date)} weghalen uit het concept`}>Weghalen</button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="form-actions">
              <Button type="button" variant="secondary" onClick={() => setConcept(null)}>Concept weggooien</Button>
              <Button type="button" onClick={() => void confirm()} disabled={!concept.days.some((day) => day.meals.length)}>Bevestigen en opslaan</Button>
            </div>
          </Card>
          {concept.excluded.length > 0 && (
            <Card title="Niet meegenomen recepten">
              <div className="list">
                {concept.excluded.map((item) => (
                  <div className="list-item" key={item.recipe.id}>
                    <p className="item-title">{item.recipe.name}</p>
                    <StatusPill tone="warning">{item.reason}</StatusPill>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
      {!data.recipes.length && <Card><EmptyState title="Nog geen recepten">De planner kiest uit je eigen recepten. <Link to="/recepten/nieuw">Maak een recept</Link>.</EmptyState></Card>}
    </div>
  );
}
