# P-2 — stappenplan back-up van project A (ADR 0014)

**Status:** plan, nog niets uitgevoerd. **Keuzes eigenaar (2026-11-21):** back-up draait in een privé GitHub-repo
`ecosystem-backups`; K-2 = CI-hersteltestsleutel (automatische maandelijkse hersteltest); eerst alleen de database,
Storage-bestanden later. **Poort P-2 is gehaald** als de eerste back-up met een geslaagde hersteltest in de privé-repo
staat.

Wie doet wat: stappen met 🧑 doe jij (dashboards, sleutels, geheimen). Stappen met 🤖 doe ik. Ik zie nooit een
wachtwoord of privésleutel; stuur die ook niet in de chat of naar ChatGPT.

## Overzicht

| # | Stap | Wie | Wijzigt productie? | Apart akkoord nodig |
|---|---|---|---|---|
| 0 | Controles vooraf (alleen lezen) | 🧑 (mag via ChatGPT) | Nee | Nee |
| 1 | Twee age-sleutels maken | 🧑 | Nee | Nee |
| 2 | Privé-repo `ecosystem-backups` aanmaken | 🧑 | Nee | Nee |
| 3 | Scripts en workflows in de privé-repo (via PR) | 🤖 → 🧑 mergen | Nee | Nee |
| 4 | Rol `backup_reader` in project A (K-4) | 🧑 in de SQL-editor | **Ja** | **Ja** |
| 5 | Geheimen in de privé-repo | 🧑 | Nee | Nee |
| 6 | Eerste back-up + hersteltest starten | 🧑 start, 🤖 controleert | Nee (alleen lezen) | Nee |
| 7 | P-2 afronden in de documentatie | 🤖 → 🧑 mergen | Nee | Nee |

## Stap 0 — controles vooraf (alleen lezen)

In de SQL-editor van project A (of via ChatGPT; er zitten geen geheimen in):

```sql
select current_setting('server_version') as versie;
select extname, extversion from pg_extension order by 1;
select count(*) as bestaande_backup_reader from pg_roles where rolname = 'backup_reader';
select count(*) as large_objects from pg_largeobject_metadata;
```

Verwacht: versie 17.x; `bestaande_backup_reader` = 0; `large_objects` = 0. Stuur mij de uitkomst en de lijst met
extensies. Ik controleer onder meer of `pg_net` aan staat (zie P-2_ONDERZOEK.md) en of er extensies zijn die de
hersteltest niet kent.

## Stap 1 — twee age-sleutels (op je laptop)

1. Download `age-v1.3.2-windows-amd64.zip` van <https://github.com/FiloSottile/age/releases> en pak het uit in een
   map **buiten** `C:\Kees` (die map is met deze sessie gedeeld), bijvoorbeeld `Documenten\age`.
2. PowerShell in die map:

   ```powershell
   .\age-keygen.exe -o eigenaar.key
   .\age-keygen.exe -o ci-hersteltest.key
   ```

   Elke opdracht toont een regel `Public key: age1…`.
3. **Eigenaarsleutel** (`eigenaar.key`): de volledige inhoud in je wachtwoordmanager (veilige notitie) en op papier
   op een veilige plek. Daarmee herstel je in een noodgeval. Daarna het bestand verwijderen.
4. **CI-sleutel** (`ci-hersteltest.key`): bewaar de inhoud tot stap 5 (secret `AGE_RESTORE_KEY`) en verwijder het bestand daarna.
5. Stuur mij de twee **publieke** sleutels (`age1…`). Die zijn niet geheim; ze komen in `recipients.txt`.

Lukt het uitvoeren van `age-keygen.exe` niet op je werklaptop, zeg het dan; dan kies ik een andere route.

## Stap 2 — privé-repo

GitHub → New repository → naam `ecosystem-backups` → **Private** → "Add a README file" aan → Create. Geen samenwerkers
toevoegen. Settings → Actions → General: Actions toegestaan; "Workflow permissions" mag op *Read repository contents*
blijven (de back-upjob vraagt zelf alleen schrijfrecht voor releases).

## Stap 3 — scripts en workflows (ik)

Ik zet de bestanden uit `tools/ecosystem-backups/` plus `recipients.txt` op een branch in `ecosystem-backups` en open
een PR. Jij mergt.

## Stap 4 — rol `backup_reader` in project A (K-4; databasewijziging, apart akkoord)

