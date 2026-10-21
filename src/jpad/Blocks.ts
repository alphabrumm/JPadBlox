import { EditorView } from "@codemirror/view";
import { EditorSelection } from "@codemirror/state";
import { snippet } from "@codemirror/autocomplete";
import { insertNewlineAndIndent } from "@codemirror/commands";
import { getIndentation, indentString } from "@codemirror/language";

/**
 * JPadBlox: Code-Bausteine zum Antippen.
 *
 * Ein Baustein ist eine Code-Vorlage mit Platzhaltern (Schreibweise der CodeMirror-Snippets):
 *   ${Name}   Platzhalter, ist nach dem Einfügen markiert und wird beim Tippen überschrieben;
 *             gleichnamige Platzhalter werden gemeinsam bearbeitet (z. B. Klassenname bei „Objekt“)
 *   ${}       leere Eingabestelle
 *   §         Rumpf des Blocks: hier landen markierte Zeilen, wenn man sie mit dem Baustein umschließt
 *   \t        eine Einrückungsstufe
 * Mit Tab oder Enter (Hilfsleiste oder Tastatur) springt der Cursor zum nächsten Platzhalter.
 *
 * Alle Beispiele verwenden Wrapper-Typen (Integer, Double, Boolean …) und println() ohne System.out.
 */

export type BlockGroup = "klasse" | "ablauf" | "daten" | "mehr";

export type Block = {
    label: string;
    group: BlockGroup;
    /** Vorlage (siehe oben) */
    tpl: string;
    /** "line": steht in einer eigenen Zeile; "inline": wird an der Cursorstelle eingefügt;
     *  "else": hängt sich an eine Zeile an, die mit } endet (sonst eigene Zeile) */
    kind: "line" | "inline" | "else";
    tip: string;
};

export const GROUP_NAMES: Record<BlockGroup, string> = {
    klasse: "Klassen",
    ablauf: "Ablauf",
    daten: "Daten",
    mehr: "Mehr",
};

