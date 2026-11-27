import { validateLocalExport, type LocalDatabase, type LocalExport, type RecordValue } from '@ecosystem/storage';
import { canonicalJson } from '../../../backup';
import { validateVoedingBackup } from '../backup';
import { databaseConfig } from '../storage';

/** Call only after explicit export consent in an unlocked vault; the caller must save the plaintext backup. */
export async function prepareVoedingBackup(database: LocalDatabase): Promise<LocalExport> {
  if (database.appId !== 'voeding') throw new Error('De database hoort niet bij Voeding.');
  const backup = await database.exportData();
  database.validateRestore(backup);
  validateVoedingBackup(backup);
  return structuredClone(backup);
}

export interface RunRecord {
  recipeId: string;
  originKey: string;
  lineIds: string[];
}

function list(data: LocalExport, name: string): RecordValue[] {
  const records = data.stores[name];
  if (!records) throw new Error(`Store ${name} ontbreekt.`);
  return records;
}

function hasValue(value: unknown, target: string): boolean {
  if (value === target) return true;
  if (Array.isArray(value)) return value.some((entry) => hasValue(entry, target));
  if (value && typeof value === 'object') return Object.values(value).some((entry) => hasValue(entry, target));
  return false;
}

/**
 * Prepare, but never execute, a selective rollback. The post-import snapshot and manifest must be
 * captured by a future importer. Refuse changes, pre-existing IDs and references rather than deleting them.
 */
export function prepareRunRollback(
  before: LocalExport, after: LocalExport, current: LocalExport, records: readonly RunRecord[]
): LocalExport {
  for (const snapshot of [before, after, current]) {
    if (snapshot.appId !== 'voeding' || snapshot.format !== 'personal-ecosystem-local-data' || snapshot.schemaVersion !== current.schemaVersion) {
      throw new Error('Back-ups zijn niet van dezelfde Voeding-schemaversie.');
    }
    validateVoedingBackup(validateLocalExport(databaseConfig, snapshot));
  }
  const recipeIds = records.map((record) => record.recipeId);
  const lineIds = records.flatMap((record) => record.lineIds);
  if (!records.length || new Set(recipeIds).size !== recipeIds.length || new Set(lineIds).size !== lineIds.length ||
      records.some((record) => !record.recipeId || !record.originKey || !record.lineIds.length)) {
    throw new Error('Ongeldig importrunmanifest.');
  }
  for (const record of records) {
    const beforeRecipe = list(before, 'recipes').find((entry) => entry.id === record.recipeId);
    const afterRecipe = list(after, 'recipes').find((entry) => entry.id === record.recipeId);
    const currentRecipe = list(current, 'recipes').find((entry) => entry.id === record.recipeId);
    if (beforeRecipe || !afterRecipe || !currentRecipe || canonicalJson(afterRecipe) !== canonicalJson(currentRecipe) ||
        !hasOriginKey(afterRecipe, record.originKey)) throw new Error('Recept is niet nieuw, gewijzigd of heeft een andere herkomst.');
    const afterLines = list(after, 'recipeIngredients').filter((entry) => 'recipeId' in entry && entry.recipeId === record.recipeId);
    const currentLines = list(current, 'recipeIngredients').filter((entry) => 'recipeId' in entry && entry.recipeId === record.recipeId);
    if (afterLines.length !== record.lineIds.length || currentLines.length !== record.lineIds.length ||
        afterLines.some((entry) => !record.lineIds.includes(entry.id)) ||
        currentLines.some((entry) => !record.lineIds.includes(entry.id))) throw new Error('Ingrediëntregels zijn gewijzigd.');
    for (const id of record.lineIds) {
      const oldLine = list(before, 'recipeIngredients').find((entry) => entry.id === id);
      const savedLine = afterLines.find((entry) => entry.id === id);
      const currentLine = currentLines.find((entry) => entry.id === id);
      if (oldLine || !savedLine || !currentLine || canonicalJson(savedLine) !== canonicalJson(currentLine)) throw new Error('Ingrediëntregel is niet nieuw of is gewijzigd.');
    }
    for (const [store, entries] of Object.entries(current.stores)) {
      const otherEntries = store === 'recipes' ? entries.filter((entry) => !recipeIds.includes(entry.id))
        : store === 'recipeIngredients' ? entries.filter((entry) => !lineIds.includes(entry.id)) : entries;
      if (otherEntries.some((entry) => hasValue(entry, record.recipeId) || record.lineIds.some((id) => hasValue(entry, id)))) {
        throw new Error('Een ander record verwijst naar de importrun; handmatige controle vereist.');
      }
    }
  }
  const result = structuredClone(current);
  result.stores.recipes = list(result, 'recipes').filter((entry) => !recipeIds.includes(entry.id));
  result.stores.recipeIngredients = list(result, 'recipeIngredients').filter((entry) => !lineIds.includes(entry.id));
  validateVoedingBackup(result);
  return result;
}

function hasOriginKey(record: RecordValue, key: string): boolean {
  if (!('origin' in record) || !record.origin || typeof record.origin !== 'object' ||
      !('source' in record.origin) || record.origin.source !== 'notion' ||
      !('key' in record.origin) || !record.origin.key || typeof record.origin.key !== 'object') return false;
  return 'value' in record.origin.key && record.origin.key.value === key;
}
