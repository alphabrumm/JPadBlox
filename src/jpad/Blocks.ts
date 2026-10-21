import { EditorView } from "@codemirror/view";
import { EditorSelection } from "@codemirror/state";
import { snippet } from "@codemirror/autocomplete";
import { insertNewlineAndIndent } from "@codemirror/commands";
import { getIndentation, indentString, indentUnit } from "@codemirror/language";
import apiText from "./api/online-ide-api.txt?raw";
import type { Dialogs } from "./Dialogs.js";

/**
 * JPadBlox: Code-Bausteine zum Antippen.
 *
 * Ein Baustein ist eine Code-Vorlage mit Platzhaltern (Schreibweise der CodeMirror-Snippets):
 *   ${Name}   Platzhalter, ist nach dem Einfügen markiert und wird beim Tippen überschrieben;
 *             gleichnamige Platzhalter werden gemeinsam bearbeitet (z. B. Typ bei „ArrayList“)
 *   ${}       leere Eingabestelle
 *   §         Rumpf des Blocks: hier landen markierte Zeilen, wenn man sie mit dem Baustein umschließt
 *   \t        eine Einrückungsstufe
 * Mit Tab oder Enter (Hilfsleiste oder Tastatur) springt der Cursor zum nächsten Platzhalter.
 *
 * Alle Beispiele verwenden Wrapper-Typen (Integer, Double, Boolean …) und println() ohne System.out.
 */

export type BlockGroup = "klasse" | "ablauf" | "daten";

/**
 * Art des Bausteins:
 *  line     Vorlage in eigener Zeile        inline   Vorlage an der Cursorstelle
 *  else     hängt sich an eine Zeile mit }   text     fester Text an der Cursorstelle (public, break; …)
 *  attribut / variable   Dialog mit Datentyp und Name
 *  new      passender Konstruktor zum Datentyp links vom =
 *  comment  Kommentar einfügen bzw. Zeilen aus- und einkommentieren
 */
export type BlockKind = "line" | "inline" | "else" | "text" | "attribut" | "variable" | "new" | "comment";

export type Block = {
    label: string;
    group: BlockGroup;
    /** Vorlage (siehe oben) bzw. fester Text bei „text“ */
    tpl: string;
    kind: BlockKind;
    tip: string;
};

export const GROUP_NAMES: Record<BlockGroup, string> = {
    klasse: "Klassen",
    ablauf: "Ablauf",
    daten: "Daten",
};

