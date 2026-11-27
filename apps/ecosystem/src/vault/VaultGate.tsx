import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type PropsWithChildren } from 'react';
import { installDatabaseOpener } from '@ecosystem/storage';
import { Button, Card, ErrorBanner, Field, PageHeader } from '@ecosystem/ui';
import type { VaultRecord } from './crypto';
import { encryptedOpener, exportPlaintextBackup, migrateModulesToEncrypted, plaintextRecordCounts, defaultOpeners, type ModuleMigrationReport } from './encryptedModules';
import { loadInactivityMinutes, loadVaultRecord, PERSONAL_ECOSYSTEM_DATABASE_CONFIGS, saveInactivityMinutes, saveVaultRecord } from './localData';
import { discardPendingInput, PendingInputError, savePendingInput } from './pendingInput';
import { MAX_INACTIVITY_TIMEOUT_MINUTES, MIN_INACTIVITY_TIMEOUT_MINUTES, VaultSession, type RecoveryCodeSaveMethod } from './session';

/**
 * P-6, stap 5 (deel 1): kluis aanmaken en openen in de app (ADR 0029 § 1, ADR 0031 § 2 en § 3).
 *
 * - De gegevenssleutel staat alleen in het geheugen van `VaultSession`; na herladen is de kluis dicht.
 * - Zolang de kluis dicht is, wordt geen module geladen of getoond.
 * - Vergrendelen: knop, inactiviteit (standaard 15 min, instelbaar 5–60). Mislukt het opslaan van
 *   openstaande invoer, dan blijft de kluis open en kiest de gebruiker.
 *
 * Alleen actief in een build met `VITE_PE_VAULT=1`; productie blijft ongewijzigd tot P-6 is vrijgegeven.
 */
type Phase =
  | { name: 'setup' }
  | { name: 'recovery'; code: string; saved: RecoveryCodeSaveMethod | null }
  | { name: 'locked'; vault: VaultRecord }
  | { name: 'migrate'; vault: VaultRecord; counts: Record<string, number>; backedUp: boolean; reports: ModuleMigrationReport[] | null }
  | { name: 'unlocked'; vault: VaultRecord };

const configs = Object.values(PERSONAL_ECOSYSTEM_DATABASE_CONFIGS);
const totalOf = (counts: Record<string, number>) => Object.values(counts).reduce((sum, count) => sum + count, 0);

const INACTIVITY_CHOICES = [5, 10, 15, 30, 45, 60].filter((minutes) => minutes >= MIN_INACTIVITY_TIMEOUT_MINUTES && minutes <= MAX_INACTIVITY_TIMEOUT_MINUTES);

function message(cause: unknown): string {
  if (cause instanceof Error && cause.name === 'OperationError') return 'Dit wachtwoord of deze herstelcode klopt niet.';
  return cause instanceof Error ? cause.message : 'Onbekende fout.';
}

