/**
 * Prototype sync-motor (ADR 0021 § 4, poort P-1). Niet aangesloten op de app en zonder netwerk.
 *
 * - Local-first: de modules blijven op IndexedDB werken; de motor vergelijkt lokale records met de laatst
 *   gesynchroniseerde stand, versleutelt wijzigingen en stuurt ze naar de server.
 * - De server ziet per record alleen module, willekeurige record-ID, versie en het versleutelde blok.
 *   De lokale record-ID (die soms een datum of naam bevat) zit ín het versleutelde blok.
 * - Schrijven met versiecontrole: de server accepteert versie n+1 alleen als hij nu versie n heeft.
 * - Conflicten worden nooit stil opgelost: beide versies blijven bewaard tot de gebruiker kiest.
 */
import { decryptRecord, encryptRecord, randomItemId, type EncryptedItem } from './crypto';

/* ---------- Servercontract (zoals de geplande RPC op `pe.items`) ---------- */

export interface ServerItem extends EncryptedItem {
  /** Oplopend volgnummer van de server, voor ophalen "sinds". */
  seq: number;
}

export type PutResult = { ok: true; seq: number } | { ok: false; current: ServerItem };

export interface SyncServer {
  pull(since: number): Promise<{ items: ServerItem[]; cursor: number }>;
  /** Schrijft `item` als de server nu `expectedVersion` heeft (0 = nieuw); anders conflict met de huidige versie. */
  put(item: EncryptedItem, expectedVersion: number): Promise<PutResult>;
}

/** Server in het geheugen met dezelfde regels als de geplande `security definer`-RPC. Alleen voor het prototype en tests. */
export class MemoryServer implements SyncServer {
  private items = new Map<string, ServerItem>();
  private seq = 0;

  async pull(since: number) {
    const items = [...this.items.values()].filter((item) => item.seq > since).sort((a, b) => a.seq - b.seq);
    return { items: items.map((item) => ({ ...item })), cursor: this.seq };
  }

  async put(item: EncryptedItem, expectedVersion: number): Promise<PutResult> {
    const key = `${item.module}|${item.itemId}`;
    const current = this.items.get(key);
    const currentVersion = current?.version ?? 0;
    if (currentVersion !== expectedVersion || item.version !== expectedVersion + 1) {
      if (!current) throw new Error('Ongeldige versie voor een nieuw record.');
      return { ok: false, current: { ...current } };
    }
    this.seq += 1;
    this.items.set(key, { ...item, seq: this.seq });
    return { ok: true, seq: this.seq };
  }

  /** Wat een beheerder in de database zou zien. */
  dump(): ServerItem[] {
    return [...this.items.values()].map((item) => ({ ...item }));
  }
}

/* ---------- Lokale kant ---------- */

/** Een lokaal record van een module. `value === null` betekent verwijderd. */
export interface LocalRecord {
  module: string;
  id: string;
  value: unknown;
}

/** Hoe de motor bij de lokale moduledatabases komt (in de app: per module een IndexedDB). */
export interface LocalAdapter {
  list(): Promise<LocalRecord[]>;
  /** Schrijft een ontvangen record, of verwijdert het bij `value === null`. */
  apply(record: LocalRecord): Promise<void>;
}

interface Entry {
  module: string;
  id: string;
  itemId: string;
  /** Laatst gesynchroniseerde versie op de server. */
  version: number;
  /** Hash van de laatst gesynchroniseerde inhoud; afwijking = lokaal gewijzigd. */
  hash: string;
}

export interface Conflict {
  module: string;
  id: string;
  local: unknown;
  server: unknown;
  serverVersion: number;
}

export interface SyncState {
  cursor: number;
  entries: Record<string, Entry>;
  conflicts: Conflict[];
}

export const emptySyncState = (): SyncState => ({ cursor: 0, entries: {}, conflicts: [] });

const key = (module: string, id: string) => `${module}|${id}`;

/** JSON met gesorteerde sleutels, zodat dezelfde inhoud altijd dezelfde hash geeft. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([name, item]) => `${JSON.stringify(name)}:${canonicalJson(item)}`).join(',')}}`;
}

async function contentHash(value: unknown): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalJson(value)));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

interface Payload {
  id: string;
  value: unknown;
}

function isPayload(value: unknown): value is Payload {
  return !!value && typeof value === 'object' && typeof (value as Payload).id === 'string' && 'value' in (value as Payload);
}

export interface SyncResult {
  state: SyncState;
  pushed: number;
  pulled: number;
  newConflicts: number;
}

/**
 * Eén syncronde: eerst ophalen (en conflicten vaststellen), dan lokale wijzigingen versleuteld versturen.
 * Geeft een nieuwe toestand terug; de oude wordt niet gewijzigd.
 */
