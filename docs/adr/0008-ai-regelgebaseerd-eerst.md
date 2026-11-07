# ADR 0008 — AI: regelgebaseerd eerst, lokale AI optioneel

- **Status:** geaccepteerd (2026-11-07)
- **Besluit-ID:** B-8

## Besluit

1. Elke AI-functie heeft een regelgebaseerde implementatie die zonder model werkt. Dit is de standaard.
2. Lokale AI is een **optionele** laag: WebLLM in de browser (vereist WebGPU) of Ollama op eigen apparaat. Uit tenzij de gebruiker het aanzet.
3. Geen betaalde externe AI-API's. Geen gezondheids- of lichaamsgegevens naar een dienst buiten het apparaat.
4. AI-uitvoer wordt gevalideerd tegen een vast schema en pas opgeslagen na bevestiging door de gebruiker.
5. De UI vermeldt altijd of een advies regelgebaseerd of door een lokaal model is gemaakt.

## Gevolgen

- WebLLM downloadt modellen van externe hosts; die hosts komen pas in de CSP wanneer de optionele laag wordt gebouwd (fase F6), na controle van de modellicentie.
- Coach: bestaande vrije AI-endpoint valt onder risico R9 (aparte PR, B-11).
