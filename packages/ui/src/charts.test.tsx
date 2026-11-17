import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BarChart, Heatmap, LineChart, ProgressRing, lineScale, niceMax } from './charts';

describe('niceMax', () => {
  it('rondt af naar een leesbare schaal', () => {
    expect(niceMax([0, 0])).toBe(1);
    expect(niceMax([7])).toBe(10);
    expect(niceMax([43])).toBe(50);
    expect(niceMax([120])).toBe(200);
  });
});

describe('lineScale', () => {
  it('begint bij nul voor tellingen', () => {
    expect(lineScale([3, 7], true)).toEqual({ min: 0, max: 10 });
  });
  it('zoomt in op gemeten waarden zoals gewicht', () => {
    expect(lineScale([80, 82], false)).toEqual({ min: 79, max: 83 });
    expect(lineScale([70, 70], false)).toEqual({ min: 69, max: 71 });
    expect(lineScale([], false)).toEqual({ min: 0, max: 1 });
  });
});

describe('grafieken', () => {
  const points = [{ label: 'ma', value: 30 }, { label: 'di', value: 0 }, { label: 'wo', value: 45.5 }];

  it('staafgrafiek heeft een beschrijving en een datatabel voor schermlezers', () => {
    render(<BarChart title="Minuten" points={points} unit="min" />);
    expect(screen.getByRole('img').getAttribute('aria-label')).toContain('ma: 30 min');
    expect(screen.getByRole('table', { name: 'Minuten' })).toBeTruthy();
    expect(document.querySelectorAll('.chart-bar')).toHaveLength(3);
  });

  it('lijngrafiek tekent een pad', () => {
    render(<LineChart title="Punten" points={points} />);
    expect(document.querySelector('.chart-line')?.getAttribute('d')).toMatch(/^M0/);
  });

  it('heatmap en voortgangsring zijn beschreven', () => {
    render(<><Heatmap title="Checks" days={[{ date: '2026-11-15', value: 0 }, { date: '2026-11-16', value: 2 }]} /><ProgressRing label="Vandaag" value={1} max={3} /></>);
    expect(screen.getByRole('img', { name: /1 van 2 dagen actief/ })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Vandaag: 1 van 3' })).toBeTruthy();
  });
});
