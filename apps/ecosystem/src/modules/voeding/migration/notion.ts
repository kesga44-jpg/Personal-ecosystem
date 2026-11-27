import {
  computeReplacementKey, fitCells, isNotionPageId, isReplacementKeyValue, MATCH_RULES_VERSION,
  normalizeCell, normalizeColumnName, occurrenceNumbers, originProblems, type ImportOrigin, type ImportKey, type RowMatch
} from '@ecosystem/core';
import { sha256Hex } from '../../../backup';

export interface SourceIngredient {
  name: string;
  amount: number | null;
  unit: string | null;
  original: string;
}

export interface SourceMeasure {
  name: string;
  value: string;
}

export interface SourceAttachment {
  name: string;
  path: string;
}

export type RecipeProvenance = Omit<ImportOrigin, 'importedAt' | 'importedHash'>;

export interface ImportedRecipe {
  name: string;
  ingredients: SourceIngredient[];
  servings: number | null;
  steps: string[];
  nutrition: SourceMeasure[];
  micronutrients: SourceMeasure[];
  categories: string[];
  tags: string[];
  attachments: SourceAttachment[];
  origin: RecipeProvenance;
  sourceMarkdown: string | null;
  warnings: string[];
}

export interface NotionFile {
  path: string;
  content: string;
}

export interface RecipeExport {
  csv: NotionFile;
  pages: readonly NotionFile[];
  databaseId: string;
  databaseName: string;
  exportedAt: string;
}

export interface RecipePageCoverage {
  withoutRow: { id: string; path: string }[];
  ambiguous: { id: string; path: string }[];
  unrecognizedPaths: string[];
}

export function validateImportedRecipe(input: unknown): asserts input is ImportedRecipe {
  if (!input || typeof input !== 'object') throw new Error('Ongeldig tussenformaat voor recept.');
  const value = input as ImportedRecipe;
  if (typeof value.name !== 'string' || !Array.isArray(value.ingredients) ||
      !value.ingredients.every((item) => !!item && typeof item === 'object' && typeof item.name === 'string' && typeof item.original === 'string' &&
        (item.amount === null || (Number.isFinite(item.amount) && item.amount > 0)) &&
        (item.unit === null || typeof item.unit === 'string')) ||
      !(value.servings === null || (Number.isInteger(value.servings) && value.servings > 0)) ||
      ![value.steps, value.categories, value.tags, value.warnings].every((items) => Array.isArray(items) && items.every((item) => typeof item === 'string')) ||
      ![value.nutrition, value.micronutrients].every((items) => Array.isArray(items) && items.every((item) => !!item && typeof item === 'object' && typeof item.name === 'string' && typeof item.value === 'string')) ||
      !Array.isArray(value.attachments) || !value.attachments.every((item) => !!item && typeof item === 'object' && typeof item.name === 'string' && typeof item.path === 'string') ||
      !(value.sourceMarkdown === null || typeof value.sourceMarkdown === 'string') ||
      !value.origin || typeof value.origin !== 'object' || value.origin.source !== 'notion' ||
      typeof value.origin.sourceHash !== 'string' || !/^[0-9a-f]{64}$/u.test(value.origin.sourceHash) ||
      typeof value.origin.databaseId !== 'string' || !isNotionPageId(value.origin.databaseId) ||
      typeof value.origin.databaseName !== 'string' || typeof value.origin.mapper !== 'string' ||
      typeof value.origin.exportedAt !== 'string' || !Number.isFinite(Date.parse(value.origin.exportedAt)) ||
      !value.origin.key || typeof value.origin.key !== 'object' ||
      !(value.origin.key.kind === 'notion_page_id' && typeof value.origin.key.value === 'string' && isNotionPageId(value.origin.key.value) ||
        value.origin.key.kind === 'replacement_key' && typeof value.origin.key.value === 'string' && isReplacementKeyValue(value.origin.key.value)) ||
      !value.origin.rowMatch || typeof value.origin.rowMatch !== 'object' ||
      !value.origin.sourceRow || typeof value.origin.sourceRow !== 'object' ||
      typeof value.origin.sourceRow.file !== 'string' || !Number.isInteger(value.origin.sourceRow.rowNumber) || value.origin.sourceRow.rowNumber < 1 ||
      !Array.isArray(value.origin.sourceRow.columns) || !value.origin.sourceRow.columns.every((column) => typeof column === 'string') ||
      !Array.isArray(value.origin.sourceRow.cells) || !value.origin.sourceRow.cells.every((cell) => typeof cell === 'string')) {
    throw new Error('Ongeldig tussenformaat voor recept.');
  }
  if (originProblems({ ...value.origin, importedAt: '', importedHash: '' }).length) {
    throw new Error('Ongeldige herkomst in tussenformaat voor recept.');
  }
  const { key, rowMatch } = value.origin;
  if (!['unique_title', 'properties', 'elimination', 'manual_verification', 'none'].includes(rowMatch.method) ||
      !Number.isInteger(rowMatch.candidates) || rowMatch.candidates < 0 ||
      !Number.isInteger(rowMatch.comparedColumns) || rowMatch.comparedColumns < 0 ||
      (key.kind === 'replacement_key' && (key.version !== 'rk1' || key.normalization !== 'notion-csv-1' ||
        key.databaseId !== value.origin.databaseId || !Array.isArray(key.columns) || !key.columns.every((item) => typeof item === 'string') ||
        !Array.isArray(key.cells) || !key.cells.every((item) => typeof item === 'string') ||
        key.columns.length !== key.cells.length || !Number.isInteger(key.occurrence) || key.occurrence < 1))) {
    throw new Error('Ongeldige herkomst in tussenformaat voor recept.');
  }
}

