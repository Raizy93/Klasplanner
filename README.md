# Klassenplanner

Een slimme klassenplattegrond-generator voor leerkrachten (groep 3 t/m 8). Richt je lokaal in, beheer je leerlingen,
leg regels vast ("Emma moet vooraan zitten", "Noah mag niet naast Finn zitten") en laat de app een indeling maken die
gegarandeerd aan alle harde regels voldoet en zoveel mogelijk voorkeuren realiseert.

Werknaam · bedoeld voor [MeesterDanny.com](https://meesterdanny.com).

## Wat kan de app?

- **Leerlingen** – één voor één toevoegen of een namenlijst plakken, zoeken, kleur kiezen, afwezig melden, hernoemen,
  verwijderen. Dubbele namen mogen (interne ID's zijn uniek).
- **Lokaal** – losse tafels en kant-en-klare groepjes (2–6 of eigen samenstelling) plaatsen, verslepen, draaien,
  dupliceren, verwijderen, koppelen en loskoppelen. Uitlijnen op raster en tegen andere tafels. Objecten: digibord,
  leerkrachttafel, deur, raam, kast en plant. Positie- en rotatievelden als alternatief voor slepen.
- **Regels** – 13 regeltypes (vooraan/achteraan/links/rechts/midden, naast, niet naast, zelfde groepje, niet zelfde
  groepje, tegenover, niet tegenover, op/niet op zitplaats), als harde restrictie of als voorkeur (laag/normaal/sterk),
  tijdelijk uit te schakelen. Tegenstrijdige regels worden direct gesignaleerd.
- **Indelen** – een echte constraint solver (backtracking + forward checking + matching-controle + local search),
  draait in een Web Worker met tijdslimiet. Resultaatkaart met controleerbare scores, "Nieuwe indeling",
  "Vorige indeling" en "Huidige indeling bewaren".
- **Handmatig aanpassen** – namen slepen naar een andere tafel (wisselen), vastzetten, van plek halen; waarschuwing en
  markering als een harde regel daardoor wordt overtreden.
- **Opslaan** – automatisch in de browser (localStorage), meerdere plattegronden (aanmaken, openen, hernoemen,
  dupliceren, verwijderen), JSON-import/-export als back-up.
- **Exporteren** – PNG (hoge resolutie), PDF (A4/A3 liggend) en JSON, met of zonder leerlingnamen.

Alle gegevens blijven in de browser van de gebruiker. Er is geen server, geen account en er worden geen gegevens verstuurd.

## Technologie

React 19 · TypeScript · Vite · Tailwind CSS 4 · Zustand + Immer · Konva / react-konva (canvas) · Lucide-iconen ·
jsPDF (alleen geladen bij PDF-export) · Vitest.

## Lokaal starten

Vereist: [Node.js](https://nodejs.org) 20 of nieuwer.

```bash
npm install
```

```bash
npm run dev
```

Open daarna http://localhost:5173.

Op Windows kan het ook met een dubbelklik op `start-klassenplanner.bat`: dat installeert zo nodig de onderdelen,
start de app en opent de browser. Werkt `npm` niet in PowerShell ("running scripts is disabled"), gebruik dan dit
bestand of typ `npm.cmd run dev`.

Tests uitvoeren:

```bash
npm test
```

## Productiebuild

```bash
npm run build
```

De statische bestanden staan daarna in `dist/`. Bekijk de build lokaal met `npm run preview`.
De build gebruikt relatieve paden (`base: './'`), zodat hij vanuit elke map of submap werkt.

## Publiceren via GitHub Pages

1. Maak een repository op GitHub (bijv. `klassenplanner`) en push deze code naar de branch `main`.
2. Ga in de repository naar **Settings → Pages** en kies bij **Source** voor **GitHub Actions**.
3. De workflow `.github/workflows/deploy.yml` test, bouwt en publiceert de app automatisch bij iedere push naar `main`.
4. De app staat daarna op `https://<gebruikersnaam>.github.io/klassenplanner/`.

Handmatig kan ook: upload de inhoud van `dist/` naar een willekeurige statische webhost.

## Insluiten via iframe (bijv. op MeesterDanny.com)

```html
<iframe
  src="https://<gebruikersnaam>.github.io/klassenplanner/"
  title="Klassenplanner"
  style="width: 100%; height: 85vh; min-height: 640px; border: 0;"
  loading="lazy"
></iframe>
```

Aandachtspunten:

- Gebruik je het `sandbox`-attribuut, voeg dan minimaal `allow-scripts allow-same-origin allow-downloads allow-modals`
  toe; zonder `allow-downloads` werken PNG/PDF/JSON-export niet en zonder `allow-same-origin` kan er niet worden opgeslagen.
- Sommige browsers (vooral Safari) beperken opslag in iframes van een ander domein. De app meldt dat dan zelf; adviseer
  gebruikers in dat geval regelmatig een JSON-back-up te maken, of de app via de directe link te openen.
- Opgeslagen gegevens horen bij het domein van de app (bijv. `github.io`), niet bij de pagina waarin hij is ingesloten.

## Bediening in het kort

| Actie | Hoe |
| --- | --- |
| Groepje selecteren / één tafel | klik / dubbelklik |
| Meerdere selecteren | Shift+klik of een kader slepen (tabblad Lokaal) |
| Verschuiven van de plattegrond | spatie + slepen, middelste muisknop, of slepen op een lege plek (bij het indelen) |
| Zoomen | muiswiel, knijpen (touch), `+` / `-`, `0` = passend maken |
| Ongedaan maken / opnieuw | Ctrl+Z / Ctrl+Y |
| Draaien / dupliceren / koppelen | R (Shift+R andersom) / Ctrl+D / Ctrl+G (Ctrl+Shift+G losmaken) |
| Verwijderen | Delete |
| Leerling vastzetten | L (geselecteerde leerling) |

## Projectstructuur

```
src/
  models/            datatypes en constanten
  data/              demoklas
  services/
    room/            tafels, groepen, relaties (naast/tegenover), zones, zitplaatsinventaris
    rules/           regelbeschrijvingen en -evaluatie
    plan/            leerlingen, regels en indeling bewerken; nieuwe plattegronden
    generator/       vertaling plattegrond → solverprobleem, worker-client
    storage/         localStorage, migraties, JSON import/export, autosave
    export/          PNG/PDF/JSON-export
  solver/            constraint solver (precheck, zoeken, optimaliseren, diagnose)
  workers/           Web Worker voor de solver
  validation/        validatie van opgeslagen en geïmporteerde gegevens
  store/             Zustand-store, selectors en acties voor handmatig verplaatsen
  components/        UI (layout, canvas, students, room, rules, generator, plans, export, ui)
  hooks/             sneltoetsen
tests/               Vitest-tests
```

Zie `PROJECT_STATE.md` voor architectuurkeuzes en de actuele status, en `TODO.md` voor openstaande punten.
