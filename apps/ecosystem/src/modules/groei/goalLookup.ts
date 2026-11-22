import { openLocalDatabase } from '@ecosystem/storage';
import { groeiLookupItems, type Goal } from './domain';
import { databaseConfig } from './storage';

export async function listGoalLookup() {
  const db = await openLocalDatabase(databaseConfig);
  try {
    const goals = await db.list<Goal>('goals');
    return groeiLookupItems(goals.map((goal) => goal.id), { goals, skills: [], actions: [], habits: [] });
  } finally {
    db.close();
  }
}