export async function syncOnce(options: { dek: CryptoKey; server: SyncServer; local: LocalAdapter; state: SyncState }): Promise<SyncResult> {
  const { dek, server, local } = options;
  const state: SyncState = JSON.parse(JSON.stringify(options.state)) as SyncState;
  const conflicted = new Set(state.conflicts.map((item) => key(item.module, item.id)));
  let pushed = 0;
  let pulled = 0;
  let newConflicts = 0;

  const localRecords = new Map((await local.list()).map((record) => [key(record.module, record.id), record]));
  const localHash = async (k: string) => (localRecords.has(k) ? contentHash(localRecords.get(k)!.value) : contentHash(null));
  const byItemId = new Map(Object.values(state.entries).map((entry) => [`${entry.module}|${entry.itemId}`, entry]));

  /* --- Ophalen --- */
  const { items, cursor } = await server.pull(state.cursor);
  for (const item of items) {
    const known = byItemId.get(`${item.module}|${item.itemId}`);
    if (known && known.version >= item.version) continue; // eigen eerdere schrijfactie
    const payload = await decryptRecord(dek, item);
    if (!isPayload(payload)) throw new Error(`Record ${item.module}/${item.itemId} heeft een onbekende inhoud.`);
    const k = key(item.module, payload.id);
    const serverValue = item.deleted ? null : payload.value;
    const serverHash = await contentHash(serverValue);
    const entry = state.entries[k];
    const currentHash = await localHash(k);
    const locallyChanged = entry ? currentHash !== entry.hash : localRecords.has(k);
    if (locallyChanged && currentHash !== serverHash) {
      if (!conflicted.has(k)) {
        state.conflicts.push({ module: item.module, id: payload.id, local: localRecords.get(k)?.value ?? null, server: serverValue, serverVersion: item.version });
        conflicted.add(k);
        newConflicts += 1;
      }
      state.entries[k] = { module: item.module, id: payload.id, itemId: item.itemId, version: entry?.version ?? 0, hash: entry?.hash ?? (await contentHash(null)) };
      continue;
    }
    if (!locallyChanged) {
      await local.apply({ module: item.module, id: payload.id, value: serverValue });
      if (serverValue === null) localRecords.delete(k);
      else localRecords.set(k, { module: item.module, id: payload.id, value: serverValue });
      pulled += 1;
    }
    state.entries[k] = { module: item.module, id: payload.id, itemId: item.itemId, version: item.version, hash: serverHash };
    byItemId.set(`${item.module}|${item.itemId}`, state.entries[k]!);
  }
  state.cursor = cursor;

  /* --- Versturen --- */
  const keys = new Set([...localRecords.keys(), ...Object.keys(state.entries)]);
  for (const k of keys) {
    if (conflicted.has(k)) continue;
    const record = localRecords.get(k);
    const entry = state.entries[k];
    const value = record ? record.value : null;
    const hash = await contentHash(value);
    if (entry && entry.hash === hash) continue;
    if (!entry && !record) continue;
    const module = record?.module ?? entry!.module;
    const id = record?.id ?? entry!.id;
    const itemId = entry?.itemId ?? randomItemId();
    const version = (entry?.version ?? 0) + 1;
    const encrypted = await encryptRecord(dek, module, itemId, version, { id, value } satisfies Payload, value === null);
    const result = await server.put(encrypted, entry?.version ?? 0);
    if (result.ok) {
      state.entries[k] = { module, id, itemId, version, hash };
      pushed += 1;
      continue;
    }
    // Iemand anders schreef tussendoor: niets overschrijven, conflict bewaren.
    const payload = await decryptRecord(dek, result.current);
    const serverValue = result.current.deleted ? null : isPayload(payload) ? payload.value : null;
    if ((await contentHash(serverValue)) === hash) {
      state.entries[k] = { module, id, itemId, version: result.current.version, hash };
      continue;
    }
    state.conflicts.push({ module, id, local: value, server: serverValue, serverVersion: result.current.version });
    conflicted.add(k);
    newConflicts += 1;
  }

  return { state, pushed, pulled, newConflicts };
}

/**
 * Lost een conflict op na een keuze van de gebruiker.
 * - `server`: de serverversie wordt lokaal geschreven.
 * - `local`: de lokale versie blijft en gaat bij de volgende syncronde als nieuwe versie naar de server.
 */
export async function resolveConflict(options: { state: SyncState; local: LocalAdapter; module: string; id: string; choice: 'local' | 'server' }): Promise<SyncState> {
  const state: SyncState = JSON.parse(JSON.stringify(options.state)) as SyncState;
  const index = state.conflicts.findIndex((item) => item.module === options.module && item.id === options.id);
  if (index < 0) throw new Error('Conflict niet gevonden.');
  const conflict = state.conflicts[index]!;
  const k = key(conflict.module, conflict.id);
  const entry = state.entries[k];
  if (!entry) throw new Error('Geen syncgegevens voor dit record.');
  if (options.choice === 'server') {
    await options.local.apply({ module: conflict.module, id: conflict.id, value: conflict.server });
    state.entries[k] = { ...entry, version: conflict.serverVersion, hash: await contentHash(conflict.server) };
  } else {
    // Basis wordt de serverversie; omdat de lokale inhoud afwijkt, verstuurt de volgende ronde versie + 1.
    state.entries[k] = { ...entry, version: conflict.serverVersion, hash: await contentHash(conflict.server) };
  }
  state.conflicts.splice(index, 1);
  return state;
}