export const BLOCKS: Block[] = [
    // ---------- Klassen ----------
    { group: "klasse", label: "class", kind: "line", tpl: "class ${Name} {\n\t§\n}",
        tip: "Neue Klasse: class Name { … }" },
    { group: "klasse", label: "Attribut", kind: "attribut", tpl: "",
        tip: "Attribut anlegen: Datentyp und Name auswählen. Es landet an der Cursorstelle, wenn sie direkt im Klassenrumpf liegt, sonst unter den Attributen der obersten Klasse" },
    { group: "klasse", label: "Konstruktor", kind: "line", tpl: "@KLASSE(${}) {\n\t§\n}",
        tip: "Konstruktor der Klasse, in der der Cursor steht: Name(…) { … }" },
    { group: "klasse", label: "this.x = x", kind: "line", tpl: "this.${name} = ${name};",
        tip: "Attribut mit gleichnamigem Parameter belegen: this.name = name;" },
    { group: "klasse", label: "Methode", kind: "line", tpl: "void ${name}(${}) {\n\t§\n}",
        tip: "Methode ohne Rückgabewert: void name(…) { … }" },
    { group: "klasse", label: "Methode → Wert", kind: "line", tpl: "${Integer} ${name}(${}) {\n\t§\n\treturn ${0};\n}",
        tip: "Methode mit Rückgabewert: Integer name(…) { … return …; }" },
    { group: "klasse", label: "new", kind: "new", tpl: "",
        tip: "Objekt erzeugen: Steht links vom = ein Datentyp (z. B. Auto a = ), wird new Auto() eingefügt; der Cursor steht in den Klammern für Parameter" },
    { group: "klasse", label: "extends", kind: "line", tpl: "class ${Name} extends ${Oberklasse} {\n\t§\n}",
        tip: "Unterklasse: class Name extends Oberklasse { … }" },
    { group: "klasse", label: "super(…)", kind: "line", tpl: "super(${});",
        tip: "Konstruktor der Oberklasse aufrufen: super(…); – muss die erste Anweisung im Konstruktor sein" },
    { group: "klasse", label: "public", kind: "text", tpl: "public ",
        tip: "Fügt an der Cursorstelle public ein: von überall aus sichtbar" },
    { group: "klasse", label: "private", kind: "text", tpl: "private ",
        tip: "Fügt an der Cursorstelle private ein: nur innerhalb der eigenen Klasse sichtbar" },
    { group: "klasse", label: "// Kommentar", kind: "comment", tpl: "// ${Kommentar}",
        tip: "Kommentar: In einer leeren Zeile wird ein Kommentar begonnen. Steht Code in der Zeile (oder sind Zeilen markiert), wird er mit // auskommentiert; ist schon eine davon auskommentiert, werden alle wieder einkommentiert" },

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
    { group: "ablauf", label: "break", kind: "text", tpl: "break;",
        tip: "Fügt an der Cursorstelle break; ein: verlässt die Schleife (oder den switch) sofort" },

    // ---------- Daten ----------
    { group: "daten", label: "Variable", kind: "variable", tpl: "",
        tip: "Variable anlegen: Datentyp und Name auswählen, sie wird an der Cursorstelle eingefügt" },
    { group: "daten", label: "println", kind: "line", tpl: "println(${});",
        tip: "Ausgabe mit Zeilenumbruch: println(…);" },
    { group: "daten", label: "print", kind: "line", tpl: "print(${});",
        tip: "Ausgabe ohne Zeilenumbruch: print(…);" },
    { group: "daten", label: "Array", kind: "line", tpl: "${Integer}[] ${feld} = new ${Integer}[${10}];",
        tip: "Array (Feld) mit fester Länge: Integer[] feld = new Integer[10];" },
    { group: "daten", label: "ArrayList", kind: "line", tpl: "ArrayList<${String}> ${liste} = new ArrayList<${String}>();",
        tip: "Liste mit variabler Länge: ArrayList<String> liste = new ArrayList<String>();" },
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

/** Was die Bausteine außer dem Editor brauchen (von App bereitgestellt) */
export type BlockContext = {
    view: EditorView;
    dialogs: Dialogs;
    /** Klassen, Interfaces und Enums aller Dateien des geöffneten Projekts */
    projectTypes: () => string[];
    /** Code der geöffneten Datei formatieren */
    format: () => Promise<void>;
};

/** Fügt den Baustein ein (bzw. umschließt die markierten Zeilen) und formatiert danach den Code. */
export async function insertBlock(ctx: BlockContext, block: Block) {
    const view = ctx.view;
    let done = true;
    switch (block.kind) {
        case "attribut":
        case "variable":
            done = await insertDeclaration(ctx, block.kind);
            break;
        case "new":
            insertNew(view);
            break;
        case "comment":
            toggleComment(view, block.tpl);
            break;
        case "text":
            insertText(view, block.tpl);
            break;
        default:
            insertTemplate(view, block);
    }
    view.focus();
    if (done) await ctx.format();
}

/** Vorlage mit Platzhaltern einfügen (line, inline, else) */
function insertTemplate(view: EditorView, block: Block) {
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
        return;
    }

    tpl = tpl.replace("§", "${}");

    if (block.kind == "inline") {
        snippet(tpl)(view, null, sel.from, sel.to);
        return;
    }

    const line = state.doc.lineAt(sel.head);

    // else / else if direkt hinter eine Zeile hängen, die mit } endet
    if (block.kind == "else" && line.text.trim().endsWith("}") && sel.empty) {
        const end = line.from + line.text.replace(/\s+$/, "").length;
        view.dispatch({ changes: { from: end, to: line.to, insert: " " }, selection: EditorSelection.cursor(end + 1) });
        snippet(tpl)(view, null, end + 1, end + 1);
        return;
    }

    const pos = prepareOwnLine(view);
    snippet(tpl)(view, null, pos, pos);
}

