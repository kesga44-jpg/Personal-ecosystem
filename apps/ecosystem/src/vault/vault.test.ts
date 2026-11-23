// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import {
  MIN_ITERATIONS,
  changePassword,
  createVault,
  decryptRecord,
  encryptRecord,
  generateRecoveryCode,
  normalizeRecoveryCode,
  randomItemId,
  unlockWithPassword,
  unlockWithRecoveryCode,
  type VaultRecord
} from './crypto';
import { MemoryServer, RetryableSyncError, canonicalJson, emptySyncState, resolveConflict, syncOnce, syncWithRetry, type LocalAdapter, type LocalRecord, type SyncServer, type SyncState } from './sync';

// Prototype ADR 0021, poort P-1. Echte Web Crypto (Node) met het echte minimum van 600.000 PBKDF2-iteraties.

const PASSWORD = 'correct paard batterij nietje';
let vault: VaultRecord;
let recoveryCode: string;
let dek: CryptoKey;

beforeAll(async () => {
  ({ vault, recoveryCode, dek } = await createVault(PASSWORD));
}, 30_000);

/** Een apparaat met lokale moduledatabases in het geheugen. */
function device(initial: LocalRecord[] = []): LocalAdapter & { records: Map<string, LocalRecord> } {
  const records = new Map(initial.map((record) => [`${record.module}|${record.id}`, record]));
  return {
    records,
    async list() {
      return [...records.values()].map((record) => structuredClone(record));
    },
    async apply(record) {
      const k = `${record.module}|${record.id}`;
      if (record.value === null) records.delete(k);
      else records.set(k, structuredClone(record));
    }
  };
}

const value = (adapter: { records: Map<string, LocalRecord> }, module: string, id: string) => adapter.records.get(`${module}|${id}`)?.value;

describe('kluis en sleutelbeheer', () => {
  it('maakt een kluis zonder geheimen in het serverrecord en met een niet-exporteerbare DEK', async () => {
    expect(vault).toMatchObject({ format: 1, kdf: 'PBKDF2-SHA-256', iterations: MIN_ITERATIONS });
    const stored = JSON.stringify(vault);
    expect(stored.includes(PASSWORD)).toBe(false);
    expect(stored.includes(normalizeRecoveryCode(recoveryCode))).toBe(false);
    expect(dek.extractable).toBe(false);
    await expect(globalThis.crypto.subtle.exportKey('raw', dek)).rejects.toThrow();
  });

  it('opent met het kluiswachtwoord of de herstelcode en weigert verkeerde invoer', async () => {
    const item = await encryptRecord(dek, 'sport', 'x', 1, { id: 'a', value: 42 });
    const byPassword = await unlockWithPassword(vault, PASSWORD);
    const byRecovery = await unlockWithRecoveryCode(vault, recoveryCode.toLowerCase().replace(/-/g, ' '));
    expect(await decryptRecord(byPassword, item)).toEqual({ id: 'a', value: 42 });
    expect(await decryptRecord(byRecovery, item)).toEqual({ id: 'a', value: 42 });
    expect(byPassword.extractable).toBe(false);
    await expect(unlockWithPassword(vault, 'fout wachtwoord!!')).rejects.toThrow('Onjuist kluiswachtwoord');
    await expect(unlockWithRecoveryCode(vault, generateRecoveryCode())).rejects.toThrow('Onjuiste herstelcode');
  }, 30_000);

  it('herstelcodes hebben minstens 128 bit, zijn uniek en tolerant voor schrijfwijze', () => {
    const code = generateRecoveryCode();
    expect(code).toMatch(/^([0-9A-HJKMNP-TV-Z]{4}-){7}[0-9A-HJKMNP-TV-Z]{4}$/);
    expect(normalizeRecoveryCode(code).length * 5).toBeGreaterThanOrEqual(128);
    expect(generateRecoveryCode()).not.toBe(code);
    expect(normalizeRecoveryCode('abcd-efgh oil')).toBe('ABCDEFGH011');
  });

  it('weigert te weinig iteraties en te korte wachtwoorden', async () => {
    await expect(createVault(PASSWORD, 1000)).rejects.toThrow('600000');
    await expect(createVault('kort')).rejects.toThrow('minimaal 12 tekens');
  });

  it('een nieuw kluiswachtwoord (met oud wachtwoord of herstelcode) houdt bestaande records leesbaar', async () => {
    const item = await encryptRecord(dek, 'dagboek', 'y', 3, { id: 'b', value: 'tekst' });
    const viaRecovery = await changePassword(vault, { recoveryCode }, 'een heel nieuw wachtwoord');
    expect(viaRecovery.passwordSalt).not.toBe(vault.passwordSalt);
    expect(viaRecovery.wrappedByRecovery).toEqual(vault.wrappedByRecovery);
    await expect(unlockWithPassword(viaRecovery, PASSWORD)).rejects.toThrow('Onjuist kluiswachtwoord');
    expect(await decryptRecord(await unlockWithPassword(viaRecovery, 'een heel nieuw wachtwoord'), item)).toEqual({ id: 'b', value: 'tekst' });
    await expect(changePassword(vault, { password: 'niet het wachtwoord' }, 'een heel nieuw wachtwoord')).rejects.toThrow('Onjuist kluiswachtwoord');
  }, 60_000);
});

