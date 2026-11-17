/**
 * Het enige netwerkverkeer van Kracht: de eigen doorgeefroute op dezelfde origin (worker/index.ts).
 * Er gaat alleen een zoekterm of het ID van een wger-oefening mee; nooit trainingen, schema's of gewichten.
 */
import { isWgerExercise, isWgerSearchItem, type WgerDetailResponse, type WgerExercise, type WgerSearchItem, type WgerSearchResponse } from './wger';

async function request<T>(path: string, fallback: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { headers: { accept: 'application/json' }, credentials: 'omit', referrerPolicy: 'no-referrer' });
  } catch {
    throw new Error('Geen verbinding. Kies een basisoefening of voer er zelf een in.');
  }
  const body = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok || !body) throw new Error(body?.error ?? fallback);
  return body;
}

export async function searchWger(raw: string): Promise<WgerSearchItem[]> {
  const query = raw.replace(/\s+/g, ' ').trim().slice(0, 60);
  if (query.length < 2) throw new Error('Typ minstens twee tekens.');
  const body = await request<WgerSearchResponse>(`/api/kracht/oefeningen?q=${encodeURIComponent(query)}`, 'Zoeken in wger is mislukt. Kies een basisoefening of voer er zelf een in.');
  if (!Array.isArray(body.exercises)) throw new Error('Zoeken in wger is mislukt. Kies een basisoefening of voer er zelf een in.');
  return body.exercises.filter(isWgerSearchItem);
}

/** Haalt naam, licentie en auteur van één oefening op. Null als wger geen bruikbare licentie geeft. */
export async function fetchWgerExercise(id: number): Promise<WgerExercise | null> {
  if (!Number.isInteger(id) || id <= 0) throw new Error('Ongeldige oefening.');
  const body = await request<WgerDetailResponse>(`/api/kracht/oefening/${id}`, 'De licentie van deze oefening kon niet worden opgehaald. Probeer het later opnieuw.');
  return body.found && isWgerExercise(body.exercise) ? body.exercise : null;
}
