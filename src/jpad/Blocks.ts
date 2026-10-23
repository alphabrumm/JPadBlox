import { EditorView } from "@codemirror/view";
import { EditorSelection } from "@codemirror/state";
import { snippet } from "@codemirror/autocomplete";
import { insertNewlineAndIndent } from "@codemirror/commands";
import { getIndentation, indentString, indentUnit } from "@codemirror/language";
import apiText from "./api/online-ide-api.txt?raw";
import type { Dialogs, VarCtor, VariableResult } from "./Dialogs.js";
import type { FieldHandle } from "./ConditionField.js";

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
 *  visibility  „public?“: 1× tippen public, 2× private, 3× keine Sichtbarkeit (ersetzt ein vorhandenes in der Zeile)
 *  attribut / variable   Dialog mit Datentyp und Name
 *  constructor  Konstruktor zu den Attributen („insert constructor“ der Online-IDE)
 *  accessors  „{get,set}“: je Attribut Getter, Setter oder beides auswählen
 *  if       Dialog: Bedingung, beliebig viele else-if-Zweige, else-Zweig
 *  method   Dialog: Name, Rückgabetyp, Parameter
 *  new      passender Konstruktor zum Datentyp links vom =
 *  comment  Kommentar einfügen bzw. Zeilen aus- und einkommentieren
 */
export type BlockKind = "line" | "inline" | "else" | "text" | "visibility" | "attribut" | "variable" | "array" | "new" | "comment"
    | "constructor" | "accessors" | "method" | "class" | "if";

export type Block = {
    label: string;
    group: BlockGroup;
    /** Vorlage (siehe oben) bzw. fester Text bei „text“ */
    tpl: string;
    kind: BlockKind;
    tip: string;
    /** Schlüssel der großen Hilfe (BlockHelp.ts) */
    help?: string;
    /** steht in der eingeklappten Kategorie „Mehr…“ (Farbe bleibt die der eigenen Gruppe) */
    more?: boolean;
    /** Eingabestelle, die für § im Rumpf eingesetzt wird (Standard ${}) */
    bodyField?: string;
};

export const GROUP_NAMES: Record<BlockGroup, string> = {
    klasse: "Klassen",
    ablauf: "Ablauf",
    daten: "Daten",
};

