# ADR 0015 — Hub: ecosysteemregister gescheiden van eigen snelkoppelingen

- **Status:** geaccepteerd (2026-11-07)
- **Besluit-ID:** H-2, H-6

## Context

De opdracht voor Dashboard Hub vraagt dat gebruikers later zelf applicaties kunnen toevoegen. [APP_REGISTRY.md](../../APP_REGISTRY.md) is de enige bron van waarheid voor apps in het ecosysteem, en `hub.apps` wordt alleen via migraties gevuld.

## Besluit

1. **Ecosysteem-apps** (Samen Thuis, Coach, Hub, Sportapp, SIDEQUEST en toekomstige officiële apps) staan alleen in `APP_REGISTRY.md`, `apps/hub/src/registry.json` en (F3) `hub.apps`. Toevoegen of wijzigen gebeurt uitsluitend via een PR met akkoord van de eigenaar. CI controleert dat `registry.json` en `APP_REGISTRY.md` overeenkomen.
2. **Eigen snelkoppelingen** zijn persoonlijke links per gebruiker (F2 lokaal, F3 in `hub.user_links`). Ze staan los van het register, krijgen geen statuscontrole, geen integraties en geen rechten. Een snelkoppeling maakt een app nooit "officieel".
3. Alleen `https://`-URL's, plus `http://localhost` voor ontwikkelen; openen met `noopener,noreferrer`.
4. **Iconen (H-6):** ingebouwde SVG-iconen (lucide-react, ISC), emoji en kleuren. Geen uploads en geen nieuwe Storage-bucket.

## Alternatieven

- Gebruikers schrijven in `hub.apps`: afgewezen, ondermijnt het register.
- Eigen iconen uploaden: afgewezen, vraagt een nieuwe bucket.

## Gevolgen

- Twee soorten tegels in de UI, visueel te onderscheiden ("Ecosysteem" en "Eigen").
- Geen netwerkverkeer naar hosts van eigen snelkoppelingen, dus geen CSP-uitbreiding nodig.
