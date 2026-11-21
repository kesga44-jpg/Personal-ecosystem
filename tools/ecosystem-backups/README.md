# ecosystem-backups — sjabloon voor de privé back-uprepo

Deze map is de bron voor de **privé**-repo `ecosystem-backups` (ADR 0014, poort P-2). Hier staan alleen scripts en
workflows: geen geheimen, geen data. De workflows draaien **niet** in deze monorepo; ze worden naar de privé-repo
gekopieerd (zie [docs/backups/P-2_STAPPENPLAN.md](../../docs/backups/P-2_STAPPENPLAN.md)).

| Bestand hier | Plek in `ecosystem-backups` | Wat het doet |
|---|---|---|
| `workflows/backup.yml` | `.github/workflows/backup.yml` | Wekelijks (zondag 03:17 UTC) en handmatig: dump van project A als `backup_reader`, versleutelen, hersteltest, release, opschonen |
| `workflows/restore-test.yml` | `.github/workflows/restore-test.yml` | Maandelijks (de 2e, 04:43 UTC) en handmatig: hersteltest van de laatste geteste release |
| `scripts/backup.sh` | `scripts/backup.sh` | Eén alleen-lezen transactie; `pg_dump` met dezelfde snapshot; telling per tabel (aantal + md5); versleutelen met age; `MANIFEST` met SHA-256 |
| `scripts/restore-test.sh` | `scripts/restore-test.sh` | Hashes controleren, ontsleutelen, herstellen in een lege database, per tabel vergelijken |
| `scripts/prune.sh` | `scripts/prune.sh` | Bewaartermijnen: 4 weken, eerste van de maand 6 maanden, altijd minstens 3. Verwijdert pas als de repo-variabele `PRUNE` op `on` staat |
| `scripts/session.sql`, `count-tables.sql`, `supabase-roles.sql` | `scripts/` | Vaste sessie-instellingen, de telling, en lege Supabase-rollen voor de herstelomgeving |
| `test/lokaal.sh` | `test/lokaal.sh` | Lokale test met twee tijdelijke PostgreSQL-clusters (zie hieronder) |
| — | `recipients.txt` | De twee publieke age-sleutels (eigenaar en CI), één per regel. Publiek; geen geheim |

## Geheimen en variabelen in `ecosystem-backups`

| Naam | Soort | Inhoud |
|---|---|---|
| `DB_A_URL` | Secret | Verbindingsstring van de **session pooler** (poort 5432) met gebruiker `backup_reader.<project-ref>` |
| `AGE_RESTORE_KEY` | Secret | Privésleutel van de CI-hersteltestsleutel (keuze K-2) |
| `PRUNE` | Variabele | `on` om oude back-ups echt te verwijderen; leeg = alleen tonen |

## Wat de scripts bewust niet doen

- Geen inhoud, foutmeldingen met data of verbindingsgegevens in logs: alleen tabelnamen, aantallen en uitkomsten.
- Geen Storage-bestanden (eerst alleen de database; Storage volgt na onderzoek V3).
- Geen herstel naar productie. Dat is een aparte, handmatige procedure met akkoord (ADR 0014 § 7).

## Lokaal testen

```bash
# Als gewone gebruiker (initdb weigert root), met PostgreSQL en age op PATH:
bash tools/ecosystem-backups/test/lokaal.sh
```

De test maakt een Supabase-achtige bron (rol zonder superuser, RLS met `FORCE`, `backup_reader` volgens de
Supabase-documentatie) en controleert onder meer: dump onder gelijktijdige schrijfacties, alleen versleutelde
uitvoer, herstel met beide sleutels, verkeerde sleutel, beschadigd bestand, ontbrekende of gewijzigde rijen,
overgeslagen extensieschema's, geen inhoud in logs, en de bewaartermijnen.
