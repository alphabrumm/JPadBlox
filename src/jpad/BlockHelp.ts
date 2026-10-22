import type { Help } from "./TipHelp.js";

/**
 * JPadBlox: Große Hilfen zu den Bausteinen (langes Drücken auf einen Baustein).
 * Alle Beispiele beziehen sich auf die Klasse Schaf aus den Lernpfaden „Erste Schritte mit JPad“
 * und „Der Schaf-Konstruktor“. Wo es passt, läuft darin eine Werkstatt aus den Lernpfaden (lab).
 * Wrapper-Typen (Integer, Boolean …) und println() ohne System.out, wie im Unterricht.
 */

const SCHAF = `class Schaf {

   String name;
   String farbe;
   String schnarchGeraeusch;
   String maehGeraeusch;

   void schlafen() {
      println("Schnarch: " + schnarchGeraeusch);
   }

   void unterhalten() {
      println(maehGeraeusch);
   }

}`;

export const BLOCK_HELP: Record<string, Help> = {

    // ------------------------------------------------------------ Klassen

    "b-class": {
        title: "Klasse", kind: "Baustein",
        text: "Eine **Klasse** ist ein **Bauplan**. Sie legt fest, was jedes Objekt **hat** (Attribute) und was es **kann** (Methoden). Ein echtes Schaf ist das noch nicht – erst `new Schaf()` baut nach dem Plan ein Objekt.",
        examples: [{ caption: "Der Bauplan Schaf (Datei Schaf.java)", code: SCHAF }],
        lab: "factory",
        labCaption: "Aus einem Bauplan werden zwei Schafe – tippe auf „Nächste Zeile“",
        warn: "Der Klassenname beginnt mit einem **Großbuchstaben** und heißt genau wie die Datei: `class Schaf` gehört in `Schaf.java`.",
    },
    "b-attribut": {
        title: "Attribut", kind: "Baustein",
        text: "Attribute sind die **Eigenschaften**, die jedes Objekt der Klasse hat. Sie stehen direkt im Rumpf der Klasse, außerhalb der Methoden. Jedes Schaf hat seine **eigenen Werte** dafür.",
        examples: [
            { caption: "Die Attribute der Klasse Schaf", code: "class Schaf {\n   String name;\n   String farbe;\n   String schnarchGeraeusch;\n   String maehGeraeusch;\n}" },
            { caption: "Werte setzen und lesen", code: "Schaf s1 = new Schaf();\ns1.name = \"Dolli\";\nprintln(s1.name);   // Dolli" },
        ],
        lab: "sheep",
        labCaption: "Zwei Schafe, ein Bauplan: gleiche Attribute, eigene Werte",
        warn: "Direkt nach `new Schaf()` haben alle Attribute den Wert `null` – es ist noch nichts eingetragen.",
    },
    "b-konstruktor": {
        title: "Konstruktor", kind: "Baustein",
        text: "Der Konstruktor ist die **Bau-Anleitung beim Erzeugen**: Er läuft genau einmal, wenn mit `new` ein Objekt gebaut wird, und füllt die Attribute mit den Werten aus den Klammern. Er heißt **wie die Klasse** und hat **keinen Rückgabetyp** – auch nicht `void`.",
        examples: [
            { caption: "Konstruktor der Klasse Schaf", code: "Schaf(String name, String farbe, String schnarchGeraeusch, String maehGeraeusch) {\n   this.name = name;\n   this.farbe = farbe;\n   this.schnarchGeraeusch = schnarchGeraeusch;\n   this.maehGeraeusch = maehGeraeusch;\n}" },
            { caption: "Statt vier Zeilen nur noch eine", code: "Schaf s1 = new Schaf(\"Dolli\", \"weiss\", \"Mpfhh\", \"Mbähhh\");" },
        ],
        lab: "ctor",
        labCaption: "So baut der Konstruktor Dolli – Schritt für Schritt",
        warn: "Heißen Parameter und Attribut gleich, braucht es `this`: `this.farbe = farbe;` Bei `farbe = farbe;` bleibt das Attribut `null` – und Java meldet keinen Fehler!",
    },
    "b-methode": {
        title: "Methode", kind: "Baustein",
        text: "Eine Methode ist etwas, das ein Objekt **kann**. Der Methodenkopf sagt: was zurückkommt (**Rückgabetyp**, sonst `void`), wie sie heißt und welche Werte sie braucht (**Parameter**). Aufgerufen wird sie mit Punkt: `s1.schlafen();`",
        examples: [
            { caption: "Ohne Parameter", code: "void schlafen() {\n   println(\"Schnarch: \" + schnarchGeraeusch);\n}" },
            { caption: "Mit Parameter", code: "void umbenennen(String neuerName) {\n   name = neuerName;\n}\n\n// Aufruf:\ns1.umbenennen(\"Lotte\");" },
        ],
        lab: "param",
        labCaption: "Was passiert mit dem Parameter beim Aufruf? Tippe auf „Nächster Schritt“",
        warn: "Auch ohne Parameter braucht der Aufruf die Klammern: `s1.schlafen();` – ohne `()` erkennt Java keinen Methodenaufruf.",
    },
    "b-getset": {
        title: "{get,set}", kind: "Baustein",
        text: "Ergänzt **Getter** und **Setter**. Im Dialog wählst du für jedes Attribut: `get` (eine Methode, die den Wert **zurückgibt**), `set` (eine Methode, die einen **neuen Wert setzt**) oder beides. Tippe auf die Spaltenüberschrift, um eine ganze Spalte an- oder abzuwählen.",
        examples: [
            { caption: "Getter für den Namen eines Schafs", code: "public String getName() {\n   return name;\n}" },
            { caption: "Setter für die Farbe", code: "public void setFarbe(String farbe) {\n   this.farbe = farbe;\n}" },
            { caption: "Benutzen", code: "s1.setFarbe(\"braun\");\nprintln(s1.getFarbe());   // braun" },
        ],
        lab: "param",
        labCaption: "Genau so wandert der Wert beim Aufruf ins Attribut (hier mit umbenennen)",
        note: "Getter und Setter brauchst du vor allem, wenn die Attribute `private` sind: Dann kommt man von außen nur über sie an die Werte.",
        warn: "Im Setter heißen Parameter und Attribut oft gleich – dann unbedingt `this.farbe = farbe;` schreiben, sonst ändert sich nichts.",
    },
    "b-getter": {
        title: "Getter", kind: "Baustein",
        text: "Ein Getter ist eine Methode, die den **Wert eines Attributs zurückgibt**. Er heißt `get` + Attributname mit großem Anfangsbuchstaben. Der Rückgabetyp ist der Typ des Attributs.",
        examples: [
            { caption: "Getter für den Namen eines Schafs", code: "public String getName() {\n   return name;\n}" },
            { caption: "Benutzen", code: "Schaf s1 = new Schaf(\"Dolli\", \"weiss\", \"Mpfhh\", \"Mbähhh\");\nprintln(s1.getName());   // Dolli" },
        ],
        note: "Getter brauchst du vor allem, wenn die Attribute `private` sind: Dann kommt man von außen nur über den Getter an den Wert.",
    },
    "b-setter": {
        title: "Setter", kind: "Baustein",
        text: "Ein Setter ist eine Methode, die einem **Attribut einen neuen Wert gibt**. Er heißt `set` + Attributname, gibt nichts zurück (`void`) und bekommt den neuen Wert als **Parameter**.",
        examples: [
            { caption: "Setter für die Farbe eines Schafs", code: "public void setFarbe(String farbe) {\n   this.farbe = farbe;\n}" },
            { caption: "Benutzen", code: "s1.setFarbe(\"braun\");\nprintln(s1.getFarbe());   // braun" },
        ],
        lab: "param",
        labCaption: "Genau so wandert der Wert beim Aufruf ins Attribut (hier mit umbenennen)",
        warn: "Im Setter heißen Parameter und Attribut oft gleich – dann unbedingt `this.farbe = farbe;` schreiben, sonst ändert sich nichts.",
    },
    "b-public": {
        title: "public?", kind: "Sichtbarkeit", code: true,
        text: "Der Baustein setzt die **Sichtbarkeit**: **1× tippen** `public`, **2× tippen** `private`, **3× tippen** entfernt sie wieder. `public` heißt **öffentlich**: Von überall aus darf man darauf zugreifen. `private` heißt **privat**: Nur die Klasse selbst darf darauf zugreifen.",
        examples: [
            { caption: "Öffentliche Methode der Klasse Schaf", code: "public void unterhalten() {\n   println(maehGeraeusch);\n}" },
            { caption: "Private Attribute – Zugriff von außen nur über Getter und Setter", code: "class Schaf {\n   private String name;\n   private String farbe;\n}" },
        ],
        note: "Im UML-Klassendiagramm steht vor öffentlichen Elementen ein `+`, vor privaten ein `-`.",
    },
    "b-private": {
        title: "private", kind: "Sichtbarkeit", code: true,
        text: "`private` heißt **privat**: Nur die Klasse selbst darf darauf zugreifen. Attribute macht man meist `private`, damit niemand von außen Unsinn hineinschreibt. Lesen und ändern geht dann über Getter und Setter.",
        examples: [
            { caption: "Private Attribute", code: "class Schaf {\n   private String name;\n   private String farbe;\n}" },
            { caption: "Von außen geht das dann nicht mehr", code: "s1.name = \"Lotte\";      // Fehler: name ist private\ns1.setName(\"Lotte\");    // so geht's" },
        ],
        note: "Im UML-Klassendiagramm steht vor privaten Elementen ein `-`.",
    },
    "b-kommentar": {
        title: "//", kind: "Kommentar", code: true,
        text: "Alles hinter `//` bis zum Zeilenende ist ein **Kommentar**: Text für Menschen, den Java beim Ausführen überspringt. Mit dem Baustein kannst du außerdem markierte Zeilen **aus- und wieder einkommentieren** – praktisch zum Ausprobieren.",
        examples: [
            { caption: "Erklären, was passiert", code: "// Dolli legt sich schlafen\ns1.schlafen();" },
            { caption: "Zeile vorübergehend abschalten", code: "s1.schlafen();\n// s2.schlafen();   // läuft gerade nicht mit" },
        ],
    },
    "b-extends": {
        title: "extends", kind: "Vererbung", code: true,
        text: "Mit `extends` baust du einen **spezielleren Bauplan** auf einem vorhandenen auf. Die Unterklasse **erbt** alle Attribute und Methoden der Oberklasse und kann Neues dazubekommen.",
        examples: [
            { caption: "Ein Schwarzkopfschaf ist ein Schaf", code: "class Schwarzkopfschaf extends Schaf {\n\n   Integer wolleInKilo;\n\n   void scheren() {\n      println(name + \" gibt \" + wolleInKilo + \" kg Wolle\");\n   }\n}" },
        ],
        note: "Merksatz: „Ein Schwarzkopfschaf **ist ein** Schaf.“ Passt dieser Satz nicht, ist Vererbung meist falsch.",
    },
    "b-super": {
        title: "super", kind: "Vererbung", code: true,
        text: "`super(…)` ruft im Konstruktor der Unterklasse den **Konstruktor der Oberklasse** auf. So baut die Oberklasse ihren Teil (Name, Farbe …), die Unterklasse ergänzt nur das Neue.",
        examples: [{ caption: "Konstruktor des Schwarzkopfschafs", code: "Schwarzkopfschaf(String name, Integer wolleInKilo) {\n   super(name, \"weiss\", \"Chrrr\", \"Möööh\");\n   this.wolleInKilo = wolleInKilo;\n}" }],
        warn: "`super(…)` muss die **erste Anweisung** im Konstruktor sein.",
    },

    // ------------------------------------------------------------ Ablauf

    "b-if": {
        title: "if", kind: "Verzweigung", code: true,
        text: "`if` führt den Block nur aus, **wenn die Bedingung wahr ist**. Sonst wird er übersprungen. Im Dialog des Bausteins kannst du beliebig viele `else if`-Zweige (weitere Bedingungen) und einen `else`-Zweig (sonst) dazunehmen.",
        examples: [
            { caption: "Nur schwarze Schafe sagen etwas", code: "if (farbe.equals(\"schwarz\")) {\n   println(name + \" ist das schwarze Schaf.\");\n}" },
            { caption: "Mit einer Zahl (Attribut Integer alter)", code: "if (alter > 10) {\n   println(name + \" ist ein altes Schaf.\");\n}" },
        ],
        warn: "Texte vergleicht man mit `.equals(…)`, nicht mit `==`. Und: kein `;` direkt hinter `if (…)` – sonst gilt die Bedingung für gar nichts.",
    },
    "b-ifelse": {
        title: "if – else", kind: "Verzweigung", code: true,
        text: "Zwei Wege: Ist die Bedingung wahr, läuft der **if-Block**, sonst der **else-Block**. Genau einer der beiden wird ausgeführt.",
        examples: [{ caption: "Wach oder schlafend?", code: "if (istMuede) {\n   schlafen();\n} else {\n   unterhalten();\n}" }],
        note: "`istMuede` wäre hier ein Attribut vom Typ `Boolean`.",
    },
    "b-elseif": {
        title: "else if", kind: "Verzweigung", code: true,
        text: "Hängt an ein `if` eine **weitere Bedingung** an. Java prüft von oben nach unten und nimmt den **ersten** Zweig, dessen Bedingung wahr ist.",
        examples: [{ caption: "Wolle nach Farbe", code: "if (farbe.equals(\"weiss\")) {\n   println(\"Wolle zum Färben\");\n} else if (farbe.equals(\"schwarz\")) {\n   println(\"Wolle für dunkle Pullis\");\n} else {\n   println(\"Naturwolle\");\n}" }],
    },
    "b-else": {
        title: "else", kind: "Verzweigung", code: true,
        text: "Der **Sonst-Teil** nach einem `if`: Er läuft, wenn keine der Bedingungen davor wahr war. Ein `else` braucht kein eigenes Bedingungs-Klammerpaar.",
        examples: [{ caption: "Sonst-Teil", code: "if (alter < 1) {\n   println(name + \" ist ein Lamm.\");\n} else {\n   println(name + \" ist erwachsen.\");\n}" }],
    },
    "b-while": {
        title: "while", kind: "Schleife", code: true,
        text: "`while` wiederholt den Block, **solange die Bedingung wahr ist**. Vor jeder Runde wird neu geprüft.",
        examples: [{ caption: "Dolli mäht dreimal", code: "Integer zaehler = 0;\nwhile (zaehler < 3) {\n   s1.unterhalten();\n   zaehler++;\n}" }],
        warn: "Ändert sich im Block nichts an der Bedingung (hier fehlt z. B. `zaehler++`), läuft die Schleife **endlos**.",
    },
    "b-for": {
        title: "for", kind: "Zählschleife", code: true,
        text: "Die Zählschleife fasst Startwert, Bedingung und Hochzählen in einer Zeile zusammen. Ideal, wenn du weißt, **wie oft** etwas passieren soll.",
        examples: [
            { caption: "Dolli mäht dreimal", code: "for (Integer i = 0; i < 3; i++) {\n   s1.unterhalten();\n}" },
            { caption: "Jedes Schaf im Array schläft", code: "for (Integer i = 0; i < herde.length; i++) {\n   herde[i].schlafen();\n}" },
        ],
        note: "Gelesen: „Starte bei 0, mach weiter, solange i < 3 ist, und zähle i nach jeder Runde um 1 hoch.“",
    },
    "b-foreach": {
        title: "for-each", kind: "Schleife", code: true,
        text: "Geht **jedes Element** einer Liste oder eines Arrays der Reihe nach durch. Du brauchst keinen Zähler – in jeder Runde steckt das nächste Schaf in der Variablen.",
        examples: [{ caption: "Die ganze Herde schläft", code: "for (Schaf s : herde) {\n   s.schlafen();\n}" }],
        note: "Gelesen: „Für jedes Schaf `s` in der `herde` …“",
    },
    "b-dowhile": {
        title: "do – while", kind: "Schleife", code: true,
        text: "Wie `while`, aber die Bedingung wird erst **am Ende** geprüft. Der Block läuft deshalb **mindestens einmal**.",
        examples: [{ caption: "Mindestens einmal mähen", code: "Integer runden = 0;\ndo {\n   s1.unterhalten();\n   runden++;\n} while (runden < 2);" }],
        warn: "Hinter `while (…)` steht hier ausnahmsweise ein `;`.",
    },
    "b-return": {
        title: "return", kind: "Rückgabe", code: true,
        text: "`return` **beendet die Methode** und gibt einen Wert an den Aufrufer zurück. Der Wert muss zum Rückgabetyp im Methodenkopf passen.",
        examples: [
            { caption: "Getter mit return", code: "String getName() {\n   return name;\n}" },
            { caption: "Ergebnis berechnen (Attribut Integer alter)", code: "Boolean istLamm() {\n   return alter < 1;\n}" },
        ],
        warn: "Alles, was nach `return` im selben Block steht, wird **nie** ausgeführt.",
    },
    "b-break": {
        title: "break", kind: "Abbruch", code: true,
        text: "`break;` **verlässt die Schleife sofort**, auch wenn ihre Bedingung noch wahr wäre. Das Programm macht hinter der Schleife weiter.",
        examples: [{ caption: "Suche nach Gunthard – fertig, sobald gefunden", code: "for (Schaf s : herde) {\n   if (s.name.equals(\"Gunthard\")) {\n      println(\"Gefunden!\");\n      break;\n   }\n}" }],
    },

    // ------------------------------------------------------------ Daten

    "b-variable": {
        title: "Variable", kind: "Baustein",
        text: "Eine Variable ist eine **beschriftete Schachtel** für einen Wert. Vor dem Namen steht der **Datentyp**: Er bestimmt, was hineinpasst – Text (`String`), ganze Zahl (`Integer`), Kommazahl (`Double`), wahr/falsch (`Boolean`) oder ein Objekt wie `Schaf`.",
        examples: [
            { caption: "Variablen in einer Methode", code: "Integer anzahl = 3;\nString gruss = \"Mbähhh\";\nBoolean istMuede = true;" },
            { caption: "Eine Variable für ein Schaf", code: "Schaf s1 = new Schaf();" },
        ],
        warn: "Eine Variable gibt es nur in dem Block `{ … }`, in dem sie angelegt wurde. Attribute dagegen gehören dem Objekt und bleiben erhalten.",
    },
    "b-println": {
        title: "println", kind: "Ausgabe", code: true,
        text: "Schreibt Text in die **Ausgabe** und beginnt danach eine **neue Zeile**. Mit `+` hängst du Texte und Werte aneinander.",
        examples: [{ caption: "So schnarcht ein Schaf", code: "println(\"Schnarch: \" + schnarchGeraeusch);\nprintln(name + \" ist \" + farbe);" }],
    },
    "b-print": {
        title: "print", kind: "Ausgabe", code: true,
        text: "Wie `println`, aber **ohne Zeilenumbruch**: Die nächste Ausgabe steht in derselben Zeile.",
        examples: [{ caption: "Alles in einer Zeile", code: "print(\"Dolli \");\nprint(\"Gunthard \");\nprintln(\"Helga\");\n// Ausgabe: Dolli Gunthard Helga" }],
    },
    "b-new": {
        title: "new", kind: "Objekt erzeugen", code: true,
        text: "`new` **baut nach dem Bauplan ein neues Objekt** und ruft dabei den Konstruktor auf. Die Variable links vom `=` zeigt danach auf das neue Objekt.",
        examples: [
            { caption: "Ohne eigenen Konstruktor", code: "Schaf s1 = new Schaf();\ns1.name = \"Dolli\";" },
            { caption: "Mit Konstruktor", code: "Schaf s2 = new Schaf(\"Gunthard\", \"schwarz\", \"Chrrr\", \"Möööh\");" },
        ],
        lab: "factory",
        labCaption: "Jedes new baut ein eigenes Schaf",
        warn: "Jedes `new` baut ein **neues** Objekt. `Schaf s3 = s1;` dagegen baut kein Schaf – `s3` zeigt nur auf Dolli.",
    },
    "b-array": {
        title: "Array", kind: "Baustein",
        text: "Ein Array ist eine **Reihe von Fächern** mit fester Länge, alle vom gleichen Typ. Der Schäfer Ulf kann so seine ganze Herde in einem Attribut verwalten. Die Fächer sind nummeriert – der **Index beginnt bei 0**.",
        examples: [
            { caption: "Der Schäfer mit seiner Herde", code: "class Schaefer {\n   String name;\n   Schaf[] herde = new Schaf[3];\n}" },
            { caption: "Fächer füllen und benutzen", code: "u.herde[0] = new Schaf(\"Dolli\", \"weiss\", \"Mpfhh\", \"Mbähhh\");\nu.herde[1] = new Schaf(\"Gunthard\", \"schwarz\", \"Chrrr\", \"Möööh\");\nu.herde[2] = new Schaf(\"Helga\", \"braun\", \"Pffft\", \"Bäh\");\n\nu.herde[1].unterhalten();   // Möööh" },
        ],
        lab: "array",
        labCaption: "Ulfs Herde als Array",
        warn: "Bei 3 Fächern ist der letzte Index **2**, nicht 3. `herde[3]` führt zu einem Fehler. Die Länge bekommst du mit `herde.length`.",
    },
    "b-arraylist": {
        title: "ArrayList", kind: "Liste",
        text: "Eine ArrayList ist eine **Liste, die mitwächst**: Anders als beim Array musst du die Länge nicht vorher festlegen. In spitzen Klammern steht, was hinein darf.",
        examples: [
            { caption: "Die Herde als Liste", code: "ArrayList<Schaf> herde = new ArrayList<Schaf>();\nherde.add(s1);\nherde.add(s2);\nprintln(herde.size());   // 2" },
            { caption: "Ein Schaf holen", code: "Schaf erstes = herde.get(0);\nerstes.schlafen();" },
        ],
        note: "Wichtige Methoden: `add(…)` hängt an, `get(i)` holt, `remove(i)` entfernt, `size()` zählt.",
    },
};
