# ADR 0022 — Herinneringen binnen Personal Ecosystem

- **Status:** geaccepteerd (2026-11-18)
- **Besluit-ID:** B-23
- **Herziet deels:** [ADR 0018](0018-hub-herinneringen-uitgesteld.md) (H-5). De rest van ADR 0018 blijft gelden: geen herinneringsopslag en geen categorie `reminder` in `hub.notifications`.
- **Bouwt voort op:** [ADR 0020](0020-een-app-met-modules.md)

## Context

- ADR 0018 stelde herinneringen in de Hub uit. Ze zouden pas opnieuw bekeken worden bij een concrete aanvullende behoefte, bijvoorbeeld privéherinneringen die huisgenoten niet zien.
- Personal Ecosystem (ADR 0020) heeft inmiddels eigen modules met persoonlijke items: gewoontes, quest-deadlines, dagboek, lichaam, voeding en back-up. Samen Thuis kent die items niet, en ze horen daar ook niet; het zijn privégegevens.
- De eigenaar koos op 2026-11-18 voor herinneringen **alleen binnen de app**, voor **eigen module-items**. Web-push en meldingen buiten de app blijven een apart besluit.

## Besluit

1. Herinneringen worden **afgeleid** uit gegevens die het dashboard al leest, volgens dezelfde leescontracten als ADR 0020 § 2 en DATA_OWNERSHIP.md. Er worden **geen herinneringen opgeslagen**, in geen enkele database en niet in de back-up.
2. Soorten herinneringen (regels in `apps/ecosystem/src/reminders/rules.ts`):

   | Soort | Wanneer |
   |---|---|
   | Dagelijkse gewoontes | Er staan nog dagelijkse gewoontes open. Vanaf 20:00 als waarschuwing. |
   | Weekgewoontes | Het aantal checks dat nog nodig is, is minstens het aantal dagen dat deze week nog beschikbaar is. |
   | Quest-deadlines | Een quest is te laat, of de deadline valt vandaag, morgen of overmorgen. |
   | Dagboek | Vandaag nog niets geschreven, vanaf 19:00. Alleen als de module de afgelopen 14 dagen is gebruikt. |
   | Lichaam | Vandaag nog niets ingevuld, vanaf 10:00. Zelfde voorwaarde over 14 dagen gebruik. |
   | Voeding | Vandaag nog niets geregistreerd, vanaf 13:00. Zelfde voorwaarde over 14 dagen gebruik. |
   | Back-up | De laatste centrale back-up is ouder dan 14 dagen of er is er nog geen. Alleen als er gegevens zijn. |

3. **Weergave:**
   - Bovenaan het dashboard staat een blok "Herinneringen" met per herinnering een link naar de module.
   - In de modulebalk staat een teller bij "Dashboard", met een voorleesnaam zoals "Dashboard, 2 herinneringen".
   - Herinneringen tonen alleen tellers en categorieën, geen titels van quests of inhoud van notities.
4. **Instellingen per apparaat:** welke soorten aan staan, en per soort de datum waarop je hem voor die dag verborgen hebt ("Vandaag verbergen"). Dit staat in localStorage onder `personal-ecosystem.reminders.settings`. Het is alleen een voorkeur; zonder opslag staan alle soorten aan.
5. **Niet:**
   - geen meldingen via de Notification API, geen web-push en geen service-worker-meldingen;
   - geen netwerkverzoeken;
   - geen schrijfacties in moduledatabases;
   - niets uit Samen Thuis of Coach.

   `separation.test.ts` controleert de eerste drie punten voor `reminders/` en `dashboard/data.ts`.

## Gevolgen

- **Geen nieuwe opslag:** er komt geen nieuwe database, migratie of back-upversie bij.
- **Extra werk bij het openen van een pagina:** op elke modulepagina leest de app-shell na ongeveer 0,8 seconde de samenvattingen om de teller te berekenen. Daarna gebeurt dit opnieuw als het tabblad weer zichtbaar wordt, en elke 5 minuten. Op het dashboard worden de gegevens zo twee keer gelezen.
- **Teller loopt soms achter:** binnen een module kan de teller tot de volgende herberekening achterlopen, bijvoorbeeld direct na het afvinken van een gewoonte.
- **Alleen in de app:** herinneringen werken alleen als je de app opent. Meldingen buiten de app vragen een nieuw besluit, met toestemming, kosten en privacy erbij.
