# ADR 0018 — Herinneringen in de Hub: uitgesteld

- **Status:** uitgesteld (2026-11-07); herbeoordelen bij aangetoonde aanvullende behoefte
- **Besluit-ID:** H-5

## Context

Het eerste Hub-ontwerp stelde `hub.reminders` voor. Samen Thuis heeft al routines, agenda en een inbox die herinneringen afleidt.

Eerste onderzoek (`Samen-thuis@0fa9583`, alleen code gelezen, niet functioneel getest):

| Functie | Bron | Inhoud |
|---|---|---|
| Routines (`chores`) | `app.js`, `nav-core.js` | Persoon, startdatum, herhaling (o.a. Eenmalig, Dagelijks, Wekelijks, 2× per week, Elke 2 weken) |
| Agenda/planning | `app.js` | Afspraken; automatische herinneringen, bijv. APK 30 dagen vooraf |
| Inbox | `inbox-core.js`, `inbox.js` | Meldingen afgeleid uit data: taak vandaag/te laat, afspraak vandaag, vriezer, voorraad, synchronisatie; voorkeuren per categorie; gelezen-status; dedupe via sleutel |
| Push | `inbox-core.js` | Voorkeur `push` (standaard uit); geen push-implementatie gevonden in `app.js`, `inbox.js`, `sw.js` |

## Besluit

1. De Hub bouwt geen herinneringen en slaat geen herinneringsdata op.
2. Geen categorie `reminder` in `hub.notifications` zolang dit besluit geldt.
3. Herbeoordelen alleen bij een concrete aanvullende behoefte (bijv. privéherinneringen die huisgenoten niet zien, of push buiten Samen Thuis). Voorkeursroute dan: uitbreiding in Samen Thuis of koppeling I-9 (afzonderlijke PR in die repo, na akkoord), niet een tweede opslag in de Hub.

## Gevolgen

- Geen dubbele functionaliteit of gegevensopslag. De Hub toont een tegel "Samen Thuis-inbox openen" (ADR 0004).
