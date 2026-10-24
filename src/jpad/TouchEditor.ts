import * as monaco from 'monaco-editor';
import { EditorState, Extension, StateEffect, StateField, Compartment, Transaction, EditorSelection, Prec, ChangeDesc, countColumn, findColumn } from "@codemirror/state";
import {
    EditorView, keymap, lineNumbers, highlightActiveLineGutter, Decoration, DecorationSet,
    highlightSpecialChars, dropCursor, gutter, GutterMarker, layer, RectangleMarker
} from "@codemirror/view";
import { RangeSet } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap, indentWithTab, undo, redo, undoDepth, redoDepth, toggleComment, insertBlankLine, deleteLine, insertNewlineAndIndent } from "@codemirror/commands";
import { java } from "@codemirror/lang-java";
import { syntaxHighlighting, HighlightStyle, indentOnInput, bracketMatching, indentUnit, getIndentation, indentString } from "@codemirror/language";
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap, startCompletion, acceptCompletion, completionStatus, hasNextSnippetField, nextSnippetField, clearSnippet } from "@codemirror/autocomplete";
import { lintGutter, setDiagnostics, Diagnostic } from "@codemirror/lint";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { tags as t } from "@lezer/highlight";
import { GUIFile } from "../client/workspace/File.js";
import { LanguageBridge } from "./LanguageBridge.js";

/**
 * Der sichtbare Editor von JPad (CodeMirror 6).
 *
 * CodeMirror verwendet ein natives contenteditable-Element. Dadurch funktionieren auf
 * iPad und Handy die systemeigene Textauswahl (Griffe, Lupe), Diktat, Autokorrektur-Leiste
 * und Hardware-Tastaturen so, wie die Schüler es von anderen Apps gewohnt sind.
 *
 * Jede Datei hat ihren eigenen EditorState (eigene Rückgängig-Historie). Änderungen werden
 * sofort in das Monaco-Modell der Datei übertragen, auf dem Compiler und Sprachdienste arbeiten.
 */

/**
 * iPhone/iPad mit Bildschirmtastatur: Ein Doppeltipp auf ein Wort liefert von Safari manchmal
 * eine Auswahl vom Textanfang (Position 0) bis zum Wort. Kommt so eine Auswahl direkt nach zwei
 * schnellen Fingertipps an, ersetzen wir sie durch das angetippte Wort. Echte Auswahlen
 * (Griffe ziehen, „Alles auswählen“) sind davon nicht betroffen.
 */
/** Diagnose-Ausgabe (nur aktiv mit ?debug, siehe DebugLog.ts) */
const dbg = (msg: string) => { (window as any).__jpadDbg?.(msg); };

function iosDoubleTapFix(): Extension {
    /*
     * Hintergrund (per Diagnose auf dem iPad im Querformat ermittelt): Safari zeigt die Seite dort
     * verkleinert an (z. B. 85 %) und setzt den Cursor beim Antippen dann oft in eine ganz andere
     * Zeile (meist ans Textende). Ein Doppeltipp erweitert die Auswahl anschließend von dort bis zum
     * Wort; den zweiten Tipp meldet Safari dabei gar nicht. CodeMirror selbst rechnet die
     * Fingerposition richtig um – daran richten wir Cursor und Wortauswahl aus.
     */
    let start: { x: number, y: number } | null = null;
    let moved = false;
    let lastTap: { time: number, pos: number, word: { from: number, to: number } | null } | null = null;

    const onTapEnd = (e: TouchEvent, view: EditorView): boolean => {
        if (e.touches.length != 0 || e.changedTouches.length != 1 || moved) { lastTap = null; return false; }
        const t = e.changedTouches[0];
        const pos = view.posAtCoords({ x: t.clientX, y: t.clientY });
        if (pos == null) { lastTap = null; return false; }
        const word = view.state.wordAt(pos);
        lastTap = { time: Date.now(), pos, word: word ? { from: word.from, to: word.to } : null };
        dbg(`Tipp bei pos ${pos}${word ? ` (Wort ${word.from}-${word.to} „${view.state.sliceDoc(word.from, word.to)}“)` : ""}`);
        // Ragt die sichtbare Auswahl kurz danach aus dem Editor heraus, auf das Wort zurücksetzen.
        const tap = lastTap;
        const repair = () => {
            if (lastTap != tap || !tap.word) return;
            const ds = document.getSelection();
            if (!ds || ds.rangeCount == 0 || !view.hasFocus || ds.isCollapsed) return;
            const inside = view.contentDOM.contains(ds.anchorNode) && view.contentDOM.contains(ds.focusNode);
            if (inside) return;
            const w = tap.word;
            const a = view.domAtPos(w.from), b = view.domAtPos(w.to);
            dbg("sichtbare Auswahl lag außerhalb → auf Wort gesetzt");
            ds.setBaseAndExtent(a.node, a.offset, b.node, b.offset);
            const sel = view.state.selection.main;
            if (sel.from != w.from || sel.to != w.to) view.dispatch({ selection: EditorSelection.range(w.from, w.to), userEvent: "select.pointer" });
        };
        setTimeout(repair, 400);
        setTimeout(repair, 900);
        return false;
    };

    return [
        EditorView.domEventHandlers({
            touchstart: (e) => {
                const t = e.touches[0];
                start = t ? { x: t.clientX, y: t.clientY } : null;
                moved = e.touches.length != 1;
                return false;
            },
            touchmove: (e) => {
                const t = e.touches[0];
                if (start && t && Math.hypot(t.clientX - start.x, t.clientY - start.y) > 10) moved = true;
                return false;
            },
            // iOS meldet einen Tipp teils als touchcancel
            touchend: onTapEnd,
            touchcancel: onTapEnd
        }),
        EditorState.transactionFilter.of(tr => {
            if (!lastTap || !tr.selection || tr.docChanged || !tr.isUserEvent("select")) return tr;
            const age = Date.now() - lastTap.time;
            if (age > 1000) { lastTap = null; return tr; }
            if (tr.selection.ranges.length != 1) return tr;
            const sel = tr.selection.main, doc = tr.newDoc;
            if (sel.empty) {
                // Cursor in einer anderen Zeile als der Finger? Dann an die getippte Stelle.
                if (age > 500 || lastTap.pos > doc.length) return tr;
                if (doc.lineAt(sel.head).number == doc.lineAt(lastTap.pos).number) return tr;
                dbg(`Cursor ${sel.head} → getippte Stelle ${lastTap.pos} korrigiert`);
                return [tr, { selection: EditorSelection.cursor(lastTap.pos), userEvent: "select.pointer", sequential: true }];
            }
            const w = lastTap.word;
            if (!w || w.to > doc.length) return tr;
            if (sel.from == w.from && sel.to == w.to) return tr;
            // Dreifachtipp (ganze Zeile) zulassen
            const line = doc.lineAt(w.from);
            if (sel.from == line.from && (sel.to == line.to || sel.to == line.to + 1)) return tr;
            // Nur eingreifen, wenn die Auswahl bis an das angetippte Wort reicht oder es enthält
            if (sel.to < w.from || sel.from > w.to) return tr;
            dbg(`Auswahl ${sel.from}-${sel.to} → Wort ${w.from}-${w.to} ersetzt`);
            return [tr, { selection: EditorSelection.range(w.from, w.to), userEvent: "select.pointer", sequential: true }];
        })
    ];
}