export function VaultGate({ children }: PropsWithChildren) {
  const [phase, setPhase] = useState<Phase>(() => {
    const vault = loadVaultRecord();
    return vault ? { name: 'locked', vault } : { name: 'setup' };
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [lockFailure, setLockFailure] = useState('');
  const [generation, setGeneration] = useState(0);
  const pendingVault = useRef<VaultRecord | null>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const session = useMemo(() => new VaultSession({
    prepareToLock: () => savePendingInput(),
    clearDecryptedState: () => {
      installDatabaseOpener(null);
      const current = phaseRef.current;
      if (current.name === 'unlocked' || current.name === 'migrate') setPhase({ name: 'locked', vault: current.vault });
      setGeneration((value) => value + 1);
    },
    onAutomaticLockFailure: (cause) => setLockFailure(message(cause)),
    inactivityTimeoutMinutes: loadInactivityMinutes()
  }), []);

  useEffect(() => {
    if (phase.name !== 'unlocked') return;
    let last = 0;
    const onActivity = () => {
      const now = Date.now();
      if (now - last < 1000) return;
      last = now;
      session.recordActivity();
    };
    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
    for (const event of events) window.addEventListener(event, onActivity, { passive: true });
    return () => { for (const event of events) window.removeEventListener(event, onActivity); };
  }, [phase.name, session]);

  const run = useCallback(async (action: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }, []);

  /** Na openen: alle modules op versleutelde opslag; eerst overzetten als er nog onversleutelde records zijn. */
  const opened = useCallback(async (vault: VaultRecord) => {
    installDatabaseOpener(encryptedOpener({ getKey: () => session.getKey() }));
    const counts = await plaintextRecordCounts(configs);
    setPhase(totalOf(counts) > 0 ? { name: 'migrate', vault, counts, backedUp: false, reports: null } : { name: 'unlocked', vault });
  }, [session]);

  useEffect(() => () => installDatabaseOpener(null), []);

  const lock = useCallback(async () => {
    setLockFailure('');
    try {
      await session.lock('manual');
    } catch (cause) {
      setLockFailure(cause instanceof PendingInputError ? cause.message : message(cause));
    }
  }, [session]);

  if (phase.name === 'unlocked') {
    return (
      <>
        <div className="vault-bar" role="region" aria-label="Kluis" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'flex-end', padding: '6px 12px', fontSize: '0.85rem' }}>
          <span>Kluis open</span>
          <label>
            Automatisch vergrendelen na{' '}
            <select
              aria-label="Automatisch vergrendelen na"
              defaultValue={session.inactivityTimeoutMinutes}
              onChange={(event) => {
                const minutes = Number(event.target.value);
                session.setInactivityTimeout(minutes);
                saveInactivityMinutes(minutes);
              }}
            >
              {INACTIVITY_CHOICES.map((minutes) => <option key={minutes} value={minutes}>{minutes} min</option>)}
            </select>
          </label>
          <Button variant="secondary" type="button" onClick={() => void lock()}>Vergrendelen</Button>
        </div>
        {lockFailure && (
          <div role="alert" className="error-banner">
            <strong>De kluis is nog open</strong>
            <span>{lockFailure}</span>
            <span>
              <Button type="button" variant="secondary" onClick={() => void lock()}>Opnieuw proberen</Button>{' '}
              <Button type="button" variant="danger" onClick={() => { discardPendingInput(); void lock(); }}>Invoer weggooien en vergrendelen</Button>
            </span>
          </div>
        )}
        <div key={generation}>{children}</div>
      </>
    );
  }

  return (
    <main className="vault-screen" style={{ maxWidth: 560, margin: '0 auto', padding: '32px 16px' }}>
      {phase.name === 'setup' && (
        <SetupForm
          busy={busy}
          error={error}
          onSubmit={(password, repeat) => run(async () => {
            if (password !== repeat) throw new Error('De wachtwoorden zijn niet gelijk.');
            const created = await session.beginSetup(password);
            pendingVault.current = created.vault;
            setPhase({ name: 'recovery', code: created.recoveryCode, saved: null });
          })}
        />
      )}
      {phase.name === 'recovery' && (
        <RecoveryStep
          code={phase.code}
          saved={phase.saved}
          busy={busy}
          error={error}
          onSaved={(method) => {
            session.acknowledgeRecoveryCodeSaved(method);
            setPhase({ ...phase, saved: method });
          }}
          onConfirm={(entered) => run(async () => {
            await session.confirmRecoveryCode(entered);
            const vault = pendingVault.current!;
            saveVaultRecord(vault);
            pendingVault.current = null;
            await opened(vault);
          })}
          onCancel={() => {
            session.cancelSetup();
            pendingVault.current = null;
            setError('');
            setPhase({ name: 'setup' });
          }}
        />
      )}
      {phase.name === 'migrate' && (
        <MigrationStep
          phase={phase}
          busy={busy}
          error={error}
          onBackup={() => run(async () => {
            const url = URL.createObjectURL(new Blob([await exportPlaintextBackup(configs)], { type: 'application/json' }));
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = `personal-ecosystem-voor-versleuteling-${new Date().toISOString().slice(0, 10)}.json`;
            anchor.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            setPhase({ ...phase, backedUp: true });
          })}
          onMigrate={() => run(async () => {
            const reports = await migrateModulesToEncrypted(configs, defaultOpeners({ getKey: () => session.getKey() }));
            setPhase({ ...phase, counts: await plaintextRecordCounts(configs), reports });
          })}
          onContinue={() => setPhase({ name: 'unlocked', vault: phase.vault })}
          onLock={() => void lock()}
        />
      )}
      {phase.name === 'locked' && (
        <UnlockForm
          busy={busy}
          error={error}
          onPassword={(password) => run(async () => {
            await session.unlockWithPassword(phase.vault, password);
            await opened(phase.vault);
          })}
          onRecoveryCode={(code) => run(async () => {
            await session.unlockWithRecoveryCode(phase.vault, code);
            await opened(phase.vault);
          })}
        />
      )}
    </main>
  );
}

