# SIDEQUEST

Persoonlijke doelen, gewoontes en quests binnen Personal Ecosystem. Deze app is lokaal te gebruiken zonder account, netwerk of externe dienst.

## Starten en testen

```sh
npm ci                         # repository-root
npm run dev:sidequest
npm run build:sidequest
npm test
npm run test:e2e
```

In de app kun je doelen met categorie/deadline/progressie vastleggen, dagelijkse of wekelijkse gewoontes registreren en quests afronden met een categorie, een optionele deadline, een vooraf gekozen puntenbeloning en óf een teller óf benoemde stappen die je afvinkt (max. 30). Actieve quests staan op eerstvolgende deadline en zijn te filteren op categorie en te bewerken; een voltooide quest ligt vast. Punten worden berekend uit geregistreerde checks (5 per check) en eenmaal uit afgeronde questbeloningen. Gemiste dagen verlagen geen punten. In Personal Ecosystem kun je bij Instellingen de koppeling met Sport aanzetten: dan levert elke dag met een training (Sport, Kracht of Duur) 10 punten op, alleen vanaf de dag van aanzetten.

Op de pagina Voortgang zie je je level (level 2 bij 100 punten; elk volgend level kost 50 punten meer dan het vorige), negen badges met de datum waarop je ze behaalde, statistieken, punten per week en een kalender-heatmap. Badges zijn alleen erkenning en geven geen punten. Alles wordt berekend uit je bestaande gewoontechecks en quests; er wordt niets extra opgeslagen.

SIDEQUEST-data staat in de IndexedDB-database `personal-ecosystem-sidequest`; export en herstel zijn appgebonden en herstel vraagt bevestiging. Doelen, gewoontes en quests worden niet gedeeld met huishoud-challenges in Samen Thuis.

## Scope en beperkingen

- Geen login, cloudsync, groepen, agenda-koppeling, badges, puntenwinkel of AI.
- Geen Supabase-migratie uitgevoerd.
- Offline service worker cachet alleen statische appbestanden.
- Zie [gebruikershandleiding](docs/USER_GUIDE.md), [design/architectuur](../../docs/sidequest/SIDEQUEST_DESIGN.md), [deployment](../../DEPLOYMENT.md) en [roadmap](../../DEVELOPMENT_ROADMAP.md).

Licentiebeleid staat in ADR 0012; op dit moment is geen licentie toegekend.
