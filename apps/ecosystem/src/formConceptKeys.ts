/**
 * Formulieren die niet-opgeslagen invoer bewaren bij vergrendelen (ADR 0031 § 3). Eén concept per
 * formulier; in de kluisbuild versleuteld als PE-waarde (zie `vault/localData.ts`). Bewust een vaste
 * lijst: een onbekende sleutel wordt in de kluisbuild geweigerd.
 */
export const FORM_CONCEPT_IDS = [
  'groei.doel',
  'groei.actie',
  'groei.gewoonte',
  'groei.vaardigheid',
  'groei.evaluatie',
  'kennis.bron',
  'kennis.highlight',
  'kennis.inzicht',
  'lichaam.meting',
  'lichaam.profiel',
  'duur.training',
  'duur.activiteit',
  'duur.instellingen'
] as const;

export type FormConceptId = (typeof FORM_CONCEPT_IDS)[number];

export const FORM_CONCEPT_PREFIX = 'personal-ecosystem.concept.';

export const formConceptKey = (id: FormConceptId) => `${FORM_CONCEPT_PREFIX}${id}`;

export const FORM_CONCEPT_KEYS = FORM_CONCEPT_IDS.map(formConceptKey);
