/**
 * Prototype eind-tot-eind-versleuteling (ADR 0021 § 2, poort P-1).
 * Niet aangesloten op de app en zonder netwerk: alleen Web Crypto-primitieven (AES-GCM, PBKDF2, getRandomValues).
 *
 * - DEK: willekeurige AES-GCM-sleutel van 256 bit; versleutelt alle records.
 * - KEK: afgeleid met PBKDF2-SHA-256 (minimaal 600.000 iteraties, eigen salt) uit het kluiswachtwoord of de herstelcode.
 * - Alleen de ingepakte DEK verlaat het apparaat; op het apparaat staat de DEK als niet-exporteerbare CryptoKey.
 */

export const MIN_ITERATIONS = 600_000;
const VAULT_FORMAT = 1;

const subtle = () => {
  const value = globalThis.crypto?.subtle;
  if (!value) throw new Error('Web Crypto is niet beschikbaar in deze omgeving.');
  return value;
};

export function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  return globalThis.crypto.getRandomValues(new Uint8Array(length));
}

export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/* ---------- Herstelcode ---------- */

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Herstelcode van 160 bit (32 tekens Crockford-base32 in groepen van 4); de eis is minimaal 128 bit. */
export function generateRecoveryCode(): string {
  const bytes = randomBytes(20);
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += CROCKFORD[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return output.match(/.{4}/g)!.join('-');
}

/** Spaties, streepjes en hoofdletters maken niet uit; O/I/L worden gelezen als 0/1/1. */
export function normalizeRecoveryCode(code: string): string {
  return code.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
}

/* ---------- Sleutels ---------- */

export interface WrappedKey {
  /** Base64; 96 bit. */
  iv: string;
  /** Base64; de ingepakte DEK inclusief GCM-tag. */
  wrapped: string;
}

/** Alles wat van de kluis op de server staat (`pe.vaults`). Geen geheimen. */
export interface VaultRecord {
  format: number;
  kdf: 'PBKDF2-SHA-256';
  iterations: number;
  passwordSalt: string;
  recoverySalt: string;
  wrappedByPassword: WrappedKey;
  wrappedByRecovery: WrappedKey;
}

async function deriveKek(secret: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  if (!Number.isInteger(iterations) || iterations < MIN_ITERATIONS) throw new Error(`Minimaal ${MIN_ITERATIONS} PBKDF2-iteraties vereist.`);
  const material = await subtle().importKey('raw', encoder.encode(secret.normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
  return subtle().deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['wrapKey', 'unwrapKey']
  );
}

const WRAP_AAD = encoder.encode('personal-ecosystem/vault/dek/v1');

async function wrapDek(dek: CryptoKey, kek: CryptoKey): Promise<WrappedKey> {
  const iv = randomBytes(12);
  const wrapped = await subtle().wrapKey('raw', dek, kek, { name: 'AES-GCM', iv, additionalData: WRAP_AAD });
  return { iv: toBase64(iv), wrapped: toBase64(new Uint8Array(wrapped)) };
}

async function unwrapDek(wrapped: WrappedKey, kek: CryptoKey, extractable: boolean): Promise<CryptoKey> {
  return subtle().unwrapKey(
    'raw',
    fromBase64(wrapped.wrapped),
    kek,
    { name: 'AES-GCM', iv: fromBase64(wrapped.iv), additionalData: WRAP_AAD },
    { name: 'AES-GCM', length: 256 },
    extractable,
    ['encrypt', 'decrypt']
  );
}

export function validatePassword(password: string): void {
  if (typeof password !== 'string' || password.length < 12) throw new Error('Kies een kluiswachtwoord van minimaal 12 tekens.');
}

/**
 * Maakt een nieuwe kluis. Geeft de herstelcode één keer terug (de gebruiker moet die zelf bewaren)
 * en de DEK als niet-exporteerbare sleutel voor dit apparaat.
 */
export async function createVault(password: string, iterations = MIN_ITERATIONS): Promise<{ vault: VaultRecord; recoveryCode: string; dek: CryptoKey }> {
  validatePassword(password);
  const recoveryCode = generateRecoveryCode();
  const passwordSalt = randomBytes(16);
  const recoverySalt = randomBytes(16);
  const extractableDek = await subtle().generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const [passwordKek, recoveryKek] = await Promise.all([
    deriveKek(password, passwordSalt, iterations),
    deriveKek(normalizeRecoveryCode(recoveryCode), recoverySalt, iterations)
  ]);
  const vault: VaultRecord = {
    format: VAULT_FORMAT,
    kdf: 'PBKDF2-SHA-256',
    iterations,
    passwordSalt: toBase64(passwordSalt),
    recoverySalt: toBase64(recoverySalt),
    wrappedByPassword: await wrapDek(extractableDek, passwordKek),
    wrappedByRecovery: await wrapDek(extractableDek, recoveryKek)
  };
  // Het apparaat houdt een niet-exporteerbare kopie; de exporteerbare sleutel verdwijnt na deze functie.
  const dek = await unwrapDek(vault.wrappedByPassword, passwordKek, false);
  return { vault, recoveryCode, dek };
}

function checkVault(vault: VaultRecord): void {
  if (!vault || vault.format !== VAULT_FORMAT || vault.kdf !== 'PBKDF2-SHA-256') throw new Error('Onbekend kluisformaat.');
}

/** Opent de kluis met het kluiswachtwoord. De DEK is niet exporteerbaar. */
export async function unlockWithPassword(vault: VaultRecord, password: string): Promise<CryptoKey> {
  checkVault(vault);
  const kek = await deriveKek(password, fromBase64(vault.passwordSalt), vault.iterations);
  try {
    return await unwrapDek(vault.wrappedByPassword, kek, false);
  } catch {
    throw new Error('Onjuist kluiswachtwoord.');
  }
}

/** Opent de kluis met de herstelcode. */
export async function unlockWithRecoveryCode(vault: VaultRecord, recoveryCode: string): Promise<CryptoKey> {
  checkVault(vault);
  const kek = await deriveKek(normalizeRecoveryCode(recoveryCode), fromBase64(vault.recoverySalt), vault.iterations);
  try {
    return await unwrapDek(vault.wrappedByRecovery, kek, false);
  } catch {
    throw new Error('Onjuiste herstelcode.');
  }
}

/**
 * Nieuw kluiswachtwoord met het oude wachtwoord of de herstelcode. De DEK blijft dezelfde, dus records hoeven
 * niet opnieuw versleuteld te worden. Alleen `wrappedByPassword` en de salt veranderen.
 */
export async function changePassword(vault: VaultRecord, proof: { password: string } | { recoveryCode: string }, newPassword: string): Promise<VaultRecord> {
  checkVault(vault);
  validatePassword(newPassword);
  const byPassword = 'password' in proof;
  const kek = byPassword
    ? await deriveKek(proof.password, fromBase64(vault.passwordSalt), vault.iterations)
    : await deriveKek(normalizeRecoveryCode(proof.recoveryCode), fromBase64(vault.recoverySalt), vault.iterations);
  let dek: CryptoKey;
  try {
    dek = await unwrapDek(byPassword ? vault.wrappedByPassword : vault.wrappedByRecovery, kek, true);
  } catch {
    throw new Error(byPassword ? 'Onjuist kluiswachtwoord.' : 'Onjuiste herstelcode.');
  }
  const passwordSalt = randomBytes(16);
  const newKek = await deriveKek(newPassword, passwordSalt, vault.iterations);
  return { ...vault, passwordSalt: toBase64(passwordSalt), wrappedByPassword: await wrapDek(dek, newKek) };
}

/* ---------- Records ---------- */

/** Wat de server van één record ziet (`pe.items`): geen inhoud. */
export interface EncryptedItem {
  module: string;
  itemId: string;
  version: number;
  iv: string;
  ciphertext: string;
  deleted: boolean;
}

/** Module, record-ID en versie gaan mee als additional authenticated data: een blok kan niet naar een ander record of een andere versie worden verplaatst. */
function recordAad(module: string, itemId: string, version: number): Uint8Array<ArrayBuffer> {
  return encoder.encode(`pe/v1|${module}|${itemId}|${version}`);
}

export async function encryptRecord(dek: CryptoKey, module: string, itemId: string, version: number, payload: unknown, deleted = false): Promise<EncryptedItem> {
  if (!Number.isInteger(version) || version < 1) throw new Error('Versie moet een positief geheel getal zijn.');
  const iv = randomBytes(12);
  const plaintext = encoder.encode(JSON.stringify(payload ?? null));
  const ciphertext = await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: recordAad(module, itemId, version) }, dek, plaintext);
  return { module, itemId, version, iv: toBase64(iv), ciphertext: toBase64(new Uint8Array(ciphertext)), deleted };
}

export async function decryptRecord(dek: CryptoKey, item: EncryptedItem): Promise<unknown> {
  try {
    const plaintext = await subtle().decrypt(
      { name: 'AES-GCM', iv: fromBase64(item.iv), additionalData: recordAad(item.module, item.itemId, item.version) },
      dek,
      fromBase64(item.ciphertext)
    );
    return JSON.parse(decoder.decode(plaintext));
  } catch {
    throw new Error(`Record ${item.module}/${item.itemId} kon niet worden ontsleuteld (beschadigd of verkeerde sleutel).`);
  }
}

/** Willekeurige record-ID voor de server, zodat de ID niets over de inhoud verraadt (ADR 0021 § 5). */
export function randomItemId(): string {
  return toBase64(randomBytes(16)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