interface Page {
  file: NotionFile;
  id: string;
  title: string;
  properties: Map<string, string>;
}

/** RFC 4180-style comma-separated data, including quoted line breaks and escaped quotes. */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^\uFEFF/u, '').replace(/\r\n?/gu, '\n');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let closed = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') { quoted = false; closed = true; }
      else cell += c;
    } else if (c === '"' && !cell && !closed) {
      quoted = true;
    } else if (c === ',' || c === '\n') {
      row.push(cell); cell = ''; closed = false;
      if (c === '\n') { rows.push(row); row = []; }
    } else if (c === '"' || closed) {
      throw new Error('Ongeldige CSV-aanhaling.');
    } else {
      cell += c;
    }
  }
  if (quoted) throw new Error('Niet-afgesloten CSV-aanhaling.');
  if (cell || row.length || closed) { row.push(cell); rows.push(row); }
  return rows;
}

function firstLine(value: string): string {
  return value.split('\n')[0]!.replace(/\s+/gu, ' ').trim();
}

function equalAttachments(left: string, right: string): boolean {
  const pattern = /(!?\[[^\]]*\])\(([^)]+)\)/gu;
  const leftLinks = [...left.matchAll(pattern)];
  const rightLinks = [...right.matchAll(pattern)];
  if (!leftLinks.length || leftLinks.length !== rightLinks.length ||
      [...leftLinks, ...rightLinks].some((match) => /^(?:[a-z][a-z0-9+.-]*:|\/|#)/iu.test(match[2]!))) return false;
  const normalize = (value: string) => {
    let index = 0;
    return value.replace(pattern, (_match, label: string, path: string) => {
      const leftPath = leftLinks[index]![2]!;
      const rightPath = rightLinks[index]![2]!;
      index++;
      const relative = /^(?:\.\.\/)+/u.test(leftPath) || /^(?:\.\.\/)+/u.test(rightPath);
      return `${label}(${relative ? path.split('/').pop() : path})`;
    });
  };
  return normalize(left) === normalize(right);
}

function readPage(file: NotionFile): Page | null {
  const id = file.path.match(/(?:^|\/)[^/]*?([0-9a-f]{32})\.md$/iu)?.[1]?.toLowerCase();
  if (!id) return null;
  const lines = normalizeCell(file.content).split('\n');
  const titleIndex = lines.findIndex((line) => /^# /u.test(line));
  const title = titleIndex < 0 ? '' : lines[titleIndex]!.slice(2).trim();
  const properties = new Map<string, string>();
  for (const line of lines.slice(titleIndex + 1)) {
    if (/^#{1,6}\s/u.test(line)) break;
    const match = line.match(/^([^:]+):\s*(.*)$/u);
    if (match) properties.set(normalizeColumnName(match[1]!), match[2]!);
  }
  return { file, id, title, properties };
}

function comparePage(page: Page, columns: string[], cells: string[], titleIndex: number): { contradicts: boolean; compared: number } {
  let compared = 0;
  let contradicts = false;
  columns.forEach((column, index) => {
    if (index === titleIndex) return;
    const csvValue = firstLine(cells[index] ?? '');
    const pageValue = firstLine(page.properties.get(normalizeColumnName(column)) ?? '');
    if (csvValue) compared++;
    if (csvValue !== pageValue && !equalAttachments(csvValue, pageValue)) contradicts = true;
  });
  return { contradicts, compared };
}

interface PageCandidate {
  page: Page;
  compared: number;
}

interface RowCandidates {
  title: string;
  candidates: Page[];
  comparable: PageCandidate[];
}

interface PageMatch {
  candidate: PageCandidate;
  method: 'unique_title' | 'properties' | 'elimination';
}

function matchPages(rows: RowCandidates[]): (PageMatch | undefined)[] {
  const matches: (PageMatch | undefined)[] = rows.map(() => undefined);
  const selected = rows.map((row) => {
    if (row.comparable.length !== 1) return undefined;
    if (row.title && row.candidates.length === 1) return { candidate: row.comparable[0]!, method: 'unique_title' as const };
    if ((!row.title || row.candidates.length > 1) && row.comparable[0]!.compared > 0) {
      return { candidate: row.comparable[0]!, method: 'properties' as const };
    }
    return undefined;
  });
  const used = new Set<string>();
  selected.forEach((selection, index) => {
    if (!selection || selected.filter((other) => other?.candidate.page.id === selection.candidate.page.id).length !== 1) return;
    matches[index] = selection;
    used.add(selection.candidate.page.id);
  });

  rows.forEach((row, index) => {
    if (matches[index] || row.comparable.length < 2) return;
    const group = rows.map((other, otherIndex) => ({ other, otherIndex })).filter(({ other }) => other.title === row.title);
    if (group.length < 2 || group.filter(({ otherIndex }) => !matches[otherIndex]).length !== 1) return;
    const remaining = row.comparable.filter((candidate) => !used.has(candidate.page.id));
    if (remaining.length !== 1) return;
    const candidate = remaining[0]!;
    if (rows.some((other, otherIndex) => otherIndex !== index && !matches[otherIndex] &&
      other.comparable.some((option) => option.page.id === candidate.page.id))) return;
    matches[index] = { candidate, method: 'elimination' };
    used.add(candidate.page.id);
  });
  return matches;
}

function sectionLines(markdown: string): Map<string, string[]> {
  const sections = new Map<string, string[]>();
  let section = '';
  for (const line of normalizeCell(markdown).split('\n')) {
    const heading = line.match(/^#{2,6}\s+(.+?)\s*$/u);
    if (heading) {
      section = heading[1]!.toLocaleLowerCase('nl-NL');
      if (!sections.has(section)) sections.set(section, []);
    } else if (section) sections.get(section)!.push(line);
  }
  return sections;
}

function itemLines(lines: string[] = []): string[] {
  return lines.map((line) => line.replace(/^\s*(?:[-*]\s+|\d+[.)]\s+)/u, '').trim()).filter(Boolean);
}

function ingredient(original: string): SourceIngredient {
  const text = original.replace(/^\s*(?:[-*]\s+|\d+[.)]\s+)/u, '').trim();
  const match = text.match(/^(\d+(?:[.,]\d+)?)\s+(g|ml|stuk|stuks|portie|porties)\s+(.+)$/iu);
  if (!match) return { name: text, amount: null, unit: null, original };
  const amount = Number(match[1]!.replace(',', '.'));
  if (!Number.isFinite(amount) || amount <= 0) return { name: match[3]!.trim(), amount: null, unit: match[2]!.toLocaleLowerCase('nl-NL'), original };
  return { name: match[3]!.trim(), amount, unit: match[2]!.toLocaleLowerCase('nl-NL'), original };
}

function measures(lines: string[] = []): SourceMeasure[] {
  return itemLines(lines).map((line) => {
    const index = line.indexOf(':');
    return index < 0 ? { name: line, value: '' } : { name: line.slice(0, index).trim(), value: line.slice(index + 1).trim() };
  });
}

function attachments(markdown: string): SourceAttachment[] {
  const result: SourceAttachment[] = [];
  for (const match of markdown.matchAll(/!?\[([^\]]*)\]\(([^)]+)\)/gu)) {
    const path = match[2]!.trim();
    if (!/^(?:[a-z][a-z0-9+.-]*:|#|\/)/iu.test(path)) result.push({ name: path.split('/').pop() || path, path });
  }
  return result;
}

function hasUnrecognizedPreamble(markdown: string): boolean {
  const lines = normalizeCell(markdown).split('\n');
  const titleIndex = lines.findIndex((line) => /^# /u.test(line));
  if (titleIndex < 0) return true;
  for (const line of lines.slice(titleIndex + 1)) {
    if (/^#{1,6}\s/u.test(line)) break;
    if (line.trim() && !/^[^:]+:\s*.*$/u.test(line)) return true;
  }
  return lines.slice(0, titleIndex).some((line) => line.trim());
}

/** Parse a declared recipe export in memory. No page is used unless the CSV row matches it. */
export async function parseRecipeExport(input: RecipeExport): Promise<ImportedRecipe[]> {
  if (!/^[0-9a-f]{32}$/u.test(input.databaseId) || !Number.isFinite(Date.parse(input.exportedAt))) {
    throw new Error('Ongeldige database-ID of exportdatum.');
  }

  const csvRows = parseCsv(input.csv.content);
  const columns = csvRows.shift();
  if (!columns?.length) throw new Error('CSV-kolomkoppen ontbreken.');
  const normalizedColumns = columns.map(normalizeColumnName);
  if (new Set(normalizedColumns).size !== columns.length) throw new Error('Dubbele CSV-kolomnamen.');
  const titleIndex = normalizedColumns.findIndex((column) => column === 'Name' || column === 'Naam');
  if (titleIndex < 0) throw new Error('CSV mist kolom Name of Naam.');
  const rows = csvRows.map((row) => fitCells(row, columns.length));
  const occurrences = occurrenceNumbers(rows);
  const pages = input.pages.map(readPage).filter((page): page is Page => page !== null);
  const ids = pages.map((page) => page.id);
  if (new Set(ids).size !== ids.length) throw new Error('Dubbele pagina-ID in export.');
  const rowCandidates = rows.map((cells): RowCandidates => {
    const title = firstLine(cells[titleIndex] ?? '');
    const candidates = pages.filter((page) => title ? firstLine(page.title) === title : !page.title || page.title === 'Untitled');
    const comparable = candidates.map((page) => ({ page, ...comparePage(page, columns, cells, titleIndex) })).filter((candidate) => !candidate.contradicts);
    return { title, candidates, comparable };
  });
  const matches = matchPages(rowCandidates);
  return Promise.all(rows.map(async (cells, index) => {
    const name = cells[titleIndex]!.trim();
    const candidateSet = rowCandidates[index]!;
    const match = matches[index];
    const matched = match?.candidate;
    const rowMatch: RowMatch = match
      ? { method: match.method, confidence: match.method === 'unique_title' ? 'bevestigd' : match.method === 'properties' ? 'aannemelijk' : 'onzeker', candidates: candidateSet.candidates.length, comparedColumns: match.candidate.compared, matchRules: MATCH_RULES_VERSION }
      : { method: 'none', confidence: 'niet_van_toepassing', candidates: candidateSet.candidates.length, comparedColumns: 0, matchRules: MATCH_RULES_VERSION };
    const key: ImportKey = matched
      ? { kind: 'notion_page_id', value: matched.page.id }
      : await computeReplacementKey({ databaseId: input.databaseId, columns, cells, occurrence: occurrences[index]! });
    const sourceRow = { file: input.csv.path, rowNumber: index + 1, columns: [...columns], cells };
    const markdown = matched?.page.file.content ?? null;
    const sections = sectionLines(markdown ?? '');
    const ingredients = (sections.get('ingrediënten') ?? []).filter((line) => line.trim()).map(ingredient);
    const column = (label: string) => cells[normalizedColumns.indexOf(label)]?.trim() ?? '';
    const servingsText = column('Porties');
    const servingsValue = /^\d+$/u.test(servingsText) ? Number(servingsText) : 0;
    const servings = Number.isSafeInteger(servingsValue) && servingsValue > 0 ? servingsValue : null;
    const warnings: string[] = [];
    if (!matched) warnings.push('Geen eenduidige paginakoppeling; paginainhoud ontbreekt.');
    if (matched && match?.method !== 'unique_title') warnings.push('Paginakoppeling vereist controle.');
    if (servingsText && servings === null) warnings.push('Aantal porties is onleesbaar.');
    if (ingredients.some((line) => line.amount === null)) warnings.push('Een hoeveelheid of eenheid is onbekend; brontekst is bewaard.');
    const knownSections = new Set(['ingrediënten', 'bereiding', 'voedingswaarden', 'micronutriënten']);
    if ([...sections.keys()].some((section) => !knownSections.has(section))) warnings.push('Niet-herkende Markdown-secties zijn alleen als brontekst bewaard.');
    const knownColumns = new Set(['Name', 'Naam', 'Porties', 'Categorie', 'Tags']);
    if (normalizedColumns.some((column, i) => !knownColumns.has(column) && cells[i]?.trim())) {
      warnings.push('Niet-herkende CSV-kolommen zijn alleen als brontekst bewaard.');
    }
    if (matched && [...matched.page.properties.keys()].some((column) => !normalizedColumns.includes(column))) {
      warnings.push('Niet-herkende pagina-eigenschappen zijn alleen als brontekst bewaard.');
    }
    if (markdown && (hasUnrecognizedPreamble(markdown) || /!?\[[^\]]*\]\((?:[a-z][a-z0-9+.-]*:|\/|#)/iu.test(markdown))) {
      warnings.push('Niet-herkende pagina-inhoud is alleen als brontekst bewaard.');
    }
    const result: ImportedRecipe = {
      name, ingredients, servings, steps: itemLines(sections.get('bereiding')),
      nutrition: measures(sections.get('voedingswaarden')), micronutrients: measures(sections.get('micronutriënten')),
      categories: column('Categorie').split(',').map((item) => item.trim()).filter(Boolean),
      tags: column('Tags').split(',').map((item) => item.trim()).filter(Boolean),
      attachments: attachments(markdown ?? ''), sourceMarkdown: markdown, warnings,
      origin: {
        source: 'notion', key, rowMatch, sourceRow, databaseId: input.databaseId,
        databaseName: input.databaseName, exportedAt: input.exportedAt, mapper: 'notion-voeding-recipes@1',
        sourceHash: await sha256Hex(JSON.stringify([normalizedColumns, cells]))
      }
    };
    validateImportedRecipe(result);
    return result;
  }));
}

/** Classify supplied recipe pages without claiming that an ambiguous title has no CSV row. */
export async function inspectRecipePageCoverage(input: RecipeExport): Promise<RecipePageCoverage> {
  const rows = await parseRecipeExport(input);
  const linked = new Set(rows.filter((row) => row.origin.key.kind === 'notion_page_id' &&
    (row.origin.rowMatch.confidence === 'bevestigd' || row.origin.rowMatch.confidence === 'handmatig_bevestigd'))
    .map((row) => row.origin.key.value));
  const result: RecipePageCoverage = { withoutRow: [], ambiguous: [], unrecognizedPaths: [] };
  for (const file of input.pages) {
    const page = readPage(file);
    if (!page) {
      result.unrecognizedPaths.push(file.path);
      continue;
    }
    if (linked.has(page.id)) continue;
    const hasCandidate = rows.some((row) => {
      const title = firstLine(row.name);
      return title ? firstLine(page.title) === title : !page.title || page.title === 'Untitled';
    });
    const target = hasCandidate ? result.ambiguous : result.withoutRow;
    target.push({ id: page.id, path: page.file.path });
  }
  return result;
}
