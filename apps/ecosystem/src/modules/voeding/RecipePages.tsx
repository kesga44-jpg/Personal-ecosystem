import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { newId } from '@ecosystem/core';
import type { LocalDatabase } from '@ecosystem/storage';
import { Button, Card, ConfirmAction, EmptyState, ErrorBanner, Field, PageHeader, StatusPill } from '@ecosystem/ui';
import { MEALS, isMeal, mealLabels, parseNumber, validateFoodEntry, validateProduct, type FoodEntry, type Meal } from './domain';
import {
  BASES,
  PRICE_UNITS,
  UNITS,
  basisLabels,
  filterRecipes,
  ingredientsOf,
  makeRecipeEntry,
  parseTags,
  recipeAllergens,
  recipeNutrition,
  recipesUsing,
  unitLabels,
  validateRecipe,
  validateRecipeIngredient,
  type Basis,
  type Ingredient,
  type PriceUnit,
  type Recipe,
  type RecipeIngredient,
  type Unit
} from './recipes';

export type Run = (action: (db: LocalDatabase) => Promise<void>) => Promise<boolean>;

export interface RecipeData {
  products: Ingredient[];
  recipes: Recipe[];
  lines: RecipeIngredient[];
}

const UNAVAILABLE = 'Niet meer beschikbaar';

