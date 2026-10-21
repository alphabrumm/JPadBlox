import * as monaco from 'monaco-editor';
import type { Completion, CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import { snippet } from "@codemirror/autocomplete";
import type { EditorView } from "@codemirror/view";
import MarkdownIt from "markdown-it";
import { JavaLanguage } from "../compiler/java/JavaLanguage.js";
import { JavaCompletionItemProvider } from "../compiler/java/monacoproviders/JavaCompletionItemProvider.js";
import { JavaHoverProvider } from "../compiler/java/monacoproviders/JavaHoverProvider.js";
import { JavaSignatureHelpProvider } from "../compiler/java/monacoproviders/JavaSignatureHelpProvider.js";
import { JavaFormatter } from "../compiler/java/monacoproviders/JavaFormatter.js";

/**
 * Brücke zwischen den Sprachdiensten der Online-IDE (geschrieben als Monaco-Provider)
 * und dem Touch-Editor (CodeMirror). Die Provider werden direkt aufgerufen;
 * ihre Ergebnisse werden in CodeMirror-Strukturen umgewandelt.
 */

const noCancel: monaco.CancellationToken = {
    isCancellationRequested: false,
    onCancellationRequested: () => ({ dispose() { } })
} as any;

export type SignatureInfo = {
    /** Signatur als HTML mit hervorgehobenem aktuellem Parameter */
    html: string;
    documentation?: string;
};

const md = new MarkdownIt({ html: false, linkify: false, breaks: true });

export function renderMarkdown(text: string): string {
    return md.render(text);
}

function kindToType(kind: monaco.languages.CompletionItemKind): string {
    const K = monaco.languages.CompletionItemKind;
    switch (kind) {
        case K.Method: return "method";
        case K.Function: return "function";
        case K.Constructor: return "method";
        case K.Field: case K.Property: return "property";
        case K.Variable: return "variable";
        case K.Class: return "class";
        case K.Interface: return "interface";
        case K.Enum: return "enum";
        case K.EnumMember: case K.Constant: return "constant";
        case K.Keyword: return "keyword";
        case K.Module: return "namespace";
        case K.TypeParameter: return "type";
        case K.Snippet: return "text";
        default: return "text";
    }
}

/**
 * Einfügetext der Online-IDE für JPad anpassen:
 * - Die Online-IDE hängt bei void-Methoden (und println) ein Semikolon an: "bellen();".
 *   Schüler tippen das Semikolon aber aus Gewohnheit selbst – dann stünden zwei da.
 *   Deshalb lassen wir es weg; der Cursor landet hinter der schließenden Klammer.
 * - Ein $0 am Ende (Endposition des Cursors) entfällt; CodeMirror setzt den Cursor
 *   ohnehin ans Ende, wenn keine Felder mehr folgen.
 */
export function prepareInsertText(text: string, isSnippet: boolean): string {
    if (isSnippet) {
        text = text.replace(/\$\{0\}$|\$0$/, "");
        text = text.replace(/\);$/, ")");
    }
    return text;
}

/** Monaco-Snippet-Syntax ($1, ${1:x}, ${1|a,b|}, $0) in CodeMirror-Syntax umwandeln. */
export function convertSnippet(s: string): string {
    return s
        .replace(/\$\{(\d+)\|([^|,}]*)[^|}]*\|\}/g, (_m, n, first) => "${" + n + ":" + first + "}")
        .replace(/\$\{0(:[^}]*)?\}/g, (_m, name) => "${" + (name ? name.substring(1) : "") + "}")
        .replace(/\$0(?!\d)/g, "${}")
        .replace(/\$(\d+)/g, (_m, n) => "${" + n + "}");
}

