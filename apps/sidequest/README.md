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

In de app kun je doelen met categorie/deadline/progressie vastleggen, dagelijkse of wekelijkse gewoontes registreren en quests met stappen en een vooraf gekozen puntenbeloning afronden. Punten worden berekend uit geregistreerde checks (5 per check) en eenmaal uit afgeronde questbeloningen. Gemiste dagen verlagen geen punten.

SIDEQUEST-data staat in de IndexedDB-database `personal-ecosystem-sidequest`; export en herstel zijn appgebonden en herstel vraagt bevestiging. Doelen, gewoontes en quests worden niet gedeeld met huishoud-challenges in Samen Thuis.

## Scope en beperkingen

- Geen login, cloudsync, groepen, agenda-koppeling, badges, puntenwinkel of AI.
- Geen Supabase-migratie uitgevoerd.
- Offline service worker cachet alleen statische appbestanden.
- Zie [gebruikershandleiding](docs/USER_GUIDE.md), [design/architectuur](../../docs/sidequest/SIDEQUEST_DESIGN.md), [deployment](../../DEPLOYMENT.md) en [roadmap](../../DEVELOPMENT_ROADMAP.md).

Licentiebeleid staat in ADR 0012; op dit moment is geen licentie toegekend.