function todayKey(): string {
  const date = new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function fmt(value: number, unit: string): string {
  return `${value.toLocaleString('nl-NL', { maximumFractionDigits: 1 })} ${unit}`;
}

function amountText(value: number): string {
  return value.toLocaleString('nl-NL', { maximumFractionDigits: 2 });
}

// ——— Receptenlijst ———

export function RecipesPage({ data }: { data: RecipeData }) {
  const [query, setQuery] = useState('');
  const [label, setLabel] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [maxMinutes, setMaxMinutes] = useState('');
  const labels = [...new Set(data.recipes.flatMap((recipe) => recipe.labels))].sort((a, b) => a.localeCompare(b, 'nl-NL'));
  const max = parseNumber(maxMinutes);
  const list = filterRecipes(data.recipes, { query, label, favoritesOnly, maxMinutes: max && max > 0 ? max : null });

  return (
    <div className="stack">
      <PageHeader eyebrow="Voeding" title="Recepten" description="Je eigen receptenbibliotheek. Voedingswaarden worden berekend uit de ingrediënten." action={<Link className="button button-primary" to="/recepten/nieuw">＋ Recept</Link>} />
      <Card>
        <div className="form-grid">
          <Field label="Zoeken"><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} /></Field>
          <Field label="Label">
            <select value={label} onChange={(event) => setLabel(event.target.value)}>
              <option value="">Alle labels</option>
              {labels.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </Field>
          <Field label="Maximale bereidingstijd (min)"><input inputMode="numeric" value={maxMinutes} onChange={(event) => setMaxMinutes(event.target.value)} /></Field>
          <label className="checkbox-row"><input type="checkbox" checked={favoritesOnly} onChange={(event) => setFavoritesOnly(event.target.checked)} /> Alleen favorieten</label>
        </div>
      </Card>
      <Card>
        {list.length ? (
          <div className="list">
            {list.map((recipe) => {
              const nutrition = recipeNutrition(recipe, ingredientsOf(recipe.id, data.lines), data.products);
              return (
                <div className="list-item" key={recipe.id}>
                  <div>
                    <p className="item-title"><Link to={`/recepten/${recipe.id}`}>{recipe.favorite ? '★ ' : ''}{recipe.name}</Link></p>
                    <p className="item-subtitle">
                      {fmt(nutrition.perServing.kcal, 'kcal')} per portie · eiwit {fmt(nutrition.perServing.protein, 'g')} · {recipe.servings} {recipe.servings === 1 ? 'portie' : 'porties'}
                      {recipe.prepMinutes !== null && <> · {recipe.prepMinutes} min</>}
                      {recipe.labels.length > 0 && <> · {recipe.labels.join(', ')}</>}
                    </p>
                  </div>
                  {nutrition.problems.length > 0 && <StatusPill tone="warning">onvolledig</StatusPill>}
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState title={data.recipes.length ? 'Niets gevonden' : 'Nog geen recepten'}>{data.recipes.length ? 'Pas de filters aan.' : 'Maak je eerste recept met ingrediënten uit je bibliotheek.'}</EmptyState>
        )}
      </Card>
    </div>
  );
}

// ——— Recept maken of aanpassen ———

function RecipeForm({ recipe, run, onDone }: { recipe?: Recipe; run: Run; onDone: (id?: string) => void }) {
  const [name, setName] = useState(recipe?.name ?? '');
  const [description, setDescription] = useState(recipe?.description ?? '');
  const [steps, setSteps] = useState(recipe?.steps.join('\n') ?? '');
  const [minutes, setMinutes] = useState(recipe?.prepMinutes ? String(recipe.prepMinutes) : '');
  const [servings, setServings] = useState(String(recipe?.servings ?? 2));
  const [category, setCategory] = useState(recipe?.category ?? '');
  const [labels, setLabels] = useState(recipe?.labels.join(', ') ?? '');
  const [allergens, setAllergens] = useState(recipe?.allergens.join(', ') ?? '');
  const [notes, setNotes] = useState(recipe?.notes ?? '');
  const [favorite, setFavorite] = useState(recipe?.favorite ?? false);
  const [formError, setFormError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError('');
    try {
      const prep = parseNumber(minutes);
      if (Number.isNaN(prep)) throw new Error('Bereidingstijd moet een getal zijn.');
      const now = new Date().toISOString();
      const next: Recipe = {
        ...(recipe ?? {}),
        id: recipe?.id ?? newId(),
        name: name.trim(),
        description: description.trim(),
        steps: steps.split('\n').map((step) => step.trim()).filter(Boolean),
        prepMinutes: prep === null ? null : Math.round(prep),
        servings: Number(servings),
        category: category.trim(),
        labels: parseTags(labels),
        allergens: parseTags(allergens),
        notes: notes.trim(),
        favorite,
        createdAt: recipe?.createdAt ?? now,
        updatedAt: now
      };
      validateRecipe(next);
      if (await run((db) => db.put('recipes', next))) onDone(next.id);
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Het recept bevat ongeldige gegevens.');
    }
  }

  return (
    <Card title={recipe ? 'Recept aanpassen' : 'Nieuw recept'}>
      <form className="stack" noValidate onSubmit={(event) => void submit(event)}>
        <div className="form-grid">
          <Field label="Naam van het recept"><input maxLength={120} value={name} onChange={(event) => setName(event.target.value)} /></Field>
          <Field label="Porties"><input type="number" min={1} max={50} value={servings} onChange={(event) => setServings(event.target.value)} /></Field>
          <Field label="Bereidingstijd (min)" hint="Optioneel"><input inputMode="numeric" value={minutes} onChange={(event) => setMinutes(event.target.value)} /></Field>
          <Field label="Categorie" hint="Bijvoorbeeld ontbijt of hoofdgerecht"><input maxLength={60} value={category} onChange={(event) => setCategory(event.target.value)} /></Field>
          <Field label="Labels" hint="Gescheiden door komma's"><input value={labels} onChange={(event) => setLabels(event.target.value)} /></Field>
          <Field label="Allergenen" hint="Naast die van de ingrediënten"><input value={allergens} onChange={(event) => setAllergens(event.target.value)} /></Field>
        </div>
        <Field label="Beschrijving"><input value={description} onChange={(event) => setDescription(event.target.value)} /></Field>
        <Field label="Bereiding" hint="Eén stap per regel"><textarea value={steps} onChange={(event) => setSteps(event.target.value)} /></Field>
        <Field label="Eigen opmerkingen"><textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></Field>
        <label className="checkbox-row"><input type="checkbox" checked={favorite} onChange={(event) => setFavorite(event.target.checked)} /> Favoriet</label>
        {formError && <ErrorBanner message={formError} />}
        <div className="form-actions">
          <Button type="button" variant="secondary" onClick={() => onDone()}>Annuleren</Button>
          <Button type="submit">Recept opslaan</Button>
        </div>
      </form>
    </Card>
  );
}

export function NewRecipePage({ run }: { run: Run }) {
  const navigate = useNavigate();
  return (
    <div className="stack">
      <PageHeader eyebrow="Recepten" title="Nieuw recept" description="Leg eerst naam en porties vast; daarna voeg je de ingrediënten toe." />
      <RecipeForm run={run} onDone={(id) => navigate(id ? `/recepten/${id}` : '/recepten')} />
    </div>
  );
}

// ——— Receptdetail ———

function IngredientLineForm({ recipeId, products, run }: { recipeId: string; products: Ingredient[]; run: Run }) {
  const [productId, setProductId] = useState('');
  const [amount, setAmount] = useState('');
  const [unit, setUnit] = useState<Unit>('g');
  const [note, setNote] = useState('');
  const [formError, setFormError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError('');
    try {
      const value = parseNumber(amount);
      if (value === null || Number.isNaN(value)) throw new Error('Vul een hoeveelheid in.');
      const line: RecipeIngredient = { id: newId(), recipeId, productId, amount: value, unit, note: note.trim() };
      validateRecipeIngredient(line);
      if (await run((db) => db.put('recipeIngredients', line))) {
        setProductId('');
        setAmount('');
        setNote('');
      }
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Ongeldig ingrediënt.');
    }
  }

  if (!products.length) return <p className="item-subtitle">Je bibliotheek is nog leeg. Voeg eerst een product toe via <Link to="/toevoegen">Toevoegen</Link>.</p>;
  return (
    <form className="stack" noValidate onSubmit={(event) => void submit(event)}>
      <div className="form-grid">
        <Field label="Ingrediënt">
          <select value={productId} onChange={(event) => setProductId(event.target.value)}>
            <option value="">Kies uit je bibliotheek</option>
            {products.map((product) => <option key={product.id} value={product.id}>{product.brand ? `${product.name} (${product.brand})` : product.name}</option>)}
          </select>
        </Field>
        <Field label="Hoeveelheid"><input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} /></Field>
        <Field label="Eenheid">
          <select value={unit} onChange={(event) => setUnit(event.target.value as Unit)}>
            {UNITS.map((item) => <option key={item} value={item}>{unitLabels[item]}</option>)}
          </select>
        </Field>
        <Field label="Opmerking" hint="Optioneel"><input maxLength={200} value={note} onChange={(event) => setNote(event.target.value)} /></Field>
      </div>
      {formError && <ErrorBanner message={formError} />}
      <div className="form-actions"><Button type="submit">Ingrediënt toevoegen</Button></div>
    </form>
  );
}

function EatenForm({ recipe, data, run }: { recipe: Recipe; data: RecipeData; run: Run }) {
  const [date, setDate] = useState(todayKey());
  const [meal, setMeal] = useState<Meal>('diner');
  const [servings, setServings] = useState('1');
  const [formError, setFormError] = useState('');
  const [saved, setSaved] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError('');
    setSaved('');
    try {
      const count = parseNumber(servings);
      if (count === null || Number.isNaN(count)) throw new Error('Vul het aantal porties in.');
      const nutrition = recipeNutrition(recipe, ingredientsOf(recipe.id, data.lines), data.products);
      const entry: FoodEntry = makeRecipeEntry(recipe, nutrition, { id: newId(), date, meal, servings: count });
      validateFoodEntry(entry, todayKey());
      if (await run((db) => db.put('entries', entry))) setSaved(`Geregistreerd: ${amountText(count)} ${count === 1 ? 'portie' : 'porties'}.`);
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Registreren is niet gelukt.');
    }
  }

  return (
    <Card title="Als gegeten registreren">
      <p className="item-subtitle">Naam en voedingswaarden worden gekopieerd. Een latere wijziging van het recept verandert deze registratie niet.</p>
      <form className="stack" noValidate onSubmit={(event) => void submit(event)}>
        <div className="form-grid">
          <Field label="Datum"><input type="date" value={date} max={todayKey()} onChange={(event) => setDate(event.target.value)} /></Field>
          <Field label="Maaltijd">
            <select value={meal} onChange={(event) => isMeal(event.target.value) && setMeal(event.target.value)}>
              {MEALS.map((item) => <option key={item} value={item}>{mealLabels[item]}</option>)}
            </select>
          </Field>
          <Field label="Gegeten porties"><input inputMode="decimal" value={servings} onChange={(event) => setServings(event.target.value)} /></Field>
        </div>
        {formError && <ErrorBanner message={formError} />}
        {saved && <p role="status" className="item-subtitle">{saved}</p>}
        <div className="form-actions"><Button type="submit">Registreren</Button></div>
      </form>
    </Card>
  );
}

export function RecipeDetailPage({ data, run }: { data: RecipeData; run: Run }) {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const recipe = data.recipes.find((item) => item.id === id);
  if (!recipe) {
    return <Card><EmptyState title={UNAVAILABLE}>Dit recept bestaat niet (meer). <Link to="/recepten">Naar de recepten</Link></EmptyState></Card>;
  }
  const lines = ingredientsOf(recipe.id, data.lines);
  const byId = new Map(data.products.map((product) => [product.id, product]));
  const nutrition = recipeNutrition(recipe, lines, data.products);
  const allergens = recipeAllergens(recipe, lines, data.products);

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Recept"
        title={recipe.name}
        description={recipe.description || `${recipe.servings} ${recipe.servings === 1 ? 'portie' : 'porties'}`}
        action={
          <div className="row">
            <Button variant="secondary" onClick={() => void run((db) => db.put('recipes', { ...recipe, favorite: !recipe.favorite, updatedAt: new Date().toISOString() }))}>{recipe.favorite ? '★ Favoriet' : '☆ Favoriet maken'}</Button>
            <Button variant="secondary" onClick={() => setEditing((value) => !value)}>{editing ? 'Sluiten' : 'Aanpassen'}</Button>
          </div>
        }
      />
      {editing && <RecipeForm recipe={recipe} run={run} onDone={() => setEditing(false)} />}
      <div className="grid grid-4">
        {(['kcal', 'protein', 'carbs', 'fat'] as const).map((key) => (
          <Card className="metric" key={key}>
            <p className="metric-label">{{ kcal: 'Energie', protein: 'Eiwit', carbs: 'Koolhydraten', fat: 'Vet' }[key]} per portie</p>
            <p className="metric-value">{fmt(nutrition.perServing[key], key === 'kcal' ? 'kcal' : 'g')}</p>
            <p className="metric-note">Heel recept {fmt(nutrition.total[key], key === 'kcal' ? 'kcal' : 'g')}</p>
          </Card>
        ))}
      </div>
      {nutrition.problems.length > 0 && (
        <Card title="Niet alles is te berekenen">
          <ul>{nutrition.problems.map((problem, index) => <li key={index}>{problem}</li>)}</ul>
        </Card>
      )}
      <div className="grid grid-2">
        <Card title="Ingrediënten">
          {lines.length ? (
            <div className="list">
              {lines.map((line) => {
                const product = byId.get(line.productId);
                return (
                  <div className="list-item" key={line.id}>
                    <div>
                      <p className="item-title">{amountText(line.amount)} {unitLabels[line.unit]} {product ? product.name : UNAVAILABLE}</p>
                      {line.note && <p className="item-subtitle">{line.note}</p>}
                    </div>
                    <ConfirmAction label={`${product?.name ?? 'Ingrediënt'} uit het recept halen`} confirmMessage="Dit ingrediënt uit het recept halen?" onConfirm={() => void run((db) => db.remove('recipeIngredients', line.id))}>Weghalen</ConfirmAction>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="item-subtitle">Nog geen ingrediënten.</p>
          )}
          <IngredientLineForm recipeId={recipe.id} products={data.products} run={run} />
        </Card>
        <Card title="Bereiding">
          {recipe.steps.length ? <ol>{recipe.steps.map((step, index) => <li key={index}>{step}</li>)}</ol> : <p className="item-subtitle">Nog geen bereiding.</p>}
          <p className="item-subtitle">
            {recipe.prepMinutes !== null ? `${recipe.prepMinutes} minuten` : 'Bereidingstijd onbekend'}
            {recipe.category && <> · {recipe.category}</>}
            {recipe.labels.length > 0 && <> · labels: {recipe.labels.join(', ')}</>}
          </p>
          <p className="item-subtitle">Allergenen: {allergens.length ? allergens.join(', ') : 'geen bekend'}</p>
          {nutrition.fiber !== null && <p className="item-subtitle">Vezels per portie: {fmt(nutrition.fiber / recipe.servings, 'g')}</p>}
          {recipe.notes && <p>{recipe.notes}</p>}
        </Card>
      </div>
      <EatenForm recipe={recipe} data={data} run={run} />
      <Card>
        <ConfirmAction
          label={`Recept ${recipe.name} verwijderen`}
          confirmMessage="Dit recept verwijderen? Eerdere registraties blijven bewaard, want die hebben hun eigen kopie."
          onConfirm={() =>
            void run(async (db) => {
              for (const line of lines) await db.remove('recipeIngredients', line.id);
              await db.remove('recipes', recipe.id);
            }).then((ok) => ok && navigate('/recepten'))
          }
        >
          Recept verwijderen
        </ConfirmAction>
      </Card>
    </div>
  );
}

// ——— Ingrediënt aanpassen (schema 2-velden) ———

export function IngredientPage({ data, run }: { data: RecipeData; run: Run }) {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const product = data.products.find((item) => item.id === decodeURIComponent(id));
  const [category, setCategory] = useState('');
  const [basis, setBasis] = useState<Basis>('100g');
  const [portion, setPortion] = useState('');
  const [fiber, setFiber] = useState('');
  const [price, setPrice] = useState('');
  const [priceUnit, setPriceUnit] = useState<PriceUnit>('kg');
  const [allergens, setAllergens] = useState('');
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!product) return;
    setCategory(product.category ?? '');
    setBasis(product.basis ?? '100g');
    setPortion(String(product.portionGrams ?? product.servingGrams ?? '').replace('.', ','));
    setFiber(product.fiber === undefined || product.fiber === null ? '' : String(product.fiber).replace('.', ','));
    setPrice(product.pricePerUnitCents === undefined || product.pricePerUnitCents === null ? '' : (product.pricePerUnitCents / 100).toFixed(2).replace('.', ','));
    setPriceUnit(product.priceUnit ?? 'kg');
    setAllergens((product.allergens ?? []).join(', '));
  }, [product]);

  if (!product) return <Card><EmptyState title={UNAVAILABLE}>Dit ingrediënt bestaat niet (meer). <Link to="/producten">Naar de bibliotheek</Link></EmptyState></Card>;
  const used = recipesUsing(product.id, data.recipes, data.lines);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError('');
    try {
      const portionValue = parseNumber(portion);
      const fiberValue = parseNumber(fiber);
      const priceValue = parseNumber(price);
      if ([portionValue, fiberValue, priceValue].some((value) => Number.isNaN(value))) throw new Error('Vul getallen in, of laat het veld leeg.');
      const next: Ingredient = {
        ...product!,
        category: category.trim(),
        basis,
        portionGrams: portionValue,
        fiber: fiberValue,
        pricePerUnitCents: priceValue === null ? null : Math.round(priceValue * 100),
        priceUnit: priceValue === null ? null : priceUnit,
        allergens: parseTags(allergens),
        updatedAt: new Date().toISOString()
      };
      validateProduct(next);
      if (await run((db) => db.put('products', next))) navigate(params.get('terug') ?? '/producten');
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Het ingrediënt bevat ongeldige gegevens.');
    }
  }

  return (
    <div className="stack">
      <PageHeader eyebrow="Ingrediënt" title={product.name} description={`Waarden ${basisLabels[product.basis ?? '100g']}: ${fmt(product.per100.kcal, 'kcal')}, eiwit ${fmt(product.per100.protein, 'g')}, koolhydraten ${fmt(product.per100.carbs, 'g')}, vet ${fmt(product.per100.fat, 'g')}.`} />
      <Card title="Ingrediëntgegevens">
        <form className="stack" noValidate onSubmit={(event) => void submit(event)}>
          <div className="form-grid">
            <Field label="Categorie"><input maxLength={60} value={category} onChange={(event) => setCategory(event.target.value)} /></Field>
            <Field label="Waarden gelden">
              <select value={basis} onChange={(event) => setBasis(event.target.value as Basis)}>
                {BASES.map((item) => <option key={item} value={item}>{basisLabels[item]}</option>)}
              </select>
            </Field>
            <Field label="Gewicht van één portie of stuk (g of ml)" hint="Nodig om met stuks of porties te rekenen"><input inputMode="decimal" value={portion} onChange={(event) => setPortion(event.target.value)} /></Field>
            <Field label="Vezels (g)" hint="Per dezelfde basis"><input inputMode="decimal" value={fiber} onChange={(event) => setFiber(event.target.value)} /></Field>
            <Field label="Prijs (€)" hint="Optioneel"><input inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value)} /></Field>
            <Field label="Prijs per">
              <select value={priceUnit} onChange={(event) => setPriceUnit(event.target.value as PriceUnit)}>
                {PRICE_UNITS.map((item) => <option key={item} value={item}>{item === 'l' ? 'liter' : item}</option>)}
              </select>
            </Field>
            <Field label="Allergenen" hint="Gescheiden door komma's"><input value={allergens} onChange={(event) => setAllergens(event.target.value)} /></Field>
          </div>
          {formError && <ErrorBanner message={formError} />}
          <div className="form-actions">
            <Button type="button" variant="secondary" onClick={() => navigate('/producten')}>Annuleren</Button>
            <Button type="submit">Ingrediënt opslaan</Button>
          </div>
        </form>
      </Card>
      <Card title="Gebruikt in">
        {used.length ? (
          <div className="list">{used.map((recipe) => <div className="list-item" key={recipe.id}><Link to={`/recepten/${recipe.id}`}>{recipe.name}</Link></div>)}</div>
        ) : (
          <p className="item-subtitle">Nog in geen enkel recept.</p>
        )}
      </Card>
    </div>
  );
}