Doe dit **zelf** in de SQL-editor van project A, niet via ChatGPT (er staat een wachtwoord in).

1. Maak in je wachtwoordmanager een wachtwoord van 40 tekens met alleen letters en cijfers (geen leestekens; die
   breken de verbindingsstring).
2. Voer uit, met het wachtwoord op de plek van `PLAK-HIER`:

   ```sql
   create role backup_reader login password 'PLAK-HIER' bypassrls;
   grant pg_read_all_data to backup_reader;
   alter role backup_reader set default_transaction_read_only = on;
   ```

3. Verwijder de query daarna uit de SQL-editor (geschiedenis/snippet), zodat het wachtwoord daar niet blijft staan.
4. Controle (mag via ChatGPT):

   ```sql
   select rolname, rolcanlogin, rolbypassrls, rolsuper, rolcreaterole, rolcreatedb, rolconfig
   from pg_roles where rolname = 'backup_reader';
   select r.rolname as lid_van from pg_auth_members m
   join pg_roles r on r.oid = m.roleid join pg_roles u on u.oid = m.member where u.rolname = 'backup_reader';
   ```

   Verwacht: `rolcanlogin` en `rolbypassrls` = true; `rolsuper`, `rolcreaterole`, `rolcreatedb` = false;
   `rolconfig` = `{default_transaction_read_only=on}`; `lid_van` = alleen `pg_read_all_data`.

**Terugdraaien:** `drop role backup_reader;` (verwijdert alleen deze rol). **Risico:** de rol kan alles lezen,
ook de `auth`-tabellen; dat is inherent aan een volledige back-up. Hij kan niets schrijven of beheren (lokaal
getest in P-2_ONDERZOEK.md, stap 6). Het wachtwoord staat alleen in je wachtwoordmanager en als secret in de privé-repo.

## Stap 5 — geheimen in `ecosystem-backups`

Settings → Secrets and variables → Actions → New repository secret:

| Naam | Waarde |
|---|---|
| `DB_A_URL` | Dashboard project A → **Connect** → **Session pooler** (poort **5432**, niet 6543). Vervang in de string de gebruiker `postgres.<project-ref>` door `backup_reader.<project-ref>`, zet je wachtwoord op de plek van `[YOUR-PASSWORD]` en zet `?sslmode=require` achteraan |
| `AGE_RESTORE_KEY` | De volledige inhoud van `ci-hersteltest.key` (alle regels) |

Daarna `ci-hersteltest.key` verwijderen. Na een wachtwoordwijziging kan de pooler ongeveer 15 seconden weigeren.

## Stap 6 — eerste back-up

Actions → "Back-up project A" → Run workflow. Duurt een paar minuten. Ik bekijk daarna de uitkomst (alleen lezen).

- **Groen:** er staat een release `backup-a-<datum>` met drie versleutelde bestanden en een rapport zonder inhoud.
- **Rood bij de hersteltest:** de back-up staat er toch, als *pre-release* met "(hersteltest niet geslaagd)". Het
  rapport noemt alleen tabelnamen en aantallen. Supabase heeft extensies die een gewone PostgreSQL niet kent; een
  eerste run kan dus een aanpassing nodig hebben. Die doe ik via een PR in de privé-repo.

## Stap 7 — afronden

Na de eerste groene run zet ik P-2 op ✅ in ADR 0021, ADR 0014 en de besluitenlijst.

## Daarna (niet in P-2)

- **Opschonen aanzetten:** zodra je wilt dat oude back-ups echt verwijderd worden: Settings → Variables → `PRUNE` =
  `on`. Tot dan toont de workflow alleen wat hij zou verwijderen. Verwijderen is definitief.
- **Daphne informeren** dat haar Samen Thuis-gegevens ook in de (versleutelde) back-ups staan (ADR 0014 § 6).
- **Storage-bestanden** (V3 en een aparte back-upgebruiker) en project B (Coach): elk een eigen stap met akkoord.
- **Rotatie:** wachtwoord `backup_reader` elke 6 maanden, CI-sleutel jaarlijks, eigenaarsleutel elke 2 jaar.
- **Handmatige hersteltest per kwartaal** met de eigenaarsleutel (ADR 0014 § 8).
- **Certificaatcontrole:** nu `sslmode=require` (versleuteld, maar zonder controle van het servercertificaat).
  Overstappen naar `verify-full` met het Supabase-CA-certificaat onderzoek ik apart.
