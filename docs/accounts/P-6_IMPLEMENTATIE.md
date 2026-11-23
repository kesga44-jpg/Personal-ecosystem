# P-6 — lokale implementatie

**Status:** in ontwikkeling. Deze documentatie beschrijft alleen lokale code en synthetische testgegevens. Er zijn geen productie-endpoints, accounts, secrets of databases geconfigureerd. P-2, P-4 en P-5 blijven afzonderlijke vrijgavepoorten; deze implementatie activeert geen live login of synchronisatie.

## PR-volgorde

1. **Versleutelde opslagbasis:** `@ecosystem/storage` krijgt een adapter die alleen versleutelde enveloppen met willekeurige record-ID's naar IndexedDB schrijft. De adapter ontvangt de sleutel uitsluitend via een runtimeprovider en hergebruikt de lokale back-upvalidatie. Nog niet aangesloten op de modules.
2. **Kluis en sessielevenscyclus:** aanmaken, controle van de herstelcode, ontgrendelen, handmatig en automatisch vergrendelen, en veilige afhandeling van openstaande invoer. `VaultSession` houdt de niet-exporteerbare DEK uitsluitend in een ECMAScript private geheugenproperty; bij een lockfout blijft de sessie open en wordt de fout beschikbaar gemaakt voor de UI.
3. **Lokale account- en TOTP-testomgeving:** Supabase CLI start een geïsoleerde lokale Auth-stack; integratietests maken willekeurige synthetische accounts aan, enrollen TOTP, verifiëren een authenticatorcode en bewijzen dat toegang pas op `aal2` is toegestaan. De teststack maakt geen PE-schema of migratie aan, gebruikt geen persistente browser-sessie en wordt met zijn tijdelijke volumes verwijderd. Er is geen productieauth-adapter.
4. **Sync en herstel:** transportcontract, maximaal drie pogingen met begrensde wachttijd bij expliciet tijdelijke transportfouten, versiecontrole, expliciete conflictoplossing, back-up en herstel. Na een gedeeltelijk geslaagde sync haalt een nieuwe ronde eerst de serverstand op; een eerder opgeslagen maar onbevestigd record wordt zo herkend zonder dubbel schrijven. Opslag-, validatie- en ontsleutelfouten worden niet automatisch opnieuw geprobeerd. Alleen testtransporten totdat P-5 is vrijgegeven.
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
- `VaultSession` is een lokale lifecycle-bouwsteen, nog niet aangesloten op de app of de opslagadapter. De app-integratiestap moet vóór een lock nieuwe invoer blokkeren, openstaande invoer opslaan en teruglezen, alle opslagbewerkingen laten uitlopen, en daarna de ontsleutelde UI-toestand wissen. Als voorbereiden faalt, mag de sessie niet worden vergrendeld.

## Beveiligingsgrenzen

- Lokale tests gebruiken alleen synthetische records en sleutels.
- De lokale Auth-testclient weigert niet-loopback endpoints, bewaart sessies niet en maakt willekeurige testinloggegevens aan die niet worden gelogd.
- De lokale Auth/TOTP-test bewijst alleen de lokale Supabase Auth MFA-flow; hij is geen bewijs voor productieconfiguratie, P-5-RPC's, RLS/autorisatie, appgebonden sessies of ISO-17. De storage-adaptertests bewijzen geen serverauth.
- De sync-retrylaag herhaalt alleen expliciete `RetryableSyncError`-transportfouten. `MemoryServer` blijft een in-memory testadapter en bewijst geen gebruikersisolatie of P-5-autorisatie.
- `logoutPersonalEcosystem` is een nog niet aangesloten lifecycle-coördinator: hij blokkeert afmelden zonder geldige AAL2-sessie, serverbevestiging van alle mutaties, conflictvrije status en afgeronde sync, maar laat de gebruiker die lokale data wel eerst exporteren. Lokale PE-data worden pas na syncbevestiging, expliciete verwijderbevestiging en geslaagde kluisvergrendeling gewist. De injecteerbare callbacks moeten later strikt tot PE-data en de PE-sessie beperkt blijven; dit is geen implementatie van de P-5-serververwijdering.
- `npm run test:auth` is uitsluitend een lokale Auth/MFA-integratietest. Hij bewijst geen schema-isolatie, RLS, P-5-RPC's, appgebonden sessies of ISO-17; B-13/ADR 0013 blijft ter beoordeling en P-2/P-4/P-5 blijven afzonderlijke poorten.
- Productieconfiguratie, productiegegevens, live TOTP, externe databaseverbindingen en live synchronisatie blijven uitgeschakeld totdat de vereiste poorten en afzonderlijke livegangvrijgave zijn voltooid.
