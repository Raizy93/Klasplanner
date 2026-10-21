# PROJECT_STATE – Klassenplanner

_Laatst bijgewerkt: 19 oktober 2026 (eerste complete versie, v1.0.0)_

## Doel

Volledig client-side webapp waarmee leerkrachten (groep 3–8) hun lokaal inrichten, leerlingen beheren, regels vastleggen
en automatisch een klassenplattegrond laten genereren die **nooit** een harde regel schendt. Hosting via GitHub Pages,
insluitbaar via iframe op MeesterDanny.com. Geen backend, geen accounts, geen externe API's; alles in het Nederlands.

## Status: wat werkt

| Onderdeel | Status |
| --- | --- |
| Hoofdlayout (33/67), 4 tabbladen, toolbar, inklapbaar paneel (< 1024 px als lade) | ✅ |
| Leerlingen: toevoegen, namenlijst plakken (lege regels/dubbele namen), zoeken, hernoemen, kleur, afwezig, verwijderen (incl. regels) | ✅ |
| Geselecteerde leerling: zitplaats, groepje, vastzetten, plaatsen via keuzelijst, regels + "Regel toevoegen" | ✅ |
| Lokaal: losse tafel, groepjes 2–6 + eigen samenstelling, objecten (digibord, leerkrachttafel, deur, raam, kast, plant) | ✅ |
| Selecteren (klik/groep, dubbelklik/tafel, shift, kader), slepen van meerdere items, draaien (hendel/knoppen/R), dupliceren, verwijderen | ✅ |
| Uitlijnen op raster + tegen andere tafels (snapping), positie/rotatie/afmeting-velden, objectlabels | ✅ |
| Expliciet koppelen/loskoppelen/groep opheffen, groepsnamen, waarschuwing bij niet-eenduidige relaties | ✅ |
| Voorkant: automatisch (digibord) of boven/onder/links/rechts; zones zichtbaar te maken | ✅ |
| Zitplaats niet beschikbaar maken, zitplaatsen hernummeren | ✅ |
| Regels: 13 types, hard/voorkeur, sterkte, aan/uit, bewerken, verwijderen, filter, zoeken, dubbele-regelcontrole | ✅ |
| Live conflictdetectie (alleen bewezen conflicten) met aanklikbare regels | ✅ |
| Generator in Web Worker (met terugval op hoofdthread), tijdslimiet, 3 uitkomsten (opgelost / onmogelijk / tijdslimiet) | ✅ |
| Resultaatkaart, voorkeursscore, onvervulde voorkeuren, nieuwe/vorige/volgende indeling, indeling bewaren/terugzetten | ✅ |
| Handmatig: naam slepen (wisselen), slepen vanuit lijst, vastzetten, van plek halen, waarschuwing + banner "Bevat overtreden restricties" | ✅ |
| Autosave (localStorage), statusmelding, meerdere plattegronden (aanmaken/openen/hernoemen/dupliceren/verwijderen met bevestiging) | ✅ |
| JSON-export (huidige of alle) en -import (gevalideerd, schemaversie, nieuwe ID, nooit overschrijven) | ✅ |
| PNG-export (≈3200 px breed) en PDF (A4/A3 liggend), met/zonder namen, optionele titel | ✅ |
| Ongedaan maken/opnieuw (100 stappen, samenvoegen van snelle invoer), sneltoetsen | ✅ |
| Demoklas (24 leerlingen, 6 groepjes van 4, digibord, deur, leerkrachttafel, 8 oplosbare voorbeeldregels, fictief sociogram) | ✅ |
| Sociogram: invoer per leerling (klik-chips) en matrixinvoer, afnamedatum, privacy-afscherming | ✅ |
| Sociogram-overzicht: sociometrische positie, door niemand gekozen, paren (wederzijds +/−, tegengesteld, eenzijdig +), hechte groepjes, sorteerbare tabel | ✅ |
| Sociogram → regels: doel per vraag (bekrachtigen / nieuwe relaties), voorstellen aanvinken en toevoegen, snelmenu per paar, label "Sociogram" | ✅ |

## Architectuur en belangrijke keuzes

- **Datamodel** (`src/models/types.ts`): `Student`, `Desk`, `Seat`, `DeskGroup`, `RoomObject`, `Rule`, `Arrangement`
  zijn losse objecten met stabiele ID's. Eén tafel = één zitplaats (`Seat.deskId`). Indeling = `seatId → studentId` +
  lijst vastgezette leerlingen. Zo verandert genereren nooit de lokaalindeling.
