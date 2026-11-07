# ADR 0007 — Gedeelde authenticatie met strikte gegevensisolatie

- **Status:** geaccepteerd onder voorwaarden (2026-11-07)
- **Besluit-ID:** B-7

## Besluit

- Eén Supabase Auth (project A) voor Samen Thuis, Hub, Sportapp en SIDEQUEST. Coach houdt eigen accounts in project B.
- Voorwaarde "strikte gegevensisolatie" wordt ingevuld door het isolatiebewijs in ADR 0001 (ISO-1 t/m ISO-12), in het bijzonder:
  - huisgenoten zien elkaars sport-, lichaams-, gezondheids- en questdata **niet** (ISO-8);
  - groepsleden zien alleen opt-in, geaggregeerde klassementwaarden;
  - gedeelde authenticatie geeft geen gedeelde rechten: een account in project A betekent niet dat een app bij data van een andere app mag, behalve via de contracten met toestemming.
- Restrisico (token niet app-gebonden): zie ADR 0001.