describe('versleuteling per record', () => {
  it('gebruikt per versleuteling een nieuwe IV en bindt module, record-ID en versie', async () => {
    const payload = { id: 'gewicht-2026-11-18', value: { kg: 80.5 } };
    const a = await encryptRecord(dek, 'lichaam', 'item1', 1, payload);
    const b = await encryptRecord(dek, 'lichaam', 'item1', 1, payload);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
    await expect(decryptRecord(dek, { ...a, module: 'sport' })).rejects.toThrow('kon niet worden ontsleuteld');
    await expect(decryptRecord(dek, { ...a, itemId: 'item2' })).rejects.toThrow('kon niet worden ontsleuteld');
    await expect(decryptRecord(dek, { ...a, version: 2 })).rejects.toThrow('kon niet worden ontsleuteld');
    const tampered = a.ciphertext.slice(0, -4) + (a.ciphertext.slice(-4) === 'AAAA' ? 'BBBB' : 'AAAA');
    await expect(decryptRecord(dek, { ...a, ciphertext: tampered })).rejects.toThrow('kon niet worden ontsleuteld');
    const other = await createVault('een ander wachtwoord', MIN_ITERATIONS);
    await expect(decryptRecord(other.dek, a)).rejects.toThrow('kon niet worden ontsleuteld');
  }, 30_000);

  it('willekeurige server-ID\'s verraden niets', () => {
    const ids = new Set(Array.from({ length: 100 }, randomItemId));
    expect(ids.size).toBe(100);
    for (const id of ids) expect(id).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  it('canonieke JSON is onafhankelijk van de volgorde van velden', () => {
    expect(canonicalJson({ b: 1, a: [{ d: 2, c: 3 }], e: undefined })).toBe(canonicalJson({ a: [{ c: 3, d: 2 }], b: 1 }));
  });
});

describe('synchronisatie tussen apparaten', () => {
  async function run(adapter: LocalAdapter, state: SyncState, server: MemoryServer, key = dek) {
    return syncOnce({ dek: key, server, local: adapter, state });
  }

  it('neemt bestaande lokale gegevens mee en zet ze op een tweede apparaat; de server ziet geen inhoud', async () => {
    const server = new MemoryServer();
    const laptop = device([
      { module: 'sport', id: 'run-1', value: { type: 'run', durationMinutes: 33, notes: 'Rondje Vondelpark' } },
      { module: 'dagboek', id: '2026-11-18', value: { text: 'Geheime gedachte', mood: 4 } }
    ]);
    const phone = device();
    const first = await run(laptop, emptySyncState(), server);
    expect(first).toMatchObject({ pushed: 2, pulled: 0, newConflicts: 0 });

    const phoneDek = await unlockWithPassword(vault, PASSWORD);
    const second = await run(phone, emptySyncState(), server, phoneDek);
    expect(second).toMatchObject({ pushed: 0, pulled: 2 });
    expect(value(phone, 'dagboek', '2026-11-18')).toEqual({ text: 'Geheime gedachte', mood: 4 });

    const dump = JSON.stringify(server.dump());
    for (const secret of ['Vondelpark', 'Geheime gedachte', 'run-1', '2026-11-18', 'durationMinutes', 'mood']) expect(dump.includes(secret), secret).toBe(false);
    expect(Object.keys(server.dump()[0]!).sort()).toEqual(['ciphertext', 'deleted', 'itemId', 'iv', 'module', 'seq', 'version']);

    const again = await run(laptop, first.state, server);
    expect(again).toMatchObject({ pushed: 0, pulled: 0, newConflicts: 0 });
  }, 30_000);

  it('stuurt wijzigingen en verwijderingen door', async () => {
    const server = new MemoryServer();
    const laptop = device([{ module: 'quest', id: 'q1', value: { title: 'Fiets maken', progress: 0 } }]);
    const phone = device();
    let laptopState = (await run(laptop, emptySyncState(), server)).state;
    let phoneState = (await run(phone, emptySyncState(), server)).state;

    await phone.apply({ module: 'quest', id: 'q1', value: { title: 'Fiets maken', progress: 1 } });
    phoneState = (await run(phone, phoneState, server)).state;
    const pulled = await run(laptop, laptopState, server);
    expect(pulled.pulled).toBe(1);
    expect(value(laptop, 'quest', 'q1')).toEqual({ title: 'Fiets maken', progress: 1 });
    laptopState = pulled.state;

    await laptop.apply({ module: 'quest', id: 'q1', value: null });
    laptopState = (await run(laptop, laptopState, server)).state;
    expect(server.dump()[0]).toMatchObject({ deleted: true, version: 3 });
    await run(phone, phoneState, server);
    expect(phone.records.size).toBe(0);
  }, 30_000);

  it('lost gelijktijdige wijzigingen niet stil op: beide versies blijven tot de gebruiker kiest', async () => {
    const server = new MemoryServer();
    const laptop = device([{ module: 'lichaam', id: 'm1', value: { kg: 80 } }]);
    const phone = device();
    let laptopState = (await run(laptop, emptySyncState(), server)).state;
    let phoneState = (await run(phone, emptySyncState(), server)).state;

    await laptop.apply({ module: 'lichaam', id: 'm1', value: { kg: 79.5 } });
    await phone.apply({ module: 'lichaam', id: 'm1', value: { kg: 81 } });
    laptopState = (await run(laptop, laptopState, server)).state;
    const conflicted = await run(phone, phoneState, server);
    expect(conflicted.newConflicts).toBe(1);
    expect(conflicted.state.conflicts[0]).toMatchObject({ module: 'lichaam', id: 'm1', local: { kg: 81 }, server: { kg: 79.5 }, serverVersion: 2 });
    expect(value(phone, 'lichaam', 'm1')).toEqual({ kg: 81 });
    phoneState = conflicted.state;

    // Een volgende ronde verandert niets zolang het conflict open is.
    const waiting = await run(phone, phoneState, server);
    expect(waiting).toMatchObject({ pushed: 0, pulled: 0, newConflicts: 0 });
    expect(server.dump()[0]!.version).toBe(2);

    // Kiezen voor de eigen (lokale) versie: die gaat als versie 3 naar de server en daarna naar de laptop.
    phoneState = await resolveConflict({ state: phoneState, local: phone, module: 'lichaam', id: 'm1', choice: 'local' });
    const pushed = await run(phone, phoneState, server);
    expect(pushed).toMatchObject({ pushed: 1, newConflicts: 0 });
    expect(server.dump()[0]!.version).toBe(3);
    await run(laptop, laptopState, server);
    expect(value(laptop, 'lichaam', 'm1')).toEqual({ kg: 81 });
  }, 30_000);

  it('kiezen voor de serverversie schrijft die lokaal', async () => {
    const server = new MemoryServer();
    const laptop = device([{ module: 'voeding', id: 'v1', value: { kcal: 300 } }]);
    const phone = device([{ module: 'voeding', id: 'v1', value: { kcal: 450 } }]);
    await run(laptop, emptySyncState(), server);
    const conflicted = await run(phone, emptySyncState(), server);
    expect(conflicted.newConflicts).toBe(1);
    const resolved = await resolveConflict({ state: conflicted.state, local: phone, module: 'voeding', id: 'v1', choice: 'server' });
    expect(value(phone, 'voeding', 'v1')).toEqual({ kcal: 300 });
    const after = await run(phone, resolved, server);
    expect(after).toMatchObject({ pushed: 0, newConflicts: 0 });
    await expect(resolveConflict({ state: resolved, local: phone, module: 'voeding', id: 'v1', choice: 'server' })).rejects.toThrow('Conflict niet gevonden');
  }, 30_000);

  it('dezelfde inhoud op twee apparaten geeft geen conflict', async () => {
    const server = new MemoryServer();
    const laptop = device([{ module: 'sport', id: 'week-goal', value: { sessions: 3, minutes: null } }]);
    const phone = device([{ module: 'sport', id: 'week-goal', value: { minutes: null, sessions: 3 } }]);
    await run(laptop, emptySyncState(), server);
    const result = await run(phone, emptySyncState(), server);
    expect(result).toMatchObject({ pushed: 0, newConflicts: 0 });
  }, 30_000);

  it('de server weigert een schrijfactie op een verouderde versie', async () => {
    const server = new MemoryServer();
    const first = await encryptRecord(dek, 'sport', 'id1', 1, { id: 'a', value: 1 });
    expect(await server.put(first, 0)).toEqual({ ok: true, seq: 1 });
    const stale = await encryptRecord(dek, 'sport', 'id1', 1, { id: 'a', value: 2 });
    const result = await server.put(stale, 0);
    expect(result.ok).toBe(false);
    const skip = await encryptRecord(dek, 'sport', 'id1', 3, { id: 'a', value: 3 });
    expect((await server.put(skip, 1)).ok).toBe(false);
  });
});

describe('sync-herstel', () => {
  it('herstelt een verloren schrijfbevestiging zonder een geaccepteerd record dubbel te schrijven', async () => {
    const memory = new MemoryServer();
    let loseFirstAcknowledgement = true;
    const server: SyncServer = {
      pull: (since) => memory.pull(since),
      async put(item, expectedVersion) {
        const result = await memory.put(item, expectedVersion);
        if (loseFirstAcknowledgement) {
          loseFirstAcknowledgement = false;
          throw new RetryableSyncError('Tijdelijke netwerkonderbreking.');
        }
        return result;
      }
    };
    const local = device([
      { module: 'sport', id: 'run-1', value: { minutes: 30 } },
      { module: 'dagboek', id: 'entry-1', value: { text: 'synthetische testnotitie' } }
    ]);
    const delays: number[] = [];

    const result = await syncWithRetry({ dek, server, local, state: emptySyncState() }, async (milliseconds) => {
      delays.push(milliseconds);
    });

    expect(delays).toEqual([250]);
    expect(result).toMatchObject({ pushed: 1, pulled: 0, newConflicts: 0 });
    expect(memory.dump()).toHaveLength(2);
    expect(memory.dump().map((item) => item.version)).toEqual([1, 1]);
    expect(Object.values(result.state.entries).map((entry) => entry.version)).toEqual([1, 1]);
  }, 30_000);

  it('laat opslagfouten zichtbaar en herstelt op een volgende syncronde zonder de cursor te verliezen', async () => {
    const server = new MemoryServer();
    const remote = await encryptRecord(dek, 'sport', 'remote-item', 1, { id: 'remote-1', value: { minutes: 45 } });
    await server.put(remote, 0);
    const stored = device();
    let failWrite = true;
    const local: LocalAdapter = {
      list: () => stored.list(),
      async apply(record) {
        if (failWrite) {
          failWrite = false;
          throw new Error('IndexedDB write failed.');
        }
        await stored.apply(record);
      }
    };
    const state = emptySyncState();
    const delays: number[] = [];

    await expect(syncWithRetry({ dek, server, local, state }, async (milliseconds) => {
      delays.push(milliseconds);
    })).rejects.toThrow('IndexedDB write failed');
    expect(delays).toEqual([]);
    expect(state.cursor).toBe(0);

    const recovered = await syncWithRetry({ dek, server, local, state }, async (milliseconds) => {
      delays.push(milliseconds);
    });
    expect(recovered).toMatchObject({ pulled: 1, newConflicts: 0, state: { cursor: 1 } });
    expect(value(stored, 'sport', 'remote-1')).toEqual({ minutes: 45 });
    expect(delays).toEqual([]);
  }, 30_000);

  it('begrenset retries tot drie pogingen en geeft de laatste transportfout door', async () => {
    const server: SyncServer = {
      async pull() {
        throw new RetryableSyncError('Netwerk niet beschikbaar.');
      },
      async put() {
        throw new Error('Niet bereikbaar.');
      }
    };
    const delays: number[] = [];
    let attempts = 0;
    const countingServer: SyncServer = {
      async pull(since) {
        attempts += 1;
        return server.pull(since);
      },
      put: (item, expectedVersion) => server.put(item, expectedVersion)
    };

    await expect(syncWithRetry({ dek, server: countingServer, local: device(), state: emptySyncState() }, async (milliseconds) => {
      delays.push(milliseconds);
    })).rejects.toThrow('Netwerk niet beschikbaar');

    expect(attempts).toBe(3);
    expect(delays).toEqual([250, 500]);
  }, 30_000);
});
