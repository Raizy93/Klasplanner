# TODO – Klassenplanner

## Afgerond (v1.0.0)

- [x] Projectopzet (Vite, React, TypeScript, Tailwind, Zustand, Konva, Vitest)
- [x] Hoofdinterface, tabbladen, toolbar, inklapbaar paneel
- [x] Leerlingenbeheer incl. namenlijst, afwezigheid, kleuren, zoeken
- [x] Lokaaleditor: tafels, groepjes, objecten, slepen, draaien, dupliceren, snapping, koppelen/losmaken
- [x] Expliciete naast/tegenover-relaties met detectie van niet-eenduidige standen
- [x] Zones t.o.v. instelbare voorkant, zichtbaar te maken
- [x] Regelbeheer (13 types, hard/voorkeur, sterkte, aan/uit)
- [x] Constraint solver in Web Worker met precheck, MRV, forward checking, matching, local search, diagnose
- [x] Resultaatrapportage en alternatieve indelingen
- [x] Handmatig verplaatsen met waarschuwingen, vastzetten
- [x] Autosave, meerdere plattegronden, JSON-import/-export
- [x] PNG- en PDF-export (A4/A3), met/zonder namen
- [x] Demoklas
- [x] 63 geautomatiseerde tests, productiebuild, GitHub Pages-workflow
- [x] README, PROJECT_STATE

## Openstaand

- [ ] Testen op tablets (iPad/Android) en in een iframe op MeesterDanny.com
- [ ] Handmatig relaties binnen een groep corrigeren (naast/tegenover/geen)
- [ ] Tafelafmeting per tafel instelbaar; tafels met twee zitplaatsen
- [ ] Toetsenbordbediening van het canvas zelf (focus per tafel)
- [ ] Waarschuwing als losse tafels tegen elkaar staan maar niet gekoppeld zijn (optionele hint)
- [ ] Bundelgrootte verkleinen (code splitting van canvas/Konva)
- [ ] Synchronisatie tussen meerdere geopende tabbladen (storage-event)

## Bekende bugs

- Geen bekende functionele bugs. Zie "Bekende beperkingen" in PROJECT_STATE.md.

## Mogelijke uitbreidingen (niet voor v1)

- [ ] Leerlingkenmerken (extra instructie, zelfstandig, rustige plek, ondersteunende buur) + regels daarop
- [ ] Evenwichtige groepjes op basis van kenmerken
- [ ] Geschiedenis: wie zat naast wie; afwisseling stimuleren over meerdere weken
- [ ] Zitplaatsrotatie (periodiek wisselen)
- [ ] Meerdere klassen/groepen in één overzicht
- [ ] Plattegrond delen met een collega zonder account (bijv. via een deelbare link met gecomprimeerde data)
- [ ] Afdrukweergave met lijst van regels en legenda
