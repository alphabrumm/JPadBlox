import { JPadMain } from "./JPadMain.js";
import { escapeHtml } from "./LanguageBridge.js";
import { icon } from "./Icons.js";
import { GUIFile } from "../client/workspace/File.js";
import { JavaCompiledModule } from "../compiler/java/module/JavaCompiledModule.js";
import { GenericVariantOfJavaClass, IJavaClass, JavaClass } from "../compiler/java/types/JavaClass.js";
import { GenericVariantOfJavaInterface, IJavaInterface, JavaInterface } from "../compiler/java/types/JavaInterface.js";
import { JavaEnum } from "../compiler/java/types/JavaEnum.js";
import { JavaArrayType } from "../compiler/java/types/JavaArrayType.js";
import { JavaField } from "../compiler/java/types/JavaField.js";
import { JavaMethod } from "../compiler/java/types/JavaMethod.js";
import { TokenType } from "../compiler/java/TokenType.js";
import { SystemModule } from "../compiler/java/runtime/system/SystemModule.js";
import { DebuggerCallstackEntry } from "../compiler/common/debugger/DebuggerCallstackEntry.js";
import { SchedulerState } from "../compiler/common/interpreter/SchedulerState.js";

/**
 * Diagramm-Ansicht von JPad.
 *
 * Klassenansicht: alle Klassen, Interfaces und Enums des Projekts als UML-Klassenkarten
 * (eckig) mit Attributen, Methoden, Vererbung, Interface-Realisierung und Assoziationen mit
 * Rollenname und Kardinalität.
 *
 * Objektansicht: zur Laufzeit alle erreichbaren Objekte eigener Klassen als Objektkarten
 * (abgerundet) mit ihren Attributwerten und Verweisen. Ausgangspunkt sind – wie in der
 * Variablenansicht – die Variablen auf dem Programmstack und die statischen Attribute.
 */

type Mode = "classes" | "objects";

type Card = {
    key: string;
    html: string;
    kind: "class" | "object";
    rank: number;          // Zeile im automatischen Layout
    parentKey?: string;    // für die Anordnung unter der Oberklasse / dem Besitzer
};

type Edge = {
    from: string;
    to: string;
    kind: "extends" | "implements" | "association" | "link";
    label?: string;        // Rollenname bzw. Attributname
    multiplicity?: string; // Kardinalität am Ziel
};

type Pos = { x: number, y: number };

const GAP_X = 70, GAP_Y = 90, MARGIN = 28;
const MAX_OBJECTS = 80;

function visibilitySymbol(v: any): string {
    switch (v) {
        case TokenType.keywordPrivate: return "−";
        case TokenType.keywordProtected: return "#";
        case TokenType.keywordPublic: return "+";
        default: return "~";
    }
}

function typeName(t: any): string {
    try { return t ? t.toString() : "?"; } catch (e) { return t?.identifier ?? "?"; }
}

export class DiagramView {

    mode: Mode = "classes";
    private el: Record<string, HTMLElement> = {};
    private zoom = 1;
    private visible = false;
    private positions: Map<string, Pos> = new Map();     // aktuelle Kartenpositionen
    private sizes: Map<string, { w: number, h: number }> = new Map();
    private edges: Edge[] = [];
    private objectIds = new WeakMap<object, number>();
    private nextObjectId = 1;
    private objectPositions: Map<string, Pos> = new Map(); // bleibt über Schritte hinweg erhalten
    private lastObjectSnapshot: { cards: Card[], edges: Edge[], status: string } | null = null;
    private refreshTimer: any;
    private runTimer: any;

    constructor(private host: HTMLElement, private main: JPadMain,
        private getProjectId: () => string,
        private jumpTo: (file: GUIFile, line: number, column: number) => void) {

        host.innerHTML = `
            <div class="jp-diagram-bar">
                <div class="jp-segmented jp-diagram-mode" role="group" aria-label="Diagrammart">
                    <button data-mode="classes" aria-pressed="true"><span>Klassen</span></button>
                    <button data-mode="objects" aria-pressed="false"><span>Objekte</span></button>
                </div>
                <span class="jp-diagram-status" data-ref="status"></span>
                <div class="jp-diagram-tools">
                    <button class="jp-iconbtn" data-act="relayout" aria-label="Neu anordnen" title="Neu anordnen">${icon("relayout")}</button>
                    <button class="jp-iconbtn" data-act="zoomout" aria-label="Verkleinern" title="Verkleinern">${icon("minus")}</button>
                    <button class="jp-iconbtn" data-act="fit" aria-label="Alles einpassen" title="Alles einpassen">${icon("fit")}</button>
                    <button class="jp-iconbtn" data-act="zoomin" aria-label="Vergrößern" title="Vergrößern">${icon("plus")}</button>
                </div>
            </div>
            <div class="jp-diagram-viewport" data-ref="viewport">
                <div class="jp-diagram-stage" data-ref="stage">
                    <svg class="jp-diagram-svg" data-ref="svg" xmlns="http://www.w3.org/2000/svg"></svg>
                    <div class="jp-diagram-cards" data-ref="cards"></div>
                </div>
                <div class="jp-diagram-empty" data-ref="empty" hidden></div>
            </div>`;
        host.querySelectorAll<HTMLElement>("[data-ref]").forEach(e => this.el[e.dataset.ref!] = e);

        host.querySelectorAll<HTMLElement>("[data-mode]").forEach(b => b.addEventListener("click", () => {
            this.setMode(<Mode>b.dataset.mode);
        }));
        host.querySelector("[data-act=relayout]")!.addEventListener("click", () => this.relayout());
        host.querySelector("[data-act=zoomin]")!.addEventListener("click", () => this.setZoom(this.zoom * 1.2));
        host.querySelector("[data-act=zoomout]")!.addEventListener("click", () => this.setZoom(this.zoom / 1.2));
        host.querySelector("[data-act=fit]")!.addEventListener("click", () => this.fit());

        // Pinch-Zoom (Safari auf iPad/iPhone)
        let startZoom = 1;
        this.el.viewport.addEventListener("gesturestart", (e: any) => { e.preventDefault(); startZoom = this.zoom; });
        this.el.viewport.addEventListener("gesturechange", (e: any) => { e.preventDefault(); this.setZoom(startZoom * e.scale); });
        // Strg/⌘ + Mausrad bzw. Trackpad-Pinch auf dem Mac
        this.el.viewport.addEventListener("wheel", e => {
            if (!e.ctrlKey && !e.metaKey) return;
            e.preventDefault();
            this.setZoom(this.zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08));
        }, { passive: false });

