import { randomBytes, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export function createLocalAuthClient(url, publishableKey) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'http:' || !LOOPBACK_HOSTS.has(parsed.hostname)) {
    throw new Error('P-6-authentificatietests mogen alleen een HTTP-loopbackendpoint gebruiken.');
  }
  if (typeof publishableKey !== 'string' || publishableKey.length === 0) {
    throw new Error('De tijdelijke lokale Supabase publishable key ontbreekt.');
  }

  return createClient(parsed.origin, publishableKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false
    }
  });
}

export function createSyntheticCredentials() {
  return {
    email: `p6-${randomUUID()}@example.invalid`,
    password: randomBytes(32).toString('base64url')
  };
}

export async function requireAal2(client) {
  const { data, error } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) throw error;
  if (data.currentLevel !== 'aal2') throw new Error('Een TOTP-geverifieerde aal2-sessie is vereist.');
}
