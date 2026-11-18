import { useEffect, useState } from 'react';
import '@ecosystem/sidequest/theme.css';
import SidequestApp from '@ecosystem/sidequest/App';
import { LoadingState, type ModuleLink } from '@ecosystem/ui';
import { loadTrainingDays } from '../integrations/trainingDays';

export default function QuestModule({ links }: { links: ModuleLink[] }) {
  // Alleen datums van trainingen; SIDEQUEST gebruikt ze uitsluitend als de koppeling met Sport aan staat (PR 11).
  const [trainingDays, setTrainingDays] = useState<string[] | null>(null);
  useEffect(() => {
    let active = true;
    loadTrainingDays()
      .then((days) => active && setTrainingDays(days))
      .catch(() => active && setTrainingDays([]));
    return () => {
      active = false;
    };
  }, []);
  if (trainingDays === null) return <LoadingState />;
  return <SidequestApp basename="/quest" moduleLinks={links} trainingDays={trainingDays} />;
}
