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
- **Haltepunkte**: Knopf in der Hilfsleiste (oder Tippen auf die Zeilennummer). Das Programm hält vor der Zeile an
  und kann dann Schritt für Schritt weiterlaufen.
- **Kein Mouse-over nötig**: alle Funktionen sind per Tippen erreichbar.
- **Hilfe per langem Drücken**: Wer eine halbe Sekunde den Finger auf einen Button legt, sieht, was er bewirkt
  (der Button wird dabei nicht ausgelöst). Zeichen und Operatoren der Hilfsleiste, Schritt und Haltepunkt bekommen
  eine ausführliche Hilfe mit Beispielen und „Achtung“-Hinweisen auf typische Denkfehler (Texte in `TipHelp.ts`). Die Glühbirne neben dem Projektnamen weist darauf hin (auf dem iPhone ausgeblendet).
- **Zwei Layouts**: nebeneinander (iPad quer, Laptop) oder mit Reitern Code/Ausgabe/Probleme (Handy, iPad hoch).
- **Hell, Dunkel oder automatisch** nach Systemeinstellung.
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
