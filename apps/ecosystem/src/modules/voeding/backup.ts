import { validateFoodEntry, validateProduct, validateSettings } from './domain';
import { validatePlan, validatePlannedMeal } from './planner';
import { validateRecipe, validateRecipeIngredient } from './recipes';

/** Stores die schema 2 toevoegt (ADR 0026 § 1). Een back-up van schema 1 heeft ze niet; ze beginnen dan leeg. */
export const VOEDING_V2_STORES = ['recipes', 'recipeIngredients', 'nutritionPlans', 'plannedMeals'] as const;

export function validateVoedingBackup(input: unknown): void {
  if (!input || typeof input !== 'object' || !('stores' in input) || !input.stores || typeof input.stores !== 'object') {
    throw new Error('Back-up van Voeding heeft geen geldige gegevenssectie.');
  }
  const stores = input.stores as Record<string, unknown>;
  if (!Array.isArray(stores.entries) || !Array.isArray(stores.products) || !Array.isArray(stores.settings)) {
    throw new Error('Back-up van Voeding mist registraties, producten of instellingen.');
  }
  for (const entry of stores.entries) validateFoodEntry(entry);
  for (const product of stores.products) validateProduct(product);
  if (stores.settings.length > 1) throw new Error('Back-up van Voeding bevat meer dan één instelling.');
  for (const settings of stores.settings) validateSettings(settings);
  for (const store of VOEDING_V2_STORES) {
    if (stores[store] !== undefined && !Array.isArray(stores[store])) throw new Error(`Back-up van Voeding heeft een ongeldige lijst ${store}.`);
  }
  const list = (store: string) => (stores[store] as unknown[] | undefined) ?? [];
  for (const recipe of list('recipes')) validateRecipe(recipe);
  for (const line of list('recipeIngredients')) validateRecipeIngredient(line);
  for (const plan of list('nutritionPlans')) validatePlan(plan);
  for (const meal of list('plannedMeals')) validatePlannedMeal(meal);
}