/**
 * Hervorhebung der Cursorzeile als eigene Ebene hinter dem Text.
 *
 * CodeMirrors highlightActiveLine() setzt die Klasse „cm-activeLine“ direkt an den Zeilen im
 * bearbeitbaren Bereich. Auf iPhone/iPad passiert das beim ersten Tipp eines Doppeltipps – Safari
 * verliert dadurch den Ankerpunkt der Wortauswahl und markiert alles vom Textanfang bis zum Wort
 * (außer in der Zeile, in der der Cursor schon stand). Diese Ebene liegt außerhalb des
 * contenteditable-Elements und verändert die Zeilen nicht.
 */
const activeLineLayer = layer({
    above: false,
    class: "jp-activeline-layer",
    update: (update) => update.selectionSet || update.docChanged || update.viewportChanged || update.geometryChanged || update.focusChanged,
    markers: (view) => {
        const sel = view.state.selection.main;
        if (!sel.empty) return [];
        const block = view.lineBlockAt(sel.head);
        // Bezugspunkt wie bei CodeMirrors eigenen Ebenen: linke obere Ecke des Scrollbereichs
        const scroller = view.scrollDOM.getBoundingClientRect();
        const content = view.contentDOM.getBoundingClientRect();
        const baseLeft = scroller.left - view.scrollDOM.scrollLeft * view.scaleX;
        const baseTop = scroller.top - view.scrollDOM.scrollTop * view.scaleY;
        const top = (view.documentTop + block.top * view.scaleY - baseTop) / view.scaleY;
        const left = (content.left - baseLeft) / view.scaleX;
        return [new RectangleMarker("jp-activeline", left, top, content.width / view.scaleX, block.height)];
    }
});

export const javaHighlight = HighlightStyle.define([
    { tag: [t.keyword, t.modifier, t.controlKeyword, t.operatorKeyword, t.definitionKeyword, t.moduleKeyword], color: "var(--syn-keyword)", fontWeight: "600" },
    { tag: [t.typeName, t.className, t.namespace], color: "var(--syn-type)" },
    { tag: [t.string, t.special(t.string), t.character], color: "var(--syn-string)" },
    { tag: [t.number, t.bool, t.null], color: "var(--syn-number)" },
    { tag: [t.lineComment, t.blockComment, t.docComment, t.comment], color: "var(--syn-comment)", fontStyle: "italic" },
    { tag: [t.function(t.variableName), t.function(t.propertyName), t.definition(t.function(t.variableName))], color: "var(--syn-method)" },
    { tag: [t.propertyName], color: "var(--syn-field)" },
    { tag: [t.annotation, t.meta], color: "var(--syn-annotation)" },
    { tag: [t.operator, t.punctuation, t.bracket, t.paren, t.brace, t.squareBracket], color: "var(--syn-punct)" },
    { tag: t.invalid, color: "var(--danger)" },
]);

// ----- Programmzeiger (aktuelle Zeile beim schrittweisen Ausführen, Fehlerstelle bei Exceptions) -----

// ----- Haltepunkte: Markierung am Zeilenanfang (Rand) und dezente Zeilenfarbe -----

class BreakpointMarker extends GutterMarker {
    constructor(readonly active: boolean) { super(); }
    eq(other: BreakpointMarker) { return other.active == this.active; }
    toDOM() {
        const el = document.createElement("span");
        el.className = "jp-bp-marker" + (this.active ? "" : " is-inactive");
        el.title = this.active ? "Haltepunkt" : "Haltepunkt (in dieser Zeile gibt es keine Anweisung)";
        return el;
    }
}
const activeMarker = new BreakpointMarker(true), inactiveMarker = new BreakpointMarker(false);

export type BreakpointMark = { line: number, active: boolean };
const setBreakpoints = StateEffect.define<BreakpointMark[]>();

const breakpointField = StateField.define<{ gutter: RangeSet<GutterMarker>, lines: DecorationSet }>({
    create: () => ({ gutter: RangeSet.empty, lines: Decoration.none }),
    update(value, tr) {
        let { gutter: g, lines } = value;
        g = g.map(tr.changes);
        lines = lines.map(tr.changes);
        for (const e of tr.effects) {
            if (e.is(setBreakpoints)) {
                const valid = e.value.filter(b => b.line >= 1 && b.line <= tr.state.doc.lines)
                    .sort((a, b) => a.line - b.line);
                g = RangeSet.of(valid.map(b => (b.active ? activeMarker : inactiveMarker).range(tr.state.doc.line(b.line).from)));
                lines = Decoration.set(valid.map(b => Decoration.line({ class: "jp-line-breakpoint" }).range(tr.state.doc.line(b.line).from)));
            }
        }
        return { gutter: g, lines };
    },
    provide: f => EditorView.decorations.from(f, v => v.lines)
});

type LineMark = { line: number, kind: "pointer" | "exception" };
const setLineMarks = StateEffect.define<LineMark[]>();

const lineMarkField = StateField.define<DecorationSet>({
    create: () => Decoration.none,
    update(deco, tr) {
        deco = deco.map(tr.changes);
        for (const e of tr.effects) {
            if (e.is(setLineMarks)) {
                const ranges = e.value
                    .filter(m => m.line >= 1 && m.line <= tr.state.doc.lines)
                    .map(m => Decoration.line({ class: m.kind == "pointer" ? "jp-line-pointer" : "jp-line-exception" })
                        .range(tr.state.doc.line(m.line).from));
                deco = Decoration.set(ranges, true);
            }
        }
        return deco;
    },
    provide: f => EditorView.decorations.from(f)
});

