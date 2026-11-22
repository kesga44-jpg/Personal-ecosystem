/**
 * Leescontracten tussen modules voor koppelingen (ADR 0024 § 3 en Gevolgen).
 *
 * Een module leest een andere module nooit direct. Ze vraagt alleen titels op via `Lookup`
 * en terugverwijzingen via `linksTo`. Beide geven bewust zo weinig mogelijk terug.
 */
import type { EcosystemModuleLink, EcosystemRecordKind, LinkCategory, LinkModuleId } from './links';
import { linkCategoryLabel, parseRecordKind } from './links';

/**
 * Het enige wat een `Lookup` teruggeeft: geen waarden, notities of gezondheidsgegevens.
 *
 * - `kind` is een van de vijf soorten, of ontbreekt als het record daar buiten valt (ADR 0024 § 3a).
 * - `unknownKind: true` als het record een soort heeft die deze versie niet kent. De waarde zelf gaat
 *   niet mee en wordt nooit naar een bekende soort omgezet.
 */
export interface LookupItem {
  id: string;
  title: string;
  kind?: EcosystemRecordKind;
  unknownKind?: true;
}

export type Lookup = (ids: readonly string[]) => Promise<LookupItem[]>;

/**
 * Maakt van willekeurige records precies `{ id, title, kind }`. Elke `Lookup` moet zijn uitvoer hierdoor
 * laten gaan, zodat er nooit per ongeluk extra velden naar een andere module lekken.
 */
export function toLookupItems(records: readonly { id: string; title: string; kind?: unknown }[]): LookupItem[] {
  return records.map(({ id, title, kind }) => {
    const parsed = parseRecordKind(kind);
    const item: LookupItem = { id, title };
    if (parsed.kind) item.kind = parsed.kind;
    if (parsed.unknownKind !== undefined) item.unknownKind = true;
    return item;
  });
}

/** Wat `linksTo` per koppeling teruggeeft: alleen ID's, categorie en titel van de bron. */
export interface LinkToSummary {
  linkId: string;
  from: { module: LinkModuleId; id: string };
  category: LinkCategory;
  categoryLabel: string;
  title: string;
}

export type LinksTo = (module: LinkModuleId, id: string) => Promise<LinkToSummary[]>;

/** Hulpfunctie voor een `linksTo`-implementatie: alleen koppelingen naar dit doel, alleen de toegestane velden. */
export function summarizeLinksTo(
  links: readonly EcosystemModuleLink[],
  target: { module: LinkModuleId; id: string },
  titleOf: (sourceId: string) => string
): LinkToSummary[] {
  return links
    .filter((link) => link.to.module === target.module && link.to.id === target.id)
    .map((link) => ({
      linkId: link.id,
      from: { module: link.from.module, id: link.from.id },
      category: link.category,
      categoryLabel: linkCategoryLabel(link.category),
      title: titleOf(link.from.id)
    }));
}

export const UNAVAILABLE_TARGET_LABEL = 'Niet meer beschikbaar';

export type ResolvedTarget =
  | { status: 'available'; item: LookupItem }
  | { status: 'unavailable'; id: string; label: typeof UNAVAILABLE_TARGET_LABEL };

/**
 * Zoekt de doelen van koppelingen op. Een doel dat niet meer bestaat, breekt de bron niet: het wordt
 * "Niet meer beschikbaar" en de koppeling blijft staan (ADR 0024 § 5). Er wordt nooit iets verwijderd.
 */
export async function resolveTargets(ids: readonly string[], lookup: Lookup): Promise<Map<string, ResolvedTarget>> {
  const unique = [...new Set(ids)];
  let found: LookupItem[] = [];
  try {
    found = toLookupItems(await lookup(unique));
  } catch {
    found = [];
  }
  const byId = new Map(found.map((item) => [item.id, item]));
  return new Map(
    unique.map((id) => {
      const item = byId.get(id);
      return [id, item ? { status: 'available', item } : { status: 'unavailable', id, label: UNAVAILABLE_TARGET_LABEL }];
    })
  );
}