function SetupForm({ busy, error, onSubmit }: { busy: boolean; error: string; onSubmit(password: string, repeat: string): void }) {
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  return (
    <>
      <PageHeader eyebrow="Personal Ecosystem" title="Kluis aanmaken" description="Je gegevens worden versleuteld met een sleutel die alleen met je kluiswachtwoord of herstelcode te openen is." />
      <Card>
        <form onSubmit={(event: FormEvent) => { event.preventDefault(); onSubmit(password, repeat); }}>
          <Field label="Kluiswachtwoord" hint="Minimaal 12 tekens. Zonder dit wachtwoord of je herstelcode zijn je gegevens niet te openen.">
            <input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </Field>
          <Field label="Herhaal kluiswachtwoord">
            <input type="password" autoComplete="new-password" value={repeat} onChange={(event) => setRepeat(event.target.value)} />
          </Field>
          {error && <ErrorBanner message={error} />}
          <Button type="submit" disabled={busy}>{busy ? 'Bezig…' : 'Kluis aanmaken'}</Button>
        </form>
      </Card>
    </>
  );
}

function RecoveryStep({ code, saved, busy, error, onSaved, onConfirm, onCancel }: {
  code: string;
  saved: RecoveryCodeSaveMethod | null;
  busy: boolean;
  error: string;
  onSaved(method: RecoveryCodeSaveMethod): void;
  onConfirm(code: string): void;
  onCancel(): void;
}) {
  const [entered, setEntered] = useState('');
  const [copyError, setCopyError] = useState('');
  const download = () => {
    const url = URL.createObjectURL(new Blob([`Herstelcode Personal Ecosystem\n\n${code}\n\nBewaar deze code op een veilige plek, buiten dit apparaat.\n`], { type: 'text/plain;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'herstelcode-personal-ecosystem.txt';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    onSaved('download');
  };
  return (
    <>
      <PageHeader eyebrow="Kluis aanmaken" title="Bewaar je herstelcode" description="Dit is de enige keer dat je hem ziet. Met de herstelcode open je de kluis als je je wachtwoord kwijt bent." />
      <Card>
        <p><code aria-label="Herstelcode" style={{ fontSize: '1.15rem', letterSpacing: '0.05em', userSelect: 'all' }}>{code}</code></p>
        <p>
          <Button type="button" variant="secondary" onClick={download}>Downloaden</Button>{' '}
          <Button type="button" variant="secondary" onClick={() => { window.print(); onSaved('print'); }}>Afdrukken</Button>{' '}
          <Button type="button" variant="secondary" onClick={() => {
            setCopyError('');
            navigator.clipboard.writeText(code).then(() => onSaved('copy'), () => setCopyError('Kopiëren lukte niet. Download of druk de code af.'));
          }}>Kopiëren</Button>
        </p>
        {copyError && <ErrorBanner message={copyError} />}
        {saved && <p role="status">Herstelcode bewaard ({saved === 'download' ? 'gedownload' : saved === 'print' ? 'afgedrukt' : 'gekopieerd'}).</p>}
        <form onSubmit={(event: FormEvent) => { event.preventDefault(); onConfirm(entered); }}>
          <Field label="Typ de herstelcode ter controle" hint="Pas na een juiste controle wordt de kluis actief.">
            <input value={entered} onChange={(event) => setEntered(event.target.value)} autoComplete="off" spellCheck={false} disabled={!saved} />
          </Field>
          {error && <ErrorBanner message={error} />}
          <Button type="submit" disabled={busy || !saved}>{busy ? 'Bezig…' : 'Kluis activeren'}</Button>{' '}
          <Button type="button" variant="secondary" onClick={onCancel}>Annuleren</Button>
        </form>
      </Card>
    </>
  );
}

function UnlockForm({ busy, error, onPassword, onRecoveryCode }: { busy: boolean; error: string; onPassword(password: string): void; onRecoveryCode(code: string): void }) {
  const [mode, setMode] = useState<'password' | 'recovery'>('password');
  const [value, setValue] = useState('');
  return (
    <>
      <PageHeader eyebrow="Personal Ecosystem" title="Kluis openen" description="Je gegevens zijn versleuteld. Open de kluis om verder te gaan." />
      <Card>
        <form onSubmit={(event: FormEvent) => { event.preventDefault(); (mode === 'password' ? onPassword : onRecoveryCode)(value); }}>
          {mode === 'password' ? (
            <Field label="Kluiswachtwoord">
              <input type="password" autoComplete="current-password" value={value} onChange={(event) => setValue(event.target.value)} />
            </Field>
          ) : (
            <Field label="Herstelcode">
              <input value={value} autoComplete="off" spellCheck={false} onChange={(event) => setValue(event.target.value)} />
            </Field>
          )}
          {error && <ErrorBanner message={error} />}
          <Button type="submit" disabled={busy || !value}>{busy ? 'Bezig…' : 'Openen'}</Button>{' '}
          <Button type="button" variant="secondary" onClick={() => { setMode(mode === 'password' ? 'recovery' : 'password'); setValue(''); }}>
            {mode === 'password' ? 'Met herstelcode openen' : 'Met wachtwoord openen'}
          </Button>
        </form>
      </Card>
    </>
  );
}

function MigrationStep({ phase, busy, error, onBackup, onMigrate, onContinue, onLock }: {
  phase: Extract<Phase, { name: 'migrate' }>;
  busy: boolean;
  error: string;
  onBackup(): void;
  onMigrate(): void;
  onContinue(): void;
  onLock(): void;
}) {
  const remaining = totalOf(phase.counts);
  const kept = phase.reports?.flatMap((report) => report.kept.map((record) => ({ ...record, appId: report.appId }))) ?? [];
  const migrated = phase.reports?.reduce((sum, report) => sum + report.migrated, 0) ?? 0;
  return (
    <>
      <PageHeader eyebrow="Kluis" title="Gegevens versleutelen" description="Op dit apparaat staan nog gegevens van vóór de versleuteling. Zet ze over voordat je de app gebruikt." />
      <Card>
        <p>Nog onversleuteld: <strong>{remaining}</strong> {remaining === 1 ? 'record' : 'records'}.</p>
        <ol>
          <li>Download eerst een back-up. Dat bestand is <strong>niet versleuteld</strong>; bewaar het veilig of verwijder het na controle.</li>
          <li>Zet daarna over. Elk record wordt versleuteld opgeslagen, teruggelezen en vergeleken; pas dan verdwijnt de onversleutelde versie.</li>
        </ol>
        {error && <ErrorBanner message={error} />}
        <p>
          <Button type="button" variant="secondary" disabled={busy} onClick={onBackup}>Back-up downloaden</Button>{' '}
          <Button type="button" disabled={busy || !phase.backedUp || remaining === 0} onClick={onMigrate}>{busy ? 'Bezig…' : 'Overzetten'}</Button>{' '}
          <Button type="button" variant="secondary" onClick={onLock}>Vergrendelen</Button>
        </p>
        {phase.reports && (
          <div role="status">
            <p>{migrated} {migrated === 1 ? 'record' : 'records'} versleuteld. {kept.length === 0 ? 'Alles is overgezet.' : `${kept.length} ${kept.length === 1 ? 'record bleef' : 'records bleven'} onversleuteld staan:`}</p>
            {kept.length > 0 && (
              <ul>{kept.map((record) => <li key={`${record.appId}/${record.store}/${record.id}`}>{record.appId} · {record.store} · {record.id}: {record.reason}</li>)}</ul>
            )}
          </div>
        )}
        {remaining === 0 && <Button type="button" onClick={onContinue}>Naar de app</Button>}
        {remaining > 0 && kept.length > 0 && (
          <p>
            De records hierboven blijven onversleuteld op dit apparaat staan en zijn in de app niet zichtbaar tot ze zijn overgezet.
            Je kunt het later opnieuw proberen.{' '}
            <Button type="button" variant="secondary" onClick={onContinue}>Toch naar de app</Button>
          </p>
        )}
      </Card>
    </>
  );
}
