# ADR 0019 — Accountverwijdering en data-export buiten scope van F3

- **Status:** geaccepteerd (2026-11-07)
- **Besluit-ID:** V-2

## Context

[DATA_OWNERSHIP.md § 3](../../DATA_OWNERSHIP.md) en [APP_REGISTRY.md](../../APP_REGISTRY.md) beschreven "account verwijderen via Hub", met `on delete cascade` op `auth.users`. Omdat Samen Thuis hetzelfde Auth-project gebruikt, zou het verwijderen van een Hub-account onverwacht ook alle Samen Thuis-gegevens van die gebruiker (en mogelijk gedeelde huishouddata) raken.

## Besluit

1. Accountverwijdering, data-export (`<schema>.export_my_data()`), gegevensbehoud en verwijdering per app vallen **buiten** F3.
2. Eerst een afzonderlijk ontwerp dat minimaal behandelt: verwijderen per app versus heel het account; gevolgen voor Samen Thuis en gedeelde huishouddata; export vooraf; bewaartermijnen en audit; herstelmogelijkheid; tests.
3. Dat ontwerp vraagt afzonderlijke goedkeuring vóór enige bouw of migratie.
4. Tot dan biedt de Hub geen knop "account verwijderen" en geen data-export.

## Gevolgen

- De eis in DATA_OWNERSHIP § 3 ("elke nieuwe app levert vanaf de eerste versie export en verwijderen") is voor de Hub opgeschort tot het aparte ontwerp is goedgekeurd. Voor Sportapp en SIDEQUEST wordt dit in hetzelfde ontwerp meegenomen.
- APP_REGISTRY.md en DATA_OWNERSHIP.md verwijzen naar deze ADR.
