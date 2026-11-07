# ADR 0009 — Geen Strava/Garmin-koppeling; handmatige GPX/FIT/TCX-import

- **Status:** geaccepteerd (2026-11-07)
- **Besluit-ID:** B-9

## Besluit

- Sportapp importeert GPX-, FIT- en TCX-bestanden die de gebruiker zelf exporteert.
- Parsen gebeurt in de browser; opgeslagen wordt alleen een samenvatting (type, start, duur, afstand, eventueel gemiddelde hartslag als de gebruiker dat kiest). Ruwe tracks en locaties worden standaard **niet** bewaard.
- Optioneel bewaren van het originele bestand in `sport-media` alleen na keuze van de gebruiker, binnen de bucketlimiet.
- Dubbele import voorkomen via hash van het bestand (`source_file_sha256`, uniek per gebruiker).
- Parserbibliotheken alleen met MIT/Apache/BSD-licentie; keuze vastleggen in API_CATALOG.md bij fase F4.
