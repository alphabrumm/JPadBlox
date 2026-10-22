import * as monaco from 'monaco-editor';
import type { Completion, CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import { startCompletion } from "@codemirror/autocomplete";
import { OwnNames, rankItem, matchesPrefix, isCallable, declaredMembersOfType } from "./CompletionOrder.js";
import { splitChain, resolveChainType, itemsForType } from "./ConditionField.js";
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
        return this.present(context, model, list.suggestions, from, requestPos, null);
    }

    /**
     * Vorschläge der Online-IDE in CodeMirror-Vorschläge umwandeln, ordnen und gruppieren.
     * field: Vorschläge für ein einzeiliges Eingabefeld (Bedingung im if-Dialog) statt für den Editor –
     * eingefügt wird dann nur im Feld; afterDot/declared/key kommen von dort.
     */
    private present(context: CompletionContext, model: monaco.editor.ITextModel, suggestions: monaco.languages.CompletionItem[],
        from: number, requestPos: number,
        field: { afterDot: boolean, declared: Set<string> | null, key: string } | null): CompletionResult | null {

        // Monaco sortiert nach sortText; CodeMirror nach Treffergüte + boost.
        const sorted = suggestions.slice().sort((a, b) =>
            (a.sortText || (typeof a.label == "string" ? a.label : a.label.label))
                .localeCompare(b.sortText || (typeof b.label == "string" ? b.label : b.label.label)));
        const n = sorted.length;

        const makeCompletion = (item: monaco.languages.CompletionItem, rank: number): Completion => {
            const label = typeof item.label == "string" ? item.label : item.label.label;
            const labelDetail = typeof item.label == "string" ? undefined : (item.label.detail || item.label.description);

            let range: monaco.IRange | undefined = undefined;
            if (item.range && !field) {
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
                    if (field) {
                        // Eingabefeld: nur das getippte Wort ersetzen
                        if (rawSnippet && hasSnippetFields(insertText)) snippet(convertSnippet(insertText))(view, _c, _from, to);
                        else view.dispatch({ changes: { from: _from, to, insert: insertText }, selection: { anchor: _from + insertText.length }, userEvent: "input.complete" });
                        return;
                    }
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
        };

        // „insert constructor“ der Online-IDE nie anbieten
        const usable = sorted.filter(item => {
            const l = typeof item.label == "string" ? "" : (item.label.detail || item.label.description || "");
            return !/insert constructor/i.test(l) && !/insert constructor/i.test(item.detail || "");
        });
        if (usable.length == 0) return null;

        if (!this.ordering) {
            return {
                from,
                options: usable.map((item, rank) => makeCompletion(item, rank)),
                validFor: /^[\wäöüÄÖÜß@]*$/
            };
        }

        // JPadBlox: eigene Reihenfolge und Gruppen (siehe CompletionOrder.ts)
        const typed = context.state.sliceDoc(from, requestPos);
        const afterDot = field ? field.afterDot : context.state.sliceDoc(Math.max(0, from - 1), from) == ".";
        const afterNew = !field && /\bnew\s+$/.test(context.state.sliceDoc(context.state.doc.lineAt(from).from, from));
        const own = this.ordering.ownNames();
        const declared = field ? field.declared : afterDot ? this.ordering.declaredMembers(model, from - 1) : null;
        const key = field ? field.key : model.uri.toString() + ":" + from;
        if (this.expandedKey != key) this.expandedKey = null;
        const ranked = usable
            .map(item => {
                const label = typeof item.label == "string" ? item.label : item.label.label;
                const r = rankItem(item.kind, label, afterDot, own, declared);
                return { item, label, ...r };
            })
            .filter(r => matchesPrefix(r.label, r.item.filterText, typed))
            // Konstruktoren wie Methoden aufrufen („Hund()“) ergibt nur nach „new“ Sinn
            .filter(r => afterDot || afterNew || !(isCallable(r.item.kind) && /^[A-ZÄÖÜ]/.test(r.label) && /\(/.test(r.label)))
            .sort((a, b) => a.group - b.group || a.label.localeCompare(b.label, "de", { sensitivity: "base" }));
        if (ranked.length == 0) return null;
        const main = ranked.filter(r => r.group < 9);
        const more = ranked.filter(r => r.group >= 9);
        // Nichts Eigenes passt (z. B. beim Tippen von „whi“): gleich alles zeigen, ohne Klappzeile
        const showAll = main.length == 0 || this.expandedKey == key;
        const options: Completion[] = main.map((r, i) => makeCompletion(r.item, i));
        if (more.length > 0 && main.length > 0) {
            const title = afterDot ? "Geerbte Symbole" : "Weitere Vorschläge";
            options.push({
                label: typed,
                displayLabel: `${showAll ? "▾" : "▸"} ${title} (${more.length})`,
                type: "jp-toggle",
                detail: showAll ? "zuklappen" : "aufklappen",
                apply: (view: EditorView) => {
                    this.expandedKey = showAll ? null : key;
                    setTimeout(() => startCompletion(view), 0);
                }
            });
        }
        if (showAll) more.forEach((r, i) => options.push(makeCompletion(r.item, main.length + i)));
        return { from, options, filter: false };
    }

    /**
     * JPadBlox: Vorschläge für ein einzeiliges Eingabefeld (Bedingung im if-Dialog). Es gelten die
     * Namen, die an der Stelle anchor im Code sichtbar sind; der Text des Feldes steht nicht im Code.
     */
    fieldCompletionSource(anchor: number) {
        return async (context: CompletionContext): Promise<CompletionResult | null> => {
            const model = this.getModel();
            if (!model) return null;
            const word = context.matchBefore(/[\wäöüÄÖÜß]*/);
            const from = word ? word.from : context.pos;
            const before = context.state.sliceDoc(0, from);
            const afterDot = /\.\s*$/.test(before);
            if (!context.explicit && from == context.pos && !afterDot) return null;
            if (word && /^\d/.test(word.text)) return null;
            // im Textliteral keine Vorschläge
            if ((before.replace(/\\./g, "").match(/"/g) ?? []).length % 2 == 1) return null;

            const main: any = (this.completionProvider as any).findMainForModel?.(model);
            let module: any = main?.getCurrentWorkspace()?.getModuleForMonacoModel(model);
            if (module?.isMoreThanOneVersionAheadOfLastCompilation?.()) {
                await main.getCompiler().waitTillCompilationFinished();
                module = main.getCurrentWorkspace()?.getModuleForMonacoModel(model);
            }
            if (!module) return null;
            const p = model.getPositionAt(anchor);
            const position = new monaco.Position(p.lineNumber, p.column);
            let items: monaco.languages.CompletionItem[] = [];
            let declared: Set<string> | null = null;
            try {
                if (!afterDot) {
                    const list = await this.completionProvider.provideCompletionItems(model, position, { triggerKind: 0 } as any, noCancel);
                    // Anweisungs-Vorlagen (if, while, println …) passen nicht in eine Bedingung
                    items = (list?.suggestions ?? []).filter(it => it.kind != monaco.languages.CompletionItemKind.Snippet);
                } else {
                    const segs = splitChain(before.replace(/\s*\.\s*$/, ""));
                    if (!segs) return null;
                    const table = module.findSymbolTableAtPosition(position);
                    const type = resolveChainType(segs, table, table?.classContext, main.getCompiler());
                    if (!type) return null;
                    items = itemsForType(type, table?.classContext, main.getCompiler());
                    items = (this.completionProvider as any).deleteDoublesWithIdenticalInsertText?.(items) ?? items;
                    declared = declaredMembersOfType(type);
                }
            } catch (e) {
                console.warn("Vervollständigung im Feld fehlgeschlagen", e);
                return null;
            }
            if (items.length == 0 || context.aborted) return null;
            return this.present(context, model, items, from, context.pos,
                { afterDot, declared, key: "field:" + anchor + ":" + before });
        };
    }

    /** JPadBlox: Reihenfolge der Vorschläge (von App gesetzt) */
    ordering: { ownNames: () => OwnNames, declaredMembers: (model: monaco.editor.ITextModel, dotOffset: number) => Set<string> | null } | null = null;
    /** Wortanfang, an dem die zugeklappten Vorschläge gerade aufgeklappt sind */
    private expandedKey: string | null = null;

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
