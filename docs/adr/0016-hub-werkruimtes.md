# ADR 0016 — Hub: werkruimtes als gedeelde startpagina's

- **Status:** geaccepteerd (2026-11-07); bouwen als laatste onderdeel van F3
- **Besluit-ID:** H-3

## Context

De opdracht vraagt optionele gedeelde werkruimtes. De architectuur kent geen werkruimtes, en gedeelde authenticatie mag geen gedeelde rechten opleveren (ADR 0007).

## Besluit

1. Een werkruimte is uitsluitend een gedeelde startpagina: naam, leden (`owner`, `member`), gedeelde links en een eigen indeling.
2. Lidmaatschap geeft **nooit** toegang tot gegevens of functies van andere apps, en toont geen meldingen, status, recent of voorkeuren van andere leden.
3. Tabellen: `hub.workspaces`, `hub.workspace_members`, `hub.workspace_links`, `hub.workspace_invites`. Lezen alleen voor leden via `hub.is_workspace_member()` (security definer); schrijven via RPC door de eigenaar. Uitnodiging met eenmalige code (alleen hash opgeslagen, 7 dagen geldig, maximaal aantal gebruiken).
4. Lid worden, verlaten en rolwijzigingen komen in `hub.audit_log`.
5. Tests: AUTH-6 en AUTH-7 in [HUB_DESIGN.md § 8.2](../hub/HUB_DESIGN.md) tonen aan dat een lid niets buiten `hub.workspace_*` kan.
6. Migratie pas als laatste stap van F3, onder dezelfde voorwaarden als elke migratie op project A.

## Gevolgen

- Overlap met Samen Thuis (huishouden) wordt vermeden doordat een werkruimte alleen links bevat, geen huishouddata.
