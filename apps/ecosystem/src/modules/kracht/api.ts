/**
 * Het enige netwerkverkeer van Kracht: de eigen doorgeefroute op dezelfde origin (worker/index.ts).
 * Er gaat alleen een zoekterm mee; nooit trainingen, schema's of gewichten.
 */
import { isWgerExercise, type WgerExercise, type WgerSearchResponse } from './wger';

export async function searchWger(raw: string): Promise<WgerExercise[]> {
  const query = raw.replace(/\s+/g, ' ').trim().slice(0, 60);
  if (query.length < 2) throw new Error('Typ minstens twee tekens.');
  let response: Response;
  try {
    response = await fetch(`/api/kracht/oefeningen?q=${encodeURIComponent(query)}`, { headers: { accept: 'application/json' }, credentials: 'omit', referrerPolicy: 'no-referrer' });
  } catch {
    throw new Error('Geen verbinding. Kies een basisoefening of voer er zelf een in.');
  }
  const body = (await response.json().catch(() => null)) as (WgerSearchResponse & { error?: string }) | null;
  if (!response.ok || !body || !Array.isArray(body.exercises)) throw new Error(body?.error ?? 'Zoeken in wger is mislukt. Kies een basisoefening of voer er zelf een in.');
  return body.exercises.filter(isWgerExercise);
}
