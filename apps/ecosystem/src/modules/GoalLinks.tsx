import { useCallback, useEffect, useState } from 'react';
import { checkNewLink, newId, type EcosystemModuleLink, type LookupItem } from '@ecosystem/core';
import type { LocalDatabase } from '@ecosystem/storage';
import { Button, ErrorBanner, Field } from '@ecosystem/ui';
import { listGoalLookup } from './groei/goalLookup';

type SourceModule = 'financien' | 'voeding';

export function GoalLinks({ database, module, sourceId }: { database: LocalDatabase; module: SourceModule; sourceId: string }) {
  const [links, setLinks] = useState<EcosystemModuleLink[]>([]);
  const [goals, setGoals] = useState<LookupItem[]>([]);
  const [selected, setSelected] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const [allLinks, items] = await Promise.all([database.list<EcosystemModuleLink>('links'), listGoalLookup()]);
    setLinks(allLinks.filter((link) => link.from.module === module && link.from.id === sourceId && (link.category === 'supports-goal' || link.category === 'tracks') && link.to.module === 'groei'));
    setGoals(items.filter((item) => item.kind === 'doel'));
  }, [database, module, sourceId]);

  useEffect(() => {
    void refresh().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Koppelingen konden niet worden geladen.'));
  }, [refresh]);

  async function save() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const goal = goals.find((item) => item.id === selected);
      const existing = links.find((link) => link.id === editing);
      if (!goal || goal.kind !== 'doel' || checkNewLink({ category: existing?.category ?? 'supports-goal', ownModule: module, from: { module, id: sourceId }, to: { module: 'groei', id: goal.id, kind: goal.kind } })) {
        throw new Error('Kies een beschikbaar Groei-doel.');
      }
      if (links.some((link) => link.to.id === goal.id && link.id !== editing)) throw new Error('Dit doel is al gekoppeld.');
      const now = new Date().toISOString();
      const link: EcosystemModuleLink = existing
        ? { ...existing, to: { module: 'groei', id: goal.id }, updatedAt: now }
        : { id: newId(), category: 'supports-goal', from: { module, id: sourceId }, to: { module: 'groei', id: goal.id }, createdAt: now, updatedAt: now };
      await database.put('links', link);
      await refresh();
      setEditing(null);
      setSelected('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Koppeling opslaan is mislukt.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await database.remove('links', id);
      await refresh();
      if (editing === id) { setEditing(null); setSelected(''); }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Koppeling verwijderen is mislukt.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack" style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
      <p className="item-title">Groei-doelen</p>
      {links.map((link) => (
        <div className="row" key={link.id} style={{ flexWrap: 'wrap', justifyContent: 'flex-start' }}>
          <span>{goals.find((goal) => goal.id === link.to.id)?.title ?? 'Niet meer beschikbaar'}</span>
          {link.category === 'tracks' && <span>Meet de voortgang van</span>}
          <button type="button" className="text-button" disabled={busy} onClick={() => { setEditing(link.id); setSelected(link.to.id); }}>Aanpassen</button>
          <button type="button" className="text-button" disabled={busy} onClick={() => void remove(link.id)}>Koppeling verwijderen</button>
        </div>
      ))}
      <Field label={editing ? 'Groei-doel aanpassen' : 'Groei-doel koppelen'} hint="Optioneel">
        <select value={selected} disabled={busy} onChange={(event) => setSelected(event.target.value)}>
          <option value="">Kies een doel</option>
          {goals.map((goal) => <option key={goal.id} value={goal.id}>{goal.title}</option>)}
          {selected && !goals.some((goal) => goal.id === selected) && <option value={selected}>Niet meer beschikbaar</option>}
        </select>
      </Field>
      {error && <ErrorBanner message={error} />}
      <div className="row" style={{ flexWrap: 'wrap', justifyContent: 'flex-start' }}>
        <Button type="button" variant="secondary" disabled={busy} onClick={() => void save()}>{editing ? 'Koppeling wijzigen' : 'Doel koppelen'}</Button>
        {editing && <Button type="button" variant="secondary" disabled={busy} onClick={() => { setEditing(null); setSelected(''); }}>Annuleren</Button>}
      </div>
    </div>
  );
}
