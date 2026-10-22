/**
 * JPadBlox: Einzeiliges Eingabefeld mit Code Completion (Bedingungen im if-Dialog).
 *
 * Die Vorschläge gelten an der Stelle im Code, an der der Baustein eingefügt wird: ohne Punkt
 * die dort sichtbaren Variablen, Parameter, Attribute, Methoden und Klassen (wie im Editor);
 * nach einem Punkt die Attribute/Methoden des Typs links vom Punkt. Diesen Typ ermitteln wir
 * selbst aus der Symboltabelle (name., this.alter., Hund., bello.getName(). …), denn der Text
 * des Feldes steht ja noch nicht im Code.
 */

import * as monaco from "monaco-editor";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, placeholder as cmPlaceholder, tooltips } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { java } from "@codemirror/lang-java";
import { syntaxHighlighting } from "@codemirror/language";
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap, completionStatus } from "@codemirror/autocomplete";
import type { CompletionSource } from "@codemirror/autocomplete";
import { javaHighlight } from "./TouchEditor.js";
import { TokenType } from "../compiler/java/TokenType.js";
import { IJavaClass } from "../compiler/java/types/JavaClass.js";
import { IJavaInterface } from "../compiler/java/types/JavaInterface.js";
import { JavaEnum } from "../compiler/java/types/JavaEnum.js";
import { StaticNonPrimitiveType } from "../compiler/java/types/StaticNonPrimitiveType.js";
import { NonPrimitiveType } from "../compiler/java/types/NonPrimitiveType.js";
import { JavaArrayType } from "../compiler/java/types/JavaArrayType.js";
import { GenericTypeParameter } from "../compiler/java/types/GenericTypeParameter.js";
import { getVisibilityUpTo } from "../compiler/java/types/VisibilityTools.js";

export type FieldHandle = { value: () => string, focus: () => void, destroy: () => void, el: HTMLElement, view?: EditorView };

/** Ein Feld anlegen (im Element host). */
export function createConditionField(host: HTMLElement, o: {
    source: CompletionSource, value?: string, placeholder?: string,
    onChange?: () => void, onEnter?: () => void,
    /** Feld bekommt den Fokus (dann schreibt die Hilfsleiste hierhin) */
    onFocus?: (view: EditorView) => void
}): FieldHandle {
    const view = new EditorView({
        parent: host,
        state: EditorState.create({
            doc: o.value ?? "",
            extensions: [
                history(),
                java(),
                syntaxHighlighting(javaHighlight),
                closeBrackets(),
                cmPlaceholder(o.placeholder ?? ""),
                // Vorschlagsliste außerhalb des Dialogs zeichnen, sonst schneidet ihn der Dialog ab
                tooltips({ parent: document.body }),
                autocompletion({
                    override: [o.source],
                    activateOnTyping: true,
                    activateOnTypingDelay: 60,
                    icons: true,
                    maxRenderedOptions: 2000,
                    interactionDelay: 0,
                    optionClass: () => "jp-completion-option",
                }),
                keymap.of([
                    ...closeBracketsKeymap,
                    ...completionKeymap,
                    // Enter ohne offene Vorschlagsliste: Dialog bestätigen
                    { key: "Enter", run: (v) => { if (completionStatus(v.state) == "active") return false; o.onEnter?.(); return true; } },
                    ...defaultKeymap,
                    ...historyKeymap,
                ]),
                // nur eine Zeile
                EditorState.transactionFilter.of(tr => tr.newDoc.lines > 1 ? [] : tr),
                EditorView.contentAttributes.of({ autocapitalize: "off", autocorrect: "off", spellcheck: "false", enterkeyhint: "done" }),
                EditorView.theme({ ".cm-tooltip": { zIndex: "90" } }),
                // (CodeMirror setzt das class-Attribut selbst, deshalb nicht per classList)
                EditorView.editorAttributes.of({ class: "jp-condfield" }),
                EditorView.updateListener.of(u => { if (u.docChanged) o.onChange?.(); }),
                EditorView.domEventHandlers({ focus: (_e, v) => { o.onFocus?.(v); return false; } }),
            ]
        })
    });
    return {
        el: view.dom,
        view,
        value: () => view.state.doc.toString(),
        focus: () => { view.focus(); view.dispatch({ selection: { anchor: view.state.doc.length } }); },
        destroy: () => view.destroy(),
    };
}

// ---------------------------------------------------------------- Typ links vom Punkt

/** Index der öffnenden Klammer zur schließenden Klammer bei close (rückwärts gesucht), -1 wenn keine */
function openingBracket(s: string, close: number): number {
    const pair: Record<string, string> = { ")": "(", "]": "[" };
    let depth = 0;
    for (let i = close; i >= 0; i--) {
        const c = s[i];
        if (c == ")" || c == "]") depth++;
        else if (c == "(" || c == "[") { depth--; if (depth == 0) return pair[s[close]] == c ? i : -1; }
        else if (c == '"') { const q = s.lastIndexOf('"', i - 1); if (q < 0) return -1; i = q; }
    }
    return -1;
}

type Segment = { name: string, call: boolean, args: number, index: number, literal?: "String" };

function countArgs(inner: string): number {
    if (inner.trim() == "") return 0;
    let depth = 0, n = 1;
    for (let i = 0; i < inner.length; i++) {
        const c = inner[i];
        if (c == "(" || c == "[") depth++;
        else if (c == ")" || c == "]") depth--;
        else if (c == '"') { const q = inner.indexOf('"', i + 1); i = q < 0 ? inner.length : q; }
        else if (c == "," && depth == 0) n++;
    }
    return n;
}