/** Enthält der (Monaco-)Snippet-Text noch Felder? */
export function hasSnippetFields(s: string): boolean {
    return /\$(\d|\{)/.test(s);
}

export class LanguageBridge {

    private completionProvider: JavaCompletionItemProvider;
    private hoverProvider: JavaHoverProvider;
    private signatureProvider: JavaSignatureHelpProvider;
    private formatter: JavaFormatter;

    constructor(language: JavaLanguage, private getModel: () => monaco.editor.ITextModel | undefined) {
        this.completionProvider = new JavaCompletionItemProvider(language);
        this.hoverProvider = new JavaHoverProvider(language);
        this.signatureProvider = new JavaSignatureHelpProvider(language);
        this.formatter = new JavaFormatter(language);
    }

    private toPosition(model: monaco.editor.ITextModel, offset: number): monaco.Position {
        const p = model.getPositionAt(offset);
        return new monaco.Position(p.lineNumber, p.column);
    }

    /** Quelle für die CodeMirror-Autovervollständigung */
    completionSource = async (context: CompletionContext): Promise<CompletionResult | null> => {
        const model = this.getModel();
        if (!model) return null;

        const word = context.matchBefore(/[\wäöüÄÖÜß@]*/);
        const charBefore = context.state.sliceDoc(Math.max(0, context.pos - 1), context.pos);
        const lineBefore = context.state.doc.lineAt(context.pos);
        const textBefore = context.state.sliceDoc(lineBefore.from, context.pos);

        if (!context.explicit) {
            const typedWord = word && word.to > word.from;
            const afterDot = charBefore == ".";
            const afterNew = /\bnew $/.test(textBefore);
            if (!typedWord && !afterDot && !afterNew) return null;
            // Keine Vorschläge in Kommentaren
            if (/^\s*(\/\/|\*|\/\*)/.test(textBefore) || /\/\/.*$/.test(textBefore.replace(/"[^"]*"/g, '""'))) return null;
        }

        const requestPos = context.pos;
        let list: monaco.languages.CompletionList | null | undefined;
        try {
            list = await this.completionProvider.provideCompletionItems(model, this.toPosition(model, requestPos),
                { triggerKind: context.explicit ? 0 : 1, triggerCharacter: charBefore } as any, noCancel);
        } catch (e) {
            console.warn("Vervollständigung fehlgeschlagen", e);
            return null;
        }
        if (!list || !list.suggestions || list.suggestions.length == 0) return null;
        if (context.aborted) return null;

        const from = word ? word.from : requestPos;

        // Monaco sortiert nach sortText; CodeMirror nach Treffergüte + boost.
        const sorted = list.suggestions.slice().sort((a, b) =>
            (a.sortText || (typeof a.label == "string" ? a.label : a.label.label))
                .localeCompare(b.sortText || (typeof b.label == "string" ? b.label : b.label.label)));
        const n = sorted.length;

        const options: Completion[] = sorted.map((item, rank) => {
            const label = typeof item.label == "string" ? item.label : item.label.label;
            const labelDetail = typeof item.label == "string" ? undefined : (item.label.detail || item.label.description);

            let range: monaco.IRange | undefined = undefined;
            if (item.range) {
                range = (item.range as any).replace ? (item.range as any).replace : <monaco.IRange>item.range;
            }
            const rangeStart = range ? model.getOffsetAt({ lineNumber: range.startLineNumber, column: range.startColumn }) : from;
            const rangeEnd = range ? model.getOffsetAt({ lineNumber: range.endLineNumber, column: range.endColumn }) : requestPos;

            const rawSnippet = ((item.insertTextRules || 0) & monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet) != 0;
            const insertText = prepareInsertText(item.insertText || label, rawSnippet);

            const doc = item.documentation;
            const docText = doc == null ? undefined : (typeof doc == "string" ? doc : doc.value);

            const completion: Completion = {
                label: label,
                displayLabel: label,
                detail: labelDetail || (item.detail && item.detail.length < 60 ? item.detail : undefined),
                type: kindToType(item.kind),
                boost: Math.round(99 - (rank * 198) / Math.max(1, n - 1)),
                info: (docText || (item.detail && item.detail.length >= 60)) ? () => {
                    const div = document.createElement("div");
                    div.className = "jp-doc";
                    div.innerHTML = renderMarkdown((item.detail && item.detail.length >= 60 ? "```\n" + item.detail + "\n```\n" : "") + (docText || ""));
                    return div;
                } : undefined,
                apply: (view: EditorView, _c: Completion, _from: number, to: number) => {
                    // Die Online-IDE ersetzt auch Buchstaben hinter dem Cursor („if|a = 4“ → „a“ verschwindet).
                    // Das ist nur beim Ändern eines bestehenden Aufrufs sinnvoll („h.lau|fe(5)“);
                    // sonst ersetzen wir nur bis zum Cursor.
                    let end = to;
                    if (rangeEnd > requestPos) {
                        const afterCursor = view.state.sliceDoc(to, rangeEnd + (to - requestPos) + 1);
                        if (/^[\wäöüÄÖÜß]*\(/.test(afterCursor) && insertText.indexOf("(") >= 0) {
                            end = Math.max(to, rangeEnd + (to - requestPos));
                        }
                    }
                    const start = Math.min(rangeStart, _from);
                    if (rawSnippet && hasSnippetFields(insertText)) {
                        snippet(convertSnippet(insertText))(view, _c, start, end);
                    } else {
                        view.dispatch({
                            changes: { from: start, to: end, insert: insertText },
                            selection: { anchor: start + insertText.length },
                            userEvent: "input.complete"
                        });
                    }
                    if (item.additionalTextEdits && item.additionalTextEdits.length > 0) {
                        const m = this.getModel();
                        if (m) {
                            const changes = item.additionalTextEdits.map(e => ({
                                from: m.getOffsetAt({ lineNumber: e.range.startLineNumber, column: e.range.startColumn }),
                                to: m.getOffsetAt({ lineNumber: e.range.endLineNumber, column: e.range.endColumn }),
                                insert: e.text || ""
                            }));
                            view.dispatch({ changes, userEvent: "input.complete" });
                        }
                    }
                    // Die DOM-Auswahl nachziehen. Ohne das steht der Browser-Cursor nach dem Einfügen
                    // u. U. noch vor der eingefügten Klammer, und das nächste getippte Zeichen
                    // (meist das Semikolon) landet an der falschen Stelle.
                    requestAnimationFrame(() => {
                        const sel = view.state.selection.main;
                        if (!sel.empty || sel.head == 0) return;
                        view.dispatch({ selection: { anchor: sel.head - 1 } });
                        view.dispatch({ selection: { anchor: sel.head } });
                    });
                    this.onAfterCompletion?.();
                }
            };
            return completion;
        });

        return {
            from,
            options,
            validFor: /^[\wäöüÄÖÜß@]*$/
        };
    }

    onAfterCompletion: (() => void) | undefined;

    async signatureHelp(offset: number): Promise<SignatureInfo | null> {
        const model = this.getModel();
        if (!model) return null;
        try {
            const result = await this.signatureProvider.provideSignatureHelp(model, this.toPosition(model, offset), noCancel,
                { triggerKind: 1, isRetrigger: false } as any);
            const help = result?.value;
            if (!help || help.signatures.length == 0) return null;
            const sig = help.signatures[help.activeSignature || 0] || help.signatures[0];
            const activeParam = sig.activeParameter ?? help.activeParameter ?? 0;
            const param = sig.parameters?.[activeParam];
            let html = escapeHtml(sig.label);
            if (param) {
                let start: number, end: number;
                if (Array.isArray(param.label)) {
                    [start, end] = param.label as [number, number];
                } else {
                    start = sig.label.indexOf(<string>param.label);
                    end = start + (<string>param.label).length;
                }
                if (start >= 0) {
                    html = escapeHtml(sig.label.substring(0, start)) + "<b>" + escapeHtml(sig.label.substring(start, end)) + "</b>"
                        + escapeHtml(sig.label.substring(end));
                }
            }
            const docVal = (d: any) => d == null ? undefined : (typeof d == "string" ? d : d.value);
            return { html, documentation: docVal(param?.documentation) || docVal(sig.documentation) };
        } catch (e) {
            return null;
        }
    }

    async hover(offset: number): Promise<string | null> {
        const model = this.getModel();
        if (!model) return null;
        try {
            const h = await this.hoverProvider.provideHover(model, this.toPosition(model, offset), noCancel);
            if (!h || !h.contents || h.contents.length == 0) return null;
            return h.contents.map(c => renderMarkdown(c.value)).join("");
        } catch (e) {
            return null;
        }
    }

    /**
     * JPadBlox: Konstruktor, den die Online-IDE an dieser Stelle vorschlägt („insert constructor“:
     * ein Parameter je Attribut, im Rumpf this.… = …). Liefert den Snippet-Text oder null.
     */
    async constructorSuggestion(offset: number): Promise<string | null> {
        const model = this.getModel();
        if (!model) return null;
        try {
            const list = await this.completionProvider.provideCompletionItems(model, this.toPosition(model, offset),
                { triggerKind: 0 } as any, noCancel);
            const item = list?.suggestions?.find(s => typeof s.label != "string" && /insert constructor/.test(s.label.detail ?? ""));
            return item ? (typeof item.insertText == "string" ? item.insertText : null) : null;
        } catch (e) {
            return null;
        }
    }

    /**
     * JPadBlox: Formatier-Änderungen als Zeichenpositionen (für CodeMirror), damit Cursor und
     * Platzhalter eines gerade eingefügten Bausteins an ihrer Stelle bleiben.
     * Liefert auch den Text, auf den sich die Positionen beziehen.
     */
    async formatChanges(): Promise<{ text: string, changes: { from: number, to: number, insert: string }[] } | null> {
        const model = this.getModel();
        if (!model) return null;
        const text = model.getValue();
        const edits = await this.formatter.provideDocumentFormattingEdits(model, { tabSize: 3, insertSpaces: true }, noCancel);
        if (!edits || edits.length == 0) return null;
        const changes = edits.map(e => ({
            from: model.getOffsetAt({ lineNumber: e.range.startLineNumber, column: e.range.startColumn }),
            to: model.getOffsetAt({ lineNumber: e.range.endLineNumber, column: e.range.endColumn }),
            insert: e.text
        })).sort((a, b) => a.from - b.from || a.to - b.to);
        return { text, changes };
    }

    /** Formatiert den Code im Modell; die Änderungen erreichen den Editor über die Modell-Synchronisation. */
    async format(): Promise<boolean> {
        const model = this.getModel();
        if (!model) return false;
        const edits = await this.formatter.provideDocumentFormattingEdits(model, { tabSize: 3, insertSpaces: true }, noCancel);
        if (!edits || edits.length == 0) return false;
        model.pushEditOperations([], edits.map(e => ({ range: e.range, text: e.text })), () => null);
        return true;
    }
}

export function escapeHtml(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