/** JPadBlox: Markier-Modus, Spalten – markiertes Rechteck (Zeilen a–b, Spalten c1–c2) */
type MarkRect = { a: number, b: number, c1: number, c2: number };
const setMarkRect = StateEffect.define<MarkRect | null>();
const markRectField = StateField.define<MarkRect | null>({
    create: () => null,
    update(v, tr) {
        for (const e of tr.effects) if (e.is(setMarkRect)) v = e.value;
        if (v && tr.docChanged && v.b > tr.state.doc.lines) v = { ...v, b: tr.state.doc.lines, a: Math.min(v.a, tr.state.doc.lines) };
        return v;
    }
});
/** Pulsierendes Rechteck als eigene Ebene: bleibt ein echtes Rechteck, auch über kurzen oder leeren Zeilen */
const markRectLayer = layer({
    above: false,
    class: "jp-markrect-layer",
    update: (u) => u.docChanged || u.viewportChanged || u.geometryChanged ||
        u.startState.field(markRectField) != u.state.field(markRectField),
    markers: (view) => {
        const r = view.state.field(markRectField);
        if (!r) return [];
        const doc = view.state.doc;
        const top = view.lineBlockAt(doc.line(r.a).from), bottom = view.lineBlockAt(doc.line(r.b).from);
        const scroller = view.scrollDOM.getBoundingClientRect();
        const baseLeft = scroller.left - view.scrollDOM.scrollLeft * view.scaleX;
        const baseTop = scroller.top - view.scrollDOM.scrollTop * view.scaleY;
        const x0 = markColumnX(view, r.a, 0);
        if (x0 == null) return [];
        const cw = view.defaultCharacterWidth;
        const left = (x0 - baseLeft) / view.scaleX + r.c1 * cw;
        const y = (view.documentTop + top.top * view.scaleY - baseTop) / view.scaleY;
        const width = Math.max(3, (r.c2 - r.c1) * cw);
        return [new RectangleMarker("jp-markrect" + (r.c2 == r.c1 ? " is-empty" : ""), left, y, width, bottom.bottom - top.top)];
    }
});
/** Bildschirm-x der Spalte 0 (linker Textrand) – gemessen an einer Zeile */
function markColumnX(view: EditorView, lineNo: number, _col: number): number | null {
    const c = view.coordsAtPos(view.state.doc.line(lineNo).from);
    if (c) return c.left;
    const content = view.contentDOM.getBoundingClientRect();
    return content.left + parseFloat(getComputedStyle(view.contentDOM.querySelector(".cm-line") || view.contentDOM).paddingLeft || "0");
}

/** JPadBlox: Markier-Modus – markierte Zeilen (von–bis, Zeilennummern) pulsieren */
const setMarkLines = StateEffect.define<{ from: number, to: number } | null>();
const markLinesField = StateField.define<DecorationSet>({
    create: () => Decoration.none,
    update(deco, tr) {
        deco = deco.map(tr.changes);
        for (const e of tr.effects) {
            if (!e.is(setMarkLines)) continue;
            if (!e.value) { deco = Decoration.none; continue; }
            const a = Math.max(1, Math.min(e.value.from, e.value.to)), b = Math.min(tr.state.doc.lines, Math.max(e.value.from, e.value.to));
            const r = [];
            for (let n = a; n <= b; n++) r.push(Decoration.line({ class: "jp-mark-line" }).range(tr.state.doc.line(n).from));
            deco = Decoration.set(r, true);
        }
        return deco;
    },
    provide: f => EditorView.decorations.from(f)
});

/**
 * Enter-Taste (JPadBlox):
 * - Gibt es noch weitere Platzhalter (nach einem Baustein oder einer Vervollständigung), springt Enter dorthin.
 * - Steht rechts vom Cursor ein schließendes Anführungszeichen " bzw. Hochkomma ', springt der Cursor nur
 *   dahinter:  println("Hallo|")  → Enter →  println("Hallo"|)
 * - Steht rechts vom Cursor eine schließende Klammer ) ] } oder ein Semikolon, springt der Cursor hinter
 *   alle direkt folgenden Klammern/Semikolons und beginnt dann eine neue Zeile – nichts wird umgebrochen:
 *   h.laufe(5|);  → Enter →  h.laufe(5);⏎|
 *   Ausnahme: {|} (gerade geöffneter Block) – dort öffnet Enter wie gewohnt den Block.
 */
function enterInSnippet(view: EditorView): boolean {
    if (hasNextSnippetField(view.state)) return nextSnippetField(view);
    const sel = view.state.selection.main;
    if (!sel.empty) return false;
    const doc = view.state.doc;
    const line = doc.lineAt(sel.head);
    const ch = view.state.sliceDoc(sel.head, sel.head + 1);
    const before = view.state.sliceDoc(line.from, sel.head);
    if (ch == '"' || ch == "'") {
        // schließend, wenn links davon eine ungerade Zahl (nicht maskierter) gleicher Zeichen steht
        const n = (before.replace(/\\./g, "").match(new RegExp(ch, "g")) || []).length;
        if (n % 2 == 1) {
            clearSnippet(view);
            view.dispatch({ selection: { anchor: sel.head + 1 }, scrollIntoView: true, userEvent: "select" });
            return true;
        }
        return false;
    }
    if (/[)\]};]/.test(ch)) {
        if (ch == "}" && before.endsWith("{")) return false;
        let end = sel.head;
        while (end < line.to && /[)\]};]/.test(view.state.sliceDoc(end, end + 1))) end++;
        clearSnippet(view);
        view.dispatch({ selection: { anchor: end }, userEvent: "select" });
        return insertNewlineAndIndent(view);
    }
    return false;
}

/**
 * JPadBlox: Strichpunkt (Tastatur oder Hilfsleiste) beendet die Anweisung: Er kommt ans Ende der Zeile (vor einen
 * //-Kommentar), steht dort schon einer, kein zweiter; der Cursor geht in die nächste Zeile (eine leere nächste
 * Zeile wird benutzt, sonst entsteht eine neue, richtig eingerückt).
 * Das gilt auch mitten in einem Text: println("Hallo|") → println("Hallo"); (meist hat man das Ende der Anweisung gemeint).
 * Ausnahmen (normaler Strichpunkt an der Cursorstelle): im Kopf einer for-Schleife, in einem Kommentar, in einer
 * leeren Zeile, bei markiertem Text.
 */
