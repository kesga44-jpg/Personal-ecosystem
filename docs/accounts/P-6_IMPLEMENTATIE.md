# P-6 — lokale implementatie

**Status:** in ontwikkeling. Deze documentatie beschrijft alleen lokale code en synthetische testgegevens. Er zijn geen productie-endpoints, accounts, secrets of databases geconfigureerd. P-2, P-4 en P-5 blijven afzonderlijke vrijgavepoorten; deze implementatie activeert geen live login of synchronisatie.

## PR-volgorde

1. **Versleutelde opslagbasis:** `@ecosystem/storage` krijgt een adapter die alleen versleutelde enveloppen met willekeurige record-ID's naar IndexedDB schrijft. De adapter ontvangt de sleutel uitsluitend via een runtimeprovider en hergebruikt de lokale back-upvalidatie. Nog niet aangesloten op de modules.
2. **Kluis en sessielevenscyclus:** aanmaken, controle van de herstelcode, ontgrendelen, handmatig en automatisch vergrendelen, en veilige afhandeling van openstaande invoer.
3. **Lokale account- en TOTP-testomgeving:** uitsluitend synthetische accounts en een lokale auth-adapter. De productieauth-adapter blijft uitgeschakeld; tests moeten de verplichte TOTP/AAL2-contracten aantonen.
4. **Sync en herstel:** transportcontract, retry na netwerkfouten, versiecontrole, expliciete conflictoplossing, back-up en herstel. Alleen testtransporten totdat P-5 is vrijgegeven.
5. **App-integratie:** alle PE-databases aansluiten op versleutelde opslag; lokale bestaande gegevens alleen via een expliciete, controleerbare migratie omzetten. Accountexport en -verwijdering integreren; serververwijdering blijft afhankelijk van P-5.

Elke stap is een afzonderlijke, gestapelde PR met gerichte tests, documentatie en changelog. Geen PR wordt automatisch gemerged.

## Opslagcontract

- De huidige `openLocalDatabase`-adapter blijft de pre-P-6 lokale opslag tijdens de overgang. Hij is niet de definitieve opslag voor een ingeschakelde P-6-sessie.
- `openEncryptedLocalDatabase` gebruikt een afzonderlijke database met `-encrypted` achter de databasenaam. Store-namen zijn zichtbaar; record-ID en inhoud zitten in het versleutelde payload.
- Ruwe records bevatten module, willekeurige `itemId`, versie, IV, ciphertext en tombstone-indicator. Een `CryptoKey` wordt niet opgeslagen of door de adapter vastgehouden; iedere bewerking vraagt de actieve sleutel bij de runtimeprovider op.
- Writes worden binnen dezelfde browserorigin via Web Locks geserialiseerd. In browsers zonder Web Locks worden writes geweigerd in plaats van onveilig tussen tabs te concurreren.
- Lees-, schrijf-, export- en herstelbewerkingen gebruiken dezelfde `encryptedDatabaseLockName`. De sessiebeheerder moet alle geopende database-locks innemen voordat hij de sleutel wist, zodat een lopende decryptie of opslagbewerking niet achter een vergrendelde UI doorloopt.
- Verwijderen schrijft een versleutelde tombstone. Export ontsleutelt alleen na een expliciete aanroep. Herstel valideert eerst en schrijft daarna alleen versleutelde enveloppen.
- De adapter is nog niet op de app aangesloten en migreert nog geen bestaande plaintext databases. Gebruik hem daarom nog niet voor bestaande gebruikersgegevens.

## Beveiligingsgrenzen

- Lokale tests gebruiken alleen synthetische records en sleutels.
- De lokale storage-adapter en tests zijn geen bewijs voor Supabase Auth, de P-5-RPC's, productieautorisatie of ISO-17.
- Er is nog geen lokale Supabase-configuratie of root database-testscript in deze repository. De lokale auth-/database-testvoorziening moet vóór de bijbehorende PR's expliciet worden ingericht.
- Productieconfiguratie, productiegegevens, live TOTP, externe databaseverbindingen en live synchronisatie blijven uitgeschakeld totdat de vereiste poorten en afzonderlijke livegangvrijgave zijn voltooid.
