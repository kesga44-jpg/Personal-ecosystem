import { describe, expect, it } from 'vitest';
import { openLocalDatabase, type LocalExport } from '@ecosystem/storage';
import csv from './fixtures/recipes.csv?raw';
import markdown from './fixtures/Voorbeeldpap 11111111111111111111111111111111.md?raw';
import { inspectRecipePageCoverage, parseCsv, parseRecipeExport, validateImportedRecipe, type RecipeExport } from './notion';
import { mapRecipe, matchIngredient, previewRecipes } from './preview';
import { prepareRunRollback, prepareVoedingBackup } from './recovery';
import { databaseConfig } from '../storage';
import type { Ingredient } from '../recipes';

const now = '2026-11-22T10:00:00.000Z';
const input: RecipeExport = {
  csv: { path: 'Recepten_all.csv', content: csv },
  pages: [{ path: 'Recepten/Voorbeeldpap 11111111111111111111111111111111.md', content: markdown }],
  databaseId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', databaseName: 'Voorbeeld', exportedAt: now
};
const product = (id: string, name: string): Ingredient => ({
  id, name, brand: '', barcode: null, per100: { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  servingGrams: null, source: 'eigen', updatedAt: now
});
const products = [product('p1', 'Havermout'), product('p2', 'Melk')];
const ids = { recipe: 'r1', lines: ['l1', 'l2'] };

async function example() {
  const [source] = await parseRecipeExport(input);
  return mapRecipe(source!, products, ids, now);
}

describe('synthetische Notion-recepten', () => {
  it('leest CSV met quotes en nieuwe regels en weigert kapotte CSV', () => {
    expect(parseCsv('\uFEFFNaam,Notitie\r\n"Een, twee","regel 1\nregel ""2"""\r\n')).toEqual([
      ['Naam', 'Notitie'], ['Een, twee', 'regel 1\nregel "2"']
    ]);
    expect(() => parseCsv('Naam\n"kapot')).toThrow('Niet-afgesloten');
  });

  it('bewaart de paginaherkomst en de inhoud zonder waarden te verzinnen', async () => {
    const [source] = await parseRecipeExport(input);
    expect(source).toMatchObject({
      name: 'Voorbeeldpap', servings: 2, nutrition: [], micronutrients: [],
      ingredients: [
        { name: 'Havermout', amount: 100, unit: 'g', original: '- 100 g Havermout' },
        { name: 'Melk', amount: 200, unit: 'ml', original: '- 200 ml Melk' }
      ],
      origin: { key: { kind: 'notion_page_id', value: '11111111111111111111111111111111' }, rowMatch: { method: 'unique_title', confidence: 'bevestigd' } }
    });
    expect(source!.ingredients).toHaveLength(2);
    expect(source!.steps).toHaveLength(2);
  });

  it('bewaart onbekende hoeveelheden, bronwaarden en verwijzingen zonder ze op te slaan', async () => {
    const content = markdown.replace('100 g Havermout', 'een beetje Havermout') +
      '\n## Voedingswaarden\n- Energie: 120 kcal\n\n## Micronutriënten\n- IJzer: onbekend\n\n![foto](files/voorbeeld.png)\n';
    const [source] = await parseRecipeExport({ ...input, pages: [{ ...input.pages[0]!, content }] });
    expect(source!.ingredients[0]).toMatchObject({ amount: null, original: '- een beetje Havermout' });
    expect(source!.nutrition).toEqual([{ name: 'Energie', value: '120 kcal' }]);
    expect(source!.micronutrients[0]).toEqual({ name: 'IJzer', value: 'onbekend' });
    expect(source!.attachments).toEqual([{ name: 'voorbeeld.png', path: 'files/voorbeeld.png' }]);
    const mapped = await mapRecipe(source!, products, ids, now);
    expect(mapped.recipe).toBeNull();
    expect(mapped.report.errors.join(' ')).toContain('Bronvoedingswaarden');
    expect(mapped.report.missing).toContain('Hoeveelheid of eenheid');
    expect(mapped.report.warnings.join(' ')).toContain('brontekst');
  });

  it('gebruikt geen tegenstrijdige of dubbelzinnige pagina; vervangende sleutels zijn stabiel en onderscheiden identieke rijen', async () => {
    const repeated = { ...input, csv: { ...input.csv, content: `${csv}${csv.split('\n')[1]}\n` } };
    const first = await parseRecipeExport(repeated);
    const second = await parseRecipeExport(repeated);
    expect(first.map((item) => item.origin.key)).toEqual(second.map((item) => item.origin.key));
    expect(first[0]!.origin.key.kind).toBe('replacement_key');
    expect(first[0]!.origin.key.value).not.toBe(first[1]!.origin.key.value);
    const [contradiction] = await parseRecipeExport({ ...input, pages: [{ ...input.pages[0]!, content: markdown.replace('Porties: 2', 'Porties: 3') }] });
    expect(contradiction!.origin.key.kind).toBe('replacement_key');
    expect(contradiction!.sourceMarkdown).toBeNull();
    const pathMismatch: RecipeExport = {
      ...input,
      csv: { ...input.csv, content: 'Naam,Porties,Categorie,Tags\nVoorbeeldpap,2,ontbijt,abc../snel\n' },
      pages: [{ ...input.pages[0]!, content: markdown.replace('Tags: snel', 'Tags: abcsnel') }]
    };
    const [notMatched] = await parseRecipeExport(pathMismatch);
    expect(notMatched!.origin.key.kind).toBe('replacement_key');
  });

  it('blokkeert een aannemelijke paginakoppeling en niet-herkende pagina-inhoud', async () => {
    const other = { path: 'Recepten/Voorbeeldpap 22222222222222222222222222222222.md', content: markdown.replace('Porties: 2', 'Porties: 3') };
    const [probable] = await parseRecipeExport({ ...input, pages: [input.pages[0]!, other] });
    expect(probable!.origin.rowMatch.confidence).toBe('aannemelijk');
    expect((await mapRecipe(probable!, products, ids, now)).recipe).toBeNull();
    const [unrecognized] = await parseRecipeExport({ ...input, pages: [{ ...input.pages[0]!, content: markdown.replace('## Ingrediënten', 'Extra toelichting.\n\n## Ingrediënten') }] });
    expect(unrecognized!.warnings.join(' ')).toContain('Niet-herkende pagina-inhoud');
    expect((await mapRecipe(unrecognized!, products, ids, now)).recipe).toBeNull();
  });

  it('koppelt dubbele titels alleen op onderscheidende eigenschappen en blijft controle vereisen', async () => {
    const sameName = {
      ...input,
      csv: { ...input.csv, content: 'Naam,Porties,Categorie,Tags\nVoorbeeldpap,2,ontbijt,snel\nVoorbeeldpap,3,ontbijt,snel\n' },
      pages: [
        input.pages[0]!,
        { path: 'Recepten/Voorbeeldpap 22222222222222222222222222222222.md', content: markdown.replace('Porties: 2', 'Porties: 3') }
      ]
    };
    const rows = await parseRecipeExport(sameName);
    expect(rows.map((row) => row.origin.key.value)).toEqual([
      '11111111111111111111111111111111', '22222222222222222222222222222222'
    ]);
    expect(rows.map((row) => row.origin.rowMatch)).toMatchObject([
      { method: 'properties', confidence: 'aannemelijk' },
      { method: 'properties', confidence: 'aannemelijk' }
    ]);
    expect((await mapRecipe(rows[0]!, products, ids, now)).recipe).toBeNull();
    const reversed = await parseRecipeExport({ ...sameName, pages: [...sameName.pages].reverse() });
    expect(reversed.map((row) => row.origin)).toEqual(rows.map((row) => row.origin));
  });

  it('gebruikt geen pagina voor twee rijen, ook niet als de rijen inhoudelijk verschillen', async () => {
    const repeated = {
      ...input,
      csv: { ...input.csv, content: 'Naam,Porties,Categorie,Tags\nVoorbeeldpap,2,ontbijt,"snel\nextra"\nVoorbeeldpap,2,ontbijt,snel\n' }
    };
    const rows = await parseRecipeExport(repeated);
    expect(rows.map((row) => row.origin.key.kind)).toEqual(['replacement_key', 'replacement_key']);
    expect(rows[0]!.origin.key.value).not.toBe(rows[1]!.origin.key.value);
    expect(rows.every((row) => row.sourceMarkdown === null)).toBe(true);
  });

  it('vergelijkt relatieve bijlagepaden alleen binnen Markdown-links', async () => {
    const withAttachment = {
      ...input,
      csv: { ...input.csv, content: 'Naam,Porties,Categorie,Tags,Bestand\nVoorbeeldpap,2,ontbijt,snel,[foto](foto.png)\n' },
      pages: [{ ...input.pages[0]!, content: markdown.replace('Tags: snel', 'Tags: snel\nBestand: [foto](../map/foto.png)') }]
    };
    const [match] = await parseRecipeExport(withAttachment);
    expect(match!.origin.key.kind).toBe('notion_page_id');
    expect(match!.origin.sourceRow.cells[4]).toBe('[foto](foto.png)');
    const different = { ...withAttachment, pages: [{ ...withAttachment.pages[0]!, content: withAttachment.pages[0]!.content.replace('../map/foto.png', '../map/ander.png') }] };
    expect((await parseRecipeExport(different))[0]!.origin.key.kind).toBe('replacement_key');
    const multiple = {
      ...withAttachment,
      csv: { ...withAttachment.csv, content: withAttachment.csv.content.replace('[foto](foto.png)', '[foto](foto.png) [ander](map1/b.png)') },
      pages: [{ ...withAttachment.pages[0]!, content: withAttachment.pages[0]!.content.replace('[foto](../map/foto.png)', '[foto](../map/foto.png) [ander](map2/b.png)') }]
    };
    expect((await parseRecipeExport(multiple))[0]!.origin.key.kind).toBe('replacement_key');
  });

  it('meldt de laatst overgebleven koppeling door eliminatie altijd als onzeker', async () => {
    const example: RecipeExport = {
      ...input,
      csv: { ...input.csv, content: 'Naam,Porties,Categorie,Tags,Bestand\nVoorbeeldpap,2,ontbijt,snel,[foto](map1/foto.png)\nVoorbeeldpap,2,ontbijt,snel,[foto](../foto.png)\n' },
      pages: [
        { ...input.pages[0]!, content: markdown.replace('Tags: snel', 'Tags: snel\nBestand: [foto](map1/foto.png)') },
        { path: 'Recepten/Voorbeeldpap 22222222222222222222222222222222.md', content: markdown.replace('Tags: snel', 'Tags: snel\nBestand: [foto](map2/foto.png)') }
      ]
    };
    const rows = await parseRecipeExport(example);
    expect(rows.map((row) => row.origin.rowMatch)).toMatchObject([
      { method: 'properties', confidence: 'aannemelijk' },
      { method: 'elimination', confidence: 'onzeker' }
    ]);
    expect(rows.map((row) => row.origin.key.value)).toEqual([
      '11111111111111111111111111111111', '22222222222222222222222222222222'
    ]);
    expect((await mapRecipe(rows[1]!, products, ids, now)).recipe).toBeNull();
    const reordered = await parseRecipeExport({ ...example, pages: [...example.pages].reverse() });
    expect(reordered.map((row) => row.origin)).toEqual(rows.map((row) => row.origin));
  });

  it('onderscheidt ongebruikte pagina’s zonder rij van onduidelijke koppelingen', async () => {
    const duplicate = { path: 'Recepten/Voorbeeldpap 22222222222222222222222222222222.md', content: markdown };
    const other = { path: 'Recepten/Los 33333333333333333333333333333333.md', content: '# Los\n' };
    const invalid = { path: 'Recepten/zonder-id.md', content: '# Los\n' };
    const coverage = await inspectRecipePageCoverage({ ...input, pages: [input.pages[0]!, duplicate, other, invalid] });
    expect(coverage.withoutRow).toEqual([{ id: '33333333333333333333333333333333', path: other.path }]);
    expect(coverage.ambiguous).toEqual([
      { id: '11111111111111111111111111111111', path: input.pages[0]!.path },
      { id: '22222222222222222222222222222222', path: duplicate.path }
    ]);
    expect(coverage.unrecognizedPaths).toEqual([invalid.path]);
    expect((await inspectRecipePageCoverage(input)).ambiguous).toEqual([]);
    const probable = { ...input, pages: [input.pages[0]!, { ...duplicate, content: markdown.replace('Porties: 2', 'Porties: 3') }] };
    expect((await inspectRecipePageCoverage(probable)).ambiguous).toHaveLength(2);
  });

  it('weigert ongeldige tussenformaten en herkomst', async () => {
    const [source] = await parseRecipeExport(input);
    expect(() => validateImportedRecipe(null)).toThrow('Ongeldig tussenformaat');
    expect(() => validateImportedRecipe({ ...source, origin: { ...source!.origin, key: { kind: 'notion_page_id', value: 'ongeldig' } } })).toThrow('Ongeldig tussenformaat');
  });

  it('koppelt alleen een unieke exacte ingrediëntnaam; andere matches vereisen bevestiging', () => {
    expect(matchIngredient(' HAVERMOUT ', products)).toEqual({ kind: 'exact', productId: 'p1' });
    expect(matchIngredient('Melk', [...products, product('p3', 'melk')]).kind).toBe('review');
    expect(matchIngredient('Havermout fijn', products).kind).toBe('review');
    expect(matchIngredient('Appel', products).kind).toBe('new');
  });

  it('maakt gevalideerde kandidaatregels en rapporteert ontbrekende velden en onzekere matches', async () => {
    const mapped = await example();
    expect(mapped.report.errors).toEqual([]);
    expect(mapped.recipe).toMatchObject({ name: 'Voorbeeldpap', servings: 2, origin: { source: 'notion' } });
    expect(mapped.lines.map((line) => [line.productId, line.amount, line.unit])).toEqual([['p1', 100, 'g'], ['p2', 200, 'ml']]);
    const [source] = await parseRecipeExport(input);
    const unresolved = await mapRecipe({ ...source!, servings: null }, [product('p3', 'Havermout fijn')], ids, now);
    expect(unresolved.report.missing).toContain('Aantal porties');
    expect(unresolved.report.matches.map((item) => item.match.kind)).toEqual(['review', 'new']);
    expect(unresolved.recipe).toBeNull();
  });

  it('is een zuivere droogloop: herhalen is ongewijzigd, wijzigingen zijn conflict, uitsluiting blijft overgeslagen', async () => {
    const mapped = await example();
    expect(mapped.recipe).not.toBeNull();
    expect(previewRecipes([mapped], [], [])[0]!.status).toBe('new');
    const recipe = mapped.recipe!;
    expect(previewRecipes([mapped], [recipe], mapped.lines)[0]!.status).toBe('unchanged');
    expect(previewRecipes([mapped], [{ ...recipe, notes: 'Eigen wijziging' }], mapped.lines)[0]!.status).toBe('conflict');
    expect(previewRecipes([mapped], [], [], { tombstoneKeys: [mapped.source.origin.key.value] })[0]!.status).toBe('skipped');
    expect(previewRecipes([mapped], [], [], { excludedKeys: [mapped.source.origin.key.value] })[0]!.status).toBe('skipped');
    expect(previewRecipes([mapped, mapped], [], []).map((item) => item.status)).toEqual(['conflict', 'conflict']);
    const duplicate = previewRecipes([mapped], [{ ...recipe, id: 'existing', origin: undefined }], []);
    expect(duplicate[0]!.mapped.report.duplicates).toHaveLength(1);
    expect(mapped.report.duplicates).toEqual([]);
  });

  it('wijziging van broninhoud veroorzaakt conflict, geen automatische overschrijving', async () => {
    const old = await example();
    const [changed] = await parseRecipeExport({ ...input, pages: [{ ...input.pages[0]!, content: markdown.replace('Verwarm kort.', 'Roer kort.') }] });
    const next = await mapRecipe(changed!, products, ids, now);
    expect(previewRecipes([next], [old.recipe!], old.lines)[0]!.status).toBe('conflict');
  });
});

describe('back-up en terugdraaiplan', () => {
  it('exporteert vooraf en bereidt alleen ongewijzigde nieuwe runrecords voor verwijdering voor', async () => {
    const db = await openLocalDatabase({ ...databaseConfig, databaseName: `synthetic-migration-${crypto.randomUUID()}` });
    try {
      const before = await prepareVoedingBackup(db);
      const mapped = await example();
      await db.put('recipes', mapped.recipe!);
      for (const line of mapped.lines) await db.put('recipeIngredients', line);
      const after = await prepareVoedingBackup(db);
      const manifest = [{ recipeId: 'r1', originKey: mapped.source.origin.key.value, lineIds: ['l1', 'l2'] }];
      const plan = prepareRunRollback(before, after, after, manifest);
      expect(plan.stores.recipes).toEqual([]);
      expect(plan.stores.recipeIngredients).toEqual([]);
      expect((await db.list('recipes'))).toHaveLength(1);
      const changed: LocalExport = structuredClone(after);
      const changedRecipe = { ...mapped.recipe!, notes: 'gewijzigd' };
      changed.stores.recipes = [changedRecipe];
      expect(() => prepareRunRollback(before, after, changed, manifest)).toThrow('gewijzigd');
      expect(() => prepareRunRollback(before, after, after, [{ ...manifest[0]!, originKey: 'andere' }])).toThrow('herkomst');
      expect(() => prepareRunRollback(after, after, after, manifest)).toThrow('niet nieuw');
      const referenced = structuredClone(after);
      const meal = { id: 'm1', planId: 'plan', date: '2026-11-22', meal: 'ontbijt', servings: 1, recipeId: 'r1', items: [], note: '', createdAt: now, updatedAt: now };
      referenced.stores.plannedMeals = [meal];
      expect(() => prepareRunRollback(before, after, referenced, manifest)).toThrow('verwijst');
    } finally { db.close(); }
  });
});