/** Ausdruck vor dem Punkt in Glieder zerlegen: bello.getName() → [bello, getName()]. null, wenn nicht erkennbar */
export function splitChain(s: string): Segment[] | null {
    const segs: Segment[] = [];
    let i = s.replace(/\s+$/, "").length;
    for (; ;) {
        const end = i;
        let index = 0, call = false, args = 0;
        // Klammern/Indizes am Ende des Glieds: name(…)[…]
        while (i > 0 && (s[i - 1] == ")" || s[i - 1] == "]")) {
            const open = openingBracket(s, i - 1);
            if (open < 0) return null;
            if (s[i - 1] == "]") index++;
            else { call = true; args = countArgs(s.slice(open + 1, i - 1)); }
            i = open;
        }
        let k = i;
        while (k > 0 && /[\wäöüÄÖÜß]/.test(s[k - 1])) k--;
        if (k == i) {
            // Textliteral: "abc".
            if (end == i && s[i - 1] == '"') {
                const q = s.lastIndexOf('"', i - 2);
                if (q < 0) return null;
                segs.unshift({ name: "", call: false, args: 0, index: 0, literal: "String" });
                i = q;
            } else return null;
        } else {
            if (/^\d/.test(s.slice(k, i))) return null;
            segs.unshift({ name: s.slice(k, i), call, args, index });
            i = k;
        }
        let m = i;
        while (m > 0 && s[m - 1] == " ") m--;
        if (m > 0 && s[m - 1] == ".") { i = m - 1; while (i > 0 && s[i - 1] == " ") i--; continue; }
        // davor darf kein Teil eines Ausdrucks stehen, der den Typ ändert (z. B. „new“ oder ein Cast)
        return segs;
    }
}

function pickMethod(methods: any[], args: number): any {
    return methods.find(m => (m.parameters?.length ?? 0) == args) ?? methods[0];
}

function typeByName(compiler: any, name: string): any {
    return compiler?.moduleManager?.typestore?.getType(name) ?? compiler?.getType?.(name);
}

/** Typ des Ausdrucks vor dem Punkt (undefined, wenn er sich nicht bestimmen lässt) */
export function resolveChainType(segs: Segment[], symbolTable: any, classContext: any, compiler: any): any {
    let t: any;
    segs.forEach((seg, i) => {
        if (i > 0 && t == null) return;
        if (i == 0) {
            if (seg.literal) t = typeByName(compiler, "String");
            else if (seg.name == "this") t = classContext instanceof StaticNonPrimitiveType ? undefined : classContext;
            else if (seg.call) {
                const ms = classContext?.getPossibleMethods?.(seg.name, false, false) ?? [];
                t = ms.length ? pickMethod(ms, seg.args).returnParameterType : undefined;
            } else {
                const sym = symbolTable?.findSymbol?.(seg.name)?.symbol;
                if (sym?.type) t = sym.type;
                else {
                    const named = typeByName(compiler, seg.name);
                    t = named instanceof NonPrimitiveType ? new StaticNonPrimitiveType(named) : named instanceof StaticNonPrimitiveType ? named : undefined;
                }
            }
        } else {
            const isStatic = t instanceof StaticNonPrimitiveType;
            if (seg.call) {
                const ms = t.getPossibleMethods?.(seg.name, false, isStatic) ?? [];
                t = ms.length ? pickMethod(ms, seg.args).returnParameterType : undefined;
            } else if (t instanceof JavaArrayType) {
                t = undefined;     // length ist eine Zahl
            } else {
                const base = isStatic ? t.nonPrimitiveType : t;
                t = base?.getField?.(seg.name, TokenType.keywordPrivate, isStatic)?.type;
            }
        }
        // String-Attribute und -Variablen haben im Compiler den Grundtyp „string“; Methoden hat die Klasse String
        if (t?.isPrimitive && t.identifier == "string") t = typeByName(compiler, "String");
        // feld[i]
        for (let n = 0; n < seg.index && t != null; n++) {
            if (t instanceof JavaArrayType) t = t.dimension > 1 ? new JavaArrayType(t.elementType, t.dimension - 1, t.module, t.identifierRange) : t.elementType;
            else t = undefined;
        }
    });
    return t;
}

const RANGE: monaco.IRange = { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 };

/** Vorschläge nach dem Punkt für einen Typ (wie die Online-IDE in getCompletionItemsAfterDot) */
export function itemsForType(type: any, classContext: any, compiler: any): monaco.languages.CompletionItem[] {
    if (type instanceof IJavaClass || type instanceof StaticNonPrimitiveType || type instanceof JavaEnum) {
        return type.getCompletionItems(getVisibilityUpTo(type, classContext), false, "", RANGE, undefined);
    }
    if (type instanceof IJavaInterface || type instanceof GenericTypeParameter) {
        let items = type.getCompletionItems(TokenType.keywordPublic, false, "", RANGE, undefined);
        const obj = typeByName(compiler, "Object");
        if (obj?.getCompletionItems) items = items.concat(obj.getCompletionItems(TokenType.keywordPublic, false, "", RANGE, undefined));
        return items;
    }
    if (type instanceof JavaArrayType) {
        return [{ label: "length", kind: monaco.languages.CompletionItemKind.Field, insertText: "length", detail: "Anzahl der Elemente", range: RANGE }];
    }
    return [];
}
