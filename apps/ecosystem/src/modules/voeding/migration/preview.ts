import { originProblems, type ImportOrigin } from '@ecosystem/core';
import { canonicalJson, sha256Hex } from '../../../backup';
import { validateRecipe, validateRecipeIngredient, type Ingredient, type Recipe, type RecipeIngredient, type Unit } from '../recipes';
import { validateImportedRecipe, type ImportedRecipe, type SourceIngredient } from './notion';

export type IngredientMatch =
  | { kind: 'exact'; productId: string }
  | { kind: 'review'; candidates: string[] }
  | { kind: 'new'; candidates: [] };

function normalizedName(name: string): string {
  return name.normalize('NFC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('nl-NL');
}

export function matchIngredient(name: string, products: readonly Ingredient[]): IngredientMatch {
  const normalized = normalizedName(name);
  const exact = products.filter((product) => normalizedName(product.name) === normalized);
  if (exact.length === 1) return { kind: 'exact', productId: exact[0]!.id };
  if (exact.length > 1) return { kind: 'review', candidates: exact.map((product) => product.id) };
  const possible = normalized ? products.filter((product) => {
    const candidate = normalizedName(product.name);
    return candidate.length >= 3 && normalized.length >= 3 && (candidate.includes(normalized) || normalized.includes(candidate));
  }) : [];
  return possible.length ? { kind: 'review', candidates: possible.map((product) => product.id) } : { kind: 'new', candidates: [] };
}

function unit(value: string | null): Unit | null {
  if (value === 'stuks') return 'stuk';
  if (value === 'porties') return 'portie';
  return value === 'g' || value === 'ml' || value === 'stuk' || value === 'portie' ? value : null;
}

export interface RecipeReport {
  errors: string[];
  warnings: string[];
  missing: string[];
  matches: { source: SourceIngredient; match: IngredientMatch }[];
  duplicates: string[];
}

export interface MappedRecipe {
  source: ImportedRecipe;
  report: RecipeReport;
  recipe: Recipe | null;
  lines: RecipeIngredient[];
}

export async function mapRecipe(
  source: ImportedRecipe,
  products: readonly Ingredient[],
  ids: { recipe: string; lines: readonly string[] },
  importedAt: string
): Promise<MappedRecipe> {
  validateImportedRecipe(source);
  const report: RecipeReport = {
    errors: [], warnings: [...source.warnings], missing: [], duplicates: [],
    matches: source.ingredients.map((item) => ({ source: item, match: matchIngredient(item.name, products) }))
  };
  if (!source.name.trim()) report.missing.push('Naam');
  if (source.servings === null) report.missing.push('Aantal porties');
  if (!source.ingredients.length) report.missing.push('Ingrediënten');
  if (!source.steps.length) report.missing.push('Bereidingsstappen');
  if (source.categories.length > 1) report.errors.push('Meerdere categorieën passen niet in het receptmodel.');
  if (source.nutrition.length || source.micronutrients.length) report.errors.push('Bronvoedingswaarden passen niet in het receptmodel.');
  if (source.attachments.length) report.errors.push('Bijlageverwijzingen passen niet in het receptmodel.');
  if (source.warnings.some((warning) => warning.startsWith('Niet-herkende'))) report.errors.push('Niet-herkende broninhoud vereist controle.');
  if (source.origin.rowMatch.confidence === 'aannemelijk' || source.origin.rowMatch.confidence === 'onzeker') {
    report.errors.push('Paginakoppeling vereist goedkeuring.');
  }
  if (!source.sourceMarkdown) report.errors.push('Paginainhoud ontbreekt of is niet gekoppeld.');
  if (ids.lines.length !== source.ingredients.length || new Set(ids.lines).size !== ids.lines.length) report.errors.push('Ingrediëntregel-ID’s zijn onvolledig of dubbel.');
  const lines: RecipeIngredient[] = [];
  report.matches.forEach(({ source: item, match }, index) => {
    if (match.kind !== 'exact') report.errors.push(match.kind === 'new' ? 'Nieuw ingrediënt (te bevestigen).' : 'Ingrediëntmatch vereist controle.');
    const parsedUnit = unit(item.unit);
    if (item.amount === null || parsedUnit === null) report.missing.push('Hoeveelheid of eenheid');
    if (match.kind === 'exact' && item.amount !== null && parsedUnit !== null && ids.lines[index]) {
      const line: RecipeIngredient = { id: ids.lines[index]!, recipeId: ids.recipe, productId: match.productId, amount: item.amount, unit: parsedUnit, note: item.original };
      try { validateRecipeIngredient(line); lines.push(line); }
      catch (error) { report.errors.push(error instanceof Error ? error.message : 'Ongeldige ingrediëntregel.'); }
    }
  });
  if (!Number.isFinite(Date.parse(importedAt))) report.errors.push('Ongeldig importtijdstip.');
  if (source.servings === null) return { source, report, recipe: null, lines };
  const origin: ImportOrigin = { ...source.origin, importedAt, importedHash: '' };
  report.errors.push(...originProblems(origin));
  const recipe: Recipe = {
    id: ids.recipe, name: source.name, description: '', steps: source.steps, prepMinutes: null,
    servings: source.servings, category: source.categories[0] ?? '', labels: source.tags,
    allergens: [], notes: '', favorite: false, origin, createdAt: importedAt, updatedAt: importedAt
  };
  try { validateRecipe(recipe); }
  catch (error) { report.errors.push(error instanceof Error ? error.message : 'Ongeldig recept.'); }
  origin.importedHash = await sha256Hex(canonicalJson(comparable(recipe, lines)));
  return { source, report, recipe: report.errors.length || report.missing.length ? null : recipe, lines };
}

function comparable(recipe: Recipe, lines: readonly RecipeIngredient[]): unknown {
  return {
    name: recipe.name, description: recipe.description, steps: recipe.steps, prepMinutes: recipe.prepMinutes,
    servings: recipe.servings, category: recipe.category, labels: recipe.labels, allergens: recipe.allergens,
    notes: recipe.notes, favorite: recipe.favorite,
    lines: lines.map((line) => ({ productId: line.productId, amount: line.amount, unit: line.unit, note: line.note }))
      .sort((a, b) => canonicalJson(a).localeCompare(canonicalJson(b)))
  };
}

function originOf(recipe: Recipe): ImportOrigin | null {
  const origin = recipe.origin;
  if (!origin || typeof origin !== 'object' || !('source' in origin) || origin.source !== 'notion' ||
      !('key' in origin) || !origin.key || typeof origin.key !== 'object' ||
      !('value' in origin.key) || typeof origin.key.value !== 'string' ||
      !('databaseId' in origin) || typeof origin.databaseId !== 'string' ||
      !('sourceHash' in origin) || typeof origin.sourceHash !== 'string' ||
      ('previousKeys' in origin && (!Array.isArray(origin.previousKeys) ||
        !origin.previousKeys.every((key: unknown) => !!key && typeof key === 'object' &&
          'value' in key && typeof key.value === 'string')))) return null;
  return origin as ImportOrigin;
}

export type PreviewStatus = 'new' | 'unchanged' | 'conflict' | 'skipped';
export interface PreviewItem {
  status: PreviewStatus;
  reason: string;
  mapped: MappedRecipe;
}

/** Pure dry run: never writes or allocates persistent IDs. */
export function previewRecipes(
  mapped: readonly MappedRecipe[],
  existing: readonly Recipe[],
  existingLines: readonly RecipeIngredient[],
  options: { excludedKeys?: readonly string[]; tombstoneKeys?: readonly string[] } = {}
): PreviewItem[] {
  const keys = mapped.map((item) => item.source.origin.key.value);
  return mapped.map((input): PreviewItem => {
    const item: MappedRecipe = { ...input, report: { ...input.report, duplicates: [...input.report.duplicates] } };
    const key = item.source.origin.key.value;
    const found = existing.filter((recipe) => {
      const origin = originOf(recipe);
      return origin && (origin.key.value === key || origin.previousKeys?.some((previous) => previous.value === key));
    });
    const duplicateName = existing.filter((recipe) => normalizedName(recipe.name) === normalizedName(item.source.name) && !found.includes(recipe));
    if (duplicateName.length) item.report.duplicates.push('Een bestaand recept heeft dezelfde naam; geen automatische samenvoeging.');
    if (mapped.filter((other) => normalizedName(other.source.name) === normalizedName(item.source.name)).length > 1) {
      item.report.duplicates.push('Meerdere bronrijen hebben dezelfde naam; geen automatische samenvoeging.');
    }
    if (keys.filter((value) => value === key).length > 1 || found.length > 1) {
      return { status: 'conflict', reason: 'Dubbele herkomstsleutel.', mapped: item };
    }
    if (options.excludedKeys?.includes(key)) return { status: 'skipped', reason: 'Uitgesloten.', mapped: item };
    if (options.tombstoneKeys?.includes(key)) return { status: 'skipped', reason: 'Eerder verwijderd.', mapped: item };
    if (existing.some((recipe) => recipe.origin && typeof recipe.origin === 'object' &&
        'source' in recipe.origin && recipe.origin.source === 'notion' && !originOf(recipe))) {
      return { status: 'skipped', reason: 'Ongeldige bestaande Notion-herkomst vereist controle.', mapped: item };
    }
    if (!item.recipe) return { status: 'skipped', reason: 'Validatie of controle vereist.', mapped: item };
    const old = found[0];
    if (old) {
      const origin = originOf(old)!;
      const sameSource = origin.sourceHash === item.source.origin.sourceHash;
      const sameContent = canonicalJson(comparable(old, existingLines.filter((line) => line.recipeId === old.id))) === canonicalJson(comparable(item.recipe, item.lines));
      return sameSource && sameContent
        ? { status: 'unchanged', reason: 'Bron en recept zijn gelijk.', mapped: item }
        : { status: 'conflict', reason: 'Bron of bestaand recept verschilt; geen overschrijving.', mapped: item };
    }
    if (item.source.origin.key.kind === 'replacement_key' && existing.some((recipe) => originOf(recipe)?.databaseId === item.source.origin.databaseId)) {
      return { status: 'skipped', reason: 'Nieuwe vervangende sleutel vereist een keuze van de eigenaar.', mapped: item };
    }
    return { status: 'new', reason: 'Nieuw recept.', mapped: item };
  });
}
