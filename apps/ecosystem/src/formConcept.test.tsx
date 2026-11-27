import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ConceptNotice, sameShape, useFormConcept } from './formConcept';
import { formConceptKey, FORM_CONCEPT_KEYS } from './formConceptKeys';
import { discardPendingInput, pendingInputCount, savePendingInput } from './pendingInput';
import { SEALABLE_LOCAL_VALUE_KEYS } from './vault/localData';

const key = formConceptKey('groei.actie');

function Form({ scope = 'nieuw', initial = '' }: { scope?: string; initial?: string }) {
  const [title, setTitle] = useState(initial);
  const [ids, setIds] = useState<string[]>([]);
  const concept = useFormConcept('groei.actie', scope, 'Actie', { title, ids }, { title: initial, ids: [] as string[] }, (value) => {
    setTitle(value.title);
    setIds(value.ids);
  });
  return (
    <form>
      <ConceptNotice concept={concept} />
      <label>Titel<input value={title} onChange={(event) => setTitle(event.target.value)} /></label>
      <button type="button" onClick={() => setIds(['doel-1'])}>Koppel</button>
      <button type="button" onClick={() => concept.clear()}>Opgeslagen</button>
    </form>
  );
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  discardPendingInput();
});

describe('sameShape', () => {
  it('accepteert alleen dezelfde sleutels en typen', () => {
    const template = { title: '', ids: [] as string[], level: '1' };
    expect(sameShape(template, { title: 'x', ids: ['a'], level: '3' })).toBe(true);
    expect(sameShape(template, { title: 'x', ids: ['a'] })).toBe(false);
    expect(sameShape(template, { title: 'x', ids: ['a'], level: '3', extra: 1 })).toBe(false);
    expect(sameShape(template, { title: 1, ids: [], level: '3' })).toBe(false);
    expect(sameShape(template, { title: 'x', ids: [1], level: '3' })).toBe(false);
    expect(sameShape(template, null)).toBe(false);
    expect(sameShape(template, [])).toBe(false);
  });
});

describe('useFormConcept', () => {
  it('meldt zich pas aan als openstaande invoer zodra het formulier afwijkt', () => {
    render(<Form />);
    expect(pendingInputCount()).toBe(0);
    fireEvent.change(screen.getByLabelText('Titel'), { target: { value: 'Synthetische actie' } });
    expect(pendingInputCount()).toBe(1);
    fireEvent.change(screen.getByLabelText('Titel'), { target: { value: '' } });
    expect(pendingInputCount()).toBe(0);
  });

  it('bewaart de invoer bij vergrendelen en zet hem na opnieuw openen terug', async () => {
    const first = render(<Form />);
    fireEvent.change(screen.getByLabelText('Titel'), { target: { value: 'Synthetische actie' } });
    fireEvent.click(screen.getByText('Koppel'));
    await act(() => savePendingInput());
    expect(JSON.parse(localStorage.getItem(key)!)).toEqual({ scope: 'nieuw', value: { title: 'Synthetische actie', ids: ['doel-1'] } });
    first.unmount();

    render(<Form />);
    expect(await screen.findByText(/Niet-opgeslagen invoer van de vorige keer is teruggezet/)).toBeTruthy();
    expect((screen.getByLabelText('Titel') as HTMLInputElement).value).toBe('Synthetische actie');
    expect(pendingInputCount()).toBe(1);

    fireEvent.click(screen.getByText('Opgeslagen'));
    expect(localStorage.getItem(key)).toBeNull();
    expect(screen.queryByText(/teruggezet/)).toBeNull();
  });

  it('zet een concept niet terug in een formulier voor een ander record, en laat het daar staan', async () => {
    localStorage.setItem(key, JSON.stringify({ scope: 'actie-a', value: { title: 'A', ids: [] } }));
    render(<Form scope="actie-b" initial="B" />);
    expect((screen.getByLabelText('Titel') as HTMLInputElement).value).toBe('B');
    expect(screen.queryByText(/teruggezet/)).toBeNull();
    fireEvent.click(screen.getByText('Opgeslagen'));
    expect(localStorage.getItem(key)).not.toBeNull();
  });

  it('negeert een beschadigd of anders gevormd concept', () => {
    localStorage.setItem(key, JSON.stringify({ scope: 'nieuw', value: { title: 5, ids: [] } }));
    render(<Form />);
    expect((screen.getByLabelText('Titel') as HTMLInputElement).value).toBe('');
    cleanup();
    localStorage.setItem(key, '{kapot');
    render(<Form />);
    expect((screen.getByLabelText('Titel') as HTMLInputElement).value).toBe('');
  });

  it('weggooien zet het formulier terug en verwijdert het concept', async () => {
    localStorage.setItem(key, JSON.stringify({ scope: 'nieuw', value: { title: 'Oud', ids: ['doel-1'] } }));
    render(<Form />);
    fireEvent.click(await screen.findByText('Invoer weggooien'));
    expect((screen.getByLabelText('Titel') as HTMLInputElement).value).toBe('');
    expect(localStorage.getItem(key)).toBeNull();
    expect(pendingInputCount()).toBe(0);
  });

  it('een bewuste keuze om invoer weg te gooien bij vergrendelen verwijdert het concept', () => {
    localStorage.setItem(key, JSON.stringify({ scope: 'nieuw', value: { title: 'Oud', ids: [] } }));
    render(<Form />);
    discardPendingInput();
    expect(localStorage.getItem(key)).toBeNull();
  });

  it('alle formulierconcepten worden in de kluisbuild versleuteld bewaard', () => {
    for (const conceptKey of FORM_CONCEPT_KEYS) expect(SEALABLE_LOCAL_VALUE_KEYS).toContain(conceptKey);
  });
});