export function smartSemicolon(view: EditorView): boolean {
    const st = view.state, sel = st.selection.main;
    if (!sel.empty) return false;
    const line = st.doc.lineAt(sel.head);
    const before = line.text.slice(0, sel.head - line.from);
    // Code ohne Textinhalt: "…" und '…' durch Platzhalter ersetzen (gleiche Länge)
    const mask = (s: string) => s.replace(/"(?:\\.|[^"\\])*"?|'(?:\\.|[^'\\])*'?/g, m => "_".repeat(m.length));
    const mb = mask(before);
    if (mb.includes("//") || /^\s*(\*|\/\*)/.test(before)) return false;                // in einem Kommentar
    // for-Kopf: zwischen „for (“ und der zugehörigen „)“
    const forAt = mb.search(/\bfor\s*\(/);
    if (forAt >= 0) {
        let depth = 0;
        for (const ch of mb.slice(forAt)) { if (ch == "(") depth++; else if (ch == ")") depth--; }
        if (depth > 0) return false;
    }
    const masked = mask(line.text);
    const comment = masked.indexOf("//");
    const code = comment >= 0 ? line.text.slice(0, comment) : line.text;
    const codeEnd = line.from + code.replace(/\s+$/, "").length;
    if (code.trim() == "") return false;                                                  // leere Zeile: normal
    const has = code.trim().endsWith(";");
    const changes = has ? [] : [{ from: codeEnd, insert: ";" }];
    const shift = changes.length;
    clearSnippet(view);
    const next = line.number < st.doc.lines ? st.doc.line(line.number + 1) : null;
    if (next && next.text.trim() == "") {
        // leere nächste Zeile benutzen und richtig einrücken
        view.dispatch({ changes, userEvent: "input.type" });
        const s2 = view.state, n2 = s2.doc.line(line.number + 1);
        const cols = getIndentation(s2, n2.from) ?? 0;
        const ind = indentString(s2, cols);
        view.dispatch({ changes: { from: n2.from, to: n2.to, insert: ind }, selection: { anchor: n2.from + ind.length }, scrollIntoView: true, userEvent: "input.type" });
        return true;
    }
    view.dispatch({ changes, selection: { anchor: line.to + shift }, userEvent: "input.type" });
    return insertNewlineAndIndent(view);
}

export type EditorListener = {
    onCursorActivity?: (offset: number) => void;
    onDocChanged?: (file: GUIFile) => void;
    onFocusChanged?: (focused: boolean) => void;
    onHistoryChanged?: (canUndo: boolean, canRedo: boolean) => void;
};

export class TouchEditor {

    view: EditorView;
    private file: GUIFile | undefined;
    private states: Map<GUIFile, EditorState> = new Map();
    private modelListeners: Map<GUIFile, monaco.IDisposable> = new Map();
    private applyingToModel = false;
    private applyingFromModel = false;

    private fontSizeCompartment = new Compartment();
    private readOnlyCompartment = new Compartment();
    /** JPadBlox: Editor ist „geparkt“ (unsichtbar, behält aber den Fokus, damit die Bildschirmtastatur offen bleibt) */
    private parked = false;

    /** Parken: keine Eingaben annehmen, solange der Editor nicht zu sehen ist */
    setParked(on: boolean) {
        if (this.parked == on) return;
        this.parked = on;
        this.view.dispatch({ effects: this.readOnlyCompartment.reconfigure(EditorState.readOnly.of(on || !!this.file?.readOnly)) });
    }
    private extensions: Extension[];

    constructor(parent: HTMLElement, private bridge: LanguageBridge, private listener: EditorListener, fontSize: number) {
        this.extensions = [
            breakpointField,
            gutter({
                class: "jp-bp-gutter",
                markers: v => v.state.field(breakpointField).gutter,
                initialSpacer: () => activeMarker,
                domEventHandlers: {
                    click: (view, line) => {
                        this.onToggleBreakpoint?.(view.state.doc.lineAt(line.from).number);
                        return true;
                    }
                }
            }),
            lineNumbers({
                domEventHandlers: {
                    // Tippen auf die Zeilennummer setzt/entfernt einen Haltepunkt
                    click: (view, line) => {
                        this.onToggleBreakpoint?.(view.state.doc.lineAt(line.from).number);
                        return true;
                    }
                }
            }),
            highlightActiveLineGutter(),
            highlightSpecialChars(),
            history(),
            dropCursor(),
            indentOnInput(),
            indentUnit.of("   "),
            EditorState.tabSize.of(3),
            // Nur die *passende* Klammer hervorheben, nicht die am Cursor: Eine Markierung direkt am
            // Cursor lässt den Browser getippte Zeichen vor statt hinter der Klammer einfügen.
            bracketMatching({
                renderMatch: (match) => match.end && match.matched
                    ? [Decoration.mark({ class: "cm-matchingBracket" }).range(match.end.from, match.end.to)]
                    : []
            }),
            closeBrackets(),
            activeLineLayer,
            iosDoubleTapFix(),
            highlightSelectionMatches(),
            java(),
            syntaxHighlighting(javaHighlight),
            lintGutter(),
            lineMarkField,
            markLinesField,
            markRectField,
            markRectLayer,
            autocompletion({
                override: [bridge.completionSource],
                activateOnTyping: true,
                activateOnTypingDelay: 60,
                icons: true,
                // JPadBlox: alle Vorschläge zeichnen, damit man auch aufgeklappte Listen ganz durchscrollen kann
                maxRenderedOptions: 2000,
                defaultKeymap: true,
                interactionDelay: 0,
                aboveCursor: false,
                optionClass: () => "jp-completion-option",
            }),
            // JPadBlox: Strichpunkt beendet die Anweisung (siehe smartSemicolon)
            Prec.high(EditorView.inputHandler.of((view, from, to, text) => text == ";" && from == to && smartSemicolon(view))),
            keymap.of([
                ...closeBracketsKeymap,
                ...completionKeymap,
                { key: "Enter", run: enterInSnippet },
                ...defaultKeymap,
                ...searchKeymap,
                ...historyKeymap,
                { key: "Mod-/", run: toggleComment },
                indentWithTab,
            ]),
            EditorView.contentAttributes.of({
                autocapitalize: "off",
                autocorrect: "off",
                spellcheck: "false",
                "aria-label": "Quelltext",
            }),
            this.fontSizeCompartment.of(this.fontSizeTheme(fontSize)),
            this.readOnlyCompartment.of(EditorState.readOnly.of(false)),
            EditorView.updateListener.of(update => {
                if (update.docChanged) {
                    this.pushChangesToModel(update.transactions);
                    if (this.file) listener.onDocChanged?.(this.file);
                }
                if (update.docChanged || update.selectionSet) {
                    listener.onCursorActivity?.(update.state.selection.main.head);
                }
                // Markier-Modus: gemerkte Zeilen wandern bei Änderungen mit
                if (this.marking && update.docChanged) this.mapMark(update.changes);
                if (update.focusChanged) {
                    listener.onFocusChanged?.(update.view.hasFocus);
                }
                if (update.docChanged || update.transactions.length > 0) {
                    listener.onHistoryChanged?.(undoDepth(update.state) > 0, redoDepth(update.state) > 0);
                }
            }),
        ];

        this.view = new EditorView({
            state: EditorState.create({ doc: "", extensions: this.extensions }),
            parent: parent
        });
    }

