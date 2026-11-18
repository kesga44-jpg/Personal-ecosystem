import { useState } from 'react';
import { Button, Card, StatusPill } from '@ecosystem/ui';
import {
  REMINDER_KINDS,
  dismissForToday,
  readReminderSettings,
  reminderLabels,
  setReminderEnabled,
  visibleReminders,
  writeReminderSettings,
  type ReminderInput,
  type ReminderSettings
} from './rules';
import { REMINDERS_CHANGED } from './events';

/** Herinneringen bovenaan het dashboard (ADR 0022). Verborgen als er niets is en je niet aan het instellen bent. */
export function RemindersCard({ input, now, today, loaded }: { input: ReminderInput; now: Date; today: string; loaded: boolean }) {
  const [settings, setSettings] = useState<ReminderSettings>(() => readReminderSettings());
  const [configuring, setConfiguring] = useState(false);
  const reminders = loaded ? visibleReminders(input, now, today, settings) : [];

  function update(next: ReminderSettings) {
    setSettings(next);
    writeReminderSettings(next);
    window.dispatchEvent(new Event(REMINDERS_CHANGED));
  }

  if (!configuring && reminders.length === 0) {
    return (
      <p className="reminders-quiet">
        {loaded ? 'Geen herinneringen voor nu.' : ''}{' '}
        <button type="button" className="text-button" onClick={() => setConfiguring(true)}>Herinneringen instellen</button>
      </p>
    );
  }

  return (
    <Card
      title={configuring ? 'Herinneringen instellen' : `Herinneringen · ${reminders.length}`}
      className="reminders-card"
      action={<Button variant="secondary" onClick={() => setConfiguring((value) => !value)} aria-pressed={configuring}>{configuring ? 'Klaar' : 'Instellen'}</Button>}
    >
      {configuring ? (
        <>
          <p className="item-subtitle">Alleen binnen de app en alleen op dit apparaat. Er gaan geen meldingen naar je telefoon of ergens anders heen.</p>
          <div className="list">
            {REMINDER_KINDS.map((kind) => (
              <label className="list-item reminder-toggle" key={kind}>
                <span>{reminderLabels[kind]}</span>
                <input type="checkbox" checked={settings.enabled[kind]} onChange={(event) => update(setReminderEnabled(settings, kind, event.target.checked))} />
              </label>
            ))}
          </div>
          <p className="item-subtitle">Dagboek, Lichaam en Voeding herinneren alleen als je die module de afgelopen 14 dagen hebt gebruikt.</p>
        </>
      ) : (
        <ul className="list reminder-list">
          {reminders.map((reminder) => (
            <li className="list-item" key={reminder.kind}>
              <div>
                <p className="item-title"><a href={reminder.href}>{reminder.title}</a></p>
                <p className="item-subtitle">{reminder.detail}</p>
              </div>
              <div className="reminder-actions">
                {reminder.tone === 'warning' && <StatusPill tone="warning">Let op</StatusPill>}
                <Button variant="secondary" aria-label={`${reminder.title} vandaag verbergen`} onClick={() => update(dismissForToday(settings, reminder.kind, today))}>Vandaag verbergen</Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
