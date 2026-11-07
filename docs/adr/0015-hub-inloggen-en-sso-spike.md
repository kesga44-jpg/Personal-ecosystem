# ADR 0015 — Inloggen per app; SSO via OAuth 2.1 alleen als spike

- **Status:** geaccepteerd (2026-11-07)
- **Besluit-ID:** H-4 (en voorwaarde V-1)

## Context

Gebruikers moeten niet onnodig opnieuw inloggen. Elke nieuwe app heeft een eigen origin (ADR 0005), dus sessies worden niet gedeeld. Samen Thuis en Coach mogen niet worden aangepast (V-3). Supabase documenteert een OAuth 2.1 Server ("geen aparte kosten"); beschikbaarheid op Free, status en voorwaarden zijn niet geverifieerd.

## Besluit

1. Hub, Sportapp en SIDEQUEST loggen elk afzonderlijk in met `@supabase/supabase-js` (PKCE), `persistSession`, refresh-rotatie. Eén keer inloggen per app per apparaat.
2. Afgewezen: token via URL, gedeelde cookie op eigen domein, overdracht via Edge Function met service key (zie [HUB_DESIGN.md § 7](../hub/HUB_DESIGN.md)).
3. Supabase OAuth 2.1 Server wordt alleen onderzocht in een afzonderlijke spike (H-PR17): documentatie en een lokaal prototype tegen lokale Supabase.
4. **Niets** activeren of configureren in Supabase-project A of B zonder afzonderlijke toestemming van de eigenaar.
5. De spike bewijst eerst, met bronnen: beschikbaarheid op Free, status (beta/GA), voorwaarden en limieten.
6. Een `client_id`-claim is geen beveiligingsgrens op zichzelf. RLS en RPC's moeten zonder OAuth veilig zijn (AUTH-1 t/m AUTH-10); OAuth mag alleen een extra laag zijn.
7. Samen Thuis en Coach doen niet mee.

## Gevolgen

- Het restrisico van B-13 blijft bestaan zolang tokens niet app-gebonden zijn; zie DECISIONS.md, B-13a.
