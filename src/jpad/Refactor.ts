/**
 * JPadBlox: „Umbenennen“ (Refactor-Knopf in der Kopfzeile).
 *
 * Sammelt alle Variablen (Attribute, Parameter, lokale Variablen), Methoden und Klassen des Projekts
 * aus dem Compiler (dieselben Verwendungsstellen, die auch die Online-IDE für „Umbenennen“ nutzt)
 * und ersetzt beim Umbenennen jede Stelle in allen Dateien.
 */

import * as monaco from "monaco-editor";
import { JPadMain } from "./JPadMain.js";
import { GUIFile } from "../client/workspace/File.js";
import { JavaCompiledModule } from "../compiler/java/module/JavaCompiledModule.js";
import { IJavaClass } from "../compiler/java/types/JavaClass.js";
import { IJavaInterface } from "../compiler/java/types/JavaInterface.js";
import { JavaEnum } from "../compiler/java/types/JavaEnum.js";
import { JavaField } from "../compiler/java/types/JavaField.js";
import { JavaMethod } from "../compiler/java/types/JavaMethod.js";
import { JavaParameter } from "../compiler/java/types/JavaParameter.js";
import { JavaLocalVariable } from "../compiler/java/codegenerator/JavaLocalVariable.js";

export type SymbolKind = "variable" | "method" | "class";

export type RenameCandidate = {
    id: string;
    kind: SymbolKind;
    name: string;
    /** Zusatz im Auswahlmenü, z. B. „Attribut von Hund“ */
    detail: string;
    symbol: any;
};

const KEYWORDS = new Set(("abstract assert boolean break byte case catch char class const continue default do double else enum "
    + "extends final finally float for goto if implements import instanceof int interface long native new package private "
    + "protected public return short static strictfp super switch synchronized this throw throws transient try void volatile "
    + "while var record true false null").split(" "));

/** Klasse, zu der das Symbol gehört – undefined bei Code außerhalb von Klassen (z. B. im Hauptprogramm) */
function ownerName(sym: any): string | undefined {
    const o: string | undefined = sym?.classEnum?.identifier ?? sym?.classEnumInterface?.identifier;
    return o && !o.startsWith("$") ? o : undefined;
}

function fileOf(sym: any): string {
    const name: string = sym?.module?.file?.name ?? "";
    return name.replace(/\.java$/, "");
}

/** Alle umbenennbaren Symbole des Projekts (nur aus eigenen Dateien, ohne Bibliotheksklassen). */
export function collectCandidates(main: JPadMain): RenameCandidate[] {
    const seen = new Map<any, RenameCandidate>();
    const compiler: any = main.getCompiler();
    const modules: JavaCompiledModule[] = compiler?.getAllModules?.() ?? [];
    let n = 0;
    for (const module of modules) {
        const tracker: any = (module as any).compiledSymbolsUsageTracker;
        const map: Map<any, any[]> | undefined = tracker?.symbolToUsagePositionListMap;
        if (!map) continue;
        for (let sym of map.keys()) {
            if (sym instanceof JavaMethod && sym.isConstructor) sym = sym.classEnumInterface;
            if (!sym || seen.has(sym) || !sym.identifier) continue;
            // vom Compiler erzeugte Symbole (Hauptprogramm-Klasse, $main, args …) nicht anbieten
            if (sym.identifier.startsWith("$") || !(sym.identifierRange?.startLineNumber >= 1)) continue;
            // nur Symbole aus eigenen Dateien
            if (!(sym.module?.file instanceof GUIFile)) continue;
            let kind: SymbolKind | undefined;
            let detail = "";
            if (sym instanceof IJavaClass || sym instanceof IJavaInterface || sym instanceof JavaEnum) {
                kind = "class";
                detail = sym instanceof JavaEnum ? "Enum" : sym instanceof IJavaInterface ? "Interface" : "Klasse";
            } else if (sym instanceof JavaMethod) {
                kind = "method";
                const owner = ownerName(sym);
                detail = owner ? `Methode von ${owner}` : `Methode in ${fileOf(sym)}`;
            } else if (sym instanceof JavaField) {
                kind = "variable";
                const owner = ownerName(sym);
                // Variablen außerhalb von Klassen legt der Compiler als Attribute einer versteckten Klasse an
                detail = owner ? `Attribut von ${owner}` : `Variable in ${fileOf(sym)}, Zeile ${sym.identifierRange?.startLineNumber}`;
            } else if (sym instanceof JavaParameter) {
                kind = "variable";
                detail = `Parameter in ${fileOf(sym)}, Zeile ${sym.identifierRange?.startLineNumber}`;
            } else if (sym instanceof JavaLocalVariable) {
                kind = "variable";
                detail = `Variable in ${fileOf(sym)}, Zeile ${sym.identifierRange?.startLineNumber}`;
            }
            if (!kind) continue;
            seen.set(sym, { id: "s" + (n++), kind, name: sym.identifier, detail, symbol: sym });
        }
    }
    const order: Record<SymbolKind, number> = { variable: 0, method: 1, class: 2 };
    return [...seen.values()].sort((a, b) =>
        order[a.kind] - order[b.kind]
        || a.name.localeCompare(b.name, "de", { sensitivity: "base" })
        || a.detail.localeCompare(b.detail, "de"));
}

