import { useEffect, useState } from 'react';
import '@ecosystem/sidequest/theme.css';
import SidequestApp from '@ecosystem/sidequest/App';
import { downloadJson } from '@ecosystem/core';
import { openLocalDatabase, type LocalDatabase } from '@ecosystem/storage';
import { LoadingState, type ModuleLink } from '@ecosystem/ui';
import { loadTrainingDays } from '../integrations/trainingDays';
import {
  loadGrowthSidequestData,
  migrationResultMessage,
  migrateSidequestToGrowth
} from '../integrations/sidequestToGrowth';
import { databaseConfig as growthDatabaseConfig } from './groei/storage';

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

  async function withGrowth<T>(action: (database: LocalDatabase) => Promise<T>): Promise<T> {
    const growth = await openLocalDatabase(growthDatabaseConfig);
    try {
      return await action(growth);
    } finally {
      growth.close();
    }
  }

  async function loadGrowthIntegration(sidequest: LocalDatabase) {
    return withGrowth((growth) => loadGrowthSidequestData(sidequest, growth));
  }

  if (trainingDays === null) return <LoadingState />;
  return (
    <SidequestApp
      basename="/quest"
      moduleLinks={links}
      trainingDays={trainingDays}
      growthIntegration={{
        load: loadGrowthIntegration
      }}
      onMigrateToGrowth={async (database: LocalDatabase) => {
        const backup = await database.exportData();
        downloadJson('sidequest-backup-voor-groei.json', backup);
        if (!window.confirm('De back-up is gedownload. Zet SIDEQUEST-doelen en -gewoontes nu over naar Groei? De brondata blijft behouden.')) {
          return 'Migratie geannuleerd.';
        }
        return withGrowth(async (growth) => {
          const result = await migrateSidequestToGrowth(backup, growth);
          return migrationResultMessage(result);
        });
      }}
    />
  );
}
