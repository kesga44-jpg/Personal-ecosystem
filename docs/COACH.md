# Coach in Sport (roadmap #6, PR 15)

Regelgebaseerde sportcoach in Sport › Coach (`/sport/coach`). De regels zijn overgenomen uit Samen Thuis
`sportcoach-core.js` (alleen gelezen, op `main` gelijk aan de gebruikte kopie) en herschreven in TypeScript
(`apps/sportapp/src/coach.ts`). Samen Thuis is niet gewijzigd en er is geen koppeling met Samen Thuis of Coach (V-3).

## Wat de coach doet

1. **Sportprofiel**: niveau, huidige activiteit, beschikbare tijd, trainingsdagen, voorkeuren, herstelbehoefte,
   materiaal, te vermijden oefeningen, fysieke aandachtspunten, loopgegevens en optioneel gezondheid
   (astma, klachten tijdens/na inspanning, triggers, omgevingsfactoren, of klachten onder controle zijn).
2. **Voorstel** voor een discipline (hardlopen, kracht, sprongkracht, conditie, mobiliteit) met doel, weken,
   sessies per week en periodisering. Het voorstel wordt opgeslagen als **concept**.
3. **Bevestigen** maakt het programma actief, met week 1 vanaf maandag (deze week op maandag, anders volgende week).
4. **Inplannen**: de sessies van de huidige of volgende programmaweek gaan met één knop naar Sport › Planning.
   Vaste id per sessie, dus opnieuw inplannen geeft geen dubbelen; dagen in het verleden worden overgeslagen.
   Of een geplande sessie gedaan is, volgt zoals altijd uit de vastgelegde trainingen op die dag.
5. **Terugkoppeling** per training: afgerond, minuten, ervaren inspanning (RPE), herstel en klachten.
6. **Evaluatie** geeft een voorstel; **Aanpassing voorstellen** maakt een nieuw concept (versie + 1).
   Het bestaande programma verandert niet. Bevestigen van het nieuwe concept zet het vorige op "vervangen".

## Veiligheidsregels (ongewijzigd uit Samen Thuis)

- Geen voorstel zonder huidige activiteit of beschikbare tijd, bij ingevulde **fysieke aandachtspunten**
  (eerst laten beoordelen door een professional), bij te weinig tijd voor sessies van 20 minuten, en na een
  **recent gemelde ernstige benauwdheid of alarmsymptoom** (afgelopen 28 dagen).
- HIIT alleen voor een gevorderd of ervaren profiel. Sprongkracht maximaal 2 sessies per week.
- Frequentie begrensd op niveau, beschikbare tijd, trainingsdagen en (hardlopen) huidige loopfrequentie.
- Astma sluit geen sport uit; wel een geleidelijke warming-up. Klachten of onzekerheid houden de opbouw rustig
  en verwijzen naar arts/behandelaar. De coach stelt geen diagnose en berekent geen hartslagzones.
- Herstelweek elke 4e week; voorzichtige progressie (circa 2% per opbouwweek, maximaal 15%).

## Verschillen met Samen Thuis

| Samen Thuis | Personal Ecosystem | Reden |
|---|---|---|
| Twee profielen (Kees, Daphne) | Eén profiel per apparaat | Personal Ecosystem is persoonlijk |
| Oefenendatabase en bronnenbibliotheek kiezen oefeningen en bronnen | Niet overgenomen; kracht gebruikt de standaardbewegingen uit dezelfde regels, andere disciplines geen oefeningenlijst | Sport heeft geen eigen oefenendatabase (oefeningen staan in de module Kracht) |
| Medicatiecontext, aandachtspunten en herstelervaring in het gezondheidsprofiel | Niet gevraagd | Worden door de regels niet gebruikt voor het voorstel; minder gevoelige gegevens |
| Basisbelasting uit eigen sessielogs | Uit vastgelegde trainingen in Sport, Kracht en Duur (grove discipline: Kracht = kracht, Duur hardlopen = hardlopen, overige Duur = conditie) | Geen dubbele registratie |
| Terugkoppeling is een sessielog | Aparte terugkoppeling per programma; telt mee voor klachten en evaluatie, niet als extra belasting | Voorkomt dubbel tellen met de vastgelegde training |

## Opslag en privacy

- Sport-database schema 3 met store `coach`: één profielrecord, programma's en terugkoppeling.
- Alles blijft op dit apparaat en gaat mee in de Sport-back-up. Back-ups van schema 1 en 2 blijven herstelbaar.
- `coach.ts` en `CoachPage.tsx` doen geen netwerkverzoeken (gecontroleerd in `separation.test.ts`).