export const BLOCKS: Block[] = [
    // ---------- Klassen ----------
    { group: "klasse", label: "class", kind: "line", tpl: "class ${Name} {\n\t§\n}",
        tip: "Neue Klasse: class Name { … }" },
    { group: "klasse", label: "Attribut", kind: "line", tpl: "private ${Integer} ${name};",
        tip: "Attribut: private Integer name;" },
    { group: "klasse", label: "Konstruktor", kind: "line", tpl: "@KLASSE(${}) {\n\t§\n}",
        tip: "Konstruktor der Klasse, in der der Cursor steht: Name(…) { … }" },
    { group: "klasse", label: "this.x = x", kind: "line", tpl: "this.${name} = ${name};",
        tip: "Attribut mit gleichnamigem Parameter belegen: this.name = name;" },
    { group: "klasse", label: "Methode", kind: "line", tpl: "void ${name}(${}) {\n\t§\n}",
        tip: "Methode ohne Rückgabewert: void name(…) { … }" },
    { group: "klasse", label: "Methode → Wert", kind: "line", tpl: "${Integer} ${name}(${}) {\n\t§\n\treturn ${0};\n}",
        tip: "Methode mit Rückgabewert: Integer name(…) { … return …; }" },
    { group: "klasse", label: "Objekt", kind: "line", tpl: "${Klasse} ${name} = new ${Klasse}(${});",
        tip: "Objekt erzeugen: Klasse name = new Klasse(…);" },
    { group: "klasse", label: "new", kind: "inline", tpl: "new ${Klasse}(${})",
        tip: "Neues Objekt an der Cursorstelle: new Klasse(…)" },
    { group: "klasse", label: "extends", kind: "line", tpl: "class ${Name} extends ${Oberklasse} {\n\t§\n}",
        tip: "Unterklasse: class Name extends Oberklasse { … }" },
    { group: "klasse", label: "super(…)", kind: "line", tpl: "super(${});",
        tip: "Konstruktor der Oberklasse aufrufen: super(…); – muss die erste Anweisung im Konstruktor sein" },

    // ---------- Ablauf ----------
    { group: "ablauf", label: "if", kind: "line", tpl: "if (${Bedingung}) {\n\t§\n}",
        tip: "Bedingte Anweisung: if (Bedingung) { … }" },
    { group: "ablauf", label: "if – else", kind: "line", tpl: "if (${Bedingung}) {\n\t§\n} else {\n\t${}\n}",
        tip: "Zweiseitig bedingte Anweisung: if (Bedingung) { … } else { … }" },
    { group: "ablauf", label: "else if", kind: "else", tpl: "else if (${Bedingung}) {\n\t§\n}",
        tip: "Weitere Bedingung nach einem if-Block: else if (Bedingung) { … }" },
    { group: "ablauf", label: "else", kind: "else", tpl: "else {\n\t§\n}",
        tip: "Sonst-Teil nach einem if-Block: else { … }" },
    { group: "ablauf", label: "while", kind: "line", tpl: "while (${Bedingung}) {\n\t§\n}",
        tip: "Wiederholung mit Bedingung: while (Bedingung) { … }" },
    { group: "ablauf", label: "for", kind: "line", tpl: "for (Integer ${i} = 0; ${i} < ${10}; ${i}++) {\n\t§\n}",
        tip: "Zählschleife: for (Integer i = 0; i < 10; i++) { … }" },
    { group: "ablauf", label: "for-each", kind: "line", tpl: "for (${String} ${element} : ${liste}) {\n\t§\n}",
        tip: "Jedes Element einer Liste oder eines Arrays durchlaufen: for (String element : liste) { … }" },
    { group: "ablauf", label: "do – while", kind: "line", tpl: "do {\n\t§\n} while (${Bedingung});",
        tip: "Wiederholung, die mindestens einmal läuft: do { … } while (Bedingung);" },
    { group: "ablauf", label: "return", kind: "line", tpl: "return ${};",
        tip: "Methode beenden und Wert zurückgeben: return …;" },

    // ---------- Daten ----------
    { group: "daten", label: "Variable", kind: "line", tpl: "${Integer} ${name} = ${0};",
        tip: "Variable anlegen: Integer name = 0;" },
    { group: "daten", label: "println", kind: "line", tpl: "println(${});",
        tip: "Ausgabe mit Zeilenumbruch: println(…);" },
    { group: "daten", label: "print", kind: "line", tpl: "print(${});",
        tip: "Ausgabe ohne Zeilenumbruch: print(…);" },
    { group: "daten", label: "Array", kind: "line", tpl: "${Integer}[] ${feld} = new ${Integer}[${10}];",
        tip: "Array (Feld) mit fester Länge: Integer[] feld = new Integer[10];" },
    { group: "daten", label: "ArrayList", kind: "line", tpl: "ArrayList<${String}> ${liste} = new ArrayList<${String}>();",
        tip: "Liste mit variabler Länge: ArrayList<String> liste = new ArrayList<String>();" },
    { group: "daten", label: "// Kommentar", kind: "line", tpl: "// ${Kommentar}",
        tip: "Kommentar: Text für Menschen, wird nicht ausgeführt" },

    // ---------- Mehr ----------
    { group: "mehr", label: "interface", kind: "line", tpl: "interface ${Name} {\n\t§\n}",
        tip: "Schnittstelle: interface Name { … } – enthält nur Methodenköpfe" },
    { group: "mehr", label: "implements", kind: "inline", tpl: " implements ${Schnittstelle}",
        tip: "In der Kopfzeile einer Klasse: … implements Schnittstelle" },
    { group: "mehr", label: "abstract class", kind: "line", tpl: "abstract class ${Name} {\n\t§\n}",
        tip: "Abstrakte Klasse: von ihr selbst lassen sich keine Objekte erzeugen" },
    { group: "mehr", label: "abstrakte Methode", kind: "line", tpl: "abstract ${void} ${name}(${});",
        tip: "Abstrakte Methode ohne Rumpf: abstract void name(…); – Unterklassen müssen sie ausprogrammieren" },
    { group: "mehr", label: "Methodenkopf", kind: "line", tpl: "${void} ${name}(${});",
        tip: "Methodenkopf ohne Rumpf für ein interface: void name(…);" },
];

