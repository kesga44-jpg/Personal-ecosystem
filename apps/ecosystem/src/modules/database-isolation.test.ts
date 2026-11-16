import { describe, expect, it } from 'vitest';
import { databaseConfig as hub } from './dashboard/database';
import { databaseConfig as sport } from './sport/database';
import { databaseConfig as sidequest } from './quest/database';

describe('module database isolation', () => {
  it('keeps each module on its existing database and schema version', () => {
    expect([
      [hub.appId, hub.databaseName, hub.version],
      [sport.appId, sport.databaseName, sport.version],
      [sidequest.appId, sidequest.databaseName, sidequest.version]
    ]).toEqual([
      ['hub', 'personal-ecosystem-hub', 1],
      ['sport', 'personal-ecosystem-sport', 1],
      ['sidequest', 'personal-ecosystem-sidequest', 1]
    ]);
  });

  it('does not let modules share a database name', () => {
    const names = [hub.databaseName, sport.databaseName, sidequest.databaseName];
    expect(new Set(names).size).toBe(names.length);
  });
});