export const BLOCKS: Block[] = [
    // ---------- Klassen ----------
    { group: "klasse", label: "Klasse", help: "b-class", kind: "class", tpl: "class ${Name} {\n\t§\n}",
        tip: "Neue Klasse: class Name { … }" },
    { group: "klasse", label: "Attribut", help: "b-attribut", kind: "attribut", tpl: "",
        tip: "Attribut anlegen: Datentyp und Name auswählen. Es landet an der Cursorstelle, wenn sie direkt im Klassenrumpf liegt, sonst unter den Attributen der obersten Klasse" },
    { group: "klasse", label: "Konstruktor", help: "b-konstruktor", kind: "constructor", tpl: "@KLASSE(${}) {\n\t§\n}",
        tip: "Konstruktor anlegen: leer (Standardkonstruktor) oder passend zu den Attributen – Auswahl im Dialog" },
    { group: "klasse", label: "Methode", help: "b-methode", kind: "method", tpl: "",
        tip: "Neue Methode: Name, Rückgabetyp (oder void) und Parameter im Dialog festlegen" },
    { group: "klasse", label: "{get,set}", help: "b-getset", kind: "accessors", tpl: "",
        tip: "Getter und Setter: Im Dialog wählst du für jedes Attribut, ob eine Methode get…() (gibt den Wert zurück), set…(…) (setzt den Wert) oder beide ergänzt werden" },
    { group: "klasse", label: "extends", help: "b-extends", more: true, kind: "line", tpl: "class ${Name} extends ${Oberklasse} {\n\t§\n}",
        tip: "Unterklasse: class Name extends Oberklasse { … }" },
    { group: "klasse", label: "super", help: "b-super", more: true, kind: "line", tpl: "super(${});",
        tip: "Konstruktor der Oberklasse aufrufen: super(…); – muss die erste Anweisung im Konstruktor sein" },
    { group: "klasse", label: "public?", help: "b-public", kind: "visibility", tpl: "public",
        tip: "Sichtbarkeit: 1× tippen setzt public, 2× tippen private, 3× tippen entfernt die Sichtbarkeit wieder. Steht in der Zeile schon eine, wird sie ersetzt" },
    { group: "klasse", label: "//", help: "b-kommentar", kind: "comment", tpl: "// ${Kommentar}",
        tip: "Kommentar: In einer leeren Zeile wird ein Kommentar begonnen. Steht Code in der Zeile (oder sind Zeilen markiert), wird er mit // auskommentiert; ist schon eine davon auskommentiert, werden alle wieder einkommentiert" },

    // ---------- Ablauf ----------
    { group: "ablauf", label: "if", help: "b-if", kind: "if", tpl: "if (${Bedingung}) {\n\t§\n}",
        tip: "Verzweigung: Im Dialog legst du die Bedingung fest und kannst beliebig viele else-if-Zweige und einen else-Zweig dazunehmen" },
    { group: "ablauf", label: "else if", help: "b-elseif", more: true, kind: "else", tpl: "else if (${Bedingung}) {\n\t§\n}",
        tip: "Weitere Bedingung nach einem if-Block: else if (Bedingung) { … }" },
    { group: "ablauf", label: "else", help: "b-else", more: true, kind: "else", tpl: "else {\n\t§\n}",
        tip: "Sonst-Teil nach einem if-Block: else { … }" },
    { group: "ablauf", label: "while", help: "b-while", kind: "line", tpl: "while (${Bedingung}) {\n\t§\n}",
        tip: "Wiederholung mit Bedingung: while (Bedingung) { … }" },
    { group: "ablauf", label: "for", help: "b-for", more: true, kind: "line", tpl: "for (Integer ${i} = 0; ${i} < ${10}; ${i}++) {\n\t§\n}",
        tip: "Zählschleife: for (Integer i = 0; i < 10; i++) { … }" },
    { group: "ablauf", label: "for-each", help: "b-foreach", more: true, kind: "line", tpl: "for (${String} ${element} : ${liste}) {\n\t§\n}",
        tip: "Jedes Element einer Liste oder eines Arrays durchlaufen: for (String element : liste) { … }" },
    { group: "ablauf", label: "do – while", help: "b-dowhile", more: true, kind: "line", tpl: "do {\n\t§\n} while (${Bedingung});",
        tip: "Wiederholung, die mindestens einmal läuft: do { … } while (Bedingung);" },
    { group: "ablauf", label: "return", help: "b-return", kind: "line", tpl: "return ${};",
        tip: "Methode beenden und Wert zurückgeben: return …;" },
    { group: "ablauf", label: "break", help: "b-break", more: true, kind: "text", tpl: "break;",
        tip: "Fügt an der Cursorstelle break; ein: verlässt die Schleife (oder den switch) sofort" },

    // ---------- Daten ----------
    { group: "daten", label: "Variable", help: "b-variable", kind: "variable", tpl: "",
        tip: "Variable anlegen: Datentyp und Name auswählen, sie wird an der Cursorstelle eingefügt" },
    { group: "daten", label: "println", help: "b-println", kind: "line", tpl: "println(${});",
        tip: "Ausgabe mit Zeilenumbruch: println(…);" },
    { group: "daten", label: "print", help: "b-print", kind: "line", tpl: "print(${});",
        tip: "Ausgabe ohne Zeilenumbruch: print(…);" },
    { group: "daten", label: "new", help: "b-new", kind: "new", tpl: "",
        tip: "Objekt erzeugen: Steht links vom = ein Datentyp (z. B. Auto a = ), wird new Auto() eingefügt; der Cursor steht in den Klammern für Parameter" },
    { group: "daten", label: "Array", help: "b-array", kind: "array", tpl: "",
        tip: "Array (Feld) anlegen: Datentyp und Name auswählen; Anzahl der Elemente festlegen; eingefügt wird z. B. Integer[] feld = new Integer[10];" },
    { group: "daten", label: "ArrayList", help: "b-arraylist", more: true, kind: "line", tpl: "ArrayList<${String}> ${liste} = new ArrayList<${String}>();",
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
    /** Konstruktoren eines Datentyps (Standardkonstruktor, wenn die Klasse keinen eigenen hat) */
    constructors: (type: string) => VarCtor[];
    /** Code der geöffneten Datei formatieren */
    format: () => Promise<void>;
    /** Neue Datei (Reiter) mit Inhalt anlegen und öffnen; Cursor an die Stelle cursor */
    createFile: (name: string, text: string, cursor: number) => void;
    /** Gibt es schon eine Datei mit diesem Namen (ohne .java)? */
    fileExists: (name: string) => boolean;
    /** Text des Konstruktors, den die Online-IDE an dieser Stelle vorschlägt („insert constructor“), sonst null */
    constructorSuggestion: (offset: number) => Promise<string | null>;
    /** Kurzer, dezenter Hinweis unten am Bildschirm */
    hint: (text: string) => void;
    /** Eingabefeld mit Code Completion für Stellen an der Cursorposition (Bedingungen im if-Dialog) */
    conditionField?: (host: HTMLElement, f: { placeholder: string, onChange: () => void, onEnter: () => void }) => FieldHandle;
};

/** Fügt den Baustein ein (bzw. umschließt die markierten Zeilen) und formatiert danach den Code. */
export async function insertBlock(ctx: BlockContext, block: Block) {
    const view = ctx.view;
    // Hatte der Editor beim Antippen den Fokus (Cursor gesetzt)? Wichtig für den Ort einer neuen Klasse
    const hadFocus = view.hasFocus;
    let done = true;
    switch (block.kind) {
        case "attribut":
        case "variable":
        case "array":
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
        case "visibility":
            cycleVisibility(ctx);
            break;
        case "if":
            done = await insertIf(ctx, block);
            break;
        case "constructor": {
            const choice = await ctx.dialogs.constructorChoice();
            if (!choice) { done = false; break; }
            await insertConstructor(ctx, block, choice);
            break;
        }
        case "accessors":
            done = await insertAccessors(ctx);
            break;
        case "method":
            done = await insertMethod(ctx);
            break;
        case "class":
            done = await insertClass(ctx, hadFocus);
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

    tpl = tpl.replace("§", block.bodyField ?? "${}");

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

// ---------------------------------------------------------------- public / private

/** Letztes Antippen von „public?“: schnell hintereinander in derselben Zeile zählt als 2× bzw. 3× tippen */
let visTap = { time: 0, line: -1, count: 0 };
const VIS_TAP_MS = 2000;

/** „public?“: 1× tippen public, 2× private, 3× Sichtbarkeit entfernen (danach wieder von vorn) */
function cycleVisibility(ctx: BlockContext) {
    const view = ctx.view;
    const lineNo = view.state.doc.lineAt(view.state.selection.main.head).number;
    const now = Date.now();
    const again = now - visTap.time < VIS_TAP_MS && visTap.line == lineNo;
    visTap = { time: now, line: lineNo, count: again ? visTap.count % 3 + 1 : 1 };
    if (visTap.count == 1) setVisibility(view, "public");
    else if (visTap.count == 2) setVisibility(view, "private");
    else removeVisibility(view);
    ctx.hint("2× tippen: private  ·  3× tippen: –");
}

/** Vorhandenes public/private/protected (samt Leerzeichen dahinter) aus der Cursorzeile entfernen */
function removeVisibility(view: EditorView) {
    const line = view.state.doc.lineAt(view.state.selection.main.head);
    const m = /\b(public|private|protected)\b[ \t]*/.exec(codeOnly(line.text));
    if (!m) return;
    const from = line.from + m.index;
    view.dispatch({ changes: { from, to: from + m[0].length, insert: "" }, userEvent: "delete" });
}

/** public/private: ein vorhandenes public/private/protected in der Zeile ersetzen, sonst an der Cursorstelle einfügen */
function setVisibility(view: EditorView, keyword: string) {
    const state = view.state;
    const line = state.doc.lineAt(state.selection.main.head);
    const code = codeOnly(line.text);
    const m = /\b(public|private|protected)\b/.exec(code);
    if (m) {
        if (m[1] != keyword) {
            const from = line.from + m.index;
            // Cursor wird mitverschoben (steht er hinter „public “, steht er danach hinter „private “)
            view.dispatch({ changes: { from, to: from + m[1].length, insert: keyword }, userEvent: "input" });
        }
        return;
    }
    // Steht in der Zeile schon Code, kommt der Modifikator vor die Anweisung, sonst an die Cursorstelle
    if (line.text.trim() != "") {
        const from = line.from + /^\s*/.exec(line.text)![0].length;
        view.dispatch({
            changes: { from, insert: keyword + " " },
            selection: EditorSelection.cursor(from + keyword.length + 1),
            userEvent: "input"
        });
        return;
    }
    insertText(view, keyword + " ");
}

// ---------------------------------------------------------------- class

/**
 * Neue Klasse: Name im Dialog. Mit Cursor im Editor an der Cursorstelle (eigene Zeile), sonst unter der
 * letzten Zeile mit Code (zwei Leerzeilen Abstand), in einer leeren Datei ganz oben.
 */
async function insertClass(ctx: BlockContext, hadFocus: boolean): Promise<boolean> {
    const result = await ctx.dialogs.className({
        validate: (n, where) => {
            const msg = validateName(n);
            if (msg) return msg;
            if (!/^[A-ZÄÖÜ]/.test(n.trim())) return "Klassennamen beginnen mit einem Großbuchstaben, z. B. Schaf.";
            if (where == "file" && ctx.fileExists(n.trim())) return `Es gibt schon eine Datei „${n.trim()}“.`;
            return null;
        }
    });
    if (!result) return false;
    const name = result.name;
    if (result.where == "file") {
        // Neue Datei (Reiter) mit dem Klassengerüst, Cursor im Klassenrumpf
        const indent = ctx.view.state.facet(indentUnit);
        const head = `class ${name} {\n${indent}`;
        ctx.createFile(name, head + "\n}\n", head.length);
        return true;
    }
    const view = ctx.view;
    const tpl = `class ${name} {\n\t\${}\n}`;
    let pos: number;
    if (hadFocus) {
        pos = prepareOwnLine(view);
    } else {
        const doc = view.state.doc;
        const text = doc.toString();
        if (text.trim() == "") {
            view.dispatch({ changes: { from: 0, to: doc.length, insert: "" } });
            pos = 0;
        } else {
            const end = text.replace(/\s+$/, "").length;
            const lineEnd = doc.lineAt(end).to;
            view.dispatch({ changes: { from: lineEnd, to: doc.length, insert: "\n\n\n" }, scrollIntoView: true });
            pos = lineEnd + 3;
        }
    }
    snippet(tpl)(view, null, pos, pos);
    return true;
}

// ---------------------------------------------------------------- Klassen im Text

type ClassInfo = { name: string, start: number, open: number, close: number };

/** Alle Klassen/Enums/Interfaces mit Rumpf: Position des Schlüsselworts, der öffnenden und der schließenden Klammer */
function classesIn(code: string): ClassInfo[] {
    const result: ClassInfo[] = [];
    const re = /\b(?:class|enum|interface)\s+([A-Za-z_À-ɏ][\wÀ-ɏ]*)[^{;]*\{/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(code))) {
        const open = m.index + m[0].length - 1;
        let d = 0, close = code.length;
        for (let i = open; i < code.length; i++) {
            if (code[i] == "{") d++;
            else if (code[i] == "}" && --d == 0) { close = i; break; }
        }
        result.push({ name: m[1], start: m.index, open, close });
    }
    return result;
}

/** Innerste Klasse, in deren Rumpf pos liegt */
function classAt(classes: ClassInfo[], pos: number): ClassInfo | null {
    let best: ClassInfo | null = null;
    for (const c of classes) if (c.open < pos && pos <= c.close && (!best || c.open > best.open)) best = c;
    return best;
}

/** Klammertiefe zwischen dem Rumpfanfang der Klasse und pos (0 = direkt im Klassenrumpf) */
function depthInClass(code: string, cls: ClassInfo, pos: number): number {
    let d = 0;
    for (let i = cls.open + 1; i < pos; i++) { if (code[i] == "{") d++; else if (code[i] == "}") d--; }
    return d;
}

const ATTR_RE = /^\s*(?:(?:private|public|protected|static|final)\s+)*([A-Za-z_][\w.]*(?:<[^;=(){}]*>)?(?:\s*\[\s*\])*)\s+([A-Za-z_]\w*)\s*(?:=[^;]*)?;\s*$/;

/** Attribute (Typ, Name) direkt im Rumpf der Klasse, mit dem Ende ihrer Zeile */
function attributesOf(code: string, cls: ClassInfo): { type: string, name: string, lineEnd: number }[] {
    const list: { type: string, name: string, lineEnd: number }[] = [];
    let d = 0, lineStart = cls.open + 1;
    for (let i = cls.open + 1; i <= cls.close; i++) {
        const ch = code[i];
        if (ch == "\n" || i == cls.close) {
            if (d == 0) {
                const m = ATTR_RE.exec(code.slice(lineStart, i));
                if (m && !/^(return|throw)$/.test(m[1])) list.push({ type: m[1].replace(/\s+/g, ""), name: m[2], lineEnd: i });
            }
            lineStart = i + 1;
        }
        if (ch == "{") d++;
        else if (ch == "}") d--;
    }
    return list;
}

/**
 * Leere, eingerückte Zeile für ein neues Klassenmitglied anlegen und den Cursor hineinsetzen:
 * Steht der Cursor direkt im Rumpf einer Klasse, an der Cursorstelle. Sonst in der Klasse um den
 * Cursor (bzw. der obersten Klasse der Datei): unter den Attributen („attributes“) oder am Ende („end“).
 * Liefert die Klasse, in der die Zeile liegt (null, wenn die Datei keine Klasse hat).
 */
function prepareMemberLine(view: EditorView, where: "attributes" | "end"): ClassInfo | null {
    const state = view.state;
    const code = codeOnly(state.doc.toString());
    const head = state.selection.main.head;
    const classes = classesIn(code);
    const here = classAt(classes, head);
    if (classes.length == 0) { prepareOwnLine(view); return null; }
    if (here && depthInClass(code, here, head) == 0) { prepareOwnLine(view); return here; }
    const target = here ?? classes[0];
    const classLine = state.doc.lineAt(target.start);
    const indent = /^\s*/.exec(classLine.text)![0] + state.facet(indentUnit);

    // Leerzeile vor dem neuen Mitglied, außer direkt nach „{“ oder einer Leerzeile
    const gap = (lineEnd: number) => {
        const t = state.doc.lineAt(lineEnd).text.trim();
        return t == "" || t.endsWith("{") ? "" : "\n";
    };

    if (where == "attributes") {
        const attrs = attributesOf(code, target);
        const after = attrs.length ? attrs[attrs.length - 1].lineEnd : state.doc.lineAt(target.open).to;
        const insert = (attrs.length ? "\n" : "") + "\n" + indent;
        view.dispatch({ changes: { from: after, insert }, selection: EditorSelection.cursor(after + insert.length), scrollIntoView: true });
        return target;
    }
    const closeLine = state.doc.lineAt(target.close);
    if (state.sliceDoc(closeLine.from, target.close).trim() == "") {
        const insert = (closeLine.number > 1 ? gap(closeLine.from - 1) : "") + indent + "\n";
        view.dispatch({ changes: { from: closeLine.from, insert }, selection: EditorSelection.cursor(closeLine.from + insert.length - 1), scrollIntoView: true });
    } else {
        const insert = "\n" + indent + "\n" + /^\s*/.exec(classLine.text)![0];
        view.dispatch({ changes: { from: target.close, insert }, selection: EditorSelection.cursor(target.close + 1 + indent.length), scrollIntoView: true });
    }
    return target;
}

/**
 * Methode/Konstruktor: Die (leere) Cursorzeile bekommt eine Leerzeile Abstand zum Code darüber,
 * sofern die Zeile darüber nicht schon leer ist.
 */
function blankLineAbove(view: EditorView) {
    const state = view.state;
    const line = state.doc.lineAt(state.selection.main.head);
    if (line.number <= 1 || line.text.trim() != "") return;
    const prev = state.doc.line(line.number - 1);
    if (prev.text.trim() == "") return;
    view.dispatch({ changes: { from: line.from, insert: "\n" }, selection: EditorSelection.cursor(state.selection.main.head + 1), scrollIntoView: true });
}

/** Mehrzeiligen Code an der (leeren) Cursorzeile einsetzen, eingerückt nach Klammertiefe; Cursor ans Ende von cursorLine */
function insertLines(view: EditorView, lines: string[], cursorLine = -1) {
    const state = view.state;
    const line = state.doc.lineAt(state.selection.main.head);
    const base = /^\s*/.exec(line.text)![0];
    const unit = state.facet(indentUnit);
    let depth = 0;
    const out = lines.map((raw, i) => {
        const t = raw.trim();
        if (t.startsWith("}")) depth = Math.max(0, depth - 1);
        const l = t == "" && i != cursorLine ? "" : base + unit.repeat(depth) + t;
        if (t.endsWith("{")) depth++;
        return l;
    });
    const text = out.join("\n");
    const cursor = cursorLine >= 0 ? out.slice(0, cursorLine + 1).join("\n").length : -1;
    view.dispatch({
        changes: { from: line.from, to: line.to, insert: text },
        selection: EditorSelection.cursor(line.from + (cursor >= 0 ? cursor : text.length)),
        scrollIntoView: true, userEvent: "input"
    });
}

// ---------------------------------------------------------------- Konstruktor

/** Snippet-Text der Online-IDE (Monaco-Schreibweise) in normalen Text umwandeln */
function monacoSnippetToText(s: string): string {
    let out = "", open = 0;
    for (let i = 0; i < s.length; i++) {
        const m = /^\$\{\d+:/.exec(s.slice(i, i + 8));
        if (m) { open++; i += m[0].length - 1; continue; }
        if (s[i] == "}" && open > 0) { open--; continue; }
        if (s[i] == "$" && /\d/.test(s[i + 1] ?? "")) { i++; continue; }
        out += s[i];
    }
    return out;
}

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * Konstruktor zu den Attributen: Die Online-IDE schlägt ihn vor („insert constructor“), sobald der Code
 * übersetzt ist und es noch keinen Konstruktor gibt. Sonst (oder wenn die Klasse schon einen hat)
 * ein leerer Konstruktor mit Platzhalter für Parameter.
 */
async function insertConstructor(ctx: BlockContext, block: Block, mode: "empty" | "attrs") {
    const view = ctx.view;
    const cls = prepareMemberLine(view, "attributes");
    blankLineAbove(view);
    const name = cls?.name ?? enclosingClassName(view.state.doc.toString(), view.state.selection.main.head);
    if (mode == "empty") {
        // Leerer Konstruktor (Standardkonstruktor), Cursor im Rumpf
        const pos = view.state.selection.main.head;
        snippet(`${name ?? "${Klassenname}"}() {\n\t\${}\n}`)(view, null, pos, pos);
        return;
    }
    const fallback = () => {
        const pos = view.state.selection.main.head;
        snippet(block.tpl.replace("§", "${}").replace("@KLASSE", name ?? "${Klassenname}"))(view, null, pos, pos);
    };
    if (!cls || !name) { fallback(); return; }

    // Gibt es schon einen Konstruktor? Dann bietet die Online-IDE keinen an
    const code = codeOnly(view.state.doc.toString());
    const now = classesIn(code).find(c => c.name == name);
    if (now && new RegExp(String.raw`(^|[\s;{}])(public\s+|private\s+|protected\s+)?` + name + String.raw`\s*\(`).test(code.slice(now.open + 1, now.close))) {
        fallback(); return;
    }

    // Der Vorschlag braucht den übersetzten Stand: einige Male kurz warten und erneut fragen
    let text: string | null = null;
    const docBefore = view.state.doc.toString();
    for (let i = 0; i < 10 && !text; i++) {
        await wait(i == 0 ? 50 : 250);
        if (view.state.doc.toString() != docBefore) return;      // inzwischen weitergetippt
        text = await ctx.constructorSuggestion(view.state.selection.main.head);
    }
    if (!text) { fallback(); return; }
    const lines = monacoSnippetToText(text).split("\n").filter((l, i, a) => l.trim() != "" || (i > 0 && i < a.length - 1));
    // Cursor in die letzte Zeile vor der schließenden Klammer (dort kann man weiterschreiben)
    insertLines(view, lines, Math.max(0, lines.length - 2));
}

// ---------------------------------------------------------------- Getter / Setter

const cap = (s: string) => s.charAt(0).toLocaleUpperCase() + s.slice(1);

async function insertAccessors(ctx: BlockContext): Promise<boolean> {
    const view = ctx.view;
    const code = codeOnly(view.state.doc.toString());
    const classes = classesIn(code);
    const cls = classAt(classes, view.state.selection.main.head) ?? classes[0];
    const title = "Getter und Setter";
    if (!cls) {
        await ctx.dialogs.alert({ title, text: "In dieser Datei gibt es noch keine Klasse." });
        return false;
    }
    const attrs = attributesOf(code, cls);
    if (attrs.length == 0) {
        await ctx.dialogs.alert({ title, text: `Die Klasse ${cls.name} hat noch keine Attribute.` });
        return false;
    }
    const body = code.slice(cls.open + 1, cls.close);
    const has = (prefix: string, name: string) => new RegExp(String.raw`\b` + prefix + cap(name) + String.raw`\s*\(`).test(body);
    const chosen = await ctx.dialogs.accessors({
        title,
        className: cls.name,
        rows: attrs.map(a => ({ name: a.name, label: `${a.type} ${a.name}`, hasGet: has("get", a.name), hasSet: has("set", a.name) })),
    });
    if (!chosen) return false;

    // Cursor ans Ende der Klasse (bzw. an die Cursorstelle im Klassenrumpf)
    view.dispatch({ selection: EditorSelection.cursor(view.state.selection.main.head) });
    prepareMemberLine(view, "end");
    const lines: string[] = [];
    for (const a of attrs) {
        const c = chosen.find(x => x.name == a.name);
        if (!c) continue;
        if (c.get) {
            if (lines.length) lines.push("");
            lines.push(`public ${a.type} get${cap(a.name)}() {`, `return ${a.name};`, "}");
        }
        if (c.set) {
            if (lines.length) lines.push("");
            lines.push(`public void set${cap(a.name)}(${a.type} ${a.name}) {`, `this.${a.name} = ${a.name};`, "}");
        }
    }
    insertLines(view, lines);
    return true;
}

// ---------------------------------------------------------------- if

export type IfResult = { cond: string, elseIfs: string[], hasElse: boolean };

/**
 * Code der Verzweigung. Vorschau: leere Bedingungen als „…“; snippetMode: Eingabestellen zum
 * Weiterspringen (nummeriert, damit gleich benannte Bedingungen nicht gemeinsam bearbeitet werden).
 */
function ifText(r: IfResult, snippetMode: boolean): string {
    let n = 1;
    const cond = (c: string) => c.trim() != "" ? (snippetMode ? escapeForSnippet(c.trim()) : c.trim())
        : (snippetMode ? "${" + (n++) + ":Bedingung}" : "…");
    const body = () => snippetMode ? "${" + (n++) + "}" : "…";
    let t = `if (${cond(r.cond)}) {\n\t${snippetMode ? "§" : body()}\n}`;
    if (snippetMode) n++;     // Nummer für den Rumpf des if (siehe bodyField)
    for (const c of r.elseIfs) t += ` else if (${cond(c)}) {\n\t${body()}\n}`;
    if (r.hasElse) t += ` else {\n\t${body()}\n}`;
    return t;
}

async function insertIf(ctx: BlockContext, block: Block): Promise<boolean> {
    const r = await ctx.dialogs.ifStatement({
        build: (x) => ifText(x, false).replace(/\t/g, "   "),
        field: ctx.conditionField,
    });
    if (!r) return false;
    // Nummer der Eingabestelle im if-Rumpf: direkt nach der Bedingung (1, bzw. 1 bei fester Bedingung + 1)
    const condIsField = r.cond.trim() == "";
    insertTemplate(ctx.view, { ...block, kind: "line", tpl: ifText(r, true), bodyField: "${" + (condIsField ? 2 : 1) + "}" });
    return true;
}

// ---------------------------------------------------------------- Methode

async function insertMethod(ctx: BlockContext): Promise<boolean> {
    const own = ctx.projectTypes().filter(t => !BASIC_TYPES.includes(t));
    const groups = [
        { label: "Grundtypen", items: BASIC_TYPES },
        { label: "Eigene Klassen", items: own },
        { label: "Klassenbibliothek", items: libraryTypes().filter(t => !own.includes(t)) },
    ];
    const r = await ctx.dialogs.method({ groups, validate: validateName });
    if (!r) return false;
    const view = ctx.view;
    prepareMemberLine(view, "end");
    blankLineAbove(view);
    const params = r.params.map(p => `${p.type} ${p.name}`).join(", ");
    const tpl = r.returnType == "void"
        ? `void ${r.name}(${escapeForSnippet(params)}) {\n\t\${}\n}`
        : `${r.returnType} ${r.name}(${escapeForSnippet(params)}) {\n\t\${}\n\treturn \${Wert};\n}`;
    const pos = view.state.selection.main.head;
    snippet(tpl)(view, null, pos, pos);
    return true;
}

function validateName(name: string): string | null {
    const n = name.trim();
    if (n == "") return "Bitte eintragen, wie es heißen soll.";
    if (!/^[A-Za-z_ÄÖÜäöüß][\wÄÖÜäöüß]*$/.test(n)) return "Erlaubt sind Buchstaben, Ziffern und _; am Anfang darf keine Ziffer stehen.";
    if (JAVA_KEYWORDS.has(n)) return `„${n}“ ist ein Schlüsselwort von Java und darf hier nicht stehen.`;
    return null;
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
    // Steht in der Zeile eine fertige Deklaration mit Semikolon („Hund bello;“), das Semikolon
    // entfernen und den Cursor ans Ende setzen – dann geht es wie gewohnt weiter („= new Hund();“)
    {
        const st = view.state, ln = st.doc.lineAt(st.selection.main.head);
        const m = /^(\s*(?:final\s+)?[A-Za-z_ÄÖÜäöü][\w.ÄÖÜäöüß]*(?:<[^=()]*>)?(?:\s*\[\s*\])*\s+[A-Za-z_ÄÖÜäöü][\wÄÖÜäöüß]*)\s*;\s*$/.exec(ln.text);
        if (m && !/^\s*(return|throw|new|else|case|break|continue)\b/.test(ln.text)) {
            const end = ln.from + m[1].length;
            view.dispatch({ changes: { from: end, to: ln.to, insert: "" }, selection: EditorSelection.cursor(end) });
        }
    }
    const state = view.state, sel = state.selection.main;
    const line = state.doc.lineAt(sel.from);
    let before = state.sliceDoc(line.from, sel.from);
    const after = state.sliceDoc(sel.to, line.to);

    // Steht links vom Cursor nur eine Deklaration oder ein Name ohne „=“ (Auto a | oder a |), zuerst „= “ ergänzen
    let eq = "";
    if (!before.includes("=") && !/^\s*(return|throw|new|else|case)\b/.test(before) && /^\s*(?:(?:final\s+)?[A-Za-z_][\w.]*(?:<[^=()]*>)?(?:\s*\[\s*\])*\s+)?(?:this\.)?[A-Za-z_]\w*(?:\s*\[[^\]]*\])?\s*$/.test(before)) {
        eq = (/\s$/.test(before) ? "" : " ") + "= ";
        before += eq;
    }

    let type: string | null = null;
    const decl = /(?:^|[\s(,;{])(?:final\s+)?([A-Za-z_][\w.]*(?:<[^=]*>)?(?:\s*\[\s*\])*)\s+[A-Za-z_]\w*\s*=\s*$/.exec(before);
    if (decl && !/^(return|new|else)$/.test(decl[1])) type = decl[1];
    else {
        const assign = /(?:this\.)?([A-Za-z_]\w*)(?:\s*\[[^\]]*\])?\s*=\s*$/.exec(before);
        if (assign) type = declaredType(state.doc.toString(), assign[1]);
        // Element eines Arrays: feld[i] = new … → Elementtyp
        if (type && /\]\s*=\s*$/.test(before)) type = type.replace(/\s*\[\s*\]\s*$/, "");
    }

    const space = eq + (before != "" && !/\s$/.test(before) ? " " : "");
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

/** Wert für die Vorschau/den Code: Text bekommt Anführungszeichen, 12,5 wird zu 12.5 */
function formatValue(type: string, v: string): string {
    const t = v.trim();
    if (type == "String" && !t.startsWith('"')) return '"' + t.replace(/"/g, '\\"') + '"';
    if (type == "Character" && t.length == 1) return "'" + t + "'";
    if (type == "Double" && /^-?\d+,\d+$/.test(t)) return t.replace(",", ".");
    return t;
}

/** Anweisung des Variablen-Bausteins; snippetMode: Parameter des Konstruktors als Platzhalter */
function variableText(r: VariableResult, snippetMode: boolean): string {
    const esc = (s: string) => snippetMode ? escapeForSnippet(s) : s;
    const name = r.name || "…";
    if (r.array) return esc(r.declOnly ? `${r.type}[] ${name};` : `${r.type}[] ${name} = new ${r.type}[${r.count ?? "…"}];`);
    if (r.value !== undefined) {
        const v = r.value.trim();
        return esc(v == "" ? `${r.type} ${name};` : `${r.type} ${name} = ${formatValue(r.type, v)};`);
    }
    if (r.declOnly || !r.ctor) return esc(`${r.type} ${name};`);
    const args = r.ctor.params.map(p => snippetMode ? "${" + p.name + "}" : p.name).join(", ");
    return esc(`${r.type} ${name} = new ${r.type}(`) + args + esc(");");
}

async function insertVariable(ctx: BlockContext): Promise<boolean> {
    const own = ctx.projectTypes().filter(t => !BASIC_TYPES.includes(t));
    const lib = libraryTypes().filter(t => !own.includes(t));
    const r = await ctx.dialogs.variable({
        groups: [
            { label: "Grundtypen", items: BASIC_TYPES },
            { label: "Eigene Klassen", items: own },
            { label: "Klassenbibliothek", items: lib },
        ],
        basicTypes: BASIC_TYPES.concat(["Character"]),
        constructors: (t) => ctx.constructors(t),
        build: (x) => variableText(x, false),
        validate: validateName
    });
    if (!r) return false;
    const view = ctx.view;
    const pos = prepareOwnLine(view);
    const tpl = variableText(r, true);
    if (/\$\{/.test(tpl)) {
        snippet(tpl)(view, null, pos, pos);
    } else {
        const text = variableText(r, false);
        view.dispatch({ changes: { from: pos, to: pos, insert: text }, selection: EditorSelection.cursor(pos + text.length), scrollIntoView: true, userEvent: "input" });
    }
    return true;
}

async function insertDeclaration(ctx: BlockContext, kind: "attribut" | "variable" | "array"): Promise<boolean> {
    if (kind == "variable") return insertVariable(ctx);
    const own = ctx.projectTypes().filter(t => !BASIC_TYPES.includes(t));
    const lib = libraryTypes().filter(t => !own.includes(t));
    const result = await ctx.dialogs.declaration({
        title: kind == "attribut" ? "Attribut anlegen" : kind == "array" ? "Array anlegen" : "Variable anlegen",
        groups: [
            { label: "Grundtypen", items: BASIC_TYPES },
            { label: "Eigene Klassen", items: own },
            { label: "Klassenbibliothek", items: lib },
        ],
        // Safari am iPad schlägt bei Feldern mit „Name“ im Text eigene Kontaktdaten vor (zerschießt das Layout)
        nameLabel: kind == "attribut" ? "So soll Dein Attribut heißen:" : kind == "array" ? "So soll Dein Array heißen:" : "So soll Deine Variable heißen:",
        countLabel: kind == "array" ? "Wie viele Elemente sollen Platz haben?" : undefined,
        arrayOption: kind != "array",
        build: (r) => {
            const name = r.name || "…";
            return (kind == "array" || r.array) ? `${r.type}[] ${name} = new ${r.type}[${r.count ?? "…"}];` : `${r.type} ${name};`;
        },
        confirm: "Einfügen",
        validate: validateName
    });
    if (!result) return false;
    if (kind == "array" || result.array) {
        // Integer[] feld = new Integer[10];
        const text = `${result.type}[] ${result.name.trim()} = new ${result.type}[${result.count ?? 10}];`;
        if (kind == "attribut") { insertAttribute(ctx.view, text); return true; }
        const pos = prepareOwnLine(ctx.view);
        ctx.view.dispatch({
            changes: { from: pos, to: pos, insert: text },
            selection: EditorSelection.cursor(pos + text.length),
            scrollIntoView: true, userEvent: "input"
        });
        return true;
    }
    insertAttribute(ctx.view, `${result.type} ${result.name.trim()};`);
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

/**
 * Farbgebung der Bausteine: "solid" = Füllung in der Gruppenfarbe, Schrift/Rand hell getönt;
 * "tint" = die frühere Variante (helle Füllung, Schrift/Rand in der Gruppenfarbe).
 */
export const BLOCK_COLORS: "solid" | "tint" = "tint";
document.documentElement.dataset.blockColors = BLOCK_COLORS;

/**
 * Form der Bausteine: "classic" = Stand vom 21.10.2026 mittags (helle Füllung, farbiger Rand links, eckig);
 * "segment" = wie die Umschalter Ausgabe/Variablen/Diagramm, Schrift in der Farbe der Kategorie (siehe jpad.css).
 */
export const BLOCK_STYLE: "classic" | "segment" = "segment";
document.documentElement.dataset.blockStyle = BLOCK_STYLE;

/** Hinweistext beim langen Drücken auf einen Baustein */
export function blockTip(b: Block): string {
    if (b.tpl.includes("§")) return b.tip + ". Markierte Zeilen umschließt der Baustein. Tab oder Enter springt zum nächsten Platzhalter.";
    if (b.tpl.includes("${")) return b.tip + ". Tab oder Enter springt zum nächsten Platzhalter.";
    return b.tip;
}

/**
 * Kurzzeichen der Bausteine für die kompakte Ansicht (Kopfzeilen zugeklappt): Dann zeigt die senkrechte
 * Bausteinleiste statt der Namen nur diese Zeichen und wird deutlich schmaler.
 * svg: Strich-Symbol (24 × 24), sonst kurzer Text in Code-Schrift.
 */
const ICON = (p: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
const BLOCK_ICONS: Record<string, { svg?: string, text?: string }> = {
    "Klasse": { svg: ICON('<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 9.5h16"/>') },
    "Attribut": { svg: ICON('<rect x="4" y="4" width="16" height="16" rx="2" stroke-opacity=".4"/><path d="M4 9.5h16" stroke-opacity=".4"/><path d="M7.5 14.5h9" stroke-width="3"/>') },
    "Konstruktor": { svg: ICON('<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M12 8.5v7M8.5 12h7" stroke-width="2.5"/>') },
    "Methode": { text: "m()" },
    "{get,set}": { text: "g/s" },
    "public?": { text: "±" },
    "//": { text: "//" },
    "extends": { svg: ICON('<path d="M12 21V10"/><path d="M6 10l6-6 6 6z"/>') },
    "super": { text: "sup" },
    "if": { text: "if" },
    "else if": { text: "↳if" },
    "else": { text: "↳" },
    "while": { svg: ICON('<path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v5h-5"/>') },
    "for": { text: "for" },
    "for-each": { text: "for:" },
    "do – while": { text: "do" },
    "return": { svg: ICON('<path d="M10 4H5v16h5"/><path d="M8 12h11"/><path d="M15 8l4 4-4 4"/>') },
    "break": { text: "brk" },
    "Variable": { text: "x=" },
    "println": { text: "›↵" },
    "print": { text: "›_" },
    "new": { text: "new" },
    "Array": { text: "[ ]" },
    "ArrayList": { text: "[…]" },
};

/** Aufgeklappte Bausteinleiste: Text rechts neben dem Kurzzeichen, wo der Name nur das Kurzzeichen wiederholen würde */
const PANEL_ALT_LABEL: Record<string, string> = { "//": "Kommentar", "if": "…", "new": "…", "for": "…" };

function chipHtml(b: Block, i: number): string {
    const ic = BLOCK_ICONS[b.label];
    // Das Kurzzeichen als Text steht in data-ico (per CSS angezeigt), damit der Text des Knopfs der Name bleibt
    const ico = !ic ? "" : ic.svg ? `<span class="jp-block-ico" aria-hidden="true">${ic.svg}</span>`
        : `<span class="jp-block-ico" aria-hidden="true" data-ico="${ic.text!.replace(/"/g, "&quot;")}"></span>`;
    return `<button class="jp-block" data-block="${i}" data-group="${b.group}"${b.help ? ` data-help="${b.help}"` : ""} aria-label="${b.label.replace(/"/g, "&quot;")}" data-tip="${blockTip(b).replace(/"/g, "&quot;")}">${ico}<span class="jp-block-label"${PANEL_ALT_LABEL[b.label] ? ` data-alt="${PANEL_ALT_LABEL[b.label]}"` : ""}>${b.label.replace(/</g, "&lt;")}</span></button>`;
}

/** Senkrechte Bausteinleiste (linke Spalte im Querformat), nach Gruppen geordnet; ganz unten „Mehr…“ (eingeklappt) */
export function blockPanelHtml(): string {
    const groups = Object.keys(GROUP_NAMES) as BlockGroup[];
    const items = (pred: (b: Block) => boolean) => BLOCKS.map((b, i) => pred(b) ? chipHtml(b, i) : "").join("");
    return groups.map(g => `
        <section class="jp-blockgroup" data-group="${g}">
            <h3>${GROUP_NAMES[g]}</h3>
            <div class="jp-blockgroup-items">${items(b => b.group == g && !b.more)}</div>
        </section>`).join("") + `
        <section class="jp-blockgroup jp-blockgroup-more" data-open="${moreOpen()}">
            <button class="jp-more-toggle" type="button" aria-expanded="${moreOpen()}" data-tip="Weitere Bausteine ein- oder ausklappen">
                <span class="jp-more-chevron" aria-hidden="true">›</span><span class="jp-more-label">Mehr…</span>
            </button>
            <div class="jp-blockgroup-items">${items(b => !!b.more)}</div>
        </section>`;
}

function moreOpen(): boolean {
    try { return localStorage.getItem("jpadblox.moreBlocks") == "1"; } catch (e) { return false; }
}

/** Waagrechte Bausteinreihe für die Hilfsleiste (Hochformat und Handy) */
export function blockRowHtml(): string {
    let html = "", group: BlockGroup | null = null;
    BLOCKS.forEach((b, i) => {
        if (b.more) return;
        if (b.group != group) {
            group = b.group;
            html += `<span class="jp-block-group" data-group="${group}" aria-hidden="true">${GROUP_NAMES[group]}</span>`;
        }
        html += chipHtml(b, i);
    });
    html += `<span class="jp-block-group jp-block-group-more" aria-hidden="true">Mehr</span>`;
    BLOCKS.forEach((b, i) => { if (b.more) html += chipHtml(b, i); });
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
        const toggle = (<HTMLElement>e.target).closest<HTMLElement>(".jp-more-toggle");
        if (toggle) {
            const sec = toggle.parentElement!;
            const open = sec.dataset.open != "true";
            sec.dataset.open = String(open);
            toggle.setAttribute("aria-expanded", String(open));
            try { localStorage.setItem("jpadblox.moreBlocks", open ? "1" : "0"); } catch (err) { }
            if (open) setTimeout(() => sec.scrollIntoView({ block: "nearest", behavior: "smooth" }), 50);
            return;
        }
        const b = (<HTMLElement>e.target).closest<HTMLElement>("button[data-block]");
        if (b) run(b);
    });
}
