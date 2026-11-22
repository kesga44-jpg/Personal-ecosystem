import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { BrowserRouter, Link, Route, Routes, useNavigate, useSearchParams } from 'react-router-dom';
import { newId } from '@ecosystem/core';
import { openLocalDatabase, runStorageAction as performStorageAction, type LocalDatabase } from '@ecosystem/storage';
import {
  AppFrame,
  BarChart,
  Button,
  Card,
  ConfirmAction,
  EmptyState,
  ErrorBanner,
  Field,
  LoadingState,
  PageHeader,
  ProgressRing,
  StatusPill,
  type ModuleLink
} from '@ecosystem/ui';
import { lookupBarcode, searchProducts } from './api';
import {
  MEALS,
  NUTRIENT_KEYS,
  averageKcal,
  byMeal,
  entriesOn,
  isDateKey,
  isMeal,
  kcalSeries,
  macroSplit,
  makeEntry,
  mealLabels,
  nutrientLabels,
  nutrientsFor,
  parseNumber,
  productFromOff,
  recentProducts,
  sumNutrients,
  validateFoodEntry,
  validateProduct,
  validateSettings,
  type FoodEntry,
  type FoodProduct,
  type FoodSettings,
  type Meal
} from './domain';
import type { Nutrients, OffProduct } from './product';
import { Scanner, scannerAvailable } from './Scanner';
import { databaseConfig } from './storage';
import { IngredientPage, NewRecipePage, RecipeDetailPage, RecipesPage, type RecipeData } from './RecipePages';
import type { Ingredient, Recipe, RecipeIngredient } from './recipes';
import { PlanPage, PlansPage, ShoppingPage, type PlannerData } from './PlannerPages';
import { AutoPlanPage } from './AutoPlanPage';
import type { NutritionPlan, PlannedMeal } from './planner';

const navigation = [
  { to: '/', label: 'Vandaag', icon: '⌂' },
  { to: '/toevoegen', label: 'Toevoegen', icon: '＋' },
  { to: '/planning', label: 'Planning', icon: '▦' },
  { to: '/recepten', label: 'Recepten', icon: '❦' },
  { to: '/producten', label: 'Ingrediënten', icon: '☰' },
  { to: '/instellingen', label: 'Instellingen', icon: '⚙' }
];

const emptySettings: FoodSettings = { id: 'settings', kcalTarget: null, proteinTarget: null };