/**
 * Sorgt dafür, dass der Cursor in einer eigenen, richtig eingerückten Zeile steht:
 * Steht in der Zeile schon Code, entsteht darunter eine neue Zeile. Liefert die Cursorposition.
 */
function prepareOwnLine(view: EditorView): number {
    const line = view.state.doc.lineAt(view.state.selection.main.head);
    if (line.text.trim() != "") {
        view.dispatch({ selection: EditorSelection.cursor(line.to) });
        insertNewlineAndIndent(view);
    } else {
        const cols = getIndentation(view.state, line.from);
        if (cols != null) {
            const indent = indentString(view.state, cols);
            view.dispatch({
                changes: { from: line.from, to: line.to, insert: indent },
                selection: EditorSelection.cursor(line.from + indent.length)
            });
        }
    }
    return view.state.selection.main.head;
}

/** Fester Text an der Cursorstelle (public, private, break;) – bei Bedarf mit Leerzeichen davor */
function insertText(view: EditorView, text: string) {
    const sel = view.state.selection.main;
    const before = view.state.sliceDoc(Math.max(0, sel.from - 1), sel.from);
    const insert = (before != "" && /[\w)\]]/.test(before) ? " " : "") + text;
    view.dispatch({
        changes: { from: sel.from, to: sel.to, insert },
        selection: EditorSelection.cursor(sel.from + insert.length),
        scrollIntoView: true,
        userEvent: "input"
    });
}

// ---------------------------------------------------------------- Kommentar

/**
 * Leere Zeile: Kommentar beginnen. Sonst die Zeile bzw. alle markierten Zeilen auskommentieren;
 * ist mindestens eine davon schon auskommentiert, werden alle wieder einkommentiert.
 */
function toggleComment(view: EditorView, tpl: string) {
    const state = view.state, doc = state.doc, sel = state.selection.main;
    const first = doc.lineAt(sel.from);
    let last = doc.lineAt(sel.to);
    if (last.number > first.number && sel.to == last.from) last = doc.line(last.number - 1);
    const lines = [];
    for (let n = first.number; n <= last.number; n++) lines.push(doc.line(n));
    const code = lines.filter(l => l.text.trim() != "");

    if (code.length == 0) {
        const pos = prepareOwnLine(view);
        snippet(tpl)(view, null, pos, pos);
        return;
    }

    const commented = (t: string) => /^\s*\/\//.test(t);
    const changes: { from: number, to: number, insert: string }[] = [];
    if (code.some(l => commented(l.text))) {
        for (const l of code) {
            const m = /^(\s*)\/\/ ?/.exec(l.text);
            if (m) changes.push({ from: l.from + m[1].length, to: l.from + m[0].length, insert: "" });
        }
    } else {
        // Alle Zeilen an derselben Spalte (kleinste Einrückung) auskommentieren
        const indent = Math.min(...code.map(l => /^\s*/.exec(l.text)![0].length));
        for (const l of code) changes.push({ from: l.from + indent, to: l.from + indent, insert: "// " });
    }
    view.dispatch({ changes, userEvent: "input", scrollIntoView: true });
}

// ---------------------------------------------------------------- new

const PRIMITIVE_LIKE = /^(Integer|Double|Boolean|Character|Long|Float|Short|Byte|String)$/;

/** Deklarierten Typ einer Variablen bzw. eines Attributs im Text suchen */
function declaredType(doc: string, name: string): string | null {
    const re = new RegExp(String.raw`(?:^|[\s(,;{])([A-Za-z_][\w.]*(?:<[^;=(){}]*>)?(?:\s*\[\s*\])*)\s+` + name + String.raw`\s*[;=,)]`, "gm");
    let m: RegExpExecArray | null, found: string | null = null;
    while ((m = re.exec(doc))) {
        const t = m[1];
        if (!/^(return|new|else|throw|case)$/.test(t)) found = t;
    }
    return found;
}

