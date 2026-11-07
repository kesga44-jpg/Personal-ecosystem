# Prototype: app-gebonden sessies + verplichte MFA (ADR 0013)

Alleen lokaal. Draait op een tijdelijke PostgreSQL 16 met een minimale nabootsing van Supabase (`auth.jwt()`, `auth.uid()`, rollen `anon`/`authenticated`). Raakt geen enkel Supabase-project.

```sh
bash run.sh   # als niet-root-gebruiker; vereist /usr/lib/postgresql/16/bin
```

Resultaat op 2026-11-07: **17/17 geslaagd**.

Wat het aantoont:

- een sessie wordt na inloggen eenmalig aan één app gebonden; binden vereist `aal2` (TOTP) en kan niet worden omgezet naar een andere app;
- een SIDEQUEST-sessie kan geen sporttabellen lezen of schrijven en geen sport-RPC aanroepen, en omgekeerd;
- een ongebonden sessie (zoals Samen Thuis die gebruikt) ziet niets in de app-schema's;
- dezelfde sessie zonder `aal2` ziet niets;
- `anon` heeft geen toegang; de bindingstabel is niet direct leesbaar.

Wat het **niet** aantoont:

- gedrag van echte Supabase-tokens (dat `session_id` en `aal` altijd aanwezig zijn, is volgens de documentatie zo, maar moet met de Supabase CLI lokaal worden bevestigd);
- isolatie van Samen Thuis-data tegen tokens van nieuwe apps (zie ADR 0013, § Samen Thuis).
