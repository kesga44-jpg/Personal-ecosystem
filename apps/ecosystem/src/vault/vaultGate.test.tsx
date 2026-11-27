import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hasInstalledDatabaseOpener } from '@ecosystem/storage';
import { createVault, MIN_ITERATIONS } from './crypto';
import { loadInactivityMinutes, loadVaultRecord, parseVaultRecord, saveInactivityMinutes, saveVaultRecord, VAULT_RECORD_KEY } from './localData';
import { discardPendingInput, pendingInputCount, PendingInputError, registerPendingInput, savePendingInput } from './pendingInput';
import { VaultGate } from './VaultGate';

const password = 'synthetisch-wachtwoord-1';

beforeEach(() => localStorage.clear());
afterEach(() => discardPendingInput());

describe('kluisrecord op dit apparaat', () => {
  it('bewaart alleen een geldig record zonder geheimen en weigert een beschadigd record', async () => {
    const { vault, recoveryCode } = await createVault(password);
    saveVaultRecord(vault);
    const raw = localStorage.getItem(VAULT_RECORD_KEY)!;
    expect(raw).not.toContain(password);
    expect(raw.replace(/-/g, '')).not.toContain(recoveryCode.replace(/-/g, ''));
    expect(loadVaultRecord()).toEqual(vault);
    expect(() => parseVaultRecord({ ...vault, iterations: MIN_ITERATIONS - 1 })).toThrow('ongeldig');
    expect(() => parseVaultRecord({ ...vault, wrappedByPassword: null })).toThrow('ongeldig');
    expect(parseVaultRecord({ ...vault, extra: 'genegeerd' })).not.toHaveProperty('extra');
  }, 30_000);

  it('automatisch vergrendelen: standaard 15, alleen 5–60 minuten', () => {
    expect(loadInactivityMinutes()).toBe(15);
    saveInactivityMinutes(30);
    expect(loadInactivityMinutes()).toBe(30);
    localStorage.setItem('personal-ecosystem.vault.settings', '{"inactivityMinutes":2}');
    expect(loadInactivityMinutes()).toBe(15);
    localStorage.setItem('personal-ecosystem.vault.settings', 'kapot');
    expect(loadInactivityMinutes()).toBe(15);
  });
});

describe('openstaande invoer bij vergrendelen (ADR 0031 § 3)', () => {
  it('meldt welke invoer niet kon worden opgeslagen en houdt die vast tot opnieuw proberen of weggooien', async () => {
    let attempts = 0;
    const discarded: string[] = [];
    registerPendingInput({ label: 'Dagboekregel', save: async () => { attempts += 1; if (attempts === 1) throw new Error('opslag vol'); }, discard: () => discarded.push('dagboek') });
    await expect(savePendingInput()).rejects.toBeInstanceOf(PendingInputError);
    expect(pendingInputCount()).toBe(1);
    await expect(savePendingInput()).resolves.toBeUndefined();
    expect(pendingInputCount()).toBe(0);
    registerPendingInput({ label: 'x', save: async () => { throw new Error('nee'); }, discard: () => discarded.push('x') });
    discardPendingInput();
    expect(discarded).toEqual(['x']);
    expect(pendingInputCount()).toBe(0);
  });
});

describe('VaultGate', () => {
  async function unlocked() {
    const { vault } = await createVault(password);
    saveVaultRecord(vault);
    render(<VaultGate><p>Module-inhoud</p></VaultGate>);
    expect(screen.queryByText('Module-inhoud')).toBeNull();
    fireEvent.change(screen.getByLabelText('Kluiswachtwoord'), { target: { value: password } });
    fireEvent.click(screen.getByRole('button', { name: 'Openen' }));
    await screen.findByText('Module-inhoud', undefined, { timeout: 20_000 });
    expect(hasInstalledDatabaseOpener()).toBe(true);
  }

  it('blijft open als openstaande invoer niet kan worden opgeslagen, en vergrendelt pas na bewust weggooien', async () => {
    await unlocked();
    registerPendingInput({ label: 'Concepttraining', save: async () => { throw new Error('database geblokkeerd'); }, discard: () => undefined });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Vergrendelen' })); });
    expect(await screen.findByText(/Concepttraining \(database geblokkeerd\)/)).toBeTruthy();
    expect(screen.getByText('Module-inhoud')).toBeTruthy();

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Invoer weggooien en vergrendelen' })); });
    await waitFor(() => expect(screen.queryByText('Module-inhoud')).toBeNull());
    expect(screen.getByRole('heading', { name: 'Kluis openen' })).toBeTruthy();
    // Na vergrendelen opent geen module meer de versleutelde opslag.
    expect(hasInstalledDatabaseOpener()).toBe(false);
  }, 40_000);
});