/**
 * new: Datentyp links vom = ermitteln (Integer zahl = | oder liste = | mit Deklaration anderswo)
 * und den passenden Konstruktor einfügen, Cursor in den Klammern.
 */
function insertNew(view: EditorView) {
    const state = view.state, sel = state.selection.main;
    const line = state.doc.lineAt(sel.from);
    const before = state.sliceDoc(line.from, sel.from);
    const after = state.sliceDoc(sel.to, line.to);

    let type: string | null = null;
    const decl = /(?:^|[\s(,;{])(?:final\s+)?([A-Za-z_][\w.]*(?:<[^=]*>)?(?:\s*\[\s*\])*)\s+[A-Za-z_]\w*\s*=\s*$/.exec(before);
    if (decl && !/^(return|new|else)$/.test(decl[1])) type = decl[1];
    else {
        const assign = /(?:this\.)?([A-Za-z_]\w*)(?:\s*\[[^\]]*\])?\s*=\s*$/.exec(before);
        if (assign) type = declaredType(state.doc.toString(), assign[1]);
        // Element eines Arrays: feld[i] = new … → Elementtyp
        if (type && /\]\s*=\s*$/.test(before)) type = type.replace(/\s*\[\s*\]\s*$/, "");
    }

    const space = before != "" && !/\s$/.test(before) ? " " : "";
    const semicolon = after.trim() == "" && /=\s*$/.test(before) ? ";" : "";

    if (!type) {
        snippet(space + "new ${Klasse}(${})" + semicolon)(view, null, sel.from, sel.to);
        return;
    }
    type = type.replace(/\s+/g, "");
    let text: string, cursor: number;
    const arr = /^(.*?)((?:\[\])+)$/.exec(type);
    if (arr) {
        // Integer[][] → new Integer[|][]
        text = space + "new " + arr[1] + "[]" + arr[2].slice(2);
        cursor = space.length + 4 + arr[1].length + 1;
    } else {
        if (PRIMITIVE_LIKE.test(type)) {
            // Für Wrapper-Typen und String gibt es keinen sinnvollen Konstruktor: Platzhalter statt new
            snippet(space + "${Wert}" + semicolon)(view, null, sel.from, sel.to);
            return;
        }
        text = space + "new " + type + "()";
        cursor = text.length - 1;
    }
    view.dispatch({
        changes: { from: sel.from, to: sel.to, insert: text + semicolon },
        selection: EditorSelection.cursor(sel.from + cursor),
        scrollIntoView: true,
        userEvent: "input"
    });
}

// ---------------------------------------------------------------- Attribut / Variable

const BASIC_TYPES = ["String", "Integer", "Double", "Boolean"];
let libraryTypesCache: string[] | null = null;

/** Klassen, Interfaces und Enums der Klassenbibliothek der Online-IDE (aus der API-Beschreibung) */
function libraryTypes(): string[] {
    if (libraryTypesCache) return libraryTypesCache;
    const set = new Set<string>();
    const re = /^public\s+(?:(?:abstract|final|static)\s+)*(?:class|interface|enum)\s+([A-Za-z_]\w*)/gm;
    let m: RegExpExecArray | null;
    while ((m = re.exec(apiText))) set.add(m[1]);
    for (const t of BASIC_TYPES) set.delete(t);
    return libraryTypesCache = [...set].sort((a, b) => a.localeCompare(b, "de"));
}

const JAVA_KEYWORDS = new Set(("abstract assert boolean break byte case catch char class const continue default do double else enum extends " +
    "final finally float for goto if implements import instanceof int interface long native new package private protected public " +
    "return short static super switch synchronized this throw throws transient try void volatile while true false null var").split(" "));

