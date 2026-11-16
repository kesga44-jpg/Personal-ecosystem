import { describe, expect, it } from 'vitest';
import { isSafeUrl, validateHubBackup } from './domain';

describe('Hub backup and URL validation', () => {
  it('only accepts secure app and shortcut destinations', () => {
    expect(isSafeUrl('https://example.com')).toBe(true);
    expect(isSafeUrl('http://localhost:5173')).toBe(true);
    expect(isSafeUrl('http://example.com')).toBe(false);
    expect(isSafeUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeUrl('https://user:pass@example.com')).toBe(false);
  });

  it('accepts empty and valid Hub backups', () => {
    expect(() => validateHubBackup({ stores: { launches: [], shortcuts: [] } })).not.toThrow();
    expect(() => validateHubBackup({
      stores: {
        launches: [{ id: 'launch', appId: 'sportapp', appName: 'Sportapp', openedAt: '2026-11-15T00:00:00Z' }],
        shortcuts: [{ id: 'shortcut', title: 'Example', url: 'https://example.com/', createdAt: '2026-11-15T00:00:00Z' }]
      }
    })).not.toThrow();
  });

  it('rejects backup links with unsafe schemes before restore', () => {
    expect(() => validateHubBackup({
      stores: {
        launches: [],
        shortcuts: [{ id: 'one', title: 'Bad link', url: 'javascript:alert(1)', createdAt: '2026-11-15T00:00:00Z' }]
      }
    })).toThrow('snelkoppelingsgegevens');
  });
});
