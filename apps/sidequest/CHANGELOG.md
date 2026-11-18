# Changelog SIDEQUEST

Formaat: [Keep a Changelog](https://keepachangelog.com/nl/1.1.0/). Versies volgens Semantic Versioning, per app.

## [Niet uitgebracht]

### Toegevoegd

- Quests met categorie, optionele deadline en optionele benoemde stappen (afvinken); filteren op categorie, sorteren op deadline en actieve quests bewerken. Voltooide quests liggen vast. Oude quests en back-ups blijven geldig (categorie "Overig", geen deadline, alleen teller).
- Local-first React-app met eigen IndexedDB-namespace, dashboard, doelen, dagelijkse/wekelijkse gewoontes, streaks en quests.
- Transparante, deterministische puntenberekening: 5 punten per habitcheck en ingestelde reward bij voltooiing.
- Appgebonden export/herstel en eigen PWA-build.

### Beperkingen

- Geen login, cloudsync, Supabase-migratie, groepen, AI of productie-deployment.
- Het ontwerp in `docs/sidequest/SIDEQUEST_DESIGN.md` blijft richtinggevend voor vervolgfasen; alleen de beschreven MVP-functies zijn nu aanwezig.
