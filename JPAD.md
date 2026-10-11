# JPad – Java-Programmieren am iPad

JPad ist eine touchfreundliche Oberfläche für die [Online-IDE](https://www.online-ide.de) von Martin Pabst.
Programmiersprache, Compiler und Interpreter stammen unverändert aus der Online-IDE; neu sind Editor,
Bedienung und Gestaltung.

## Was JPad anders macht

- **Touch-Editor (CodeMirror 6)** mit nativer Textauswahl, Lupe und Hardware-Tastatur-Unterstützung.
- **Hilfsleiste über der Bildschirmtastatur** mit `{ } ( ) ; = " " .` usw., Tab, Cursortasten,
  Vorschlägen und Info zur Stelle am Cursor.
- **Vervollständigung, Fehleranzeige und Parameterhilfe** direkt aus den Sprachdiensten der Online-IDE.
- **Schritt für Schritt**: Der Knopf „Schritt“ führt das Programm Zeile für Zeile aus; die aktuelle Zeile
  ist gelb markiert, die Ansicht „Variablen“ zeigt alle Werte (geänderte Werte blinken kurz auf).
- **Diagramm**: Klassenansicht (UML-Klassenkarten mit Attributen, Methoden, Vererbung, Interfaces, Assoziationen mit
  Rollennamen und Kardinalitäten) und Objektansicht zur Laufzeit (Objektkarten mit Attributwerten und Verweisen).
  Karten lassen sich verschieben; ein Tipp auf eine Klasse springt in den Code.
- **Color Handbuch** im Menü: alle 149 Farben der Klasse `Color` mit Farbmuster, Suche (auch „rot“, „grün“ …) und Sortierung nach Farbton.
- **Class Handbuch** im Menü: durchsuchbare Klassenreferenz der Online-IDE mit Syntax-Hervorhebung.
- **Sprite Bibliothek** im Menü: alle eingebauten Sprites mit Nummern; ein Tipp kopiert den passenden `new Sprite(…)`-Code.
- **Kein Mouse-over nötig**: alle Funktionen sind per Tippen erreichbar.
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
| `src/jpad/Diagram.ts` | Klassen- und Objektdiagramm |
| `src/jpad/ProjectStore.ts` | Projektliste, Import/Export |
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

## Lizenz

GNU GPL v3, wie die Online-IDE.
