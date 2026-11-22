/** Optionele velden van schema 2 voor producten (ADR 0026 § 1), zonder afhankelijkheden zodat `domain.ts` ze kan gebruiken. */
export const BASES = ['100g', '100ml', 'portion'] as const;
export type Basis = (typeof BASES)[number];
export const basisLabels: Record<Basis, string> = { '100g': 'per 100 g', '100ml': 'per 100 ml', portion: 'per portie' };

export const UNITS = ['g', 'ml', 'stuk', 'portie'] as const;
export type Unit = (typeof UNITS)[number];
export const unitLabels: Record<Unit, string> = { g: 'g', ml: 'ml', stuk: 'stuk', portie: 'portie' };

export const PRICE_UNITS = ['kg', 'l', 'stuk'] as const;
export type PriceUnit = (typeof PRICE_UNITS)[number];

/** Ingrediëntvelden die schema 2 aan een product toevoegt; allemaal optioneel (ADR 0026 § 1). */
export interface IngredientFields {
  category?: string;
  basis?: Basis;
  portionGrams?: number | null;
  fiber?: number | null;
  pricePerUnitCents?: number | null;
  priceUnit?: PriceUnit | null;
  allergens?: string[];
  origin?: unknown;
}

function fail(message: string): never {
  throw new Error(message);
}

function isText(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length <= max;
}

export function isTagList(value: unknown, maxItems = 30): value is string[] {
  return Array.isArray(value) && value.length <= maxItems && value.every((item) => typeof item === 'string' && item.trim().length > 0 && item.length <= 60);
}

/** Controleert de optionele schema 2-velden van een product; schema 1-producten zijn zonder deze velden geldig. */
export function validateIngredientFields(value: unknown): void {
  const product = value as IngredientFields;
  if (product.category !== undefined && !isText(product.category, 60)) fail('Categorie is te lang (maximaal 60 tekens).');
  if (product.basis !== undefined && !(BASES as readonly string[]).includes(product.basis)) fail('Onbekende basis voor de voedingswaarden.');
  if (product.portionGrams !== undefined && product.portionGrams !== null && !(typeof product.portionGrams === 'number' && product.portionGrams > 0 && product.portionGrams <= 2000)) {
    fail('Portie moet tussen 0 en 2000 g of ml liggen.');
  }
  if (product.basis === 'portion' && !(typeof product.portionGrams === 'number' && product.portionGrams > 0)) fail('Bij waarden per portie hoort het gewicht van één portie.');
  if (product.fiber !== undefined && product.fiber !== null && !(typeof product.fiber === 'number' && product.fiber >= 0 && product.fiber <= 100)) fail('Vezels moeten tussen 0 en 100 g liggen.');
  if (product.pricePerUnitCents !== undefined && product.pricePerUnitCents !== null) {
    if (!(Number.isInteger(product.pricePerUnitCents) && product.pricePerUnitCents >= 0 && product.pricePerUnitCents <= 100_000)) fail('Prijs moet tussen € 0 en € 1.000 liggen.');
    if (!product.priceUnit || !(PRICE_UNITS as readonly string[]).includes(product.priceUnit)) fail('Kies waar de prijs voor geldt (kg, liter of stuk).');
  }
  if (product.allergens !== undefined && !isTagList(product.allergens)) fail('Allergenen zijn ongeldig.');
}