async function insertDeclaration(ctx: BlockContext, kind: "attribut" | "variable"): Promise<boolean> {
    const own = ctx.projectTypes().filter(t => !BASIC_TYPES.includes(t));
    const lib = libraryTypes().filter(t => !own.includes(t));
    const result = await ctx.dialogs.declaration({
        title: kind == "attribut" ? "Attribut anlegen" : "Variable anlegen",
        groups: [
            { label: "Grundtypen", items: BASIC_TYPES },
            { label: "Eigene Klassen", items: own },
            { label: "Klassenbibliothek", items: lib },
        ],
        nameLabel: kind == "attribut" ? "Name des Attributs" : "Name der Variablen",
        confirm: "Einfügen",
        validate: (name) => {
            if (name.trim() == "") return "Bitte einen Namen eingeben.";
            if (!/^[A-Za-z_ÄÖÜäöüß][\wÄÖÜäöüß]*$/.test(name.trim())) return "Ein Name besteht aus Buchstaben, Ziffern und _ und beginnt nicht mit einer Ziffer.";
            if (JAVA_KEYWORDS.has(name.trim())) return `„${name.trim()}“ ist ein Schlüsselwort von Java und kann kein Name sein.`;
            return null;
        }
    });
    if (!result) return false;
    const text = `${result.type} ${result.name.trim()};`;
    if (kind == "variable") {
        const pos = prepareOwnLine(ctx.view);
        ctx.view.dispatch({
            changes: { from: pos, to: pos, insert: text },
            selection: EditorSelection.cursor(pos + text.length),
            scrollIntoView: true, userEvent: "input"
        });
    } else {
        insertAttribute(ctx.view, text);
    }
    return true;
}

