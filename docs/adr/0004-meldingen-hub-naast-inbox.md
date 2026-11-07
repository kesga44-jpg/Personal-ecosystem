# ADR 0004 — Hub-meldingen naast Samen Thuis Inbox

- **Status:** geaccepteerd (2026-11-07)
- **Besluit-ID:** B-4

## Besluit

- Samen Thuis Inbox (`inbox-core.js`) blijft ongewijzigd en blijft eigenaar van huishoudmeldingen.
- Hub krijgt `hub.notifications` voor Hub, Sportapp en SIDEQUEST, aangemaakt via `hub.notify()` (alleen eigen gebruiker).
- Koppeling Samen Thuis → Hub (I-9) alleen later, opt-in, als losse PR in de Samen Thuis-repo na akkoord.

## Gevolgen

Twee meldingenlijsten zolang I-9 niet bestaat; Hub toont een tegel "Samen Thuis-inbox openen".