- **Relaties naast/tegenover** (`services/room/relations.ts`): bepaald in het lokale assenstelsel van een tafel
  (rotatie-invariant) met toleranties, en **expliciet opgeslagen** in `DeskGroup.relations`. Alleen tafels binnen
  dezelfde (expliciet gekoppelde) groep hebben relaties. Hele groep verplaatsen/draaien laat relaties ongemoeid; een deel
  van een groep verplaatsen herberekent ze. Onduidelijke standen (90°, half verschoven) worden `ambiguous` en tellen niet
  mee; de UI waarschuwt.
- **Zones** (`services/room/zones.ts`): gebaseerd op de stoelpositie van alle beschikbare zitplaatsen. Het bereik van
  voorste tot achterste plaats wordt in drie gelijke stroken verdeeld (vooraan/achteraan); idem lateraal
  (links/midden/rechts, gezien vanuit de leerlingen). Bij een opstelling met twee kolommen bestaat "midden" dus niet;
  de conflictdetectie meldt dat.
- **Seat graph** (`services/room/seatGraph.ts`): één bron voor zones, groepen en relaties, gebruikt door zowel evaluatie
  als solver. Gememoriseerd per `room`-referentie (`store/selectors.ts`).
- **Solver** (`src/solver`), puur en serialiseerbaar:
  1. `precheck` – alleen bewezen conflicten: capaciteit, tegenstrijdige paren, dubbele zitplaatsvergrendeling,
     lege domeinen (met minimale oorzaak), Hall-schending (te veel leerlingen voor te weinig plaatsen), ketens van
     groepsregels, te grote groepen, te veel verplichte buren.
  2. `search` – backtracking met MRV, forward checking en na iedere stap een matching-controle (Hall). Eerst
     gerandomiseerde restarts met knooppuntlimiet, daarna een volledige zoektocht tot de tijdslimiet. Volledig
     doorzocht zonder oplossing = aantoonbaar onmogelijk.
  3. `optimize` – simulated annealing met verplaatsen/wisselen; iedere stap blijft hard-geldig. Doel = gewogen voorkeuren
     (1/3/9) − variatiestraf t.o.v. eerdere indelingen (zelfde plek, zelfde groepsgenoten).
  4. `diagnose` – deletion filter: verwijdert alleen regels waarvan bewezen is dat het probleem zonder die regel nog
     steeds onmogelijk is. De gerapporteerde set is dus altijd écht onmogelijk; "minimaal" alleen als alle controles
     conclusief waren.
  5. Vangnetten: solver controleert zelf `satisfiesHard`, en de store evalueert de uitkomst nogmaals onafhankelijk met
     `services/rules/evaluate.ts` voordat hij wordt toegepast.
- **Afwezig**: afwezige leerlingen en hun regels doen niet mee. Afwezig + vastgezet ⇒ plek blijft gereserveerd.
  Afwezig markeren wijzigt de huidige indeling niet.
- **Store** (`store/appStore.ts`): Zustand; iedere planwijziging via `update(recipe)` (immer) → geschiedenis,
  `sanitizeArrangement` (geen dubbele toewijzing, geen verwijzingen naar verdwenen objecten). Generator-historie is
  tijdelijk (in geheugen, per plattegrond).
- **Opslag** (`services/storage`): één localStorage-sleutel `klassenplanner:data` met `schemaVersion`; elke plattegrond
  wordt bij laden gevalideerd; beschadigde data wordt apart bewaard. Autosave met 600 ms debounce + bij afsluiten.
- **Export**: een verborgen Konva-stage (`components/canvas/ExportHost.tsx`) tekent alleen de plattegrond; jsPDF wordt
  pas bij PDF-export geladen.
- **Sociogram** (`services/sociogram`, `components/sociogram`): `Plan.sociogram.responses[respondent]` met vier lijsten
  (workPos/workNeg/playPos/playNeg); ontbrekende sleutel = niet ingevuld. Positief en negatief sluiten elkaar per vraag uit.
  Analyse volgens Coie & Dodge (z-scores van ontvangen keuzes gedeeld door aantal kiezers; status pas vanaf 5
  ingevulde formulieren). "Hechte groepjes" = maximale cliques (≥ 3) in de graaf van wederzijds positieve keuzes.
  Het sociogram beïnvloedt de generator **nooit automatisch**: de leerkracht kiest voorstellen, die als gewone regels
  (`source: 'sociogram'`, met `note`) worden toegevoegd. Afscherming (`socioRevealed`) wordt gereset bij het verlaten
  van het tabblad. Sociogramgegevens komen nooit in PNG/PDF; wel in de JSON-back-up.
- **Canvas** (`components/canvas`): modus "Lokaal bewerken" (tabblad Lokaal) vs. "Leerlingen plaatsen" (overige
  tabbladen) voorkomt onbedoeld verschuiven van tafels tijdens het indelen.

