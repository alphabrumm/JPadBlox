# JPad – Java-Programmieren am iPad

JPad ist eine touchfreundliche Oberfläche für die [Online-IDE](https://www.online-ide.de) von Martin Pabst.
Programmiersprache, Compiler und Interpreter stammen unverändert aus der Online-IDE; neu sind Editor,
Bedienung und Gestaltung.

## Was JPad anders macht

- **Touch-Editor (CodeMirror 6)** mit nativer Textauswahl, Lupe und Hardware-Tastatur-Unterstützung.
- **Hilfsleiste über der Bildschirmtastatur** mit `{ } ( ) ; = " " .` usw., Tab, Cursortasten,
  Haltepunkt und Info zur Stelle am Cursor.
- **Vervollständigung, Fehleranzeige und Parameterhilfe** direkt aus den Sprachdiensten der Online-IDE.
- **Schritt für Schritt**: Der Knopf „Schritt“ führt das Programm Zeile für Zeile aus; die aktuelle Zeile
  ist gelb markiert, die Ansicht „Variablen“ zeigt alle Werte (geänderte Werte blinken kurz auf).
- **Diagramm**: Klassenansicht (UML-Klassenkarten mit Attributen, Methoden, Vererbung, Interfaces, Assoziationen mit
  Rollennamen und Kardinalitäten) und Objektansicht zur Laufzeit (Objektkarten mit Attributwerten und Verweisen).
  Karten lassen sich verschieben; ein Tipp auf eine Klasse springt in den Code.
- **Color Handbuch** im Menü: alle 149 Farben der Klasse `Color` mit Farbmuster, Suche (auch „rot“, „grün“ …) und Sortierung nach Farbton.
- **Class Handbuch** im Menü: durchsuchbare Klassenreferenz der Online-IDE mit Syntax-Hervorhebung.
- **Sprite Bibliothek** im Menü: alle eingebauten Sprites mit Nummern; ein Tipp kopiert den passenden `new Sprite(…)`-Code.
- **Eigene Sprites** im Menü: Bilder aus Fotos/Dateien werden zu einem Spritesheet im Format der Online-IDE gepackt
  und sind im Code als `SpriteLibrary.<Name>` verfügbar. Sie gehören zum Projekt und stehen in der Projektdatei
  (`spritesheetBase64`), auch Online-IDE-Projekte mit eigenen Sprites lassen sich öffnen.
- **Lernpfade** im Menü („Lernpfad einbetten“): Eine HTML-Seite oder ein ZIP (index.html mit Unterordnern wie `img/`)
  wird ins Projekt eingebettet; Bilder werden dabei als data-URIs ins HTML geschrieben. Der Lernpfad reist in der
  Projektdatei mit (Feld `lernpfadHtml`, die Online-IDE ignoriert es) und erscheint als erster Reiter der
  Seitenleiste. Projekte ohne Lernpfad zeigen den Reiter nicht. Der Lernpfad läuft in einem abgeschotteten iframe
  (kein Zugriff auf JPad); sein localStorage (z. B. Fortschritt) wird per postMessage je Projekt in JPad gespeichert.
- **Lernpfad per Link**: `jpad.pandapy.de/?lernpfad=<Adresse>` (HTML, ZIP oder Projektdatei) bzw. `?projekt=<Adresse>`
  (Projektdatei, auch kombinierbar). Die Adresse darf relativ zu JPad sein (z. B. `?lernpfad=lernpfade/schaf.json`).
  Beim ersten Aufruf entsteht ein neues Projekt; derselbe Link öffnet später dieses Projekt mit dem Stand des Schülers.
  Fremde Server müssen das Laden erlauben (CORS, z. B. GitHub Pages); sonst wird eine HTML-Seite direkt von ihrer
  Adresse angezeigt (nur online). Projekte mit Lernpfad starten mit schmaler Bausteinleiste und breiter Ansicht rechts.
- **Umbenennen** (Stift links neben Rückgängig): Variable, Methode oder Klasse aus einer Liste wählen (sortiert nach
  Variablen, Methoden, Klassen, jeweils alphabetisch) und überall im Projekt umbenennen. Nutzt die Verwendungsstellen
  des Compilers (`src/jpad/Refactor.ts`); heißt eine Datei wie die umbenannte Klasse, wird sie mit umbenannt.
- **Erster Start**: Willkommen-Fenster (browserbasierte, touchfreundliche Baustein-IDE mit integrierbaren Lernpfaden)
  und automatisch der Demo-Lernpfad „Bello lernt Java“ (gemerkt in `jpadblox.welcomed`; wer schon Projekte hat, sieht es nicht).
- **Menü**: Projekte (Neu/Öffnen/Sichern · Demo laden, Lernpfad einbetten/entfernen · Projektliste mit Duplizieren
  und Löschen), Grafik (Eigene Sprites, Sprite Bibliothek), Darstellung, Ausführungstempo, Nachschlagen.
- **Demo laden** im Menü: legt jedes Mal ein neues Projekt mit frischer Kopie vom Server an und öffnet den Lernpfad `public/learn/demo/Lernpfad-Bello.html` („Bello lernt Java“: Oberfläche, Glühbirne,
  Datentypen, Klasse Hund mit Bausteinen, Methode mit if–else, Objekt, Schritt, Haltepunkt, Objektdiagramm) wie einen
  Lernpfad-Link. Die Bilder in `public/learn/demo/img` sind Screenshots von JPadBlox und werden beim Laden eingebettet.
- **Autovervollständigung geordnet** (`src/jpad/CompletionOrder.ts`): ohne Punkt zuerst eigene Variablen, eigene
  Methoden, eigene Klassen, Grundtypen (String, Integer, Double, Boolean, Character) und print/println; alles Übrige
  hinter der Klappzeile „Weitere Vorschläge“. Nach einem Punkt erst Attribute, dann Methoden der Klasse selbst,
  Geerbtes hinter „Geerbte Symbole“. „insert constructor“ wird nie angeboten.
- **Baustein „Variable“**: Bei Grundtypen gibt es ein Feld „Wert, der zugewiesen wird“ (leer = nur Deklaration;
  Text bekommt Anführungszeichen, 12,5 wird zu 12.5), bei anderen Datentypen die Auswahl „Verfügbare Konstruktoren“
  (eigene Klasse ohne Konstruktor: nur der Standardkonstruktor) und das Häkchen „nur Deklaration“. Über den Knöpfen
  steht die Vorschau der Anweisung mit Syntaxfarben; Konstruktorparameter werden als Platzhalter eingefügt.
  Unter dem Datentyp die Häkchen „Array anlegen“ und „nur Deklaration“ (beide zusammen: `Typ[] name;`).
- **Baustein „public?“** (ersetzt public und private): 1× tippen `public`, 2× `private`, 3× Sichtbarkeit entfernen
  (zählt als Mehrfachtipp, wenn innerhalb von 2 s in derselben Zeile getippt wird). Unten erscheint dezent
  „2× tippen: private · 3× tippen: –“.
- **Baustein „{get,set}“** (ersetzt Getter und Setter): Tabelle Attribut | get | set; vorhandene Methoden stehen als
  „vorhanden“ da, Tippen auf die Spaltenüberschrift wählt die ganze Spalte.
- **Baustein „if“** (ersetzt if und if – else): Dialog mit Bedingung, beliebig vielen else-if-Zweigen (+ else if / ×)
  und Häkchen else; rechts daneben die Vorschau mit Syntaxfarben. Leere Bedingungen werden Eingabestellen im Editor,
  markierte Zeilen landen im if-Rumpf. Die Bedingungsfelder sind kleine Editoren mit derselben Code Completion
  wie im Editor (ConditionField.ts): ohne Punkt die an der Cursorstelle sichtbaren Namen, nach dem Punkt die Elemente
  des Typs davor – der Typ wird selbst aus der Symboltabelle bestimmt (name., this.x., Hund., a.getB()., feld[i]., "x".).
  Solange der Dialog offen ist, schreibt die Hilfsleiste in das zuletzt benutzte Bedingungsfeld (liegt dann über dem
  Dialog, nur Zeichen; ohne ; { } Zeilen-/Haltepunkt-/Info-Knöpfe). < > && || == % setzen dort je ein Leerzeichen davor und danach. „else if“, „else“ und „for-each“ stehen jetzt unter „Mehr…“.
- **Baustein „new“** auf einer Zeile wie `Hund bello;` entfernt das Semikolon und ergänzt `= new Hund();`.
- **Umbenennen** wählt das Symbol am Cursor bzw. in der Markierung gleich vor.
- **Dialoge** (ab 700 px Breite) lassen sich an der Griffleiste oder Überschrift verschieben. Sie erscheinen
  immer waagrecht mittig über dem Editorbereich (nicht über dem ganzen Fenster), im oberen Drittel (Abstand oben etwa 10 % der Fensterhöhe, bei sehr hohen Dialogen weniger),
  und höchstens so breit wie der Editor.
- **Taste „+“** setzt genau ein Leerzeichen davor und eines danach (`a|` → `a + |`).
- **Taste „=“** der Hilfsleiste setzt am Zeilenende gleich den Strichpunkt dahinter (` = |;`).
- **Enter** vor `)`, `]`, `}` oder `;` springt hinter alle direkt folgenden Klammern/Strichpunkte und beginnt eine neue
  Zeile (Ausnahme `{|}`); vor einem schließenden `"` bzw. `'` springt es nur dahinter.
- **Baustein-Dialoge** sind kompakt (420 px, kleinere Knöpfe). Die Skizzen bei Klasse, Methode und Konstruktor sind
  standardmäßig eingeklappt; eingeblendet stehen sie auf etwa 75 % verkleinert rechts neben dem Dialog.
- **Haltepunkte**: Knopf in der Hilfsleiste (oder Tippen auf die Zeilennummer). Das Programm hält vor der Zeile an
  und kann dann Schritt für Schritt weiterlaufen.
- **Kein Mouse-over nötig**: alle Funktionen sind per Tippen erreichbar.
- **Hilfe per langem Drücken**: Wer eine halbe Sekunde den Finger auf einen Button legt, sieht, was er bewirkt
  (der Button wird dabei nicht ausgelöst). Zeichen und Operatoren der Hilfsleiste, Schritt und Haltepunkt bekommen
  eine ausführliche Hilfe mit Beispielen und „Achtung“-Hinweisen auf typische Denkfehler (Texte in `TipHelp.ts`). Die Glühbirne rechts neben dem Trennstrich der Kopfzeile weist darauf hin (auf dem iPhone ausgeblendet).
- **Zwei Layouts**: nebeneinander (iPad quer, Laptop) oder mit Reitern Code/Ausgabe/Probleme (Handy, iPad hoch). Im iPad-Hochformat stehen die Bausteine in der Ansicht „Code“ links neben dem Editor.
- **Hell, Dunkel oder automatisch** nach Systemeinstellung.
- **Themes** über den Knopf rechts neben der Glühbirne: Standard → Flach (Einhorn-Symbol; weiß und blau, feine Linien,
  spitze Ecken; folgt Hell/Dunkel: dunkel mit Navy-Hintergrund, weißen Rändern und Hacker-Schriftfarben) → Hacker (schwarz, Neon-Grün) → Standard. Beide nutzen Chakra Petch und Share Tech Mono (Google Fonts,
  offline Ersatzschriften). Das Symbol zeigt, was als Nächstes kommt; die Wahl wird gemerkt (`jpadblox.skin`).
- **Ohne Login, ohne Server**: Projekte werden automatisch im Browser gespeichert und lassen sich als
  Datei sichern und öffnen (iPad: Teilen-Menü → „In Dateien sichern“, AirDrop, Teams, mebis …).
  Das Dateiformat ist das der Online-IDE, Projekte lassen sich also in beide Richtungen austauschen.
- **Offline nutzbar**, wenn JPad auf dem Home-Bildschirm installiert wird (Teilen → „Zum Home-Bildschirm“).
  Das schützt zugleich die lokal gespeicherten Projekte davor, dass Safari sie nach längerer Nichtnutzung löscht.

## Aufbau

| Datei | Aufgabe |
|---|---|
| `jpad.html`, `vite.config-jpad.ts` | Einstieg und Build |
| `src/jpad/JPadMain.ts` | erbt von `MainEmbedded`; Compiler, Interpreter, Ausgabe und Autospeichern der Online-IDE |
| `src/jpad/TouchEditor.ts` | CodeMirror-Editor, synchron mit den (unsichtbaren) Monaco-Modellen |
| `src/jpad/LanguageBridge.ts` | ruft die Monaco-Provider der Online-IDE auf (Vervollständigung, Hover, Signaturen, Formatieren) |
| `src/jpad/App.ts` | Oberfläche: Kopfzeile, Dateireiter, Ausgabe, Probleme, Menü |
| `src/jpad/TouchTips.ts`, `TipHelp.ts` | Hilfe beim langen Drücken auf Buttons, Hinweis der Glühbirne |
| `src/jpad/Diagram.ts` | Klassen- und Objektdiagramm |
| `src/jpad/ProjectStore.ts` | Projektliste, Import/Export, eigene Spritesheets, eingebettete Lernpfade |
| `src/jpad/Lernpfad.ts` | Lernpfad aus HTML oder ZIP einlesen (Bilder als data-URIs einbetten) |
| `src/jpad/UserSprites.ts` | „Eigene Sprites“: Bilder einlesen, Spritesheet packen/entpacken, Oberfläche |
| `src/jpad/jpad.css` | Gestaltung, Hell/Dunkel |

Der Code der Online-IDE (`src/compiler`, `src/client`) bleibt unverändert. Updates von Martin Pabst
lassen sich deshalb per „Sync fork“ übernehmen.

## Bauen

```
npm install
npm run build-jpad
```

Das Ergebnis liegt in `dist-jpad/` und kann auf jeden Webspace mit HTTPS hochgeladen werden
(eine `.htaccess` für Apache liegt bei). Bei jedem Push auf `main` baut GitHub Actions JPad automatisch,
veröffentlicht es auf GitHub Pages und stellt den Ordner als Artefakt „j-pad-webspace“ zum Download bereit.

### Veröffentlichen auf jpad.pandapy.de

1. Push auf `main` → GitHub Pages (alphabrumm.github.io/jpad) zum Testen.
2. Testen.
3. Erst danach ein Tag `live-JJJJ-MM-TT-n` auf den getesteten Commit setzen und pushen. Der Workflow
   `jpad-webspace.yml` holt das unveränderte Paket aus dem Pages-Lauf dieses Commits und überträgt es per
   FTP(S) auf den Webspace (nur geänderte Dateien). Benötigt die Secrets `FTP_SERVER`, `FTP_USERNAME`,
   `FTP_PASSWORD`, `FTP_DIR`. Ein Push auf `main` allein ändert am Webspace nichts.

## Lizenz

GNU GPL v3, wie die Online-IDE.

- **Kompakte Ansicht** (Knopf „Kopfzeilen zuklappen“, gelb wie ▶, mittig zwischen Glühbirne und Theme-Knopf; wird gemerkt):
  Kopfzeile 26 statt 60 px, alle Knöpfe und der Projekttitel als Striche (▶ gelb, Stopp rot, Schritt blau),
  Dateireiter als Striche (aktiver in Akzentfarbe, Fehler rot umrandet), „+“ und Vergrößern ausgeblendet,
  Kopf „Bausteine“ ausgeblendet, Umschalter der rechten Ansicht als Striche. Alle Striche bleiben antippbar.
  Auf dem 11-Zoll-iPad (1194 × 834) wird der Editor ca. 10 % höher, die Bausteinleiste ca. 13 %.
- **Kompakte Bausteinleiste**: Im zugeklappten Modus zeigt die senkrechte Bausteinleiste statt der Namen Kurzzeichen
  (Symbole für Klasse, Attribut, Konstruktor, extends, while, return; sonst kurze Code-Zeichen wie m(), g/s, ±, x=, ›↵),
  Gruppenüberschriften als farbige Striche. Breite der Leiste 118 → 64 px (11-Zoll-iPad), Name bleibt Tooltip/aria-label.
- **JCodes** (Menü „Projekt über JCode öffnen“): 5 Zeichen aus 23456789ABCDEFGHJKLMNPQRSTUVWXYZ, berechnet aus dem Pfad
  unter learn/ (z. B. „10/JPad-Schafkonstruktor.json“ → LPANT; FNV-1a 32 Bit, untere 25 Bit). Auflösen über
  learn/jcode.php (durchsucht learn/9 … learn/13 nach .json/.zip/.html), ohne PHP über learn/jcodes.json.
  learn/jcode.php ohne Parameter zeigt der Lehrkraft alle Codes mit Links (doppelte Codes rot).
  Geöffnet wird wie ?lernpfad=learn/…: beim ersten Mal neues Projekt, danach das eigene Projekt mit Stand.
  Der Vollbild-Knopf wurde wieder entfernt (Safari verlässt das Vollbild, sobald die Tastatur erscheint).
- **Hochformat mit Tastatur** (iPad): Die Ansichtsleiste Code/Lernpfad/Ausgabe/… bleibt über der Hilfsleiste sichtbar,
  flacher (42 px, Symbol und Text nebeneinander). Auf dem Handy wird sie beim Tippen weiter ausgeblendet.
- **Theme-Knopf auf schmalen Bildschirmen** (Handy oder < 520 px Breite): oben im Menü links neben dem Schließen-Knopf
  statt in der Kopfzeile.
- **Bausteinleiste in drei Breiten** (auch ohne Kompaktmodus): normal → (Vergrößern) breit → (Verkleinern) ganz schmal
  mit Kurzzeichen; oben steht dann ein gelber Doppelpfeil (Stil wie ▶ des Themes) zurück zur normalen Breite. Gemerkt.
- **Pink-Hacker-Theme** (nach Hacker, vor Standard): wie Hacker, alles Grüne pink (#FF2EC4); Ablauf-Bausteine und
  Schlüsselwörter dafür grün (#00FF9C).
- **Tastatur bleibt offen beim Ansichtswechsel** (Reiter-Layout, z. B. iPad hochkant): Wechselt man bei offener
  Bildschirmtastatur von Code zu Lernpfad/Ausgabe/…, wird der Editor nur unsichtbar „geparkt“ (behält den Fokus,
  nimmt solange keine Eingaben an, data-kbhold). Die Ansicht endet über der Tastatur, zurück im Code geht es an derselben
  Stelle weiter. Die untere Navigation nimmt dem Editor beim Antippen den Fokus nicht mehr.
- **Bausteinleiste nur noch normal ↔ zugeklappt**: Im Kopf „Bausteine“ ein gelber Pfeil « (zuklappen, nur Symbole),
  zugeklappt oben ein gelber Pfeil » (aufklappen). Geht auch im Hochformat. Die ganz breite Leiste ist abgeschaltet
  (Code bleibt, Schalter BLOCKS_WIDE_ENABLED in App.ts).
- **Variablen-Dialog** 20 % breiter (504 statt 420 px), damit „String“ im Datentyp-Feld ganz zu sehen ist.
- **Kurzzeichen auch aufgeklappt**: In der aufgeklappten Bausteinleiste steht das Kurzzeichen links neben dem Namen
  (linksbündig, feste Spalte 26 px); die Leiste ist dadurch 147 statt 119 px breit.
- Aufgeklappt steht rechts neben dem Kurzzeichen bei `//` „Kommentar“, bei if, new und for „…“ (nur Anzeige per CSS,
  Name des Knopfs und Hilfsleiste unverändert).
- **Strichpunkt** (Tastatur oder Hilfsleiste, TouchEditor.smartSemicolon): kommt ans Ende der Zeile (vor einen
  //-Kommentar; steht dort schon einer, kein zweiter), danach Cursor in die nächste Zeile (leere nächste Zeile wird
  benutzt, sonst neue eingerückte Zeile). Auch mitten in Text: println("Hallo|") → println("Hallo");⏎.
  Normaler Strichpunkt nur im for-Kopf, in Kommentaren, in leeren Zeilen und bei Markierung.
- **Hilfsleiste auf dem iPhone**: Nur der Umschalter Bausteine/Zeichen bleibt links fest; Cursor-, Zeilen-, Haltepunkt-,
  Info- und Tastatur-Knopf scrollen mit (am Anfang bzw. Ende der Reihe). iPad unverändert.
- **Themes im Menü** (Darstellung, über der Schriftgröße; auch auf dem iPhone): Standard, Flach, Hacker, Pink, Hund,
  Schaf als Knöpfe nebeneinander (waagrecht scrollbar). Der Theme-Knopf in der Kopfzeile ist entfallen.
  Alle Themes folgen Hell/Dunkel/System: Hacker und Pink hell = weißer Hintergrund mit den Hacker-Farben
  (auf Weiß etwas kräftiger). Hund = Farbwelt von „Bello lernt Java“, Schaf = Farbwelt von „Der Schaf-Konstruktor“
  (Himmelsverlauf als Hintergrund, Atkinson Hyperlegible, Pixelify Sans für Projektname und Überschriften).
- Theme-Auswahl: Reihenfolge Standard, Hund, Schaf, Flach, Hacker, Pink; nur Vorschaufelder ohne Titel (Name als
  Tooltip); Flach, Hacker und Pink mit dem Hacker-Symbol auf Weiß (blau, grün, pink). Hund und Schaf: Himmelsverlauf
  auch im Editor.
- **Markier-Modus** (Knopf links neben „Zeile einfügen“): Knopf blinkt, Cursor blinkt schneller, die Cursorzeile ist
  Startzeile und pulsiert. Tippen auf eine andere Zeile (oder ←/→) markiert den ganzen Block dazwischen (pulsiert).
  In der Hilfsleiste bleiben nur ← →, Markieren, Zeile einfügen/löschen und neu „Ausschneiden“ und „Einfügen“
  (ganze Zeilen vor der Cursorzeile). Nach Ausschneiden/Einfügen wird formatiert und der Modus endet; nochmal auf den
  Knopf tippen beendet ihn ebenfalls. Zwischenablage über navigator.clipboard, sonst interner Speicher.
- Theme-Auswahl: Vorschaufelder ohne Hintergrund (nur das farbige Symbol).
- Markier-Modus, Ablauf geändert: Nach „Ausschneiden“ bleibt der Modus an (Knopf blinkt weiter, Ausschneiden ist
  ausgeblendet). Man tippt die Einfügestelle an (diese Zeile pulsiert), erst „Einfügen“ setzt den Block dort ein
  (vor der angetippten Zeile), formatiert und beendet den Modus.
- Markier-Modus robuster: Start-/Endzeile und Einfügezeile werden selbst gemerkt (wandern bei Änderungen mit) statt aus
  der Editor-Auswahl gelesen – iOS klappt die Auswahl sonst z. B. nach dem Einfügen aus einer anderen App zusammen
  (dann wurde nur eine Zeile ausgeschnitten). Maßgeblich sind nur Antippen (pointerup) und ← → (eine Zeile hoch/runter);
  jede andere Auswahländerung wird zurückgesetzt. Eingefügt wird immer als ganze Zeilen vor der Ziel-/ersten markierten
  Zeile (Text ohne Zeilenumbruch am Ende bekommt einen).
- Markier-Modus ohne Betriebssystem-Auswahl: Die markierten Zeilen pulsieren nur (keine Griffe, kein iOS-Menü), der
  Cursor bleibt ein einfacher Cursor. „Zeile löschen“ löscht im Modus alle markierten Zeilen.
- **Markier-Modus neu geschrieben** (TouchEditor, Abschnitt „Markier-Modus“): Phase „select“ – Startzeile = Cursorzeile,
  Antippen (pointerup) bzw. ← → legt die Endzeile fest, nur Pulsieren, keine echte Auswahl. „Ausschneiden“ legt die
  Zeilen in einen eigenen Speicher (nicht die Zwischenablage), Phase „cut“: nichts pulsiert, Editor normal (Cursor,
  Zeile einfügen/löschen, andere Reiter), Knopf blinkt weiter. „Einfügen“ setzt den Block an der Cursorstelle ein
  (in eine leere Zeile hinein, sonst davor), formatiert, Modus aus.
- Markier-Modus: Solange der Block festgelegt wird, zeigen ← → Pfeile hoch/runter (Endzeile verschieben); nach dem
  Ausschneiden wieder ← →.
- **Hilfsleiste iPad hochkant**: Haltepunkt, Info und Tastatur-Knopf scrollen mit den Zeichen mit (stehen am Ende der
  Reihe); links bleiben Cursor-, Markier- und Zeilen-Knöpfe fest. iPad quer unverändert.
- **Markier-Modus: Kopieren und Spalten markieren**: Neben der Schere ein Kopieren-Knopf (wie Ausschneiden, nur ohne
  Löschen; danach Einfügestelle antippen und einfügen). Rechts vom Trennstrich ein Kippschalter „Zeilen | Spalten“,
  der bei jedem Start des Modus auf „Zeilen“ steht. Spaltenmodus (Block-Auswahl wie Strg-V in vim): Ecke = Cursor,
  Antippen setzt die Gegenecke, Ziehen mit dem Finger zieht ein neues Rechteck auf (Editor scrollt dabei nicht),
  ← → verschieben die Ecke spaltenweise, ↑ ↓ (nur im Spaltenmodus sichtbar) zeilenweise. Das Rechteck ist eine eigene,
  pulsierende Ebene (auch über kurzen/leeren Zeilen). „Zeile löschen“ löscht nur das Rechteck. Einfügen eines
  Spaltenblocks ab der Cursorspalte in die folgenden Zeilen (kurze Zeilen mit Leerzeichen aufgefüllt, fehlende Zeilen
  angehängt), ohne anschließendes Formatieren.
- Umschalter „Zeilen | Spalten“ als Segment-Schalter im Stil der Tasten (Mulde, gewähltes Feld erhaben; Flat/Hacker/Pink:
  farbig umrandet), mit Symbolen; auf dem iPhone nur Symbole.
- Scroll-Fehler behoben: Nach einem Wischen im Editor (Tastatur zu) holte eine verzögerte „Cursor sichtbar machen“-Korrektur
  (gedacht für den Tipp, der die Tastatur öffnet) den Cursor zurück – der Editor sprang am Ende des Schwungs nach oben.
  Jetzt nur nach einem Tipp ohne Wischen und nur mit Fokus im Editor.
- Dateireiter behalten den Editor-Fokus: Ein Tipp auf einen anderen Reiter schließt die Bildschirmtastatur nicht mehr
  (pointerdown/mousedown ohne Fokuswechsel, echter Tipp wird bei touchend selbst ausgelöst; Wischen scrollt weiterhin).
- Lernpfade liegen im Repo und damit im Webspace-Paket: Demo unter `learn/demo/Lernpfad-Bello.html` (vorher `demo/index.html`),
  Lernpfade des Schuljahrs unter `learn/10/` (JPad-*.json mit eingebettetem Lernpfad und Lernpfad-*.html).
  postbuild erzeugt daraus `learn/jcodes.json` (JCodes ohne PHP); `.htaccess`: Dateien in learn/ mit Cache-Control no-cache.
- Keine Schrift-Ligaturen in Code (Editor, Dialoge, Lernpfade): `<=` bleibt `<=` statt ≤.
- Demo zusätzlich als `learn/demo/Lernpfad-Bello.zip` (HTML + Bilder); Lernpfade in learn/10 als HTML und als JPad-JSON.
- Vogelflug-Lernpfad: Hinweis auf extends („Ein Vogel IST EIN Sprite“) und super (kommt später) vor dem Code der Klasse Vogel, kurz auch als Kommentar im Code.
