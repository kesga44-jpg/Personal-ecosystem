/**
 * Kaart met de route, op tegels van OpenStreetMap (alleen bekijken; niets wordt vooraf of offline opgehaald).
 * Leaflet (BSD-2) wordt pas geladen als een route met GPS wordt geopend. Je browser haalt de tegels zelf op
 * bij tile.openstreetmap.org; daarbij ziet OpenStreetMap je IP-adres en het kaartgebied, niet je trainingsgegevens.
 */
import { useEffect, useRef, useState } from 'react';
import type { TrackPoint } from './domain';

export const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

export function RouteMap({ points, label }: { points: TrackPoint[]; label: string }) {
  const container = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const element = container.current;
    const latLngs = points.filter((point) => point.lat !== null && point.lon !== null).map((point) => [point.lat!, point.lon!] as [number, number]);
    if (!element || latLngs.length < 2) return;
    let map: import('leaflet').Map | null = null;
    let cancelled = false;
    void Promise.all([import('leaflet'), import('leaflet/dist/leaflet.css')])
      .then(([module]) => {
        if (cancelled) return;
        const L = module.default;
        map = L.map(element, { scrollWheelZoom: false, attributionControl: true });
        map.attributionControl.setPrefix(false);
        L.tileLayer(TILE_URL, {
          maxZoom: 19,
          attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>-bijdragers'
        }).addTo(map);
        const line = L.polyline(latLngs, { color: '#397d71', weight: 4, opacity: 0.9 }).addTo(map);
        L.circleMarker(latLngs[0]!, { radius: 6, color: '#fff', weight: 2, fillColor: '#2f9e44', fillOpacity: 1 }).bindTooltip('Start').addTo(map);
        L.circleMarker(latLngs.at(-1)!, { radius: 6, color: '#fff', weight: 2, fillColor: '#c92a2a', fillOpacity: 1 }).bindTooltip('Finish').addTo(map);
        map.fitBounds(line.getBounds(), { padding: [20, 20] });
      })
      .catch(() => !cancelled && setError('De kaart kon niet worden geladen. De route en cijfers hieronder blijven beschikbaar.'));
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [points]);

  return (
    <div className="route-map-wrap">
      <div ref={container} className="route-map" role="img" aria-label={label} />
      {error && <p className="item-subtitle" role="alert">{error}</p>}
      <p className="widget-foot">
        Kaart: OpenStreetMap. Je browser haalt de kaarttegels zelf op; OpenStreetMap ziet daarbij je IP-adres en het kaartgebied.{' '}
        <a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noopener noreferrer">Kaartfout melden</a>
      </p>
    </div>
  );
}
