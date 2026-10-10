import * as monaco from 'monaco-editor';
import { EditorState, Extension, StateEffect, StateField, Compartment, Transaction, EditorSelection } from "@codemirror/state";
import {
    EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, Decoration, DecorationSet,
    highlightSpecialChars, dropCursor
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab, undo, redo, undoDepth, redoDepth, toggleComment } from "@codemirror/commands";
import { java } from "@codemirror/lang-java";
import { syntaxHighlighting, HighlightStyle, indentOnInput, bracketMatching, indentUnit } from "@codemirror/language";
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap, startCompletion, acceptCompletion, completionStatus } from "@codemirror/autocomplete";
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

const javaHighlight = HighlightStyle.define([
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
    private extensions: Extension[];

    constructor(parent: HTMLElement, private bridge: LanguageBridge, private listener: EditorListener, fontSize: number) {
        this.extensions = [
            lineNumbers(),
            highlightActiveLineGutter(),
            highlightSpecialChars(),
            history(),
            dropCursor(),
            indentOnInput(),
            indentUnit.of("   "),
            EditorState.tabSize.of(3),
            bracketMatching(),
            closeBrackets(),
            highlightActiveLine(),
            highlightSelectionMatches(),
            java(),
            syntaxHighlighting(javaHighlight),
            lintGutter(),
            lineMarkField,
            autocompletion({
                override: [bridge.completionSource],
                activateOnTyping: true,
                activateOnTypingDelay: 60,
                icons: true,
                maxRenderedOptions: 60,
                defaultKeymap: true,
                interactionDelay: 0,
                aboveCursor: false,
                optionClass: () => "jp-completion-option",
            }),
            keymap.of([
                ...closeBracketsKeymap,
                ...completionKeymap,
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
        this.view.dispatch({ effects: this.readOnlyCompartment.reconfigure(EditorState.readOnly.of(!!file.readOnly)) });
        this.applyingFromModel = false;
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
            diagnostics.push({
                from, to,
                severity: m.severity >= monaco.MarkerSeverity.Error ? "error" : m.severity >= monaco.MarkerSeverity.Warning ? "warning" : "info",
                message: m.message
            });
        }
        this.view.dispatch(setDiagnostics(this.view.state, diagnostics));
    }

    // ----- Programmzeiger -----

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

    // ----- Befehle für Symbolleisten -----

    focus() { this.view.focus(); }
    undo() { undo(this.view); }
    redo() { redo(this.view); }
    startCompletion() { startCompletion(this.view); }
    acceptCompletion() { return completionStatus(this.view.state) == "active" && acceptCompletion(this.view); }

    getCursorOffset(): number {
        return this.view.state.selection.main.head;
    }

    /** Fügt Text an der Cursorposition ein; "|" im Text markiert die neue Cursorposition. */
    insert(text: string) {
        const view = this.view;
        let cursorDelta = text.indexOf("|");
        if (cursorDelta >= 0) text = text.replace("|", ""); else cursorDelta = text.length;
        const range = view.state.selection.main;
        view.dispatch({
            changes: { from: range.from, to: range.to, insert: text },
            selection: { anchor: range.from + cursorDelta },
            userEvent: "input.type",
            scrollIntoView: true
        });
    }

    moveCursor(delta: number) {
        const view = this.view;
        const head = Math.max(0, Math.min(view.state.doc.length, view.state.selection.main.head + delta));
        view.dispatch({ selection: { anchor: head }, scrollIntoView: true });
    }

    indentMore() {
        indentWithTab.run!(this.view);
    }
}
