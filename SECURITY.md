# Beveiliging SIDEQUEST

Aanvulling op de root-[SECURITY.md](../../../SECURITY.md), ADR 0001, ADR 0007 en ADR 0013 (voorgesteld). Status: **voorgesteld**.

## 1. Wat beschermen we

| Gegevens | Gevoeligheid | Wie mag het zien |
|---|---|---|
| Doelen, quests, voortgang, statistieken | Persoonlijk (kan gevoelige thema's bevatten, bijv. "stoppen met roken") | Alleen de gebruiker |
| XP, munten, badges | Persoonlijk | Alleen de gebruiker |
| Score binnen een uitdaging | Gedeeld na keuze | Deelnemers van die uitdaging, alleen bij `share_score` |
| Uitnodigingscodes | Geheim | Niemand (alleen hash opgeslagen) |

Geen gezondheids-, lichaams- of financiële gegevens in `quest`.

## 2. Dreigingen en maatregelen

| # | Dreiging | Maatregel |
|---|---|---|
| T-1 | Huisgenoot of andere gebruiker leest questdata | RLS op `user_id`; ISO-8-tests; geen gedeelde huishoudrechten |
| T-2 | Token van een andere app (Hub, Sportapp, Samen Thuis) leest `quest` | ADR 0013: `only_sidequest_app` + `require_aal2` op elke tabel, controle in elke RPC; ISO-13 t/m ISO-15 |
| T-3 | XP of munten vervalsen via directe insert | Geen `insert`-recht op ledgers; alleen RPC's; onveranderlijk door trigger |
| T-4 | Dubbele XP door herhaald versturen | Unieke sleutels + `on conflict do nothing`; idempotentietests |
| T-5 | Uitnodigingscode raden | Willekeurige code ≥ 128 bit, hash opgeslagen, 7 dagen geldig, max. gebruik, rate-limit op `accept_invitation` |
| T-6 | Deelnemer leest overige data van andere deelnemers | Lezen alleen via `challenge_leaderboard()`; alleen naam + score |
| T-7 | XSS steelt token | Eigen origin (ADR 0005), strikte CSP, geen externe scripts, geen `dangerouslySetInnerHTML`, React-escaping |
| T-8 | Kwaadaardig `.ics`-bestand | Parseren als tekst met grootte- en aantalslimiet; nooit als HTML renderen; voorbeeld vóór opslaan |
| T-9 | Lokale AI produceert schadelijke of foute wijzigingen | Alleen voorstellen, zod-validatie, bevestiging door gebruiker; geen AI-pad naar voortgang of XP |
| T-10 | Databaselimiet volschrijven | Lengtelimieten, max. 500 actieve quests, max. 14 dagen vooruit materialiseren |
| T-11 | Meldingen lekken inhoud naar Hub | Alleen titel/tekst met algemene inhoud; geen doeltitels in tellers (`summary_for_me`) |
| T-12 | Gegevens blijven na verwijderen | `delete_my_data()`; `on delete cascade` op `auth.users` |

## 3. CSP (`apps/sidequest/public/_headers`, voorstel)

```
/*
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' https://<project-a>.supabase.co; frame-ancestors 'none'; base-uri 'self'; form-action 'self'
  Referrer-Policy: strict-origin-when-cross-origin
  X-Content-Type-Options: nosniff
  Permissions-Policy: camera=(), microphone=(), geolocation=()
```

Modelhosts voor WebLLM komen pas in `connect-src` bij SQ-5, na licentiecontrole.

## 4. Melden van problemen

Beveiligingsproblemen niet als openbaar issue melden (de repo is openbaar); rechtstreeks aan de eigenaar.