/** Text mit Zeichenketten und Kommentaren durch Leerzeichen ersetzt (gleiche Länge), für das Zählen von Klammern */
function codeOnly(text: string): string {
    return text.replace(/"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, " "));
}

/**
 * Attribut einfügen: an der Cursorstelle, wenn sie direkt im Rumpf einer Klasse liegt (nicht in einer Methode),
 * sonst unter den vorhandenen Attributen der obersten Klasse der Datei (bzw. gleich am Anfang ihres Rumpfs).
 */
function insertAttribute(view: EditorView, text: string) {
    const state = view.state;
    const doc = state.doc.toString();
    const code = codeOnly(doc);
    const head = state.selection.main.head;

    // Klammertiefe am Cursor und ob der Cursor in einem Klassenrumpf steht
    const classRe = /\b(?:class|enum)\s+[A-Za-z_]\w*[^{;]*\{/g;
    const firstClass = classRe.exec(code);
    if (!firstClass) {
        // Keine Klasse in der Datei: einfach an der Cursorstelle
        const pos = prepareOwnLine(view);
        view.dispatch({ changes: { from: pos, insert: text }, selection: EditorSelection.cursor(pos + text.length), scrollIntoView: true, userEvent: "input" });
        return;
    }
    const enclosingName = enclosingClassName(doc, head);
    let depth = 0;
    for (let i = 0; i < head; i++) { if (code[i] == "{") depth++; else if (code[i] == "}") depth--; }
    if (enclosingName && depth == 1) {
        const pos = prepareOwnLine(view);
        view.dispatch({ changes: { from: pos, insert: text }, selection: EditorSelection.cursor(pos + text.length), scrollIntoView: true, userEvent: "input" });
        return;
    }

    // Unter den Attributen der obersten Klasse
    const bodyStart = firstClass.index + firstClass[0].length;
    const attrRe = /^\s*(?:(?:private|public|protected|static|final)\s+)*[A-Za-z_][\w.]*(?:<[^;=(){}]*>)?(?:\s*\[\s*\])*\s+[A-Za-z_]\w*\s*(?:=[^;]*)?;\s*$/;
    let insertAfter = state.doc.lineAt(bodyStart).to;
    let d = 1, lineStart = bodyStart;
    for (let i = bodyStart; i < code.length && d > 0; i++) {
        const ch = code[i];
        if (ch == "{") d++;
        else if (ch == "}") d--;
        else if (ch == "\n") {
            const lineCode = code.slice(lineStart, i);
            if (d == 1 && attrRe.test(lineCode) && !/^\s*(return|throw)\b/.test(lineCode)) insertAfter = i;
            lineStart = i + 1;
        }
    }
    const classLine = state.doc.lineAt(firstClass.index);
    const indent = /^\s*/.exec(classLine.text)![0] + state.facet(indentUnit);
    const insert = "\n" + indent + text;
    view.dispatch({
        changes: { from: insertAfter, insert },
        selection: EditorSelection.cursor(insertAfter + insert.length),
        scrollIntoView: true, userEvent: "input"
    });
}

/** Hinweistext beim langen Drücken auf einen Baustein */
export function blockTip(b: Block): string {
    return b.tpl.includes("§")
        ? b.tip + ". Markierte Zeilen umschließt der Baustein. Tab oder Enter springt zum nächsten Platzhalter."
        : b.tip + ". Tab oder Enter springt zum nächsten Platzhalter.";
}

function chipHtml(b: Block, i: number): string {
    return `<button class="jp-block" data-block="${i}" data-group="${b.group}" data-tip="${blockTip(b).replace(/"/g, "&quot;")}">${b.label.replace(/</g, "&lt;")}</button>`;
}

/** Senkrechte Bausteinleiste (linke Spalte im Querformat), nach Gruppen geordnet */
export function blockPanelHtml(): string {
    const groups = Object.keys(GROUP_NAMES) as BlockGroup[];
    return groups.map(g => `
        <section class="jp-blockgroup" data-group="${g}">
            <h3>${GROUP_NAMES[g]}</h3>
            <div class="jp-blockgroup-items">
                ${BLOCKS.map((b, i) => b.group == g ? chipHtml(b, i) : "").join("")}
            </div>
        </section>`).join("");
}

/** Waagrechte Bausteinreihe für die Hilfsleiste (Hochformat und Handy) */
export function blockRowHtml(): string {
    let html = "", group: BlockGroup | null = null;
    BLOCKS.forEach((b, i) => {
        if (b.group != group) {
            group = b.group;
            html += `<span class="jp-block-group" data-group="${group}" aria-hidden="true">${GROUP_NAMES[group]}</span>`;
        }
        html += chipHtml(b, i);
    });
    return html;
}

/**
 * Antippen in der senkrechten Leiste: Wie in der Hilfsleiste darf der Editor dabei den Fokus nicht
 * verlieren (sonst klappt die Bildschirmtastatur zu). Wischen scrollt die Leiste, ein Tipp ohne
 * Wischen fügt den Baustein ein.
 */
export function wireBlockPanel(panel: HTMLElement, ctx: BlockContext) {
    const run = (b: HTMLElement) => insertBlock(ctx, BLOCKS[parseInt(b.dataset.block!)]);
    for (const ev of ["pointerdown", "mousedown"]) panel.addEventListener(ev, e => {
        if ((<HTMLElement>e.target).closest("button")) e.preventDefault();
    });
    let tap: { b: HTMLElement, x: number, y: number, moved: boolean } | null = null;
    panel.addEventListener("touchstart", e => {
        const b = (<HTMLElement>e.target).closest<HTMLElement>("button[data-block]");
        if (!b || e.touches.length > 1) { tap?.b.classList.remove("is-pressed"); tap = null; return; }
        const t = e.touches[0];
        tap = { b, x: t.clientX, y: t.clientY, moved: false };
        b.classList.add("is-pressed");
    }, { passive: true });
    panel.addEventListener("touchmove", e => {
        if (!tap || tap.moved) return;
        const t = e.touches[0];
        if (Math.abs(t.clientX - tap.x) > 10 || Math.abs(t.clientY - tap.y) > 10) {
            tap.moved = true;
            tap.b.classList.remove("is-pressed");
        }
    }, { passive: true });
    panel.addEventListener("touchend", e => {
        const t = tap;
        tap = null;
        if (!t) return;
        t.b.classList.remove("is-pressed");
        if (t.moved) return;
        e.preventDefault();
        t.b.click();
    }, { passive: false });
    panel.addEventListener("touchcancel", () => { tap?.b.classList.remove("is-pressed"); tap = null; });
    panel.addEventListener("click", e => {
        const b = (<HTMLElement>e.target).closest<HTMLElement>("button[data-block]");
        if (b) run(b);
    });
}