/** Name der Klasse, in der die Stelle pos liegt (letzte „class X“ davor, deren Rumpf noch offen ist). */
function enclosingClassName(doc: string, pos: number): string | null {
    const before = doc.slice(0, pos);
    const re = /\bclass\s+([A-Za-z_\u00C0-\u024F][\w\u00C0-\u024F]*)/g;
    let m: RegExpExecArray | null, best: string | null = null;
    while ((m = re.exec(before))) {
        // Ist der Klassenrumpf an der Stelle pos noch offen?
        const rest = before.slice(m.index);
        let depth = 0, opened = false;
        for (const ch of rest.replace(/"(?:\\.|[^"\\])*"|\/\/.*|\/\*[\s\S]*?\*\//g, "")) {
            if (ch == "{") { depth++; opened = true; }
            else if (ch == "}") depth--;
        }
        if (!opened || depth > 0) best = m[1];
    }
    return best;
}

/** Klammern und Feldmarken in normalem Text so maskieren, dass snippet() sie wörtlich einfügt. */
function escapeForSnippet(text: string): string {
    return text.replace(/[{}]/g, ch => "\\" + ch);
}

/** Fügt den Baustein an der Cursorstelle ein bzw. umschließt die markierten Zeilen. */
export function insertBlock(view: EditorView, block: Block) {
    const state = view.state;
    let tpl = block.tpl;
    if (tpl.includes("@KLASSE")) {
        const name = enclosingClassName(state.doc.toString(), state.selection.main.head);
        tpl = tpl.replace("@KLASSE", name ?? "${Klassenname}");
    }

    const sel = state.selection.main;

    // Markierte Zeilen mit einem Block-Baustein umschließen (if, while, for, Methode …)
    if (!sel.empty && block.kind != "inline" && tpl.includes("§")) {
        const doc = state.doc;
        const first = doc.lineAt(sel.from);
        let last = doc.lineAt(sel.to);
        if (last.number > first.number && sel.to == last.from) last = doc.line(last.number - 1);
        const base = /^\s*/.exec(first.text)![0];
        const lines: string[] = [];
        for (let n = first.number; n <= last.number; n++) {
            const t = doc.line(n).text;
            const rel = t.startsWith(base) ? t.slice(base.length) : t.replace(/^\s*/, "");
            lines.push(rel.trim() == "" ? "" : "\t" + escapeForSnippet(rel));
        }
        const from = first.from + base.length;
        const filled = tpl.split("\n").map(l => {
            const m = /^(\t*)§$/.exec(l);
            if (!m) return l;
            // Rumpfzeile durch die markierten Zeilen ersetzen (eine Stufe tiefer als bisher)
            return lines.map(b => b == "" ? "" : m[1].slice(1) + b).join("\n");
        }).join("\n");
        // Cursor nur in der ersten Zeile, damit snippet() den ganzen Bereich ersetzt
        view.dispatch({ selection: EditorSelection.cursor(from) });
        snippet(filled)(view, null, from, last.to);
        view.focus();
        return;
    }

    tpl = tpl.replace("§", "${}");

    if (block.kind == "inline") {
        snippet(tpl)(view, null, sel.from, sel.to);
        view.focus();
        return;
    }

    let line = state.doc.lineAt(sel.head);
    const trimmed = line.text.trim();

    // else / else if direkt hinter eine Zeile hängen, die mit } endet
    if (block.kind == "else" && trimmed.endsWith("}") && sel.empty) {
        const end = line.from + line.text.replace(/\s+$/, "").length;
        view.dispatch({ changes: { from: end, to: line.to, insert: " " }, selection: EditorSelection.cursor(end + 1) });
        snippet(tpl)(view, null, end + 1, end + 1);
        view.focus();
        return;
    }

    if (trimmed != "") {
        // Zeile enthält schon Code: neue Zeile darunter, passend eingerückt
        view.dispatch({ selection: EditorSelection.cursor(line.to) });
        insertNewlineAndIndent(view);
    } else {
        // Leere Zeile: auf die richtige Einrückung bringen
        const cols = getIndentation(view.state, line.from);
        if (cols != null) {
            const indent = indentString(view.state, cols);
            view.dispatch({
                changes: { from: line.from, to: line.to, insert: indent },
                selection: EditorSelection.cursor(line.from + indent.length)
            });
        }
    }
    const pos = view.state.selection.main.head;
    snippet(tpl)(view, null, pos, pos);
    view.focus();
}