function todayKey(): string {
  const date = new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function formatDay(date: string): string {
  return new Intl.DateTimeFormat('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${date}T12:00:00`));
}

function defaultMeal(now = new Date()): Meal {
  const hour = now.getHours();
  if (hour < 10) return 'ontbijt';
  if (hour < 14) return 'lunch';
  if (hour >= 17 && hour < 21) return 'diner';
  return 'tussendoor';
}

function format(value: number, unit: string): string {
  return `${value.toLocaleString('nl-NL', { maximumFractionDigits: 1 })} ${unit}`;
}

function unitFor(key: keyof Nutrients): string {
  return key === 'kcal' ? 'kcal' : 'g';
}

export default function VoedingApp({ links }: { links: ModuleLink[] }) {
  return (
    <BrowserRouter basename="/voeding">
      <VoedingRoutes links={links} />
    </BrowserRouter>
  );
}

function VoedingRoutes({ links }: { links: ModuleLink[] }) {
  const [database, setDatabase] = useState<LocalDatabase | null>(null);
  const [entries, setEntries] = useState<FoodEntry[]>([]);
  const [products, setProducts] = useState<FoodProduct[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [lines, setLines] = useState<RecipeIngredient[]>([]);
  const [plans, setPlans] = useState<NutritionPlan[]>([]);
  const [plannedMeals, setPlannedMeals] = useState<PlannedMeal[]>([]);
  const [settings, setSettings] = useState<FoodSettings>(emptySettings);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function refresh(db: LocalDatabase) {
    const [nextEntries, nextProducts, nextSettings, nextRecipes, nextLines, nextPlans, nextMeals] = await Promise.all([
      db.list<FoodEntry>('entries'),
      db.list<FoodProduct>('products'),
      db.list<FoodSettings>('settings'),
      db.list<Recipe>('recipes'),
      db.list<RecipeIngredient>('recipeIngredients'),
      db.list<NutritionPlan>('nutritionPlans'),
      db.list<PlannedMeal>('plannedMeals')
    ]);
    setPlans(nextPlans);
    setPlannedMeals(nextMeals);
    setRecipes(nextRecipes.sort((a, b) => a.name.localeCompare(b.name, 'nl')));
    setLines(nextLines);
    setEntries(nextEntries);
    setProducts(nextProducts.sort((a, b) => a.name.localeCompare(b.name, 'nl')));
    setSettings(nextSettings[0] ?? emptySettings);
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

  async function run(action: (db: LocalDatabase) => Promise<void>): Promise<boolean> {
    if (!database) {
      setError('Lokale opslag is niet beschikbaar.');
      return false;
    }
    return performStorageAction(() => action(database), () => refresh(database), setError, 'De wijziging kon niet worden opgeslagen.');
  }

  const recipeData: RecipeData = { products: products as Ingredient[], recipes, lines };
  const plannerData: PlannerData = { ...recipeData, plans, meals: plannedMeals, entries };

  return (
    <AppFrame appName="Voeding" appMark="◔" navigation={navigation} moduleLinks={links}>
      {loading ? (
        <LoadingState />
      ) : (
        <Routes>
          <Route path="/" element={<DayPage entries={entries} settings={settings} error={error} onDelete={(id) => void run((db) => db.remove('entries', id))} />} />
          <Route
            path="/toevoegen"
            element={
              <AddPage
                entries={entries}
                products={products}
                error={error}
                onSave={(product, entry) =>
                  run(async (db) => {
                    await db.put('products', product);
                    await db.put('entries', entry);
                  })
                }
              />
            }
          />
          <Route path="/planning" element={<>{error && <ErrorBanner message={error} />}<PlansPage data={plannerData} run={run} /></>} />
          <Route path="/planning/automatisch" element={<>{error && <ErrorBanner message={error} />}<AutoPlanPage data={plannerData} settings={settings} run={run} /></>} />
          <Route path="/planning/:id" element={<>{error && <ErrorBanner message={error} />}<PlanPage data={plannerData} run={run} database={database} /></>} />
          <Route path="/planning/:id/boodschappen" element={<ShoppingPage data={plannerData} />} />
          <Route path="/recepten" element={<>{error && <ErrorBanner message={error} />}<RecipesPage data={recipeData} /></>} />
          <Route path="/recepten/nieuw" element={<>{error && <ErrorBanner message={error} />}<NewRecipePage run={run} /></>} />
          <Route path="/recepten/:id" element={<>{error && <ErrorBanner message={error} />}<RecipeDetailPage data={recipeData} run={run} /></>} />
          <Route path="/producten/:id" element={<>{error && <ErrorBanner message={error} />}<IngredientPage data={recipeData} run={run} /></>} />
          <Route path="/producten" element={<ProductsPage products={products} error={error} onDelete={(id) => void run((db) => db.remove('products', id))} />} />
          <Route path="/instellingen" element={<SettingsPage settings={settings} error={error} onSave={(next) => run((db) => db.put('settings', next))} />} />
          <Route path="*" element={<DayPage entries={entries} settings={settings} error={error} onDelete={(id) => void run((db) => db.remove('entries', id))} />} />
        </Routes>
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

function DayPage({ entries, settings, error, onDelete }: { entries: FoodEntry[]; settings: FoodSettings; error: string; onDelete: (id: string) => void }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const today = todayKey();
  const requested = params.get('datum');
  const date = isDateKey(requested) && requested <= today ? requested : today;
  const dayEntries = entriesOn(entries, date);
  const total = sumNutrients(dayEntries);
  const meals = byMeal(dayEntries);
  const split = macroSplit(total);
  const week = averageKcal(entries, today, 7);

  return (
    <div className="stack">
      {error && <ErrorBanner message={error} />}
      <PageHeader
        eyebrow={date === today ? 'Vandaag' : formatDay(date)}
        title={date === today ? 'Wat heb je gegeten?' : 'Voeding op deze dag'}
        description="Je registraties blijven op dit apparaat."
        action={<Button onClick={() => navigate(`/toevoegen${date === today ? '' : `?datum=${date}`}`)}>＋ Toevoegen</Button>}
      />
      <div className="grid grid-4">
        <Card className="metric">
          <p className="metric-label">Energie</p>
          <p className="metric-value">{format(total.kcal, 'kcal')}</p>
          {settings.kcalTarget ? (
            <div className="metric-ring">
              <ProgressRing label="Energie ten opzichte van doel" value={total.kcal} max={settings.kcalTarget} text={`${Math.round((total.kcal / settings.kcalTarget) * 100)}%`} />
              <p className="metric-note">van doel {format(settings.kcalTarget, 'kcal')}</p>
            </div>
          ) : (
            <p className="metric-note">Stel een doel in bij Instellingen</p>
          )}
        </Card>
        <Metric label="Eiwit" value={format(total.protein, 'g')} note={settings.proteinTarget ? `Doel ${settings.proteinTarget} g` : split ? `${split.protein}% van de energie` : '—'} />
        <Metric label="Koolhydraten" value={format(total.carbs, 'g')} note={split ? `${split.carbs}% van de energie` : '—'} />
        <Metric label="Vet" value={format(total.fat, 'g')} note={split ? `${split.fat}% van de energie` : '—'} />
      </div>
      <div className="grid grid-2">
        <Card title="Maaltijden">
          {dayEntries.length ? (
            <div className="list">
              {MEALS.filter((meal) => meals[meal].length).map((meal) => (
                <div key={meal} className="meal-group">
                  <p className="item-title">{mealLabels[meal]} · {format(sumNutrients(meals[meal]).kcal, 'kcal')}</p>
                  {meals[meal].map((entry) => {
                    const amount = nutrientsFor(entry);
                    return (
                      <div className="list-item" key={entry.id}>
                        <div>
                          <p className="item-title">{entry.name}</p>
                          <p className="item-subtitle">{format(entry.grams, 'g')} · {format(amount.kcal, 'kcal')} · eiwit {format(amount.protein, 'g')}</p>
                        </div>
                        <ConfirmAction label={`${entry.name} verwijderen`} confirmMessage="Deze registratie verwijderen?" onConfirm={() => onDelete(entry.id)}>
                          Verwijderen
                        </ConfirmAction>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="Nog niets geregistreerd">Zoek een product, scan een barcode of voer zelf iets in.</EmptyState>
          )}
        </Card>
        <Card title="Energie (14 dagen)">
          <BarChart title="Energie per dag in kcal, laatste 14 dagen" points={kcalSeries(entries, today, 14)} unit="kcal" />
          <p className="widget-foot">{week ? `Gemiddeld ${format(week.value, 'kcal')} over ${week.days} ${week.days === 1 ? 'dag' : 'dagen'} met registraties.` : 'Na je eerste registratie zie je hier je week.'}</p>
        </Card>
      </div>
      <p className="item-subtitle">Voedingswaarden zijn schattingen. Dit is geen medisch of dieetadvies.</p>
    </div>
  );
}

type AddMode = 'zoeken' | 'barcode' | 'eigen';

function AddPage({ entries, products, error, onSave }: { entries: FoodEntry[]; products: FoodProduct[]; error: string; onSave: (product: FoodProduct, entry: FoodEntry) => Promise<boolean> }) {
  const [params] = useSearchParams();
  const today = todayKey();
  const requested = params.get('datum');
  const date = isDateKey(requested) && requested <= today ? requested : today;
  const [chosen, setChosen] = useState<FoodProduct | null>(null);
  const [mode, setMode] = useState<AddMode>('zoeken');
  const recent = recentProducts(entries, products);

  return (
    <div className="stack">
      {error && <ErrorBanner message={error} />}
      <PageHeader eyebrow="Voeding" title={chosen ? 'Hoeveel?' : 'Toevoegen'} description={date === today ? 'Voor vandaag.' : `Voor ${formatDay(date)}.`} />
      {chosen ? (
        <AmountForm product={chosen} date={date} onBack={() => setChosen(null)} onSave={onSave} />
      ) : (
        <>
          {recent.length > 0 && (
            <Card title="Recent">
              <div className="chip-row">
                {recent.map((product) => (
                  <button key={product.id} type="button" className="chip" onClick={() => setChosen(product)}>{product.name}</button>
                ))}
              </div>
            </Card>
          )}
          <Card>
            <div className="chip-row" role="group" aria-label="Manier van toevoegen">
              {(['zoeken', 'barcode', 'eigen'] as const).map((item) => (
                <button key={item} type="button" className="chip chip-toggle" aria-pressed={mode === item} onClick={() => setMode(item)}>
                  {item === 'zoeken' ? 'Zoeken' : item === 'barcode' ? 'Barcode' : 'Zelf invoeren'}
                </button>
              ))}
            </div>
            <div style={{ marginTop: 16 }}>
              {mode === 'zoeken' && <SearchPanel onChoose={(product) => setChosen(productFromOff(product))} onManual={() => setMode('eigen')} />}
              {mode === 'barcode' && <BarcodePanel products={products} onChoose={setChosen} onManual={() => setMode('eigen')} />}
              {mode === 'eigen' && <OwnProductForm onDone={setChosen} />}
            </div>
          </Card>
          <p className="item-subtitle">
            Productgegevens: <a href="https://world.openfoodfacts.org/" target="_blank" rel="noopener noreferrer">Open Food Facts</a> (ODbL). Alleen je zoekterm of barcode gaat daarheen, via de eigen server van deze app.
          </p>
        </>
      )}
    </div>
  );
}

function OffResult({ product, onChoose }: { product: OffProduct; onChoose: (product: OffProduct) => void }) {
  return (
    <div className="list-item">
      <div>
        <p className="item-title">{product.name}</p>
        <p className="item-subtitle">{product.brand ? `${product.brand} · ` : ''}{format(product.per100.kcal, 'kcal')} per 100 g · eiwit {format(product.per100.protein, 'g')}</p>
      </div>
      <Button type="button" variant="secondary" onClick={() => onChoose(product)} aria-label={`Kies ${product.name}`}>Kies</Button>
    </div>
  );
}

function SearchPanel({ onChoose, onManual }: { onChoose: (product: OffProduct) => void; onManual: () => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<OffProduct[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function search(event: FormEvent) {
    event.preventDefault();
    setMessage('');
    setBusy(true);
    try {
      setResults(await searchProducts(query));
    } catch (cause) {
      setResults(null);
      setMessage(cause instanceof Error ? cause.message : 'Zoeken is mislukt.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={(event) => void search(event)}>
      <Field label="Product zoeken" hint="Zoeken gebeurt pas als je op Zoeken drukt.">
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Bijvoorbeeld: volle yoghurt" maxLength={60} />
      </Field>
      <Button type="submit" disabled={busy}>{busy ? 'Zoeken…' : 'Zoeken'}</Button>
      {message && <p className="item-subtitle" role="alert">{message}</p>}
      {results && (results.length ? (
        <div className="list">{results.map((product) => <OffResult key={product.code} product={product} onChoose={onChoose} />)}</div>
      ) : (
        <p className="item-subtitle">Niets gevonden. <button type="button" className="text-button" onClick={onManual}>Zelf invoeren</button></p>
      ))}
    </form>
  );
}

function BarcodePanel({ products, onChoose, onManual }: { products: FoodProduct[]; onChoose: (product: FoodProduct) => void; onManual: () => void }) {
  const [code, setCode] = useState('');
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [notFound, setNotFound] = useState(false);

  const lookup = useCallback(
    async (value: string) => {
      const clean = value.replace(/\D/g, '');
      setCode(clean);
      setMessage('');
      setNotFound(false);
      const known = products.find((product) => product.barcode === clean);
      if (known) {
        onChoose(known);
        return;
      }
      setBusy(true);
      try {
        const product = await lookupBarcode(clean);
        if (product) onChoose(productFromOff(product));
        else setNotFound(true);
      } catch (cause) {
        setMessage(cause instanceof Error ? cause.message : 'Opzoeken is mislukt.');
      } finally {
        setBusy(false);
      }
    },
    [products, onChoose]
  );

  const detected = useCallback(
    (value: string) => {
      setScanning(false);
      void lookup(value);
    },
    [lookup]
  );

  return (
    <div className="stack">
      {scanning ? (
        <Scanner onDetected={detected} onClose={() => setScanning(false)} />
      ) : scannerAvailable() ? (
        <Button type="button" variant="secondary" onClick={() => setScanning(true)}>📷 Scan met de camera</Button>
      ) : (
        <p className="item-subtitle">Scannen werkt in deze browser niet (op iPhone bijvoorbeeld). Typ de cijfers onder de streepjescode in.</p>
      )}
      <form className="stack" onSubmit={(event) => { event.preventDefault(); void lookup(code); }}>
        <Field label="Barcode" hint="8 tot 14 cijfers">
          <input type="text" inputMode="numeric" autoComplete="off" value={code} onChange={(event) => setCode(event.target.value)} />
        </Field>
        <Button type="submit" disabled={busy}>{busy ? 'Opzoeken…' : 'Opzoeken'}</Button>
      </form>
      {message && <p className="item-subtitle" role="alert">{message}</p>}
      {notFound && <p className="item-subtitle">Dit product staat niet (volledig) in Open Food Facts. <button type="button" className="text-button" onClick={onManual}>Zelf invoeren</button></p>}
    </div>
  );
}

function OwnProductForm({ onDone }: { onDone: (product: FoodProduct) => void }) {
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [values, setValues] = useState<Record<keyof Nutrients, string>>({ kcal: '', protein: '', carbs: '', fat: '' });
  const [serving, setServing] = useState('');
  const [formError, setFormError] = useState('');

  function submit(event: FormEvent) {
    event.preventDefault();
    setFormError('');
    try {
      const per100 = Object.fromEntries(
        NUTRIENT_KEYS.map((key) => {
          const value = parseNumber(values[key]);
          if (value === null || Number.isNaN(value)) throw new Error(`Vul ${nutrientLabels[key].toLowerCase()} per 100 g in (0 mag).`);
          return [key, key === 'kcal' ? Math.round(value) : Math.round(value * 10) / 10];
        })
      ) as unknown as Nutrients;
      const servingValue = parseNumber(serving);
      if (Number.isNaN(servingValue)) throw new Error('Portie moet een getal zijn.');
      const product: FoodProduct = { id: `eigen:${newId()}`, name: name.trim(), brand: brand.trim(), barcode: null, per100, servingGrams: servingValue, source: 'eigen', updatedAt: new Date().toISOString() };
      validateProduct(product);
      onDone(product);
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Het product bevat ongeldige gegevens.');
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <div className="form-grid">
        <Field label="Naam"><input type="text" maxLength={120} value={name} onChange={(event) => setName(event.target.value)} /></Field>
        <Field label="Merk" hint="Optioneel"><input type="text" maxLength={80} value={brand} onChange={(event) => setBrand(event.target.value)} /></Field>
        {NUTRIENT_KEYS.map((key) => (
          <Field key={key} label={`${nutrientLabels[key]} per 100 g (${unitFor(key)})`}>
            <input type="text" inputMode="decimal" autoComplete="off" value={values[key]} onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))} />
          </Field>
        ))}
        <Field label="Gebruikelijke portie (g)" hint="Optioneel"><input type="text" inputMode="decimal" autoComplete="off" value={serving} onChange={(event) => setServing(event.target.value)} /></Field>
      </div>
      {formError && <ErrorBanner message={formError} />}
      <div className="form-actions"><Button type="submit">Verder</Button></div>
    </form>
  );
}

function AmountForm({ product, date, onBack, onSave }: { product: FoodProduct; date: string; onBack: () => void; onSave: (product: FoodProduct, entry: FoodEntry) => Promise<boolean> }) {
  const navigate = useNavigate();
  const [grams, setGrams] = useState(String(product.servingGrams ?? 100).replace('.', ','));
  const [meal, setMeal] = useState<Meal>(defaultMeal());
  const [formError, setFormError] = useState('');
  const amount = parseNumber(grams);
  const preview = amount && amount > 0 ? nutrientsFor({ per100: product.per100, grams: amount }) : null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError('');
    try {
      if (amount === null || Number.isNaN(amount)) throw new Error('Vul de hoeveelheid in grammen in.');
      const entry = makeEntry(product, { id: newId(), date, meal, grams: amount });
      validateFoodEntry(entry, todayKey());
      if (await onSave({ ...product, updatedAt: new Date().toISOString() }, entry)) navigate(date === todayKey() ? '/' : `/?datum=${date}`);
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'De registratie bevat ongeldige gegevens.');
    }
  }

  return (
    <Card title={product.brand ? `${product.name} (${product.brand})` : product.name}>
      <p className="item-subtitle">Per 100 g: {format(product.per100.kcal, 'kcal')} · eiwit {format(product.per100.protein, 'g')} · koolhydraten {format(product.per100.carbs, 'g')} · vet {format(product.per100.fat, 'g')}</p>
      <form onSubmit={(event) => void submit(event)} noValidate>
        <div className="form-grid">
          <Field label="Hoeveelheid (g)" {...(product.servingGrams ? { hint: `Eén portie is ${product.servingGrams} g` } : {})}>
            <input type="text" inputMode="decimal" autoComplete="off" value={grams} onChange={(event) => setGrams(event.target.value)} />
          </Field>
          <Field label="Maaltijd">
            <select value={meal} onChange={(event) => isMeal(event.target.value) && setMeal(event.target.value)}>
              {MEALS.map((item) => <option key={item} value={item}>{mealLabels[item]}</option>)}
            </select>
          </Field>
        </div>
        {preview && <p className="notice">Dit is {format(preview.kcal, 'kcal')} · eiwit {format(preview.protein, 'g')} · koolhydraten {format(preview.carbs, 'g')} · vet {format(preview.fat, 'g')}</p>}
        {formError && <ErrorBanner message={formError} />}
        <div className="form-actions">
          <Button type="button" variant="secondary" onClick={onBack}>Ander product</Button>
          <Button type="submit">Opslaan</Button>
        </div>
      </form>
    </Card>
  );
}

function ProductsPage({ products, error, onDelete }: { products: FoodProduct[]; error: string; onDelete: (id: string) => void }) {
  return (
    <div className="stack">
      {error && <ErrorBanner message={error} />}
      <PageHeader eyebrow="Voeding" title="Ingrediënten" description="Je ingrediëntenbibliotheek: producten die je hebt gebruikt of zelf hebt ingevoerd. Verwijderen verandert je eerdere registraties niet." />
      <Card>
        {products.length ? (
          <div className="list">
            {products.map((product) => (
              <div className="list-item" key={product.id}>
                <div>
                  <p className="item-title"><Link to={`/producten/${encodeURIComponent(product.id)}`}>{product.name}{product.brand ? ` (${product.brand})` : ''}</Link></p>
                  <p className="item-subtitle">{format(product.per100.kcal, 'kcal')} per 100 g · {product.source === 'off' ? 'Open Food Facts' : 'Zelf ingevoerd'}</p>
                </div>
                <div className="row">
                  {product.source === 'off' && <StatusPill>ODbL</StatusPill>}
                  <ConfirmAction label={`${product.name} verwijderen`} confirmMessage="Dit product uit je lijst verwijderen?" onConfirm={() => onDelete(product.id)}>Verwijderen</ConfirmAction>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="Nog geen producten">Producten verschijnen hier zodra je iets toevoegt.</EmptyState>
        )}
      </Card>
    </div>
  );
}

function SettingsPage({ settings, error, onSave }: { settings: FoodSettings; error: string; onSave: (settings: FoodSettings) => Promise<boolean> }) {
  const [kcal, setKcal] = useState(settings.kcalTarget ? String(settings.kcalTarget) : '');
  const [protein, setProtein] = useState(settings.proteinTarget ? String(settings.proteinTarget) : '');
  const [formError, setFormError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setKcal(settings.kcalTarget ? String(settings.kcalTarget) : '');
    setProtein(settings.proteinTarget ? String(settings.proteinTarget) : '');
  }, [settings]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError('');
    setSaved(false);
    try {
      const toInt = (raw: string) => {
        const value = parseNumber(raw);
        if (Number.isNaN(value)) throw new Error('Vul een getal in.');
        return value === null ? null : Math.round(value);
      };
      const next: FoodSettings = { ...settings, id: 'settings', kcalTarget: toInt(kcal), proteinTarget: toInt(protein) };
      validateSettings(next);
      setSaved(await onSave(next));
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'De instellingen zijn ongeldig.');
    }
  }

  return (
    <div className="stack">
      {error && <ErrorBanner message={error} />}
      <PageHeader eyebrow="Voeding" title="Instellingen" description="Doelen zijn optioneel en alleen voor jezelf." />
      <Card title="Dagdoelen">
        <form onSubmit={(event) => void submit(event)} noValidate>
          <div className="form-grid">
            <Field label="Energie (kcal per dag)" hint="Optioneel, 800–6000"><input type="text" inputMode="numeric" value={kcal} onChange={(event) => setKcal(event.target.value)} /></Field>
            <Field label="Eiwit (g per dag)" hint="Optioneel, 10–400"><input type="text" inputMode="numeric" value={protein} onChange={(event) => setProtein(event.target.value)} /></Field>
          </div>
          {formError && <ErrorBanner message={formError} />}
          {saved && <p role="status"><StatusPill tone="good">Opgeslagen</StatusPill></p>}
          <div className="form-actions"><Button type="submit">Doelen opslaan</Button></div>
        </form>
      </Card>
      <Card title="Privacy en bronnen">
        <p className="item-subtitle">
          Wat je eet blijft op dit apparaat. Bij zoeken of scannen gaat alleen de zoekterm of barcode via de eigen server van deze app naar Open Food Facts; er gaan geen persoonsgegevens mee. Het dashboard ziet alleen óf je vandaag iets hebt geregistreerd.
        </p>
        <p className="item-subtitle">
          Productgegevens: <a href="https://world.openfoodfacts.org/" target="_blank" rel="noopener noreferrer">Open Food Facts</a>, beschikbaar onder de Open Database License (ODbL). Waarden kunnen onvolledig zijn; controleer bij twijfel het etiket.
        </p>
      </Card>
    </div>
  );
}
