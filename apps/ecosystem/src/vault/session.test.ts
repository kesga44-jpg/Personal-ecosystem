// @vitest-environment node
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createVault, type VaultRecord } from './crypto';
import { VaultSession, type VaultLockReason } from './session';

const PASSWORD = 'synthetisch kluiswachtwoord 2026';
let vault: VaultRecord;
let recoveryCode: string;

beforeAll(async () => {
  ({ vault, recoveryCode } = await createVault(PASSWORD));
}, 30_000);

describe('VaultSession', () => {
  let prepareToLock: ReturnType<typeof vi.fn<(reason: VaultLockReason) => Promise<void>>>;
  let clearDecryptedState: ReturnType<typeof vi.fn<() => void>>;
  let session: VaultSession;

  beforeEach(() => {
    vi.useFakeTimers();
    prepareToLock = vi.fn(async (_reason: VaultLockReason) => {});
    clearDecryptedState = vi.fn();
    session = new VaultSession({ prepareToLock, clearDecryptedState });
  });

  it('activeert een nieuwe kluis pas nadat de herstelcode is opgeslagen en volledig gecontroleerd', async () => {
    const setup = await session.beginSetup(PASSWORD);
    expect(session.status).toBe('setting-up');
    expect(() => session.getKey()).toThrow('vergrendeld');
    await expect(session.confirmRecoveryCode(setup.recoveryCode)).rejects.toThrow('Bewaar eerst');

    session.acknowledgeRecoveryCodeSaved('download');
    await expect(session.confirmRecoveryCode(`${setup.recoveryCode.slice(0, -1)}0`)).rejects.toThrow('Onjuiste herstelcode');
    expect(session.status).toBe('setting-up');

    await session.confirmRecoveryCode(setup.recoveryCode);
    expect(session.isUnlocked).toBe(true);
    expect(session.getKey().extractable).toBe(false);
    expect(setup.vault).toEqual(expect.objectContaining({ wrappedByPassword: expect.any(Object) }));
  }, 30_000);

  it('voorkomt dubbele of geannuleerde onboarding die alsnog een kluis activeert', async () => {
    const pending = session.beginSetup(PASSWORD);
    expect(session.status).toBe('setting-up');
    await expect(session.beginSetup(PASSWORD)).rejects.toThrow('kan nu niet worden aangemaakt');
    session.cancelSetup();

    await expect(pending).rejects.toThrow('geannuleerd');
    expect(session.status).toBe('locked');
    expect(() => session.getKey()).toThrow('vergrendeld');
  }, 30_000);

  it('kan de kluis na een nieuwe sessie opnieuw openen met het wachtwoord of de herstelcode', async () => {
    await session.unlockWithPassword(vault, PASSWORD);
    const key = session.getKey();
    await session.lock();

    const reloaded = new VaultSession({ prepareToLock, clearDecryptedState });
    expect(reloaded.status).toBe('locked');
    expect(() => reloaded.getKey()).toThrow('vergrendeld');
    await reloaded.unlockWithRecoveryCode(vault, recoveryCode);
    expect(reloaded.getKey()).not.toBe(key);
    expect(reloaded.getKey().extractable).toBe(false);
  }, 30_000);

  it('vergrendelt standaard na 15 minuten en herstart de termijn bij activiteit', async () => {
    await session.unlockWithPassword(vault, PASSWORD);
    expect(session.inactivityTimeoutMinutes).toBe(15);

    await vi.advanceTimersByTimeAsync(14 * 60_000);
    expect(session.isUnlocked).toBe(true);
    session.recordActivity();
    await vi.advanceTimersByTimeAsync(14 * 60_000);
    expect(session.isUnlocked).toBe(true);
    await vi.advanceTimersByTimeAsync(60_000);

    expect(session.status).toBe('locked');
    expect(prepareToLock).toHaveBeenCalledWith('inactivity');
    expect(clearDecryptedState).toHaveBeenCalledOnce();
    expect(() => session.getKey()).toThrow('vergrendeld');
  }, 30_000);

  it('valideert de instelbare termijn op 5 tot en met 60 minuten', async () => {
    expect(() => new VaultSession({ prepareToLock, clearDecryptedState, inactivityTimeoutMinutes: 4 })).toThrow('tussen 5 en 60');
    expect(() => session.setInactivityTimeout(61)).toThrow('tussen 5 en 60');
    await session.unlockWithPassword(vault, PASSWORD);
    session.setInactivityTimeout(5);
    expect(session.inactivityTimeoutMinutes).toBe(5);
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(session.status).toBe('locked');
  }, 30_000);

  it('houdt de kluis en openstaande gegevens beschikbaar wanneer voorbereiding op vergrendeling faalt', async () => {
    const failure = new Error('Opslag mislukt: test failure');
    prepareToLock.mockRejectedValueOnce(failure);
    await session.unlockWithPassword(vault, PASSWORD);

    await expect(session.lock()).rejects.toBe(failure);
    expect(session.isUnlocked).toBe(true);
    expect(session.lastLockFailure).toBe(failure);
    expect(session.getKey().extractable).toBe(false);
    expect(clearDecryptedState).not.toHaveBeenCalled();
  }, 30_000);

  it('rapporteert een mislukte automatische vergrendeling en houdt de sleutel beschikbaar', async () => {
    const failure = new Error('synthetische opslagfout');
    prepareToLock.mockRejectedValueOnce(failure);
    const onAutomaticLockFailure = vi.fn();
    session = new VaultSession({ prepareToLock, clearDecryptedState, onAutomaticLockFailure, inactivityTimeoutMinutes: 5 });
    await session.unlockWithPassword(vault, PASSWORD);

    await vi.advanceTimersByTimeAsync(5 * 60_000);

    expect(session.isUnlocked).toBe(true);
    expect(session.lastLockFailure).toBe(failure);
    expect(onAutomaticLockFailure).toHaveBeenCalledWith(failure);
    expect(clearDecryptedState).not.toHaveBeenCalled();
  }, 30_000);

  it('maakt de sleutel ontoegankelijk vóór het wissen van ontsleutelde toestanden', async () => {
    await session.unlockWithPassword(vault, PASSWORD);
    clearDecryptedState.mockImplementation(() => expect(() => session.getKey()).toThrow('vergrendeld'));

    await session.lock();

    expect(session.status).toBe('locked');
    expect(clearDecryptedState).toHaveBeenCalledOnce();
  }, 30_000);

  it('kan een niet-bevestigde onboarding annuleren zonder een actieve sleutel', async () => {
    await session.beginSetup(PASSWORD);
    session.cancelSetup();

    expect(session.status).toBe('locked');
    await expect(session.unlockWithPassword(vault, PASSWORD)).resolves.toBeUndefined();
  }, 30_000);
});
