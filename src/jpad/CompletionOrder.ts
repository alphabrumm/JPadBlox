/**
 * JPadBlox: Reihenfolge und Gruppen der Autovervollständigung.
 *
 * Ohne Punkt:  eigene Variablen → eigene Methoden → eigene Klassen → Grundtypen → print/println,
 *              danach (zugeklappt) „Weitere Vorschläge“: Schlüsselwörter, Klassenbibliothek …
 * Nach Punkt:  Attribute → Methoden, die die Klasse des Objekts selbst festlegt,
 *              danach (zugeklappt) „Geerbte Symbole“.
 * Der Vorschlag „insert constructor“ der Online-IDE erscheint nie.
 */

import * as monaco from "monaco-editor";
import { JPadMain } from "./JPadMain.js";
import { IJavaClass } from "../compiler/java/types/JavaClass.js";
import { JavaEnum } from "../compiler/java/types/JavaEnum.js";
import { collectCandidates } from "./Refactor.js";
import { GUIFile } from "../client/workspace/File.js";

export const BASIC_TYPES = ["String", "Integer", "Double", "Boolean", "Character"];
const BASIC_FUNCTIONS = ["println", "print"];

export type OwnNames = { methods: Set<string>, types: Set<string> };

/** Namen der Methoden und Klassen, die im Projekt selbst geschrieben wurden */
export function ownNames(main: JPadMain): OwnNames {
    const methods = new Set<string>(), types = new Set<string>();
    try {
        for (const c of collectCandidates(main)) {
            if (c.kind == "method") methods.add(c.name);
            else if (c.kind == "class") types.add(c.name);
        }
    } catch (e) { /* noch nicht übersetzt */ }
    return { methods, types };
}

/**
 * Namen der Attribute und Methoden, die der Typ links vom Punkt selbst deklariert
 * (alles andere ist geerbt). null, wenn der Typ nicht bekannt ist.
 */
export function declaredMembers(main: JPadMain, model: monaco.editor.ITextModel, dotOffset: number): Set<string> | null {
    try {
        const module: any = main.getCurrentWorkspace()?.getModuleForMonacoModel(model);
        if (!module?.getTypeAtPosition) return null;
        const p = model.getPositionAt(dotOffset);
        const type: any = module.getTypeAtPosition(p.lineNumber, p.column);
        return declaredMembersOfType(type);
    } catch (e) {
        return null;
    }
}

/** Wie declaredMembers, aber für einen schon bekannten Typ (z. B. aus dem if-Dialog) */
export function declaredMembersOfType(type: any): Set<string> | null {
    try {
        // auch statischer Zugriff (Klassenname.) zählt
        const t = type?.nonPrimitiveType ?? type;
        if (!(t instanceof IJavaClass || t instanceof JavaEnum)) return null;
        const own = new Set<string>();
        // Eigene Klassen: nur, was wirklich im Quelltext steht (die Online-IDE ergänzt z. B. class, toJson, fromJson)
        const fromSource = t.module?.file instanceof GUIFile;
        const inSource = (s: any) => !fromSource || s.identifierRange?.startLineNumber >= 1;
        for (const f of (t as any).getFields?.() ?? []) if (inSource(f)) own.add(f.identifier);
        for (const m of (t as any).getOwnMethods?.() ?? []) if (!m.isConstructor && inSource(m)) own.add(m.identifier);
        return own;
    } catch (e) {
        return null;
    }
}

export type Ranked<T> = { item: T, group: number, name: string, inherited: boolean };

const K = () => monaco.languages.CompletionItemKind;

export function isCallable(kind: monaco.languages.CompletionItemKind): boolean {
    const k = K();
    return kind == k.Method || kind == k.Function || kind == k.Constructor;
}

function identOf(label: string): string {
    return /^[\wäöüÄÖÜß@]+/.exec(label)?.[0] ?? label;
}

/**
 * Ordnet einen Vorschlag einer Gruppe zu (kleinere Zahl = weiter oben).
 * Gruppe 9 = zugeklappt („Weitere Vorschläge“ bzw. „Geerbte Symbole“).
 */
export function rankItem(kind: monaco.languages.CompletionItemKind, label: string, afterDot: boolean,
    own: OwnNames, declared: Set<string> | null): { group: number, inherited: boolean } {
    const k = K();
    const name = identOf(label);
    const isField = kind == k.Field || kind == k.Property || kind == k.Variable || kind == k.Constant || kind == k.EnumMember;
    const isMethod = kind == k.Method || kind == k.Function || kind == k.Constructor;
    if (afterDot) {
        const inherited = declared != null && !declared.has(name);
        if (inherited) return { group: 9, inherited: true };
        if (isField) return { group: 0, inherited: false };
        if (isMethod) return { group: 1, inherited: false };
        return { group: 2, inherited: false };
    }
    // print/println sind in der Online-IDE Snippets
    if (BASIC_FUNCTIONS.includes(name)) return { group: 4, inherited: false };
    if (isField) return { group: 0, inherited: false };
    if (isMethod) {
        if (own.methods.has(name)) return { group: 1, inherited: false };
        return { group: 9, inherited: false };
    }
    if (kind == k.Class || kind == k.Interface || kind == k.Enum || kind == k.Struct) {
        if (own.types.has(name)) return { group: 2, inherited: false };
        if (BASIC_TYPES.includes(name)) return { group: 3, inherited: false };
        return { group: 9, inherited: false };
    }
    return { group: 9, inherited: false };
}

/** Passt der Vorschlag zum getippten Wortanfang? (Groß-/Kleinschreibung egal) */
export function matchesPrefix(label: string, filterText: string | undefined, typed: string): boolean {
    if (typed == "") return true;
    const t = typed.toLocaleLowerCase();
    return label.toLocaleLowerCase().startsWith(t) || (filterText ?? "").toLocaleLowerCase().startsWith(t);
}