        try {
            this.mode = <Mode>(localStorage.getItem("jpad.diagram.mode") || "classes");
            this.zoom = parseFloat(localStorage.getItem("jpad.diagram.zoom") || "1") || 1;
        } catch (e) { }
        this.updateModeButtons();

        main.getInterpreter().eventManager.on("stateChanged", (_o: SchedulerState, state: SchedulerState) => {
            if (this.mode != "objects") return;
            clearInterval(this.runTimer);
            if (state == SchedulerState.running) {
                // Während das Programm läuft regelmäßig nachsehen
                this.runTimer = setInterval(() => { if (this.visible) this.refresh(); }, 600);
            }
            this.refreshSoon(state == SchedulerState.paused ? 30 : 80);
        });
    }

    // =====================================================================
    // Öffentliche Schnittstelle
    // =====================================================================

    setVisible(v: boolean) {
        this.visible = v;
        if (v) this.refreshSoon(10);
    }

    /** Nach dem Kompilieren (Klassen könnten sich geändert haben) */
    onCompiled() {
        if (this.mode == "classes") this.refreshSoon(250);
    }

    refreshSoon(ms = 100) {
        if (!this.visible) return;
        clearTimeout(this.refreshTimer);
        this.refreshTimer = setTimeout(() => this.refresh(), ms);
    }

    private setMode(m: Mode) {
        this.mode = m;
        try { localStorage.setItem("jpad.diagram.mode", m); } catch (e) { }
        this.updateModeButtons();
        this.refresh();
    }

    private updateModeButtons() {
        this.host.querySelectorAll<HTMLElement>("[data-mode]").forEach(b =>
            b.setAttribute("aria-pressed", String(b.dataset.mode == this.mode)));
        this.host.dataset.mode = this.mode;
    }

    private setZoom(z: number) {
        this.zoom = Math.max(0.3, Math.min(2.5, z));
        try { localStorage.setItem("jpad.diagram.zoom", String(this.zoom)); } catch (e) { }
        this.applyZoom();
    }

    // =====================================================================
    // Aufbau
    // =====================================================================

    refresh() {
        if (!this.visible) return;
        try {
            if (this.mode == "classes") this.renderClasses();
            else this.renderObjects();
        } catch (e) {
            console.error("Diagramm:", e);
        }
    }

    private getUserTypes(): (JavaClass | JavaInterface | JavaEnum)[] {
        const result: (JavaClass | JavaInterface | JavaEnum)[] = [];
        const compiler = this.main.getCompiler();
        for (const file of this.main.getFiles()) {
            const module = <JavaCompiledModule>compiler.findModuleByFile(file);
            if (!module?.types) continue;
            for (const t of module.types) {
                if (t instanceof JavaClass && t.isMainClass) continue;
                if (t instanceof JavaClass || t instanceof JavaInterface || t instanceof JavaEnum) result.push(t);
            }
        }
        return result;
    }

    // ---------------------------------------------------------------------
    // Klassenansicht
    // ---------------------------------------------------------------------

    private renderClasses() {
        const types = this.getUserTypes();
        const names = new Set(types.map(t => t.identifier));
        this.el.status.textContent = types.length == 0 ? "" : `${types.length} ${types.length == 1 ? "Klasse" : "Klassen"}`;

        if (types.length == 0) {
            this.showEmpty(`${icon("diagram")}<p>Noch keine Klassen.</p>
                <p class="jp-hint">Lege mit „+ Klasse“ eine Klasse an oder schreibe <code>class Name { … }</code> in dein Programm.</p>`);
            return;
        }

        const cards: Card[] = [];
        const edges: Edge[] = [];
        const rankOf = new Map<string, number>();

        const superOf = (t: any): string[] => {
            const r: string[] = [];
            if (t instanceof JavaClass) {
                const ext = t.getExtends();
                if (ext && names.has(ext.identifier)) r.push(ext.identifier);
                for (const i of t.getImplements()) if (names.has(i.identifier)) r.push(i.identifier);
            } else if (t instanceof JavaInterface) {
                for (const i of t.getExtends()) if (names.has(i.identifier)) r.push(i.identifier);
            }
            return r;
        };
        const byName = new Map(types.map(t => [t.identifier, t]));
        const computeRank = (n: string, seen: Set<string>): number => {
            if (rankOf.has(n)) return rankOf.get(n)!;
            if (seen.has(n)) return 0;
            seen.add(n);
            const parents = superOf(byName.get(n));
            const r = parents.length == 0 ? 0 : 1 + Math.max(...parents.map(p => computeRank(p, seen)));
            rankOf.set(n, r);
            return r;
        };

        for (const t of types) {
            const parents = superOf(t);
            cards.push({ key: "c:" + t.identifier, html: this.classCardHtml(t), kind: "class", rank: computeRank(t.identifier, new Set()), parentKey: parents[0] ? "c:" + parents[0] : undefined });

            if (t instanceof JavaClass) {
                const ext = t.getExtends();
                if (ext && names.has(ext.identifier)) edges.push({ from: "c:" + t.identifier, to: "c:" + ext.identifier, kind: "extends" });
                for (const i of t.getImplements()) {
                    if (names.has(i.identifier)) edges.push({ from: "c:" + t.identifier, to: "c:" + i.identifier, kind: "implements" });
                }
            }
            if (t instanceof JavaInterface) {
                for (const i of t.getExtends()) {
                    if (names.has(i.identifier)) edges.push({ from: "c:" + t.identifier, to: "c:" + i.identifier, kind: "extends" });
                }
            }
            if (t instanceof JavaClass) {
                for (const f of t.getFields()) {
                    const a = this.association(f, names);
                    if (a) edges.push({ from: "c:" + t.identifier, to: "c:" + a.target, kind: "association", label: f.identifier, multiplicity: a.multiplicity });
                }
            }
        }

        this.draw(cards, edges, "classes");
    }

    /** Liefert Ziel und Kardinalität, falls das Attribut auf eine eigene Klasse verweist */
    private association(f: JavaField, names: Set<string>): { target: string, multiplicity: string } | null {
        if (f.isStatic()) return null;
        let type: any = f.type;
        let many = false;
        while (type instanceof JavaArrayType) { type = type.elementType; many = true; }
        if (type instanceof GenericVariantOfJavaClass || type instanceof GenericVariantOfJavaInterface) {
            // Sammlungen wie ArrayList<Hund>, List<Hund>, HashMap<String, Hund>
            let inner: any = null;
            type.typeMap.forEach((v: any) => { if (v && names.has(v.identifier)) inner = v; });
            if (inner) { type = inner; many = true; }
        }
        if (!type || !names.has(type.identifier)) return null;
        return { target: type.identifier, multiplicity: many ? "*" : "1" };
    }

    private classCardHtml(t: JavaClass | JavaInterface | JavaEnum): string {
        const isInterface = t instanceof JavaInterface;
        const isEnum = t instanceof JavaEnum;
        const isAbstract = t instanceof JavaClass && t.isAbstract();
        const stereotype = isInterface ? "«interface»" : isEnum ? "«enumeration»" : isAbstract ? "«abstract»" : "";
        const name = escapeHtml(t.identifier);

        let fieldsHtml = "", constantsHtml = "";
        if (t instanceof JavaClass || t instanceof JavaEnum) {
            const fields = t.getFields().filter(f => f.type?.identifier != "Class" && !f.hiddenWhenDebugging);
            for (const f of fields) {
                if (isEnum && f.isStatic() && f.type == <any>t) {
                    constantsHtml += `<li data-jump="${f.identifierRange?.startLineNumber ?? ""}">${escapeHtml(f.identifier)}</li>`;
                    continue;
                }
                const cls = f.isStatic() ? ' class="is-static"' : "";
                fieldsHtml += `<li${cls} data-jump="${f.identifierRange?.startLineNumber ?? ""}"><span class="jp-uml-vis">${visibilitySymbol(f.visibility)}</span> ${escapeHtml(f.identifier)}<span class="jp-uml-type">: ${escapeHtml(typeName(f.type))}</span></li>`;
            }
        }

        const hidden = ["toJson", "fromJson", "values", "valueOf", "ordinal", "name"];
        let methodsHtml = "";
        const methods: JavaMethod[] = (<any>t).getOwnMethods ? (<any>t).getOwnMethods() : [];
        for (const m of methods) {
            if (m.isConstructor && m.identifier != t.identifier) continue;
            if (hidden.indexOf(m.identifier) >= 0 && (isEnum || m.identifier.endsWith("Json"))) continue;
            if (!m.identifierRange || m.identifierRange.startLineNumber < 1) continue; // generierte Methoden
            const params = m.parameters.map(p => `${escapeHtml(p.identifier)}: ${escapeHtml(typeName(p.type))}`).join(", ");
            const ret = m.isConstructor || !m.returnParameterType || m.returnParameterType.identifier == "void" ? "" : `<span class="jp-uml-type">: ${escapeHtml(typeName(m.returnParameterType))}</span>`;
            const cls = [m.isStatic ? "is-static" : "", (m.isAbstract || isInterface) ? "is-abstract" : ""].filter(Boolean).join(" ");
            methodsHtml += `<li class="${cls}" data-jump="${m.identifierRange.startLineNumber}"><span class="jp-uml-vis">${visibilitySymbol(m.visibility)}</span> ${escapeHtml(m.identifier)}(${params})${ret}</li>`;
        }

        return `<header data-jump="${t.identifierRange?.startLineNumber ?? ""}">
                ${stereotype ? `<span class="jp-uml-stereo">${stereotype}</span>` : ""}
                <span class="jp-uml-name${isAbstract || isInterface ? " is-abstract" : ""}">${name}</span>
            </header>
            ${isEnum ? `<ul class="jp-uml-section">${constantsHtml || "<li class=\"jp-uml-none\">&nbsp;</li>"}</ul>` : ""}
            ${isInterface ? "" : `<ul class="jp-uml-section">${fieldsHtml || "<li class=\"jp-uml-none\">&nbsp;</li>"}</ul>`}
            <ul class="jp-uml-section">${methodsHtml || "<li class=\"jp-uml-none\">&nbsp;</li>"}</ul>`;
    }

    // ---------------------------------------------------------------------
    // Objektansicht
    // ---------------------------------------------------------------------

    private renderObjects() {
        const interpreter = this.main.getInterpreter();
        const state = interpreter.scheduler.state;
        const active = state == SchedulerState.running || state == SchedulerState.paused;

        if (!active) {
            if (this.lastObjectSnapshot && this.lastObjectSnapshot.cards.length > 0) {
                this.el.status.textContent = "Programm beendet – letzter Stand";
                this.draw(this.lastObjectSnapshot.cards, this.lastObjectSnapshot.edges, "objects");
            } else {
                this.el.status.textContent = "";
                this.showEmpty(`${icon("diagram")}<p>Hier siehst du die Objekte deines Programms mit ihren Attributwerten.</p>
                    <p class="jp-hint">Tippe oben auf „Schritt“ und führe dein Programm Zeile für Zeile aus. Mit jedem
                    Schritt siehst du, welche Objekte entstehen und wie sich ihre Attribute ändern.</p>`);
            }
            return;
        }

        const snap = this.collectObjects();
        const status = state == SchedulerState.paused ? "angehalten" : "läuft …";
        this.el.status.textContent = snap.cards.length == 0 ? status : `${status} · ${snap.cards.length} ${snap.cards.length == 1 ? "Objekt" : "Objekte"}`;
        if (snap.cards.length == 0) {
            this.lastObjectSnapshot = null;
            this.showEmpty(`${icon("diagram")}<p>Noch keine Objekte.</p>
                <p class="jp-hint">Sobald dein Programm mit <code>new</code> ein Objekt einer eigenen Klasse erzeugt, erscheint es hier.</p>`);
            return;
        }
        this.lastObjectSnapshot = { ...snap, status };
        this.draw(snap.cards, snap.edges, "objects");
    }

    private idOf(o: object): number {
        let id = this.objectIds.get(o);
        if (!id) { id = this.nextObjectId++; this.objectIds.set(o, id); }
        return id;
    }

    private collectObjects(): { cards: Card[], edges: Edge[] } {
        const userNames = new Set(this.getUserTypes().map(t => t.identifier));
        const interpreter = this.main.getInterpreter();
        const scheduler = interpreter.scheduler;

        const isUserObject = (v: any): boolean => {
            if (!v || typeof v != "object" || Array.isArray(v) || typeof v.getType != "function") return false;
            const t = v.getType();
            return !!t && userNames.has(t.identifier) && !(t.module instanceof SystemModule) && !(t instanceof JavaEnum);
        };

        // ----- Wurzeln: Variablen aller Methodenaufrufe auf dem Stack + statische Attribute -----
        type Root = { name: string, value: any, depth: number };
        const roots: Root[] = [];
        const threads = scheduler.getAllThreads();
        for (const thread of threads) {
            const stack = thread.programStack || [];
            for (let i = 0; i < stack.length; i++) {
                const ps = stack[i];
                let entry: DebuggerCallstackEntry;
                try { entry = new DebuggerCallstackEntry(ps); } catch (e) { continue; }
                const pos = entry.nextStep?.getValidRangeOrUndefined?.();
                let st: any = entry.symbolTable;
                while (st) {
                    for (const sym of st.getSymbolsOnStackframeForDebugger()) {
                        if (sym.hiddenWhenDebugging) continue;
                        const r = sym.identifierRange;
                        if (pos && r && (r.endLineNumber > pos.startLineNumber || (r.endLineNumber == pos.startLineNumber && r.endColumn >= pos.startColumn))) continue;
                        let value: any;
                        try { value = sym.getValue(thread.s, ps.stackBase); } catch (e) { continue; }
                        roots.push({ name: sym.identifier, value, depth: stack.length - 1 - i });
                    }
                    st = st.parent;
                }
            }
        }
        // Statische Attribute. Die Variablen des Hauptprogramms sind in der Online-IDE statische
        // Attribute der (unsichtbaren) Hauptklasse – sie bekommen den Variablennamen als Objektnamen.
        const compiler = this.main.getCompiler();
        for (const file of this.main.getFiles()) {
            const module = <JavaCompiledModule>compiler.findModuleByFile(file);
            for (const t of module?.types || []) {
                if (!(t instanceof JavaClass)) continue;
                const registry = (<any>scheduler.classObjectRegistry)?.[t.identifier];
                if (!registry) continue;
                for (const f of t.getFields().filter(f => f.isStatic() && !f.hiddenWhenDebugging)) {
                    let value: any;
                    try { value = registry[f.getInternalName()]; } catch (e) { continue; }
                    roots.push({ name: t.isMainClass ? f.identifier : t.identifier + "." + f.identifier, value, depth: t.isMainClass ? 1000 : 99 });
                }
            }
        }
        // Variablen des Hauptprogramms (tiefster Stackeintrag) bevorzugt als Objektnamen
        roots.sort((a, b) => b.depth - a.depth);

        // ----- Objekte einsammeln (Breitensuche) -----
        const nameOf = new Map<object, string>();
        const level = new Map<object, number>();
        const parentOf = new Map<object, object>();
        const queue: object[] = [];
        const visit = (v: any, lvl: number, parent?: object) => {
            if (!isUserObject(v) || level.has(v) || level.size >= MAX_OBJECTS) return;
            level.set(v, lvl);
            if (parent) parentOf.set(v, parent);
            queue.push(v);
        };
        const forEachElement = (v: any, cb: (e: any, i: number) => void) => {
            if (Array.isArray(v)) v.forEach(cb);
            else if (v && typeof v == "object" && typeof v.getElements == "function") {
                try { (v.getElements() || []).forEach(cb); } catch (e) { }
            }
        };

        for (const r of roots) {
            if (isUserObject(r.value)) {
                if (r.name != "this" && !nameOf.has(r.value)) nameOf.set(r.value, r.name);
                visit(r.value, 0);
            } else {
                forEachElement(r.value, (e, i) => {
                    if (isUserObject(e) && !nameOf.has(e) && r.name != "this") nameOf.set(e, `${r.name}[${i}]`);
                    visit(e, 0);
                });
            }
        }

        const cards: Card[] = [];
        const edges: Edge[] = [];
        for (let qi = 0; qi < queue.length; qi++) {
            const o: any = queue[qi];
            const t = o.getType();
            const key = "o:" + this.idOf(o);
            const fields: JavaField[] = (t.getOwnAndInheritedFields ? t.getOwnAndInheritedFields() : t.getFields())
                .filter((f: JavaField) => !f.isStatic() && !f.hiddenWhenDebugging && f.type?.identifier != "Class");

            let rows = "";
            for (const f of fields) {
                let value: any;
                try { value = o[f.getFieldIndentifier()]; } catch (e) { value = undefined; }
                let shown: string;
                if (isUserObject(value)) {
                    visit(value, level.get(o)! + 1, o);
                    edges.push({ from: key, to: "o:" + this.idOf(value), kind: "link", label: f.identifier });
                    shown = `<span class="jp-uml-ref">●</span>`;
                } else if (Array.isArray(value) || (value && typeof value.getElements == "function")) {
                    let count = 0, refs = 0;
                    const prims: string[] = [];
                    forEachElement(value, (e, i) => {
                        count++;
                        if (isUserObject(e)) {
                            refs++;
                            visit(e, level.get(o)! + 1, o);
                            edges.push({ from: key, to: "o:" + this.idOf(e), kind: "link", label: `${f.identifier}[${i}]` });
                        } else if (prims.length < 6) prims.push(this.valueText(e));
                    });
                    shown = refs > 0 ? `<span class="jp-uml-ref">${count} ${count == 1 ? "Element" : "Elemente"}</span>`
                        : escapeHtml(`{${prims.join(", ")}${count > prims.length ? ", …" : ""}}`);
                } else {
                    shown = escapeHtml(this.valueText(value));
                }
                rows += `<li><span class="jp-uml-attr">${escapeHtml(f.identifier)}</span> = <span class="jp-uml-val">${shown}</span></li>`;
            }

            const name = nameOf.get(o);
            const title = `${name ? escapeHtml(name) : ""}<span class="jp-uml-objtype"> : ${escapeHtml(t.identifier)}</span>`;
            const parent = parentOf.get(o);
            cards.push({
                key, kind: "object", rank: level.get(o)!,
                parentKey: parent ? "o:" + this.idOf(parent) : undefined,
                html: `<header><span class="jp-uml-objname">${title}</span></header>
                       <ul class="jp-uml-section">${rows || '<li class="jp-uml-none">keine Attribute</li>'}</ul>`
            });
        }
        // Anordnung: Objekte, auf die kein anderes Objekt verweist, nach oben; Verweise führen nach unten
        const incoming = new Map<string, number>();
        edges.forEach(e => { if (e.from != e.to) incoming.set(e.to, (incoming.get(e.to) || 0) + 1); });
        const rank = new Map<string, number>();
        const firstParent = new Map<string, string>();
        let frontier = cards.filter(c => !incoming.get(c.key)).map(c => c.key);
        if (frontier.length == 0 && cards.length > 0) frontier = [cards[0].key];
        frontier.forEach(k => rank.set(k, 0));
        while (frontier.length > 0) {
            const next: string[] = [];
            for (const k of frontier) {
                for (const e of edges) {
                    if (e.from == k && !rank.has(e.to)) {
                        rank.set(e.to, rank.get(k)! + 1);
                        firstParent.set(e.to, k);
                        next.push(e.to);
                    }
                }
            }
            frontier = next;
        }
        for (const c of cards) {
            c.rank = rank.get(c.key) ?? 0;
            c.parentKey = firstParent.get(c.key);
        }
        return { cards, edges };
    }

    private valueText(v: any): string {
        if (v === null || v === undefined) return "null";
        if (typeof v == "string") return `"${v}"`;
        if (typeof v == "number") return Number.isInteger(v) ? String(v) : String(Math.round(v * 1e6) / 1e6);
        if (typeof v == "boolean") return String(v);
        if (typeof v == "object") {
            const t = typeof v.getType == "function" ? v.getType() : null;
            if (t?.identifier == "String" || v.constructor?.name == "StringClass") return `"${v.value}"`;
            if (t && ["Integer", "Double", "Float", "Boolean", "Character", "Long", "Short", "Byte"].indexOf(t.identifier) >= 0) return String(v.value);
            if (t instanceof JavaEnum || (typeof v.name == "string" && typeof v.ordinal == "number")) return `${t?.identifier ?? ""}.${v.name}`;
            if (t) return `:${t.identifier}`;
        }
        return String(v);
    }

    // =====================================================================
    // Zeichnen
    // =====================================================================

    private showEmpty(html: string) {
        this.el.cards.innerHTML = "";
        this.el.svg.innerHTML = "";
        this.el.empty.innerHTML = html;
        this.el.empty.hidden = false;
        this.el.stage.style.display = "none";
    }

    private storageKey() {
        return "jpad.diagram.pos." + this.getProjectId();
    }

    private loadClassPositions(): Map<string, Pos> {
        try {
            const raw = JSON.parse(localStorage.getItem(this.storageKey()) || "{}");
            return new Map(Object.entries(raw));
        } catch (e) { return new Map(); }
    }

    private saveClassPositions() {
        if (this.mode != "classes") return;
        const obj: Record<string, Pos> = {};
        this.positions.forEach((p, k) => obj[k] = p);
        try { localStorage.setItem(this.storageKey(), JSON.stringify(obj)); } catch (e) { }
    }

    private relayout() {
        if (this.mode == "classes") {
            try { localStorage.removeItem(this.storageKey()); } catch (e) { }
        } else {
            this.objectPositions.clear();
        }
        this.refresh();
        setTimeout(() => this.fit(), 30);
    }

    private draw(cards: Card[], edges: Edge[], mode: Mode) {
        this.el.empty.hidden = true;
        this.el.stage.style.display = "";
        const container = this.el.cards;

        // Karten erzeugen und messen
        container.innerHTML = cards.map(c => `<div class="jp-uml-card is-${c.kind}" data-key="${escapeHtml(c.key)}">${c.html}</div>`).join("");
        this.sizes.clear();
        container.querySelectorAll<HTMLElement>(".jp-uml-card").forEach(el => {
            this.sizes.set(el.dataset.key!, { w: el.offsetWidth, h: el.offsetHeight });
        });

        // Positionen: gespeichert/bisherig oder automatisch
        // Klassen: gespeicherte Positionen. Objekte: nur von Hand verschobene Karten bleiben stehen,
        // der Rest wird bei jedem Schritt neu angeordnet (es kommen ständig Objekte hinzu).
        const known = mode == "classes" ? this.loadClassPositions() : this.objectPositions;
        const firstLayout = mode == "classes" && cards.every(c => !known.has(c.key));
        this.positions = this.autoLayout(cards, known, mode == "objects");

        container.querySelectorAll<HTMLElement>(".jp-uml-card").forEach(el => {
            const p = this.positions.get(el.dataset.key!)!;
            el.style.transform = `translate(${p.x}px, ${p.y}px)`;
            this.makeDraggable(el, mode);
        });

        this.edges = edges;
        this.drawEdges();
        this.applyZoom();
        if (firstLayout) this.fit(true);
        if (mode == "classes" && firstLayout) this.saveClassPositions();
    }

    private autoLayout(cards: Card[], known: Map<string, Pos>, fromTop: boolean = false): Map<string, Pos> {
        const result = new Map<string, Pos>();
        const missing = cards.filter(c => !known.has(c.key));
        cards.filter(c => known.has(c.key)).forEach(c => result.set(c.key, { ...known.get(c.key)! }));
        if (missing.length == 0) return result;

        // Zeilen erst bei großer Breite umbrechen – die Hierarchie bleibt so erhalten.
        // Ist die Fläche schmaler, passt „Einpassen“ die Zoomstufe an.
        const viewportW = Math.max(1100, this.el.viewport.clientWidth / this.zoom);
        // Neue Karten unterhalb bereits platzierter Karten anordnen
        let startY = MARGIN;
        if (!fromTop) result.forEach((p, k) => {
            const s = this.sizes.get(k);
            if (s) startY = Math.max(startY, p.y + s.h + GAP_Y);
        });

        // Nach Rang gruppieren, innerhalb eines Rangs möglichst unter dem „Elternteil“
        const ranks = new Map<number, Card[]>();
        for (const c of missing) {
            if (!ranks.has(c.rank)) ranks.set(c.rank, []);
            ranks.get(c.rank)!.push(c);
        }
        const order = new Map<string, number>();
        let y = startY;
        for (const r of [...ranks.keys()].sort((a, b) => a - b)) {
            const row = ranks.get(r)!;
            row.sort((a, b) => (order.get(a.parentKey ?? "") ?? -1) - (order.get(b.parentKey ?? "") ?? -1));
            let x = MARGIN, rowH = 0, idx = 0;
            for (const c of row) {
                const s = this.sizes.get(c.key) || { w: 200, h: 100 };
                if (x > MARGIN && x + s.w > viewportW - MARGIN) {
                    x = MARGIN; y += rowH + GAP_Y; rowH = 0;
                }
                result.set(c.key, { x, y });
                order.set(c.key, idx++);
                x += s.w + GAP_X;
                rowH = Math.max(rowH, s.h);
            }
            y += rowH + GAP_Y;
        }
        return result;
    }

    private makeDraggable(el: HTMLElement, mode: Mode) {
        const key = el.dataset.key!;
        let start: { x: number, y: number, px: number, py: number } | null = null;
        let moved = false;
        let downTarget: HTMLElement | null = null;
        el.addEventListener("pointerdown", e => {
            if (e.button != 0) return;
            downTarget = <HTMLElement>e.target;   // nach setPointerCapture ist e.target immer die Karte
            const p = this.positions.get(key)!;
            start = { x: e.clientX, y: e.clientY, px: p.x, py: p.y };
            moved = false;
            el.setPointerCapture(e.pointerId);
            el.classList.add("is-dragging");
        });
        el.addEventListener("pointermove", e => {
            if (!start) return;
            const dx = (e.clientX - start.x) / this.zoom, dy = (e.clientY - start.y) / this.zoom;
            if (!moved && Math.hypot(dx, dy) < 5) return;
            moved = true;
            const p = { x: Math.max(0, start.px + dx), y: Math.max(0, start.py + dy) };
            this.positions.set(key, p);
            if (mode == "objects") this.objectPositions.set(key, p);
            el.style.transform = `translate(${p.x}px, ${p.y}px)`;
            this.drawEdges();
        });
        const end = (e: PointerEvent) => {
            if (!start) return;
            el.classList.remove("is-dragging");
            if (!moved && mode == "classes") {
                // Tippen auf eine Zeile springt zur Stelle im Code
                const target = downTarget?.closest<HTMLElement>("[data-jump]");
                const line = parseInt(target?.dataset.jump || "");
                if (line > 0) this.jumpToClassLine(key.substring(2), line);
            }
            if (moved) { this.saveClassPositions(); this.applyZoom(); }
            start = null;
        };
        el.addEventListener("pointerup", end);
        el.addEventListener("pointercancel", () => { start = null; el.classList.remove("is-dragging"); });
    }

    private jumpToClassLine(className: string, line: number) {
        const compiler = this.main.getCompiler();
        for (const file of this.main.getFiles()) {
            const module = <JavaCompiledModule>compiler.findModuleByFile(file);
            if (module?.types?.some(t => t.identifier == className)) {
                this.jumpTo(file, line, 1);
                return;
            }
        }
    }

    // ----- Linien -----

    private rect(key: string) {
        const p = this.positions.get(key), s = this.sizes.get(key);
        if (!p || !s) return null;
        return { x: p.x, y: p.y, w: s.w, h: s.h, cx: p.x + s.w / 2, cy: p.y + s.h / 2 };
    }

    /** Schnittpunkt der Linie vom Mittelpunkt nach (tx,ty) mit dem Kartenrand */
    private borderPoint(r: { x: number, y: number, w: number, h: number, cx: number, cy: number }, tx: number, ty: number) {
        const dx = tx - r.cx, dy = ty - r.cy;
        if (dx == 0 && dy == 0) return { x: r.cx, y: r.cy };
        const sx = (r.w / 2) / Math.abs(dx || 1e-9), sy = (r.h / 2) / Math.abs(dy || 1e-9);
        const s = Math.min(sx, sy);
        return { x: r.cx + dx * s, y: r.cy + dy * s };
    }

    private drawEdges() {
        const svg = this.el.svg;
        let out = `<defs>
            <marker id="jp-tri" viewBox="0 0 14 14" refX="13" refY="7" markerWidth="14" markerHeight="14" markerUnits="userSpaceOnUse" orient="auto">
                <path d="M1,1 L13,7 L1,13 Z" class="jp-uml-tri"/></marker>
            <marker id="jp-open" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto">
                <path d="M1,1 L11,6 L1,11" class="jp-uml-open"/></marker>
            <marker id="jp-open-link" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto">
                <path d="M1,1 L11,6 L1,11" class="jp-uml-open is-link"/></marker>
            </defs>`;

        // Mehrere Linien zwischen denselben Karten nebeneinander legen
        const pairCount = new Map<string, number>(), pairIndex = new Map<string, number>();
        const pk = (e: Edge) => [e.from, e.to].sort().join("|");
        this.edges.forEach(e => pairCount.set(pk(e), (pairCount.get(pk(e)) || 0) + 1));

        for (const e of this.edges) {
            const a = this.rect(e.from), b = this.rect(e.to);
            if (!a || !b) continue;
            const n = pairCount.get(pk(e))!, i = pairIndex.get(pk(e)) || 0;
            pairIndex.set(pk(e), i + 1);
            const cls = `jp-uml-edge is-${e.kind}`;

            if (e.from == e.to) {
                // Selbstbezug: Schleife rechts oben
                const x = a.x + a.w, y = a.y + 22 + i * 14;
                const d = `M ${x} ${y} C ${x + 60} ${y - 40}, ${x + 60} ${y + 40}, ${x} ${y + 20}`;
                out += `<path d="${d}" class="${cls}" marker-end="url(#jp-open${e.kind == "link" ? "-link" : ""})"/>`;
                out += this.edgeLabels(e, x + 50, y + 10, x + 6, y + 34, "start", "start");
                continue;
            }

            let offset = (i - (n - 1) / 2) * 18;
            const len = Math.hypot(b.cx - a.cx, b.cy - a.cy) || 1;
            const nx = -(b.cy - a.cy) / len * offset, ny = (b.cx - a.cx) / len * offset;
            const ac = { ...a, cx: a.cx + nx, cy: a.cy + ny }, bc = { ...b, cx: b.cx + nx, cy: b.cy + ny };
            const p1 = this.borderPoint(ac, bc.cx, bc.cy);
            const p2 = this.borderPoint(bc, ac.cx, ac.cy);
            const marker = e.kind == "extends" || e.kind == "implements" ? "url(#jp-tri)" : e.kind == "link" ? "url(#jp-open-link)" : "url(#jp-open)";
            out += `<line x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}" class="${cls}" marker-end="${marker}"/>`;

            if (e.label || e.multiplicity) {
                // Beschriftung am Ziel: Rollenname auf der einen, Kardinalität auf der anderen Seite der Linie
                const L = Math.hypot(p1.x - p2.x, p1.y - p2.y) || 1;
                const ux = (p1.x - p2.x) / L, uy = (p1.y - p2.y) / L;   // vom Ziel zur Quelle
                let sx = -uy, sy = ux;                                   // senkrecht dazu
                if (sx < 0 || (Math.abs(sx) < 1e-6 && sy < 0)) { sx = -sx; sy = -sy; }
                const along = 20;
                const labelPos = { x: p2.x + ux * along + sx * 9, y: p2.y + uy * along + sy * 9 };
                const multPos = { x: p2.x + ux * along - sx * 9, y: p2.y + uy * along - sy * 9 };
                const steep = Math.abs(sx) > 0.35;   // Linie eher senkrecht → Texte links/rechts
                out += this.edgeLabels(e, labelPos.x, labelPos.y + (steep ? 0 : 8), multPos.x, multPos.y - (steep ? 0 : 8),
                    steep ? "start" : "middle", steep ? "end" : "middle");
            }
        }

        // SVG-Größe an Inhalt anpassen
        let maxX = 0, maxY = 0;
        this.positions.forEach((p, k) => {
            const s = this.sizes.get(k);
            if (s) { maxX = Math.max(maxX, p.x + s.w); maxY = Math.max(maxY, p.y + s.h); }
        });
        this.contentW = maxX + MARGIN + 80;
        this.contentH = maxY + MARGIN + 40;
        svg.setAttribute("width", String(this.contentW));
        svg.setAttribute("height", String(this.contentH));
        svg.innerHTML = out;
    }

    private edgeLabels(e: Edge, lx: number, ly: number, mx: number, my: number, la: string = "middle", ma: string = "middle"): string {
        let s = "";
        if (e.label) s += `<text x="${lx}" y="${ly}" class="jp-uml-label" text-anchor="${la}" dominant-baseline="middle">${escapeHtml(e.label)}</text>`;
        if (e.multiplicity) s += `<text x="${mx}" y="${my}" class="jp-uml-mult" text-anchor="${ma}" dominant-baseline="middle">${escapeHtml(e.multiplicity)}</text>`;
        return s;
    }

    private contentW = 0;
    private contentH = 0;

    private applyZoom() {
        const stage = this.el.stage;
        stage.style.width = this.contentW * this.zoom + "px";
        stage.style.height = this.contentH * this.zoom + "px";
        const inner = <HTMLElement>stage.querySelector(".jp-diagram-cards");
        const svg = <HTMLElement><unknown>this.el.svg;
        for (const el of [inner, svg]) {
            el.style.transform = `scale(${this.zoom})`;
            el.style.transformOrigin = "0 0";
        }
        inner.style.width = this.contentW + "px";
        inner.style.height = this.contentH + "px";
    }

    private fit(onlyShrink: boolean = false) {
        if (!this.contentW) return;
        const vw = this.el.viewport.clientWidth - 8, vh = this.el.viewport.clientHeight - 8;
        if (vw <= 0 || vh <= 0) return;
        let z = Math.min(1.4, vw / this.contentW, vh / this.contentH);
        if (onlyShrink) z = Math.min(1, Math.max(0.55, z));
        this.setZoom(z);
        this.el.viewport.scrollTo({ left: 0, top: 0 });
    }
}