## Tests (`npm test`, 79 tests)

- `tests/room.test.ts` – tafels toevoegen/verwijderen, groepjes (sjablonen), koppelen/losmaken, fysiek ≠ administratief,
  tafel uit groep verwijderen, groep verplaatsen/draaien behoudt relaties, dupliceren, naast/tegenover (ook gedraaid,
  pixeltoleranties), niet-eenduidig, zitplaatsinventaris, voorkant, zones in vier oriëntaties, uitgeschakelde plaatsen.
- `tests/solver.test.ts` – geldige indelingen (demo, 35 leerlingen + 14 harde regels × 5 seeds), meer plaatsen dan
  leerlingen, te weinig plaatsen, lege klas/lokaal, afwezigen, vastgezette leerlingen (ook afwezig + vastgezet),
  conflicten (tegenstrijdig paar, vooraan+achteraan, bezette zitplaats, Hall, groepsketen, minimale conflictset via
  solver), tijdslimiet ≠ onmogelijk, voorkeuren, alternatieve indeling verschilt, handmatige overtreding.
- `tests/storage.test.ts` – leerlingen toevoegen/verwijderen, dubbele namen, namenlijst parsen, opslaan/herladen,
  beschadigde opslag, JSON export/import, ongeldige bestanden, reparatie van verwijzingen, wisselen.
- `tests/sociogram.test.ts` – invoer (uitsluiting +/−, klikcyclus, ingevuld zonder keuzes), verwijderde leerling,
  validatie/oude bestanden, telling, paren, status (populair/afgewezen/controversieel), hechte groepjes, te weinig
  respondenten, classificatiedrempels, voorstellen (bekrachtigen, nieuwe relaties, botsing met bestaande regel).
- `tests/store.test.ts` – undo/redo, samenvoegen, afwezigheid behoudt indeling, dubbele toewijzing voorkomen,
  plattegrondbeheer, genereren via de store, conflictmelding laat indeling ongemoeid, verwijderde tafel.

Daarnaast handmatig in de browser gecontroleerd: renderen demoklas, genereren, conflictmelding, groep slepen/selecteren,
naam slepen (wisselen), koppelen via UI, PNG-render zonder namen, PDF-opbouw.

## Wijzigingslog

- **21-10-2026 – Bugfix slepen met meerdere tafels.** Konva's `Transformer` sleepte geselecteerde nodes zelf mee
  (`_proxyDrag`) naast onze eigen sleeplogica. Het `dragend` van een meegesleepte node wiste de sleepstatus vóór de
  vastgepakte node kon opslaan → tekening en gegevens liepen uiteen (groepje "door elkaar"). Oplossing in
  `ClassroomCanvas.tsx`: transformer losgekoppeld tijdens slepen, alleen de vastgepakte node rondt af, en een
  vangnet-effect zet na iedere lokaalwijziging alle nodes exact op de opgeslagen positie.
- **21-10-2026 – Sociogram** toegevoegd (nieuw tabblad, overzicht, matrix, regelvoorstellen).
- **21-10-2026** – `start-klassenplanner.bat` + snelkoppeling; project gekoppeld aan github.com/Raizy93/Klasplanner.

## Bekende beperkingen / aandachtspunten

- Relaties bestaan alleen binnen een gekoppelde groep; er is (nog) geen handmatige correctie van individuele relaties.
- Tafelafmeting is vast (70 × 50 cm); niet aanpasbaar in de UI.
- Het canvas zelf is niet met het toetsenbord te bedienen; alle essentiële handelingen hebben een alternatief in de
  panelen (zitplaatskeuzelijsten, positievelden, knoppen).
- Variatie vs. voorkeuren is geen strikte lexicografische ordening; zonder "extra variatie" is de straf per herhaling
  kleiner dan de lichtste voorkeur.
- Meerdere browsertabbladen tegelijk: laatste schrijfactie wint.
- Touchbediening (tablet) is geïmplementeerd (slepen, knijpzoom) maar niet op echte apparaten getest.
- Hoofdbundel ± 730 kB (≈ 225 kB gzip), vooral Konva/React.
- In de dev-build is de store bereikbaar als `window.__kpStore` (alleen voor debuggen; niet in productie).

## Logische volgende stappen

1. Testen op echte tablets en in een iframe op MeesterDanny.com (opslaggedrag Safari).
2. Handmatige correctie van relaties binnen een groep (bijv. hoekopstellingen).
3. Instelbare tafelafmeting en dubbele tafels (2 zitplaatsen per tafel).
4. Uitbreidingen uit `TODO.md` (leerlingkenmerken, geschiedenis wie-naast-wie, rotatie).
