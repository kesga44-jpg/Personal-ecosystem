import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { databaseConfig as hubConfig } from '@ecosystem/hub/App';
import { databaseConfig as sportConfig } from '@ecosystem/sportapp/App';
import { databaseConfig as questConfig } from '@ecosystem/sidequest/App';
import { databaseConfig as lichaamConfig } from './modules/lichaam/storage';
import { databaseConfig as dagboekConfig } from './modules/dagboek/storage';

// ADR 0020 § 2: elke module heeft een eigen database en schrijft alleen daarin.
const configs = { hub: hubConfig, sportapp: sportConfig, sidequest: questConfig };
const newModules = { lichaam: lichaamConfig, dagboek: dagboekConfig };
const allNames = [...Object.values(configs), ...Object.values(newModules)].map((config) => config.databaseName);

describe('gescheiden opslag per module', () => {
  it('gebruikt per module een eigen databasenaam', () => {
    expect(hubConfig.databaseName).toBe('personal-ecosystem-hub');
    expect(sportConfig.databaseName).toBe('personal-ecosystem-sport');
    expect(questConfig.databaseName).toBe('personal-ecosystem-sidequest');
    expect(lichaamConfig.databaseName).toBe('personal-ecosystem-lichaam');
    expect(dagboekConfig.databaseName).toBe('personal-ecosystem-dagboek');
    expect(new Set(allNames).size).toBe(allNames.length);
  });

  it('noemt in de broncode van een module geen database van een andere module', () => {
    const root = join(process.cwd(), 'apps');
    for (const [app, config] of Object.entries(configs)) {
      const others = Object.values(configs).filter((other) => other !== config).map((other) => other.databaseName);
      const sourceDir = join(root, app, 'src');
      for (const file of readdirSync(sourceDir).filter((name) => /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name))) {
        const source = readFileSync(join(sourceDir, file), 'utf8');
        for (const name of others) expect(source.includes(name), `${app}/src/${file} noemt ${name}`).toBe(false);
      }
    }
  });

  for (const [module, config] of Object.entries(newModules)) {
    it(`module ${module} noemt geen andere database en doet geen netwerkverzoeken`, () => {
      const dir = join(process.cwd(), 'apps', 'ecosystem', 'src', 'modules', module);
      const others = allNames.filter((name) => name !== config.databaseName);
      for (const file of readdirSync(dir).filter((name) => /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name))) {
        const source = readFileSync(join(dir, file), 'utf8');
        for (const name of others) expect(source.includes(name), `${module}/${file} noemt ${name}`).toBe(false);
        expect(/fetch\(|XMLHttpRequest|sendBeacon|WebSocket/.test(source), `${module}/${file} doet een netwerkverzoek`).toBe(false);
      }
    });
  }
});