/** Prüft den neuen Namen; liefert eine Fehlermeldung oder null. */
export function validateNewName(c: RenameCandidate, newName: string, all: RenameCandidate[]): string | null {
    const n = newName.trim();
    if (n.length == 0) return "Bitte gib einen neuen Namen ein.";
    if (!/^[A-Za-zÄÖÜäöü_][A-Za-z0-9ÄÖÜäöüß_]*$/.test(n)) return "Ein Name beginnt mit einem Buchstaben und enthält nur Buchstaben, Ziffern und _ (keine Leerzeichen).";
    if (KEYWORDS.has(n)) return `„${n}“ ist ein Schlüsselwort von Java und kann kein Name sein.`;
    if (n == c.name) return "Der neue Name ist derselbe wie der alte.";
    if (c.kind == "class" && all.some(o => o.kind == "class" && o.name == n)) return `Es gibt schon eine Klasse „${n}“.`;
    return null;
}

/**
 * Benennt um: ersetzt alle Verwendungsstellen in allen Dateien. Heißt eine Datei wie die
 * umbenannte Klasse, bekommt sie den neuen Namen. Liefert die Zahl der geänderten Stellen.
 */
export function renameSymbol(main: JPadMain, c: RenameCandidate, newName: string): number {
    const compiler: any = main.getCompiler();
    const modules: JavaCompiledModule[] = compiler?.getAllModules?.() ?? [];
    const byFile = new Map<GUIFile, monaco.IRange[]>();
    const seen = new Set<string>();
    for (const module of modules) {
        const ups = module.getUsagePositionsForSymbol(c.symbol) ?? [];
        for (const up of ups) {
            if (!(up.file instanceof GUIFile) || !up.range) continue;
            const id = up.file.name + "_" + up.range.startLineNumber + "_" + up.range.startColumn;
            if (seen.has(id)) continue;
            seen.add(id);
            if (!byFile.has(up.file)) byFile.set(up.file, []);
            byFile.get(up.file)!.push(up.range);
        }
    }
    let count = 0;
    for (const [file, ranges] of byFile) {
        const model = file.getMonacoModel();
        if (!model) continue;
        // nur Stellen, an denen wirklich der alte Name steht (Schutz vor verschobenen Bereichen)
        const edits = ranges
            .filter(r => model.getValueInRange(r) == c.name)
            .map(r => ({ range: r, text: newName }));
        if (edits.length == 0) continue;
        model.pushEditOperations([], edits, () => null);
        count += edits.length;
    }
    if (c.kind == "class") {
        const file = main.getFiles().find(f => f.name == c.name + ".java");
        if (file && !main.getFiles().some(f => f.name == newName + ".java")) main.renameFile(file, newName + ".java");
    }
    return count;
}

/**
 * Welches Symbol berührt der Cursor bzw. die Markierung? Liefert die id des passenden Eintrags
 * aus `all` (oder undefined). Konstruktoren zählen als ihre Klasse.
 */
export function candidateAt(main: JPadMain, all: RenameCandidate[], model: monaco.editor.ITextModel, from: number, to: number): string | undefined {
    try {
        const module: any = main.getCurrentWorkspace()?.getModuleForMonacoModel(model);
        const tracker = module?.compiledSymbolsUsageTracker;
        if (!tracker) return undefined;
        for (const off of [from, to, Math.max(0, from - 1)]) {
            const p = model.getPositionAt(off);
            const up = tracker.findSymbolAtPosition(new monaco.Position(p.lineNumber, p.column));
            let sym = up?.symbol;
            if (!sym) continue;
            if (sym instanceof JavaMethod && sym.isConstructor) sym = sym.classEnumInterface;
            const hit = all.find(c => c.symbol === sym) ?? all.find(c => c.name == sym.identifier && c.kind == (sym instanceof JavaMethod ? "method" : c.kind));
            if (hit) return hit.id;
        }
    } catch (e) { }
    return undefined;
}
