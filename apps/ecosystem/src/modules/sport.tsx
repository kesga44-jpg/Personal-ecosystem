import { useEffect, useState } from 'react';
import '@ecosystem/sportapp/theme.css';
import SportApp from '@ecosystem/sportapp/App';
import type { SessionDay } from '@ecosystem/sportapp/planning';
import { LoadingState, type ModuleLink } from '@ecosystem/ui';
import { loadOtherSessions } from '../integrations/trainingDays';

export default function SportModule({ links }: { links: ModuleLink[] }) {
  // Alleen datum en minuten van Kracht- en Duur-trainingen, voor het weekdoel en de planning (PR 13).
  const [otherSessions, setOtherSessions] = useState<SessionDay[] | null>(null);
  useEffect(() => {
    let active = true;
    loadOtherSessions()
      .then((sessions) => active && setOtherSessions(sessions))
      .catch(() => active && setOtherSessions([]));
    return () => {
      active = false;
    };
  }, []);
  if (otherSessions === null) return <LoadingState />;
  return <SportApp basename="/sport" moduleLinks={links} otherSessions={otherSessions} />;
}
