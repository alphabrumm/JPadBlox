/**
 * Ausführliche Hilfe zu Buttons (langes Drücken, siehe TouchTips) – ähnlich der Kurzhilfe in QPad.
 * In den Texten: `Code` wird als Code gesetzt, **fett** wird fett.
 */

export type Help = {
    title: string,
    kind: string,
    /** Titel als Code setzen (Operatoren, Zeichen) */
    code?: boolean,
    text: string,
    /** nummerierte Anleitung */
    steps?: string[],
    examples?: { caption: string, code: string }[],
    /** häufiger Denkfehler */
    warn?: string,
    note?: string,
    /** JPadBlox: eingebettete Werkstatt aus den Lernpfaden (siehe SheepLabs.ts) */
    lab?: "factory" | "ctor" | "param" | "sheep" | "array",
    labCaption?: string,
};

export const HELP: Record<string, Help> = {

    // ------------------------------------------------------------ Hilfsleiste: Zeichen

    tab: {
        title: "Einrücken", kind: "Taste",
        text: "Rückt die Zeile am Cursor ein. Die Einrückung zeigt, welche Zeilen zu welchem Block gehören – für Java ist sie egal, für Menschen sehr wichtig.",
        examples: [{ caption: "Gut lesbar eingerückt", code: "if (alter >= 18) {\n    println(\"volljährig\");\n}" }],
        note: "Tipp: Mit „Code formatieren“ rückt JPad die ganze Datei auf einmal richtig ein."
    },
    braces: {
        title: "{ }", kind: "Block", code: true,
        text: "Geschweifte Klammern fassen mehrere Anweisungen zu einem Block zusammen: den Rumpf einer Klasse, einer Methode, einer Verzweigung oder einer Schleife.",
        examples: [
            { caption: "Einfaches Beispiel", code: "public class Auto {\n    Integer tankinhalt;\n}" },
            { caption: "Etwas anspruchsvoller", code: "void tanken(Integer liter) {\n    if (liter > 0) {\n        tankinhalt = tankinhalt + liter;\n    }\n}" }
        ],
        warn: "Zu jeder `{` gehört genau eine `}`. Fehlt eine, meldet der Compiler den Fehler oft erst ganz am Ende der Datei – also dort suchen, wo der Block eigentlich enden sollte."
    },
    parens: {
        title: "( )", kind: "Klammern", code: true,
        text: "Runde Klammern umschließen die Parameter einer Methode und die Bedingung bei `if` und `while`. In Rechnungen legen sie fest, was zuerst gerechnet wird.",
        examples: [
            { caption: "Methodenaufruf und Bedingung", code: "auto.tanken(20);\nif (tankinhalt < 5) { ... }" },
            { caption: "Rechenreihenfolge", code: "Integer mittel = (a + b) / 2;" }
        ],
        warn: "Auch eine Methode ohne Parameter braucht beim Aufruf die Klammern: `auto.hupen();` – ohne `()` erkennt Java keinen Methodenaufruf."
    },
    semicolon: {
        title: ";", kind: "Satzzeichen", code: true,
        text: "Der Strichpunkt beendet eine Anweisung – so wie der Punkt einen Satz.",
        examples: [{ caption: "Jede Anweisung endet mit ;", code: "Integer zaehler = 0;\nzaehler++;\nprintln(zaehler);" }],
        warn: "Kein Strichpunkt nach `if (…)`, `while (…)`, einem Methodenkopf oder `class …`! `if (x > 0); { … }` führt den Block **immer** aus, weil das `if` schon am Strichpunkt endet."
    },
    assign: {
        title: "=", kind: "Zuweisung", code: true,
        text: "Speichert den Wert rechts in der Variablen links. Gelesen wird von rechts nach links: „alter bekommt den Wert 15“.",
        examples: [
            { caption: "Einfaches Beispiel", code: "Integer alter = 15;" },
            { caption: "Alter Wert wird überschrieben", code: "alter = alter + 1;   // jetzt 16" }
        ],
        warn: "`=` ist **kein** Vergleich! Ob zwei Werte gleich sind, prüft `==`. Also `if (alter == 18)`, nicht `if (alter = 18)`."
    },
    quotes: {
        title: "\" \"", kind: "Text (String)", code: true,
        text: "Anführungszeichen umschließen einen Text (String). Mit `+` lassen sich Texte und Werte aneinanderhängen.",
        examples: [
            { caption: "Einfaches Beispiel", code: "String name = \"Anna\";" },
            { caption: "Text und Wert verbinden", code: "println(\"Hallo \" + name + \"!\");" }
        ],
        warn: "`\"name\"` ist der Text name, `name` ist die Variable. Ein einzelnes Zeichen (Character) steht in einfachen Hochkommas: `'a'`."
    },
    dot: {
        title: ".", kind: "Punktnotation", code: true,
        text: "Mit dem Punkt sprichst du ein Objekt an: Du rufst eine seiner Methoden auf oder greifst auf ein Attribut zu. Links steht das Objekt, rechts, was es tun soll.",
        examples: [
            { caption: "Methode aufrufen", code: "Auto meinAuto = new Auto();\nmeinAuto.fahren(10);" },
            { caption: "Kommazahl", code: "Double preis = 1.99;   // Punkt statt Komma!" }
        ],
        warn: "Links vom Punkt muss ein **Objekt** stehen. Ist die Variable noch `null` (kein `new`), stürzt das Programm mit einer NullPointerException ab. Kommazahlen schreibt Java mit Punkt: `1.99`, nicht `1,99`."
    },
    brackets: {
        title: "[ ]", kind: "Array", code: true,
        text: "Eckige Klammern gehören zu Arrays (Feldern): Sie legen ein Array an und wählen über den Index ein Element aus.",
        examples: [
            { caption: "Array anlegen und füllen", code: "Integer[] noten = new Integer[3];\nnoten[0] = 2;\nnoten[1] = 3;\nnoten[2] = 1;" },
            { caption: "Alle Elemente durchgehen", code: "for (Integer i = 0; i < noten.length; i++) {\n    println(noten[i]);\n}" }
        ],
        warn: "Der Index beginnt bei **0**. Ein Array mit 3 Elementen hat die Indizes 0, 1, 2 – `noten[3]` gibt es nicht (ArrayIndexOutOfBoundsException)."
    },
    lt: {
        title: "<", kind: "Vergleich", code: true,
        text: "„kleiner als“: Das Ergebnis ist `true`, wenn der linke Wert echt kleiner ist als der rechte.",
        examples: [
            { caption: "Einfaches Beispiel", code: "if (tankinhalt < 5) {\n    println(\"Bitte tanken!\");\n}" },
            { caption: "Kleiner oder gleich", code: "if (alter <= 13) { ... }" }
        ],
        warn: "`5 < 5` ist `false` – für „kleiner oder gleich“ schreibst du `<=`. Eine Doppelbedingung wie in Mathe (`0 < x < 10`) geht in Java nicht: `0 < x && x < 10`."
    },
    gt: {
        title: ">", kind: "Vergleich", code: true,
        text: "„größer als“: Das Ergebnis ist `true`, wenn der linke Wert echt größer ist als der rechte.",
        examples: [
            { caption: "Einfaches Beispiel", code: "if (punkte > 50) {\n    println(\"bestanden\");\n}" },
            { caption: "Größer oder gleich", code: "if (alter >= 18) { ... }" }
        ],
        warn: "`18 > 18` ist `false` – für „ab 18“ brauchst du `>=`. Ein häufiger Fehler bei Grenzen!"
    },
    plus: {
        title: "+", kind: "Rechnen und Text", code: true,
        text: "Addiert Zahlen. Steht ein Text (String) daneben, hängt `+` die Werte stattdessen aneinander.",
        examples: [
            { caption: "Rechnen", code: "Integer summe = a + b;" },
            { caption: "Text verketten", code: "println(\"Summe: \" + summe);" }
        ],
        warn: "`\"Summe: \" + 2 + 3` ergibt **\"Summe: 23\"**, weil von links gearbeitet wird und schon Text dasteht. Richtig: `\"Summe: \" + (2 + 3)`."
    },
    minus: {
        title: "−", kind: "Rechnen", code: true,
        text: "Subtrahiert Zahlen oder macht eine Zahl negativ.",
        examples: [
            { caption: "Einfaches Beispiel", code: "kontostand = kontostand - betrag;" },
            { caption: "Negative Zahl", code: "Integer temperatur = -5;" }
        ],
        warn: "Es wird von links nach rechts gerechnet: `10 - 4 - 2` ist 4, nicht 8. Im Zweifel Klammern setzen."
    },
    times: {
        title: "*", kind: "Rechnen", code: true,
        text: "Multipliziert zwei Zahlen. Wie in Mathe gilt Punkt vor Strich.",
        examples: [
            { caption: "Einfaches Beispiel", code: "Double preis = anzahl * 1.99;" },
            { caption: "Punkt vor Strich", code: "Integer x = 2 + 3 * 4;     // 14\nInteger y = (2 + 3) * 4;   // 20" }
        ],
        warn: "Den Malpunkt darf man nicht weglassen: `2x` versteht Java nicht, richtig ist `2 * x`."
    },
    divide: {
        title: "/", kind: "Rechnen", code: true,
        text: "Teilt zwei Zahlen.",
        examples: [
            { caption: "Kommazahlen", code: "Double mittel = 7.0 / 2;   // 3.5" },
            { caption: "Ganze Zahlen", code: "Integer teams = 25 / 4;   // 6" }
        ],
        warn: "Sind beide Zahlen ganze Zahlen (Integer), schneidet Java den Rest ab: `7 / 2` ist **3**, nicht 3.5! Schreibe `7.0 / 2`, wenn du Kommastellen willst. Den Rest liefert `%`."
    },
    modulo: {
        title: "%", kind: "Rest der Division (Modulo)", code: true,
        text: "Liefert den Rest, der beim ganzzahligen Teilen übrig bleibt. Damit prüft man z. B., ob eine Zahl gerade ist oder durch etwas teilbar ist.",
        examples: [
            { caption: "Einfaches Beispiel", code: "Integer rest = 17 % 5;   // 2, denn 17 = 3·5 + 2" },
            { caption: "Gerade oder ungerade?", code: "if (zahl % 2 == 0) {\n    println(\"gerade\");\n}" }
        ],
        warn: "`%` hat in Java nichts mit Prozent zu tun! `20 % 3` ist 2 (der Rest), nicht „20 Prozent von 3“."
    },
    not: {
        title: "!", kind: "Logik: nicht", code: true,
        text: "Kehrt einen Wahrheitswert um: aus `true` wird `false` und umgekehrt.",
        examples: [
            { caption: "Einfaches Beispiel", code: "if (!tankLeer) {\n    fahren(10);\n}" },
            { caption: "Ungleich", code: "if (antwort != 42) { ... }" }
        ],
        warn: "`!` wirkt nur auf das, was direkt dahinter steht: `!a && b` ist etwas anderes als `!(a && b)`. Und „ungleich“ heißt `!=`, nicht `=!`."
    },
    and: {
        title: "&&", kind: "Logik: und", code: true,
        text: "Verundung: Das Ergebnis ist nur `true`, wenn **beide** Bedingungen wahr sind.",
        examples: [
            { caption: "Zahl zwischen 1 und 10", code: "if (x >= 1 && x <= 10) { ... }" },
            { caption: "Mehrere Bedingungen", code: "if (alter >= 16 && hatFuehrerschein) { ... }" }
        ],
        warn: "Umgangssprache täuscht: „Kinder **und** Rentner zahlen weniger“ heißt im Code `alter < 14 || alter >= 65` – niemand ist beides gleichzeitig! Mit `&&` wäre die Bedingung nie erfüllt."
    },
    or: {
        title: "||", kind: "Logik: oder", code: true,
        text: "Veroderung: Das Ergebnis ist `true`, wenn **mindestens eine** Bedingung wahr ist – auch wenn beide wahr sind.",
        examples: [
            { caption: "Wochenende?", code: "if (tag == 6 || tag == 7) { ... }" },
            { caption: "Außerhalb eines Bereichs", code: "if (x < 1 || x > 10) {\n    println(\"ungültig\");\n}" }
        ],
        warn: "Jede Seite braucht einen vollständigen Vergleich: `tag == 6 || 7` geht nicht. Und Vorsicht beim Verneinen: `x != 3 || x != 4` ist **immer** wahr – gemeint ist meist `x != 3 && x != 4`."
    },
    equals: {
        title: "==", kind: "Vergleich: gleich", code: true,
        text: "Prüft, ob zwei Werte gleich sind. Das Ergebnis ist `true` oder `false`.",
        examples: [
            { caption: "Zahlen vergleichen", code: "if (punkte == 100) {\n    println(\"Volle Punktzahl!\");\n}" },
            { caption: "Texte vergleichen", code: "if (name.equals(\"Anna\")) { ... }" }
        ],
        warn: "`==` (vergleichen) nicht mit `=` (zuweisen) verwechseln! Texte (String) vergleicht man mit `equals`, denn `==` prüft bei Objekten nur, ob es **dasselbe** Objekt ist."
    },
    increment: {
        title: "++", kind: "Erhöhen", code: true,
        text: "Erhöht eine Zahl-Variable um 1. `i++` ist die Kurzform von `i = i + 1`.",
        examples: [
            { caption: "Einfaches Beispiel", code: "zaehler++;" },
            { caption: "In der for-Schleife", code: "for (Integer i = 0; i < 5; i++) {\n    println(i);\n}" }
        ],
        warn: "Nicht `i = i++;` schreiben – dann bleibt `i` unverändert! Entweder `i++;` oder `i = i + 1;`."
    },

    // ------------------------------------------------------------ Hilfsleiste: Funktionen

    left: { title: "Cursor nach links", kind: "Taste", text: "Bewegt den Cursor ein Zeichen nach links – praktisch, um genau zwischen zwei Klammern zu landen." },
    right: { title: "Cursor nach rechts", kind: "Taste", text: "Bewegt den Cursor ein Zeichen nach rechts, zum Beispiel hinter eine schließende Klammer." },
    info: {
        title: "Info", kind: "Nachschlagen",
        text: "Zeigt, was der Name bedeutet, auf dem der Cursor gerade steht: den Typ einer Variablen oder die Beschreibung und Parameter einer Methode.",
        steps: ["Tippe im Code auf einen Namen, z. B. `println` oder eine eigene Variable.", "Tippe auf Info."]
    },
    hide: { title: "Tastatur ausblenden", kind: "Taste", text: "Blendet die Bildschirmtastatur aus, damit du mehr vom Code siehst. Ein Tipp in den Code holt sie zurück." },
    breakpoint: {
        title: "Haltepunkt", kind: "Fehlersuche",
        text: "**Die Idee:** Dein Programm läuft ganz normal los, hält aber **vor** einer Zeile an, die dich interessiert – wie ein Stoppschild. Dort kannst du in Ruhe nachsehen, welche Werte die Variablen gerade haben. So musst du nicht hunderte Schritte einzeln antippen, bis du an der spannenden Stelle bist.",
        steps: [
            "Tippe im Code in die Zeile, vor der das Programm anhalten soll.",
            "Tippe auf den Haltepunkt-Button (oder direkt auf die Zeilennummer). Die Zeile bekommt eine Markierung.",
            "Starte das Programm mit ▶. Es hält vor der markierten Zeile an, sie ist gelb hinterlegt.",
            "Sieh dir in der Ansicht „Variablen“ die Werte an. Mit „Schritt“ geht es Zeile für Zeile weiter, mit ▶ bis zum nächsten Haltepunkt.",
            "Nochmals auf den Haltepunkt-Button tippen entfernt ihn wieder."
        ],
        examples: [{ caption: "Haltepunkt in einer Schleife: hält in jeder Runde", code: "for (Integer i = 0; i < 10; i++) {\n    summe = summe + i;   // ← Haltepunkt hier\n}" }]
    },

    // ------------------------------------------------------------ Kopfzeile: Ausführen

    step: {
        title: "Schritt", kind: "Schritt für Schritt",
        text: "**Die Idee:** Du führst dein Programm in Zeitlupe aus – eine Zeile pro Tipp. So siehst du genau, in welcher Reihenfolge Java deinen Code abarbeitet und wie sich die Variablen dabei verändern. Ideal, um einen Fehler zu finden oder zu verstehen, was eine Schleife macht.",
        steps: [
            "Tippe auf „Schritt“. Das Programm startet und hält vor der ersten Zeile an – sie ist gelb markiert.",
            "Jeder weitere Tipp auf „Schritt“ führt die gelbe Zeile aus. Bei einem Methodenaufruf springst du in die Methode hinein.",
            "In der Ansicht „Variablen“ siehst du alle Werte. Geänderte Werte blinken kurz auf.",
            "Mit ▶ läuft das Programm normal weiter, mit ■ beendest du es."
        ],
        note: "Während des Schrittbetriebs erscheinen zusätzlich „Methode überspringen“ und „Methode verlassen“. Mit einem Haltepunkt kommst du schneller an eine bestimmte Stelle."
    },
    stepOver: {
        title: "Methode überspringen", kind: "Schritt für Schritt",
        text: "Führt die gelbe Zeile in einem Schritt aus – auch wenn darin eine Methode aufgerufen wird. Du springst also **nicht** in die Methode hinein, sondern landest gleich in der nächsten Zeile.",
        examples: [{ caption: "Die Methode tanken wird komplett ausgeführt", code: "auto.tanken(20);   // ← gelb\nauto.fahren(5);    // ← hier geht es weiter" }]
    },
    stepOut: {
        title: "Methode verlassen", kind: "Schritt für Schritt",
        text: "Führt den Rest der Methode, in der du gerade bist, in einem Rutsch aus und hält erst wieder dort an, wo die Methode aufgerufen wurde. Praktisch, wenn du versehentlich in eine Methode hineingesprungen bist."
    },
    run: {
        title: "Programm starten", kind: "Ausführen",
        text: "Übersetzt dein Programm und startet es. Ausgaben erscheinen in der Ansicht „Ausgabe“. Enthält der Code noch Fehler, zeigt JPad dir stattdessen die Liste der Probleme."
    },
};
