import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { HomePage } from './App';

describe('Hub-apptegels', () => {
  it('linkt naar de interne modules en opent Samen Thuis en Coach veilig', () => {
    render(
      <MemoryRouter>
        <HomePage
          preferences={{
            displayName: '',
            sportUrl: 'https://pe-sportapp.kesga44.workers.dev',
            sidequestUrl: 'https://pe-sidequest.kesga44.workers.dev',
            theme: 'system'
          }}
          shortcuts={[]}
          launches={[]}
          storageLabel="Beschikbaar op dit apparaat"
          error=""
          onOpen={vi.fn().mockResolvedValue(undefined)}
        />
      </MemoryRouter>
    );

    for (const [name, url] of [
      ['Sport', '/sport'],
      ['SIDEQUEST', '/quest']
    ]) {
      const link = screen.getByRole('link', { name: `Open ${name} →` });
      expect(link.getAttribute('href')).toBe(url);
      expect(link.getAttribute('target')).toBeNull();
      expect(link.getAttribute('rel')).toBeNull();
    }

    for (const [name, url] of [
      ['Samen Thuis', 'https://kesga44-jpg.github.io/Samen-thuis/'],
      ['Coach', 'https://kesga44-jpg.github.io/Coach/']
    ]) {
      const link = screen.getByRole('link', { name: `Open ${name} ↗` });
      expect(link.getAttribute('href')).toBe(url);
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    }
  });
});