    private fontSizeTheme(size: number): Extension {
        return EditorView.theme({
            "&": { fontSize: size + "px" },
            ".cm-content, .cm-gutters": { lineHeight: "1.6" }
        });
    }

    setFontSize(size: number) {
        this.view.dispatch({ effects: this.fontSizeCompartment.reconfigure(this.fontSizeTheme(size)) });
    }

    getFile(): GUIFile | undefined {
        return this.file;
    }

    /** Zeigt eine Datei an. Der Zustand (Cursor, Rückgängig-Historie) jeder Datei bleibt erhalten. */
    showFile(file: GUIFile) {
        if (file == this.file) return;
        if (this.file) this.states.set(this.file, this.view.state);

        const model = file.getMonacoModel()!;
        model.setEOL(monaco.editor.EndOfLineSequence.LF);
        this.attachModelListener(file, model);

        const text = model.getValue();
        let state = this.states.get(file);
        if (!state) {
            state = EditorState.create({ doc: text, extensions: this.extensions });
        } else if (state.doc.toString() != text) {
            // Datei wurde zwischenzeitlich anderweitig geändert (z. B. Formatieren)
            state = state.update({ changes: { from: 0, to: state.doc.length, insert: text }, annotations: Transaction.addToHistory.of(false) }).state;
        }
        this.file = file;
        this.applyingFromModel = true;
        this.view.setState(state);
        this.view.dispatch({ effects: this.readOnlyCompartment.reconfigure(EditorState.readOnly.of(!!file.readOnly || this.parked)) });
        this.applyingFromModel = false;
        // Markier-Modus: nach einem Dateiwechsel pulsiert nichts Altes; beim Festlegen beginnt es bei der Cursorzeile
        if (this.marking && this.markPhase == "select") this.resetMarkToCursor();
        else this.view.dispatch({ effects: [setMarkLines.of(null), setMarkRect.of(null)] });
        this.updateDiagnostics();
        this.listener.onHistoryChanged?.(undoDepth(this.view.state) > 0, redoDepth(this.view.state) > 0);
    }

    forgetFile(file: GUIFile) {
        this.states.delete(file);
        this.modelListeners.get(file)?.dispose();
        this.modelListeners.delete(file);
        if (this.file == file) this.file = undefined;
    }

