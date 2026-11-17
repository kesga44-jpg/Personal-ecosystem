/**
 * Ingebouwde basisoefeningen (eigen tekst, geen externe bron). Werkt offline.
 * Extra oefeningen komen uit wger (CC-licentie per oefening, met auteur) of voer je zelf in.
 */

export const CATEGORIES = ['benen', 'borst', 'rug', 'schouders', 'armen', 'core', 'hele lichaam', 'overig'] as const;
export type Category = (typeof CATEGORIES)[number];

export const EQUIPMENT = ['lichaamsgewicht', 'halter', 'dumbbell', 'kettlebell', 'machine', 'kabel', 'band', 'overig'] as const;
export type Equipment = (typeof EQUIPMENT)[number];

/** gewicht: herhalingen + kg · lichaam: herhalingen (eventueel extra kg) · tijd: seconden. */
export const KINDS = ['gewicht', 'lichaam', 'tijd'] as const;
export type Kind = (typeof KINDS)[number];

export interface WgerSource {
  id: number;
  license: string;
  licenseUrl: string;
  author: string;
}

export interface Exercise {
  id: string;
  name: string;
  category: Category;
  equipment: Equipment;
  kind: Kind;
  source: 'basis' | 'eigen' | 'wger';
  wger: WgerSource | null;
}

type Basic = [id: string, name: string, category: Category, equipment: Equipment, kind: Kind];

const BASIC: Basic[] = [
  ['squat', 'Squat', 'benen', 'halter', 'gewicht'],
  ['goblet-squat', 'Goblet squat', 'benen', 'kettlebell', 'gewicht'],
  ['lunge', 'Lunge', 'benen', 'dumbbell', 'gewicht'],
  ['split-squat', 'Bulgaarse split squat', 'benen', 'dumbbell', 'gewicht'],
  ['deadlift', 'Deadlift', 'benen', 'halter', 'gewicht'],
  ['roemeense-deadlift', 'Roemeense deadlift', 'benen', 'halter', 'gewicht'],
  ['leg-press', 'Leg press', 'benen', 'machine', 'gewicht'],
  ['hip-thrust', 'Hip thrust', 'benen', 'halter', 'gewicht'],
  ['step-up', 'Step-up', 'benen', 'dumbbell', 'gewicht'],
  ['kuitheffen', 'Kuitheffen', 'benen', 'machine', 'gewicht'],
  ['bankdrukken', 'Bankdrukken', 'borst', 'halter', 'gewicht'],
  ['dumbbell-bankdrukken', 'Dumbbell bankdrukken', 'borst', 'dumbbell', 'gewicht'],
  ['schuin-bankdrukken', 'Schuin bankdrukken', 'borst', 'dumbbell', 'gewicht'],
  ['push-up', 'Push-up', 'borst', 'lichaamsgewicht', 'lichaam'],
  ['dips', 'Dips', 'borst', 'lichaamsgewicht', 'lichaam'],
  ['optrekken', 'Optrekken (pull-up)', 'rug', 'lichaamsgewicht', 'lichaam'],
  ['lat-pulldown', 'Lat pulldown', 'rug', 'kabel', 'gewicht'],
  ['halter-roeien', 'Voorovergebogen roeien', 'rug', 'halter', 'gewicht'],
  ['eenarmig-roeien', 'Eenarmig dumbbell roeien', 'rug', 'dumbbell', 'gewicht'],
  ['kabel-roeien', 'Zittend kabelroeien', 'rug', 'kabel', 'gewicht'],
  ['face-pull', 'Face pull', 'schouders', 'kabel', 'gewicht'],
  ['overhead-press', 'Overhead press', 'schouders', 'halter', 'gewicht'],
  ['schouderdrukken', 'Dumbbell schouderdrukken', 'schouders', 'dumbbell', 'gewicht'],
  ['zijwaarts-heffen', 'Zijwaarts heffen', 'schouders', 'dumbbell', 'gewicht'],
  ['biceps-curl', 'Biceps curl', 'armen', 'dumbbell', 'gewicht'],
  ['hamer-curl', 'Hamer curl', 'armen', 'dumbbell', 'gewicht'],
  ['triceps-pushdown', 'Triceps pushdown', 'armen', 'kabel', 'gewicht'],
  ['triceps-boven-hoofd', 'Triceps extensie boven het hoofd', 'armen', 'dumbbell', 'gewicht'],
  ['plank', 'Plank', 'core', 'lichaamsgewicht', 'tijd'],
  ['zijplank', 'Zijplank', 'core', 'lichaamsgewicht', 'tijd'],
  ['crunch', 'Crunch', 'core', 'lichaamsgewicht', 'lichaam'],
  ['knie-heffen-hangend', 'Hangend knieheffen', 'core', 'lichaamsgewicht', 'lichaam'],
  ['dead-bug', 'Dead bug', 'core', 'lichaamsgewicht', 'lichaam'],
  ['russian-twist', 'Russian twist', 'core', 'lichaamsgewicht', 'lichaam'],
  ['kettlebell-swing', 'Kettlebell swing', 'hele lichaam', 'kettlebell', 'gewicht'],
  ['burpee', 'Burpee', 'hele lichaam', 'lichaamsgewicht', 'lichaam'],
  ['farmers-walk', "Farmer's walk", 'hele lichaam', 'dumbbell', 'tijd'],
  ['mountain-climber', 'Mountain climbers', 'hele lichaam', 'lichaamsgewicht', 'tijd'],
  ['jumping-jacks', 'Jumping jacks', 'hele lichaam', 'lichaamsgewicht', 'tijd'],
  ['band-pull-apart', 'Band pull-apart', 'schouders', 'band', 'lichaam']
];

export const BASIC_EXERCISES: readonly Exercise[] = BASIC.map(([id, name, category, equipment, kind]) => ({
  id: `basis:${id}`,
  name,
  category,
  equipment,
  kind,
  source: 'basis',
  wger: null
}));

/** Licenties van wger (opgehaald van https://wger.de/api/v2/license/ op 17-11-2026). */
export const WGER_LICENSES: Record<number, { short: string; url: string }> = {
  1: { short: 'CC-BY-SA 3', url: 'https://creativecommons.org/licenses/by-sa/3.0/deed.en' },
  2: { short: 'CC-BY-SA 4', url: 'https://creativecommons.org/licenses/by-sa/4.0/deed.en' },
  3: { short: 'CC0', url: 'http://creativecommons.org/publicdomain/zero/1.0/' },
  4: { short: 'CC-BY 4', url: 'https://creativecommons.org/licenses/by/4.0/' },
  5: { short: 'ODbL', url: 'https://opendatacommons.org/licenses/odbl/' }
};

export const kindLabels: Record<Kind, string> = { gewicht: 'Herhalingen × kg', lichaam: 'Herhalingen (lichaamsgewicht)', tijd: 'Tijd (seconden)' };
