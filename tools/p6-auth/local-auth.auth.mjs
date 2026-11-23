import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TOTP } from 'otpauth';
import { createLocalAuthClient, createSyntheticCredentials, requireAal2 } from './local-auth.mjs';

const url = process.env.P6_LOCAL_AUTH_URL;
const publishableKey = process.env.P6_LOCAL_AUTH_PUBLISHABLE_KEY;
if (!url || !publishableKey) throw new Error('De tijdelijke lokale Auth-testconfiguratie ontbreekt.');

test('synthetisch account krijgt pas na TOTP-verificatie aal2-toegang', async (context) => {
  const client = createLocalAuthClient(url, publishableKey);
  context.after(async () => {
    const { error } = await client.auth.signOut({ scope: 'local' });
    if (error) throw error;
  });

  const credentials = createSyntheticCredentials();
  const signup = await client.auth.signUp(credentials);
  if (signup.error) throw new Error(`Lokaal synthetisch account kon niet worden aangemaakt: ${signup.error.message}`);
  assert.ok(signup.data.user);
  assert.ok(signup.data.session, 'lokale testconfiguratie moet zonder e-mailbevestiging aanmelden');

  const enrollment = await client.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: 'Personal Ecosystem lokale synthetische test'
  });
  if (enrollment.error) throw new Error(`Lokale TOTP-enrollment is mislukt: ${enrollment.error.message}`);
  assert.ok(enrollment.data.totp?.secret);

  const signedOut = await client.auth.signOut({ scope: 'local' });
  if (signedOut.error) throw new Error(`Lokaal uitloggen is mislukt: ${signedOut.error.message}`);
  const signIn = await client.auth.signInWithPassword(credentials);
  if (signIn.error) throw new Error(`Lokaal inloggen met synthetische gegevens is mislukt: ${signIn.error.message}`);
  assert.ok(signIn.data.session);

  const beforeVerification = await client.auth.mfa.getAuthenticatorAssuranceLevel();
  if (beforeVerification.error) throw beforeVerification.error;
  assert.equal(beforeVerification.data.currentLevel, 'aal1');
  await assert.rejects(requireAal2(client), /aal2/);

  const challenge = await client.auth.mfa.challenge({ factorId: enrollment.data.id });
  if (challenge.error) throw new Error(`Lokale TOTP-challenge is mislukt: ${challenge.error.message}`);
  const authenticator = new TOTP({
    issuer: 'Personal Ecosystem lokale test',
    label: credentials.email,
    secret: enrollment.data.totp.secret
  });
  const verification = await client.auth.mfa.verify({
    factorId: enrollment.data.id,
    challengeId: challenge.data.id,
    code: authenticator.generate()
  });
  if (verification.error) throw new Error(`Lokale TOTP-verificatie is mislukt: ${verification.error.message}`);
  assert.ok(verification.data.access_token);

  const afterVerification = await client.auth.mfa.getAuthenticatorAssuranceLevel();
  if (afterVerification.error) throw afterVerification.error;
  assert.equal(afterVerification.data.currentLevel, 'aal2');
  await requireAal2(client);
});

test('auth-testclient weigert niet-loopback endpoints', () => {
  assert.throws(
    () => createLocalAuthClient('https://example.invalid', ''),
    /alleen een HTTP-loopbackendpoint/
  );
});