    /** CodeMirror → Monaco */
    private pushChangesToModel(transactions: readonly Transaction[]) {
        if (this.applyingFromModel || !this.file) return;
        const model = this.file.getMonacoModel();
        if (!model) return;
        this.applyingToModel = true;
        try {
            for (const tr of transactions) {
                if (!tr.docChanged) continue;
                const edits: monaco.editor.IIdentifiedSingleEditOperation[] = [];
                tr.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
                    const s = model.getPositionAt(fromA);
                    const e = model.getPositionAt(toA);
                    edits.push({ range: new monaco.Range(s.lineNumber, s.column, e.lineNumber, e.column), text: inserted.toString() });
                });
                model.applyEdits(edits);
            }
        } finally {
            this.applyingToModel = false;
        }
        // Sicherheitsnetz: Bei Abweichungen den Modellinhalt angleichen
        if (model.getValueLength() != this.view.state.doc.length) {
            console.warn("JPad: Editor und Modell waren nicht synchron, gleiche an.");
            model.setValue(this.view.state.doc.toString());
        }
    }

    /** Monaco → CodeMirror (z. B. Formatieren, Import) */
    private attachModelListener(file: GUIFile, model: monaco.editor.ITextModel) {
        if (this.modelListeners.has(file)) return;
        this.modelListeners.set(file, model.onDidChangeContent(() => {
            if (this.applyingToModel || this.file != file) return;
            const newText = model.getValue();
            const doc = this.view.state.doc.toString();
            if (newText == doc) return;
            // Minimalen geänderten Bereich bestimmen, damit Cursor und Historie sinnvoll bleiben
            let start = 0;
            while (start < doc.length && start < newText.length && doc[start] == newText[start]) start++;
            let endOld = doc.length, endNew = newText.length;
            while (endOld > start && endNew > start && doc[endOld - 1] == newText[endNew - 1]) { endOld--; endNew--; }
            this.applyingFromModel = true;
            this.view.dispatch({ changes: { from: start, to: endOld, insert: newText.substring(start, endNew) } });
            this.applyingFromModel = false;
        }));
    }

    // ----- Fehleranzeige -----

    updateDiagnostics() {
        if (!this.file) return;
        const model = this.file.getMonacoModel();
        if (!model) return;
        const markers = monaco.editor.getModelMarkers({ resource: model.uri });
        const docLength = this.view.state.doc.length;
        const diagnostics: Diagnostic[] = [];
        for (const m of markers) {
            let from = model.getOffsetAt({ lineNumber: m.startLineNumber, column: m.startColumn });
            let to = model.getOffsetAt({ lineNumber: m.endLineNumber, column: m.endColumn });
            from = Math.min(from, docLength); to = Math.min(Math.max(to, from), docLength);
            if (from == to) {
                // Fehler ohne Länge (z. B. „Strichpunkt erwartet“ direkt am Cursor) würde CodeMirror als
                // Widget zeichnen. Ein Widget direkt am Cursor bringt die Texteingabe im Browser
                // durcheinander (getippte Zeichen landen an der falschen Stelle). Deshalb markieren
                // wir stattdessen das Zeichen davor bzw. dahinter innerhalb derselben Zeile.
                const line = this.view.state.doc.lineAt(from);
                if (from > line.from) from--;
                else if (to < line.to) to++;
            }
            diagnostics.push({
                from, to,
                severity: m.severity >= monaco.MarkerSeverity.Error ? "error" : m.severity >= monaco.MarkerSeverity.Warning ? "warning" : "info",
                message: m.message
            });
        }
        this.view.dispatch(setDiagnostics(this.view.state, diagnostics));
    }

    // ----- Programmzeiger -----

    onToggleBreakpoint: ((line: number) => void) | undefined;

    setBreakpoints(marks: BreakpointMark[]) {
        this.view.dispatch({ effects: setBreakpoints.of(marks) });
    }

    getCursorLine(): number {
        return this.view.state.doc.lineAt(this.view.state.selection.main.head).number;
    }

    setLineMarks(marks: LineMark[]) {
        this.view.dispatch({ effects: setLineMarks.of(marks) });
    }

    revealLine(line: number, column: number, setCursor: boolean) {
        const doc = this.view.state.doc;
        if (line < 1 || line > doc.lines) return;
        const l = doc.line(line);
        const pos = Math.min(l.from + Math.max(0, column - 1), l.to);
        this.view.dispatch({
            selection: setCursor ? EditorSelection.cursor(pos) : undefined,
            effects: EditorView.scrollIntoView(pos, { y: "center" })
        });
    }

    /**
     * Cursor in den sichtbaren Bereich holen (nach einer Änderung der verfügbaren Höhe).
     * Bewusst NICHT über EditorView.scrollIntoView: das scrollt auch alle umgebenden Bereiche
     * (selbst mit overflow: hidden) und schiebt so z. B. die Dateireiter nach oben weg.
     * Hier wird nur der eigene Scrollbereich des Editors verschoben.
     */
    revealCursorInside(margin = 48) {
        const view = this.view, sc = view.scrollDOM;
        const head = view.state.selection.main.head;
        const block = view.lineBlockAt(head);              // funktioniert auch für Zeilen außerhalb des gezeichneten Bereichs
        const r = sc.getBoundingClientRect();
        const vv = window.visualViewport;
        let visTop = Math.max(r.top, vv ? vv.offsetTop : 0);
        let visBottom = Math.min(r.bottom, vv ? vv.offsetTop + vv.height : window.innerHeight);
        // Umgebende Bereiche schneiden den Editor ab (z. B. ist er unten um die Höhe der Dateireiter
        // abgeschnitten, wenn er so hoch ist wie der ganze Code-Bereich) – nur der Schnitt ist sichtbar
        for (let el = sc.parentElement; el && el != document.body; el = el.parentElement) {
            const ov = getComputedStyle(el);
            if (ov.overflowY == "visible" && ov.overflowX == "visible") continue;
            const pr = el.getBoundingClientRect();
            visBottom = Math.min(visBottom, pr.bottom);
        }
        // Die Hilfsleiste über der Tastatur kann den unteren Rand des Editors verdecken
        const bar = document.querySelector<HTMLElement>(".jp-keybar");
        if (bar && bar.offsetParent) {
            const b = bar.getBoundingClientRect();
            if (b.height > 0 && b.top < visBottom && b.bottom > visTop) visBottom = Math.min(visBottom, b.top);
        }
        const lineTop = view.documentTop + block.top;       // Bildschirmkoordinaten
        const lineBottom = view.documentTop + block.bottom;
        const visible = visBottom - visTop;
        // Unten etwas mehr Abstand lassen (mind. 12 % der sichtbaren Höhe), oben den normalen Rand
        let bottomMargin = Math.max(margin, visible * 0.12);
        if (visible < margin + bottomMargin + block.height) {
            margin = bottomMargin = Math.max(0, (visible - block.height) / 2);
        }
        if (lineBottom > visBottom - bottomMargin) sc.scrollTop += lineBottom - (visBottom - bottomMargin);
        else if (lineTop < visTop + margin) sc.scrollTop -= (visTop + margin) - lineTop;
    }

    // ----- Befehle für Symbolleisten -----

    focus() { this.view.focus(); }
    undo() { undo(this.view); }
    redo() { redo(this.view); }
    startCompletion() { startCompletion(this.view); }
    acceptCompletion() { return completionStatus(this.view.state) == "active" && acceptCompletion(this.view); }

    getCursorOffset(): number {
        return this.view.state.selection.main.head;
    }

    /** Fügt Text an der Cursorposition ein; "§" im Text markiert die neue Cursorposition. */
    insert(text: string) {
        const view = this.view;
        let cursorDelta = text.indexOf("§");
        if (cursorDelta >= 0) text = text.replace("§", ""); else cursorDelta = text.length;
        const range = view.state.selection.main;
        view.dispatch({
            changes: { from: range.from, to: range.to, insert: text },
            selection: { anchor: range.from + cursorDelta },
            userEvent: "input.type",
            scrollIntoView: true
        });
    }

    /** JPadBlox: leere, eingerückte Zeile unter der aktuellen Zeile einfügen */
    insertLine() { insertBlankLine(this.view); }

    // ------------------------------------------------ Markier-Modus (JPadBlox)
    /*
     * Ablauf (Knöpfe in der Hilfsleiste, siehe KeyBar):
     *  1. Markier-Knopf: Modus an, Phase „select“. Die Zeile mit dem Cursor ist die Startzeile und pulsiert.
     *  2. Antippen einer anderen Zeile im Code (oder ← →): Endzeile. Alle Zeilen dazwischen pulsieren.
     *     Das ist nur eine interne Kennzeichnung – keine Auswahl des Betriebssystems (keine Griffe).
     *  3. Ausschneiden: Die Zeilen werden entfernt und in einem eigenen Speicher abgelegt (nicht in der
     *     Zwischenablage). Phase „cut“: nichts pulsiert mehr, der Editor verhält sich ganz normal (Cursor setzen,
     *     Zeile einfügen/löschen, auch andere Reiter), nur der Markier-Knopf blinkt weiter.
     *  4. Einfügen: Der Block kommt an die Cursorstelle (als ganze Zeilen), danach Formatieren, Modus aus.
     */

    /** Markier-Modus aktiv (Knopf blinkt) */
    marking = false;
    /** select: Block wird festgelegt; cut: Block ist ausgeschnitten bzw. kopiert und wartet aufs Einfügen */
    markPhase: "select" | "cut" = "select";
    /** Spalten statt ganzer Zeilen markieren (Rechteck wie die Block-Auswahl in vim). Startet immer mit Zeilen. */
    markColumns = false;
    /** Ausgeschnittene bzw. kopierte Zeilen (eigener Speicher, unabhängig von der Zwischenablage) */
    private markBuffer = "";
    /** … bzw. ausgeschnittener/kopierter Spaltenblock: eine Zeichenkette je Zeile */
    private markRows: string[] | null = null;
    private markStartPos = 0;
    private markEndPos = 0;
    /** Spalten (Zeichenspalten, Tabulator = 3) der beiden Ecken im Spaltenmodus */
    private markStartCol = 0;
    private markEndCol = 0;
    private markTapWired = false;

    private lineNo(pos: number) { const d = this.view.state.doc; return d.lineAt(Math.max(0, Math.min(pos, d.length))).number; }
    private get tab() { return this.view.state.tabSize; }

    /** Gibt es einen ausgeschnittenen/kopierten Block? */
    hasMarkBuffer() { return this.markBuffer != "" || this.markRows != null; }

    /** Schritt 1: Modus an, Startzeile = Zeile mit dem Cursor; immer im Zeilenmodus */
    startMarking() {
        this.wireMarkTaps();
        this.marking = true;
        this.markPhase = "select";
        this.markColumns = false;
        document.documentElement.classList.remove("jp-marking-cols");
        this.resetMarkToCursor();
        document.documentElement.classList.add("jp-marking");
    }

    /** Kippschalter Zeilen ↔ Spalten (nur beim Festlegen) */
    setMarkColumns(on: boolean) {
        if (!this.marking || this.markPhase != "select") return;
        this.markColumns = on;
        document.documentElement.classList.toggle("jp-marking-cols", on);
        this.resetMarkToCursor();
    }

    /** Start- und Endpunkt auf den Cursor setzen (auch nach einem Dateiwechsel) */
    private resetMarkToCursor() {
        const st = this.view.state, head = st.selection.main.head, line = st.doc.lineAt(head);
        this.markStartPos = this.markEndPos = line.from;
        this.markStartCol = this.markEndCol = countColumn(line.text, this.tab, head - line.from);
        // eine evtl. vorhandene echte Auswahl aufheben – nur der Cursor bleibt
        this.view.dispatch({ selection: st.selection.main.empty ? undefined : { anchor: head }, effects: this.markEffect() });
    }

    /** Modus aus (ohne Einfügen): nichts pulsiert mehr */
    stopMarking() {
        this.marking = false;
        this.markPhase = "select";
        this.markColumns = false;
        document.documentElement.classList.remove("jp-marking", "jp-marking-cols");
        this.view.dispatch({ effects: [setMarkLines.of(null), setMarkRect.of(null)] });
    }

    /** Pulsierende Zeilen bzw. pulsierendes Rechteck passend zur Phase */
    private markEffect() {
        if (!this.marking || this.markPhase != "select") return [setMarkLines.of(null), setMarkRect.of(null)];
        if (this.markColumns) return [setMarkLines.of(null), setMarkRect.of(this.markedRect())];
        const s = this.lineNo(this.markStartPos), e = this.lineNo(this.markEndPos);
        return [setMarkLines.of({ from: Math.min(s, e), to: Math.max(s, e) }), setMarkRect.of(null)];
    }

    private showMark(scrollTo?: number) {
        this.view.dispatch({ effects: [...this.markEffect(), ...(scrollTo != null ? [EditorView.scrollIntoView(scrollTo)] : [])] });
    }

    private markedRect(): MarkRect {
        const s = this.lineNo(this.markStartPos), e = this.lineNo(this.markEndPos);
        return { a: Math.min(s, e), b: Math.max(s, e), c1: Math.min(this.markStartCol, this.markEndCol), c2: Math.max(this.markStartCol, this.markEndCol) };
    }

    /** Zeile und Zeichenspalte unter einem Punkt (auch rechts hinter dem Zeilenende) */
    private cellAt(x: number, y: number) {
        const v = this.view, pos = v.posAtCoords({ x, y }, false);
        const line = v.state.doc.lineAt(pos);
        const x0 = markColumnX(v, line.number, 0) ?? x;
        return { from: line.from, col: Math.max(0, Math.round((x - x0) / v.defaultCharacterWidth)) };
    }

    /**
     * Schritt 2: Antippen legt das Ende fest (Zeilenmodus: Endzeile; Spaltenmodus: gegenüberliegende Ecke).
     * Spaltenmodus: Ziehen mit dem Finger zieht ein neues Rechteck auf (vom Aufsetzpunkt bis zum Finger).
     */
    private wireMarkTaps() {
        if (this.markTapWired) return;
        this.markTapWired = true;
        const cd = this.view.contentDOM;
        const colsSelect = () => this.marking && this.markPhase == "select" && this.markColumns;
        // Spaltenmodus: kein Cursorsetzen, keine Textauswahl und kein Scrollen durch den Finger
        for (const ev of ["mousedown", "touchstart"]) this.view.scrollDOM.addEventListener(ev, e => {
            if (!colsSelect() || !cd.contains(<Node>e.target)) return;
            e.preventDefault(); e.stopPropagation();
        }, { capture: true, passive: false });
        let drag: { x: number, y: number, started: boolean, id: number } | null = null;
        cd.addEventListener("pointerdown", e => {
            if (!colsSelect()) return;
            drag = { x: e.clientX, y: e.clientY, started: false, id: e.pointerId };
            try { cd.setPointerCapture(e.pointerId); } catch (_) { }
        });
        cd.addEventListener("pointermove", e => {
            if (!drag || drag.id != e.pointerId || !colsSelect()) return;
            if (!drag.started) {
                if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 8) return;
                drag.started = true;
                const c = this.cellAt(drag.x, drag.y);
                this.markStartPos = c.from; this.markStartCol = c.col;
            }
            const c = this.cellAt(e.clientX, e.clientY);
            this.markEndPos = c.from; this.markEndCol = c.col;
            this.showMark();
        });
        const up = (e: PointerEvent) => {
            if (drag && drag.id == e.pointerId) {
                const d = drag; drag = null;
                if (!colsSelect()) return;
                if (!d.started) { const c = this.cellAt(e.clientX, e.clientY); this.markEndPos = c.from; this.markEndCol = c.col; this.showMark(); }
                return;
            }
            if (!this.marking || this.markPhase != "select" || this.markColumns) return;
            const pos = this.view.posAtCoords({ x: e.clientX, y: e.clientY });
            if (pos == null) return;
            this.markEndPos = this.view.state.doc.lineAt(pos).from;
            this.showMark();
        };
        cd.addEventListener("pointerup", up);
        cd.addEventListener("pointercancel", () => { drag = null; });
    }

    /** Endzeile eine Zeile nach oben (-1) bzw. unten (+1), nur beim Festlegen. Liefert false sonst. */
    moveMarkEnd(delta: number): boolean {
        if (!this.marking || this.markPhase != "select") return false;
        const doc = this.view.state.doc;
        const n = Math.max(1, Math.min(doc.lines, this.lineNo(this.markEndPos) + delta));
        this.markEndPos = doc.line(n).from;
        this.showMark(this.markEndPos);
        return true;
    }

    /** Spaltenmodus: Ecke eine Spalte nach links (-1) bzw. rechts (+1). Liefert false sonst. */
    moveMarkCol(delta: number): boolean {
        if (!this.marking || this.markPhase != "select" || !this.markColumns) return false;
        this.markEndCol = Math.max(0, this.markEndCol + delta);
        this.showMark();
        return true;
    }

    /** Textänderungen: gemerkte Zeilen wandern mit (aus dem updateListener) */
    private mapMark(changes: ChangeDesc) {
        this.markStartPos = changes.mapPos(this.markStartPos, -1);
        this.markEndPos = changes.mapPos(this.markEndPos, -1);
    }

    /** Die markierten Zeilen: Text (mit Zeilenumbruch am Ende) und Bereich im Dokument */
    private markedLines() {
        const doc = this.view.state.doc;
        const s = this.lineNo(this.markStartPos), e = this.lineNo(this.markEndPos);
        const a = doc.line(Math.min(s, e)), b = doc.line(Math.max(s, e));
        // Ist die letzte markierte Zeile die letzte des Dokuments, den Umbruch davor mitnehmen
        const to = b.number < doc.lines ? b.to + 1 : b.to;
        const from = b.number < doc.lines || a.number == 1 ? a.from : a.from - 1;
        return { text: doc.sliceString(a.from, b.to) + "\n", from, to };
    }

    /** Spaltenmodus: Text des Rechtecks je Zeile und die Bereiche im Dokument */
    private markedCells() {
        const doc = this.view.state.doc, r = this.markedRect(), rows: string[] = [], ranges: { from: number, to: number }[] = [];
        for (let n = r.a; n <= r.b; n++) {
            const l = doc.line(n);
            const from = l.from + findColumn(l.text, r.c1, this.tab), to = l.from + findColumn(l.text, r.c2, this.tab);
            rows.push(doc.sliceString(from, to));
            if (to > from) ranges.push({ from, to });
        }
        const first = doc.line(r.a);
        return { rows, ranges, topLeft: first.from + findColumn(first.text, r.c1, this.tab) };
    }

    /** „Zeile löschen“ beim Festlegen: markierte Zeilen bzw. nur das Rechteck löschen. Liefert false sonst. */
    deleteMarked(): boolean {
        if (!this.marking || this.markPhase != "select") return false;
        if (this.markColumns) {
            const { ranges, topLeft } = this.markedCells();
            this.view.dispatch({ changes: ranges, selection: { anchor: topLeft }, scrollIntoView: true });
        } else {
            const { from, to } = this.markedLines();
            this.view.dispatch({ changes: { from, to }, selection: { anchor: from }, scrollIntoView: true });
        }
        this.resetMarkToCursor();
        return true;
    }

    /** Schritt 3: Markiertes ausschneiden (remove) oder kopieren – in den eigenen Speicher */
    private takeMarked(remove: boolean): boolean {
        if (!this.marking || this.markPhase != "select") return false;
        let changes: { from: number, to: number }[] = [], anchor: number;
        if (this.markColumns) {
            const c = this.markedCells();
            this.markRows = c.rows; this.markBuffer = "";
            changes = c.ranges; anchor = c.topLeft;
        } else {
            const l = this.markedLines();
            this.markBuffer = l.text; this.markRows = null;
            changes = [{ from: l.from, to: l.to }]; anchor = l.from;
        }
        this.markPhase = "cut";
        this.markColumns = false;
        document.documentElement.classList.remove("jp-marking", "jp-marking-cols");   // Cursor blinkt wieder normal
        this.view.dispatch({
            changes: remove ? changes : undefined,
            selection: remove ? { anchor } : undefined,
            effects: [setMarkLines.of(null), setMarkRect.of(null)], scrollIntoView: true
        });
        return true;
    }
    cutMarked(): boolean { return this.takeMarked(true); }
    copyMarked(): boolean { return this.takeMarked(false); }

    /**
     * Schritt 4: Block an der Cursorstelle einfügen. Zeilen: als ganze Zeilen (in eine leere Zeile hinein, sonst vor
     * die Zeile mit dem Cursor). Spaltenblock: wie in vim ab der Cursorspalte in diese und die folgenden Zeilen;
     * kurze Zeilen werden mit Leerzeichen aufgefüllt, fehlende Zeilen angehängt. Beendet den Modus.
     * Liefert die Art des Blocks oder false, wenn nichts im Speicher war.
     */
    pasteMarked(): "lines" | "columns" | false {
        const text = this.markBuffer, rows = this.markRows;
        const st = this.view.state, head = st.selection.main.head, line = st.doc.lineAt(head);
        this.stopMarking();
        this.markBuffer = ""; this.markRows = null;
        if (rows) {
            const doc = st.doc, col = countColumn(line.text, this.tab, head - line.from);
            const specs: { from: number, insert: string }[] = [];
            let extra = "";
            rows.forEach((row, i) => {
                const n = line.number + i;
                if (n > doc.lines) { extra += "\n" + (row ? " ".repeat(col) + row : ""); return; }
                if (!row) return;
                const l = doc.line(n), w = countColumn(l.text, this.tab);
                if (w < col) specs.push({ from: l.to, insert: " ".repeat(col - w) + row });
                else specs.push({ from: l.from + findColumn(l.text, col, this.tab), insert: row });
            });
            if (extra) specs.push({ from: doc.length, insert: extra });
            const cs = st.changes(specs);
            const first = doc.line(line.number);
            const at = countColumn(first.text, this.tab) < col ? first.to : first.from + findColumn(first.text, col, this.tab);
            this.view.dispatch({ changes: cs, selection: { anchor: cs.mapPos(at, 1) }, userEvent: "input.paste", scrollIntoView: true });
            return "columns";
        }
        if (!text) return false;
        const change = line.text.trim() == ""
            ? { from: line.from, to: line.to, insert: text.slice(0, -1) }
            : { from: line.from, insert: text };
        this.view.dispatch({ changes: change, selection: { anchor: line.from + text.length - 1 }, userEvent: "input.paste", scrollIntoView: true });
        return "lines";
    }

    /** JPadBlox: Zeile(n) mit dem Cursor bzw. der Auswahl löschen */
    deleteLine() { deleteLine(this.view); }

    moveCursor(delta: number) {
        const view = this.view;
        const head = Math.max(0, Math.min(view.state.doc.length, view.state.selection.main.head + delta));
        view.dispatch({ selection: { anchor: head }, scrollIntoView: true });
    }

    indentMore() {
        // JPadBlox: Nach dem Einfügen eines Bausteins springt Tab zum nächsten Platzhalter
        if (hasNextSnippetField(this.view.state)) { nextSnippetField(this.view); return; }
        indentWithTab.run!(this.view);
    }
}
